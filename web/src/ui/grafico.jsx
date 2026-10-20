import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TEMAS, useTema } from '../tema.js'
import { exportarSVG, fmtTick, ticks } from '../utils.js'
import { Icono } from './base.jsx'

const fin = Number.isFinite

// Ancho real del contenedor: el gráfico se dibuja a tamaño 1:1 (sin escalar) para que el texto
// tenga el mismo tamaño que el resto del programa, sea cual sea el ancho de la ventana.
export function useAncho(def = 900) {
  const ref = useRef()
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => { const x = Math.round(el.clientWidth); if (x > 0) setW(x) }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w || def]
}
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v))

function rango(vals, pad = 0.06, cero = false) {
  const v = vals.filter(fin)
  if (!v.length) return [0, 1]
  let a = Math.min(...v), b = Math.max(...v)
  if (cero) a = Math.min(a, 0)
  if (a === b) { a -= 0.5; b += 0.5 }
  const d = (b - a) * pad
  return [cero && a >= 0 ? a : a - d, b + d]
}

// Estilo personalizable de un gráfico (todo opcional; vacío = automático)
export const estiloGraficoDef = () => ({
  titulo: undefined, xTxt: undefined, yTxt: undefined, yTxtDer: undefined,
  tamTitulo: 15, tamEjes: 12.5, tamNumeros: 11.5, tamLeyenda: 11.5, tamValores: 10.5,
  grosor: 1, radio: 1, grilla: true, leyenda: 'abajo', fondo: 'tema', fuente: 'IBM Plex Sans',
  xmin: '', xmax: '', ymin: '', ymax: '', alto: '',
})

// series: [{ id, nombre, color, dash, ancho, puntos, radio, linea=true, banda, errores, der, etiqueta(d) → texto, data: [{ x, y, lo, hi, key, tip }] }]
// extras: puntos sueltos [{ x, y, key, tip, color, forma: 'x' | 'o' | 'anillo' }]
export function Grafico({
  series, extras = [], xTxt = 'Tiempo (h)', yTxt = '', yTxtDer = '', titulo = '', xlim, ylim, ylimDer, alto = 380, ancho = 900,
  onPuntoClick, ventana, onSeleccion, leyenda = true, nombre = 'grafico', exportar = true, ceroY = false, estilo = {},
}) {
  const Tt = useTema()
  const e = { ...estiloGraficoDef(), ...estilo }
  const T = e.fondo === 'blanco' ? TEMAS.claro : Tt
  const ref = useRef()
  const [cont, anchoReal] = useAncho(ancho)
  const [hover, setHover] = useState(null)
  const [arrastre, setArrastre] = useState(null)
  const tit = e.titulo !== undefined ? e.titulo : titulo
  const xT = e.xTxt !== undefined ? e.xTxt : xTxt, yT = e.yTxt !== undefined ? e.yTxt : yTxt, zT = e.yTxtDer !== undefined ? e.yTxtDer : yTxtDer
  const altoBase = fin(num(e.alto)) && num(e.alto) > 120 ? num(e.alto) : alto
  const izq = series.filter((s) => !s.der), der = series.filter((s) => s.der)
  const ys = (ss) => ss.flatMap((s) => s.data.flatMap((d) => [d.y, d.lo, d.hi]))
  let [x0, x1] = xlim || rango([...series.flatMap((s) => s.data.map((d) => d.x)), ...extras.map((q) => q.x)], 0.03)
  let [y0, y1] = ylim || rango([...ys(izq), ...extras.map((q) => q.y)], 0.07, ceroY)
  if (fin(num(e.xmin))) x0 = num(e.xmin)
  if (fin(num(e.xmax))) x1 = num(e.xmax)
  if (fin(num(e.ymin))) y0 = num(e.ymin)
  if (fin(num(e.ymax))) y1 = num(e.ymax)
  const [z0, z1] = ylimDer || rango(ys(der), 0.08)
  const tx = ticks(x0, x1, 9), ty = ticks(y0, y1, 7), tz = ticks(z0, z1, 7)
  const nomLeyenda = series.filter((s) => s.nombre)
  const conLeyenda = leyenda && e.leyenda !== 'no' && nomLeyenda.length > 0
  const leyDer = conLeyenda && e.leyenda === 'derecha'
  const anchoLey = leyDer ? Math.min(240, 40 + Math.max(...nomLeyenda.map((s) => s.nombre.length)) * e.tamLeyenda * 0.58) : 0
  const L = 34 + e.tamNumeros * 2.8, R = (der.length ? 66 : 18) + anchoLey, TOP = tit ? 18 + e.tamTitulo * 1.6 : 14
  const colLey = Math.max(1, Math.floor((anchoReal - L - R) / 200))
  const filasLey = conLeyenda && !leyDer ? Math.ceil(nomLeyenda.length / colLey) : 0
  const altoFila = e.tamLeyenda * 1.75
  const B = 24 + e.tamNumeros * 1.4 + e.tamEjes * 1.6 + filasLey * altoFila
  const W = anchoReal, H = altoBase + filasLey * altoFila
  const px = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R)
  const py = (y) => TOP + (1 - (y - y0) / (y1 - y0 || 1)) * (H - TOP - B)
  const pz = (y) => TOP + (1 - (y - z0) / (z1 - z0 || 1)) * (H - TOP - B)
  const dentro = (x) => x >= x0 - 1e-9 && x <= x1 + 1e-9
  const fuente = `'${e.fuente}', system-ui, sans-serif`

  const todos = useMemo(() => {
    const out = []
    series.forEach((s) => s.data.forEach((d) => { if (fin(d.x) && fin(d.y)) out.push({ ...d, s }) }))
    extras.forEach((q) => { if (fin(q.x) && fin(q.y)) out.push({ ...q, s: { color: q.color, nombre: '' } }) })
    return out
  }, [series, extras])

  const pos = (ev) => {
    const r = ref.current.getBoundingClientRect()
    const k = W / r.width
    return { mx: (ev.clientX - r.left) * k, my: (ev.clientY - r.top) * k, cx: ev.clientX - r.left, cy: ev.clientY - r.top }
  }
  const cercano = (mx, my) => {
    let mejor = null, dm = 14 * 14
    todos.forEach((d) => {
      const X = px(d.x), Y = d.s.der ? pz(d.y) : py(d.y)
      const dd = (X - mx) ** 2 + (Y - my) ** 2
      if (dd < dm) { dm = dd; mejor = { d, X, Y } }
    })
    return mejor
  }
  const invX = (mx) => x0 + ((mx - L) / (W - L - R)) * (x1 - x0)

  const linea = (s, f) => s.data.filter((d) => fin(d.x) && fin(d.y) && dentro(d.x)).map((d) => `${px(d.x).toFixed(1)},${f(d.y).toFixed(1)}`).join(' ')
  const banda = (s, f) => {
    const d = s.data.filter((q) => fin(q.lo) && fin(q.hi) && dentro(q.x))
    if (d.length < 2) return null
    return [...d.map((q) => `${px(q.x)},${f(q.hi)}`), ...d.slice().reverse().map((q) => `${px(q.x)},${f(q.lo)}`)].join(' ')
  }
  const cruz = (X, Y, r = 3.2) => `M${X - r},${Y - r}L${X + r},${Y + r}M${X - r},${Y + r}L${X + r},${Y - r}`
  const fondoExport = e.fondo === 'blanco' ? '#ffffff' : T.panel

  return (
    <div className="grafico" ref={cont}>
      {exportar && (
        <div className="fila no-imprimir" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
          <button className="fantasma chico" onClick={() => exportarSVG(ref.current, nombre, 'png', fondoExport)}><Icono n="bajar" size={14} />PNG</button>
          <button className="fantasma chico" onClick={() => exportarSVG(ref.current, nombre, 'svg')}><Icono n="bajar" size={14} />SVG</button>
        </div>
      )}
      {hover && <div className="tip-graf" style={{ left: Math.min(hover.cx + 14, (ref.current?.clientWidth || 600) - 240), top: hover.cy + 10 }}>
        {hover.color && <i className="punto" style={{ background: hover.color, marginRight: 6, verticalAlign: -1 }} />}{hover.tip}</div>}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} fontFamily={fuente}
        style={{ cursor: onSeleccion ? 'crosshair' : undefined, userSelect: 'none', borderRadius: e.fondo === 'blanco' ? 8 : 0 }}
        onMouseMove={(ev) => {
          const p = pos(ev)
          if (arrastre) setArrastre({ ...arrastre, b: invX(p.mx) })
          const c = cercano(p.mx, p.my)
          setHover(c ? { cx: p.cx, cy: p.cy, X: c.X, Y: c.Y, color: c.d.s.color, tip: c.d.tip || `${c.d.s.nombre ? c.d.s.nombre + '\n' : ''}x = ${c.d.x.toFixed(2)}\ny = ${c.d.y.toFixed(4)}`, key: c.d.key } : null)
        }}
        onMouseLeave={() => { setHover(null); setArrastre(null) }}
        onMouseDown={(ev) => { if (onSeleccion && ev.button === 0) { const p = pos(ev); setArrastre({ a: invX(p.mx), b: invX(p.mx) }) } }}
        onMouseUp={() => {
          if (arrastre) {
            const a = Math.min(arrastre.a, arrastre.b), b = Math.max(arrastre.a, arrastre.b)
            setArrastre(null)
            if (b - a > (x1 - x0) * 0.01) return onSeleccion([a, b])
          }
          if (hover?.key && onPuntoClick) onPuntoClick(hover.key)
        }}>
        <rect width={W} height={H} fill={e.fondo === 'blanco' ? '#ffffff' : T.panel} />
        {tit && <text x={(L + W - R) / 2} y={10 + e.tamTitulo} textAnchor="middle" fontSize={e.tamTitulo} fontWeight="600" fill={T.texto}>{tit}</text>}
        {ty.ticks.filter((v) => v >= y0 - 1e-9 && v <= y1 + 1e-9).map((v) => (
          <g key={'y' + v}>
            {e.grilla && <line x1={L} x2={W - R} y1={py(v)} y2={py(v)} stroke={T.grilla} />}
            <text x={L - 8} y={py(v)} textAnchor="end" dominantBaseline="central" fontSize={e.tamNumeros} fill={T.sec}>{fmtTick(v, ty.paso)}</text>
          </g>
        ))}
        {der.length > 0 && tz.ticks.filter((v) => v >= z0 && v <= z1).map((v) => (
          <text key={'z' + v} x={W - R + 8} y={pz(v)} dominantBaseline="central" fontSize={e.tamNumeros} fill={T.sec}>{fmtTick(v, tz.paso)}</text>
        ))}
        {tx.ticks.filter((v) => v >= x0 - 1e-9 && v <= x1 + 1e-9).map((v) => (
          <g key={'x' + v}>
            {e.grilla && <line x1={px(v)} x2={px(v)} y1={TOP} y2={H - B + filasLey * altoFila - filasLey * altoFila} stroke={T.grilla} strokeDasharray="2 4" />}
            <text x={px(v)} y={H - B + 6 + e.tamNumeros} textAnchor="middle" fontSize={e.tamNumeros} fill={T.sec}>{fmtTick(v, tx.paso)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={T.eje} />
        <line x1={L} x2={L} y1={TOP} y2={H - B} stroke={T.eje} />
        {der.length > 0 && <line x1={W - R} x2={W - R} y1={TOP} y2={H - B} stroke={T.eje} />}
        <text x={(L + W - R) / 2} y={H - B + 14 + e.tamNumeros + e.tamEjes} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{xT}</text>
        <text transform={`translate(${6 + e.tamEjes * 0.6} ${(TOP + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{yT}</text>
        {der.length > 0 && <text transform={`translate(${W - R + 50} ${(TOP + H - B) / 2}) rotate(90)`} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{zT}</text>}
        {ventana && fin(ventana[0]) && (
          <rect x={px(Math.max(ventana[0], x0))} y={TOP} width={Math.max(0, px(Math.min(ventana[1], x1)) - px(Math.max(ventana[0], x0)))} height={H - TOP - B} fill={T.acento} opacity="0.1" />
        )}
        {arrastre && <rect x={px(Math.min(arrastre.a, arrastre.b))} y={TOP} width={Math.abs(px(arrastre.b) - px(arrastre.a))} height={H - TOP - B} fill={T.acento} opacity="0.18" />}
        <defs><clipPath id={`clip-${nombre}`}><rect x={L} y={TOP - 4} width={W - L - R} height={H - TOP - B + 8} /></clipPath></defs>
        <g clipPath={`url(#clip-${nombre})`}>
          {series.map((s) => {
            const f = s.der ? pz : py
            const b = s.banda ? banda(s, f) : null
            return b && <polygon key={'b' + s.id} points={b} fill={s.color} opacity="0.16" />
          })}
          {series.map((s) => {
            const f = s.der ? pz : py
            const r = (s.radio || (s.forma === 'cuadrado' ? 3.5 : 2.8)) * e.radio
            return (
              <g key={s.id}>
                {s.linea !== false && <polyline points={linea(s, f)} fill="none" stroke={s.color} strokeWidth={(s.ancho || 1.7) * e.grosor} strokeDasharray={s.dash || undefined} strokeLinejoin="round" strokeLinecap="round" opacity={s.opacidad ?? 1} />}
                {s.errores && s.data.filter((d) => fin(d.lo) && fin(d.hi) && dentro(d.x)).map((d, i) => (
                  <path key={i} d={`M${px(d.x)},${f(d.lo)}V${f(d.hi)}M${px(d.x) - 4},${f(d.lo)}h8M${px(d.x) - 4},${f(d.hi)}h8`} stroke={s.color} strokeWidth={1.2 * e.grosor} fill="none" />
                ))}
                {s.puntos && s.data.filter((d) => fin(d.y) && dentro(d.x)).map((d, i) => (
                  s.forma === 'cuadrado'
                    ? <rect key={i} x={px(d.x) - r} y={f(d.y) - r} width={r * 2} height={r * 2} fill={s.color} stroke={T.panel} strokeWidth="1" />
                    : <circle key={i} cx={px(d.x)} cy={f(d.y)} r={r} fill={s.color} stroke={e.fondo === 'blanco' ? '#fff' : T.panel} strokeWidth="0.8" />
                ))}
              </g>
            )
          })}
          {extras.filter((q) => fin(q.y) && dentro(q.x)).map((q, i) => {
            const X = px(q.x), Y = py(q.y)
            if (q.forma === 'o') return <circle key={i} cx={X} cy={Y} r={3.6 * e.radio} fill={q.color} />
            if (q.forma === 'anillo') return <circle key={i} cx={X} cy={Y} r={4 * e.radio} fill="none" stroke={q.color} strokeWidth="1.6" />
            return <path key={i} d={cruz(X, Y, 3.2 * e.radio)} stroke={q.color} strokeWidth="1.8" />
          })}
        </g>
        {/* valores sobre los puntos (fuera del recorte para que no se corten) */}
        {series.filter((s) => s.etiqueta).map((s) => {
          const f = s.der ? pz : py
          return s.data.filter((d) => fin(d.y) && dentro(d.x)).map((d, i) => {
            const t = s.etiqueta(d)
            if (!t) return null
            const Y = (fin(d.hi) && s.errores ? f(d.hi) : f(d.y)) - 7
            return <text key={s.id + 'v' + i} x={px(d.x)} y={Y} textAnchor="middle" fontSize={e.tamValores} fill={s.color} fontWeight="600" stroke={e.fondo === 'blanco' ? '#fff' : T.panel} strokeWidth="3" paintOrder="stroke">{t}</text>
          })
        })}
        {hover && <circle cx={hover.X} cy={hover.Y} r="6" fill="none" stroke={T.acento} strokeWidth="1.6" pointerEvents="none" />}
        {conLeyenda && nomLeyenda.map((s, i) => {
          const fx = leyDer ? W - anchoLey + 6 : L + (i % colLey) * 200
          const fy = leyDer ? TOP + 10 + i * altoFila : H - filasLey * altoFila + Math.floor(i / colLey) * altoFila + altoFila / 2 - 4
          const max = leyDer ? 32 : 27
          return (
            <g key={'l' + s.id}>
              {s.linea === false ? <circle cx={fx + 10} cy={fy} r="4" fill={s.color} /> : <line x1={fx} x2={fx + 20} y1={fy} y2={fy} stroke={s.color} strokeWidth={2.4 * e.grosor} strokeDasharray={s.dash || undefined} opacity={s.opacidad ?? 1} />}
              {s.forma === 'cuadrado' && <rect x={fx + 6} y={fy - 4} width="8" height="8" fill={s.color} />}
              <text x={fx + 26} y={fy} dominantBaseline="central" fontSize={e.tamLeyenda} fill={T.texto}>{s.nombre.length > max ? s.nombre.slice(0, max - 1) + '…' : s.nombre}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
