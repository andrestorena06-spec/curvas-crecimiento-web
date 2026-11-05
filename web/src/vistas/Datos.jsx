import { useMemo, useState } from 'react'
import { PARAMS } from '../ayuda.js'
import { excelDe } from '../excel.js'
import { desvio, finito, media } from '../motor/analisis.js'
import { odCorregida } from '../motor/odmanual.js'
import { TIPOS, ORIGENES, VERSION, dilucionesUfc, serieUfc } from '../modelo.js'
import { APP_VERSION } from '../version.js'
import { Encabezado, Icono, Vacio } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { descargarBlob, signif, tCuantil } from '../utils.js'
import { CLAVES_RESUMEN, ajustesOd, resumenPorCepa } from './Parametros.jsx'
import { crecimientoPorCepa } from './ParamUfc.jsx'
import { MODELOS_UFC, centroUfc, icUfc, modeloUfc, prediccionUfc } from '../motor/ufc.js'
import { paresOdUfc } from './Combinado.jsx'

const r4 = (x) => (typeof x === 'number' ? (finito(x) ? signif(x, 6) : null) : x)
// Valor de un ajuste para el Excel: los objetos/listas van como JSON (String(obj) daba «[object Object]»)
const ajTexto = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v))

// Hoja «Trazabilidad»: con qué versión, datos de origen, ajustes y decisiones manuales se obtuvo el análisis
function trazabilidad(s) {
  const { exp, serie } = s
  const F = []
  const add = (Seccion, Clave, Valor) => F.push({ Seccion, Clave, Valor: Valor === null || Valor === undefined ? '' : ajTexto(Valor) })
  add('Programa', 'Versión de la app', APP_VERSION)
  add('Programa', 'Versión del formato de archivo', VERSION)
  add('Programa', 'Generado', new Date().toLocaleString('es'))
  add('Experimento', 'Nombre', exp.nombre)
  add('Experimento', 'Id', exp.id)
  add('Experimento', 'Creado', exp.creado)
  add('Experimento', 'Tipo', TIPOS[exp.tipo].titulo + (exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : ''))
  if (s.archivoExp?.nombre) add('Origen', 'Archivo de la sesión (.curvas.json)', s.archivoExp.nombre)
  if (exp.tecan?.archivo?.nombre) add('Origen', 'Excel del lector (Tecan)', exp.tecan.archivo.nombre)
  ;(exp.placas || []).forEach((p) => add('Origen', `Placa t = ${p.t} h`, p.archivo?.nombre ? `${p.archivo.nombre}${p.oculta ? ' (oculta)' : ''}` : 'sin Excel'))
  ;(exp.excels || []).forEach((x) => add('Origen', `Excel de placas «${x.nombre}»`, JSON.stringify({ hoja: x.hoja, onda: x.onda, t: x.tNombre })))
  Object.entries(exp.cond || {}).forEach(([k, v]) => add('Condiciones', k, v))
  Object.entries(exp.aj || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => add('Ajustes', k, v))
  Object.entries(exp.E?.ventanas || {}).forEach(([k, v]) => add('Ventanas de μmax manuales', k, v))
  ;(exp.E?.puntosExcl || []).forEach((k) => add('OD: puntos excluidos a mano', k, 'excluido'))
  ;(exp.E?.forzados || []).forEach((k) => add('OD: puntos conservados a mano (forzados)', k, 'conservado'))
  ;(exp.E?.pocillosExcl || []).forEach((k) => add('OD: pocillos/series excluidos a mano', k, 'excluido'))
  ;(exp.plExcl || []).forEach((k) => add('Placas: lecturas excluidas a mano', k, 'excluida'))
  ;(exp.plForz || []).forEach((k) => add('Placas: lecturas conservadas a mano (forzadas)', k, 'conservada'))
  ;(exp.ufcExcl || []).forEach((k) => add('UFC: réplicas excluidas a mano', k, 'excluida'))
  ;(exp.ufcForz || []).forEach((k) => add('UFC: réplicas conservadas a mano (forzadas)', k, 'conservada'))
  add('Cepas', 'Cepas ocultas en los gráficos', exp.aj?.cepas_ocultas || [])
  Object.entries(exp.aj?.calib_incl || {}).forEach(([k, v]) => add('Calibración: pares elegidos a mano', k, v ? 'incluido' : 'excluido'))
  if (exp.tipo !== 'od' && exp.ufc) {
    const u = exp.ufc
    add('UFC: parámetros', 'Volumen sembrado (µL), rango contable', JSON.stringify({ vol: u.vol, min: u.min, max: u.max, nd: u.nd, estimados: u.estimados, primero: u.primero, toma: u.toma, diluyente: u.diluyente, pasos: u.pasos }))
    add('UFC: parámetros', 'Dilución total de cada columna', serieUfc(u).map((d) => d.D))
    Object.entries(dilucionesUfc(u)).forEach(([g, d]) => add('UFC: dilución usada por cepa y tiempo', g, `columna ${d.k === null ? '(ninguna)' : d.k}${d.manual ? ' (elegida a mano)' : ' (sugerida)'}`))
    ;(u.filas || []).forEach((f) => add('UFC: conteos crudos (colonias por columna de dilución)', `${f.muestra} | t = ${f.t} h | réplica ${f.replica}`, JSON.stringify(f.c || {})))
  }
  return { id: 'trazabilidad', titulo: 'Trazabilidad', nota: 'Versión del programa, origen de los datos, todos los ajustes, decisiones manuales (ventanas, exclusiones, pares de calibración) y conteos crudos de UFC con los que se obtuvo este análisis.', columnas: ['Seccion', 'Clave', 'Valor'], filas: F }
}

const limpiar = (filas) => filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k[0] !== '_').map(([k, v]) => [k, r4(v)])))

// Todas las tablas del experimento: [{ id, titulo, columnas, filas, nota }]
export function tablasDe(s) {
  const { exp, pre, res, ufcRes, serie } = s
  const T = []
  if (serie.datos) {
    const ps = Object.keys(serie.datos.pocillos).filter((p) => serie.config.some((c) => c.Pocillo === p))
    const nombre = (p) => { const c = serie.config.find((x) => x.Pocillo === p); return c ? `${c.Muestra}${c.EsBlanco ? ' (blanco)' : ` r${c.Replica}`}${exp.origenOd === 'tecan' ? ` [${p}]` : ''}` : p }
    T.push({ id: 'crudos', titulo: exp.origenOd === 'tecan' ? 'OD leída (sin procesar)' : 'OD por serie', nota: exp.origenOd === 'tecan' ? 'Valores tal como vienen del lector.' : exp.origenOd === 'placas' ? 'Ya con el blanco de cada placa restado y multiplicada por el factor de dilución.' : 'OD corregida de la cubeta (blanco y dilución aplicados).',
      columnas: ['Tiempo_h', ...ps.map(nombre)], filas: serie.datos.tiempos.map((t, i) => Object.fromEntries([['Tiempo_h', t / 3600], ...ps.map((p) => [nombre(p), serie.datos.pocillos[p][i]])])) })
  }
  if (exp.origenOd === 'placas' && serie.extra?.detalle?.length) T.push({ id: 'placas', titulo: 'Lecturas de placas, blanco y dilución', columnas: Object.keys(serie.extra.detalle[0]), filas: serie.extra.detalle })
  if (exp.origenOd === 'placas' && serie.extra?.blancos?.length) T.push({ id: 'blancos', titulo: 'Blanco de cada placa', columnas: ['T_h', 'Blanco_tomado_de_T_h', 'Pocillos', 'Media', 'DE'], filas: serie.extra.blancos.map((b) => ({ T_h: b.t, Blanco_tomado_de_T_h: b.origen, Pocillos: (b.pocillos || []).join(' '), Media: b.valor, DE: b.de })) })
  if (exp.origenOd === 'cubeta' && exp.manual.filas.length) {
    T.push({ id: 'cubeta', titulo: 'Lecturas de cubeta', columnas: ['Muestra', 'Replica', 'T_h', ...Array.from({ length: exp.manual.nd }, (_, k) => (k ? `Lectura_1:${exp.manual.factor ** k}` : 'Lectura_sin_diluir')), 'OD_corregida', 'Estado'],
      filas: exp.manual.filas.map((f) => { const c = odCorregida(f, exp.manual); return { Muestra: f.muestra, Replica: f.replica, T_h: f.t, ...Object.fromEntries(Array.from({ length: exp.manual.nd }, (_, k) => [k ? `Lectura_1:${exp.manual.factor ** k}` : 'Lectura_sin_diluir', f.od?.[k]])), OD_corregida: c.od, Estado: c.estado } }) })
  }
  if (pre && !pre.error) {
    // OD con la que se calculan los parámetros y, si hay suavizado o normalización, la de los gráficos (otra tabla)
    const nom = (w) => `${w.Muestra} r${w.Replica}${exp.origenOd === 'tecan' ? ` [${w.Pocillo}]` : ''}`
    const tablaOd = (series, id, titulo, nota) => {
      const ws = series.filter((w) => !w.EsBlanco)
      const ts = [...new Set(ws.flatMap((w) => w.t))].sort((a, b) => a - b)
      return { id, titulo, nota, columnas: ['Tiempo_h', ...ws.map(nom)], filas: ts.map((t) => Object.fromEntries([['Tiempo_h', t / 3600], ...ws.map((w) => { const i = w.t.indexOf(t); return [nom(w), i >= 0 ? w.y[i] : null] })])) }
    }
    T.push(tablaOd(pre.analisis, 'procesada', 'OD usada en el análisis', 'Blanco restado y corregida por dilución, sin los puntos ni las réplicas excluidos, sin suavizar ni normalizar: con estos valores se calculan todos los parámetros.'))
    if (pre.proc !== pre.analisis) T.push(tablaOd(pre.proc, 'graficos', 'OD de los gráficos (suavizada o normalizada)', 'Solo para dibujar: el suavizado y la normalización no se usan en ningún parámetro.'))
    const excl = []
    pre.marcado.forEach((w) => w.filas.forEach((f) => { if (f.motivo) excl.push({ Serie: w.Pocillo, Muestra: w.Muestra, Replica: w.Replica, T_h: f.t / 3600, OD: f.yAntes, Motivo: f.motivo, Detalle: f.detalle }) }))
    exp.E.puntosExcl.forEach((k) => { const [p, t] = k.split('|'); const c = serie.config.find((x) => x.Pocillo === p); excl.push({ Serie: p, Muestra: c?.Muestra, Replica: c?.Replica, T_h: Number(t) / 3600, OD: null, Motivo: 'Excluido a mano', Detalle: '' }) })
    T.push({ id: 'excluidos', titulo: 'Puntos excluidos', columnas: ['Serie', 'Muestra', 'Replica', 'T_h', 'OD', 'Motivo', 'Detalle'], filas: excl })
    if (!s.porCepa) T.push({ id: 'qc', titulo: 'Control de calidad por réplica', columnas: ['Pocillo', 'Muestra', 'Replica', 'Categoria', 'Estado', 'd_mediana', 'ratio', 'dif_pct', 'N_quitados', 'Pts_aberrantes', 'Pts_OD_alta'], filas: pre.qc.map((q) => ({ ...q, Estado: pre.fuera.has(q.Pocillo) ? 'Excluido del análisis' : q.Estado })) })
  }
  if (res?.length) {
    const claves = ['od0', 'mu_max', 'mu_se', 'td_h', 'td_se_h', 'lag_h', 'K', 't_K_h', 'delta_od', 'generaciones', 'auc_od', 'auc_ln', 't_umbral_od_h', 'dod_max', 't_max_dod_h', 'mu_spline', 't_estacionaria', 't_muerte', 'caida_pct', 'r2', 'n_ventana', 'ventana_ampliada', 't_ini_ventana', 't_fin_ventana']
    T.push(s.porCepa
      ? { id: 'parametros', titulo: 'Parámetros por cepa', nota: `Placas por tiempo: una curva por cepa (${s.modoCurva === 'puntos' ? 'regresión con todos los pocillos' : 'media de los pocillos en cada tiempo'}).`, columnas: ['Muestra', 'n_por_tiempo_min', 'n_por_tiempo_max', 'n_lecturas', 'modo_curva', ...claves, 'ventana_manual', 'aviso'], filas: res, etiquetas: PARAMS }
      : { id: 'parametros', titulo: 'Parámetros por réplica', columnas: ['Pocillo', 'Muestra', 'Replica', ...claves, 'ventana_manual', 'aviso'], filas: res, etiquetas: PARAMS })
    if (s.porCepa) {
      const curvas = s.seriesAn.flatMap((c) => c.t.map((t, i) => ({ Muestra: c.Muestra, T_h: t / 3600, n_pocillos: c.n[i], OD_media: c.y[i], DE: c.sd[i] })))
      T.push({ id: 'curva_cepa', titulo: 'Curva de cada cepa (media por tiempo)', columnas: ['Muestra', 'T_h', 'n_pocillos', 'OD_media', 'DE'], filas: curvas })
    }
    const modOd = exp.opciones?.['curva.modelo'] || 'baranyi'
    if (modOd === 'baranyi' || modOd === 'huang') {
      const lf = exp.opciones?.['curva.lagfijo'] ?? ''
      const aOd = ajustesOd(s, modOd, [...new Set(res.map((r) => r.Muestra))], lf)
      const filasMod = aOd.filter((a) => a.c?.ok).map((a) => ({ Muestra: a.nombre, Modelo: MODELOS_UFC[modOd], mu_h: a.c.mu, EE_mu_h: a.c.ee_mu, td_h: Math.LN2 / a.c.mu, EE_td_h: a.c.ee_td, lag_h: a.c.lag_h, EE_lag_h: a.c.ee_lag, Lag_fijado: a.c.lagFijo ? 'Sí' : 'No', Correlacion_mu_lag: a.c.corr_mu_lag, OD0_ajustada: 10 ** a.c.y0, ODmax: finito(a.c.yEnd) ? 10 ** a.c.yEnd : null, R2: a.c.r2, EE_ajuste_log10: a.c.se, gl: a.c.gl, Puntos: a.c.n }))
      if (filasMod.length) T.push({ id: 'od_modelo', titulo: `Modelo de la OD (${MODELOS_UFC[modOd]})`, nota: 'Ajuste no lineal sobre ln(OD) con todos los puntos. EE = error estándar de cada parámetro (matriz de covarianza del ajuste). Correlacion_mu_lag: si es cercana a ±1, μ y el lag no se pueden separar con estos datos.', columnas: Object.keys(filasMod[0]), filas: filasMod })
    }
    const rs = resumenPorCepa(res)
    const cols = ['Muestra', 'n', 'n_unidad', 'tipo_de_error', 'mu_max_EE_pendiente', ...CLAVES_RESUMEN.flatMap((k) => (k === 'r2' ? ['r2_min', 'r2_n'] : [`${k}_media`, `${k}_DE`, `${k}_IC95`, `${k}_n`]))]
    T.push({ id: 'resumen', titulo: 'Resumen por cepa (media, DE, semiancho del IC 95 %)',
      nota: 'n = réplicas técnicas (pocillos o series) de UN experimento, o pocillos por tiempo si hay una sola curva por cepa (placas por tiempo; allí el único error es el EE de la pendiente de μmax). <param>_n = valores que entraron en cada media. td_h = ln 2 / μ medio (no el promedio de los td; su DE e IC se propagan de los de μmax). r2_min = el R² más bajo de las réplicas (el R² no se promedia). Con n < 3 la DE y el IC 95 % tienen muy poca base.', columnas: cols,
      filas: rs.map((r) => ({ Muestra: r.Muestra, n: r.nTxt, n_unidad: r.unico ? `${r.unidad} (una curva por cepa, ${r.n_lecturas} lecturas)` : `${r.unidad} técnicas`, tipo_de_error: r.unico ? 'EE de la pendiente (solo μmax)' : 'DE entre réplicas', mu_max_EE_pendiente: r.unico ? r.se_mu : null, ...Object.fromEntries(CLAVES_RESUMEN.flatMap((k) => (k === 'r2' ? [['r2_min', r[k].m], ['r2_n', r[k].n]] : [[`${k}_media`, r[k].m], [`${k}_DE`, r[k].sd], [`${k}_IC95`, r[k].ic], [`${k}_n`, r[k].n]]))) })) })
  }
  if (ufcRes?.hay) {
    T.push({ id: 'ufc_rep', titulo: 'UFC/mL por réplica', columnas: ['Muestra', 'T_h', 'Replica', 'Diluciones_usadas', 'Colonias_usadas', 'UFC_mL', ...(centroUfc(exp.aj) === 'geo' ? [] : ['IC95_inf', 'IC95_sup']), 'log10', 'Estado', 'Incluida'],
      filas: ufcRes.reps.filter((r) => r.Conteos > 0).map((r) => ({ ...r, Incluida: ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`) ? 'No' : 'Sí' })) })
    const tablaPool = { id: 'ufc_res', titulo: 'UFC/mL por cepa y tiempo (Σ colonias / Σ volumen sembrado)', columnas: ['Muestra', 'T_h', 'N', 'Colonias_suma', 'Volumen_mL', 'UFC_mL', 'IC95_inf', 'IC95_sup', 'u_poisson_log10', 'u_oper_log10', 'u_oper_estimada_log10', 'u_oper_defecto_log10', 'u_comb_log10', 'U_expandida_log10', 'k', 'log10', 'DE_log10', 'Media_geometrica', 'CV_pct', 'Estado'], nota: 'IC95_inf / IC95_sup = 10^(log10 N ± U), con U = k·u_comb y u_comb² = u_poisson² + u_oper² (enfoque de ISO 19036, k = 2). u_poisson = 1/(ln10·√Colonias_suma). u_oper = máx(u_oper_defecto, u_oper_estimada), donde u_oper_estimada es la variación entre réplicas (DE de log10) por encima de la de Poisson (vacía con una sola réplica). Todas las u en unidades log10.', filas: ufcRes.res.map((r) => ({ ...r, u_poisson_log10: r.u_poisson, u_oper_log10: r.u_oper, u_oper_estimada_log10: r.u_oper_est, u_oper_defecto_log10: r.u_oper_def, u_comb_log10: r.u_comb, U_expandida_log10: r.U_exp, k: 2 })) }
    // media geométrica: media de los log10 de las réplicas, con DE, EEM e IC 95 % (t de Student) en log10 y en UFC/mL
    const filaGeo = (r) => {
      const lg = (r._vals || []).filter((x) => x > 0).map(Math.log10), n = lg.length, m = n ? media(lg) : NaN
      const sd = n > 1 ? desvio(lg) : NaN, eem = n > 2 ? sd / Math.sqrt(n) : NaN, h = n > 2 ? tCuantil(0.975, n - 1) * eem : NaN
      return { Muestra: r.Muestra, T_h: r.T_h, N: n, Media_geometrica: n ? 10 ** m : NaN, log10_media: m, DE_log10: sd, EEM_log10: eem, IC95_log10_inf: m - h, IC95_log10_sup: m + h, IC95_inf: 10 ** (m - h), IC95_sup: 10 ** (m + h), CV_pct: r.CV_pct, Colonias_suma: r.Colonias_suma, Estado: r.Estado }
    }
    const tablaGeo = { id: 'ufc_res', titulo: 'UFC/mL por cepa y tiempo (media geométrica de las réplicas)', columnas: ['Muestra', 'T_h', 'N', 'Media_geometrica', 'log10_media', 'DE_log10', 'EEM_log10', 'IC95_log10_inf', 'IC95_log10_sup', 'IC95_inf', 'IC95_sup', 'CV_pct', 'Colonias_suma', 'Estado'], nota: 'Para cada réplica UFC/mL = C·D/V; se promedian los log10 y se vuelve a UFC/mL (10^media). N = réplicas con UFC > 0. DE_log10 = desvío muestral (n − 1) de los log10; EEM_log10 = DE/√N; IC95_log10 = media ± t(0,975; N − 1)·EEM_log10 y IC95_inf / IC95_sup = 10^ese intervalo (UFC/mL, asimétrico). EEM e IC95 solo con N ≥ 3.', filas: ufcRes.res.map(filaGeo) }
    T.push(centroUfc(exp.aj) === 'geo' ? tablaGeo : tablaPool)
    const cr = crecimientoPorCepa(ufcRes, exp.aj).map(({ Muestra, c }) => ({ Muestra, Modelo: c.modelo, Puntos: c.n, Tiempos: c.nT, gl: c.gl, curvatura_m: c.mcurv, Convergio: c.convergio === false ? 'No' : 'Sí', Modelo_nombre: MODELOS_UFC[c.modelo], Velocidad_log10_h: c.rate, EE_mu_h: c.ee_mu, EE_lag_h: c.ee_lag, EE_y0_log10: c.ee_y0, EE_ymax_log10: c.ee_ymax, EE_td_h: c.ee_td, Correlacion_mu_lag: c.corr_mu_lag, Lag_fijado: c.lagFijo ? 'Sí' : 'No', Ventana_t0_h: c.modelo === 'lineal' ? c.t0 : null, Ventana_t1_h: c.modelo === 'lineal' ? c.t1 : null, Ventana_ampliada: c.ventanaAmpliada ? 'Sí' : 'No', mu_h: c.mu, td_h: c.td_h, lag_h: c.lag_h, y0_log10: c.y0, yfinal_log10: c.yEnd, R2: c.r2, EE_ajuste_log10: c.se, Aviso: [c.motivo, ...(c.avisos || [])].filter(Boolean).join(' · '), log10_inicio: c.log10_N0, log10_fin: c.log10_fin, aumento_log10: c.crecimiento_log10, generaciones: c.generaciones, aumento_segun: c.aumentoDe === 'modelo' ? 'modelo (primer a último tiempo)' : c.aumentoDe === 'observado' ? 'valores observados' : '' }))
    T.push({ id: 'ufc_crec', titulo: 'Crecimiento por recuento', columnas: Object.keys(cr[0] || { Muestra: 1 }), filas: cr })
    if (exp.aj.ufc_pred?.on) {
      const pr = [...new Set(ufcRes.res.map((r) => r.Muestra))].map((m) => { const p = prediccionUfc(ufcRes, m, exp.aj); return { Muestra: m, Hasta_h: p.hasta, mu_h: p.c?.mu, lag_h: p.c?.lag_h, y0_log10: p.c?.y0, Nmax_log10: p.c?.yEnd, Nmax_fijado: p.c?.ymaxFijo ? 'Sí' : 'No', log10_al_final: p.yHasta, t_meseta_h: p.tMeseta, Objetivo_log10: p.objetivo, t_objetivo_h: p.tObjetivo, Aviso: p.ok ? '' : p.motivo } })
      T.push({ id: 'ufc_pred', titulo: `Predicción con ${MODELOS_UFC[modeloUfc(exp.aj)]}`, columnas: Object.keys(pr[0] || { Muestra: 1 }), filas: pr })
    }
  }
  if (exp.tipo === 'odufc') {
    const p = paresOdUfc(s)
    if (p.length) T.push({ id: 'pares', titulo: 'Pares OD–UFC', columnas: Object.keys(p[0]), filas: p })
  }
  T.push(trazabilidad(s))
  return T.map((t) => ({ ...t, filas: limpiar(t.filas) }))
}

// Excel completo: una hoja con las condiciones y los ajustes, y una hoja por tabla
export async function descargarExcel(s, tablas = tablasDe(s)) {
  const exp = s.exp
  const info = [
    { Campo: 'Experimento', Valor: exp.nombre }, { Campo: 'Tipo', Valor: TIPOS[exp.tipo].titulo + (exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : '') },
    ...Object.entries(exp.cond).map(([k, v]) => ({ Campo: k, Valor: v })), { Campo: 'Generado', Valor: new Date().toLocaleString('es') }, { Campo: 'Versión de la app', Valor: APP_VERSION },
    ...Object.entries(exp.aj).map(([k, v]) => ({ Campo: `ajuste: ${k}`, Valor: ajTexto(v) })),
  ]
  const hojas = [{ nombre: 'Experimento', columnas: ['Campo', 'Valor'], filas: info }, ...tablas.map((x) => ({ nombre: x.titulo.slice(0, 31), columnas: x.columnas, filas: x.filas }))]
  descargarBlob(await excelDe(hojas), `${exp.nombre.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '_')} - analisis.xlsx`)
}

const celda = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(signif(v, 5)).replace('.', ',')) : String(v))

export function Datos({ s }) {
  const tablas = useMemo(() => tablasDe(s), [s.pre, s.res, s.ufcRes, s.serie, s.exp]) // eslint-disable-line react-hooks/exhaustive-deps
  const [act, setAct] = useState(null)
  const t = tablas.find((x) => x.id === act) || tablas[0]
  const exp = s.exp
  const descargar = () => descargarExcel(s, tablas)
  if (!tablas.length) return <div className="pagina"><Encabezado titulo="Datos" /><Vacio titulo="Todavía no hay datos">Cargá datos para ver las tablas.</Vacio></div>
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Exportar">
          <BotonCinta icono="bajar" texto="Excel completo" onClick={descargar} />
          <BotonCinta icono="imprimir" texto="Imprimir / PDF" onClick={() => window.print()} />
        </Grupo>
      </Cinta>
      <Encabezado titulo="Datos" sub={`Todas las tablas del análisis, desde la lectura original hasta los parámetros. El Excel incluye una hoja por tabla y otra con las condiciones y todos los ajustes usados, más la hoja «Trazabilidad». Versión del programa: ${APP_VERSION}.`} />
      <div className="pestanas no-imprimir">
        {tablas.map((x) => <button key={x.id} className={t.id === x.id ? 'on' : ''} onClick={() => setAct(x.id)}>{x.titulo}<span className="chip" style={{ marginLeft: 4 }}>{x.filas.length}</span></button>)}
      </div>
      <div className="tarjeta">
        <h2>{t.titulo}</h2>
        {t.nota && <p className="ayuda">{t.nota}</p>}
        {!t.filas.length ? <p className="ayuda">Sin filas.</p> : (
          <div className="tabla-scroll" style={{ maxHeight: 620 }}><table className="tabla">
            <thead><tr>{t.columnas.map((c) => <th key={c} className={typeof t.filas[0][c] === 'number' ? 'num' : ''} data-tip={t.etiquetas?.[c]}>{c}</th>)}</tr></thead>
            <tbody>{t.filas.slice(0, 2000).map((f, i) => <tr key={i}>{t.columnas.map((c) => <td key={c} className={typeof f[c] === 'number' ? 'num' : ''}>{celda(f[c])}</td>)}</tr>)}</tbody>
          </table></div>
        )}
        {t.filas.length > 2000 && <p className="ayuda">Se muestran las primeras 2000 filas; el Excel tiene todas.</p>}
      </div>
    </div>
  )
}
