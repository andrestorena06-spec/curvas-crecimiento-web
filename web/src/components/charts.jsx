import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { DASH } from '../colores.js'
import { FUENTE, fmtTick, medir, ticksBonitos } from '../utils.js'

export function useAncho() {
  const ref = useRef(null)
  const [w, setW] = useState(900)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((es) => setW(Math.max(420, Math.floor(es[0].contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export const estiloTxt = (s) => ({
  fontSize: s.size,
  fill: s.color,
  fontWeight: s.bold ? 700 : 400,
  fontStyle: s.italic ? 'italic' : 'normal',
  textDecoration: [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
})

// ---------- ejes: marcas y etiquetas ----------
export const ejeDefecto = () => ({ modo: 'auto', n: 6, valores: '', pers: { ocultarAuto: false, items: [] } })

// Devuelve [{pos, texto, est}] para un eje con rango [a, b]
export function marcasEje(a, b, cfg = ejeDefecto(), nAuto = 6) {
  if (!(b > a)) return []
  const eje = ticksBonitos(a, b, cfg.modo === 'n' ? Math.max(2, Number(cfg.n) || 6) : nAuto)
  let pos = eje.ticks.filter((v) => v >= a - 1e-9 && v <= b + 1e-9)
  if (cfg.modo === 'manual') {
    pos = String(cfg.valores || '').split(',').map((x) => parseFloat(x.trim().replace(',', '.'))).filter((v) => Number.isFinite(v) && v >= a && v <= b)
  }
  const paso = eje.paso || (b - a) / 5
  let marcas = cfg.pers?.ocultarAuto ? [] : pos.map((v) => ({ pos: v, texto: fmtTick(v, paso), est: null }))
  for (const it of cfg.pers?.items || []) {
    const p = Number(it.pos)
    if (!Number.isFinite(p)) continue
    const j = marcas.findIndex((m) => Math.abs(m.pos - p) < 1e-9)
    if (j >= 0) marcas[j] = { pos: p, texto: it.texto, est: it.est }
    else marcas.push({ pos: p, texto: it.texto, est: it.est })
  }
  return marcas.sort((m, n) => m.pos - n.pos)
}

// ---------------------------------------------------------------
// GRÁFICO DE LÍNEAS
// series: [{ id, nombre, color, dash, grosor, puntos: bool, data: [{x, y, key?, tip?}], banda?: [{x, lo, hi}] }]
// extras: [{ x, y, key, color, forma: 'x'|'o'|'anillo', tip }]  marcadores aparte (por ejemplo puntos excluidos)
// capas: (esc) => <g/>   dibuja dentro del área del gráfico con las escalas esc = { X, Y, L }
// ---------------------------------------------------------------
export const LineChart = forwardRef(function LineChart({
  series, extras = [], xlim, ylim, est, ejes, xTxt, yTxt, leyenda = true, onPuntoClick, onBrush,
  capas, capasAntes, tam, onContext, altoBase = 420, nota, onReset,
}, svgRef) {
  const [wrap, Wmed] = useAncho()
  const uid = useId().replace(/:/g, '')
  const W = tam ? tam.w : Wmed
  const cfgX = ejes?.x || ejeDefecto()
  const cfgY = ejes?.y || ejeDefecto()
  const marcasX = marcasEje(xlim[0], xlim[1], cfgX, 7)
  const marcasY = marcasEje(ylim[0], ylim[1], cfgY, 6)
  const tY = est.numerosY, tX = est.numerosX

  // márgenes medidos con el texto real
  const wY = Math.max(0, ...marcasY.map((m) => medir(m.texto, m.est?.size || tY.size, (m.est || tY).bold, (m.est || tY).italic)))
  const hTit = est.titulo.texto ? est.titulo.size * 1.5 + 12 : 0
  const tituloY = est.leyendaY.texto || yTxt || ''
  const tituloX = est.leyendaX.texto || xTxt || ''
  const left = 14 + est.leyendaY.size * 1.3 + 10 + wY + 8
  const right = 18
  const top = 14 + hTit
  const hMarcasX = Math.max(tX.size, ...marcasX.map((m) => m.est?.size || 0)) * 1.4 + 10
  const hLeyX = tituloX ? est.leyendaX.size * 1.5 + 6 : 0

  const items = leyenda ? series.filter((s) => s.nombre).map((s) => ({ ...s, w: 34 + medir(s.nombre, est.leyenda.size, est.leyenda.bold, est.leyenda.italic) + 18 })) : []
  const filas = []
  let fila = [], ancho = 0
  items.forEach((it) => {
    if (ancho + it.w > W - 40 && fila.length) { filas.push(fila); fila = []; ancho = 0 }
    fila.push(it); ancho += it.w
  })
  if (fila.length) filas.push(fila)
  const altoLey = filas.length * (est.leyenda.size * 1.5 + 4) + (filas.length ? 10 : 0)
  const hPieNota = nota ? 20 : 0
  const bottom = 8 + hMarcasX + hLeyX + altoLey + hPieNota
  const plotW = Math.max(W - left - right, 60)
  const plotH = tam ? Math.max(tam.h - top - bottom, 90) : altoBase
  const H = top + plotH + bottom

  const X = (v) => left + ((v - xlim[0]) / (xlim[1] - xlim[0])) * plotW
  const Y = (v) => top + plotH - ((v - ylim[0]) / (ylim[1] - ylim[0])) * plotH
  const esc = { X, Y, L: { left, top, plotW, plotH } }

  // selección por arrastre
  const [sel, setSel] = useState(null)
  const empezar = (e) => {
    if (!onBrush || e.button !== 0) return
    const svg = e.currentTarget.ownerSVGElement
    const rect = svg.getBoundingClientRect()
    const esc2 = W / rect.width
    const x0 = (e.clientX - rect.left) * esc2
    let x1 = x0
    const aVal = (px) => xlim[0] + ((px - left) / plotW) * (xlim[1] - xlim[0])
    const mover = (ev) => { x1 = Math.min(Math.max((ev.clientX - rect.left) * esc2, left), left + plotW); setSel([x0, x1]) }
    const soltar = () => {
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar)
      setSel(null)
      if (Math.abs(x1 - x0) > 6) onBrush(Math.min(aVal(x0), aVal(x1)), Math.max(aVal(x0), aVal(x1)))
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  // detalle del punto más cercano al mover el mouse (funciona también con el zoom por arrastre activo)
  const [hover, setHover] = useState(null)
  const mover = (e) => {
    const svg = e.currentTarget
    const r = svg.getBoundingClientRect()
    const k = W / r.width
    const mx = (e.clientX - r.left) * k, my = (e.clientY - r.top) * k
    if (mx < left || mx > left + plotW || my < top || my > top + plotH) return setHover(null)
    let mejor = null, dm = 14 * 14
    const probar = (p, tip, color) => {
      if (!tip) return
      const dx = X(p.x) - mx, dy = Y(p.y) - my, d = dx * dx + dy * dy
      if (d < dm) { dm = d; mejor = { x: X(p.x), y: Y(p.y), tip, color, px: e.clientX - r.left, py: e.clientY - r.top } }
    }
    series.forEach((s) => s.data.forEach((p) => probar(p, p.tip, s.color)))
    extras.forEach((p) => probar(p, p.tip, p.color || '#d62728'))
    setHover(mejor)
  }

  const idClip = 'clip' + uid
  let yLey = top + plotH + hMarcasX + hLeyX + 20

  return (
    <div ref={wrap} className="chart-wrap" onContextMenu={onContext} style={{ position: 'relative' }}>
      {hover && (
        <div className="tip-grafico" style={{ left: Math.min(hover.px + 14, Math.max(W - 230, 0)), top: Math.max(hover.py - 10, 0) }}>
          <i className="punto-color" style={{ background: hover.color }} />{hover.tip}
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} fontFamily={FUENTE} onMouseMove={mover} onDoubleClick={onReset} onMouseLeave={() => setHover(null)}>
        <defs><clipPath id={idClip}><rect x={left} y={top} width={plotW} height={plotH} /></clipPath></defs>
        <rect width={W} height={H} fill="#fff" />
        {est.titulo.texto && <text x={W / 2} y={14 + est.titulo.size} textAnchor="middle" style={estiloTxt(est.titulo)}>{est.titulo.texto}</text>}

        {/* cuadrícula y ejes */}
        {marcasY.map((m) => <line key={'gy' + m.pos} x1={left} x2={left + plotW} y1={Y(m.pos)} y2={Y(m.pos)} stroke="#edf0f4" />)}
        {marcasX.map((m) => <line key={'gx' + m.pos} x1={X(m.pos)} x2={X(m.pos)} y1={top} y2={top + plotH} stroke="#f3f5f8" />)}
        <line x1={left} x2={left + plotW} y1={top + plotH} y2={top + plotH} stroke="#444" />
        <line x1={left} x2={left} y1={top} y2={top + plotH} stroke="#444" />
        {marcasY.map((m) => (
          <text key={'ty' + m.pos} x={left - 8} y={Y(m.pos)} textAnchor="end" dominantBaseline="central" style={estiloTxt(m.est || tY)}>{m.texto}</text>
        ))}
        {marcasX.map((m) => (
          <g key={'tx' + m.pos}>
            <line x1={X(m.pos)} x2={X(m.pos)} y1={top + plotH} y2={top + plotH + 4} stroke="#444" />
            <text x={X(m.pos)} y={top + plotH + 8} textAnchor="middle" dominantBaseline="hanging" style={estiloTxt(m.est || tX)}>{m.texto}</text>
          </g>
        ))}
        <text transform={`translate(${14 + est.leyendaY.size * 0.6},${top + plotH / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="hanging"
          style={estiloTxt(est.leyendaY)}>{tituloY}</text>
        {tituloX && <text x={left + plotW / 2} y={top + plotH + hMarcasX + est.leyendaX.size} textAnchor="middle" style={estiloTxt(est.leyendaX)}>{tituloX}</text>}

        {/* contenido recortado al área */}
        <g clipPath={`url(#${idClip})`}>
          {capasAntes && capasAntes(esc)}
          {series.map((s) => s.banda && s.banda.length > 1 && (
            <polygon key={'b' + s.id} fill={s.color} fillOpacity="0.2"
              points={[...s.banda.map((p) => `${X(p.x)},${Y(p.hi)}`), ...[...s.banda].reverse().map((p) => `${X(p.x)},${Y(p.lo)}`)].join(' ')} />
          ))}
          {series.map((s) => (
            <polyline key={'l' + s.id} fill="none" stroke={s.color} strokeWidth={s.sinLinea ? 0 : s.grosor || 1.6} strokeDasharray={DASH[s.dash] || undefined}
              strokeLinejoin="round" points={s.data.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} />
          ))}
          {series.map((s) => s.puntos && s.data.map((p, i) => (
            <circle key={s.id + '-' + i} cx={X(p.x)} cy={Y(p.y)} r={s.radio || (s.data.length > 90 ? 1.6 : 2.4)} fill={s.color}
              style={p.key && onPuntoClick ? { cursor: 'pointer' } : undefined} onClick={p.key && onPuntoClick ? () => onPuntoClick(p.key) : undefined}>
              {p.tip && <title>{p.tip}</title>}
            </circle>
          )))}
          {extras.map((e, i) => (
            <g key={'e' + i} style={onPuntoClick && e.key ? { cursor: 'pointer' } : undefined} onClick={onPuntoClick && e.key ? () => onPuntoClick(e.key) : undefined}>
              {e.forma === 'x' && (
                <g stroke={e.color || '#d62728'} strokeWidth="2">
                  <line x1={X(e.x) - 4} x2={X(e.x) + 4} y1={Y(e.y) - 4} y2={Y(e.y) + 4} /><line x1={X(e.x) - 4} x2={X(e.x) + 4} y1={Y(e.y) + 4} y2={Y(e.y) - 4} />
                </g>
              )}
              {e.forma === 'o' && <circle cx={X(e.x)} cy={Y(e.y)} r="3.5" fill={e.color || '#ef6c00'} />}
              {e.forma === 'anillo' && <circle cx={X(e.x)} cy={Y(e.y)} r="6" fill="none" stroke={e.color || '#ef6c00'} strokeWidth="1.8" />}
              {e.tip && <title>{e.tip}</title>}
            </g>
          ))}
          {capas && capas(esc)}
          {hover && <circle cx={hover.x} cy={hover.y} r="7" fill="none" stroke="#d9731f" strokeWidth="2" pointerEvents="none" />}
          {sel && <rect x={Math.min(sel[0], sel[1])} y={top} width={Math.abs(sel[1] - sel[0])} height={plotH} fill="#d9731f" fillOpacity="0.18" stroke="#d9731f" />}
        </g>
        {onBrush && <rect x={left} y={top} width={plotW} height={plotH} fill="transparent" style={{ cursor: 'crosshair' }} onPointerDown={empezar} />}

        {/* leyenda de curvas */}
        {filas.map((f, r) => {
          const tot = f.reduce((a, it) => a + it.w, 0)
          let x = left + plotW / 2 - tot / 2
          const y0 = yLey + r * (est.leyenda.size * 1.5 + 4)
          return (
            <g key={r} transform={`translate(0,${y0})`}>
              {f.map((it) => {
                const g = (
                  <g key={it.id} transform={`translate(${x},0)`}>
                    <line x1="0" x2="26" y1={-est.leyenda.size * 0.35} y2={-est.leyenda.size * 0.35} stroke={it.color} strokeWidth="2.4" strokeDasharray={DASH[it.dash] || undefined} />
                    <text x="32" style={estiloTxt(est.leyenda)}>{it.nombre}</text>
                  </g>
                )
                x += it.w
                return g
              })}
            </g>
          )
        })}
        {nota && <text x={left + plotW} y={H - 6} textAnchor="end" style={{ fontSize: 11, fill: '#6b7785' }}>{nota}</text>}
      </svg>
    </div>
  )
})
