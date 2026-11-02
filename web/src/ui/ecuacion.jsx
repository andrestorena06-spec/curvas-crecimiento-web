// ============================================================
// Ecuación del modelo ajustado (lineal, Baranyi y Roberts o bifásico) con sus valores, y una calculadora para
// evaluarlo: tiempo → OD o UFC/mL, y OD o UFC/mL → tiempo. Indica si el resultado es interpolado o extrapolado.
// ============================================================
import { useState } from 'react'
import { finito } from '../motor/analisis.js'
import { Campo, Num, Sel } from './base.jsx'
import { fs, fx, sciCorto } from '../utils.js'

// texto de la ecuación con los parámetros ajustados (el modelo trabaja sobre y = ln de la variable)
function ecuacion(c, vy) {
  const n = (x) => fs(x, 4)
  const menos = (x) => (x < 0 ? `+ ${n(-x)}` : `− ${n(x)}`)   // evita «− −4,9»
  if (c.modelo === 'lineal') return [`ln ${vy}(t) = ${n(c.y0 * Math.LN10)} ${c.mu < 0 ? '−' : '+'} ${n(Math.abs(c.mu))} · t`]
  const y0 = c.y0 * Math.LN10
  // curvatura m hacia la meseta (Baranyi y Roberts 1994); con m = 1 se escribe la forma habitual
  const m = finito(c.mcurv) && c.mcurv > 0 ? c.mcurv : 1
  const lineas = c.modelo === 'baranyi'
    ? m === 1
      ? [`ln ${vy}(t) = ${n(y0)} + ${n(c.mu)} · A(t) − ln[ 1 + (e^(${n(c.mu)} · A(t)) − 1) / e^(${n(c.yEnd * Math.LN10)} ${menos(y0)}) ]`]
      : [`ln ${vy}(t) = ${n(y0)} + ${n(c.mu)} · A(t) − (1/${n(m)}) · ln[ 1 + (e^(${n(m)} · ${n(c.mu)} · A(t)) − 1) / e^(${n(m)} · (${n(c.yEnd * Math.LN10)} ${menos(y0)})) ]`]
    : [`ln ${vy}(t) = ${n(y0)} + ${n(c.mu)} · A(t)`]
  lineas.push(`A(t) = t + ln( e^(−${n(c.mu)} · t) + e^(−${n(c.h0)}) − e^(−${n(c.mu)} · t − ${n(c.h0)}) ) / ${n(c.mu)}`)
  return lineas
}

// tiempo en que el modelo llega a un nivel (ln); el modelo crece con t
function tiempoPara(c, yln) {
  const f = (t) => c.pred10(t) * Math.LN10
  if (!(c.mu > 0)) return NaN
  let lo = Math.min(0, c.t0), hi = Math.max(c.t1, 1)
  if (f(lo) > yln) return NaN
  for (let i = 0; i < 40 && f(hi) < yln; i++) hi *= 2
  if (!(f(hi) >= yln)) return NaN
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) < yln) lo = m; else hi = m }
  return (lo + hi) / 2
}

// filas: [{ id, nombre, color, c }] con c = resultado de ajusteDmfit · tipo: 'od' | 'ufc'
export function EcuacionModelo({ filas, tipo, nota }) {
  const ok = filas.filter((f) => f.c?.ok)
  const [cepa, setCepa] = useState('')
  const [t, setT] = useState(2)
  const [v, setV] = useState(tipo === 'od' ? 0.3 : 1e7)
  const vy = tipo === 'od' ? 'OD' : 'N'
  const usar = ok.find((f) => f.id === cepa) || ok[0]
  const rango = (x) => (usar && finito(x) ? (x >= usar.c.t0 - 1e-9 && x <= usar.c.t1 + 1e-9 ? 'interpolado' : 'extrapolado') : '')
  const etq = (x) => { const r = rango(x); return r ? <span className={`chip ${r === 'interpolado' ? 'ok' : 'aviso'}`} style={{ marginLeft: 8 }} data-tip={r === 'interpolado' ? `Dentro del rango medido (${fx(usar.c.t0, 1)} a ${fx(usar.c.t1, 1)} h)` : `Fuera del rango medido (${fx(usar.c.t0, 1)} a ${fx(usar.c.t1, 1)} h): depende de que el modelo siga valiendo`}>{r}</span> : null }
  const yT = usar && finito(Number(t)) ? usar.c.pred10(Number(t)) : NaN
  const tV = usar && Number(v) > 0 ? tiempoPara(usar.c, Math.log(Number(v))) : NaN
  return (
    <div className="calib-resultado" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Ecuación del modelo</h3>
      {nota && <p className="ayuda" style={{ marginTop: 0 }}>{nota}</p>}
      {filas.map((f) => (
        <div key={f.id} style={{ marginBottom: 8 }}>
          <b><i className="punto" style={{ background: f.color, marginRight: 6 }} />{f.nombre}</b>
          {f.c?.ok
            ? <div style={{ marginTop: 4 }}>{ecuacion(f.c, vy).map((l) => <div key={l}><code>{l}</code></div>)}
              <small className="ayuda">t en horas{f.c.modelo !== 'lineal' ? ` · lag λ = h₀/μ = ${fx(f.c.lag_h, 2)} h` : ''}{f.c.modelo === 'baranyi' ? ` · ${vy} máx = ${tipo === 'od' ? fx(10 ** f.c.yEnd, 3) : sciCorto(10 ** f.c.yEnd)}${f.c.ymaxFijo ? ' (fijado)' : f.c.mesetaExtrapolada ? ' (extrapolado: los datos no llegan a la meseta)' : ''}` : ''}{f.c.modelo === 'baranyi' && finito(f.c.mcurv) ? ` · curvatura m = ${fs(f.c.mcurv, 3)}` : ''}{finito(f.c.gl) ? ` · n − p = ${f.c.gl}` : ''} · ajustado entre {fx(f.c.t0, 1)} y {fx(f.c.t1, 1)} h</small>
              {(f.c.avisos || []).map((a) => <div key={a} className="aviso-texto" style={{ fontSize: 12 }}>⚠ {a}</div>)}</div>
            : <div className="ayuda">{f.c?.motivo || 'Sin ajuste.'}</div>}
        </div>
      ))}
      {usar && (<>
        <h3>Calcular con el modelo</h3>
        {ok.length > 1 && <Campo label="Cepa"><Sel value={usar.id} onChange={setCepa} opciones={ok.map((f) => [f.id, f.nombre])} /></Campo>}
        <Campo label={`Tiempo (h) → ${tipo === 'od' ? 'OD' : 'UFC/mL'}`}>
          <div className="fila"><Num value={t} onChange={setT} ancho={80} />
            <b>{tipo === 'od' ? fx(10 ** yT, 3) : `${sciCorto(10 ** yT)} UFC/mL`}</b>{tipo === 'ufc' && finito(yT) && <span className="ayuda">(log₁₀ {fx(yT, 2)})</span>}{etq(Number(t))}</div>
        </Campo>
        <Campo label={`${tipo === 'od' ? 'OD' : 'UFC/mL'} → tiempo (h)`}>
          <div className="fila"><Num value={v} onChange={setV} ancho={110} />
            <b>{finito(tV) ? `${fx(tV, 2)} h` : '–'}</b>{finito(tV) ? etq(tV) : Number(v) > 0 && <span className="ayuda">el modelo no llega a ese valor (o está por debajo del inicial)</span>}</div>
        </Campo>
      </>)}
    </div>
  )
}
