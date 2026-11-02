// ============================================================
// Curva UFC vs t: el gráfico de los recuentos con la curva del modelo, la predicción y la tabla de UFC/mL por tiempo.
// Los parámetros de crecimiento (μ, λ, y₀, …) están en «Parámetros › Por recuento». Clic en un punto o en un número:
// cómo se calculó.
// ============================================================
import { useState } from 'react'
import { useOpcion } from '../ui/opciones.js'
import { finito } from '../motor/analisis.js'
import { MODELOS_UFC, centroUfc, curvaUfc, errorUfc, etiquetaErrorUfc, icUfc, modeloUfc, nmaxFijado, prediccionUfc, predDe, textoErrorUfc } from '../motor/ufc.js'
import { OPCIONES_CURVA_UFC, OPCIONES_ERROR_UFC, curvaUfcDe, txtErrorUfc, verUfc } from './CalidadUfc.jsx'
import { useTema } from '../tema.js'
import { Encabezado, Icono, Num, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { SelectorCepas, cepasOcultas } from '../ui/cepas.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { fichaPrediccionUfc, fichaUfcTiempo } from '../fichas/definiciones.js'
import { fs, fx, sciCorto } from '../utils.js'
import { GrupoModeloUfc, GruposOpcionesModeloUfc } from './ParamUfc.jsx'

// ficha del valor de una cepa en un tiempo, con las réplicas que no entran y las estimadas
export function fichaTiempoUfc(ufcRes, aj, m, t) {
  const r = ufcRes.res.find((x) => x.Muestra === m && x.T_h === t)
  if (!r) return null
  const reps = ufcRes.reps.filter((x) => x.Muestra === m && x.T_h === t && x.Conteos > 0)
  const enPool = new Set((r._pool || []).map((q) => q.Replica))
  const excl = reps.filter((x) => !enPool.has(x.Replica)).map((x) => `réplica ${x.Replica} (${ufcRes.fuera.has(`${x.Muestra}|${x.T_h}|${x.Replica}`) ? 'excluida' : String(x.Estado || '').toLowerCase()})`)
  const est = reps.filter((x) => enPool.has(x.Replica) && ['bajo', 'alto'].includes(x._estado)).map((x) => `réplica ${x.Replica}`)
  return fichaUfcTiempo(r, { centro: centroUfc(aj), excluidas: excl.join(', '), estimadas: est.join(', ') })
}

export function CurvaUfc({ s }) {
  const T = useTema()
  const { exp, ufcRes } = s
  const [escala, setEscala] = useOpcion('curvaUfc.escala', 'log10')
  const tipoErr = verUfc(exp.aj).error
  const v = { replicas: false, valores: false, conError: false, errores: true, ...(exp.aj.ufc_ver_curva || {}) }
  const setV = (k, x) => s.upd((e) => ({ aj: { ...e.aj, ufc_ver_curva: { ...(e.aj.ufc_ver_curva || {}), [k]: x } } }))
  const [pers, setPers] = useState(null)
  const modelo = modeloUfc(exp.aj)
  const cen = centroUfc(exp.aj)
  const nmaxF = nmaxFijado(exp.aj)
  const etqErr = etiquetaErrorUfc(cen, tipoErr)
  if (!ufcRes?.hay) return <div className="pagina"><Encabezado titulo="Curva UFC vs t" /><Vacio titulo="Todavía no hay conteos">Cargá las colonias en «Conteo».</Vacio></div>
  const res = ufcRes.res.filter((r) => finito(r.log10))
  const todas = [...new Set(res.map((r) => r.Muestra))]
  const muestras = todas.filter((m) => !cepasOcultas(exp).includes(m))
  const lin = escala === 'lineal'
  const pot = lin ? Math.floor(Math.log10(Math.max(...res.map((r) => r.UFC_mL)))) : 0
  const fmtE = lin ? (x) => sciCorto(x) : (x) => fx(x, 2)
  const series = muestras.map((m) => ({
    id: m, nombre: m, color: s.colores[m], linea: false, puntos: true, forma: 'cuadrado', radio: 4, ancho: 2, errores: v.errores,
    etiqueta: v.valores ? (d) => d.valor : undefined,
    data: res.filter((r) => r.Muestra === m).sort((a, b) => a.T_h - b.T_h).map((r) => {
      const e = errorUfc(r, lin ? 'lineal' : 'log10', tipoErr, cen)
      const k = lin ? 10 ** pot : 1
      const valor = (v.conError ? textoErrorUfc(e, lin) : lin ? sciCorto(e.m) : fx(e.m, 2)).replace('\n', ' ')
      const centroTxt = cen === 'geo' ? `media geométrica = ${sciCorto(r.Media_geometrica)} (log₁₀ ${fx(Math.log10(r.Media_geometrica), 2)}); Σ C / Σ V = ${sciCorto(r.UFC_mL)}` : `UFC/mL = ${sciCorto(r.UFC_mL)} (Σ colonias / Σ volumen)`
      return { x: r.T_h, y: e.m / k, lo: e.lo / k, hi: e.hi / k, valor, key: `${m}|${r.T_h}`,
        tip: `${m} · T = ${r.T_h} h\n${centroTxt}${txtErrorUfc(e, etqErr, fmtE)}\n${r.Colonias_suma} colonias en ${r.N} réplica${r.N === 1 ? '' : 's'}${finito(r.DE_log10) ? ` · DE de las réplicas ${fx(r.DE_log10, 2)} log` : ''}\nClic: cómo se calculó` }
    }),
  }))
  // réplicas: cada conteo como un punto chico, para ver cuánto se aparta del valor del tiempo
  if (v.replicas) muestras.forEach((m) => {
    series.push({ id: 'rep' + m, nombre: '', color: s.colores[m], linea: false, puntos: true, radio: 3, opacidad: 0.75,
      data: ufcRes.reps.filter((r) => r.Muestra === m && finito(r.log10) && !ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`)).map((r) => ({ x: r.T_h, y: lin ? r.UFC_mL / 10 ** pot : r.log10, tip: `${m} · réplica ${r.Replica} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (log₁₀ ${fx(r.log10, 2)})` })) })
  })
  // curva del modelo elegido (o spline)
  const avisosSuave = []
  // modo predictivo: Baranyi y Roberts extendido en el tiempo (reemplaza la curva del modelo)
  const pred = predDe(exp.aj)
  const setPred = (k, x) => s.upd((e) => ({ aj: { ...e.aj, ufc_pred: { ...predDe(e.aj), [k]: x } } }))
  const preds = pred.on ? muestras.map((m) => ({ m, p: prediccionUfc(ufcRes, m, exp.aj) })) : []
  const yv = (y) => (lin ? 10 ** y / 10 ** pot : y)
  preds.forEach(({ m, p }) => {
    if (!p.ok) return
    const tramo = (a, b) => p.puntos.filter((q) => q.x >= a - 1e-9 && q.x <= b + 1e-9).map((q) => ({ x: q.x, y: yv(q.y), tip: `${m} · Baranyi y Roberts\nt = ${fx(q.x, 2)} h\n${q.x > p.c.t1 ? 'predicción: ' : ''}log₁₀ UFC/mL = ${fx(q.y, 2)} (${sciCorto(10 ** q.y)})` }))
    series.push({ id: 'pa' + m, nombre: '', color: s.colores[m], ancho: 2, data: tramo(p.c.t0, p.c.t1) })
    series.push({ id: 'pp' + m, nombre: '', color: s.colores[m], ancho: 2, dash: '7 5', data: tramo(p.c.t1, p.hasta) })
  })
  if (pred.on && finito(Number(pred.objetivo)) && pred.objetivo !== '' && preds.some((x) => x.p.ok)) {
    const ok = preds.filter((x) => x.p.ok)
    series.push({ id: 'objetivo', nombre: `Objetivo ${fx(Number(pred.objetivo), 2)} log₁₀`, color: T.sec, ancho: 1, dash: '2 4', data: [Math.min(...ok.map((x) => x.p.c.t0)), Math.max(...ok.map((x) => x.p.hasta))].map((x) => ({ x, y: yv(Number(pred.objetivo)) })) })
  }
  if (exp.aj.ufc_suave !== false && !(pred.on && curvaUfcDe(exp.aj) !== 'spline')) muestras.forEach((m) => {
    const cs = curvaUfc(ufcRes, m, exp.aj)
    if (!cs?.ok) { if (cs) avisosSuave.push(`${m}: ${cs.motivo}`); return }
    series.push({ id: 'sv' + m, nombre: '', color: s.colores[m], ancho: 2, data: cs.puntos.map((q) => ({ x: q.x, y: lin ? 10 ** q.y / 10 ** pot : q.y })) })
  })
  const abrir = (k) => { const [m, t] = [k.slice(0, k.lastIndexOf('|')), Number(k.slice(k.lastIndexOf('|') + 1))]; const f = fichaTiempoUfc(ufcRes, exp.aj, m, t); if (f) s.abrirFicha(f) }
  return (
    <div className="pagina">
      <Encabezado titulo="Curva UFC vs t" sub={`Cuadrados: ${cen === 'geo' ? 'media geométrica de las réplicas de cada tiempo (media de log₁₀), con su ' + etqErr : 'suma de colonias / suma de volúmenes sembrados de cada tiempo, con su IC 95 % del conteo'}.${exp.aj.ufc_suave !== false ? (curvaUfcDe(exp.aj) === 'spline' ? ' Línea continua: curva suavizada (spline monótona por los valores de cada tiempo).' : ` Línea continua: modelo ${MODELOS_UFC[modelo].toLowerCase()} ajustado como en DMFit (ComBase) a todos los puntos.`) : ''} Clic en un punto: cómo se calculó.`}>
      </Encabezado>
      <SelectorCepas s={s} muestras={todas} />
      <Cinta>
        <Grupo titulo="Mostrar">
          <BotonCinta simbolo="•" texto="Réplicas" activo={v.replicas} onClick={() => setV('replicas', !v.replicas)} tip={'Cada conteo como un punto\nPara ver cuánto se aparta cada réplica del valor del tiempo'} />
          <BotonCinta simbolo="±" texto="Barras de error" activo={v.errores} onClick={() => setV('errores', !v.errores)} tip={cen === 'geo' ? `Barras de error\n${etqErr} de los log₁₀ de las réplicas` : 'Barras de error\nIC 95 % del conteo (Poisson; ensanchado por √φ si las réplicas varían más que el conteo)'} />
        </Grupo>
        <Grupo titulo="Escala del eje Y"><OpcionesCinta valor={escala} onChange={setEscala} opciones={[['lineal', 'Lineal', 'N', null, 'UFC/mL tal cual'], ['log10', 'log₁₀', 'lg', null, 'Logaritmo decimal: la fase exponencial se ve como una recta']]} /></Grupo>
        <GrupoModeloUfc s={s} />
        <Grupo titulo="Predicción (Baranyi)">
          <BotonCinta simbolo="⇢" texto="Predecir" activo={pred.on} onClick={() => setPred('on', !pred.on)} tip={'Extiende el ajuste de Baranyi y Roberts de cada cepa\nmás allá del último tiempo (línea a trazos)'} />
          {pred.on && <>
            <CampoCinta etiqueta="Hasta (h)"><Num value={pred.hasta} onChange={(x) => setPred('hasta', x)} ancho={52} /></CampoCinta>
            <CampoCinta etiqueta="Objetivo (log₁₀)" tip="Nivel para calcular en cuánto tiempo se alcanza"><Num value={pred.objetivo} onChange={(x) => setPred('objetivo', x)} ancho={58} placeholder="–" /></CampoCinta>
          </>}
        </Grupo>
        <Grupo titulo="Gráfico">
          <OpcionesCinta valor={curvaUfcDe(exp.aj)} onChange={(x) => s.setAj('ufc_suave', x === 'no' ? false : x)} opciones={OPCIONES_CURVA_UFC} />
          <BotonCinta icono="editar" texto="Personalizar" activo={pers === 'curvaUfc'} onClick={() => setPers(pers === 'curvaUfc' ? null : 'curvaUfc')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
          <BotonCinta simbolo="⋯" texto="Más opciones" activo={pers === 'mas'} onClick={() => setPers(pers === 'mas' ? null : 'mas')} tip={'Valores sobre los puntos, valor de cada tiempo (Σ C / Σ V o media geométrica),\ntipo de error y opciones del ajuste (puntos, curvatura m, N máx)'} />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'curvaUfc'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="curvaUfc" /></Cajon>
      <Cajon titulo="Más opciones" abierto={pers === 'mas'} onClose={() => setPers(null)}>
        <div className="cajon-grupos">
          <Grupo titulo="Valores sobre los puntos">
            <BotonCinta simbolo="12" texto="Valor" activo={v.valores} onClick={() => setV('valores', !v.valores)} tip="Escribir el valor de cada tiempo sobre su punto" />
            <BotonCinta simbolo="±" texto="Con error" activo={v.conError} onClick={() => { setV('conError', !v.conError); if (!v.valores) setV('valores', true) }} tip="Agregar el error (o el IC) al valor" />
          </Grupo>
          <Grupo titulo="Valor de cada tiempo">
            <OpcionesCinta valor={cen} onChange={(x) => s.setAj('ufc_centro', x)} opciones={[
              ['pool', 'Σ colonias / Σ vol.', 'Σ', null, 'Suma de colonias / suma de volúmenes sembrados (por defecto)\nEs el estimador de Poisson de la concentración.\nLa barra de error es su IC 95 % del conteo.'],
              ['geo', 'Media geométrica', 'x̃', null, 'Media de log₁₀ de las réplicas (media geométrica de las UFC/mL)\nPara réplicas biológicas: la barra es la DE, el EEM o el IC 95 % de los log₁₀.\nSe usa también en el ajuste del modelo y en la calibración.'],
            ]} />
          </Grupo>
          {cen === 'geo' && <Grupo titulo="Tipo de error"><OpcionesCinta valor={tipoErr} onChange={(x) => s.setAj('ufc_err', x)} opciones={OPCIONES_ERROR_UFC} /></Grupo>}
          <GruposOpcionesModeloUfc s={s} />
        </div>
      </Cajon>
      {avisosSuave.length > 0 && <p className="ayuda">Sin curva suavizada: {avisosSuave.join(' · ')}.</p>}
      <div className="tarjeta">
        <Grafico series={series} yTxt={lin ? `UFC/mL${pot ? ` (× 10^${pot})` : ''}` : 'log₁₀ UFC/mL'} alto={420} nombre={`ufc_${exp.nombre}`} titulo={exp.nombre} ceroY={lin} estilo={s.estiloGrafico('curvaUfc')} idEstilo="curvaUfc" onPuntoClick={abrir} />
        <div className="fila" style={{ marginTop: 6 }}>
          <span className="ayuda">Modelo: {MODELOS_UFC[modelo]}{finito(nmaxF) && modelo === 'baranyi' ? `, N máx fijado en ${fx(nmaxF, 2)} log₁₀` : ''}. μ, λ, y₀ y el resto están en Parámetros.</span>
          <span className="espacio" />
          <button className="chico" onClick={() => s.irA('parametros')}>Ver parámetros<Icono n="flecha" size={13} /></button>
        </div>
      </div>
      {pred.on && (
        <div className="tarjeta">
          <h2>Predicción con Baranyi y Roberts <span className="ayuda" style={{ fontWeight: 400 }}>· hasta {fx(Number(pred.hasta) || 24, 1)} h{finito(nmaxF) ? `, con N máx fijado en ${fx(nmaxF, 2)} log₁₀` : ', N máx estimado por el ajuste'} · mismo ajuste que los parámetros</span></h2>
          <div className="tabla-scroll"><table className="tabla">
            <thead><tr><th>Cepa</th><th className="num" data-tip="Valor predicho al final del horizonte">log₁₀ UFC/mL a {fx(Number(pred.hasta) || 24, 1)} h</th><th className="num" data-tip="Tiempo en que la curva queda a 0,1 log₁₀ de N máx">Llega a la meseta (h)</th>{pred.objetivo !== '' && <th className="num">Llega a {fx(Number(pred.objetivo), 2)} log₁₀ (h)</th>}<th className="num">N máx (log₁₀)</th></tr></thead>
            <tbody>{preds.map(({ m, p }) => (
              <tr key={m}><td><i className="punto" style={{ background: s.colores[m], marginRight: 6 }} /><b>{m}</b></td>
                {p.ok ? <>
                  <td className="num"><Valor f={() => fichaPrediccionUfc(p, { nombre: m })}><b>{fx(p.yHasta, 2)}</b> <small className="ayuda">({sciCorto(10 ** p.yHasta)})</small></Valor></td>
                  <td className="num"><Valor f={() => fichaPrediccionUfc(p, { nombre: m })}>{finito(p.tMeseta) ? fx(p.tMeseta, 1) : '–'}</Valor></td>
                  {pred.objetivo !== '' && <td className="num"><Valor f={() => fichaPrediccionUfc(p, { nombre: m })}>{finito(p.tObjetivo) ? fx(p.tObjetivo, 1) : 'no llega'}</Valor></td>}
                  <td className="num">{fx(p.c.yEnd, 2)}{p.c.ymaxFijo ? <small className="ayuda"> (fijado)</small> : null}</td>
                </> : <td colSpan={pred.objetivo !== '' ? 4 : 3} className="ayuda">{p.motivo}</td>}
              </tr>
            ))}</tbody>
          </table></div>
          <p className="ayuda" style={{ marginTop: 6 }}>Línea continua: ajuste dentro del rango medido; a trazos: comportamiento esperado según el modelo. Más allá del último recuento es una extrapolación: la meseta depende de N máx, y si los datos no llegan a la fase estacionaria conviene fijarlo con el valor de otros ensayos en el mismo medio.</p>
        </div>
      )}
      <div className="tarjeta">
        <h2>UFC/mL por cepa y tiempo <span className="ayuda" style={{ fontWeight: 400 }}>· clic en un valor: cómo se calculó</span></h2>
        <div className="tabla-scroll"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num" data-tip="Réplicas que entran / réplicas con conteos">Réplicas</th><th className="num" data-tip={'Suma de colonias / suma de mL de suspensión original sembrados\n(estimador de Poisson con todas las colonias)'}>UFC/mL</th><th className="num" data-tip={'IC 95 % de la concentración: Poisson exacto sobre Σ colonias.\n* = ensanchado por √φ porque las réplicas varían más que el error de conteo (χ², p < 0,05)'}>IC 95 %</th><th className="num">Colonias</th><th className="num">log₁₀</th><th className="num" data-tip="Desviación estándar de log₁₀ UFC/mL entre las réplicas (dispersión de las réplicas, no error del valor)">DE réplicas (log)</th><th>Estado</th></tr></thead>
          <tbody>{ufcRes.res.map((r) => {
            const ic = icUfc(r)
            const fi = () => fichaTiempoUfc(ufcRes, exp.aj, r.Muestra, r.T_h)
            return (
              <tr key={r.Muestra + r.T_h}><td>{r.Muestra}</td><td className="num">{r.T_h}</td><td className="num">{r.N} / {r.Con_conteos}</td>
                <td className="num"><Valor f={fi}><b>{sciCorto(r.UFC_mL)}</b></Valor></td>
                <td className="num" style={{ color: ic.tipo === 'disp' ? 'var(--aviso)' : undefined }}><Valor f={fi}>{finito(ic.lo) ? `${sciCorto(ic.lo)} – ${sciCorto(ic.hi)}` : '–'}{ic.tipo === 'disp' ? ' *' : ''}</Valor></td>
                <td className="num">{finito(r.Colonias_suma) ? r.Colonias_suma : '–'}</td>
                <td className="num"><Valor f={fi}>{fx(r.log10, 2)}</Valor></td><td className="num">{fx(r.DE_log10, 2)}</td>
                <td style={{ color: T.sec, fontSize: 12 }}>{r.Estado}</td></tr>
            )
          })}</tbody>
        </table></div>
        {(() => {
          const sd = ufcRes.res.filter((r) => r.Sobredisperso)
          return sd.length ? <p className="aviso-caja" style={{ marginTop: 8 }}><b>Sobredispersión entre réplicas</b> (χ², p &lt; 0,05) en {sd.map((r) => `${r.Muestra} T = ${r.T_h} h`).join(', ')}: las réplicas varían más de lo que explica el error de conteo, así que en esos tiempos el IC informado (*) está ensanchado por √φ.</p> : null
        })()}
      </div>
    </div>
  )
}
