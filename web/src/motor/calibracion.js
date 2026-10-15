// ============================================================
// Calibración OD ↔ UFC/mL: ajusta una curva a los pares (OD corregida, UFC/mL) de las mismas muestras y tiempos,
// para estimar las UFC/mL a partir de la OD (y viceversa) dentro del rango calibrado.
// ============================================================
import { finito, media } from './analisis.js'

export const MODELOS_CALIB = {
  clasico: 'Clásico: log₁₀ UFC = m·OD + b',
  lineal: 'Lineal: UFC = a + b·OD',
  proporcional: 'Proporcional: UFC = b·OD (por el origen)',
  potencia: 'Potencia (log–log): log₁₀ UFC = a + b·log₁₀ OD',
}

function regresion(x, y) {
  const mx = media(x), my = media(y)
  let sxx = 0, sxy = 0
  x.forEach((v, i) => { sxx += (v - mx) ** 2; sxy += (v - mx) * (y[i] - my) })
  if (!(sxx > 0)) return null
  const b = sxy / sxx
  return { a: my - b * mx, b }
}

// pares: [{ od, ufc }] con od > 0 y ufc > 0
export function ajustarCalibracion(pares, modelo) {
  const p = pares.filter((q) => finito(q.od) && q.od > 0 && finito(q.ufc) && q.ufc > 0)
  const vacio = { ok: false, modelo, n: p.length }
  if (p.length < 3) return { ...vacio, motivo: 'Hacen falta al menos 3 pares OD–UFC.' }
  const od = p.map((q) => q.od), ufc = p.map((q) => q.ufc), lg = ufc.map(Math.log10)
  let pred, coef, eq
  if (modelo === 'clasico') {
    const r = regresion(od, lg)
    if (!r) return { ...vacio, motivo: 'La OD no varía.' }
    coef = { m: r.b, b: r.a }
    pred = (x) => 10 ** (r.b * x + r.a)
    eq = `log₁₀ UFC = ${r.b.toPrecision(4)}·OD ${r.a < 0 ? '−' : '+'} ${Math.abs(r.a).toPrecision(4)}`
  } else if (modelo === 'lineal') {
    const r = regresion(od, ufc)
    if (!r) return { ...vacio, motivo: 'La OD no varía.' }
    coef = { a: r.a, b: r.b }
    pred = (x) => { const v = r.a + r.b * x; return v > 0 ? v : NaN }
    eq = `UFC = ${r.a.toExponential(3)} ${r.b < 0 ? '−' : '+'} ${Math.abs(r.b).toExponential(3)}·OD`
  } else if (modelo === 'proporcional') {
    const b = od.reduce((s, x, i) => s + x * ufc[i], 0) / od.reduce((s, x) => s + x * x, 0)
    coef = { b }
    pred = (x) => b * x
    eq = `UFC = ${b.toExponential(3)}·OD`
  } else if (modelo === 'potencia') {
    const r = regresion(od.map(Math.log10), lg)
    if (!r) return { ...vacio, motivo: 'La OD no varía.' }
    coef = { a: r.a, b: r.b }
    pred = (x) => (x > 0 ? 10 ** (r.a + r.b * Math.log10(x)) : NaN)
    eq = `log₁₀ UFC = ${r.a.toPrecision(4)} + ${r.b.toPrecision(4)}·log₁₀ OD`
  } else return { ...vacio, motivo: 'Modelo desconocido.' }
  // error típico en órdenes de magnitud y R² (ambos en log₁₀ para poder comparar los modelos)
  const res = p.map((q) => { const v = pred(q.od); return finito(v) && v > 0 ? Math.log10(q.ufc) - Math.log10(v) : NaN })
  const ok = res.filter(finito)
  const k = modelo === 'proporcional' ? 1 : 2
  const sse = ok.reduce((s, r) => s + r * r, 0)
  const sigma = ok.length > k ? Math.sqrt(sse / (ok.length - k)) : NaN
  const ml = media(lg)
  const sst = lg.reduce((s, v) => s + (v - ml) ** 2, 0)
  return {
    ok: true, modelo, n: p.length, coef, ecuacion: eq, pred, sigma, R2: sst > 0 ? 1 - sse / sst : NaN,
    rango: [Math.min(...od), Math.max(...od)], errorRelPct: (10 ** (finito(sigma) ? sigma : 0) - 1) * 100,
  }
}

// OD que corresponde a unas UFC/mL dadas (búsqueda numérica sobre la curva ajustada)
export function odDesdeUfc(cal, ufc) {
  if (!cal.ok || !(ufc > 0)) return NaN
  let lo = cal.rango[0] * 0.2, hi = cal.rango[1] * 5
  const f = (x) => cal.pred(x)
  const flo = f(lo), fhi = f(hi)
  if (!finito(flo) || !finito(fhi) || (ufc - flo) * (ufc - fhi) > 0) return NaN
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if ((f(m) - ufc) * (flo - ufc) > 0) lo = m; else hi = m }
  return (lo + hi) / 2
}
