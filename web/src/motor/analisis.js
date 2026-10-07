// ============================================================
// Análisis de curvas de crecimiento (equivale a las funciones de análisis de la app en R).
// Todo el tiempo está en HORAS salvo que se indique otra unidad.
// ============================================================

export const finito = Number.isFinite
export const NA = NaN

export const mediana = (v) => {
  const a = v.filter(finito).sort((x, y) => x - y)
  if (!a.length) return NaN
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
export const media = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN)
export const desvio = (v) => {
  if (v.length < 2) return NaN
  const m = media(v)
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
}

// Integral trapezoidal
export function trapz(x, y) {
  if (x.length < 2) return NaN
  let s = 0
  for (let i = 1; i < x.length; i++) s += ((x[i] - x[i - 1]) * (y[i] + y[i - 1])) / 2
  return s
}

// Primer tiempo en que y alcanza el umbral (interpolación lineal)
export function tiempoHasta(t, y, umbral) {
  const i = y.findIndex((v) => v >= umbral)
  if (i < 0) return NaN
  if (i === 0) return t[0]
  return t[i - 1] + ((umbral - y[i - 1]) * (t[i] - t[i - 1])) / (y[i] - y[i - 1])
}

// Interpolación lineal (rule = 2: fuera del rango se usa el valor del extremo)
export function interpolar(xs, ys, xout) {
  return xout.map((x) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
    let j = 1
    while (xs[j] < x) j++
    return ys[j - 1] + ((x - xs[j - 1]) * (ys[j] - ys[j - 1])) / (xs[j] - xs[j - 1])
  })
}

// ------------------------------------------------------------
// Filtro de Hampel dentro de una curva
// ------------------------------------------------------------
export function hampelDiag(y, k = 3, nsig = 3, minDif = 0.002) {
  const n = y.length
  const out = { flag: Array(n).fill(false), med: Array(n).fill(NaN), umbral: Array(n).fill(NaN), dif: Array(n).fill(NaN) }
  if (n < 5) return out
  for (let i = 0; i < n; i++) {
    const w = y.slice(Math.max(0, i - k), Math.min(n, i + k + 1))
    const med = mediana(w)
    const s = 1.4826 * mediana(w.map((v) => Math.abs(v - med)))
    const um = Math.max(nsig * s, minDif)
    out.med[i] = med
    out.umbral[i] = um
    out.dif[i] = Math.abs(y[i] - med)
    if (finito(y[i]) && out.dif[i] > um) out.flag[i] = true
  }
  return out
}

// Aplica Hampel a una curva (t, y). accion: "excluir" (solo marca) o "interpolar"
export function aplicarHampel(t, y, k, nsig, minDif, accion) {
  const h = hampelDiag(y, k, nsig, minDif)
  const yNuevo = y.slice()
  const f = h.flag
  const buenos = f.map((x) => !x)
  if (accion === 'interpolar' && f.some(Boolean) && buenos.filter(Boolean).length >= 2) {
    const tb = t.filter((_, i) => buenos[i]), yb = y.filter((_, i) => buenos[i])
    const tf = t.filter((_, i) => f[i])
    const v = interpolar(tb, yb, tf)
    let c = 0
    f.forEach((x, i) => { if (x) yNuevo[i] = v[c++] })
  }
  return { y: yNuevo, flag: f, med: h.med, umbral: h.umbral, dif: h.dif }
}

// ------------------------------------------------------------
// Suavizado
// ------------------------------------------------------------
function loessLineal(t, y, span) {
  const n = y.length
  const q = Math.min(n, Math.max(3, Math.floor(n * span + 1e-5)))
  return t.map((x0) => {
    const d = t.map((x) => Math.abs(x - x0))
    const h = Math.max([...d].sort((a, b) => a - b)[q - 1], 1e-12)
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0
    for (let j = 0; j < n; j++) {
      if (d[j] >= h) continue
      const w = (1 - (d[j] / h) ** 3) ** 3
      sw += w; swx += w * t[j]; swy += w * y[j]; swxx += w * t[j] * t[j]; swxy += w * t[j] * y[j]
    }
    const det = sw * swxx - swx * swx
    if (!(sw > 0)) return y[0]
    if (Math.abs(det) < 1e-14 * sw * sw) return swy / sw
    const b = (sw * swxy - swx * swy) / det
    const a = (swy - b * swx) / sw
    return a + b * x0
  })
}

export function suavizarVector(t, y, metodo, k = 3, span = 0.3) {
  const n = y.length
  if (metodo === 'ninguno' || n < 3) return y
  if (metodo === 'media' || metodo === 'mediana') {
    let kk = Math.max(3, Math.round(k))
    if (kk % 2 === 0) kk += 1
    const h = (kk - 1) / 2
    const f = metodo === 'media' ? media : mediana
    return y.map((_, i) => f(y.slice(Math.max(0, i - h), Math.min(n, i + h + 1))))
  }
  if (metodo === 'loess' && n >= 6) {
    const r = loessLineal(t, y, Math.max(span, 4 / n))
    if (r.every(finito)) return r
  }
  return y
}

// Mediana móvil de 3 con regla de extremos de Tukey (runmed(y, 3, endrule = "median"))
export function runmed3(y) {
  const n = y.length
  if (n < 3) return y.slice()
  const m3 = (a, b, c) => [a, b, c].sort((p, q) => p - q)[1]
  const s = y.slice()
  for (let i = 1; i < n - 1; i++) s[i] = m3(y[i - 1], y[i], y[i + 1])
  s[0] = m3(y[0], s[1], 3 * s[1] - 2 * s[2])
  s[n - 1] = m3(y[n - 1], s[n - 2], 3 * s[n - 2] - 2 * s[n - 3])
  return s
}

// ------------------------------------------------------------
// Regresión lineal y ventanas deslizantes sobre ln(OD)
// ------------------------------------------------------------
export function regLineal(x, y) {
  const mx = media(x), my = media(y)
  let sxx = 0
  for (const v of x) sxx += (v - mx) ** 2
  if (!finito(sxx) || sxx <= 0) return { a: NaN, b: NaN, r2: NaN }
  let sxy = 0
  for (let i = 0; i < x.length; i++) sxy += (x[i] - mx) * (y[i] - my)
  const b = sxy / sxx
  const a = my - b * mx
  let sst = 0, sse = 0
  for (let i = 0; i < x.length; i++) { sst += (y[i] - my) ** 2; sse += (y[i] - (a + b * x[i])) ** 2 }
  return { a, b, r2: sst > 0 ? 1 - sse / sst : NaN }
}

export function ventanasLn(t, y, ancho, minPts, lnMin) {
  const idx = t.map((_, i) => i).filter((i) => finito(t[i]) && finito(y[i]) && y[i] > 0 && y[i] >= lnMin).sort((a, b) => t[a] - t[b])
  const tt = idx.map((i) => t[i])
  const ly = idx.map((i) => Math.log(y[i]))
  const n = tt.length
  if (n < minPts) return null
  const filas = []
  for (let i = 0; i < n; i++) {
    const j = []
    for (let k = 0; k < n; k++) if (tt[k] >= tt[i] && tt[k] <= tt[i] + ancho + 1e-9) j.push(k)
    if (j.length < minPts) continue
    const rg = regLineal(j.map((k) => tt[k]), j.map((k) => ly[k]))
    if (!finito(rg.b)) continue
    filas.push({
      t_ini: tt[j[0]], t_fin: tt[j[j.length - 1]], t_mid: (tt[j[0]] + tt[j[j.length - 1]]) / 2,
      pendiente: rg.b, intercepto: rg.a, r2: rg.r2, n: j.length,
    })
  }
  return filas.length ? filas : null
}

// ------------------------------------------------------------
// OD0 automática: modelo de tres fases (meseta inicial + recta) sobre ln(OD)
// ------------------------------------------------------------
export function od0TresFases(t, y, lnmin, tMax) {
  const idx = t.map((_, i) => i).filter((i) => finito(t[i]) && finito(y[i]) && y[i] > 0 && y[i] >= lnmin && t[i] <= tMax + 1e-9)
  const tt = idx.map((i) => t[i])
  const ly = idx.map((i) => Math.log(y[i]))
  const n = tt.length
  if (n < 7) return null
  let mejor = null
  const a0 = tt[1], a1 = tt[n - 3]
  for (let g = 0; g < 300; g++) {
    const lam = a0 + ((a1 - a0) * g) / 299
    const nb = tt.filter((v) => v <= lam).length
    if (nb < 2 || n - nb < 3) continue
    const x = tt.map((v) => Math.max(0, v - lam))
    const rg = regLineal(x, ly)
    if (!finito(rg.b) || rg.b <= 0) continue
    let rss = 0
    for (let i = 0; i < n; i++) rss += (ly[i] - (rg.a + rg.b * x[i])) ** 2
    if (!mejor || rss < mejor.rss) mejor = { y0: rg.a, mu: rg.b, lam, rss, n_base: nb }
  }
  return mejor
}

function aplicarOd0(r, od0, metodo, nBase, tH, y, ys, op) {
  r.od0 = od0
  r.od0_metodo = metodo
  r.od0_n_base = nBase
  r.delta_od = r.K - od0
  r.generaciones = r.K > od0 && od0 > 0 ? Math.log2(r.K / od0) : NaN
  const v = y.map((x) => finito(x) && x >= op.lnmin && x > 0)
  const tv = tH.filter((_, i) => v[i])
  r.auc_ln = tv.length >= 2 && od0 > 0 ? trapz(tv, y.filter((_, i) => v[i]).map((x) => Math.log(x / od0))) : NaN
  r.lag_umbral_h = tiempoHasta(tH, ys, op.lag_factor * od0)
  return r
}

// ------------------------------------------------------------
// Spline suavizante cúbico (Reinsch) con grados de libertad fijos: derivada máxima
// Equivale a max(predict(smooth.spline(t, ln y, df), deriv = 1)) de R (para n <= 49 usa todos los nodos).
// ------------------------------------------------------------
function ldlBanda(d, e1, e2) {           // A = L D L' con 2 bandas inferiores
  const m = d.length
  const D = new Array(m), l1 = new Array(m).fill(0), l2 = new Array(m).fill(0)
  for (let i = 0; i < m; i++) {
    let di = d[i]
    let a1 = i >= 1 ? e1[i - 1] : 0
    let a2 = i >= 2 ? e2[i - 2] : 0
    if (i >= 2) { l2[i] = a2 / D[i - 2]; a1 -= l2[i] * l1[i - 1] * D[i - 2]; di -= l2[i] * l2[i] * D[i - 2] }
    if (i >= 1) { l1[i] = a1 / D[i - 1]; di -= l1[i] * l1[i] * D[i - 1] }
    D[i] = di
  }
  return { D, l1, l2 }
}
function resolverBanda({ D, l1, l2 }, b) {
  const m = D.length
  const z = b.slice()
  for (let i = 0; i < m; i++) { if (i >= 1) z[i] -= l1[i] * z[i - 1]; if (i >= 2) z[i] -= l2[i] * z[i - 2] }
  for (let i = 0; i < m; i++) z[i] /= D[i]
  for (let i = m - 1; i >= 0; i--) { if (i + 1 < m) z[i] -= l1[i + 1] * z[i + 1]; if (i + 2 < m) z[i] -= l2[i + 2] * z[i + 2] }
  return z
}

function splineConDf(x, y, dfObj) {
  const n = x.length
  const h = []
  for (let i = 0; i < n - 1; i++) h.push(x[i + 1] - x[i])
  const m = n - 2
  // Q'y y matrices R y Q'Q (bandas)
  const qty = new Array(m)
  for (let j = 0; j < m; j++) qty[j] = (y[j + 2] - y[j + 1]) / h[j + 1] - (y[j + 1] - y[j]) / h[j]
  const R0 = [], R1 = []
  for (let j = 0; j < m; j++) { R0.push((h[j] + h[j + 1]) / 3); R1.push(j < m - 1 ? h[j + 1] / 6 : 0) }
  // columnas de Q (fila j de Q' tiene 3 valores en las columnas j, j+1, j+2)
  const q = []
  for (let j = 0; j < m; j++) q.push([1 / h[j], -1 / h[j] - 1 / h[j + 1], 1 / h[j + 1]])
  const QQ0 = [], QQ1 = [], QQ2 = []
  for (let j = 0; j < m; j++) {
    QQ0.push(q[j][0] ** 2 + q[j][1] ** 2 + q[j][2] ** 2)
    QQ1.push(j < m - 1 ? q[j][1] * q[j + 1][0] + q[j][2] * q[j + 1][1] : 0)
    QQ2.push(j < m - 2 ? q[j][2] * q[j + 2][0] : 0)
  }
  const armarA = (lam) => ({ d: R0.map((v, j) => v + lam * QQ0[j]), e1: R1.map((v, j) => v + lam * QQ1[j]), e2: QQ2.map((v) => lam * v) })
  const dfDe = (lam) => {
    const { d, e1, e2 } = armarA(lam)
    const F = ldlBanda(d, e1, e2)
    // tr(S) = n - lam * tr(A^-1 Q'Q): se necesitan los elementos de A^-1 dentro de la banda
    let tr = 0
    for (let a = 0; a < m; a++) {
      const e = new Array(m).fill(0); e[a] = 1
      const col = resolverBanda(F, e)
      tr += col[a] * QQ0[a]
      if (a + 1 < m) tr += 2 * col[a + 1] * QQ1[a]
      if (a + 2 < m) tr += 2 * col[a + 2] * QQ2[a]
    }
    return n - lam * tr
  }
  let lo = -12, hi = 12
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2
    if (dfDe(10 ** mid) > dfObj) lo = mid; else hi = mid
  }
  const lam = 10 ** ((lo + hi) / 2)
  const { d, e1, e2 } = armarA(lam)
  const gam = resolverBanda(ldlBanda(d, e1, e2), qty)
  const g2 = [0, ...gam, 0]                                  // segundas derivadas en los nodos (natural)
  const f = y.map((v, i) => {                                // valores ajustados: f = y - lam * Q * gamma
    let s = 0
    if (i >= 2) s += gam[i - 2] * q[i - 2][2]
    if (i >= 1 && i - 1 < m) s += gam[i - 1] * q[i - 1][1]
    if (i < m) s += gam[i] * q[i][0]
    return v - lam * s
  })
  return { f, g2, h }
}

export function muSpline(t, lny, df) {
  const n = t.length
  if (n < 5) return NaN
  const t0 = t[0], sc = t[n - 1] - t[0]
  const x = t.map((v) => (v - t0) / sc)
  const { f, g2, h } = splineConDf(x, lny, df)
  let mx = -Infinity
  const M = 400
  for (let g = 0; g < M; g++) {
    const xx = (g * 1) / (M - 1)
    let i = 0
    while (i < n - 2 && x[i + 1] < xx) i++
    const hh = h[i]
    const a = (x[i + 1] - xx) / hh, b = (xx - x[i]) / hh
    // derivada de la spline cúbica interpolante de (f, g2)
    const d = (f[i + 1] - f[i]) / hh - ((3 * a * a - 1) * hh * g2[i]) / 6 + ((3 * b * b - 1) * hh * g2[i + 1]) / 6
    if (d > mx) mx = d
  }
  return mx / sc
}

// ------------------------------------------------------------
// Parámetros de crecimiento de una curva (t en horas, y en OD)
// ------------------------------------------------------------
export function resultadoVacio(n) {
  return {
    n_puntos: n, od0: NaN, od0_metodo: '', od0_n_base: NaN, mu_max: NaN, mu_se: NaN, td_min: NaN, td_se_min: NaN,
    lag_h: NaN, lag_tangente_h: NaN, lag_umbral_h: NaN, K: NaN, t_K_h: NaN, od_final: NaN, delta_od: NaN,
    generaciones: NaN, auc_od: NaN, auc_ln: NaN, t_umbral_od_h: NaN, t_max_dod_h: NaN, dod_max: NaN,
    mu_spline: NaN, r2: NaN, intercepto: NaN, n_ventana: NaN, t_ini_ventana: NaN, t_fin_ventana: NaN,
    ventana_manual: false, t_exp_ini: NaN, t_exp_fin: NaN, t_estacionaria: NaN, t_muerte: NaN, caida_pct: NaN, aviso: '',
  }
}

const cacheSpline = new Map()

export function analizarCurva(tIn, yIn, op, ventanaManual = null) {
  const ok = tIn.map((v, i) => finito(v) && finito(yIn[i]))
  const orden = tIn.map((_, i) => i).filter((i) => ok[i]).sort((a, b) => tIn[a] - tIn[b])
  const tH = orden.map((i) => tIn[i])
  const y = orden.map((i) => yIn[i])
  const r = resultadoVacio(y.length)

  if (y.length < Math.max(5, op.minpts)) { r.aviso = 'Pocos puntos'; return r }
  const avisos = []
  const avisoOd0 = 'OD0 menor que la OD mínima para ln: se usó la OD mínima'

  // OD0 provisoria (media de los primeros puntos; respaldo)
  const n0 = Math.min(Math.max(1, Math.round(op.n_od0)), y.length)
  let od0Prov = media(y.slice(0, n0))
  const od0Bajo = !finito(od0Prov) || od0Prov < op.lnmin
  if (od0Bajo) od0Prov = op.lnmin
  const metodoProv = `media de los primeros ${n0} puntos`

  // K, AUC, tiempos a umbral
  const ys = runmed3(y)
  let iK = 0
  ys.forEach((v, i) => { if (v > ys[iK]) iK = i })
  const K = ys[iK]
  r.K = K
  r.t_K_h = tH[iK]
  r.od_final = media(y.slice(-3))
  r.auc_od = trapz(tH, y)
  r.t_umbral_od_h = tiempoHasta(tH, ys, op.umbral_od)
  const d = []
  for (let i = 0; i < ys.length - 1; i++) d.push((ys[i + 1] - ys[i]) / (tH[i + 1] - tH[i]))
  let jm = 0
  d.forEach((v, i) => { if (v > d[jm]) jm = i })
  r.dod_max = d[jm]
  r.t_max_dod_h = (tH[jm] + tH[jm + 1]) / 2
  r.caida_pct = K > 0 ? Math.max(0, ((K - r.od_final) / K) * 100) : NaN
  const post = tH.map((_, i) => i).filter((i) => tH[i] > tH[iK] && ys[i] < K * (1 - op.muerte_pct / 100))
  if (post.length) r.t_muerte = tH[post[0]]
  aplicarOd0(r, od0Prov, metodoProv, n0, tH, y, ys, op)

  // Ventanas deslizantes
  const vent = ventanasLn(tH, y, op.ancho, op.minpts, op.lnmin)
  if (!vent) {
    r.aviso = [...avisos, ...(od0Bajo ? [avisoOd0] : []), 'Sin ventanas válidas (OD bajo el mínimo o pocos puntos)'].join('; ')
    r.lag_h = r.lag_umbral_h
    return r
  }

  let sel = null
  if (ventanaManual && ventanaManual.every(finito)) {
    const idx = tH.map((_, i) => i).filter((i) => tH[i] >= ventanaManual[0] && tH[i] <= ventanaManual[1] && y[i] >= op.lnmin && y[i] > 0)
    if (idx.length >= 3) {
      const rg = regLineal(idx.map((i) => tH[i]), idx.map((i) => Math.log(y[i])))
      if (finito(rg.b)) {
        sel = { a: rg.a, b: rg.b, r2: rg.r2, n: idx.length, t_ini: Math.min(...idx.map((i) => tH[i])), t_fin: Math.max(...idx.map((i) => tH[i])), manual: true }
      }
    }
    if (!sel) avisos.push('Ventana manual inválida: se usó la automática')
  }
  if (!sel) {
    let cand = vent.filter((v) => v.r2 >= op.r2min && finito(v.pendiente))
    if (!cand.length) {
      cand = vent.filter((v) => finito(v.pendiente))
      avisos.push(`R2 de la ventana menor que ${op.r2min.toFixed(2)}`)
    }
    if (!cand.length) {
      r.aviso = [...avisos, ...(od0Bajo ? [avisoOd0] : []), 'No se pudo ajustar'].join('; ')
      r.lag_h = r.lag_umbral_h
      return r
    }
    let j = 0
    cand.forEach((v, i) => { if (v.pendiente > cand[j].pendiente) j = i })
    sel = { a: cand[j].intercepto, b: cand[j].pendiente, r2: cand[j].r2, n: cand[j].n, t_ini: cand[j].t_ini, t_fin: cand[j].t_fin, manual: false }
  }

  const mu = sel.b
  r.mu_max = mu
  r.intercepto = sel.a
  r.r2 = sel.r2
  r.n_ventana = sel.n
  r.t_ini_ventana = sel.t_ini
  r.t_fin_ventana = sel.t_fin
  r.ventana_manual = sel.manual
  r.td_min = mu > 0 ? (Math.log(2) / mu) * 60 : NaN
  if (sel.n > 2 && finito(sel.r2) && sel.r2 > 0) {
    r.mu_se = Math.abs(mu) * Math.sqrt(Math.max(0, 1 - sel.r2) / (sel.r2 * (sel.n - 2)))
    if (mu > 0) r.td_se_min = (r.td_min * r.mu_se) / mu
  }
  if (!finito(mu) || mu <= 0) avisos.push('Pendiente no positiva: sin crecimiento detectable')

  // Fases a partir de mu(t)
  const vm = vent.filter((v) => finito(v.pendiente))
  if (vm.length && finito(mu) && mu > 0) {
    let expIni, expFin, iDer
    if (sel.manual) {
      expIni = sel.t_ini
      expFin = sel.t_fin
      const c = vm.map((v, i) => (v.t_mid <= expFin ? i : -1)).filter((i) => i >= 0)
      iDer = c.length ? Math.max(...c) : 0
    } else {
      let jb = vm.findIndex((v) => Math.abs(v.t_ini - sel.t_ini) < 1e-9)
      if (jb < 0) { jb = 0; vm.forEach((v, i) => { if (v.pendiente > vm[jb].pendiente) jb = i }) }
      let iIzq = jb
      iDer = jb
      while (iIzq > 0 && vm[iIzq - 1].pendiente >= op.frac_exp * mu) iIzq--
      while (iDer < vm.length - 1 && vm[iDer + 1].pendiente >= op.frac_exp * mu) iDer++
      expIni = vm[iIzq].t_ini
      expFin = vm[iDer].t_fin
    }
    r.t_exp_ini = expIni
    r.t_exp_fin = expFin
    const desp = vm.map((v, i) => (i > iDer && v.pendiente < op.frac_est * mu ? i : -1)).filter((i) => i >= 0)
    if (desp.length) r.t_estacionaria = Math.max(vm[desp[0]].t_mid, expFin)
  }

  // OD0 automática (meseta inicial del modelo de tres fases)
  if (op.od0_metodo === 'auto') {
    const tf = od0TresFases(tH, y, op.lnmin, sel.t_fin)
    if (tf) {
      aplicarOd0(r, Math.exp(tf.y0), 'automática (tres fases)', tf.n_base, tH, y, ys, op)
    } else {
      avisos.push('No se pudo estimar OD0 automáticamente (pocos puntos antes de la ventana): se usó la media de los primeros puntos')
      if (od0Bajo) avisos.push(avisoOd0)
    }
  } else if (od0Bajo) {
    avisos.push(avisoOd0)
  }

  // Lag
  if (finito(mu) && mu > 0) {
    const lagT = (Math.log(r.od0) - sel.a) / mu
    if (lagT < 0) avisos.push('Lag negativo (sin fase lag): se informa 0')
    r.lag_tangente_h = Math.max(0, lagT)
  }
  r.lag_h = op.lag_metodo === 'umbral' ? r.lag_umbral_h : r.lag_tangente_h

  // mu no paramétrico (spline)
  if (op.spline) {
    const idx = tH.map((_, i) => i).filter((i) => y[i] >= op.lnmin && y[i] > 0)
    if (idx.length >= 8) {
      const tv = idx.map((i) => tH[i]), lv = idx.map((i) => Math.log(y[i]))
      const df = Math.max(4, Math.round(idx.length / 5))
      const clave = `${idx.length}|${df}|${tv[0]}|${tv[tv.length - 1]}|${lv.reduce((s, v, i) => s + v * (i + 1), 0).toFixed(9)}`
      if (!cacheSpline.has(clave)) {
        if (cacheSpline.size > 400) cacheSpline.clear()
        cacheSpline.set(clave, muSpline(tv, lv, df))
      }
      r.mu_spline = cacheSpline.get(clave)
    }
  }

  r.aviso = avisos.join('; ')
  return r
}
