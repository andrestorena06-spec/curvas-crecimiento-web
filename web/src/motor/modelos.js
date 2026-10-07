// ============================================================
// Modelos de crecimiento (Zwietering y Baranyi-Roberts) ajustados por mínimos cuadrados no lineales
// (Levenberg-Marquardt con límites en los parámetros; equivale a nls(..., algorithm = "port") de R).
// ============================================================
import { finito } from './analisis.js'

export const MODELOS = {
  gompertz: 'Gompertz modificado', logistico: 'Logístico', richards: 'Richards', baranyi: 'Baranyi-Roberts',
}

// y = ln(OD) para Baranyi con nu = mumax
export function baranyiF(x, y0, ymax, mu, h0) {
  const a = x + Math.log(Math.exp(-mu * x) + Math.exp(-h0) - Math.exp(-mu * x - h0)) / mu
  return y0 + mu * a - Math.log(1 + (Math.exp(mu * a) - 1) / Math.exp(ymax - y0))
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

function levenbergMarquardt(fn, p0, lo, hi, x, y, maxIter = 800) {
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
  if (!finito(r0)) return { p, rss: NaN, conv: false }
  let lam = 1e-3
  let conv = false
  const hist = []
  for (let it = 0; it < maxIter; it++) {
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
    let mejoro = false
    for (let intento = 0; intento < 25; intento++) {
      const Al = A.map((f, i) => f.map((v, k) => (i === k ? v + lam * Math.max(v, 1e-12) : v)))
      const delta = resolver(Al, g)
      if (!delta || !delta.every(finito)) { lam *= 10; continue }
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
    if (!mejoro) { conv = true; break }
    if (conv) break
  }
  return { p, rss: r0, conv }
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
  const ok = ajuste.conv && finito(rss) && [par.mu, par.lambda, par.K].every(finito)
  const ll = -(n / 2) * (Math.log(2 * Math.PI) + 1 - Math.log(n) + Math.log(rss))
  return {
    ...vacio, ok, ...par, RSS: rss,
    AIC: -2 * ll + 2 * (np + 1), BIC: -2 * ll + Math.log(n) * (np + 1),
    pred_ln: predLn || ((x) => fnVal(x)),
  }
}
