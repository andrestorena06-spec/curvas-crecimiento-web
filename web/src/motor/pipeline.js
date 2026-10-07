// ============================================================
// Cadena de preprocesado y análisis (equivale a las reactivas de la app en R):
//   datos -> corrección al blanco -> marcado de puntos aberrantes -> datos_pre
//         -> control de calidad por pocillo -> pocillos excluidos -> suavizado -> normalización
// Los datos originales nunca se modifican.
// ============================================================
import { analizarCurva, aplicarHampel, finito, mediana, media, suavizarVector, trapz } from './analisis.js'
import { pocillos96 } from './lectura.js'

export const r3 = (t) => Math.round(t * 1000) / 1000
export const clavePunto = (p, t) => `${p}|${r3(t)}`
const ORDEN = Object.fromEntries(pocillos96().map((p, i) => [p, i]))
const subindice = (n) => String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)])
export const nombreReplica = (m, r) => m + subindice(r)
const num = (x, def) => { const v = Number(x); return finito(v) ? v : def }
const f3 = (x) => (finito(x) ? x.toFixed(3) : 'NA')

export const estadoVacio = () => ({ puntosExcl: [], forzados: [], pocillosExcl: [], ventanas: {} })

export const opAnalisis = (aj) => ({
  ancho: num(aj.an_ancho, 2), minpts: Math.max(3, Math.round(num(aj.an_minpts, 4))), lnmin: num(aj.an_lnmin, 0.01),
  r2min: num(aj.an_r2, 0.98), n_od0: num(aj.n_od0, 3), od0_metodo: aj.od0_metodo || 'auto',
  lag_metodo: aj.an_lag_metodo || 'tangente', lag_factor: num(aj.an_lag_factor, 2), umbral_od: num(aj.an_umbral_od, 0.3),
  frac_exp: num(aj.an_frac_exp, 0.5), frac_est: num(aj.an_frac_est, 0.1), muerte_pct: num(aj.an_muerte_pct, 10), spline: !!aj.an_spline,
})

// Serie original de un pocillo: [{t (s), y}] con valores finitos
export function serieDe(datos, p) {
  const y = datos.pocillos[p]
  if (!y) return []
  const s = []
  datos.tiempos.forEach((t, i) => { if (finito(y[i])) s.push({ t, y: y[i] }) })
  return s
}

// ---------------------------------------------------------------
// Corrección al blanco
// ---------------------------------------------------------------
export function construirBlanco({ datos, config, aj, blancosSel, E }) {
  if (!aj.corregir_blanco) return null
  const blancos = config.filter((c) => c.EsBlanco && datos.pocillos[c.Pocillo]).map((c) => c.Pocillo)
  if (!blancos.length) return { error: "Para corregir al blanco, definí al menos un pocillo como blanco (casilla 'Definir como blanco' al configurarlo)." }
  const excl = new Set(E.pocillosExcl)
  const usados = (blancosSel ? blancos.filter((p) => blancosSel.includes(p)) : blancos).filter((p) => !excl.has(p))
  if (!usados.length) return { error: 'Seleccioná al menos una réplica del blanco para calcular el promedio.' }
  const puntos = new Set(E.puntosExcl)
  const prom = new Map()
  datos.tiempos.forEach((t, i) => {
    const v = usados.filter((p) => !puntos.has(clavePunto(p, t))).map((p) => datos.pocillos[p][i]).filter(finito)
    if (v.length) prom.set(r3(t), media(v))
  })
  if (aj.blanco_metodo === 'const_media') { const m = media([...prom.values()]); for (const k of prom.keys()) prom.set(k, m) }
  if (aj.blanco_metodo === 'const_min') { const m = Math.min(...prom.values()); for (const k of prom.keys()) prom.set(k, m) }
  return { prom, usados }
}

// ---------------------------------------------------------------
// Marcado de puntos aberrantes (OD máxima y Hampel)
// ---------------------------------------------------------------
function marcarPozo(datos, c, E, aj, blanco) {
  const puntos = new Set(E.puntosExcl)
  const forz = new Set(E.forzados)
  let base = serieDe(datos, c.Pocillo).filter((r) => !puntos.has(clavePunto(c.Pocillo, r.t)))
  base = base.map((r) => ({ t: r.t, yRaw: r.y, y: r.y }))
  if (blanco) {
    base = base.filter((r) => blanco.prom.has(r3(r.t))).map((r) => ({ ...r, y: r.y - blanco.prom.get(r3(r.t)) }))
  }
  base.sort((a, b) => a.t - b.t)
  const n = base.length
  const yAntes = base.map((r) => r.y)
  const marca = Array(n).fill(null)
  const detalle = Array(n).fill(null)
  const odmax = num(aj.odmax, 1)
  if (aj.odmax_on) {
    base.forEach((r, i) => {
      if (r.y > odmax) {
        marca[i] = 'OD sobre el máximo'
        detalle[i] = `OD = ${f3(r.y)}, mayor que la OD máxima confiable (${f3(odmax)}). El lector pierde linealidad.`
      }
    })
  }
  let y = yAntes.slice()
  if (aj.hampel_on && n) {
    const accion = aj.hampel_accion || 'excluir'
    const nsig = num(aj.hampel_sigma, 3), minDif = num(aj.hampel_min, 0.002)
    const h = aplicarHampel(base.map((r) => r.t), yAntes, Math.max(1, Math.round(num(aj.hampel_k, 3))), nsig, minDif, accion)
    y = h.y
    h.flag.forEach((f, i) => {
      if (f && marca[i] === null) {
        marca[i] = accion === 'interpolar' ? 'Aberrante (interpolado)' : 'Aberrante (Hampel)'
        detalle[i] = `Se aparta ${f3(h.dif[i])} OD de la mediana de sus vecinos (${f3(h.med[i])}). El umbral era ${f3(h.umbral[i])} (${nsig} × MAD, mínimo ${f3(minDif)}).`
        if (accion === 'interpolar') detalle[i] += ` Valor original ${f3(yAntes[i])}, reemplazado por ${f3(y[i])}.`
      }
    })
  }
  const filas = base.map((r, i) => {
    let motivo = marca[i]
    let yy = y[i]
    if (forz.has(clavePunto(c.Pocillo, r.t))) {
      if (marca[i] === 'Aberrante (interpolado)') yy = yAntes[i]
      motivo = null
    }
    return { t: r.t, y: yy, yRaw: r.yRaw, yAntes: yAntes[i], marca: marca[i], detalle: detalle[i], motivo }
  })
  return { ...c, ReplicaNombre: nombreReplica(c.Muestra, c.Replica), filas }
}

export function marcarTodo({ datos, config, E, aj, blanco }) {
  return config
    .filter((c) => datos.pocillos[c.Pocillo])
    .sort((a, b) => ORDEN[a.Pocillo] - ORDEN[b.Pocillo])
    .map((c) => marcarPozo(datos, c, E, aj, blanco))
}

export const conservar = (f) => !f.motivo || f.motivo === 'Aberrante (interpolado)'

// ---------------------------------------------------------------
// Control de calidad por pocillo
// ---------------------------------------------------------------
export function calcularQC({ marcado, config, E, aj }) {
  const odmax = num(aj.odmax, 1), factor = num(aj.pocillo_factor, 3), minP = num(aj.pocillo_min, 0.03), divP = num(aj.pocillo_div, 25)
  const manuales = new Set(E.pocillosExcl)
  const base = config.slice().sort((a, b) => ORDEN[a.Pocillo] - ORDEN[b.Pocillo])
  const porPoc = Object.fromEntries(marcado.map((w) => [w.Pocillo, w]))

  // puntos quitados con su tipo (automáticos, interpolados y manuales)
  const tipoAuto = { 'Aberrante (Hampel)': 'Hampel', 'OD sobre el máximo': 'OD alta', 'Aberrante (interpolado)': 'Hampel, interpolado' }
  const quitados = {}
  marcado.forEach((w) => w.filas.forEach((f) => {
    if (f.motivo) (quitados[w.Pocillo] ||= []).push({ t: f.t, tipo: tipoAuto[f.motivo] })
  }))
  E.puntosExcl.forEach((k) => {
    const [p, t] = k.split('|')
    ;(quitados[p] ||= []).push({ t: Number(t), tipo: 'manual' })
  })

  // comparación de cada pocillo con la mediana de sus réplicas
  const met = {}
  const muestras = [...new Set(base.filter((c) => !c.EsBlanco).map((c) => c.Muestra))]
  for (const m of muestras) {
    const ws = base.filter((c) => c.Muestra === m && !manuales.has(c.Pocillo) && porPoc[c.Pocillo])
      .map((c) => ({ p: c.Pocillo, filas: porPoc[c.Pocillo].filas.filter(conservar) })).filter((w) => w.filas.length)
    if (!ws.length) continue
    const porTiempo = new Map()
    ws.forEach((w) => w.filas.forEach((f) => { const k = f.t; if (!porTiempo.has(k)) porTiempo.set(k, []); porTiempo.get(k).push(f.y) }))
    const M = new Map([...porTiempo].map(([t, v]) => [t, mediana(v)]))
    const r = ws.map((w) => ({
      p: w.p,
      d: media(w.filas.map((f) => Math.abs(f.y - M.get(f.t)))),
      auc: trapz(w.filas.map((f) => f.t / 3600), w.filas.map((f) => f.y)),
    }))
    const k = r.length
    r.forEach((x, i) => {
      x.n_rep = k
      x.d_ref = k >= 3 ? mediana(r.filter((_, j) => j !== i).map((z) => z.d)) : NaN
      x.dif_pct = k === 2 ? (Math.abs(r[0].auc - r[1].auc) / media([r[0].auc, r[1].auc])) * 100 : NaN
      met[x.p] = x
    })
  }

  return base.map((c) => {
    const w = porPoc[c.Pocillo]
    const m = met[c.Pocillo]
    const filas = w ? w.filas : []
    const N_total = filas.length
    const Pts_aberrantes = filas.filter((f) => f.motivo && /Aberrante/.test(f.motivo)).length
    const Pts_OD_alta = filas.filter((f) => f.y > odmax).length
    const Pts_no_positivos = filas.filter((f) => f.y <= 0).length
    const q = (quitados[c.Pocillo] || []).slice().sort((a, b) => a.t - b.t)
    const N_quitados = q.length
    let Puntos_quitados = ''
    if (q.length) {
      let s = q.map((x) => `${(x.t / 3600).toFixed(2)} h (${x.tipo})`)
      if (s.length > 8) s = [...s.slice(0, 8), `... y ${s.length - 8} más`]
      Puntos_quitados = s.join('; ')
    }
    const d_mediana = m ? m.d : NaN
    const d_ref = m ? m.d_ref : NaN
    const ratio = d_mediana / Math.max(d_ref, 1e-9)
    const dif_pct = m ? m.dif_pct : NaN
    const n_rep = m ? m.n_rep : NaN
    const ruidoso = N_total > 0 && Pts_aberrantes / N_total >= 0.1
    let Categoria, Estado
    if (manuales.has(c.Pocillo)) { Categoria = 'Excluido'; Estado = 'Excluido (manual)' }
    else if (c.EsBlanco) { Categoria = 'Blanco'; Estado = 'Blanco' }
    else if (!finito(n_rep)) { Categoria = 'Sin datos'; Estado = 'Sin datos' }
    else if (n_rep === 1) { Categoria = 'Sin réplicas'; Estado = 'Sin réplicas para comparar' }
    else if (n_rep === 2) {
      if (finito(dif_pct) && dif_pct > divP) {
        Categoria = 'Divergentes'
        Estado = `Réplicas divergentes (el AUC difiere ${dif_pct.toFixed(0)}%; con 2 réplicas no se sabe cuál falla)`
      } else { Categoria = 'OK'; Estado = 'OK' }
    } else if (finito(d_ref) && d_mediana > factor * d_ref && d_mediana > minP) {
      Categoria = 'Sospechoso'
      Estado = `Sospechoso (se aparta ${ratio.toFixed(1)} veces más de la mediana que sus réplicas)`
    } else if (ruidoso) {
      Categoria = 'Ruidoso'
      Estado = `Curva ruidosa (${Pts_aberrantes} de ${N_total} puntos marcados por el filtro)`
    } else { Categoria = 'OK'; Estado = 'OK' }
    if (N_quitados > 0) Estado += ` · ${N_quitados} ${N_quitados === 1 ? 'punto quitado' : 'puntos quitados'}`
    return {
      Pocillo: c.Pocillo, Muestra: c.Muestra, Replica: c.Replica, EsBlanco: !!c.EsBlanco, Categoria, Estado,
      d_mediana, ratio, dif_pct, N_quitados, Puntos_quitados, Pts_aberrantes, Pts_OD_alta, Pts_no_positivos, n_rep,
    }
  })
}

// ---------------------------------------------------------------
// Datos procesados (sin pocillos excluidos, suavizados y normalizados)
// ---------------------------------------------------------------
export function procesar({ pre, fuera, aj }) {
  const met = aj.suavizado || 'ninguno'
  const k = num(aj.suav_k, 3), sp = num(aj.suav_span, 0.3)
  const nor = aj.normalizar || 'ninguna'
  const n0 = Math.max(1, Math.round(num(aj.n_od0, 3)))
  return pre.filter((w) => !fuera.has(w.Pocillo) && w.filas.length).map((w) => {
    const t = w.filas.map((f) => f.t)
    let y = w.filas.map((f) => f.y)
    if (met !== 'ninguno') y = suavizarVector(t, y, met, k, sp)
    if (nor !== 'ninguna') {
      const od0 = media(y.slice(0, n0).filter(finito))
      y = y.map((v) => (nor === 'restar' ? v - od0 : v / od0))
    }
    return { ...w, t, y, yOrig: w.filas.map((f) => f.yRaw) }
  })
}

export function preprocesar({ datos, config, E, aj, blancosSel }) {
  const blanco = construirBlanco({ datos, config, aj, blancosSel, E })
  if (blanco?.error) return { error: blanco.error }
  const marcado = marcarTodo({ datos, config, E, aj, blanco })
  const pre = marcado.map((w) => ({ ...w, filas: w.filas.filter(conservar) }))
  const qc = calcularQC({ marcado, config, E, aj })
  const auto = aj.pocillo_auto ? qc.filter((q) => q.Categoria === 'Sospechoso').map((q) => q.Pocillo) : []
  const fuera = new Set([...E.pocillosExcl, ...auto])
  const proc = procesar({ pre, fuera, aj })
  return { blanco, marcado, pre, qc, auto, fuera, proc }
}

// Parámetros de crecimiento de todos los pocillos que no son blanco
export function analizarTodos(proc, aj, ventanas) {
  const op = opAnalisis(aj)
  return proc.filter((w) => !w.EsBlanco).map((w) => {
    const v = ventanas[w.Pocillo]
    const r = analizarCurva(w.t.map((s) => s / 3600), w.y, op, v || null)
    return { Pocillo: w.Pocillo, Muestra: w.Muestra, Replica: w.Replica, ...r }
  }).sort((a, b) => ORDEN[a.Pocillo] - ORDEN[b.Pocillo])
}

// Curva media de una muestra (tiempo a tiempo) a partir de los pocillos dados
export function curvaMedia(wells) {
  const por = new Map()
  wells.forEach((w) => w.t.forEach((t, i) => { if (finito(w.y[i])) { if (!por.has(t)) por.set(t, []); por.get(t).push(w.y[i]) } }))
  const ts = [...por.keys()].sort((a, b) => a - b)
  return { t: ts, y: ts.map((t) => media(por.get(t))), n: ts.map((t) => por.get(t).length) }
}
