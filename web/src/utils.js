export const FILAS = 'ABCDEFGH'.split('')
export const pocillos96 = () => FILAS.flatMap((f) => Array.from({ length: 12 }, (_, i) => f + (i + 1)))

export const CLASES = ['No productor', 'Productor débil', 'Productor moderado', 'Productor fuerte']
export const COLOR_CLASE = {
  'No productor': '#e15759',
  'Productor débil': '#f2c94c',
  'Productor moderado': '#a5d86e',
  'Productor fuerte': '#2f9e44',
  Blanco: '#b0bec5',
  Excluido: '#eceff1',
}

// ---- Distribución t de Student (exacta, igual que qt() de R) ----
function lgamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = z, x = z
  let t = x + 5.5
  t -= (x + 0.5) * Math.log(t)
  let s = 1.000000000190015
  for (let j = 0; j < 6; j++) s += c[j] / ++y
  return -t + Math.log((2.5066282746310005 * s) / x)
}
function betacf(a, b, x) {
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-13) break
  }
  return h
}
export function betaInc(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}
export const tCdf = (t, df) => {
  const p = 0.5 * betaInc(df / (df + t * t), df / 2, 0.5)
  return t > 0 ? 1 - p : p
}
// Cuantil de la t de Student: tCuantil(0.975, n - 1) equivale a qt(0.975, n - 1)
export function tCuantil(p, df) {
  let lo = 0, hi = 1000
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

export const FUENTE = "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif"

export const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : 'NA')
const SUB = '₀₁₂₃₄₅₆₇₈₉'
export const sub = (n) => String(n).replace(/\d/g, (d) => SUB[Number(d)])
export const nombreReplica = (m, r) => m + sub(r)

// Colores por muestra (equivalente a scales::hue_pal)
export function paletaMuestras(muestras) {
  const n = muestras.length
  const out = {}
  muestras.forEach((m, i) => {
    const h = (15 + (360 * i) / Math.max(n, 1)) % 360
    out[m] = `hsl(${h.toFixed(0)}, 62%, 52%)`
  })
  return out
}

// Colores de cada pocillo: tonos distintos para las réplicas de una misma muestra
export function coloresPocillos(config) {
  const muestras = [...new Set(config.map((c) => c.Muestra))]
  const base = paletaMuestras(muestras)
  const out = {}
  muestras.forEach((m) => {
    const reps = config.filter((c) => c.Muestra === m).sort((a, b) => a.Replica - b.Replica)
    const k = reps.length
    const hsl = base[m].match(/hsl\((\d+), (\d+)%, (\d+)%\)/)
    reps.forEach((r, i) => {
      const f = k === 1 ? 0.5 : i / (k - 1)
      const l = 40 + 24 * f
      out[r.Pocillo] = `hsl(${hsl[1]}, ${hsl[2]}%, ${l.toFixed(0)}%)`
    })
  })
  return out
}

// Marcas "bonitas" para un eje numérico
export function ticksBonitos(min, max, n = 6) {
  if (!(max > min)) return { ticks: [min], min, max: min + 1 }
  const rango = max - min
  const burdo = rango / Math.max(n - 1, 1)
  const mag = Math.pow(10, Math.floor(Math.log10(burdo)))
  const res = burdo / mag
  const paso = (res < 1.5 ? 1 : res < 3 ? 2 : res < 7 ? 5 : 10) * mag
  const ini = Math.floor(min / paso) * paso
  const fin = Math.ceil(max / paso) * paso
  const ticks = []
  for (let v = ini; v <= fin + paso * 1e-6; v += paso) ticks.push(Number(v.toFixed(10)))
  return { ticks, min: ini, max: fin, paso }
}

export const fmtTick = (v, paso) => {
  const dec = paso >= 1 ? 0 : Math.min(4, Math.max(0, Math.ceil(-Math.log10(paso))))
  return v.toFixed(dec)
}

let _ctx
export function medir(texto, size, bold = false, italic = false) {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d')
  _ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${FUENTE}`
  return _ctx.measureText(String(texto)).width
}

export const anchoMax = (textos, size, bold, italic) =>
  Math.max(0, ...textos.flatMap((t) => String(t).split('\n')).map((t) => medir(t, size, bold, italic)))

export async function descargarBlob(blob, nombre) {
  // En Edge/Chrome se abre el cuadro «Guardar como» para elegir carpeta y nombre; en otros navegadores se descarga directo
  if (window.showSaveFilePicker) {
    try {
      const ext = '.' + nombre.split('.').pop().toLowerCase()
      const mime = (blob.type || '').split(';')[0] || 'application/octet-stream'
      const h = await window.showSaveFilePicker({ suggestedName: nombre, types: [{ description: ext.slice(1).toUpperCase(), accept: { [mime]: [ext] } }] })
      const w = await h.createWritable()
      await w.write(blob)
      await w.close()
      return
    } catch (e) {
      if (e && e.name === 'AbortError') return // la persona canceló
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function descargarTexto(texto, nombre, tipo = 'text/csv;charset=utf-8') {
  descargarBlob(new Blob(['﻿' + texto], { type: tipo }), nombre)
}

export function aCSV(filas, columnas) {
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [columnas.join(','), ...filas.map((f) => columnas.map((c) => esc(f[c])).join(','))].join('\n')
}

// Convierte un <svg> en PNG y lo descarga
export function exportarSVG(svg, nombre, formato = 'png', escala = 3) {
  const clon = svg.cloneNode(true)
  const w = svg.viewBox.baseVal.width || svg.clientWidth
  const h = svg.viewBox.baseVal.height || svg.clientHeight
  clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clon.setAttribute('width', w)
  clon.setAttribute('height', h)
  const xml = new XMLSerializer().serializeToString(clon)
  if (formato === 'svg') {
    descargarBlob(new Blob([xml], { type: 'image/svg+xml' }), nombre + '.svg')
    return
  }
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = w * escala
    c.height = h * escala
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    c.toBlob((b) => descargarBlob(b, nombre + '.png'), 'image/png')
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
}

const t = (size, color = '#1f2933', extra = {}) => ({
  size, color, bold: false, italic: false, underline: false, strike: false, texto: '', ...extra,
})

// Cada texto del gráfico tiene su propio formato. `texto` vacío = texto por defecto.
export const estiloDefecto = () => ({
  titulo: t(18, '#1f2933', { bold: true }),
  leyendaY: t(14),
  leyendaX: t(14),
  nombresX: t(12),
  numerosY: t(12),
  valores: t(12),
  clases: t(11, '#333333'),
})

// Convierte estilos guardados con versiones anteriores al formato actual
export function normalizarEstilo(e = {}) {
  const base = estiloDefecto()
  const out = { ...base }
  if (e.ejes && !e.leyendaY) { out.leyendaY = { ...base.leyendaY, ...e.ejes }; out.leyendaX = { ...base.leyendaX, ...e.ejes } }
  if (e.etiquetas && !e.nombresX) { out.nombresX = { ...base.nombresX, ...e.etiquetas }; out.numerosY = { ...base.numerosY, ...e.etiquetas } }
  for (const k of Object.keys(base)) if (e[k] && typeof e[k] === 'object' && 'size' in e[k]) out[k] = { ...base[k], ...e[k] }
  return out
}
