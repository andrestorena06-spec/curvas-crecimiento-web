import { useMemo, useState } from 'react'
import { LineChart } from './charts.jsx'
import { Campo, Check, Modal, Num, Panel, Select } from './ui.jsx'
import { Vacio } from './placa.jsx'
import { estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { finito } from '../motor/analisis.js'
import { LETRAS } from '../motor/lectura.js'
import { clavePunto, nombreReplica, r3 } from '../motor/pipeline.js'

const COLOR_CAT = {
  OK: '#e3f1dc', Sospechoso: '#f8d9d6', Divergentes: '#fbf0cf', Ruidoso: '#fbf0cf', Excluido: '#e3e0da',
  'Sin réplicas': '#dbeaf3', Blanco: '#ece8e1', 'Sin datos': '#ece8e1',
}

// ---------------------------------------------------------------
// Estado de cada punto de un pocillo (para la ventana ampliada)
// ---------------------------------------------------------------
function puntosDe(s, p) {
  const ys = s.datos.pocillos[p] || []
  const man = new Set(s.E.puntosExcl), forz = new Set(s.E.forzados)
  const w = s.pre.marcado.find((x) => x.Pocillo === p)
  const mapa = new Map(w ? w.filas.map((f) => [r3(f.t), f]) : [])
  const out = []
  s.datos.tiempos.forEach((t, i) => {
    let v = ys[i]
    if (!finito(v)) return
    if (s.pre.blanco) {
      const b = s.pre.blanco.prom.get(r3(t))
      if (b === undefined) return
      v -= b
    }
    const k = clavePunto(p, t)
    let estado = 'En el análisis', detalle = ''
    const f = mapa.get(r3(t))
    if (f && f.motivo) { estado = f.motivo; detalle = f.detalle }
    if (f && f.marca && forz.has(k)) { estado = 'Reincorporado manualmente'; detalle = `El filtro lo había marcado: ${f.detalle} Clic para volver a excluirlo.` }
    if (man.has(k)) { estado = 'Excluido manualmente'; detalle = 'Excluido a mano (clic o rango de tiempo). Clic para reincorporarlo.' }
    out.push({ t, v, k, estado, detalle })
  })
  return out
}

const ESTADO_EST = {
  'Reincorporado manualmente': { color: '#ef6c00', forma: 'anillo' },
  'Aberrante (interpolado)': { color: '#ef6c00', forma: 'o' },
  'Aberrante (Hampel)': { color: '#d62728', forma: 'x' },
  'OD sobre el máximo': { color: '#d62728', forma: 'x' },
  'Excluido manualmente': { color: '#8b0000', forma: 'x' },
}

// ---------------------------------------------------------------
// Ventana ampliada de un pocillo
// ---------------------------------------------------------------
function ModalPocillo({ s, p, onClose }) {
  const [ln, setLn] = useState(false)
  const [otras, setOtras] = useState(true)
  const c = s.config.find((x) => x.Pocillo === p)
  const pts = puntosDe(s, p)
  const tr = (v) => (ln ? Math.log(v) : v)
  const ok = (v) => finito(v) && (!ln || v > 0)
  const usados = pts.filter((q) => ['En el análisis', 'Reincorporado manualmente', 'Aberrante (interpolado)'].includes(q.estado))
  const series = []
  if (otras && c) {
    s.config.filter((x) => x.Muestra === c.Muestra && !x.EsBlanco && x.Pocillo !== p).forEach((x) => {
      const w = s.pre.pre.find((y) => y.Pocillo === x.Pocillo)
      if (!w) return
      const data = w.filas.filter((f) => ok(f.y)).map((f) => ({ x: f.t / 3600, y: tr(f.y) }))
      if (data.length > 1) series.push({ id: 'o' + x.Pocillo, nombre: '', color: '#b7c1c8', grosor: 1, puntos: false, data })
    })
  }
  series.push({
    id: 'p', nombre: 'En el análisis', color: '#455a64', grosor: 1.2, puntos: true,
    data: usados.filter((q) => ok(q.v)).map((q) => ({ x: q.t / 3600, y: tr(q.v), key: q.k, tip: `${q.estado}\nt = ${(q.t / 3600).toFixed(2)} h\n${ln ? 'ln(OD)' : 'OD'} = ${tr(q.v).toFixed(3)}` })),
  })
  const extras = pts.filter((q) => q.estado !== 'En el análisis' && ok(q.v)).map((q) => ({
    x: q.t / 3600, y: tr(q.v), key: q.k, ...(ESTADO_EST[q.estado] || { color: '#d62728', forma: 'x' }),
    tip: `${q.estado}\nt = ${(q.t / 3600).toFixed(2)} h\n${ln ? 'ln(OD)' : 'OD'} = ${tr(q.v).toFixed(3)}${q.detalle ? '\n' + q.detalle : ''}`,
  }))
  const vals = [...series.flatMap((x) => x.data.map((d) => d.y)), ...extras.map((e) => e.y)]
  const a = Math.min(...vals), b = Math.max(...vals)
  const pad = (b - a) * 0.06 || 0.05
  const tms = pts.map((q) => q.t / 3600)
  const fuera = s.pre.fuera.has(p)
  const noUsados = pts.filter((q) => q.estado !== 'En el análisis')
  const est = estiloCurvaDefecto()
  est.leyendaX.texto = 'Tiempo (h)'
  est.leyendaY.texto = ln ? 'ln(OD)' : 'Absorbancia (con blanco restado)'
  const manualesDe = s.E.puntosExcl.filter((k) => k.startsWith(p + '|'))
  const marcadosDe = pts.filter((q) => q.estado !== 'En el análisis' && q.estado !== 'Reincorporado manualmente' && q.estado !== 'Excluido manualmente')

  return (
    <Modal titulo={`Pocillo ${p}${c ? ` · ${c.Muestra} (réplica ${c.Replica})` : ''}${fuera ? ' · EXCLUIDO del análisis' : ''}`} onClose={onClose} ancho={900}
      pie={<button className="primario" onClick={onClose}>Cerrar</button>}>
      <div className="fila-ctrl">
        <div className="seg">
          <button className={!ln ? 'on' : ''} onClick={() => setLn(false)}>OD</button>
          <button className={ln ? 'on' : ''} onClick={() => setLn(true)}>ln(OD)</button>
        </div>
        <Check label="Mostrar otras réplicas de la muestra" checked={otras} onChange={setOtras} />
        <button className="chico" disabled={!manualesDe.length && !marcadosDe.length} onClick={() => s.reincorporarPocillo(p)}>Reincorporar todos los puntos</button>
        <button className="chico peligro" onClick={() => s.alternarPocilloCompleto(p)}>{s.E.pocillosExcl.includes(p) ? 'Reincorporar el pocillo completo' : 'Excluir el pocillo completo'}</button>
      </div>
      <LineChart series={series} extras={extras} xlim={[Math.min(...tms) - 0.01, Math.max(...tms) + 0.01]} ylim={[a - pad, b + pad]}
        est={est} ejes={ejesDefecto()} xTxt="Tiempo (h)" yTxt={est.leyendaY.texto} leyenda={false} altoBase={300}
        onPuntoClick={s.alternarPunto} />
      <p className="ayuda">Clic en un punto: lo excluye o lo reincorpora. Pasá el mouse sobre una x roja para ver por qué se quitó.</p>
      <h4>Puntos que no están en el análisis</h4>
      {noUsados.length === 0 ? <p className="ayuda">Todos los puntos de este pocillo están en el análisis.</p> : (
        <div className="tabla-scroll chica"><table className="tabla">
          <thead><tr><th>Tiempo (h)</th><th>Absorbancia</th><th>Estado</th><th>Motivo</th></tr></thead>
          <tbody>{noUsados.map((q) => <tr key={q.k}><td>{(q.t / 3600).toFixed(3)}</td><td>{q.v.toFixed(4)}</td><td>{q.estado}</td><td>{q.detalle}</td></tr>)}</tbody>
        </table></div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------
// Vista de los 96 pocillos
// ---------------------------------------------------------------
function VistaPlaca({ s }) {
  const [abierto, setAbierto] = useState(null)
  const [hover, setHover] = useState(null)
  const m = useMemo(() => {
    const todos = s.pre.marcado.flatMap((w) => w.filas.filter((f) => finito(f.yAntes)))
    if (!todos.length) return null
    const ts = todos.map((f) => f.t / 3600)
    const ys = todos.map((f) => f.yAntes)
    const a = Math.min(...ys), b = Math.max(...ys)
    return { t0: Math.min(...ts), t1: Math.max(...ts), y0: a - (b - a) * 0.05, y1: b + (b - a) * 0.05 }
  }, [s.pre])
  if (!m) return <Vacio texto="No hay datos para mostrar." />
  const CW = 96, CH = 66, L = 26, T = 22
  const W = L + 12 * CW + 4, H = T + 8 * CH + 24
  const px = (t, c) => L + c * CW + 4 + ((t - m.t0) / (m.t1 - m.t0 || 1)) * (CW - 8)
  const py = (y, f) => T + f * CH + 4 + (1 - (y - m.y0) / (m.y1 - m.y0 || 1)) * (CH - 8)
  const porPoc = Object.fromEntries(s.pre.marcado.map((w) => [w.Pocillo, w]))
  // detalle del punto más cercano al pasar el mouse, con el color de la curva
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const k = W / r.width
    const mx = (e.clientX - r.left) * k, my = (e.clientY - r.top) * k
    const c = Math.floor((mx - L) / CW), fi = Math.floor((my - T) / CH)
    const p = c >= 0 && c < 12 && fi >= 0 && fi < 8 ? LETRAS[fi] + (c + 1) : null
    const w = p && porPoc[p]
    if (!w) return setHover(null)
    let mejor = null, dm = 11 * 11
    w.filas.forEach((q) => {
      if (!finito(q.yAntes)) return
      const dx = px(q.t / 3600, c) - mx, dy = py(q.yAntes, fi) - my, d = dx * dx + dy * dy
      if (d < dm) { dm = d; mejor = q }
    })
    const cab = `${nombreReplica(w.Muestra, w.Replica)} (${p})${w.EsBlanco ? ' · blanco' : ''}${s.pre.fuera.has(p) ? ' · excluido' : ''}`
    const tip = mejor
      ? `${cab}\nTiempo: ${(mejor.t / 3600).toFixed(2)} h\nAbsorbancia: ${mejor.yAntes.toFixed(3)}${mejor.motivo ? `\n${mejor.motivo}\n${mejor.detalle}` : ''}`
      : cab
    setHover({ tip, color: s.colores.porPocillo[p]?.color || '#9a9186', px: e.clientX - r.left, py: e.clientY - r.top, cell: { x: L + c * CW, y: T + fi * CH }, pt: mejor ? { x: px(mejor.t / 3600, c), y: py(mejor.yAntes, fi) } : null })
  }
  return (
    <>
      <p className="ayuda">Curvas de los 96 pocillos con el blanco aplicado. Gris: pocillo excluido. Rojo: puntos excluidos. Línea punteada: pocillo de blanco. Pasá el mouse por una curva para ver el detalle del punto. Clic en un pocillo para ampliarlo, ver sus puntos quitados y excluirlos o reincorporarlos.</p>
      <div className="placa-wrap" style={{ position: 'relative' }}>
        {hover && <div className="tip-grafico" style={{ left: hover.px + 14, top: hover.py + 6 }}><i className="punto-color" style={{ background: hover.color }} />{hover.tip}</div>}
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, minWidth: 720 }} fontFamily="'Segoe UI', system-ui, sans-serif" onMouseMove={mover} onMouseLeave={() => setHover(null)}>
          <rect width={W} height={H} fill="#fff" />
          {Array.from({ length: 12 }, (_, c) => <text key={c} x={L + c * CW + CW / 2} y={15} textAnchor="middle" fontSize="11" fill="#6b5d4f">{c + 1}</text>)}
          {LETRAS.map((f, i) => <text key={f} x={11} y={T + i * CH + CH / 2} textAnchor="middle" dominantBaseline="central" fontSize="11" fill="#6b5d4f">{f}</text>)}
          {LETRAS.map((f, fi) => Array.from({ length: 12 }, (_, c) => {
            const p = f + (c + 1)
            const w = porPoc[p]
            const x0 = L + c * CW, y0 = T + fi * CH
            const fuera = s.pre.fuera.has(p)
            return (
              <g key={p} style={w ? { cursor: 'pointer' } : undefined} onClick={w ? () => setAbierto(p) : undefined}>
                <rect x={x0 + 1} y={y0 + 1} width={CW - 2} height={CH - 2} fill={w ? '#fffdf9' : '#faf7f2'} stroke="#e4dccf" />
                {w && (
                  <>
                    <polyline fill="none" strokeWidth="1.1" stroke={fuera ? '#b9b3a9' : '#2c7fb8'} strokeDasharray={w.EsBlanco ? '2 2' : undefined}
                      points={w.filas.filter((q) => finito(q.yAntes) && !q.motivo).map((q) => `${px(q.t / 3600, c)},${py(q.yAntes, fi)}`).join(' ')} />
                    {w.filas.filter((q) => q.motivo && finito(q.yAntes)).map((q, i) => {
                      const X = px(q.t / 3600, c), Y = py(q.yAntes, fi)
                      return <path key={i} d={`M${X - 2.5},${Y - 2.5}L${X + 2.5},${Y + 2.5}M${X - 2.5},${Y + 2.5}L${X + 2.5},${Y - 2.5}`} stroke="#d62728" strokeWidth="1.2" />
                    })}
                    {s.E.puntosExcl.filter((k) => k.startsWith(p + '|')).map((k) => {
                      const t = Number(k.split('|')[1])
                      const i = s.datos.tiempos.findIndex((x) => r3(x) === r3(t))
                      let v = s.datos.pocillos[p][i]
                      if (s.pre.blanco) { const b = s.pre.blanco.prom.get(r3(t)); if (b === undefined) return null; v -= b }
                      if (!finito(v)) return null
                      const X = px(t / 3600, c), Y = py(v, fi)
                      return <path key={k} d={`M${X - 2.5},${Y - 2.5}L${X + 2.5},${Y + 2.5}M${X - 2.5},${Y + 2.5}L${X + 2.5},${Y - 2.5}`} stroke="#8b0000" strokeWidth="1.2" />
                    })}
                    <text x={x0 + 4} y={y0 + 11} fontSize="8.5" fill="#7a6e60">{nombreReplica(w.Muestra, w.Replica)}</text>
                  </>
                )}
              </g>
            )
          }))}
          {hover && <rect x={hover.cell.x + 1} y={hover.cell.y + 1} width={CW - 2} height={CH - 2} fill="none" stroke="#d9731f" strokeWidth="1.5" pointerEvents="none" />}
          {hover?.pt && <circle cx={hover.pt.x} cy={hover.pt.y} r="4" fill="none" stroke="#d9731f" strokeWidth="1.8" pointerEvents="none" />}
          <text x={L + 6 * CW} y={H - 6} textAnchor="middle" fontSize="11" fill="#6b5d4f">Tiempo (h) · {m.t0.toFixed(1)} a {m.t1.toFixed(1)} · eje Y común: {m.y0.toFixed(2)} a {m.y1.toFixed(2)} OD</text>
        </svg>
      </div>
      {abierto && <ModalPocillo s={s} p={abierto} onClose={() => setAbierto(null)} />}
    </>
  )
}

// ---------------------------------------------------------------
// Control de calidad por pocillo
// ---------------------------------------------------------------
function TablaQC({ s }) {
  const [sel, setSel] = useState([])
  const q = s.pre.qc
  const man = s.E.pocillosExcl
  const fuera = (r) => (man.includes(r.Pocillo) ? 'Pocillo completo (manual)' : s.pre.auto.includes(r.Pocillo) ? 'Pocillo completo (automático)' : r.Puntos_quitados)
  const f = (x, d = 3) => (finito(x) ? Number(x.toPrecision(d)) : '')
  const alt = (p) => setSel((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]))
  return (
    <>
      <div className="fila-ctrl">
        <button className="peligro" disabled={!sel.length} onClick={() => { s.excluirPocillos(sel); setSel([]) }}>Excluir pocillos seleccionados</button>
        <button disabled={!sel.length} onClick={() => { s.reincorporarPocillos(sel); setSel([]) }}>Reincorporar seleccionados</button>
        <button className="chico" onClick={() => setSel(q.map((r) => r.Pocillo))}>Seleccionar todos</button>
        <button className="chico" onClick={() => setSel([])}>Ninguno</button>
      </div>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th /><th>Pocillo</th><th>Muestra</th><th>Réplica</th><th>Estado</th><th>Fuera del análisis</th><th>Desvío vs réplicas</th><th>Razón desvío</th><th>Dif. AUC %</th><th>N quitados</th><th>Pts aberrantes</th><th>Pts OD alta</th><th>Pts no positivos</th></tr></thead>
          <tbody>
            {q.map((r) => (
              <tr key={r.Pocillo} onClick={() => alt(r.Pocillo)} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" checked={sel.includes(r.Pocillo)} onChange={() => alt(r.Pocillo)} onClick={(e) => e.stopPropagation()} /></td>
                <td><b>{r.Pocillo}</b></td><td>{r.Muestra}</td><td>{r.Replica}</td>
                <td style={{ background: COLOR_CAT[r.Categoria] }}>{r.Estado}</td>
                <td>{fuera(r)}</td><td>{f(r.d_mediana)}</td><td>{f(r.ratio)}</td><td>{f(r.dif_pct)}</td>
                <td>{r.N_quitados}</td><td>{r.Pts_aberrantes}</td><td>{r.Pts_OD_alta}</td><td>{r.Pts_no_positivos}</td>
              </tr>
            ))}
            {!q.length && <tr><td colSpan={13} className="ayuda">Configurá los pocillos para ver el control de calidad.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="ayuda">Excluidos a mano: {man.length ? man.join(', ') : 'ninguno'}. Excluidos automáticamente: {s.pre.auto.length ? s.pre.auto.join(', ') : 'ninguno'}.</p>
    </>
  )
}

// ---------------------------------------------------------------
// Excluir puntos / tramos de tiempo
// ---------------------------------------------------------------
function ExcluirPuntos({ s }) {
  const [poc, setPoc] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [sel, setSel] = useState([])
  const cfg = s.config.slice().sort((a, b) => LETRAS.indexOf(a.Pocillo[0]) * 100 + Number(a.Pocillo.slice(1)) - (LETRAS.indexOf(b.Pocillo[0]) * 100 + Number(b.Pocillo.slice(1))))
  const p = poc || cfg[0]?.Pocillo || ''
  const lista = [...s.E.puntosExcl].map((k) => ({ k, p: k.split('|')[0], h: Number(k.split('|')[1]) / 3600 }))
    .sort((a, b) => LETRAS.indexOf(a.p[0]) * 100 + Number(a.p.slice(1)) - (LETRAS.indexOf(b.p[0]) * 100 + Number(b.p.slice(1))) || a.h - b.h)
  return (
    <>
      <p className="ayuda">Podés excluir un punto con un clic en el gráfico (activá la opción en la pestaña «Gráfico») o un tramo de tiempo de un pocillo desde acá. Los datos originales no se modifican y todo se puede revertir.</p>
      <div className="fila-ctrl">
        <Campo label="Pocillo">
          <select value={p} onChange={(e) => setPoc(e.target.value)}>
            {cfg.map((c) => <option key={c.Pocillo} value={c.Pocillo}>{nombreReplica(c.Muestra, c.Replica)} ({c.Pocillo})</option>)}
          </select>
        </Campo>
        <Campo label="Desde (h)"><Num value={desde} step={0.25} onChange={setDesde} /></Campo>
        <Campo label="Hasta (h)"><Num value={hasta} step={0.25} onChange={setHasta} /></Campo>
        <button className="peligro" onClick={() => s.excluirRango(p, Number(desde), Number(hasta))} disabled={!p || desde === '' || hasta === ''}>Excluir</button>
      </div>
      <h4>Puntos excluidos manualmente</h4>
      {lista.length === 0 ? <p className="ayuda">No hay puntos excluidos a mano.</p> : (
        <div className="tabla-scroll chica"><table className="tabla">
          <thead><tr><th /><th>Pocillo</th><th>Tiempo (h)</th></tr></thead>
          <tbody>{lista.map((x) => (
            <tr key={x.k} onClick={() => setSel((v) => (v.includes(x.k) ? v.filter((y) => y !== x.k) : [...v, x.k]))} style={{ cursor: 'pointer' }}>
              <td><input type="checkbox" readOnly checked={sel.includes(x.k)} /></td><td>{x.p}</td><td>{x.h.toFixed(3)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="fila-ctrl">
        <button disabled={!sel.length} onClick={() => { s.reincorporarPuntos(sel); setSel([]) }}>Reincorporar seleccionados</button>
        <button onClick={() => { s.reincorporarTodosPuntos(); setSel([]) }} disabled={!lista.length && !s.E.forzados.length}>Reincorporar todos</button>
      </div>
    </>
  )
}

// ===============================================================
// PREPROCESADO Y QC
// ===============================================================
export function PreprocTab({ s }) {
  const [sub, setSub] = useState('placa')
  const { aj, setAj } = s
  if (!s.datos) return <Vacio texto="Primero cargá el archivo del lector en la pestaña Archivo." />
  const cuerpo = !s.config.length ? <Vacio texto="Configurá los pocillos para ver el preprocesado." />
    : s.pre?.error ? <Vacio texto={s.pre.error} />
      : sub === 'placa' ? <VistaPlaca s={s} /> : sub === 'qc' ? <TablaQC s={s} /> : <ExcluirPuntos s={s} />
  return (
    <div className="con-lateral">
      <Panel titulo="Preprocesado">
        <p className="ayuda">La corrección al blanco se configura en la pestaña «Gráfico». El orden es: blanco › exclusiones › suavizado › normalización.</p>
        <h3>OD inicial y normalización</h3>
        <Campo label="Cómo calcular OD₀">
          <Select value={aj.od0_metodo} onChange={(v) => setAj('od0_metodo', v)}
            opciones={[['auto', 'Automática (meseta inicial de ln OD, modelo de tres fases)'], ['primeros', 'Media de los primeros N puntos']]} />
        </Campo>
        <Campo label="Puntos iniciales (respaldo y normalización)"><Num value={aj.n_od0} min={1} onChange={(v) => setAj('n_od0', v)} /></Campo>
        <p className="ayuda">La automática usa todos los puntos de la fase lag y no depende de un solo valor. La normalización (restar/dividir) siempre usa los primeros N puntos.</p>
        <Campo label="Normalizar curvas">
          <Select value={aj.normalizar} onChange={(v) => setAj('normalizar', v)} opciones={[['ninguna', 'Sin normalizar'], ['restar', 'Restar OD₀'], ['dividir', 'Dividir por OD₀']]} />
        </Campo>
        <h3>Suavizado</h3>
        <Select value={aj.suavizado} onChange={(v) => setAj('suavizado', v)} opciones={[['ninguno', 'Ninguno'], ['media', 'Media móvil'], ['mediana', 'Mediana móvil'], ['loess', 'LOESS']]} />
        {(aj.suavizado === 'media' || aj.suavizado === 'mediana') && <Campo label="Ventana (puntos, impar)"><Num value={aj.suav_k} min={3} step={2} onChange={(v) => setAj('suav_k', v)} /></Campo>}
        {aj.suavizado === 'loess' && <Campo label="Span (0 a 1)"><Num value={aj.suav_span} min={0.05} max={1} step={0.05} onChange={(v) => setAj('suav_span', v)} /></Campo>}
        <h3>Puntos aberrantes</h3>
        <Check label="Filtro de Hampel" checked={aj.hampel_on} onChange={(v) => setAj('hampel_on', v)} />
        {aj.hampel_on && (
          <>
            <Campo label="Semiventana (puntos a cada lado)"><Num value={aj.hampel_k} min={2} onChange={(v) => setAj('hampel_k', v)} /></Campo>
            <Campo label="Umbral (múltiplos de MAD)"><Num value={aj.hampel_sigma} min={1} step={0.5} onChange={(v) => setAj('hampel_sigma', v)} /></Campo>
            <Campo label="Diferencia mínima para marcar (OD)"><Num value={aj.hampel_min} min={0} step={0.001} onChange={(v) => setAj('hampel_min', v)} /></Campo>
            <p className="ayuda">Es un piso en unidades de OD: solo se marcan desvíos mayores que esto. Tiene que ser menor que el desvío que querés detectar (con OD cerca de 0,1, un valor de 0,002 a 0,005 es razonable; con OD cerca de 1, subilo).</p>
            <Campo label="Qué hacer con los puntos marcados">
              <Select value={aj.hampel_accion} onChange={(v) => setAj('hampel_accion', v)} opciones={[['excluir', 'Excluir'], ['interpolar', 'Reemplazar por interpolación']]} />
            </Campo>
          </>
        )}
        <Check label="Excluir puntos por encima de una OD máxima confiable" checked={aj.odmax_on} onChange={(v) => setAj('odmax_on', v)} />
        <Campo label="OD máxima confiable"><Num value={aj.odmax} min={0} step={0.1} onChange={(v) => setAj('odmax', v)} /></Campo>
        <p className="ayuda">Por encima de ~1 la OD de lector de placas deja de ser lineal. Aunque no excluyas, la tabla de QC cuenta los puntos que la superan.</p>
        <h3>Pocillos que no concuerdan con sus réplicas</h3>
        <Campo label="Factor de desvío (× la de las otras réplicas)"><Num value={aj.pocillo_factor} min={1} step={0.5} onChange={(v) => setAj('pocillo_factor', v)} /></Campo>
        <Campo label="Desvío mínimo para marcar (OD)"><Num value={aj.pocillo_min} min={0} step={0.01} onChange={(v) => setAj('pocillo_min', v)} /></Campo>
        <Campo label="Con 2 réplicas: diferencia de AUC para marcar (%)"><Num value={aj.pocillo_div} min={1} step={5} onChange={(v) => setAj('pocillo_div', v)} /></Campo>
        <Check label="Excluir automáticamente los pocillos «Sospechosos»" checked={aj.pocillo_auto} onChange={(v) => setAj('pocillo_auto', v)} />
        <p className="ayuda">Con 3 o más réplicas se puede identificar cuál se aparta. Con 2 solo se puede avisar que divergen: decidí vos cuál excluir.</p>
      </Panel>
      <div className="principal">
        <div className="subtabs">
          {[['placa', 'Vista de placa'], ['qc', 'Control de calidad por pocillo'], ['puntos', 'Excluir puntos']].map(([id, t]) => (
            <button key={id} className={sub === id ? 'on' : ''} onClick={() => setSub(id)}>{t}</button>
          ))}
        </div>
        {cuerpo}
      </div>
    </div>
  )
}
