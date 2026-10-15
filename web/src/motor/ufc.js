// ============================================================
// Recuento de UFC (colonias por placa o por gota) a partir de diluciones seriadas.
//   Dilución «−k»: la suspensión está factor^k veces más diluida que la original (k = 0: sin diluir).
//   Cada placa (o gota) con C colonias y volumen V (mL) aporta C / V × factor^k UFC/mL.
//   Con varias diluciones dentro del rango contable se usa la media ponderada (ISO 7218 / FDA BAM):
//        UFC/mL = Σ C / ( V × Σ factor^(−k) )
//   IC 95 % del conteo: Poisson exacto (Garwood). Réplicas: media geométrica (el error es multiplicativo).
// Los recuentos pueden venir de la grilla de gotas sobre una placa de 96 (cada FILA es una réplica y cada
// COLUMNA j es la dilución −j) o de una tabla (una fila por muestra, tiempo y réplica, una columna por dilución).
// ============================================================
import { LETRAS, convertirNumero } from './lectura.js'
import { desvio, finito, interpolar, media } from './analisis.js'
import { tCuantil } from '../utils.js'

// ---------- parámetros ----------
export const ufcDef = () => ({
  vol: 0.02,            // mL por gota
  factor: 5,            // cada pocillo está `factor` veces más diluido que el anterior (= volumen final / toma)
  toma: 40, final: 200, // µL que se pasan de un pocillo al siguiente y volumen final de cada pocillo
  primero: 'dilucion',  // 'madre': el pocillo 1 es la solución madre · 'dilucion': el pocillo 1 ya es una dilución
  madre: { toma: 40, final: 200 },  // pocillo 1 = primera dilución: se toman `toma` µL de la solución madre y se llevan a `final` µL
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
  const f0 = par.madre?.toma > 0 && par.madre?.final > 0 ? par.madre.final / par.madre.toma : f
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

// sesiones anteriores: «partir de una solución madre» era opcional; si no se usaba, el pocillo 1 tenía el mismo factor que la serie
const parNormal = (par, madre) => {
  const { usar, ...m } = madre || {}
  return { ...par, madre: madre && usar !== false ? { ...ufcDef().madre, ...m } : { toma: par.toma, final: par.final } }
}

export const normalizarUfc = (u = {}) => {
  const d = ufcVacio()
  const petri = Array.isArray(u.petri) ? u.petri : []
  const filasTabla = Array.isArray(u.tabla?.filas) ? u.tabla.filas : []
  return {
    metodo: u.metodo || (!(Array.isArray(u.layout) && u.layout.length) && (filasTabla.length || petri.length) ? 'extendida' : 'gota'),
    petri,
    par: parNormal({ ...d.par, ...(u.par || {}) }, u.par?.madre),
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
function gammaP(a, x) {
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
// cont: { k: colonias } (k = exponente de la dilución, 0 = sin diluir); par: { vol (mL), factor, min, max }
// estado: ok | bajo (estimado bajo el rango) | alto (estimado sobre el rango) | cero (< límite de detección) | incontable (> límite) | sin_datos
export function estimarUfc(cont, par) {
  const f = par.factor
  const e = Object.entries(cont || {}).map(([k, c]) => [Number(k), Number(c)]).filter(([k, c]) => finito(k) && finito(c) && c >= 0)
  const vacio = { ufc: NaN, lo: NaN, hi: NaN, estado: 'sin_datos', usados: [], S: 0, lim: NaN }
  if (!e.length) return vacio
  const inv = (k) => 1 / ((par.mult || 1) * f ** k)
  const peso = (ks) => ks.reduce((s, k) => s + inv(k), 0)
  const enRango = e.filter(([, c]) => c >= par.min && c <= par.max)
  if (enRango.length) {
    const S = enRango.reduce((s, [, c]) => s + c, 0)
    const D = par.vol * peso(enRango.map(([k]) => k))
    const [a, b] = icPoisson(S)
    return { ufc: S / D, lo: a / D, hi: b / D, estado: 'ok', usados: enRango.map(([k]) => k), S, lim: NaN }
  }
  if (e.every(([, c]) => c === 0)) {
    const D = par.vol * peso(e.map(([k]) => k))
    return { ...vacio, estado: 'cero', lim: 3 / D, usados: [] }       // límite de detección (≈ 3 colonias esperadas)
  }
  const bajo = e.filter(([, c]) => c > 0 && c < par.min).sort((x, y) => y[1] - x[1])
  const sobre = e.filter(([, c]) => c > par.max).sort((x, y) => x[1] - y[1])
  // se estima con la placa más cercana al rango; con menos de 4 colonias la estimación es muy imprecisa
  // (bajo el rango: la de más colonias; sobre el rango: solo si no se pasa del doble del máximo, si no es incontable)
  const cand = bajo.length ? [bajo[0], 'bajo'] : sobre.length && sobre[0][1] <= 2 * par.max ? [sobre[0], 'alto'] : null
  if (!cand) return { ...vacio, estado: 'incontable' }
  const [k, c] = cand[0]
  const D = par.vol * inv(k)
  const [a, b] = icPoisson(c)
  return { ufc: c / D, lo: a / D, hi: b / D, estado: cand[1], usados: [k], S: c, lim: NaN }
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
  if (u.metodo !== 'extendida') return out
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
      par: { vol: (Number(f.vol) || tb.vol) / 1000, factor: tb.factor, min: tb.min, max: tb.max } })
  })
  return out
}

const NOMBRE_ESTADO = {
  ok: 'En rango', bajo: 'Estimado (bajo el rango)', alto: 'Estimado (sobre el rango)', cero: 'Menor que el límite de detección',
  incontable: 'Incontable (sobre el rango)', sin_datos: 'Sin datos',
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
      Diluciones_usadas: est.usados.map((k) => `−${k} (${r.cont[k]})`).join(', '),
      UFC_mL: est.ufc, IC95_inf: est.lo, IC95_sup: est.hi, Estado: textoEstado(est.estado), _estado: est.estado,
      log10: finito(est.ufc) && est.ufc > 0 ? Math.log10(est.ufc) : NaN, Colonias_usadas: est.S, Limite: est.lim,
      _cont: r.cont, _par: r.par, _usados: est.usados, _S: est.S,
    }
  })
  const incluirEst = u.par.estimados !== false
  const res = []
  const claves = [...new Map(reps.filter((r) => r.Conteos > 0).map((r) => [`${r.Muestra}|${r.T_h}`, [r.Muestra, r.T_h]])).values()]
  claves.forEach(([m, t]) => {
    const g = reps.filter((r) => r.Muestra === m && r.T_h === t)
    const vals = g.filter((r) => finito(r.UFC_mL) && r.UFC_mL > 0 && (incluirEst || r._estado === 'ok'))
    const lg = vals.map((r) => r.log10)
    const n = lg.length
    const mLog = n ? media(lg) : NaN
    const sdLog = n > 1 ? desvio(lg) : NaN
    const t95 = n > 1 ? tCuantil(0.975, n - 1) : NaN
    const arit = n ? media(vals.map((r) => r.UFC_mL)) : NaN
    const sd = n > 1 ? desvio(vals.map((r) => r.UFC_mL)) : NaN
    const estados = [...new Set(g.map((r) => r._estado))]
    res.push({
      Muestra: m, T_h: t, Replicas: g.length, Con_conteos: g.filter((r) => r.Conteos > 0).length, N: n, _vals: vals.map((r) => r.UFC_mL), _t95: t95,
      UFC_mL: n ? 10 ** mLog : NaN, DE: sd, log10: mLog, DE_log10: sdLog,
      IC95_inf: n > 1 ? 10 ** (mLog - t95 * sdLog / Math.sqrt(n)) : NaN, IC95_sup: n > 1 ? 10 ** (mLog + t95 * sdLog / Math.sqrt(n)) : NaN,
      Media_aritmetica: arit, CV_pct: n > 1 && arit ? (100 * sd) / arit : NaN,
      Estado: estados.includes('ok') && estados.length === 1 ? 'En rango' : estados.map(textoEstado).join(' · '),
      Limite: g.every((r) => r._estado === 'cero') ? Math.min(...g.map((r) => r.Limite).filter(finito)) : NaN,
    })
  })
  res.sort((a, b) => (a.Muestra < b.Muestra ? -1 : a.Muestra > b.Muestra ? 1 : a.T_h - b.T_h))
  const muestras = [...new Set(regs.map((r) => r.Muestra))]
  const ts = [...new Set(regs.map((r) => r.T_h))].sort((a, b) => a - b)
  return { reps, res, muestras, ts, hay: reps.some((r) => r.Conteos > 0) }
}

// ---------- crecimiento a partir de los recuentos ----------
// μ: pendiente máxima de ln(UFC/mL) contra el tiempo en 3 o más tiempos consecutivos; lag: tangente contra el nivel inicial
export function crecimientoUfc(filas) {
  const p = filas.filter((r) => finito(r.UFC_mL) && r.UFC_mL > 0).sort((a, b) => a.T_h - b.T_h)
  if (p.length < 3) return null
  const reg = (w) => {
    const x = w.map((r) => r.T_h), y = w.map((r) => Math.log(r.UFC_mL))
    const mx = media(x), my = media(y)
    let sxx = 0, sxy = 0
    x.forEach((v, i) => { sxx += (v - mx) ** 2; sxy += (v - mx) * (y[i] - my) })
    if (!(sxx > 0)) return null
    const b = sxy / sxx, a = my - b * mx
    let sst = 0, sse = 0
    y.forEach((v, i) => { sst += (v - my) ** 2; sse += (v - (a + b * x[i])) ** 2 })
    return { a, b, r2: sst > 0 ? 1 - sse / sst : 1, n: w.length, t0: w[0].T_h, t1: w[w.length - 1].T_h }
  }
  let mejor = null
  for (let i = 0; i + 2 < p.length; i++) {
    for (let n = 3; i + n <= p.length && n <= 6; n++) {
      const r = reg(p.slice(i, i + n))
      if (r && r.r2 >= 0.9 && (!mejor || r.b > mejor.b + 1e-9 || (Math.abs(r.b - mejor.b) < 1e-9 && n > mejor.n))) mejor = r
    }
  }
  if (!mejor || !(mejor.b > 0)) return { mu: NaN, aviso: 'Sin crecimiento exponencial detectable' }
  const N0 = Math.log(p[0].UFC_mL), Nmax = Math.log(Math.max(...p.map((r) => r.UFC_mL)))
  const lag = Math.max(0, (N0 - mejor.a) / mejor.b)
  return {
    mu: mejor.b, td_min: (Math.log(2) / mejor.b) * 60, lag_h: lag, r2: mejor.r2, ventana: `${mejor.t0} a ${mejor.t1} h`, n_ventana: mejor.n,
    log10_N0: Math.log10(p[0].UFC_mL), crecimiento_log10: (Nmax - N0) / Math.LN10, generaciones: (Nmax - N0) / Math.LN2, intercepto: mejor.a,
  }
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
