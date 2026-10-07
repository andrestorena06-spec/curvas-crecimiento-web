// Etiquetas, ayuda e interpretación de cada parámetro (equivale a params_etiquetas / params_ayuda / explicar_resultado de la app en R)
import { finito } from './motor/analisis.js'
import { tCuantil } from './utils.js'

export const PARAMS = {
  mu_max: 'μmax (h⁻¹)',
  td_min: 'Tiempo de duplicación (min)',
  lag_h: 'Lag λ (h)',
  K: 'K: OD máxima',
  t_K_h: 'Tiempo hasta K (h)',
  delta_od: 'ΔOD (K − OD₀)',
  generaciones: 'Generaciones (log2 K/OD₀)',
  auc_od: 'AUC de OD (OD·h)',
  auc_ln: 'AUC de ln(OD/OD₀) (h)',
  t_umbral_od_h: 'Tiempo hasta OD umbral (h)',
  t_max_dod_h: 'Tiempo de máx. dOD/dt (h)',
  dod_max: 'dOD/dt máx. (OD/h)',
  mu_spline: 'μmax spline (h⁻¹)',
  od0: 'OD₀ estimada',
  od_final: 'OD final',
  t_estacionaria: 'Inicio de estacionaria (h)',
  t_muerte: 'Inicio de muerte (h)',
  caida_pct: 'Caída desde K (%)',
  r2: 'R² de la ventana',
}

export const AYUDA = {
  od0: {
    sig: 'Absorbancia inicial del cultivo, es decir, el inóculo. Es el punto de partida contra el que se mide cuánto creció la población y cuándo termina el lag.',
    interp: 'Tomar solo el primer punto es ruidoso. Por eso se estima con la meseta inicial de ln(OD). Si OD₀ es muy baja (cerca del blanco) todo lo que depende de ella (lag, generaciones, AUC de ln) pierde precisión.',
  },
  mu_max: {
    sig: 'Velocidad específica máxima de crecimiento: cuánto sube ln(OD) por hora en el momento en que la población crece más rápido.',
    interp: 'Más alto significa crecimiento más rápido. En lectores de placas suele dar menos que en matraz; compará siempre contra un control de la misma placa. Un R² bajo o una ventana muy corta vuelven poco confiable el valor.',
  },
  td_min: {
    sig: 'Tiempo que tarda la población en duplicarse durante el crecimiento exponencial.',
    interp: 'Menor tiempo de duplicación significa crecimiento más rápido. Equivale a ln(2)/μmax.',
  },
  lag_h: {
    sig: 'Tiempo de adaptación antes de que el crecimiento exponencial se establezca (fase lag).',
    interp: 'Un lag mayor indica que las células tardan más en adaptarse (medio, estrés, inóculo viejo). Depende de OD₀ y de la ventana elegida, así que es el parámetro menos robusto: usalo para comparar condiciones, no como valor absoluto.',
  },
  K: {
    sig: 'Capacidad de carga: la OD máxima que alcanza el cultivo (meseta).',
    interp: 'Refleja el rendimiento final. Por encima de OD ~1 el lector deja de ser lineal y K subestima la biomasa real.',
  },
  t_K_h: {
    sig: 'Momento en que se alcanza la OD máxima.',
    interp: 'Si coincide con el final de la lectura, el cultivo puede no haber llegado a la meseta.',
  },
  delta_od: {
    sig: 'Aumento total de OD durante el ensayo (K menos OD₀).',
    interp: 'Mide el crecimiento neto, independiente del punto de partida.',
  },
  generaciones: {
    sig: 'Número de duplicaciones entre OD₀ y K: log2(K/OD₀).',
    interp: 'Es una forma de comparar crecimiento entre cultivos con distinto inóculo.',
  },
  auc_od: {
    sig: 'Área bajo la curva de OD contra el tiempo (método trapezoidal).',
    interp: 'Resume en un solo número lag, velocidad y rendimiento. Es robusto al ruido, pero no dice cuál de esos tres factores cambió.',
  },
  auc_ln: {
    sig: 'Área bajo la curva de ln(OD/OD₀) contra el tiempo.',
    interp: 'Pondera más el crecimiento temprano que el AUC de OD, que está dominado por la meseta.',
  },
  t_umbral_od_h: {
    sig: 'Tiempo que tarda la OD en llegar al valor umbral que fijaste en los parámetros.',
    interp: 'Es muy sencillo de interpretar y comparar; si nunca llega al umbral queda vacío.',
  },
  t_max_dod_h: {
    sig: 'Momento de mayor aumento de OD por hora (punto de inflexión de la curva de OD).',
    interp: 'Marca el centro de la fase de crecimiento rápido en escala lineal.',
  },
  dod_max: {
    sig: 'Máxima velocidad de aumento de la OD (en unidades de OD por hora).',
    interp: 'A diferencia de μmax, depende del tamaño de la población: crece con el cultivo.',
  },
  mu_spline: {
    sig: 'μmax estimada derivando una curva spline suavizada de ln(OD), sin elegir ventana.',
    interp: 'Sirve para contrastar con μmax de la ventana. Si difieren mucho, revisá la ventana o el ruido de la curva.',
  },
  od_final: {
    sig: 'Promedio de los últimos 3 puntos de la curva.',
    interp: 'Comparado con K indica si el cultivo declinó al final.',
  },
  t_estacionaria: {
    sig: 'Momento en que la velocidad de crecimiento cae por debajo de la fracción de μmax que fijaste: empieza la fase estacionaria.',
    interp: 'Si queda vacío, el cultivo no llegó a la fase estacionaria durante la lectura.',
  },
  t_muerte: {
    sig: 'Momento en que la OD cae más del porcentaje fijado respecto de K.',
    interp: 'Una caída de OD puede deberse a lisis, pero también a agregación o sedimentación.',
  },
  caida_pct: {
    sig: 'Porcentaje que bajó la OD final respecto de K.',
    interp: 'Valores altos sugieren fase de muerte o artefactos tardíos.',
  },
  r2: {
    sig: 'Calidad del ajuste lineal de ln(OD) en la ventana de μmax.',
    interp: 'Cerca de 1 indica que la ventana es realmente exponencial. Debajo del mínimo se avisa.',
  },
}

// signif(x, d) como en R
export const signif = (x, d = 4) => (finito(x) ? Number(x.toPrecision(d)) : NaN)
export const f4 = (x, d = 4) => (finito(x) ? String(signif(x, d)) : 'NA')

// Texto de "cómo se calculó" y "error estadístico" de un parámetro para un pocillo
export function explicarResultado(r, p, op) {
  const f = f4
  const ven = finito(r.t_ini_ventana)
    ? `${r.t_ini_ventana.toFixed(2)} a ${r.t_fin_ventana.toFixed(2)} h (${Math.round(r.n_ventana)} puntos)` : 'sin ventana válida'
  const man = r.ventana_manual ? ' (fijada manualmente)' : ''
  const meto = r.od0_metodo ? r.od0_metodo : 'no disponible'
  let calculo
  switch (p) {
    case 'od0':
      calculo = /^autom/.test(meto)
        ? `Se ajustó a ln(OD) un modelo de meseta inicial más recta exponencial (tres fases, Buchanan 1997) con los puntos hasta el final de la ventana. La meseta se estimó con ${Math.round(r.od0_n_base)} puntos y OD₀ = exp(meseta) = ${f(r.od0)}.`
        : `OD₀ = ${f(r.od0)}, calculada como la ${meto}.`
      break
    case 'mu_max':
      calculo = `Regresión lineal de ln(OD) contra el tiempo en la ventana de ${ven}${man}. Se eligió la ventana con la pendiente más alta entre las de R² ≥ ${f(op.r2min, 3)}. Pendiente = ${f(r.mu_max)} h⁻¹; R² = ${f(r.r2)}.`
      break
    case 'td_min':
      calculo = `ln(2) / μmax = 0,693 / ${f(r.mu_max)} h⁻¹ = ${f(Math.log(2) / r.mu_max)} h = ${f(r.td_min)} min.`
      break
    case 'lag_h':
      calculo = op.lag_metodo === 'umbral'
        ? `Primer tiempo en que la OD alcanza ${f(op.lag_factor, 3)} veces OD₀ (${f(op.lag_factor * r.od0)}): ${f(r.lag_h)} h.`
        : `Tangente en μmax: la recta ln(OD) = ${f(r.intercepto)} + ${f(r.mu_max)}·t cruza el nivel inicial ln(OD₀) = ${f(Math.log(r.od0))} (OD₀ = ${f(r.od0)}) en t = ${f(r.lag_tangente_h)} h.`
      break
    case 'K': calculo = `Máximo de la curva suavizada con mediana móvil de 3 puntos (para no tomar un pico aislado): ${f(r.K)}, alcanzado a las ${f(r.t_K_h)} h.`; break
    case 't_K_h': calculo = `Tiempo del máximo de la curva suavizada: ${f(r.t_K_h)} h.`; break
    case 'delta_od': calculo = `K − OD₀ = ${f(r.K)} − ${f(r.od0)} = ${f(r.delta_od)}.`; break
    case 'generaciones': calculo = `log2(K / OD₀) = log2(${f(r.K)} / ${f(r.od0)}) = ${f(r.generaciones)}.`; break
    case 'auc_od': calculo = 'Integral trapezoidal de la OD sobre todo el tiempo medido.'; break
    case 'auc_ln': calculo = 'Integral trapezoidal de ln(OD/OD₀) sobre los puntos con OD mayor que la OD mínima.'; break
    case 't_umbral_od_h': calculo = `Primer tiempo en que la curva suavizada llega a OD = ${f(op.umbral_od, 3)} (interpolación lineal).`; break
    case 't_max_dod_h': calculo = 'Tiempo medio del intervalo con mayor diferencia de OD entre puntos (curva suavizada).'; break
    case 'dod_max': calculo = 'Mayor cociente ΔOD/Δt entre puntos consecutivos de la curva suavizada.'; break
    case 'mu_spline': calculo = 'Máximo de la derivada de un spline suavizante ajustado a ln(OD).'; break
    case 'od_final': calculo = 'Promedio de los últimos 3 puntos medidos.'; break
    case 't_estacionaria': calculo = `Primer tiempo, después de la fase exponencial, en que μ(t) cae por debajo de ${f(op.frac_est, 3)} × μmax.`; break
    case 't_muerte': calculo = `Primer tiempo, después de K, en que la OD cae más de ${f(op.muerte_pct, 3)}% respecto de K.`; break
    case 'caida_pct': calculo = '(K − OD final) / K × 100.'; break
    case 'r2': calculo = `Coeficiente de determinación de la regresión de la ventana ${ven}.`; break
    default: calculo = 'Sin descripción.'
  }
  let error
  if (p === 'mu_max') {
    if (finito(r.mu_se)) {
      const ic = tCuantil(0.975, Math.max(1, r.n_ventana - 2)) * r.mu_se
      error = `Error estándar de la pendiente = ${f(r.mu_se)} h⁻¹; IC 95% = ${f(r.mu_max - ic)} a ${f(r.mu_max + ic)} (t de Student, ${Math.round(r.n_ventana - 2)} g.l.). Solo refleja el ruido dentro de la ventana, no la variación entre réplicas.`
    } else error = 'No estimable (ventana con muy pocos puntos o ajuste perfecto).'
  } else if (p === 'td_min') {
    error = finito(r.td_se_min)
      ? `Error estándar propagado desde μmax = ${f(r.td_se_min)} min (aproximación de primer orden: td × EE(μmax)/μmax).` : 'No estimable.'
  } else if (p === 'r2') error = 'No aplica: es una medida de ajuste, no una estimación con error.'
  else error = 'Este parámetro no tiene un error analítico para un solo pocillo. El error se estima con la dispersión entre réplicas (ver abajo).'
  return { calculo, error }
}

export const MODELOS_ETQ = { gompertz: 'Gompertz modificado', logistico: 'Logístico', richards: 'Richards', baranyi: 'Baranyi-Roberts' }

// Ajustes iniciales (mismos valores por defecto que la app en R)
export const ajustesDef = () => ({
  corregir_blanco: false, blanco_metodo: 'tiempo', normalizar: 'ninguna', n_od0: 3, od0_metodo: 'auto',
  suavizado: 'ninguno', suav_k: 3, suav_span: 0.3,
  hampel_on: false, hampel_k: 3, hampel_sigma: 3, hampel_min: 0.002, hampel_accion: 'excluir',
  odmax_on: false, odmax: 1,
  pocillo_auto: false, pocillo_factor: 3, pocillo_min: 0.03, pocillo_div: 25,
  unidad_tiempo: 'h', modo_grafico: 'individual', escala_y: 'lineal', tipo_error: 'sd', mostrar_excluidos: true,
  an_ancho: 2, an_minpts: 4, an_lnmin: 0.01, an_r2: 0.98, an_lag_metodo: 'tangente', an_lag_factor: 2,
  an_umbral_od: 0.3, an_frac_exp: 0.5, an_frac_est: 0.1, an_muerte_pct: 10, an_spline: true,
})

export const ETIQUETAS_AJUSTE = {
  corregir_blanco: 'Corregir al blanco', blanco_metodo: 'Método de blanco', normalizar: 'Normalización',
  n_od0: 'Puntos iniciales (respaldo y normalización)', od0_metodo: 'Método de OD0', suavizado: 'Suavizado',
  suav_k: 'Suavizado: ventana', suav_span: 'Suavizado: span LOESS', hampel_on: 'Filtro de Hampel activado',
  hampel_k: 'Hampel: semiventana (puntos)', hampel_sigma: 'Hampel: umbral (MAD)', hampel_min: 'Hampel: diferencia mínima (OD)',
  hampel_accion: 'Hampel: acción', odmax_on: 'Excluir sobre OD máxima', odmax: 'OD máxima confiable',
  pocillo_auto: 'Excluir pocillos sospechosos', pocillo_factor: 'Pocillos: factor de desvío',
  pocillo_min: 'Pocillos: desvío mínimo (OD)', pocillo_div: 'Pocillos: divergencia de AUC (%)',
  unidad_tiempo: 'Unidad de tiempo del gráfico', modo_grafico: 'Tipo de gráfico', escala_y: 'Escala del eje Y',
  tipo_error: 'Tipo de error', mostrar_excluidos: 'Mostrar puntos excluidos', an_ancho: 'Ventana de ln(OD) (h)',
  an_minpts: 'Puntos mínimos por ventana', an_lnmin: 'OD mínima para ln', an_r2: 'R2 mínimo de la ventana',
  an_lag_metodo: 'Método de lag', an_lag_factor: 'Lag: factor sobre OD0', an_umbral_od: 'OD umbral',
  an_frac_exp: 'Fracción de μmax (exponencial)', an_frac_est: 'Fracción de μmax (estacionaria)',
  an_muerte_pct: 'Caída para fase de muerte (%)', an_spline: 'μmax por spline',
}
