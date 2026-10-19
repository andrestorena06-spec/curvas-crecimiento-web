// Desarrollo paso a paso de cada número, con los valores reales, para mostrar al pasar el mouse (data-tip).
// La primera línea es el título; las demás, el desarrollo.
export const F = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '–')
export const sci = (x, d = 2) => (Number.isFinite(x) ? x.toExponential(d).replace('e+', 'E+').replace('e-', 'E-') : '–')
const cuant = (x) => (Number.isFinite(x) ? Number(x.toPrecision(4)) : '–')

// UFC/mL de una réplica (placa o fila de gotas): media ponderada ISO 7218
export function dUfc(r) {
  const { _cont: c, _par: p, _usados: us, _S: S } = r
  if (!p) return null
  const est = r._estado
  if (est === 'sin_datos' || !us || !us.length) return null
  const k = us[0]
  const D = p.D && Number.isFinite(p.D[k]) ? p.D[k] : p.factor ** k
  const V = p.vol
  const elegida = `columna ${k + 1} (dilución 1/${cuant(D)}), ${r._manual ? 'elegida a mano' : 'sugerida'}`
  if (est === 'cero') return `Menor que el límite de detección\n0 colonias en la ${elegida}\nLímite ≈ 3 / (V / D) = 3 / (${cuant(V)} mL / ${cuant(D)}) = ${sci(r.Limite)} UFC/mL`
  if (est === 'incontable') return `Incontable\n${c[k]} colonias en la ${elegida}: más del doble del máximo contable.\nElegí una dilución mayor.`
  const titulo = est === 'ok' ? 'UFC/mL de la réplica (una dilución, dentro del rango contable)' : `UFC/mL estimadas (${est === 'bajo' ? 'bajo' : 'sobre'} el rango contable)`
  return [
    titulo,
    `Dilución usada: ${elegida}`,
    'UFC/mL = C × D / V',
    `= ${c[k]} × ${cuant(D)} / ${cuant(V)} mL = ${sci(r.UFC_mL)}`,
    `IC 95 % (Poisson exacto, C = ${S}): ${sci(r.IC95_inf)} a ${sci(r.IC95_sup)}`,
  ].join('\n')
}
// Coherencia entre diluciones de una réplica (texto para el aviso)
export function dAjuste(aj) {
  if (!aj || !aj.pares.length) return null
  return ['Coherencia entre diluciones (cada paso divide las colonias por su factor)',
    ...aj.pares.map((x) => `columna ${x.k1 + 1} → ${x.k2 + 1}: ${x.c1} → ${x.c2} colonias; esperadas ≈ ${x.esperado.toFixed(1).replace('.', ',')} (÷${cuant(x.factor)})` +
      (x.estado === 'ok' ? ` · coherente (p = ${x.p.toFixed(2).replace('.', ',')})` : x.estado === 'desvio' ? ` · NO coherente (p = ${x.p.toFixed(3).replace('.', ',')})` : ` · ${x.motivo}`)),
    'Prueba binomial exacta: dado el total de las dos, la proporción en la segunda debería ser (1/D₂)/(1/D₁ + 1/D₂).',
  ].join('\n')
}
export const dIcPoisson = (r) => (Number.isFinite(r.IC95_inf) ? `IC 95 % de Poisson exacto (Garwood)
S = ${r._S} colonias contadas
inferior = χ²(0.025; 2S) / 2 ; superior = χ²(0.975; 2S+2) / 2
ambos multiplicados por D / V
→ ${sci(r.IC95_inf)} a ${sci(r.IC95_sup)} UFC/mL` : null)

// media geométrica de las réplicas de una muestra en un tiempo
export function dGeo(r) {
  const v = r._vals
  if (!v || !v.length) return null
  const lg = v.map(Math.log10)
  const m = lg.reduce((a, b) => a + b, 0) / lg.length
  const out = [
    'Media geométrica de las réplicas',
    `log₁₀ de cada réplica: ${lg.map((x) => F(x)).join(', ')}`,
    `media de log₁₀ = (${lg.map((x) => F(x)).join(' + ')}) / ${lg.length} = ${F(m, 4)}`,
    `UFC/mL = 10^${F(m, 4)} = ${sci(10 ** m)}`,
  ]
  if (lg.length > 1) {
    const sd = Math.sqrt(lg.reduce((a, x) => a + (x - m) ** 2, 0) / (lg.length - 1))
    out.push(`DE(log₁₀) = ${F(sd, 3)}`, `IC 95 % = 10^(media ± t × DE/√n) = 10^(${F(m, 3)} ± ${F(r._t95, 3)} × ${F(sd, 3)}/√${lg.length}) = ${sci(r.IC95_inf)} a ${sci(r.IC95_sup)}`)
  }
  return out.join('\n')
}
export const dMuUfc = (c, filas) => (c && Number.isFinite(c.mu)
  ? `Crecimiento por recuento\nμ = pendiente máxima de ln(UFC/mL) contra t\nventana: ${c.ventana} (${c.n_ventana} tiempos, R² = ${F(c.r2, 3)})\nμ = ${F(c.mu, 4)} h⁻¹\ntd = ln 2 / μ = 0.693 / ${F(c.mu, 4)} = ${F(c.td_min, 1)} min\nlag = (ln N₀ − a) / μ = ${F(c.lag_h, 2)} h\ngeneraciones = log₂(N máx / N₀) = ${F(c.generaciones, 2)}`
  : null)
// OD de una fila de lecturas manuales
export function dOdManual(f, m, c) {
  const blanco = m.yaCorregido ? 0 : Number(m.blanco) || 0
  const lect = Object.entries(f.od || {}).map(([k, v]) => [Number(k), Number(v)]).filter(([, v]) => Number.isFinite(v))
  if (!lect.length) return null
  const usados = c.usados || []
  const filas = lect.map(([k, v]) => {
    const neta = v - blanco
    const dentro = neta >= m.vmin && neta <= m.vmax
    return `${k ? `−${k}` : 'sin diluir'}: (${F(v)} − ${F(blanco)}) × ${m.factor}^${k} = ${F(neta * m.factor ** k, 4)}${dentro ? '  ✓ en ventana' : '  (fuera de la ventana lineal)'}`
  })
  return `OD corregida de la fila\nOD = (lectura − blanco) × f^k\nventana lineal: ${m.vmin} a ${m.vmax} (OD neta)\n${filas.join('\n')}\n${usados.length ? `media de las lecturas ✓ = ${F(c.od, 4)}` : `se usa la más cercana a la ventana = ${F(c.od, 4)}`}`
}
