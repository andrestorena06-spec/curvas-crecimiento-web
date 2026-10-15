import { estadoVacio } from './motor/pipeline.js'
import { normalizarUfc, ufcVacio } from './motor/ufc.js'
import { manualDef, normalizarManual } from './motor/odmanual.js'

export const MODOS = {
  od: { titulo: 'Solo OD', texto: 'Curvas de crecimiento por densidad óptica: lector de microplacas (Tecan u otro), placas leídas por separado o lecturas manuales con cubeta.' },
  ambos: { titulo: 'OD + conteo', texto: 'Curva de OD y recuento de UFC de las mismas muestras: se comparan, se calibra la OD contra las UFC y se estiman UFC/mL desde la OD.' },
  conteo: { titulo: 'Solo conteo', texto: 'Recuento de UFC por placa o por gota con diluciones seriadas: UFC/mL con su intervalo de confianza, curvas y parámetros de crecimiento.' },
}
export const ORIGENES_OD = {
  tecan: { titulo: 'Excel del lector (Tecan u otro)', texto: 'Cinética: una curva por pocillo (A1 a H12) con el tiempo. Formatos «Time [s]», columna de tiempo, o bloques T=0, T=1…' },
  placa: { titulo: 'Excel por pocillos (formato Biofilm)', texto: 'Una placa de 96 por lectura (matriz A–H × 1–12); cada archivo u hoja es un tiempo. Con varias lecturas se arma la curva de cada pocillo.' },
  manual: { titulo: 'Manual (espectrofotómetro, cubeta)', texto: 'Escribís o pegás la OD de cada muestra, réplica y tiempo, con las diluciones que hagan falta para quedar en la zona lineal del equipo.' },
}

export const condDef = () => ({
  organismo: '', medio: '', temperatura: '', equipo: '', lambda: 600, fecha: '', notas: '', origenOdMuestra: 'misma',
})

export const hayOd = (e) => !!e && e.modo !== 'conteo'
export const hayConteo = (e) => !!e && e.modo !== 'od'
// ¿la OD viene por pocillos (placa)? Si es manual se arman series «virtuales»
export const odPorPocillos = (e) => hayOd(e) && e.origenOd !== 'manual'

let _n = 0
export const nuevoId = () => Math.random().toString(36).slice(2, 10) + (_n++ % 10)

export const expVacio = (nombre, modo = 'od', origenOd = 'tecan') => ({
  id: nuevoId(), nombre, modo, origenOd, cond: condDef(),
  archivo: null, datos: null, preview: null, lecturas: [], manual: manualDef(),
  config: [], E: estadoVacio(), blancosSel: null, selMuestras: null, selReps: {}, ufc: ufcVacio(),
})

// JSON guarda NaN como null: se restituye al leer
const reviveDatos = (d) => (d && d.tiempos && d.pocillos ? {
  tiempos: d.tiempos.map((x) => (x === null ? NaN : x)),
  pocillos: Object.fromEntries(Object.entries(d.pocillos).map(([k, v]) => [k, v.map((x) => (x === null ? NaN : x))])),
} : null)

export const normExp = (x) => ({
  ...expVacio(x.nombre || 'Experimento', x.modo || (x.datos ? 'od' : 'conteo'), x.origenOd || 'tecan'), ...x,
  cond: { ...condDef(), ...(x.cond || {}) },
  datos: reviveDatos(x.datos), E: { ...estadoVacio(), ...(x.E || {}) }, config: x.config || [], selReps: x.selReps || {},
  lecturas: Array.isArray(x.lecturas) ? x.lecturas : [], manual: normalizarManual(x.manual), ufc: normalizarUfc(x.ufc),
})
export const expsDe = (g) => (Array.isArray(g.exps) ? g.exps.map(normExp) : [])
