import { useMemo, useState } from 'react'
import { LineChart } from './charts.jsx'
import { Campo, Check, Modal, Num, Panel, Select } from './ui.jsx'
import { SelectorMuestras } from './grafico.jsx'
import { TablaAvanzada } from './tabla.jsx'
import { Vacio } from './placa.jsx'
import { estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { AYUDA, MODELOS_ETQ, PARAMS, explicarResultado, f4, signif } from '../ayuda.js'
import { analizarCurva, desvio, finito, media, ventanasLn } from '../motor/analisis.js'
import { ajustarModelo } from '../motor/modelos.js'
import { curvaMedia, nombreReplica, opAnalisis } from '../motor/pipeline.js'
import { LETRAS } from '../motor/lectura.js'
import { aCSV, descargarTexto, tCuantil } from '../utils.js'

const g3 = (x) => (finito(x) ? String(Number(x.toPrecision(3))) : '')
const g2 = (x) => (finito(x) ? String(Number(x.toPrecision(2))) : '')
const NOMBRES_MODELO = Object.keys(MODELOS_ETQ)

// ---------------------------------------------------------------
// Curva de un pocillo / promedio de una muestra, con sus parámetros
// ---------------------------------------------------------------
function curvaPocillo(s, p) {
  const w = s.pre.proc.find((x) => x.Pocillo === p)
  const par = s.res.find((x) => x.Pocillo === p)
  if (!w || !par) return null
  const o = w.t.map((_, i) => i).sort((a, b) => w.t[a] - w.t[b])
  return { t: o.map((i) => w.t[i] / 3600), y: o.map((i) => w.y[i]), par, replicas: null, clave: p, pocillos: [p],
    titulo: `${nombreReplica(par.Muestra, par.Replica)} (${p})`, modo: 'pocillo' }
}

function curvaMuestra(s, m, conReplicas) {
  let ws = s.pre.proc.filter((w) => !w.EsBlanco && w.Muestra === m)
  const sel = new Set(s.seleccion.map((c) => c.Pocillo))
  if (ws.some((w) => sel.has(w.Pocillo))) ws = ws.filter((w) => sel.has(w.Pocillo))
  if (!ws.length) return null
  const cm = curvaMedia(ws)
  const clave = 'muestra:' + m
  const v = s.E.ventanas[clave]
  const par = analizarCurva(cm.t.map((x) => x / 3600), cm.y, opAnalisis(s.aj), v || null)
  return {
    t: cm.t.map((x) => x / 3600), y: cm.y, par, clave, pocillos: ws.map((w) => w.Pocillo), modo: 'muestra',
    replicas: conReplicas ? ws.map((w) => ({ Pocillo: w.Pocillo, t: w.t.map((x) => x / 3600), y: w.y })) : null,
    titulo: `${m} (promedio de ${ws.length} ${ws.length === 1 ? 'réplica' : 'réplicas'})`,
  }
}

// ---------------------------------------------------------------
// Gráfico de detalle: ln(OD), ventana, fases, OD0, K y modelo
// ---------------------------------------------------------------
function DetalleChart({ dc, fases, modelo, onBrush, alto = 340 }) {
  const par = dc.par
  const dd = dc.t.map((t, i) => ({ t, y: dc.y[i] })).filter((q) => finito(q.y) && q.y > 0).map((q) => ({ ...q, ln: Math.log(q.y) }))
  const mod = useMemo(() => {
    if (!modelo || modelo === 'ninguno' || !finito(par.od0) || dd.length < 8) return null
    return ajustarModelo(modelo, dd.map((q) => q.t), dd.map((q) => q.y), par.od0, par.mu_max, par.lag_tangente_h, par.K)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo, dc])
  if (dd.length < 3) return <Vacio texto="Muy pocos puntos positivos." />
  const tmin = Math.min(...dd.map((q) => q.t)), tmax = Math.max(...dd.map((q) => q.t))
  const repLn = (dc.replicas || []).flatMap((r) => r.y.filter((v) => finito(v) && v > 0).map(Math.log))
  const todos = [...dd.map((q) => q.ln), ...repLn]
  const ymin = Math.min(...todos), ymax = Math.max(...todos)
  let pad = 0.08 * (ymax - ymin)
  if (!finito(pad) || pad === 0) pad = 0.1
  const enV = (q) => finito(par.t_ini_ventana) && q.t >= par.t_ini_ventana && q.t <= par.t_fin_ventana
  const series = []
  ;(dc.replicas || []).forEach((r, i) => {
    const data = r.t.map((t, j) => ({ t, y: r.y[j] })).filter((q) => finito(q.y) && q.y > 0).map((q) => ({ x: q.t, y: Math.log(q.y) }))
    if (data.length > 1) series.push({ id: 'r' + r.Pocillo, nombre: i === 0 ? 'Réplicas' : '', color: '#9aa8b0', grosor: 1, radio: 1.8, puntos: true, data })
  })
  const tip = (q) => `t = ${q.t.toFixed(2)} h\nln(OD) = ${q.ln.toFixed(3)}\nOD = ${q.y.toFixed(3)}`
  series.push({ id: 'datos', nombre: 'Datos', color: '#455a64', sinLinea: true, puntos: true, radio: 3.2, data: dd.filter((q) => !enV(q)).map((q) => ({ x: q.t, y: q.ln, tip: tip(q) })) })
  if (dd.some(enV)) series.push({ id: 'vent', nombre: 'Ventana de μmax', color: '#ef6c00', sinLinea: true, puntos: true, radio: 3.8, data: dd.filter(enV).map((q) => ({ x: q.t, y: q.ln, tip: tip(q) })) })
  if (finito(par.mu_max) && finito(par.intercepto) && par.mu_max > 0) {
    const x1 = Math.max(tmin, (ymin - pad - par.intercepto) / par.mu_max)
    const x2 = Math.min(tmax, (ymax + pad - par.intercepto) / par.mu_max)
    if (x2 > x1) series.push({ id: 'recta', nombre: `Recta (μ = ${g3(par.mu_max)} h⁻¹)`, color: '#ef6c00', dash: 'dashed', grosor: 2, data: [x1, x2].map((x) => ({ x, y: par.intercepto + par.mu_max * x })) })
  }
  if (mod?.pred_ln) {
    const g = Array.from({ length: 200 }, (_, i) => tmin + ((tmax - tmin) * i) / 199)
    const yy = mod.pred_ln(g)
    series.push({ id: 'modelo', nombre: MODELOS_ETQ[modelo] + (mod.ok ? '' : ' (no convergió)'), color: '#8e24aa', grosor: 2, data: g.map((x, i) => ({ x, y: yy[i] })) })
  }
  const est = estiloCurvaDefecto()
  est.titulo.texto = ''
  ;['numerosX', 'numerosY', 'leyenda'].forEach((k) => { est[k].size = 11 })
  est.leyendaX.size = 12; est.leyendaY.size = 12
  const xl = [tmin - (tmax - tmin) * 0.02, tmax + (tmax - tmin) * 0.02]

  const sombras = (esc) => {
    if (!fases) return null
    const { X, L } = esc
    const R = (x0, x1, col, txt, k) => (
      <g key={k}>
        <rect x={X(x0)} y={L.top} width={Math.max(0, X(x1) - X(x0))} height={L.plotH} fill={col} />
        <text x={(X(x0) + X(x1)) / 2} y={L.top + 12} textAnchor="middle" fontSize="11" fill="#6b5d4f">{txt}</text>
      </g>
    )
    const out = []
    if (finito(par.t_exp_ini)) out.push(R(tmin, par.t_exp_ini, 'rgba(120,144,156,0.18)', 'lag', 'a'))
    if (finito(par.t_exp_ini) && finito(par.t_exp_fin)) out.push(R(par.t_exp_ini, par.t_exp_fin, 'rgba(67,160,71,0.20)', 'exponencial', 'b'))
    if (finito(par.t_estacionaria)) out.push(R(par.t_estacionaria, finito(par.t_muerte) ? par.t_muerte : tmax, 'rgba(251,192,45,0.22)', 'estacionaria', 'c'))
    if (finito(par.t_muerte)) out.push(R(par.t_muerte, tmax, 'rgba(229,57,53,0.18)', 'muerte', 'd'))
    return <g>{out}</g>
  }
  const lineas = (esc) => {
    const { X, Y, L } = esc
    const H = (yv, txt, k) => (
      <g key={k}>
        <line x1={L.left} x2={L.left + L.plotW} y1={Y(yv)} y2={Y(yv)} stroke="#888" strokeDasharray="2 3" />
        <text x={L.left + L.plotW - 4} y={Y(yv) - 3} textAnchor="end" fontSize="10.5" fill="#6b5d4f">{txt}</text>
      </g>
    )
    return (
      <g>
        {finito(par.od0) && par.od0 > 0 && H(Math.log(par.od0), 'OD₀', 'o')}
        {finito(par.K) && par.K > 0 && H(Math.log(par.K), 'K', 'k')}
        {finito(par.lag_h) && <line x1={X(par.lag_h)} x2={X(par.lag_h)} y1={L.top} y2={L.top + L.plotH} stroke="#1f77b4" strokeDasharray="6 4" strokeWidth="1.5" />}
      </g>
    )
  }
  return (
    <LineChart series={series} xlim={xl} ylim={[ymin - pad, ymax + pad]} est={est} ejes={ejesDefecto()} xTxt="Tiempo (h)" yTxt="ln(OD)"
      altoBase={alto} capasAntes={sombras} capas={lineas} onBrush={onBrush} />
  )
}

// ---------------------------------------------------------------
// Gráfico de μ(t) por ventanas
// ---------------------------------------------------------------
function MuChart({ dc, op }) {
  const par = dc.par
  const vent = ventanasLn(dc.t, dc.y, op.ancho, op.minpts, op.lnmin)
  if (!vent) return <Vacio texto="No hay ventanas válidas para calcular μ(t)." />
  const ok = vent.filter((v) => finito(v.r2) && v.r2 >= op.r2min)
  const mal = vent.filter((v) => !(finito(v.r2) && v.r2 >= op.r2min))
  const tip = (v) => `t = ${v.t_mid.toFixed(2)} h\nμ = ${v.pendiente.toFixed(3)}\nR² = ${finito(v.r2) ? v.r2.toFixed(4) : 'NA'}`
  const series = [
    { id: 'mu', nombre: 'μ(t)', color: '#90a4ae', grosor: 1.4, data: vent.map((v) => ({ x: v.t_mid, y: v.pendiente })) },
    { id: 'ok', nombre: 'R² suficiente', color: '#2e7d32', sinLinea: true, puntos: true, radio: 3.5, data: ok.map((v) => ({ x: v.t_mid, y: v.pendiente, tip: tip(v) })) },
    { id: 'mal', nombre: 'R² bajo', color: '#c62828', sinLinea: true, puntos: true, radio: 3.5, data: mal.map((v) => ({ x: v.t_mid, y: v.pendiente, tip: tip(v) })) },
  ]
  const ys = vent.map((v) => v.pendiente)
  let a = Math.min(...ys, 0), b = Math.max(...ys)
  const pad = (b - a) * 0.08 || 0.05
  a -= pad; b += pad
  const xs = vent.map((v) => v.t_mid)
  const est = estiloCurvaDefecto()
  est.titulo.texto = ''
  ;['numerosX', 'numerosY', 'leyenda'].forEach((k) => { est[k].size = 11 })
  est.leyendaX.size = 12; est.leyendaY.size = 12
  const capas = ({ Y, L }) => finito(par.mu_max) && [op.frac_exp, op.frac_est].map((f) => (
    <line key={f} x1={L.left} x2={L.left + L.plotW} y1={Y(f * par.mu_max)} y2={Y(f * par.mu_max)} stroke="#888" strokeDasharray="2 3" />
  ))
  return <LineChart series={series} xlim={[Math.min(...xs) - 0.1, Math.max(...xs) + 0.1]} ylim={[a, b]} est={est} ejes={ejesDefecto()}
    xTxt="Tiempo (h)" yTxt="μ = d ln(OD)/dt (h⁻¹)" altoBase={230} capas={capas} />
}

// ---------------------------------------------------------------
// Tabla de parámetros de una curva
// ---------------------------------------------------------------
function TablaCurva({ dc, s }) {
  const par = dc.par
  const filas = Object.keys(PARAMS).map((p) => [PARAMS[p], finito(par[p]) ? String(signif(par[p], 4)) : '–', p])
  let est = null
  if (dc.modo === 'muestra') {
    const rs = s.res.filter((r) => dc.pocillos.includes(r.Pocillo))
    est = Object.keys(PARAMS).map((p) => {
      const x = rs.map((r) => r[p]).filter(finito)
      if (!x.length) return '–'
      return x.length > 1 ? `${g3(media(x))} ± ${g2(desvio(x))} (n=${x.length})` : `${g3(x[0])} (n=1)`
    })
  }
  return (
    <div className="tabla-scroll chica"><table className="tabla">
      <thead><tr><th>Parámetro</th><th>Valor</th>{est && <th>Media ± SD de los pocillos</th>}</tr></thead>
      <tbody>
        {filas.map(([n, v, p], i) => <tr key={p}><td>{n}</td><td>{v}</td>{est && <td>{est[i]}</td>}</tr>)}
        <tr><td>Ventana de ajuste (h)</td><td>{finito(par.t_ini_ventana) ? `${par.t_ini_ventana.toFixed(2)} a ${par.t_fin_ventana.toFixed(2)}${par.ventana_manual ? ' (manual)' : ''}` : '–'}</td>{est && <td />}</tr>
        <tr><td>Método de OD₀</td><td>{par.od0_metodo || '–'}</td>{est && <td />}</tr>
        {par.aviso && <tr><td>Avisos</td><td>{par.aviso}</td>{est && <td />}</tr>}
      </tbody>
    </table></div>
  )
}

// ---------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------
function Detalle({ s }) {
  const o = s.opts.det
  const set = (k, v) => s.setOpt('det', k, v)
  const [brush, setBrush] = useState(null)
  const cfg = s.config.filter((c) => !c.EsBlanco && !s.pre.fuera.has(c.Pocillo)).sort((a, b) => LETRAS.indexOf(a.Pocillo[0]) * 100 + Number(a.Pocillo.slice(1)) - (LETRAS.indexOf(b.Pocillo[0]) * 100 + Number(b.Pocillo.slice(1))))
  const muestras = [...new Set(cfg.map((c) => c.Muestra))].sort()
  if (!cfg.length) return <Vacio texto="No hay pocillos con resultados." />
  const poc = cfg.some((c) => c.Pocillo === o.pocillo) ? o.pocillo : cfg[0].Pocillo
  const mue = muestras.includes(o.muestra) ? o.muestra : muestras[0]
  const dc = o.modo === 'muestra' ? curvaMuestra(s, mue, o.replicas) : curvaPocillo(s, poc)
  if (!dc) return <Vacio texto="No hay datos para esta curva." />
  const op = opAnalisis(s.aj)
  const mueDe = o.modo === 'muestra' ? mue : cfg.find((c) => c.Pocillo === poc)?.Muestra
  const aplicar = (claves) => { s.aplicarVentana(claves, brush); setBrush(null) }
  const vent = Object.entries(s.E.ventanas)
  return (
    <>
      <div className="fila-ctrl">
        <Campo label="Ver">
          <Select value={o.modo} onChange={(v) => { set('modo', v); setBrush(null) }} opciones={[['pocillo', 'Un pocillo'], ['muestra', 'Muestra (promedio de réplicas)']]} />
        </Campo>
        {o.modo === 'pocillo' ? (
          <Campo label="Pocillo">
            <select value={poc} onChange={(e) => { set('pocillo', e.target.value); setBrush(null) }}>
              {cfg.map((c) => <option key={c.Pocillo} value={c.Pocillo}>{nombreReplica(c.Muestra, c.Replica)} ({c.Pocillo})</option>)}
            </select>
          </Campo>
        ) : (
          <>
            <Campo label="Muestra"><Select value={mue} onChange={(v) => { set('muestra', v); setBrush(null) }} opciones={muestras.map((m) => [m, m])} /></Campo>
            <Check label="Mostrar también las réplicas" checked={o.replicas} onChange={(v) => set('replicas', v)} />
          </>
        )}
        <Campo label="Superponer modelo">
          <Select value={o.modelo} onChange={(v) => set('modelo', v)} opciones={[['ninguno', 'Ninguno'], ...NOMBRES_MODELO.map((m) => [m, MODELOS_ETQ[m]])]} />
        </Campo>
        <Check label="Sombrear fases" checked={o.fases} onChange={(v) => set('fases', v)} />
      </div>
      <h3 style={{ margin: '6px 0', fontSize: 16, color: 'var(--texto)' }}>{dc.titulo}</h3>
      <DetalleChart dc={dc} fases={o.fases} modelo={o.modelo} onBrush={(a, b) => setBrush([Number(a.toFixed(3)), Number(b.toFixed(3))])} />
      <p className="ayuda">Para fijar a mano la fase exponencial, arrastrá un rectángulo horizontal sobre los puntos del gráfico y elegí a qué curvas aplicarlo. En modo «Muestra» los parámetros se calculan sobre la curva promedio.</p>
      {brush ? (
        <div className="fila-ctrl">
          <b>Ventana seleccionada: {brush[0].toFixed(2)} a {brush[1].toFixed(2)} h</b>
          <button className="chico primario" onClick={() => aplicar([dc.clave])}>Usar en esta curva</button>
          <button className="chico" onClick={() => aplicar([...s.config.filter((c) => c.Muestra === mueDe && !c.EsBlanco).map((c) => c.Pocillo), 'muestra:' + mueDe])}>Usar en todas las réplicas de la muestra</button>
          <button className="chico" onClick={() => aplicar([...s.config.filter((c) => !c.EsBlanco).map((c) => c.Pocillo), ...[...new Set(s.config.filter((c) => !c.EsBlanco).map((c) => c.Muestra))].map((m) => 'muestra:' + m)])}>Usar en todos los pocillos</button>
        </div>
      ) : <p className="ayuda">Sin ventana seleccionada en el gráfico.</p>}
      <div className="fila-ctrl">
        <button className="chico" disabled={!s.E.ventanas[dc.clave]} onClick={() => s.quitarVentanas([dc.clave])}>Quitar la ventana manual de esta curva</button>
        <button className="chico" disabled={!vent.length} onClick={() => s.quitarVentanas(null)}>Quitar todas las ventanas manuales</button>
      </div>
      <h4>μ(t) por ventana deslizante</h4>
      <MuChart dc={dc} op={op} />
      <h4>Parámetros de la curva mostrada</h4>
      <TablaCurva dc={dc} s={s} />
      <h4>Ventanas manuales activas</h4>
      {vent.length ? (
        <div className="tabla-scroll chica"><table className="tabla"><thead><tr><th>Curva</th><th>Desde (h)</th><th>Hasta (h)</th></tr></thead>
          <tbody>{vent.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v[0]}</td><td>{v[1]}</td></tr>)}</tbody></table></div>
      ) : <p className="ayuda">No hay ventanas manuales.</p>}
    </>
  )
}

// ---------------------------------------------------------------
// Mapa de placa
// ---------------------------------------------------------------
const VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 144, 141], [93, 200, 99], [253, 231, 37]]
function viridis(u) {
  const x = Math.min(1, Math.max(0, u)) * (VIRIDIS.length - 1)
  const i = Math.min(VIRIDIS.length - 2, Math.floor(x))
  const f = x - i
  const c = VIRIDIS[i].map((v, k) => Math.round(v + (VIRIDIS[i + 1][k] - v) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function ModalMapa({ s, p, param, onClose }) {
  const r = s.res.find((x) => x.Pocillo === p)
  const dc = curvaPocillo(s, p)
  if (!r || !dc) return null
  const op = opAnalisis(s.aj)
  const ex = explicarResultado(r, param, op)
  const ay = AYUDA[param]
  const v = r[param]
  const x = s.res.filter((q) => q.Muestra === r.Muestra).map((q) => q[param]).filter(finito)
  const n = x.length
  let grupo
  if (n >= 2) {
    const m = media(x), sd = desvio(x)
    const ic = (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n)
    const z = finito(v) && sd > 0 ? (v - m) / sd : NaN
    grupo = `Entre las ${n} réplicas de '${r.Muestra}': media = ${f4(m)}, SD = ${f4(sd, 3)} (CV = ${f4(Math.abs(sd / m) * 100, 3)}%), SEM = ${f4(sd / Math.sqrt(n), 3)}, IC 95% de la media = ${f4(m - ic)} a ${f4(m + ic)}.${finito(z) ? ` Este pocillo está a ${z.toFixed(1)} SD de la media.` : ''}`
  } else grupo = 'Esta muestra tiene una sola réplica con valor: no se puede estimar la variación entre réplicas.'
  return (
    <Modal titulo={`Pocillo ${p} · ${r.Muestra} (réplica ${r.Replica})`} onClose={onClose} ancho={860} pie={<button className="primario" onClick={onClose}>Cerrar</button>}>
      <DetalleChart dc={dc} fases modelo="ninguno" alto={260} />
      <h3 style={{ margin: '10px 0 4px', fontSize: 17, color: 'var(--texto)' }}>{PARAMS[param]}: {finito(v) ? f4(v) : 'sin valor'}</h3>
      <h5>Qué significa</h5><p>{ay.sig}</p>
      <h5>Cómo se calculó en este pocillo</h5><p>{ex.calculo}</p>
      <h5>Error estadístico</h5><p>{ex.error}</p><p>{grupo}</p>
      <h5>Cómo interpretarlo</h5><p>{ay.interp}</p>
      {r.aviso && <div className="aviso-sel">Avisos de este pocillo: {r.aviso}</div>}
    </Modal>
  )
}

function MapaPlaca({ s }) {
  const param = s.opts.mapa.param
  const [abierto, setAbierto] = useState(null)
  const vals = Object.fromEntries(s.res.map((r) => [r.Pocillo, r[param]]))
  const fin = Object.values(vals).filter(finito)
  const a = fin.length ? Math.min(...fin) : 0, b = fin.length ? Math.max(...fin) : 1
  const borde = (f, c) => f === 0 || f === 7 || c === 1 || c === 12
  const vb = [], vi = []
  LETRAS.forEach((l, f) => { for (let c = 1; c <= 12; c++) { const v = vals[l + c]; if (finito(v)) (borde(f, c) ? vb : vi).push(v) } })
  const CS = 56
  const W = 40 + 12 * CS + 90, H = 34 + 8 * CS + 10
  return (
    <>
      <div className="fila-ctrl">
        <Campo label="Parámetro"><Select value={param} onChange={(v) => s.setOpt('mapa', 'param', v)} opciones={Object.entries(PARAMS)} /></Campo>
        {vb.length >= 2 && vi.length >= 2 && (
          <span className="ayuda">Promedio en el borde: {g3(media(vb))} | en el interior: {g3(media(vi))} | cociente borde/interior: {(media(vb) / media(vi)).toFixed(2)}</span>
        )}
      </div>
      <div className="placa-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, minWidth: 640 }} fontFamily="'Segoe UI', system-ui, sans-serif">
          <rect width={W} height={H} fill="#fff" />
          {Array.from({ length: 12 }, (_, c) => <text key={c} x={40 + c * CS + CS / 2} y={20} textAnchor="middle" fontSize="12" fill="#6b5d4f">{c + 1}</text>)}
          {LETRAS.map((l, f) => (
            <g key={l}>
              <text x={22} y={34 + f * CS + CS / 2} textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#6b5d4f">{l}</text>
              {Array.from({ length: 12 }, (_, c) => {
                const p = l + (c + 1)
                const v = vals[p]
                const u = finito(v) ? (b > a ? (v - a) / (b - a) : 0.5) : null
                const col = u === null ? '#eeeae3' : viridis(u)
                const txt = u !== null && u > 0.62 ? '#222' : '#fff'
                return (
                  <g key={p} style={finito(v) ? { cursor: 'pointer' } : undefined} onClick={finito(v) ? () => setAbierto(p) : undefined}>
                    <rect x={40 + c * CS + 1} y={34 + f * CS + 1} width={CS - 2} height={CS - 2} rx="3" fill={col}><title>{p}{finito(v) ? `: ${f4(v)}` : ''}</title></rect>
                    {u !== null && <text x={40 + c * CS + CS / 2} y={34 + f * CS + CS / 2} textAnchor="middle" dominantBaseline="central" fontSize="12" fill={u === null ? '#999' : txt}>{g3(v)}</text>}
                  </g>
                )
              })}
            </g>
          ))}
          <defs><linearGradient id="vg" x1="0" y1="1" x2="0" y2="0">{[0, 0.25, 0.5, 0.75, 1].map((u) => <stop key={u} offset={u} stopColor={viridis(u)} />)}</linearGradient></defs>
          <rect x={W - 62} y={44} width={16} height={8 * CS - 40} fill="url(#vg)" />
          <text x={W - 42} y={50} fontSize="11" fill="#6b5d4f">{g3(b)}</text>
          <text x={W - 42} y={34 + 8 * CS - 6} fontSize="11" fill="#6b5d4f">{g3(a)}</text>
        </svg>
      </div>
      <p className="ayuda">Los pocillos del borde (filas A y H, columnas 1 y 12) evaporan más. Si el borde se separa sistemáticamente del interior, desconfiá de esos pocillos. Hacé clic en un pocillo para ver qué significa el valor, cómo se calculó y su error.</p>
      {abierto && <ModalMapa s={s} p={abierto} param={param} onClose={() => setAbierto(null)} />}
    </>
  )
}

// ---------------------------------------------------------------
// Parámetros (resumen por muestra y por pocillo)
// ---------------------------------------------------------------
function Parametros({ s }) {
  const sel = new Set(s.seleccion.map((c) => c.Pocillo))
  const resumen = useMemo(() => {
    const por = {}
    s.res.filter((r) => sel.has(r.Pocillo)).forEach((r) => { (por[r.Muestra] ||= []).push(r) })
    return Object.entries(por).map(([m, rs]) => {
      const fila = { Muestra: m, n: rs.length }
      Object.entries(PARAMS).forEach(([p, et]) => {
        const x = rs.map((r) => r[p]).filter(finito)
        fila[et] = x.length ? (x.length > 1 ? `${g3(media(x))} ± ${g2(desvio(x))}` : g3(x[0])) : ''
      })
      return fila
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.res, s.seleccion])
  const claves = ['n_puntos', 'od0', 'od0_metodo', 'od0_n_base', 'mu_max', 'mu_se', 'td_min', 'td_se_min', 'lag_h', 'lag_tangente_h', 'lag_umbral_h', 'K', 't_K_h', 'od_final', 'delta_od', 'generaciones', 'auc_od', 'auc_ln', 't_umbral_od_h', 't_max_dod_h', 'dod_max', 'mu_spline', 'r2', 'intercepto', 'n_ventana', 't_ini_ventana', 't_fin_ventana', 'ventana_manual', 't_exp_ini', 't_exp_fin', 't_estacionaria', 't_muerte', 'caida_pct', 'aviso']
  const porPoc = useMemo(() => s.res.map((r) => {
    const f = { Pocillo: r.Pocillo, Muestra: r.Muestra, Replica: r.Replica, Incluido: sel.has(r.Pocillo) ? 'Sí' : 'No' }
    claves.forEach((k) => { f[k] = typeof r[k] === 'number' ? (finito(r[k]) ? signif(r[k], 4) : null) : typeof r[k] === 'boolean' ? (r[k] ? 'Sí' : 'No') : r[k] })
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [s.res, s.seleccion])
  const nAv = s.res.filter((r) => r.aviso).length
  const colsRes = ['Muestra', 'n', ...Object.values(PARAMS)]
  const colsPoc = ['Pocillo', 'Muestra', 'Replica', 'Incluido', ...claves]
  return (
    <>
      {nAv > 0 && <div className="aviso-sel">{nAv} de {s.res.length} pocillos tienen avisos (ver la columna «aviso»). Revisalos en «Detalle».</div>}
      <p className="ayuda">El resumen por muestra usa solo las réplicas seleccionadas en «Gráfico». Cada columna numérica tiene un botón <code>▾</code> para filtrar.</p>
      <TablaAvanzada id="resumen_muestras" titulo="Resumen por muestra (media ± SD)" columnas={colsRes} filas={resumen} onVista={s.onVista} />
      <TablaAvanzada id="parametros_pocillos" titulo="Parámetros por pocillo" columnas={colsPoc} filas={porPoc} onVista={s.onVista} />
      <div className="fila-ctrl">
        <button onClick={() => descargarTexto(aCSV(porPoc, colsPoc), 'parametros_crecimiento.csv')}>Descargar parámetros por pocillo (CSV)</button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------
function Modelos({ s }) {
  const sel = s.opts.modelos.sel
  const [trab, setTrab] = useState(null)
  const alternar = (m) => s.setOpt('modelos', 'sel', sel.includes(m) ? sel.filter((x) => x !== m) : [...sel, m])
  const ajustar = async () => {
    const filas = []
    for (let i = 0; i < s.res.length; i++) {
      const r = s.res[i]
      setTrab(`Ajustando modelos: ${r.Pocillo} (${i + 1} de ${s.res.length})`)
      await new Promise((ok) => setTimeout(ok, 0))
      const w = s.pre.proc.find((x) => x.Pocillo === r.Pocillo)
      if (!w) continue
      const o = w.t.map((_, j) => j).sort((a, b) => w.t[a] - w.t[b])
      const t = o.map((j) => w.t[j] / 3600), y = o.map((j) => w.y[j])
      for (const m of sel) {
        const a = ajustarModelo(m, t, y, r.od0, r.mu_max, r.lag_tangente_h, r.K)
        filas.push({ Pocillo: r.Pocillo, Muestra: r.Muestra, Replica: r.Replica, Modelo: MODELOS_ETQ[m], Convergio: a.ok ? 'Sí' : 'No',
          mu_h: signif(a.mu, 4), lambda_h: signif(a.lambda, 4), K: signif(a.K, 4), A_ln: signif(a.A, 4), AIC: signif(a.AIC, 4), BIC: signif(a.BIC, 4), RSS: signif(a.RSS, 4), _aic: a.AIC, _ok: a.ok })
      }
    }
    const pocs = [...new Set(filas.map((f) => f.Pocillo))]
    pocs.forEach((p) => {
      const c = filas.filter((f) => f.Pocillo === p && f._ok && finito(f._aic))
      const mejor = c.sort((a, b) => a._aic - b._aic)[0]
      filas.forEach((f) => { if (f.Pocillo === p) f.Mejor_AIC = f === mejor ? 'Sí' : 'No' })
    })
    s.setModelosRes(filas.map(({ _aic, _ok, ...r }) => r))
    setTrab(null)
  }
  const m = s.modelosRes
  const mejores = m ? m.filter((f) => f.Mejor_AIC === 'Sí') : []
  const cuenta = {}
  mejores.forEach((f) => { cuenta[f.Modelo] = (cuenta[f.Modelo] || 0) + 1 })
  const cols = m && m.length ? Object.keys(m[0]) : []
  return (
    <>
      <p className="ayuda">Ajuste de modelos de crecimiento sobre ln(OD): Gompertz, logístico y Richards (Zwietering) y Baranyi-Roberts. Se parte de los valores estimados por la ventana deslizante. Un ajuste que no converge se informa como tal, no se oculta.</p>
      <div className="fila-ctrl">
        <label style={{ fontWeight: 600 }}>Modelos a ajustar</label>
        {NOMBRES_MODELO.map((k) => (
          <label key={k} className="check"><input type="checkbox" checked={sel.includes(k)} onChange={() => alternar(k)} /><span>{MODELOS_ETQ[k]}</span></label>
        ))}
      </div>
      <div className="fila-ctrl">
        <button className="primario" disabled={!sel.length || !!trab || !s.res.length} onClick={ajustar}>Ajustar a todos los pocillos</button>
        {trab && <span className="ayuda">{trab}</span>}
      </div>
      {m && (
        <>
          <p><b>Mejor modelo por AIC (pocillos): </b>{Object.keys(cuenta).length ? Object.entries(cuenta).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'ningún ajuste convergió'}. Ajustes convergidos: {m.filter((f) => f.Convergio === 'Sí').length} de {m.length}.</p>
          <TablaAvanzada id="modelos" titulo="Ajuste de modelos" columnas={cols} filas={m} onVista={s.onVista} />
          <div className="fila-ctrl"><button onClick={() => descargarTexto(aCSV(m, cols), 'ajuste_modelos.csv')}>Descargar ajustes (CSV)</button></div>
        </>
      )}
    </>
  )
}

// ===============================================================
// ANÁLISIS
// ===============================================================
export function AnalisisTab({ s }) {
  const [sub, setSub] = useState('par')
  const { aj, setAj } = s
  if (!s.datos) return <Vacio texto="Primero cargá el archivo del lector en la pestaña Archivo." />
  if (!s.config.length) return <Vacio texto="Configurá los pocillos para analizar el crecimiento." />
  if (s.pre?.error) return <Vacio texto={s.pre.error} />
  if (!s.res?.length) return <Vacio texto="No hay pocillos (sin blanco ni excluidos) para analizar." />
  return (
    <div className="con-lateral">
      <Panel titulo="Parámetros del análisis">
        <h3>μmax por ventana deslizante de ln(OD)</h3>
        <Campo label="Ancho de la ventana (h)"><Num value={aj.an_ancho} min={0.1} step={0.25} onChange={(v) => setAj('an_ancho', v)} /></Campo>
        <Campo label="Puntos mínimos por ventana"><Num value={aj.an_minpts} min={3} onChange={(v) => setAj('an_minpts', v)} /></Campo>
        <Campo label="OD mínima para usar ln"><Num value={aj.an_lnmin} min={0} step={0.005} onChange={(v) => setAj('an_lnmin', v)} /></Campo>
        <Campo label="R² mínimo de la ventana"><Num value={aj.an_r2} min={0} max={1} step={0.005} onChange={(v) => setAj('an_r2', v)} /></Campo>
        <Check label="Calcular también μmax por spline (no paramétrico)" checked={aj.an_spline} onChange={(v) => setAj('an_spline', v)} />
        <h3>Lag</h3>
        <Select value={aj.an_lag_metodo} onChange={(v) => setAj('an_lag_metodo', v)}
          opciones={[['tangente', 'Tangente en μmax (intersección con ln OD₀)'], ['umbral', 'Tiempo hasta alcanzar un múltiplo de OD₀']]} />
        {aj.an_lag_metodo === 'umbral' && <Campo label="Múltiplo de OD₀"><Num value={aj.an_lag_factor} min={1.1} step={0.1} onChange={(v) => setAj('an_lag_factor', v)} /></Campo>}
        <h3>Fases</h3>
        <Campo label="Exponencial: ventanas con μ ≥ esta fracción de μmax"><Num value={aj.an_frac_exp} min={0.1} max={1} step={0.05} onChange={(v) => setAj('an_frac_exp', v)} /></Campo>
        <Campo label="Estacionaria: empieza cuando μ < esta fracción de μmax"><Num value={aj.an_frac_est} min={0} max={0.9} step={0.05} onChange={(v) => setAj('an_frac_est', v)} /></Campo>
        <Campo label="Muerte: caída desde K mayor que (%)"><Num value={aj.an_muerte_pct} min={1} max={100} onChange={(v) => setAj('an_muerte_pct', v)} /></Campo>
        <Campo label="OD umbral para «tiempo hasta OD»"><Num value={aj.an_umbral_od} min={0} step={0.05} onChange={(v) => setAj('an_umbral_od', v)} /></Campo>
        <h3>Muestras</h3>
        <SelectorMuestras s={s} />
        <details className="ayuda-det">
          <summary>Cómo interpretar los resultados</summary>
          <ul>
            <li>μmax: pendiente máxima de ln(OD) vs tiempo. Tiempo de duplicación = ln2/μmax.</li>
            <li>Lag λ: tiempo hasta que la tangente en μmax cruza la OD inicial.</li>
            <li>K: OD máxima alcanzada. Cerca de OD 1 el lector deja de ser lineal.</li>
            <li>AUC: resume lag, velocidad y rendimiento en un solo número.</li>
            <li>Con OD muy baja domina el ruido; subí la «OD mínima para ln» si μmax parece inflado.</li>
            <li>R² bajo, pendiente no positiva o lag negativo aparecen en la columna «aviso».</li>
            <li>Los valores dependen del organismo, medio, temperatura y volumen del pocillo: compará siempre contra un control en la misma placa.</li>
          </ul>
        </details>
      </Panel>
      <div className="principal">
        <div className="subtabs">
          {[['par', 'Parámetros'], ['det', 'Detalle'], ['mapa', 'Mapa de placa'], ['mod', 'Modelos']].map(([id, t]) => (
            <button key={id} className={sub === id ? 'on' : ''} onClick={() => setSub(id)}>{t}</button>
          ))}
        </div>
        {sub === 'par' && <Parametros s={s} />}
        {sub === 'det' && <Detalle s={s} />}
        {sub === 'mapa' && <MapaPlaca s={s} />}
        {sub === 'mod' && <Modelos s={s} />}
      </div>
    </div>
  )
}
