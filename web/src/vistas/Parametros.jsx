// ============================================================
// Parámetros: todos los resultados en un solo lugar, en secciones
//   · Por OD: resumen por cepa, detalle de una curva (su ventana de μmax) y tabla de todas las curvas
//   · Por recuento: el ajuste estilo DMFit de cada cepa (ParamUfc.jsx)
//   · OD vs recuento: μ de las dos mediciones lado a lado
// Cada número abre con un clic su ficha «Cómo se calculó».
// ============================================================
import { useMemo, useState } from 'react'
import { useOpcion } from '../ui/opciones.js'
import { AYUDA, MODELOS_ETQ, PARAMS } from '../ayuda.js'
import { desvio, finito, media } from '../motor/analisis.js'
import { ajustarModelo } from '../motor/modelos.js'
import { nombreReplica, opAnalisis } from '../motor/pipeline.js'
import { MODELOS_UFC, ajusteDmfit, puntosUfc } from '../motor/ufc.js'
import { useTema } from '../tema.js'
import { Campo, Encabezado, Num, Seg, Sel, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { EcuacionModelo } from '../ui/ecuacion.jsx'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { fichaComparacion, fichaMediaTiempo, fichaModeloUfc, fichaParamOd, fichaResumen } from '../fichas/definiciones.js'
import { fs, fx, tCuantil } from '../utils.js'
import { mediaPorTiempo } from './Curva.jsx'
import { GrupoModeloUfc, GruposOpcionesModeloUfc, OPCIONES_MODELO_UFC, SeccionUfc, crecimientoPorCepa } from './ParamUfc.jsx'

export const CLAVES_RESUMEN = ['mu_max', 'td_min', 'lag_h', 'K', 'delta_od', 'generaciones', 'auc_od', 't_umbral_od_h', 'od0', 'r2']
// tabla de todas las curvas: las columnas principales y, con «Más columnas», el resto
const CLAVES_PRINCIPALES = ['od0', 'mu_max', 'td_min', 'lag_h', 'K', 'generaciones', 'auc_od', 'r2']
const CLAVES_TABLA = ['od0', 'mu_max', 'td_min', 'lag_h', 'K', 't_K_h', 'delta_od', 'generaciones', 'auc_od', 'auc_ln', 't_umbral_od_h', 'dod_max', 't_max_dod_h', 'mu_spline', 't_estacionaria', 't_muerte', 'caida_pct', 'r2']
export const tipDe = (k) => (AYUDA[k] ? `${PARAMS[k]}\n${AYUDA[k].sig}\n\n${AYUDA[k].interp}` : PARAMS[k])

// Resumen por cepa: media, DE e IC 95 % entre réplicas.
//   · Varias filas por cepa (una por pocillo/serie): n = número de réplicas técnicas (pocillos o series) de UN experimento;
//     el «±» es la DE entre ellas.
//   · Una sola fila por cepa (placas por tiempo: una curva por cepa): n = pocillos por tiempo y el único error
//     disponible es el EE de la pendiente de μmax (se_mu), que NO es variabilidad entre réplicas.
//   · r[k].n = valores finitos que entraron en la media de ese parámetro (puede ser menor que n si alguna réplica no lo dio).
//   · td = ln 2 / μ̄ (con la μ media), no el promedio de los td; su DE e IC se propagan de los de μ (primer orden).
//   · R² no se promedia ni lleva DE (es la calidad de cada ajuste, no una magnitud): se informa el más bajo (el peor ajuste).
export function resumenPorCepa(res, claves = CLAVES_RESUMEN) {
  const muestras = [...new Set(res.map((r) => r.Muestra))]
  return muestras.map((m) => {
    const g = res.filter((r) => r.Muestra === m)
    const unico = g.length === 1
    const placas = unico && g[0].n_pocillos
    // placas por tiempo: n = pocillos de la cepa en cada tiempo (la curva junta los de todos los tiempos)
    const nTxt = placas ? (g[0].n_por_tiempo_min && g[0].n_por_tiempo_min !== g[0].n_por_tiempo_max ? `${g[0].n_por_tiempo_min}–${g[0].n_por_tiempo_max}` : String(g[0].n_por_tiempo_max || g[0].n_pocillos)) : String(g.length)
    const out = { Muestra: m, n: placas ? g[0].n_por_tiempo_max || g[0].n_pocillos : g.length, nTxt, n_lecturas: placas ? g[0].n_lecturas : NaN, n_curvas: g.length, unico,
      unidad: placas ? 'pocillos por tiempo' : 'réplicas', se_mu: unico ? g[0].mu_se : NaN }
    claves.forEach((k) => {
      const v = g.map((r) => r[k]).filter(finito)
      const n = v.length
      if (k === 'r2') { out[k] = { m: n ? Math.min(...v) : NaN, sd: NaN, n, ic: NaN, minimo: true }; return }
      const mm = media(v), sd = n > 1 ? desvio(v) : NaN
      out[k] = { m: mm, sd, n, ic: n > 1 ? (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n) : NaN }
    })
    if (claves.includes('td_min')) {
      const v = g.map((r) => r.mu_max).filter(finito)
      const n = v.length, mu = media(v), sd = n > 1 ? desvio(v) : NaN
      if (n && mu > 0) {
        const td = (Math.LN2 / mu) * 60, f = td / mu     // d td / d μ = −td / μ (en valor absoluto)
        out.td_min = { m: td, sd: finito(sd) ? f * sd : NaN, n, ic: n > 1 ? f * ((tCuantil(0.975, n - 1) * sd) / Math.sqrt(n)) : NaN, deMu: true }
      } else out.td_min = { m: NaN, sd: NaN, n: 0, ic: NaN, deMu: true }
    }
    return out
  })
}

// Texto del «±» de una celda del resumen.
//   tipo: 'DE' (entre réplicas técnicas), 'EE' (error estándar de la pendiente de μmax, una sola curva por cepa) o null
export function celdaResumen(r, k) {
  const c = r[k]
  const ee = r.unico && k === 'mu_max' && finito(r.se_mu)
  const tipo = finito(c.sd) ? 'DE' : ee ? 'EE' : null
  const err = tipo === 'DE' ? c.sd : tipo === 'EE' ? r.se_mu : NaN
  return { tipo, err, pocoN: !r.unico && c.n > 1 && c.n < 3 }
}

// ficha de una celda del resumen por cepa: con una sola curva por cepa, la del parámetro de esa curva; si no, media ± DE
const etiquetaRep = (s) => (x) => `${nombreReplica(x.Muestra, x.Replica)}${s.exp.origenOd === 'tecan' ? ` (${x.Pocillo})` : ''}`
export const opcFicha = (s, m) => ({ nombre: m, color: s.colores[m], todos: s.porCepa && s.modoCurva === 'puntos' })
export function fichaCeldaResumen(s, r, k) {
  return () => {
    const filas = (s.res || []).filter((x) => x.Muestra === r.Muestra)
    if (r.unico) {
      const fila = filas[0]
      return fichaParamOd(k, fila, s.seriesAn.find((w) => w.Pocillo === fila.Pocillo), opAnalisis(s.serie.aj), opcFicha(s, r.Muestra))
    }
    return fichaResumen(r, k, filas, { etiqueta: etiquetaRep(s) })
  }
}
export const fichaCurva = (s, fila, k) => () => fichaParamOd(k, fila, s.seriesAn.find((w) => w.Pocillo === fila.Pocillo), opAnalisis(s.serie.aj),
  { ...opcFicha(s, fila.Muestra), nombre: s.porCepa ? fila.Muestra : `${nombreReplica(fila.Muestra, fila.Replica)}${s.exp.origenOd === 'tecan' ? ` (${fila.Pocillo})` : ''}` })

// Contenido de una celda del resumen: valor ± error (con la marca del tipo) y n del parámetro si difiere
export function CeldaResumen({ r, k, s }) {
  const c = celdaResumen(r, k)
  return (
    <td className="num">
      <Valor f={s ? fichaCeldaResumen(s, r, k) : null}>{fs(r[k].m, 4)}{c.tipo ? <small className="ayuda"> ± {fs(c.err, 2)}{c.tipo === 'EE' ? ' (EE)' : ''}</small> : null}</Valor>
      {!r.unico && r[k].n < r.n_curvas && r[k].n > 0 ? <small className="ayuda"> [n={r[k].n}]</small> : null}
      {c.pocoN ? <small style={{ color: 'var(--aviso)' }} data-tip="n < 3: DE e IC 95 % poco confiables"> ⚠</small> : null}
    </td>
  )
}

// Rótulos de n y de «±» para el encabezado de la tabla y el texto al pie
export const textoErrorResumen = (porCepa) => porCepa
  ? 'n = pocillos de la cepa en cada tiempo (la curva de la cepa junta los de todos los tiempos). «± … (EE)» = error estándar de la pendiente de μmax (ruido dentro de la ventana; no mide la variación entre réplicas). Los demás parámetros salen de una sola curva y no tienen error.'
  : 'n = réplicas técnicas (pocillos o series) de UN experimento; «±» = desviación estándar entre ellas. No son réplicas biológicas independientes: para generalizar hay que repetir el experimento. [n=…] indica que algún parámetro no pudo calcularse en todas las réplicas. td = ln 2 / μ̄ (con la μ media). R²: el más bajo de las réplicas (no se promedia).'
export const avisoNBajo = (resumen) => {
  const poco = resumen.filter((r) => !r.unico && r.n_curvas < 3).map((r) => `${r.Muestra} (n = ${r.n_curvas})`)
  return poco.length ? `Con n < 3 la DE y el IC 95 % tienen muy poca base: ${poco.join(', ')}.` : null
}

// ---------- detalle de una curva: ln(OD), ventana de μmax y comparación con modelos ----------
function Detalle({ s, p }) {
  const T = useTema()
  const [modelos, setModelos] = useState(null)
  const w = s.seriesAn.find((x) => x.Pocillo === p)
  const r = s.res.find((x) => x.Pocillo === p)
  if (!w || !r) return null
  const tH = w.t.map((t) => t / 3600)
  const col = s.estilos[p]?.color || T.acento
  // placas por tiempo sin promediar: se dibujan todos los pocillos; si no, la curva analizada
  const tp = s.porCepa && s.modoCurva === 'puntos' ? w.tPts.map((t) => t / 3600) : tH
  const yp = s.porCepa && s.modoCurva === 'puntos' ? w.yPts : w.y
  const datosLn = tp.map((t, i) => ({ x: t, y: yp[i] > 0 ? Math.log(yp[i]) : NaN, tip: `t = ${fx(t, 2)} h\nln(OD) = ${fx(Math.log(yp[i]), 3)}` }))
  const series = [{ id: 'ln', nombre: 'ln(OD)', color: col, puntos: true, radio: 2.6, linea: false, data: datosLn }]
  if (finito(r.mu_max)) {
    const x0 = Math.max(tH[0], r.lag_h - 0.5), x1 = Math.min(tH[tH.length - 1], r.t_fin_ventana + 1.5)
    series.push({ id: 'tan', nombre: `Tangente: μmax = ${fx(r.mu_max, 3)} h⁻¹`, color: T.acento2, ancho: 1.6, dash: '6 4', data: [x0, x1].map((x) => ({ x, y: r.intercepto + r.mu_max * x })) })
    if (finito(r.od0)) series.push({ id: 'od0', nombre: `ln OD₀ (lag = ${fx(r.lag_h, 2)} h)`, color: T.sec, ancho: 1, dash: '2 3', data: [tH[0], Math.max(r.lag_h + 1, tH[0] + 1)].map((x) => ({ x, y: Math.log(r.od0) })) })
  }
  ;(modelos || []).filter((m) => m.ok).forEach((m, i) => {
    series.push({ id: 'm' + m.modelo, nombre: `${MODELOS_ETQ[m.modelo]} (AIC ${fx(m.AIC, 1)})`, color: ['#E0975A', '#5FAE84', '#B48AC9', '#D9737A'][i % 4], ancho: 1.4,
      data: tH.map((t) => ({ x: t, y: m.pred_ln([t])[0] })) })
  })
  const ajustar = () => {
    const ms = Object.keys(MODELOS_ETQ).map((k) => ({ ...ajustarModelo(k, tH, w.y, r.od0, r.mu_max, r.lag_h, r.K), modelo: k }))
    setModelos(ms)
    s.avisar(`Modelos ajustados: ${ms.filter((m) => m.ok).length} de ${ms.length} convergieron.`)
  }
  const manual = !!s.exp.E.ventanas[p]
  const mejor = (modelos || []).filter((m) => m.ok).sort((a, b) => a.AIC - b.AIC)[0]
  return (
    <>
      <div className="fila" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{s.porCepa ? `${w.Muestra} · ${s.modoCurva === 'puntos' ? 'todos los pocillos' : 'media de cada tiempo'}` : nombreReplica(w.Muestra, w.Replica)}{s.exp.origenOd === 'tecan' ? ` · ${p}` : ''}</h2>
        {r.aviso && <span className="chip aviso" data-tip={r.aviso}>Aviso</span>}
        <span className="espacio" />
        {manual && <button className="chico" onClick={() => s.setVentana(p, null)}>Volver a la ventana automática</button>}
        <button className="chico" onClick={ajustar} data-tip="Ajustar Gompertz, logístico, Richards y Baranyi a toda la curva, para comparar (μmax sigue siendo el de la ventana)">Comparar con modelos</button>
      </div>
      <p className="ayuda" style={{ margin: 0 }}>Zona sombreada: ventana usada para μmax {manual ? '(fijada a mano)' : '(automática)'}. Arrastrá sobre el gráfico para elegir otra ventana. Clic en un valor: cómo se calculó.</p>
      <Grafico series={series} yTxt="ln(OD)" alto={330} ventana={[r.t_ini_ventana, r.t_fin_ventana]} onSeleccion={(v) => s.setVentana(p, v)} nombre={`ln_${p}`} estilo={s.estiloGrafico('parametros')} idEstilo="parametros" />
      <div className="grid-kpi" style={{ marginTop: 10 }}>
        {['mu_max', 'td_min', 'lag_h', 'K', 'od0', 'r2'].map((k) => (
          <div key={k} className="kpi"><small>{PARAMS[k]}</small><b><Valor f={fichaCurva(s, r, k)}>{fs(r[k], 4)}</Valor></b></div>
        ))}
      </div>
      {modelos && (
        <div className="tabla-scroll" style={{ marginTop: 6 }}><table className="tabla">
          <thead><tr><th>Modelo (toda la curva, para comparar)</th><th className="num">μ (h⁻¹)</th><th className="num">λ (h)</th><th className="num">K (OD)</th><th className="num">AIC</th><th className="num">BIC</th><th>Estado</th></tr></thead>
          <tbody>{modelos.map((m) => (
            <tr key={m.modelo}><td>{MODELOS_ETQ[m.modelo]}{mejor?.modelo === m.modelo && <span className="chip ok" style={{ marginLeft: 6 }}>menor AIC</span>}</td>
              <td className="num">{fs(m.mu, 4)}</td><td className="num">{fs(m.lambda, 3)}</td><td className="num">{fs(m.K, 3)}</td><td className="num">{fx(m.AIC, 1)}</td><td className="num">{fx(m.BIC, 1)}</td>
              <td>{m.ok ? 'Convergió' : 'No convergió'}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}

// ---------- sección «Por OD» ----------
function SeccionOd({ s, pers, setPers }) {
  const { res, exp } = s
  const [sel, setSel] = useOpcion('parametros.curva', null)
  const [errCepa, setErrCepa] = useOpcion('parametros.error', 'sd')
  const [bandaCepa, setBandaCepa] = useOpcion('parametros.errores', true)
  const [cepaSel, setCepaSel] = useState(null)   // cepa elegida en «Resumen por cepa»: su curva media va debajo
  const [todas, setTodas] = useOpcion('parametros.todasColumnas', false)
  const [modeloEc, setModeloEc] = useOpcion('curva.modeloEc', 'baranyi')
  const resumen = useMemo(() => (res?.length ? resumenPorCepa(res) : []), [res])
  if (!res?.length) return <Vacio titulo="Todavía no hay curvas de OD analizadas">{s.pre?.error || 'Completá la carga de datos y el control de calidad.'}</Vacio>
  const p = sel && res.some((r) => r.Pocillo === sel) ? sel : res[0].Pocillo
  const claves = todas ? CLAVES_TABLA : CLAVES_PRINCIPALES
  // modelo de la curva media de cada cepa (OD del análisis: corregida, sin suavizar ni normalizar), para comparar
  const wsA = (s.pre?.analisis || []).filter((w) => !w.EsBlanco)
  const ajustes = [...new Set(wsA.map((w) => w.Muestra))].map((m) => {
    const mt = mediaPorTiempo(wsA.filter((w) => w.Muestra === m), (v) => v, 'sd')
    const pos = mt.filter((q) => q.m > 0)
    const c = ajusteDmfit(pos.map((q) => q.t / 3600), pos.map((q) => Math.log(q.m)), modeloEc)
    const fuera = mt.length - pos.length
    const cc = !c.ok && fuera ? { ...c, motivo: `${c.motivo} ${fuera} de ${mt.length} tiempos tienen OD media ≤ 0, que no tiene logaritmo.` }
      : c.sinAsintota ? { ok: false, motivo: 'La OD no llega a la fase estacionaria: la asíntota no se puede estimar. Usá el modelo bifásico.' } : c
    return { id: m, nombre: fuera && cc.ok ? `${m} (sin ${fuera} tiempo${fuera > 1 ? 's' : ''} con OD ≤ 0)` : m, color: s.colores[m], c: cc }
  })
  return (<>
    <Cinta>
      <Grupo titulo="Curva">
        <CampoCinta etiqueta={s.porCepa ? 'Cepa' : 'Réplica'}><Sel value={p} onChange={setSel} opciones={res.map((r) => [r.Pocillo, s.porCepa ? r.Muestra : `${nombreReplica(r.Muestra, r.Replica)}${exp.origenOd === 'tecan' ? ` (${r.Pocillo})` : ''}`])} /></CampoCinta>
        <BotonCinta icono="refrescar" texto="Ventana automática" deshabilitado={!exp.E.ventanas[p]} onClick={() => s.setVentana(p, null)} />
      </Grupo>
      <Grupo titulo="μmax por ventana deslizante">
        <CampoCinta etiqueta="Ancho (h)"><Num value={exp.aj.an_ancho} onChange={(v) => s.setAj('an_ancho', v)} ancho={52} /></CampoCinta>
        <CampoCinta etiqueta="Puntos mín."><Num value={exp.aj.an_minpts} onChange={(v) => s.setAj('an_minpts', v)} ancho={52} /></CampoCinta>
        <CampoCinta etiqueta="R² mín."><Num value={exp.aj.an_r2} onChange={(v) => s.setAj('an_r2', v)} ancho={52} /></CampoCinta>
        <CampoCinta etiqueta="OD mín. ln" tip="Las lecturas por debajo no entran en ln(OD): cerca del blanco el ruido domina."><Num value={exp.aj.an_lnmin} onChange={(v) => s.setAj('an_lnmin', v)} ancho={56} /></CampoCinta>
      </Grupo>
      <Grupo titulo="Lag">
        <OpcionesCinta valor={exp.aj.an_lag_metodo} onChange={(v) => s.setAj('an_lag_metodo', v)} opciones={[['tangente', 'Tangente', '⟋'], ['umbral', 'Umbral', '⊢']]} />
        {exp.aj.an_lag_metodo === 'umbral' && <CampoCinta etiqueta="Factor × OD₀"><Num value={exp.aj.an_lag_factor} onChange={(v) => s.setAj('an_lag_factor', v)} ancho={52} /></CampoCinta>}
      </Grupo>
      <Grupo titulo="Más">
        <BotonCinta simbolo="∿" texto="Spline" activo={exp.aj.an_spline} onClick={() => s.setAj('an_spline', !exp.aj.an_spline)} tip="Calcular también μmax por spline de suavizado (para comparar)" />
        <BotonCinta icono="editar" texto="Umbrales y fases" activo={pers === 'fases'} onClick={() => setPers(pers === 'fases' ? null : 'fases')} tip="OD umbral (tiempo hasta OD) y criterios de las fases exponencial, estacionaria y de muerte" />
        <BotonCinta icono="editar" texto="Personalizar" activo={pers === 'parametros'} onClick={() => setPers(pers === 'parametros' ? null : 'parametros')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
      </Grupo>
    </Cinta>
    <Cajon titulo="Personalizar gráfico" abierto={pers === 'parametros'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="parametros" /></Cajon>
    <Cajon titulo="Umbrales y fases" abierto={pers === 'fases'} onClose={() => setPers(null)}>
      <div className="tarjeta ajustes">
        <h3>Umbral</h3>
        <Campo label="OD umbral (tiempo hasta OD)"><Num value={exp.aj.an_umbral_od} onChange={(v) => s.setAj('an_umbral_od', v)} /></Campo>
        <h3>Fases</h3>
        <Campo label="Exponencial: fracción de μmax"><Num value={exp.aj.an_frac_exp} onChange={(v) => s.setAj('an_frac_exp', v)} /></Campo>
        <Campo label="Estacionaria: fracción de μmax"><Num value={exp.aj.an_frac_est} onChange={(v) => s.setAj('an_frac_est', v)} /></Campo>
        <Campo label="Muerte: caída desde K (%)"><Num value={exp.aj.an_muerte_pct} onChange={(v) => s.setAj('an_muerte_pct', v)} /></Campo>
      </div>
    </Cajon>
    <div className="tarjeta">
      <h2>Resumen por cepa <span className="ayuda" style={{ fontWeight: 400 }}>· {s.porCepa ? `una curva por cepa (${s.modoCurva === 'puntos' ? 'todos los pocillos' : 'media de cada tiempo'}); μmax ± EE de la pendiente` : 'media ± DE entre réplicas técnicas (pocillos/series) de un experimento'} · clic en un número: cómo se calculó</span></h2>
      <div className="tabla-scroll alta"><table className="tabla">
        <thead><tr><th>Cepa</th><th className="num" data-tip={textoErrorResumen(s.porCepa)}>n</th>{CLAVES_RESUMEN.map((k) => <th key={k} className="num" data-tip={tipDe(k) + (k === 'td_min' ? '\n\nEn este resumen: td = ln 2 / μ̄ (con la μ media de la cepa), no el promedio de los td.' : '')}>{k === 'r2' && !s.porCepa ? 'R² (el más bajo)' : PARAMS[k]}</th>)}</tr></thead>
        <tbody>{resumen.map((r) => (
          <tr key={r.Muestra}><td><button className="fantasma chico" onClick={() => setCepaSel(cepaSel === r.Muestra ? null : r.Muestra)} data-tip={cepaSel === r.Muestra ? 'Ocultar su curva media' : 'Ver la curva media de esta cepa'}><i className="punto" style={{ background: s.colores[r.Muestra], marginRight: 6 }} /><b>{r.Muestra}</b></button></td>
            <td className="num" data-tip={`${r.nTxt} ${r.unidad}${r.unico ? ` (${r.n_lecturas} lecturas en la curva de la cepa)` : ' (réplicas técnicas de un experimento)'}`}>{r.nTxt} <small className="ayuda">{r.unidad}</small></td>
            {CLAVES_RESUMEN.map((k) => <CeldaResumen key={k} r={r} k={k} s={s} />)}
          </tr>
        ))}</tbody>
      </table></div>
      <p className="ayuda" style={{ marginTop: 6 }}>{textoErrorResumen(s.porCepa)} Clic en el nombre de una cepa: su curva media.</p>
      {avisoNBajo(resumen) && <div className="aviso-caja" style={{ marginTop: 6, marginBottom: 0 }}>{avisoNBajo(resumen)}</div>}
    </div>
    {cepaSel && (() => {
      // curva media de la cepa con las lecturas del análisis (corregidas, sin suavizar ni normalizar)
      const ws = wsA.filter((w) => w.Muestra === cepaSel)
      const mt = mediaPorTiempo(ws, (v) => v, errCepa)
      const nomE = { sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }[errCepa]
      const nBajo = mt.some((q) => q.n < 3)
      const col = s.colores[cepaSel]
      const valoresEn = (t) => ws.flatMap((w) => w.t.map((tt, i) => (tt === t && finito(w.y[i]) ? { etiqueta: s.porCepa ? `réplica ${w.Replica}` : nombreReplica(w.Muestra, w.Replica), x: w.y[i] } : null)).filter(Boolean))
      const series = [
        ...(s.porCepa ? [] : ws.map((w) => ({ id: 'r' + w.Pocillo, nombre: '', color: col, ancho: 1, opacidad: 0.3, data: w.t.map((t, i) => ({ x: t / 3600, y: w.y[i] })) }))),
        { id: 'm', nombre: `${cepaSel} · media${bandaCepa ? ` ± ${nomE}` : ''} (n = ${ws.length})`, color: col, ancho: 2.4, banda: bandaCepa, puntos: true, radio: 3,
          data: mt.map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, key: String(q.t), tip: `${cepaSel}\nt = ${fx(q.t / 3600, 2)} h\nOD media = ${fx(q.m, 4)}${finito(q.hi) ? `\n${nomE} = ± ${fx(q.hi - q.m, 4)}` : ''}\nn = ${q.n}${q.n < 3 ? ' (n < 3: error poco confiable)' : ''}\nClic: cómo se calculó` })) },
      ]
      return (
        <Mosaico titulo={`Curva de ${cepaSel} · media de las lecturas del análisis`} accion="Cerrar" onAccion={() => setCepaSel(null)}>
          <div className="fila" style={{ gap: 10, marginBottom: 6 }}>
            <Seg value={bandaCepa ? errCepa : 'no'} onChange={(v) => { if (v === 'no') setBandaCepa(false); else { setBandaCepa(true); setErrCepa(v) } }} opciones={[['no', 'Sin banda'], ['sd', 'DE'], ['sem', 'EEM'], ['ic95', 'IC 95 %']]} />
          </div>
          <Grafico series={series} yTxt={`OD (media${bandaCepa ? ` ± ${nomE}` : ''})`} alto={320} nombre={`curva_${cepaSel}`} estilo={s.estiloGrafico('cepaResumen')} idEstilo="cepaResumen"
            onPuntoClick={(k) => { const t = Number(k); s.abrirFicha(fichaMediaTiempo({ valores: valoresEn(t), t: t / 3600, nombre: cepaSel, tipo: bandaCepa ? errCepa : 'sd' })) }} />
          <p className="ayuda" style={{ marginTop: 6 }}>Media de las lecturas aceptadas en cada tiempo (sin los puntos ni pocillos excluidos en el control de calidad); {bandaCepa ? `la banda es la ${{ sd: 'desviación estándar entre réplicas', sem: 'error estándar de la media (DE/√n)', ic95: 'IC 95 % de la media (t × DE/√n)' }[errCepa]}` : 'sin banda de error'}{s.porCepa ? '' : '; las líneas finas son cada réplica'}. Clic en un punto: cómo se calculó.{bandaCepa && nBajo ? <b className="aviso-texto"> Hay tiempos con n &lt; 3: la banda tiene muy poca base{errCepa === 'ic95' ? ' (el IC 95 % con n = 2 usa t = 12,7)' : ''}.</b> : null}</p>
        </Mosaico>
      )
    })()}
    <div className="tarjeta" style={{ minWidth: 0 }}>
      <Detalle s={s} p={p} key={p} />
    </div>
    <div className="tarjeta">
      <div className="fila" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{s.porCepa ? 'Todas las cepas' : 'Todas las réplicas'}</h2>
        <span className="espacio" />
        <button className="fantasma chico" onClick={() => setTodas(!todas)} data-tip="Mostrar u ocultar los parámetros secundarios (tiempos característicos, dOD/dt, spline, fases)">{todas ? 'Menos columnas' : 'Más columnas'}</button>
      </div>
      <div className="tabla-scroll"><table className="tabla">
        <thead><tr>{!s.porCepa && <th>{exp.origenOd === 'tecan' ? 'Pocillo' : 'Serie'}</th>}<th>Cepa</th><th className="num">{s.porCepa ? 'Pocillos/tiempo' : 'Rép.'}</th>{claves.map((k) => <th key={k} className="num" data-tip={tipDe(k)}>{PARAMS[k]}</th>)}<th>Ventana μmax</th><th>Avisos</th></tr></thead>
        <tbody>{res.map((r) => (
          <tr key={r.Pocillo} className={r.Pocillo === p ? 'elegida' : ''}>
            {!s.porCepa && <td><button className="fantasma chico" onClick={() => setSel(r.Pocillo)} data-tip="Ver esta curva en el detalle"><b>{r.Pocillo}</b></button></td>}<td>{s.porCepa ? <button className="fantasma chico" onClick={() => setSel(r.Pocillo)} data-tip="Ver esta curva en el detalle">{r.Muestra}</button> : r.Muestra}</td><td className="num">{s.porCepa ? (r.n_por_tiempo_min !== r.n_por_tiempo_max ? `${r.n_por_tiempo_min}–${r.n_por_tiempo_max}` : r.n_por_tiempo_max) : r.Replica}</td>
            {claves.map((k) => <td key={k} className="num"><Valor f={fichaCurva(s, r, k)}>{fs(r[k], 4)}</Valor></td>)}
            <td>{finito(r.t_ini_ventana) ? `${fx(r.t_ini_ventana, 2)}–${fx(r.t_fin_ventana, 2)} h${r.ventana_manual ? ' (manual)' : ''}` : '–'}</td>
            <td style={{ whiteSpace: 'normal', minWidth: 200, fontSize: 12 }}>{r.aviso}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
    <div className="tarjeta">
      <div className="fila" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Modelo de la curva media <span className="ayuda" style={{ fontWeight: 400 }}>· para comparar y para calcular con una ecuación; μmax oficial = el de la ventana deslizante</span></h2>
        <span className="espacio" />
        <OpcionesCinta valor={modeloEc} onChange={setModeloEc} opciones={OPCIONES_MODELO_UFC} />
      </div>
      <EcuacionModelo tipo="od" filas={ajustes} nota={`${MODELOS_UFC[modeloEc]} ajustado a la OD media de cada tiempo (lecturas del análisis), sobre y = ln(OD), con todos los puntos. Su μ puede diferir de μmax: el modelo describe toda la curva y μmax, el tramo más empinado.`} />
    </div>
  </>)
}

// ---------- sección «OD vs recuento» ----------
function SeccionComparacion({ s }) {
  const resumen = useMemo(() => (s.res?.length ? resumenPorCepa(s.res, ['mu_max', 'td_min', 'lag_h']) : []), [s.res])
  const crec = s.ufcRes?.hay ? crecimientoPorCepa(s.ufcRes, s.exp.aj) : []
  const cepas = [...new Set([...resumen.map((r) => r.Muestra), ...crec.map((x) => x.Muestra)])]
  return (
    <div className="tarjeta">
      <h2>μ por OD y por recuento <span className="ayuda" style={{ fontWeight: 400 }}>· clic en un número: cómo se calculó</span></h2>
      <div className="tabla-scroll"><table className="tabla">
        <thead><tr><th>Cepa</th><th className="num">μ por OD (h⁻¹)</th><th className="num">μ por recuento (h⁻¹)</th><th className="num" data-tip="Si la OD siguiera exactamente a las células viables, ≈ 1">μ OD / μ recuento</th><th className="num">td OD (min)</th><th className="num">td recuento (min)</th><th className="num">λ OD (h)</th><th className="num">λ recuento (h)</th></tr></thead>
        <tbody>{cepas.map((m) => {
          const r = resumen.find((x) => x.Muestra === m), c = crec.find((x) => x.Muestra === m)?.c
          const q = r && c?.ok ? r.mu_max.m / c.mu : NaN
          const fU = (foco) => () => fichaModeloUfc(c, puntosUfc(s.ufcRes, m, s.exp.aj), { foco, nombre: m, color: s.colores[m], datos: s.exp.aj.ufc_datos })
          return (
            <tr key={m}><td><i className="punto" style={{ background: s.colores[m], marginRight: 6 }} /><b>{m}</b></td>
              {r ? <CeldaResumen r={r} k="mu_max" s={s} /> : <td className="num">–</td>}
              <td className="num">{c?.ok ? <Valor f={fU('mu')}>{fs(c.mu, 4)}</Valor> : '–'}</td>
              <td className="num"><Valor f={() => fichaComparacion(m, r, c)}><b>{fx(q, 2)}</b></Valor></td>
              {r ? <CeldaResumen r={r} k="td_min" s={s} /> : <td className="num">–</td>}
              <td className="num">{c?.ok ? <Valor f={fU('td')}>{fs(c.td_min, 4)}</Valor> : '–'}</td>
              {r ? <CeldaResumen r={r} k="lag_h" s={s} /> : <td className="num">–</td>}
              <td className="num">{c?.ok && finito(c.lag_h) ? <Valor f={fU('lag')}>{fs(c.lag_h, 3)}</Valor> : '–'}</td>
            </tr>
          )
        })}</tbody>
      </table></div>
      <p className="ayuda" style={{ marginTop: 6 }}>μ por OD: ventana deslizante sobre ln(OD) ({s.porCepa ? 'curva de la cepa' : 'media de las réplicas'}). μ por recuento: ajuste del modelo elegido a ln(UFC/mL). Si la OD siguiera exactamente a las células viables el cociente sería ≈ 1; un cociente distinto indica cambios en el tamaño de las células, agregación o pérdida de viabilidad. Es una comparación descriptiva, sin prueba estadística.</p>
    </div>
  )
}

export function Parametros({ s }) {
  const { exp } = s
  const [pers, setPers] = useState(null)
  const od = exp.tipo !== 'ufc', ufc = exp.tipo !== 'od'
  const secciones = [od && ['od', 'Por OD'], ufc && ['ufc', 'Por recuento'], od && ufc && ['comp', 'OD vs recuento']].filter(Boolean)
  const [sec0, setSec] = useOpcion('parametros.seccion', secciones[0][0])
  const sec = secciones.some(([k]) => k === sec0) ? sec0 : secciones[0][0]
  return (
    <div className="pagina">
      <Encabezado titulo="Parámetros" sub={`Todos los resultados de crecimiento${secciones.length > 1 ? ', por OD y por recuento' : ''}. Clic en cualquier número para ver cómo se calculó, paso a paso, con tus datos.`} />
      {secciones.length > 1 && (
        <div className="pestanas no-imprimir">
          {secciones.map(([k, t]) => <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{t}</button>)}
        </div>
      )}
      {sec === 'od' && <SeccionOd s={s} pers={pers} setPers={setPers} />}
      {sec === 'ufc' && (s.ufcRes?.hay ? (<>
        <Cinta><GrupoModeloUfc s={s} /><GruposOpcionesModeloUfc s={s} /></Cinta>
        <SeccionUfc s={s} />
      </>) : <Vacio titulo="Todavía no hay conteos">Cargá las colonias en «Conteo».</Vacio>)}
      {sec === 'comp' && <SeccionComparacion s={s} />}
    </div>
  )
}
