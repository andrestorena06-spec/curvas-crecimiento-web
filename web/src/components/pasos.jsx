import { useMemo, useState } from 'react'
import { Campo, Select } from './ui.jsx'
import { Nota } from './tip.jsx'
import { desvio, finito, media, regLineal } from '../motor/analisis.js'
import { resumenOdManual } from '../motor/odmanual.js'
import { calcularUfc } from '../motor/ufc.js'
import { hayConteo } from '../experimento.js'
import { tCuantil } from '../utils.js'

const f = (x, d = 4) => (finito(x) ? x.toFixed(d) : '–')
const sci = (x) => (finito(x) ? x.toExponential(3).replace('e+', 'E+').replace('e-', 'E-') : '–')

function Tabla({ cols, filas, pie }) {
  return (
    <div className="tabla-scroll chica">
      <table className="tabla paso-tabla">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{filas.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
        {pie && <tfoot>{pie.map((r, i) => <tr key={i}><th colSpan={cols.length - 1}>{r[0]}</th><td><b>{r[1]}</b></td></tr>)}</tfoot>}
      </table>
    </div>
  )
}

// ===============================================================
// CÁLCULO PASO A PASO: una tabla por paso, con el valor original, lo que se resta o se divide y el resultado
// ===============================================================
export function PasoAPaso({ s }) {
  const a = s.a
  const [pozo, setPozo] = useState('')
  const [mu, setMu] = useState('')
  if (!a) return null
  const conOd = a.modo !== 'conteo' && s.pre && !s.pre.error
  const marcado = conOd ? s.pre.marcado.filter((w) => !w.EsBlanco) : []
  const w0 = marcado.find((w) => w.Pocillo === pozo) || marcado[0]
  const proc = w0 ? s.pre.proc.find((w) => w.Pocillo === w0.Pocillo) : null
  const r0 = w0 && s.res ? s.res.find((r) => r.Pocillo === w0.Pocillo) : null
  const nombre = (w) => `${w.Muestra} R${w.Replica} (${w.Pocillo})`
  const ef = s.aj

  // OD manual
  const om = a.origenOd === 'manual' && a.modo !== 'conteo' && a.manual.filas.length ? resumenOdManual(a.manual) : null

  // punto a punto de la curva elegida
  const filasPaso = useMemo(() => {
    if (!w0) return []
    return w0.filas.map((q, i) => ({ t: q.t / 3600, orig: q.yRaw, tras: q.yAntes, final: proc && proc.t.includes(q.t) ? proc.y[proc.t.indexOf(q.t)] : NaN, marca: q.motivo || (q.marca ? q.marca + ' (conservado)' : '') }))
  }, [w0, proc])

  // ventana de μmax
  let ventana = null
  if (proc && r0 && finito(r0.mu_max)) {
    const pts = proc.t.map((t, i) => ({ t: t / 3600, y: proc.y[i] })).filter((p) => p.y > 0 && p.t >= r0.t_ini_ventana - 1e-9 && p.t <= r0.t_fin_ventana + 1e-9)
    if (pts.length >= 2) {
      const rg = regLineal(pts.map((p) => p.t), pts.map((p) => Math.log(p.y)))
      ventana = { pts, rg }
    }
  }

  // μmax de las réplicas de la misma muestra
  const hermanas = w0 && s.res ? s.res.filter((r) => r.Muestra === w0.Muestra && finito(r.mu_max)) : []
  const vm = hermanas.map((r) => r.mu_max)
  const mm = media(vm), sdm = vm.length > 1 ? desvio(vm) : NaN
  const tm = vm.length > 1 ? tCuantil(0.975, vm.length - 1) : NaN

  // recuento
  const ufcOk = hayConteo(a)
  const U = ufcOk ? calcularUfc(a.ufc) : null
  const musU = U ? U.muestras : []
  const muU = musU.includes(mu) ? mu : musU[0]
  const repsU = U ? U.reps.filter((r) => r.Muestra === muU && r.Conteos > 0) : []
  const resU = U ? U.res.filter((r) => r.Muestra === muU && r.Con_conteos > 0) : []

  const hay = conOd || om || (U && U.hay)
  return (
    <section className="tarjeta metodo">
      <div className="titulo-fila">
        <h2>Cálculo paso a paso con tus datos <Nota>Cada tabla muestra el valor original, lo que se resta o se divide y el resultado, con los datos del experimento activo.</Nota></h2>
        <div className="fila-ctrl" style={{ margin: 0 }}>
          {conOd && marcado.length > 0 && <Campo label="Curva"><Select value={w0.Pocillo} onChange={setPozo} opciones={marcado.map((w) => [w.Pocillo, nombre(w)])} /></Campo>}
          {musU.length > 0 && <Campo label="Muestra (recuento)"><Select value={muU} onChange={setMu} opciones={musU.map((x) => [x, x])} /></Campo>}
        </div>
      </div>
      {!hay && <p className="ayuda">Todavía no hay datos procesados para mostrar.</p>}

      {om && (
        <>
          <h3>OD manual: de la lectura a la OD de la suspensión original</h3>
          <Tabla cols={['Muestra', 'Réplica', 't (h)', 'Dilución', 'Lectura', 'Se resta el blanco', 'OD neta', '× f^k', 'OD × f^k', '¿En la ventana?']}
            filas={a.manual.filas.flatMap((fi, i) => Object.entries(fi.od || {}).filter(([, v]) => finito(Number(v))).map(([k, v]) => {
              const bl = a.manual.yaCorregido ? 0 : Number(a.manual.blanco) || 0
              const neta = Number(v) - bl
              const fac = a.manual.factor ** Number(k)
              return [fi.muestra, fi.replica, fi.t, Number(k) ? `−${k}` : 'sin diluir', f(Number(v)), f(bl), f(neta), f(fac, 2), f(neta * fac), neta >= a.manual.vmin && neta <= a.manual.vmax ? 'Sí' : 'No']
            })).slice(0, 80)}
            pie={[[`OD final por fila (media de las que están en la ventana ${a.manual.vmin}–${a.manual.vmax})`, `${om.filas.filter((x) => finito(x.od)).length} filas`]]} />
          <Tabla cols={['Muestra', 'Réplica', 't (h)', 'OD final', 'Estado']} filas={a.manual.filas.map((fi, i) => [fi.muestra, fi.replica, fi.t, f(om.filas[i]?.od), om.filas[i]?.estado === 'ok' ? 'En la ventana lineal' : om.filas[i]?.estado || ''])} />
        </>
      )}

      {conOd && w0 && (
        <>
          <h3>Corrección y procesado de la curva {nombre(w0)}</h3>
          <Tabla cols={['t (h)', 'OD original', ef.corregir_blanco && a.origenOd !== 'manual' ? 'Se resta el blanco' : 'Se resta', 'OD corregida', 'Punto marcado', 'Valor procesado (suavizado / normalizado)', 'ln(valor procesado)']}
            filas={filasPaso.map((q) => [f(q.t, 3), f(q.orig), f(q.orig - q.tras), f(q.tras), q.marca || '', f(q.final), finito(q.final) && q.final > 0 ? f(Math.log(q.final)) : '–'])} />
          {ventana && r0 && (
            <>
              <h3>μmax de {nombre(w0)}: regresión de ln(OD) contra t en la ventana {f(r0.t_ini_ventana, 2)}–{f(r0.t_fin_ventana, 2)} h</h3>
              <Tabla cols={['t (h)', 'OD', 'ln(OD)', 'Ajuste a + μ·t', 'Residuo (ln OD − ajuste)', 'Residuo²']}
                filas={ventana.pts.map((p) => { const aj = ventana.rg.a + ventana.rg.b * p.t; return [f(p.t, 3), f(p.y), f(Math.log(p.y)), f(aj), f(Math.log(p.y) - aj), f((Math.log(p.y) - aj) ** 2, 6)] })}
                pie={[['Pendiente μ (h⁻¹)', f(ventana.rg.b)], ['Intercepto a', f(ventana.rg.a)], ['R²', f(ventana.rg.r2, 4)], ['Tiempo de duplicación = ln 2 / μ (min)', f((Math.LN2 / ventana.rg.b) * 60, 2)], ['Lag (tangente) (h)', f(r0.lag_h, 3)]]} />
            </>
          )}
          {hermanas.length > 0 && (
            <>
              <h3>μmax de la muestra «{w0.Muestra}»</h3>
              <Tabla cols={['Curva', 'μmax (h⁻¹)', 'Se resta la media', 'Diferencia', 'Diferencia al cuadrado']}
                filas={hermanas.map((r) => [`R${r.Replica} (${r.Pocillo})`, f(r.mu_max), f(mm), f(r.mu_max - mm), f((r.mu_max - mm) ** 2, 6)])}
                pie={[['n', hermanas.length], ['Media', f(mm)], ...(vm.length > 1 ? [['DE = √(Σ / (n − 1))', f(sdm)], ['SEM = DE / √n', f(sdm / Math.sqrt(vm.length))], [`t(0.975; ${vm.length - 1}) × SEM = IC 95 %`, f((tm * sdm) / Math.sqrt(vm.length))]] : [])]} />
            </>
          )}
        </>
      )}
      {conOd && s.pre.marcado.some((w) => w.filas.some((q) => q.marca)) && (
        <>
          <h3>Puntos marcados como atípicos ({a.origenOd === 'tecan' ? 'Hampel' : `test Q de Dixon, confianza ${ef.dixon_conf || 95} %`})</h3>
          <Tabla cols={['Curva', 't (h)', 'Valor', 'Decisión', 'Cálculo']}
            filas={s.pre.marcado.flatMap((w) => w.filas.filter((q) => q.marca).map((q) => [nombre(w), f(q.t / 3600, 3), f(q.yAntes), q.motivo ? 'Excluido' : 'Conservado', q.detalle || '']))} />
        </>
      )}

      {U && U.hay && repsU.length > 0 && (
        <>
          <h3>Recuento de «{muU}»: de las colonias a UFC/mL (media ponderada ISO 7218)</h3>
          <Tabla cols={['t (h)', 'Réplica', 'Pocillo/dilución', 'Colonias', 'Dilución 1 : D', 'Σ colonias', 'V × Σ(1/D) (mL)', 'UFC/mL = Σ colonias / (V × Σ 1/D)', 'IC 95 % (Poisson)']}
            filas={repsU.map((r) => {
              const us = r._usados || []
              const D = (k) => (r._par.mult || 1) * r._par.factor ** k
              const sumC = us.reduce((t, k) => t + r._cont[k], 0)
              const sw = us.reduce((t, k) => t + 1 / D(k), 0)
              return [r.T_h, r.Replica, us.map((k) => `${k}: ${r._cont[k]}`).join(' · ') || '–', sumC || '–', us.map((k) => Number(D(k).toPrecision(5))).join(' · ') || '–', sumC || '–', us.length ? sci(r._par.vol * sw) : '–', sci(r.UFC_mL), finito(r.IC95_inf) ? `${sci(r.IC95_inf)} a ${sci(r.IC95_sup)}` : '–']
            })} />
          <Tabla cols={['t (h)', 'Réplicas', 'UFC/mL de cada réplica', 'log₁₀ de cada una', 'Media de log₁₀', 'DE (log₁₀)', 'Media geométrica = 10^media']}
            filas={resU.map((r) => {
              const lg = (r._vals || []).map(Math.log10)
              return [r.T_h, r.N, (r._vals || []).map(sci).join(' · '), lg.map((x) => f(x, 3)).join(' · '), f(r.log10, 4), f(r.DE_log10, 3), sci(r.UFC_mL)]
            })} />
        </>
      )}
    </section>
  )
}
