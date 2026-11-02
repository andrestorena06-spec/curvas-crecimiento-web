import { ERRORES_UFC, centroUfc, curvaUfc, errorUfc, etiquetaErrorUfc, metodoCurvaUfc, textoErrorUfc } from '../motor/ufc.js'
import { autoExcluirUfc } from '../modelo.js'
import { useMemo, useState } from 'react'
import { Valor } from '../fichas/FichaCalculo.jsx'
import { fichaAtipico, fichaUfcReplica } from '../fichas/definiciones.js'
import { finito, media } from '../motor/analisis.js'
import { METODOS_ATIPICOS } from '../motor/atipicos.js'
import { Encabezado, Vacio, Num } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { GraficoDispersion } from '../ui/dispersion.jsx'
import { SelectorCepas, cepasOcultas } from '../ui/cepas.jsx'
import { fx, sciCorto } from '../utils.js'

const CHIP = { ok: 'ok', bajo: 'aviso', alto: 'aviso', cero: '', incontable: 'peligro', sin_datos: '' }

// Opciones de cómo se ven los recuentos (las comparten Calidad UFC y Curva UFC vs t)
export const verUfc = (aj) => ({ puntos: true, medias: true, errores: true, ...(aj.ufc_ver || {}), error: ERRORES_UFC[aj.ufc_err] ? aj.ufc_err : 'sd' })
// Solo con «media geométrica» (media de log₁₀ de las réplicas). Con Σ C / Σ V la barra es siempre el IC 95 % del conteo.
export const OPCIONES_ERROR_UFC = [
  ['sd', 'DE', 's', null, 'Desviación estándar de log₁₀ UFC/mL\nCuánto se dispersan las réplicas entre sí'],
  ['sem', 'EEM', 's/√n', null, 'Error estándar de la media = DE / √n\nIncertidumbre de la media (no se dibuja con menos de 3 réplicas)'],
  ['ic95', 'IC 95 %', 'IC', null, 'Intervalo de confianza del 95 %\nmedia ± t(0,975; n − 1) × DE / √n (no se dibuja con menos de 3 réplicas)'],
]
// texto del error para los globos: IC del conteo, o ± error de los log₁₀
export const txtErrorUfc = (e, nombre, f = (v) => fx(v, 2)) => (e.ic ? (finito(e.lo) ? ` · IC 95 % ${f(e.lo)} a ${f(e.hi)}${e.tipoIc === 'disp' ? ' (ensanchado por √φ)' : ''}` : '')
  : finito(e.err) ? ` ± ${f(e.err)} (${nombre})` : finito(e.fac) ? ` ×/÷ ${fx(e.fac, 2)} (${nombre})` : e.nBajo ? ` (con menos de 3 réplicas no hay ${nombre})` : '')
export const OPCIONES_CURVA_UFC = [
  ['no', 'Sin curva', '·', null, 'Solo los puntos, sin líneas'],
  ['baranyi', 'Modelo', '∿', null, 'Curva del modelo de ajuste elegido en «Curva UFC vs t» (lineal, Baranyi y Roberts o bifásico, como DMFit)'],
  ['spline', 'Spline', '⌇', null, 'Spline cúbica monótona que pasa por cada media sin oscilar'],
]
export const curvaUfcDe = metodoCurvaUfc

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
  // por defecto los sospechosos solo se marcan (aj.ufc_auto = false en ajustesDef)
  const auto = autoExcluirUfc(aj)
  const cen = centroUfc(aj)
  const alternar = (r) => {
    const k = clave(r)
    if (exp.ufcExcl.includes(k)) return upd({ ufcExcl: exp.ufcExcl.filter((x) => x !== k) })
    if (ufcRes.dixon[k] && auto) return upd({ ufcForz: exp.ufcForz.includes(k) ? exp.ufcForz.filter((x) => x !== k) : [...exp.ufcForz, k] })
    upd({ ufcExcl: [...exp.ufcExcl, k] })
  }
  const metodo = aj.ufc_atip_metodo || 'q'
  const o = verUfc(aj)
  const etqErr = etiquetaErrorUfc(cen, o.error)
  const setO = (k, v) => upd((e) => ({ aj: { ...e.aj, ufc_ver: { ...(e.aj.ufc_ver || {}), [k]: v } } }))
  const nFuera = ufcRes.fuera.size
  const nEst = ufcRes.reps.filter((r) => ['bajo', 'alto'].includes(r._estado)).length
  const nombreTest = metodo === 'cv' ? 'CV' : metodo === 'grubbs' ? 'Grubbs' : 'Dixon'
  // fichas: UFC/mL de una réplica, y el test de atípicos de un grupo (con las réplicas que entran al test)
  const fRep = (r) => () => fichaUfcReplica(r, { dixon: ufcRes.dixon[clave(r)], fuera: ufcRes.fuera.has(clave(r)) })
  const fAtip = (g) => () => {
    const incluirEst = exp.ufc.estimados !== false, cv = metodo === 'cv'
    const cand = g.reps.filter((x) => finito(x.log10) && (x._estado === 'ok' || (incluirEst && ['bajo', 'alto'].includes(x._estado))) && !exp.ufcExcl.includes(clave(x)))
    return fichaAtipico(cand.map((x) => ({ etiqueta: `réplica ${x.Replica}`, x: cv ? x.UFC_mL : x.log10 })), { metodo, conf: Number(aj.ufc_dixon_conf) || 95, cvMax: Number(aj.ufc_cvmax) || 20, escala: cv ? 'UFC/mL' : 'log₁₀ UFC/mL', sujeto: `${g.Muestra} · T = ${g.T_h} h`, auto, ancla: 'ufcqc' })
  }

  // gráfico: en cada tiempo, una columna por cepa con cada conteo (log₁₀ UFC/mL), la media
  // (Σ colonias / Σ volúmenes) y su error
  const todas = [...new Set(grupos.map((g) => g.Muestra))]
  const muestras = todas.filter((m) => !cepasOcultas(exp).includes(m))
  const tiempos = [...new Set(grupos.filter((g) => muestras.includes(g.Muestra)).map((g) => g.T_h))].sort((a, b) => a - b)
  const estadoPunto = (r) => (ufcRes.fuera.has(clave(r)) ? 'fuera' : ufcRes.dixon[clave(r)] ? 'marcada' : ['bajo', 'alto', 'cero'].includes(r._estado) ? 'estimada' : 'ok')
  const TXT = { ok: 'Incluida', estimada: 'Estimada (fuera del rango contable)', fuera: 'Excluida', marcada: `Marcada por ${nombreTest}, sigue en el promedio` }
  const columnas = tiempos.map((t) => ({
    t, etiqueta: fx(t, t % 1 ? 2 : 0),
    cols: muestras.filter((m) => grupos.some((g) => g.Muestra === m && g.T_h === t)).map((m) => {
      const r = ufcRes.res.find((x) => x.Muestra === m && x.T_h === t) || {}
      const e = errorUfc(r, 'log10', o.error, cen)
      return {
        id: m + '|' + t, nombre: m, color: s.colores[m], m: e.m, lo: o.errores ? e.lo : NaN, hi: o.errores ? e.hi : NaN,
        valor: o.errores ? textoErrorUfc(e, false) : finito(e.m) ? fx(e.m, 2) : '',
        tip: [`${m} · T = ${t} h`, finito(r.UFC_mL) ? `Σ C / Σ V = ${r.Colonias_suma} / ${sciCorto(r.Volumen_mL)} mL = ${sciCorto(r.UFC_mL)} UFC/mL` : '', `log₁₀ = ${fx(e.m, 2)}${txtErrorUfc(e, etqErr)}`, 'Detalle del cálculo: clic en el valor, en Curva UFC vs t'].filter(Boolean).join('\n'),
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
    const cs = curvaUfc(ufcRes, m, aj)
    return cs?.ok ? { id: 'sv' + m, color: s.colores[m], puntos: cs.puntos } : null
  }).filter(Boolean)
  const leyenda = [
    ...(muestras.length > 1 ? muestras.map((m) => ({ texto: m, color: s.colores[m] })) : []),
    { texto: 'Incluida', forma: 'punto' }, { texto: 'Estimada', forma: 'hueco' }, { texto: 'Excluida', forma: 'x' }, { texto: 'Marcada', forma: 'anillo' },
    ...(o.medias || o.errores ? [{ texto: cen === 'geo' ? `Media geométrica${o.errores ? ` ± ${etqErr}` : ''}` : `Σ C / Σ V${o.errores ? ' e IC 95 %' : ''}`, forma: 'raya' }] : []),
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
          <OpcionesCinta valor={auto ? 'si' : 'no'} onChange={(v) => { s.setAj('ufc_dixon_on', true); s.setAj('ufc_auto', v === 'si') }} opciones={[['no', 'Solo marcar', '◯', null, 'Marcarlas con un anillo y dejarlas en el promedio (por defecto)\nDecidí vos cuáles excluir con un clic'], ['si', 'Excluir', '⛔', null, 'Excluir automáticamente las réplicas sospechosas']]} />
          <BotonCinta icono="refrescar" texto="Restablecer" tip="Borra todas las exclusiones y reincorporaciones hechas a mano" onClick={() => { if (window.confirm('Se borran todas las exclusiones y reincorporaciones manuales de los conteos. ¿Continuar?')) upd({ ufcExcl: [], ufcForz: [] }) }} />
        </Grupo>
        <Grupo titulo="Fuera de rango">
          <BotonCinta simbolo="≈" texto="Usar estimados" activo={exp.ufc.estimados} onClick={() => upd((e) => ({ ufc: { ...e.ufc, estimados: !e.ufc.estimados } }))} tip={'Usar las réplicas fuera del rango contable\nSe incluyen como estimadas (círculo hueco)'} />
        </Grupo>
        <Grupo titulo="Gráfico">
          <BotonCinta simbolo="•" texto="Puntos" activo={o.puntos} onClick={() => setO('puntos', !o.puntos)} tip={'Mostrar puntos\nUn punto por réplica; clic sobre un punto para excluirlo o reincorporarlo'} />
          <BotonCinta simbolo="x̄" texto="Valor" activo={o.medias} onClick={() => setO('medias', !o.medias)} tip={'Valor de cada tiempo\nRaya y valor de cada cepa y tiempo (Σ colonias / Σ volúmenes o media geométrica, según Curva UFC vs t)'} />
          <BotonCinta simbolo="±" texto="Error" activo={o.errores} onClick={() => setO('errores', !o.errores)} tip={cen === 'geo' ? 'Error junto al valor\nBarras y valor del error elegido en «Tipo de error»' : 'IC 95 % del valor\nBarras con el IC 95 % del conteo (Poisson; ensanchado por √φ si las réplicas varían más que el conteo)'} />
          <OpcionesCinta valor={curva} onChange={(v) => s.setAj('ufc_suave', v === 'no' ? false : v)} opciones={OPCIONES_CURVA_UFC} />
          <BotonCinta icono="editar" texto="Personalizar" activo={pers} onClick={() => setPers(!pers)} tip="Títulos, tamaños de letra, grosores, eje Y, fondo y colores de las cepas" />
        </Grupo>
        {cen === 'geo' && (
          <Grupo titulo="Tipo de error">
            <OpcionesCinta valor={o.error} onChange={(v) => s.setAj('ufc_err', v)} opciones={OPCIONES_ERROR_UFC} />
          </Grupo>
        )}
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers} onClose={() => setPers(false)}><PanelPersonalizar s={s} id="calidadUfc" /></Cajon>
      <SelectorCepas s={s} muestras={todas} />
      <div className="tarjeta">
        <GraficoDispersion grupos={columnas} o={{ puntos: o.puntos, media: o.medias, errores: o.errores }} curvas={curvas} leyenda={leyenda}
          yTxt="log₁₀ UFC/mL" estilo={s.estiloGrafico('calidadUfc')} idEstilo="calidadUfc" nombre="calidad_ufc" alto={380}
          onPuntoClick={(k) => { const r = ufcRes.reps.find((x) => clave(x) === k); if (r) alternar(r) }} />
        <p className="ayuda" style={{ marginTop: 6 }}>Cada punto es una réplica; la raya es el valor de la cepa en ese tiempo ({cen === 'geo' ? 'media geométrica de las réplicas' : 'suma de colonias / suma de volúmenes'}; se elige en Curva UFC vs t) y el bigote, {cen === 'geo' ? `la ${ERRORES_UFC[o.error]} de los log₁₀ de las réplicas${o.error !== 'sd' ? ' (no se dibuja con menos de 3 réplicas)' : ''}` : 'su IC 95 % (Poisson sobre todas las colonias; ensanchado por √φ si las réplicas varían más de lo que explica el conteo)'}{curva !== 'no' ? '; la línea es la curva del modelo' : ''}. Un clic en un grupo de puntos acerca ese tiempo; con el gráfico acercado, un clic en un punto lo excluye o lo reincorpora. · {ufcRes.reps.filter((r) => r.Conteos > 0).length} réplicas · {nFuera} excluidas · {nEst} estimadas · {Object.keys(ufcRes.dixon).length} marcadas por {nombreTest}</p>
      </div>
      <div className="tarjeta">
        <div className="tabla-scroll alta"><table className="tabla">
          <thead><tr><th>Cepa</th><th className="num">T (h)</th><th className="num">Réplica</th><th>Dilución usada (colonias)</th><th className="num">UFC/mL</th><th className="num">log₁₀</th><th>Estado</th><th className="num" data-tip={'Coeficiente de variación de las UFC/mL entre las réplicas incluidas (el mismo de Curva UFC y del Excel)\nSolo por el error de conteo (Poisson) se espera un CV ≈ 100/√C %, con C = colonias por réplica\n(p. ej. 30 colonias → 18 %; 100 → 10 %). Un CV mucho mayor indica variación entre réplicas.'}>CV % del grupo</th><th /></tr></thead>
          <tbody>{grupos.map((g) => {
            // CV del motor (calcularUfc): réplicas que entran al promedio, sin las excluidas
            const rg = ufcRes.res.find((x) => x.Muestra === g.Muestra && x.T_h === g.T_h)
            const cv = rg ? rg.CV_pct : NaN
            const cs = (rg?._pool || []).map((q) => q.C).filter((c) => c > 0)
            const cvPoisson = cs.length ? 100 / Math.sqrt(media(cs)) : NaN
            const tipCv = finito(cv) ? `CV = ${fx(cv, 0)} % entre ${rg.N} réplicas${finito(cvPoisson) ? `\nEsperado solo por conteo (Poisson): ≈ 100/√C̄ = 100/√${fx(media(cs), 0)} = ${fx(cvPoisson, 0)} %` : ''}` : undefined
            return g.reps.map((r, i) => {
              const fuera = ufcRes.fuera.has(clave(r))
              const dx = ufcRes.dixon[clave(r)]
              return (
                <tr key={clave(r)} className={fuera ? 'fuera' : ''} style={i === 0 ? { borderTop: '2px solid var(--borde2)' } : undefined}>
                  <td>{i === 0 ? <b>{g.Muestra}</b> : ''}</td><td className="num">{i === 0 ? g.T_h : ''}</td><td className="num">{r.Replica}</td>
                  <td>{r.Diluciones_usadas || '(sin conteos)'}{r._manual && <small className="ayuda"> · a mano</small>}{r._aj?.malos?.length > 0 && <Valor f={fRep(r)} tip="Clic: ver la prueba de coherencia entre diluciones"><span className="aviso-texto"> ⚠ diluciones no coherentes</span></Valor>}</td>
                  <td className="num"><Valor f={fRep(r)}>{sciCorto(r.UFC_mL)}</Valor></td><td className="num">{fx(r.log10, 2)}</td>
                  <td><span className={`chip ${fuera ? 'peligro' : dx ? 'aviso' : CHIP[r._estado]} ${dx ? 'calc' : ''}`} data-tip={dx ? `${dx}\nClic: ver el test` : undefined} onClick={dx ? () => s.abrirFicha(fAtip(g)()) : undefined}>{fuera ? (dx && !exp.ufcExcl.includes(clave(r)) ? `${nombreTest}: excluida` : 'Excluida a mano') : dx ? (auto ? `${nombreTest} (reincorporada)` : `${nombreTest}: marcada`) : r.Estado}</span></td>
                  <td className="num">{i === 0 ? <span style={{ color: cv > 50 ? 'var(--aviso)' : undefined }} data-tip={tipCv}>{fx(cv, 0)}</span> : ''}</td>
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
