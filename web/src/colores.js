// Colores de las muestras y de sus réplicas (mismos tonos que la app en R: scales::hue_pal + aclarado/oscurecido)

// grDevices::hcl(h, c, l) -> "#RRGGBB"
export function hclAHex(h, c = 100, l = 65) {
  const rad = (h * Math.PI) / 180
  const u = c * Math.cos(rad), v = c * Math.sin(rad)
  const refX = 95.047, refY = 100.0, refZ = 108.883
  const un = (4 * refX) / (refX + 15 * refY + 3 * refZ), vn = (9 * refY) / (refX + 15 * refY + 3 * refZ)
  const Y = refY * (l > 7.999592 ? ((l + 16) / 116) ** 3 : l / 903.3)
  const uu = u / (13 * l) + un, vv = v / (13 * l) + vn
  const X = (9 * uu * Y) / (4 * vv)
  const Z = (-X / 3 - 5 * Y + (3 * Y) / vv)
  const lin = (a, b, c2) => [3.240479 * a - 1.53715 * b - 0.498535 * c2, -0.969256 * a + 1.875992 * b + 0.041556 * c2, 0.055648 * a - 0.204043 * b + 1.057311 * c2]
  const [r, g, bl] = lin(X / 100, Y / 100, Z / 100).map((x) => {
    const y = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
    return Math.min(1, Math.max(0, y))
  })
  const hex = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(bl)}`
}

const aRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const aHex = (v) => '#' + v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')

// Mezcla un color con blanco (f > 0) o con negro (f < 0)
export function mezclarColor(col, f) {
  const v = aRgb(col)
  return aHex(v.map((x) => x + ((f < 0 ? 0 : 255) - x) * Math.abs(f)))
}

// scales::hue_pal()(n)
export function paletaMuestras(muestras) {
  const n = muestras.length
  const out = {}
  muestras.forEach((m, i) => {
    const h = n === 0 ? 15 : 15 + (360 * i) / n
    out[m] = hclAHex(h % 360, 100, 65)
  })
  return out
}

// Un tono distinto para cada réplica de una muestra
export function coloresReplicasMuestra(base, k) {
  const f = k === 1 ? [0] : Array.from({ length: k }, (_, i) => -0.3 + (0.75 * i) / (k - 1))
  return f.map((x) => mezclarColor(base, x))
}

export const TIPOS_LINEA = ['solid', 'dashed', 'dotted', 'dotdash', 'longdash', 'twodash']
export const DASH = { solid: null, dashed: '8 4', dotted: '1.5 3.5', dotdash: '1.5 3 8 3', longdash: '12 4', twodash: '3 3 9 3' }

// Color y tipo de línea de cada réplica configurada: { [Pocillo]: {color, linea} }
export function estilosPocillos(config) {
  const noBlanco = config
  const muestras = [...new Set(noBlanco.map((c) => c.Muestra))]
  const base = paletaMuestras(muestras)
  const out = {}
  muestras.forEach((m) => {
    const reps = noBlanco.filter((c) => c.Muestra === m).sort((a, b) => a.Replica - b.Replica)
    const cols = coloresReplicasMuestra(base[m], reps.length)
    reps.forEach((c, i) => { out[c.Pocillo] = { color: cols[i], linea: TIPOS_LINEA[i % TIPOS_LINEA.length], base: base[m] } })
  })
  return { porPocillo: out, porMuestra: base }
}
