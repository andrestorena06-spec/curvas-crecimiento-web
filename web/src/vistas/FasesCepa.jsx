// ============================================================
// Fases de una cepa (lag · exponencial · estacionaria) en la Revisión de la OD: se sombrean en la curva de cada cepa y,
// al abrir «Fases…», la curva se amplía y se elige qué puntos forman la fase exponencial (el tramo que arma la recta de
// «Linealizar log₁₀»). El tramo elegido queda guardado y es el que muestran después «Curva OD vs t» y los parámetros.
// ============================================================
import { finito } from '../motor/analisis.js'
import { Campo, Modal, Sel } from '../ui/base.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fx } from '../utils.js'

export const COLORES_FASES = { lag: '#5B8DB8', exp: '#D98B2B', est: '#7A8794' }

// zonas sombreadas de las tres fases según la ventana exponencial de las filas de resultados de la cepa
export function zonasVentana(ven, tMin, tMax, rotular = false) {
  if (!ven || !finito(ven[0]) || !finito(ven[1]) || !finito(tMin) || !finito(tMax)) return []
  return [
    { x0: tMin, x1: ven[0], color: COLORES_FASES.lag, etiqueta: rotular ? 'Lag' : '' },
    { x0: ven[0], x1: ven[1], color: COLORES_FASES.exp, etiqueta: rotular ? 'Exponencial' : '' },
    { x0: ven[1], x1: tMax, color: COLORES_FASES.est, etiqueta: rotular ? 'Estacionaria' : '' },
  ]
}
// Ventana automática de una cepa: la mediana de las ventanas de sus réplicas (con una curva por réplica cada pocillo tiene la suya)
const mediana = (v) => { const a = v.slice().sort((x, y) => x - y), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2 }
export function ventanaDeFilas(filas) {
  const f = (filas || []).filter((r) => finito(r.t_ini_ventana) && finito(r.t_fin_ventana))
  return f.length ? [mediana(f.map((r) => r.t_ini_ventana)), mediana(f.map((r) => r.t_fin_ventana))] : null
}
export function zonasFases(filas, tMin, tMax, rotular = false, elegida = null) {
  return zonasVentana(elegida || ventanaDeFilas(filas), tMin, tMax, rotular)
}
// ¿alguna fila de OD no pudo usar el tramo elegido? (menos de 3 lecturas con OD ≥ mínimo en ese tramo: usa el automático)
export const odSinTramo = (filas, elegida) => !!elegida && (filas || []).some((r) => !r.ventana_manual)
// tramo de OD elegido a mano para una cepa (el de la primera réplica que lo tenga)
export const ventanaOdElegida = (s, filas) => (filas || []).map((r) => s.exp.E.ventanas[r.Pocillo]).find(Boolean) || null

const cercano = (ts, v) => ts.reduce((m, t) => (Math.abs(t - v) < Math.abs(m - v) ? t : m), ts[0])

// origen: 'od' o 'ufc'. El tramo de la OD y el de las UFC son INDEPENDIENTES (cada medición tiene su fase exponencial);
// la calibración usa los tiempos donde los dos coinciden.
export function ModalFases({ s, cepa, filas = [], ventana, series, extras, tiempos, yTxt = 'OD', origen = 'od', onClose }) {
  const ufc = origen === 'ufc'
  const ts = [...new Set(tiempos)].sort((a, b) => a - b)
  const filasOd = (s.res || []).filter((r) => r.Muestra === cepa)
  const elegidaOd = ventanaOdElegida(s, filasOd)
  const elegidaUfc = s.exp.aj.ufc_ventana?.[cepa] ?? s.exp.aj.calib_ventana?.[cepa] ?? null
  const ven = ufc ? (elegidaUfc || ventana) : (elegidaOd || ventana || ventanaDeFilas(filas))
  const manual = ufc ? !!elegidaUfc : !!elegidaOd
  const ini = ven ? cercano(ts, ven[0]) : ts[0], fin = ven ? cercano(ts, ven[1]) : ts[ts.length - 1]
  const aplicar = (v) => (ufc ? s.setTramoUfc(cepa, v) : s.setTramoOd(filasOd.map((r) => r.Pocillo), v))
  const nEn = (a, b) => ts.filter((t) => t >= a - 1e-9 && t <= b + 1e-9).length
  const cambiar = (a, b) => { if (nEn(a, b) >= 3) aplicar([a, b]); else s.avisar?.('La fase exponencial necesita al menos 3 tiempos.') }
  const opciones = ts.map((t) => [String(t), `${fx(t, t % 1 ? 2 : 0)} h`])
  const zonas = zonasVentana(ven, ts[0], ts[ts.length - 1], true)
  return (
    <Modal titulo={<>Fases · {cepa}</>} ancho={940} onClose={onClose}
      pie={<>{manual && <button onClick={() => aplicar(null)}>Tramo automático</button>}<button className="primario" onClick={onClose}>Listo</button></>}>
      <div className="fila" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <Campo label="La fase exponencial empieza en"><Sel value={String(ini)} onChange={(v) => { const a = Number(v); cambiar(a, Math.max(fin, a)) }} opciones={opciones} /></Campo>
        <Campo label="y termina en"><Sel value={String(fin)} onChange={(v) => { const b = Number(v); cambiar(Math.min(ini, b), b) }} opciones={opciones} /></Campo>
        <span className="ayuda" style={{ flex: 1, minWidth: 260 }}>{ven ? <>Lag hasta {fx(ven[0], 2)} h · exponencial de {fx(ven[0], 2)} a {fx(ven[1], 2)} h ({manual ? 'elegida a mano' : 'automática'}) · estacionaria desde {fx(ven[1], 2)} h.</> : 'Sin fase exponencial detectada: elegí el tramo con las listas o arrastrando sobre el gráfico.'} Arrastrá sobre el gráfico para elegir el tramo: los extremos se ajustan al tiempo medido más cercano. {ufc ? ' Esos puntos arman la recta de «Linealizar log₁₀» de las UFC.' : ' Esos puntos arman la recta de «Linealizar log₁₀» de la OD.'} Es independiente del tramo {ufc ? 'de la OD' : 'de las UFC'}: la calibración usa los tiempos donde los dos coinciden.</span>
      </div>
      {!ufc && odSinTramo(filasOd, elegidaOd) && <p className="aviso-texto" style={{ margin: '0 0 6px' }}>⚠ En este tramo la OD de {cepa} no tiene 3 lecturas con OD suficiente para el logaritmo: sus parámetros de OD usan el tramo automático.</p>}
      <Grafico series={series} extras={extras} yTxt={yTxt} alto={420} zonas={zonas} tiemposSnap={ts} onSeleccion={(v) => cambiar(v[0], v[1])} nombre={`fases_${cepa}`} idEstilo="cepaFases" />
    </Modal>
  )
}
