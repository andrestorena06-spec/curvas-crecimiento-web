// ============================================================
// OD medida a mano (espectrofotómetro con cubeta, o cualquier lectura puntual).
//  - Cada fila es una muestra (cepa), una réplica y un tiempo, con la lectura de la suspensión sin diluir
//    y de sus diluciones (−1, −2, …) cuando la OD se salía de la zona lineal del equipo.
//  - OD neta = lectura − blanco (si el equipo no lo restó).
//  - OD corregida = media de (OD neta_k × factor^k) de las lecturas que caen dentro de la ventana lineal;
//    si ninguna cae, se usa la más cercana a la ventana y se avisa.
// Las filas se convierten en series por pocillo «virtual» para usar el mismo gráfico y análisis que las placas.
// ============================================================
import { finito, media, desvio } from './analisis.js'
import { pocillos96 } from './lectura.js'

export const manualDef = () => ({
  nd: 3,              // columnas de lectura: sin diluir, −1, −2, …
  factor: 10,         // factor de dilución entre lecturas
  vmin: 0.05, vmax: 0.8, // ventana lineal del equipo (OD neta)
  blanco: 0,          // OD del medio estéril (blanco general)
  yaCorregido: false, // las lecturas ya vienen sin el blanco
  filas: [],          // { id, muestra, replica, t (h), od: { k: lectura } }
})
export const normalizarManual = (m = {}) => ({ ...manualDef(), ...m, filas: Array.isArray(m.filas) ? m.filas : [] })

export function odCorregida(fila, par) {
  const blanco = par.yaCorregido ? 0 : Number(par.blanco) || 0
  const lect = Object.entries(fila.od || {}).map(([k, v]) => [Number(k), Number(v)]).filter(([k, v]) => finito(k) && finito(v))
  if (!lect.length) return { od: NaN, estado: 'sin_od', usados: [] }
  const corr = lect.map(([k, v]) => ({ k, neta: v - blanco, corr: (v - blanco) * par.factor ** k }))
  const validos = corr.filter((c) => c.neta > 0)
  if (!validos.length) return { od: NaN, estado: 'od_no_positiva', usados: [] }
  const dentro = validos.filter((c) => c.neta >= par.vmin && c.neta <= par.vmax)
  if (dentro.length) return { od: media(dentro.map((c) => c.corr)), estado: 'ok', usados: dentro.map((c) => c.k) }
  const centro = (par.vmin + par.vmax) / 2
  const cerca = [...validos].sort((a, b) => Math.abs(a.neta - centro) - Math.abs(b.neta - centro))[0]
  return { od: cerca.corr, estado: cerca.neta > par.vmax ? 'sobre_ventana' : 'bajo_ventana', usados: [cerca.k] }
}
export const TEXTO_OD = {
  ok: 'En la ventana lineal', sin_od: 'Sin OD', od_no_positiva: 'OD ≤ 0 (revisá el blanco)',
  sobre_ventana: 'Sobre la ventana lineal (diluí y volvé a leer)', bajo_ventana: 'Bajo la ventana lineal (poco confiable)',
}

// Filas con su OD corregida y resumen por muestra y tiempo
export function resumenOdManual(m) {
  const filas = m.filas.map((f) => ({ ...f, ...odCorregida(f, m) }))
  const grupos = new Map()
  filas.forEach((f) => {
    if (!f.muestra || !finito(f.od) || !finito(Number(f.t))) return
    const k = `${f.muestra}|${Number(f.t)}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(f.od)
  })
  const res = [...grupos].map(([k, v]) => {
    const [muestra, t] = k.split('|')
    return { Muestra: muestra, T_h: Number(t), N: v.length, OD: media(v), DE: v.length > 1 ? desvio(v) : NaN }
  }).sort((a, b) => (a.Muestra < b.Muestra ? -1 : a.Muestra > b.Muestra ? 1 : a.T_h - b.T_h))
  return { filas, res }
}

// Convierte las filas en {datos, config} (una serie por muestra y réplica; los pocillos son «virtuales»)
export function manualADatos(m) {
  const { filas } = resumenOdManual(m)
  const ok = filas.filter((f) => f.muestra && finito(f.od) && finito(Number(f.t)))
  const series = new Map()
  ok.forEach((f) => {
    const clave = `${f.muestra}|${Number(f.replica) || 1}`
    if (!series.has(clave)) series.set(clave, { muestra: f.muestra, replica: Number(f.replica) || 1, pts: new Map() })
    const s = series.get(clave)
    const k = Math.round(Number(f.t) * 3600 * 1000) / 1000
    if (!s.pts.has(k)) s.pts.set(k, [])
    s.pts.get(k).push(f.od)
  })
  const lista = [...series.values()].sort((a, b) => (a.muestra < b.muestra ? -1 : a.muestra > b.muestra ? 1 : a.replica - b.replica))
  if (!lista.length) return { datos: null, config: [], error: null }
  if (lista.length > 96) return { datos: null, config: [], error: `Hay ${lista.length} series (muestra × réplica); el máximo es 96.` }
  const tiempos = [...new Set(lista.flatMap((s) => [...s.pts.keys()]))].sort((a, b) => a - b)
  const ids = pocillos96()
  const pocillos = {}, config = []
  lista.forEach((s, i) => {
    const p = ids[i]
    pocillos[p] = tiempos.map((t) => (s.pts.has(t) ? media(s.pts.get(t)) : NaN))
    config.push({ Pocillo: p, Muestra: s.muestra, Replica: s.replica, EsBlanco: false })
  })
  return { datos: { tiempos, pocillos }, config, error: null }
}
