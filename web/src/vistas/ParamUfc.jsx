// ============================================================
// Parámetros de crecimiento por recuento (modelos de DMFit): selector de modelo, tabla por cepa (cada número abre su
// ficha «Cómo se calculó»), avisos del ajuste, ecuación y calculadora. Es el mismo ajuste de la curva, la predicción y la
// calibración (ajusteCepaUfc).
// ============================================================
import { finito } from '../motor/analisis.js'
import { MODELOS_UFC, ajusteCepaUfc, crecimientoUfc, mcurvUfc, modeloUfc, nmaxFijado, predDe, puntosUfc } from '../motor/ufc.js'
import { Icono, Num } from '../ui/base.jsx'
import { CampoCinta, Grupo, OpcionesCinta } from '../ui/cinta.jsx'
import { EcuacionModelo } from '../ui/ecuacion.jsx'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { fichaAumentoUfc, fichaModeloUfc } from '../fichas/definiciones.js'
import { fs, fx } from '../utils.js'

export const crecimientoPorCepa = (ufcRes, aj) => [...new Set(ufcRes.res.map((r) => r.Muestra))].map((m) => ({ Muestra: m, c: crecimientoUfc(ufcRes, m, aj) }))
// Sin curva / Linealizar log₁₀ / Baranyi y Roberts: el mismo grupo en Curva OD y en Curva UFC
export const OPCIONES_MODELO_UFC = [
  ['no', 'Sin curva', '·', null, 'Solo los puntos, sin la curva del modelo'],
  ['lineal', 'Linealizar log₁₀', '⟋', null, 'Linealizar log₁₀: recta de ln N contra t en la fase exponencial (la ventana de mayor pendiente), como μmax'],
  ['baranyi', 'Baranyi y Roberts', '∫', null, 'Baranyi y Roberts: lag, fase exponencial y asíntota, ajustado a todos los puntos (4 o más tiempos)'],
  ['huang', 'Huang', 'H', null, 'Huang (2008): lag, fase exponencial y asíntota con una transición más suave; el lag λ es un parámetro directo del ajuste (4 o más tiempos)'],
]

// selector del modelo (va en la cinta de Curva UFC y de Parámetros: es el mismo ajuste)
export function GrupoModeloUfc({ s }) {
  return (
    <Grupo titulo="Modelo">
      <OpcionesCinta valor={s.exp.aj.ufc_suave === false ? 'no' : modeloUfc(s.exp.aj)} onChange={(x) => s.upd((e) => ({ aj: { ...e.aj, ufc_suave: x !== 'no', ...(x !== 'no' ? { ufc_modelo: x } : {}) } }))} opciones={OPCIONES_MODELO_UFC} />
    </Grupo>
  )
}
// opciones del ajuste: puntos usados, curvatura m y N máx fijado
export function GruposOpcionesModeloUfc({ s }) {
  const aj = s.exp.aj
  const pred = predDe(aj)
  const mc = mcurvUfc(aj)
  const setPred = (k, x) => s.upd((e) => ({ aj: { ...e.aj, ufc_pred: { ...predDe(e.aj), [k]: x } } }))
  return (<>
    <Grupo titulo="Puntos del ajuste">
      <OpcionesCinta valor={aj.ufc_datos === 'replicas' ? 'replicas' : 'medias'} onChange={(x) => s.setAj('ufc_datos', x)} opciones={[['medias', 'Valor de cada tiempo', 'x̄', null, 'Ajustar al valor de cada tiempo (Σ C / Σ V o media geométrica, según «Valor de cada tiempo» en Curva UFC vs t)'], ['replicas', 'Cada réplica', '⋮', null, 'Ajustar a cada réplica incluida (todas las observaciones)']]} />
    </Grupo>
    {modeloUfc(aj) !== 'lineal' && (
      <Grupo titulo={MODELOS_UFC[modeloUfc(aj)]}>
        {modeloUfc(aj) === 'baranyi' && <OpcionesCinta valor={mc === 1 ? '1' : mc === 10 ? '10' : ''} onChange={(x) => s.setAj('ufc_mcurv', Number(x))} opciones={[
          ['1', 'm = 1', 'm₁', null, 'Curvatura hacia la meseta m = 1 (Baranyi y Roberts 1994, forma habitual; por defecto)'],
          ['10', 'm = 10', 'm₁₀', null, 'Curvatura m = 10: transición más brusca a la fase estacionaria\nDMFit (ComBase) tiene un parámetro de curvatura mCurv: mirá su valor en «Generic control parameters» de DMFit'],
        ]} />}
        {modeloUfc(aj) === 'baranyi' && <CampoCinta etiqueta="m" tip={'Curvatura hacia la meseta (otro valor, > 0)\ny = y₀ + μA − (1/m)·ln[1 + (e^{mμA} − 1)/e^{m(y máx − y₀)}]'}><Num value={aj.ufc_mcurv ?? 1} onChange={(x) => { if (x === '' || x > 0) s.setAj('ufc_mcurv', x === '' ? 1 : x) }} ancho={48} /></CampoCinta>}
        <CampoCinta etiqueta="Lag fijo (h)" tip={'Fijar el lag λ (horas) en el ajuste: estabiliza μ cuando hay pocos puntos, porque μ y el lag se compensan entre sí\nVacío: lo estima el ajuste'}><Num value={aj.ufc_lagfijo ?? ''} onChange={(x) => s.setAj('ufc_lagfijo', x === '' ? '' : x)} ancho={52} /></CampoCinta>
        <CampoCinta etiqueta="N máx (log₁₀)" tip={'Nivel de la fase estacionaria fijado (por ejemplo, el de otros ensayos en el mismo medio)\nSi tiene un valor, se usa en la tabla, la curva, la predicción y las fases de la calibración\nVacío: lo estima el ajuste. Tiene que ser mayor que el máximo observado.'}><Num value={pred.nmax} onChange={(x) => setPred('nmax', x)} ancho={58} placeholder="auto" /></CampoCinta>
      </Grupo>
    )}
  </>)
}

// tabla de parámetros por cepa, avisos, ecuación y calculadora
export function SeccionUfc({ s, muestras }) {
  const { exp, ufcRes } = s
  const aj = exp.aj
  const modelo = modeloUfc(aj)
  const mc = mcurvUfc(aj)
  const nmaxF = nmaxFijado(aj)
  const crec = crecimientoPorCepa(ufcRes, aj).filter(({ Muestra }) => !muestras || muestras.includes(Muestra))
  const f = (m, c, foco) => () => fichaModeloUfc(c, puntosUfc(ufcRes, m, aj), { foco, nombre: m, color: s.colores[m], datos: aj.ufc_datos })
  const fa = (m, c, foco) => () => fichaAumentoUfc(c, { foco, nombre: m })
  const celda = (m, c, foco, txt, tip) => <td className="num" data-tip={tip}><Valor f={f(m, c, foco)}>{txt}</Valor></td>
  const av = crec.flatMap(({ Muestra, c }) => [...(c.ok ? c.avisos || [] : []).map((a) => [Muestra, a]), ...(c.avisosPuntos || []).map((a) => [Muestra, `${a}: no entra al ajuste de crecimiento.`])])
  return (
    <div className="tarjeta">
      <div className="fila" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Parámetros de crecimiento por recuento <span className="ayuda" style={{ fontWeight: 400 }}>· {MODELOS_UFC[modelo]}{modelo === 'baranyi' ? `, m = ${fs(mc, 3)}` : ''}, ajustado a {aj.ufc_datos === 'replicas' ? 'cada réplica' : 'el valor de cada tiempo'} {modelo === 'lineal' ? '(fase exponencial)' : 'con todos los puntos (como DMFit)'}. Clic en un número: cómo se calculó.</span></h2>
      </div>
      <div className="tabla-scroll alta"><table className="tabla">
        <thead><tr><th>Cepa</th><th className="num" data-tip="Velocidad máxima de crecimiento en log₁₀ UFC/mL por hora («Rate» de DMFit)">Velocidad (log₁₀/h)</th><th className="num" data-tip="μ = velocidad × ln 10">μ (h⁻¹)</th><th className="num" data-tip="td = ln 2 / μ, en horas">td (h)</th><th className="num" data-tip="λ = h₀ / μ (el modelo lineal no tiene lag)">Lag λ (h)</th><th className="num" data-tip="Valor inicial del modelo">y₀ (log₁₀)</th><th className="num" data-tip="Asíntota del modelo (solo Baranyi y Roberts)">y máx (log₁₀)</th><th className="num">R²</th><th className="num" data-tip="Error estándar del ajuste = √(SSE / (n − p)), en log₁₀">EE ajuste</th><th className="num">Puntos</th><th className="num" data-tip={'Grados de libertad = puntos − parámetros del modelo\n(lineal 2; Baranyi y Roberts 4, o 3 con N máx fijado; bifásico 3)\nCon 0 o 1 el modelo pasa casi por todos los puntos: parámetros poco identificables'}>n − p</th><th className="num" data-tip="Lo que sube la curva del modelo entre el primer y el último tiempo medido">Aumento (log₁₀)</th><th className="num" data-tip="Aumento / log₁₀ 2">Generaciones</th></tr></thead>
        <tbody>{crec.map(({ Muestra: m, c }) => (
          <tr key={m}><td><i className="punto" style={{ background: s.colores[m], marginRight: 6 }} /><b>{m}</b></td>
            {c.ok ? <>
              {celda(m, c, 'rate', fx(c.rate, 3))}{celda(m, c, 'mu', <>{fs(c.mu, 4)}{finito(c.ee_mu) && <small className="ayuda"> ± {fs(c.ee_mu, 2)}</small>}</>)}{celda(m, c, 'td', fs(c.td_h, 4))}{celda(m, c, 'lag', finito(c.lag_h) ? <>{fs(c.lag_h, 3)}{finito(c.ee_lag) && c.ee_lag > 0 && <small className="ayuda"> ± {fs(c.ee_lag, 2)}</small>}{c.lagFijo && <small className="ayuda"> (fijo)</small>}</> : '–')}
              {celda(m, c, 'y0', fx(c.y0, 2))}{celda(m, c, 'yEnd', finito(c.yEnd) ? fx(c.yEnd, 2) : c.sinAsintota ? 'sin meseta' : '–', c.sinAsintota ? 'Los recuentos no llegan a la fase estacionaria: la asíntota no se puede estimar.\nFijá N máx (log₁₀) en «Más opciones» o usá el modelo Linealizar log₁₀.' : undefined)}
              {celda(m, c, 'r2', fx(c.r2, 3))}{celda(m, c, 'se', fx(c.se, 3))}<td className="num">{c.n}</td>
              <td className="num" style={{ color: c.gl <= 1 ? 'var(--aviso)' : undefined }}><Valor f={f(m, c, 'gl')}>{finito(c.gl) ? c.gl : '–'}</Valor>{(c.avisos || []).length > 0 && <span className="aviso-texto" data-tip={c.avisos.join('\n\n')}> ⚠</span>}</td>
              <td className="num"><Valor f={fa(m, c, 'aumento')}>{fx(c.crecimiento_log10, 2)}</Valor></td><td className="num"><Valor f={fa(m, c, 'gen')}>{fx(c.generaciones, 2)}</Valor></td>
            </> : <td colSpan={12} className="ayuda">{c.motivo}</td>}
          </tr>
        ))}</tbody>
      </table></div>
      {av.length > 0 && <div className="aviso-caja" style={{ marginTop: 8 }}>{av.map(([m, a], i) => <div key={i}><b>{m}:</b> {a}</div>)}</div>}
      <EcuacionModelo tipo="ufc" nombreArchivo="modelo UFC" nota={`${MODELOS_UFC[modelo]}${modelo === 'baranyi' ? `, curvatura m = ${fs(mc, 3)}${finito(nmaxF) ? `, N máx fijado en ${fx(nmaxF, 2)} log₁₀` : ''}` : ''}, sobre log₁₀(UFC/mL). Es el mismo ajuste de la curva, la predicción y la calibración.`}
        filas={crec.map(({ Muestra, c }) => {
          const cc = c.ok && c.sinAsintota ? { ok: false, motivo: 'Los recuentos no llegan a la fase estacionaria: la asíntota no se puede estimar. Fijá N máx (log₁₀) en «Más opciones» o usá el modelo Linealizar log₁₀.' } : c
          return { id: Muestra, nombre: Muestra, color: s.colores[Muestra], c: cc }
        })} />
    </div>
  )
}
