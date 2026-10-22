// Utilidades generales: estadística (t de Student), formato de números, descargas y ejes

// ---- Distribución t de Student (igual que qt() de R) ----
function lgamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = z
  let t = z + 5.5
  t -= (z + 0.5) * Math.log(t)
  let s = 1.000000000190015
  for (let j = 0; j < 6; j++) s += c[j] / ++y
  return -t + Math.log((2.5066282746310005 * s) / z)
}
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - (qab * x) / qap
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
function betaInc(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}
const tCdf = (t, df) => {
  const p = 0.5 * betaInc(df / (df + t * t), df / 2, 0.5)
  return t > 0 ? 1 - p : p
}
export function tCuantil(p, df) {
  let lo = 0, hi = 1000
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

// ---- Formato ----
export const fin = Number.isFinite
export const signif = (x, d = 4) => (fin(x) ? Number(x.toPrecision(d)) : NaN)
export const fx = (x, d = 3) => (fin(x) ? x.toFixed(d).replace('.', ',') : '–')
export const fs = (x, d = 4) => (fin(x) ? String(signif(x, d)).replace('.', ',') : '–')
export const sci = (x, d = 2) => (fin(x) ? x.toExponential(d).replace('e+', ' × 10^').replace('e-', ' × 10^-').replace('.', ',') : '–')
export const sciCorto = (x, d = 2) => (fin(x) ? x.toExponential(d).replace('e+', 'E+').replace('e-', 'E-') : '–')
const SUB = '₀₁₂₃₄₅₆₇₈₉'
export const sub = (n) => String(n).replace(/\d/g, (d) => SUB[Number(d)])
export const nombreRep = (m, r) => m + sub(r)

let _n = 0
export const nuevoId = () => Math.random().toString(36).slice(2, 9) + (_n++ % 10)

// ---- Ejes ----
export function ticks(min, max, n = 6) {
  if (!(max > min)) return { ticks: [min], paso: 1 }
  const burdo = (max - min) / Math.max(n - 1, 1)
  const mag = 10 ** Math.floor(Math.log10(burdo))
  const r = burdo / mag
  const paso = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag
  const out = []
  for (let v = Math.ceil(min / paso - 1e-9) * paso; v <= max + paso * 1e-6; v += paso) out.push(Number(v.toFixed(10)))
  return { ticks: out, paso }
}
export const fmtTick = (v, paso) => {
  const dec = paso >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(paso) - 1e-9))
  return v.toFixed(dec).replace('.', ',')
}

// ---- Descargas ----
export async function descargarBlob(blob, nombre) {
  // app de Android: guardar y abrir «Compartir»
  if (window.Capacitor?.isNativePlatform?.()) { const { guardarNativo } = await import('./nativo.js'); return guardarNativo(blob, nombre) }
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
      if (e && e.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
export const descargarTexto = (texto, nombre, tipo = 'text/plain;charset=utf-8') => descargarBlob(new Blob(['﻿' + texto], { type: tipo }), nombre)

// <svg> a PNG o SVG (el gráfico usa colores explícitos, así que el archivo sale igual que en pantalla)
// formato: 'png' | 'jpg' | 'svg'. fondo: color de relleno, null = transparente (se quita el fondo del gráfico),
// undefined = el fondo que ya tiene el gráfico. escala: multiplicador de píxeles para PNG y JPG.
export function exportarSVG(svg, nombre, formato = 'png', fondo = '#ffffff', escala = 3) {
  const clon = svg.cloneNode(true)
  const w = svg.viewBox.baseVal.width || svg.clientWidth
  const h = svg.viewBox.baseVal.height || svg.clientHeight
  clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clon.setAttribute('width', w)
  clon.setAttribute('height', h)
  if (fondo === null) clon.querySelectorAll('.fondo-graf').forEach((x) => x.remove())
  const xml = new XMLSerializer().serializeToString(clon)
  if (formato === 'svg') return descargarBlob(new Blob([xml], { type: 'image/svg+xml' }), nombre + '.svg')
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = Math.round(w * escala)
    c.height = Math.round(h * escala)
    const g = c.getContext('2d')
    const relleno = formato === 'jpg' && !fondo ? '#ffffff' : fondo
    if (relleno) { g.fillStyle = relleno; g.fillRect(0, 0, c.width, c.height) }
    g.drawImage(img, 0, 0, c.width, c.height)
    if (formato === 'jpg') c.toBlob((b) => descargarBlob(b, nombre + '.jpg'), 'image/jpeg', 0.95)
    else c.toBlob((b) => descargarBlob(b, nombre + '.png'), 'image/png')
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
}

// Letras de las filas de una placa de 96
export const LETRAS = 'ABCDEFGH'.split('')
export const pocillos96 = () => LETRAS.flatMap((f) => Array.from({ length: 12 }, (_, i) => f + (i + 1)))
export const ordenPocillo = (p) => LETRAS.indexOf(p[0]) * 12 + Number(p.slice(1)) - 1

// ---- Series de carga («Crear filas vacías» en Lecturas de OD y en Colonias) ----
// tiempos 0, cada, 2·cada… (n tiempos); avance al cargar: réplica siguiente y, después de la última, el tiempo siguiente
export const tiemposDeSerie = (serie) => Array.from({ length: Math.max(0, Math.round(Number(serie.n) || 0)) }, (_, i) => Math.round(i * (Number(serie.cada) || 0) * 1000) / 1000)
export const textoTiemposSerie = (serie) => { const ts = tiemposDeSerie(serie); return ts.length > 4 ? `${ts.slice(0, 3).join(', ')} … ${ts[ts.length - 1]}` : ts.join(', ') }
export function siguienteReplica(serie, ff) {
  const reps = Math.max(1, Math.round(Number(serie.reps) || 1)), r = Number(ff.replica) || 1
  return r < reps ? { replica: r + 1, t: ff.t } : { replica: 1, t: Math.round((Number(ff.t) + (Number(serie.cada) || 0)) * 1000) / 1000 }
}
