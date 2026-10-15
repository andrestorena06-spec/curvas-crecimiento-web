// ============================================================
// Placas de 96 pocillos leídas en un solo momento (formato del programa de Biofilm): una matriz de 8 filas (A–H)
// por 12 columnas (1–12) con la densidad óptica de cada pocillo. Cada lectura tiene su tiempo; varias lecturas
// forman la curva de cada pocillo.
// ============================================================
import { LETRAS, convertirNumero, pocillos96 } from './lectura.js'
import { finito } from './analisis.js'

const aTexto = (celda) => {
  if (celda === null || celda === undefined) return ''
  if (celda instanceof Date) return celda.toISOString().slice(0, 10)
  return String(celda)
}

// Busca 8 filas consecutivas A..H con ≥ 8 valores numéricos; devuelve { datos: [{Pocillo, OD}], onda, fecha }
export function leerPlacaDeMatriz(raw) {
  if (!raw.length || raw[0].length < 2) throw new Error('El archivo no contiene suficientes filas o columnas.')
  const c1 = raw.map((f) => aTexto(f[0]).trim())
  const nc = Math.min(raw[0].length, 13)
  const cuentaNum = raw.map((f) => f.slice(1, nc).filter((v) => finito(convertirNumero(v))).length)
  const esFila = c1.map((c, i) => LETRAS.includes(c.toUpperCase()) && cuentaNum[i] >= 8)
  let ini = -1
  for (let i = 0; i <= raw.length - 8; i++) {
    let ok = true
    for (let k = 0; k < 8; k++) if (!esFila[i + k] || c1[i + k].toUpperCase() !== LETRAS[k]) { ok = false; break }
    if (ok) { ini = i; break }
  }
  if (ini < 0) throw new Error('No encontré una placa (filas A a H con valores numéricos) en esta hoja.')
  let cols = Array.from({ length: nc - 1 }, (_, j) => j + 1)
  if (ini > 0) {
    const h = raw[ini - 1].slice(1, nc).map(convertirNumero)
    if (h.filter(finito).length >= 8) cols = h.map((v) => (finito(v) ? Math.trunc(v) : NaN))
  }
  const validos = new Set(pocillos96())
  const datos = []
  for (let k = 0; k < 8; k++) {
    const v = raw[ini + k].slice(1, nc).map(convertirNumero)
    v.forEach((od, j) => {
      const p = LETRAS[k] + cols[j]
      if (finito(od) && validos.has(p)) datos.push({ Pocillo: p, OD: od })
    })
  }
  let onda = null
  for (const c of c1) {
    const m = c.match(/[Ww]ave\s*length[^0-9]*([0-9]+)/) || c.match(/[Ll]ongitud de onda[^0-9]*([0-9]+)/)
    if (m) { onda = Number(m[1]); break }
  }
  const fecha = c1.find((c) => /^[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}/.test(c)) ?? null
  return { datos, onda, fecha }
}

// Tiempo (h) que sugiere el nombre del archivo u hoja: «t2h», «T=3», «4 h», «120min»; si no hay, el orden
export function tiempoDeNombre(nombre, indice) {
  const s = String(nombre || '')
  let m = /(?:^|[^a-z])t\s*=?\s*(\d+(?:[.,]\d+)?)\s*(h|hs|hr|min)?/i.exec(s)
  if (!m) m = /(\d+(?:[.,]\d+)?)\s*(h|hs|hr|min)\b/i.exec(s)
  if (m) {
    const v = Number(m[1].replace(',', '.'))
    return m[2] && /^min$/i.test(m[2]) ? v / 60 : v
  }
  return indice
}

// Une las lecturas (cada una con su tiempo en horas) en {tiempos (s), pocillos}
export function datosDeLecturas(lecturas) {
  const ok = lecturas.filter((l) => finito(Number(l.t)) && l.datos?.length)
  if (!ok.length) return null
  const tiempos = [...new Set(ok.map((l) => Math.round(Number(l.t) * 3600 * 1000) / 1000))].sort((a, b) => a - b)
  const pocillos = {}
  for (const p of pocillos96()) {
    const fila = tiempos.map(() => NaN)
    let hay = false
    ok.forEach((l) => {
      const d = l.datos.find((x) => x.Pocillo === p)
      if (d && finito(d.OD)) { fila[tiempos.indexOf(Math.round(Number(l.t) * 3600 * 1000) / 1000)] = d.OD; hay = true }
    })
    if (hay) pocillos[p] = fila
  }
  return { tiempos, pocillos }
}
