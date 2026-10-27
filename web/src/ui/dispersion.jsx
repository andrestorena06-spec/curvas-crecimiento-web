// ============================================================
// Gráfico de dispersión de réplicas (como el de «Calidad» de Biofilm):
// una columna por cepa en cada tiempo, cada réplica como un punto, la media como una raya,
// el error como bigote y, si se pide, el valor «media ± error» arriba.
// Clic en un punto: excluir o reincorporar esa réplica. Clic derecho: personalizar o guardar imagen.
// ============================================================
import { useEffect, useState } from 'react'
import { TEMAS, useTema } from '../tema.js'
import { fmtTick, ticks } from '../utils.js'
import { ModalGuardarImagen, useGraficoCtx } from './guardarImagen.jsx'
import { Icono } from './base.jsx'
import { estiloGraficoDef, useAncho } from './grafico.jsx'

const fin = Number.isFinite

// grupos: [{ t (tiempo, h), etiqueta: '0 h', cols: [{ id, nombre, color, m, lo, hi (extremos del error), valor (texto), tip, pts: [{ y, key, estado, tip }] }] }]
//   estado de un punto: 'ok' (incluida) | 'estimada' (fuera del rango contable) | 'fuera' (excluida) | 'marcada' (señalada por el test y reincorporada)
// o: { puntos, media (raya y valor), errores }. curvas: [{ id, color, puntos: [{ x: t, y }] }] (curva suavizada de las medias)
export function GraficoDispersion(props) {
  const {
    grupos, o, curvas = [], xTxt = 'Tiempo (h)', yTxt = '', titulo = '', estilo = {}, idEstilo, nombre = 'grafico', onPuntoClick, leyenda = [],
    anchoFijo, altoTotal, refSvg, interactivo = true, exportar = true, alto = 360,
  } = props
  const Tt = useTema()
  const e = { ...estiloGraficoDef(), ...estilo }
  const T = e.fondo === 'blanco' ? TEMAS.claro : Tt
  const [cont, anchoMedido] = useAncho(900)
  const [menu, setMenu] = useState(null)
  const [guardar, setGuardar] = useState(false)
  const ctx = useGraficoCtx()
  useEffect(() => {
    if (!menu) return
    const cerrar = () => setMenu(null)
    window.addEventListener('mousedown', cerrar)
    return () => window.removeEventListener('mousedown', cerrar)
  }, [menu])

  const tit = e.titulo !== undefined ? e.titulo : titulo
  const yT = e.yTxt !== undefined ? e.yTxt : yTxt
  const xT = e.xTxt !== undefined ? e.xTxt : xTxt
  const W = anchoFijo || anchoMedido
  const filasLey = leyenda.length ? 1 : 0
  const altoBase = altoTotal || (fin(Number(e.alto)) && Number(e.alto) > 120 ? Number(e.alto) : alto)
  const H = altoBase
  const L = 34 + e.tamNumeros * 2.8, R = 16, TOP = (tit ? 18 + e.tamTitulo * 1.6 : 14) + (o.media ? e.tamValores * 2.4 : 6)
  const B = 24 + e.tamNumeros * 1.4 + e.tamEjes * 1.6 + filasLey * e.tamLeyenda * 2.2

  // rango del eje Y: puntos visibles y media ± error
  const vals = []
  grupos.forEach((g) => g.cols.forEach((c) => {
    if (o.puntos) c.pts.forEach((p) => vals.push(p.y))
    if (o.media || o.errores || !o.puntos) vals.push(c.m)
    if (o.errores && fin(c.lo) && fin(c.hi)) vals.push(c.lo, c.hi)
  }))
  const v = vals.filter(fin)
  let y0 = v.length ? Math.min(...v) : 0, y1 = v.length ? Math.max(...v) : 1
  if (y0 === y1) { y0 -= 0.5; y1 += 0.5 }
  const pad = (y1 - y0) * 0.08
  y0 -= pad; y1 += pad
  if (fin(Number(e.ymin)) && e.ymin !== '') y0 = Number(e.ymin)
  if (fin(Number(e.ymax)) && e.ymax !== '') y1 = Number(e.ymax)
  const ty = ticks(y0, y1, 7)
  const py = (y) => TOP + (1 - (y - y0) / (y1 - y0 || 1)) * (H - TOP - B)

  // eje X en horas: cada tiempo en su lugar; las cepas de un mismo tiempo, una al lado de la otra
  const ts = grupos.map((g) => g.t)
  const t0 = Math.min(...ts), t1 = Math.max(...ts)
  const nMax = Math.max(1, ...grupos.map((g) => g.cols.length))
  const dif = ts.slice(1).map((t, i) => t - ts[i]).filter((d) => d > 0)
  const ancho = W - L - R
  const fr = dif.length ? Math.min(...dif) / (t1 - t0) : 1            // separación mínima entre tiempos, en fracción del eje
  const anchoCol = Math.min(70, (ancho * fr * 0.8) / (1 + fr) / nMax, ancho / nMax / 2.2)
  const margen = (anchoCol * nMax) / 2 + 12
  const px = (t) => L + margen + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * (ancho - 2 * margen)
  const cxCol = (gi, ci, n) => px(grupos[gi].t) + (ci - (n - 1) / 2) * anchoCol
  const fondo = e.fondo === 'blanco' ? '#ffffff' : T.panel
  const fuente = `'${e.fuente}', system-ui, sans-serif`
  const r = 4.2 * e.radio

  return (
    <div className="grafico" ref={cont} style={{ position: 'relative' }}>
      {exportar && interactivo && (
        <div className="fila no-imprimir" style={{ justifyContent: 'flex-end', marginBottom: 4, gap: 6 }}>
          <button className="fantasma chico" onClick={() => setGuardar(true)} data-tip={'Guardar imagen\nFormato (PNG, JPG o SVG), tamaño, resolución y fondo'}><Icono n="bajar" size={14} />Guardar imagen</button>
        </div>
      )}
      <svg ref={refSvg} viewBox={`0 0 ${W} ${H}`} fontFamily={fuente} style={{ userSelect: 'none', borderRadius: e.fondo === 'blanco' ? 8 : 0 }}
        onContextMenu={!interactivo ? undefined : (ev) => { ev.preventDefault(); const b = cont.current.getBoundingClientRect(); setMenu({ cx: ev.clientX - b.left, cy: ev.clientY - b.top }) }}>
        <rect className="fondo-graf" width={W} height={H} fill={fondo} />
        {tit && <text x={(L + W - R) / 2} y={10 + e.tamTitulo} textAnchor="middle" fontSize={e.tamTitulo} fontWeight="600" fill={T.texto}>{tit}</text>}
        {ty.ticks.filter((t) => t >= y0 - 1e-9 && t <= y1 + 1e-9).map((t) => (
          <g key={'y' + t}>
            {e.grilla && <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke={T.grilla} />}
            <text x={L - 8} y={py(t)} textAnchor="end" dominantBaseline="central" fontSize={e.tamNumeros} fill={T.sec}>{fmtTick(t, ty.paso)}</text>
          </g>
        ))}
        {e.grilla && grupos.map((g, gi) => <line key={'s' + gi} x1={px(g.t)} x2={px(g.t)} y1={TOP} y2={H - B} stroke={T.grilla} strokeDasharray="2 4" />)}
        {curvas.map((c) => <polyline key={c.id} points={c.puntos.filter((q) => fin(q.y)).map((q) => `${px(q.x).toFixed(1)},${py(Math.min(y1, Math.max(y0, q.y))).toFixed(1)}`).join(' ')} fill="none" stroke={c.color} strokeWidth={1.6 * e.grosor} opacity="0.75" />)}
        <text x={(L + W - R) / 2} y={H - B + 14 + e.tamNumeros + e.tamEjes} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{xT}</text>
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={T.eje} />
        <line x1={L} x2={L} y1={TOP} y2={H - B} stroke={T.eje} />
        <text transform={`translate(${6 + e.tamEjes * 0.6} ${(TOP + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{yT}</text>

        {grupos.map((g, gi) => (
          <g key={'g' + gi}>
            <text x={px(g.t)} y={H - B + 6 + e.tamNumeros} textAnchor="middle" fontSize={e.tamNumeros} fill={T.sec}>{g.etiqueta}</text>
            {g.cols.map((c, ci) => {
              const cx = cxCol(gi, ci, g.cols.length)
              const n = c.pts.length
              const sep = Math.min(anchoCol * 0.22, 14)
              const media = fin(c.m) && (o.media || o.errores)
              const conErr = o.errores && fin(c.lo) && fin(c.hi) && c.hi > c.lo
              const tope = Math.max(...(o.puntos ? c.pts.map((p) => p.y).filter(fin) : []), fin(c.m) ? (conErr ? c.hi : c.m) : -Infinity)
              return (
                <g key={c.id}>
                  {media && (
                    <g stroke={c.color} strokeWidth={1.8 * e.grosor} data-tip={c.tip}>
                      <line x1={cx - Math.max(anchoCol * 0.4, (n - 1) / 2 * Math.min(anchoCol * 0.22, 14) + 8)} x2={cx + Math.max(anchoCol * 0.4, (n - 1) / 2 * Math.min(anchoCol * 0.22, 14) + 8)} y1={py(c.m)} y2={py(c.m)} strokeWidth={2.4 * e.grosor} />
                      {conErr && <>
                        <line x1={cx} x2={cx} y1={py(c.lo)} y2={py(c.hi)} />
                        <line x1={cx - anchoCol * 0.12} x2={cx + anchoCol * 0.12} y1={py(c.hi)} y2={py(c.hi)} />
                        <line x1={cx - anchoCol * 0.12} x2={cx + anchoCol * 0.12} y1={py(c.lo)} y2={py(c.lo)} />
                      </>}
                    </g>
                  )}
                  {!o.puntos && !media && fin(c.m) && <circle cx={cx} cy={py(c.m)} r={r} fill={c.color} data-tip={c.tip} />}
                  {o.puntos && c.pts.map((p, k) => {
                    if (!fin(p.y)) return null
                    const x = cx + (n > 1 ? (k - (n - 1) / 2) * sep : 0), y = py(p.y)
                    const clic = interactivo && onPuntoClick && p.key ? () => onPuntoClick(p.key) : undefined
                    return (
                      <g key={p.key || k} data-tip={p.tip} onClick={clic} style={clic ? { cursor: 'pointer' } : undefined}>
                        <circle cx={x} cy={y} r={r + 6} fill="transparent" />
                        {p.estado === 'marcada' && <circle cx={x} cy={y} r={r + 3.5} fill="none" stroke={T.aviso} strokeWidth="2" />}
                        {p.estado === 'fuera'
                          ? <path d={`M${x - r},${y - r}L${x + r},${y + r}M${x - r},${y + r}L${x + r},${y - r}`} stroke={T.peligro} strokeWidth="2.2" />
                          : p.estado === 'estimada'
                            ? <circle cx={x} cy={y} r={r - 0.6} fill={fondo} stroke={c.color} strokeWidth="1.8" />
                            : <circle cx={x} cy={y} r={r} fill={c.color} stroke={fondo} strokeWidth="0.8" />}
                      </g>
                    )
                  })}
                  {o.media && fin(c.m) && fin(tope) && c.valor && c.valor.split('\n').map((lin, li, arr) => (
                    <text key={li} x={cx} y={py(tope) - 8 - (arr.length - 1 - li) * e.tamValores * 1.15} textAnchor="middle" fontSize={e.tamValores} fontWeight="600"
                      fill={c.color} stroke={fondo} strokeWidth="3" paintOrder="stroke">{lin}</text>
                  ))}
                </g>
              )
            })}
          </g>
        ))}

        {leyenda.length > 0 && (() => {
          const y = H - e.tamLeyenda * 1.1
          let x = L
          return leyenda.map((l, i) => {
            const x0 = x
            x += 30 + l.texto.length * e.tamLeyenda * 0.56
            return (
              <g key={'l' + i} transform={`translate(${x0} ${y})`}>
                {l.forma === 'x' ? <path d="M6,-4L14,4M6,4L14,-4" stroke={T.peligro} strokeWidth="2" />
                  : l.forma === 'hueco' ? <circle cx="10" cy="0" r="4" fill={fondo} stroke={l.color || T.sec} strokeWidth="1.8" />
                    : l.forma === 'anillo' ? <><circle cx="10" cy="0" r="4" fill={l.color || T.sec} /><circle cx="10" cy="0" r="7" fill="none" stroke={T.aviso} strokeWidth="1.8" /></>
                      : l.forma === 'raya' ? <line x1="2" x2="18" y1="0" y2="0" stroke={l.color || T.texto} strokeWidth="2.4" />
                        : <circle cx="10" cy="0" r="4.5" fill={l.color || T.sec} />}
                <text x="24" y="0" dominantBaseline="central" fontSize={e.tamLeyenda} fill={T.texto}>{l.texto}</text>
              </g>
            )
          })
        })()}
      </svg>
      {menu && (
        <div className="menu-contextual" style={{ left: Math.max(0, Math.min(menu.cx, (cont.current?.clientWidth || 400) - 230)), top: menu.cy, position: 'absolute', zIndex: 30 }} onMouseDown={(ev) => ev.stopPropagation()}>
          {ctx.abrirPersonalizar && idEstilo && <button onClick={() => { setMenu(null); ctx.abrirPersonalizar(idEstilo) }}><Icono n="editar" size={15} />Personalizar gráfico…</button>}
          <button onClick={() => { setMenu(null); setGuardar(true) }}><Icono n="bajar" size={15} />Guardar imagen…</button>
        </div>
      )}
      {guardar && (
        <ModalGuardarImagen nombre={nombre} anchoPantalla={W} altoPantalla={H} onClose={() => setGuardar(false)}
          renderizar={(w, h, ref, blanco) => <GraficoDispersion {...props} anchoFijo={w} altoTotal={h} refSvg={ref} interactivo={false} exportar={false} estilo={blanco ? { ...estilo, fondo: 'blanco' } : estilo} />} />
      )}
    </div>
  )
}
