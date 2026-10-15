import { estadoVacio } from './motor/pipeline.js'
import { normalizarUfc, ufcVacio } from './motor/ufc.js'
import { manualDef, normalizarManual } from './motor/odmanual.js'

export const MODOS = {
  od: { titulo: 'Solo OD', texto: 'Densidad óptica en el tiempo: μmax, tiempo de duplicación y lag.' },
  ambos: { titulo: 'OD + conteo', texto: 'OD y UFC/mL de las mismas muestras: comparación y calibración OD–UFC.' },
  conteo: { titulo: 'Solo conteo', texto: 'UFC/mL por diluciones seriadas: IC 95 %, curva y parámetros de crecimiento.' },
}
export const ORIGENES_OD = {
  tecan: { titulo: 'Excel del lector (Tecan)', texto: 'Cinética: una curva por pocillo (A1–H12).' },
  placa: { titulo: 'Excel por pocillos (formato Biofilm)', texto: 'Una placa de 96 por lectura; cada archivo u hoja es un tiempo.' },
  manual: { titulo: 'Manual (espectrofotómetro)', texto: 'Cubeta: OD por muestra, réplica y tiempo, con diluciones.' },
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
