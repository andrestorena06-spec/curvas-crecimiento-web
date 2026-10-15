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

// ------------------------------------------------------------
// Placa de OD única: cada COLUMNA es un tiempo (t0 en la 1, t2 en la 2…). Cada POCILLO tiene su cepa (o es blanco),
// así una fila puede tener dos cepas o el blanco puede ir en cualquier lugar de la placa.
// Una curva = los pocillos de una misma fila con la misma cepa (y el mismo estado de blanco).
// pocillos: { A1: { muestra, blanco, todos?, t? } }: t (h) opcional reemplaza el tiempo de la columna;
//   todos: el blanco se aplica a todos los tiempos (su OD promedio se resta en cada tiempo).
// ------------------------------------------------------------
export const disenoOdDef = () => ({ tiempos: Object.fromEntries([0, 2, 4, 6, 8, 10, 12].map((t, i) => [i + 1, t])), pocillos: {} })
export function normalizarDisenoOd(d) {
  const base = { ...disenoOdDef(), ...(d || {}), tiempos: d?.tiempos || disenoOdDef().tiempos }
  let pocillos = d?.pocillos && typeof d.pocillos === 'object' ? d.pocillos : null
  if (!pocillos) {
    // sesiones anteriores: una cepa por fila
    pocillos = {}
    Object.entries(d?.filas || {}).forEach(([L, f]) => {
      if (f?.muestra) for (let c = 1; c <= 12; c++) pocillos[L + c] = { muestra: f.muestra, blanco: !!f.blanco }
    })
  }
  const { filas, ...resto } = base
  return { ...resto, pocillos }
}

// Orden de las filas al asignar cepas: 'agrupado' (A B C | A B C → L100 L100 SCV SCV) o 'alternado' (L100 SCV L100 SCV);
// `espacio` filas vacías entre una fila ocupada y la siguiente. Devuelve [{ muestra, rep }] (null = fila vacía), sin límite de largo.
export function ordenFilas(cepas, reps, orden = 'agrupado', espacio = 0) {
  const n = Math.max(1, Number(reps) || 1)
  const seq = []
  if (orden === 'alternado') { for (let r = 1; r <= n; r++) cepas.forEach((m) => seq.push({ muestra: m, rep: r })) }
  else cepas.forEach((m) => { for (let r = 1; r <= n; r++) seq.push({ muestra: m, rep: r }) })
  const out = []
  seq.forEach((x, i) => { if (i > 0) for (let k = 0; k < Math.max(0, Number(espacio) || 0); k++) out.push(null); out.push(x) })
  return out
}

export const tiempoDeCol = (d, c) => {
  const t = d.tiempos[c]
  return t !== '' && t !== null && t !== undefined && finito(Number(t)) ? Number(t) : NaN
}
export const tiempoDePocillo = (d, p) => {
  const w = d.pocillos[p]
  if (w && w.t !== undefined && w.t !== '' && finito(Number(w.t))) return Number(w.t)
  return tiempoDeCol(d, Number(p.slice(1)))
}

export function placaADatos(lectura, d) {
  if (!lectura || !lectura.datos?.length) return { datos: null, config: [] }
  const val = {}
  lectura.datos.forEach((x) => { val[x.Pocillo] = x.OD })
  // curvas: fila + cepa + blanco
  const grupos = new Map()
  for (const L of LETRAS) for (let c = 1; c <= 12; c++) {
    const p = L + c
    const w = d.pocillos[p]
    if (!w?.muestra) continue
    const t = tiempoDePocillo(d, p)
    // un blanco puede estar en una columna sin tiempo (por ejemplo, al final de la placa)
    if (!finito(t) && !w.blanco) continue
    const k = `${L}|${w.muestra}|${w.blanco ? 1 : 0}`
    if (!grupos.has(k)) grupos.set(k, { L, c, muestra: w.muestra, blanco: !!w.blanco, todos: false, pts: [] })
    if (w.blanco && w.todos) grupos.get(k).todos = true
    grupos.get(k).pts.push([finito(t) ? Math.round(t * 3600 * 1000) / 1000 : NaN, val[p]])
  }
  const tiempos = [...new Set([...grupos.values()].flatMap((g) => g.pts.map(([ts]) => ts)).filter(finito))].sort((a, b) => a - b)
  if (!tiempos.length) return { datos: null, config: [] }
  const pocillos = {}, config = []
  const cuenta = {}
  grupos.forEach((g) => {
    const clave = g.L + g.c   // primer pocillo de la curva
    const prom = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN)
    // en los blancos, los tiempos sin lectura toman el promedio de sus pocillos (el blanco se resta en cada tiempo)
    const resto = g.blanco ? prom(g.pts.filter(([, y]) => finito(y)).map(([, y]) => y)) : NaN
    pocillos[clave] = tiempos.map((ts) => {
      const v = prom(g.pts.filter(([x, y]) => x === ts && finito(y)).map(([, y]) => y))
      return finito(v) && !g.todos ? v : resto
    })
    cuenta[g.muestra] = (cuenta[g.muestra] || 0) + 1
    config.push({ Pocillo: clave, Muestra: g.muestra, Replica: cuenta[g.muestra], EsBlanco: g.blanco, Fila: g.L })
  })
  return { datos: { tiempos, pocillos }, config }
}
