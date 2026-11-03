// ============================================================
// Modelos de crecimiento (Zwietering y Baranyi-Roberts) ajustados por mínimos cuadrados no lineales
// (Levenberg-Marquardt con límites en los parámetros; equivale a nls(..., algorithm = "port") de R).
// ============================================================
import { finito } from './analisis.js'

export const MODELOS = {
  gompertz: 'Gompertz modificado', logistico: 'Logístico', richards: 'Richards', baranyi: 'Baranyi-Roberts',
}

// y = ln(OD) (o ln N) para Baranyi y Roberts (1994) con ν = μmax y curvatura m hacia la meseta:
//   y = y0 + μA − (1/m)·ln[1 + (e^{mμA} − 1) / e^{m(ymax − y0)}]
// m = 1 es la forma habitual. Mientras las exponenciales no desbordan se usa la fórmula directa (con m = 1 da
// exactamente los mismos valores que antes); si desbordarían, la forma equivalente con log1p:
//   ln[1 + e^{u−d} − e^{−d}] = (u − d) + log1p(e^{d−u} − e^{−u}),  u = mμA, d = m(ymax − y0)
export function baranyiF(x, y0, ymax, mu, h0, m = 1) {
  const a = x + Math.log(Math.exp(-mu * x) + Math.exp(-h0) - Math.exp(-mu * x - h0)) / mu
  const u = m * mu * a, d = m * (ymax - y0)
  if (u < 700 && d < 700) {
    if (m === 1) return y0 + mu * a - Math.log(1 + (Math.exp(mu * a) - 1) / Math.exp(ymax - y0))
    return y0 + mu * a - Math.log(1 + (Math.exp(u) - 1) / Math.exp(d)) / m
  }
  const l = u > d ? u - d + Math.log1p(Math.exp(d - u) - Math.exp(-u)) : Math.log1p(Math.exp(u - d) - Math.exp(-d))
  return y0 + mu * a - l / m
}

// Huang (2008), con λ como parámetro directo y α = 4 fijo (como en DMFit y en el paquete growthrates). y = ln N:
//   y = y₀ + y_max − ln[ e^{y₀} + (e^{y_max} − e^{y₀}) e^{−μ B(t)} ] ;  B(t) = t + (1/α) ln[ (1 + e^{−α(t−λ)}) / (1 + e^{αλ}) ]
// Forma estable (equivalente): y = y_max − softplus(ln(e^{d} − 1) − μB),  d = y_max − y₀,  softplus(z) = ln(1 + e^z)
const softplus = (z) => (z > 30 ? z : z < -30 ? Math.exp(z) : Math.log1p(Math.exp(z)))
export function huangF(x, y0, ymax, mu, lam, alpha = 4) {
  const B = x + (softplus(-alpha * (x - lam)) - softplus(alpha * lam)) / alpha
  const d = ymax - y0
  if (!(d > 1e-9)) return ymax
  return ymax - softplus(d + Math.log1p(-Math.exp(-d)) - mu * B)
}

// Errores estándar de los parámetros libres de un ajuste no lineal (como el summary de modFit/nls):
//   cov = s² (JᵀJ)⁻¹ ,  s² = SSE / (n − k) ;  J = jacobiano numérico de la función en el óptimo.
// Devuelve { se: [...], cov: [[...]], s2 } o null si JᵀJ es singular (parámetros no identificables).
export function erroresAjuste(fn, p, x, y) {
  const k = p.length, n = y.length
  if (n <= k) return null
  const f0 = fn(p, x)
  const rss = f0.reduce((s, v, i) => s + (y[i] - v) ** 2, 0)
  const J = []
  for (let j = 0; j < k; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(p[j]))
    const q = p.slice(); q[j] = p[j] + h
    const f1 = fn(q, x)
    J.push(f1.map((v, i) => (v - f0[i]) / h))
  }
  const A = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0)))
  const inv = []
  for (let c = 0; c < k; c++) {
    const col = resolver(A, Array.from({ length: k }, (_, i) => (i === c ? 1 : 0)))
    if (!col || !col.every(finito)) return null
    inv.push(col)
  }
  const s2 = rss / (n - k)
  const cov = inv.map((fila) => fila.map((v) => v * s2))
  const se = cov.map((fila, i) => Math.sqrt(Math.max(0, fila[i])))
  return se.every(finito) ? { se, cov, s2 } : null
}

const resolver = (A, b) => {                  // Gauss con pivoteo parcial (sistemas chicos)
  const n = b.length
  const M = A.map((f, i) => [...f, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-300) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k]
    x[i] = s / M[i][i]
  }
  return x
}

export function levenbergMarquardt(fn, p0, lo, hi, x, y, maxIter = 800) {
  const np = p0.length
  const clamp = (p) => p.map((v, i) => Math.min(Math.max(v, lo[i]), hi[i]))
  const rss = (p) => {
    const f = fn(p, x)
    let s = 0
    for (let i = 0; i < y.length; i++) { const d = y[i] - f[i]; s += d * d }
    return finito(s) ? s : Infinity
  }
  let p = clamp(p0)
  let r0 = rss(p)
  if (!finito(r0)) return { p, rss: NaN, conv: false, estancado: false, iter: 0, enLimite: [] }
  let lam = 1e-3
  let conv = false
  // estancado: ningún paso se pudo calcular (sistema singular o no finito) y se cortó sin cumplir el criterio de
  // convergencia. Antes se lo contaba como convergido; ajustarModelo (OD) lo sigue aceptando para no cambiar sus
  // resultados, pero el ajuste de UFC lo informa.
  let estancado = false
  let iter = 0
  let grad = null
  const hist = []
  for (let it = 0; it < maxIter; it++) {
    iter = it + 1
    const f0 = fn(p, x)
    const res = y.map((v, i) => v - f0[i])
    const J = []
    for (let j = 0; j < np; j++) {
      const paso = 1e-6 * Math.max(1, Math.abs(p[j]))
      const q = p.slice()
      const dir = p[j] + paso > hi[j] ? -1 : 1
      q[j] = p[j] + dir * paso
      const f1 = fn(q, x)
      J.push(f1.map((v, i) => (dir * (v - f0[i])) / paso))
    }
    const A = Array.from({ length: np }, (_, a) => Array.from({ length: np }, (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0)))
    const g = J.map((col) => col.reduce((s, v, i) => s + v * res[i], 0))
    grad = g
    let mejoro = false
    let calculables = 0
    for (let intento = 0; intento < 25; intento++) {
      const Al = A.map((f, i) => f.map((v, k) => (i === k ? v + lam * Math.max(v, 1e-12) : v)))
      const delta = resolver(Al, g)
      if (!delta || !delta.every(finito)) { lam *= 10; continue }
      calculables++
      const pn = clamp(p.map((v, i) => v + delta[i]))
      const rn = rss(pn)
      if (rn < r0) {
        const rel = (r0 - rn) / Math.max(r0, 1e-300)
        const mov = Math.max(...pn.map((v, i) => Math.abs(v - p[i]) / Math.max(1, Math.abs(p[i]))))
        p = pn; r0 = rn; lam = Math.max(lam / 4, 1e-12); mejoro = true
        hist.push(r0)
        // valle muy plano: si en las últimas 20 iteraciones casi no mejora, se considera convergido
        if (rel < 1e-11 || mov < 1e-9 || (hist.length > 20 && (hist[hist.length - 21] - r0) / Math.max(r0, 1e-300) < 1e-7)) conv = true
        break
      }
      lam *= 4
    }
    // ningún paso (ni con el amortiguamiento máximo) baja la suma de cuadrados: si los pasos se pudieron calcular,
    // es un mínimo numérico (convergió); si ninguno se pudo calcular, el ajuste quedó estancado
    if (!mejoro) { if (calculables > 0) conv = true; else estancado = true; break }
    if (conv) break
  }
  // parámetros que quedaron pegados a un límite (el gradiente empuja hacia afuera): el valor no es un óptimo libre
  const enLimite = []
  p.forEach((v, i) => {
    const tol = 1e-6 * Math.max(1, Math.abs(hi[i] - lo[i]))
    const empuja = grad ? grad[i] : 0
    if (v - lo[i] <= tol && !(empuja > 0)) enLimite.push({ i, lado: 'inferior' })
    else if (hi[i] - v <= tol && !(empuja < 0)) enLimite.push({ i, lado: 'superior' })
  })
  return { p, rss: r0, conv, estancado, iter, enLimite }
}

// Ajusta un modelo a una curva. Devuelve siempre un objeto; ok = true si convergió.
export function ajustarModelo(modelo, t, y, od0, mu0, lag0, K0) {
  const vacio = { ok: false, modelo, mu: NaN, lambda: NaN, K: NaN, A: NaN, AIC: NaN, BIC: NaN, RSS: NaN, pred_ln: null }
  const idx = t.map((_, i) => i).filter((i) => finito(t[i]) && finito(y[i]) && y[i] > 0)
  const tt = idx.map((i) => t[i]), yy = idx.map((i) => y[i])
  if (tt.length < 8 || !finito(od0) || od0 <= 0 || !finito(mu0) || mu0 <= 0 || !finito(K0) || K0 <= od0) return vacio
  const lag = finito(lag0) ? Math.max(lag0, 0) : 0
  const A0 = Math.log(K0 / od0)
  const tmax = Math.max(...tt)
  const e = Math.E

  let ajuste, pred
  if (modelo === 'baranyi') {
    const fn = (p, x) => x.map((v) => baranyiF(v, p[0], p[1], p[2], p[3]))
    const ly = yy.map(Math.log)
    ajuste = levenbergMarquardt(fn, [Math.log(od0), Math.log(K0), mu0, Math.max(mu0 * lag, 0.05)], [-12, -12, 1e-4, 0], [5, 5, 10, 30], tt, ly)
    const [y0, ymax, mu, h0] = ajuste.p
    pred = (x) => x.map((v) => baranyiF(v, y0, ymax, mu, h0))
    return resumir(vacio, ajuste, tt, ly, pred, { mu, lambda: h0 / mu, K: Math.exp(ymax), A: ymax - y0 }, 4)
  }
  const ly = yy.map((v) => Math.log(v / od0))
  let fn, p0, lo, hi, np
  if (modelo === 'gompertz') {
    fn = (p, x) => x.map((v) => p[0] * Math.exp(-Math.exp(((p[1] * e) / p[0]) * (p[2] - v) + 1)))
    p0 = [A0, mu0, lag]; lo = [0.01, 1e-4, -1]; hi = [15, 10, tmax]; np = 3
  } else if (modelo === 'logistico') {
    fn = (p, x) => x.map((v) => p[0] / (1 + Math.exp(((4 * p[1]) / p[0]) * (p[2] - v) + 2)))
    p0 = [A0, mu0, lag]; lo = [0.01, 1e-4, -1]; hi = [15, 10, tmax]; np = 3
  } else if (modelo === 'richards') {
    fn = (p, x) => x.map((v) => p[0] * (1 + p[3] * Math.exp(1 + p[3]) * Math.exp((p[1] / p[0]) * (1 + p[3]) ** (1 + 1 / p[3]) * (p[2] - v))) ** (-1 / p[3]))
    p0 = [A0, mu0, lag, 0.5]; lo = [0.01, 1e-4, -1, 0.01]; hi = [15, 10, tmax, 10]; np = 4
  } else return vacio
  ajuste = levenbergMarquardt(fn, p0, lo, hi, tt, ly)
  const p = ajuste.p
  pred = (x) => fn(p, x).map((v) => Math.log(od0) + v)
  return resumir(vacio, ajuste, tt, ly, (x) => fn(p, x), { mu: p[1], lambda: p[2], K: od0 * Math.exp(p[0]), A: p[0] }, np, pred)
}

function resumir(vacio, ajuste, tt, ly, fnVal, par, np, predLn) {
  const n = tt.length
  const rss = ajuste.rss
  // OD: se acepta también el ajuste «estancado» (así lo hacía antes levenbergMarquardt), para no cambiar resultados
  const ok = (ajuste.conv || ajuste.estancado) && finito(rss) && [par.mu, par.lambda, par.K].every(finito)
  const ll = -(n / 2) * (Math.log(2 * Math.PI) + 1 - Math.log(n) + Math.log(rss))
  return {
    ...vacio, ok, ...par, RSS: rss,
    AIC: -2 * ll + 2 * (np + 1), BIC: -2 * ll + Math.log(n) * (np + 1),
    pred_ln: predLn || ((x) => fnVal(x)),
  }
}
