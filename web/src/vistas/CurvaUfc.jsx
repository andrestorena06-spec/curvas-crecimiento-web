import { useMemo, useState } from 'react'
import { dGeo, dMuUfc } from '../calculos.js'
import { finito } from '../motor/analisis.js'
import { crecimientoUfc, curvaSuaveUfc } from '../motor/ufc.js'
import { useTema } from '../tema.js'
import { Campo, Encabezado, Icono, Seg, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, sciCorto } from '../utils.js'

export const crecimientoPorCepa = (res) => {
  const por = {}
  res.forEach((r) => { (por[r.Muestra] ||= []).push(r) })
  return Object.entries(por).map(([m, rs]) => ({ Muestra: m, c: crecimientoUfc(rs) }))
}

export function CurvaUfc({ s }) {
  const T = useTema()
  const { exp, ufcRes } = s
  const [escala, setEscala] = useState('log10')
  const [error, setError] = useState('sd')
  const [pers, setPers] = useState(null)
  const crec = useMemo(() => (ufcRes?.hay ? crecimientoPorCepa(ufcRes.res) : []), [ufcRes])
  if (!ufcRes?.hay) return <div className="pagina"><Encabezado titulo="Curva UFC" /><Vacio titulo="Todavía no hay conteos">Cargá las colonias en «Conteo».</Vacio></div>
  const res = ufcRes.res.filter((r) => finito(r.log10))
  const muestras = [...new Set(res.map((r) => r.Muestra))]
  const lin = escala === 'lineal'
  const pot = lin ? Math.floor(Math.log10(Math.max(...res.map((r) => r.UFC_mL)))) : 0
  const series = muestras.map((m) => ({
    id: m, nombre: m, color: s.colores[m], linea: false, puntos: true, forma: 'cuadrado', radio: 4, ancho: 2, errores: true,
    data: res.filter((r) => r.Muestra === m).sort((a, b) => a.T_h - b.T_h).map((r) => {
      const e = error === 'sd' ? r.DE_log10 : finito(r.IC95_inf) ? r.log10 - Math.log10(r.IC95_inf) : NaN
      const y = lin ? r.UFC_mL / 10 ** pot : r.log10
      const lo = lin ? (finito(e) ? 10 ** (r.log10 - e) / 10 ** pot : NaN) : r.log10 - e
      const hi = lin ? (finito(e) ? 10 ** (r.log10 + e) / 10 ** pot : NaN) : r.log10 + e
      return { x: r.T_h, y, lo, hi, tip: `${m} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (media geométrica)\nlog₁₀ = ${fx(r.log10, 2)}${finito(r.DE_log10) ? ` ± ${fx(r.DE_log10, 2)}` : ''}\n${r.N} réplica${r.N === 1 ? '' : 's'}` }
    }),
  }))
  // recta de μ sobre la ventana elegida
  crec.forEach(({ Muestra, c }) => {
    if (!exp.aj.ufc_recta || !c || !finito(c.mu) || lin) return
    const [a, b] = c.ventana.split(' a ').map((x) => parseFloat(x))
    series.push({ id: 'mu' + Muestra, nombre: '', color: s.colores[Muestra], dash: '5 4', ancho: 1.2, opacidad: 0.8,
      data: [a, b].map((t) => ({ x: t, y: (c.intercepto + c.mu * t) / Math.LN10 })) })
  })
  // curva suavizada (Baranyi-Roberts sobre ln UFC/mL)
  const avisosSuave = []
  if (exp.aj.ufc_suave !== false) muestras.forEach((m) => {
    const cs = curvaSuaveUfc(res.filter((r) => r.Muestra === m), (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave))
    if (!cs.ok) { avisosSuave.push(`${m}: ${cs.motivo}`); return }
    series.push({ id: 'sv' + m, nombre: '', color: s.colores[m], ancho: 2, data: cs.puntos.map((q) => ({ x: q.x, y: lin ? 10 ** q.y / 10 ** pot : q.y })) })
  })
  return (
    <div className="pagina">
      <Encabezado titulo="Curva de crecimiento por UFC/mL" sub={`Media geométrica de las réplicas incluidas en cada tiempo (cuadrados).${exp.aj.ufc_suave !== false ? ((exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave) === 'spline' ? ' Línea continua: curva suavizada (spline monótona por las medias).' : ' Línea continua: curva del modelo de Baranyi-Roberts ajustado a ln UFC/mL.') : ''}${exp.aj.ufc_recta ? ' Línea punteada: recta de μ.' : ''}`}>
      </Encabezado>
      <Cinta>
        <Grupo titulo="Escala"><OpcionesCinta valor={escala} onChange={setEscala} opciones={[['log10', 'log₁₀', 'lg'], ['lineal', 'Lineal', 'N']]} /></Grupo>
        <Grupo titulo="Barras"><OpcionesCinta valor={error} onChange={setError} opciones={[['sd', 'DE de log₁₀', 's'], ['ic', 'IC 95 %', 'IC']]} /></Grupo>
        <Grupo titulo="Gráfico">
          <OpcionesCinta valor={exp.aj.ufc_suave === false ? 'no' : (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave)} onChange={(v) => s.setAj('ufc_suave', v === 'no' ? false : v)} opciones={[['no', 'Sin curva', '·', null, 'Solo los puntos, sin líneas'], ['baranyi', 'Baranyi', '∿', null, 'Curva del modelo de Baranyi-Roberts ajustado a ln(UFC/mL) (4 o más tiempos)'], ['spline', 'Spline', '⌇', null, 'Spline cúbica monótona que pasa por cada media sin oscilar']]} />
          <BotonCinta simbolo="⟋" texto="Recta de μ" activo={!!exp.aj.ufc_recta} onClick={() => s.setAj('ufc_recta', !exp.aj.ufc_recta)} tip="Recta de la pendiente máxima de ln(UFC/mL) usada para μ" />
          <BotonCinta icono="editar" texto="Personalizar" activo={pers === 'curvaUfc'} onClick={() => setPers(pers === 'curvaUfc' ? null : 'curvaUfc')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
        <Grupo titulo="Siguiente"><BotonCinta icono={exp.tipo === 'odufc' ? 'combinar' : 'tabla'} texto={exp.tipo === 'odufc' ? 'OD + UFC' : 'Datos'} onClick={() => s.irA(exp.tipo === 'odufc' ? 'combinado' : 'datos')} /></Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'curvaUfc'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="curvaUfc" /></Cajon>
      {avisosSuave.length > 0 && <p className="ayuda">Sin curva suavizada: {avisosSuave.join(' · ')}.</p>}
      <div className="tarjeta">
        <Grafico series={series} yTxt={lin ? `UFC/mL${pot ? ` (× 10^${pot})` : ''}` : 'log₁₀ UFC/mL'} alto={420} nombre={`ufc_${exp.nombre}`} titulo={exp.nombre} ceroY={lin} estilo={s.estiloGrafico('curvaUfc')} />
      </div>
      <div className="tarjeta">
        <h2>Parámetros de crecimiento por recuento</h2>
        <div className="tabla-scroll alta"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">μ (h⁻¹)</th><th className="num">td (min)</th><th className="num">Lag (h)</th><th className="num">R²</th><th>Ventana</th><th className="num">log₁₀ N₀</th><th className="num">Aumento (log₁₀)</th><th className="num">Generaciones</th></tr></thead>
          <tbody>{crec.map(({ Muestra, c }) => (
            <tr key={Muestra}><td><i className="punto" style={{ background: s.colores[Muestra], marginRight: 6 }} /><b>{Muestra}</b></td>
              {c && finito(c.mu) ? <>
                <td className="num" data-tip={dMuUfc(c)}>{fs(c.mu, 4)}</td><td className="num">{fs(c.td_min, 4)}</td><td className="num">{fs(c.lag_h, 3)}</td><td className="num">{fx(c.r2, 3)}</td>
                <td>{c.ventana} ({c.n_ventana} tiempos)</td><td className="num">{fx(c.log10_N0, 2)}</td><td className="num">{fx(c.crecimiento_log10, 2)}</td><td className="num">{fx(c.generaciones, 2)}</td>
              </> : <td colSpan={8} className="ayuda">{c ? c.aviso : 'Hacen falta al menos 3 tiempos con conteo.'}</td>}
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="tarjeta">
        <h2>UFC/mL por cepa y tiempo</h2>
        <div className="tabla-scroll"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num">Réplicas</th><th className="num">UFC/mL</th><th className="num">IC 95 %</th><th className="num">log₁₀ ± DE</th><th className="num">CV %</th><th>Estado</th></tr></thead>
          <tbody>{ufcRes.res.map((r) => (
            <tr key={r.Muestra + r.T_h}><td>{r.Muestra}</td><td className="num">{r.T_h}</td><td className="num">{r.N} / {r.Con_conteos}</td>
              <td className="num" data-tip={dGeo(r) || undefined}><b>{sciCorto(r.UFC_mL)}</b></td>
              <td className="num">{finito(r.IC95_inf) ? `${sciCorto(r.IC95_inf)} – ${sciCorto(r.IC95_sup)}` : '–'}</td>
              <td className="num">{fx(r.log10, 2)}{finito(r.DE_log10) ? ` ± ${fx(r.DE_log10, 2)}` : ''}</td><td className="num">{fx(r.CV_pct, 0)}</td>
              <td style={{ color: T.sec, fontSize: 12 }}>{r.Estado}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  )
}
