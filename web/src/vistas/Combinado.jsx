import { MODELOS_UFC, centroLog10, centroUfc, curvaUfc, errorUfc, etiquetaErrorUfc, fasesUfc, fraccionExp, textoErrorUfc } from '../motor/ufc.js'
import { etiquetaOd } from '../motor/pipeline.js'
import { useOpcion } from '../ui/opciones.js'
import { useMemo, useState } from 'react'
import { MODELOS_CALIB, ajustarCalibracion, fueraDeRango, odDesdeUfc } from '../motor/calibracion.js'
import { finito, interpolar, media } from '../motor/analisis.js'
import { useTema } from '../tema.js'
import { Campo, Encabezado, Icono, Num, Sel, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, sciCorto } from '../utils.js'
import { mediaPorTiempo } from './Curva.jsx'
import { SelectorCepas, cepasOcultas } from '../ui/cepas.jsx'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { fichaCalibracion, fichaConversion, fichaPar } from '../fichas/definiciones.js'
import { fichaTiempoUfc } from './CurvaUfc.jsx'

// Series de OD para la calibración: las mismas del análisis (pre.analisis: OD corregida por el blanco y la dilución,
// sin los puntos ni pocillos excluidos, sin suavizar ni normalizar), con las que se calculan los parámetros.
export function seriesOdCalibracion(pre) {
  if (!pre || pre.error) return []
  return (pre.analisis || []).filter((w) => !w.EsBlanco)
}

// Pares OD–UFC de la misma cepa y tiempo (la OD media se interpola si no hay lectura exacta en ese tiempo)
// tipoErr: error de la OD media (DE, EEM o IC 95 %) que acompaña a cada par. La UFC es el valor central de cada tiempo
// (Σ colonias / Σ volúmenes o media geométrica, según aj.ufc_centro).
export function paresOdUfc(s, tipoErr = 'sd') {
  if (!s.pre || s.pre.error || !s.ufcRes?.hay) return []
  const ws = seriesOdCalibracion(s.pre)
  const cen = centroUfc(s.exp?.aj)
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
    const lg = centroLog10(r, cen), u = cen === 'geo' ? 10 ** lg : r.UFC_mL
    out.push({ Muestra: r.Muestra, T_h: r.T_h, OD: od, OD_err: eOd, _ufc: r, OD_interpolada: !exacto, UFC_mL: u, log10_UFC: lg })
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
  const [verRep, setVerRep] = useOpcion('combinado.replicas', true)
  const nomErr = { sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }[tipoErr] || 'DE'
  // error de las UFC: con Σ C / Σ V es el IC 95 % del conteo; con la media geométrica, el tipo elegido
  const nomErrU = etiquetaErrorUfc(centroUfc(exp.aj), tipoErr)
  const txtErrU = (e) => (e.ic ? (finito(e.lo) ? ` · IC 95 % ${fx(e.lo, 2)} a ${fx(e.hi, 2)}` : '') : finito(e.err) ? ` ± ${fx(e.err, 2)} (${nomErrU})` : e.nBajo ? ` (n < 3: sin ${nomErrU})` : '')
  const etqOd = etiquetaOd(s.serie?.aj)
  const pares = useMemo(() => paresOdUfc(s, tipoErr), [pre, ufcRes, tipoErr, exp.aj.ufc_centro]) // eslint-disable-line react-hooks/exhaustive-deps
  const [ajuste, setAjuste] = useOpcion('combinado.ajuste', 'cepa')     // 'cepa': una ecuación por cepa · 'todas': una sola con todas las cepas visibles
  const [cepaConv, setCepaConv] = useOpcion('combinado.cepaConv', '')
  // fases según Baranyi y Roberts: por defecto la recta se arma solo con los pares de la fase exponencial;
  // aj.calib_incl guarda las excepciones elegidas a mano ({ 'cepa|T': true/false })
  const [soloExp, setSoloExp] = useOpcion('combinado.soloExp', true)
  // mismo ajuste por cepa que la tabla de Curva UFC (modelo, N máx fijado, m y centro); fracción en aj.ufc_frac_exp
  const fases = useMemo(() => (ufcRes?.hay ? Object.fromEntries([...new Set(ufcRes.res.map((r) => r.Muestra))].map((m) => [m, fasesUfc(ufcRes, m, exp.aj)])) : {}), [ufcRes, exp.aj])
  const frac = fraccionExp(exp.aj)
  const cen = centroUfc(exp.aj)
  const paresF = useMemo(() => {
    const incl = exp.aj.calib_incl || {}
    return pares.map((p) => {
      const f = fases[p.Muestra]
      const fase = f?.ok ? f.fase(p.T_h) : ''
      const auto = !soloExp || !f?.ok || fase === 'exponencial'
      const clave = `${p.Muestra}|${p.T_h}`
      return { ...p, fase, auto, clave, manual: clave in incl, usado: clave in incl ? incl[clave] : auto }
    })
  }, [pares, fases, soloExp, exp.aj.calib_incl])
  const usados = paresF.filter((p) => p.usado)
  const alternar = (clave) => s.upd((e) => {
    const p = paresF.find((x) => x.clave === clave)
    if (!p) return {}
    const incl = { ...(e.aj.calib_incl || {}) }
    if (!p.usado === p.auto) delete incl[clave]; else incl[clave] = !p.usado
    return { aj: { ...e.aj, calib_incl: incl } }
  })
  const cal = useMemo(() => ajustarCalibracion(usados.filter((p) => !cepasOcultas(exp).includes(p.Muestra)).map((p) => ({ od: p.OD, ufc: p.UFC_mL })), modelo), [paresF, modelo, exp.aj.cepas_ocultas]) // eslint-disable-line react-hooks/exhaustive-deps
  const calCepa = useMemo(() => Object.fromEntries([...new Set(pares.map((p) => p.Muestra))].map((m) => [m, ajustarCalibracion(usados.filter((p) => p.Muestra === m).map((p) => ({ od: p.OD, ufc: p.UFC_mL })), modelo)])), [paresF, modelo]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!pre || pre.error || !ufcRes?.hay) return <div className="pagina"><Encabezado titulo="OD ↔ UFC" /><Vacio titulo="Faltan datos">Hacen falta curvas de OD procesadas y conteos de UFC.</Vacio></div>

  const ws = pre.proc.filter((w) => !w.EsBlanco)
  // fichas: par OD–UFC (con las lecturas de OD de ese tiempo, o la interpolación) y calibración con sus pares
  const fPar = (p) => () => {
    const g = seriesOdCalibracion(pre).filter((w) => w.Muestra === p.Muestra)
    const valoresOd = g.flatMap((w) => w.t.map((t, i) => (Math.abs(t / 3600 - p.T_h) < 1e-6 && finito(w.y[i]) ? { etiqueta: `réplica ${w.Replica}${exp.origenOd === 'tecan' ? ` (${w.Pocillo})` : ''}`, x: w.y[i] } : null)).filter(Boolean))
    let vecinos = null
    if (p.OD_interpolada) { const mt = mediaPorTiempo(g, (v) => v, 'sd'); const j = mt.findIndex((q) => q.t / 3600 > p.T_h); if (j > 0) vecinos = { t1: mt[j - 1].t / 3600, y1: mt[j - 1].m, t2: mt[j].t / 3600, y2: mt[j].m } }
    return fichaPar(p, { valoresOd, vecinos })
  }
  const paresDe = (id) => usados.filter((p) => (id === '' ? !cepasOcultas(exp).includes(p.Muestra) : p.Muestra === id)).map((p) => ({ od: p.OD, ufc: p.UFC_mL }))
  const muestras = [...new Set([...ws.map((w) => w.Muestra), ...ufcRes.res.map((r) => r.Muestra)])]
  const vis = muestras.filter((m) => !cepasOcultas(exp).includes(m))
  const series = []
  vis.forEach((m) => {
    const g = ws.filter((w) => w.Muestra === m)
    if (g.length) series.push({ id: 'od' + m, nombre: `${m} · OD`, color: s.colores[m], ancho: 2, banda: conErr, puntos: true, radio: 2.6,
      data: mediaPorTiempo(g, (v) => v, tipoErr).map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, tip: `${m}\nt = ${fx(q.t / 3600, 2)} h\nOD media = ${fx(q.m, 3)}${finito(q.hi) ? ` ± ${fx(q.hi - q.m, 3)} (${nomErr})` : ''}` })) })
    const u = ufcRes.res.filter((r) => r.Muestra === m && finito(r.log10)).sort((a, b) => a.T_h - b.T_h)
    if (u.length) series.push({ id: 'u' + m, nombre: `${m} · UFC`, color: s.colores[m], der: true, linea: false, puntos: true, forma: 'cuadrado', radio: 4, ancho: 1.2, errores: conErr,
      etiqueta: verValor ? (d) => d.valor : undefined,
      data: u.map((r) => { const e = errorUfc(r, 'log10', tipoErr, cen); return { x: r.T_h, y: e.m, lo: e.lo, hi: e.hi, valor: (valorErr ? textoErrorUfc(e, false, tipoErr) : fx(e.m, 2)).replace('\n', ' '), tip: `${m}\nT = ${r.T_h} h\nUFC/mL = ${sciCorto(10 ** e.m)} (${cen === 'geo' ? 'media geométrica de las réplicas' : 'Σ colonias / Σ volúmenes'})\nlog₁₀ = ${fx(e.m, 2)}${txtErrU(e)}` } }) })
    if (u.length && verRep) series.push({ id: 'rep' + m, nombre: '', color: s.colores[m], der: true, linea: false, puntos: true, radio: 2.6, opacidad: 0.7,
      data: ufcRes.reps.filter((r) => r.Muestra === m && finito(r.log10) && !ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`)).map((r) => ({ x: r.T_h, y: r.log10, tip: `${m} · réplica ${r.Replica} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (log₁₀ ${fx(r.log10, 2)})` })) })
    if (u.length) { const cs = curvaUfc(ufcRes, m, exp.aj); if (cs?.ok) series.push({ id: 'sv' + m, nombre: '', color: s.colores[m], der: true, ancho: 1.4, dash: '6 3', data: cs.puntos }) }
  })
  // calibración
  const pv = paresF.filter((p) => vis.includes(p.Muestra))
  const FASE = { lag: 'fase de latencia', exponencial: 'fase exponencial', estacionaria: 'fase estacionaria' }
  const calSeries = [...new Set(pv.map((p) => p.Muestra))].flatMap((m) => [true, false].map((uso) => ({ id: (uso ? '' : 'x') + m, nombre: uso ? m : '', color: s.colores[m], linea: false, puntos: true, radio: 4, errores: uso && conErr, opacidad: uso ? 1 : 0.3,
    etiqueta: verValor ? (d) => d.valor : undefined,
    data: pv.filter((p) => p.Muestra === m && p.usado === uso).map((p) => {
      const e = errorUfc(p._ufc, 'log10', tipoErr, cen)
      return { x: p.OD, y: p.log10_UFC, lo: e.lo, hi: e.hi, xlo: finito(p.OD_err) ? p.OD - p.OD_err : NaN, xhi: finito(p.OD_err) ? p.OD + p.OD_err : NaN,
        valor: (valorErr ? textoErrorUfc(e, false, tipoErr) : fx(p.log10_UFC, 2)).replace('\n', ' '),
        key: p.clave,
        tip: `${m} · T = ${p.T_h} h${p.fase ? ` · ${FASE[p.fase]}` : ''}\n${uso ? 'Usado' : 'No usado'} en la recta${p.manual ? ' (elegido a mano)' : ''} · clic para ${uso ? 'excluirlo' : 'incluirlo'}\nOD = ${fx(p.OD, 3)}${finito(p.OD_err) ? ` ± ${fx(p.OD_err, 3)} (${nomErr})` : ''}${p.OD_interpolada ? ' (interpolada)' : ''}\nUFC/mL = ${sciCorto(p.UFC_mL)}\nlog₁₀ = ${fx(p.log10_UFC, 2)}${txtErrU(e)}` }
    }) })))
  const recta = (c) => { const xs = Array.from({ length: 60 }, (_, i) => c.rango[0] + ((c.rango[1] - c.rango[0]) * i) / 59); return xs.map((x) => ({ x, y: Math.log10(c.pred(x)) })).filter((d) => finito(d.y)) }
  if (ajuste === 'cepa') vis.forEach((m) => { const c = calCepa[m]; if (c?.ok) calSeries.push({ id: 'aj' + m, nombre: '', color: s.colores[m], ancho: 1.8, data: recta(c) }) })
  if (ajuste === 'todas' && cal.ok) {
    const xs = Array.from({ length: 60 }, (_, i) => cal.rango[0] + ((cal.rango[1] - cal.rango[0]) * i) / 59)
    calSeries.push({ id: 'ajuste', nombre: 'Ajuste', color: T.acento, ancho: 2, data: xs.map((x) => ({ x, y: Math.log10(cal.pred(x)) })).filter((d) => finito(d.y)) })
  }
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Mostrar">
          <BotonCinta simbolo="•" texto="Réplicas UFC" activo={verRep} onClick={() => setVerRep(!verRep)} tip={'Cada recuento como un punto chico\nAdemás de la media de cada tiempo'} />
          <BotonCinta simbolo="±" texto="Barras de error" activo={conErr} onClick={() => setConErr(!conErr)} tip={'Banda de error de la OD y barras de las UFC\nDel tipo elegido en «Tipo de error»'} />
        </Grupo>
        <Grupo titulo="Valores sobre los puntos">
          <BotonCinta simbolo="12" texto="Valor" activo={verValor} onClick={() => setVerValor(!verValor)} tip="Escribir log₁₀ UFC/mL sobre cada recuento" />
          <BotonCinta simbolo="±" texto="Con error" activo={valorErr} onClick={() => { setValorErr(!valorErr); if (!verValor) setVerValor(true) }} tip="Agregar el error al valor" />
        </Grupo>
        <Grupo titulo="Tipo de error"><OpcionesCinta valor={tipoErr} onChange={setTipoErr} opciones={[['sd', 'DE', 's', null, 'Desviación estándar\nCuánto se dispersan las réplicas entre sí\n(UFC con Σ colonias / Σ volumen: la barra es siempre el IC 95 % del conteo)'], ['sem', 'EEM', 's/√n', null, 'Error estándar de la media = DE / √n\nIncertidumbre de la media'], ['ic95', 'IC 95 %', 'IC', null, 'Intervalo de confianza del 95 %\nmedia ± t(0,975; n − 1) × DE / √n']]} /></Grupo>
        <Grupo titulo="Calibración">
          <OpcionesCinta valor={ajuste} onChange={setAjuste} opciones={[['cepa', 'Por cepa', '≡', null, 'Una ecuación para cada cepa'], ['todas', 'Todas juntas', '∑', null, 'Una sola ecuación con todas las cepas visibles (se muestran también las de cada cepa)']]} />
          <CampoCinta etiqueta="Modelo"><Sel value={modelo} onChange={setModelo} opciones={Object.entries(MODELOS_CALIB)} /></CampoCinta>
          <BotonCinta simbolo="⟋" texto="Solo fase exponencial" activo={soloExp} onClick={() => setSoloExp(!soloExp)} tip={'Armar la recta solo con los pares de la fase exponencial\n(fases según el ajuste de los recuentos de cada cepa, el mismo de «Curva UFC vs t»)\nApagado: todos los pares'} />
          <CampoCinta etiqueta="Fracción de μ máx" tip={'Un tiempo está en fase exponencial cuando la velocidad del modelo\nes al menos esta fracción de μ máx (entre 0 y 1; por defecto 0,5)'}><Num value={exp.aj.ufc_frac_exp ?? 0.5} onChange={(x) => s.setAj('ufc_frac_exp', x)} ancho={52} /></CampoCinta>
          <BotonCinta icono="refrescar" texto="Selección automática" deshabilitado={!Object.keys(exp.aj.calib_incl || {}).length} onClick={() => s.setAj('calib_incl', {})} tip="Descartar los pares incluidos o excluidos a mano" />
        </Grupo>
        <Grupo titulo="Gráfico">
          <OpcionesCinta valor={exp.aj.ufc_suave === false ? 'no' : (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave)} onChange={(v) => s.setAj('ufc_suave', v === 'no' ? false : v)} opciones={[['no', 'Sin curva', '·', null, 'Solo los puntos, sin líneas'], ['baranyi', 'Modelo', '∿', null, 'Curva del modelo de ajuste elegido en «Curva UFC vs t» (como DMFit)'], ['spline', 'Spline', '⌇', null, 'Spline cúbica monótona que pasa por cada media sin oscilar']]} />
          <BotonCinta icono="editar" texto="Personalizar OD + UFC" activo={pers === 'combinado'} onClick={() => setPers(pers === 'combinado' ? null : 'combinado')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
          <BotonCinta icono="editar" texto="Personalizar calibración" activo={pers === 'calibracion'} onClick={() => setPers(pers === 'calibracion' ? null : 'calibracion')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'combinado'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="combinado" ejeDerecho /></Cajon>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'calibracion'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="calibracion" /></Cajon>
      <Encabezado titulo="OD ↔ UFC" sub="Las curvas de OD y de UFC de las mismas cepas juntas y la calibración para pasar de una a otra. Los parámetros de crecimiento y la comparación de μ por OD y por recuento están en «Parámetros». Clic en un número: cómo se calculó." />
      <SelectorCepas s={s} muestras={muestras} />
      <div className="tarjeta">
        <Grafico series={series} yTxt={`${etqOd} (media${conErr ? ` ± ${nomErr}` : ''})`} yTxtDer="log₁₀ UFC/mL (■)" alto={420} nombre={`od_ufc_${exp.nombre}`} titulo={exp.nombre} estilo={s.estiloGrafico('combinado')} idEstilo="combinado" />
        <p className="ayuda" style={{ marginTop: 6 }}>Líneas y bandas: {etqOd === 'OD' ? 'OD' : `${etqOd} (normalizada solo para el gráfico)`}, media ± {nomErr} (eje izquierdo). Cuadrados con barras: log₁₀ UFC/mL, {cen === 'geo' ? `media geométrica de las réplicas (media de log₁₀) ± ${nomErrU}` : 'suma de colonias / suma de volúmenes, con su IC 95 % del conteo'} (eje derecho){exp.aj.ufc_suave !== false ? '; línea a trazos: curva de las UFC (modelo elegido en Curva UFC vs t, o spline)' : ''}.</p>
      </div>
      <div>
        <div className="tarjeta" style={{ minWidth: 0 }}>
          <h2>Calibración OD ↔ UFC/mL</h2>
          <SelectorCepas s={s} muestras={[...new Set(pares.map((p) => p.Muestra))]} />
          <div className="calib-resultado" style={{ marginTop: 8, marginBottom: 8 }}>
            <b>Datos usados en la recta.</b> {soloExp ? <>Solo los pares de la fase exponencial: el mismo ajuste de los recuentos de cada cepa que en «Curva UFC vs t», y se toma como exponencial el tramo en que la velocidad del modelo es al menos el {fx(frac * 100, 0)} % de μ máx.</> : <>Todos los pares (la selección por fase está apagada).</>} La OD es la corregida por el blanco, sin suavizar ni normalizar. Hacé clic en un punto del gráfico o en la tabla «Pares OD–UFC» para incluirlo o excluirlo.
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{[...new Set(pv.map((p) => p.Muestra))].map((m) => {
              const f = fases[m], g = pv.filter((p) => p.Muestra === m)
              const ts = (arr) => arr.map((p) => `${fx(p.T_h, 1)}${p.manual ? '*' : ''}`).join(', ')
              const no = g.filter((p) => !p.usado)
              return <li key={m}><b>{m}</b>: {f?.ok ? <>fase exponencial de {fx(f.tIni, 1)} a {fx(f.tFin, 1)} h{f.sigue ? ' (sigue después del último recuento)' : ''}, μ = {fx(f.c.mu, 3)} h⁻¹, λ = {fx(f.c.lag_h, 2)} h ({MODELOS_UFC[f.c.modelo]}{f.c.sinAsintota ? ', sin meseta en los datos' : ''}{f.c.ymaxFijo ? ', N máx fijado' : ''})</> : <>sin fases ({f?.motivo || 'sin recuentos'}): se usan todos</>}
                {' '}· se usan T = {ts(g.filter((p) => p.usado)) || 'ninguno'} h{no.length ? <> · no se usan T = {ts(no)} h ({[...new Set(no.map((p) => (p.manual ? 'a mano' : FASE[p.fase])))].join(', ')})</> : null}</li>
            })}</ul>
            {pv.some((p) => p.manual) && <small className="ayuda">* elegido a mano</small>}
          </div>
          {(() => {
            // más de la mitad de las OD netas (corregidas por el blanco) ≤ 0: el blanco probablemente está mal
            const nNeg = pv.filter((p) => finito(p.OD) && p.OD <= 0).length
            return pv.length > 0 && nNeg > pv.length / 2
              ? <p className="aviso-caja"><b>Blanco posiblemente inválido:</b> {nNeg} de {pv.length} OD corregidas por el blanco son ≤ 0. Un blanco con más absorbancia que las muestras (medio distinto, cubeta sucia, burbujas) desplaza toda la recta. Revisá el blanco antes de usar esta calibración.</p>
              : null
          })()}
          {pv.length < 3 ? <p className="aviso-caja">Hacen falta al menos 3 pares OD–UFC (misma cepa y tiempo) dentro del rango de tiempo de la OD.</p> : (
            <Grafico series={calSeries} xTxt="OD" yTxt="log₁₀ UFC/mL" alto={330} nombre="calibracion" estilo={s.estiloGrafico('calibracion')} idEstilo="calibracion" onPuntoClick={alternar} />
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
                  {f.c.ok ? <><td><Valor f={() => fichaCalibracion(f.c, paresDe(f.id), { nombre: f.nombre, color: f.color })}><code>{f.c.ecuacion}</code></Valor>{f.c.aviso && <small className="aviso-texto" style={{ display: 'block' }}>{f.c.aviso}</small>}</td><td className="num"><Valor f={() => fichaCalibracion(f.c, paresDe(f.id), { nombre: f.nombre, color: f.color })}>{fx(f.c.R2, 3)}</Valor></td><td className="num"><Valor f={() => fichaCalibracion(f.c, paresDe(f.id), { nombre: f.nombre, color: f.color })}>{fx(f.c.sigma, 2)} log</Valor></td><td className="num">{f.c.n}</td><td className="num">{fx(f.c.rango[0], 2)} a {fx(f.c.rango[1], 2)}</td></>
                    : <td colSpan={5} className="ayuda">{f.c.motivo}</td>}
                </tr>
              ))}</tbody>
            </table></div>
            {usar && (<>
              <h3>Convertir</h3>
              <Campo label="Ecuación"><Sel value={usar.id} onChange={setCepaConv} opciones={filas.filter((f) => f.c.ok).map((f) => [f.id, f.nombre])} /></Campo>
              <Campo label="OD → UFC/mL"><div className="fila"><Num value={odIn} onChange={setOdIn} ancho={90} /><b><Valor f={() => fichaConversion(usar.c, 'od', Number(odIn), usar.c.pred(Number(odIn)), { nombre: usar.nombre, fuera: fueraDeRango(usar.c, Number(odIn)) })}>{sciCorto(usar.c.pred(Number(odIn)))}</Valor></b></div></Campo>
              <Campo label="UFC/mL → OD"><div className="fila"><Num value={ufcIn} onChange={setUfcIn} ancho={110} /><b><Valor f={() => fichaConversion(usar.c, 'ufc', Number(ufcIn), odDesdeUfc(usar.c, Number(ufcIn)), { nombre: usar.nombre, fuera: fueraDeRango(usar.c, odDesdeUfc(usar.c, Number(ufcIn))) })}>{fx(odDesdeUfc(usar.c, Number(ufcIn)), 3)}</Valor></b></div></Campo>
              {fueraDeRango(usar.c, Number(odIn)) && <p className="aviso-caja">OD → UFC/mL: la OD {fx(Number(odIn), 3)} está fuera del rango calibrado de {usar.nombre} ({fx(usar.c.rango[0], 3)} a {fx(usar.c.rango[1], 3)}): es una extrapolación.</p>}
              {fueraDeRango(usar.c, odDesdeUfc(usar.c, Number(ufcIn))) && <p className="aviso-caja">UFC/mL → OD: la OD que resulta ({fx(odDesdeUfc(usar.c, Number(ufcIn)), 3)}) está fuera del rango calibrado de {usar.nombre} ({fx(usar.c.rango[0], 3)} a {fx(usar.c.rango[1], 3)}): es una extrapolación.</p>}
            </>)}
          </>)
        })()}
          </div>
        </div>
      </div>
      <div className="tarjeta">
        <h2>Pares OD–UFC</h2>
        <div className="tabla-scroll"><table className="tabla">
          <thead><tr><th>Usar</th><th>Cepa</th><th className="num">T (h)</th><th>Fase (Baranyi)</th><th className="num" data-tip={'Media de las réplicas de OD en ese tiempo\nCorregida por el blanco, sin suavizar ni normalizar'}>OD media (neta)</th><th className="num">UFC/mL</th><th className="num">log₁₀ UFC</th></tr></thead>
          <tbody>{pv.map((p) => (
            <tr key={p.Muestra + p.T_h} className={p.usado ? '' : 'fuera'}><td><input type="checkbox" checked={p.usado} onChange={() => alternar(p.clave)} data-tip={p.usado ? 'Excluir este par de la recta' : 'Incluir este par en la recta'} />{p.manual && <small className="ayuda"> a mano</small>}</td><td>{p.Muestra}</td><td className="num">{p.T_h}</td><td>{p.fase ? FASE[p.fase] : '–'}</td><td className="num"><Valor f={fPar(p)}>{fx(p.OD, 3)}</Valor>{p.OD_interpolada && <small className="ayuda" data-tip="No había lectura de OD en ese tiempo: se interpoló linealmente entre las lecturas vecinas."> (interp.)</small>}</td>
              <td className="num"><Valor f={() => fichaTiempoUfc(ufcRes, exp.aj, p.Muestra, p.T_h)}>{sciCorto(p.UFC_mL)}</Valor></td><td className="num">{fx(p.log10_UFC, 2)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  )
}
