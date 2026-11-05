import { useMemo, useRef } from 'react'
import { MODELOS_ETQ } from '../ayuda.js'
import { finito } from '../motor/analisis.js'
import { opAnalisis } from '../motor/pipeline.js'
import { ORIGENES, TIPOS, caminoOptico } from '../modelo.js'
import { Encabezado, Icono } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { descargarTexto, fs, fx, sciCorto, tCuantil } from '../utils.js'
import { crecimientoPorCepa } from './ParamUfc.jsx'
import { MODELOS_UFC, cuotaDe, fasesUfc, lagFijoUfc, modeloUfc, tramoUfcElegido, uOperUfc } from '../motor/ufc.js'
import { ventanaDeFilas } from './FasesCepa.jsx'

const Fm = ({ children, nota }) => <div className="formula">{children}{nota && <small>{nota}</small>}</div>
const Ej = ({ titulo = 'Ejemplo', children }) => <div className="ejemplo"><b>{titulo}.</b> {children}</div>
const Act = ({ on, txt }) => <span className={`estado-ajuste ${on ? '' : 'off'}`}>{on ? `activo${txt ? ': ' + txt : ''}` : 'desactivado'}</span>
const Q = { 90: [0.941, 0.765, 0.642, 0.56, 0.507, 0.468, 0.437, 0.412], 95: [0.97, 0.829, 0.71, 0.625, 0.568, 0.526, 0.493, 0.466], 99: [0.994, 0.926, 0.821, 0.74, 0.68, 0.634, 0.598, 0.568] }

// Párrafo de métodos listo para un informe, según lo que está activo
function textoPublicacion(s) {
  const { exp } = s
  const aj = exp.aj, op = opAnalisis(aj), c = exp.cond
  const p = []
  const cond = [c.organismo && `de ${c.organismo}`, c.medio && `en ${c.medio}`, c.temperatura && `a ${c.temperatura} °C`].filter(Boolean).join(' ')
  if (exp.tipo !== 'ufc') {
    if (exp.origenOd === 'tecan') p.push(`El crecimiento ${cond} se siguió por densidad óptica a ${c.lambda} nm en un lector de microplacas, con lecturas cinéticas de cada pocillo.`)
    if (exp.origenOd === 'placas') p.push(`El crecimiento ${cond} se siguió midiendo la densidad óptica a ${c.lambda} nm de una placa de 96 pocillos en cada tiempo de muestreo.`)
    if (exp.origenOd === 'cubeta') p.push(`El crecimiento ${cond} se siguió por densidad óptica a ${c.lambda} nm en un espectrofotómetro con cubeta; las muestras cuya absorbancia superó ${exp.manual.vmax} se diluyeron (factor ${exp.manual.factor}) y la OD se calculó como (lectura − blanco) × factor de dilución, usando solo lecturas dentro del rango lineal (${exp.manual.vmin}–${exp.manual.vmax}).`)
    if (exp.origenOd === 'tecan' && aj.corregir_blanco) p.push(`A cada lectura se le restó ${aj.blanco_metodo === 'tiempo' ? 'el promedio de los pocillos con medio sin inocular en el mismo tiempo' : aj.blanco_metodo === 'const_media' ? 'la media de todas las lecturas del blanco' : 'el mínimo de la curva promedio del blanco'}.`)
    if (exp.origenOd !== 'cubeta' && aj.camino_on) { const c = caminoOptico(aj); if (c) p.push(`La OD se llevó a 1 cm de camino óptico: con ${aj.pocillo_vol} µL en pocillos de ${String(aj.pocillo_diam).replace(".", ",")} mm de diámetro el camino es l = V/(π·d²/4) = ${fx(c.l, 3)} cm, y OD₁cm = OD × 1/l.`) }
    if (exp.origenOd === 'placas' && aj.corregir_blanco) p.push('A cada placa se le restó el promedio de sus propios pocillos de medio sin inocular, y las lecturas hechas sobre diluciones se multiplicaron por su factor de dilución.')
    // atípicos: los criterios que realmente se aplicaron (en placas por tiempo, el control de cada placa)
    const out = []
    const nomAtip = (m, conf, cv) => (m === 'cv' ? `la desviación estándar relativa entre réplicas (límite ${cv} %)` : m === 'grubbs' ? `el test de Grubbs entre réplicas (${conf} % de confianza)` : `el test Q de Dixon entre réplicas (${conf} % de confianza; Rorabacher, 1991)`)
    if (exp.origenOd === 'placas') out.push(`${nomAtip(aj.pl_metodo || 'q', aj.pl_conf || 95, aj.pl_cvmax ?? 20)} de cada cepa en cada placa, después de evaluar del mismo modo los pocillos de blanco`)
    else {
      if (aj.hampel_on) out.push(`un filtro de Hampel dentro de cada curva (ventana de ${2 * aj.hampel_k + 1} puntos, umbral ${aj.hampel_sigma} × MAD escalada, diferencia mínima ${aj.hampel_min} OD)`)
      if (aj.dixon_on) out.push(exp.origenOd === 'tecan' ? `${nomAtip(aj.od_atip_metodo || 'q', aj.dixon_conf || 95, aj.od_cvmax ?? 20)} aplicado al área bajo la curva de las réplicas de cada cepa (se evalúa cada réplica completa, no puntos sueltos)` : `${nomAtip(aj.od_atip_metodo || 'q', aj.dixon_conf || 95, aj.od_cvmax ?? 20)} en cada tiempo`)
      if (aj.odmax_on) out.push(`la exclusión de lecturas mayores a ${aj.odmax} OD`)
    }
    const entreRep = exp.origenOd === 'placas' || aj.dixon_on
    const autoAtip = exp.origenOd === 'placas' ? aj.pl_auto === true : aj.od_atip_auto === true
    if (out.length) p.push(`Los valores aberrantes se identificaron con ${out.join(' y ')}${entreRep ? (autoAtip ? '; los sospechosos entre réplicas se excluyeron automáticamente' : '; los sospechosos entre réplicas solo se marcaron y la decisión de excluirlos fue manual') : ''}.`)
    p.push(`La velocidad específica máxima de crecimiento (μmax) se estimó como la mayor pendiente de ln(OD) contra el tiempo en ventanas deslizantes de ${op.ancho} h (mínimo ${op.minpts} puntos, R² ≥ ${op.r2min}, OD ≥ ${op.lnmin}); el tiempo de duplicación como ln 2/μmax, y la fase de latencia como ${op.lag_metodo === 'umbral' ? `el tiempo en que la OD supera ${op.lag_factor} veces la OD₀` : 'la intersección de la tangente en μmax con ln(OD₀)'}${op.od0_metodo === 'auto' ? ', con OD₀ estimada mediante un modelo de tres fases (Buchanan et al., 1997)' : ''}. La OD máxima (K) se tomó sobre la curva suavizada con mediana móvil de 3 puntos y el área bajo la curva se calculó por la regla del trapecio.`)
    const nVent = Object.keys(exp.E?.ventanas || {}).length
    if (nVent) p.push(`En ${nVent} curva${nVent > 1 ? 's' : ''} la ventana de μmax se eligió manualmente.`)
    if (op.spline) p.push('Como control, μmax se comparó con el máximo de la derivada de un spline cúbico de suavizado ajustado a ln(OD).')
    const graf = [aj.suavizado && aj.suavizado !== 'ninguno' && 'el suavizado', aj.normalizar && aj.normalizar !== 'ninguna' && 'la normalización por la OD inicial'].filter(Boolean)
    if (exp.origenOd !== 'placas' && graf.length) { const t = graf.join(' y '); p.push(`${t[0].toUpperCase()}${t.slice(1)} se usaron solo para los gráficos; todos los parámetros se calcularon con la OD corregida, sin suavizar ni normalizar.`) }
    p.push(s.porCepa
      ? `Como cada placa corresponde a un tiempo, para cada cepa se construyó una curva con ${s.modoCurva === 'puntos' ? 'todos sus pocillos de cada tiempo' : 'la media de sus pocillos en cada tiempo'}; μmax se informa ± el error estándar de la pendiente de la regresión.`
      : 'Los resultados se expresan como media ± desviación estándar de las réplicas técnicas (pocillos de un mismo experimento); los intervalos de confianza del 95 % usan la distribución t de Student con n − 1 grados de libertad, y el tiempo de duplicación de cada cepa se calculó con la μmax media.')
  }
  if (exp.tipo !== 'od') {
    p.push(`Las células viables se cuantificaron por recuento en placa de diluciones seriadas (${exp.ufc.toma} µL transferidos a ${exp.ufc.diluyente} µL de diluyente, factor ${Number(Number(exp.ufc.factor).toPrecision(4))} por paso${Object.keys(exp.ufc.pasos || {}).length ? ', con algunos pasos de volúmenes distintos' : ''}; ${exp.ufc.primero === 'dilucion' ? 'la primera columna ya correspondía a la primera dilución' : 'la primera columna fue la suspensión sin diluir'}; ${exp.ufc.vol} µL sembrados). Se consideraron contables las placas con ${exp.ufc.min} a ${exp.ufc.max} colonias${exp.ufc.estimados !== false ? ' (los recuentos fuera de ese rango se usaron como estimaciones)' : ''}; para cada cepa y tiempo se usó una sola dilución, la misma para todas sus réplicas (la que tenía más réplicas dentro del rango contable, salvo que se eligiera otra a mano) y UFC/mL = C · D / V. ${exp.aj.ufc_centro === 'geo' ? `La concentración de cada cepa y tiempo se calculó como la media geométrica de las réplicas: para cada réplica UFC/mL = C · D / V, se promediaron los log₁₀ y se volvió a la escala original (10^media); la variabilidad se expresó como ${{ sem: 'el error estándar de la media', ic95: 'el intervalo de confianza del 95 % (t de Student con n − 1 grados de libertad)' }[exp.aj.ufc_err] || 'la desviación estándar'} de los log₁₀ de las réplicas` : `La incertidumbre de cada valor se expresó como intervalo de confianza del 95 % en escala log₁₀, 10^(log₁₀ N ± 2·u_c), con u_c² = u_poisson² + u_oper², siguiendo el enfoque de la norma ISO 19036 (u_poisson = 1/(ln 10·√C); u_oper = el mayor entre ${uOperUfc(exp.aj)} log₁₀ y la variación observada entre réplicas por encima de la de Poisson). La concentración de cada cepa y tiempo se calculó sumando las colonias de las réplicas y dividiendo por la suma de los volúmenes de suspensión original sembrados (estimador de máxima verosimilitud para réplicas técnicas de una misma suspensión)`}${exp.aj.ufc_dixon_on !== false ? (exp.aj.ufc_atip_metodo === 'cv' ? `; se marcaron los valores atípicos por la desviación estándar relativa (límite ${exp.aj.ufc_cvmax ?? 20} %)` : exp.aj.ufc_atip_metodo === 'grubbs' ? '; se marcaron los valores atípicos con el test de Grubbs sobre log₁₀ UFC/mL' : '; se marcaron los valores atípicos con el test Q de Dixon sobre log₁₀ UFC/mL') + (exp.aj.ufc_auto === true ? ' y se excluyeron del promedio' : ' sin excluirlos automáticamente') : ''}. La velocidad de crecimiento se estimó con un modelo ${{ lineal: 'lineal', baranyi: `de Baranyi y Roberts (curvatura m = ${exp.aj.ufc_mcurv ?? 1})`, bifasico: 'bifásico sin asíntota' }[exp.aj.ufc_modelo || 'baranyi']} ajustado por mínimos cuadrados a ln(UFC/mL) de todos los puntos, como en DMFit (ComBase).`)
  }
  if (exp.tipo === 'odufc') {
    // la calibración con el modelo y la selección de pares elegidos en «OD ↔ UFC»
    const mc = exp.opciones?.['combinado.modelo'] || 'clasico', soloExp = exp.opciones?.['combinado.soloExp'] !== false
    const desc = { clasico: 'una regresión lineal de log₁₀ UFC/mL sobre la OD', lineal: 'una regresión lineal de UFC/mL sobre la OD', proporcional: 'una recta por el origen (UFC/mL = b·OD)', potencia: 'una regresión lineal de log₁₀ UFC/mL sobre log₁₀ OD' }[mc] || 'una regresión por mínimos cuadrados'
    p.push(`La relación entre OD y UFC/mL se describió con ${desc}, por mínimos cuadrados, emparejando cada recuento con la OD media (corregida por el blanco, sin suavizar) de la misma cepa en el mismo tiempo (interpolación lineal cuando no hubo lectura simultánea)${soloExp ? `; solo se usaron los pares de la fase exponencial, en la que la velocidad del modelo ajustado a los recuentos es al menos el ${Math.round((exp.aj.ufc_frac_exp ?? 0.5) * 100)} % de la máxima` : ''}. Las velocidades por OD y por recuento se compararon de forma descriptiva (cociente μ OD / μ recuento).`)
  }
  // coma decimal, como el resto del programa (los ajustes se guardan como números: 0.98 → 0,98)
  return p.join(' ').replace(/(\d)\.(\d)/g, '$1,$2')
}

export function Metodos({ s }) {
  const { exp, res, ufcRes, serie } = s
  const aj = exp.aj
  const op = opAnalisis(serie.aj || aj)
  const od = exp.tipo !== 'ufc', ufc = exp.tipo !== 'od'
  const texto = useMemo(() => textoPublicacion(s), [exp]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef()
  // ejemplo con los datos del experimento: la réplica con mejor R²
  const ej = res?.filter((r) => finito(r.mu_max)).sort((a, b) => b.r2 - a.r2)[0]
  const ejU = ufcRes?.reps?.find((r) => r._estado === 'ok' && r._usados?.length > 1) || ufcRes?.reps?.find((r) => r._estado === 'ok')
  const ejG = ufcRes?.res?.find((r) => r._pool?.length > 1 && Number.isFinite(r.UFC_mL)) || ufcRes?.res?.find((r) => r._pool?.length && Number.isFinite(r.UFC_mL))
  const crecU = ufcRes?.hay ? crecimientoPorCepa(ufcRes, exp.aj).find((x) => x.c.ok && finito(x.c.mu)) : null

  const indice = [
    ['flujo', 'Resumen del procesamiento'],
    od && ['od', 'Densidad óptica: fundamento'],
    od && ['origen', 'Lectura de los datos'],
    od && exp.origenOd === 'tecan' && ['blanco', 'Corrección por blanco'],
    od && exp.origenOd !== 'cubeta' && ['camino', 'Camino óptico'],
    od && ['atipicos', 'Puntos aberrantes'],
    od && ['qc', 'Control de calidad de las réplicas'],
    od && ['procesado', 'Suavizado y normalización'],
    od && ['param', 'Parámetros de crecimiento'],
    od && ['modelos', 'Modelos de crecimiento (para comparar)'],
    od && ['replicas', 'Resumen entre réplicas'],
    ufc && ['ufc', 'Recuento de UFC/mL'],
    ufc && ['ufcqc', 'Control de calidad de los recuentos'],
    ufc && ['ufccrec', 'Crecimiento por recuento'],
    exp.tipo === 'odufc' && ['comb', 'Combinación de OD y UFC'],
    ['numeros', 'Qué datos usa cada número'],
    ['criterio', 'Interpretación y limitaciones'],
    ['texto', 'Texto para el informe'],
    ['refs', 'Referencias'],
  ].filter(Boolean)
  const H = ({ id, children }) => <h2 id={id}>{indice.findIndex((x) => x[0] === id) + 1}. {children}</h2>

  return (
    <div className="pagina">
      <Encabezado titulo="Métodos" sub={`Cómo se calculó cada resultado de «${exp.nombre}» (${TIPOS[exp.tipo].titulo}${exp.origenOd ? ' · ' + ORIGENES[exp.origenOd].titulo : ''}), con las fórmulas, su justificación y los valores de los ajustes que están activos ahora.`}>
      </Encabezado>
      <Cinta>
        <Grupo titulo="Exportar">
          <BotonCinta icono="bajar" texto="Descargar texto" onClick={() => descargarTexto(ref.current.innerText, `Metodos - ${exp.nombre}.txt`)} />
          <BotonCinta icono="copiar" texto="Copiar texto del informe" onClick={() => navigator.clipboard?.writeText(texto).then(() => s.avisar('Texto para el informe copiado.'))} />
          <BotonCinta icono="imprimir" texto="Imprimir / PDF" onClick={() => window.print()} />
        </Grupo>
      </Cinta>
      <div className="tarjeta metodos" ref={ref}>
        <h3 style={{ marginTop: 0 }}>Contenido</h3>
        <ol className="indice">{indice.map(([id, t]) => <li key={id}><a href={'#' + id} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }}>{t}</a></li>)}</ol>

        <H id="flujo">Resumen del procesamiento</H>
        <p>Todo el cálculo ocurre en el navegador. Los datos originales <b>nunca se modifican</b>: cada paso trabaja sobre una copia y cualquier exclusión se puede revertir. El orden es fijo:</p>
        <ol>
          {od && <li><b>Lectura</b> de la absorbancia ({exp.origenOd === 'tecan' ? 'Excel del lector con una curva por pocillo' : exp.origenOd === 'placas' ? 'un Excel por placa y por tiempo' : 'carga manual de la cubeta'}).</li>}
          {od && <li><b>Blanco y dilución</b>: se resta la absorbancia del medio sin inocular y, si la lectura se hizo sobre una dilución, se multiplica por su factor.</li>}
          {od && <li><b>Puntos aberrantes</b>: filtros automáticos (Hampel{aj.dixon_on ? ', Dixon' : ''}{aj.odmax_on ? ', OD máxima' : ''}) y exclusiones manuales.</li>}
          {od && <li><b>Control de calidad de réplicas</b>: cada réplica se compara con las demás de su cepa.</li>}
          {od && <li><b>Suavizado y normalización</b> (opcionales): solo cambian los gráficos; los parámetros se calculan siempre con la OD corregida, sin suavizar ni normalizar.</li>}
          {od && <li><b>Parámetros</b> de cada réplica (μmax, td, lag, K, AUC, …) y <b>resumen</b> por cepa (media ± DE, IC 95 %).</li>}
          {ufc && <li><b>Recuento</b>: UFC/mL de cada réplica con su IC 95 % (ISO 19036), control de réplicas atípicas, promedio por tiempo (suma de colonias / suma de volúmenes) y velocidad de crecimiento.</li>}
          {exp.tipo === 'odufc' && <li><b>Combinación</b>: comparación de μ por OD y por recuento («OD ↔ UFC») y calibración OD ↔ UFC con los pares de la misma cepa y tiempo.</li>}
        </ol>
        <p>Cada número calculado se puede tocar en el programa: abre una ficha «Cómo se calculó» con la fórmula, la cuenta con tus datos y un esquema. Esta sección reúne las mismas fórmulas y su justificación.</p>

        {od && (<>
          <H id="od">Densidad óptica: fundamento</H>
          <p>Una suspensión bacteriana dispersa la luz. La fracción de luz que llega al detector se expresa como <b>absorbancia</b> (densidad óptica, OD):</p>
          <Fm nota="I₀: intensidad que entra; I: intensidad que llega al detector.">OD = log₁₀ (I₀ / I)</Fm>
          <p>Para suspensiones diluidas la OD es aproximadamente proporcional a la concentración de células (ley de Beer–Lambert aplicada a la dispersión): <b>OD = ε · ℓ · c</b>, con ℓ el camino óptico y c la concentración. Esa proporcionalidad es lo que permite usar la OD como medida de biomasa, y tiene dos consecuencias prácticas que justifican varios pasos del análisis:</p>
          <ul>
            <li><b>Hay que restar el blanco</b>: el medio y el plástico también absorben. La OD de las células es OD<sub>medida</sub> − OD<sub>blanco</sub>.</li>
            <li><b>Solo vale en la zona lineal</b>. Con muchas células, la luz se dispersa varias veces y la OD crece menos que la concentración (en lectores de placa, por encima de ≈ 1; en cubeta, el rango depende del equipo). Por eso se puede limitar la OD máxima confiable y por eso, en cubeta y en placas leídas por tiempo, se diluye la muestra y se corrige por el factor de dilución.</li>
          </ul>
          <p>Si la OD es proporcional al número de células N, cualquier relación entre logaritmos se conserva: ln OD = ln N + constante. Por eso la <b>pendiente</b> de ln(OD) contra el tiempo es igual a la de ln N, aunque la constante de proporcionalidad sea desconocida. Esto vale para μmax, el tiempo de duplicación y el lag, pero no para K, que sí depende del equipo.</p>

          <H id="origen">Lectura de los datos</H>
          {exp.origenOd === 'tecan' && (<>
            <p>El Excel del lector se lee en cualquiera de los formatos habituales de exportación (.xlsx, .xls antiguo, .xlsm, .xlsb y LibreOffice .ods). Se reconocen tres disposiciones:</p>
            <ul>
              <li>Fila «Time [s]» en la columna A con los tiempos y, debajo, una fila por pocillo (A1…H12). Es la exportación estándar del Tecan i-control.</li>
              <li>Una fila de encabezado con los pocillos A1…H12 y una columna de tiempo.</li>
              <li>Bloques «T = tiempo» seguidos de la matriz A–H × 1–12.</li>
            </ul>
            <p>Los tiempos se convierten a segundos según la unidad del encabezado («[s]», «[min]», «(h)») o, si se eligió, según la unidad indicada; también se aceptan horas en formato hh:mm:ss. Cada pocillo pasa a ser una serie (t, OD). Si un par (pocillo, tiempo) aparece repetido se conserva el primero. En los gráficos y parámetros el tiempo se expresa en horas.</p>
          </>)}
          {exp.origenOd === 'placas' && (<>
            <p>Cada lectura es una placa de 96 pocillos en un tiempo t. De cada Excel se toma la primera matriz de 8 filas consecutivas A–H con al menos 8 valores numéricos (formato del programa de biofilm). Si la fila anterior tiene los números de columna, se usan para ubicar cada valor.</p>
            <p>Cada placa es una <b>fotografía de un instante</b>: el pocillo A3 de t = 0 h no es el mismo cultivo que el A3 de t = 2 h, así que un pocillo no forma una curva. En cada placa, cada pocillo tiene una cepa, puede ser blanco y puede tener un <b>factor de dilución</b> f (1 si se leyó sin diluir). La OD corregida de un pocillo es:</p>
            <Fm nota="B(t): promedio de los pocillos de blanco de la placa del tiempo t. f: factor de dilución del pocillo.">OD<sub>corr</sub>(t) = [ L(t) − B(t) ] × f</Fm>
            <p>El blanco se resta antes de multiplicar porque el medio está presente en la cubeta o pocillo leído, no en la muestra original: lo que se diluyó fueron las células. Si se indicó que una placa usa el <b>valor del blanco de otra placa</b> (por ejemplo, cuando el blanco se leyó solo en t = 0), B(t) es el promedio de los pocillos de blanco de esa otra placa; esto supone que la absorbancia del medio no cambia con el tiempo. Si una placa no tiene pocillos de blanco ni toma el de otra, se usa el promedio de los blancos de las demás placas (y se avisa); si ninguna tiene, no se resta nada. Restar blanco: <Act on={aj.corregir_blanco} />.</p>
            <Ej>Lectura 0,412 sobre una dilución 1:10, blanco de esa placa 0,082: OD = (0,412 − 0,082) × 10 = 3,30.</Ej>
            <p><b>Curva de cada cepa.</b> Con los n<sub>t</sub> pocillos de la cepa que quedaron en el análisis en cada tiempo t (después del control de calidad), la curva se arma de una de dos formas <Act on txt={s.modoCurva === 'puntos' ? 'sin promediar' : 'promediada'} />:</p>
            <ul>
              <li><b>Promediada</b>: un punto por tiempo, <code>ȳ(t) = (1/n<sub>t</sub>) Σ OD<sub>i</sub>(t)</code>. Todos los parámetros se calculan sobre esa curva media. Es lo más estable cuando hay pocas réplicas.</li>
              <li><b>Sin promediar</b>: todos los pocillos entran como puntos (varios por tiempo). La regresión de ln(OD) que da μmax usa todos los puntos de la ventana, de modo que su error estándar refleja la dispersión real entre pocillos. OD₀ y el lag salen de esa misma regresión. K, el AUC, los tiempos hasta un umbral y dOD/dt necesitan un único valor por tiempo, y se toman de la curva media.</li>
            </ul>
            <p>Como los pocillos de distintos tiempos son independientes, en este modo no se suaviza, no se normaliza y no se compara cada «pocillo» con sus réplicas como si fuera una curva: el control de calidad se hace <b>dentro de cada tiempo</b>, comparando las réplicas de la cepa en esa placa.</p>
            <p><b>Control de calidad de cada placa</b> <Act on txt={`${{ q: 'Dixon', grubbs: 'Grubbs', cv: `CV > ${aj.pl_cvmax ?? 20} %` }[aj.pl_metodo || 'q']}${(aj.pl_metodo || 'q') !== 'cv' ? `, ${aj.pl_conf || 95} %` : ''}${aj.pl_auto !== false ? ', exclusión automática' : ', solo marca'}`} />. En cada placa, primero se evalúan los pocillos de blanco entre sí y <code>B(t)</code> es la media de los blancos <b>aceptados</b>; después se corrige cada lectura con ese B(t) y se evalúan los pocillos de cada cepa entre sí. Se puede elegir entre tres criterios (los tres miran un solo pocillo por grupo, el más alejado, y necesitan al menos 3 pocillos):</p>
            <ul>
              <li><b>Test Q de Dixon</b> (3 a 10 pocillos) y <b>test de Grubbs</b> (3 o más): ver la sección de puntos aberrantes.</li>
              <li><b>Coeficiente de variación</b>: <code>CV = 100 · s / |x̄|</code>; si supera el límite, se marca el pocillo más alejado de la media. Es un criterio práctico (no un test de hipótesis): útil cuando hay pocas réplicas y se sabe qué variación es aceptable para el método.</li>
            </ul>
            <p>Un pocillo marcado queda <b>sospechoso</b>; se excluye solo si está activada la exclusión automática. Con un clic se puede excluir cualquier pocillo, reincorporar uno excluido o conservar un sospechoso: lo decidido a mano tiene prioridad sobre el test. Un pocillo excluido a mano no entra en el test de su grupo ni en las medias; si es un blanco, deja de contarse en B(t).</p>
          </>)}
          {exp.origenOd === 'cubeta' && (<>
            <p>Cada fila es una cepa, una réplica y un tiempo, con la lectura sin diluir y, si hizo falta, la de sus diluciones con factor f = {exp.manual.factor} (columnas −1, −2, …). Para cada lectura k:</p>
            <Fm nota={`B = ${exp.manual.yaCorregido ? '0 (el equipo ya restó el blanco)' : exp.manual.blanco}: OD del medio estéril. k: número de diluciones.`}>OD<sub>neta,k</sub> = L<sub>k</sub> − B ;  OD<sub>k</sub> = OD<sub>neta,k</sub> × f<sup>k</sup></Fm>
            <p>Solo se usan las lecturas cuya OD neta cae dentro de la <b>ventana lineal</b> del equipo ({exp.manual.vmin} a {exp.manual.vmax}). Si hay varias, se promedian (todas estiman la misma concentración original). Si ninguna cae dentro, se usa la más cercana al centro de la ventana y la fila se marca «fuera de la ventana». Las lecturas con OD neta ≤ 0 se descartan.</p>
            <Ej>Lectura sin diluir 1,45 (fuera de la ventana), lectura 1:10 = 0,192, blanco 0,045: OD = (0,192 − 0,045) × 10¹ = 1,47.</Ej>
            <p>Las filas de una misma cepa y réplica forman una curva (si hay dos lecturas en el mismo tiempo se promedian) que se analiza igual que una curva de placa.</p>
          </>)}

          {exp.origenOd === 'tecan' && (<>
            <H id="blanco">Corrección por blanco <Act on={aj.corregir_blanco} txt={aj.blanco_metodo === 'tiempo' ? 'tiempo a tiempo' : aj.blanco_metodo === 'const_media' ? 'media constante' : 'mínimo constante'} /></H>
            <p>Los pocillos de blanco tienen medio sin inocular. Con j = 1…m pocillos de blanco elegidos (sin los excluidos):</p>
            <ul>
              <li><b>Tiempo a tiempo</b> (recomendado): <code>B(t) = (1/m) Σ OD<sub>j</sub>(t)</code> y <code>OD<sub>corr</sub>(t) = OD(t) − B(t)</code>. Corrige también la deriva del medio (precipitación, evaporación, condensación en la tapa).</li>
              <li><b>Constante, media</b>: <code>B = media de B(t) en todo el ensayo</code>.</li>
              <li><b>Constante, mínimo</b>: <code>B = mín B(t)</code>; conserva más señal si el blanco sube con el tiempo por un artefacto.</li>
            </ul>
            <p>Si en un tiempo no hay lectura válida de blanco, ese tiempo se descarta en todos los pocillos para no restar un valor inventado.</p>
          </>)}

          {exp.origenOd !== 'cubeta' && (() => { const c = caminoOptico(aj, true); return (<>
            <H id="camino">Camino óptico <Act on={!!aj.camino_on} txt={aj.camino_on ? `a 1 cm, ${aj.pocillo_vol} µL` : undefined} /></H>
            <p>Por la ley de Beer–Lambert la absorbancia es proporcional al camino que recorre la luz: <code>A = ε · c · l</code>. En una cubeta l = 1 cm. En un lector de placas el haz pasa de abajo hacia arriba y atraviesa la altura del líquido, que depende del volumen y del diámetro del pocillo:</p>
            <Fm nota={c ? `Aquí: V = ${aj.pocillo_vol} µL = ${fx(aj.pocillo_vol / 1000, 3)} cm³, d = ${String(aj.pocillo_diam).replace(".", ",")} mm → área = ${fx(c.area, 4)} cm², l = ${fx(c.l, 3)} cm, factor = ${fx(c.f, 3)}.` : undefined}>l = V / (π · d² / 4)  ;  OD<sub>1 cm</sub> = OD<sub>pocillo</sub> × (1 cm / l)</Fm>
            <p>La corrección se aplica después de restar el blanco y de multiplicar por la dilución: OD = [L − B] × f × (1/l). Como es una constante que multiplica todas las lecturas, <b>no cambia μmax, el tiempo de duplicación ni el lag</b> (la pendiente de ln OD no depende de un factor constante: ln(k·OD) = ln k + ln OD). Sí cambia todo lo que está en unidades de OD: OD₀, K, ΔOD, AUC, el tiempo hasta la OD umbral y la calibración OD ↔ UFC/mL. Por eso hace falta para comparar con lecturas en cubeta, con otros experimentos o entre placas con volúmenes distintos; dentro de un mismo experimento con el mismo volumen en todos los pocillos las comparaciones entre cepas no cambian.</p>
            <p>Limitaciones: el menisco curva la superficie (el camino real es algo distinto en el centro del pocillo), la evaporación reduce el volumen en lecturas largas, y la turbidez bacteriana es dispersión de luz, no absorción, así que la proporcionalidad con l vale solo en el rango lineal (OD baja). Algunos lectores corrigen el camino midiendo la banda del agua a 900–977 nm; si el lector ya lo hizo, no hay que activar esta corrección.</p>
            <Ej>200 µL en un pocillo de 6,4 mm: área = π · 0,32² = 0,322 cm², l = 0,2 / 0,322 = 0,62 cm; una OD de 0,30 equivale a 0,30 / 0,62 = 0,48 a 1 cm.</Ej>
          </>) })()}

          <H id="atipicos">Puntos aberrantes</H>
          <p>Un punto aberrante es una lectura que no representa al cultivo: una burbuja, una gota en la tapa, un pipeteo errado. Se usan dos criterios complementarios, uno <b>dentro</b> de cada curva y otro <b>entre</b> réplicas. Ningún punto se borra: queda marcado con ✕, se puede reincorporar con un clic y el motivo se informa en la tabla de puntos excluidos.</p>
          <h4>Filtro de Hampel (dentro de cada curva) <Act on={aj.hampel_on} txt={`semiventana k = ${aj.hampel_k}, umbral ${aj.hampel_sigma} × MAD, mínimo ${aj.hampel_min} OD, ${aj.hampel_accion === 'interpolar' ? 'interpolar' : 'excluir'}`} /></h4>
          <p>Para cada punto yᵢ se toma la ventana de k puntos a cada lado (2k + 1 puntos) y se calcula. Cerca de los extremos la ventana se acorta <b>de forma simétrica</b> (igual cantidad de lecturas a cada lado), porque en una curva creciente una ventana cortada de un solo lado sesga la mediana y marcaría como aberrantes las últimas lecturas buenas; la primera y la última lectura no se evalúan:</p>
          <Fm nota="La mediana y la MAD no se dejan arrastrar por el propio valor extremo, a diferencia de la media y la desviación estándar.">
            mᵢ = mediana(y<sub>i−k</sub> … y<sub>i+k</sub>) ;  MADᵢ = mediana |y<sub>j</sub> − mᵢ| ;  Sᵢ = 1,4826 · MADᵢ
          </Fm>
          <p>El factor 1,4826 = 1/Φ⁻¹(0,75) hace que S estime la desviación estándar cuando los datos son normales (en una normal, la mitad de los desvíos absolutos es menor que 0,6745 σ). El punto se marca si</p>
          <Fm nota={`n = ${aj.hampel_sigma} (umbral); δ = ${aj.hampel_min} OD (diferencia mínima).`}>|yᵢ − mᵢ| &gt; máx( n · Sᵢ ; δ )</Fm>
          <p>La diferencia mínima δ evita marcar desvíos minúsculos cuando la curva es tan lisa que la MAD es casi 0. Con «interpolar», el valor marcado se reemplaza por la interpolación lineal entre sus vecinos válidos (y se conserva el original en las tablas).</p>
          <Ej>Lecturas consecutivas 0,10 · 0,11 · <b>0,50</b> · 0,12 · 0,11 · 0,12 · 0,13 (k = 3, punto central 0,50). Mediana = 0,12; desvíos 0,02 · 0,01 · 0,38 · 0 · 0,01 · 0 · 0,01 → MAD = 0,01; S = 0,0148; umbral = máx(3 × 0,0148; 0,002) = 0,0445. Como |0,50 − 0,12| = 0,38 &gt; 0,0445, el punto se marca.</Ej>
          <h4>Entre réplicas: test Q de Dixon, Grubbs o CV <Act on={aj.dixon_on} txt={`${{ q: 'Dixon', grubbs: 'Grubbs', cv: 'CV %' }[aj.od_atip_metodo || 'q']}, ${(aj.od_atip_metodo || 'q') !== 'cv' ? `${aj.dixon_conf} %` : `límite ${aj.od_cvmax ?? 20} %`}${aj.od_atip_auto === true ? ', exclusión automática' : ', solo marca'}`} /></h4>
          <p>Por defecto lo sospechoso solo se <b>marca</b> y sigue en el análisis, igual que en los recuentos: decidís con un clic si lo excluís. Con «Excluir» sale solo (y se puede reincorporar). <b>En cinéticas (Tecan)</b> el test no mira puntos sueltos: compara el <b>área bajo la curva</b> de las réplicas de cada cepa (hacen falta 3 o más) y marca la réplica entera; los puntos sueltos de cada curva los evalúa el filtro de Hampel. <b>En placas por tiempo y cubeta</b>, cada tiempo es una muestra distinta y el test compara las réplicas de cada tiempo.</p>
          <p>En cada tiempo se ordenan las n réplicas de una cepa (3 ≤ n ≤ 10): x₍₁₎ ≤ … ≤ x₍ₙ₎. Se calcula el cociente del extremo más alejado (estadístico r₁₀):</p>
          <Fm nota="Se evalúa el extremo con mayor Q. El punto se marca si Q supera el valor crítico de la tabla para n y la confianza elegida.">Q<sub>sup</sub> = (x₍ₙ₎ − x₍ₙ₋₁₎) / (x₍ₙ₎ − x₍₁₎) ;  Q<sub>inf</sub> = (x₍₂₎ − x₍₁₎) / (x₍ₙ₎ − x₍₁₎)</Fm>
          <p>Q compara el «salto» del valor sospechoso con el rango total: si una réplica está mucho más lejos de la siguiente que lo que se dispersan todas, es improbable que provenga de la misma distribución. Valores críticos (Rorabacher, 1991, prueba de dos colas):</p>
          <div className="tabla-scroll" style={{ maxHeight: 'none', marginBottom: 12 }}><table className="tabla">
            <thead><tr><th>n</th>{[3, 4, 5, 6, 7, 8, 9, 10].map((k) => <th key={k} className="num">{k}</th>)}</tr></thead>
            <tbody>{[90, 95, 99].map((c) => <tr key={c} style={c === Number(aj.dixon_conf) ? { fontWeight: 600 } : undefined}><td>{c} %</td>{Q[c].map((v, i) => <td key={i} className="num">{fx(v, 3)}</td>)}</tr>)}</tbody>
          </table></div>
          <Ej>Tres réplicas a las 4 h: 0,210 · 0,215 · 0,290. Q<sub>sup</sub> = (0,290 − 0,215)/(0,290 − 0,210) = 0,9375 &lt; 0,970 (95 %, n = 3): no se marca. Con cuatro réplicas 0,210 · 0,212 · 0,215 · 0,290, Q = 0,075/0,080 = 0,9375 &gt; 0,829: se marca 0,290.</Ej>
          <p><b>Más de 10 réplicas: test de Grubbs.</b> Dixon solo tiene valores críticos tabulados hasta n = 10. Con más réplicas se usa el test de Grubbs (dos colas), que compara el valor más alejado de la media con la desviación estándar:</p>
          <Fm nota="t: cuantil 1 − α/(2n) de la t de Student con n − 2 grados de libertad; α = 1 − confianza. Ejemplo: n = 12 al 95 % → G crítico = 2,412.">G = máx |xᵢ − x̄| / s ;  G<sub>crít</sub> = (n − 1)/√n · √[ t² / (n − 2 + t²) ]</Fm>
          <p>Con solo dos réplicas el test no se aplica (no hay forma de saber cuál está mal). Dixon es más apropiado que Hampel cuando cada curva tiene pocos puntos (placas por tiempo, cubeta); Hampel, cuando hay muchas lecturas por curva (cinéticas).</p>
          <h4>OD máxima confiable <Act on={aj.odmax_on} txt={`${aj.odmax} OD`} /></h4>
          <p>Las lecturas mayores que el máximo elegido se excluyen porque, fuera de la zona lineal, la OD subestima la biomasa. Aunque no se active, el control de calidad cuenta cuántos puntos lo superan.</p>

          <H id="qc">Control de calidad de las réplicas</H>
          <p>Cada réplica se compara con las otras réplicas de su cepa (sin blancos ni réplicas excluidas a mano), usando los puntos que quedaron después de los filtros:</p>
          <ul>
            <li><b>Con 3 o más réplicas</b>. En cada tiempo t se calcula la mediana de las réplicas M(t) y, para cada réplica r, su desvío medio <code>d<sub>r</sub> = media<sub>t</sub> |y<sub>r</sub>(t) − M(t)|</code>. La referencia es la mediana de los desvíos de las <i>otras</i> réplicas, d<sub>ref</sub>. La réplica es <b>Sospechosa</b> si <code>d<sub>r</sub> &gt; {aj.pocillo_factor} × d<sub>ref</sub></code> y además <code>d<sub>r</sub> &gt; {aj.pocillo_min} OD</code>. Usar medianas hace que una réplica mala no «contamine» la referencia con la que se la juzga.</li>
            <li><b>Con 2 réplicas</b> solo se puede saber que difieren, no cuál falla. Se compara el área bajo la curva: <code>|AUC₁ − AUC₂| / media(AUC₁, AUC₂) × 100</code>; si supera {aj.pocillo_div} % se marcan «Divergentes».</li>
            <li><b>Ruidosa</b>: 10 % o más de sus puntos marcados por los filtros.</li>
          </ul>
          <p>Las réplicas sospechosas {aj.pocillo_auto ? <b>se excluyen automáticamente</b> : 'quedan señaladas y la decisión de excluirlas es manual'} <Act on={aj.pocillo_auto} txt="exclusión automática" />.</p>

          <H id="procesado">Suavizado y normalización</H>
          <ul>
            <li><b>Media o mediana móvil</b> de k puntos (impar): cada valor se reemplaza por la media (o la mediana) de él y sus (k − 1)/2 vecinos a cada lado. La mediana resiste mejor los picos aislados. <Act on={aj.suavizado === 'media' || aj.suavizado === 'mediana'} txt={`${aj.suavizado}, k = ${aj.suav_k}`} /></li>
            <li><b>LOESS</b>: en cada tiempo t₀ se ajusta una recta por mínimos cuadrados ponderados con los q = span × n puntos más cercanos, con pesos tricúbicos <code>w = (1 − (|t − t₀|/h)³)³</code>, siendo h la distancia al q-ésimo vecino. El valor suavizado es la recta evaluada en t₀. <Act on={aj.suavizado === 'loess'} txt={`span = ${aj.suav_span}`} /></li>
            <li><b>Normalización</b>: con OD₀ = media de los primeros {aj.n_od0} puntos, «restar» usa y − OD₀ y «dividir» usa y / OD₀ (veces el inóculo). <Act on={aj.normalizar !== 'ninguna'} txt={aj.normalizar} /></li>
          </ul>
          <p>El suavizado reduce el ruido pero también aplana los cambios bruscos; μmax ya promedia sobre una ventana, así que en cinéticas densas no suele hacer falta.</p>
          <p><b>Solo para los gráficos.</b> Los parámetros se calculan siempre con la OD corregida, sin suavizar ni normalizar. Restar OD₀ cambia la pendiente de ln(OD), porque ln(N − N₀) no es ln N + constante (en una curva de prueba, μmax salía entre 27 y 48 % más alta); suavizar hace que los puntos dejen de ser independientes y el error estándar de μmax sale artificialmente chico (unas 3 veces menor con una media móvil de 5). Dividir por OD₀ no cambia μ ni el lag, pero K, ΔOD y el AUC pasarían a ser «veces el inóculo».</p>

          <H id="param">Parámetros de crecimiento</H>
          <h4>Por qué se trabaja con ln(OD)</h4>
          <p>En fase exponencial cada célula se divide a ritmo constante: <code>dN/dt = μ N</code>. Integrando, <code>N(t) = N₀ · e<sup>μ(t − t₀)</sup></code>, y tomando logaritmo natural:</p>
          <Fm nota="Una recta en el tiempo: la pendiente es la velocidad específica de crecimiento μ (h⁻¹).">ln N(t) = ln N₀ + μ · (t − t₀)</Fm>
          <p>Como OD ∝ N, la misma recta aparece en ln(OD). Por eso la fase exponencial se identifica como el tramo donde ln(OD) es más recto y empinado. Solo se usan puntos con OD ≥ {op.lnmin}: cerca del blanco el logaritmo amplifica el ruido (ln 0,005 − ln 0,010 = −0,69 por un error de 0,005 OD).</p>
          <h4>μmax: ventana deslizante</h4>
          <p>Para cada punto de inicio tᵢ se toman todos los puntos con t en [tᵢ, tᵢ + {op.ancho} h] (mínimo {op.minpts}) y se ajusta por mínimos cuadrados <code>ln OD = a + μ·t</code>:</p>
          <Fm nota="Fórmulas de la regresión lineal simple; t̄ y ȳ son las medias de la ventana.">μ = Σ(t − t̄)(y − ȳ) / Σ(t − t̄)² ;  a = ȳ − μ t̄ ;  R² = 1 − Σ(y − a − μt)² / Σ(y − ȳ)²</Fm>
          <p>Si las lecturas están tan espaciadas que una ventana de ese ancho no junta {op.minpts} puntos (placas por tiempo, cubeta), el ancho se agranda automáticamente a (puntos mínimos − 1) × intervalo típico entre lecturas, y se avisa. De todas las ventanas con R² ≥ {op.r2min} se elige la de mayor pendiente: <b>μmax</b>. Exigir R² evita tomar como «máxima» la pendiente de un tramo ruidoso. Si ninguna ventana alcanza el R² mínimo se usa la de mayor pendiente y se avisa. La ventana se puede fijar a mano en «Curva OD vs t» (se informa como manual).</p>
          <p><b>Error de μmax.</b> El error estándar de la pendiente es <code>EE = √[ Σ residuos² / (n − 2) / Σ(t − t̄)² ]</code>. Como <code>Σ residuos² = (1 − R²)·Σ(y − ȳ)²</code> y <code>μ² Σ(t − t̄)² = R² Σ(y − ȳ)²</code>, se obtiene la forma usada:</p>
          <Fm nota="n = puntos de la ventana. IC 95 % = μ ± t(0,975; n − 2) · EE. Solo refleja el ruido dentro de la ventana, no la variación entre réplicas.">EE(μ) = |μ| · √[ (1 − R²) / (R² · (n − 2)) ]</Fm>
          <h4>Ampliación de la ventana (quota)</h4>
          <p>Después de elegir la ventana de mayor pendiente b<sub>máx</sub>, se suman las ventanas contiguas cuya pendiente sea al menos <b>{fx(100 * (op.quota || 0), 0)} %</b> de b<sub>máx</sub> y se reajusta la recta con todos los puntos del tramo ampliado (como <code>fit_easylinear</code> de <i>growthrates</i>; 0 % = no ampliar). Así la fase exponencial no queda más corta que la zona donde la curva sigue creciendo a ritmo parecido. El tramo (automático o elegido a mano en «Fases…») se elige por separado para la OD y para las UFC (en «Fases…» de cada Revisión); la calibración usa los tiempos donde ambos tramos coinciden.</p>
          <h4>Tiempo de duplicación</h4>
          <p>Si N se duplica en td: <code>2N₀ = N₀ e<sup>μ·td</sup></code> ⇒ <code>td = ln 2 / μ</code>. Su error se propaga a primer orden: <code>EE(td) = td · EE(μ)/μ</code>.</p>
          <Ej>μmax = 0,50 h⁻¹ → td = 0,6931/0,50 = 1,386 h.</Ej>
          <h4>OD₀ <Act on txt={op.od0_metodo === 'auto' ? 'automática (tres fases)' : `media de los primeros ${op.n_od0} puntos`} /></h4>
          <p>Tomar solo la primera lectura es ruidoso. El método automático ajusta a ln(OD), hasta el final de la ventana de μmax, el modelo de tres fases sin la estacionaria (Buchanan et al., 1997):</p>
          <Fm nota="λ se busca en una grilla de 300 valores; para cada uno, y₀ y μ salen de una regresión lineal sobre x = máx(0, t − λ). Se elige el λ de menor suma de cuadrados.">ln OD(t) = y₀ si t ≤ λ ;  y₀ + μ (t − λ) si t &gt; λ</Fm>
          <p>OD₀ = e<sup>y₀</sup>: usa todos los puntos de la meseta inicial, no uno solo. Si hay muy pocos puntos antes de la ventana, se usa la media de los primeros {op.n_od0} puntos y se avisa.</p>
          <h4>Lag λ <Act on txt={op.lag_metodo === 'umbral' ? `umbral (${op.lag_factor} × OD₀)` : 'tangente'} /></h4>
          <p><b>Tangente</b> (definición clásica): la recta de μmax prolongada hacia atrás corta el nivel inicial ln OD₀ en</p>
          <Fm nota="Si da negativo (la curva ya crecía al empezar), se informa 0.">a + μmax · λ = ln OD₀  ⇒  λ = (ln OD₀ − a) / μmax</Fm>
          <p><b>Umbral</b>: primer tiempo en que la curva llega a {op.lag_factor} × OD₀, interpolando linealmente entre los dos puntos que lo rodean. Es más robusto con curvas ruidosas pero depende del factor elegido.</p>
          <h4>K, ΔOD, generaciones y OD final</h4>
          <p><b>K</b> es el máximo de la curva <b>después de una mediana móvil de 3 puntos</b> (regla de extremos de Tukey), para que un pico aislado no cuente como máximo; t<sub>K</sub> es cuándo ocurre. <code>ΔOD = K − OD₀</code>. <code>Generaciones = log₂(K / OD₀)</code>, porque cada generación duplica la población. La <b>OD final</b> es la media de los últimos 3 puntos y la <b>caída</b> = (K − OD final)/K × 100.</p>
          <Ej>K = 1,00 y OD₀ = 0,05 → log₂(20) = 4,32 generaciones.</Ej>
          <h4>Área bajo la curva</h4>
          <Fm nota="Regla del trapecio: la curva entre dos lecturas se aproxima por una recta.">AUC = Σ ½ (y<sub>i</sub> + y<sub>i+1</sub>) (t<sub>i+1</sub> − t<sub>i</sub>)</Fm>
          <p>El <b>AUC de OD</b> (OD·h) integra lag, velocidad y rendimiento en un número, dominado por la meseta. El <b>AUC de ln(OD/OD₀)</b> pondera más el crecimiento temprano.</p>
          <h4>Tiempos y velocidades en escala lineal</h4>
          <p><b>Tiempo hasta OD = {op.umbral_od}</b>: primer tiempo en que la curva (mediana móvil de 3) alcanza ese valor, por interpolación lineal <code>t = t₁ + (u − y₁)(t₂ − t₁)/(y₂ − y₁)</code>. <b>dOD/dt máx.</b>: mayor ΔOD/Δt entre lecturas consecutivas de la curva suavizada; su tiempo medio es el punto de inflexión de la curva de OD. A diferencia de μ, dOD/dt depende del tamaño de la población.</p>
          <h4>μmax por spline <Act on={op.spline} /></h4>
          <p>Alternativa sin elegir ventana: se ajusta a ln(OD) un spline cúbico suavizante (minimiza Σ(yᵢ − g(tᵢ))² + λ ∫ g″(t)² dt, con λ fijado para tener df = máx(4, n/5) grados de libertad; algoritmo de Reinsch) y μ<sub>spline</sub> es el máximo de su derivada g′(t). Si difiere mucho de μmax, revisá la ventana o el ruido.</p>
          <h4>Fases</h4>
          <p>Con μ(t) de cada ventana: la <b>fase exponencial</b> son las ventanas consecutivas alrededor de la de μmax con μ ≥ {op.frac_exp} × μmax; la <b>estacionaria</b> empieza cuando, después de la exponencial, μ cae por debajo de {op.frac_est} × μmax; la <b>muerte</b>, en el primer tiempo después de K en que la OD baja más de {op.muerte_pct} % de K (una caída de OD también puede deberse a agregación o sedimentación).</p>
          {ej && (
            <Ej titulo={`Con tus datos (${ej.Muestra}, réplica ${ej.Replica})`}>
              la ventana de mayor pendiente fue de {fx(ej.t_ini_ventana, 2)} a {fx(ej.t_fin_ventana, 2)} h ({ej.n_ventana} puntos), con ln OD = {fs(ej.intercepto, 4)} + {fs(ej.mu_max, 4)}·t y R² = {fx(ej.r2, 4)}. Entonces μmax = {fs(ej.mu_max, 4)} h⁻¹, td = 0,6931/{fs(ej.mu_max, 4)} = {fs(ej.td_h, 4)} h,
              OD₀ = {fs(ej.od0, 4)} y λ = (ln {fs(ej.od0, 4)} − ({fs(ej.intercepto, 4)}))/{fs(ej.mu_max, 4)} = {fx(ej.lag_tangente_h, 2)} h. K = {fs(ej.K, 4)} → generaciones = log₂({fs(ej.K, 4)}/{fs(ej.od0, 4)}) = {fx(ej.generaciones, 2)}.
              {finito(ej.mu_se) && <> EE(μ) = {fs(ej.mu_se, 3)} h⁻¹; IC 95 % = {fs(ej.mu_max - tCuantil(0.975, Math.max(1, ej.n_ventana - 2)) * ej.mu_se, 4)} a {fs(ej.mu_max + tCuantil(0.975, Math.max(1, ej.n_ventana - 2)) * ej.mu_se, 4)} h⁻¹.</>}
            </Ej>
          )}

          <H id="modelos">Modelos de crecimiento (para comparar)</H>
          <p>El μmax que informa el programa es el de la ventana deslizante. Los modelos describen toda la curva y sirven para comparar y para tener una ecuación («Comparar con modelos» en la ecuación de cada curva, en «Curva OD vs t»). En el detalle de cada curva se pueden ajustar modelos a toda la curva por mínimos cuadrados no lineales (Levenberg–Marquardt con límites en los parámetros, equivalente a <code>nls(..., algorithm = "port")</code> de R), partiendo de los valores de la ventana deslizante. Gompertz, logístico y Richards se ajustan a <code>y = ln(OD/OD₀)</code> en la reparametrización de Zwietering et al. (1990), donde A es la altura (K = OD₀·e<sup>A</sup>), μ la pendiente máxima y λ el lag:</p>
          <Fm>{MODELOS_ETQ.gompertz}: y = A · exp{'{'} −exp[ μ e (λ − t)/A + 1 ] {'}'}</Fm>
          <Fm>{MODELOS_ETQ.logistico}: y = A / {'{'} 1 + exp[ 4μ (λ − t)/A + 2 ] {'}'}</Fm>
          <Fm>{MODELOS_ETQ.richards}: y = A · {'{'} 1 + ν e<sup>1+ν</sup> exp[ μ (1+ν)<sup>1+1/ν</sup> (λ − t)/A ] {'}'}<sup>−1/ν</sup></Fm>
          <Fm nota="Baranyi y Roberts (1994), ajustado sobre ln(OD); λ = h₀/μ.">{MODELOS_ETQ.baranyi}: ln OD = y₀ + μ A(t) − ln[ 1 + (e<sup>μA(t)</sup> − 1)/e<sup>(y<sub>máx</sub> − y₀)</sup> ] ;  A(t) = t + ln(e<sup>−μt</sup> + e<sup>−h₀</sup> − e<sup>−μt−h₀</sup>)/μ</Fm>
          <p>Para comparar modelos con distinto número de parámetros k se usa el criterio de Akaike, con la log-verosimilitud de errores normales <code>ln L = −(n/2)[ln(2π) + 1 − ln n + ln RSS]</code>: <code>AIC = −2 ln L + 2(k + 1)</code> y <code>BIC = −2 ln L + ln(n)(k + 1)</code> (el +1 es la varianza del error). Gana el menor AIC entre los que convergieron; un ajuste que no converge se informa, no se oculta.</p>

          <H id="replicas">Resumen entre réplicas</H>
          <p>Para cada cepa se usan las n réplicas que quedaron después del control de calidad. Con xᵢ el parámetro de cada réplica:</p>
          <Fm nota="La DE muestral divide por n − 1 porque la media se estimó con los mismos datos (corrección de Bessel).">x̄ = Σxᵢ / n ;  DE = √[ Σ(xᵢ − x̄)² / (n − 1) ] ;  EEM = DE / √n ;  IC 95 % = x̄ ± t(0,975; n − 1) · EEM</Fm>
          <div className="tabla-scroll" style={{ maxHeight: 'none', marginBottom: 12 }}><table className="tabla">
            <thead><tr><th>n réplicas</th>{[2, 3, 4, 5, 6, 8, 10, 12, 24].map((k) => <th key={k} className="num">{k}</th>)}</tr></thead>
            <tbody><tr><td>t(0,975; n − 1)</td>{[2, 3, 4, 5, 6, 8, 10, 12, 24].map((k) => <td key={k} className="num">{fx(tCuantil(0.975, k - 1), 3)}</td>)}</tr></tbody>
          </table></div>
          <p>Con pocas réplicas t es grande: con 3 réplicas el IC 95 % es x̄ ± 4,303 × DE/√3 ≈ x̄ ± 2,48 DE. En las curvas promedio, en cada tiempo se promedian las réplicas; en escala logarítmica cada réplica se transforma <b>antes</b> de promediar (la media de logaritmos es el logaritmo de la media geométrica). Las réplicas de una placa son <b>técnicas</b>: para conclusiones sobre una cepa hacen falta réplicas biológicas (experimentos independientes). El <b>R²</b> no se promedia (mide la calidad del ajuste de cada réplica, no una propiedad de la cepa): se informa el más bajo. En placas por tiempo hay una sola curva por cepa, y el único error de μmax es el error estándar de la pendiente.</p>
        </>)}

        {ufc && (<>
          <H id="ufc">Recuento de UFC/mL</H>
          <p><b>Serie de diluciones</b>. Cada paso transfiere un volumen v<sub>t</sub> a un tubo o pocillo con v<sub>d</sub> de diluyente, así que divide la concentración por f = (v<sub>t</sub> + v<sub>d</sub>)/v<sub>t</sub> (aquí {exp.ufc.toma} µL en {exp.ufc.diluyente} µL: f = {Number(Number(exp.ufc.factor).toPrecision(4))}). La dilución total de una columna es el producto de los factores de todos los pasos anteriores, <code>D<sub>k</sub> = f<sub>1</sub> · f<sub>2</sub> · … · f<sub>k</sub></code>, y su concentración relativa es 1/D<sub>k</sub> (en base 10: 10<sup>−log₁₀ D</sup>). {exp.ufc.primero === 'dilucion' ? 'La primera columna ya es la primera dilución (D₁ = f₁).' : 'La primera columna es la suspensión sin diluir (D = 1).'} Si un paso se hizo con otros volúmenes, su factor propio entra en el producto. En lo que sigue f<sup>k</sup> equivale a D<sub>k</sub> cuando todos los pasos son iguales.</p>
          <p>Una suspensión con concentración c (UFC/mL) se diluye k veces con factor f = {Number(Number(exp.ufc.factor).toPrecision(4))}: la dilución −k tiene c · f<sup>−k</sup> UFC/mL. Al sembrar un volumen V = {exp.ufc.vol} µL = {exp.ufc.vol / 1000} mL, el número esperado de colonias es <code>E[C] = c · V · f<sup>−k</sup></code>, de donde el estimador de una placa es:</p>
          <Fm>UFC/mL = C / (V · f<sup>−k</sup>) = C · f<sup>k</sup> / V</Fm>
          <p><b>Rango contable ({exp.ufc.min}–{exp.ufc.max})</b>. El recuento sigue una distribución de Poisson, cuyo coeficiente de variación es 1/√C: con 10 colonias el error relativo es ≈ 32 %; con 100, ≈ 10 %. Por encima del máximo las colonias se superponen y compiten, y se subcuenta. Por eso se usa la dilución con más réplicas dentro del rango; los recuentos fuera de él entran como <b>estimaciones</b> (círculo hueco) solo si «Usar estimados» está activo: <Act on={exp.ufc.estimados} />.</p>
          <p><b>Una dilución por cepa y tiempo</b>. Todas las réplicas de una cepa en un mismo tiempo se calculan con <b>la misma dilución</b> (recuadrada en la tabla de conteos), para que las réplicas sean comparables entre sí y el test de valores atípicos compare estimaciones equivalentes. La sugerencia automática es la dilución con más réplicas dentro del rango contable; a igualdad, la que tienen más réplicas y luego la de más colonias (menor error relativo 1/√C). Si ninguna réplica cae en el rango, se usa la que da la mejor estimación y los valores se marcan «estimado». Se puede elegir otra en la columna «Dilución usada» o con clic derecho sobre un conteo; el cambio vale para todas las réplicas de esa cepa en ese tiempo. Una réplica sin conteo en esa dilución queda sin valor («Sin conteo en la dilución de la cepa») en lugar de calcularse con otra. Con C colonias en la dilución de factor total D y un volumen sembrado V:</p>
          <Fm nota="D: dilución total de la columna (por ejemplo 10⁴ para 10⁻⁴). Ejemplo: 45 colonias en 10⁻⁴ con 20 µL: 45 × 10⁴ / 0,02 mL = 2,25 × 10⁷ UFC/mL.">UFC/mL = C · D / V</Fm>
          <p>Si la dilución usada tiene 0 colonias se informa el <b>límite de detección</b> ≈ 3 · D / V (3 es el número esperado de colonias para el que P(0 colonias) ≈ 5 %); si tiene más del doble del máximo, «incontable». Usar las estimaciones fuera del rango en las medias: <Act on={exp.ufc.estimados} />.</p>
          {exp.aj.ufc_centro === 'geo' ? (<>
            <p><b>Media geométrica de las réplicas</b>. Cada réplica se calcula por separado (UFC/mL = C · D / V, con la dilución elegida para la cepa y el tiempo). Se pasa a log₁₀, se promedian los log₁₀ de las réplicas y se vuelve a UFC/mL con 10^media: es la media geométrica. Es el valor que se grafica, el que entra en el ajuste de los modelos y en la calibración. Las réplicas con 0 colonias no tienen log₁₀ y no entran en la media.</p>
            <Fm nota="n: réplicas con UFC > 0. La DE divide por n − 1. El EEM y el IC 95 % solo se calculan con 3 o más réplicas (con n = 2 la t de Student vale 12,7). El intervalo en UFC/mL es asimétrico: 10^(x̄ ± error).">x̄ = Σ xᵢ / n ,  xᵢ = log₁₀ UFC/mLᵢ ;  DE = √[Σ(xᵢ − x̄)² / (n − 1)] ;  EEM = DE / √n ;  IC 95 % = x̄ ± t(0,975; n − 1) · EEM</Fm>
            {ejG && finito(ejG.Media_geometrica) && <Ej titulo={`Con tus datos (${ejG.Muestra}, T = ${ejG.T_h} h)`}>media de log₁₀ = {fx(Math.log10(ejG.Media_geometrica), 3)} → media geométrica {sciCorto(ejG.Media_geometrica)} UFC/mL; DE = {fx(ejG.DE_log10, 3)} log₁₀ (n = {(ejG._vals || []).filter((x) => x > 0).length}).</Ej>}
            <p><b>Barras de error.</b> Con la media geométrica, la barra es la DE, el EEM o el IC 95 % de los log₁₀ de las réplicas (se elige en Mostrar › Error). Valor de cada tiempo: <Act on txt="media geométrica" />.</p>
          </>) : (<>
          <p><b>Incertidumbre del recuento y su IC 95 % (enfoque de ISO 19036)</b>. Se trabaja en escala log₁₀, donde el crecimiento microbiano es aproximadamente normal. Con N el valor en UFC/mL y C las colonias contadas:</p>
          <Fm nota="u_poisson: error de contar (varianza de Poisson llevada a log₁₀: 1/(ln 10)² = 0,1886). u_oper: componente operativa y de matriz (pipeteo, diluciones, heterogeneidad de la muestra). Son independientes: se suman las varianzas. k = 2 da ≈ 95 %. Al antilogaritmar, el intervalo en UFC/mL es asimétrico.">u<sub>poisson</sub> = 1 / (ln 10 · √C) ;  u<sub>c</sub> = √(u<sub>poisson</sub>² + u<sub>oper</sub>²) ;  U = 2 · u<sub>c</sub> ;  IC 95 % = 10<sup>(log₁₀ N ± U)</sup></Fm>
          <Ej>C = 100 colonias → u_poisson = 0,043 log₁₀. Con u_oper = {fx(uOperUfc(exp.aj), 3)}: u_c = {fx(Math.sqrt(0.043 ** 2 + uOperUfc(exp.aj) ** 2), 3)} y U = {fx(2 * Math.sqrt(0.043 ** 2 + uOperUfc(exp.aj) ** 2), 3)} log₁₀: el IC es N ÷/× {fx(10 ** (2 * Math.sqrt(0.043 ** 2 + uOperUfc(exp.aj) ** 2)), 2)}. Con pocas colonias domina u_poisson; con muchas, domina u_oper.</Ej>
          {ejU && <Ej titulo={`Con tus datos (${ejU.Muestra}, T = ${ejU.T_h} h, réplica ${ejU.Replica})`}>se usó la {ejU.Diluciones_usadas}: C = {ejU._S} colonias → UFC/mL = {sciCorto(ejU.UFC_mL)}; IC 95 % {sciCorto(ejU.IC95_inf)} a {sciCorto(ejU.IC95_sup)}.</Ej>}
          <p><b>Promedio de las réplicas</b>. Todas las réplicas de una cepa en un tiempo se cuentan en la misma dilución; la concentración del tiempo se obtiene sumando las colonias de las réplicas y dividiendo por la suma de los volúmenes de suspensión original que se sembraron (cada volumen sembrado dividido por su factor de dilución). Es el estimador de máxima verosimilitud de la concentración cuando todas las réplicas son réplicas técnicas de la misma suspensión (distribución de Poisson): las réplicas con más volumen pesan más y las placas con 0 colonias también cuentan. No es la «media ponderada entre diluciones» de ISO 7218, que combina dos diluciones consecutivas y aquí no se usa.</p>
          <p><b>Incertidumbre de cada tiempo</b>. Para una cepa y un tiempo, C es la <b>suma</b> de las colonias de las réplicas (ΣC) y N = ΣC / ΣV. u_poisson se calcula con ΣC. <b>u_oper</b> es el mayor entre un valor por defecto (<Act on txt={`${fx(uOperUfc(exp.aj), 3)} log₁₀`} />; típico 0,07 a 0,10, equivalente a una varianza de 0,005 a 0,01; se cambia en «Más opciones» de Curva UFC vs t y puede ponerse en 0) y la variación observada entre réplicas por encima de la que explica Poisson: <code>√(s² − promedio(0,1886/C<sub>i</sub>))</code>, con s la DE de log₁₀ UFC/mL de las réplicas (con una sola réplica no se estima). El valor por defecto debe ser el de la validación de tu laboratorio; el de ejemplo es orientativo. <b>Barras de error.</b> El error dibujado es siempre el del valor que se grafica: con Σ C / Σ V, su IC 95 % (el de arriba); con la media de log₁₀ de las réplicas (apropiada para réplicas biológicas), su DE, EEM o IC 95 % en log₁₀ (el EEM y el IC no se dibujan con menos de 3 réplicas). Valor de cada tiempo: <Act on txt={exp.aj.ufc_centro === 'geo' ? 'media de log₁₀' : 'Σ C / Σ V'} />. Rango contable de 3 a 30 colonias por gota: Herigstad et al. (2001).</p>
          <Fm nota="Vᵢ: mL sembrados de la réplica i; dᵢ: factor de dilución de la placa contada. El IC 95 % es 10^(log₁₀ N ± 2·u_c) (ver arriba). La dispersión entre réplicas se informa como DE de log₁₀ UFCᵢ y CV.">UFC/mL = Σ Cᵢ / Σ (Vᵢ / dᵢ) ;  s = DE(log₁₀ UFCᵢ)</Fm>
          {ejG && <Ej titulo={`Con tus datos (${ejG.Muestra}, T = ${ejG.T_h} h)`}>{ejG._pool.map((q) => q.C).join(' + ')} = {ejG.Colonias_suma} colonias en {fx(ejG.Volumen_mL * 1000, 4)} µL de suspensión original → UFC/mL = {sciCorto(ejG.UFC_mL)}; IC 95 % {sciCorto(ejG.IC95_inf)} a {sciCorto(ejG.IC95_sup)}.</Ej>}
          </>)}

          <H id="ufcqc">Control de calidad de los recuentos <Act on={exp.aj.ufc_dixon_on !== false} txt={`${exp.aj.ufc_atip_metodo === 'cv' ? `CV ≤ ${exp.aj.ufc_cvmax ?? 20} %` : `${exp.aj.ufc_atip_metodo === 'grubbs' ? 'Grubbs' : 'Dixon'} ${exp.aj.ufc_dixon_conf || 95} %`}${exp.aj.ufc_auto === true ? ', exclusión automática' : ', solo marca'}`} /></H>
          <p><b>Criterio elegible</b>. Las réplicas de una cepa en un tiempo se comparan con el test Q de Dixon o el de Grubbs (sobre log₁₀ UFC/mL, con el nivel de confianza elegido) o con la <b>desviación estándar relativa</b>: RSD = 100 · s / x̄ de las UFC/mL; si supera el porcentaje elegido, se señala la réplica más alejada de la media (se informa también el RSD sin ella). El mismo criterio está disponible para las lecturas de OD entre réplicas de cada tiempo.</p>
          <p>Con 3 a 10 réplicas de la misma cepa y tiempo, se aplica el test Q de Dixon (sección de puntos aberrantes) sobre <b>log₁₀ UFC/mL</b>, porque en escala logarítmica la dispersión es simétrica. Por defecto la réplica solo se <b>marca</b> como sospechosa; queda fuera del promedio únicamente si se elige «Excluir» (o se excluye a mano), y se puede reincorporar. Con 3 réplicas estos tests tienen muy poca potencia y, al excluir, el promedio queda con 2 réplicas. El CV esperado solo por Poisson es ≈ 1/√C (32 % con 10 colonias), de modo que un límite fijo de 20 % marca réplicas normales en conteos bajos. También se informa el CV de cada grupo como indicador de concordancia (un CV &gt; 50 % suele indicar un problema de dilución o de siembra).</p>

          <H id="ufccrec">Crecimiento por recuento</H>
          <p>Los parámetros de crecimiento por recuento se obtienen como en <b>DMFit</b> (ComBase), ajustando por mínimos cuadrados (Levenberg-Marquardt) uno de estos modelos a <b>todos</b> los puntos, sin descartar ninguno para mejorar el R². Puntos usados: <Act on txt={exp.aj.ufc_datos === 'replicas' ? 'cada réplica incluida' : 'la media de cada tiempo'} />. Modelo: <Act on txt={{ lineal: 'lineal', baranyi: 'Baranyi y Roberts', bifasico: 'bifásico sin asíntota' }[exp.aj.ufc_modelo || 'baranyi']} />.</p>
          <ul>
            <li><b>Linealizar log₁₀</b>: <code>log₁₀ N = a + b · t</code> en la <b>fase exponencial</b> (un tramo de la curva, sin lag ni meseta). El tramo es el que se elige en «Fases…» de la Revisión; si no se eligió, el de mayor pendiente entre las ventanas deslizantes, ampliado con las vecinas de pendiente ≥ {fx(100 * (cuotaDe(exp.aj) || 0), 0)} % de la máxima (método «quota» de <i>growthrates</i>; 0 = no ampliar) y reajustado con todos sus puntos.</li>
            <li><b>Baranyi y Roberts</b> (1994): <code>y = y₀ + μ A(t) − (1/m)·ln[1 + (e<sup>mμA(t)</sup> − 1)/e<sup>m(y<sub>máx</sub> − y₀)</sup>]</code> (con m = 1 es la forma habitual; m es la curvatura hacia la meseta, el «mCurv» de DMFit; la curvatura de salida de la latencia, «nCurv», no está implementada y se usa la forma estándar), con <code>A(t) = t + ln(e<sup>−μt</sup> + e<sup>−h₀</sup> − e<sup>−μt−h₀</sup>)/μ</code> y <code>λ = h₀/μ</code> (4 o más tiempos).</li>
            <li><b>Huang</b> (2008): <code>y = y₀ + y<sub>máx</sub> − ln[ e<sup>y₀</sup> + (e<sup>y<sub>máx</sub></sup> − e<sup>y₀</sup>) e<sup>−μ B(t)</sup> ]</code> con <code>B(t) = t + (1/α) ln[(1 + e<sup>−α(t−λ)</sup>)/(1 + e<sup>αλ</sup>)]</code> y α = 4 fijo. Es la alternativa a Baranyi y Roberts con una transición más suave; λ (el lag) es un parámetro directo del ajuste.</li>
          </ul>
          <p>Con y = ln(UFC/mL). Como en DMFit se informan la velocidad en log₁₀ UFC/mL por hora (μ / ln 10), y₀ e y<sub>final</sub> en log₁₀, el R² y el error estándar del ajuste <code>√(SSE/(n − p))</code> en log₁₀. Además <code>td = ln 2/μ</code>, <code>aumento = log₁₀ N(t<sub>fin</sub>) − log₁₀ N(t<sub>ini</sub>)</code> según el mismo modelo (lo que sube la curva ajustada en el período medido) y <code>generaciones = aumento / log₁₀ 2</code>. Los parámetros están debajo del gráfico de «Curva UFC vs t». La curva del gráfico es la del mismo modelo; también se puede mostrar una <b>spline cúbica monótona</b> de Fritsch-Carlson, solo visual. Curva mostrada: <Act on={exp.aj.ufc_suave !== false} txt={exp.aj.ufc_suave === 'spline' ? 'spline monótona' : exp.aj.ufc_suave === false ? undefined : 'la del modelo'} />. Curvatura m: <Act on txt={String(exp.aj.ufc_mcurv ?? 1)} />.</p>
          <p><b>Error estándar de los parámetros.</b> En Baranyi y Roberts y en Huang, cada parámetro libre tiene un error estándar que sale de la matriz de covarianza del ajuste no lineal: <code>cov = s² · (JᵀJ)⁻¹</code>, con J la matriz de derivadas del modelo respecto de cada parámetro en el óptimo y <code>s² = SSE/(n − p)</code>. El IC 95 % es <code>parámetro ± t(0,975; n − p) · EE</code>. En Baranyi y Roberts el error del lag λ = h₀/μ se calcula con el método delta a partir de la covarianza de h₀ y μ. Si μ y λ tienen correlación |r| &gt; 0,95, se avisa: con esos datos no se pueden separar.</p>
          <p><b>Lag fijo.</b> Se puede fijar el lag λ (en horas) y entonces no se estima ni lleva error; μ se estabiliza porque μ y el lag se compensan entre sí cuando hay pocos puntos (idea de la viñeta de <i>growthrates</i>, que fija h₀). En Baranyi y Roberts se fija h₀ = μ·λ.</p>
          <p><b>Grados de libertad.</b> Con 5 tiempos y 4 parámetros (Baranyi y Roberts) queda 1 grado de libertad: el ajuste pasa casi por los puntos y λ y N<sub>máx</sub> son poco identificables. Se informa n − p y se avisa cuando es muy bajo. Si los recuentos no llegan a la meseta, N<sub>máx</sub> no puede estimarse (se indica «sin meseta»): conviene el modelo bifásico o fijar N<sub>máx</sub>, que debe ser mayor que el máximo observado. El mismo ajuste (y el mismo N<sub>máx</sub> fijado) se usa en la tabla, la predicción y la calibración. Los tiempos con 0 colonias no pueden entrar al ajuste (no existe el logaritmo) y se avisan.</p>
          {crecU && <Ej titulo={`Con tus datos (${crecU.Muestra})`}>{crecU.c.n} puntos, velocidad = {fx(crecU.c.rate, 3)} log₁₀/h, μ = {fs(crecU.c.mu, 4)} h⁻¹, td = {fx(crecU.c.td_h, 2)} h{finito(crecU.c.lag_h) ? `, lag = ${fx(crecU.c.lag_h, 2)} h` : ''}, R² = {fx(crecU.c.r2, 3)}, {fx(crecU.c.generaciones, 2)} generaciones.</Ej>}
          <p><b>Predicción.</b> En «Curva UFC vs t» se puede extender el modelo elegido (Baranyi y Roberts o Huang) más allá del último recuento para ver el comportamiento esperado: la misma ecuación, con los parámetros ajustados, evaluada hasta el tiempo elegido. Si los recuentos no llegan a la fase estacionaria, N<sub>máx</sub> no se puede estimar y hay que fijarlo (por ejemplo, con el de otros ensayos en el mismo medio); entonces se ajustan solo y₀, μ y h₀. Se informan el valor predicho al final, el tiempo en que la curva queda a 0,1 log₁₀ de N<sub>máx</sub> y, si se indica, el tiempo hasta un nivel objetivo. Fuera del rango medido es una extrapolación. Modo predictivo: <Act on={!!exp.aj.ufc_pred?.on} />.</p>
        </>)}

        {exp.tipo === 'odufc' && (<>
          <H id="comb">Combinación de OD y UFC</H>
          <p><b>Pares OD–UFC.</b> Cada recuento (promedio de las réplicas de una cepa en un tiempo T) se empareja con la OD media de la misma cepa en ese tiempo. Si no hubo lectura de OD exactamente en T, se interpola linealmente entre las dos lecturas que lo rodean: <code>OD(T) = OD₁ + (T − t₁)(OD₂ − OD₁)/(t₂ − t₁)</code>. No se extrapola fuera del rango de tiempos de la OD.</p>
          <p><b>Calibración.</b> Por defecto la recta se arma solo con los pares de la <b>fase exponencial</b>: con el mismo ajuste de los recuentos de cada cepa que se usa en «Curva UFC vs t» (el modelo elegido; con el lineal no hay fases y entran todos los pares) se considera exponencial el tramo en que la velocidad instantánea del modelo es al menos la fracción elegida de μ máx; antes es la fase de latencia y después la estacionaria. En la lag y la estacionaria la relación entre OD y células viables cambia (tamaño celular, células no cultivables), por eso se dejan afuera. El criterio de fase exponencial (fracción de μ máx) es configurable (<Act on txt={`${Math.round((exp.aj.ufc_frac_exp ?? 0.5) * 100)} %`} />). Cada par puede incluirse o excluirse a mano, y la selección por fase se puede apagar. La OD de los pares es la OD corregida por blanco, <b>sin suavizar ni normalizar</b>; una OD neta negativa indica un blanco mal tomado y se avisa cuando son la mayoría. El modelo proporcional no admite OD ≤ 0, y el log–log tampoco. Con los pares (ODᵢ, UFCᵢ) elegidos se ajusta por mínimos cuadrados uno de estos modelos:</p>
          <ul>
            <li>Recta: <code>log₁₀ UFC = m · OD + b</code> (regresión lineal de log₁₀ UFC sobre OD).</li>
            <li>Lineal: <code>UFC = a + b · OD</code>.</li>
            <li>Proporcional: <code>UFC = b · OD</code>, con <code>b = Σ ODᵢ UFCᵢ / Σ ODᵢ²</code> (recta por el origen).</li>
            <li>Potencia: <code>log₁₀ UFC = a + b · log₁₀ OD</code>; si OD fuera exactamente proporcional a las células, b = 1.</li>
          </ul>
          <p>La calidad de todos se mide en log₁₀ para que sean comparables: <code>R² = 1 − Σ rᵢ² / Σ(log₁₀ UFCᵢ − media)²</code> con <code>rᵢ = log₁₀ UFCᵢ − log₁₀ predicho</code>, y el error típico <code>σ = √[Σ rᵢ²/(n − p)]</code> en órdenes de magnitud (error relativo ≈ 10<sup>σ</sup> − 1). La conversión inversa (UFC → OD) se obtiene despejando la OD de la ecuación ajustada. La calibración solo vale dentro del rango de OD medido y para el mismo organismo, medio y equipo.</p>
          <p><b>Velocidades</b> («OD ↔ UFC»). Se compara μmax por OD (media de las réplicas, o la curva de la cepa en placas por tiempo) con μ por recuento. Si la OD siguiera exactamente a las células viables el cociente sería ≈ 1; un cociente distinto indica cambios en el tamaño celular, agregación o pérdida de viabilidad.</p>
        </>)}

        <H id="numeros">Qué datos usa cada número</H>
        <p>Cada número del programa sale de un conjunto concreto de puntos. En «Linealizar log₁₀» solo cuentan los puntos del <b>tramo exponencial</b> de cada cepa; en Baranyi y Roberts y en Huang cuentan <b>todos</b> los puntos, porque esos modelos describen la curva entera. Hacé clic en un número en cualquier pantalla para ver su cuenta paso a paso.</p>
        <div className="tabla-scroll"><table className="tabla tabla-texto">
          <thead><tr><th>Número</th><th>Cómo se calcula</th><th>Qué puntos usa</th></tr></thead>
          <tbody>
            {od && <>
              <tr><td>μmax, td, R², EE de μ (OD)</td><td>Pendiente de la recta de ln(OD) contra t; td = ln 2 / μ; R² y EE de la regresión</td><td>Los puntos de OD del tramo exponencial de cada réplica o cepa, con OD ≥ {op.lnmin}, sin los excluidos</td></tr>
              <tr><td>Lag λ (OD)</td><td>Tangente: donde la recta del tramo cruza ln OD₀ (o el tiempo en que la OD llega a {op.lag_factor} × OD₀)</td><td>La recta del tramo y OD₀</td></tr>
              <tr><td>OD₀, K, ΔOD, generaciones, AUC</td><td>OD₀: meseta inicial (tres fases); K: máximo tras mediana móvil de 3; AUC: regla del trapecio</td><td>OD₀: los puntos iniciales; K y AUC: toda la curva</td></tr>
              <tr><td>μ, λ, y₀, OD máx (Baranyi y Roberts / Huang)</td><td>Ajuste no lineal (Levenberg-Marquardt) sobre ln(OD); ± error estándar de cada parámetro</td><td>Todos los puntos de la cepa</td></tr>
              {!s.porCepa && <tr><td>Media ± DE de la cepa</td><td>Media y desviación estándar (n − 1) del parámetro de cada réplica; td con la μ media</td><td>Un valor por réplica (la tabla «cómo se calculó» de cada número muestra la cuenta de cada una)</td></tr>}
              <tr><td>Punto de la curva media</td><td>Media (y DE, EEM o IC 95 %) de las réplicas en ese tiempo; en Tecan, cada réplica es lectura − blanco</td><td>Las lecturas de ese tiempo, sin las excluidas</td></tr>
            </>}
            {ufc && <>
              <tr><td>UFC/mL de una réplica</td><td>Colonias / (volumen sembrado × dilución) de la dilución elegida</td><td>Las colonias contadas de esa réplica</td></tr>
              <tr><td>UFC/mL de la cepa en un tiempo</td><td>Σ colonias / Σ volumen con IC 95 % (ISO 19036), o media geométrica</td><td>Las réplicas de ese tiempo que no fueron excluidas</td></tr>
              <tr><td>μ, td, lag, y₀, y máx (recuentos)</td><td>Según el modelo elegido ({MODELOS_UFC[modeloUfc(exp.aj)]}); ± error estándar en Baranyi y Huang</td><td>{modeloUfc(exp.aj) === 'lineal' ? 'Los valores de cada tiempo dentro del tramo exponencial' : 'El valor de cada tiempo (todos los tiempos)'}</td></tr>
              <tr><td>Aumento y generaciones</td><td>log₁₀ N final − log₁₀ N inicial del modelo; generaciones = aumento / log₁₀ 2</td><td>El primer y el último tiempo del ajuste</td></tr>
            </>}
            {exp.tipo === 'odufc' && <tr><td>Calibración OD ↔ UFC/mL</td><td>Regresión del modelo elegido (recta, lineal, proporcional o potencia)</td><td>Los pares OD–UFC de los tiempos dentro del tramo exponencial de cada cepa (si «Solo fase exponencial» está prendido)</td></tr>}
          </tbody>
        </table></div>
        <p><b>Tu tramo exponencial por cepa.</b> La OD y las UFC tienen cada una el suyo; la calibración usa donde coinciden.</p>
        <div className="tabla-scroll"><table className="tabla tabla-texto">
          <thead><tr><th>Cepa</th>{od && <th>Tramo de la OD</th>}{ufc && <th>Tramo de las UFC</th>}{exp.tipo === 'odufc' && <th>Calibración (coinciden)</th>}<th>Origen</th></tr></thead>
          <tbody>{[...new Set([...(res || []).map((r) => r.Muestra), ...((ufcRes?.res || []).map((r) => r.Muestra))])].map((m) => {
            const filas = (res || []).filter((r) => r.Muestra === m)
            const ven = ventanaDeFilas(filas)
            const manualOd = filas.some((r) => exp.E.ventanas[r.Pocillo])
            const amp = filas.some((r) => r.ventana_ampliada)
            const fz = ufcRes?.hay ? fasesUfc(ufcRes, m, exp.aj) : null
            const elegU = tramoUfcElegido(exp.aj, m)
            const vU = elegU || (fz?.ok && finito(fz.tIni) && finito(fz.tFin) ? [fz.tIni, fz.tFin] : null)
            const tr = (x) => (x ? `${fx(x[0], 2)} a ${fx(x[1], 2)} h` : '–')
            const co = ven && vU ? (Math.max(ven[0], vU[0]) <= Math.min(ven[1], vU[1]) + 1e-9 ? [Math.max(ven[0], vU[0]), Math.min(ven[1], vU[1])] : 'vacio') : ven || vU
            return (
              <tr key={m}><td><b>{m}</b></td>
                {od && <td>{tr(ven)}{filas.length > 1 ? ' (mediana de las réplicas)' : ''}</td>}
                {ufc && <td>{tr(vU)}</td>}
                {exp.tipo === 'odufc' && <td>{co === 'vacio' ? 'ninguno (no se solapan)' : tr(co)}</td>}
                <td>{od ? `OD: ${manualOd ? 'elegido a mano' : amp ? 'automático, ampliado' : 'automático'}` : ''}{od && ufc ? ' · ' : ''}{ufc ? `UFC: ${elegU ? 'elegido a mano' : 'automático'}` : ''}{finito(lagFijoUfc(exp.aj)) ? ` · lag UFC fijado en ${fx(lagFijoUfc(exp.aj), 2)} h` : ''}</td></tr>
            )
          })}</tbody>
        </table></div>

        <H id="criterio">Interpretación y limitaciones</H>
        <ul>
          <li>Ningún filtro automático distingue un error experimental de un fenómeno biológico real: revisá cada punto o réplica marcados antes de darlos por malos.</li>
          {od && <li>Los pocillos del borde de la placa (filas A y H, columnas 1 y 12) evaporan más; si se apartan sistemáticamente, conviene no usarlos o llenarlos con medio.</li>}
          {od && <li>El lag es el parámetro menos robusto (depende de OD₀ y de la ventana): usalo para comparar condiciones dentro del mismo experimento.</li>}
          {od && <li>K depende del equipo, del volumen y de la linealidad: compará siempre contra un control en la misma placa.</li>}
          {ufc && <li>Los recuentos estimados fuera del rango contable y los cercanos al límite de detección tienen errores grandes aunque el número se vea preciso.</li>}
          <li>Las réplicas dentro de un experimento son técnicas. La variabilidad entre días (réplicas biológicas) suele ser mayor y es la que importa para comparar cepas.</li>
        </ul>

        <H id="texto">Texto para el informe</H>
        <p className="ayuda">Generado con los ajustes activos. Revisalo antes de usarlo.</p>
        <p style={{ background: 'var(--panel2)', border: '1px solid var(--borde)', borderRadius: 10, padding: '12px 16px' }}>{texto}</p>

        <H id="refs">Referencias</H>
        <ul style={{ fontSize: 13.5 }}>
          <li>Baranyi J, Roberts TA (1994). A dynamic approach to predicting bacterial growth in food. Int J Food Microbiol 23:277–294.</li>
          <li>Buchanan RL, Whiting RC, Damert WC (1997). When is simple good enough: a comparison of the Gompertz, Baranyi, and three-phase linear models for fitting bacterial growth curves. Food Microbiol 14:313–326.</li>
          <li>Dixon WJ (1950). Analysis of extreme values. Ann Math Stat 21:488–506. · Rorabacher DB (1991). Statistical treatment for rejection of deviant values: critical values of Dixon's «Q» parameter. Anal Chem 63:139–146.</li>
          <li>ISO 19036:2019. Microbiology of the food chain — Estimation of measurement uncertainty for quantitative determinations. · ISO 7218:2007. Microbiology of food and animal feeding stuffs — General requirements and guidance for microbiological examinations.</li>
          <li>Hampel FR (1974). The influence curve and its role in robust estimation. J Am Stat Assoc 69:383–393.</li>
          <li>ISO 7218:2007/Amd 1:2013. Microbiology of food and animal feeding stuffs — General requirements and guidance for microbiological examinations. · FDA Bacteriological Analytical Manual, cap. 3 (Aerobic Plate Count).</li>
          <li>Herigstad B, Hamilton M, Heersink J (2001). How to optimize the drop plate method for enumerating bacteria. J Microbiol Methods 44:121–129.</li>
          <li>Zwietering MH, Jongenburger I, Rombouts FM, van 't Riet K (1990). Modeling of the bacterial growth curve. Appl Environ Microbiol 56:1875–1881.</li>
          <li>Hall BG, Acar H, Nandipati A, Barlow M (2014). Growth rates made easy. Mol Biol Evol 31:232–238.</li>
          <li>Cleveland WS (1979). Robust locally weighted regression and smoothing scatterplots. J Am Stat Assoc 74:829–836.</li>
          <li>Fritsch FN, Carlson RE (1980). Monotone piecewise cubic interpolation. SIAM J Numer Anal 17:238–246.</li>
          <li>Grubbs FE (1969). Procedures for detecting outlying observations in samples. Technometrics 11:1–21.</li>
          <li>Sokal RR, Rohlf FJ (2012). Biometry, 4.ª ed. W. H. Freeman. · Zar JH (2010). Biostatistical Analysis, 5.ª ed. Pearson. (Regresión lineal, intervalos con t de Student, Poisson y χ².)</li>
        </ul>
      </div>
    </div>
  )
}
