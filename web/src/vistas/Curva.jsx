// ============================================================
// Curva OD vs t: el gráfico de las curvas (media ± error o cada réplica). Los parámetros (μmax, lag, K, …) están en
// «Parámetros». Clic en un punto de la media: cómo se calculó.
// ============================================================
import { useMemo, useState } from 'react'
import { useOpcion } from '../ui/opciones.js'
import { desvio, finito, media } from '../motor/analisis.js'
import { etiquetaOd, nombreReplica } from '../motor/pipeline.js'
import { Encabezado, Icono, Vacio } from '../ui/base.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, tCuantil } from '../utils.js'
import { BotonCinta, Cajon, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { SelectorCepas, cepasOcultas } from '../ui/cepas.jsx'
import { fichaMediaTiempo } from '../fichas/definiciones.js'
import { resumenPorCepa } from './Parametros.jsx'

// Media y error por tiempo de un conjunto de series (la transformación se aplica antes de promediar)
export function mediaPorTiempo(series, tr, error) {
  const por = new Map()
  series.forEach((w) => w.t.forEach((t, i) => { const v = tr(w.y[i]); if (finito(v)) { if (!por.has(t)) por.set(t, []); por.get(t).push(v) } }))
  return [...por.keys()].sort((a, b) => a - b).map((t) => {
    const v = por.get(t), n = v.length, m = media(v), sd = n > 1 ? desvio(v) : NaN
    const e = error === 'sd' ? sd : error === 'sem' ? sd / Math.sqrt(n) : n > 1 ? (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n) : NaN
    return { t, m, n, sd, lo: finito(e) ? m - e : NaN, hi: finito(e) ? m + e : NaN }
  })
}

export function Curva({ s }) {
  const { pre, exp } = s
  const [modo, setModo] = useOpcion('curva.modo', 'media')
  const [escala, setEscala] = useOpcion('curva.escala', 'lineal')
  const [error, setError] = useOpcion('curva.error', 'sd')
  const ocultas = cepasOcultas(exp)
  const [ocultasRep, setOcultasRep] = useState([])   // réplicas (pocillos) ocultas en el gráfico
  const [puntos, setPuntos] = useOpcion('curva.puntos.' + exp.origenOd, exp.origenOd !== 'tecan')
  const [verValor, setVerValor] = useOpcion('curva.valor', false)
  const [verError, setVerError] = useOpcion('curva.conError', false)
  const [pers, setPers] = useState(false)
  const wsTodas = useMemo(() => (pre && !pre.error ? pre.proc.filter((w) => !w.EsBlanco) : []), [pre])
  const resumen = useMemo(() => (s.res?.length ? resumenPorCepa(s.res, ['mu_max', 'td_min']) : []), [s.res])
  const muestras = [...new Set(wsTodas.map((w) => w.Muestra))]
  // las réplicas ocultas no se dibujan ni entran en la media del gráfico (el análisis no cambia)
  const ws = s.porCepa ? wsTodas : wsTodas.filter((w) => !ocultasRep.includes(w.Pocillo))
  if (!wsTodas.length) return <div className="pagina"><Encabezado titulo="Curva OD vs t" /><Vacio titulo="Todavía no hay curvas procesadas">{s.pre?.error || 'Completá la carga de datos y el control de calidad.'}</Vacio></div>

  // lo que se grafica (con normalización, OD / OD₀ u OD − OD₀: solo para el gráfico)
  const base = etiquetaOd(s.serie.aj)
  const ETQ_Y = { lineal: base, ln: `ln(${base})`, log10: `log₁₀(${base})` }
  const TRANS = { lineal: (v) => v, ln: (v) => (v > 0 ? Math.log(v) : NaN), log10: (v) => (v > 0 ? Math.log10(v) : NaN) }
  const tr = TRANS[escala]
  const visibles = muestras.filter((m) => !ocultas.includes(m))
  let series = []
  let nBajo = false   // algún tiempo con menos de 3 lecturas en la media (el error tiene poca base)
  const etqErr = { sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }[error]
  if (modo === 'replicas' && s.porCepa) {
    // placas por tiempo: cada pocillo es una lectura aislada de un tiempo, no una curva
    visibles.forEach((m) => {
      const g = ws.filter((w) => w.Muestra === m)
      const mt = mediaPorTiempo(g, tr, 'sd')
      series.push({ id: 'm' + m, nombre: m, color: s.colores[m], ancho: 1.6, opacidad: 0.7, data: mt.map((q) => ({ x: q.t / 3600, y: q.m, tip: `${m} · media\nt = ${fx(q.t / 3600, 2)} h\n${ETQ_Y[escala]} = ${fx(q.m, 4)} (n = ${q.n})` })) })
      series.push({ id: 'p' + m, nombre: '', color: s.colores[m], linea: false, puntos: true, radio: 3,
        data: g.flatMap((w) => w.t.map((t, i) => ({ x: t / 3600, y: tr(w.y[i]), tip: `${m}\nt = ${fx(t / 3600, 2)} h\n${ETQ_Y[escala]} = ${fx(tr(w.y[i]), 4)}` }))) })
    })
  } else if (modo === 'replicas') {
    series = ws.filter((w) => visibles.includes(w.Muestra)).map((w) => {
      const e = s.estilos[w.Pocillo] || {}
      return {
        id: w.Pocillo, nombre: nombreReplica(w.Muestra, w.Replica), color: e.color, dash: e.dash, puntos, radio: 2.4,
        data: w.t.map((t, i) => ({ x: t / 3600, y: tr(w.y[i]), tip: `${nombreReplica(w.Muestra, w.Replica)}${exp.origenOd === 'tecan' ? ` (${w.Pocillo})` : ''}\nt = ${fx(t / 3600, 2)} h\n${ETQ_Y[escala]} = ${fx(tr(w.y[i]), 4)}` })),
      }
    })
  } else {
    series = visibles.map((m) => {
      const g = ws.filter((w) => w.Muestra === m)
      const mt = mediaPorTiempo(g, tr, error)
      // n por tiempo: cambia cuando se excluyen lecturas o réplicas
      const ns = mt.map((q) => q.n), nmin = ns.length ? Math.min(...ns) : 0, nmax = ns.length ? Math.max(...ns) : 0
      if (nmin < 3) nBajo = true
      return {
        id: m, nombre: `${m} (n = ${nmin === nmax ? nmax : `${nmin}–${nmax}`})`, color: s.colores[m], banda: exp.origenOd === 'tecan', errores: exp.origenOd !== 'tecan', puntos, radio: 3.2, ancho: 2.2,
        etiqueta: verValor ? (d) => (verError && finito(d.hi) ? `${fx(d.y, 3)} ± ${fx(d.hi - d.y, 3)}` : fx(d.y, 3)) : null,
        data: mt.map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, key: `${m}|${q.t}`, tip: `${m}\nt = ${fx(q.t / 3600, 2)} h\nmedia ${ETQ_Y[escala]} = ${fx(q.m, 4)}${finito(q.hi) ? `\n${etqErr} = ± ${fx(q.hi - q.m, 4)}` : ''}${finito(q.sd) && error !== 'sd' ? `\nDE = ${fx(q.sd, 4)}` : ''}\nn = ${q.n} ${s.porCepa ? 'pocillos' : 'réplicas técnicas'}${q.n < 3 ? ' (n < 3: error poco confiable)' : ''}\nClic: cómo se calculó` })),
      }
    })
  }
  // ficha de un punto de la media: las réplicas de ese tiempo, su media y su error
  const abrir = (k) => {
    const i = k.lastIndexOf('|'), m = k.slice(0, i), t = Number(k.slice(i + 1))
    const valores = ws.filter((w) => w.Muestra === m).flatMap((w) => w.t.map((tt, j) => (tt === t && finito(tr(w.y[j])) ? { etiqueta: s.porCepa ? `réplica ${w.Replica}` : nombreReplica(w.Muestra, w.Replica), x: tr(w.y[j]) } : null)).filter(Boolean))
    if (valores.length) s.abrirFicha(fichaMediaTiempo({ valores, t: t / 3600, nombre: m, tipo: error, unidad: ETQ_Y[escala], etiquetaValor: `Media de ${ETQ_Y[escala]}` }))
  }
  const nombreErr = { sd: 'desviación estándar', sem: 'error estándar de la media', ic95: 'IC 95 %' }[error]
  // μ media y td = ln 2 / μ̄ (el mismo cálculo que el resumen por cepa de Parámetros)
  const muDe = (m) => resumen.find((r) => r.Muestra === m)?.mu_max.m ?? NaN
  const tdDe = (m) => resumen.find((r) => r.Muestra === m)?.td_min.m ?? NaN
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Mostrar">
          <OpcionesCinta valor={modo} onChange={setModo} opciones={[
            ['media', 'Media', '〰', null, 'Media de las réplicas de cada cepa en cada tiempo, con su error'],
            ['replicas', s.porCepa ? 'Todos los puntos' : 'Réplicas', '⋮⋮', null, s.porCepa ? 'Cada pocillo de cada tiempo como un punto, con la línea de la media' : 'Cada réplica como una curva propia'],
          ]} />
          {!(modo === 'replicas' && s.porCepa) && <BotonCinta simbolo="•" texto="Marcar puntos" activo={puntos} onClick={() => setPuntos(!puntos)} tip="Dibujar un punto en cada lectura" />}
        </Grupo>
        {modo === 'media' && (
          <Grupo titulo="Valores sobre los puntos">
            <BotonCinta simbolo="12" texto="Valor" activo={verValor} onClick={() => setVerValor(!verValor)} tip="Escribir el valor medio sobre cada punto" />
            <BotonCinta simbolo="±" texto="Con error" activo={verError} onClick={() => { setVerError(!verError); if (!verValor) setVerValor(true) }} tip="Agregar el error (DE, EEM o IC 95 %) al valor" />
          </Grupo>
        )}
        <Grupo titulo="Escala del eje Y">
          <OpcionesCinta valor={escala} onChange={setEscala} opciones={[['lineal', 'Lineal', 'OD', null, 'OD tal cual'], ['ln', 'ln', 'ln', null, 'Logaritmo natural: la fase exponencial se ve como una recta'], ['log10', 'log₁₀', 'lg', null, 'Logaritmo decimal']]} />
        </Grupo>
        {modo === 'media' && (
          <Grupo titulo="Tipo de error">
            <OpcionesCinta valor={error} onChange={setError} opciones={[['sd', 'DE', 's', null, 'Desviación estándar\nCuánto se dispersan las réplicas entre sí'], ['sem', 'EEM', 's/√n', null, 'Error estándar de la media = DE / √n\nIncertidumbre de la media'], ['ic95', 'IC 95 %', 'IC', null, 'Intervalo de confianza del 95 %\nmedia ± t(0,975; n − 1) × DE / √n']]} />
          </Grupo>
        )}
        {s.porCepa && (
          <Grupo titulo="Curva de cada cepa">
            <OpcionesCinta valor={s.modoCurva} onChange={(v) => s.setAj('placas_curva', v)} opciones={[['media', 'Promediada', 'x̄', null, 'Los parámetros se calculan sobre la media de los pocillos aceptados en cada tiempo'], ['puntos', 'Sin promediar', '⋮', null, 'μmax, su error, OD₀ y lag salen de la regresión con todos los pocillos; K y AUC, de la media']]} />
          </Grupo>
        )}
        <Grupo titulo="Gráfico">
          <BotonCinta icono="editar" texto="Personalizar" activo={pers} onClick={() => setPers(!pers)} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers} onClose={() => setPers(false)}><PanelPersonalizar s={s} id="curva" /></Cajon>
      <Encabezado titulo="Curva OD vs t" sub={`${exp.cond.organismo ? exp.cond.organismo + ' · ' : ''}${exp.cond.medio ? exp.cond.medio + ' · ' : ''}${exp.cond.temperatura ? exp.cond.temperatura + ' °C · ' : ''}OD${exp.cond.lambda ? ` a ${exp.cond.lambda} nm` : ''}, con blanco restado y sin los puntos excluidos.${exp.aj.camino_on && exp.origenOd !== 'cubeta' ? ' OD llevada a 1 cm de camino óptico.' : ''}${base !== 'OD' ? ` Gráfico normalizado (${base}); los parámetros se calculan con la OD sin normalizar.` : ''}${(s.serie.aj.suavizado || 'ninguno') !== 'ninguno' ? ' Curvas suavizadas solo para el gráfico.' : ''}`} />
      <SelectorCepas s={s} muestras={muestras} hayMas={ocultasRep.length > 0} onMostrarTodas={() => setOcultasRep([])}
        tip={(m, on) => `${m}\nμmax ${fs(muDe(m), 3)} h⁻¹${finito(tdDe(m)) ? ` · td ${fx(tdDe(m), 0)} min` : ''}\n${on ? 'Clic para ocultar la cepa' : 'Clic para mostrarla'}`}
        extra={(m, on) => {
          const reps = s.porCepa ? [] : wsTodas.filter((w) => w.Muestra === m).sort((a, b) => a.Replica - b.Replica)
          return on && reps.length > 1 && reps.map((w) => {
            const vis = !ocultasRep.includes(w.Pocillo)
            return <button key={w.Pocillo} className={`rep ${vis ? 'on' : ''}`} style={vis ? { background: s.estilos[w.Pocillo]?.color || s.colores[m] } : undefined}
              onClick={() => setOcultasRep(vis ? [...ocultasRep, w.Pocillo] : ocultasRep.filter((x) => x !== w.Pocillo))}
              data-tip={`${nombreReplica(w.Muestra, w.Replica)}${exp.origenOd === 'tecan' ? ` · pocillo ${w.Pocillo}` : ''}\n${vis ? 'Clic para ocultarla del gráfico y de la media' : 'Clic para mostrarla'}`}>{w.Replica}</button>
          })
        }} />
      <Mosaico titulo={`${base} vs tiempo · ${modo === 'media' ? `media ± ${etqErr}` : s.porCepa ? 'todos los pocillos' : 'cada réplica'}`}>
        <Grafico series={series} yTxt={ETQ_Y[escala] + (modo === 'media' ? ` (media ± ${etqErr})` : '')} alto={470} nombre={`curva_${exp.nombre}`}
          titulo={exp.nombre} estilo={s.estiloGrafico('curva')} idEstilo="curva" onPuntoClick={modo === 'media' ? abrir : undefined} />
        {modo === 'media' && <p className="ayuda" style={{ marginTop: 8 }}>Cada punto es la media de las réplicas visibles de la cepa en ese tiempo; {exp.origenOd === 'tecan' ? 'la banda' : 'la barra'} es la {nombreErr}; n = réplicas técnicas (pocillos o series) de un mismo experimento{s.porCepa ? ', es decir, pocillos por tiempo' : ''}, y la leyenda indica el rango de n cuando cambia por exclusiones. En escalas logarítmicas se transforma cada réplica antes de promediar. Clic en un punto: cómo se calculó. Arrastrá sobre el gráfico para acercar y hacé doble clic para volver; clic derecho para personalizarlo o guardarlo.{nBajo && <b className="aviso-texto"> Hay tiempos con n &lt; 3: el error ({etqErr}) tiene muy poca base{error === 'ic95' ? ' y el IC 95 % con n = 2 usa t = 12,7' : ''}.</b>}</p>}
        <div className="fila" style={{ marginTop: 6 }}>
          <span className="ayuda">μmax, lag, K y el resto de los parámetros, con cómo se calculó cada uno, están en Parámetros.</span>
          <span className="espacio" />
          <button className="chico" onClick={() => s.irA('parametros')}>Ver parámetros<Icono n="flecha" size={13} /></button>
        </div>
      </Mosaico>
    </div>
  )
}
