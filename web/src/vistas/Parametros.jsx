import { useMemo, useState } from 'react'
import { useOpcion } from '../ui/opciones.js'
import { AYUDA, MODELOS_ETQ, PARAMS, explicarResultado } from '../ayuda.js'
import { desvio, finito, media } from '../motor/analisis.js'
import { ajustarModelo } from '../motor/modelos.js'
import { nombreReplica, opAnalisis } from '../motor/pipeline.js'
import { useTema } from '../tema.js'
import { Campo, Check, Encabezado, Icono, Num, Sel, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, tCuantil } from '../utils.js'
import { mediaPorTiempo } from './Curva.jsx'

export const CLAVES_RESUMEN = ['mu_max', 'td_min', 'lag_h', 'K', 'delta_od', 'generaciones', 'auc_od', 't_umbral_od_h', 'od0', 'r2']
const CLAVES_TABLA = ['od0', 'mu_max', 'td_min', 'lag_h', 'K', 't_K_h', 'delta_od', 'generaciones', 'auc_od', 'auc_ln', 't_umbral_od_h', 'dod_max', 't_max_dod_h', 'mu_spline', 't_estacionaria', 't_muerte', 'caida_pct', 'r2']
const tipDe = (k) => (AYUDA[k] ? `${PARAMS[k]}\n${AYUDA[k].sig}\n\n${AYUDA[k].interp}` : PARAMS[k])

// Resumen por cepa: media, DE e IC 95 % entre réplicas
export function resumenPorCepa(res, claves = CLAVES_RESUMEN) {
  const muestras = [...new Set(res.map((r) => r.Muestra))]
  return muestras.map((m) => {
    const g = res.filter((r) => r.Muestra === m)
    const out = { Muestra: m, n: g.length === 1 && g[0].n_pocillos ? g[0].n_pocillos : g.length, se_mu: g.length === 1 ? g[0].mu_se : NaN }
    claves.forEach((k) => {
      const v = g.map((r) => r[k]).filter(finito)
      const n = v.length, mm = media(v), sd = n > 1 ? desvio(v) : NaN
      out[k] = { m: mm, sd, n, ic: n > 1 ? (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n) : NaN }
    })
    return out
  })
}

function Detalle({ s, p }) {
  const T = useTema()
  const [modelos, setModelos] = useState(null)
  const w = s.seriesAn.find((x) => x.Pocillo === p)
  const r = s.res.find((x) => x.Pocillo === p)
  if (!w || !r) return null
  const op = opAnalisis(s.serie.aj)
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
        <button className="chico" onClick={ajustar}>Ajustar modelos</button>
      </div>
      <p className="ayuda" style={{ margin: 0 }}>Zona sombreada: ventana usada para μmax {manual ? '(fijada a mano)' : '(automática)'}. Arrastrá sobre el gráfico para elegir otra ventana.</p>
      <Grafico series={series} yTxt="ln(OD)" alto={330} ventana={[r.t_ini_ventana, r.t_fin_ventana]} onSeleccion={(v) => s.setVentana(p, v)} nombre={`ln_${p}`} estilo={s.estiloGrafico('parametros')} idEstilo="parametros" />
      <div className="grid-kpi" style={{ marginTop: 10 }}>
        {['mu_max', 'td_min', 'lag_h', 'K', 'od0', 'r2'].map((k) => {
          const ex = explicarResultado(r, k, op)
          return <div key={k} className="kpi" data-tip={`${PARAMS[k]}\n${ex.calculo}\n\n${ex.error}`}><small>{PARAMS[k]}</small><b>{fs(r[k], 4)}</b></div>
        })}
      </div>
      {modelos && (
        <div className="tabla-scroll" style={{ marginTop: 6 }}><table className="tabla">
          <thead><tr><th>Modelo</th><th className="num">μ (h⁻¹)</th><th className="num">λ (h)</th><th className="num">K (OD)</th><th className="num">AIC</th><th className="num">BIC</th><th>Estado</th></tr></thead>
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

export function Parametros({ s }) {
  const { res, exp, setAj } = s
  const aj = exp.aj
  const [sel, setSel] = useState(null)
  const [errCepa, setErrCepa] = useOpcion('parametros.error', 'sd')
  const [bandaCepa, setBandaCepa] = useOpcion('parametros.errores', true)
  const [cepaSel, setCepaSel] = useState(null)   // cepa elegida en «Resumen por cepa»: su curva media va debajo
  const [pers, setPers] = useState(null)
  const resumen = useMemo(() => (res?.length ? resumenPorCepa(res) : []), [res])
  if (!res?.length) return <div className="pagina"><Encabezado titulo="Parámetros" /><Vacio titulo="Todavía no hay curvas analizadas">{s.pre?.error || 'Completá la carga de datos y el control de calidad.'}</Vacio></div>
  const p = sel && res.some((r) => r.Pocillo === sel) ? sel : res[0].Pocillo
  return (
    <div className="pagina">
      <Encabezado titulo="Parámetros" sub={s.porCepa ? 'Cada placa es un tiempo: los parámetros se calculan sobre la curva de cada cepa, armada con sus pocillos de cada tiempo después del control de calidad. Pasá el mouse por un parámetro para ver qué significa y cómo se calculó.' : 'Calculados sobre cada réplica después del control de calidad. Pasá el mouse por un parámetro para ver qué significa y cómo se calculó.'}>
      </Encabezado>
      <Cinta>
        <Grupo titulo="Curva">
          <CampoCinta etiqueta={s.porCepa ? 'Cepa' : 'Réplica'}><Sel value={p} onChange={setSel} opciones={res.map((r) => [r.Pocillo, s.porCepa ? r.Muestra : `${nombreReplica(r.Muestra, r.Replica)}${exp.origenOd === 'tecan' ? ` (${r.Pocillo})` : ''}`])} /></CampoCinta>
          <BotonCinta icono="refrescar" texto="Ventana automática" deshabilitado={!exp.E.ventanas[p]} onClick={() => s.setVentana(p, null)} />
        </Grupo>
        <Grupo titulo="μmax por ventana deslizante">
          <CampoCinta etiqueta="Ancho (h)"><Num value={aj.an_ancho} onChange={(v) => setAj('an_ancho', v)} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="Puntos mín."><Num value={aj.an_minpts} onChange={(v) => setAj('an_minpts', v)} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="R² mín."><Num value={aj.an_r2} onChange={(v) => setAj('an_r2', v)} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="OD mín. ln" tip="Las lecturas por debajo no entran en ln(OD): cerca del blanco el ruido domina."><Num value={aj.an_lnmin} onChange={(v) => setAj('an_lnmin', v)} ancho={56} /></CampoCinta>
        </Grupo>
        <Grupo titulo="Lag">
          <OpcionesCinta valor={aj.an_lag_metodo} onChange={(v) => setAj('an_lag_metodo', v)} opciones={[['tangente', 'Tangente', '⟋'], ['umbral', 'Umbral', '⊢']]} />
          {aj.an_lag_metodo === 'umbral' && <CampoCinta etiqueta="Factor × OD₀"><Num value={aj.an_lag_factor} onChange={(v) => setAj('an_lag_factor', v)} ancho={52} /></CampoCinta>}
        </Grupo>
        <Grupo titulo="Cálculo">
          <BotonCinta simbolo="∿" texto="Spline" activo={aj.an_spline} onClick={() => setAj('an_spline', !aj.an_spline)} tip="Calcular también μmax por spline de suavizado" />
          <BotonCinta icono="editar" texto="Umbrales y fases" activo={pers === 'fases'} onClick={() => setPers(pers === 'fases' ? null : 'fases')} tip="OD umbral (tiempo hasta OD) y criterios de las fases exponencial, estacionaria y de muerte" />
        </Grupo>
        <Grupo titulo="Mostrar">
          <BotonCinta simbolo="±" texto="Barras de error" activo={bandaCepa} onClick={() => setBandaCepa(!bandaCepa)} tip={'Banda de error de la curva media de la cepa\n(se abre con clic en una fila de «Resumen por cepa»)'} />
        </Grupo>
        <Grupo titulo="Tipo de error"><OpcionesCinta valor={errCepa} onChange={setErrCepa} opciones={[['sd', 'DE', 's', null, 'Desviación estándar\nCuánto se dispersan las réplicas entre sí'], ['sem', 'EEM', 's/√n', null, 'Error estándar de la media = DE / √n\nIncertidumbre de la media'], ['ic95', 'IC 95 %', 'IC', null, 'Intervalo de confianza del 95 %\nmedia ± t(0,975; n − 1) × DE / √n']]} /></Grupo>
        <Grupo titulo="Gráfico">
          <BotonCinta icono="editar" texto="Personalizar" activo={pers === 'parametros'} onClick={() => setPers(pers === 'parametros' ? null : 'parametros')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'parametros'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="parametros" /></Cajon>
      <Cajon titulo="Umbrales y fases" abierto={pers === 'fases'} onClose={() => setPers(null)}>
        <div className="tarjeta ajustes">
          <h3>Umbral</h3>
          <Campo label="OD umbral (tiempo hasta OD)"><Num value={aj.an_umbral_od} onChange={(v) => setAj('an_umbral_od', v)} /></Campo>
          <h3>Fases</h3>
          <Campo label="Exponencial: fracción de μmax"><Num value={aj.an_frac_exp} onChange={(v) => setAj('an_frac_exp', v)} /></Campo>
          <Campo label="Estacionaria: fracción de μmax"><Num value={aj.an_frac_est} onChange={(v) => setAj('an_frac_est', v)} /></Campo>
          <Campo label="Muerte: caída desde K (%)"><Num value={aj.an_muerte_pct} onChange={(v) => setAj('an_muerte_pct', v)} /></Campo>
        </div>
      </Cajon>
      <div className="tarjeta">
        <h2>Resumen por cepa <span className="ayuda" style={{ fontWeight: 400 }}>· {s.porCepa ? `una curva por cepa (${s.modoCurva === 'puntos' ? 'todos los pocillos' : 'media de cada tiempo'}); μmax ± error estándar de la pendiente` : 'media ± DE (n réplicas)'}</span></h2>
        <div className="tabla-scroll alta"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">n</th>{CLAVES_RESUMEN.map((k) => <th key={k} className="num" data-tip={tipDe(k)}>{PARAMS[k]}</th>)}</tr></thead>
          <tbody>{resumen.map((r) => (
            <tr key={r.Muestra} className={`fila-clic ${cepaSel === r.Muestra ? 'elegida' : ''}`} onClick={() => setCepaSel(cepaSel === r.Muestra ? null : r.Muestra)} data-tip={cepaSel === r.Muestra ? 'Clic para ocultar su curva' : 'Clic para ver la curva media de esta cepa'}><td><i className="punto" style={{ background: s.colores[r.Muestra], marginRight: 6 }} /><b>{r.Muestra}</b></td><td className="num">{r.n}</td>
              {CLAVES_RESUMEN.map((k) => <td key={k} className="num" data-tip={finito(r[k].ic) ? `${PARAMS[k]} · ${r.Muestra}\nmedia = ${fs(r[k].m, 5)}\nDE = ${fs(r[k].sd, 4)} (n = ${r[k].n})\nIC 95 % = media ± t(0,975; ${r[k].n - 1}) × DE/√n = ${fs(r[k].m - r[k].ic, 4)} a ${fs(r[k].m + r[k].ic, 4)}` : undefined}>
                {fs(r[k].m, 4)}{finito(r[k].sd) ? <small className="ayuda"> ± {fs(r[k].sd, 2)}</small> : s.porCepa && k === 'mu_max' && finito(r.se_mu) ? <small className="ayuda"> ± {fs(r.se_mu, 2)}</small> : null}</td>)}
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      {cepaSel && (() => {
        // curva media de la cepa con las lecturas que quedaron válidas después del control de calidad
        const ws = (s.pre?.proc || []).filter((w) => !w.EsBlanco && w.Muestra === cepaSel)
        const mt = mediaPorTiempo(ws, (v) => v, errCepa)
        const nomE = { sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }[errCepa]
        const col = s.colores[cepaSel]
        const series = [
          ...(s.porCepa ? [] : ws.map((w) => ({ id: 'r' + w.Pocillo, nombre: '', color: col, ancho: 1, opacidad: 0.3, data: w.t.map((t, i) => ({ x: t / 3600, y: w.y[i] })) }))),
          { id: 'm', nombre: `${cepaSel} · media${bandaCepa ? ` ± ${nomE}` : ''} (n = ${ws.length})`, color: col, ancho: 2.4, banda: bandaCepa, puntos: s.porCepa, radio: 3,
            data: mt.map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, tip: `${cepaSel}\nt = ${fx(q.t / 3600, 2)} h\nOD media = ${fx(q.m, 4)}${finito(q.sd) ? `\nDE = ${fx(q.sd, 4)}` : ''}\nn = ${q.n}` })) },
        ]
        return (
          <Mosaico titulo={`Curva de ${cepaSel} · media de las lecturas válidas`} accion="Cerrar" onAccion={() => setCepaSel(null)}>
            <Grafico series={series} yTxt={`OD (media${bandaCepa ? ` ± ${nomE}` : ''})`} alto={340} nombre={`curva_${cepaSel}`} estilo={s.estiloGrafico('cepaResumen')} idEstilo="cepaResumen" />
            <p className="ayuda" style={{ marginTop: 6 }}>Media de las réplicas aceptadas en cada tiempo (sin los puntos ni pocillos excluidos en el control de calidad); la banda es la desviación estándar{s.porCepa ? '' : ' y las líneas finas son cada réplica'}.</p>
          </Mosaico>
        )
      })()}
      <div>
        <div className="tarjeta" style={{ minWidth: 0 }}>
          <Detalle s={s} p={p} key={p} />
        </div>
      </div>
      <div className="tarjeta">
        <h2>{s.porCepa ? 'Todas las cepas' : 'Todas las réplicas'}</h2>
        <div className="tabla-scroll"><table className="tabla">
          <thead><tr>{!s.porCepa && <th>{exp.origenOd === 'tecan' ? 'Pocillo' : 'Serie'}</th>}<th>Cepa</th><th className="num">{s.porCepa ? 'Pocillos' : 'Rép.'}</th>{CLAVES_TABLA.map((k) => <th key={k} className="num" data-tip={tipDe(k)}>{PARAMS[k]}</th>)}<th>Ventana μmax</th><th>Avisos</th></tr></thead>
          <tbody>{res.map((r) => (
            <tr key={r.Pocillo} style={{ cursor: 'pointer' }} onClick={() => setSel(r.Pocillo)}>
              {!s.porCepa && <td><b>{r.Pocillo}</b></td>}<td>{r.Muestra}</td><td className="num">{s.porCepa ? r.n_pocillos : r.Replica}</td>
              {CLAVES_TABLA.map((k) => { const ex = explicarResultado(r, k, opAnalisis(s.serie.aj)); return <td key={k} className="num" data-tip={`${PARAMS[k]}\n${ex.calculo}`}>{fs(r[k], 4)}</td> })}
              <td>{finito(r.t_ini_ventana) ? `${fx(r.t_ini_ventana, 2)}–${fx(r.t_fin_ventana, 2)} h${r.ventana_manual ? ' (manual)' : ''}` : '–'}</td>
              <td style={{ whiteSpace: 'normal', minWidth: 200, fontSize: 12 }}>{r.aviso}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  )
}
