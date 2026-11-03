// ============================================================
// Recuento de UFC (colonias por placa o por gota) a partir de diluciones seriadas.
//   Dilución «−k»: la suspensión está factor^k veces más diluida que la original (k = 0: sin diluir).
//   Cada placa (o gota) con C colonias y volumen V (mL) aporta C / V × factor^k UFC/mL.
//   Cada réplica usa UNA sola dilución (la elegida a mano o la sugerida; ver sugerirDilucion): no se promedian
//   diluciones dentro de una réplica (no se usa la media ponderada de ISO 7218).
//   IC 95 % del conteo: Poisson exacto (Garwood).
//   Réplicas de una cepa en un tiempo (misma dilución): se suman las colonias y se dividen por la suma de los
//   volúmenes de suspensión original sembrados: UFC/mL = Σ Cᵢ / Σ (Vᵢ / dᵢ), con su IC 95 % de Poisson sobre Σ C
//   (solo error de conteo). La dispersión entre réplicas se evalúa con el χ² de sobredispersión (ver calcularUfc).
// Los recuentos pueden venir de la grilla de gotas sobre una placa de 96 (cada FILA es una réplica y cada
// COLUMNA j es la dilución −j) o de una tabla (una fila por muestra, tiempo y réplica, una columna por dilución).
// ============================================================
import { LETRAS, convertirNumero } from './lectura.js'
import { desvio, finito, interpolar, media, regLineal } from './analisis.js'
import { baranyiF, erroresAjuste, huangF, levenbergMarquardt } from './modelos.js'
import { tCuantil } from '../utils.js'

// ---------- parámetros ----------
export const ufcDef = () => ({
  vol: 0.02,            // mL por gota
  factor: 5,            // cada pocillo está `factor` veces más diluido que el anterior (= volumen final / toma)
  toma: 40, final: 200, // µL que se pasan de un pocillo al siguiente y volumen final de cada pocillo
  primero: 'dilucion',  // 'madre': el pocillo 1 es la solución madre · 'dilucion': el pocillo 1 ya es una dilución
  madre: { usar: false, toma: 20, final: 200 },  // solución madre (opcional): se toma `toma` µL para llegar al pocillo 1 con volumen `final`
  c0: 1e6,              // UFC/mL esperadas en el pocillo de partida a T = 0 (solo guía)
  min: 3, max: 30,      // colonias por gota que se consideran contables
  tiempos: [0, 1, 2, 3, 4, 5, 6],
  esperadoDe: 'od',     // 'od' (según la curva de OD) o 'manual'
  estimados: true,      // incluir en las medias las estimaciones fuera del rango contable
})
export const tablaDef = () => ({ vol: 100, factor: 10, min: 25, max: 250, nd: 6, filas: [] })  // vol en µL

// metodo: 'gota' (gotas sobre una placa de 96 con diluciones seriadas) o 'extendida' (placas de Petri, tabla o sectores)
// petri: [{ id, nombre, n (sectores), sectores: [{ muestra, t, lineas: [{ id, k (dilución −k), rep, n (colonias) }] }] }]
// placasG: placas de 96 con gotas: [{ id, nombre, filas: { A: { muestra, t, rep, desde, hasta } }, conteos: { A1: n } }]
//   cada FILA es una réplica de una muestra a un tiempo; cada COLUMNA, una dilución seriada (de `desde` a `hasta`)
export const ufcVacio = () => ({ metodo: 'gota', par: ufcDef(), placasG: [], esperado: {}, tabla: tablaDef(), petri: [] })

// factor que hay que aplicar a la columna j respecto de la suspensión original: D(j) = mult × f^j
export const multDe = (par) => {
  const f = par.factor
  if (par.primero === 'madre') return 1 / f
  const f0 = par.madre?.usar && par.madre.toma > 0 ? par.madre.final / par.madre.toma : f
  return f0 / f
}
export const dilucionDe = (par, j) => multDe(par) * par.factor ** j
// «10^−x» con el orden de magnitud de la dilución (para los encabezados)
export const potenciaDe = (par, j) => -Math.log10(dilucionDe(par, j))
const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '.': '·' }
export const texto10 = (x) => '10' + String(Number(x.toFixed(2))).replace(/[-0-9.]/g, (c) => SUP[c])

// sesiones anteriores: una grilla de muestras por pocillo + un bloque de conteos por tiempo -> una placa por tiempo
export function placasDeGrilla(layout, conteos, esperado) {
  const filasLetra = [...new Set(layout.map((c) => c.Pocillo[0]))].sort()
  const muestraDe = (L) => layout.find((c) => c.Pocillo[0] === L)?.Muestra
  const repDe = {}
  const reps = {}
  filasLetra.forEach((L) => { const m = muestraDe(L); reps[m] = (reps[m] || 0) + 1; repDe[L] = reps[m] })
  const ts = Object.keys(conteos).map(Number).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return ts.map((t, i) => ({
    id: 'g' + i + Math.random().toString(36).slice(2, 6), nombre: `Placa T=${t} h`,
    filas: Object.fromEntries(filasLetra.map((L) => [L, { muestra: muestraDe(L), t, rep: repDe[L], desde: 1, hasta: 12 }])),
    conteos: { ...(conteos[claveT(t)] || {}) },
  }))
}

export const normalizarUfc = (u = {}) => {
  const d = ufcVacio()
  const petri = Array.isArray(u.petri) ? u.petri : []
  const filasTabla = Array.isArray(u.tabla?.filas) ? u.tabla.filas : []
  return {
    metodo: u.metodo || (!(Array.isArray(u.layout) && u.layout.length) && (filasTabla.length || petri.length) ? 'extendida' : 'gota'),
    petri,
    par: { ...d.par, ...(u.par || {}), madre: { ...d.par.madre, ...(u.par?.madre || {}) } },
    placasG: Array.isArray(u.placasG) ? u.placasG : (Array.isArray(u.layout) && u.layout.length && u.conteos ? placasDeGrilla(u.layout, u.conteos) : []),
    esperado: u.esperado && typeof u.esperado === 'object' ? u.esperado : {},
    tabla: { ...d.tabla, ...(u.tabla || {}), filas: Array.isArray(u.tabla?.filas) ? u.tabla.filas : [] },
  }
}
export const lineasPetri = (u) => (u.petri || []).flatMap((p) => (p.sectores || []).flatMap((s, i) => (s?.lineas || []).map((l) => ({ ...l, placa: p.nombre, sector: i + 1, muestra: s.muestra, t: s.t }))))
export const hayConteos = (u) => (u.metodo === 'extendida'
  ? (u.tabla?.filas || []).some((f) => Object.values(f.c || {}).some(finito)) || lineasPetri(u).some((l) => finito(l.n))
  : (u.placasG || []).some((p) => Object.values(p.conteos || {}).some(finito)))

const colDe = (p) => Number(p.slice(1))
const filaDe = (p) => p[0]
export const claveT = (t) => String(Math.round(Number(t) * 1000) / 1000)

// ---------- Poisson exacto (Garwood) ----------
function lgamma(z) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < 9; i++) x += c[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
// gamma incompleta regularizada inferior P(a, x). P(χ² ≤ x | k g.l.) = gammaP(k/2, x/2)
export function gammaP(a, x) {
  if (x <= 0) return 0
  if (x < a + 1) {
    let sum = 1 / a, term = sum, n = a
    for (let i = 0; i < 1000; i++) { n++; term *= x / n; sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a))
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a)
    b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h
}
export function qgamma(p, a) {
  let lo = 0, hi = Math.max(10, a + 12 * Math.sqrt(a) + 30)
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (gammaP(a, m) < p) lo = m; else hi = m }
  return (lo + hi) / 2
}
// IC 95 % exacto del número esperado de colonias cuando se contaron S
export const icPoisson = (S) => [S > 0 ? qgamma(0.025, S) : 0, qgamma(0.975, S + 1)]

// ---------- estimación de UFC/mL de una réplica ----------
// cont: { k: colonias } (k = columna de la dilución); par: { vol (mL), factor, min, max, D: [dilución total por columna], usar: k elegido a mano }
// Se usa UNA sola dilución por réplica: la elegida a mano o, si no, la sugerida (ver sugerirDilucion).
// estado: ok | bajo (estimado bajo el rango) | alto (estimado sobre el rango) | cero (< límite de detección) | incontable (> límite) | sin_datos
export const dilDe = (par, k) => (par.D && finito(par.D[k]) ? par.D[k] : (par.mult || 1) * par.factor ** k)
const entradas = (cont) => Object.entries(cont || {}).map(([k, c]) => [Number(k), Number(c)]).filter(([k, c]) => finito(k) && finito(c) && c >= 0)

// Dilución sugerida: la única con conteo; si hay varias, la que cae dentro del rango contable (si hay más de una,
// la de más colonias, que tiene menor error relativo de Poisson); si ninguna está en rango, la más cercana al rango;
// si todas dieron 0, la menos diluida (da el límite de detección más bajo).
export function sugerirDilucion(cont, par) {
  const e = entradas(cont)
  if (!e.length) return null
  if (e.length === 1) return e[0][0]
  const enRango = e.filter(([, c]) => c >= par.min && c <= par.max).sort((x, y) => y[1] - x[1])
  if (enRango.length) return enRango[0][0]
  const bajo = e.filter(([, c]) => c > 0 && c < par.min).sort((x, y) => y[1] - x[1])
  if (bajo.length) return bajo[0][0]
  const sobre = e.filter(([, c]) => c > par.max).sort((x, y) => x[1] - y[1])
  if (sobre.length) return sobre[0][0]
  return e.sort((x, y) => dilDe(par, x[0]) - dilDe(par, y[0]))[0][0]
}

// Todas las réplicas de una cepa en un mismo tiempo usan la MISMA dilución. Sugerencia: la dilución con más
// réplicas dentro del rango contable; a igualdad, la que tienen más réplicas y después la de más colonias
// (sin pasar el doble del máximo). Si ninguna réplica tiene conteos en rango, la que daría la mejor estimación.
export function sugerirDilucionGrupo(conts, par) {
  const ks = [...new Set(conts.flatMap((c) => entradas(c).map(([k]) => k)))]
  if (!ks.length) return null
  const puntaje = (k) => {
    const v = conts.map((c) => Number((c || {})[k])).filter((x) => finito(x) && x >= 0)
    const enRango = v.filter((x) => x >= par.min && x <= par.max).length
    const contables = v.filter((x) => x > 0 && x <= 2 * par.max)
    return [enRango, v.length, contables.length, contables.reduce((s, x) => s + Math.min(x, par.max), 0)]
  }
  const mejor = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false }
  let kb = ks[0], pb = puntaje(ks[0])
  ks.slice(1).forEach((k) => { const p = puntaje(k); if (mejor(p, pb)) { kb = k; pb = p } })
  return kb
}

export function estimarUfc(cont, par) {
  const e = entradas(cont)
  const vacio = { ufc: NaN, lo: NaN, hi: NaN, estado: 'sin_datos', usados: [], S: 0, lim: NaN, sugerida: null, manual: false }
  if (!e.length) return vacio
  const sugerida = sugerirDilucion(cont, par)
  const fija = par.usar !== undefined && par.usar !== null && par.usar !== ''
  // dilución fijada para el grupo (cepa y tiempo): si esta réplica no la tiene, no se calcula con otra
  if (fija && !e.some(([k]) => k === Number(par.usar))) return { ...vacio, estado: 'sin_dilucion', usados: [], sugerida, manual: !!par.manual }
  const k = fija ? Number(par.usar) : sugerida
  const manual = fija ? !!par.manual : false
  const c = e.find(([kk]) => kk === k)[1]
  const D = par.vol / dilDe(par, k)                 // mL de suspensión original sembrados
  const base = { usados: [k], S: c, sugerida, manual, D }
  if (c === 0) return { ...vacio, ...base, estado: 'cero', lim: 3 / D }   // límite de detección (≈ 3 colonias esperadas)
  if (c > 2 * par.max) return { ...vacio, ...base, estado: 'incontable' }
  const [lo, hi] = icPoisson(c)
  const estado = c < par.min ? 'bajo' : c > par.max ? 'alto' : 'ok'
  return { ufc: c / D, lo: lo / D, hi: hi / D, estado, lim: NaN, ...base }
}


// ---------- recuentos de una experiencia ----------
// Una fila por réplica: { Muestra, T_h, Replica, Fila, origen, cont, par }
export function registrosConteo(u) {
  const out = []
  const { par } = u
  if (u.metodo !== 'extendida') {
    const grupos = new Map()
    const parG = { vol: par.vol, factor: par.factor, min: par.min, max: par.max, mult: multDe(par) }
    ;(u.placasG || []).forEach((p) => Object.entries(p.filas || {}).forEach(([L, f]) => {
      if (!f || !f.muestra || !finito(Number(f.t))) return
      const c = {}
      for (let j = Number(f.desde) || 1; j <= (Number(f.hasta) || 12); j++) { const n = (p.conteos || {})[L + j]; if (finito(n)) c[j] = n }
      const k = `${f.muestra}|${Number(f.t)}|${Number(f.rep) || 1}`
      if (grupos.has(k)) Object.assign(grupos.get(k).cont, c)
      else grupos.set(k, { Muestra: f.muestra, T_h: Number(f.t), Replica: Number(f.rep) || 1, Fila: L, origen: 'gotas', cont: c, par: parG })
    }))
    grupos.forEach((g) => out.push(g))
    return out
  }
  const tb = u.tabla
  // sectores de placas de Petri: cada línea es una dilución de una réplica
  const grupos = new Map()
  lineasPetri(u).forEach((l) => {
    if (!l.muestra || !finito(Number(l.t)) || !finito(l.n)) return
    const k = `${l.muestra}|${Number(l.t)}|${Number(l.rep) || 1}`
    if (!grupos.has(k)) grupos.set(k, { Muestra: l.muestra, T_h: Number(l.t), Replica: Number(l.rep) || 1, cont: {} })
    grupos.get(k).cont[Number(l.k)] = Number(l.n)
  })
  grupos.forEach((g) => out.push({ ...g, Fila: '', origen: 'petri', par: { vol: tb.vol / 1000, factor: tb.factor, min: tb.min, max: tb.max } }))
  ;(tb?.filas || []).forEach((f) => {
    if (!f.muestra || !finito(Number(f.t))) return
    const c = {}
    Object.entries(f.c || {}).forEach(([k, n]) => { if (finito(n)) c[Number(k)] = Number(n) })
    out.push({ Muestra: f.muestra, T_h: Number(f.t), Replica: Number(f.replica) || 1, Fila: '', origen: 'tabla', cont: c,
      par: { vol: (Number(f.vol) || tb.vol) / 1000, factor: tb.factor, min: tb.min, max: tb.max, D: tb.D, usar: f.dil, manual: f.dilManual } })
  })
  return out
}

const NOMBRE_ESTADO = {
  ok: 'En rango', bajo: 'Estimado (bajo el rango)', alto: 'Estimado (sobre el rango)', cero: 'Menor que el límite de detección',
  incontable: 'Incontable (sobre el rango)', sin_datos: 'Sin datos', sin_dilucion: 'Sin conteo en la dilución de la cepa',
}
export const textoEstado = (e) => NOMBRE_ESTADO[e] || e

// Resultados por réplica y por muestra y tiempo
export function calcularUfc(u) {
  const regs = registrosConteo(u)
  const reps = regs.map((r) => {
    const est = estimarUfc(r.cont, r.par)
    const n = Object.keys(r.cont).length
    return {
      Muestra: r.Muestra, T_h: r.T_h, Fila: r.Fila || '', Replica: r.Replica, Origen: r.origen, Conteos: n,
      Diluciones_usadas: est.usados.map((k) => `columna ${k + 1} (${r.cont[k]} col.)`).join(', '), Dilucion_elegida: est.manual ? 'a mano' : 'sugerida',
      _manual: est.manual, _sugerida: est.sugerida,
      UFC_mL: est.ufc, IC95_inf: est.lo, IC95_sup: est.hi, Estado: textoEstado(est.estado), _estado: est.estado,
      log10: finito(est.ufc) && est.ufc > 0 ? Math.log10(est.ufc) : NaN, Colonias_usadas: est.S, Limite: est.lim,
      _cont: r.cont, _par: r.par, _usados: est.usados, _S: est.S, _D: est.D,
    }
  })
  const incluirEst = u.par.estimados !== false
  const res = []
  const claves = [...new Map(reps.filter((r) => r.Conteos > 0).map((r) => [`${r.Muestra}|${r.T_h}`, [r.Muestra, r.T_h]])).values()]
  claves.forEach(([m, t]) => {
    const g = reps.filter((r) => r.Muestra === m && r.T_h === t)
    // réplicas que entran al promedio: con la dilución del grupo contada (las de 0 colonias también suman)
    const pool = g.filter((r) => finito(r._D) && r._D > 0 && (r._estado === 'ok' || (incluirEst && ['bajo', 'alto', 'cero'].includes(r._estado))))
    const S = pool.reduce((a, r) => a + r._S, 0)
    const V = pool.reduce((a, r) => a + r._D, 0)
    const ufc = pool.length && S > 0 ? S / V : NaN
    const [lo, hi] = pool.length && S > 0 ? icPoisson(S) : [NaN, NaN]
    // dispersión entre réplicas (para las barras de DE, el CV y el test de atípicos)
    const vals = pool.filter((r) => finito(r.UFC_mL) && r.UFC_mL > 0)
    const lg = vals.map((r) => r.log10)
    const sdLog = lg.length > 1 ? desvio(lg) : NaN
    const arit = vals.length ? media(vals.map((r) => r.UFC_mL)) : NaN
    const sd = vals.length > 1 ? desvio(vals.map((r) => r.UFC_mL)) : NaN
    const estados = [...new Set(g.map((r) => r._estado))]
    // sobredispersión entre réplicas: si solo hubiera error de conteo (Poisson), Cᵢ ~ Poisson(Vᵢ λ̂) con λ̂ = Σ C / Σ V.
    //   χ² = Σ (Cᵢ − Vᵢλ̂)² / (Vᵢλ̂), con n − 1 g.l.; φ = χ² / (n − 1) (≈ 1 si la dispersión es la de Poisson).
    //   Si φ > 1, IC de Poisson ensanchado por √φ en escala log (cuasi-Poisson): λ̂ · (límite / λ̂)^√φ.
    let disp = { Chi2_disp: NaN, gl_disp: NaN, p_disp: NaN, phi: NaN, IC95_inf_disp: NaN, IC95_sup_disp: NaN, Sobredisperso: false }
    if (pool.length > 1 && S > 0) {
      const lam = S / V
      const chi2 = pool.reduce((a, r) => { const E = r._D * lam; return a + (r._S - E) ** 2 / E }, 0)
      const gl = pool.length - 1
      const p = Math.max(0, 1 - gammaP(gl / 2, chi2 / 2))
      const phi = chi2 / gl
      const k = Math.sqrt(phi), V0 = V
      const ancho = phi > 1 && finito(lo) && lo > 0 && finito(hi)
      disp = { Chi2_disp: chi2, gl_disp: gl, p_disp: p, phi, IC95_inf_disp: ancho ? lam * (lo / V0 / lam) ** k : NaN, IC95_sup_disp: ancho ? lam * (hi / V0 / lam) ** k : NaN, Sobredisperso: p < 0.05 }
    }
    res.push({
      Muestra: m, T_h: t, Replicas: g.length, Con_conteos: g.filter((r) => r.Conteos > 0).length, N: pool.length,
      _vals: vals.map((r) => r.UFC_mL), _pool: pool.map((r) => ({ Replica: r.Replica, C: r._S, D: r._D, k: r._usados[0] })),
      Colonias_suma: pool.length ? S : NaN, Volumen_mL: pool.length ? V : NaN,
      UFC_mL: ufc, DE: sd, log10: finito(ufc) ? Math.log10(ufc) : NaN, DE_log10: sdLog,
      IC95_inf: finito(lo) ? lo / V : NaN, IC95_sup: finito(hi) ? hi / V : NaN,
      Media_geometrica: lg.length ? 10 ** media(lg) : NaN, CV_pct: vals.length > 1 && arit ? (100 * sd) / arit : NaN,
      Estado: estados.includes('ok') && estados.length === 1 ? 'En rango' : estados.map(textoEstado).join(' · '),
      Limite: pool.length && S === 0 ? 3 / V : NaN,
      ...disp,
    })
  })
  res.sort((a, b) => (a.Muestra < b.Muestra ? -1 : a.Muestra > b.Muestra ? 1 : a.T_h - b.T_h))
  const muestras = [...new Set(regs.map((r) => r.Muestra))]
  const ts = [...new Set(regs.map((r) => r.T_h))].sort((a, b) => a - b)
  return { reps, res, muestras, ts, hay: reps.some((r) => r.Conteos > 0) }
}

// ---------- error del valor de un tiempo, para mostrar ----------
// El error tiene que ser el del MISMO valor que se grafica:
//   centro 'pool' (Σ C / Σ V, por defecto): el punto es la concentración estimada con todas las colonias, y su error es
//     el IC 95 % de esa concentración: el de Poisson (solo error de conteo) o, si las réplicas varían más que el conteo
//     (χ² de sobredispersión con p < 0,05), el ensanchado por √φ (cuasi-Poisson). Ver icUfc. La dispersión de las
//     réplicas se ve en sus puntos; no se usa como barra porque es la de otro estimador (la media de los log₁₀).
//   centro 'geo' (media de log₁₀ de las réplicas = media geométrica): media ± DE, EEM (DE/√n) o IC 95 %
//     (t(0,975; n − 1) · DE/√n) de los log₁₀. Con menos de 3 réplicas el EEM y el IC no se calculan (nBajo).
// escala: 'log10' | 'lineal' (en lineal con 'geo' la barra es asimétrica: 10^(media ± error), ×/÷ un factor).
// Devuelve { m, lo, hi, err, fac, cv, n, ic (true si la barra es un IC del conteo), tipoIc, nBajo }.
export const ERRORES_UFC = { sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }
export const centroUfc = (aj) => (aj?.ufc_centro === 'geo' ? 'geo' : 'pool')
// log₁₀ del valor central de una fila de resultados (cepa y tiempo) según el centro elegido
export const centroLog10 = (r, centro = 'pool') => (centro === 'geo' && finito(r.Media_geometrica) && r.Media_geometrica > 0 ? Math.log10(r.Media_geometrica) : r.log10)
// IC 95 % que se informa para Σ C / Σ V: Poisson, o Poisson ensanchado por √φ si hay sobredispersión significativa
export function icUfc(r) {
  if (r?.Sobredisperso && finito(r.IC95_inf_disp) && finito(r.IC95_sup_disp)) return { lo: r.IC95_inf_disp, hi: r.IC95_sup_disp, tipo: 'disp' }
  return { lo: r?.IC95_inf, hi: r?.IC95_sup, tipo: finito(r?.IC95_inf) ? 'poisson' : '' }
}
export const TEXTO_IC_UFC = { poisson: 'IC 95 % de Poisson', disp: 'IC 95 % de Poisson ensanchado por √φ (sobredispersión)' }
// nombre corto del error que se dibuja, para leyendas y ejes
export const etiquetaErrorUfc = (centro, tipo) => (centro === 'geo' ? ERRORES_UFC[tipo] || 'DE' : 'IC 95 %')
export function errorUfc(r, escala = 'log10', tipo = 'sd', centro = 'pool') {
  const lin = escala === 'lineal'
  const vals = (r._vals || []).filter((v) => finito(v) && v > 0)
  const cv = vals.length > 1 ? (100 * desvio(vals)) / media(vals) : NaN
  if (centro !== 'geo') {
    const ic = icUfc(r)
    const m = lin ? r.UFC_mL : r.log10
    const de = (v) => (finito(v) && v > 0 ? (lin ? v : Math.log10(v)) : NaN)
    return { m, lo: de(ic.lo), hi: de(ic.hi), err: NaN, fac: NaN, cv, n: r.N, ic: true, tipoIc: ic.tipo, nBajo: false }
  }
  const xs = vals.map(Math.log10)
  const mLog = centroLog10(r, 'geo')
  const n = xs.length
  const sd = n > 1 ? desvio(xs) : NaN
  // con n = 2, t(0,975; 1) = 12,7: el EEM y el IC no tienen base
  const nBajo = (tipo === 'sem' || tipo === 'ic95') && n < 3
  const err = nBajo ? NaN : tipo === 'sem' ? sd / Math.sqrt(n) : tipo === 'ic95' ? (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n) : sd
  if (lin) {
    const m = 10 ** mLog
    return { m, lo: finito(err) ? 10 ** (mLog - err) : NaN, hi: finito(err) ? 10 ** (mLog + err) : NaN, err: NaN, fac: finito(err) ? 10 ** err : NaN, cv, n, ic: false, nBajo }
  }
  return { m: mLog, lo: finito(err) ? mLog - err : NaN, hi: finito(err) ? mLog + err : NaN, err, fac: NaN, cv, n, ic: false, nBajo }
}
// solo el error, para escribirlo sobre el punto: «[lo – hi]» (IC del conteo), «± err» o «×/÷ factor»
export function errorTextoUfc(e, lin) {
  const f = (v) => (lin ? sciUfc(v) : v.toFixed(2).replace('.', ','))
  if (e.ic) return finito(e.lo) && finito(e.hi) ? `[${f(e.lo)} – ${f(e.hi)}]` : ''
  if (finito(e.fac)) return `×/÷ ${e.fac.toFixed(2).replace('.', ',')}`
  return finito(e.err) ? `± ${f(e.err)}` : ''
}
// texto «valor ± error» (o «valor [IC]») para poner sobre el punto
export function textoErrorUfc(e, lin) {
  const f = (v) => (lin ? sciUfc(v) : v.toFixed(2).replace('.', ','))
  if (!finito(e.m)) return ''
  if (e.ic) return finito(e.lo) && finito(e.hi) ? `${f(e.m)}\n[${f(e.lo)} – ${f(e.hi)}]` : f(e.m)
  if (finito(e.fac)) return `${f(e.m)}\n×/÷ ${e.fac.toFixed(2).replace('.', ',')}`
  return finito(e.err) ? `${f(e.m)}\n± ${f(e.err)}` : f(e.m)
}
const sciUfc = (v) => (finito(v) ? v.toExponential(2).replace('.', ',').replace('e+', 'E+').replace('e-', 'E-') : '–')

// ---------- crecimiento a partir de los recuentos: modelos de DMFit (ComBase) ----------
// Se ajustan a TODOS los puntos (ninguno se descarta para mejorar el R²), por mínimos cuadrados sobre ln(UFC/mL):
//   lineal:   y = y₀ + μ t
//   baranyi:  Baranyi y Roberts (1994): y = y₀ + μ A(t) − (1/m)·ln[1 + (e^{mμA(t)} − 1) / e^{m(y_máx − y₀)}]
//             (m = curvatura hacia la meseta, aj.ufc_mcurv; m = 1 es la forma habitual)
//   bifasico: Baranyi y Roberts sin asíntota (lag + fase exponencial): y = y₀ + μ A(t)
//   A(t) = t + ln(e^{−μt} + e^{−h₀} − e^{−μt−h₀}) / μ ;  λ = h₀ / μ
// Como en DMFit, se informan la velocidad en log₁₀ UFC/mL por hora («Rate»), y₀ e y_final en log₁₀, R² y el
// error estándar del ajuste (en log₁₀), con los grados de libertad n − p.
// Solo dos modelos: «Linealizar log₁₀» (recta de ln N en la fase exponencial) y Baranyi y Roberts. El «bifásico» de sesiones viejas
// se trata como Baranyi y Roberts.
export const MODELOS_UFC = { lineal: 'Linealizar log₁₀ (recta de log₁₀ en la fase exponencial)', baranyi: 'Baranyi y Roberts', huang: 'Huang' }
export const modeloUfc = (aj) => (aj?.ufc_modelo === 'lineal' ? 'lineal' : aj?.ufc_modelo === 'huang' ? 'huang' : 'baranyi')
// lag fijo (h): se fija λ en el ajuste de Baranyi y Roberts o de Huang (estabiliza μ cuando hay pocos puntos)
export const lagFijoUfc = (aj) => { const v = aj?.ufc_lagfijo; return v === '' || v === null || v === undefined || !finito(Number(v)) || Number(v) < 0 ? NaN : Number(v) }
// curvatura m del Baranyi y Roberts (aj.ufc_mcurv, por defecto 1)
export const mcurvUfc = (aj) => { const v = Number(aj?.ufc_mcurv); return finito(v) && v > 0 ? v : 1 }
const NPAR = { lineal: 2, baranyi: 4, huang: 4 }
const MIN_T = { lineal: 2, baranyi: 4, huang: 4 }

const f2 = (x) => (finito(x) ? x.toFixed(2).replace('.', ',') : '–')

// t (h) y ly = ln(UFC/mL) de cada punto. ymaxFijo10: N máx en log₁₀ fijado por el usuario (solo Baranyi y Roberts).
// mcurv: curvatura m del Baranyi y Roberts (1 por defecto).
// Modelo «Linealizar log₁₀»: recta de ln N contra t en la FASE EXPONENCIAL (la ventana de pendiente máxima entre las que son bien
// rectas), igual que μmax por OD. t en horas, ly = ln de cada punto (todos los puntos, o los valores de cada tiempo).
// op: { ancho (h), minpts, r2min }. Devuelve el mismo objeto que ajusteDmfit. y₀ = ordenada al origen (log₁₀) para que la
// ecuación sea ln N(t) = a + μ t; c.t0 y c.t1 = la ventana (donde la ecuación vale); c.tDatos0/1 = rango de los datos.
export function ajusteClasico(t, ly, op = {}) {
  const idx = t.map((_, i) => i).filter((i) => finito(t[i]) && finito(ly[i])).sort((a, b) => t[a] - t[b])
  const tt = idx.map((i) => t[i]), yy = idx.map((i) => ly[i])
  const n = tt.length, nT = new Set(tt).size
  const vacio = { ok: false, modelo: 'lineal', n, nT, mu: NaN, avisos: [] }
  if (nT < 3) return { ...vacio, motivo: `El modelo «Linealizar log₁₀» necesita al menos 3 tiempos con recuento (hay ${nT}).` }
  const tu = [...new Set(tt)]
  const paso = tu.slice(1).map((x, i) => x - tu[i]).sort((a, b) => a - b)[Math.floor((tu.length - 1) / 2)] || 1
  const minpts = Math.max(3, Math.round(op.minpts || 3)), r2min = op.r2min ?? 0.95
  const ancho = Math.max(Number(op.ancho) || 2, paso * (minpts - 1) * 1.0001)
  const vent = []
  for (let i = 0; i < n; i++) {
    const j = []
    for (let k = 0; k < n; k++) if (tt[k] >= tt[i] && tt[k] <= tt[i] + ancho + 1e-9) j.push(k)
    if (j.length < minpts || new Set(j.map((k) => tt[k])).size < 3) continue
    const x = j.map((k) => tt[k]), y = j.map((k) => yy[k])
    const rg = regLineal(x, y)
    if (!finito(rg.b)) continue
    vent.push({ ini: Math.min(...x), fin: Math.max(...x), n: j.length, a: rg.a, b: rg.b, r2: rg.r2, x, y })
  }
  // tramo elegido a mano (op.ventana = [t0, t1]): la recta se ajusta a todos los puntos de ese tramo
  let manual = null
  if (op.ventana && finito(op.ventana[0]) && finito(op.ventana[1])) {
    const j = []
    for (let k = 0; k < n; k++) if (tt[k] >= op.ventana[0] - 1e-9 && tt[k] <= op.ventana[1] + 1e-9) j.push(k)
    if (j.length >= 3 && new Set(j.map((k) => tt[k])).size >= 3) {
      const x = j.map((k) => tt[k]), y = j.map((k) => yy[k]), rg = regLineal(x, y)
      if (finito(rg.b)) manual = { ini: Math.min(...x), fin: Math.max(...x), n: j.length, a: rg.a, b: rg.b, r2: rg.r2, x, y }
    }
  }
  if (!vent.length && !manual) return { ...vacio, motivo: 'No hay una ventana con suficientes recuentos para ajustar la recta de la fase exponencial.' }
  const avisos = []
  // solo compiten las ventanas de ancho (casi) completo; si ninguna cumple, todas
  const anchoMax = vent.length ? Math.max(...vent.map((v) => v.fin - v.ini)) : 0
  const ventC = vent.filter((v) => v.fin - v.ini >= 0.8 * anchoMax - 1e-9)
  let cand = manual ? [manual] : ventC.filter((v) => v.r2 >= r2min)
  if (!manual && !cand.length) cand = vent.filter((v) => v.r2 >= r2min)
  if (!cand.length) { cand = vent; avisos.push(`Ninguna ventana alcanza R² ≥ ${r2min.toFixed(2).replace('.', ',')}: se usó la de mayor pendiente.`) }
  let w = cand.reduce((m, v) => (v.b > m.b ? v : m), cand[0])
  // quota (como fit_easylinear de growthrates): las ventanas contiguas con pendiente ≥ quota · máxima se suman a la mejor y se reajusta la recta
  let ampliada = false
  const quota = finito(op.quota) && op.quota > 0 && op.quota < 1 ? op.quota : NaN
  if (!manual && finito(quota) && w.b > 0) {
    let L = vent.indexOf(w), R = L
    while (L > 0 && vent[L - 1].b >= quota * w.b) L--
    while (R < vent.length - 1 && vent[R + 1].b >= quota * w.b) R++
    const ini = vent[L].ini, fin = vent[R].fin
    if (ini < w.ini - 1e-9 || fin > w.fin + 1e-9) {
      const x = [], y = []
      for (let k = 0; k < n; k++) if (tt[k] >= ini - 1e-9 && tt[k] <= fin + 1e-9) { x.push(tt[k]); y.push(yy[k]) }
      const rg = regLineal(x, y)
      if (finito(rg.b) && rg.b > 0) { w = { ini: Math.min(...x), fin: Math.max(...x), n: x.length, a: rg.a, b: rg.b, r2: rg.r2, x, y }; ampliada = true }
    }
  }
  if (!(w.b > 0)) return { ...vacio, motivo: 'La pendiente de ln N no es positiva: sin crecimiento detectable.' }
  const L = Math.LN10
  const sse = w.y.reduce((s, y, i) => s + (y - w.a - w.b * w.x[i]) ** 2, 0) / (L * L)
  const gl = w.n - 2
  const yInit = media(yy.filter((_, i) => tt[i] === tt[0]))   // nivel inicial observado (ln)
  const lag = Math.max(0, (yInit - w.a) / w.b)
  if (!manual && !ampliada && w.fin >= tt[n - 1] - 1e-9 && vent.length > 2 && vent[vent.length - 1].b > vent[vent.length - 2].b) avisos.push('La fase exponencial no está bien definida: el tramo termina en el último punto de la corrida y la curva todavía se acelera. Si la corrida es más larga o el cultivo sigue creciendo, el tramo cambia; podés elegirlo a mano en «Fases…».')
  if (gl <= 1) avisos.push(`La recta usa solo ${w.n} puntos (${gl} grado${gl === 1 ? '' : 's'} de libertad): μ es poco firme. Más tiempos de muestreo en la fase exponencial lo resuelven.`)
  return {
    ok: true, modelo: 'lineal', n, nT, k: 2, gl, pred10: (x) => (w.a + w.b * x) / L, mcurv: NaN, convergio: true, avisos,
    mu: w.b, rate: w.b / L, td_h: Math.LN2 / w.b, lag_h: lag, h0: NaN, a: w.a, yInit10: yInit / L,
    y0: w.a / L, yEnd: NaN, sinAsintota: false, r2: w.r2, se: gl > 0 ? Math.sqrt(sse / gl) : NaN,
    t0: w.ini, t1: w.fin, tDatos0: tt[0], tDatos1: tt[n - 1], nVentana: w.n, ymaxFijo: false, mesetaExtrapolada: false, ventana: { ini: w.ini, fin: w.fin, n: w.n }, ventanaAmpliada: ampliada,
  }
}

export function ajusteDmfit(t, ly, modelo = 'baranyi', ymaxFijo10 = NaN, mcurv = 1, op = null) {
  if (modelo === 'lineal') return ajusteClasico(t, ly, op || {})
  const esBar = modelo === 'baranyi'
  const fijo = finito(ymaxFijo10) ? ymaxFijo10 * Math.LN10 : NaN
  const lagF = finito(op?.lagFijo) && op.lagFijo >= 0 ? Number(op.lagFijo) : NaN
  const mc = esBar && finito(mcurv) && mcurv > 0 ? mcurv : 1
  const idx = t.map((_, i) => i).filter((i) => finito(t[i]) && finito(ly[i])).sort((a, b) => t[a] - t[b])
  const tt = idx.map((i) => t[i]), yy = idx.map((i) => ly[i])
  const n = tt.length, nT = new Set(tt).size
  const vacio = { ok: false, modelo, n, nT, mu: NaN, avisos: [] }
  if (nT < MIN_T[modelo]) return { ...vacio, motivo: `El modelo ${MODELOS_UFC[modelo]} necesita al menos ${MIN_T[modelo]} tiempos con recuento (hay ${nT}).` }
  // N máx fijado: tiene que estar por encima de todo lo medido (si no, la curva no puede pasar por los datos)
  if (finito(fijo) && fijo <= Math.max(...yy)) {
    return { ...vacio, motivo: `El N máx fijado (${f2(ymaxFijo10)} log₁₀) no es mayor que el máximo observado (${f2(Math.max(...yy) / Math.LN10)} log₁₀): no se puede usar. Poné un N máx mayor o dejalo vacío.` }
  }
  const mx = media(tt), my = media(yy)
  let sxx = 0, sxy = 0
  tt.forEach((v, i) => { sxx += (v - mx) ** 2; sxy += (v - mx) * (yy[i] - my) })
  const b = sxx > 0 ? sxy / sxx : NaN
  const ymin = Math.min(...yy), ymaxObs = Math.max(...yy)
  if (!(ymaxObs - ymin > 0.05)) return { ...vacio, motivo: 'Los recuentos casi no cambian: no hay crecimiento para ajustar.' }
  const span = tt[n - 1] - tt[0] || 1
  // pendiente máxima entre tiempos consecutivos (medias) como valor inicial de μ
  const tu = [...new Set(tt)]
  const mu_t = tu.map((x) => media(yy.filter((_, i) => tt[i] === x)))
  let mu0 = finito(b) && b > 0 ? b : (ymaxObs - ymin) / span
  for (let i = 0; i + 1 < tu.length; i++) mu0 = Math.max(mu0, (mu_t[i + 1] - mu_t[i]) / (tu[i + 1] - tu[i]))
  // y₀ no puede pasar el máximo medido ni el N máx fijado
  const y0Hi = finito(fijo) ? Math.min(ymaxObs, fijo) : ymaxObs
  // parámetros: y₀, y máx, μ y q (Baranyi y Roberts: h₀, con λ = h₀/μ; Huang: λ). Se ajustan los libres.
  const nomQ = esBar ? 'h₀' : 'λ'
  const nombresTodos = ['y₀', 'y máx', 'μ', nomQ]
  const libre = [true, !finito(fijo), true, !finito(lagF)]
  const ix = [0, 1, 2, 3].filter((i) => libre[i])
  const armar = (p) => {
    let k = 0
    const y0 = p[k++], ym = libre[1] ? p[k++] : fijo, mu = p[k++]
    const q = libre[3] ? p[k++] : esBar ? mu * lagF : lagF
    return [y0, ym, mu, q]
  }
  const F = (x, y0, ym, mu, q) => (esBar ? baranyiF(x, y0, ym, mu, q, mc) : huangF(x, y0, ym, mu, q))
  const fn = (p, x) => { const [y0, ym, mu, q] = armar(p); return x.map((v) => F(v, y0, ym, mu, q)) }
  const lo = [ymin - 3, ymin, 1e-4, 0], hi = [y0Hi, ymaxObs + 5, 20, esBar ? 80 : Math.max(4 * span, 10)]
  let mejor = null, mejorConv = null
  // varios puntos de partida para el lag: el ajuste no lineal puede quedar en un mínimo local
  for (const fr of [0, 0.15, 0.3, 0.5, 0.7]) for (const fm of [0.6, 1]) {
    const m0 = Math.max(mu0 * fm, 1e-3)
    const p0 = [mu_t[0], ymaxObs, m0, esBar ? m0 * fr * span : fr * span]
    const r = levenbergMarquardt(fn, ix.map((i) => p0[i]), ix.map((i) => lo[i]), ix.map((i) => hi[i]), tt, yy)
    if (!finito(r.rss) || !r.p.every(finito)) continue
    if (!mejor || r.rss < mejor.rss) mejor = r
    // se prefieren los arranques que cumplieron el criterio de convergencia
    if (r.conv && !r.estancado && (!mejorConv || r.rss < mejorConv.rss)) mejorConv = r
  }
  if (!mejor) return { ...vacio, motivo: 'El modelo no convergió.' }
  let convergio = true
  if (mejorConv) mejor = mejorConv
  else convergio = false
  const limites = []
  // parámetros pegados a un límite (la asíntota en el límite superior se informa aparte como «sin meseta»; lag nulo es un valor posible)
  ;(mejor.enLimite || []).forEach(({ i, lado }) => {
    const nom = nombresTodos[ix[i]]
    if (nom === 'y máx' && lado === 'superior') return
    if ((nom === 'h₀' || nom === 'λ') && lado === 'inferior') return
    limites.push(`${nom} en el límite ${lado}`)
  })
  const [y0, ymax, mu, q] = armar(mejor.p)
  const pred = (x) => F(x, y0, ymax, mu, q)
  const par = { y0, ymax, mu, q, sinAsintota: !finito(fijo) && ymax >= ymaxObs + 5 - 1e-3 }
  const h0 = esBar ? q : mu * q
  const lag = esBar ? q / mu : q
  // errores estándar de los parámetros libres (como el summary de modFit): cov = s² (JᵀJ)⁻¹
  const EE = erroresAjuste(fn, mejor.p, tt, yy)
  const L = Math.LN10
  const pos = (i) => ix.indexOf(i)   // posición del parámetro i entre los libres (−1 si está fijo)
  const seDe = (i) => (EE && pos(i) >= 0 ? EE.se[pos(i)] : NaN)
  const covDe = (i, j) => (EE && pos(i) >= 0 && pos(j) >= 0 ? EE.cov[pos(i)][pos(j)] : NaN)
  const seMu = seDe(2)
  let seLag = NaN
  if (finito(lagF)) seLag = 0
  else if (esBar) {   // λ = h₀/μ: método delta con la covarianza de (h₀, μ)
    const v = covDe(3, 3) / mu ** 2 + (q ** 2 * covDe(2, 2)) / mu ** 4 - (2 * q * covDe(2, 3)) / mu ** 3
    seLag = finito(v) ? Math.sqrt(Math.max(0, v)) : NaN
  } else seLag = seDe(3)
  const corrMuLag = EE && pos(2) >= 0 && pos(3) >= 0 ? covDe(2, 3) / (seDe(2) * seDe(3)) : NaN
  // bondad del ajuste en log₁₀ (como DMFit)
  const res = yy.map((v, i) => (v - pred(tt[i])) / L)
  const sse = res.reduce((s2, r) => s2 + r * r, 0)
  const m10 = my / L
  const sst = yy.reduce((s2, v) => s2 + (v / L - m10) ** 2, 0)
  const k = NPAR[modelo] - (finito(fijo) ? 1 : 0) - (finito(lagF) ? 1 : 0)
  const gl = n - k
  const avisos = []
  if (!convergio) avisos.push('El ajuste no cumplió el criterio de convergencia en ningún punto de partida: se muestra el mejor intento; tomá los parámetros con cautela.')
  if (limites.length) avisos.push(`Parámetros en el límite permitido (${limites.join(', ')}): ese valor no es un óptimo libre del ajuste.`)
  if (gl <= 1 || nT <= k) avisos.push(`Pocos grados de libertad (n − p = ${n} − ${k} = ${gl}${nT < n ? `; ${nT} tiempos distintos` : ''}): con tan pocos puntos por parámetro el modelo pasa casi por todos los datos y sus parámetros quedan mal determinados; los errores estándar pueden ser engañosos.`)
  if (!EE && gl > 0) avisos.push('No se pudieron calcular los errores estándar de los parámetros: algunos no están determinados por los datos (probá fijar el lag o N máx).')
  else if (finito(corrMuLag) && Math.abs(corrMuLag) > 0.95) avisos.push(`μ y ${esBar ? 'λ' : 'λ'} están casi perfectamente correlacionados (r = ${corrMuLag.toFixed(2).replace('.', ',')}): con estos datos no se pueden separar bien. Fijar el lag estabiliza μ.`)
  return {
    ok: finito(par.mu), modelo, n, nT, k, gl, pred10: (x) => pred(x) / L, mcurv: mc, convergio, avisos,
    mu, rate: mu / L, td_h: mu > 0 ? Math.LN2 / mu : NaN, lag_h: lag, h0,
    y0: y0 / L, yEnd: par.sinAsintota ? NaN : ymax / L, sinAsintota: !!par.sinAsintota, r2: sst > 0 ? 1 - sse / sst : NaN, se: n > k ? Math.sqrt(sse / (n - k)) : NaN,
    // errores estándar de los parámetros (μ y λ en sus unidades; y₀ e y máx en log₁₀) y correlación μ–λ
    ee_mu: seMu, ee_lag: seLag, ee_y0: seDe(0) / L, ee_ymax: seDe(1) / L, ee_td: mu > 0 && finito(seMu) ? (Math.LN2 / mu) * (seMu / mu) : NaN, corr_mu_lag: corrMuLag,
    lagFijo: finito(lagF), yAsint10: ymax / L,
    t0: tt[0], t1: tt[n - 1], ymaxFijo: finito(fijo),
    // la asíntota queda bastante por encima del máximo medido: los datos no llegan a la meseta y N máx es extrapolado
    mesetaExtrapolada: !finito(fijo) && !par.sinAsintota && ymax - Math.max(...yy) > 0.3,
  }
}

// ---------- N máx fijado ----------
// Si el usuario cargó un N máx (log₁₀) en «Predicción», se usa en TODAS las pantallas (tabla, curva, predicción y fases),
// esté o no encendido «Predecir».
export const predDe = (aj) => ({ on: false, hasta: 24, nmax: '', objetivo: '', ...(aj?.ufc_pred || {}) })
export const nmaxFijado = (aj) => { const v = predDe(aj).nmax; return v === '' || v === null || v === undefined || !finito(Number(v)) ? NaN : Number(v) }

// ---------- un solo ajuste por cepa ----------
// El mismo ajuste (modelo elegido, N máx fijado, curvatura m y centro de cada tiempo) se usa en la tabla de
// parámetros, la curva, la predicción y las fases de la calibración: μ y λ son los mismos en todas las pantallas.
// ventana del modelo Linealizar log₁₀: la de «μmax por ventana deslizante» (an_ancho, an_minpts, an_r2)
// ampliar la ventana con las vecinas de pendiente ≥ quota × la máxima (aj.an_quota en %, por defecto 95; 0 = no ampliar)
export const cuotaDe = (aj) => { const v = aj?.an_quota === undefined || aj?.an_quota === '' ? 95 : Number(aj.an_quota); return finito(v) && v > 0 && v < 100 ? v / 100 : NaN }
const opClasico = (aj) => ({ ancho: Number(aj?.an_ancho) || 2, minpts: Number(aj?.an_minpts) || 3, r2min: Number(aj?.an_r2) || 0.95, quota: cuotaDe(aj) })
export const opClasicoDe = opClasico
// con el tramo (fase exponencial) elegido para la cepa, si lo hay: aj.calib_ventana = { cepa: [t0, t1] }
// (el tramo de las UFC es independiente del de la OD; calib_ventana es el nombre que tenía en sesiones guardadas antes)
export const tramoUfcElegido = (aj, m) => aj?.ufc_ventana?.[m] ?? aj?.calib_ventana?.[m]
const opClasicoCepa = (aj, m) => ({ ...opClasico(aj), ventana: tramoUfcElegido(aj, m), lagFijo: lagFijoUfc(aj) })
const cacheAjuste = new WeakMap()
export function ajusteCepaUfc(ufcRes, m, aj) {
  const modelo = modeloUfc(aj)
  const nmax = modelo !== 'lineal' ? nmaxFijado(aj) : NaN
  const mc = mcurvUfc(aj)
  const clave = [m, modelo, nmax, mc, aj?.ufc_datos === 'replicas' ? 'r' : 'm', centroUfc(aj), JSON.stringify(opClasicoCepa(aj, m))].join('|')
  let porRes = cacheAjuste.get(ufcRes)
  if (!porRes) { porRes = new Map(); cacheAjuste.set(ufcRes, porRes) }
  if (porRes.has(clave)) return porRes.get(clave)
  const { t, ly } = puntosUfc(ufcRes, m, aj)
  const c = ajusteDmfit(t, ly, modelo, nmax, mc, opClasicoCepa(aj, m))
  if (c.tDatos0 === undefined) { c.tDatos0 = c.t0; c.tDatos1 = c.t1 }
  c.avisosPuntos = puntosExcluidosUfc(ufcRes, m, aj)
  porRes.set(clave, c)
  return c
}

// Tiempos (o réplicas) de una cepa que no entran al ajuste de crecimiento porque no tienen un valor > 0:
// 0 colonias (por debajo del límite de detección) o conteos incontables. No se descartan en silencio.
export function puntosExcluidosUfc(ufcRes, m, aj) {
  const out = []
  ufcRes.res.filter((r) => r.Muestra === m && !(finito(r.UFC_mL) && r.UFC_mL > 0)).sort((a, b) => a.T_h - b.T_h).forEach((r) => {
    if (r.N > 0 && r.Colonias_suma === 0) out.push(`T = ${r.T_h} h: 0 colonias en ${r.N} réplica${r.N === 1 ? '' : 's'} (menos que el límite de detección, ≈ ${sciUfc(r.Limite)} UFC/mL)`)
    else out.push(`T = ${r.T_h} h: ${String(r.Estado || 'sin réplicas utilizables').toLowerCase()}${r.N === 0 ? ' (ninguna réplica utilizable)' : ''}`)
  })
  if (aj?.ufc_datos === 'replicas') {
    const reps = (ufcRes.reps || []).filter((x) => x.Muestra === m && x.Conteos > 0 && !ufcRes.fuera?.has(`${x.Muestra}|${x.T_h}|${x.Replica}`) && !(finito(x.UFC_mL) && x.UFC_mL > 0))
    const conMedia = new Set(ufcRes.res.filter((r) => r.Muestra === m && finito(r.UFC_mL) && r.UFC_mL > 0).map((r) => r.T_h))
    const sueltas = reps.filter((x) => conMedia.has(x.T_h))
    if (sueltas.length) out.push(`${sueltas.length} réplica${sueltas.length === 1 ? '' : 's'} con 0 colonias o incontable${sueltas.length === 1 ? '' : 's'} (${sueltas.map((x) => `T = ${x.T_h} h, réplica ${x.Replica}`).join('; ')})`)
  }
  return out
}

// ---------- predicción con Baranyi y Roberts ----------
// Usa el ajuste de la cepa (Baranyi y Roberts) y extiende la curva hasta aj.ufc_pred.hasta horas. Si los datos no llegan
// a la fase estacionaria, la asíntota no se puede estimar: hay que indicar N máx (log₁₀), por ejemplo el de otros ensayos.
const T_MAX_PRED = 1e5   // h: límite de la búsqueda del tiempo en que se llega a un nivel
export function prediccionUfc(ufcRes, m, aj) {
  const o = predDe(aj)
  const c = ajusteCepaUfc(ufcRes, m, aj)
  if (!c.ok) return { ok: false, c, motivo: c.motivo }
  if (c.modelo === 'lineal') return { ok: false, c, motivo: 'la predicción usa Baranyi y Roberts o Huang: elegí uno de esos modelos en «Modelo de ajuste (DMFit)» (así la tabla, la predicción y la calibración usan el mismo ajuste)' }
  // sin meseta en los datos y sin N máx fijado: se predice igual, con la asíntota en su límite (observado + 5 ln ≈ 2,2 log₁₀), y se avisa
  // «Hasta» vacío (o 0) = 24 h: antes quedaba en 0 y la predicción no se extendía más allá del último recuento
  const hasta0 = o.hasta === '' || o.hasta === null || o.hasta === undefined ? NaN : Number(o.hasta)
  const hasta = Math.min(Math.max(finito(hasta0) && hasta0 > 0 ? hasta0 : 24, c.t1), T_MAX_PRED)
  const f = c.pred10
  // tiempo en que la curva llega a un nivel (es creciente: bisección, con el intervalo acotado)
  const tiempoA = (y) => {
    if (!finito(y)) return NaN
    if (f(c.t0) >= y) return c.t0
    let lo = c.t0, hi = Math.max(hasta, c.t1, 1)
    for (let i = 0; i < 60 && hi < T_MAX_PRED && !(f(hi) >= y); i++) hi = Math.min(hi * 2, T_MAX_PRED)
    if (!(f(hi) >= y)) return NaN
    for (let i = 0; i < 80; i++) { const mm = (lo + hi) / 2; if (f(mm) < y) lo = mm; else hi = mm }
    return (lo + hi) / 2
  }
  const N = 160
  const puntos = Array.from({ length: N + 1 }, (_, i) => c.t0 + ((hasta - c.t0) * i) / N).map((x) => ({ x, y: f(x) }))
  return {
    ok: true, c, hasta, puntos, yHasta: f(hasta), sinMeseta: !!c.sinAsintota, tMeseta: c.sinAsintota ? NaN : tiempoA(c.yEnd - 0.1),
    objetivo: o.objetivo === '' ? NaN : Number(o.objetivo), tObjetivo: o.objetivo === '' ? NaN : tiempoA(Number(o.objetivo)),
  }
}

// Puntos del ajuste de una cepa: el valor central de cada tiempo (Σ C / Σ V o media geométrica, aj.ufc_centro)
// o cada réplica incluida (aj.ufc_datos)
export function puntosUfc(ufcRes, m, aj) {
  if (aj?.ufc_datos === 'replicas') {
    const r = (ufcRes.reps || []).filter((x) => x.Muestra === m && x.Conteos > 0 && finito(x.UFC_mL) && x.UFC_mL > 0 && !ufcRes.fuera?.has(`${x.Muestra}|${x.T_h}|${x.Replica}`))
    if (r.length) return { t: r.map((x) => x.T_h), ly: r.map((x) => Math.log(x.UFC_mL)) }
  }
  const geo = centroUfc(aj) === 'geo'
  const r = ufcRes.res.filter((x) => x.Muestra === m && finito(x.UFC_mL) && x.UFC_mL > 0)
  return { t: r.map((x) => x.T_h), ly: r.map((x) => (geo ? centroLog10(x, 'geo') * Math.LN10 : Math.log(x.UFC_mL))) }
}

// Parámetros de crecimiento por recuento de cada cepa con el modelo elegido.
// Aumento y generaciones salen del MISMO modelo que y₀ y μ: lo que sube la curva ajustada entre el primer y el último
// tiempo medido (log₁₀ N(t_fin) − log₁₀ N(t_ini)); generaciones = aumento / log₁₀ 2. Si no hay ajuste, de los valores
// centrales observados (primer tiempo y máximo), y se indica (aumentoDe).
export function crecimientoUfc(ufcRes, m, aj) {
  const f = { ...ajusteCepaUfc(ufcRes, m, aj) }
  if (f.ok && f.pred10 && f.modelo !== 'lineal') {
    const ini = f.pred10(f.t0), fin = f.pred10(f.t1)
    Object.assign(f, { log10_N0: ini, log10_fin: fin, crecimiento_log10: fin - ini, generaciones: (fin - ini) / Math.log10(2), aumentoDe: 'modelo' })
    return f
  }
  const cen = centroUfc(aj)
  const med = ufcRes.res.filter((x) => x.Muestra === m && finito(x.UFC_mL) && x.UFC_mL > 0).sort((a, b) => a.T_h - b.T_h)
  if (med.length) {
    const lg = med.map((x) => centroLog10(x, cen))
    const N0 = lg[0], Nmax = Math.max(...lg)
    Object.assign(f, { log10_N0: N0, log10_fin: Nmax, crecimiento_log10: Nmax - N0, generaciones: (Nmax - N0) / Math.log10(2), aumentoDe: 'observado' })
  }
  return f
}

// ---------- fases del crecimiento según el ajuste de la cepa ----------
// Se usa el MISMO ajuste de la tabla (Baranyi y Roberts o bifásico, con el N máx fijado si lo hay). Un tiempo está en
// fase exponencial cuando la velocidad instantánea del modelo es al menos una fracción de μ máx (aj.ufc_frac_exp,
// por defecto 0,5); antes es lag y después, estacionaria. El modelo lineal no distingue fases.
export const FRACCION_EXP = 0.5
export const fraccionExp = (aj) => { const v = Number(aj?.ufc_frac_exp); return finito(v) && v > 0 && v < 1 ? v : FRACCION_EXP }
export function fasesUfc(ufcRes, m, aj) {
  const c = ajusteCepaUfc(ufcRes, m, aj)
  if (!c.ok || !(c.mu > 0)) return { ok: false, c, motivo: c.motivo || 'Sin crecimiento' }
  if (c.modelo === 'lineal') {
    // Linealizar log₁₀: la fase exponencial ES la ventana de la recta; antes es lag y después estacionaria
    const fase = (x) => (x >= c.t0 - 1e-9 && x <= c.t1 + 1e-9 ? 'exponencial' : x < c.t0 ? 'lag' : 'estacionaria')
    return { ok: true, c, fase, frac: NaN, tIni: c.t0, tFin: c.t1, sigue: c.t1 >= c.tDatos1 - 1e-9 }
  }
  const frac = fraccionExp(aj)
  const h = 1e-3
  const rel = (x) => ((c.pred10(x + h) - c.pred10(x - h)) / (2 * h)) * Math.LN10 / c.mu
  // tiempo de máxima velocidad: separa el lag (antes) de la estacionaria (después)
  const N = 400, t0 = c.t0, t1 = c.t1
  const grilla = Array.from({ length: N + 1 }, (_, i) => t0 + ((t1 - t0) * i) / N)
  const tPico = grilla.reduce((a, x) => (rel(x) > rel(a) ? x : a), t0)
  const fase = (x) => (rel(x) >= frac ? 'exponencial' : x < tPico ? 'lag' : 'estacionaria')
  const enExp = grilla.filter((x) => fase(x) === 'exponencial')
  return {
    ok: true, c, fase, frac,
    tIni: enExp.length ? enExp[0] : NaN, tFin: enExp.length ? enExp[enExp.length - 1] : NaN,
    sigue: enExp.length > 0 && enExp[enExp.length - 1] >= t1 - 1e-9,   // la fase exponencial sigue al final de los datos
  }
}


// ---------- curva del crecimiento por recuento ----------
// La curva que se dibuja es la del modelo elegido (aj.ufc_modelo), el mismo de los parámetros; aj.ufc_suave === false:
// sin curva. (Las sesiones que tenían «spline» muestran la del modelo.)
export const metodoCurvaUfc = (aj) => (aj.ufc_suave === false ? 'no' : 'baranyi')
// Devuelve { ok, puntos: [{ x, y (log10) }], motivo } o null si no se pide curva
export function curvaUfc(ufcRes, m, aj) {
  if (metodoCurvaUfc(aj) === 'no') return null
  const c = ajusteCepaUfc(ufcRes, m, aj)
  if (!c.ok) return { ok: false, motivo: c.motivo }
  return { ok: true, puntos: Array.from({ length: 121 }, (_, i) => c.t0 + ((c.t1 - c.t0) * i) / 120).map((x) => ({ x, y: c.pred10(x) })) }
}

// ---------- concentración esperada (guía de la grilla de gotas) ----------
export const tiemposG = (u) => [...new Set((u.placasG || []).flatMap((p) => Object.values(p.filas || {}).filter((f) => f && f.muestra).map((f) => Number(f.t))))].filter(finito).sort((a, b) => a - b)
export function esperadoStock(ufc, curva) {
  const out = {}
  const { par, esperado } = ufc
  tiemposG(ufc).forEach((t) => {
    const k = claveT(t)
    if (par.esperadoDe === 'manual' && finito(esperado[k])) { out[k] = esperado[k]; return }
    if (par.esperadoDe === 'od' && curva && curva.t.length > 2) {
      const y0 = curva.y[0]
      const yt = interpolar(curva.t, curva.y, [t * 3600])[0]
      if (finito(y0) && y0 > 0 && finito(yt)) { out[k] = par.c0 * (yt / y0); return }
    }
    out[k] = finito(esperado[k]) ? esperado[k] : par.c0
  })
  return out
}
export const coloniasEsperadas = (stock, j, par) => (stock / dilucionDe(par, j)) * par.vol
export const contable = (n, par) => finito(n) && n >= par.min && n <= par.max

// ------------------------------------------------------------
// Lectura de una plantilla / planilla de conteos desde Excel (matriz cruda): bloques «T=<horas>»
// Las celdas con TEXTO son muestras; las celdas con NÚMEROS son conteos de colonias.
// ------------------------------------------------------------
export function leerPlantillaUfc(raw) {
  const re = /^\s*T\s*=\s*([0-9]+(?:[.,][0-9]+)?)\s*$/i
  const layout = new Map()
  const conteos = {}
  const esperado = {}
  const tiempos = []
  for (let r = 0; r < raw.length; r++) {
    let m = null
    for (const c of raw[r]) { m = re.exec(String(c ?? '')); if (m) break }
    if (!m) continue
    const t = convertirNumero(m[1])
    const k = claveT(t)
    tiempos.push(t)
    for (let i = r; i < Math.min(raw.length, r + 5); i++) {
      if (/conc/i.test(String(raw[i][0] ?? ''))) {
        const v = raw[i].slice(1).map(convertirNumero).find(finito)
        if (finito(v)) esperado[k] = v
        break
      }
    }
    for (let i = r + 1, q = 0; i < Math.min(raw.length, r + 22) && q < 8; i++) {
      const cel = raw[i]
      const cl = cel.findIndex((x) => String(x ?? '').trim().toUpperCase() === LETRAS[q])
      if (cl < 0) continue
      const vals = cel.slice(cl + 1, cl + 13)
      vals.forEach((v, j) => {
        const p = LETRAS[q] + (j + 1)
        if (v === '' || v === null || v === undefined) return
        const n = typeof v === 'number' ? v : NaN
        if (finito(n)) {
          if (!conteos[k]) conteos[k] = {}
          conteos[k][p] = n
        } else {
          const txt = String(v).trim()
          if (txt && !layout.has(p)) layout.set(p, txt)
        }
      })
      q++
    }
  }
  if (!tiempos.length) throw new Error('No encontré bloques «T=…» con la placa A..H. Cada bloque empieza con una celda «T=0», «T=1», etc.')
  return {
    layout: [...layout].map(([Pocillo, Muestra]) => ({ Pocillo, Muestra })),
    conteos, esperado, tiempos: [...new Set(tiempos)].sort((a, b) => a - b),
  }
}

// ------------------------------------------------------------
// Tabla de recuentos desde Excel: encabezados «Muestra», «Tiempo (h)», «Réplica» y columnas de dilución
// («Sin diluir», «0», «-1», «-2», …). Devuelve filas { muestra, replica, t, c: { k: colonias } }.
// ------------------------------------------------------------
export function leerTablaConteos(raw) {
  let h = -1
  for (let r = 0; r < Math.min(raw.length, 40); r++) {
    if (raw[r].some((x) => /^\s*(muestra|cepa|sample)\s*$/i.test(String(x ?? '')))) { h = r; break }
  }
  if (h < 0) throw new Error('No encontré una fila de encabezados con la columna «Muestra».')
  const enc = raw[h].map((x) => String(x ?? '').trim())
  const ix = (re) => enc.findIndex((x) => re.test(x))
  const iM = ix(/^(muestra|cepa|sample)$/i), iT = ix(/^(tiempo|time|t)\b/i), iR = ix(/^(r[eé]plica|rep)/i), iV = ix(/^volumen/i)
  const cols = []
  enc.forEach((x, j) => {
    const sinDil = /^(sin diluir|sd|directa?|0|10\^?0)$/i.test(x)
    const m = /^[−-]\s*(\d+)$/.exec(x) || /^10\s*\^?\s*[−-]\s*(\d+)$/i.exec(x) || /^dil(?:uci[oó]n)?\s*[−-]?\s*(\d+)$/i.exec(x)
    if (sinDil) cols.push([j, 0])
    else if (m) cols.push([j, Number(m[1])])
  })
  if (!cols.length) throw new Error('No encontré columnas de recuento («Sin diluir», «-1», «-2», …).')
  const filas = []
  for (let r = h + 1; r < raw.length; r++) {
    const f = raw[r]
    const muestra = String(f[iM] ?? '').trim()
    if (!muestra) continue
    const c = {}
    cols.forEach(([j, k]) => { const v = convertirNumero(f[j]); if (finito(v)) c[k] = v })
    filas.push({ muestra, replica: iR >= 0 ? Number(convertirNumero(f[iR])) || 1 : 1, t: iT >= 0 ? convertirNumero(f[iT]) : 0, vol: iV >= 0 ? convertirNumero(f[iV]) : undefined, c })
  }
  if (!filas.length) throw new Error('La tabla no tiene filas con nombre de muestra.')
  return { filas, nd: Math.max(...cols.map(([, k]) => k)) + 1 }
}
