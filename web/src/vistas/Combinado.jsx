import { curvaSuaveUfc } from '../motor/ufc.js'
import { useOpcion } from '../ui/opciones.js'
import { useMemo, useState } from 'react'
import { MODELOS_CALIB, ajustarCalibracion, odDesdeUfc } from '../motor/calibracion.js'
import { finito, interpolar, media } from '../motor/analisis.js'
import { useTema } from '../tema.js'
import { Campo, Encabezado, Icono, Num, Sel, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, sciCorto } from '../utils.js'
import { mediaPorTiempo } from './Curva.jsx'
import { SelectorCepas, cepasOcultas } from '../ui/cepas.jsx'
import { crecimientoPorCepa } from './CurvaUfc.jsx'

// Pares OD–UFC de la misma cepa y tiempo (la OD media se interpola si no hay lectura exacta en ese tiempo)
export function paresOdUfc(s) {
  if (!s.pre || s.pre.error || !s.ufcRes?.hay) return []
  const ws = s.pre.proc.filter((w) => !w.EsBlanco)
  const out = []
  s.ufcRes.res.filter((r) => finito(r.UFC_mL) && r.UFC_mL > 0).forEach((r) => {
    const g = ws.filter((w) => w.Muestra === r.Muestra)
    if (!g.length) return
    const mt = mediaPorTiempo(g, (v) => v, 'sd')
    if (mt.length < 1) return
    const ts = mt.map((q) => q.t / 3600)
    if (r.T_h < ts[0] - 1e-9 || r.T_h > ts[ts.length - 1] + 1e-9) return
    const exacto = mt.find((q) => Math.abs(q.t / 3600 - r.T_h) < 1e-6)
    const od = exacto ? exacto.m : interpolar(ts, mt.map((q) => q.m), [r.T_h])[0]
    out.push({ Muestra: r.Muestra, T_h: r.T_h, OD: od, OD_interpolada: !exacto, UFC_mL: r.UFC_mL, log10_UFC: r.log10, UFC_por_OD: od > 0 ? r.UFC_mL / od : NaN })
  })
  return out
}

export function Combinado({ s }) {
  const T = useTema()
  const { pre, ufcRes, exp, res } = s
  const [modelo, setModelo] = useOpcion('combinado.modelo', 'clasico')
  const [odIn, setOdIn] = useState(0.5)
  const [ufcIn, setUfcIn] = useState(1e8)
  const [pers, setPers] = useState(null)
  const pares = useMemo(() => paresOdUfc(s), [pre, ufcRes]) // eslint-disable-line react-hooks/exhaustive-deps
  const cal = useMemo(() => ajustarCalibracion(pares.filter((p) => !cepasOcultas(exp).includes(p.Muestra)).map((p) => ({ od: p.OD, ufc: p.UFC_mL })), modelo), [pares, modelo, exp.aj.cepas_ocultas])
  if (!pre || pre.error || !ufcRes?.hay) return <div className="pagina"><Encabezado titulo="OD + UFC" /><Vacio titulo="Faltan datos">Hacen falta curvas de OD procesadas y conteos de UFC.</Vacio></div>

  const ws = pre.proc.filter((w) => !w.EsBlanco)
  const muestras = [...new Set([...ws.map((w) => w.Muestra), ...ufcRes.res.map((r) => r.Muestra)])]
  const vis = muestras.filter((m) => !cepasOcultas(exp).includes(m))
  const series = []
  vis.forEach((m) => {
    const g = ws.filter((w) => w.Muestra === m)
    if (g.length) series.push({ id: 'od' + m, nombre: `${m} · OD`, color: s.colores[m], ancho: 2, banda: true,
      data: mediaPorTiempo(g, (v) => v, 'sd').map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, tip: `${m}\nt = ${fx(q.t / 3600, 2)} h\nOD media = ${fx(q.m, 3)}` })) })
    const u = ufcRes.res.filter((r) => r.Muestra === m && finito(r.log10)).sort((a, b) => a.T_h - b.T_h)
    if (u.length) series.push({ id: 'u' + m, nombre: `${m} · UFC`, color: s.colores[m], der: true, linea: false, puntos: true, forma: 'cuadrado', radio: 4, ancho: 1.2, errores: true,
      data: u.map((r) => ({ x: r.T_h, y: r.log10, lo: r.log10 - (r.DE_log10 || 0), hi: r.log10 + (r.DE_log10 || 0), tip: `${m}\nT = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)}\nlog₁₀ = ${fx(r.log10, 2)}` })) })
    if (u.length && exp.aj.ufc_suave !== false) { const cs = curvaSuaveUfc(u, (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave)); if (cs.ok) series.push({ id: 'sv' + m, nombre: '', color: s.colores[m], der: true, ancho: 1.4, dash: '6 3', data: cs.puntos }) }
  })
  // calibración
  const pv = pares.filter((p) => vis.includes(p.Muestra))
  const calSeries = [...new Set(pv.map((p) => p.Muestra))].map((m) => ({ id: m, nombre: m, color: s.colores[m], linea: false, puntos: true, radio: 4,
    data: pv.filter((p) => p.Muestra === m).map((p) => ({ x: p.OD, y: p.log10_UFC, tip: `${m} · T = ${p.T_h} h\nOD = ${fx(p.OD, 3)}${p.OD_interpolada ? ' (interpolada)' : ''}\nUFC/mL = ${sciCorto(p.UFC_mL)}` })) }))
  if (cal.ok) {
    const xs = Array.from({ length: 60 }, (_, i) => cal.rango[0] + ((cal.rango[1] - cal.rango[0]) * i) / 59)
    calSeries.push({ id: 'ajuste', nombre: 'Ajuste', color: T.acento, ancho: 2, data: xs.map((x) => ({ x, y: Math.log10(cal.pred(x)) })).filter((d) => finito(d.y)) })
  }
  const crec = crecimientoPorCepa(ufcRes.res)
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Calibración"><CampoCinta etiqueta="Modelo"><Sel value={modelo} onChange={setModelo} opciones={Object.entries(MODELOS_CALIB)} /></CampoCinta></Grupo>
        <Grupo titulo="Gráfico">
          <OpcionesCinta valor={exp.aj.ufc_suave === false ? 'no' : (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave)} onChange={(v) => s.setAj('ufc_suave', v === 'no' ? false : v)} opciones={[['no', 'Sin curva', '·', null, 'Solo los puntos, sin líneas'], ['baranyi', 'Baranyi', '∿', null, 'Curva del modelo de Baranyi-Roberts ajustado a ln(UFC/mL) (4 o más tiempos)'], ['spline', 'Spline', '⌇', null, 'Spline cúbica monótona que pasa por cada media sin oscilar']]} />
          <BotonCinta icono="editar" texto="Personalizar OD + UFC" activo={pers === 'combinado'} onClick={() => setPers(pers === 'combinado' ? null : 'combinado')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
          <BotonCinta icono="editar" texto="Personalizar calibración" activo={pers === 'calibracion'} onClick={() => setPers(pers === 'calibracion' ? null : 'calibracion')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'combinado'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="combinado" ejeDerecho /></Cajon>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'calibracion'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="calibracion" /></Cajon>
      <Encabezado titulo="OD + UFC" sub="Las dos mediciones de las mismas cepas juntas: cómo sigue la turbidez a las células viables y la calibración para pasar de una a otra." />
      <SelectorCepas s={s} muestras={muestras} />
      <div className="tarjeta">
        <Grafico series={series} yTxt="OD (media ± DE)" yTxtDer="log₁₀ UFC/mL (■)" alto={420} nombre={`od_ufc_${exp.nombre}`} titulo={exp.nombre} estilo={s.estiloGrafico('combinado')} idEstilo="combinado" />
        <p className="ayuda" style={{ marginTop: 6 }}>Líneas y bandas: OD (eje izquierdo). Cuadrados con barras: log₁₀ UFC/mL, promedio de las réplicas (suma de colonias / suma de volúmenes) ± DE (eje derecho){exp.aj.ufc_suave !== false ? '; línea a trazos: curva suavizada de las UFC' : ''}.</p>
      </div>
      <div>
        <div className="tarjeta" style={{ minWidth: 0 }}>
          <h2>Calibración OD ↔ UFC/mL</h2>
          {pv.length < 3 ? <p className="aviso-caja">Hacen falta al menos 3 pares OD–UFC (misma cepa y tiempo) dentro del rango de tiempo de la OD.</p> : (
            <Grafico series={calSeries} xTxt="OD" yTxt="log₁₀ UFC/mL" alto={330} nombre="calibracion" estilo={s.estiloGrafico('calibracion')} idEstilo="calibracion" />
          )}
          <div className="calib-resultado" style={{ marginTop: 12 }}>
        {cal.ok ? (<>
          <p style={{ marginTop: 0 }}><b>{MODELOS_CALIB[modelo]}</b> · <code>{cal.ecuacion}</code></p>
          <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="kpi"><small>R² (log₁₀)</small><b>{fx(cal.R2, 3)}</b></div>
            <div className="kpi" data-tip="Error típico de la predicción, en órdenes de magnitud (log₁₀) y como porcentaje"><small>Error típico</small><b>{fx(cal.sigma, 2)} log</b></div>
            <div className="kpi"><small>Pares</small><b>{cal.n}</b></div>
            <div className="kpi"><small>Rango de OD</small><b style={{ fontSize: 14 }}>{fx(cal.rango[0], 2)}–{fx(cal.rango[1], 2)}</b></div>
          </div>
          <h3>Convertir</h3>
          <Campo label="OD → UFC/mL"><div className="fila"><Num value={odIn} onChange={setOdIn} ancho={90} /><b>{sciCorto(cal.pred(Number(odIn)))}</b></div></Campo>
          <Campo label="UFC/mL → OD"><div className="fila"><Num value={ufcIn} onChange={setUfcIn} ancho={110} /><b>{fx(odDesdeUfc(cal, Number(ufcIn)), 3)}</b></div></Campo>
          {(Number(odIn) < cal.rango[0] || Number(odIn) > cal.rango[1]) && <p className="aviso-caja">Esa OD está fuera del rango calibrado: es una extrapolación.</p>}
        </>) : <p className="ayuda" style={{ marginTop: 10 }}>{cal.motivo}</p>}
          </div>
        </div>
      </div>
      <div className="tarjeta">
        <h2>Velocidad de crecimiento: OD frente a UFC</h2>
        <div className="tabla-scroll alta"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">μmax OD (h⁻¹)</th><th className="num">td OD (min)</th><th className="num">Lag OD (h)</th><th className="num">μ UFC (h⁻¹)</th><th className="num">td UFC (min)</th><th className="num">Lag UFC (h)</th><th className="num">μ UFC / μ OD</th></tr></thead>
          <tbody>{muestras.map((m) => {
            const r = (res || []).filter((x) => x.Muestra === m)
            const mu = media(r.map((x) => x.mu_max).filter(finito)), td = media(r.map((x) => x.td_min).filter(finito)), lag = media(r.map((x) => x.lag_h).filter(finito))
            const c = crec.find((x) => x.Muestra === m)?.c
            return (
              <tr key={m}><td><i className="punto" style={{ background: s.colores[m], marginRight: 6 }} /><b>{m}</b></td>
                <td className="num">{fs(mu, 4)}</td><td className="num">{fs(td, 4)}</td><td className="num">{fs(lag, 3)}</td>
                <td className="num">{fs(c?.mu, 4)}</td><td className="num">{fs(c?.td_min, 4)}</td><td className="num">{fs(c?.lag_h, 3)}</td>
                <td className="num">{fx(c?.mu / mu, 2)}</td></tr>
            )
          })}</tbody>
        </table></div>
      </div>
      <div className="tarjeta">
        <h2>Pares OD–UFC</h2>
        <div className="tabla-scroll"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num">OD media</th><th className="num">UFC/mL</th><th className="num">log₁₀ UFC</th><th className="num">UFC/mL por unidad de OD</th></tr></thead>
          <tbody>{pv.map((p) => (
            <tr key={p.Muestra + p.T_h}><td>{p.Muestra}</td><td className="num">{p.T_h}</td><td className="num">{fx(p.OD, 3)}{p.OD_interpolada && <small className="ayuda" data-tip="No había lectura de OD en ese tiempo: se interpoló linealmente entre las lecturas vecinas."> (interp.)</small>}</td>
              <td className="num">{sciCorto(p.UFC_mL)}</td><td className="num">{fx(p.log10_UFC, 2)}</td><td className="num">{sciCorto(p.UFC_por_OD)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  )
}
