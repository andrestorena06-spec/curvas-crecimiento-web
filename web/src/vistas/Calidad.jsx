import { useMemo, useState } from 'react'
import { finito } from '../motor/analisis.js'
import { clavePunto, nombreReplica, r3 } from '../motor/pipeline.js'
import { useTema, rellenoPocillo } from '../tema.js'
import { Campo, Check, Encabezado, Icono, Modal, Num, Seg, Sel, Vacio } from '../ui/base.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { LETRAS, fx, ordenPocillo } from '../utils.js'
import { VistaCalidadPlacas } from './CalidadPlacas.jsx'
import { BotonCinta, Cajon, Cinta, Grupo, Mosaico, OpcionesCinta, CampoCinta } from '../ui/cinta.jsx'

const CHIP_CAT = { OK: 'ok', Sospechoso: 'peligro', Divergentes: 'aviso', Ruidoso: 'aviso', Excluido: '', 'Sin réplicas': 'acento', Blanco: '', 'Sin datos': '' }
const nombreSerie = (e) => (e.origenOd === 'tecan' ? 'pocillo' : 'serie')

// ---------- ajustes ----------
export function AjustesCalidad({ s }) {
  const { exp, setAj } = s
  const aj = exp.aj
  const blancos = s.serie.config.filter((c) => c.EsBlanco)
  return (
    <div className="tarjeta ajustes">
      {exp.origenOd === 'tecan' && (<>
        <h3>Blanco</h3>
        <Check label="Restar el blanco" checked={aj.corregir_blanco} onChange={(v) => setAj('corregir_blanco', v)} />
        {aj.corregir_blanco && (<>
          <Campo label="Cómo se resta">
            <Sel value={aj.blanco_metodo} onChange={(v) => setAj('blanco_metodo', v)} opciones={[['tiempo', 'Promedio de los blancos, tiempo a tiempo'], ['const_media', 'Constante: media de todo el blanco'], ['const_min', 'Constante: mínimo del blanco']]} />
          </Campo>
          {blancos.length ? blancos.map((b) => {
            const us = exp.blancosSel || blancos.map((x) => x.Pocillo)
            return <Check key={b.Pocillo} label={`${b.Pocillo} · ${b.Muestra}`} checked={us.includes(b.Pocillo)}
              onChange={() => s.upd({ blancosSel: us.includes(b.Pocillo) ? us.filter((x) => x !== b.Pocillo) : [...us, b.Pocillo] })} />
          }) : <p className="aviso-caja">No hay pocillos de blanco. Marcalos en «Pocillos».</p>}
        </>)}
      </>)}
      {exp.origenOd === 'placas' && <p className="aviso-caja info">El blanco de cada placa se define y se resta en «Placas por tiempo».</p>}
      {exp.origenOd === 'cubeta' && <p className="aviso-caja info">El blanco y las diluciones de la cubeta se aplican en «Lecturas de OD».</p>}

      <h3>Puntos aberrantes</h3>
      <Check label="Filtro de Hampel (dentro de cada curva)" checked={aj.hampel_on} onChange={(v) => setAj('hampel_on', v)}
        ayuda={exp.origenOd === 'tecan' ? 'Recomendado para cinéticas: detecta picos (burbujas, condensación).' : exp.origenOd === 'placas' ? 'No corresponde aquí: cada placa es un instante y los pocillos no forman curvas propias. Usá Dixon.' : 'Necesita curvas con muchas lecturas; con pocas lecturas conviene Dixon.'} />
      {aj.hampel_on && (<>
        <div className="fila">
          <Campo label="Semiventana (puntos)"><Num value={aj.hampel_k} onChange={(v) => setAj('hampel_k', v)} ancho={80} /></Campo>
          <Campo label="Umbral (× MAD)"><Num value={aj.hampel_sigma} onChange={(v) => setAj('hampel_sigma', v)} ancho={80} /></Campo>
        </div>
        <Campo label="Diferencia mínima para marcar (OD)" ayuda="Piso en unidades de OD: evita marcar desvíos minúsculos cuando la curva es muy lisa."><Num value={aj.hampel_min} onChange={(v) => setAj('hampel_min', v)} /></Campo>
        <Campo label="Puntos marcados"><Sel value={aj.hampel_accion} onChange={(v) => setAj('hampel_accion', v)} opciones={[['excluir', 'Excluirlos'], ['interpolar', 'Reemplazarlos por interpolación']]} /></Campo>
      </>)}
      <Campo label="Entre réplicas de cada tiempo" ayuda="Dixon: 3 a 10 réplicas (Grubbs con más). RSD: si la desviación estándar relativa supera el límite, sale la réplica más alejada de la media.">
        <Seg value={!aj.dixon_on ? 'no' : aj.od_atip_metodo || 'q'} onChange={(v) => { setAj('dixon_on', v !== 'no'); if (v !== 'no') setAj('od_atip_metodo', v) }} opciones={[['no', 'Ninguno'], ['q', 'Dixon'], ['cv', 'RSD']]} />
      </Campo>
      {aj.dixon_on && (aj.od_atip_metodo || 'q') === 'q' && <Campo label="Confianza"><Seg value={String(aj.dixon_conf)} onChange={(v) => setAj('dixon_conf', Number(v))} opciones={[['90', '90 %'], ['95', '95 %'], ['99', '99 %']]} /></Campo>}
      {aj.dixon_on && aj.od_atip_metodo === 'cv' && <Campo label="RSD máximo (%)"><Num value={aj.od_cvmax ?? 20} onChange={(v) => setAj('od_cvmax', v)} /></Campo>}
      <Check label="Excluir OD por encima de un máximo confiable" checked={aj.odmax_on} onChange={(v) => setAj('odmax_on', v)} />
      {aj.odmax_on && <Campo label="OD máxima confiable"><Num value={aj.odmax} onChange={(v) => setAj('odmax', v)} /></Campo>}

      {!s.porCepa && (<>
      <h3>Réplicas que no concuerdan</h3>
      <div className="fila">
        <Campo label="Factor de desvío"><Num value={aj.pocillo_factor} onChange={(v) => setAj('pocillo_factor', v)} ancho={80} /></Campo>
        <Campo label="Desvío mínimo (OD)"><Num value={aj.pocillo_min} onChange={(v) => setAj('pocillo_min', v)} ancho={80} /></Campo>
      </div>
      <Campo label="Con 2 réplicas: diferencia de AUC (%)"><Num value={aj.pocillo_div} onChange={(v) => setAj('pocillo_div', v)} /></Campo>
      <Check label="Excluir solos los «Sospechosos»" checked={aj.pocillo_auto} onChange={(v) => setAj('pocillo_auto', v)} />
      </>)}

      <h3>Procesado</h3>
      <Campo label="OD inicial (OD₀)"><Sel value={aj.od0_metodo} onChange={(v) => setAj('od0_metodo', v)} opciones={[['auto', 'Automática (meseta inicial, tres fases)'], ['primeros', 'Media de los primeros N puntos']]} /></Campo>
      <Campo label="N puntos iniciales"><Num value={aj.n_od0} onChange={(v) => setAj('n_od0', v)} /></Campo>
      {!s.porCepa && (<>
      <Campo label="Suavizado"><Sel value={aj.suavizado} onChange={(v) => setAj('suavizado', v)} opciones={[['ninguno', 'Ninguno'], ['media', 'Media móvil'], ['mediana', 'Mediana móvil'], ['loess', 'LOESS']]} /></Campo>
      {(aj.suavizado === 'media' || aj.suavizado === 'mediana') && <Campo label="Ventana (puntos, impar)"><Num value={aj.suav_k} onChange={(v) => setAj('suav_k', v)} /></Campo>}
      {aj.suavizado === 'loess' && <Campo label="Span (0 a 1)"><Num value={aj.suav_span} onChange={(v) => setAj('suav_span', v)} /></Campo>}
      <Campo label="Normalizar"><Sel value={aj.normalizar} onChange={(v) => setAj('normalizar', v)} opciones={[['ninguna', 'Sin normalizar'], ['restar', 'Restar OD₀'], ['dividir', 'Dividir por OD₀']]} /></Campo>
      </>)}
      {s.porCepa && (<>
        <h3>Curva de cada cepa</h3>
        <Seg value={s.modoCurva} onChange={(v) => setAj('placas_curva', v)} opciones={[['media', 'Promediada'], ['puntos', 'Sin promediar']]} />
        <p className="ayuda" style={{ marginTop: 8 }}>{s.modoCurva === 'media' ? 'Cada placa es un tiempo: la curva de la cepa es la media de sus pocillos en cada tiempo.' : 'Cada placa es un tiempo: μmax, su error, OD₀ y lag salen de la regresión con todos los pocillos de todos los tiempos; K y AUC, de la curva media.'}</p>
      </>)}
    </div>
  )
}

// ---------- puntos de un pocillo con su estado ----------
function puntosDe(s, p) {
  const { datos } = s.serie
  const ys = datos.pocillos[p] || []
  const man = new Set(s.exp.E.puntosExcl), forz = new Set(s.exp.E.forzados)
  const w = s.pre.marcado.find((x) => x.Pocillo === p)
  const mapa = new Map(w ? w.filas.map((f) => [r3(f.t), f]) : [])
  const out = []
  datos.tiempos.forEach((t, i) => {
    let v = ys[i]
    if (!finito(v)) return
    const f = mapa.get(r3(t))
    if (f) v = f.yAntes
    else if (s.pre.blanco) { const b = s.pre.blanco.prom.get(r3(t)); if (b === undefined) return; v -= b }
    const k = clavePunto(p, t)
    let estado = 'En el análisis', detalle = ''
    if (f && f.motivo) { estado = f.motivo; detalle = f.detalle }
    if (f && f.marca && forz.has(k)) { estado = 'Reincorporado a mano'; detalle = `El filtro lo había marcado: ${f.detalle}` }
    if (man.has(k)) { estado = 'Excluido a mano'; detalle = 'Excluido con un clic. Otro clic lo reincorpora.' }
    out.push({ t, v, k, estado, detalle })
  })
  return out
}
const ESTILO_EST = (T) => ({
  'Reincorporado a mano': { color: T.aviso, forma: 'anillo' }, 'Aberrante (interpolado)': { color: T.aviso, forma: 'o' },
  'Aberrante (Hampel)': { color: T.peligro, forma: 'x' }, 'Aberrante (Dixon)': { color: T.peligro, forma: 'x' }, 'Aberrante (RSD)': { color: T.peligro, forma: 'x' },
  'OD sobre el máximo': { color: T.peligro, forma: 'x' }, 'Excluido a mano': { color: T.sec, forma: 'x' },
})

// ---------- ventana emergente de un pocillo ----------
export function ModalPocillo({ s, p, onClose }) {
  const T = useTema()
  const [ln, setLn] = useState(false)
  const [otras, setOtras] = useState(true)
  const c = s.serie.config.find((x) => x.Pocillo === p)
  const pts = puntosDe(s, p)
  const tr = (v) => (ln ? Math.log(v) : v)
  const ok = (v) => finito(v) && (!ln || v > 0)
  const est = s.estilos[p] || { color: T.acento }
  const usados = pts.filter((q) => ['En el análisis', 'Reincorporado a mano', 'Aberrante (interpolado)'].includes(q.estado))
  const series = []
  if (otras && c) s.serie.config.filter((x) => x.Muestra === c.Muestra && !x.EsBlanco && x.Pocillo !== p).forEach((x) => {
    const w = s.pre.pre.find((y) => y.Pocillo === x.Pocillo)
    if (w) series.push({ id: 'o' + x.Pocillo, nombre: '', color: s.estilos[x.Pocillo]?.color || T.sec, opacidad: 0.45, ancho: 1.2,
      data: w.filas.filter((f) => ok(f.y)).map((f) => ({ x: f.t / 3600, y: tr(f.y), tip: `${nombreReplica(x.Muestra, x.Replica)} (${x.Pocillo})\nt = ${fx(f.t / 3600, 2)} h · ${fx(tr(f.y), 3)}` })) })
  })
  if (series.length) series.unshift({ id: 'ley-otras', nombre: 'Otras réplicas', color: T.sec, opacidad: 0.6, ancho: 1.2, data: [] })
  series.push({ id: 'p', nombre: c ? nombreReplica(c.Muestra, c.Replica) : p, color: est.color, ancho: 2, puntos: true, radio: 3,
    data: usados.filter((q) => ok(q.v)).map((q) => ({ x: q.t / 3600, y: tr(q.v), key: q.k, tip: `${q.estado}\nt = ${fx(q.t / 3600, 2)} h\n${ln ? 'ln(OD)' : 'OD'} = ${fx(tr(q.v), 4)}\nClic para excluir` })) })
  const E = ESTILO_EST(T)
  const extras = pts.filter((q) => !['En el análisis'].includes(q.estado) && ok(q.v) && q.estado !== 'Reincorporado a mano').map((q) => ({
    x: q.t / 3600, y: tr(q.v), key: q.k, ...(E[q.estado] || { color: T.peligro, forma: 'x' }),
    tip: `${q.estado}\nt = ${fx(q.t / 3600, 2)} h · ${ln ? 'ln(OD)' : 'OD'} = ${fx(tr(q.v), 4)}${q.detalle ? '\n' + q.detalle : ''}\nClic para reincorporar`,
  }))
  pts.filter((q) => q.estado === 'Reincorporado a mano' && ok(q.v)).forEach((q) => extras.push({ x: q.t / 3600, y: tr(q.v), key: q.k, ...E['Reincorporado a mano'], tip: `${q.estado}\n${q.detalle}\nClic para volver a excluirlo` }))
  const fuera = s.pre.fuera.has(p)
  const noUsados = pts.filter((q) => q.estado !== 'En el análisis')
  const qc = s.pre.qc.find((q) => q.Pocillo === p)
  return (
    <Modal titulo={<>{c ? nombreReplica(c.Muestra, c.Replica) : p} <span className="chip" style={{ marginLeft: 6 }}>{s.exp.origenOd === 'tecan' ? `Pocillo ${p}` : `Serie ${c?.Muestra} · réplica ${c?.Replica}`}</span>
      {qc && <span className={`chip ${CHIP_CAT[qc.Categoria]}`} style={{ marginLeft: 6 }}>{fuera ? 'Excluido del análisis' : qc.Categoria}</span>}</>} onClose={onClose} ancho={980}
      pie={<>
        <button disabled={!noUsados.length} onClick={() => s.reincorporarPocillo(p)}><Icono n="refrescar" size={15} />Reincorporar todos los puntos</button>
        <button className="peligro" onClick={() => s.alternarPocillo(p)}>{s.exp.E.pocillosExcl.includes(p) ? (s.exp.origenOd === 'tecan' ? 'Reincorporar el pocillo' : 'Reincorporar la serie') : (s.exp.origenOd === 'tecan' ? 'Excluir el pocillo completo' : 'Excluir la serie completa')}</button>
        <span className="espacio" />
        <button className="primario" onClick={onClose}>Listo</button>
      </>}>
      <div className="fila" style={{ marginBottom: 6 }}>
        <Seg value={ln ? 'ln' : 'od'} onChange={(v) => setLn(v === 'ln')} opciones={[['od', 'OD'], ['ln', 'ln(OD)']]} />
        <Check label="Mostrar las otras réplicas de la cepa" checked={otras} onChange={setOtras} />
        <span className="espacio" />
        <span className="ayuda">Clic en un punto: lo excluye o lo reincorpora.</span>
      </div>
      <Grafico series={series} extras={extras} yTxt={ln ? 'ln(OD)' : 'OD (blanco restado)'} alto={340} estilo={s.estiloGrafico('pocillo')} idEstilo="pocillo" onPuntoClick={s.alternarPunto} nombre={s.exp.origenOd === 'tecan' ? `pocillo_${p}` : `serie_${c?.Muestra}_r${c?.Replica}`} />
      {qc && <p className="ayuda" style={{ marginTop: 8 }}><b>Control de calidad:</b> {qc.Estado}</p>}
      <h4>Puntos fuera del análisis ({noUsados.length})</h4>
      {!noUsados.length ? <p className="ayuda">Todos los puntos de este {nombreSerie(s.exp)} están en el análisis.</p> : (
        <div className="tabla-scroll" style={{ maxHeight: 220 }}><table className="tabla">
          <thead><tr><th className="num">Tiempo (h)</th><th className="num">OD</th><th>Estado</th><th>Motivo</th><th /></tr></thead>
          <tbody>{noUsados.map((q) => (
            <tr key={q.k}><td className="num">{fx(q.t / 3600, 2)}</td><td className="num">{fx(q.v, 4)}</td><td>{q.estado}</td><td style={{ whiteSpace: 'normal', minWidth: 300 }}>{q.detalle}</td>
              <td><button className="chico" onClick={() => s.alternarPunto(q.k)}>{q.estado === 'Reincorporado a mano' ? 'Excluir' : 'Reincorporar'}</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Modal>
  )
}

// ---------- placa con las curvas de cada pocillo ----------
function VistaPlaca({ s, onAbrir }) {
  const T = useTema()
  const [hover, setHover] = useState(null)
  const m = useMemo(() => {
    const todos = s.pre.marcado.flatMap((w) => w.filas.filter((f) => finito(f.yAntes)))
    if (!todos.length) return null
    const ts = todos.map((f) => f.t / 3600), ys = todos.map((f) => f.yAntes)
    const a = Math.min(...ys), b = Math.max(...ys)
    return { t0: Math.min(...ts), t1: Math.max(...ts), y0: a - (b - a) * 0.06, y1: b + (b - a) * 0.06 }
  }, [s.pre])
  if (!m) return <Vacio>No hay datos para mostrar.</Vacio>
  const CW = 100, CH = 70, L = 24, TOP = 20
  const W = L + 12 * CW + 4, H = TOP + 8 * CH + 26
  const px = (t, c) => L + c * CW + 5 + ((t - m.t0) / (m.t1 - m.t0 || 1)) * (CW - 10)
  const py = (y, f) => TOP + f * CH + 16 + (1 - (y - m.y0) / (m.y1 - m.y0 || 1)) * (CH - 22)
  const porPoc = Object.fromEntries(s.pre.marcado.map((w) => [w.Pocillo, w]))
  const qc = Object.fromEntries(s.pre.qc.map((q) => [q.Pocillo, q]))
  return (
    <div className="placa-wrap" style={{ position: 'relative' }}>
      {hover && <div className="tip-graf" style={{ left: hover.x + 14, top: hover.y + 8 }}>{hover.t}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 720, display: 'block' }} fontFamily="'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"
        onMouseLeave={() => setHover(null)}>
        {Array.from({ length: 12 }, (_, c) => <text key={c} x={L + c * CW + CW / 2} y={13} textAnchor="middle" fontSize="11" fill={T.sec}>{c + 1}</text>)}
        {LETRAS.map((f, i) => <text key={f} x={10} y={TOP + i * CH + CH / 2} textAnchor="middle" dominantBaseline="central" fontSize="11" fill={T.sec}>{f}</text>)}
        {LETRAS.map((f, fi) => Array.from({ length: 12 }, (_, c) => {
          const p = f + (c + 1)
          const w = porPoc[p]
          const x0 = L + c * CW, y0 = TOP + fi * CH
          const fuera = s.pre.fuera.has(p)
          const col = s.estilos[p]?.color || T.sec
          const q = qc[p]
          const alerta = q && ['Sospechoso', 'Divergentes', 'Ruidoso'].includes(q.Categoria)
          const marcados = w ? w.filas.filter((r) => r.motivo).length : 0
          const manuales = s.exp.E.puntosExcl.filter((k) => k.startsWith(p + '|')).length
          return (
            <g key={p} style={w ? { cursor: 'pointer' } : undefined} onClick={w ? () => onAbrir(p) : undefined}
              onMouseMove={(e) => {
                if (!w) return setHover(null)
                const r = e.currentTarget.ownerSVGElement.getBoundingClientRect()
                setHover({ x: e.clientX - r.left, y: e.clientY - r.top, t: `${nombreReplica(w.Muestra, w.Replica)}${s.exp.origenOd === 'tecan' ? ` (${p})` : ''}${w.EsBlanco ? ' · blanco' : ''}\n${fuera ? 'Excluido del análisis' : q?.Estado || ''}${marcados + manuales ? `\n${marcados + manuales} puntos fuera` : ''}\nClic para ampliar` })
              }}>
              <rect x={x0 + 2} y={y0 + 2} width={CW - 4} height={CH - 4} rx="8" fill={w ? (fuera ? T.fondo : rellenoPocillo(col, { ...T, mezcla: T.mezcla + 0.22 })) : T.pocilloVacio}
                stroke={alerta && !fuera ? (q.Categoria === 'Sospechoso' ? T.peligro : T.aviso) : T.borde} strokeWidth={alerta && !fuera ? 1.6 : 1} />
              {w && (<>
                <polyline fill="none" strokeWidth="1.5" stroke={fuera ? T.eje : col} strokeDasharray={w.EsBlanco ? '2 2' : undefined} strokeLinejoin="round"
                  points={w.filas.filter((r) => finito(r.yAntes) && !r.motivo).map((r) => `${px(r.t / 3600, c).toFixed(1)},${py(r.yAntes, fi).toFixed(1)}`).join(' ')} />
                {w.filas.filter((r) => r.motivo && finito(r.yAntes)).map((r, i) => {
                  const X = px(r.t / 3600, c), Y = py(r.yAntes, fi)
                  return <path key={i} d={`M${X - 2.6},${Y - 2.6}L${X + 2.6},${Y + 2.6}M${X - 2.6},${Y + 2.6}L${X + 2.6},${Y - 2.6}`} stroke={T.peligro} strokeWidth="1.4" />
                })}
                <text x={x0 + 8} y={y0 + 13} fontSize="9.5" fill={fuera ? T.eje : T.texto}>{nombreReplica(w.Muestra, w.Replica).slice(0, 15)}</text>
                {marcados + manuales > 0 && <text x={x0 + CW - 8} y={y0 + 13} fontSize="9" textAnchor="end" fill={T.peligro}>✕{marcados + manuales}</text>}
              </>)}
            </g>
          )
        }))}
        <text x={L + 6 * CW} y={H - 6} textAnchor="middle" fontSize="11" fill={T.sec}>
          Tiempo {fx(m.t0, 1)} a {fx(m.t1, 1)} h · eje Y común de {fx(m.y0, 2)} a {fx(m.y1, 2)} OD · ✕ puntos fuera del análisis · borde rojo: sospechoso · ámbar: divergente o ruidoso
        </text>
      </svg>
    </div>
  )
}

// ---------- cubeta: una curva por cepa con sus réplicas (no hay pocillos) ----------
function VistaCepas({ s, onAbrir }) {
  const T = useTema()
  const est = ESTILO_EST(T)
  const cepas = [...new Set(s.serie.config.filter((c) => !c.EsBlanco).map((c) => c.Muestra))]
  const qc = Object.fromEntries(s.pre.qc.map((q) => [q.Pocillo, q]))
  return (
    <div className="grilla-cepas">
      {cepas.map((m) => {
        const reps = s.serie.config.filter((c) => c.Muestra === m && !c.EsBlanco).sort((a, b) => a.Replica - b.Replica)
        const series = [], extras = []
        reps.forEach((c) => {
          const fuera = s.pre.fuera.has(c.Pocillo)
          const pts = puntosDe(s, c.Pocillo)
          const color = s.estilos[c.Pocillo]?.color || s.colores[m]
          series.push({ id: c.Pocillo, nombre: `Réplica ${c.Replica}`, color, dash: fuera ? '4 4' : undefined, opacidad: fuera ? 0.35 : 1, ancho: 1.6, puntos: true, radio: 3,
            data: pts.filter((q) => !est[q.estado]).map((q) => ({ x: q.t / 3600, y: q.v, key: q.k, tip: `${m} · réplica ${c.Replica}\nt = ${fx(q.t / 3600, 2)} h · OD ${fx(q.v, 3)}\nClic para excluir el punto` })) })
          pts.filter((q) => est[q.estado]).forEach((q) => extras.push({ x: q.t / 3600, y: q.v, key: q.k, ...est[q.estado], tip: `${m} · réplica ${c.Replica}\n${q.estado}${q.detalle ? '\n' + q.detalle : ''}\nClic para cambiar` }))
        })
        return (
          <div key={m} className="mosaico">
            <div className="mosaico-cab"><h2><i className="punto" style={{ background: s.colores[m], marginRight: 6 }} />{m}</h2></div>
            <Grafico series={series} extras={extras} yTxt="OD" alto={240} estilo={s.estiloGrafico('cepaCubeta')} idEstilo="cepaCubeta" onPuntoClick={s.alternarPunto} nombre={`cubeta_${m}`} />
            <div className="fila" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {reps.map((c) => {
                const q = qc[c.Pocillo], fuera = s.pre.fuera.has(c.Pocillo)
                return <button key={c.Pocillo} className={`chico chip-boton ${fuera ? 'apagado' : ''}`} onClick={() => onAbrir(c.Pocillo)} data-tip={q?.Estado}>
                  Réplica {c.Replica} · <span className={`chip ${fuera ? '' : CHIP_CAT[q?.Categoria] || ''}`}>{fuera ? 'Excluida' : q?.Categoria || '—'}</span>
                </button>
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- tabla por pocillo ----------
function TablaQC({ s, onAbrir }) {
  const q = [...s.pre.qc].sort((a, b) => ordenPocillo(a.Pocillo) - ordenPocillo(b.Pocillo))
  return (
    <div className="tabla-scroll alta">
      <table className="tabla">
        <thead><tr><th>{s.exp.origenOd === 'tecan' ? 'Pocillo' : 'Serie'}</th><th>Cepa</th><th className="num">Réplica</th><th>Estado</th>
          <th className="num" data-tip="Desvío medio |OD − mediana de las réplicas| en cada tiempo">Desvío vs réplicas</th><th className="num">Razón</th><th className="num">Dif. AUC %</th>
          <th className="num">Aberrantes</th><th className="num">OD alta</th><th>Puntos quitados</th><th /></tr></thead>
        <tbody>
          {q.map((r) => {
            const fuera = s.pre.fuera.has(r.Pocillo)
            return (
              <tr key={r.Pocillo} className={fuera ? 'fuera' : ''}>
                <td><b>{s.exp.origenOd === 'tecan' ? r.Pocillo : `${r.Muestra} · réplica ${r.Replica}`}</b></td><td>{r.Muestra}</td><td className="num">{r.Replica}</td>
                <td><span className={`chip ${CHIP_CAT[r.Categoria] || ''}`} data-tip={r.Estado}>{fuera ? (s.pre.auto.includes(r.Pocillo) ? 'Excluido (automático)' : 'Excluido') : r.Categoria}</span></td>
                <td className="num">{fx(r.d_mediana, 4)}</td><td className="num">{fx(r.ratio, 1)}</td><td className="num">{fx(r.dif_pct, 0)}</td>
                <td className="num">{r.Pts_aberrantes}</td><td className="num">{r.Pts_OD_alta}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 340, fontSize: 12 }}>{r.Puntos_quitados}</td>
                <td><div className="fila" style={{ flexWrap: 'nowrap' }}>
                  <button className="chico" onClick={() => onAbrir(r.Pocillo)}>Ver</button>
                  <button className="chico" onClick={() => s.alternarPocillo(r.Pocillo)}>{s.exp.E.pocillosExcl.includes(r.Pocillo) ? 'Reincorporar' : 'Excluir'}</button>
                </div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Calidad({ s }) {
  const [vista, setVista] = useState(s.exp.origenOd === 'tecan' ? 'placa' : 'cepas')
  const [abierto, setAbierto] = useState(null)
  const [ajustes, setAjustes] = useState(false)
  const { pre, exp, setAj } = s
  const aj = exp.aj
  const sinDatos = !s.serie.datos || !s.serie.config.length
  const irDatos = { tecan: 'placa', placas: 'placas', cubeta: 'lecturas' }[exp.origenOd]
  const marcados = pre && !pre.error ? pre.marcado.reduce((n, w) => n + w.filas.filter((f) => f.motivo).length, 0) : 0
  const cuenta = (cat) => (pre && !pre.error ? pre.qc.filter((q) => q.Categoria === cat).length : 0)
  return (
    <div className="pagina">
      {!s.porCepa && (
        <Cinta>
          {exp.origenOd === 'tecan' && (
            <Grupo titulo="Blanco">
              <BotonCinta simbolo="−B" texto="Restar blanco" activo={aj.corregir_blanco} onClick={() => setAj('corregir_blanco', !aj.corregir_blanco)} />
            </Grupo>
          )}
          <Grupo titulo="Puntos aberrantes">
            <BotonCinta simbolo="H" texto="Hampel" activo={aj.hampel_on} onClick={() => setAj('hampel_on', !aj.hampel_on)} tip={'Filtro de Hampel\nDetecta picos dentro de cada curva (burbujas, condensación)'} />
            <BotonCinta simbolo="≤" texto="OD máxima" activo={aj.odmax_on} onClick={() => setAj('odmax_on', !aj.odmax_on)} tip={`Excluir OD mayores que ${aj.odmax}`} />
          </Grupo>
          <Grupo titulo="Entre réplicas (cada tiempo)">
            <OpcionesCinta valor={!aj.dixon_on ? 'no' : aj.od_atip_metodo || 'q'} onChange={(v) => { setAj('dixon_on', v !== 'no'); if (v !== 'no') setAj('od_atip_metodo', v) }}
              opciones={[['no', 'Ninguno', '·', null, 'No comparar las réplicas entre sí'], ['q', 'Dixon', 'Q', null, 'Test Q de Dixon (Grubbs con más de 10 réplicas)'], ['cv', 'RSD', '%', null, 'Desviación estándar relativa (CV %): si las réplicas de un tiempo la superan, sale la más alejada de la media']]} />
            {aj.dixon_on && (aj.od_atip_metodo || 'q') === 'q' && <CampoCinta etiqueta="Confianza"><Sel value={String(aj.dixon_conf || 95)} onChange={(v) => setAj('dixon_conf', Number(v))} opciones={[['90', '90 %'], ['95', '95 %'], ['99', '99 %']]} /></CampoCinta>}
            {aj.dixon_on && aj.od_atip_metodo === 'cv' && <CampoCinta etiqueta="RSD máx. (%)"><Num value={aj.od_cvmax ?? 20} onChange={(v) => setAj('od_cvmax', v)} ancho={56} /></CampoCinta>}
          </Grupo>
          <Grupo titulo="Réplicas sospechosas">
            <BotonCinta icono="escudo" texto="Excluir solas" activo={aj.pocillo_auto} onClick={() => setAj('pocillo_auto', !aj.pocillo_auto)} />
          </Grupo>
          <Grupo titulo="Ver">
            <OpcionesCinta valor={vista} onChange={setVista} opciones={exp.origenOd === 'tecan' ? [['placa', 'Placa', null, 'placa'], ['tabla', 'Tabla', null, 'tabla']] : [['cepas', 'Por cepa', null, 'curva'], ['tabla', 'Tabla', null, 'tabla']]} />
          </Grupo>
          <Grupo titulo="Detalle">
            <BotonCinta icono="editar" texto="Todos los ajustes" activo={ajustes} onClick={() => setAjustes(!ajustes)} />
          </Grupo>
        </Cinta>
      )}
      <Encabezado titulo="Calidad OD" sub={s.porCepa ? 'Cada placa es un tiempo. En cada una se promedian los blancos aceptados y ese valor se resta a cada lectura; después se comparan los pocillos de cada cepa entre sí. Nada se borra: todo se puede revertir con un clic.' : 'Blanco, puntos aberrantes (Hampel dentro de cada curva; Dixon o RSD entre réplicas) y réplicas que no concuerdan. Nada se borra: todo se puede revertir con un clic.'} />
      {s.serie.avisos.map((a, i) => <div key={i} className="aviso-caja">{a}</div>)}
      {sinDatos ? <Vacio titulo="Todavía no hay curvas" accion={<button className="primario" onClick={() => s.irA(irDatos)}>Ir a cargar los datos</button>}>Cargá los datos y definí las cepas para ver el control de calidad.</Vacio> : s.porCepa ? <VistaCalidadPlacas s={s} /> : (
        pre?.error ? <div className="aviso-caja error">{pre.error}</div> : pre && (<>
          {vista === 'cepas' && exp.origenOd !== 'tecan' ? <VistaCepas s={s} onAbrir={setAbierto} /> : (
          <Mosaico titulo={vista === 'placa' && exp.origenOd === 'tecan' ? 'Placa con la curva de cada pocillo' : `Tabla por ${nombreSerie(exp)}`}>
            {vista === 'placa' && exp.origenOd === 'tecan' ? <VistaPlaca s={s} onAbrir={setAbierto} /> : <TablaQC s={s} onAbrir={setAbierto} />}
          </Mosaico>)}
        </>)
      )}
      <Cajon titulo="Ajustes del control de calidad" abierto={ajustes && !s.porCepa} onClose={() => setAjustes(false)}><AjustesCalidad s={s} /></Cajon>
      {abierto && pre && !pre.error && <ModalPocillo s={s} p={abierto} onClose={() => setAbierto(null)} />}
    </div>
  )
}
