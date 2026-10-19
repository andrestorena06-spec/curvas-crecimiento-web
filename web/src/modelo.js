// ============================================================
// Modelo del experimento (uno por vez) y construcción de las series que usa el motor.
//   tipo:      'od' | 'ufc' | 'odufc'
//   origenOd:  'tecan' (cinética del lector) | 'placas' (una placa por tiempo) | 'cubeta' (espectrofotómetro)
// ============================================================
import { estadoVacio } from './motor/pipeline.js'
import { manualADatos, manualDef, normalizarManual } from './motor/odmanual.js'
import { calcularUfc, sugerirDilucionGrupo } from './motor/ufc.js'
import { analizarCurva, finito, media, desvio } from './motor/analisis.js'
import { dixonQ, opAnalisis } from './motor/pipeline.js'
import { detectar } from './motor/atipicos.js'
import { LETRAS, nuevoId, pocillos96, ordenPocillo } from './utils.js'

export const VERSION = 3
export const CEPAS_DEF = ['L100A1', 'L100A1 Rug', 'L100A1 SCV', 'L101B2', 'L101B2 Rug', 'L201', 'L201 Rug']

export const TIPOS = {
  od: { titulo: 'Curva por OD', corto: 'OD' },
  ufc: { titulo: 'Curva por conteo UFC/mL', corto: 'UFC/mL' },
  odufc: { titulo: 'Curva por OD + conteo UFC/mL', corto: 'OD + UFC/mL' },
}
export const ORIGENES = {
  tecan: { titulo: 'Lector Tecan', texto: 'Cinética: el lector mide toda la placa a intervalos cortos y exporta un Excel con una curva por pocillo.' },
  placas: { titulo: 'Lector de placas por tiempo', texto: 'Una placa leída en cada tiempo. Cada lectura es un Excel con la matriz A–H × 1–12.' },
  cubeta: { titulo: 'Espectrofotómetro en cubeta', texto: 'Lecturas manuales de absorbancia de cada muestra, con sus diluciones.' },
}

export const condDef = () => ({ organismo: '', medio: '', temperatura: '', lambda: 600, equipo: '', fecha: new Date().toISOString().slice(0, 10), notas: '' })

// Ajustes de análisis por defecto (los mismos criterios que la versión anterior)
export const ajustesDef = (origen) => ({
  corregir_blanco: origen !== 'cubeta', blanco_metodo: 'tiempo',
  hampel_on: origen === 'tecan', hampel_k: 3, hampel_sigma: 3, hampel_min: 0.002, hampel_accion: 'excluir',
  dixon_on: origen !== 'tecan', dixon_conf: 95,
  odmax_on: false, odmax: 1,
  pocillo_auto: false, pocillo_factor: 3, pocillo_min: 0.03, pocillo_div: 25,
  suavizado: 'ninguno', suav_k: 3, suav_span: 0.3, normalizar: 'ninguna', n_od0: 3, od0_metodo: 'auto',
  an_ancho: origen === 'tecan' ? 2 : 3, an_minpts: origen === 'tecan' ? 4 : 3, an_lnmin: 0.01, an_r2: origen === 'tecan' ? 0.98 : 0.95,
  an_lag_metodo: 'tangente', an_lag_factor: 2, an_umbral_od: 0.3, an_frac_exp: 0.5, an_frac_est: 0.1, an_muerte_pct: 10, an_spline: origen === 'tecan',
  camino_on: false, pocillo_vol: 200, pocillo_diam: 6.4,
  ufc_suave: true, ufc_recta: false,
})

// Camino óptico en un lector de placas (lectura vertical): el haz atraviesa la altura del líquido,
// l = V / área = V / (π d² / 4). Para llevar la OD a 1 cm (como una cubeta): OD₁cm = OD × (1 cm / l).
// Devuelve { l (cm), f (factor) } o null si la corrección está apagada o los datos no sirven.
export function caminoOptico(aj, forzar = false) {
  if (!aj || (!aj.camino_on && !forzar)) return null
  const v = Number(aj.pocillo_vol), d = Number(aj.pocillo_diam)
  if (!(v > 0) || !(d > 0)) return null
  const area = Math.PI * (d / 10 / 2) ** 2       // cm²
  const l = v / 1000 / area                        // cm³ / cm² = cm
  return { l, f: 1 / l, area }
}

export const ufcDef = () => ({ vol: 100, factor: 10, min: 25, max: 250, nd: 8, estimados: true, filas: [],
  primero: 'madre', toma: 100, diluyente: 900, pasos: {} })
// Serie de diluciones del conteo. primero: 'madre' (la 1.ª columna es la suspensión sin diluir) o 'dilucion'
// (la 1.ª columna ya es la primera dilución). Cada columna que es una dilución se hace pasando `toma` µL a
// `diluyente` µL: factor del paso = (toma + diluyente) / toma; `pasos[k]` cambia los volúmenes de la columna k.
// Devuelve, por columna, { k, diluida, toma, diluyente, f (factor del paso), D (dilución total) }.
export function serieUfc(u) {
  const out = []
  let D = 1
  for (let k = 0; k < (u.nd || 1); k++) {
    const diluida = u.primero === 'dilucion' || k > 0
    if (!diluida) { out.push({ k, diluida, f: 1, D: 1 }); continue }
    const p = u.pasos?.[k] || {}
    const toma = Number(p.toma ?? u.toma), dil = Number(p.diluyente ?? u.diluyente)
    const f = toma > 0 && dil >= 0 ? (toma + dil) / toma : NaN
    D *= f
    out.push({ k, diluida, toma, diluyente: dil, f, D, propio: p.toma != null || p.diluyente != null })
  }
  return out
}
const ufcNormal = (x) => {
  const u = { ...ufcDef(), ...(x || {}), filas: Array.isArray(x?.filas) ? x.filas : [] }
  // experimentos anteriores: solo tenían el factor entre diluciones
  if (x && x.toma == null) { u.toma = 100; u.diluyente = Math.max(0, 100 * ((Number(x.factor) || 10) - 1)); u.primero = 'madre'; u.pasos = {} }
  return u
}

export function expNuevo({ nombre, tipo, origenOd, cond, cepas }) {
  const origen = tipo === 'ufc' ? null : origenOd
  return {
    version: VERSION, id: nuevoId(), creado: new Date().toISOString(), nombre: nombre || 'Experimento', tipo, origenOd: origen,
    cond: { ...condDef(), ...(cond || {}) }, cepas: cepas?.length ? cepas : [...CEPAS_DEF],
    aj: ajustesDef(origen),
    tecan: { archivo: null, datos: null, preview: null, config: [] },
    placas: [], excels: [],
    manual: manualDef(),
    ufc: ufcDef(),
    E: estadoVacio(), blancosSel: null, ufcExcl: [], ufcForz: [], plExcl: [], plForz: [],
  }
}

const revive = (d) => (d && d.tiempos && d.pocillos ? {
  tiempos: d.tiempos.map((x) => (x === null ? NaN : x)),
  pocillos: Object.fromEntries(Object.entries(d.pocillos).map(([k, v]) => [k, v.map((x) => (x === null ? NaN : x))])),
} : null)

// Placas con Excel cargado antes de existir la lista de archivos (o sin excelId): su Excel pasa a la lista
// para poder reutilizarlo en otras placas.
export function incorporarExcelsSueltos(placas, excels) {
  const lista = [...(excels || [])]
  let cambio = false
  const ps = (placas || []).map((p) => {
    if (!p.valores || (p.excelId && lista.some((x) => x.id === p.excelId))) return p
    const nombre = p.archivo?.nombre || `Excel de t = ${p.t} h`
    let x = lista.find((q) => q.nombre === nombre && JSON.stringify(q.valores) === JSON.stringify(p.valores))
    if (!x) { x = { id: nuevoId(), nombre, hoja: p.archivo?.hoja, onda: p.archivo?.onda, valores: { ...p.valores }, tNombre: p.t }; lista.push(x) }
    cambio = true
    return { ...p, excelId: x.id }
  })
  return cambio ? { placas: ps, excels: lista } : null
}

export function normalizarExp(x) {
  if (!x || !x.tipo) throw new Error('El archivo no es un experimento de esta versión del programa.')
  const base = expNuevo(x)
  return {
    ...base, ...x,
    cond: { ...base.cond, ...(x.cond || {}) },
    aj: { ...ajustesDef(x.origenOd), ...(x.aj || {}) },
    tecan: { ...base.tecan, ...(x.tecan || {}), datos: revive(x.tecan?.datos), config: x.tecan?.config || [] },
    placas: Array.isArray(x.placas) ? x.placas : [], excels: Array.isArray(x.excels) ? x.excels : [],
    ...(incorporarExcelsSueltos(x.placas, x.excels) || {}),
    manual: normalizarManual(x.manual),
    ufc: ufcNormal(x.ufc),
    E: { ...estadoVacio(), ...(x.E || {}) },
    ufcExcl: x.ufcExcl || [], ufcForz: x.ufcForz || [], plExcl: x.plExcl || [], plForz: x.plForz || [],
  }
}

export const tieneOd = (e) => !!e && e.tipo !== 'ufc'
export const tieneUfc = (e) => !!e && e.tipo !== 'od'

// ------------------------------------------------------------
// Placas por tiempo: cada placa es una lectura con su layout (cepa, blanco y dilución de cada pocillo).
// Cada cepa de una placa numera sus réplicas en orden de lectura (A1, A2… B1…).
// ------------------------------------------------------------
export const placaNueva = (t, layout = {}) => ({ id: nuevoId(), t, archivo: null, valores: null, layout: { ...layout } })

export function replicasDeLayout(layout) {
  const cuenta = {}
  const out = {}
  Object.keys(layout).sort((a, b) => ordenPocillo(a) - ordenPocillo(b)).forEach((p) => {
    const L = layout[p]
    if (!L || !L.muestra || L.blanco) return
    cuenta[L.muestra] = (cuenta[L.muestra] || 0) + 1
    out[p] = cuenta[L.muestra]
  })
  return out
}

export const claveLectura = (plId, p) => `${plId}|${p}`
const tSeg = (t) => Math.round(Number(t) * 3600 * 1000) / 1000

// Blanco «crudo» de una placa (sin exclusiones), para mostrar en la carga de placas
export function blancoDePlaca(pl, excl = new Set()) {
  if (!pl.valores) return { valor: NaN, n: 0, pocillos: [] }
  const ps = Object.keys(pl.layout).filter((p) => pl.layout[p]?.blanco && finito(pl.valores[p]) && !excl.has(claveLectura(pl.id, p)))
  const v = ps.map((p) => pl.valores[p])
  return { valor: ps.length ? media(v) : NaN, n: ps.length, pocillos: ps, de: ps.length > 1 ? desvio(v) : NaN }
}

// Estado de un grupo de lecturas (una cepa, o los blancos, en una placa): detección de atípicos + decisiones manuales
function evaluarGrupo(lect, opDet, manual, forz) {
  lect.forEach((l) => { l.Manual = manual.has(l.clave); l.Forzado = forz.has(l.clave); l.Sospechoso = false; l.Estadistico = null; l.Critico = null; l.detalleTest = '' })
  const cand = lect.filter((l) => !l.Manual && finito(l.valorTest))
  if (cand.length >= 3) {
    const d = detectar(cand.map((l) => l.valorTest), opDet)
    cand.forEach((l) => { l.Estadistico = d.stat; l.Critico = d.crit })
    if (d.idx !== null) { cand[d.idx].Sospechoso = true; cand[d.idx].detalleTest = d.texto }
  }
  lect.forEach((l) => {
    l.AutoExcl = !!opDet.usar && l.Sospechoso && !l.Forzado
    l.Usado = !l.Manual && !l.AutoExcl && finito(l.valorTest)
    l.Motivo = l.Manual ? 'Excluido a mano'
      : l.AutoExcl ? `Excluido automáticamente. ${l.detalleTest}`
        : l.Sospechoso && l.Forzado ? `Sospechoso, conservado a mano. ${l.detalleTest}`
          : l.Sospechoso ? `Sospechoso. ${l.detalleTest} (exclusión automática desactivada)` : ''
  })
}

export const opDeteccion = (aj) => ({ metodo: aj.pl_metodo || 'q', conf: Number(aj.pl_conf) || 95, cvMax: Number(aj.pl_cvmax) || 20, usar: aj.pl_auto !== false })

// Placas por tiempo → lecturas evaluadas y series para el motor.
// En cada placa: 1) los pocillos de blanco se evalúan entre sí y B(t) = media de los blancos aceptados;
// 2) OD corregida = (lectura − B) × factor de dilución; 3) en cada cepa se evalúan sus pocillos entre sí.
// Solo las lecturas aceptadas pasan al análisis.
export function placasADatos(placas, aj, exclusiones = {}) {
  // las placas ocultas no entran en la curva (su blanco sí puede usarse desde otra placa)
  const ok = placas.filter((p) => p.valores && !p.oculta && finito(Number(p.t))).sort((a, b) => a.t - b.t)
  if (!ok.length) return { datos: null, config: [], detalle: [], lecturas: [], avisos: [], blancos: [] }
  const avisos = []
  const opDet = opDeteccion(aj)
  const manual = new Set(exclusiones.manual || []), forz = new Set(exclusiones.forz || [])
  const lecturas = []

  // 1) blancos de cada placa
  const propios = {}
  placas.filter((p) => p.valores).forEach((pl) => {
    const bl = Object.keys(pl.layout).filter((p) => pl.layout[p]?.blanco && finito(pl.valores[p])).sort((a, b) => ordenPocillo(a) - ordenPocillo(b))
      .map((p, i) => ({ plId: pl.id, Placa_T_h: pl.t, Pocillo: p, Muestra: 'Blanco', Replica: i + 1, EsBlanco: true, OD_leida: pl.valores[p], valorTest: pl.valores[p], clave: claveLectura(pl.id, p) }))
    evaluarGrupo(bl, opDet, manual, forz)
    const us = bl.filter((l) => l.Usado).map((l) => l.OD_leida)
    propios[pl.id] = { t: pl.t, valor: us.length ? media(us) : NaN, de: us.length > 1 ? desvio(us) : NaN, n: us.length, pocillos: bl.filter((l) => l.Usado).map((l) => l.Pocillo), lect: bl }
    if (ok.includes(pl)) bl.forEach((l) => lecturas.push(l))
  })
  const blancos = ok.map((p) => {
    const o = p.blancoDe && propios[p.blancoDe]
    if (o && finito(o.valor)) return { id: p.id, t: p.t, valor: o.valor, de: o.de, n: o.n, pocillos: o.pocillos, origen: o.t }
    if (o) avisos.push(`La placa T = ${p.t} h debía usar el blanco de T = ${o.t} h, pero esa placa no tiene blancos aceptados: se usó el propio.`)
    return { id: p.id, t: p.t, ...propios[p.id], origen: p.t }
  })
  const conBlanco = blancos.filter((b) => finito(b.valor))
  const blancoGeneral = conBlanco.length ? media(conBlanco.map((b) => b.valor)) : NaN
  if (aj.corregir_blanco) {
    if (!conBlanco.length) avisos.push('Ninguna placa tiene pocillos de blanco: no se restó blanco.')
    else blancos.forEach((b) => { if (!finito(b.valor)) avisos.push(`La placa T = ${b.t} h no tiene blanco: se usó el promedio del blanco de las demás placas (${blancoGeneral.toFixed(4)}).`) })
  }

  // 2) y 3) lecturas de cada cepa, corregidas y evaluadas por placa
  const fc = caminoOptico(aj)?.f || 1      // llevar a 1 cm de camino óptico (opcional)
  const series = new Map()
  ok.forEach((pl, iPl) => {
    const reps = replicasDeLayout(pl.layout)
    const b = blancos[iPl]
    const bUsado = !aj.corregir_blanco ? 0 : finito(b.valor) ? b.valor : finito(blancoGeneral) ? blancoGeneral : 0
    const lp = Object.entries(reps).map(([p, r]) => {
      const L = pl.layout[p]
      const v = pl.valores[p]
      const f = Number(L.factor) > 0 ? Number(L.factor) : 1
      const corr = finito(v) ? (v - bUsado) * f * fc : NaN
      return { plId: pl.id, Placa_T_h: pl.t, Pocillo: p, Muestra: L.muestra, Replica: r, EsBlanco: false, OD_leida: v, Blanco: bUsado, Blanco_de_T_h: finito(b.valor) ? b.origen : null, Factor_dilucion: f, Factor_camino: fc, OD_corregida: corr, valorTest: corr, clave: claveLectura(pl.id, p) }
    })
    ;[...new Set(lp.map((l) => l.Muestra))].forEach((m) => evaluarGrupo(lp.filter((l) => l.Muestra === m), opDet, manual, forz))
    lp.forEach((l) => {
      lecturas.push(l)
      const k = `${l.Muestra}|${l.Replica}`
      if (!series.has(k)) series.set(k, { muestra: l.Muestra, replica: l.Replica, pos: l.Pocillo, pts: new Map() })
      series.get(k).pts.set(tSeg(pl.t), l.Usado ? l.OD_corregida : NaN)
    })
  })

  const lista = [...series.values()]
  const detalle = lecturas.map((l) => ({ Placa_T_h: l.Placa_T_h, Pocillo: l.Pocillo, Muestra: l.Muestra, Replica: l.Replica, OD_leida: l.OD_leida, Blanco: l.Blanco ?? null, Blanco_de_T_h: l.Blanco_de_T_h ?? null, Factor_dilucion: l.Factor_dilucion ?? null, Factor_camino_1cm: l.Factor_camino ?? null, OD_corregida: l.OD_corregida ?? null, Estado: l.Usado ? (l.Sospechoso ? 'Aceptado (sospechoso conservado)' : 'Aceptado') : 'Excluido', Motivo: l.Motivo }))
  if (lista.length > 96) return { datos: null, config: [], detalle, lecturas, blancos, avisos: [...avisos, `Hay ${lista.length} series (cepa × réplica); el máximo es 96.`] }
  const usados = new Set()
  const libres = pocillos96()
  lista.sort((a, b) => ordenPocillo(a.pos) - ordenPocillo(b.pos)).forEach((x) => { if (!usados.has(x.pos)) { x.virt = x.pos; usados.add(x.pos) } else x.virt = null })
  lista.forEach((x) => { if (!x.virt) { x.virt = libres.find((p) => !usados.has(p)); usados.add(x.virt) } })
  const tiempos = [...new Set(ok.map((p) => tSeg(p.t)))].sort((a, b) => a - b)
  const pocillos = {}, config = []
  lista.forEach((x) => {
    pocillos[x.virt] = tiempos.map((t) => (x.pts.has(t) ? x.pts.get(t) : NaN))
    config.push({ Pocillo: x.virt, Muestra: x.muestra, Replica: x.replica, EsBlanco: false })
  })
  return { datos: { tiempos, pocillos }, config, detalle, lecturas, avisos, blancos }
}

// Series de OD del experimento, listas para el motor: { datos, config, aj (efectivos), avisos, extra }
// Ancho de ventana efectivo: si las lecturas están más espaciadas que lo que permite el ancho elegido,
// se agranda hasta abarcar el número mínimo de puntos (minpts − 1 intervalos típicos)
export function anchoEfectivo(datos, aj) {
  const ancho = Number(aj.an_ancho) || 2
  if (!datos || datos.tiempos.length < 2) return ancho
  const dif = datos.tiempos.slice(1).map((t, i) => (t - datos.tiempos[i]) / 3600).filter((d) => d > 0).sort((a, b) => a - b)
  const paso = dif[Math.floor(dif.length / 2)] || 0
  return Math.max(ancho, paso * (Math.max(3, Math.round(Number(aj.an_minpts) || 3)) - 1) * 1.0001)
}

export function seriesOd(e) {
  if (!tieneOd(e)) return { datos: null, config: [], aj: e.aj, avisos: [] }
  const r0 = seriesOdBase(e)
  const an = anchoEfectivo(r0.datos, e.aj)
  if (an > (Number(e.aj.an_ancho) || 2) + 1e-9) {
    r0.aj = { ...r0.aj, an_ancho: an }
    r0.avisos = [...r0.avisos, `Las lecturas están cada ~${(an / (Math.max(3, Math.round(Number(e.aj.an_minpts) || 3)) - 1)).toFixed(2).replace('.', ',')} h: para que cada ventana de μmax tenga al menos ${Math.max(3, Math.round(Number(e.aj.an_minpts) || 3))} puntos se usó un ancho de ${an.toFixed(2).replace('.', ',')} h.`]
  }
  return r0
}

function seriesOdBase(e) {
  const aj = { ...e.aj, atipicos: e.aj.dixon_on ? 'dixon' : 'ninguno' }
  if (e.origenOd === 'tecan') {
    // camino óptico: escalar las lecturas es lo mismo que escalar (lectura − blanco), porque es una constante
    const c = caminoOptico(e.aj)
    const d = e.tecan.datos
    if (!c || !d) return { datos: d, config: e.tecan.config.filter((x) => d?.pocillos[x.Pocillo]), aj, avisos: [] }
    const datos = { ...d, pocillos: Object.fromEntries(Object.entries(d.pocillos).map(([p, v]) => [p, v.map((y) => y * c.f)])) }
    return { datos, config: e.tecan.config.filter((x) => d.pocillos[x.Pocillo]), aj: { ...aj, odmax: Number(aj.odmax) * c.f, hampel_min: Number(aj.hampel_min) * c.f }, avisos: [] }
  }
  if (e.origenOd === 'placas') {
    const r = placasADatos(e.placas, e.aj, { manual: e.plExcl, forz: e.plForz })
    // las series internas solo son las réplicas de cada tiempo: no se suavizan, normalizan ni comparan como curvas
    return { datos: r.datos, config: r.config, aj: { ...aj, corregir_blanco: false, suavizado: 'ninguno', normalizar: 'ninguna', pocillo_auto: false, atipicos: 'ninguno', hampel_on: false, odmax_on: false }, avisos: r.avisos, extra: r }
  }
  const r = manualADatos(e.manual)
  return { datos: r.datos, config: r.config, aj: { ...aj, corregir_blanco: false }, avisos: r.error ? [r.error] : [] }
}

// ------------------------------------------------------------
// UFC: los conteos se cargan por cepa, réplica, tiempo y dilución; aquí se arma lo que espera el motor.
// Control de calidad: test Q de Dixon sobre log10(UFC/mL) entre réplicas de la misma cepa y tiempo.
// ------------------------------------------------------------
export const claveUfc = (f) => `${f.muestra}|${Number(f.t)}|${Number(f.replica) || 1}`

// Dilución usada por cada cepa en cada tiempo (la misma para todas sus réplicas): { 'cepa|t': { k, sugerida, manual } }
export const claveGrupoUfc = (f) => `${f.muestra}|${Number(f.t)}`
export function dilucionesUfc(u) {
  const par = { min: u.min, max: u.max }
  const grupos = new Map()
  u.filas.forEach((f) => { const g = claveGrupoUfc(f); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(f.c) })
  const out = {}
  grupos.forEach((conts, g) => {
    const sugerida = sugerirDilucionGrupo(conts, par)
    const elegida = u.dilGrupo?.[g]
    const manual = elegida !== undefined && elegida !== null && conts.some((c) => Number.isFinite(Number((c || {})[elegida])))
    out[g] = { k: manual ? Number(elegida) : sugerida, sugerida, manual }
  })
  return out
}
export const filasConDilucion = (u) => { const d = dilucionesUfc(u); return u.filas.map((f) => { const g = d[claveGrupoUfc(f)]; return g && g.k !== null ? { ...f, dil: g.k, dilManual: g.manual } : f }) }

export function resultadosUfc(e) {
  const u = e.ufc
  const motor = (filas) => calcularUfc({ metodo: 'extendida', par: { estimados: u.estimados }, petri: [], tabla: { vol: u.vol, factor: u.factor, min: u.min, max: u.max, nd: u.nd, filas, D: serieUfc(u).map((d) => d.D) } })
  const filasD = filasConDilucion(u)
  const todas = motor(filasD)
  // Dixon entre réplicas (n de 3 a 10)
  const forz = new Set(e.ufcForz)
  const dixon = {}
  const grupos = new Map()
  todas.reps.forEach((r) => {
    if (!finito(r.log10) || e.ufcExcl.includes(`${r.Muestra}|${r.T_h}|${r.Replica}`)) return
    const k = `${r.Muestra}|${r.T_h}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(r)
  })
  grupos.forEach((g) => {
    const d = dixonQ(g.map((r) => r.log10), Number(e.aj.ufc_dixon_conf) || 95)
    if (d) {
      const r = g[d.i]
      dixon[`${r.Muestra}|${r.T_h}|${r.Replica}`] = `${d.metodo === 'Grubbs' ? 'Test de Grubbs' : 'Test Q de Dixon'} sobre log₁₀: ${d.metodo === 'Grubbs' ? 'G' : 'Q'} = ${d.q.toFixed(3)} > crítico ${d.crit.toFixed(3)} (n = ${d.n}, ${d.conf} %), extremo ${d.lado}.`
    }
  })
  const fuera = new Set([...e.ufcExcl, ...(e.aj.ufc_dixon_on !== false ? Object.keys(dixon).filter((k) => !forz.has(k)) : [])])
  const usadas = filasD.filter((f) => !fuera.has(claveUfc(f)))
  const res = motor(usadas)
  return { ...res, reps: todas.reps, dixon, fuera }
}

export const muestrasDe = (e) => {
  const st = new Set(e.cepas)
  e.tecan.config.forEach((c) => st.add(c.Muestra))
  e.placas.forEach((p) => Object.values(p.layout).forEach((l) => l?.muestra && !l.blanco && st.add(l.muestra)))
  e.manual.filas.forEach((f) => f.muestra && st.add(f.muestra))
  e.ufc.filas.forEach((f) => f.muestra && st.add(f.muestra))
  return [...st]
}

export { LETRAS }

// ------------------------------------------------------------
// Placas por tiempo: cada placa es un instante y los pocillos de un tiempo no son el mismo cultivo que los de otro.
// La curva se arma por CEPA con las lecturas de cada tiempo (ya corregidas y sin los puntos excluidos):
//   'media'  → una curva con la media de las réplicas en cada tiempo
//   'puntos' → todas las réplicas como puntos; μmax, su error, OD₀ y lag salen de la regresión con todos los puntos,
//              y K, AUC y los tiempos característicos de la curva media (necesitan un valor por tiempo)
// ------------------------------------------------------------
export const idCepa = (m) => 'cepa:' + m

export function seriesPorCepa(proc) {
  const ws = proc.filter((w) => !w.EsBlanco)
  return [...new Set(ws.map((w) => w.Muestra))].map((m) => {
    const g = ws.filter((w) => w.Muestra === m)
    const por = new Map()
    g.forEach((w) => w.t.forEach((t, i) => { if (finito(w.y[i])) { if (!por.has(t)) por.set(t, []); por.get(t).push(w.y[i]) } }))
    const ts = [...por.keys()].sort((a, b) => a - b)
    const pts = ts.flatMap((t) => por.get(t).map((y) => ({ t, y })))
    return {
      Pocillo: idCepa(m), Muestra: m, Replica: null, EsBlanco: false, nPocillos: g.length,
      t: ts, y: ts.map((t) => media(por.get(t))), n: ts.map((t) => por.get(t).length), sd: ts.map((t) => (por.get(t).length > 1 ? desvio(por.get(t)) : NaN)),
      tPts: pts.map((q) => q.t), yPts: pts.map((q) => q.y),
    }
  })
}

const DE_MEDIA = ['K', 't_K_h', 'od_final', 'auc_od', 'auc_ln', 't_umbral_od_h', 't_max_dod_h', 'dod_max', 'caida_pct', 't_muerte']

export function analizarPorCepa(proc, aj, ventanas, modo = 'media') {
  const op = opAnalisis(aj)
  return seriesPorCepa(proc).map((c) => {
    const v = ventanas[c.Pocillo] || null
    const rm = analizarCurva(c.t.map((t) => t / 3600), c.y, op, v)
    let r = rm
    if (modo === 'puntos') {
      const rp = analizarCurva(c.tPts.map((t) => t / 3600), c.yPts, op, v)
      r = { ...rp }
      DE_MEDIA.forEach((k) => { r[k] = rm[k] })
      r.delta_od = r.K - r.od0
      r.generaciones = r.K > r.od0 && r.od0 > 0 ? Math.log2(r.K / r.od0) : NaN
    }
    return { Pocillo: c.Pocillo, Muestra: c.Muestra, Replica: null, n_pocillos: c.nPocillos, modo_curva: modo, ...r }
  })
}
