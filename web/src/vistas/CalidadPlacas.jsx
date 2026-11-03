import { useMemo, useRef, useState } from 'react'
import { useOpcion } from '../ui/opciones.js'
import { desvio, finito, media } from '../motor/analisis.js'
import { METODOS_ATIPICOS } from '../motor/atipicos.js'
import { TEMAS, rellenoPocillo, useTema } from '../tema.js'
import { Grafico, estiloGraficoDef, useAncho } from '../ui/grafico.jsx'
import { ModalGuardarImagen, useGraficoCtx } from '../ui/guardarImagen.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Icono, Modal, Num } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { LETRAS, exportarSVG, fmtTick, fx, tCuantil, ticks } from '../utils.js'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { GrupoMostrar, GrupoTipoError, conEtiquetas, textoMostrar, useMostrar } from '../ui/mostrar.jsx'
import { fichaBlancoPlaca } from '../fichas/definiciones.js'
import { ModalFases, ventanaOdElegida, zonasFases } from './FasesCepa.jsx'

const ERRORES = [['sd', 'Desviación estándar'], ['sem', 'Error estándar (EEM)'], ['ic95', 'IC 95 %']]
const errorDe = (v, tipo) => {
  const n = v.length
  if (n < 2) return NaN
  const sd = desvio(v)
  return tipo === 'sd' ? sd : tipo === 'sem' ? sd / Math.sqrt(n) : (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n)
}
const valorDe = (l) => (l.EsBlanco ? l.OD_leida : l.OD_corregida)

// ---------------------------------------------------------------
// Gráfico de exclusión (como el de Biofilm): una columna por cepa con sus pocillos de ese tiempo, todos sobre la misma
// vertical (miden lo mismo en el mismo tiempo; solo cambia la OD). Un clic en una cepa la acerca (el eje Y se ajusta a sus
// pocillos para ver las diferencias); con la cepa acercada, un clic en un punto lo excluye o lo reincorpora.
// ---------------------------------------------------------------
export function GraficoExclusion(props) {
  const { lect, orden: ordenTodo, colores, o, onClick, titulo, estilo = {}, anchoFijo, altoTotal, refSvg, interactivo = true, idEstilo, focoInicial = null } = props
  const [guardar, setGuardar] = useState(false)
  const [foco, setFoco] = useState(focoInicial)   // cepa acercada
  const orden = foco && ordenTodo.includes(foco) ? [foco] : ordenTodo
  const acercada = orden.length === 1 && !!foco
  const [menu, setMenu] = useState(null)
  const ctx = useGraficoCtx()
  const Tt = useTema()
  const e = { ...estiloGraficoDef(), ...estilo }
  const T = e.fondo === 'blanco' ? TEMAS.claro : Tt
  const tit = e.titulo !== undefined ? e.titulo : titulo
  const yT = e.yTxt !== undefined ? e.yTxt : 'OD (cepas: corregida · blanco: leída)'
  const refInt = useRef()
  const ref = refSvg || refInt
  const [cont, anchoMedido] = useAncho(900)
  const W = anchoFijo || anchoMedido, H = altoTotal || (Number(e.alto) > 150 ? Number(e.alto) : 420), L = 30 + e.tamNumeros * 3, R = 16, TOP = tit ? 18 + e.tamTitulo * 1.5 : 18, B = 40 + e.tamEjes * 2
  const grupos = orden.map((m) => lect.filter((l) => l.Muestra === m))
  const lectV = grupos.flat()
  const res = grupos.map((g) => {
    const v = g.filter((l) => l.Usado).map(valorDe).filter(finito)
    return v.length ? { m: media(v), err: errorDe(v, o.error), n: v.length } : null
  })
  const vals = [...lectV.map(valorDe).filter(finito), ...res.filter(Boolean).flatMap((r) => (finito(r.err) ? [r.m + r.err, r.m - r.err] : [r.m]))]
  let lo = Math.min(0, ...vals), hi = Math.max(0.1, ...vals)
  if (acercada && vals.length) {
    const a = Math.min(...vals), b = Math.max(...vals), sp = Math.max(b - a, 0.004)
    lo = a - sp * 0.35; hi = b + sp * 0.35
  }
  const fijoMin = e.ymin !== '' && Number.isFinite(Number(e.ymin)), fijoMax = e.ymax !== '' && Number.isFinite(Number(e.ymax))
  if (o.etiquetas) hi += (hi - lo) * (o.errores ? 0.16 : 0.1)
  hi += (hi - lo) * 0.04
  if (fijoMin) lo = Number(e.ymin)
  if (fijoMax) hi = Number(e.ymax)
  const ty = ticks(lo, hi, 7)
  // acercada: el eje va justo de lo a hi (las marcas solo rotulan); si no, de la primera a la última marca
  const y0 = acercada ? lo : ty.ticks[0], y1 = acercada ? hi : ty.ticks[ty.ticks.length - 1]
  const anchoUtil = W - L - R
  const band = Math.min(anchoUtil / Math.max(orden.length, 1), acercada ? 260 : Infinity)
  const x0Band = L + (anchoUtil - band * orden.length) / 2
  const py = (v) => TOP + (1 - (v - y0) / (y1 - y0 || 1)) * (H - TOP - B)
  const cx = (i) => x0Band + band * (i + 0.5)
  const px = (g, k, i) => cx(i)
  return (
    <div className="grafico" ref={cont} style={{ position: 'relative' }}>
      {interactivo && <div className="fila no-imprimir" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
        {acercada && <button className="fantasma chico" onClick={() => setFoco(null)} data-tip="También con doble clic sobre el gráfico"><Icono n="refrescar" size={14} />Todas las cepas</button>}
        <button className="fantasma chico" onClick={() => setGuardar(true)} data-tip={'Guardar imagen\nFormato (PNG, JPG o SVG), tamaño, resolución y fondo'}><Icono n="bajar" size={14} />Guardar imagen</button>
      </div>}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} fontFamily={`'${e.fuente}', system-ui, sans-serif`} onDoubleClick={interactivo ? () => setFoco(null) : undefined}
        onContextMenu={interactivo ? (ev) => { ev.preventDefault(); const r = ev.currentTarget.getBoundingClientRect(); setMenu({ cx: ev.clientX - r.left, cy: ev.clientY - r.top }) } : undefined}>
        <rect className="fondo-graf" width={W} height={H} fill={e.fondo === 'blanco' ? '#ffffff' : T.panel} />
        {tit && <text x={W / 2} y={10 + e.tamTitulo} textAnchor="middle" fontSize={e.tamTitulo} fontWeight="600" fill={T.texto}>{tit}</text>}
        {ty.ticks.filter((v) => v >= y0 - 1e-12 && v <= y1 + 1e-12).map((v) => (
          <g key={v}>
            {e.grilla && <line x1={L} x2={W - R} y1={py(v)} y2={py(v)} stroke={T.grilla} />}
            <text x={L - 8} y={py(v)} textAnchor="end" dominantBaseline="central" fontSize={e.tamNumeros} fill={T.sec}>{fmtTick(v, ty.paso)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={acercada || y0 > 0 ? H - B : py(0)} y2={acercada || y0 > 0 ? H - B : py(0)} stroke={T.eje} />
        <line x1={L} x2={L} y1={TOP} y2={H - B} stroke={T.eje} />
        <text transform={`translate(16 ${(TOP + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{yT}</text>
        {orden.map((m, i) => (
          <g key={m}>
            <rect x={cx(i) - band * 0.42} y={TOP} width={band * 0.84} height={H - TOP - B} fill={m === 'Blanco' ? T.grilla : colores[m]} opacity={m === 'Blanco' ? 0.35 : 0.07} rx="6"
              onClick={interactivo && !acercada ? () => setFoco(m) : undefined} style={interactivo && !acercada ? { cursor: 'zoom-in' } : undefined} />
            <text x={cx(i)} y={H - B + 6 + e.tamEjes} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{m}</text>
            <text x={cx(i)} y={H - B + 10 + e.tamEjes * 2} textAnchor="middle" fontSize={e.tamNumeros * 0.95} fill={T.sec}>{res[i] ? `n = ${res[i].n} de ${grupos[i].length}` : ''}</text>
          </g>
        ))}
        {res.map((r, i) => r && (o.medias || o.errores) && (
          <g key={'m' + i} stroke={T.texto} strokeWidth={1.5 * e.grosor}>
            <line x1={cx(i) - band * 0.3} x2={cx(i) + band * 0.3} y1={py(r.m)} y2={py(r.m)} />
            {o.errores && finito(r.err) && <path d={`M${cx(i)},${py(r.m - r.err)}V${py(r.m + r.err)}M${cx(i) - band * 0.1},${py(r.m + r.err)}h${band * 0.2}M${cx(i) - band * 0.1},${py(r.m - r.err)}h${band * 0.2}`} fill="none" />}
          </g>
        ))}
        {o.puntos && grupos.map((g, i) => g.map((l, k) => {
          const X = px(g, k, i), Y = py(valorDe(l))
          if (!finito(Y)) return null
          const col = l.EsBlanco ? '#8C9BB0' : colores[l.Muestra] || T.acento
          return (
            <g key={l.clave} onClick={!interactivo ? undefined : acercada ? () => onClick(l.clave) : () => setFoco(l.Muestra)} style={{ cursor: acercada ? 'pointer' : 'zoom-in' }}
              data-tip={`${l.Pocillo} · ${l.Muestra}${l.EsBlanco ? '' : ` (réplica ${l.Replica})`} · t = ${l.Placa_T_h} h\n${l.EsBlanco ? `OD leída = ${fx(l.OD_leida, 4)}` : l.tipOD || `OD = (${fx(l.OD_leida, 4)} − ${fx(l.Blanco, 4)})${l.Factor_dilucion > 1 ? ` × ${l.Factor_dilucion}` : ''} = ${fx(l.OD_corregida, 4)}`}\n${l.Motivo || (l.Usado ? 'Aceptado' : 'Excluido')}\nClic: ${acercada ? (l.Usado ? 'excluir' : 'reincorporar') : 'acercar esta cepa'}`}>
              <circle cx={X} cy={Y} r="13" fill="transparent" />
              {l.Sospechoso && <circle cx={X} cy={Y} r="9" fill="none" stroke={T.aviso} strokeWidth="2.4" />}
              {l.Usado ? <circle cx={X} cy={Y} r={5 * e.radio} fill={col} stroke={T.panel} strokeWidth="1" />
                : <path d={`M${X - 5},${Y - 5}L${X + 5},${Y + 5}M${X - 5},${Y + 5}L${X + 5},${Y - 5}`} stroke={T.peligro} strokeWidth="2.4" />}
            </g>
          )
        }))}
        {o.etiquetas && res.map((r, i) => {
          if (!r) return null
          const top = Math.max(...grupos[i].map(valorDe).filter(finito), r.m + (o.errores && finito(r.err) ? r.err : 0))
          const txt = textoMostrar(o.mostrar, fx(r.m, 3), finito(r.err) ? `± ${fx(r.err, 3)}` : '')
          if (!txt) return null
          return (
            <g key={'t' + i}>
              <rect x={cx(i) - txt.length * 3.6 - 6} y={py(top) - 30} width={txt.length * 7.2 + 12} height="20" rx="5" fill={T.panel2} stroke={T.borde} />
              <text x={cx(i)} y={py(top) - 16} textAnchor="middle" fontSize={e.tamValores + 1.5} fontWeight="600" fill={T.texto}>{txt}</text>
            </g>
          )
        })}
        <g transform={`translate(${W / 2 - 150},${H - 10})`} fontSize="12" fill={T.texto}>
          <circle cx="0" cy="-4" r="5" fill={T.acento} /><text x="10" y="0">Aceptado</text>
          <path d="M95,-9L105,1M95,1L105,-9" stroke={T.peligro} strokeWidth="2.2" /><text x="112" y="0">Excluido</text>
          <circle cx="200" cy="-4" r="7" fill="none" stroke={T.aviso} strokeWidth="2.2" /><text x="212" y="0">Sospechoso</text>
        </g>
      </svg>
      {menu && (
        <div className="menu-contextual" style={{ left: menu.cx, top: menu.cy, position: 'absolute' }} onMouseLeave={() => setMenu(null)}>
          {ctx.abrirPersonalizar && idEstilo && <button onClick={() => { setMenu(null); ctx.abrirPersonalizar(idEstilo) }}><Icono n="editar" size={15} />Personalizar gráfico…</button>}
          <button onClick={() => { setMenu(null); setGuardar(true) }}><Icono n="bajar" size={15} />Guardar imagen…</button>
        </div>
      )}
      {guardar && <ModalGuardarImagen nombre="exclusion" anchoPantalla={W} altoPantalla={H} onClose={() => setGuardar(false)}
        renderizar={(w, h, r, blanco) => <GraficoExclusion {...props} focoInicial={foco} anchoFijo={w} altoTotal={h} refSvg={r} interactivo={false} estilo={blanco ? { ...estilo, fondo: 'blanco' } : estilo} />} />}
    </div>
  )
}

// Ventana emergente: la distribución de los puntos de una cepa en UN tiempo, acercada para verla bien. Un clic en un punto lo excluye o lo reincorpora.
export function ZoomTiempo({ titulo, lect, cepa, colores, o, onClick, onClose, estilo }) {
  return (
    <Modal titulo={titulo} ancho={600} onClose={onClose}>
      <GraficoExclusion lect={lect} orden={[cepa]} colores={colores} o={{ ...o, puntos: true }} onClick={onClick} estilo={{ ...estilo, alto: 380 }} focoInicial={cepa} idEstilo="exclusion" />
      <p className="ayuda" style={{ marginTop: 8, marginBottom: 0 }}>Cada punto es una lectura de ese tiempo. Un clic en un punto lo excluye o lo reincorpora (cruz roja: excluido; anillo naranja: sospechoso según el test, que por defecto solo se marca).</p>
    </Modal>
  )
}

// Una tarjeta por cepa con sus pocillos a lo largo de los tiempos (placas por tiempo): el mismo formato que la revisión de cubeta
function VistaCepasPlacas({ s, lecturas, mo, o }) {
  const T = useTema()
  const [zoom, setZoom] = useState(null)   // { m, t }
  const [fasesDe, setFasesDe] = useState(null)
  const datosFases = new Map()
  const cepas = [...new Set(lecturas.filter((l) => !l.EsBlanco).map((l) => l.Muestra))]
  const grupos = [...cepas, ...(mo.blanco && lecturas.some((l) => l.EsBlanco) ? ['Blanco'] : [])]
  const claves = new Map()
  const tarjetas = grupos.map((m) => {
    const L = lecturas.filter((l) => l.Muestra === m)
    const color = m === 'Blanco' ? '#8C9BB0' : s.colores[m]
    const series = [], extras = []
    const tip = (l) => `${l.Pocillo}${l.EsBlanco ? '' : ` · réplica ${l.Replica}`} · t = ${fx(l.Placa_T_h, 2)} h\n${l.EsBlanco ? 'OD leída' : 'OD corregida'} = ${fx(valorDe(l), 4)}\n${l.Motivo || (l.Usado ? 'Aceptado' : 'Excluido')}\nClic: ver los pocillos de ese tiempo`
    L.forEach((l) => claves.set(l.clave, { m, t: l.Placa_T_h }))
    if (mo.replicas) {
      series.push({ id: 'p' + m, nombre: 'Pocillos', color, linea: false, puntos: true, radio: 3, opacidad: 0.85, data: L.filter((l) => l.Usado && finito(valorDe(l))).map((l) => ({ x: l.Placa_T_h, y: valorDe(l), key: l.clave, tip: tip(l) })) })
      L.filter((l) => !l.Usado && finito(valorDe(l))).forEach((l) => extras.push({ x: l.Placa_T_h, y: valorDe(l), key: l.clave, color: T.peligro, forma: 'x', tip: tip(l) }))
      L.filter((l) => l.Usado && l.Sospechoso && finito(valorDe(l))).forEach((l) => extras.push({ x: l.Placa_T_h, y: valorDe(l), key: l.clave, color: T.aviso, forma: 'anillo', tip: tip(l) }))
    }
    if (mo.puntos || mo.barras || conEtiquetas(mo)) {
      const ts = [...new Set(L.map((l) => l.Placa_T_h))].sort((a, b) => a - b)
      series.push({ id: 'media' + m, nombre: 'Media', color, linea: false, puntos: !!mo.puntos, radio: 3.6, errores: !!mo.barras, etiqueta: conEtiquetas(mo) ? (d) => d.valor : null,
        data: ts.map((t) => {
          const v = L.filter((l) => l.Placa_T_h === t && l.Usado).map(valorDe).filter(finito)
          if (!v.length) return null
          const mm = media(v), e = errorDe(v, o.error), key = `T|${m}|${t}`
          claves.set(key, { m, t })
          return { x: t, y: mm, lo: finito(e) ? mm - e : NaN, hi: finito(e) ? mm + e : NaN, key, valor: textoMostrar(mo, fx(mm, 3), finito(e) ? `± ${fx(e, 3)}` : ''), tip: `${m}\nt = ${fx(t, 2)} h\nmedia = ${fx(mm, 4)}${finito(e) ? ` ± ${fx(e, 4)}` : ''}\nn = ${v.length} de ${L.filter((l) => l.Placa_T_h === t).length}\nClic: ver los pocillos de ese tiempo` }
        }).filter(Boolean) })
    }
    const nEx = L.filter((l) => !l.Usado).length, nSo = L.filter((l) => l.Usado && l.Sospechoso).length
    const tiempos = [...new Set(L.map((l) => l.Placa_T_h))].sort((a, b) => a - b)
    const filas = m === 'Blanco' ? [] : (s.res || []).filter((r) => r.Muestra === m)
    datosFases.set(m, { series, extras, tiempos, filas })
    return { m, color, series, extras, nEx, nSo, tiempos, filas }
  })
  return (
    <>
      <div className="grilla-cepas">
        {tarjetas.map(({ m, color, series, extras, nEx, nSo, tiempos, filas }) => (
          <div key={m} className="mosaico">
            <div className="mosaico-cab" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><h2><i className="punto" style={{ background: color, marginRight: 6 }} />{m}</h2>{filas.length > 0 && <button className="chico fantasma" onClick={() => setFasesDe(m)} data-tip={'Fases de la curva: lag, exponencial y estacionaria\nAmplía la curva para elegir qué puntos forman la fase exponencial'}>Fases…</button>}</div>
            <Grafico series={series} extras={extras} yTxt={m === 'Blanco' ? 'OD leída' : 'OD'} alto={240} zonas={zonasFases(filas, tiempos[0], tiempos[tiempos.length - 1], false, ventanaOdElegida(s, filas))} estilo={s.estiloGrafico('cepaPlacas')} idEstilo="cepaPlacas" nombre={`placas_${m}`}
              onPuntoClick={(k) => { const z = claves.get(k); if (z) setZoom(z) }} />
            <div className="fila" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <span className={`chip ${nEx ? 'peligro' : nSo ? 'aviso' : 'ok'}`}>{nEx ? `${nEx} excluida${nEx > 1 ? 's' : ''}` : nSo ? `${nSo} sospechosa${nSo > 1 ? 's' : ''}` : 'sin marcas'}</span>
              {nEx > 0 && nSo > 0 && <span className="chip aviso">{nSo} sospechosa{nSo > 1 ? 's' : ''}</span>}
            </div>
          </div>
        ))}
      </div>
      {fasesDe && datosFases.get(fasesDe) && <ModalFases s={s} cepa={fasesDe} {...datosFases.get(fasesDe)} onClose={() => setFasesDe(null)} />}
      {zoom && <ZoomTiempo titulo={`${zoom.m} · t = ${fx(zoom.t, zoom.t % 1 ? 2 : 0)} h`} cepa={zoom.m} colores={s.colores} o={o} onClick={s.alternarLectura} estilo={s.estiloGrafico('exclusion')} onClose={() => setZoom(null)}
        lect={lecturas.filter((l) => l.Muestra === zoom.m && l.Placa_T_h === zoom.t)} />}
    </>
  )
}

// ---------------------------------------------------------------
// Placa de un tiempo con el estado de cada pocillo
// ---------------------------------------------------------------
function PlacaDeTiempo({ s, lect, pl }) {
  const T = useTema()
  const porPoc = Object.fromEntries(lect.map((l) => [l.Pocillo, l]))
  return (
    <div className="placa-wrap">
      <table className="placa"><thead><tr><th />{Array.from({ length: 12 }, (_, c) => <th key={c}>{c + 1}</th>)}</tr></thead>
        <tbody>{LETRAS.map((L) => (
          <tr key={L}><th>{L}</th>{Array.from({ length: 12 }, (_, c) => {
            const p = L + (c + 1)
            const l = porPoc[p]
            const lay = pl?.layout[p]
            const col = lay?.muestra ? (lay.blanco ? '#8C9BB0' : s.colores[lay.muestra]) : null
            const borde = l && !l.Usado ? T.peligro : l?.Sospechoso ? T.aviso : col
            return (
              <td key={p}>
                <div className={`pozo ${!lay?.muestra ? 'vacio-poz' : ''} ${lay?.blanco ? 'blanco' : ''}`} onClick={l ? () => s.alternarLectura(l.clave) : undefined}
                  data-tip={l ? `${p} · ${l.Muestra}\n${l.EsBlanco ? 'OD leída' : 'OD corregida'} = ${fx(valorDe(l), 4)}\n${l.Motivo || 'Aceptado'}\nClic: ${l.Usado ? 'excluir' : 'reincorporar'}` : undefined}
                  style={{ width: 54, height: 44, fontSize: 10.5, background: col ? rellenoPocillo(col, T) : undefined, borderColor: borde || undefined, borderWidth: l && (!l.Usado || l.Sospechoso) ? 2 : 1, cursor: l ? 'pointer' : 'default' }}>
                  {l ? <><b style={{ color: l.Usado ? T.texto : T.peligro, textDecoration: l.Usado ? 'none' : 'line-through' }}>{fx(valorDe(l), 3)}</b><small>{l.EsBlanco ? 'blanco' : p}</small></> : <small>{p}</small>}
                </div>
              </td>
            )
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function ResumenTiempos({ lect }) {
  const filas = useMemo(() => {
    const g = new Map()
    lect.forEach((l) => { const k = `${l.Muestra}|${l.Placa_T_h}`; if (!g.has(k)) g.set(k, []); g.get(k).push(l) })
    return [...g.values()].map((ls) => {
      const v = ls.filter((l) => l.Usado).map(valorDe).filter(finito)
      const m = media(v), sd = v.length > 1 ? desvio(v) : NaN
      return { Muestra: ls[0].Muestra, T: ls[0].Placa_T_h, n: v.length, N: ls.length, m, sd, cv: m ? (100 * sd) / Math.abs(m) : NaN, fuera: ls.filter((l) => !l.Usado).map((l) => l.Pocillo), sosp: ls.filter((l) => l.Sospechoso && l.Usado).map((l) => l.Pocillo) }
    }).sort((a, b) => a.T - b.T || (a.Muestra === 'Blanco' ? -1 : b.Muestra === 'Blanco' ? 1 : a.Muestra < b.Muestra ? -1 : 1))
  }, [lect])
  return (
    <div className="tabla-scroll alta"><table className="tabla">
      <thead><tr><th className="num">T (h)</th><th>Grupo</th><th className="num">Pocillos usados</th><th className="num">Media</th><th className="num">DE</th><th className="num">CV %</th><th>Excluidos</th><th>Sospechosos conservados</th></tr></thead>
      <tbody>{filas.map((f) => (
        <tr key={f.Muestra + f.T}><td className="num">{f.T}</td><td>{f.Muestra === 'Blanco' ? <i>Blanco</i> : f.Muestra}</td><td className="num">{f.n} / {f.N}</td><td className="num">{fx(f.m, 4)}</td><td className="num">{fx(f.sd, 4)}</td>
          <td className="num" style={{ color: f.cv > 20 ? 'var(--aviso)' : undefined }}>{fx(f.cv, 1)}</td><td>{f.fuera.join(', ')}</td><td>{f.sosp.join(', ')}</td></tr>
      ))}</tbody>
    </table></div>
  )
}

// ---------------------------------------------------------------
// Control de calidad de placas por tiempo (panel + vistas)
// ---------------------------------------------------------------
export function VistaCalidadPlacas({ s }) {
  const { exp, setAj } = s
  const aj = exp.aj
  const lecturas = s.serie.extra?.lecturas || []
  const tiempos = [...new Set(lecturas.map((l) => l.Placa_T_h))].sort((a, b) => a - b)
  const [t, setT] = useState(tiempos[0])
  const [vistaG, setVista] = useOpcion('calidadPlacas.vista', 'cepas')
  const vista = vistaG === 'puntos' ? 'cepas' : vistaG   // «Excluir puntos» (versión anterior) = por cepa
  const [pers, setPers] = useState(false)
  // Mostrar (el mismo grupo en todos los gráficos): réplicas = cada pocillo, puntos = la media de la cepa (raya)
  const [mo, setMo] = useMostrar('calidadPlacas', { puntos: true, replicas: true, blanco: true })
  const [errorOd, setErrorOd] = useOpcion('curva.error', 'sd')   // tipo de error de la OD: uno solo, se elige en este mismo menú, «Tipo de error»
  const o = { puntos: mo.replicas, medias: mo.puntos, errores: mo.barras, blanco: mo.blanco, etiquetas: conEtiquetas(mo), mostrar: mo, error: errorOd }
  const tt = tiempos.includes(t) ? t : tiempos[0]
  const lectT = lecturas.filter((l) => l.Placa_T_h === tt && (o.blanco || !l.EsBlanco))
  const pl = exp.placas.find((p) => Math.abs(p.t - tt) < 1e-9)
  const cepas = [...new Set(lecturas.filter((l) => !l.EsBlanco).map((l) => l.Muestra))]
  const orden = [...cepas, ...(o.blanco && lectT.some((l) => l.EsBlanco) ? ['Blanco'] : [])]
  const excluidas = lecturas.filter((l) => !l.Usado)
  const metodo = aj.pl_metodo || 'q'
  const bl = s.serie.extra?.blancos?.find((b) => b.id === pl?.id)
  const revisar = lecturas.filter((l) => !l.Usado || l.Sospechoso).sort((a, b) => a.Placa_T_h - b.Placa_T_h)
  return (
    <>
      <Cinta>
        <GrupoMostrar m={mo} set={setMo} blanco notas={{ puntos: 'La raya con la media de los pocillos aceptados de cada cepa', replicas: 'Cada pocillo como un punto: clic en uno para excluirlo o reincorporarlo', blanco: 'Mostrar los blancos: la columna con los pocillos de blanco de la placa (su OD leída)', barras: 'Barras de error: el tipo (DE, EEM o IC 95 %) se elige en este mismo menú, «Tipo de error»' }} />
        <GrupoTipoError valor={errorOd} onChange={setErrorOd} nota={'\n(el mismo en todos los gráficos de OD)'} />
        <Grupo titulo="Método">
          <OpcionesCinta valor={metodo} onChange={(v) => setAj('pl_metodo', v)} opciones={[['q', 'Dixon', 'Q', null, METODOS_ATIPICOS.q], ['grubbs', 'Grubbs', 'G', null, METODOS_ATIPICOS.grubbs], ['cv', 'CV %', 'CV', null, METODOS_ATIPICOS.cv]]} />
        </Grupo>
        {metodo === 'cv'
          ? <Grupo titulo="Límite"><CampoCinta etiqueta="CV máximo (%)"><Num value={aj.pl_cvmax ?? 20} onChange={(v) => setAj('pl_cvmax', v)} ancho={70} /></CampoCinta></Grupo>
          : <Grupo titulo="Confianza"><OpcionesCinta valor={String(aj.pl_conf || 95)} onChange={(v) => setAj('pl_conf', Number(v))} opciones={[['90', '90 %', '90', null, 'Confianza 90 %: marca más atípicos'], ['95', '95 %', '95', null, 'Confianza 95 % (la habitual)'], ['99', '99 %', '99', null, 'Confianza 99 %: solo marca valores muy extremos']]} /></Grupo>}
        <Grupo titulo="Sospechosos">
          <OpcionesCinta valor={aj.pl_auto === true ? 'si' : 'no'} onChange={(v) => setAj('pl_auto', v === 'si')} opciones={[['no', 'Solo marcar', '◯', null, 'Marcarlos con un anillo y dejarlos en el análisis (por defecto, como en UFC)\nDecidí vos con un clic cuáles excluir'], ['si', 'Excluir', '⛔', null, 'Excluir automáticamente los sospechosos']]} />
          <BotonCinta icono="refrescar" texto="Restablecer" tip="Borra todas las exclusiones y conservaciones hechas a mano" onClick={() => { if (window.confirm('Se borran todas las exclusiones y conservaciones manuales de las placas. ¿Continuar?')) s.restablecerLecturas() }} />
        </Grupo>
        <Grupo titulo="Gráfico">
          <BotonCinta icono="editar" texto="Personalizar" activo={pers} onClick={() => setPers(!pers)} tip="Títulos, tamaños de letra, grosores, eje Y, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers} onClose={() => setPers(false)}><PanelPersonalizar s={s} id="exclusion" /></Cajon>
      <div className="pestanas" style={{ marginBottom: 12 }}>
        <button className={vista === 'cepas' ? 'on' : ''} onClick={() => setVista('cepas')}>Por cepa</button>
        <button className={vista === 'placa' ? 'on' : ''} onClick={() => setVista('placa')}>Placa</button>
        <button className={vista === 'tabla' ? 'on' : ''} onClick={() => setVista('tabla')}>Resumen de todos los tiempos</button>
      </div>
      {vista === 'cepas' && (<>
        <VistaCepasPlacas s={s} lecturas={lecturas.filter((l) => o.blanco || !l.EsBlanco)} mo={mo} o={o} />
        <p className="ayuda" style={{ marginTop: 8 }}>Cada punto es un pocillo. Un clic en un punto (o en la media) de un tiempo abre una ventana con todos los pocillos de esa cepa en ese tiempo, acercados, para excluirlos o reincorporarlos. Color: aceptado · cruz roja: excluido · anillo naranja: sospechoso según el test (por defecto solo se marca).</p>
      </>)}
      {vista === 'placa' && (<>
        <div className="tiempos" style={{ marginBottom: 12 }}>
          {tiempos.map((x) => {
            const n = lecturas.filter((l) => l.Placa_T_h === x && !l.Usado).length
            const sp = lecturas.filter((l) => l.Placa_T_h === x && l.Sospechoso && l.Usado).length
            return <button key={x} className={`tiempo ${x === tt ? 'on' : ''}`} onClick={() => setT(x)}><b>t = {fx(x, x % 1 ? 2 : 0)} h</b><small>{n ? `${n} excluida${n > 1 ? 's' : ''}` : sp ? `${sp} sospechosa${sp > 1 ? 's' : ''}` : 'sin marcas'}</small></button>
          })}
        </div>
        <div className="dos-columnas ancha">
          <Mosaico>
            <PlacaDeTiempo s={s} lect={lecturas.filter((l) => l.Placa_T_h === tt)} pl={pl} />
            <p className="ayuda" style={{ marginTop: 8, marginBottom: 0 }}>Clic sobre un pocillo para excluirlo o reincorporarlo.</p>
          </Mosaico>
          <div className="columna-mosaicos">
            <Mosaico titulo={`Blanco de t = ${fx(tt, tt % 1 ? 2 : 0)} h`}>
              {bl && finito(bl.valor) ? (<>
                <div className="cifra"><b><Valor f={() => fichaBlancoPlaca(bl, lecturas.filter((l) => l.Placa_T_h === bl.origen), tt)}>{fx(bl.valor, 4)}</Valor></b>{finito(bl.de) && <span>± {fx(bl.de, 4)}</span>}</div>
                <p className="ayuda" style={{ margin: 0 }}>Media de {bl.n} pocillo{bl.n === 1 ? '' : 's'} ({bl.pocillos.join(', ')}){bl.origen !== tt ? `, tomado de la placa t = ${bl.origen} h` : ''}. Se resta a cada lectura y el resultado se multiplica por la dilución.</p>
              </>) : <p className="ayuda">Sin blanco aceptado en esta placa.</p>}
            </Mosaico>
          </div>
        </div>
      </>)}
      {vista === 'tabla' && <Mosaico><ResumenTiempos lect={lecturas} /></Mosaico>}
      <Mosaico titulo={`Para revisar (${revisar.length})`}>
        {!revisar.length ? <p className="ayuda" style={{ margin: 0 }}>Nada marcado: todas las lecturas fueron aceptadas.</p> : (
          <div className="lista-revisar">
            {revisar.map((l) => (
              <button key={l.clave} className="fantasma" onClick={() => { setT(l.Placa_T_h); s.alternarLectura(l.clave) }} data-tip={`${l.Motivo || ''}\nClic: ${l.Usado ? 'excluir' : 'reincorporar'}`}>
                <span><b>{l.Pocillo}</b> · {l.Muestra} · {l.Placa_T_h} h<br /><small className="ayuda">{l.Manual ? 'a mano' : l.AutoExcl ? 'test' : 'sospechoso conservado'}</small></span>
                <span className={`chip ${l.Usado ? 'aviso' : 'peligro'}`}>{l.Usado ? 'aceptada' : 'excluida'}</span>
              </button>
            ))}
          </div>
        )}
      </Mosaico>
    </>
  )
}

// lecturas para otras vistas (Datos, compatibilidad)
export const lecturasPlacas = (s) => s.serie.extra?.lecturas || []
export const fueraLect = (l) => !l.Usado
