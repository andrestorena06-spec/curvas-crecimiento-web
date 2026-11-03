// ============================================================
// Fichas «Cómo se calculó»: para cada número del programa, la explicación paso a paso con los valores reales.
// Son funciones puras que toman los resultados que ya calculó el motor; cuando hace falta mostrar un paso intermedio
// llaman a las MISMAS funciones del motor, así que la ficha no puede dar otro número que la tabla.
// Una ficha: { titulo, sujeto, valor, unidad, sub, que, pasos: [{ titulo, texto, formula, cuenta, esquema, nota }],
//              avisos, ajustes, metodos (ancla de la sección de Métodos) }
// formula / cuenta: lista de partes; una parte es texto o { v: texto, c: 1..4 } (mismo color = misma variable).
// esquema: { tipo: 'grafico' | 'diluciones' | 'replicas' | 'intervalo' | 'tira' | 'barras', ... } (ver esquemas.jsx).
// ============================================================
import { desvio, finito, media, od0TresFases, runmed3, trapz, ventanasLn } from '../motor/analisis.js'
import { Q_TABLA, criticoGrubbs, detectar } from '../motor/atipicos.js'
import { MODELOS_UFC, TEXTO_IC_UFC, dilDe, icPoisson, icUfc } from '../motor/ufc.js'
import { MODELOS_CALIB } from '../motor/calibracion.js'
import { AYUDA, PARAMS, explicarResultado } from '../ayuda.js'
import { fs, fx, tCuantil } from '../utils.js'

// ---------- formato ----------
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (k) => String(k).replace('-', '⁻').replace(/\d/g, (d) => SUP[Number(d)])
// notación científica legible (5,83 × 10⁶); de 0,001 a 9999 se escribe el número tal cual
export function sci(x, d = 2) {
  if (!finito(x)) return '–'
  if (x === 0) return '0'
  let e = Math.floor(Math.log10(Math.abs(x)))
  if (e >= -3 && e <= 3) return fs(x, d + 1)
  let m = x / 10 ** e
  if (Math.abs(Number(m.toFixed(d))) >= 10) { m /= 10; e += 1 }
  return `${m.toFixed(d).replace('.', ',')} × 10${sup(e)}`
}
const g = (x, d = 4) => fs(x, d)         // cifras significativas
const f2 = (x, d = 2) => fx(x, d)        // decimales fijos
const v = (t, c) => ({ v: String(t), c }) // variable coloreada
const hs = (t) => `${fx(t, 2)} h`
// dilución: entera (1/125, 1/15.625) mientras se pueda leer; si no, en potencia de 10
const dil = (D) => (Math.abs(D - 1) < 1e-9 ? 'sin diluir' : Math.abs(D - Math.round(D)) < 1e-6 && D < 1e7 ? `1/${Math.round(D).toLocaleString('es-AR')}` : `1/${sci(D, 2)}`)
const avisosDe = (r) => String(r?.aviso || '').split('; ').filter(Boolean)
const lista = (xs, d = 4) => xs.map((x) => g(x, d)).join(' ; ')

// ============================================================
// OD: parámetros de una curva (réplica, o curva de la cepa en placas por tiempo)
// ============================================================
// puntos de la curva analizada en horas (en placas «sin promediar», todos los pocillos)
function puntosSerie(w, todos) {
  const t0 = (todos && w.tPts ? w.tPts : w.t).map((s) => s / 3600), y0 = todos && w.yPts ? w.yPts : w.y
  const idx = t0.map((_, i) => i).filter((i) => finito(t0[i]) && finito(y0[i])).sort((a, b) => t0[a] - t0[b])
  return { t: idx.map((i) => t0[i]), y: idx.map((i) => y0[i]) }
}
const puntosLn = (p, op) => p.t.map((t, i) => ({ x: t, y: p.y[i] > 0 && p.y[i] >= op.lnmin ? Math.log(p.y[i]) : NaN })).filter((d) => finito(d.y))
// regresión de la ventana con los mismos puntos que usa el motor (los válidos para ln entre el inicio y el fin)
function regVentana(p, r, op) {
  const idx = p.t.map((_, i) => i).filter((i) => p.t[i] >= r.t_ini_ventana - 1e-9 && p.t[i] <= r.t_fin_ventana + 1e-9 && p.y[i] > 0 && p.y[i] >= op.lnmin)
  const xs = idx.map((i) => p.t[i]), ys = idx.map((i) => Math.log(p.y[i]))
  const n = xs.length, tm = media(xs), ym = media(ys)
  const sxx = xs.reduce((s, x) => s + (x - tm) ** 2, 0), sxy = xs.reduce((s, x, i) => s + (x - tm) * (ys[i] - ym), 0)
  const mu = sxy / sxx, a = ym - mu * tm
  const sse = xs.reduce((s, x, i) => s + (ys[i] - a - mu * x) ** 2, 0), sst = ys.reduce((s, y) => s + (y - ym) ** 2, 0)
  return { n, tm, ym, sxx, sxy, mu, a, sse, sst }
}

export function fichaMu(r, w, op, o = {}) {
  const p = puntosSerie(w, o.todos)
  const base = { titulo: 'μmax: velocidad específica máxima', sujeto: o.nombre, unidad: 'h⁻¹', metodos: 'param', que: AYUDA.mu_max.sig,
    ajustes: [`ventana ${g(op.ancho, 3)} h`, `≥ ${op.minpts} puntos`, `R² ≥ ${g(op.r2min, 3)}`, `OD ≥ ${g(op.lnmin, 3)} para ln`, ...(r.ventana_manual ? ['ventana elegida a mano'] : []), ...(o.todos ? ['todos los pocillos'] : [])] }
  if (!finito(r.mu_max)) return { ...base, valor: '–', pasos: [{ titulo: 'No se pudo calcular', texto: r.aviso || 'No hay ventanas válidas.' }] }
  const R = regVentana(p, r, op)
  const ln = puntosLn(p, op)
  const vent = r.ventana_manual ? [] : ventanasLn(p.t, p.y, op.ancho, op.minpts, op.lnmin) || []
  const gl = R.n - 2, tc = gl > 0 ? tCuantil(0.975, gl) : NaN, ic = finito(r.mu_se) ? tc * r.mu_se : NaN
  const pasos = [
    { titulo: 'La OD pasa a logaritmo natural', texto: `En fase exponencial N = N₀·e^(μt), así que ln(OD) crece en línea recta y su pendiente es μ. Entran las ${ln.length} lecturas con OD ≥ ${g(op.lnmin, 3)}${ln.length < p.t.length ? ` (quedan afuera ${p.t.length - ln.length}: cerca del blanco el logaritmo amplifica el ruido)` : ''}.`,
      formula: [v('y', 1), ' = ln(OD) = ln(OD₀) + ', v('μ', 3), ' · ', v('t', 2)] },
    r.ventana_manual
      ? { titulo: 'Ventana elegida a mano', texto: `Se usó la ventana de ${hs(r.t_ini_ventana)} a ${hs(r.t_fin_ventana)} (${R.n} puntos), elegida arrastrando sobre el gráfico de la réplica.` }
      : { titulo: `Se prueban todas las ventanas de ${g(op.ancho, 3)} h`, texto: `Hay ${vent.length} ventanas con ${op.minpts} puntos o más; en cada una se ajusta una recta. Gana la de mayor pendiente entre las de R² ≥ ${g(op.r2min, 3)}: de ${hs(r.t_ini_ventana)} a ${hs(r.t_fin_ventana)}.`,
        esquema: { tipo: 'grafico', alto: 170, xTxt: 'Centro de la ventana (h)', yTxt: 'Pendiente (h⁻¹)', series: [
          { id: 'ok', nombre: `R² ≥ ${g(op.r2min, 3)}`, color: 'acento', linea: false, puntos: true, radio: 3, data: vent.filter((x) => x.r2 >= op.r2min).map((x) => ({ x: x.t_mid, y: x.pendiente, tip: `${hs(x.t_ini)} a ${hs(x.t_fin)}\npendiente ${g(x.pendiente)} · R² ${g(x.r2, 3)}` })) },
          { id: 'no', nombre: `R² < ${g(op.r2min, 3)}`, color: 'tenue', linea: false, puntos: true, radio: 2.4, data: vent.filter((x) => !(x.r2 >= op.r2min)).map((x) => ({ x: x.t_mid, y: x.pendiente, tip: `${hs(x.t_ini)} a ${hs(x.t_fin)}\npendiente ${g(x.pendiente)} · R² ${g(x.r2, 3)}` })) },
        ], extras: [{ x: (r.t_ini_ventana + r.t_fin_ventana) / 2, y: r.mu_max, color: 'aviso', forma: 'anillo', tip: 'Ventana elegida' }] } },
    { titulo: 'Recta de mínimos cuadrados en la ventana', texto: `Con los ${R.n} puntos de la ventana: t̄ = ${g(R.tm)} h, ȳ = ${g(R.ym)}.`,
      formula: [v('μ', 3), ' = Σ(', v('t', 2), ' − t̄)(', v('y', 1), ' − ȳ) / Σ(', v('t', 2), ' − t̄)²   ;   a = ȳ − ', v('μ', 3), ' · t̄'],
      cuenta: [v('μ', 3), ` = ${g(R.sxy, 5)} / ${g(R.sxx, 5)} = `, v(`${g(r.mu_max)} h⁻¹`, 3), `   ;   a = ${g(R.ym)} − ${g(r.mu_max)} × ${g(R.tm)} = ${g(R.a)}`],
      esquema: { tipo: 'grafico', alto: 220, yTxt: 'ln(OD)', ventana: [r.t_ini_ventana, r.t_fin_ventana], series: [
        { id: 'ln', nombre: 'ln(OD)', color: o.color || 'acento', linea: false, puntos: true, radio: 2.6, data: ln },
        { id: 'r', nombre: 'recta de la ventana', color: 'acento2', ancho: 1.8, dash: '6 4', data: [Math.max(p.t[0], r.t_ini_ventana - 1.5), Math.min(p.t[p.t.length - 1], r.t_fin_ventana + 1.5)].map((x) => ({ x, y: R.a + r.mu_max * x })) },
      ] } },
    { titulo: 'Qué tan recta es la ventana y error de μ', texto: 'R² mide cuánto de la variación de ln(OD) en la ventana explica la recta. El error estándar de la pendiente mide el ruido dentro de la ventana: no mide la variación entre réplicas.',
      formula: ['R² = 1 − SSE / SST   ;   EE(', v('μ', 3), ') = |', v('μ', 3), '| · √[ (1 − R²) / (R² · (n − 2)) ]'],
      cuenta: [`R² = 1 − ${g(R.sse, 4)} / ${g(R.sst, 4)} = ${g(r.r2, 4)}   ;   EE = ${finito(r.mu_se) ? g(r.mu_se, 3) : '–'} h⁻¹`, ...(finito(ic) ? [`\nIC 95 % = μ ± t(0,975; ${gl}) · EE = ${g(r.mu_max)} ± ${g(tc, 4)} × ${g(r.mu_se, 3)} = ${g(r.mu_max - ic, 4)} a ${g(r.mu_max + ic, 4)} h⁻¹`] : [])] },
  ]
  if (finito(r.mu_spline)) pasos.push({ titulo: 'Para comparar (no reemplaza a μmax)', texto: `μ por spline de suavizado (máximo de la derivada de una curva suave de ln(OD), sin elegir ventana) = ${g(r.mu_spline)} h⁻¹. Si difiere mucho de μmax, revisá la ventana o el ruido. Los modelos de toda la curva (Gompertz, logístico, Richards, Baranyi) se ajustan con «Ajustar modelos» en el detalle de la curva.` })
  return { ...base, valor: g(r.mu_max), sub: `EE ${finito(r.mu_se) ? g(r.mu_se, 3) : '–'} · R² ${g(r.r2, 4)} · ${R.n} puntos · ${hs(r.t_ini_ventana)} a ${hs(r.t_fin_ventana)}`, pasos, avisos: avisosDe(r) }
}

// R² de la ventana de μmax: residuos de cada lectura respecto de la recta
export function fichaR2Od(r, w, op, o = {}) {
  const p = puntosSerie(w, o.todos)
  const base = { titulo: 'R² de la ventana', sujeto: o.nombre, unidad: '', metodos: 'param', que: AYUDA.r2.sig }
  if (!finito(r.mu_max)) return { ...base, valor: '–', pasos: [{ titulo: 'No se pudo calcular', texto: r.aviso || 'No hay ventanas válidas.' }] }
  const idx = p.t.map((_, i) => i).filter((i) => p.t[i] >= r.t_ini_ventana - 1e-9 && p.t[i] <= r.t_fin_ventana + 1e-9 && p.y[i] > 0 && p.y[i] >= op.lnmin)
  const xs = idx.map((i) => p.t[i]), ys = idx.map((i) => Math.log(p.y[i])), ps = xs.map((t) => r.intercepto + r.mu_max * t)
  const ym = media(ys), sse = ys.reduce((s, y, i) => s + (y - ps[i]) ** 2, 0), sst = ys.reduce((s, y) => s + (y - ym) ** 2, 0)
  return { ...base, valor: g(r.r2, 4), sub: `ventana de ${hs(r.t_ini_ventana)} a ${hs(r.t_fin_ventana)} · ${xs.length} lecturas`, pasos: [
    { titulo: 'Qué tan cerca queda la recta de cada lectura', texto: 'Para cada lectura de la ventana se compara ln(OD) medido con la recta ln(OD) = a + μ·t.',
      esquema: { tipo: 'tabla', columnas: ['t (h)', 'ln(OD) observado', 'ln(OD) de la recta', 'residuo', 'residuo²'], filas: xs.map((t, i) => [fx(t, 2), fx(ys[i], 4), fx(ps[i], 4), fx(ys[i] - ps[i], 4), g((ys[i] - ps[i]) ** 2, 3)]), pie: ['Σ', '', '', '', g(sse, 4)] } },
    { titulo: 'R² = 1 − lo que la recta no explica / lo que varía ln(OD)', formula: ['R² = 1 − SSE / SST   ;   SST = Σ(ln OD − media)²'],
      cuenta: [`media de ln(OD) = ${g(ym)}   ;   SST = ${g(sst, 4)}   ;   SSE = ${g(sse, 4)}`, '\n', `R² = 1 − ${g(sse, 4)} / ${g(sst, 4)} = ${g(r.r2, 4)}`],
      nota: `El programa elige entre las ventanas con R² ≥ ${g(op.r2min, 3)}; este valor dice qué tan recta es la ventana elegida.` },
  ], avisos: avisosDe(r) }
}

export function fichaTd(r, o = {}) {
  const base = { titulo: 'Tiempo de duplicación', sujeto: o.nombre, unidad: 'h', metodos: 'param', que: AYUDA.td_h.sig }
  if (!(r.mu_max > 0)) return { ...base, valor: '–', pasos: [{ titulo: 'No se puede calcular', texto: 'Hace falta una μmax positiva.' }] }
  const tdh = Math.LN2 / r.mu_max
  return { ...base, valor: g(r.td_h), sub: finito(r.td_se_h) ? `EE ${g(r.td_se_h, 3)} h (propagado desde μ)` : '',
    pasos: [
      { titulo: 'De μ a tiempo de duplicación', texto: 'Si la población se duplica en un tiempo td: 2·N₀ = N₀·e^(μ·td), y despejando td = ln 2 / μ.',
        formula: ['td = ln 2 / ', v('μ', 3)], cuenta: ['td = 0,6931 / ', v(`${g(r.mu_max)} h⁻¹`, 3), ` = ${g(r.td_h)} h`] },
      ...(finito(r.td_se_h) ? [{ titulo: 'Error propagado desde μ', texto: 'Aproximación de primer orden: el error relativo de td es el mismo que el de μ.',
        formula: ['EE(td) = td · EE(', v('μ', 3), ') / ', v('μ', 3)], cuenta: [`EE(td) = ${g(r.td_h)} × ${g(r.mu_se, 3)} / ${g(r.mu_max)} = ${g(r.td_se_h, 3)} h`] }] : []),
    ], avisos: avisosDe(r) }
}

export function fichaLag(r, w, op, o = {}) {
  const p = puntosSerie(w, o.todos)
  const base = { titulo: 'Lag (λ)', sujeto: o.nombre, unidad: 'h', metodos: 'param', que: AYUDA.lag_h.sig, ajustes: [op.lag_metodo === 'umbral' ? `umbral: ${g(op.lag_factor, 3)} × OD₀` : 'tangente en μmax'] }
  if (op.lag_metodo === 'umbral') {
    const ys = runmed3(p.y), u = op.lag_factor * r.od0
    const i = ys.findIndex((y) => y >= u)
    const pasos = [
      { titulo: 'Nivel a alcanzar', texto: `OD₀ = ${g(r.od0)}; el lag es el primer tiempo en que la curva (suavizada con una mediana móvil de 3 puntos) llega a ${g(op.lag_factor, 3)} × OD₀.`,
        cuenta: [`umbral = ${g(op.lag_factor, 3)} × ${g(r.od0)} = ${g(u)}`] },
      i > 0
        ? { titulo: 'Interpolación entre las dos lecturas que lo rodean', formula: ['λ = t₁ + (umbral − y₁) · (t₂ − t₁) / (y₂ − y₁)'],
          cuenta: [`λ = ${g(p.t[i - 1])} + (${g(u)} − ${g(ys[i - 1])}) × (${g(p.t[i])} − ${g(p.t[i - 1])}) / (${g(ys[i])} − ${g(ys[i - 1])}) = ${g(r.lag_h)} h`] }
        : { titulo: i === 0 ? 'Ya estaba sobre el umbral en la primera lectura' : 'Nunca llega al umbral', texto: i === 0 ? `λ = ${hs(p.t[0])}` : 'El lag queda vacío.' },
    ]
    return { ...base, valor: g(r.lag_h), pasos, avisos: avisosDe(r) }
  }
  if (!finito(r.mu_max) || !(r.mu_max > 0)) return { ...base, valor: g(r.lag_h), pasos: [{ titulo: 'Sin recta de μmax', texto: 'Sin μmax no hay tangente: se informó el lag por umbral.' }], avisos: avisosDe(r) }
  const lnod0 = Math.log(r.od0), lagT = (lnod0 - r.intercepto) / r.mu_max
  const ln = puntosLn(p, op)
  const x1 = Math.min(p.t[p.t.length - 1], r.t_fin_ventana + 1)
  return { ...base, valor: g(r.lag_h), pasos: [
    { titulo: 'La recta de μmax', texto: `Es la recta de la ventana de mayor pendiente (${hs(r.t_ini_ventana)} a ${hs(r.t_fin_ventana)}).`, formula: ['ln OD = ', v('a', 1), ' + ', v('μ', 3), ' · t'], cuenta: ['ln OD = ', v(g(r.intercepto), 1), ' + ', v(g(r.mu_max), 3), ' · t'] },
    { titulo: 'El nivel inicial', texto: `OD₀ = ${g(r.od0)} (${r.od0_metodo || 'ver su ficha'}), así que ln OD₀ = ${g(lnod0)}.` },
    { titulo: 'Donde la recta cruza el nivel inicial', texto: 'Es la definición clásica del lag: el tiempo que el cultivo «pierde» antes de crecer a velocidad máxima.',
      formula: ['λ = (ln OD₀ − ', v('a', 1), ') / ', v('μ', 3)],
      cuenta: [`λ = (${g(lnod0)} − (`, v(g(r.intercepto), 1), ')) / ', v(g(r.mu_max), 3), ` = ${g(lagT)} h${lagT < 0 ? '  → negativo (ya crecía al empezar): se informa 0' : ''}`],
      esquema: { tipo: 'grafico', alto: 220, yTxt: 'ln(OD)', ventana: [r.t_ini_ventana, r.t_fin_ventana], series: [
        { id: 'ln', nombre: 'ln(OD)', color: o.color || 'acento', linea: false, puntos: true, radio: 2.6, data: ln },
        { id: 'tg', nombre: 'recta de μmax', color: 'acento2', ancho: 1.6, dash: '6 4', data: [Math.max(lagT, p.t[0]), x1].map((x) => ({ x, y: r.intercepto + r.mu_max * x })) },
        { id: 'od0', nombre: 'ln OD₀', color: 'sec', ancho: 1.2, dash: '2 3', data: [p.t[0], Math.max(lagT, p.t[0]) + 0.5].map((x) => ({ x, y: lnod0 })) },
      ], extras: [{ x: Math.max(lagT, p.t[0]), y: lnod0, color: 'aviso', forma: 'anillo', tip: `λ = ${g(r.lag_h)} h` }] } },
  ], avisos: avisosDe(r) }
}

export function fichaOd0(r, w, op, o = {}) {
  const p = puntosSerie(w, o.todos)
  const base = { titulo: 'OD₀: OD inicial', sujeto: o.nombre, unidad: '', metodos: 'param', que: AYUDA.od0.sig, ajustes: [/^autom/.test(r.od0_metodo || '') ? 'automática (tres fases)' : `media de los primeros ${op.n_od0} puntos`] }
  if (/^autom/.test(r.od0_metodo || '')) {
    const tf = od0TresFases(p.t, p.y, op.lnmin, r.t_fin_ventana)
    if (tf) {
      const ln = puntosLn(p, op).filter((d) => d.x <= r.t_fin_ventana + 1e-9)
      const x1 = r.t_fin_ventana
      return { ...base, valor: g(r.od0), pasos: [
        { titulo: 'Puntos desde el inicio hasta el final de la ventana de μmax', texto: `${ln.length} lecturas con OD ≥ ${g(op.lnmin, 3)} hasta ${hs(x1)}. Tomar solo la primera lectura es ruidoso: se usa toda la meseta inicial.` },
        { titulo: 'Modelo de tres fases (Buchanan et al., 1997), sin la estacionaria', formula: ['ln OD = ', v('y₀', 1), '  si t ≤ ', v('λ', 2), '   ;   ', v('y₀', 1), ' + μ·(t − ', v('λ', 2), ')  si t > ', v('λ', 2)],
          texto: 'Se prueban 300 valores de λ; para cada uno, y₀ y μ salen de una regresión lineal sobre x = máx(0, t − λ), y se elige el λ con la menor suma de cuadrados.',
          cuenta: [v(`λ = ${g(tf.lam)} h`, 2), '   ;   ', v(`y₀ = ${g(tf.y0)}`, 1), `   ;   μ = ${g(tf.mu)} h⁻¹   ;   ${tf.n_base} puntos en la meseta`],
          esquema: { tipo: 'grafico', alto: 200, yTxt: 'ln(OD)', series: [
            { id: 'ln', nombre: 'ln(OD)', color: o.color || 'acento', linea: false, puntos: true, radio: 2.6, data: ln },
            { id: 'tf', nombre: 'tres fases', color: 'acento2', ancho: 1.8, data: [p.t[0], tf.lam, x1].map((x) => ({ x, y: tf.y0 + tf.mu * Math.max(0, x - tf.lam) })) },
          ] } },
        { titulo: 'OD₀ es la meseta', formula: ['OD₀ = e^', v('y₀', 1)], cuenta: ['OD₀ = e^', v(g(tf.y0), 1), ` = ${g(r.od0)}`] },
      ], avisos: avisosDe(r) }
    }
  }
  const n0 = Math.min(Math.max(1, Math.round(op.n_od0)), p.y.length), ys = p.y.slice(0, n0)
  return { ...base, valor: g(r.od0), pasos: [
    { titulo: `Media de los primeros ${n0} puntos`, formula: ['OD₀ = (y₁ + … + yₙ) / n'], cuenta: [`OD₀ = (${ys.map((y) => g(y)).join(' + ')}) / ${n0} = ${g(media(ys))}`],
      nota: media(ys) < op.lnmin ? `Es menor que la OD mínima para ln (${g(op.lnmin, 3)}): se usó ${g(op.lnmin, 3)}.` : '' },
  ], avisos: avisosDe(r) }
}

export function fichaK(r, w, o = {}) {
  const p = puntosSerie(w, false)
  const ys = runmed3(p.y)
  let iK = 0
  ys.forEach((y, i) => { if (y > ys[iK]) iK = i })
  const vec = p.y.slice(Math.max(0, iK - 1), iK + 2)
  return { titulo: 'K: OD máxima', sujeto: o.nombre, valor: g(r.K), unidad: 'OD', metodos: 'param', que: AYUDA.K.sig, sub: `a las ${hs(r.t_K_h)}`,
    pasos: [
      { titulo: 'Se suaviza con una mediana móvil de 3 puntos', texto: 'Cada lectura se reemplaza por la mediana de ella y sus dos vecinas (en los extremos, la regla de Tukey). Así un pico aislado (una burbuja) no cuenta como máximo.',
        cuenta: [`en el máximo: mediana(${vec.map((y) => g(y)).join(' ; ')}) = ${g(ys[iK])}`] },
      { titulo: 'K es el valor más alto de la curva suavizada', cuenta: [`K = ${g(r.K)} a las ${hs(r.t_K_h)}`],
        esquema: { tipo: 'grafico', alto: 200, yTxt: 'OD', series: [
          { id: 'od', nombre: 'OD', color: o.color || 'acento', linea: false, puntos: true, radio: 2.4, data: p.t.map((x, i) => ({ x, y: p.y[i] })) },
          { id: 'sv', nombre: 'mediana móvil de 3', color: 'acento2', ancho: 1.6, data: p.t.map((x, i) => ({ x, y: ys[i] })) },
        ], extras: [{ x: r.t_K_h, y: r.K, color: 'aviso', forma: 'anillo', tip: `K = ${g(r.K)}` }] } },
    ], avisos: r.t_K_h >= p.t[p.t.length - 1] - 1e-9 ? ['K está en la última lectura: el cultivo puede no haber llegado a la meseta.'] : [] }
}

export function fichaGeneraciones(r, o = {}) {
  return { titulo: 'Generaciones', sujeto: o.nombre, valor: g(r.generaciones), unidad: '', metodos: 'param', que: AYUDA.generaciones.sig,
    pasos: [{ titulo: 'Cuántas veces se duplicó la OD de OD₀ a K', texto: 'Cada generación duplica la población: K = OD₀ · 2ⁿ, así que n = log₂(K / OD₀).',
      formula: ['n = log₂(', v('K', 1), ' / ', v('OD₀', 2), ') = ln(K / OD₀) / ln 2'],
      cuenta: ['n = log₂(', v(g(r.K), 1), ' / ', v(g(r.od0), 2), `) = log₂(${g(r.K / r.od0)}) = ${g(r.generaciones)}`] }] }
}
export function fichaDeltaOd(r, o = {}) {
  return { titulo: 'ΔOD', sujeto: o.nombre, valor: g(r.delta_od), unidad: 'OD', metodos: 'param', que: AYUDA.delta_od.sig,
    pasos: [{ titulo: 'K menos OD₀', formula: ['ΔOD = ', v('K', 1), ' − ', v('OD₀', 2)], cuenta: ['ΔOD = ', v(g(r.K), 1), ' − ', v(g(r.od0), 2), ` = ${g(r.delta_od)}`] }] }
}
export function fichaAuc(r, w, o = {}) {
  const p = puntosSerie(w, false)
  const tr = p.y.slice(1).map((y, i) => ((p.y[i] + y) / 2) * (p.t[i + 1] - p.t[i]))
  return { titulo: 'AUC de OD', sujeto: o.nombre, valor: g(r.auc_od), unidad: 'OD·h', metodos: 'param', que: AYUDA.auc_od.sig,
    pasos: [{ titulo: 'Regla del trapecio', texto: `Entre cada par de lecturas la curva se aproxima por una recta y se suma el área de los ${tr.length} trapecios, de ${hs(p.t[0])} a ${hs(p.t[p.t.length - 1])}.`,
      formula: ['AUC = Σ ½ (yᵢ + yᵢ₊₁) · (tᵢ₊₁ − tᵢ)'],
      cuenta: [`AUC = ${tr.slice(0, 3).map((x) => g(x, 3)).join(' + ')}${tr.length > 3 ? ` + … (${tr.length} términos)` : ''} = ${g(trapz(p.t, p.y))} OD·h`],
      esquema: { tipo: 'grafico', alto: 190, yTxt: 'OD', series: [{ id: 'a', nombre: 'OD', color: o.color || 'acento', banda: true, puntos: true, radio: 2.2, data: p.t.map((x, i) => ({ x, y: p.y[i], lo: 0, hi: p.y[i] })) }] } }] }
}
// el resto de los parámetros de OD: el texto del cálculo con los valores
function fichaGenerica(r, k, op, o = {}) {
  const ex = explicarResultado(r, k, op)
  return { titulo: PARAMS[k] || k, sujeto: o.nombre, valor: g(r[k]), unidad: '', metodos: 'param', que: AYUDA[k]?.sig,
    pasos: [{ titulo: 'Cómo se calculó', texto: ex.calculo }, ...(ex.error && !/^Este parámetro no tiene/.test(ex.error) ? [{ titulo: 'Error', texto: ex.error }] : [])], avisos: avisosDe(r) }
}
// ficha de un parámetro de OD de una curva. w: la serie analizada; o: { nombre, color, todos (placas sin promediar) }
export function fichaParamOd(k, r, w, op, o = {}) {
  if (!r || !w) return null
  const conPuntos = { ...o, todos: o.todos && !['K', 't_K_h', 'auc_od', 'auc_ln', 't_umbral_od_h', 't_max_dod_h', 'dod_max', 'caida_pct', 't_muerte', 'od_final'].includes(k) }
  if (k === 'r2') return fichaR2Od(r, w, op, conPuntos)
  if (k === 'mu_max') return fichaMu(r, w, op, conPuntos)
  if (k === 'td_h') return fichaTd(r, o)
  if (k === 'lag_h') return fichaLag(r, w, op, conPuntos)
  if (k === 'od0') return fichaOd0(r, w, op, conPuntos)
  if (k === 'K' || k === 't_K_h') return fichaK(r, w, o)
  if (k === 'generaciones') return fichaGeneraciones(r, o)
  if (k === 'delta_od') return fichaDeltaOd(r, o)
  if (k === 'auc_od') return fichaAuc(r, w, o)
  return fichaGenerica(r, k, op, o)
}

// ---------- media ± error de varios valores (réplicas) ----------
// valores: [{ etiqueta, x }]; tipo: 'sd' | 'sem' | 'ic95'
function pasosMedia(valores, unidad, tipo = 'sd') {
  const xs = valores.map((q) => q.x), n = xs.length, m = media(xs), sd = n > 1 ? desvio(xs) : NaN
  const tc = n > 1 ? tCuantil(0.975, n - 1) : NaN
  const pasos = [
    { titulo: `Los ${n} valores`, texto: valores.map((q) => `${q.etiqueta}: ${g(q.x)}`).join(' · '),
      esquema: { tipo: 'tira', valores: valores.map((q) => ({ x: q.x, etiqueta: q.etiqueta })), media: m, de: sd, unidad } },
    { titulo: 'Media', formula: ['x̄ = Σxᵢ / n'], cuenta: [`x̄ = (${xs.map((x) => g(x)).join(' + ')}) / ${n} = ${g(m)}`] },
  ]
  if (n > 1) {
    pasos.push({ titulo: 'Desviación estándar (cuánto se separan entre sí)', texto: 'Se divide por n − 1 porque la media salió de los mismos datos (corrección de Bessel).',
      formula: ['DE = √[ Σ(xᵢ − x̄)² / (n − 1) ]'], cuenta: [`DE = √[ ${g(xs.reduce((s, x) => s + (x - m) ** 2, 0), 4)} / ${n - 1} ] = ${g(sd)}`] })
    if (tipo !== 'sd') pasos.push({ titulo: tipo === 'sem' ? 'Error estándar de la media' : 'Intervalo de confianza del 95 % de la media',
      formula: [tipo === 'sem' ? 'EEM = DE / √n' : 'IC 95 % = x̄ ± t(0,975; n − 1) · DE / √n'],
      cuenta: [tipo === 'sem' ? `EEM = ${g(sd)} / √${n} = ${g(sd / Math.sqrt(n))}` : `IC 95 % = ${g(m)} ± ${g(tc, 4)} × ${g(sd)} / √${n} = ${g(m - (tc * sd) / Math.sqrt(n))} a ${g(m + (tc * sd) / Math.sqrt(n))}`] })
  }
  return { pasos, m, sd, n, tc }
}
// Cómo se calculó el valor de CADA réplica: una columna por réplica y una fila por paso con cuenta (se toman de la ficha de cada una).
// porReplica: [{ etiqueta, fichas: [ficha de cada parámetro necesario] }]
const aTexto = (c) => (c || []).map((p) => (typeof p === 'string' ? p : p?.v ?? '')).join('').replace(/\s+;\s+/g, '\n').replace(/\s*\n\s*/g, '\n').trim()
function tablaPorReplica(porReplica) {
  if (!porReplica?.length) return null
  const filas = []
  const claves = new Map()
  porReplica.forEach((pr, j) => pr.fichas.forEach((f, fi) => (f?.pasos || []).filter((p) => p.cuenta).forEach((p, orden) => {
    const k = fi + '|' + orden
    if (!claves.has(k)) { claves.set(k, filas.length); filas.push({ titulo: p.titulo, celdas: porReplica.map(() => '–') }) }
    filas[claves.get(k)].celdas[j] = aTexto(p.cuenta)
  })))
  if (!filas.length) return null
  const valores = ['Valor', ...porReplica.map((pr) => { const f = pr.fichas[pr.fichas.length - 1]; return f ? `${f.valor}${f.unidad ? ' ' + f.unidad : ''}` : '–' })]
  return { tipo: 'tabla', clase: 'por-replica', columnas: ['Cálculo', ...porReplica.map((pr) => pr.etiqueta)], filas: [...filas.map((f) => [f.titulo, ...f.celdas]), valores] }
}
const pasoReplicas = (porReplica, n) => {
  const t = tablaPorReplica(porReplica)
  return t ? [{ titulo: `Cómo se calculó el valor de cada una de las ${n} réplicas`, texto: 'Cada réplica (pocillo o serie) tiene su propia curva y su propio cálculo: acá están lado a lado. Después se promedian.', esquema: t }] : []
}
// resumen por cepa: media ± DE entre réplicas técnicas de un parámetro de OD
export function fichaResumen(rs, k, filas, o = {}) {
  const etq = o.etiqueta || ((r) => `réplica ${r.Replica}`)
  const avisoN = (n) => (n > 0 && n < 3 ? [`Con n = ${n} la DE y el IC 95 % tienen muy poca base${n === 2 ? ' (t(0,975; 1) = 12,7)' : ''}: tomalos como orientación.`] : [])
  const nota = 'Son réplicas técnicas (pocillos o series) de UN experimento: para generalizar a la cepa hacen falta experimentos independientes.'
  // ninguna réplica dio el parámetro: se explica por qué (los avisos de cada curva)
  const kBase = k === 'td_h' ? 'mu_max' : k
  if (!filas.some((r) => finito(r[kBase]))) {
    return { titulo: `${PARAMS[k] || k} de la cepa`, sujeto: rs.Muestra, valor: '–', metodos: 'replicas', que: AYUDA[k]?.sig,
      pasos: [{ titulo: 'Ninguna réplica dio este parámetro', texto: filas.map((r) => `${etq(r)}: ${r.aviso || 'sin valor'}`).join(' · ') }] }
  }
  if (k === 'r2') {
    const vals = filas.map((r) => ({ etiqueta: etq(r), x: r.r2 })).filter((q) => finito(q.x))
    return { titulo: 'R² de la ventana (el más bajo)', sujeto: rs.Muestra, valor: g(rs.r2.m), metodos: 'replicas', que: 'Calidad del ajuste lineal de ln(OD) en la ventana de μmax de cada réplica.',
      pasos: [...pasoReplicas(o.porReplica, vals.length), { titulo: 'No se promedia', texto: `El R² dice qué tan bien ajusta la recta de cada réplica; no es una magnitud de la cepa, así que no lleva media ni DE. Se informa el peor de las ${vals.length} réplicas: ${vals.map((q) => `${q.etiqueta} ${g(q.x)}`).join(' · ')}.`,
        esquema: { tipo: 'tira', valores: vals, unidad: 'R²' } }] }
  }
  if (k === 'td_h') {
    const vals = filas.map((r) => ({ etiqueta: etq(r), x: r.mu_max })).filter((q) => finito(q.x))
    const M = pasosMedia(vals, 'h⁻¹', 'sd')
    const td = Math.LN2 / M.m, sdTd = finito(M.sd) ? (td * M.sd) / M.m : NaN
    return { titulo: 'Tiempo de duplicación de la cepa', sujeto: rs.Muestra, valor: g(rs.td_h.m), unidad: 'h', metodos: 'replicas', que: AYUDA.td_h.sig,
      sub: finito(sdTd) ? `± ${g(sdTd, 3)} h (propagado desde la DE de μ)` : '',
      pasos: [...pasoReplicas(o.porReplica, M.n), ...M.pasos.slice(0, 2).map((p, i) => (i === 0 ? { ...p, titulo: `μmax de las ${M.n} réplicas` } : { ...p, titulo: 'Media de la μmax de las réplicas' })),
        { titulo: 'td con la μ media (no el promedio de los td)', texto: 'Promediar los td daría otro número (el promedio de 1/μ no es 1/promedio de μ).',
          formula: ['td = ln 2 / μ̄'], cuenta: [`td = 0,6931 / ${g(M.m)} = ${g(td)} h`] },
        ...(finito(sdTd) ? [{ titulo: 'DE propagada desde la de μ', formula: ['DE(td) = td · DE(μ) / μ̄'], cuenta: [`DE(td) = ${g(td)} × ${g(M.sd)} / ${g(M.m)} = ${g(sdTd, 3)} h`] }] : [])],
      avisos: avisoN(M.n), nota }
  }
  const vals = filas.map((r) => ({ etiqueta: etq(r), x: r[k] })).filter((q) => finito(q.x))
  const M = pasosMedia(vals, '', 'ic95')
  return { titulo: `${PARAMS[k] || k} de la cepa`, sujeto: rs.Muestra, valor: g(M.m), unidad: '', metodos: 'replicas', que: AYUDA[k]?.sig,
    sub: finito(M.sd) ? `DE ${g(M.sd)} · n = ${M.n}` : `n = ${M.n}`, pasos: [...pasoReplicas(o.porReplica, M.n), ...M.pasos.map((p) => (p.titulo === 'Media' ? { ...p, titulo: 'Media de las réplicas' } : p))], avisos: [...avisoN(M.n), ...(vals.length < filas.length ? [`${filas.length - vals.length} réplica(s) no dieron este parámetro.`] : [])], nota }
}
// media ± error de las réplicas en un tiempo (puntos de la curva media)
export function fichaMediaTiempo({ valores, t, nombre, tipo = 'sd', unidad = 'OD', etiquetaValor = 'OD media' }) {
  const M = pasosMedia(valores, unidad, tipo)
  // cómo se obtuvo el valor de CADA réplica en ese tiempo (lectura − blanco), antes de promediar
  const det = valores.filter((q) => q.det)
  if (det.length) M.pasos.unshift({ titulo: `Cómo se obtuvo el valor de cada una de las ${det.length} réplicas`, texto: 'Cada pocillo se lee y se le resta el blanco de ese tiempo; recién después se promedian.',
    esquema: { tipo: 'tabla', clase: 'por-replica', columnas: ['Réplica', 'Lectura', 'Blanco', 'OD = lectura − blanco'], filas: det.map((q) => [q.etiqueta, g(q.det[0]), g(q.det[1]), `${g(q.det[0])} − ${g(q.det[1])} = ${g(q.x)}`]) } })
  const err = tipo === 'sd' ? M.sd : tipo === 'sem' ? M.sd / Math.sqrt(M.n) : (M.tc * M.sd) / Math.sqrt(M.n)
  return { titulo: etiquetaValor, sujeto: `${nombre} · t = ${hs(t)}`, valor: g(M.m), unidad, metodos: 'replicas', sub: finito(err) ? `± ${g(err)} (${{ sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }[tipo]}) · n = ${M.n}` : `n = ${M.n}`,
    pasos: M.pasos, avisos: M.n < 3 && tipo !== 'sd' ? ['Con menos de 3 réplicas el EEM y el IC 95 % tienen muy poca base.'] : [] }
}

// ---------- OD de cubeta (blanco y diluciones) ----------
export function fichaOdCubeta(fila, m, c) {
  const blanco = m.yaCorregido ? 0 : Number(m.blanco) || 0
  const lect = Object.entries(fila.od || {}).map(([k, x]) => [Number(k), Number(x)]).filter(([, x]) => finito(x)).sort((a, b) => a[0] - b[0])
  const filas = lect.map(([k, x]) => ({ k, x, neta: x - blanco, corr: (x - blanco) * m.factor ** k, dentro: x - blanco >= m.vmin && x - blanco <= m.vmax }))
  const us = filas.filter((q) => (c.usados || []).includes(q.k))
  return { titulo: 'OD corregida', sujeto: `${fila.muestra} · réplica ${fila.replica} · t = ${fila.t} h`, valor: g(c.od), unidad: 'OD', metodos: 'origen',
    pasos: [
      { titulo: 'Lectura menos blanco, por el factor de la dilución', formula: ['OD = (', v('L', 1), ' − ', v('B', 2), ') × f^k'],
        texto: `B = ${g(blanco)}${m.yaCorregido ? ' (el equipo ya restó el blanco)' : ''}; f = ${m.factor}; ventana lineal del equipo: OD neta entre ${m.vmin} y ${m.vmax}.`,
        cuenta: filas.flatMap((q, i) => [...(i ? ['\n'] : []), `${q.k ? `dilución −${q.k}` : 'sin diluir'}: (`, v(g(q.x), 1), ' − ', v(g(blanco), 2), `) × ${m.factor}^${q.k} = ${g(q.corr)}${q.dentro ? '   ✓ en la ventana' : '   (fuera de la ventana)'}`]) },
      { titulo: us.length > 1 ? 'Media de las lecturas dentro de la ventana' : 'Lectura usada', cuenta: [us.length > 1 ? `OD = (${us.map((q) => g(q.corr)).join(' + ')}) / ${us.length} = ${g(c.od)}` : `OD = ${g(c.od)}`],
        nota: c.estado !== 'ok' ? 'Ninguna lectura cayó dentro de la ventana: se usó la más cercana al centro.' : '' },
    ] }
}
// ---------- blanco de una placa (placas por tiempo) ----------
export function fichaBlancoPlaca(bl, lect, t) {
  const us = (lect || []).filter((l) => l.EsBlanco && l.Usado), fuera = (lect || []).filter((l) => l.EsBlanco && !l.Usado)
  const vals = us.map((l) => ({ etiqueta: l.Pocillo, x: l.OD_leida }))
  const base = { titulo: 'Blanco de la placa', sujeto: `t = ${hs(t)}${bl.origen !== t ? ` (tomado de la placa de ${hs(bl.origen)})` : ''}`, valor: g(bl.valor), unidad: 'OD', metodos: 'origen',
    que: 'OD del medio sin inocular de esa placa: se resta a cada lectura antes de multiplicar por la dilución.' }
  if (!vals.length) return { ...base, pasos: [{ titulo: 'Media de los blancos aceptados', texto: `${bl.n} pocillo${bl.n === 1 ? '' : 's'} (${(bl.pocillos || []).join(', ')}): media = ${g(bl.valor)}.` }] }
  const M = pasosMedia(vals, 'OD', 'sd')
  return { ...base, pasos: [...M.pasos.slice(0, 2), ...(fuera.length ? [{ titulo: 'Pocillos de blanco que no entran', texto: fuera.map((l) => `${l.Pocillo} (${g(l.OD_leida)}): ${l.Motivo || 'excluido'}`).join(' · ') }] : [])] }
}

// ============================================================
// Atípicos entre réplicas (Dixon, Grubbs o CV), para UFC y OD
// ============================================================
// valores: [{ etiqueta, x }]; o: { metodo, conf, cvMax, escala, sospechoso (índice marcado), sujeto, auto }
export function fichaAtipico(valores, o) {
  const xs = valores.map((q) => q.x)
  const d = detectar(xs, { metodo: o.metodo, conf: o.conf, cvMax: o.cvMax })
  const metodo = o.metodo === 'q' && xs.length > 10 ? 'grubbs' : o.metodo
  const n = xs.length
  const orden = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
  const pasos = [{ titulo: `Las ${n} réplicas, ordenadas`, texto: orden.map((i) => `${valores[i].etiqueta}: ${g(xs[i])}`).join(' · '),
    esquema: { tipo: 'tira', valores: valores.map((q, i) => ({ ...q, sospechoso: i === d.idx })), unidad: o.escala, media: metodo !== 'q' ? media(xs) : NaN } }]
  if (metodo === 'q') {
    const s = orden.map((i) => xs[i]), rango = s[n - 1] - s[0]
    pasos.push({ titulo: 'Test Q de Dixon', texto: 'Compara el salto entre el valor extremo y su vecino con el rango de todas las réplicas.',
      formula: ['Q = salto / rango = (x₍ₙ₎ − x₍ₙ₋₁₎) / (x₍ₙ₎ − x₍₁₎)   (o el extremo de abajo)'],
      cuenta: [`Q arriba = (${g(s[n - 1])} − ${g(s[n - 2])}) / ${g(rango)} = ${g((s[n - 1] - s[n - 2]) / rango, 3)}   ;   Q abajo = (${g(s[1])} − ${g(s[0])}) / ${g(rango)} = ${g((s[1] - s[0]) / rango, 3)}`] })
    pasos.push({ titulo: 'Comparación con el valor crítico', texto: `Valor crítico de Q para n = ${n} al ${o.conf} % (Rorabacher 1991): ${g((Q_TABLA[o.conf] || Q_TABLA[95])[n - 3], 3)}.`,
      cuenta: [finito(d.stat) ? `Q = ${g(d.stat, 3)} ${d.idx !== null ? '>' : '≤'} ${g(d.crit, 3)} → ${d.idx !== null ? `${valores[d.idx].etiqueta} es sospechosa` : 'ninguna es sospechosa'}` : 'Hacen falta 3 a 10 réplicas para el test.'] })
  } else if (metodo === 'grubbs') {
    const m = media(xs), s = desvio(xs)
    pasos.push({ titulo: 'Test de Grubbs', texto: 'Mide cuántas desviaciones estándar se aparta de la media el valor más alejado.',
      formula: ['G = máx |xᵢ − x̄| / s   ;   G crítico = (n − 1)/√n · √[ t² / (n − 2 + t²) ],  t = t(1 − α/(2n); n − 2)'],
      cuenta: [`x̄ = ${g(m)}, s = ${g(s)} → G = ${g(d.stat, 3)} ${d.idx !== null ? '>' : '≤'} G crítico = ${g(criticoGrubbs(n, o.conf), 3)} → ${d.idx !== null ? `sospechosa: ${valores[d.idx].etiqueta}` : 'ninguna es sospechosa'}`] })
  } else {
    pasos.push({ titulo: 'Coeficiente de variación del grupo', texto: 'Es un criterio práctico, no un test de hipótesis: si el CV supera el límite, se señala la réplica más alejada de la media.',
      formula: ['CV = 100 · s / |x̄|'], cuenta: [`CV = ${g(d.stat, 3)} % ${d.idx !== null ? '>' : '≤'} ${o.cvMax} %${d.idx !== null ? ` → sospechosa: ${valores[d.idx].etiqueta} (sin ella, CV = ${g(d.cvSin, 3)} %)` : ''}`] })
  }
  return { titulo: `Atípicos entre réplicas (${{ q: 'Dixon', grubbs: 'Grubbs', cv: 'CV %' }[metodo]})`, sujeto: o.sujeto, valor: d.idx !== null ? 'sospechosa' : 'sin atípicos', metodos: o.ancla || 'ufcqc',
    pasos, avisos: [...(n === 3 && metodo === 'q' ? ['Con 3 réplicas el test tiene muy poca potencia: solo marca valores muy extremos.'] : []),
      ...(d.idx !== null ? [o.auto ? 'Se excluye automáticamente («Excluir» activado).' : 'Solo se marca: sigue en el promedio. Decidí vos con un clic si la excluís.'] : [])],
    ajustes: [metodo === 'cv' ? `CV máx. ${o.cvMax} %` : `confianza ${o.conf} %`, o.auto ? 'excluir solos' : 'solo marcar'] }
}

// ============================================================
// UFC
// ============================================================
const etqCol = (par, k) => dil(dilDe(par, k))
// UFC/mL de una réplica: una dilución, C · D / V
export function fichaUfcReplica(r, o = {}) {
  const p = r._par || {}
  const ent = Object.entries(r._cont || {}).map(([k, c]) => [Number(k), Number(c)]).filter(([, c]) => finito(c)).sort((a, b) => dilDe(p, a[0]) - dilDe(p, b[0]))
  const k = (r._usados || [])[0]
  const D = finito(k) ? dilDe(p, k) : NaN, V = p.vol, C = r._S, Vo = V / D
  const sujeto = `${r.Muestra} · T = ${r.T_h} h · réplica ${r.Replica}`
  const pasos = [
    { titulo: 'Diluciones contadas', texto: `Todas las réplicas de ${r.Muestra} a T = ${r.T_h} h usan la misma dilución, ${r._manual ? 'elegida a mano' : `la que tiene más réplicas dentro del rango contable (${p.min} a ${p.max} colonias)`}.`,
      esquema: { tipo: 'diluciones', columnas: ent.map(([kk, c]) => ({ etiqueta: etqCol(p, kk), colonias: c, estado: kk === k ? 'elegida' : c > 2 * p.max ? 'incontable' : c >= p.min && c <= p.max ? 'rango' : '' })) } },
  ]
  if (r._estado === 'sin_dilucion') return { titulo: 'UFC/mL de la réplica', sujeto, valor: '–', metodos: 'ufc', pasos: [...pasos, { titulo: 'Sin conteo en la dilución de la cepa', texto: 'Esta réplica no tiene conteo en la dilución elegida para su cepa y tiempo: no se calcula con otra.' }] }
  pasos.push({ titulo: 'Volumen de suspensión original sembrado', texto: `Se sembraron V = ${g(V * 1000, 4)} µL de la dilución ${dil(D)}: es como haber sembrado V/D mL de la suspensión original.`,
    formula: [v('V', 2), ' / ', v('D', 4), ' = mL de suspensión original'], cuenta: [v(`${g(V)} mL`, 2), ' / ', v(sci(D), 4), ' = ', `${sci(Vo, 3)} mL`] })
  if (r._estado === 'cero') {
    pasos.push({ titulo: '0 colonias: límite de detección', texto: 'Con 0 colonias no hay concentración medible. Se informa el límite de detección: la concentración para la que se esperarían 3 colonias (si se esperan 3, la probabilidad de ver 0 es ≈ 5 %).',
      formula: ['límite ≈ 3 · ', v('D', 4), ' / ', v('V', 2)], cuenta: [`límite ≈ 3 / ${sci(Vo, 3)} mL = ${sci(r.Limite)} UFC/mL`] })
    return { titulo: 'UFC/mL de la réplica', sujeto, valor: `< ${sci(r.Limite)}`, unidad: 'UFC/mL', metodos: 'ufc', pasos }
  }
  if (r._estado === 'incontable') return { titulo: 'UFC/mL de la réplica', sujeto, valor: 'incontable', metodos: 'ufc', pasos: [...pasos, { titulo: 'Incontable', texto: `${C} colonias: más del doble del máximo contable (${p.max}). Las colonias se superponen y se subcuenta.` }] }
  const [lo, hi] = icPoisson(C)
  pasos.push({ titulo: 'Concentración', formula: ['UFC/mL = ', v('C', 1), ' · ', v('D', 4), ' / ', v('V', 2)],
    cuenta: ['UFC/mL = ', v(C, 1), ' × ', v(sci(D), 4), ' / ', v(`${g(V)} mL`, 2), ` = ${sci(r.UFC_mL)}`] })
  pasos.push({ titulo: 'Incertidumbre del conteo (Poisson exacto, Garwood)', texto: `Contar colonias tiene error aunque se cuente bien: con C = ${C} el número esperado está, con 95 % de confianza, entre los límites de la chi-cuadrado.`,
    formula: ['λ inf = χ²(0,025; 2C)/2   ;   λ sup = χ²(0,975; 2C + 2)/2   ;   IC = [λ inf ; λ sup] · D / V'],
    cuenta: [`[${g(lo, 4)} ; ${g(hi, 4)}] colonias × ${sci(D)} / ${g(V)} mL = ${sci(r.IC95_inf)} a ${sci(r.IC95_sup)} UFC/mL`],
    esquema: { tipo: 'intervalo', lo: r.IC95_inf, m: r.UFC_mL, hi: r.IC95_sup, log: true } })
  const avisos = []
  if (r._estado === 'bajo' || r._estado === 'alto') avisos.push(`${C} colonias está ${r._estado === 'bajo' ? 'debajo' : 'arriba'} del rango contable (${p.min} a ${p.max}): es una estimación con error grande.`)
  if (o.dixon) avisos.push(`Marcada como atípica: ${o.dixon}`)
  if (o.fuera) avisos.push('Esta réplica está excluida del promedio.')
  return { titulo: 'UFC/mL de la réplica', sujeto, valor: sci(r.UFC_mL), unidad: 'UFC/mL', sub: `log₁₀ = ${f2(r.log10)} · IC 95 % ${sci(r.IC95_inf)} a ${sci(r.IC95_sup)}`, metodos: 'ufc', pasos, avisos,
    ajustes: [`rango ${p.min}–${p.max} colonias`, `${g(V * 1000, 4)} µL sembrados`] }
}

// UFC/mL de una cepa en un tiempo: Σ C / Σ V, su IC y la sobredispersión (o la media geométrica)
export function fichaUfcTiempo(r, o = {}) {
  const f0 = fichaUfcTiempoCompleta(r, o)
  const idx = (t) => f0.pasos.findIndex((p) => p.titulo.startsWith(t))
  if (o.foco === 'ic') {
    const ic = icUfc(r)
    const sel = f0.pasos.filter((p) => p.titulo.startsWith('Réplicas que entran') || p.titulo.startsWith('Incertidumbre') || p.titulo.startsWith('¿Las réplicas varían'))
    return { ...f0, titulo: 'IC 95 % del tiempo', valor: finito(ic.lo) ? `${sci(ic.lo)} a ${sci(ic.hi)}` : '–', unidad: 'UFC/mL', sub: TEXTO_IC_UFC[ic.tipo] || '', pasos: sel }
  }
  if (o.foco === 'log') {
    const geo = o.centro === 'geo'
    const val = geo ? r.Media_geometrica : r.UFC_mL
    return { ...f0, titulo: 'log₁₀ UFC/mL del tiempo', valor: f2(Math.log10(val), 3), unidad: 'log₁₀ UFC/mL', sub: '',
      pasos: [...f0.pasos.slice(0, idx('Suma') + 1 || 2), { titulo: 'Logaritmo decimal', texto: 'En el gráfico se usa log₁₀ porque el crecimiento exponencial se ve como una recta.', formula: ['log₁₀ UFC/mL'], cuenta: [`log₁₀(${sci(val)}) = ${f2(Math.log10(val), 3)}`] }] }
  }
  return f0
}
function fichaUfcTiempoCompleta(r, o = {}) {
  const pool = r._pool || []
  const sujeto = `${r.Muestra} · T = ${r.T_h} h`
  if (!pool.length) return { titulo: 'UFC/mL del tiempo', sujeto, valor: '–', metodos: 'ufc', pasos: [{ titulo: 'Sin réplicas utilizables', texto: String(r.Estado || '') }] }
  const S = r.Colonias_suma, V = r.Volumen_mL, lam = S / V
  const ic = icUfc(r)
  const geo = o.centro === 'geo'
  const pasos = [
    { titulo: `Réplicas que entran (${pool.length} de ${r.Replicas})`, texto: `Todas contadas en la misma dilución. V = mL de suspensión original en cada siembra (volumen sembrado / dilución).${o.excluidas ? ` Quedan afuera: ${o.excluidas}.` : ''}`,
      esquema: { tipo: 'replicas', tarjetas: pool.map((q) => ({ titulo: `Réplica ${q.Replica}`, c: q.C, v: q.D })) } },
    { titulo: 'Suma de colonias / suma de volúmenes', texto: 'Si las réplicas son siembras de la misma suspensión, este es el estimador de máxima verosimilitud de la concentración (Poisson): las réplicas con más volumen pesan más y los ceros también cuentan.',
      formula: ['UFC/mL = ', v('Σ C', 1), ' / ', v('Σ V', 2)],
      cuenta: ['UFC/mL = ', v(`(${pool.map((q) => q.C).join(' + ')})`, 1), ' / ', v(`(${pool.map((q) => sci(q.D, 3)).join(' + ')})`, 2), '\n= ', v(S, 1), ' / ', v(`${sci(V, 3)} mL`, 2), ` = ${sci(r.UFC_mL)}`] },
  ]
  if (S > 0) {
    const [lo, hi] = icPoisson(S)
    pasos.push({ titulo: 'Incertidumbre del conteo (Poisson exacto)', formula: ['IC = [χ²(0,025; 2S)/2 ; χ²(0,975; 2S + 2)/2] / Σ V'],
      cuenta: [`[${g(lo, 4)} ; ${g(hi, 4)}] colonias / ${sci(V, 3)} mL = ${sci(r.IC95_inf)} a ${sci(r.IC95_sup)} UFC/mL`],
      esquema: { tipo: 'intervalo', lo: ic.lo, m: r.UFC_mL, hi: ic.hi, log: true, etiqueta: ic.tipo === 'disp' ? 'IC ensanchado por √φ' : 'IC de Poisson' } })
  }
  if (pool.length > 1 && S > 0 && finito(r.Chi2_disp)) {
    const terms = pool.map((q) => { const E = q.D * lam; return { q, E, t: (q.C - E) ** 2 / E } })
    pasos.push({ titulo: '¿Las réplicas varían más que el error de contar?', texto: 'Si solo hubiera error de conteo, cada réplica tendría ≈ Vᵢ·λ̂ colonias (λ̂ = Σ C / Σ V). El índice de dispersión compara lo observado con lo esperado.',
      formula: ['χ² = Σ (Cᵢ − Vᵢ·λ̂)² / (Vᵢ·λ̂)   con n − 1 g.l.   ;   φ = χ² / (n − 1)'],
      cuenta: [`χ² = ${terms.map((x) => g(x.t, 3)).join(' + ')} = ${g(r.Chi2_disp, 3)} con ${r.gl_disp} g.l. → p = ${g(r.p_disp, 3)} ; φ = ${g(r.phi, 3)}`],
      esquema: { tipo: 'barras', items: terms.map((x) => ({ etiqueta: `Rép. ${x.q.Replica}`, obs: x.q.C, esp: x.E })) },
      nota: r.Sobredisperso
        ? `p < 0,05: varían más de lo que explica el conteo. El IC informado se ensancha por √φ en escala log (cuasi-Poisson): ${sci(r.IC95_inf_disp)} a ${sci(r.IC95_sup_disp)} UFC/mL.`
        : 'p ≥ 0,05: la dispersión es compatible con el error de conteo; se informa el IC de Poisson.' })
  }
  if (geo) {
    const lg = (r._vals || []).filter((x) => x > 0).map(Math.log10)
    pasos.push({ titulo: 'Media geométrica (valor elegido para este tiempo)', texto: 'Media de los log₁₀ de las réplicas, apropiada para réplicas biológicas; el error se calcula en la misma escala.',
      formula: ['log₁₀ x̃ = Σ log₁₀ UFCᵢ / n   ;   DE = √[Σ(log₁₀ UFCᵢ − log₁₀ x̃)²/(n − 1)]'],
      cuenta: [`log₁₀ x̃ = (${lg.map((x) => f2(x)).join(' + ')}) / ${lg.length} = ${f2(media(lg), 3)} → x̃ = ${sci(r.Media_geometrica)}${lg.length > 1 ? ` ; DE = ${f2(desvio(lg), 3)}` : ''}`] })
  }
  const valor = geo ? sci(r.Media_geometrica) : sci(r.UFC_mL)
  return { titulo: geo ? 'UFC/mL del tiempo (media geométrica)' : 'UFC/mL del tiempo', sujeto, valor, unidad: 'UFC/mL', metodos: 'ufc',
    sub: `log₁₀ = ${f2(geo ? Math.log10(r.Media_geometrica) : r.log10)}${finito(ic.lo) ? ` · ${TEXTO_IC_UFC[ic.tipo] || 'IC 95 %'}: ${sci(ic.lo)} a ${sci(ic.hi)}` : ''}`,
    pasos, avisos: [...(r.Sobredisperso ? ['Sobredispersión: las réplicas varían más que el error de conteo.'] : []), ...(o.estimadas ? [`Incluye réplicas estimadas fuera del rango contable: ${o.estimadas}.`] : [])],
    ajustes: [geo ? 'valor: media geométrica' : 'valor: Σ C / Σ V'] }
}

// Ajuste del modelo de crecimiento por recuento: cada número de la tabla abre SU cálculo (foco = el parámetro que se tocó):
// y₀, μ, velocidad, td, λ, y máx, R², EE y n − p. Modelos: Linealizar log₁₀ (recta de ln N en la fase exponencial) y Baranyi y Roberts.
const PARAM_UFC = {
  rate: ['Velocidad máxima', 'log₁₀ UFC/mL por hora', (c) => f2(c.rate, 3)], mu: ['μ: velocidad específica máxima', 'h⁻¹', (c) => g(c.mu)], td: ['Tiempo de duplicación', 'h', (c) => g(c.td_h)],
  lag: ['Lag (λ)', 'h', (c) => g(c.lag_h, 3)], y0: ['y₀', 'log₁₀ UFC/mL', (c) => f2(c.y0)], yEnd: ['y máx (asíntota)', 'log₁₀ UFC/mL', (c) => (finito(c.yEnd) ? f2(c.yEnd) : 'sin meseta')],
  r2: ['R² del ajuste', '', (c) => f2(c.r2, 3)], se: ['Error estándar del ajuste', 'log₁₀', (c) => f2(c.se, 3)], gl: ['Grados de libertad (n − p)', '', (c) => String(c.gl)],
}
const f3 = (x) => fx(x, 3)
export function fichaModeloUfc(c, pts, o = {}) {
  const foco = PARAM_UFC[o.foco] ? o.foco : 'mu'
  const [nom, uni, val] = PARAM_UFC[foco]
  const sujeto = o.nombre
  if (!c?.ok) return { titulo: nom, sujeto, valor: '–', metodos: 'ufccrec', pasos: [{ titulo: 'Sin ajuste', texto: c?.motivo || '' }] }
  const L = Math.LN10
  const cl = c.modelo === 'lineal'
  const x = pts.t, y10 = pts.ly.map((y) => y / L)
  // puntos que usa la cuenta: todos (Baranyi y Roberts) o los de la ventana de la fase exponencial (Linealizar log₁₀)
  const idx = x.map((_, i) => i).filter((i) => !cl || (x[i] >= c.t0 - 1e-9 && x[i] <= c.t1 + 1e-9))
  const xs = idx.map((i) => x[i]), ys = idx.map((i) => y10[i]), ps = xs.map((t) => c.pred10(t))
  const nP = xs.length, mY = media(ys)
  const sse = ys.reduce((sum, y, i) => sum + (y - ps[i]) ** 2, 0), sst = ys.reduce((sum, y) => sum + (y - mY) ** 2, 0)
  const curva = Array.from({ length: 81 }, (_, i) => c.t0 + ((c.t1 - c.t0) * i) / 80).map((t) => ({ x: t, y: c.pred10(t) }))
  const datos = { id: 'p', nombre: 'datos', color: o.color || 'acento', linea: false, puntos: true, forma: 'cuadrado', radio: 3.5, data: x.map((t, i) => ({ x: t, y: y10[i], tip: `t = ${fx(t, 2)} h\nlog₁₀ = ${f3(y10[i])}` })) }
  const mod = { id: 'm', nombre: cl ? 'recta de la fase exponencial' : 'modelo', color: 'acento2', ancho: 1.8, dash: cl ? '6 4' : undefined, data: curva }
  const graf = (extra = [], extras = [], alto = 210) => ({ tipo: 'grafico', alto, yTxt: 'log₁₀ UFC/mL', ventana: cl ? [c.t0, c.t1] : undefined, series: [datos, mod, ...extra], extras })
  const tablaRes = { tipo: 'tabla', columnas: ['t (h)', 'log₁₀ observado', 'log₁₀ del modelo', 'residuo', 'residuo²'],
    filas: xs.map((t, i) => [fx(t, 2), f3(ys[i]), f3(ps[i]), f3(ys[i] - ps[i]), g((ys[i] - ps[i]) ** 2, 3)]), pie: ['Σ', '', '', '', g(sse, 4)] }
  const ventTxt = cl ? `la ventana de la fase exponencial (${hs(c.t0)} a ${hs(c.t1)}, ${nP} puntos)` : `los ${nP} puntos`
  const ec = cl ? ['ln N = ', v('a', 1), ' + ', v('μ', 3), ' · t']
    : c.modelo === 'huang' ? ['y = ', v('y₀', 1), ' + ', v('y máx', 4), ' − ln[ e^y₀ + (e^y máx − e^y₀) · e^(−', v('μ', 3), '·B(t)) ]   ;   B(t) = t + (1/4) · ln[ (1 + e^(−4(t − ', v('λ', 2), '))) / (1 + e^(4', v('λ', 2), ')) ]']
    : ['y = ', v('y₀', 1), ' + ', v('μ', 3), '·A(t) − (1/m)·ln[1 + (e^(m·μ·A(t)) − 1) / e^(m·(', v('y máx', 4), ' − y₀))]   ;   A(t) = t + ln(e^(−μt) + e^(−', v('h₀', 2), ') − e^(−μt − h₀)) / μ']
  // regresión de la ventana (Linealizar log₁₀): t̄, ȳ, Sxx, Sxy con los mismos puntos
  const lnY = xs.map((_, i) => ys[i] * L)
  const tm = media(xs), ym = media(lnY)
  const sxx = xs.reduce((sum, t) => sum + (t - tm) ** 2, 0), sxy = xs.reduce((sum, t, i) => sum + (t - tm) * (lnY[i] - ym), 0)
  let pasos = []
  const avisos = [...(c.avisos || [])]
  if (foco === 'y0') {
    if (cl) {
      pasos = [
        { titulo: 'Qué es y₀ en el modelo Linealizar log₁₀', texto: `Es la ordenada al origen de la recta de ln N: lo que valdría log₁₀ N en t = 0 si la fase exponencial se prolongara hacia atrás (no es el recuento inicial medido).`, formula: ['a = ȳ − ', v('μ', 3), ' · t̄   ;   y₀ = a / ln 10'] },
        { titulo: `Con ${ventTxt}`, texto: `t̄ = ${g(tm)} h, ȳ = ${g(ym)} (en ln N).`, cuenta: [`a = ${g(ym)} − ${g(c.mu)} × ${g(tm)} = ${g(c.a)}   ;   y₀ = ${g(c.a)} / 2,3026 = `, v(`${f2(c.y0, 3)} log₁₀`, 1)],
          esquema: graf([], [{ x: 0, y: c.y0, color: 'aviso', forma: 'anillo', tip: `y₀ = ${f2(c.y0, 3)}` }]) },
      ]
    } else {
      pasos = [
        { titulo: 'y₀ es un parámetro del ajuste', texto: 'No sale de una fórmula directa: es uno de los 4 valores que el programa va moviendo (junto con y máx, μ y h₀) hasta que la curva queda lo más cerca posible de los datos.', formula: ec },
        { titulo: 'Qué significa', texto: 'En t = 0, A(0) = 0, así que la curva vale exactamente y₀: es el nivel inicial del modelo, ya sin ruido.', cuenta: [v(`y₀ = ${f2(c.y0, 3)} log₁₀`, 1), ` = ${sci(10 ** c.y0)} UFC/mL`] },
        { titulo: 'Comparado con lo medido', texto: `El primer recuento (t = ${fx(x[0], 2)} h) fue log₁₀ = ${f3(y10[0])}; el modelo vale ${f3(c.pred10(x[0]))} en ese tiempo.`, esquema: graf([], [{ x: Math.min(0, c.t0), y: c.y0, color: 'aviso', forma: 'anillo', tip: `y₀ = ${f2(c.y0, 3)}` }]) },
      ]
    }
  } else if (foco === 'mu') {
    if (cl) {
      pasos = [
        { titulo: 'Recta de mínimos cuadrados en la fase exponencial', texto: `Con ${ventTxt}, en escala ln N: t̄ = ${g(tm)} h, ȳ = ${g(ym)}.`, formula: [v('μ', 3), ' = Σ(t − t̄)(y − ȳ) / Σ(t − t̄)²'], cuenta: [v('μ', 3), ` = ${g(sxy, 5)} / ${g(sxx, 5)} = `, v(`${g(c.mu)} h⁻¹`, 3)] },
        { titulo: 'Cuál es la fase exponencial', texto: `El programa prueba todas las ventanas de ${g(c.ventana ? (c.t1 - c.t0) : 0, 3)} h o más con al menos 3 puntos y se queda con la de mayor pendiente entre las que son bien rectas (R² ≥ 0,95).`, esquema: graf() },
      ]
    } else {
      const grilla = Array.from({ length: 401 }, (_, i) => c.t0 + ((c.t1 - c.t0) * i) / 400)
      const der = (t) => ((c.pred10(t + 1e-4) - c.pred10(t - 1e-4)) / 2e-4) * L
      const tP = grilla.reduce((m, t) => (der(t) > der(m) ? t : m), c.t0)
      pasos = [
        { titulo: 'μ es un parámetro del ajuste', texto: 'Es la velocidad específica máxima del modelo de Baranyi y Roberts: la pendiente de ln N cuando el crecimiento ya salió del lag y todavía no lo frena la meseta. El programa la ajusta junto con y₀, y máx y h₀ por mínimos cuadrados.', formula: ec },
        { titulo: 'Qué valor tiene', cuenta: [v(`μ = ${g(c.mu)} h⁻¹`, 3), `   ·   pendiente máxima de la curva ajustada = ${g(der(tP))} h⁻¹ (a las ${hs(tP)})`], texto: der(tP) < c.mu * 0.97 ? 'La pendiente máxima queda algo por debajo de μ porque la meseta empieza a frenar la curva antes de que alcance su velocidad plena.' : '',
          esquema: graf([{ id: 'tg', nombre: 'pendiente máxima', color: 'sec', ancho: 1.3, dash: '5 4', data: [Math.max(c.t0, tP - 1.2), Math.min(c.t1, tP + 1.2)].map((t) => ({ x: t, y: c.pred10(tP) + (der(tP) / L) * (t - tP) })) }]) },
      ]
    }
  } else if (foco === 'rate') {
    pasos = [{ titulo: 'De μ (en ln) a velocidad en log₁₀', texto: 'DMFit informa la velocidad en log₁₀ UFC/mL por hora («Rate»): se pasa de logaritmo natural a decimal dividiendo por ln 10.', formula: ['velocidad = ', v('μ', 3), ' / ln 10'], cuenta: ['velocidad = ', v(`${g(c.mu)} h⁻¹`, 3), ` / 2,3026 = ${f2(c.rate, 3)} log₁₀ UFC/mL por hora`] },
      { titulo: 'Qué dice', texto: `Cada hora, en la fase exponencial, la concentración sube ${f2(c.rate, 3)} órdenes de magnitud (×${g(10 ** c.rate, 3)} por hora).` }]
  } else if (foco === 'td') {
    pasos = [{ titulo: 'Tiempo en que la población se duplica', texto: 'Si N crece como e^(μ·t), N se duplica cuando μ·td = ln 2.', formula: ['td = ln 2 / ', v('μ', 3)], cuenta: ['td = 0,6931 / ', v(`${g(c.mu)} h⁻¹`, 3), ` = ${g(c.td_h)} h  (= ${g(c.td_h * 60)} min)`] }]
  } else if (foco === 'lag') {
    if (cl) {
      pasos = [
        { titulo: 'Donde la recta de la fase exponencial cruza el nivel inicial', texto: `Nivel inicial: el recuento medio del primer tiempo, ln N = ${g(c.yInit10 * L)} (log₁₀ ${f2(c.yInit10, 3)}). La recta es ln N = ${g(c.a)} + ${g(c.mu)}·t.`, formula: ['λ = (ln N inicial − ', v('a', 1), ') / ', v('μ', 3)],
          cuenta: [`λ = (${g(c.yInit10 * L)} − (`, v(g(c.a), 1), ')) / ', v(g(c.mu), 3), ` = ${g(c.lag_h, 3)} h${(c.yInit10 * L - c.a) / c.mu < 0 ? '  → negativo: se informa 0' : ''}`],
          esquema: graf([{ id: 'ini', nombre: 'nivel inicial', color: 'sec', ancho: 1.2, dash: '2 3', data: [x[0], c.t1].map((t) => ({ x: t, y: c.yInit10 })) }], [{ x: c.lag_h, y: c.yInit10, color: 'aviso', forma: 'anillo', tip: `λ = ${g(c.lag_h, 3)} h` }]) },
      ]
    } else if (c.modelo === 'huang') {
      pasos = [{ titulo: 'λ es un parámetro del ajuste (Huang)', texto: 'En el modelo de Huang el lag λ es uno de los 4 valores que el programa mueve (junto con y₀, y máx y μ) hasta que la curva queda lo más cerca posible de los datos: no sale de una fórmula con otros parámetros.', formula: ec,
        cuenta: [v(`λ = ${g(c.lag_h, 3)} h`, 2)] }]
    } else {
      const fin = Math.min(c.t1, c.lag_h + (finito(c.yEnd) ? (c.yEnd - c.y0) / c.rate : c.t1 - c.lag_h))
      pasos = [
        { titulo: 'h₀ es el parámetro del ajuste; λ sale de h₀ y μ', texto: 'h₀ mide el «estado fisiológico» inicial de las células (h₀ = 0: ya adaptadas, sin lag). El lag es el tiempo que tardaría en acumularse ese trabajo de adaptación a velocidad μ.', formula: ['λ = ', v('h₀', 2), ' / ', v('μ', 3)],
          cuenta: ['λ = ', v(`${g(c.h0, 4)}`, 2), ' / ', v(`${g(c.mu)} h⁻¹`, 3), ` = ${g(c.lag_h, 3)} h`] },
        { titulo: 'Cómo se ve en el gráfico', texto: 'La recta de pendiente máxima corta el nivel inicial y₀ en t = λ.', esquema: graf([{ id: 'tg', nombre: 'pendiente máxima', color: 'sec', ancho: 1.3, dash: '5 4', data: [c.lag_h, fin].map((t) => ({ x: t, y: c.y0 + c.rate * (t - c.lag_h) })) }, { id: 'y0', nombre: 'y₀', color: 'sec', ancho: 1, dash: '2 3', data: [c.t0, Math.max(fin, c.lag_h + 0.5)].map((t) => ({ x: t, y: c.y0 })) }], [{ x: c.lag_h, y: c.y0, color: 'aviso', forma: 'anillo', tip: `λ = ${g(c.lag_h, 3)} h` }]) },
      ]
    }
  } else if (foco === 'yEnd') {
    if (cl) {
      pasos = [{ titulo: 'El modelo Linealizar log₁₀ no tiene asíntota', texto: 'Solo describe la fase exponencial: no estima dónde se frena el crecimiento. Para eso, usá Baranyi y Roberts.' }]
    } else {
      pasos = [
        { titulo: 'y máx es un parámetro del ajuste', texto: 'Es el nivel de la meseta (fase estacionaria) hacia el que tiende la curva. Se ajusta junto con y₀, μ y h₀.', formula: ec },
        { titulo: 'Valor y comparación con los datos', cuenta: [finito(c.yEnd) ? v(`y máx = ${f2(c.yEnd, 3)} log₁₀`, 4) : 'y máx: sin meseta (quedó en el límite del ajuste)', `   ·   recuento más alto medido = ${f2(Math.max(...y10), 3)} log₁₀${c.ymaxFijo ? '   ·   fijado a mano' : ''}`],
          texto: c.mesetaExtrapolada ? 'La meseta queda bastante por encima del último dato: los recuentos no llegaron a la fase estacionaria y y máx es una extrapolación.' : '',
          esquema: finito(c.yEnd) ? graf([{ id: 'ym', nombre: 'y máx', color: 'sec', ancho: 1.2, dash: '5 4', data: [c.t0, c.t1].map((t) => ({ x: t, y: c.yEnd })) }]) : undefined },
      ]
    }
  } else if (foco === 'r2') {
    pasos = [
      { titulo: 'Qué tan cerca pasa el modelo de cada punto', texto: `Para cada uno de ${ventTxt} se compara lo medido con lo que da el modelo (en log₁₀).`, esquema: tablaRes },
      { titulo: 'R² = 1 − lo que el modelo no explica / lo que varían los datos', formula: ['R² = 1 − SSE / SST   ;   SST = Σ(observado − media)²'],
        cuenta: [`media de los observados = ${f3(mY)}   ;   SST = ${g(sst, 4)}   ;   SSE = ${g(sse, 4)}`, '\n', `R² = 1 − ${g(sse, 4)} / ${g(sst, 4)} = `, v(f2(c.r2, 3), 1)],
        nota: nP - c.k <= 1 ? 'Con tan pocos grados de libertad el R² es casi siempre alto: no dice mucho sobre qué tan bueno es el modelo.' : '' },
    ]
  } else if (foco === 'se') {
    pasos = [
      { titulo: 'Los residuos (lo medido menos el modelo)', texto: 'Un buen ajuste deja residuos repartidos al azar alrededor de cero. Si forman una curva (primero positivos, después negativos, etc.), el modelo no describe bien la forma de los datos.', esquema: { tipo: 'grafico', alto: 170, xTxt: 'Tiempo (h)', yTxt: 'Residuo (log₁₀)', series: [{ id: 'res', nombre: 'residuo', color: o.color || 'acento', linea: false, puntos: true, radio: 3.4, data: xs.map((t, i) => ({ x: t, y: ys[i] - ps[i], tip: `t = ${fx(t, 2)} h\nresiduo = ${f3(ys[i] - ps[i])} log₁₀` })) }, { id: 'cero', nombre: 'cero', color: 'sec', ancho: 1, dash: '4 3', data: [Math.min(...xs), Math.max(...xs)].map((t) => ({ x: t, y: 0 })) }] } },
      { titulo: 'Los mismos residuos en una tabla', esquema: tablaRes },
      { titulo: 'Error estándar del ajuste', texto: 'Es el desvío típico de los residuos, descontando los parámetros que el modelo usó para acercarse a los datos (se divide por n − p y no por n).', formula: ['EE = √[ SSE / (n − p) ]'],
        cuenta: [`EE = √( ${g(sse, 4)} / (${nP} − ${c.k}) ) = √( ${g(sse, 4)} / ${nP - c.k} ) = `, v(`${f2(c.se, 3)} log₁₀`, 1)], nota: `Un EE de ${f2(c.se, 2)} log₁₀ equivale a una desviación típica de ×/÷ ${f2(10 ** c.se, 2)} entre el modelo y los recuentos.` },
    ]
  } else { // gl
    pasos = [
      { titulo: 'Puntos que entran', texto: `${nP} puntos (${new Set(xs).size} tiempos distintos)${cl ? `: los de ${ventTxt}` : ', todos: ninguno se descarta para mejorar el R²'}.` },
      { titulo: 'Parámetros que ajusta el modelo', texto: cl ? 'Linealizar log₁₀: la ordenada al origen a y la pendiente μ.' : `Baranyi y Roberts: y₀, y máx${c.ymaxFijo ? ' (fijado a mano: no cuenta)' : ''}, μ y h₀ (la curvatura m = ${g(c.mcurv, 3)} está fija).`, cuenta: [`p = ${c.k}`] },
      { titulo: 'Grados de libertad', formula: ['g.l. = n − p'], cuenta: [`g.l. = ${nP} − ${c.k} = `, v(String(c.gl), 1)], nota: c.gl <= 1 ? 'Con 0 o 1 grado de libertad el modelo pasa casi por todos los puntos: sus parámetros son poco firmes. Más tiempos de muestreo lo resuelven.' : '' },
    ]
  }
  // errores estándar de los parámetros libres: cov = s²·(JᵀJ)⁻¹ (lo que informan nls y modFit)
  const tcrit = c.gl > 0 ? tCuantil(0.975, c.gl) : NaN
  const eeDe = { mu: [c.ee_mu, c.mu, 'h⁻¹', 'μ'], lag: [c.ee_lag, c.lag_h, 'h', 'λ'], y0: [c.ee_y0, c.y0, 'log₁₀', 'y₀'], yEnd: [c.ee_ymax, c.yEnd, 'log₁₀', 'y máx'] }[foco]
  if (!cl && eeDe && finito(eeDe[0]) && eeDe[0] > 0) {
    const [ee, val0, un, sim] = eeDe
    pasos.push({ titulo: `Error estándar de ${sim}`, texto: 'Sale de la matriz de covarianza del ajuste no lineal: cov = s²·(JᵀJ)⁻¹, con J la matriz de derivadas del modelo respecto de cada parámetro y s² = SSE/(n − p). Dice cuánto se mueve el parámetro si los datos cambian dentro de su ruido.',
      formula: [`EE(${sim}) = √ cov(${sim}, ${sim})   ;   IC 95 % = ${sim} ± t(0,975; n − p) · EE`],
      cuenta: [`EE(${sim}) = ${g(ee, 3)} ${un}`, ...(finito(tcrit) ? [`\nIC 95 % = ${g(val0)} ± ${g(tcrit, 3)} × ${g(ee, 3)} = ${g(val0 - tcrit * ee)} a ${g(val0 + tcrit * ee)} ${un}`] : [])],
      nota: finito(c.corr_mu_lag) && Math.abs(c.corr_mu_lag) > 0.9 ? `μ y λ están correlacionados (r = ${f2(c.corr_mu_lag, 2)}): sus errores son grandes porque los datos no permiten separar bien ambos efectos. Fijar el lag estabiliza μ.` : '' })
  }
  if (c.lagFijo && foco === 'lag') pasos.unshift({ titulo: 'Lag fijado por el usuario', texto: `El lag λ = ${g(c.lag_h, 3)} h se fijó a mano: no es un resultado del ajuste y no tiene error.` })
  const pasosF = pasos.filter(Boolean)
  const aHuang = (x) => (typeof x === 'string' ? x.replace(/Baranyi y Roberts/g, 'Huang').replace(/h₀/g, 'λ') : Array.isArray(x) ? x.map(aHuang) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k2, v2]) => [k2, k2 === 'c' || k2 === 'color' || k2 === 'id' || k2 === 'tipo' ? v2 : aHuang(v2)])) : x)
  const pasosM = c.modelo === 'huang' ? aHuang(pasosF) : pasosF
  return { titulo: nom, sujeto, valor: val(c), unidad: uni, metodos: 'ufccrec', sub: `${MODELOS_UFC[c.modelo]} · R² ${f2(c.r2, 3)} · n − p = ${c.gl}`, pasos: pasosM, avisos,
    ajustes: [MODELOS_UFC[c.modelo], ...(c.modelo === 'baranyi' ? [`m = ${g(c.mcurv, 3)}`] : []), ...(c.ymaxFijo ? ['N máx fijado'] : []), ...(c.lagFijo ? ['lag fijado'] : []), o.datos === 'replicas' ? 'cada réplica' : 'valor de cada tiempo'] }
}
// Baranyi y Roberts ajustado a la OD de una cepa: es el mismo modelo y la misma cuenta que para las UFC, con las unidades de la OD
const aOd = (x) => (typeof x === 'string' ? x.replace(/log₁₀ UFC\/mL/g, 'log₁₀ OD').replace(/ UFC\/mL/g, ' OD').replace(/ln N/g, 'ln OD').replace(/recuentos?/g, 'lecturas')
  : Array.isArray(x) ? x.map(aOd) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v2]) => [k, k === 'c' || k === 'color' || k === 'id' || k === 'tipo' ? v2 : aOd(v2)])) : x)
export function fichaModeloOd(c, pts, o = {}) {
  const f = fichaModeloUfc(c, pts, o)
  const r = aOd(f)
  return { ...r, metodos: 'param', ajustes: (r.ajustes || []).filter((t) => !/valor de cada tiempo|réplicas/.test(t)) }
}
export function fichaAumentoUfc(c, o = {}) {
  const gen = o.foco === 'gen'
  if (!c?.ok) return { titulo: gen ? 'Generaciones' : 'Aumento', sujeto: o.nombre, valor: '–', metodos: 'ufccrec', pasos: [{ titulo: 'Sin ajuste', texto: c?.motivo || '' }] }
  return { titulo: gen ? 'Generaciones' : 'Aumento en el ensayo', sujeto: o.nombre, valor: gen ? f2(c.generaciones) : f2(c.crecimiento_log10), unidad: gen ? '' : 'log₁₀', metodos: 'ufccrec',
    pasos: [
      { titulo: c.aumentoDe === 'modelo' ? 'Lo que sube la curva del modelo en el período medido' : 'Con los valores observados', texto: c.aumentoDe === 'modelo' ? `Del primer tiempo (${hs(c.t0)}) al último (${hs(c.t1)}), con el mismo modelo que da y₀ y μ.` : 'Primer valor y máximo observados.',
        formula: ['aumento = log₁₀ N(t fin) − log₁₀ N(t ini)'], cuenta: [`aumento = ${f2(c.log10_fin, 3)} − ${f2(c.log10_N0, 3)} = ${f2(c.crecimiento_log10, 3)} log₁₀`] },
      { titulo: 'Generaciones', texto: 'Cada generación duplica la población: log₁₀ 2 = 0,301 por generación.', formula: ['generaciones = aumento / log₁₀ 2'], cuenta: [`generaciones = ${f2(c.crecimiento_log10, 3)} / 0,30103 = ${f2(c.generaciones)}`] },
    ] }
}
export function fichaPrediccionUfc(p, o = {}) {
  const c = p.c
  const pasos = [
    { titulo: 'La misma curva, más allá del último recuento', texto: `Se evalúa el ajuste ${c.modelo === 'huang' ? 'de Huang' : 'de Baranyi y Roberts'} de la cepa (y₀ = ${f2(c.y0, 3)}, μ = ${g(c.mu)} h⁻¹, λ = ${g(c.lag_h, 3)} h, y máx = ${f2(c.yEnd, 3)}${c.ymaxFijo ? ' fijado' : ''}) hasta ${hs(p.hasta)}.`,
      cuenta: [`log₁₀ N(${hs(p.hasta)}) = ${f2(p.yHasta, 3)} → ${sci(10 ** p.yHasta)} UFC/mL`] },
    { titulo: 'Tiempo hasta un nivel', texto: 'La curva es creciente: el tiempo en que llega a un nivel se busca por bisección (se parte el intervalo a la mitad hasta encontrarlo).',
      cuenta: [`meseta (y máx − 0,1 = ${f2(c.yEnd - 0.1, 2)}): ${finito(p.tMeseta) ? hs(p.tMeseta) : p.sinMeseta ? 'sin meseta estimable' : 'no llega'}${finito(p.objetivo) ? `   ;   objetivo ${f2(p.objetivo)}: ${finito(p.tObjetivo) ? hs(p.tObjetivo) : 'no llega'}` : ''}`] },
  ]
  return { titulo: 'Predicción', sujeto: o.nombre, valor: f2(p.yHasta), unidad: 'log₁₀ UFC/mL', metodos: 'ufccrec', pasos,
    avisos: p.hasta > c.t1 ? [`Más allá de ${hs(c.t1)} (último recuento) es una extrapolación: depende de que el modelo y la meseta sigan valiendo.`] : [] }
}

// ============================================================
// Calibración OD ↔ UFC/mL
// ============================================================
// par: fila de pares (Combinado); valoresOd: [{ etiqueta, x }] de la OD en ese tiempo (si hubo lectura); vecinos: { t1, y1, t2, y2 } si se interpoló
export function fichaPar(par, o = {}) {
  const pasos = []
  if (par.OD_interpolada && o.vecinos) {
    const { t1, y1, t2, y2 } = o.vecinos
    pasos.push({ titulo: 'OD interpolada', texto: `No hubo lectura de OD a T = ${par.T_h} h: se interpola entre las medias de las lecturas vecinas.`,
      formula: ['OD(T) = OD₁ + (T − t₁) · (OD₂ − OD₁) / (t₂ − t₁)'], cuenta: [`OD = ${g(y1)} + (${par.T_h} − ${g(t1)}) × (${g(y2)} − ${g(y1)}) / (${g(t2)} − ${g(t1)}) = ${g(par.OD)}`] })
  } else if (o.valoresOd?.length) {
    pasos.push(...pasosMedia(o.valoresOd, 'OD', 'sd').pasos.slice(0, 2).map((p, i) => (i === 0 ? { ...p, titulo: 'OD de las réplicas en ese tiempo (corregida, sin suavizar)' } : { ...p, titulo: 'OD media' })))
  }
  pasos.push({ titulo: 'UFC/mL del mismo tiempo', texto: `${sci(par.UFC_mL)} UFC/mL (log₁₀ = ${f2(par.log10_UFC)}), el valor de la cepa en ese tiempo de «Curva UFC vs t».` })
  pasos.push({ titulo: 'Fase', texto: par.fase ? `Según el ajuste de los recuentos de la cepa, a T = ${par.T_h} h está en fase ${par.fase === 'exponencial' ? 'exponencial: la velocidad del modelo es al menos la fracción elegida de μ máx' : par.fase === 'lag' ? 'de latencia' : 'estacionaria'}.` : 'Sin fases (el modelo de los recuentos no las distingue).',
    nota: par.usado ? `Entra en la recta${par.manual ? ' (elegido a mano)' : ''}.` : `No entra en la recta${par.manual ? ' (excluido a mano)' : ''}.` })
  return { titulo: 'Par OD–UFC', sujeto: `${par.Muestra} · T = ${par.T_h} h`, valor: `${g(par.OD, 3)} ↔ ${sci(par.UFC_mL)}`, metodos: 'comb', pasos }
}
export function fichaCalibracion(cal, pares, o = {}) {
  const modelo = cal.modelo
  if (!cal.ok) return { titulo: 'Calibración', sujeto: o.nombre, valor: '–', metodos: 'comb', pasos: [{ titulo: 'Sin ajuste', texto: cal.motivo }] }
  const p = pares.filter((q) => finito(q.od) && q.ufc > 0 && (modelo !== 'potencia' || q.od > 0))
  const x = modelo === 'potencia' ? p.map((q) => Math.log10(q.od)) : p.map((q) => q.od)
  const y = modelo === 'lineal' || modelo === 'proporcional' ? p.map((q) => q.ufc) : p.map((q) => Math.log10(q.ufc))
  const n = x.length, mx = media(x), my = media(y)
  const sxx = x.reduce((s, a) => s + (a - mx) ** 2, 0), sxy = x.reduce((s, a, i) => s + (a - mx) * (y[i] - my), 0)
  const fmt = (z) => (modelo === 'lineal' || modelo === 'proporcional' ? sci(z, 3) : g(z))
  const reg = modelo === 'proporcional'
    ? { titulo: 'Recta por el origen', formula: ['b = Σ ODᵢ·UFCᵢ / Σ ODᵢ²'], cuenta: [`b = ${sci(p.reduce((s, q) => s + q.od * q.ufc, 0), 3)} / ${g(p.reduce((s, q) => s + q.od ** 2, 0))} = ${sci(cal.coef.b, 3)}`] }
    : { titulo: 'Regresión por mínimos cuadrados', texto: `x = ${modelo === 'potencia' ? 'log₁₀ OD' : 'OD'}, y = ${modelo === 'lineal' ? 'UFC/mL' : 'log₁₀ UFC/mL'}; x̄ = ${g(mx)}, ȳ = ${fmt(my)}.`,
      formula: ['pendiente = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)²   ;   ordenada = ȳ − pendiente · x̄'],
      cuenta: [`pendiente = ${fmt(sxy)} / ${g(sxx)} = ${fmt(sxy / sxx)}   ;   ordenada = ${fmt(my - (sxy / sxx) * mx)}`] }
  const xs = Array.from({ length: 50 }, (_, i) => cal.rango[0] + ((cal.rango[1] - cal.rango[0]) * i) / 49)
  return { titulo: 'Ecuación de calibración', sujeto: o.nombre, valor: cal.ecuacion, metodos: 'comb', sub: `${MODELOS_CALIB[modelo]} · ${cal.n} pares · OD ${g(cal.rango[0], 3)} a ${g(cal.rango[1], 3)}`,
    pasos: [
      { titulo: `${n} pares usados`, texto: 'Pares de la misma cepa y tiempo (por defecto, solo los de la fase exponencial).',
        esquema: { tipo: 'grafico', alto: 210, xTxt: 'OD', yTxt: 'log₁₀ UFC/mL', series: [
          { id: 'p', nombre: 'pares', color: o.color || 'acento', linea: false, puntos: true, radio: 3.5, data: p.map((q) => ({ x: q.od, y: Math.log10(q.ufc) })) },
          { id: 'c', nombre: 'ajuste', color: 'acento2', ancho: 1.8, data: xs.map((z) => ({ x: z, y: Math.log10(cal.pred(z)) })).filter((d) => finito(d.y)) },
        ] } },
      reg,
      { titulo: 'Calidad, en log₁₀ para comparar los modelos', formula: ['rᵢ = log₁₀ UFCᵢ − log₁₀ predicho   ;   R² = 1 − Σ rᵢ² / Σ(log₁₀ UFCᵢ − media)²   ;   σ = √[ Σ rᵢ² / (n − p) ]'],
        cuenta: [`R² = ${f2(cal.R2, 3)}   ;   σ = ${f2(cal.sigma, 3)} log₁₀ (error típico ≈ ×/÷ ${f2(10 ** cal.sigma, 2)}, ${f2(cal.errorRelPct, 0)} %)`] },
    ], avisos: [cal.aviso, 'La calibración vale dentro del rango de OD medido y para el mismo organismo, medio y equipo.'].filter(Boolean) }
}
export function fichaConversion(cal, sentido, entrada, salida, o = {}) {
  const odUfc = sentido === 'od'
  const eqs = { clasico: ['log₁₀ UFC = m · OD + b', 'OD = (log₁₀ UFC − b) / m'], lineal: ['UFC = a + b · OD', 'OD = (UFC − a) / b'], proporcional: ['UFC = b · OD', 'OD = UFC / b'], potencia: ['log₁₀ UFC = a + b · log₁₀ OD', 'OD = 10^((log₁₀ UFC − a) / b)'] }[cal.modelo]
  return { titulo: odUfc ? 'OD → UFC/mL' : 'UFC/mL → OD', sujeto: o.nombre, valor: odUfc ? sci(salida) : g(salida, 4), unidad: odUfc ? 'UFC/mL' : 'OD', metodos: 'comb',
    pasos: [{ titulo: 'Con la ecuación ajustada', texto: cal.ecuacion, formula: [odUfc ? eqs[0] : eqs[1]], cuenta: [odUfc ? `OD = ${g(entrada, 4)} → ${sci(salida)} UFC/mL` : `UFC/mL = ${sci(entrada)} → OD = ${g(salida, 4)}`] }],
    avisos: o.fuera ? [`Fuera del rango calibrado (OD ${g(cal.rango[0], 3)} a ${g(cal.rango[1], 3)}): es una extrapolación.`] : [] }
}

// ============================================================
// OD vs recuento: μ de las dos mediciones
// ============================================================
export function fichaComparacion(m, rs, c) {
  const muOd = rs?.mu_max?.m, muU = c?.mu, q = muOd / muU
  return { titulo: 'μ por OD / μ por recuento', sujeto: m, valor: finito(q) ? f2(q) : '–', metodos: 'comb',
    pasos: [
      { titulo: 'μ por OD', texto: rs ? `${rs.unico ? 'Curva de la cepa (ventana deslizante)' : `Media de ${rs.mu_max.n} réplicas (ventana deslizante)`}: ${g(muOd)} h⁻¹.` : 'Sin datos de OD.' },
      { titulo: 'μ por recuento', texto: c?.ok ? `${MODELOS_UFC[c.modelo]}: ${g(muU)} h⁻¹.` : (c?.motivo || 'Sin ajuste.') },
      { titulo: 'Cociente', formula: ['cociente = μ OD / μ recuento'], cuenta: [`cociente = ${g(muOd)} / ${g(muU)} = ${f2(q)}`],
        nota: 'Si la OD siguiera exactamente a las células viables, el cociente sería ≈ 1. Un cociente distinto indica cambios en el tamaño de las células, agregación o pérdida de viabilidad. Es una comparación descriptiva (sin prueba estadística).' },
    ] }
}
