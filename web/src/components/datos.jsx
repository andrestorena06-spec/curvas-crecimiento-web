import { useMemo, useRef } from 'react'
import { TablaAvanzada } from './tabla.jsx'
import { Vacio } from './placa.jsx'
import { ETIQUETAS_AJUSTE, MODELOS_ETQ, PARAMS, signif } from '../ayuda.js'
import { desvio, finito, media } from '../motor/analisis.js'
import { opAnalisis } from '../motor/pipeline.js'
import { aCSV, descargarBlob, descargarTexto, tCuantil } from '../utils.js'
import { excelDe } from '../excel.js'

const n2 = (x) => (finito(x) ? Number(x.toPrecision(3)) : null)

// ---------------------------------------------------------------
// Texto de métodos con los criterios activos (equivale a texto_metodos de la app en R)
// ---------------------------------------------------------------
export function textoMetodos(s) {
  const { aj, E, pre } = s
  const op = opAnalisis(aj)
  const num = (x, d) => { const v = Number(x); return finito(v) ? v : d }
  const p = []
  if (aj.corregir_blanco) {
    p.push(aj.blanco_metodo === 'const_media' ? 'Se restó a todas las lecturas el promedio global de los pocillos de blanco.'
      : aj.blanco_metodo === 'const_min' ? 'Se restó a todas las lecturas el valor mínimo de la curva promedio del blanco.'
        : 'Se restó a cada lectura el promedio de los pocillos de blanco en el mismo tiempo.')
  } else p.push('No se corrigió por blanco.')
  if (E.puntosExcl.length) p.push(`Se excluyeron manualmente ${E.puntosExcl.length} puntos.`)
  if (aj.hampel_on) {
    p.push(`Los puntos aberrantes se detectaron con un filtro de Hampel (semiventana de ${Math.round(num(aj.hampel_k, 3))} puntos, umbral de ${num(aj.hampel_sigma, 3)} MAD, diferencia mínima ${num(aj.hampel_min, 0.002)} OD) y se ${aj.hampel_accion === 'interpolar' ? 'reemplazaron por interpolación lineal' : 'excluyeron'}.`)
  }
  if (aj.odmax_on) p.push(`Se excluyeron las lecturas con OD mayor que ${num(aj.odmax, 1)}.`)
  const fuera = pre && !pre.error ? [...pre.fuera] : []
  if (fuera.length) p.push(`Se excluyeron ${fuera.length} pocillos completos (${fuera.join(', ')}).`)
  if (aj.suavizado !== 'ninguno') {
    p.push(`Las curvas se suavizaron con ${aj.suavizado === 'media' ? `media móvil de ${Math.round(num(aj.suav_k, 3))} puntos` : aj.suavizado === 'mediana' ? `mediana móvil de ${Math.round(num(aj.suav_k, 3))} puntos` : `LOESS (span ${num(aj.suav_span, 0.3)})`}.`)
  }
  if (aj.normalizar !== 'ninguna') {
    p.push(`Cada curva se ${aj.normalizar === 'restar' ? 'corrigió restando' : 'normalizó dividiendo por'} su OD inicial (media de los primeros ${Math.round(num(aj.n_od0, 3))} puntos).`)
  }
  p.push(op.od0_metodo === 'auto'
    ? 'La OD inicial (OD₀) se estimó ajustando a ln(OD) un modelo lineal de tres fases (meseta inicial y crecimiento exponencial; Buchanan et al., 1997) con los puntos hasta el final de la ventana exponencial; OD₀ es la exponencial del nivel de la meseta.'
    : `La OD inicial (OD₀) se calculó como la media de los primeros ${op.n_od0} puntos.`)
  p.push(`La tasa específica máxima de crecimiento (μmax) se estimó como la pendiente máxima de la regresión lineal de ln(OD) en ventanas deslizantes de ${op.ancho} h (mínimo ${op.minpts} puntos, OD ≥ ${op.lnmin} y R² ≥ ${op.r2min}); el tiempo de duplicación se calculó como ln(2)/μmax.`)
  p.push(op.lag_metodo === 'umbral'
    ? `La fase lag se definió como el tiempo hasta alcanzar ${op.lag_factor} veces la OD inicial.`
    : 'La fase lag (λ) se definió como la intersección de la tangente en μmax con ln(OD₀).')
  p.push(`K se tomó como el máximo de la curva suavizada con mediana móvil de 3 puntos. El AUC se calculó por el método trapezoidal. La fase exponencial se delimitó con las ventanas con μ ≥ ${op.frac_exp}×μmax; la estacionaria empieza cuando μ < ${op.frac_est}×μmax y la de muerte cuando la OD cae más de ${op.muerte_pct}% desde K.`)
  p.push('Análisis realizado con la aplicación web «Curvas de crecimiento» (los cálculos se hacen en el navegador).')
  return p.join(' ')
}

// Excel con todo el análisis
async function excelCompleto(s) {
  const hojas = []
  const claves = ['n_puntos', 'od0', 'od0_metodo', 'mu_max', 'mu_se', 'td_min', 'lag_h', 'lag_tangente_h', 'lag_umbral_h', 'K', 't_K_h', 'od_final', 'delta_od', 'generaciones', 'auc_od', 'auc_ln', 't_umbral_od_h', 't_max_dod_h', 'dod_max', 'mu_spline', 'r2', 'intercepto', 'n_ventana', 't_ini_ventana', 't_fin_ventana', 't_exp_ini', 't_exp_fin', 't_estacionaria', 't_muerte', 'caida_pct', 'aviso']
  if (s.res?.length) {
    const sel = new Set(s.seleccion.map((c) => c.Pocillo))
    const fp = s.res.map((r) => {
      const f = { Pocillo: r.Pocillo, Muestra: r.Muestra, Replica: r.Replica, Incluido: sel.has(r.Pocillo) ? 'Sí' : 'No' }
      claves.forEach((k) => { f[k] = typeof r[k] === 'number' ? (finito(r[k]) ? signif(r[k], 4) : null) : r[k] })
      return f
    })
    hojas.push({ nombre: 'Parametros_pocillos', columnas: Object.keys(fp[0]), filas: fp })
    const por = {}
    s.res.filter((r) => sel.has(r.Pocillo)).forEach((r) => { (por[r.Muestra] ||= []).push(r) })
    const rs = Object.entries(por).map(([m, g]) => {
      const f = { Muestra: m, n: g.length }
      Object.entries(PARAMS).forEach(([p, et]) => {
        const x = g.map((r) => r[p]).filter(finito)
        f[et + ' media'] = x.length ? signif(media(x), 4) : null
        f[et + ' SD'] = x.length > 1 ? signif(desvio(x), 3) : null
      })
      return f
    })
    if (rs.length) hojas.push({ nombre: 'Resumen_muestras', columnas: Object.keys(rs[0]), filas: rs })
  }
  if (s.pre && !s.pre.error) {
    const dp = s.pre.proc.flatMap((w) => w.t.map((t, i) => ({
      Pocillo: w.Pocillo, Muestra: w.Muestra, Replica: w.Replica, Tiempo_s: t, Tiempo_h: signif(t / 3600, 6),
      Absorbancia: signif(w.y[i], 5), Absorbancia_original: signif(w.yOrig[i], 5),
    })))
    hojas.push({ nombre: 'Datos_procesados', columnas: ['Pocillo', 'Muestra', 'Replica', 'Tiempo_s', 'Tiempo_h', 'Absorbancia', 'Absorbancia_original'], filas: dp })
    hojas.push({ nombre: 'QC_pocillos', columnas: ['Pocillo', 'Muestra', 'Replica', 'Estado', 'Categoria', 'N_quitados', 'Puntos_quitados', 'Pts_aberrantes', 'Pts_OD_alta', 'Pts_no_positivos'],
      filas: s.pre.qc })
    const ex = []
    s.E.puntosExcl.forEach((k) => { const [p, t] = k.split('|'); ex.push({ Tipo: 'Punto (manual)', Pocillo: p, Tiempo_h: signif(Number(t) / 3600, 5), Detalle: '' }) })
    s.E.pocillosExcl.forEach((p) => ex.push({ Tipo: 'Pocillo (manual)', Pocillo: p, Tiempo_h: null, Detalle: '' }))
    s.pre.auto.forEach((p) => ex.push({ Tipo: 'Pocillo (automático)', Pocillo: p, Tiempo_h: null, Detalle: '' }))
    s.E.forzados.forEach((k) => { const [p, t] = k.split('|'); ex.push({ Tipo: 'Punto reincorporado manualmente', Pocillo: p, Tiempo_h: signif(Number(t) / 3600, 5), Detalle: '' }) })
    s.pre.marcado.forEach((w) => w.filas.forEach((f) => { if (f.motivo) ex.push({ Tipo: f.motivo, Pocillo: w.Pocillo, Tiempo_h: signif(f.t / 3600, 5), Detalle: f.detalle }) }))
    if (ex.length) hojas.push({ nombre: 'Exclusiones', columnas: ['Tipo', 'Pocillo', 'Tiempo_h', 'Detalle'], filas: ex })
  }
  hojas.push({ nombre: 'Layout', columnas: ['Pocillo', 'Muestra', 'Replica', 'EsBlanco'], filas: s.config.map((c) => ({ ...c, EsBlanco: c.EsBlanco ? 'Sí' : 'No' })) })
  hojas.push({ nombre: 'Ajustes', columnas: ['Ajuste', 'Valor'], filas: Object.keys(ETIQUETAS_AJUSTE).map((k) => ({ Ajuste: ETIQUETAS_AJUSTE[k], Valor: String(s.aj[k]) })) })
  hojas.push({ nombre: 'Metodos', columnas: ['Texto'], filas: [{ Texto: textoMetodos(s) }] })
  if (s.modelosRes?.length) hojas.push({ nombre: 'Modelos', columnas: Object.keys(s.modelosRes[0]), filas: s.modelosRes })
  return excelDe(hojas)
}

// ===============================================================
// DATOS
// ===============================================================
export function DatosTab({ s }) {
  const vistas = useRef({})
  const filas = useMemo(() => {
    if (!s.pre || s.pre.error) return []
    const sel = new Set(s.seleccion.map((c) => c.Pocillo))
    return s.pre.proc.filter((w) => sel.has(w.Pocillo)).flatMap((w) => w.t.map((t, i) => ({
      Pocillo: w.Pocillo, Muestra: w.Muestra, Replica: w.Replica, Blanco: w.EsBlanco ? 'Sí' : 'No', Tiempo_s: t, Tiempo_h: signif(t / 3600, 5),
      Absorbancia: signif(w.y[i], 5), Absorbancia_original: signif(w.yOrig[i], 5),
    })))
  }, [s.pre, s.seleccion])
  if (!s.datos) return <Vacio texto="Primero cargá el archivo del lector en la pestaña Archivo." />
  if (!s.config.length) return <Vacio texto="Configurá los pocillos para ver los datos." />
  if (s.pre?.error) return <Vacio texto={s.pre.error} />
  const cols = ['Pocillo', 'Muestra', 'Replica', 'Blanco', 'Tiempo_s', 'Tiempo_h', 'Absorbancia', 'Absorbancia_original']
  const onVista = (id, v) => { vistas.current[id] = v; s.onVista?.(id, v) }
  return (
    <div className="pagina">
      <div className="titulo-fila">
        <p className="ayuda" style={{ margin: 0 }}>Datos procesados (con el blanco, las exclusiones, el suavizado y la normalización aplicados) de las muestras y réplicas elegidas en «Gráfico». Cada columna numérica tiene un botón <code>▾</code> para filtrar; clic en un encabezado para ordenar; arrastralo para mover la columna.</p>
        <div className="fila-ctrl" style={{ margin: 0 }}>
          <button onClick={() => descargarTexto(aCSV(filas, cols), 'datos_curvas_crecimiento.csv')}>Descargar datos (CSV)</button>
          <button className="primario" onClick={() => excelCompleto(s).then((b) => descargarBlob(b, 'analisis_curvas.xlsx'))}>Descargar análisis completo (Excel)</button>
        </div>
      </div>
      <TablaAvanzada id="datos" titulo="Datos procesados" columnas={cols} filas={filas} onVista={onVista} />
    </div>
  )
}

// ===============================================================
// MÉTODOS
// ===============================================================
const NT = [2, 3, 4, 5, 6, 8, 11, 21, 31]

export function MetodosTab({ s }) {
  const op = opAnalisis(s.aj)
  const aj = s.aj
  const texto = useMemo(() => textoMetodos(s), [s.aj, s.E, s.pre]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = (cond, txt) => (cond ? <b> (activo: {txt})</b> : <i> (desactivado)</i>)
  return (
    <div className="pagina">
      <section className="tarjeta metodo">
        <div className="titulo-fila">
          <h2>Texto de métodos</h2>
          <button onClick={() => descargarTexto(texto, 'metodos.txt', 'text/plain;charset=utf-8')}>Descargar (TXT)</button>
        </div>
        <p className="ayuda">Describe los criterios que están activos ahora. Copialo y revisalo antes de usarlo en un informe.</p>
        <p className="texto-metodos">{texto}</p>
      </section>

      <section className="tarjeta metodo">
        <h2>Cómo se calcula cada cosa</h2>
        <p className="ayuda">Explicación paso a paso, en lenguaje llano y con las fórmulas. Los ejemplos usan números simples para que puedas repetirlos con calculadora.</p>

        <h3>1. Qué mide el lector y cómo se lee el archivo</h3>
        <p>El lector de placas mide la <b>absorbancia (OD)</b> de cada pocillo a intervalos regulares. Cuanto más turbio el cultivo, mayor la OD. El archivo se convierte en una curva por pocillo: tiempo (en segundos, internamente) contra OD. Los datos originales <b>nunca se modifican</b>: todo lo que sigue (blanco, exclusiones, suavizado) se calcula sobre una copia y se puede deshacer.</p>

        <h3>2. Corrección al blanco{act(aj.corregir_blanco, aj.blanco_metodo === 'tiempo' ? 'tiempo a tiempo' : aj.blanco_metodo === 'const_media' ? 'media constante' : 'mínimo constante')}</h3>
        <p>El <b>blanco</b> es medio de cultivo sin bacterias: su OD no es crecimiento sino el «ruido de fondo» del medio y la placa. Se le resta a todas las lecturas.</p>
        <ul>
          <li><b>Promedio, tiempo a tiempo</b>: en cada instante se promedian los pocillos de blanco elegidos y ese valor se resta a cada pocillo en el mismo instante. Corrige también la deriva del medio.</li>
          <li><b>Constante: media de todo el blanco</b>: se promedia el blanco a lo largo de todo el tiempo y se resta un único número.</li>
          <li><b>Constante: mínimo del blanco</b>: se resta el valor más bajo de la curva promedio del blanco.</li>
        </ul>
        <p>Si un instante no tiene lectura de blanco, ese instante se descarta para evitar restar un valor inventado. Los pocillos de blanco excluidos a mano no entran en el promedio.</p>

        <h3>3. Puntos aberrantes (burbujas, picos)</h3>
        <h4>Filtro de Hampel{act(aj.hampel_on, `semiventana ${aj.hampel_k}, umbral ${aj.hampel_sigma} MAD, mínimo ${aj.hampel_min} OD`)}</h4>
        <p>Detecta lecturas que se salen de lo que hacen sus vecinas en la <b>misma curva</b>. Para cada punto se toma una ventana con k puntos a cada lado (por defecto k = 3, o sea 7 puntos) y se calcula:</p>
        <ol>
          <li><b>Mediana</b> de la ventana (el valor del medio al ordenar). A diferencia del promedio, un valor extremo casi no la mueve.</li>
          <li><b>MAD</b> (desviación absoluta mediana): la mediana de |valor − mediana|. Mide qué tan dispersos están los vecinos, también de forma robusta.</li>
          <li>Escala robusta: <code>s = 1,4826 × MAD</code>. El 1,4826 hace que s equivalga a una desviación estándar si los datos fueran normales.</li>
          <li>Umbral: <code>máx(n × s ; diferencia mínima)</code>. La diferencia mínima es un «piso» en unidades de OD para no marcar desvíos minúsculos cuando la curva es muy lisa (MAD ≈ 0).</li>
          <li>El punto es <b>aberrante</b> si <code>|valor − mediana| &gt; umbral</code>.</li>
        </ol>
        <p><b>Ejemplo.</b> Cinco lecturas consecutivas: 0,10 · 0,11 · <b>0,50</b> · 0,12 · 0,11. Mediana = 0,11. Las desviaciones |valor − 0,11| son 0,01; 0; 0,39; 0,01; 0, y su mediana (el MAD) es 0,01. Entonces s = 1,4826 × 0,01 = 0,0148 y con n = 3 el umbral es 0,0445 OD. Como el 0,50 se aparta 0,39 de la mediana, mucho más que 0,0445, queda marcado; los demás se apartan 0,01 o menos y se conservan.</p>
        <p>Los puntos marcados se pueden <b>excluir</b> (se dibujan como una x roja y no entran en nada) o <b>reemplazar por interpolación lineal</b> entre sus vecinos buenos. Siempre podés cambiar la decisión con un clic sobre el punto (en «Gráfico» o en la ventana ampliada de un pocillo).</p>
        <h4>OD máxima confiable{act(aj.odmax_on, `${aj.odmax} OD`)}</h4>
        <p>Los lectores de placas dejan de ser lineales por encima de OD ≈ 1: una OD de 1,6 no significa el doble de células que una de 0,8. Si activás esta opción, las lecturas mayores al valor elegido se excluyen. Aunque no la actives, la tabla de control de calidad cuenta cuántos puntos la superan.</p>

        <h3>4. Control de calidad por pocillo</h3>
        <p>Compara cada pocillo con las <b>otras réplicas de su muestra</b> (los blancos y los pocillos excluidos a mano no cuentan):</p>
        <ul>
          <li><b>Con 3 o más réplicas</b>. En cada instante se calcula la <b>mediana</b> de las réplicas y, para cada pocillo, el desvío medio |OD − mediana| (columna «Desvío vs réplicas»). Un pocillo es <b>Sospechoso</b> si su desvío es mayor que <code>factor × (mediana de los desvíos de las otras réplicas)</code> y además mayor que el desvío mínimo en OD (por defecto 3 × y 0,03 OD). Ejemplo: si las otras dos réplicas se desvían 0,01 y 0,02 de la mediana, su mediana es 0,015; un pocillo con desvío 0,08 supera 3 × 0,015 = 0,045 y 0,03, y se marca.</li>
          <li><b>Con 2 réplicas</b> no se puede saber cuál falla. Se compara el <b>AUC</b> (área bajo la curva) de ambas: <code>|AUC₁ − AUC₂| / promedio</code>. Si supera el porcentaje elegido (25 % por defecto) se avisa «Réplicas divergentes» y la decisión es tuya.</li>
          <li><b>Ruidoso</b>: curva en la que el 10 % o más de los puntos fueron marcados por Hampel.</li>
          <li><b>Sin réplicas</b>: la muestra tiene un solo pocillo, no hay con qué comparar.</li>
        </ul>
        <p>Los «Sospechosos» solo se excluyen solos si activás <i>Excluir automáticamente</i>{act(aj.pocillo_auto, 'sí')}; si no, quedan señalados y los excluís vos desde la tabla de control de calidad.</p>

        <h3>5. Suavizado y normalización</h3>
        <ul>
          <li><b>Media móvil / mediana móvil</b> de k puntos: cada valor se reemplaza por la media (o mediana) de él y sus vecinos. La mediana protege mejor de picos aislados.</li>
          <li><b>LOESS</b>: ajusta una pequeña recta local, pesando más a los puntos cercanos; el «span» es la fracción de puntos que usa cada ajuste.</li>
          <li><b>Restar OD₀</b> o <b>dividir por OD₀</b>: lleva todas las curvas al mismo punto de partida (OD₀ = media de los primeros N puntos). Dividir expresa la OD como «veces el inóculo».</li>
        </ul>
        <p>El orden fijo es: blanco → exclusiones de puntos → pocillos excluidos → suavizado → normalización.</p>

        <h3>6. Parámetros de crecimiento</h3>
        <p>Una curva de crecimiento típica tiene tres tramos: <b>lag</b> (las células se adaptan y casi no crecen), <b>exponencial</b> (se duplican a ritmo constante) y <b>estacionaria</b> (se agotan los nutrientes y la OD se aplana). El crecimiento exponencial es una <b>recta si se grafica ln(OD)</b>: por eso casi todo se calcula sobre el logaritmo natural de la OD.</p>

        <h4>μmax: velocidad máxima de crecimiento</h4>
        <p>Se recorre la curva con una ventana deslizante de {op.ancho} h (mínimo {op.minpts} puntos, solo puntos con OD ≥ {op.lnmin}). En cada ventana se ajusta por mínimos cuadrados una recta <code>ln(OD) = a + μ·t</code>. La pendiente μ (en h⁻¹) es la velocidad de crecimiento en esa ventana, y su R² dice qué tan recta es. De todas las ventanas con R² ≥ {op.r2min} se elige la de <b>mayor pendiente</b>: esa pendiente es <b>μmax</b>. Si ninguna alcanza el R² mínimo se usa la mejor disponible y se avisa. Podés fijar la ventana a mano arrastrando sobre el gráfico de «Detalle».</p>
        <p><b>Error de μmax</b>: error estándar de la pendiente = <code>|μ| × √[(1 − R²) / (R² × (n − 2))]</code>, con n puntos en la ventana. Solo refleja el ruido dentro de la ventana, no la variación entre réplicas.</p>
        <h4>Tiempo de duplicación</h4>
        <p><code>td = ln(2) / μmax</code>. Ejemplo: μmax = 0,5 h⁻¹ → td = 0,693 / 0,5 = 1,386 h = 83,2 min.</p>
        <h4>OD₀: la OD inicial</h4>
        <p>Tomar solo la primera lectura es ruidoso. Con el método automático se ajusta a ln(OD) un modelo de <b>meseta + recta</b> (tres fases, Buchanan 1997): primero un tramo horizontal (el inóculo, sin crecer) y luego la recta exponencial. OD₀ es <code>exp(nivel de la meseta)</code>. Si hay muy pocos puntos antes de la ventana se usa la media de los primeros N puntos y se avisa.</p>
        <h4>Lag λ</h4>
        <ul>
          <li><b>Tangente</b> (por defecto): se prolonga la recta de μmax hacia atrás hasta que cruza el nivel inicial ln(OD₀): <code>λ = (ln OD₀ − a) / μmax</code>. Ejemplo: a = −4,0; μmax = 0,5; OD₀ = 0,05 (ln = −2,996) → λ = (−2,996 + 4,0) / 0,5 = 2,01 h. Si da negativo no hubo lag y se informa 0.</li>
          <li><b>Umbral</b>: primer tiempo en que la OD llega a {op.lag_factor} × OD₀ (interpolando entre puntos).</li>
        </ul>
        <h4>K, tiempo hasta K, ΔOD, generaciones y OD final</h4>
        <p><b>K</b> es el máximo de la curva <b>después de una mediana móvil de 3 puntos</b> (para que un pico aislado no cuente como máximo). <b>t_K</b> es cuándo ocurre. <b>ΔOD = K − OD₀</b>. <b>Generaciones = log₂(K / OD₀)</b>: ejemplo K = 1,0 y OD₀ = 0,05 → log₂(20) = 4,32 duplicaciones. <b>OD final</b> es el promedio de los últimos 3 puntos; si es muy menor que K, el cultivo declinó.</p>
        <h4>AUC</h4>
        <p>Área bajo la curva por el <b>método trapezoidal</b>: se suman las áreas de los trapecios entre puntos consecutivos, <code>Σ (OD₍ᵢ₎ + OD₍ᵢ₊₁₎)/2 × Δt</code>. <b>AUC de OD</b> está dominado por la meseta; <b>AUC de ln(OD/OD₀)</b> pondera más el crecimiento temprano. Resume lag, velocidad y rendimiento en un solo número, pero no dice cuál de los tres cambió.</p>
        <h4>Tiempos y velocidades en escala lineal</h4>
        <p><b>Tiempo hasta OD umbral</b>: primer instante en que la curva suavizada llega a {op.umbral_od} (interpolación lineal). <b>dOD/dt máx.</b>: mayor aumento de OD por hora entre puntos consecutivos de la curva suavizada, y <b>t de máx. dOD/dt</b> es cuándo ocurre (el punto de inflexión de la curva).</p>
        <h4>μmax por spline</h4>
        <p>Alternativa sin ventana: se ajusta una curva suave (spline suavizante) a ln(OD) y se toma el máximo de su <b>derivada</b>. Sirve para contrastar con μmax de la ventana: si difieren mucho, revisá la ventana o el ruido.</p>
        <h4>Fases</h4>
        <ul>
          <li><b>Exponencial</b>: ventanas consecutivas alrededor de la de μmax cuya pendiente es al menos {op.frac_exp} × μmax.</li>
          <li><b>Estacionaria</b>: empieza cuando, después de la fase exponencial, μ cae por debajo de {op.frac_est} × μmax.</li>
          <li><b>Muerte</b>: primer tiempo después de K en que la OD baja más de {op.muerte_pct} % respecto de K. Ojo: una caída de OD puede ser lisis, pero también agregación o sedimentación.</li>
        </ul>

        <h3>7. Modelos de crecimiento</h3>
        <p>En la pestaña «Modelos» se ajustan curvas matemáticas a toda la curva de cada pocillo, por mínimos cuadrados no lineales (algoritmo de Levenberg–Marquardt con límites en los parámetros, equivalente a <code>nls</code> con «port» de R). Gompertz, logístico y Richards se ajustan a <code>y = ln(OD/OD₀)</code> (según Zwietering et al., 1990) y Baranyi–Roberts a <code>ln(OD)</code>:</p>
        <ul>
          <li><b>{MODELOS_ETQ.gompertz}</b>: <code>y = A · exp(−exp(μ·e/A · (λ − t) + 1))</code></li>
          <li><b>{MODELOS_ETQ.logistico}</b>: <code>y = A / (1 + exp(4μ/A · (λ − t) + 2))</code></li>
          <li><b>{MODELOS_ETQ.richards}</b>: <code>y = A · (1 + ν·exp(1+ν)·exp(μ/A · (1+ν)^(1+1/ν) · (λ − t)))^(−1/ν)</code></li>
          <li><b>{MODELOS_ETQ.baranyi}</b>: modelo mecanicista con fase de adaptación (parámetro h₀ = μ·λ) y saturación.</li>
        </ul>
        <p>En todos, <b>A</b> es la altura de la curva en ln (K = OD₀·e<sup>A</sup>), <b>μ</b> la velocidad máxima y <b>λ</b> el lag. Se parte de los valores que dio la ventana deslizante. Para elegir el mejor modelo de cada pocillo se compara el <b>AIC</b> (<code>2k − 2 ln L</code>, con k parámetros): premia el buen ajuste y castiga la complejidad; gana el <b>menor AIC</b> entre los que convergieron. El <b>BIC</b> es parecido pero penaliza más a los modelos con más parámetros. Un ajuste que no converge se informa como tal, no se oculta.</p>

        <h3>8. Resumen por muestra y barras de error</h3>
        <p>Para cada muestra se usan solo las <b>n réplicas seleccionadas</b> (los pocillos excluidos no entran). Con xᵢ el valor de cada réplica:</p>
        <ul>
          <li><b>Media</b>: <code>x̄ = Σxᵢ / n</code>.</li>
          <li><b>Desviación estándar (SD)</b>: <code>s = √[Σ(xᵢ − x̄)² / (n − 1)]</code> (muestral, se divide por n − 1). Cuánto se dispersan las réplicas.</li>
          <li><b>Error estándar (SEM)</b>: <code>s / √n</code>. Incertidumbre de la media; baja al aumentar n.</li>
          <li><b>IC 95 %</b>: <code>x̄ ± t(0,975; n − 1) × SEM</code>, donde t es el cuantil 97,5 % de la distribución t de Student con n − 1 grados de libertad.</li>
        </ul>
        <div className="tabla-scroll chica"><table className="tabla"><thead><tr><th>n (réplicas)</th>{NT.map((n) => <th key={n}>{n}</th>)}</tr></thead>
          <tbody>
            <tr><td>t(0,975; n − 1)</td>{NT.map((n) => <td key={n}>{tCuantil(0.975, n - 1).toFixed(3)}</td>)}</tr>
          </tbody></table></div>
        <p className="ayuda">Ejemplo: con 3 réplicas, IC 95 % = 4,303 × SEM = 4,303 × s / √3 ≈ 2,484 × s. Con pocas réplicas t es grande, por eso el IC 95 % es mucho más ancho que el SEM. En el gráfico «Media ± error», para cada instante se promedian las réplicas y la banda es x̄ ± error. En la escala ln(OD) se transforma <b>antes</b> de promediar.</p>

        <h3>9. Cómo leer los resultados con criterio</h3>
        <ul>
          <li>Los pocillos de una misma placa son <b>réplicas técnicas</b>. Para afirmar algo sobre una cepa o condición hace falta repetir el experimento en días distintos (réplicas biológicas).</li>
          <li>Los pocillos del <b>borde</b> (filas A y H, columnas 1 y 12) evaporan más: el «Mapa de placa» ayuda a ver si el borde se separa sistemáticamente del interior.</li>
          <li>Con OD muy baja domina el ruido; si μmax parece inflado, subí la «OD mínima para ln».</li>
          <li>Los valores dependen del organismo, el medio, la temperatura y el volumen del pocillo: compará siempre contra un control en la misma placa.</li>
          <li>Un filtro automático no distingue un error experimental de un fenómeno biológico real: revisá cada punto o pocillo marcado antes de darlo por malo.</li>
        </ul>
      </section>
    </div>
  )
}
