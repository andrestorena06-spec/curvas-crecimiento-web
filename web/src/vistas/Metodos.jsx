import { useMemo, useRef } from 'react'
import { MODELOS_ETQ } from '../ayuda.js'
import { finito } from '../motor/analisis.js'
import { opAnalisis } from '../motor/pipeline.js'
import { ORIGENES, TIPOS, caminoOptico } from '../modelo.js'
import { Encabezado, Icono } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { descargarTexto, fs, fx, sciCorto, tCuantil } from '../utils.js'
import { crecimientoPorCepa } from './CurvaUfc.jsx'

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
    const out = []
    if (aj.hampel_on) out.push(`un filtro de Hampel dentro de cada curva (ventana de ${2 * aj.hampel_k + 1} puntos, umbral ${aj.hampel_sigma} × MAD escalada, diferencia mínima ${aj.hampel_min} OD)`)
    if (aj.dixon_on) out.push(aj.od_atip_metodo === 'cv' ? `la desviación estándar relativa entre réplicas de cada tiempo (RSD > ${aj.od_cvmax ?? 20} %: se excluyó la réplica más alejada de la media)` : `el test Q de Dixon entre réplicas de cada tiempo (${aj.dixon_conf} % de confianza; Rorabacher, 1991)`)
    if (aj.odmax_on) out.push(`la exclusión de lecturas mayores a ${aj.odmax} OD`)
    if (out.length) p.push(`Los valores aberrantes se identificaron con ${out.join(' y ')}.`)
    p.push(`La velocidad específica máxima de crecimiento (μmax) se estimó como la mayor pendiente de ln(OD) contra el tiempo en ventanas deslizantes de ${op.ancho} h (mínimo ${op.minpts} puntos, R² ≥ ${op.r2min}, OD ≥ ${op.lnmin}); el tiempo de duplicación como ln 2/μmax, y la fase de latencia como la intersección de la tangente en μmax con ln(OD₀)${op.od0_metodo === 'auto' ? ', con OD₀ estimada mediante un modelo de tres fases (Buchanan et al., 1997)' : ''}. La OD máxima (K) se tomó sobre la curva suavizada con mediana móvil de 3 puntos y el área bajo la curva se calculó por la regla del trapecio.`)
    p.push('Los resultados se expresan como media ± desviación estándar de las réplicas; los intervalos de confianza del 95 % usan la distribución t de Student con n − 1 grados de libertad.')
  }
  if (exp.tipo !== 'od') {
    p.push(`Las células viables se cuantificaron por recuento en placa de diluciones seriadas (${exp.ufc.toma} µL transferidos a ${exp.ufc.diluyente} µL de diluyente, factor ${Number(Number(exp.ufc.factor).toPrecision(4))} por paso${Object.keys(exp.ufc.pasos || {}).length ? ', con algunos pasos de volúmenes distintos' : ''}; ${exp.ufc.primero === 'dilucion' ? 'la primera columna ya correspondía a la primera dilución' : 'la primera columna fue la suspensión sin diluir'}; ${exp.ufc.vol} µL sembrados). Se consideraron contables las placas con ${exp.ufc.min} a ${exp.ufc.max} colonias; para cada cepa y tiempo se usó una sola dilución, la misma para todas sus réplicas (la que tenía más réplicas dentro del rango contable, salvo que se eligiera otra a mano) y UFC/mL = C · D / V; la coherencia entre diluciones consecutivas se verificó con una prueba binomial exacta (colonias esperadas = colonias de la dilución anterior ÷ factor del paso, p < 0,05). El intervalo de confianza del 95 % de cada recuento se obtuvo por el método exacto de Poisson (Garwood, 1936). La concentración de cada cepa y tiempo se calculó sumando las colonias de las réplicas y dividiendo por la suma de los volúmenes de suspensión original sembrados (media ponderada, ISO 7218)${exp.aj.ufc_dixon_on !== false ? (exp.aj.ufc_atip_metodo === 'cv' ? `, previa evaluación de réplicas atípicas por la desviación estándar relativa (límite ${exp.aj.ufc_cvmax ?? 20} %)` : ', previa evaluación de valores atípicos con el test Q de Dixon sobre log₁₀ UFC/mL') : ''}, y la velocidad de crecimiento se estimó como la máxima pendiente de ln(UFC/mL) contra el tiempo en 3 a 6 tiempos consecutivos (R² ≥ 0,9).`)
  }
  if (exp.tipo === 'odufc') p.push('La relación entre OD y UFC/mL se describió por regresión por mínimos cuadrados sobre log₁₀ UFC/mL, emparejando cada recuento con la OD media de la misma cepa en el mismo tiempo (interpolación lineal cuando no hubo lectura simultánea).')
  return p.join(' ')
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
  const crecU = ufcRes?.hay ? crecimientoPorCepa(ufcRes.res).find((x) => x.c && finito(x.c.mu)) : null

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
    od && ['modelos', 'Modelos de crecimiento'],
    od && ['replicas', 'Resumen entre réplicas'],
    ufc && ['ufc', 'Recuento de UFC/mL'],
    ufc && ['ufcqc', 'Control de calidad de los recuentos'],
    ufc && ['ufccrec', 'Crecimiento por recuento'],
    exp.tipo === 'odufc' && ['comb', 'Combinación de OD y UFC'],
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
          {od && <li><b>Suavizado y normalización</b> (opcionales).</li>}
          {od && <li><b>Parámetros</b> de cada réplica (μmax, td, lag, K, AUC, …) y <b>resumen</b> por cepa (media ± DE, IC 95 %).</li>}
          {ufc && <li><b>Recuento</b>: UFC/mL de cada réplica con su IC 95 % de Poisson, control de réplicas atípicas, promedio por tiempo (suma de colonias / suma de volúmenes) y velocidad de crecimiento.</li>}
          {exp.tipo === 'odufc' && <li><b>Combinación</b>: pares OD–UFC, calibración y comparación de velocidades.</li>}
        </ol>

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
          <p>Para cada punto yᵢ se toma la ventana de k puntos a cada lado (2k + 1 puntos) y se calcula:</p>
          <Fm nota="La mediana y la MAD no se dejan arrastrar por el propio valor extremo, a diferencia de la media y la desviación estándar.">
            mᵢ = mediana(y<sub>i−k</sub> … y<sub>i+k</sub>) ;  MADᵢ = mediana |y<sub>j</sub> − mᵢ| ;  Sᵢ = 1,4826 · MADᵢ
          </Fm>
          <p>El factor 1,4826 = 1/Φ⁻¹(0,75) hace que S estime la desviación estándar cuando los datos son normales (en una normal, la mitad de los desvíos absolutos es menor que 0,6745 σ). El punto se marca si</p>
          <Fm nota={`n = ${aj.hampel_sigma} (umbral); δ = ${aj.hampel_min} OD (diferencia mínima).`}>|yᵢ − mᵢ| &gt; máx( n · Sᵢ ; δ )</Fm>
          <p>La diferencia mínima δ evita marcar desvíos minúsculos cuando la curva es tan lisa que la MAD es casi 0. Con «interpolar», el valor marcado se reemplaza por la interpolación lineal entre sus vecinos válidos (y se conserva el original en las tablas).</p>
          <Ej>Lecturas consecutivas 0,10 · 0,11 · <b>0,50</b> · 0,12 · 0,11 · 0,12 · 0,13 (k = 3, punto central 0,50). Mediana = 0,12; desvíos 0,02 · 0,01 · 0,38 · 0 · 0,01 · 0 · 0,01 → MAD = 0,01; S = 0,0148; umbral = máx(3 × 0,0148; 0,002) = 0,0445. Como |0,50 − 0,12| = 0,38 &gt; 0,0445, el punto se marca.</Ej>
          <h4>Test Q de Dixon (entre réplicas) <Act on={aj.dixon_on} txt={`${aj.dixon_conf} %`} /></h4>
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

          <H id="param">Parámetros de crecimiento</H>
          <h4>Por qué se trabaja con ln(OD)</h4>
          <p>En fase exponencial cada célula se divide a ritmo constante: <code>dN/dt = μ N</code>. Integrando, <code>N(t) = N₀ · e<sup>μ(t − t₀)</sup></code>, y tomando logaritmo natural:</p>
          <Fm nota="Una recta en el tiempo: la pendiente es la velocidad específica de crecimiento μ (h⁻¹).">ln N(t) = ln N₀ + μ · (t − t₀)</Fm>
          <p>Como OD ∝ N, la misma recta aparece en ln(OD). Por eso la fase exponencial se identifica como el tramo donde ln(OD) es más recto y empinado. Solo se usan puntos con OD ≥ {op.lnmin}: cerca del blanco el logaritmo amplifica el ruido (ln 0,005 − ln 0,010 = −0,69 por un error de 0,005 OD).</p>
          <h4>μmax: ventana deslizante</h4>
          <p>Para cada punto de inicio tᵢ se toman todos los puntos con t en [tᵢ, tᵢ + {op.ancho} h] (mínimo {op.minpts}) y se ajusta por mínimos cuadrados <code>ln OD = a + μ·t</code>:</p>
          <Fm nota="Fórmulas de la regresión lineal simple; t̄ y ȳ son las medias de la ventana.">μ = Σ(t − t̄)(y − ȳ) / Σ(t − t̄)² ;  a = ȳ − μ t̄ ;  R² = 1 − Σ(y − a − μt)² / Σ(y − ȳ)²</Fm>
          <p>Si las lecturas están tan espaciadas que una ventana de ese ancho no junta {op.minpts} puntos (placas por tiempo, cubeta), el ancho se agranda automáticamente a (puntos mínimos − 1) × intervalo típico entre lecturas, y se avisa. De todas las ventanas con R² ≥ {op.r2min} se elige la de mayor pendiente: <b>μmax</b>. Exigir R² evita tomar como «máxima» la pendiente de un tramo ruidoso. Si ninguna ventana alcanza el R² mínimo se usa la de mayor pendiente y se avisa. La ventana se puede fijar a mano en «Parámetros» (se informa como manual).</p>
          <p><b>Error de μmax.</b> El error estándar de la pendiente es <code>EE = √[ Σ residuos² / (n − 2) / Σ(t − t̄)² ]</code>. Como <code>Σ residuos² = (1 − R²)·Σ(y − ȳ)²</code> y <code>μ² Σ(t − t̄)² = R² Σ(y − ȳ)²</code>, se obtiene la forma usada:</p>
          <Fm nota="n = puntos de la ventana. IC 95 % = μ ± t(0,975; n − 2) · EE. Solo refleja el ruido dentro de la ventana, no la variación entre réplicas.">EE(μ) = |μ| · √[ (1 − R²) / (R² · (n − 2)) ]</Fm>
          <h4>Tiempo de duplicación</h4>
          <p>Si N se duplica en td: <code>2N₀ = N₀ e<sup>μ·td</sup></code> ⇒ <code>td = ln 2 / μ</code>. Su error se propaga a primer orden: <code>EE(td) = td · EE(μ)/μ</code>.</p>
          <Ej>μmax = 0,50 h⁻¹ → td = 0,6931/0,50 = 1,386 h = 83,2 min.</Ej>
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
              la ventana de mayor pendiente fue de {fx(ej.t_ini_ventana, 2)} a {fx(ej.t_fin_ventana, 2)} h ({ej.n_ventana} puntos), con ln OD = {fs(ej.intercepto, 4)} + {fs(ej.mu_max, 4)}·t y R² = {fx(ej.r2, 4)}. Entonces μmax = {fs(ej.mu_max, 4)} h⁻¹, td = 0,6931/{fs(ej.mu_max, 4)} = {fs(ej.td_min / 60, 4)} h = {fx(ej.td_min, 1)} min,
              OD₀ = {fs(ej.od0, 4)} y λ = (ln {fs(ej.od0, 4)} − ({fs(ej.intercepto, 4)}))/{fs(ej.mu_max, 4)} = {fx(ej.lag_tangente_h, 2)} h. K = {fs(ej.K, 4)} → generaciones = log₂({fs(ej.K, 4)}/{fs(ej.od0, 4)}) = {fx(ej.generaciones, 2)}.
              {finito(ej.mu_se) && <> EE(μ) = {fs(ej.mu_se, 3)} h⁻¹; IC 95 % = {fs(ej.mu_max - tCuantil(0.975, Math.max(1, ej.n_ventana - 2)) * ej.mu_se, 4)} a {fs(ej.mu_max + tCuantil(0.975, Math.max(1, ej.n_ventana - 2)) * ej.mu_se, 4)} h⁻¹.</>}
            </Ej>
          )}

          <H id="modelos">Modelos de crecimiento</H>
          <p>En el detalle de cada curva se pueden ajustar modelos a toda la curva por mínimos cuadrados no lineales (Levenberg–Marquardt con límites en los parámetros, equivalente a <code>nls(..., algorithm = "port")</code> de R), partiendo de los valores de la ventana deslizante. Gompertz, logístico y Richards se ajustan a <code>y = ln(OD/OD₀)</code> en la reparametrización de Zwietering et al. (1990), donde A es la altura (K = OD₀·e<sup>A</sup>), μ la pendiente máxima y λ el lag:</p>
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
          <p>Con pocas réplicas t es grande: con 3 réplicas el IC 95 % es x̄ ± 4,303 × DE/√3 ≈ x̄ ± 2,48 DE. En las curvas promedio, en cada tiempo se promedian las réplicas; en escala logarítmica cada réplica se transforma <b>antes</b> de promediar (la media de logaritmos es el logaritmo de la media geométrica). Las réplicas de una placa son <b>técnicas</b>: para conclusiones sobre una cepa hacen falta réplicas biológicas (experimentos independientes).</p>
        </>)}

        {ufc && (<>
          <H id="ufc">Recuento de UFC/mL</H>
          <p><b>Serie de diluciones</b>. Cada paso transfiere un volumen v<sub>t</sub> a un tubo o pocillo con v<sub>d</sub> de diluyente, así que divide la concentración por f = (v<sub>t</sub> + v<sub>d</sub>)/v<sub>t</sub> (aquí {exp.ufc.toma} µL en {exp.ufc.diluyente} µL: f = {Number(Number(exp.ufc.factor).toPrecision(4))}). La dilución total de una columna es el producto de los factores de todos los pasos anteriores, <code>D<sub>k</sub> = f<sub>1</sub> · f<sub>2</sub> · … · f<sub>k</sub></code>, y su concentración relativa es 1/D<sub>k</sub> (en base 10: 10<sup>−log₁₀ D</sup>). {exp.ufc.primero === 'dilucion' ? 'La primera columna ya es la primera dilución (D₁ = f₁).' : 'La primera columna es la suspensión sin diluir (D = 1).'} Si un paso se hizo con otros volúmenes, su factor propio entra en el producto. En lo que sigue f<sup>k</sup> equivale a D<sub>k</sub> cuando todos los pasos son iguales.</p>
          <p>Una suspensión con concentración c (UFC/mL) se diluye k veces con factor f = {Number(Number(exp.ufc.factor).toPrecision(4))}: la dilución −k tiene c · f<sup>−k</sup> UFC/mL. Al sembrar un volumen V = {exp.ufc.vol} µL = {exp.ufc.vol / 1000} mL, el número esperado de colonias es <code>E[C] = c · V · f<sup>−k</sup></code>, de donde el estimador de una placa es:</p>
          <Fm>UFC/mL = C / (V · f<sup>−k</sup>) = C · f<sup>k</sup> / V</Fm>
          <p><b>Rango contable ({exp.ufc.min}–{exp.ufc.max})</b>. El recuento sigue una distribución de Poisson, cuyo coeficiente de variación es 1/√C: con 10 colonias el error relativo es ≈ 32 %; con 100, ≈ 10 %. Por encima del máximo las colonias se superponen y se compiten, y se subcuenta. Por eso solo se usan placas dentro del rango.</p>
          <p><b>Una dilución por cepa y tiempo</b>. Todas las réplicas de una cepa en un mismo tiempo se calculan con <b>la misma dilución</b> (recuadrada en la tabla de conteos), para que las réplicas sean comparables entre sí y el test de valores atípicos compare estimaciones equivalentes. La sugerencia automática es la dilución con más réplicas dentro del rango contable; a igualdad, la que tienen más réplicas y luego la de más colonias (menor error relativo 1/√C). Si ninguna réplica cae en el rango, se usa la que da la mejor estimación y los valores se marcan «estimado». Se puede elegir otra en la columna «Dilución usada» o con clic derecho sobre un conteo; el cambio vale para todas las réplicas de esa cepa en ese tiempo. Una réplica sin conteo en esa dilución queda sin valor («Sin conteo en la dilución de la cepa») en lugar de calcularse con otra. Con C colonias en la dilución de factor total D y un volumen sembrado V:</p>
          <Fm nota="D: dilución total de la columna (por ejemplo 10⁴ para 10⁻⁴). Ejemplo: 45 colonias en 10⁻⁴ con 20 µL: 45 × 10⁴ / 0,02 mL = 2,25 × 10⁷ UFC/mL.">UFC/mL = C · D / V</Fm>
          <p>Si la dilución usada tiene 0 colonias se informa el <b>límite de detección</b> ≈ 3 · D / V (3 es el número esperado de colonias para el que P(0 colonias) ≈ 5 %); si tiene más del doble del máximo, «incontable». Usar las estimaciones fuera del rango en las medias: <Act on={exp.ufc.estimados} />.</p>
          <p><b>Coherencia entre diluciones</b>. Las diluciones de una misma réplica tienen que ser coherentes: si una tiene C₁ colonias, la siguiente, que está f veces más diluida, debería tener ≈ C₁/f (100 colonias en una dilución 1:10 → ≈ 10 en la siguiente). Para cada par de diluciones consecutivas con conteo, dado el total S = C₁ + C₂, el número en la segunda sigue una binomial:</p>
          <Fm nota="Se calcula el p-valor exacto a dos colas (suma de las probabilidades binomiales menores o iguales a la observada). Con p < 0,05 la celda se marca con ⚠ y la réplica muestra el aviso; no se excluye sola, porque puede ser la otra dilución la que falló. Si entre las dos hay menos de 5 colonias no hay información suficiente, y si la primera supera el doble del máximo no se evalúa (las colonias superpuestas se subcuentan).">C₂ | S ~ Binomial(S, p) ;  p = (1/D₂) / (1/D₁ + 1/D₂) = 1 / (1 + f)</Fm>
          <Ej>Con pasos de factor f = 5: 63 colonias en una dilución y 25 en la siguiente → esperadas ≈ 12,6; p = 1/6, S = 88 → p-valor ≈ 0,006: las diluciones no coinciden (error de pipeteo, de dilución o de conteo). 139 y 28 sí son coherentes (esperadas ≈ 27,8; p-valor ≈ 1).</Ej>
          <p><b>IC 95 % de cada réplica (Poisson exacto, Garwood 1936)</b>. Con C colonias en la dilución usada:</p>
          <Fm nota="χ²(p; ν): cuantil p de la chi-cuadrado con ν grados de libertad. Se calcula con la función gamma incompleta.">λ<sub>inf</sub> = χ²(0,025; 2C)/2 ;  λ<sub>sup</sub> = χ²(0,975; 2C + 2)/2 ;  IC = [λ<sub>inf</sub>, λ<sub>sup</sub>] · D / V</Fm>
          <Ej>S = 10 colonias → λ entre 4,80 y 18,39: contar pocas colonias es impreciso aunque el cálculo sea exacto.</Ej>
          {ejU && <Ej titulo={`Con tus datos (${ejU.Muestra}, T = ${ejU.T_h} h, réplica ${ejU.Replica})`}>se usó la {ejU.Diluciones_usadas}: C = {ejU._S} colonias → UFC/mL = {sciCorto(ejU.UFC_mL)}; IC 95 % {sciCorto(ejU.IC95_inf)} a {sciCorto(ejU.IC95_sup)}.</Ej>}
          <p><b>Promedio de las réplicas</b>. Todas las réplicas de una cepa en un tiempo se cuentan en la misma dilución; la concentración del tiempo se obtiene sumando las colonias de las réplicas y dividiendo por la suma de los volúmenes de suspensión original que se sembraron (cada volumen sembrado dividido por su factor de dilución). Es la media ponderada de ISO 7218: las réplicas con más volumen pesan más y las placas con 0 colonias también cuentan.</p>
          <Fm nota="Vᵢ: mL sembrados de la réplica i; dᵢ: factor de dilución de la placa contada. El IC 95 % es el de Poisson exacto sobre Σ C dividido por Σ Vᵢ/dᵢ. La dispersión entre réplicas se informa como DE de log₁₀ UFCᵢ y CV.">UFC/mL = Σ Cᵢ / Σ (Vᵢ / dᵢ) ;  s = DE(log₁₀ UFCᵢ)</Fm>
          {ejG && <Ej titulo={`Con tus datos (${ejG.Muestra}, T = ${ejG.T_h} h)`}>{ejG._pool.map((q) => q.C).join(' + ')} = {ejG.Colonias_suma} colonias en {fx(ejG.Volumen_mL * 1000, 4)} µL de suspensión original → UFC/mL = {sciCorto(ejG.UFC_mL)}; IC 95 % {sciCorto(ejG.IC95_inf)} a {sciCorto(ejG.IC95_sup)}.</Ej>}

          <H id="ufcqc">Control de calidad de los recuentos <Act on={exp.aj.ufc_dixon_on !== false} txt={exp.aj.ufc_atip_metodo === 'cv' ? `RSD ≤ ${exp.aj.ufc_cvmax ?? 20} %` : `Dixon ${exp.aj.ufc_dixon_conf || 95} %`} /></H>
          <p><b>Criterio elegible</b>. Las réplicas de una cepa en un tiempo se comparan con el test Q de Dixon (sobre log₁₀ UFC/mL, con el nivel de confianza elegido) o con la <b>desviación estándar relativa</b>: RSD = 100 · s / x̄ de las UFC/mL; si supera el porcentaje elegido, la réplica más alejada de la media queda fuera (se informa también el RSD sin ella). El mismo criterio está disponible para las lecturas de OD entre réplicas de cada tiempo.</p>
          <p>Con 3 a 10 réplicas de la misma cepa y tiempo, se aplica el test Q de Dixon (sección de puntos aberrantes) sobre <b>log₁₀ UFC/mL</b>, porque en escala logarítmica la dispersión es simétrica. La réplica marcada queda fuera del promedio y se puede reincorporar. También se informa el CV de cada grupo como indicador de concordancia (un CV &gt; 50 % suele indicar un problema de dilución o de siembra).</p>

          <H id="ufccrec">Crecimiento por recuento</H>
          <p><b>Curva de UFC en los gráficos</b>. Las medias de cada tiempo se dibujan como puntos, sin unirlas con líneas. Opcionalmente se superpone una curva suave: el <b>modelo de Baranyi-Roberts</b> ajustado por mínimos cuadrados a ln(UFC/mL) (parámetros ln N₀, ln N<sub>max</sub>, μ y h₀ = μ·λ; 4 o más tiempos), o una <b>spline cúbica monótona</b> de Fritsch-Carlson, que pasa por cada media sin crear máximos o mínimos que no están en los datos. La curva es solo visual: μ, el lag y los demás parámetros por recuento se calculan como se describe abajo. Curva mostrada: <Act on={exp.aj.ufc_suave !== false} txt={exp.aj.ufc_suave === 'spline' ? 'spline monótona' : exp.aj.ufc_suave === false ? undefined : 'Baranyi-Roberts'} />.</p>
          <p>Con el promedio de cada tiempo, se ajusta <code>ln(UFC/mL) = a + μ t</code> en todas las secuencias de 3 a 6 tiempos consecutivos y se elige la de mayor pendiente entre las que tienen R² ≥ 0,9 (a igual pendiente, la más larga). Luego <code>td = ln 2/μ</code>, <code>λ = (ln N₀ − a)/μ</code> con N₀ el primer recuento, <code>aumento = log₁₀(N<sub>máx</sub>/N₀)</code> y <code>generaciones = log₂(N<sub>máx</sub>/N₀)</code>.</p>
          {crecU && <Ej titulo={`Con tus datos (${crecU.Muestra})`}>ventana {crecU.c.ventana}, μ = {fs(crecU.c.mu, 4)} h⁻¹ (R² = {fx(crecU.c.r2, 3)}), td = {fx(crecU.c.td_min, 1)} min, lag = {fx(crecU.c.lag_h, 2)} h, {fx(crecU.c.generaciones, 2)} generaciones.</Ej>}
        </>)}

        {exp.tipo === 'odufc' && (<>
          <H id="comb">Combinación de OD y UFC</H>
          <p><b>Pares OD–UFC.</b> Cada recuento (promedio de las réplicas de una cepa en un tiempo T) se empareja con la OD media de la misma cepa en ese tiempo. Si no hubo lectura de OD exactamente en T, se interpola linealmente entre las dos lecturas que lo rodean: <code>OD(T) = OD₁ + (T − t₁)(OD₂ − OD₁)/(t₂ − t₁)</code>. No se extrapola fuera del rango de tiempos de la OD.</p>
          <p><b>Calibración.</b> Con los pares (ODᵢ, UFCᵢ) se ajusta por mínimos cuadrados uno de estos modelos:</p>
          <ul>
            <li>Clásico: <code>log₁₀ UFC = m · OD + b</code> (regresión lineal de log₁₀ UFC sobre OD).</li>
            <li>Lineal: <code>UFC = a + b · OD</code>.</li>
            <li>Proporcional: <code>UFC = b · OD</code>, con <code>b = Σ ODᵢ UFCᵢ / Σ ODᵢ²</code> (recta por el origen).</li>
            <li>Potencia: <code>log₁₀ UFC = a + b · log₁₀ OD</code>; si OD fuera exactamente proporcional a las células, b = 1.</li>
          </ul>
          <p>La calidad de todos se mide en log₁₀ para que sean comparables: <code>R² = 1 − Σ rᵢ² / Σ(log₁₀ UFCᵢ − media)²</code> con <code>rᵢ = log₁₀ UFCᵢ − log₁₀ predicho</code>, y el error típico <code>σ = √[Σ rᵢ²/(n − p)]</code> en órdenes de magnitud (error relativo ≈ 10<sup>σ</sup> − 1). La conversión inversa (UFC → OD) se resuelve por bisección sobre la curva ajustada. La calibración solo vale dentro del rango de OD medido y para el mismo organismo, medio y equipo.</p>
          <p><b>Velocidades.</b> Se compara μmax por OD (media de las réplicas) con μ por recuento. Si la OD siguiera exactamente a las células viables el cociente sería ≈ 1; un cociente distinto indica cambios en el tamaño celular, agregación o pérdida de viabilidad.</p>
        </>)}

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
          <li>Garwood F (1936). Fiducial limits for the Poisson distribution. Biometrika 28:437–442.</li>
          <li>Hampel FR (1974). The influence curve and its role in robust estimation. J Am Stat Assoc 69:383–393.</li>
          <li>ISO 7218:2007/Amd 1:2013. Microbiology of food and animal feeding stuffs — General requirements and guidance for microbiological examinations. · FDA Bacteriological Analytical Manual, cap. 3 (Aerobic Plate Count).</li>
          <li>Zwietering MH, Jongenburger I, Rombouts FM, van 't Riet K (1990). Modeling of the bacterial growth curve. Appl Environ Microbiol 56:1875–1881.</li>
          <li>Hall BG, Acar H, Nandipati A, Barlow M (2014). Growth rates made easy. Mol Biol Evol 31:232–238.</li>
          <li>Cleveland WS (1979). Robust locally weighted regression and smoothing scatterplots. J Am Stat Assoc 74:829–836.</li>
        </ul>
      </div>
    </div>
  )
}
