import { MODELOS_UFC, tramoUfcElegido, ajusteCepaUfc, modeloUfc, centroLog10, centroUfc, curvaUfc, errorTextoUfc, errorUfc, etiquetaErrorUfc, fasesUfc, fraccionExp, textoErrorUfc } from '../motor/ufc.js'
import { etiquetaOd } from '../motor/pipeline.js'
import { useOpcion } from '../ui/opciones.js'
import { useMemo, useState } from 'react'
import { MODELOS_CALIB, ajustarCalibracion, fueraDeRango, odDesdeUfc } from '../motor/calibracion.js'
import { finito, interpolar, media } from '../motor/analisis.js'
import { useTema } from '../tema.js'
import { Campo, Encabezado, Icono, Num, Sel, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { GrupoMostrar, conEtiquetas, textoMostrar, useMostrar } from '../ui/mostrar.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, sciCorto } from '../utils.js'
import { mediaPorTiempo } from './Curva.jsx'
import { SelectorCepas, cepasOcultas } from '../ui/cepas.jsx'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { fichaCalibracion, fichaConversion, fichaPar } from '../fichas/definiciones.js'
import { fichaTiempoUfc } from './CurvaUfc.jsx'
import { SeccionComparacion, ajustesOd } from './Parametros.jsx'
import { ventanaDeFilas, ventanaOdElegida } from './FasesCepa.jsx'
import { TablaValores } from '../ui/ecuacion.jsx'
import { EcCalibracion } from '../ui/ecuacionBonita.jsx'

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

// Una ecuación de calibración (de una cepa o de todas juntas): la ecuación con formato de ecuación, sus números, y debajo
// la calculadora (OD → UFC/mL y UFC/mL → OD) y la tabla de valores, igual que en «Ecuación del modelo» de las curvas
function BloqueCalib({ f, usados }) {
  const c = f.c
  // valores iniciales dentro del rango calibrado (la mitad del rango de OD y su UFC/mL)
  const odMed = c.ok ? Number(((c.rango[0] + c.rango[1]) / 2).toPrecision(2)) : 0.5
  // lo escrito en la calculadora se guarda con el experimento: no se pierde al cambiar de pantalla ni al guardar
  const [od, setOd] = useOpcion(`calc.cal.${f.id}.od`, odMed, true)
  const [ufc, setUfc] = useOpcion(`calc.cal.${f.id}.ufc`, c.ok && finito(c.pred(odMed)) ? Number(c.pred(odMed).toPrecision(2)) : 1e8, true)
  const [tabla, setTabla] = useState(false)
  const ficha = () => fichaCalibracion(c, usados, { nombre: f.nombre, color: f.color })
  const uOd = c.ok ? c.pred(Number(od)) : NaN
  const oU = c.ok ? odDesdeUfc(c, Number(ufc)) : NaN
  const chip = (fuera) => <span className={`chip ${fuera ? 'aviso' : 'ok'}`} data-tip={fuera ? `Fuera del rango calibrado (OD ${fx(c.rango[0], 3)} a ${fx(c.rango[1], 3)}): es una extrapolación` : `Dentro del rango calibrado (OD ${fx(c.rango[0], 3)} a ${fx(c.rango[1], 3)})`}>{fuera ? 'extrapolado' : 'interpolado'}</span>
  return (
    <section className="ec-cepa">
      <h3><i className="punto" style={{ background: f.color }} />{f.nombre}</h3>
      {!c.ok ? <p className="ayuda" style={{ margin: 0 }}>{c.motivo}</p> : (<>
        <div className="ecuacion-od">
          <Valor f={ficha}><EcCalibracion c={c} /></Valor>
          <small>R² (log₁₀) = <Valor f={ficha}>{fx(c.R2, 3)}</Valor> · error típico = <Valor f={ficha}>{fx(c.sigma, 2)} log₁₀</Valor> · {c.n} pares · OD de {fx(c.rango[0], 2)} a {fx(c.rango[1], 2)}</small>
        </div>
        {c.aviso && <div className="aviso-texto" style={{ fontSize: 12 }}>⚠ {c.aviso}</div>}
        <div className="ec-calc">
          <div className="ec-conv">
            <div className="ec-conv-fila">
              <CampoCinta etiqueta="OD → UFC/mL"><Num value={od} onChange={setOd} ancho={84} /></CampoCinta>
              <span className="ec-flecha">→</span>
              <b className="ec-res"><Valor f={() => fichaConversion(c, 'od', Number(od), uOd, { nombre: f.nombre, fuera: fueraDeRango(c, Number(od)) })}>{finito(uOd) ? sciCorto(uOd) : '–'}</Valor></b>
              {finito(uOd) && <span className="ayuda">log₁₀ {fx(Math.log10(uOd), 2)}</span>}{finito(uOd) && chip(fueraDeRango(c, Number(od)))}
            </div>
          </div>
          <div className="ec-conv">
            <div className="ec-conv-fila">
              <CampoCinta etiqueta="UFC/mL → OD"><Num value={ufc} onChange={setUfc} ancho={110} /></CampoCinta>
              <span className="ec-flecha">→</span>
              <b className="ec-res"><Valor f={() => fichaConversion(c, 'ufc', Number(ufc), oU, { nombre: f.nombre, fuera: fueraDeRango(c, oU) })}>{finito(oU) ? fx(oU, 3) : '–'}</Valor></b>
              {finito(oU) && chip(fueraDeRango(c, oU))}
            </div>
          </div>
          <BotonCinta simbolo="▦" texto="Tabla de valores" onClick={() => setTabla(true)} tip={'Tabla de valores de la calibración\nOD y UFC/mL calculadas en el rango y con el intervalo que elijas, para exportar'} />
        </div>
        {tabla && <TablaValores titulo={`Tabla de la calibración · ${f.nombre}`} nombreArchivo={`calibracion - ${f.nombre}`} xEtq="OD" unidad="OD" decimalesX={3} medido={c.rango}
          desde0={Number(c.rango[0].toFixed(2))} hasta0={Number(c.rango[1].toFixed(2))} paso0={Number((((c.rango[1] - c.rango[0]) || 0.2) / 20).toPrecision(1))} cols={['log₁₀ UFC/mL', 'UFC/mL']}
          f={(x) => { const u = c.pred(x); return [finito(u) && u > 0 ? Math.log10(u) : NaN, u] }} onClose={() => setTabla(false)} />}
      </>)}
    </section>
  )
}

export function Combinado({ s }) {
  const T = useTema()
  const { pre, ufcRes, exp, res } = s
  const [modelo, setModelo] = useOpcion('combinado.modelo', 'clasico')
  const [odIn, setOdIn] = useState(0.5)
  const [ufcIn, setUfcIn] = useState(1e8)
  // tipo de error de la OD: el de «Revisión de la OD» (uno solo para todo el programa); valores sobre los puntos: Personalizar
  const [tipoErr, setTipoErr] = useOpcion('curva.error', 'sd')
  // Mostrar (el mismo grupo en todos los gráficos): rige el gráfico OD ↔ UFC y el de calibración
  const [mo, setMo] = useMostrar('combinado', { puntos: true, replicas: true })
  const conErr = !!mo.barras
  // escala del eje de la OD: por defecto log₁₀, igual que las UFC, para que las pendientes (μ) se comparen a simple vista
  const [escalaOd, setEscalaOd] = useOpcion('combinado.escalaOd', 'log10')
  const logOd = escalaOd !== 'lineal'
  const trOd = logOd ? (v) => (v > 0 ? Math.log10(v) : NaN) : (v) => v
  // la misma escala rige las UFC (log₁₀ o UFC/mL ÷ 10^pot) y el eje de la calibración
  const potU = !logOd && ufcRes?.hay ? Math.floor(Math.log10(Math.max(...ufcRes.res.map((r) => r.UFC_mL).filter(finito)))) : 0
  const kU = logOd ? 1 : 10 ** potU
  const uv = (ylog) => (logOd ? ylog : 10 ** ylog / kU)
  const modoU = logOd ? 'log10' : 'lineal'
  const yTxtU = logOd ? 'log₁₀ UFC/mL' : `UFC/mL${potU ? ` (× 10^${potU})` : ''}`
  const txtE = (e) => (logOd ? '' : e.ic ? (finito(e.lo) ? ` · IC 95 % ${sciCorto(e.lo)} a ${sciCorto(e.hi)}` : '') : finito(e.err) ? ` ± ${sciCorto(e.err)}` : '')
  const verRep = !!mo.replicas
  const nomErr = { sd: 'DE', sem: 'EEM', ic95: 'IC 95 %' }[tipoErr] || 'DE'
  // error de las UFC: con Σ C / Σ V es el IC 95 % del conteo; con la media geométrica, el tipo elegido
  const nomErrU = etiquetaErrorUfc(centroUfc(exp.aj), tipoErr)
  const txtErrU = (e) => (e.ic ? (finito(e.lo) ? ` · IC 95 % ${fx(e.lo, 2)} a ${fx(e.hi, 2)}` : '') : finito(e.err) ? ` ± ${fx(e.err, 2)} (${nomErrU})` : e.nBajo ? ` (n < 3: sin ${nomErrU})` : '')
  const etqOd = etiquetaOd(s.serie?.aj)
  const pares = useMemo(() => paresOdUfc(s, tipoErr), [pre, ufcRes, tipoErr, exp.aj.ufc_centro]) // eslint-disable-line react-hooks/exhaustive-deps
  // fases según Baranyi y Roberts: por defecto la recta se arma solo con los pares de la fase exponencial;
  // aj.calib_incl guarda las excepciones elegidas a mano ({ 'cepa|T': true/false })
  const [soloExp, setSoloExp] = useOpcion('combinado.soloExp', true)
  // cepa que se muestra en los dos gráficos del tramo
  const [cepaVent, setCepaVent] = useOpcion('combinado.cepaVent', '')
  const [modeloOdC] = useOpcion('curva.modelo', 'baranyi')
  const [lagFijoOd] = useOpcion('curva.lagfijo', '')   // modelo de la OD: el mismo de «Curva OD vs t»
  const ajOd = useMemo(() => (pre && !pre.error ? ajustesOd(s, modeloOdC, [...new Set((pre.analisis || []).filter((w) => !w.EsBlanco).map((w) => w.Muestra))], lagFijoOd) : []), [pre, s.res, modeloOdC, lagFijoOd, exp.aj.an_ancho, exp.aj.an_minpts, exp.aj.an_r2, exp.aj.an_lnmin, exp.E.ventanas]) // eslint-disable-line react-hooks/exhaustive-deps
  // La fase exponencial de la OD y la de las UFC son INDEPENDIENTES (se eligen en la Revisión de cada una).
  // La calibración usa los tiempos donde COINCIDEN: p. ej. OD 5–9 h y UFC 4–8 h → 5–8 h.
  const ventOdE = (m) => { const f = (s.res || []).filter((x) => x.Muestra === m); return ventanaOdElegida(s, f) || ventanaDeFilas(f) }
  // mismo ajuste por cepa que la tabla de Curva UFC (modelo, N máx fijado, m y centro); fracción en aj.ufc_frac_exp
  const fases = useMemo(() => (ufcRes?.hay ? Object.fromEntries([...new Set(ufcRes.res.map((r) => r.Muestra))].map((m) => [m, fasesUfc(ufcRes, m, exp.aj)])) : {}), [ufcRes, exp.aj])
  const frac = fraccionExp(exp.aj)
  const ventUfcE = (m) => tramoUfcElegido(exp.aj, m) || (fases[m]?.ok && finito(fases[m].tIni) && finito(fases[m].tFin) ? [fases[m].tIni, fases[m].tFin] : null)
  // 'vacio' = los dos tramos no se solapan; null = ninguno detectado
  const coincide = (m) => {
    const a = ventOdE(m), b = ventUfcE(m)
    if (a && b) { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); return lo <= hi + 1e-9 ? [lo, hi] : 'vacio' }
    return a || b || null
  }
  const cen = centroUfc(exp.aj)
  const paresF = useMemo(() => {
    const incl = exp.aj.calib_incl || {}
    return pares.map((p) => {
      const f = fases[p.Muestra]
      const fase = f?.ok ? f.fase(p.T_h) : ''
      const vm = coincide(p.Muestra)
      const auto = !soloExp || (vm === 'vacio' ? false : vm ? p.T_h >= vm[0] - 1e-9 && p.T_h <= vm[1] + 1e-9 : !f?.ok || fase === 'exponencial')
      const clave = `${p.Muestra}|${p.T_h}`
      return { ...p, fase, auto, clave, manual: clave in incl, usado: clave in incl ? incl[clave] : auto }
    })
  }, [pares, fases, soloExp, exp.aj.calib_incl, exp.aj.ufc_ventana, exp.aj.calib_ventana, exp.E.ventanas, s.res]) // eslint-disable-line react-hooks/exhaustive-deps
  const usados = paresF.filter((p) => p.usado)
  const alternar = (clave) => s.upd((e) => {
    const p = paresF.find((x) => x.clave === clave)
    if (!p) return {}
    const incl = { ...(e.aj.calib_incl || {}) }
    if (!p.usado === p.auto) delete incl[clave]; else incl[clave] = !p.usado
    return { aj: { ...e.aj, calib_incl: incl } }
  })
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
    if (g.length) series.push({ id: 'od' + m, nombre: `${m} · OD`, color: s.colores[m], ancho: 2, linea: false, errores: conErr, puntos: !!mo.puntos, radio: 3.2, etiqueta: conEtiquetas(mo) ? (d) => d.valor : undefined,
      data: mediaPorTiempo(g, trOd, tipoErr).filter((q) => finito(q.m)).map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, valor: textoMostrar(mo, fx(q.m, 3), finito(q.hi) ? `± ${fx(q.hi - q.m, 3)}` : ''), tip: `${m}\nt = ${fx(q.t / 3600, 2)} h\n${logOd ? 'log₁₀(' + etqOd + ')' : etqOd} media = ${fx(q.m, 3)}${logOd ? ' (' + etqOd + ' = ' + fx(10 ** q.m, 3) + ')' : ''}${finito(q.hi) ? ` ± ${fx(q.hi - q.m, 3)} (${nomErr})` : ''}` })) })
    const aOd = modeloOdC !== 'no' ? ajOd.find((a) => a.id === m) : null
    if (aOd?.c?.ok) series.push({ id: 'ajod' + m, nombre: '', color: s.colores[m], ancho: 1.4, dash: '6 3', data: Array.from({ length: 80 }, (_, i) => aOd.c.t0 + ((aOd.c.t1 - aOd.c.t0) * i) / 79).map((x) => ({ x, y: logOd ? aOd.c.pred10(x) : 10 ** aOd.c.pred10(x) })) })
    const u = ufcRes.res.filter((r) => r.Muestra === m && finito(r.log10)).sort((a, b) => a.T_h - b.T_h)
    if (u.length && (mo.puntos || conErr || conEtiquetas(mo))) series.push({ id: 'u' + m, nombre: `${m} · UFC`, color: s.colores[m], der: true, linea: false, puntos: !!mo.puntos, forma: 'cuadrado', radio: 4, ancho: 1.2, errores: conErr,
      etiqueta: conEtiquetas(mo) ? (d) => d.valor : undefined,
      data: u.map((r) => { const e = errorUfc(r, modoU, tipoErr, cen); return { x: r.T_h, y: e.m / kU, lo: e.lo / kU, hi: e.hi / kU, valor: textoMostrar(mo, logOd ? fx(e.m, 2) : sciCorto(e.m), errorTextoUfc(e, !logOd)), tip: `${m}\nT = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (${cen === 'geo' ? 'media geométrica de las réplicas' : 'Σ colonias / Σ volúmenes'})\nlog₁₀ = ${fx(Math.log10(r.UFC_mL), 2)}${logOd ? txtErrU(e) : txtE(e)}` } }) })
    if (u.length && verRep) series.push({ id: 'rep' + m, nombre: '', color: s.colores[m], der: true, linea: false, puntos: true, radio: 2.6, opacidad: 0.7,
      data: ufcRes.reps.filter((r) => r.Muestra === m && finito(r.log10) && !ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`)).map((r) => ({ x: r.T_h, y: logOd ? r.log10 : r.UFC_mL / kU, tip: `${m} · réplica ${r.Replica} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (log₁₀ ${fx(r.log10, 2)})` })) })
    if (u.length) { const cs = curvaUfc(ufcRes, m, exp.aj); if (cs?.ok) series.push({ id: 'sv' + m, nombre: '', color: s.colores[m], der: true, ancho: 1.4, dash: '6 3', data: cs.puntos.map((q) => ({ x: q.x, y: uv(q.y) })) }) }
  })
  // calibración
  const pv = paresF.filter((p) => vis.includes(p.Muestra))
  const visCal = [...new Set(pares.map((p) => p.Muestra))].filter((m) => vis.includes(m))
  const cepaV = visCal.includes(cepaVent) ? cepaVent : visCal[0]
  const fV = fases[cepaV]
  const ventanaOd = ventOdE(cepaV), ventanaU = ventUfcE(cepaV), interV = coincide(cepaV)
  const colV = s.colores[cepaV]
  // los dos gráficos del tramo: log₁₀ OD y log₁₀ UFC/mL de la cepa elegida contra el tiempo (con lo que se prenda en «Mostrar»)
  const odCal = seriesOdCalibracion(pre).filter((w) => w.Muestra === cepaV)
  const etqYOd = logOd ? `log₁₀(${etqOd})` : etqOd
  const serieVentOd = []   // (la recta, el nivel inicial y el cruce se agregan abajo, para OD y para UFC por separado)
  if (verRep) serieVentOd.push({ id: 'vodr', nombre: '', color: colV, linea: false, puntos: true, radio: 2.4, opacidad: 0.6, data: odCal.flatMap((w) => w.t.map((t, i) => ({ x: t / 3600, y: trOd(w.y[i]), tip: `réplica ${w.Replica}\nt = ${fx(t / 3600, 2)} h\n${etqYOd} = ${fx(trOd(w.y[i]), 3)}` }))).filter((d) => finito(d.y)) })
  if (mo.puntos || conErr || conEtiquetas(mo)) serieVentOd.push({ id: 'vod', nombre: cepaV, color: colV, linea: false, puntos: !!mo.puntos, radio: 3.6, errores: conErr, etiqueta: conEtiquetas(mo) ? (d) => d.valor : undefined,
    data: mediaPorTiempo(odCal, trOd, tipoErr).filter((q) => finito(q.m)).map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, valor: textoMostrar(mo, fx(q.m, 3), finito(q.hi) ? `± ${fx(q.hi - q.m, 3)}` : ''), tip: `${cepaV}\nt = ${fx(q.t / 3600, 2)} h\n${etqYOd} = ${fx(q.m, 3)}` })) })
  const resV = ufcRes.res.filter((r) => r.Muestra === cepaV && finito(r.log10)).sort((a, b) => a.T_h - b.T_h)
  const serieVentUfc = []
  if (verRep) serieVentUfc.push({ id: 'vur', nombre: '', color: colV, linea: false, puntos: true, radio: 2.4, opacidad: 0.6, data: ufcRes.reps.filter((r) => r.Muestra === cepaV && finito(r.log10) && !ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`)).map((r) => ({ x: r.T_h, y: logOd ? r.log10 : r.UFC_mL / kU, tip: `réplica ${r.Replica} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)}` })) })
  if (resV.length && (mo.puntos || conErr || conEtiquetas(mo))) serieVentUfc.push({ id: 'vu', nombre: cepaV, color: colV, linea: false, puntos: !!mo.puntos, forma: 'cuadrado', radio: 4, errores: conErr, etiqueta: conEtiquetas(mo) ? (d) => d.valor : undefined,
    data: resV.map((r) => { const e = errorUfc(r, modoU, tipoErr, cen); return { x: r.T_h, y: e.m / kU, lo: e.lo / kU, hi: e.hi / kU, valor: textoMostrar(mo, logOd ? fx(e.m, 2) : sciCorto(e.m), errorTextoUfc(e, !logOd)), tip: `${cepaV}\nT = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)}${logOd ? txtErrU(e) : txtE(e)}` } }) })
  // recta de la fase exponencial (log₁₀ contra t, solo el tramo elegido), nivel inicial (OD₀ / UFC₀) y su cruce con la recta (el lag)
  const lg10 = (v) => (v > 0 ? Math.log10(v) : NaN)
  const faseRecta = (pts, ven, mapY, color) => {
    const vacio = { series: [], extras: [] }
    if (!ven || pts.length < 3) return vacio
    const w = pts.filter((p) => p.x >= ven[0] - 1e-9 && p.x <= ven[1] + 1e-9)
    if (w.length < 2) return vacio
    const mx = w.reduce((a, p) => a + p.x, 0) / w.length, my = w.reduce((a, p) => a + p.y, 0) / w.length
    const sxx = w.reduce((a, p) => a + (p.x - mx) ** 2, 0), sxy = w.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0)
    if (!(sxx > 0)) return vacio
    const b = sxy / sxx, a0 = my - b * mx
    if (!(b > 0)) return vacio
    const y0 = pts[0].y, lag = (y0 - a0) / b, tMin = pts[0].x, tMax = pts[pts.length - 1].x, span = tMax - tMin || 1
    const xa = Math.min(Math.max(lag, tMin - 0.6 * span), ven[0]) - 0.03 * span, xb = Math.min(tMax, ven[1] + 0.15 * span)
    const recta = Array.from({ length: 40 }, (_, i) => xa + ((xb - xa) * i) / 39).map((x) => ({ x, y: mapY(a0 + b * x) }))
    const nivel = [Math.min(tMin, lag), Math.max(lag, tMin) + 0.08 * span].map((x) => ({ x, y: mapY(y0) }))
    const hayLag = lag >= tMin - 0.6 * span && lag <= tMax
    return {
      lag: hayLag ? lag : NaN,
      series: [
        { id: 'rf' + color, nombre: '', color, ancho: 1.6, dash: '6 4', data: recta },
        { id: 'n0' + color, nombre: '', color: T.sec, ancho: 1, dash: '2 3', data: nivel },
      ],
      extras: hayLag ? [{ x: lag, y: mapY(y0), color, forma: 'anillo', tip: `Cruce de la recta de la fase exponencial con el nivel inicial\nlag λ = ${fx(lag, 2)} h` }] : [],
    }
  }
  const mtLogOd = mediaPorTiempo(odCal, lg10, tipoErr).filter((q) => finito(q.m)).map((q) => ({ x: q.t / 3600, y: q.m }))
  const frOd = faseRecta(mtLogOd, ventanaOd, (yl) => (logOd ? yl : 10 ** yl), colV)
  const frUfc = faseRecta(resV.map((r) => ({ x: r.T_h, y: centroLog10(r, cen) })).filter((p) => finito(p.y)), ventanaU, uv, colV)
  // En cada gráfico del tramo SOLO: la recta ajustada a log₁₀ de la fase exponencial elegida y la horizontal y = OD₀ (o UFC₀), con su cruce (el lag).
  // No va ninguna curva de modelo (Baranyi, Huang): esos gráficos sirven para juzgar si el tramo exponencial está bien elegido.
  const gUfc = frUfc, gOd = frOd
  serieVentOd.push(...gOd.series)
  serieVentUfc.push(...gUfc.series)
  const xsV = [...mtLogOd.map((p) => p.x), ...resV.map((r) => r.T_h), ...[gOd.lag, gUfc.lag].filter(finito)]
  const xlimV = xsV.length ? [Math.min(...xsV) - 0.04 * (Math.max(...xsV) - Math.min(...xsV) || 1), Math.max(...xsV) + 0.04 * (Math.max(...xsV) - Math.min(...xsV) || 1)] : undefined
  const filasCal = [...vis.filter((m) => calCepa[m]).map((m) => ({ id: m, nombre: m, color: s.colores[m], c: calCepa[m] }))]
  const FASE = { lag: 'fase de latencia', exponencial: 'fase exponencial', estacionaria: 'fase estacionaria' }
  // ejes de la calibración: y = log₁₀ UFC/mL o UFC/mL según la escala; x = OD, o log₁₀ OD con el modelo de potencia en log₁₀ (así su recta se ve recta)
  const logX = logOd && modelo === 'potencia'
  const xv = (od) => (logX ? (od > 0 ? Math.log10(od) : NaN) : od)
  const rectaEn = { clasico: logOd && !logX, potencia: logOd && logX, lineal: !logOd, proporcional: !logOd }[modelo]
  const calSeries = [...new Set(pv.map((p) => p.Muestra))].flatMap((m) => [true, false].map((uso) => ({ id: (uso ? '' : 'x') + m, nombre: uso ? m : '', color: s.colores[m], linea: false, puntos: true, radio: 4, errores: uso && conErr, opacidad: uso ? 1 : 0.3,
    etiqueta: conEtiquetas(mo) ? (d) => d.valor : undefined,
    data: pv.filter((p) => p.Muestra === m && p.usado === uso && finito(xv(p.OD))).map((p) => {
      const e = errorUfc(p._ufc, modoU, tipoErr, cen)
      return { x: xv(p.OD), y: logOd ? p.log10_UFC : p.UFC_mL / kU, lo: e.lo / kU, hi: e.hi / kU, xlo: finito(p.OD_err) ? xv(p.OD - p.OD_err) : NaN, xhi: finito(p.OD_err) ? xv(p.OD + p.OD_err) : NaN,
        valor: textoMostrar(mo, logOd ? fx(p.log10_UFC, 2) : sciCorto(p.UFC_mL), errorTextoUfc(e, !logOd)),
        key: p.clave,
        tip: `${m} · T = ${p.T_h} h${p.fase ? ` · ${FASE[p.fase]}` : ''}\n${uso ? 'Usado' : 'No usado'} en la recta${p.manual ? ' (elegido a mano)' : ''} · clic para ${uso ? 'excluirlo' : 'incluirlo'}\nOD = ${fx(p.OD, 3)}${finito(p.OD_err) ? ` ± ${fx(p.OD_err, 3)} (${nomErr})` : ''}${p.OD_interpolada ? ' (interpolada)' : ''}\nUFC/mL = ${sciCorto(p.UFC_mL)}\nlog₁₀ = ${fx(p.log10_UFC, 2)}${logOd ? txtErrU(e) : txtE(e)}` }
    }) })))
  const trazo = (c) => Array.from({ length: 80 }, (_, i) => c.rango[0] + ((c.rango[1] - c.rango[0]) * i) / 79).map((x) => ({ x: xv(x), y: (() => { const u = c.pred(x); return logOd ? Math.log10(u) : u / kU })() })).filter((d) => finito(d.x) && finito(d.y))
  vis.forEach((m) => { const c = calCepa[m]; if (c?.ok) calSeries.push({ id: 'aj' + m, nombre: '', color: s.colores[m], ancho: 1.8, data: trazo(c) }) })
  return (
    <div className="pagina">
      <Cinta>
        <GrupoMostrar m={mo} set={setMo} notas={{ puntos: 'La media de cada tiempo (OD y UFC)', replicas: 'Cada recuento de UFC como un punto chico', barras: 'Banda de error de la OD y barras de las UFC\nOD: el tipo de error elegido en «Revisión de la OD»; UFC: el de «Revisión de los recuentos»' }} />
        <Grupo titulo="Escala del eje Y">
          <OpcionesCinta valor={escalaOd} onChange={setEscalaOd} opciones={[['lineal', 'Lineal', 'N', null, 'OD y UFC/mL tal cual'], ['log10', 'log₁₀', 'lg', null, 'log₁₀(OD) y log₁₀ UFC/mL: la fase exponencial es una recta en las dos y las pendientes se comparan directamente']]} />
        </Grupo>
        <Grupo titulo="Calibración">
          <CampoCinta etiqueta="Modelo"><Sel value={modelo} onChange={setModelo} opciones={Object.entries(MODELOS_CALIB)} /></CampoCinta>
          <BotonCinta simbolo="⟋" texto="Solo fase exponencial" activo={soloExp} onClick={() => setSoloExp(!soloExp)} tip={'Armar la recta solo con los pares de la fase exponencial\n(fases según el ajuste de los recuentos de cada cepa, el mismo de «Curva UFC vs t»)\nApagado: todos los pares'} />
          <CampoCinta etiqueta="Fracción de μ máx" tip={'Un tiempo está en fase exponencial cuando la velocidad del modelo\nes al menos esta fracción de μ máx (entre 0 y 1; por defecto 0,5)'}><Num value={exp.aj.ufc_frac_exp ?? 0.5} onChange={(x) => s.setAj('ufc_frac_exp', x)} ancho={52} /></CampoCinta>
          <BotonCinta icono="refrescar" texto="Restablecer pares" deshabilitado={!Object.keys(exp.aj.calib_incl || {}).length} onClick={() => s.setAj('calib_incl', {})} tip={'Descartar los pares incluidos o excluidos a mano con un clic\nEl tramo exponencial (y volver al automático) se maneja en «Fases…» de la Revisión'} />
        </Grupo>
      </Cinta>
      <Encabezado titulo="OD ↔ UFC" sub="Las curvas de OD y de UFC de las mismas cepas juntas y la calibración para pasar de una a otra. Abajo, la comparación de μ por OD y por recuento. Clic en un número: cómo se calculó." />
      <SelectorCepas s={s} muestras={muestras} />
      <div className="tarjeta">
        {(() => {
          const xs = series.flatMap((q) => q.data.map((d) => d.x)).filter(finito)
          const xlim = xs.length ? [Math.min(...xs) - 0.03 * (Math.max(...xs) - Math.min(...xs) || 1), Math.max(...xs) + 0.03 * (Math.max(...xs) - Math.min(...xs) || 1)] : undefined
          const sOd = series.filter((q) => !q.der), sUfc = series.filter((q) => q.der).map((q) => ({ ...q, der: false }))
          return (<>
            <h3 style={{ margin: '0 0 2px' }}>OD · {etqYOd}</h3>
            <Grafico series={sOd} xlim={xlim} xTxt="" yTxt={`${etqYOd}${conErr ? ` (media ± ${nomErr})` : ''}`} alto={300} leyenda={false} nombre={`od_${exp.nombre}`} titulo={exp.nombre} estilo={s.estiloGrafico('combinado')} idEstilo="combinado" />
            <h3 style={{ margin: '10px 0 2px' }}>UFC · {yTxtU}</h3>
            <Grafico series={sUfc} xlim={xlim} yTxt={yTxtU} alto={300} nombre={`ufc_${exp.nombre}`} titulo="" estilo={s.estiloGrafico('combinado')} idEstilo="combinado" />
          </>)
        })()}
        <p className="ayuda" style={{ marginTop: 6 }}>Círculos con barras: {logOd ? 'log₁₀ de la ' : ''}{etqOd === 'OD' ? 'OD' : `${etqOd} (normalizada solo para el gráfico)`}, media ± {nomErr} (eje izquierdo). Cuadrados con barras: log₁₀ UFC/mL, {cen === 'geo' ? `media geométrica de las réplicas (media de log₁₀) ± ${nomErrU}` : 'suma de colonias / suma de volúmenes, con su IC 95 % del conteo'} (eje derecho){'; líneas a trazos: curva del modelo de cada magnitud (la de la OD, el modelo elegido en «Curva OD vs t»; la de las UFC, el elegido en «Curva UFC vs t»). Si en esos menús está «Linealizar log₁₀», es la recta del tramo exponencial elegido en «Fases…» (Revisión de la OD) o en la calibración, abajo'}.</p>
      </div>
      <div className="tarjeta" style={{ minWidth: 0 }}>
        <h2>Fase exponencial usada en la calibración</h2>
        <div className="fila" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
          <Campo label="Cepa"><Sel value={cepaV} onChange={setCepaVent} opciones={visCal.map((m) => [m, m])} /></Campo>
          <BotonCinta icono="editar" texto="Tramo de la OD" onClick={() => s.irA(exp.origenOd ? 'calidad' : 'calidadUfc')} tip={'El tramo exponencial de la OD se elige en «Fases…» de la Revisión de la OD'} />
          <BotonCinta icono="editar" texto="Tramo de las UFC" onClick={() => s.irA('calidadUfc')} tip={'El tramo exponencial de las UFC se elige en «Fases…» de la Revisión de los recuentos'} />
          <span className="ayuda">OD: {ventanaOd ? `${fx(ventanaOd[0], 2)} a ${fx(ventanaOd[1], 2)} h` : '–'} · UFC: {ventanaU ? `${fx(ventanaU[0], 2)} a ${fx(ventanaU[1], 2)} h` : '–'} · <b>la calibración usa {interV === 'vacio' ? 'ningún tiempo: los dos tramos no se solapan' : interV ? `los tiempos que coinciden: ${fx(interV[0], 2)} a ${fx(interV[1], 2)} h` : 'todos los pares'}</b>. Cada medición tiene su propia fase exponencial: se eligen por separado en cada Revisión («Fases…») y la calibración toma solo lo que tienen en común.</span>
        </div>
        <div className="ec-dos">
          <div>
            <h3 style={{ marginTop: 0 }}>OD · {etqYOd} vs t</h3>
            <Grafico series={serieVentOd} extras={gOd.extras} xlim={xlimV} yTxt={etqYOd} xTxt="Tiempo (h)" alto={280} ventana={ventanaOd || undefined} nombre={`ventana_od_${cepaV}`} estilo={s.estiloGrafico('combinadoVentana')} idEstilo="combinadoVentana" />
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>UFC · {yTxtU} vs t</h3>
            <Grafico series={serieVentUfc} extras={gUfc.extras} xlim={xlimV} yTxt={yTxtU} xTxt="Tiempo (h)" alto={280} ventana={ventanaU || undefined} nombre={`ventana_ufc_${cepaV}`} estilo={s.estiloGrafico('combinadoVentana')} idEstilo="combinadoVentana" />
          </div>
        </div>
        <p className="ayuda" style={{ margin: '0 0 8px' }}>En cada gráfico, por separado: línea a trazos = recta ajustada a {logOd ? 'log₁₀' : 'los datos (en log₁₀)'} del tramo elegido · línea punteada = nivel inicial de ESA magnitud (OD₀ en el de OD, UFC₀ en el de UFC) · anillo = donde la recta cruza ese nivel (el lag λ de la OD y el de las UFC). Si la recta sigue bien a los puntos del tramo, la fase exponencial está bien elegida.</p>
        <div className="calib-resultado" style={{ marginBottom: 4 }}>
          <b>Datos usados en la recta.</b> {soloExp ? <>Solo los pares dentro del tramo donde <b>coinciden</b> la fase exponencial de la OD y la de las UFC (cada una elegida en su Revisión; si no se eligió, la automática).</> : <>Todos los pares (la selección por fase está apagada).</>} La OD es la corregida por el blanco, sin suavizar ni normalizar. También podés hacer clic en un punto del gráfico de calibración o en la tabla «Pares OD–UFC» para incluirlo o excluirlo.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{[...new Set(pv.map((p) => p.Muestra))].map((m) => {
            const f = fases[m], g = pv.filter((p) => p.Muestra === m)
            const ts = (arr) => arr.map((p) => `${fx(p.T_h, 1)}${p.manual ? '*' : ''}`).join(', ')
            const no = g.filter((p) => !p.usado)
            return <li key={m}><b>{m}</b>: {(() => { const a = ventOdE(m), b = ventUfcE(m), c = coincide(m); const tr = (x) => (x ? `${fx(x[0], 2)} a ${fx(x[1], 2)} h` : '–'); return <>OD {tr(a)} · UFC {tr(b)} · coinciden: {c === 'vacio' ? 'ninguno (no se solapan)' : tr(c)}</> })()}. {f?.ok ? <>fase exponencial de {fx(f.tIni, 1)} a {fx(f.tFin, 1)} h{f.sigue ? ' (sigue después del último recuento)' : ''}, μ = {fx(f.c.mu / Math.LN10, 3)} log₁₀/h, λ = {fx(f.c.lag_h, 2)} h ({MODELOS_UFC[f.c.modelo]}{f.c.sinAsintota ? ', sin meseta en los datos' : ''}{f.c.ymaxFijo ? ', N máx fijado' : ''})</> : <>sin fases ({f?.motivo || 'sin recuentos'}): se usan todos</>}
              {' '}· se usan T = {ts(g.filter((p) => p.usado)) || 'ninguno'} h{no.length ? <> · no se usan T = {ts(no)} h ({[...new Set(no.map((p) => (p.manual ? 'a mano' : FASE[p.fase])))].join(', ')})</> : null}</li>
          })}</ul>
          {pv.some((p) => p.manual) && <small className="ayuda">* elegido a mano</small>}
        </div>
      </div>
      <div className="tarjeta" style={{ minWidth: 0 }}>
        <h2>Calibración: {yTxtU} vs {logX ? 'log₁₀ OD' : 'OD'}</h2>
        <SelectorCepas s={s} muestras={[...new Set(pares.map((p) => p.Muestra))]} />
        {(() => {
          // más de la mitad de las OD netas (corregidas por el blanco) ≤ 0: el blanco probablemente está mal
          const nNeg = pv.filter((p) => finito(p.OD) && p.OD <= 0).length
          return pv.length > 0 && nNeg > pv.length / 2
            ? <p className="aviso-caja"><b>Blanco posiblemente inválido:</b> {nNeg} de {pv.length} OD corregidas por el blanco son ≤ 0. Un blanco con más absorbancia que las muestras (medio distinto, cubeta sucia, burbujas) desplaza toda la recta. Revisá el blanco antes de usar esta calibración.</p>
            : null
        })()}
        {pv.length < 3 ? <p className="aviso-caja">Hacen falta al menos 3 pares OD–UFC (misma cepa y tiempo) dentro del rango de tiempo de la OD.</p> : (
          <Grafico series={calSeries} xTxt={logX ? 'log₁₀ OD' : 'OD'} yTxt={yTxtU} alto={340} nombre="calibracion" estilo={s.estiloGrafico('calibracion')} idEstilo="calibracion" onPuntoClick={alternar} />
        )}
        <p className="ayuda" style={{ marginTop: 6 }}>{rectaEn ? 'Con estos ejes la ecuación del modelo se ve como una recta.' : `Con estos ejes la ecuación del modelo se ve curva, porque ${{ clasico: 'es una recta de log₁₀ UFC contra OD (escala log₁₀ en el eje Y)', potencia: 'es una recta en log–log (escala log₁₀: se pone también log₁₀ OD en x)', lineal: 'es una recta de UFC contra OD (escala lineal)', proporcional: 'es una recta de UFC contra OD (escala lineal)' }[modelo]}.`}</p>
        <div className="ec-modelo" style={{ marginTop: 14 }}>
          <h2>Ecuación de la calibración</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>{MODELOS_CALIB[modelo]} · una ecuación por cepa. Clic en la ecuación o en un número: cómo se calculó.</p>
          <div className="ec-grid">{filasCal.map((f) => <BloqueCalib key={f.id} f={f} usados={paresDe(f.id)} />)}</div>
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
      {res?.length > 0 && <SeccionComparacion s={s} />}
    </div>
  )
}
