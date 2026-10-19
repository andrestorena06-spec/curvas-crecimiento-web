// ============================================================
// Valores atípicos entre réplicas de un grupo (los pocillos de una cepa en una misma placa / tiempo).
// Mismos criterios que el programa de Biofilm: los tres evalúan un pocillo por grupo (el más alejado)
// y necesitan al menos 3 pocillos.
// ============================================================
import { desvio, finito, media } from './analisis.js'
import { tCuantil } from '../utils.js'

export const METODOS_ATIPICOS = {
  q: 'Test Q de Dixon (3 a 10; con más, Grubbs)',
  grubbs: 'Test de Grubbs (n ≥ 3)',
  cv: 'Coeficiente de variación (%RSD)',
}
// Valores críticos de Q (Rorabacher 1991, dos colas, razón r10) para n = 3 … 10
export const Q_TABLA = {
  90: [0.941, 0.765, 0.642, 0.56, 0.507, 0.468, 0.437, 0.412],
  95: [0.97, 0.829, 0.71, 0.625, 0.568, 0.526, 0.493, 0.466],
  99: [0.994, 0.926, 0.821, 0.74, 0.68, 0.634, 0.598, 0.568],
}

export function detectarQ(x, conf = 95) {
  const n = x.length
  const res = { idx: null, stat: null, crit: null, n, lado: '' }
  if (n < 3 || n > 10 || x.some((v) => !finito(v))) return res
  const o = x.map((_, i) => i).sort((a, b) => x[a] - x[b])
  const s = o.map((i) => x[i])
  const rango = s[n - 1] - s[0]
  if (!(rango > 0)) return res
  const qBajo = (s[1] - s[0]) / rango, qAlto = (s[n - 1] - s[n - 2]) / rango
  res.stat = Math.max(qBajo, qAlto)
  res.crit = (Q_TABLA[conf] || Q_TABLA[95])[n - 3]
  res.lado = qAlto > qBajo ? 'superior' : 'inferior'
  if (res.stat > res.crit) res.idx = qAlto > qBajo ? o[n - 1] : o[0]
  return res
}

// Grubbs bilateral: G = máx |xᵢ − x̄| / s ; crítico = (n − 1)/√n · √(t² / (n − 2 + t²)), t = t(1 − α/(2n); n − 2)
export function criticoGrubbs(n, conf = 95) {
  if (n < 3) return null
  const t = tCuantil(1 - (1 - conf / 100) / (2 * n), n - 2)
  return ((n - 1) / Math.sqrt(n)) * Math.sqrt((t * t) / (n - 2 + t * t))
}
export function detectarGrubbs(x, conf = 95) {
  const n = x.length
  const res = { idx: null, stat: null, crit: null, n, lado: '' }
  if (n < 3 || x.some((v) => !finito(v))) return res
  const m = media(x), s = desvio(x)
  if (!(s > 0)) return res
  let k = 0
  x.forEach((v, i) => { if (Math.abs(v - m) > Math.abs(x[k] - m)) k = i })
  res.stat = Math.abs(x[k] - m) / s
  res.crit = criticoGrubbs(n, conf)
  res.lado = x[k] > m ? 'superior' : 'inferior'
  if (res.stat > res.crit) res.idx = k
  return res
}

// CV (%RSD = 100 · s / |x̄|): si supera el límite, es sospechoso el pocillo más alejado de la media
export function detectarCV(x, limite = 20) {
  const n = x.length
  const res = { idx: null, stat: null, crit: limite, n, lado: '', cvSin: null }
  if (n < 3 || x.some((v) => !finito(v))) return res
  const m = media(x)
  if (!(m !== 0)) return res
  let k = 0
  x.forEach((v, i) => { if (Math.abs(v - m) > Math.abs(x[k] - m)) k = i })
  const resto = x.filter((_, i) => i !== k)
  res.stat = (100 * desvio(x)) / Math.abs(m)
  res.cvSin = (100 * desvio(resto)) / Math.abs(media(resto))
  res.lado = x[k] > m ? 'superior' : 'inferior'
  if (res.stat > limite) res.idx = k
  return res
}

export function detectar(x, { metodo = 'q', conf = 95, cvMax = 20 } = {}) {
  // Dixon solo tiene valores críticos hasta n = 10: con más pocillos se usa Grubbs
  const m = metodo === 'q' && x.length > 10 ? 'grubbs' : metodo
  const d = m === 'grubbs' ? detectarGrubbs(x, conf) : m === 'cv' ? detectarCV(x, cvMax) : detectarQ(x, conf)
  if (d.idx === null) return d
  d.texto = (m !== metodo ? 'Más de 10 pocillos, se usó Grubbs. ' : '') + (m === 'grubbs'
    ? `Test de Grubbs (extremo ${d.lado}): G = ${d.stat.toFixed(3)} > crítico ${d.crit.toFixed(3)} (n = ${d.n}, confianza ${conf} %)`
    : m === 'cv'
      ? `CV del grupo = ${d.stat.toFixed(1)} % > límite ${cvMax} % (pocillo más alejado de la media; sin él, CV = ${d.cvSin.toFixed(1)} %)`
      : `Test Q de Dixon (extremo ${d.lado}): Q = ${d.stat.toFixed(3)} > crítico ${d.crit.toFixed(3)} (n = ${d.n}, confianza ${conf} %)`)
  return d
}
