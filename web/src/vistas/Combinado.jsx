import { curvaSuaveUfc, errorUfc, textoErrorUfc } from '../motor/ufc.js'
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
// tipoErr: error de la OD media (DE, EEM o IC 95 %) que acompaña a cada par
export function paresOdUfc(s, tipoErr = 'sd') {
  if (!s.pre || s.pre.error || !s.ufcRes?.hay) return []
  const ws = s.pre.proc.filter((w) => !w.EsBlanco)
  const out = []
  s.ufcRes.res.filter((r) => finito(r.UFC_mL) && r.UFC_mL > 0).forEach((r) => {
    const g = ws.filter((w) => w.Muestra === r.Muestra)
    if (!g.length) return
    const mt = mediaPorTiempo(g, (v) => v, tipoErr)
    if (mt.length < 1) return
    const ts = mt.map((q) => q.t / 3600)
    if (r.T_h < ts[0] - 1e-9 || r.T_h > ts[ts.length - 1] + 1e-9) return
    const exacto = mt.find((q) => Math.abs(q.t / 3600 - r.T_h) < 1e-6)
    const od = exacto ? exacto.m : interpolar(ts, mt.map((q) => q.m), [r.T_h])[0]
    const eOd = exacto ? exacto.hi - exacto.m : interpolar(ts, mt.map((q) => q.hi - q.m), [r.T_h])[0]
    out.push({ Muestra: r.Muestra, T_h: r.T_h, OD: od, OD_err: eOd, _ufc: r, OD_interpolada: !exacto, UFC_mL: r.UFC_mL, log10_UFC: r.log10, UFC_por_OD: od > 0 ? r.UFC_mL / od : NaN })
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
  const [conErr, setConErr] = useOpcion('combinado.errores', true)
  const [tipoErr, setTipoErr] = useOpcion('combinado.error', 'sd')
  const [verValor, setVerValor] = useOpcion('combinado.valor', false)
  const [valorErr, setValorErr] = useOpcion('combinado.conError', false)
  const nomErr = { sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }[tipoErr] || 'DE'
  const pares = useMemo(() => paresOdUfc(s, tipoErr), [pre, ufcRes, tipoErr]) // eslint-disable-line react-hooks/exhaustive-deps
  const [ajuste, setAjuste] = useOpcion('combinado.ajuste', 'cepa')     // 'cepa': una ecuación por cepa · 'todas': una sola con todas las cepas visibles
  const [cepaConv, setCepaConv] = useOpcion('combinado.cepaConv', '')
  const cal = useMemo(() => ajustarCalibracion(pares.filter((p) => !cepasOcultas(exp).includes(p.Muestra)).map((p) => ({ od: p.OD, ufc: p.UFC_mL })), modelo), [pares, modelo, exp.aj.cepas_ocultas])
  const calCepa = useMemo(() => Object.fromEntries([...new Set(pares.map((p) => p.Muestra))].map((m) => [m, ajustarCalibracion(pares.filter((p) => p.Muestra === m).map((p) => ({ od: p.OD, ufc: p.UFC_mL })), modelo)])), [pares, modelo])
  if (!pre || pre.error || !ufcRes?.hay) return <div className="pagina"><Encabezado titulo="OD + UFC" /><Vacio titulo="Faltan datos">Hacen falta curvas de OD procesadas y conteos de UFC.</Vacio></div>

  const ws = pre.proc.filter((w) => !w.EsBlanco)
  const muestras = [...new Set([...ws.map((w) => w.Muestra), ...ufcRes.res.map((r) => r.Muestra)])]
  const vis = muestras.filter((m) => !cepasOcultas(exp).includes(m))
  const series = []
  vis.forEach((m) => {
    const g = ws.filter((w) => w.Muestra === m)
    if (g.length) series.push({ id: 'od' + m, nombre: `${m} · OD`, color: s.colores[m], ancho: 2, banda: conErr,
      data: mediaPorTiempo(g, (v) => v, tipoErr).map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, tip: `${m}\nt = ${fx(q.t / 3600, 2)} h\nOD media = ${fx(q.m, 3)}${finito(q.hi) ? ` ± ${fx(q.hi - q.m, 3)} (${nomErr})` : ''}` })) })
    const u = ufcRes.res.filter((r) => r.Muestra === m && finito(r.log10)).sort((a, b) => a.T_h - b.T_h)
    if (u.length) series.push({ id: 'u' + m, nombre: `${m} · UFC`, color: s.colores[m], der: true, linea: false, puntos: true, forma: 'cuadrado', radio: 4, ancho: 1.2, errores: conErr,
      etiqueta: verValor ? (d) => d.valor : undefined,
      data: u.map((r) => { const e = errorUfc(r, 'log10', tipoErr); return { x: r.T_h, y: r.log10, lo: e.lo, hi: e.hi, valor: (valorErr ? textoErrorUfc(e, false, tipoErr) : fx(r.log10, 2)).replace('\n', ' '), tip: `${m}\nT = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)}\nlog₁₀ = ${fx(r.log10, 2)}${finito(e.err) ? ` ± ${fx(e.err, 2)} (${nomErr})` : ''}` } }) })
    if (u.length && exp.aj.ufc_suave !== false) { const cs = curvaSuaveUfc(u, (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave)); if (cs.ok) series.push({ id: 'sv' + m, nombre: '', color: s.colores[m], der: true, ancho: 1.4, dash: '6 3', data: cs.puntos }) }
  })
  // calibración
  const pv = pares.filter((p) => vis.includes(p.Muestra))
  const calSeries = [...new Set(pv.map((p) => p.Muestra))].map((m) => ({ id: m, nombre: m, color: s.colores[m], linea: false, puntos: true, radio: 4, errores: conErr,
    etiqueta: verValor ? (d) => d.valor : undefined,
    data: pv.filter((p) => p.Muestra === m).map((p) => {
      const e = errorUfc(p._ufc, 'log10', tipoErr)
      return { x: p.OD, y: p.log10_UFC, lo: e.lo, hi: e.hi, xlo: finito(p.OD_err) ? p.OD - p.OD_err : NaN, xhi: finito(p.OD_err) ? p.OD + p.OD_err : NaN,
        valor: (valorErr ? textoErrorUfc(e, false, tipoErr) : fx(p.log10_UFC, 2)).replace('\n', ' '),
        tip: `${m} · T = ${p.T_h} h\nOD = ${fx(p.OD, 3)}${finito(p.OD_err) ? ` ± ${fx(p.OD_err, 3)} (${nomErr})` : ''}${p.OD_interpolada ? ' (interpolada)' : ''}\nUFC/mL = ${sciCorto(p.UFC_mL)}\nlog₁₀ = ${fx(p.log10_UFC, 2)}${finito(e.err) ? ` ± ${fx(e.err, 2)} (${nomErr})` : ''}` }
    }) }))
  const recta = (c) => { const xs = Array.from({ length: 60 }, (_, i) => c.rango[0] + ((c.rango[1] - c.rango[0]) * i) / 59); return xs.map((x) => ({ x, y: Math.log10(c.pred(x)) })).filter((d) => finito(d.y)) }
  if (ajuste === 'cepa') vis.forEach((m) => { const c = calCepa[m]; if (c?.ok) calSeries.push({ id: 'aj' + m, nombre: '', color: s.colores[m], ancho: 1.8, data: recta(c) }) })
  if (ajuste === 'todas' && cal.ok) {
    const xs = Array.from({ length: 60 }, (_, i) => cal.rango[0] + ((cal.rango[1] - cal.rango[0]) * i) / 59)
    calSeries.push({ id: 'ajuste', nombre: 'Ajuste', color: T.acento, ancho: 2, data: xs.map((x) => ({ x, y: Math.log10(cal.pred(x)) })).filter((d) => finito(d.y)) })
  }
  const crec = crecimientoPorCepa(ufcRes.res)
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Mostrar">
          <BotonCinta simbolo="±" texto="Barras de error" activo={conErr} onClick={() => setConErr(!conErr)} tip={'Banda de error de la OD y barras de las UFC\nDel tipo elegido en «Tipo de error»'} />
        </Grupo>
        <Grupo titulo="Valores sobre los puntos">
          <BotonCinta simbolo="12" texto="Valor" activo={verValor} onClick={() => setVerValor(!verValor)} tip="Escribir log₁₀ UFC/mL sobre cada recuento" />
          <BotonCinta simbolo="±" texto="Con error" activo={valorErr} onClick={() => { setValorErr(!valorErr); if (!verValor) setVerValor(true) }} tip="Agregar el error al valor" />
        </Grupo>
        <Grupo titulo="Tipo de error"><OpcionesCinta valor={tipoErr} onChange={setTipoErr} opciones={[['sd', 'DE', 's', null, 'Desviación estándar\nCuánto se dispersan las réplicas entre sí'], ['sem', 'EEM', 's/√n', null, 'Error estándar de la media = DE / √n\nIncertidumbre de la media'], ['ic95', 'IC 95 %', 'IC', null, 'Intervalo de confianza del 95 %\nmedia ± t(0,975; n − 1) × DE / √n']]} /></Grupo>
        <Grupo titulo="Calibración">
          <OpcionesCinta valor={ajuste} onChange={setAjuste} opciones={[['cepa', 'Por cepa', '≡', null, 'Una ecuación para cada cepa'], ['todas', 'Todas juntas', '∑', null, 'Una sola ecuación con todas las cepas visibles (se muestran también las de cada cepa)']]} />
          <CampoCinta etiqueta="Modelo"><Sel value={modelo} onChange={setModelo} opciones={Object.entries(MODELOS_CALIB)} /></CampoCinta></Grupo>
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
        <Grafico series={series} yTxt={`OD (media${conErr ? ` ± ${nomErr}` : ''})`} yTxtDer="log₁₀ UFC/mL (■)" alto={420} nombre={`od_ufc_${exp.nombre}`} titulo={exp.nombre} estilo={s.estiloGrafico('combinado')} idEstilo="combinado" />
        <p className="ayuda" style={{ marginTop: 6 }}>Líneas y bandas: OD (eje izquierdo). Cuadrados con barras: log₁₀ UFC/mL, promedio de las réplicas (suma de colonias / suma de volúmenes) ± {nomErr} (eje derecho){exp.aj.ufc_suave !== false ? '; línea a trazos: curva suavizada de las UFC' : ''}.</p>
      </div>
      <div>
        <div className="tarjeta" style={{ minWidth: 0 }}>
          <h2>Calibración OD ↔ UFC/mL</h2>
          <SelectorCepas s={s} muestras={[...new Set(pares.map((p) => p.Muestra))]} />
          {pv.length < 3 ? <p className="aviso-caja">Hacen falta al menos 3 pares OD–UFC (misma cepa y tiempo) dentro del rango de tiempo de la OD.</p> : (
            <Grafico series={calSeries} xTxt="OD" yTxt="log₁₀ UFC/mL" alto={330} nombre="calibracion" estilo={s.estiloGrafico('calibracion')} idEstilo="calibracion" />
          )}
          <div className="calib-resultado" style={{ marginTop: 12 }}>
        {(() => {
          const filas = [...vis.filter((m) => calCepa[m]).map((m) => ({ id: m, nombre: m, color: s.colores[m], c: calCepa[m] })), ...(ajuste === 'todas' ? [{ id: '', nombre: 'Todas juntas', color: T.acento, c: cal }] : [])]
          const usar = filas.find((f) => f.id === cepaConv && f.c.ok) || filas.find((f) => (ajuste === 'todas' ? f.id === '' : true) && f.c.ok)
          return (<>
            <p style={{ marginTop: 0 }}><b>{MODELOS_CALIB[modelo]}</b> · {ajuste === 'cepa' ? 'una ecuación por cepa' : 'una ecuación con todas las cepas visibles (y la de cada cepa)'}</p>
            <div className="tabla-scroll"><table className="tabla">
              <thead><tr><th>Cepa</th><th>Ecuación</th><th className="num">R² (log₁₀)</th><th className="num" data-tip="Error típico de la predicción, en órdenes de magnitud (log₁₀)">Error típico</th><th className="num">Pares</th><th className="num">Rango de OD</th></tr></thead>
              <tbody>{filas.map((f) => (
                <tr key={f.nombre}><td><i className="punto" style={{ background: f.color, marginRight: 6 }} /><b>{f.nombre}</b></td>
                  {f.c.ok ? <><td><code>{f.c.ecuacion}</code></td><td className="num">{fx(f.c.R2, 3)}</td><td className="num">{fx(f.c.sigma, 2)} log</td><td className="num">{f.c.n}</td><td className="num">{fx(f.c.rango[0], 2)} a {fx(f.c.rango[1], 2)}</td></>
                    : <td colSpan={5} className="ayuda">{f.c.motivo}</td>}
                </tr>
              ))}</tbody>
            </table></div>
            {usar && (<>
              <h3>Convertir</h3>
              <Campo label="Ecuación"><Sel value={usar.id} onChange={setCepaConv} opciones={filas.filter((f) => f.c.ok).map((f) => [f.id, f.nombre])} /></Campo>
              <Campo label="OD → UFC/mL"><div className="fila"><Num value={odIn} onChange={setOdIn} ancho={90} /><b>{sciCorto(usar.c.pred(Number(odIn)))}</b></div></Campo>
              <Campo label="UFC/mL → OD"><div className="fila"><Num value={ufcIn} onChange={setUfcIn} ancho={110} /><b>{fx(odDesdeUfc(usar.c, Number(ufcIn)), 3)}</b></div></Campo>
              {(Number(odIn) < usar.c.rango[0] || Number(odIn) > usar.c.rango[1]) && <p className="aviso-caja">Esa OD está fuera del rango calibrado de {usar.nombre}: es una extrapolación.</p>}
            </>)}
          </>)
        })()}
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
