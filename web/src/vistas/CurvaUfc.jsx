import { useMemo, useState } from 'react'
import { dMuUfc, dPromedioUfc } from '../calculos.js'
import { finito } from '../motor/analisis.js'
import { ERRORES_UFC, crecimientoUfc, curvaSuaveUfc, errorUfc, textoErrorUfc } from '../motor/ufc.js'
import { OPCIONES_CURVA_UFC, OPCIONES_ERROR_UFC, curvaUfcDe, verUfc } from './CalidadUfc.jsx'
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
  const tipoErr = verUfc(exp.aj).error
  const v = { replicas: false, valores: false, errores: true, ...(exp.aj.ufc_ver_curva || {}) }
  const setV = (k, x) => s.upd((e) => ({ aj: { ...e.aj, ufc_ver_curva: { ...(e.aj.ufc_ver_curva || {}), [k]: x } } }))
  const [pers, setPers] = useState(null)
  const crec = useMemo(() => (ufcRes?.hay ? crecimientoPorCepa(ufcRes.res) : []), [ufcRes])
  if (!ufcRes?.hay) return <div className="pagina"><Encabezado titulo="Curva UFC vs t" /><Vacio titulo="Todavía no hay conteos">Cargá las colonias en «Conteo».</Vacio></div>
  const res = ufcRes.res.filter((r) => finito(r.log10))
  const muestras = [...new Set(res.map((r) => r.Muestra))]
  const lin = escala === 'lineal'
  const pot = lin ? Math.floor(Math.log10(Math.max(...res.map((r) => r.UFC_mL)))) : 0
  const series = muestras.map((m) => ({
    id: m, nombre: m, color: s.colores[m], linea: false, puntos: true, forma: 'cuadrado', radio: 4, ancho: 2, errores: v.errores,
    etiqueta: v.valores ? (d) => d.valor : undefined,
    data: res.filter((r) => r.Muestra === m).sort((a, b) => a.T_h - b.T_h).map((r) => {
      const e = errorUfc(r, lin ? 'lineal' : 'log10', tipoErr)
      const k = lin ? 10 ** pot : 1
      const valor = (v.errores ? textoErrorUfc(e, lin, tipoErr) : lin ? sciCorto(e.m) : fx(e.m, 2)).replace('\n', ' ')
      return { x: r.T_h, y: e.m / k, lo: e.lo / k, hi: e.hi / k, valor, tip: `${m} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (Σ colonias / Σ volumen)\n${r.Colonias_suma} colonias en ${r.N} réplica${r.N === 1 ? '' : 's'}\nlog₁₀ = ${fx(r.log10, 2)}${finito(r.DE_log10) ? ` (DE entre réplicas ${fx(r.DE_log10, 2)})` : ''}` }
    }),
  }))
  // réplicas: cada conteo como un punto chico, para ver cuánto se aparta de la media
  if (v.replicas) muestras.forEach((m) => {
    series.push({ id: 'rep' + m, nombre: '', color: s.colores[m], linea: false, puntos: true, radio: 3, opacidad: 0.75,
      data: ufcRes.reps.filter((r) => r.Muestra === m && finito(r.log10) && !ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`)).map((r) => ({ x: r.T_h, y: lin ? r.UFC_mL / 10 ** pot : r.log10, tip: `${m} · réplica ${r.Replica} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (log₁₀ ${fx(r.log10, 2)})` })) })
  })
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
      <Encabezado titulo="Curva UFC vs t" sub={`Cuadrados: promedio de las réplicas de cada tiempo (suma de colonias / suma de volúmenes sembrados).${exp.aj.ufc_suave !== false ? ((exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave) === 'spline' ? ' Línea continua: curva suavizada (spline monótona por las medias).' : ' Línea continua: curva del modelo de Baranyi-Roberts ajustado a ln UFC/mL.') : ''}${exp.aj.ufc_recta ? ' Línea punteada: recta de μ.' : ''}`}>
      </Encabezado>
      <Cinta>
        <Grupo titulo="Escala"><OpcionesCinta valor={escala} onChange={setEscala} opciones={[['log10', 'log₁₀', 'lg'], ['lineal', 'Lineal', 'N']]} /></Grupo>
        <Grupo titulo="Mostrar">
          <BotonCinta simbolo="•" texto="Réplicas" activo={v.replicas} onClick={() => setV('replicas', !v.replicas)} tip={'Cada conteo como un punto\nPara ver cuánto se aparta cada réplica de la media'} />
          <BotonCinta simbolo="12" texto="Valores" activo={v.valores} onClick={() => setV('valores', !v.valores)} tip={'Valor de cada media\nCon su error si «Error» está activo'} />
          <BotonCinta simbolo="±" texto="Error" activo={v.errores} onClick={() => setV('errores', !v.errores)} tip={'Barras de error\nDel tipo elegido en «Tipo de error»'} />
        </Grupo>
        <Grupo titulo="Tipo de error"><OpcionesCinta valor={tipoErr} onChange={(x) => s.setAj('ufc_err', x)} opciones={OPCIONES_ERROR_UFC} /></Grupo>
        <Grupo titulo="Gráfico">
          <OpcionesCinta valor={curvaUfcDe(exp.aj)} onChange={(x) => s.setAj('ufc_suave', x === 'no' ? false : x)} opciones={OPCIONES_CURVA_UFC} />
          <BotonCinta simbolo="⟋" texto="Recta de μ" activo={!!exp.aj.ufc_recta} onClick={() => s.setAj('ufc_recta', !exp.aj.ufc_recta)} tip="Recta de la pendiente máxima de ln(UFC/mL) usada para μ" />
          <BotonCinta icono="editar" texto="Personalizar" activo={pers === 'curvaUfc'} onClick={() => setPers(pers === 'curvaUfc' ? null : 'curvaUfc')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'curvaUfc'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="curvaUfc" /></Cajon>
      {avisosSuave.length > 0 && <p className="ayuda">Sin curva suavizada: {avisosSuave.join(' · ')}.</p>}
      <div className="tarjeta">
        <Grafico series={series} yTxt={lin ? `UFC/mL${pot ? ` (× 10^${pot})` : ''}` : 'log₁₀ UFC/mL'} alto={420} nombre={`ufc_${exp.nombre}`} titulo={exp.nombre} ceroY={lin} estilo={s.estiloGrafico('curvaUfc')} idEstilo="curvaUfc" />
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
          <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num">Réplicas</th><th className="num" data-tip={'Promedio de las réplicas\nSuma de colonias / suma de mL de suspensión original sembrados'}>UFC/mL</th><th className="num">Colonias</th><th className="num">IC 95 %</th><th className="num">log₁₀ ± DE</th><th className="num">CV %</th><th>Estado</th></tr></thead>
          <tbody>{ufcRes.res.map((r) => (
            <tr key={r.Muestra + r.T_h}><td>{r.Muestra}</td><td className="num">{r.T_h}</td><td className="num">{r.N} / {r.Con_conteos}</td>
              <td className="num" data-tip={dPromedioUfc(r) || undefined}><b>{sciCorto(r.UFC_mL)}</b></td>
              <td className="num">{finito(r.Colonias_suma) ? r.Colonias_suma : '–'}</td>
              <td className="num">{finito(r.IC95_inf) ? `${sciCorto(r.IC95_inf)} – ${sciCorto(r.IC95_sup)}` : '–'}</td>
              <td className="num">{fx(r.log10, 2)}{finito(r.DE_log10) ? ` ± ${fx(r.DE_log10, 2)}` : ''}</td><td className="num">{fx(r.CV_pct, 0)}</td>
              <td style={{ color: T.sec, fontSize: 12 }}>{r.Estado}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  )
}
