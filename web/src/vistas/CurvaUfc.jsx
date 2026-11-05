// ============================================================
// Curva UFC vs t: el gráfico de los recuentos con la curva del modelo, la predicción y la tabla de UFC/mL por tiempo.
// Debajo, los parámetros de crecimiento del mismo ajuste (μ, λ, y₀, …). Clic en un punto o en un número:
// cómo se calculó.
// ============================================================
import { useState } from 'react'
import { useOpcion } from '../ui/opciones.js'
import { finito } from '../motor/analisis.js'
import { ERRORES_UFC, MODELOS_UFC, uOperUfc, centroUfc, curvaUfc, errorTextoUfc, errorUfc, etiquetaErrorUfc, icUfc, modeloUfc, nmaxFijado, prediccionUfc, predDe } from '../motor/ufc.js'
import { curvaUfcDe, txtErrorUfc, verUfc } from './CalidadUfc.jsx'
import { useTema } from '../tema.js'
import { Encabezado, Icono, Num, Vacio } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { GrupoMostrar, conEtiquetas, textoMostrar, useMostrar } from '../ui/mostrar.jsx'
import { SelectorCepas, cepasOcultas } from '../ui/cepas.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { fichaPrediccionUfc, fichaUfcTiempo } from '../fichas/definiciones.js'
import { fs, fx, sciCorto } from '../utils.js'
import { GrupoModeloUfc, GruposOpcionesModeloUfc, SeccionUfc } from './ParamUfc.jsx'

// ficha del valor de una cepa en un tiempo, con las réplicas que no entran y las estimadas
export function fichaTiempoUfc(ufcRes, aj, m, t, foco) {
  const r = ufcRes.res.find((x) => x.Muestra === m && x.T_h === t)
  if (!r) return null
  const reps = ufcRes.reps.filter((x) => x.Muestra === m && x.T_h === t && x.Conteos > 0)
  const enPool = new Set((r._pool || []).map((q) => q.Replica))
  const excl = reps.filter((x) => !enPool.has(x.Replica)).map((x) => `réplica ${x.Replica} (${ufcRes.fuera.has(`${x.Muestra}|${x.T_h}|${x.Replica}`) ? 'excluida' : String(x.Estado || '').toLowerCase()})`)
  const est = reps.filter((x) => enPool.has(x.Replica) && ['bajo', 'alto'].includes(x._estado)).map((x) => `réplica ${x.Replica}`)
  return fichaUfcTiempo(r, { foco, centro: centroUfc(aj), error: ERRORES_UFC[aj.ufc_err] ? aj.ufc_err : 'sd', excluidas: excl.join(', '), estimadas: est.join(', ') })
}

export function CurvaUfc({ s }) {
  const T = useTema()
  const { exp, ufcRes } = s
  const [escala, setEscala] = useOpcion('curvaUfc.escala', 'log10')
  const tipoErr = verUfc(exp.aj).error
  // Mostrar (el mismo grupo en todos los gráficos): puntos = valor de cada tiempo, réplicas = cada conteo
  const [mo, setMo] = useMostrar('curvaUfc', { puntos: true, replicas: false })
  const conCurva = curvaUfcDe(exp.aj) !== 'no'
  const [pers, setPers] = useState(null)
  const modelo = modeloUfc(exp.aj)
  const cen = centroUfc(exp.aj)
  const nmaxF = nmaxFijado(exp.aj)
  const etqErr = etiquetaErrorUfc(cen, tipoErr)
  if (!ufcRes?.hay) return <div className="pagina"><Encabezado titulo="Curva UFC vs t" /><Vacio titulo="Todavía no hay conteos">Cargá las colonias en «Conteo › Cargar datos».</Vacio></div>
  const res = ufcRes.res.filter((r) => finito(r.log10))
  const todas = [...new Set(res.map((r) => r.Muestra))]
  const muestras = todas.filter((m) => !cepasOcultas(exp).includes(m))
  const lin = escala === 'lineal'
  const pot = lin ? Math.floor(Math.log10(Math.max(...res.map((r) => r.UFC_mL)))) : 0
  const fmtE = lin ? (x) => sciCorto(x) : (x) => fx(x, 2)
  const mostrarMedias = mo.puntos || mo.barras || conEtiquetas(mo)
  const series = (mostrarMedias ? muestras : []).map((m) => ({
    id: m, nombre: m, color: s.colores[m], linea: false, puntos: !!mo.puntos, forma: 'cuadrado', radio: 4, ancho: 2, errores: !!mo.barras,
    etiqueta: conEtiquetas(mo) ? (d) => d.valor : undefined,
    data: res.filter((r) => r.Muestra === m).sort((a, b) => a.T_h - b.T_h).map((r) => {
      const e = errorUfc(r, lin ? 'lineal' : 'log10', tipoErr, cen)
      const k = lin ? 10 ** pot : 1
      const valor = textoMostrar(mo, lin ? sciCorto(e.m) : fx(e.m, 2), errorTextoUfc(e, lin))
      const centroTxt = cen === 'geo' ? `media geométrica = ${sciCorto(r.Media_geometrica)} (log₁₀ ${fx(Math.log10(r.Media_geometrica), 2)})` : `UFC/mL = ${sciCorto(r.UFC_mL)} (Σ colonias / Σ volumen)`
      return { x: r.T_h, y: e.m / k, lo: e.lo / k, hi: e.hi / k, valor, key: `${m}|${r.T_h}`,
        tip: `${m} · T = ${r.T_h} h\n${centroTxt}${txtErrorUfc(e, etqErr, fmtE)}\n${r.Colonias_suma} colonias en ${r.N} réplica${r.N === 1 ? '' : 's'}${finito(r.DE_log10) ? ` · DE de las réplicas ${fx(r.DE_log10, 2)} log` : ''}\nClic: cómo se calculó` }
    }),
  }))
  // réplicas: cada conteo como un punto chico, para ver cuánto se aparta del valor del tiempo
  if (mo.replicas) muestras.forEach((m) => {
    series.push({ id: 'rep' + m, nombre: '', color: s.colores[m], linea: false, puntos: true, radio: 3, opacidad: 0.75,
      data: ufcRes.reps.filter((r) => r.Muestra === m && finito(r.log10) && !ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`)).map((r) => ({ x: r.T_h, y: lin ? r.UFC_mL / 10 ** pot : r.log10, tip: `${m} · réplica ${r.Replica} · T = ${r.T_h} h\nUFC/mL = ${sciCorto(r.UFC_mL)} (log₁₀ ${fx(r.log10, 2)})` })) })
  })
  // curva del modelo elegido
  const avisosSuave = []
  // modo predictivo: Baranyi y Roberts extendido en el tiempo (reemplaza la curva del modelo)
  const pred = predDe(exp.aj)
  const setPred = (k, x) => s.upd((e) => ({ aj: { ...e.aj, ufc_pred: { ...predDe(e.aj), [k]: x } } }))
  const preds = pred.on ? muestras.map((m) => ({ m, p: prediccionUfc(ufcRes, m, exp.aj) })) : []
  const yv = (y) => (lin ? 10 ** y / 10 ** pot : y)
  preds.forEach(({ m, p }) => {
    if (!p.ok || !conCurva) return
    const tramo = (a, b) => p.puntos.filter((q) => q.x >= a - 1e-9 && q.x <= b + 1e-9).map((q) => ({ x: q.x, y: yv(q.y), tip: `${m} · Baranyi y Roberts\nt = ${fx(q.x, 2)} h\n${q.x > p.c.t1 ? 'predicción: ' : ''}log₁₀ UFC/mL = ${fx(q.y, 2)} (${sciCorto(10 ** q.y)})` }))
    series.push({ id: 'pa' + m, nombre: '', color: s.colores[m], ancho: 2, data: tramo(p.c.t0, p.c.t1) })
    series.push({ id: 'pp' + m, nombre: '', color: s.colores[m], ancho: 2, dash: '7 5', data: tramo(p.c.t1, p.hasta) })
  })
  if (pred.on && finito(Number(pred.objetivo)) && pred.objetivo !== '' && preds.some((x) => x.p.ok)) {
    const ok = preds.filter((x) => x.p.ok)
    series.push({ id: 'objetivo', nombre: `Objetivo ${fx(Number(pred.objetivo), 2)} log₁₀`, color: T.sec, ancho: 1, dash: '2 4', data: [Math.min(...ok.map((x) => x.p.c.t0)), Math.max(...ok.map((x) => x.p.hasta))].map((x) => ({ x, y: yv(Number(pred.objetivo)) })) })
  }
  // con «Predecir», las cepas sin predicción posible (p. ej. sin meseta y sin N máx) igual muestran la curva ajustada sobre sus datos
  const conPrediccion = new Set(preds.filter((x) => x.p.ok).map((x) => x.m))
  if (conCurva) preds.filter((x) => !x.p.ok).forEach(({ m, p }) => avisosSuave.push(`${m}: no se puede predecir más allá del último recuento (${p.motivo})`))
  if (conCurva) muestras.forEach((m) => {
    if (conPrediccion.has(m)) return
    const cs = curvaUfc(ufcRes, m, exp.aj)
    if (!cs?.ok) { if (cs) avisosSuave.push(`${m}: ${cs.motivo}`); return }
    series.push({ id: 'sv' + m, nombre: '', color: s.colores[m], ancho: 2, data: cs.puntos.map((q) => ({ x: q.x, y: lin ? 10 ** q.y / 10 ** pot : q.y })) })
  })
  const abrir = (k) => { const [m, t] = [k.slice(0, k.lastIndexOf('|')), Number(k.slice(k.lastIndexOf('|') + 1))]; const f = fichaTiempoUfc(ufcRes, exp.aj, m, t); if (f) s.abrirFicha(f) }
  return (
    <div className="pagina">
      <Encabezado titulo="Curva UFC vs t" sub={`Cuadrados: ${cen === 'geo' ? 'media geométrica de las réplicas de cada tiempo (media de log₁₀), con su ' + etqErr : 'suma de colonias / suma de volúmenes sembrados de cada tiempo, con su IC 95 % (ISO 19036)'}.${conCurva ? ` Línea continua: modelo ${MODELOS_UFC[modelo]} ajustado a todos los puntos.` : ''} Clic en un punto: cómo se calculó.`}>
      </Encabezado>
      <SelectorCepas s={s} muestras={todas} />
      <Cinta>
        <GrupoMostrar m={mo} set={setMo} notas={{ barras: cen === 'geo' ? `Barras de error: ${etqErr} de los log₁₀ de las réplicas` : 'Barras de error: IC 95 % = 10^(log₁₀ N ± 2·u_c), con el error de Poisson y el operativo (ISO 19036)' }} />
        <Grupo titulo="Escala del eje Y"><OpcionesCinta valor={escala} onChange={setEscala} opciones={[['lineal', 'Lineal', 'N', null, 'UFC/mL tal cual'], ['log10', 'log₁₀', 'lg', null, 'Logaritmo decimal: la fase exponencial se ve como una recta']]} /></Grupo>
        <GrupoModeloUfc s={s} />
        <Grupo titulo={`Predicción (${MODELOS_UFC[modelo]})`}>
          <BotonCinta simbolo="⇢" texto="Predecir" activo={pred.on} onClick={() => setPred('on', !pred.on)} tip={`Extiende el ajuste de ${MODELOS_UFC[modelo]} de cada cepa${'\n'}más allá del último tiempo (línea a trazos)`} />
          {pred.on && <>
            <CampoCinta etiqueta="Hasta (h)" tip="Horizonte de la predicción en horas (vacío = 24 h)"><Num value={pred.hasta} placeholder="24" onChange={(x) => setPred('hasta', x)} ancho={52} /></CampoCinta>
            <CampoCinta etiqueta="Objetivo (log₁₀)" tip="Nivel para calcular en cuánto tiempo se alcanza"><Num value={pred.objetivo} onChange={(x) => setPred('objetivo', x)} ancho={58} placeholder="–" /></CampoCinta>
          </>}
        </Grupo>
        <Grupo titulo="Gráfico">
          <BotonCinta icono="editar" texto="Personalizar" activo={pers === 'curvaUfc'} onClick={() => setPers(pers === 'curvaUfc' ? null : 'curvaUfc')} tip="Títulos, valores sobre los puntos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
        <Grupo titulo="Ajuste">
          <BotonCinta simbolo="⋯" texto="Más opciones" activo={pers === 'mas'} onClick={() => setPers(pers === 'mas' ? null : 'mas')} tip={'Valor de cada tiempo (Σ C / Σ V o media geométrica), tipo de error\ny opciones del ajuste (puntos, curvatura m, N máx)'} />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'curvaUfc'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="curvaUfc" /></Cajon>
      <Cajon titulo="Más opciones" abierto={pers === 'mas'} onClose={() => setPers(null)}>
        <div className="cajon-grupos">
          <Grupo titulo="Valor de cada tiempo">
            <OpcionesCinta valor={cen} onChange={(x) => s.setAj('ufc_centro', x)} opciones={[
              ['pool', 'Σ colonias / Σ vol.', 'Σ', null, 'Suma de colonias / suma de volúmenes sembrados (media ponderada por volumen)\nLa barra de error es el IC 95 % de la incertidumbre combinada (ISO 19036).'],
              ['geo', 'Media geométrica', 'x̃', null, 'Para cada réplica UFC/mL = C·D/V; media de los log₁₀ (por defecto)\nPara réplicas biológicas: la barra es la DE, el EEM o el IC 95 % de los log₁₀.\nSe usa también en el ajuste del modelo y en la calibración.'],
            ]} />
          </Grupo>
          {cen !== 'geo' && <Grupo titulo="Incertidumbre del conteo">
            <CampoCinta etiqueta="u_oper (log₁₀)" tip={'Incertidumbre operativa y de matriz por defecto (pipeteo, diluciones, muestra), en log₁₀\nSe usa el mayor entre este valor y la variación observada entre réplicas\nTípico: 0,07 a 0,10 (varianza 0,005 a 0,01). Poné 0 para usar solo lo observado entre réplicas'}><Num value={exp.aj.ufc_uoper ?? 0.07} onChange={(x) => s.setAj('ufc_uoper', x)} ancho={62} placeholder="0,07" /></CampoCinta>
          </Grupo>}
          <GruposOpcionesModeloUfc s={s} />
        </div>
      </Cajon>
      {pred.on && preds.some((x) => x.p.ok && x.p.sinMeseta) && <p className="aviso-caja"><b>Predicción sin meseta:</b> {preds.filter((x) => x.p.ok && x.p.sinMeseta).map((x) => x.m).join(', ')}: los recuentos no llegan a la fase estacionaria, así que el nivel máximo no se puede estimar y la curva extiende el crecimiento hasta un tope arbitrario (2,2 log₁₀ sobre el máximo medido). Indicá «N máx» en «Más opciones» para una predicción realista.</p>}
      {avisosSuave.length > 0 && <p className="ayuda">{avisosSuave.join(' · ')}.</p>}
      <div className="tarjeta">
        <Grafico series={series} yTxt={lin ? `UFC/mL${pot ? ` (× 10^${pot})` : ''}` : 'log₁₀ UFC/mL'} alto={420} nombre={`ufc_${exp.nombre}`} titulo={exp.nombre} ceroY={lin} estilo={s.estiloGrafico('curvaUfc')} idEstilo="curvaUfc" onPuntoClick={abrir} />
      </div>
      <SeccionUfc s={s} />
      {pred.on && (
        <div className="tarjeta">
          <h2>Predicción con {MODELOS_UFC[modelo]} <span className="ayuda" style={{ fontWeight: 400 }}>· hasta {fx((Number(pred.hasta) > 0 ? Number(pred.hasta) : 24), 1)} h{finito(nmaxF) ? `, con N máx fijado en ${fx(nmaxF, 2)} log₁₀` : ', N máx estimado por el ajuste'} · mismo ajuste que los parámetros</span></h2>
          <div className="tabla-scroll"><table className="tabla">
            <thead><tr><th>Cepa</th><th className="num" data-tip="Valor predicho al final del horizonte">log₁₀ UFC/mL a {fx((Number(pred.hasta) > 0 ? Number(pred.hasta) : 24), 1)} h</th><th className="num" data-tip="Tiempo en que la curva queda a 0,1 log₁₀ de N máx">Llega a la meseta (h)</th>{pred.objetivo !== '' && <th className="num">Llega a {fx(Number(pred.objetivo), 2)} log₁₀ (h)</th>}<th className="num">N máx (log₁₀)</th></tr></thead>
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
          {cen === 'geo' ? (<>
            <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num" data-tip="Réplicas con UFC > 0 que entran en la media / réplicas con conteos">Réplicas</th><th className="num" data-tip={'Media de los log₁₀ de las réplicas, vuelta a UFC/mL (10^media)'}>Media geométrica (UFC/mL)</th><th className="num">log₁₀</th><th className="num" data-tip={'Calculado sobre los log₁₀ de las réplicas (se elige en Mostrar › Error)\nCon menos de 3 réplicas solo hay DE'}>{ERRORES_UFC[tipoErr]} (log₁₀)</th><th className="num" data-tip="Intervalo en UFC/mL: 10^(media ± error)">Intervalo (UFC/mL)</th><th>Estado</th></tr></thead>
            <tbody>{ufcRes.res.map((r) => {
              const e = errorUfc(r, 'log10', tipoErr, 'geo')
              const fi = (foco) => () => fichaTiempoUfc(ufcRes, exp.aj, r.Muestra, r.T_h, foco)
              return (
                <tr key={r.Muestra + r.T_h}><td>{r.Muestra}</td><td className="num">{r.T_h}</td><td className="num">{e.n} / {r.Con_conteos}</td>
                  <td className="num"><Valor f={fi()}><b>{finito(r.Media_geometrica) ? sciCorto(r.Media_geometrica) : '–'}</b></Valor></td>
                  <td className="num"><Valor f={fi('log')}>{fx(e.m, 2)}</Valor></td>
                  <td className="num"><Valor f={fi('ic')}>{finito(e.err) ? `± ${fx(e.err, 3)}` : e.nBajo ? 'n < 3' : '–'}</Valor></td>
                  <td className="num">{finito(e.lo) ? `${sciCorto(10 ** e.lo)} – ${sciCorto(10 ** e.hi)}` : '–'}</td>
                  <td style={{ color: T.sec, fontSize: 12 }}>{r.Estado}</td></tr>
              )
            })}</tbody>
          </>) : (<>
            <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num" data-tip="Réplicas que entran / réplicas con conteos">Réplicas</th><th className="num" data-tip={'Suma de colonias / suma de mL de suspensión original sembrados\n(media ponderada por volumen)'}>UFC/mL</th><th className="num" data-tip={'IC 95 % = 10^(log₁₀ N ± 2·u_c)\nu_c combina el error de contar (Poisson, sobre Σ colonias) y el operativo (ISO 19036)'}>IC 95 %</th><th className="num">Colonias</th><th className="num">log₁₀</th><th className="num" data-tip="Desviación estándar de log₁₀ UFC/mL entre las réplicas (dispersión de las réplicas, no error del valor)">DE réplicas (log)</th><th>Estado</th></tr></thead>
            <tbody>{ufcRes.res.map((r) => {
              const ic = icUfc(r)
              const fi = (foco) => () => fichaTiempoUfc(ufcRes, exp.aj, r.Muestra, r.T_h, foco)
              return (
                <tr key={r.Muestra + r.T_h}><td>{r.Muestra}</td><td className="num">{r.T_h}</td><td className="num">{r.N} / {r.Con_conteos}</td>
                  <td className="num"><Valor f={fi()}><b>{sciCorto(r.UFC_mL)}</b></Valor></td>
                  <td className="num"><Valor f={fi('ic')}>{finito(ic.lo) ? `${sciCorto(ic.lo)} – ${sciCorto(ic.hi)}` : '–'}</Valor></td>
                  <td className="num">{finito(r.Colonias_suma) ? r.Colonias_suma : '–'}</td>
                  <td className="num"><Valor f={fi('log')}>{fx(r.log10, 2)}</Valor></td><td className="num">{fx(r.DE_log10, 2)}</td>
                  <td style={{ color: T.sec, fontSize: 12 }}>{r.Estado}</td></tr>
              )
            })}</tbody>
          </>)}
        </table></div>
        {cen === 'geo'
          ? <p className="ayuda" style={{ marginTop: 8 }}>Media geométrica: para cada réplica UFC/mL = C·D/V; se promedian los log₁₀ y se vuelve a UFC/mL (10^media). {ERRORES_UFC[tipoErr]}: calculado sobre los log₁₀ de las réplicas; con menos de 3 réplicas el EEM y el IC 95 % no se calculan. Las réplicas con 0 colonias no entran. Se cambia en «Mostrar › Error».</p>
          : <p className="ayuda" style={{ marginTop: 8 }}>IC 95 % = 10^(log₁₀ N ± U), con U = 2·√(u_poisson² + u_oper²) (ISO 19036). u_poisson = 1/(ln 10·√ΣC); u_oper = máx({fx(uOperUfc(exp.aj), 3)} log₁₀, la variación observada entre réplicas por encima de la de Poisson). El valor por defecto se cambia en «Más opciones».</p>}
      </div>
    </div>
  )
}
