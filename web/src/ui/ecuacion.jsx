// ============================================================
// Ecuación del modelo ajustado (Linealizar log₁₀ o Baranyi y Roberts), una cepa por bloque: su ecuación y, debajo,
// su calculadora (tiempo → valor y valor → tiempo, con aviso de interpolado / extrapolado) y una tabla de valores
// (como la de DMFit) con el rango y el intervalo que se elijan, exportable a Excel o CSV.
// ============================================================
import { useState } from 'react'
import { finito } from '../motor/analisis.js'
import { Campo, Modal, Num } from './base.jsx'
import { excelMatriz } from '../excel.js'
import { descargarBlob, descargarTexto, fx, sciCorto } from '../utils.js'
import { EcModelo } from './ecuacionBonita.jsx'
import { MODELOS_UFC } from '../motor/ufc.js'
import { useOpcion } from './opciones.js'
import { BotonCinta, CampoCinta } from './cinta.jsx'

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

// Una cepa: su ecuación y, debajo, su calculadora y el acceso a la tabla de valores
function BloqueCepa({ f, tipo, vy, onTabla }) {
  const c = f.c
  const tMed = c?.ok ? Number(((c.t0 + c.t1) / 2).toFixed(1)) : 2
  // lo escrito en la calculadora se guarda con el experimento: no se pierde al cambiar de pantalla ni al guardar
  const [t, setT] = useOpcion(`calc.${tipo}.${f.id}.t`, tMed, true)
  const [v, setV] = useOpcion(`calc.${tipo}.${f.id}.v`, c?.ok ? Number((10 ** c.pred10(tMed)).toPrecision(2)) : tipo === 'od' ? 0.3 : 1e7, true)
  const unidad = tipo === 'od' ? 'OD' : 'UFC/mL'
  const rango = (x) => (c?.ok && finito(x) ? (x >= c.t0 - 1e-9 && x <= c.t1 + 1e-9 ? 'interpolado' : 'extrapolado') : '')
  const etq = (x) => {
    const r = rango(x)
    if (!r) return null
    return <span className={`chip ${r === 'interpolado' ? 'ok' : 'aviso'}`} data-tip={r === 'interpolado' ? `Dentro del rango medido (${fx(c.t0, 1)} a ${fx(c.t1, 1)} h)` : `Fuera del rango medido (${fx(c.t0, 1)} a ${fx(c.t1, 1)} h): es una extrapolación`}>{r}</span>
  }
  const yT = c?.ok && finito(Number(t)) ? c.pred10(Number(t)) : NaN
  const tV = c?.ok && Number(v) > 0 ? tiempoPara(c, Math.log(Number(v))) : NaN
  return (
    <section className="ec-cepa">
      <h3><i className="punto" style={{ background: f.color }} />{f.nombre}</h3>
      {!c?.ok ? <p className="ayuda" style={{ margin: 0 }}>{c?.motivo || 'Sin ajuste.'}</p> : (<>
        <div className="ecuacion-od">
          <b className="ec-sub">{c.modelo !== 'lineal' ? `${MODELOS_UFC[c.modelo]} · toda la curva (en ln)` : 'Linealizar log₁₀ · recta de la fase exponencial'}</b>
          <EcModelo c={c} vy={vy} />
          <small>
            t en horas · μ = {c.modelo !== 'lineal' ? `${fx(c.mu, 4)}${finito(c.ee_mu) ? ` ± ${fx(c.ee_mu, 4)}` : ''} h⁻¹` : `${fx(c.mu / Math.LN10, 4)} log₁₀/h (= ${fx(c.mu, 4)} h⁻¹ en ln)`}
            {c.modelo !== 'lineal' ? ` · lag λ = ${c.modelo === 'baranyi' ? 'h₀/μ = ' : ''}${fx(c.lag_h, 2)}${finito(c.ee_lag) && c.ee_lag > 0 ? ` ± ${fx(c.ee_lag, 2)}` : ''} h${c.lagFijo ? ' (fijado)' : ''}` : ''}
            {c.modelo !== 'lineal' ? ` · ${vy} máx = ${tipo === 'od' ? fx(10 ** c.yEnd, 3) : sciCorto(10 ** c.yEnd)}${c.ymaxFijo ? ' (fijado)' : c.mesetaExtrapolada ? ' (extrapolada)' : ''}` : ''}
            {` · n − p = ${c.gl} · ajustado entre ${fx(c.t0, 1)} y ${fx(c.t1, 1)} h`}
          </small>
        </div>
        {(c.avisos || []).map((a) => <div key={a} className="aviso-texto" style={{ fontSize: 12 }}>⚠ {a}</div>)}
        {f.aviso && <div className="aviso-texto" style={{ fontSize: 12 }}>⚠ {f.aviso}</div>}
        <div className="ec-calc">
          <div className="ec-conv">
            <div className="ec-conv-fila">
              <CampoCinta etiqueta={`Tiempo (h) → ${unidad}`}><Num value={t} onChange={setT} ancho={84} /></CampoCinta>
              <span className="ec-flecha">→</span>
              <b className="ec-res">{finito(yT) ? (tipo === 'od' ? fx(10 ** yT, 3) : sciCorto(10 ** yT)) : '–'}</b>
              {tipo === 'ufc' && finito(yT) && <span className="ayuda">log₁₀ {fx(yT, 2)}</span>}
              {finito(yT) && etq(Number(t))}
            </div>
          </div>
          <div className="ec-conv">
            <div className="ec-conv-fila">
              <CampoCinta etiqueta={`${unidad} → tiempo (h)`}><Num value={v} onChange={setV} ancho={110} /></CampoCinta>
              <span className="ec-flecha">→</span>
              <b className="ec-res">{finito(tV) ? `${fx(tV, 2)} h` : '–'}</b>
              {finito(tV) ? etq(tV) : Number(v) > 0 && <span className="chip aviso" data-tip="El modelo se frena en su máximo: no existe un tiempo para un valor mayor">fuera del alcance del modelo{c.modelo === 'baranyi' ? ` (máx. ${tipo === 'od' ? fx(10 ** c.yEnd, 3) : sciCorto(10 ** c.yEnd)})` : ''}</span>}
            </div>
          </div>
          <BotonCinta simbolo="▦" texto="Tabla de valores" onClick={onTabla} tip={'Tabla de valores del modelo\nTiempo y valor calculado en el rango y con el intervalo que elijas, para exportar (como «Fit» de DMFit)'} />
        </div>
      </>)}
    </section>
  )
}

// Tabla x → valores (como la de DMFit): rango e intervalo a elección, con los valores fuera del rango medido en gris, exportable a Excel o CSV.
// cols: encabezados de las columnas de valores · f(x) → [valores] · medido: [min, max] del rango con datos
export function TablaValores({ titulo, nombreArchivo, xEtq, cols, f, medido, desde0, hasta0, paso0, unidad = 'h', decimalesX = 2, dec = 3, onClose }) {
  const [desde, setDesde] = useState(desde0)
  const [hasta, setHasta] = useState(hasta0)
  const [paso, setPaso] = useState(paso0)
  const d = Number(desde), h = Number(hasta), p = Number(paso)
  const valido = finito(d) && finito(h) && finito(p) && p > 0 && h >= d
  const n = valido ? Math.floor((h - d) / p + 1e-9) + 1 : 0
  const MAX = 5000
  const filas = Array.from({ length: Math.min(n, MAX) }, (_, i) => {
    const x = Math.round((d + i * p) * 1e9) / 1e9
    return { x, v: f(x), fuera: x < medido[0] - 1e-9 || x > medido[1] + 1e-9 }
  })
  const col = [xEtq, ...cols]
  const fila = (r) => [r.x, ...r.v]
  const rango = (r) => (r.fuera ? 'extrapolado' : 'interpolado')
  const exportarExcel = async () => descargarBlob(await excelMatriz([{ nombre: 'Modelo', matriz: [[...col, 'Rango'], ...filas.map((r) => [...fila(r), rango(r)])] }]), nombreArchivo + '.xlsx')
  const num = (x) => String(x).replace('.', ',')
  const exportarCsv = () => descargarTexto([[...col, 'Rango'].join(';'), ...filas.map((r) => [...fila(r).map(num), rango(r)].join(';'))].join(String.fromCharCode(10)), nombreArchivo + '.csv', 'text/csv;charset=utf-8')
  const celda = (x) => (finito(x) ? (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? sciCorto(x) : fx(x, dec)) : '–')
  return (
    <Modal titulo={titulo} ancho={640} onClose={onClose}
      pie={<><button onClick={onClose}>Cerrar</button><button onClick={exportarCsv} disabled={!filas.length}>Exportar CSV</button><button className="primario" onClick={exportarExcel} disabled={!filas.length}>Exportar a Excel</button></>}>
      <div className="ec-rango">
        <Campo label={`Desde (${unidad})`}><Num value={desde} onChange={setDesde} ancho={90} /></Campo>
        <Campo label={`Hasta (${unidad})`}><Num value={hasta} onChange={setHasta} ancho={90} /></Campo>
        <Campo label={`Intervalo (${unidad})`}><Num value={paso} onChange={setPaso} ancho={90} /></Campo>
      </div>
      {!valido && <p className="aviso-texto">Revisá el rango: «hasta» debe ser mayor o igual que «desde», y el intervalo mayor que 0.</p>}
      {n > MAX && <p className="aviso-texto">Son {n} filas: se muestran y exportan las primeras {MAX}. Agrandá el intervalo.</p>}
      <p className="ayuda" style={{ marginTop: 0 }}>Datos medidos entre {fx(medido[0], decimalesX)} y {fx(medido[1], decimalesX)} {unidad}; fuera de ese rango los valores son extrapolados (en gris).</p>
      <div className="tabla-scroll alta"><table className="tabla">
        <thead><tr>{col.map((x) => <th key={x} className="num">{x}</th>)}</tr></thead>
        <tbody>{filas.map((r) => <tr key={r.x} style={r.fuera ? { opacity: 0.55 } : undefined}><td className="num">{fx(r.x, decimalesX)}</td>{r.v.map((v, k) => <td key={k} className="num">{celda(v)}</td>)}</tr>)}</tbody>
      </table></div>
    </Modal>
  )
}

// Tabla del modelo de una cepa: tiempo → valor
function TablaModelo({ f, tipo, nombreArchivo, onClose }) {
  const c = f.c
  return <TablaValores titulo={`Tabla del modelo · ${f.nombre}`} nombreArchivo={nombreArchivo} xEtq="Tiempo (h)" medido={[c.t0, c.t1]} desde0={0} hasta0={Math.ceil(c.t1)} paso0={0.1} onClose={onClose}
    cols={tipo === 'od' ? ['OD', 'log₁₀ OD'] : ['log₁₀ UFC/mL', 'UFC/mL']} dec={tipo === 'od' ? 4 : 3}
    f={(t) => { const y = c.pred10(t); return tipo === 'od' ? [10 ** y, y] : [y, 10 ** y] }} />
}

// filas: [{ id, nombre, color, c }] con c = resultado de ajusteDmfit · tipo: 'od' | 'ufc'
export function EcuacionModelo({ filas, tipo, nota, nombreArchivo = 'modelo' }) {
  const [tabla, setTabla] = useState(null)
  const vy = tipo === 'od' ? 'OD' : 'N'
  const abierta = filas.find((f) => f.id === tabla && f.c?.ok)
  return (
    <div className="ec-modelo">
      <h2>Ecuación del modelo</h2>
      {nota && <p className="ayuda" style={{ marginTop: 0 }}>{nota}</p>}
      <div className="ec-grid">{filas.map((f) => <BloqueCepa key={f.id} f={f} tipo={tipo} vy={vy} onTabla={() => setTabla(f.id)} />)}</div>
      {abierta && <TablaModelo f={abierta} tipo={tipo} nombreArchivo={`${nombreArchivo} - ${abierta.nombre}`} onClose={() => setTabla(null)} />}
    </div>
  )
}
