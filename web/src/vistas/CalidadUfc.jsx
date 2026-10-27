import { ERRORES_UFC, curvaSuaveUfc, errorUfc, textoErrorUfc } from '../motor/ufc.js'
import { useMemo, useState } from 'react'
import { dUfc, dAjuste, dPromedioUfc } from '../calculos.js'
import { finito, media, desvio } from '../motor/analisis.js'
import { METODOS_ATIPICOS } from '../motor/atipicos.js'
import { Encabezado, Vacio, Num } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { GraficoDispersion } from '../ui/dispersion.jsx'
import { fx, sciCorto } from '../utils.js'

const CHIP = { ok: 'ok', bajo: 'aviso', alto: 'aviso', cero: '', incontable: 'peligro', sin_datos: '' }

// Opciones de cómo se ven los recuentos (las comparten Calidad UFC y Curva UFC vs t)
export const verUfc = (aj) => ({ puntos: true, medias: true, errores: true, ...(aj.ufc_ver || {}), error: ERRORES_UFC[aj.ufc_err] ? aj.ufc_err : 'sd' })
export const OPCIONES_ERROR_UFC = [
  ['sd', 'DE', 's', null, 'Desviación estándar\nCuánto se dispersan las réplicas entre sí (en log₁₀ UFC/mL)'],
  ['cv', 'DE %', '%', null, 'Desviación estándar relativa (CV %)\n100 × DE / media de las UFC/mL; las barras muestran la DE'],
  ['sem', 'EEM', 's/√n', null, 'Error estándar de la media = DE / √n\nIncertidumbre de la media'],
  ['ic95', 'IC 95 %', 'IC', null, 'Intervalo de confianza del 95 %\nmedia ± t(0,975; n − 1) × DE / √n'],
]
export const OPCIONES_CURVA_UFC = [
  ['no', 'Sin curva', '·', null, 'Solo los puntos, sin líneas'],
  ['baranyi', 'Baranyi', '∿', null, 'Curva del modelo de Baranyi-Roberts ajustado a ln(UFC/mL) (4 o más tiempos)'],
  ['spline', 'Spline', '⌇', null, 'Spline cúbica monótona que pasa por cada media sin oscilar'],
]
export const curvaUfcDe = (aj) => (aj.ufc_suave === false ? 'no' : aj.ufc_suave === true || aj.ufc_suave === undefined ? 'baranyi' : aj.ufc_suave)

export function CalidadUfc({ s }) {
  const [pers, setPers] = useState(false)
  const { exp, upd, ufcRes } = s
  const aj = exp.aj
  const grupos = useMemo(() => {
    if (!ufcRes) return []
    const g = new Map()
    ufcRes.reps.filter((r) => r.Conteos > 0).forEach((r) => {
      const k = `${r.Muestra}|${r.T_h}`
      if (!g.has(k)) g.set(k, { Muestra: r.Muestra, T_h: r.T_h, reps: [] })
      g.get(k).reps.push(r)
    })
    return [...g.values()].sort((a, b) => (a.Muestra < b.Muestra ? -1 : a.Muestra > b.Muestra ? 1 : a.T_h - b.T_h))
  }, [ufcRes])
  if (!ufcRes?.hay) return <div className="pagina"><Encabezado titulo="Calidad UFC" /><Vacio titulo="Todavía no hay conteos" accion={<button className="primario" onClick={() => s.irA('conteo')}>Cargar conteos</button>}>Cargá las colonias contadas.</Vacio></div>

  const clave = (r) => `${r.Muestra}|${r.T_h}|${r.Replica}`
  const auto = aj.ufc_dixon_on !== false && aj.ufc_auto !== false
  const alternar = (r) => {
    const k = clave(r)
    if (exp.ufcExcl.includes(k)) return upd({ ufcExcl: exp.ufcExcl.filter((x) => x !== k) })
    if (ufcRes.dixon[k] && auto) return upd({ ufcForz: exp.ufcForz.includes(k) ? exp.ufcForz.filter((x) => x !== k) : [...exp.ufcForz, k] })
    upd({ ufcExcl: [...exp.ufcExcl, k] })
  }
  const metodo = aj.ufc_atip_metodo || 'q'
  const o = verUfc(aj)
  const setO = (k, v) => upd((e) => ({ aj: { ...e.aj, ufc_ver: { ...(e.aj.ufc_ver || {}), [k]: v } } }))
  const nFuera = ufcRes.fuera.size
  const nEst = ufcRes.reps.filter((r) => ['bajo', 'alto'].includes(r._estado)).length
  const nombreTest = metodo === 'cv' ? 'CV' : metodo === 'grubbs' ? 'Grubbs' : 'Dixon'

  // gráfico: en cada tiempo, una columna por cepa con cada conteo (log₁₀ UFC/mL), la media
  // (Σ colonias / Σ volúmenes) y su error
  const muestras = [...new Set(grupos.map((g) => g.Muestra))]
  const tiempos = [...new Set(grupos.map((g) => g.T_h))].sort((a, b) => a - b)
  const estadoPunto = (r) => (ufcRes.fuera.has(clave(r)) ? 'fuera' : ufcRes.dixon[clave(r)] ? 'marcada' : ['bajo', 'alto', 'cero'].includes(r._estado) ? 'estimada' : 'ok')
  const TXT = { ok: 'Incluida', estimada: 'Estimada (fuera del rango contable)', fuera: 'Excluida', marcada: `Marcada por ${nombreTest}, sigue en el promedio` }
  const columnas = tiempos.map((t) => ({
    t, etiqueta: fx(t, t % 1 ? 2 : 0),
    cols: muestras.filter((m) => grupos.some((g) => g.Muestra === m && g.T_h === t)).map((m) => {
      const r = ufcRes.res.find((x) => x.Muestra === m && x.T_h === t) || {}
      const e = errorUfc(r, 'log10', o.error)
      return {
        id: m + '|' + t, nombre: m, color: s.colores[m], m: e.m, lo: o.errores ? e.lo : NaN, hi: o.errores ? e.hi : NaN,
        valor: o.errores ? textoErrorUfc(e, false, o.error) : finito(e.m) ? fx(e.m, 2) : '',
        tip: [`${m} · T = ${t} h`, dPromedioUfc(r), `log₁₀ = ${fx(e.m, 2)}${finito(e.err) ? ` ± ${fx(e.err, 2)} (${ERRORES_UFC[o.error]})` : ''}${finito(e.cv) ? ` · CV = ${fx(e.cv, 0)} %` : ''}`].filter(Boolean).join('\n'),
        pts: ufcRes.reps.filter((x) => x.Muestra === m && x.T_h === t && x.Conteos > 0).map((x) => {
          const st = estadoPunto(x)
          return { y: x.log10, key: clave(x), estado: st,
            tip: `${m} · réplica ${x.Replica} · T = ${t} h\nUFC/mL = ${sciCorto(x.UFC_mL)} (log₁₀ ${fx(x.log10, 2)})${x.Diluciones_usadas ? `\n${x.Diluciones_usadas}` : ''}\n${TXT[st]}${ufcRes.dixon[clave(x)] ? `\n${ufcRes.dixon[clave(x)]}` : ''}\nClic: ${st === 'fuera' ? 'reincorporar' : 'excluir'}` }
        }),
      }
    }),
  }))
  const curva = curvaUfcDe(aj)
  const curvas = curva === 'no' ? [] : muestras.map((m) => {
    const cs = curvaSuaveUfc(ufcRes.res.filter((r) => r.Muestra === m), curva)
    return cs.ok ? { id: 'sv' + m, color: s.colores[m], puntos: cs.puntos } : null
  }).filter(Boolean)
  const leyenda = [
    ...(muestras.length > 1 ? muestras.map((m) => ({ texto: m, color: s.colores[m] })) : []),
    { texto: 'Incluida', forma: 'punto' }, { texto: 'Estimada', forma: 'hueco' }, { texto: 'Excluida', forma: 'x' }, { texto: 'Marcada', forma: 'anillo' },
    ...(o.medias || o.errores ? [{ texto: `Media${o.errores ? ` ± ${ERRORES_UFC[o.error]}` : ''}`, forma: 'raya' }] : []),
  ]

  return (
    <div className="pagina">
      <Encabezado titulo="Calidad UFC" sub="Revisá qué diluciones entraron en el cálculo de cada réplica, cuáles se estimaron fuera del rango contable y qué réplicas se apartan de las demás." />
      <Cinta>
        <Grupo titulo="Método">
          <OpcionesCinta valor={metodo} onChange={(v) => { s.setAj('ufc_atip_metodo', v); s.setAj('ufc_dixon_on', true) }} opciones={[['q', 'Dixon', 'Q', null, METODOS_ATIPICOS.q + '\nSobre log₁₀ UFC/mL de las réplicas de cada cepa y tiempo'], ['grubbs', 'Grubbs', 'G', null, METODOS_ATIPICOS.grubbs + '\nSobre log₁₀ UFC/mL'], ['cv', 'CV %', 'CV', null, METODOS_ATIPICOS.cv + '\nSobre las UFC/mL: si el grupo supera el límite, se señala la réplica más alejada de la media']]} />
        </Grupo>
        {metodo === 'cv'
          ? <Grupo titulo="Límite"><CampoCinta etiqueta="CV máximo (%)"><Num value={aj.ufc_cvmax ?? 20} onChange={(v) => s.setAj('ufc_cvmax', v)} ancho={70} /></CampoCinta></Grupo>
          : <Grupo titulo="Confianza"><OpcionesCinta valor={String(aj.ufc_dixon_conf || 95)} onChange={(v) => s.setAj('ufc_dixon_conf', Number(v))} opciones={[['90', '90 %', '90', null, 'Confianza 90 %: marca más atípicos'], ['95', '95 %', '95', null, 'Confianza 95 % (la habitual)'], ['99', '99 %', '99', null, 'Confianza 99 %: solo marca valores muy extremos']]} /></Grupo>}
        <Grupo titulo="Sospechosos">
          <OpcionesCinta valor={auto ? 'si' : 'no'} onChange={(v) => { s.setAj('ufc_dixon_on', true); s.setAj('ufc_auto', v === 'si') }} opciones={[['si', 'Excluir', '⛔', null, 'Excluir automáticamente las réplicas sospechosas'], ['no', 'Solo marcar', '◯', null, 'Marcarlas con un anillo y dejarlas en el promedio']]} />
          <BotonCinta icono="refrescar" texto="Restablecer" tip="Borra todas las exclusiones y reincorporaciones hechas a mano" onClick={() => { if (window.confirm('Se borran todas las exclusiones y reincorporaciones manuales de los conteos. ¿Continuar?')) upd({ ufcExcl: [], ufcForz: [] }) }} />
        </Grupo>
        <Grupo titulo="Fuera de rango">
          <BotonCinta simbolo="≈" texto="Usar estimados" activo={exp.ufc.estimados} onClick={() => upd((e) => ({ ufc: { ...e.ufc, estimados: !e.ufc.estimados } }))} tip={'Usar las réplicas fuera del rango contable\nSe incluyen como estimadas (círculo hueco)'} />
        </Grupo>
        <Grupo titulo="Gráfico">
          <BotonCinta simbolo="•" texto="Puntos" activo={o.puntos} onClick={() => setO('puntos', !o.puntos)} tip={'Mostrar puntos\nUn punto por réplica; clic sobre un punto para excluirlo o reincorporarlo'} />
          <BotonCinta simbolo="x̄" texto="Media" activo={o.medias} onClick={() => setO('medias', !o.medias)} tip={'Valor medio\nRaya y valor de la media de cada cepa y tiempo (Σ colonias / Σ volúmenes)'} />
          <BotonCinta simbolo="±" texto="Error" activo={o.errores} onClick={() => setO('errores', !o.errores)} tip={'Error junto a la media\nBarras y valor del error elegido en «Tipo de error»'} />
          <OpcionesCinta valor={curva} onChange={(v) => s.setAj('ufc_suave', v === 'no' ? false : v)} opciones={OPCIONES_CURVA_UFC} />
          <BotonCinta icono="editar" texto="Personalizar" activo={pers} onClick={() => setPers(!pers)} tip="Títulos, tamaños de letra, grosores, eje Y, fondo y colores de las cepas" />
        </Grupo>
        <Grupo titulo="Tipo de error">
          <OpcionesCinta valor={o.error} onChange={(v) => s.setAj('ufc_err', v)} opciones={OPCIONES_ERROR_UFC} />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers} onClose={() => setPers(false)}><PanelPersonalizar s={s} id="calidadUfc" /></Cajon>
      <div className="tarjeta">
        <GraficoDispersion grupos={columnas} o={{ puntos: o.puntos, media: o.medias, errores: o.errores }} curvas={curvas} leyenda={leyenda}
          yTxt="log₁₀ UFC/mL" estilo={s.estiloGrafico('calidadUfc')} idEstilo="calidadUfc" nombre="calidad_ufc" alto={380}
          onPuntoClick={(k) => { const r = ufcRes.reps.find((x) => clave(x) === k); if (r) alternar(r) }} />
        <p className="ayuda" style={{ marginTop: 6 }}>Cada punto es una réplica; la raya es la media de la cepa en ese tiempo (suma de colonias / suma de volúmenes) y el bigote, {ERRORES_UFC[o.error]} de las réplicas{curva !== 'no' ? '; la línea es la curva suavizada de las medias' : ''}. Clic en un punto para excluirlo o reincorporarlo. · {ufcRes.reps.filter((r) => r.Conteos > 0).length} réplicas · {nFuera} excluidas · {nEst} estimadas · {Object.keys(ufcRes.dixon).length} marcadas por {nombreTest}</p>
      </div>
      <div className="tarjeta">
        <div className="tabla-scroll alta"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num">Réplica</th><th>Dilución usada (colonias)</th><th className="num">UFC/mL</th><th className="num">log₁₀</th><th>Estado</th><th className="num" data-tip="Coeficiente de variación entre las réplicas incluidas">CV % del grupo</th><th /></tr></thead>
          <tbody>{grupos.map((g) => {
            const vals = g.reps.filter((r) => finito(r.UFC_mL) && !ufcRes.fuera.has(clave(r))).map((r) => r.UFC_mL)
            const cv = vals.length > 1 ? (100 * desvio(vals)) / media(vals) : NaN
            return g.reps.map((r, i) => {
              const fuera = ufcRes.fuera.has(clave(r))
              const dx = ufcRes.dixon[clave(r)]
              return (
                <tr key={clave(r)} className={fuera ? 'fuera' : ''} style={i === 0 ? { borderTop: '2px solid var(--borde2)' } : undefined}>
                  <td>{i === 0 ? <b>{g.Muestra}</b> : ''}</td><td className="num">{i === 0 ? g.T_h : ''}</td><td className="num">{r.Replica}</td>
                  <td>{r.Diluciones_usadas || '(sin conteos)'}{r._manual && <small className="ayuda"> · a mano</small>}{r._aj?.malos?.length > 0 && <span className="aviso-texto" data-tip={dAjuste(r._aj)}> ⚠ diluciones no coherentes</span>}</td>
                  <td className="num" data-tip={dUfc(r) || undefined}>{sciCorto(r.UFC_mL)}</td><td className="num">{fx(r.log10, 2)}</td>
                  <td><span className={`chip ${fuera ? 'peligro' : dx ? 'aviso' : CHIP[r._estado]}`} data-tip={dx || undefined}>{fuera ? (dx && !exp.ufcExcl.includes(clave(r)) ? `${nombreTest}: excluida` : 'Excluida a mano') : dx ? (auto ? `${nombreTest} (reincorporada)` : `${nombreTest}: marcada`) : r.Estado}</span></td>
                  <td className="num">{i === 0 ? <span style={{ color: cv > 50 ? 'var(--aviso)' : undefined }}>{fx(cv, 0)}</span> : ''}</td>
                  <td><button className="chico" onClick={() => alternar(r)}>{fuera ? 'Reincorporar' : 'Excluir'}</button></td>
                </tr>
              )
            })
          })}</tbody>
        </table></div>
      </div>
    </div>
  )
}
