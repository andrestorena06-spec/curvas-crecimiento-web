import { ERRORES_UFC, centroUfc, errorTextoUfc, errorUfc, etiquetaErrorUfc, fasesUfc, metodoCurvaUfc, tramoUfcElegido } from '../motor/ufc.js'
import { Grafico } from '../ui/grafico.jsx'
import { useTema } from '../tema.js'
import { ModalFases, zonasVentana } from './FasesCepa.jsx'
import { ZoomTiempo } from './CalidadPlacas.jsx'
import { GrupoMostrar, GrupoTipoError, conEtiquetas, textoMostrar, useMostrar } from '../ui/mostrar.jsx'
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
// texto del error para los globos: IC del conteo, o ± error de los log₁₀
export const txtErrorUfc = (e, nombre, f = (v) => fx(v, 2)) => (e.ic ? (finito(e.lo) ? ` · IC 95 % ${f(e.lo)} a ${f(e.hi)}` : '')
  : finito(e.err) ? ` ± ${f(e.err)} (${nombre})` : finito(e.fac) ? ` ×/÷ ${fx(e.fac, 2)} (${nombre})` : e.nBajo ? ` (con menos de 3 réplicas no hay ${nombre})` : '')

export const curvaUfcDe = metodoCurvaUfc

export function CalidadUfc({ s }) {
  const [pers, setPers] = useState(false)
  const [zoom, setZoom] = useState(null)       // { m, t }: las réplicas de una cepa en un tiempo, acercadas
  const [fasesDe, setFasesDe] = useState(null) // cepa cuyas fases se están eligiendo (curva ampliada)
  const T = useTema()
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
  // Mostrar (el mismo grupo en todos los gráficos): réplicas = cada conteo, puntos = el valor de cada tiempo (la raya)
  const [mo, setMo] = useMostrar('calidadUfc', { puntos: true, replicas: true })
  if (!ufcRes?.hay) return <div className="pagina"><Encabezado titulo="Revisión de los recuentos" /><Vacio titulo="Todavía no hay conteos" accion={<button className="primario" onClick={() => s.irA('conteo')}>Cargar conteos</button>}>Cargá las colonias contadas.</Vacio></div>

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
  const o = { ...verUfc(aj), puntos: mo.replicas, medias: mo.puntos, errores: mo.barras }
  const etqErr = etiquetaErrorUfc(cen, o.error)
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
        valor: textoMostrar(mo, finito(e.m) ? fx(e.m, 2) : '', errorTextoUfc(e, false)),
        tip: [`${m} · T = ${t} h`, finito(r.UFC_mL) ? `Σ C / Σ V = ${r.Colonias_suma} / ${sciCorto(r.Volumen_mL)} mL = ${sciCorto(r.UFC_mL)} UFC/mL` : '', `log₁₀ = ${fx(e.m, 2)}${txtErrorUfc(e, etqErr)}`, 'Detalle del cálculo: clic en el valor, en Curva UFC vs t'].filter(Boolean).join('\n'),
        pts: ufcRes.reps.filter((x) => x.Muestra === m && x.T_h === t && x.Conteos > 0).map((x) => {
          const st = estadoPunto(x)
          return { y: x.log10, key: clave(x), estado: st,
            tip: `${m} · réplica ${x.Replica} · T = ${t} h\nUFC/mL = ${sciCorto(x.UFC_mL)} (log₁₀ ${fx(x.log10, 2)})${x.Diluciones_usadas ? `\n${x.Diluciones_usadas}` : ''}\n${TXT[st]}${ufcRes.dixon[clave(x)] ? `\n${ufcRes.dixon[clave(x)]}` : ''}\nClic: ${st === 'fuera' ? 'reincorporar' : 'excluir'}` }
        }),
      }
    }),
  }))
  // una tarjeta por cepa (el mismo formato que la revisión de OD): log₁₀ UFC/mL contra t, con las fases sombreadas,
  // «Fases…» para elegir el tramo exponencial y un clic en un tiempo para ver y corregir sus réplicas
  const datosFases = new Map(), clavesT = new Map()
  const tarjetasUfc = muestras.map((m) => {
    const color = s.colores[m]
    const repsM = ufcRes.reps.filter((x) => x.Muestra === m && x.Conteos > 0 && finito(x.log10))
    const resM = ufcRes.res.filter((x) => x.Muestra === m && finito(x.log10)).sort((a, b) => a.T_h - b.T_h)
    const tiempos = [...new Set(repsM.map((x) => x.T_h))].sort((a, b) => a - b)
    const series = [], extras = []
    const tipR = (x) => `${m} · réplica ${x.Replica} · T = ${x.T_h} h\nUFC/mL = ${sciCorto(x.UFC_mL)} (log₁₀ ${fx(x.log10, 2)})${x.Diluciones_usadas ? `\n${x.Diluciones_usadas}` : ''}\n${TXT[estadoPunto(x)]}${ufcRes.dixon[clave(x)] ? `\n${ufcRes.dixon[clave(x)]}` : ''}\nClic: ver las réplicas de ese tiempo`
    repsM.forEach((x) => clavesT.set(clave(x), { m, t: x.T_h }))
    if (mo.replicas) {
      series.push({ id: 'p' + m, nombre: 'Conteos', color, linea: false, puntos: true, radio: 3, opacidad: 0.85, data: repsM.filter((x) => estadoPunto(x) !== 'fuera').map((x) => ({ x: x.T_h, y: x.log10, key: clave(x), tip: tipR(x) })) })
      repsM.forEach((x) => {
        const st = estadoPunto(x)
        if (st === 'ok') return
        extras.push({ x: x.T_h, y: x.log10, key: clave(x), color: st === 'fuera' ? T.peligro : T.aviso, forma: st === 'fuera' ? 'x' : st === 'marcada' ? 'anillo' : 'o', tip: tipR(x) })
      })
    }
    if (mo.puntos || mo.barras || conEtiquetas(mo)) {
      series.push({ id: 'media' + m, nombre: cen === 'geo' ? 'Media geométrica' : 'Σ C / Σ V', color, linea: false, puntos: !!mo.puntos, forma: 'cuadrado', radio: 4, errores: !!mo.barras, etiqueta: conEtiquetas(mo) ? (d) => d.valor : null,
        data: resM.map((r) => {
          const e = errorUfc(r, 'log10', o.error, cen), key = `T|${m}|${r.T_h}`
          clavesT.set(key, { m, t: r.T_h })
          return { x: r.T_h, y: e.m, lo: e.lo, hi: e.hi, key, valor: textoMostrar(mo, finito(e.m) ? fx(e.m, 2) : '', errorTextoUfc(e, false)),
            tip: [`${m} · T = ${r.T_h} h`, finito(r.UFC_mL) ? `Σ C / Σ V = ${r.Colonias_suma} / ${sciCorto(r.Volumen_mL)} mL = ${sciCorto(r.UFC_mL)} UFC/mL` : '', `log₁₀ = ${fx(e.m, 2)}${txtErrorUfc(e, etqErr)}`, 'Clic: ver las réplicas de ese tiempo'].filter(Boolean).join('\n') }
        }) })
    }
    // tramo exponencial de las UFC (independiente del de la OD): el elegido o, si no hay, el del ajuste de los recuentos
    const fz = fasesUfc(ufcRes, m, aj)
    const ventana = tramoUfcElegido(aj, m) || (fz?.ok && finito(fz.tIni) && finito(fz.tFin) ? [fz.tIni, fz.tFin] : null)
    datosFases.set(m, { series, extras, tiempos, filas: [], ventana })
    const cuenta = (st) => repsM.filter((x) => estadoPunto(x) === st).length
    return { m, color, series, extras, tiempos, ventana, nEx: cuenta('fuera'), nEs: cuenta('estimada'), nMa: cuenta('marcada') }
  })
  const lectZoom = ({ m, t }) => ufcRes.reps.filter((x) => x.Muestra === m && x.T_h === t && x.Conteos > 0 && finito(x.log10)).map((x) => {
    const st = estadoPunto(x)
    return { Muestra: m, clave: clave(x), Pocillo: 'conteo', Replica: x.Replica, Placa_T_h: t, EsBlanco: false, OD_leida: x.log10, OD_corregida: x.log10,
      tipOD: `UFC/mL = ${sciCorto(x.UFC_mL)} (log₁₀ ${fx(x.log10, 2)})${x.Diluciones_usadas ? ` · ${x.Diluciones_usadas}` : ''}`,
      Usado: st !== 'fuera', Sospechoso: st === 'marcada', Motivo: TXT[st] + (ufcRes.dixon[clave(x)] ? ` · ${ufcRes.dixon[clave(x)]}` : '') }
  })
  const curvas = []   // la revisión muestra solo los recuentos: la curva del modelo está en «Curva UFC vs t»
  const leyenda = [
    ...(muestras.length > 1 ? muestras.map((m) => ({ texto: m, color: s.colores[m] })) : []),
    { texto: 'Incluida', forma: 'punto' }, { texto: 'Estimada', forma: 'hueco' }, { texto: 'Excluida', forma: 'x' }, { texto: 'Marcada', forma: 'anillo' },
    ...(o.medias || o.errores ? [{ texto: cen === 'geo' ? `Media geométrica${o.errores ? ` ± ${etqErr}` : ''}` : `Σ C / Σ V${o.errores ? ' e IC 95 %' : ''}`, forma: 'raya' }] : []),
  ]

  return (
    <div className="pagina">
      <Encabezado titulo="Revisión de los recuentos" sub="Revisá qué diluciones entraron en el cálculo de cada réplica, cuáles se estimaron fuera del rango contable y qué réplicas se apartan de las demás." />
      <Cinta>
        <GrupoMostrar m={mo} set={setMo} notas={{ puntos: 'La raya con el valor de cada cepa en cada tiempo (Σ colonias / Σ volumen, o media geométrica)', replicas: 'Cada conteo como un punto: clic en uno para excluirlo o reincorporarlo', barras: cen === 'geo' ? `Barras de error: ${etqErr} de los log₁₀ de las réplicas` : 'Barras de error: IC 95 % del conteo' }} />
        <GrupoTipoError valor={o.error} onChange={(x) => s.setAj('ufc_err', x)} fijo={cen !== 'geo'} />
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
        <Grupo titulo="Gráfico">
          <BotonCinta icono="editar" texto="Personalizar" activo={pers} onClick={() => setPers(!pers)} tip="Títulos, tamaños de letra, grosores, eje Y, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers} onClose={() => setPers(false)}><PanelPersonalizar s={s} id="calidadUfc" /></Cajon>
      <SelectorCepas s={s} muestras={todas} />
      <div className="grilla-cepas">
        {tarjetasUfc.map(({ m, color, series, extras, tiempos, ventana, nEx, nEs, nMa }) => (
          <div key={m} className="mosaico">
            <div className="mosaico-cab" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <h2><i className="punto" style={{ background: color, marginRight: 6 }} />{m}</h2>
              <button className="chico fantasma" onClick={() => setFasesDe(m)} data-tip={'Fases de la curva: lag, exponencial y estacionaria\nAmplía la curva para elegir qué puntos forman la fase exponencial (el tramo de las UFC; el de la OD se elige aparte en la Revisión de la OD)'}>Fases…</button>
            </div>
            <Grafico series={series} extras={extras} yTxt="log₁₀ UFC/mL" alto={240} zonas={zonasVentana(ventana, tiempos[0], tiempos[tiempos.length - 1])} estilo={s.estiloGrafico('calidadUfc')} idEstilo="calidadUfc" nombre={`calidad_ufc_${m}`}
              onPuntoClick={(k) => { const z = clavesT.get(k); if (z) setZoom(z) }} />
            <div className="fila" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              <span className={`chip ${nEx ? 'peligro' : nMa ? 'aviso' : 'ok'}`}>{nEx ? `${nEx} excluida${nEx > 1 ? 's' : ''}` : nMa ? `${nMa} marcada${nMa > 1 ? 's' : ''}` : 'sin marcas'}</span>
              {nEx > 0 && nMa > 0 && <span className="chip aviso">{nMa} marcada{nMa > 1 ? 's' : ''}</span>}
              {nEs > 0 && <span className="chip">{nEs} estimada{nEs > 1 ? 's' : ''}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="ayuda" style={{ margin: '0 0 14px' }}>Cada punto es una réplica; el cuadrado es el valor de la cepa en ese tiempo ({cen === 'geo' ? 'media geométrica de las réplicas' : 'suma de colonias / suma de volúmenes'}; se elige en Curva UFC vs t) y su barra, {cen === 'geo' ? `la ${ERRORES_UFC[o.error]} de los log₁₀ de las réplicas${o.error !== 'sd' ? ' (no se dibuja con menos de 3 réplicas)' : ''}` : 'su IC 95 % (10^(log₁₀ N ± 2·u_c), con el error de Poisson y el operativo; ISO 19036)'}. Un clic en un punto o en el valor de un tiempo abre sus réplicas acercadas, para excluirlas o reincorporarlas. «Fases…» amplía la curva para elegir el tramo exponencial. Punto lleno: incluida · círculo hueco: estimada (fuera del rango contable) · cruz roja: excluida · anillo naranja: marcada por {nombreTest}, sigue en el promedio. · {ufcRes.reps.filter((r) => r.Conteos > 0).length} réplicas · {nFuera} excluidas · {nEst} estimadas · {Object.keys(ufcRes.dixon).length} marcadas por {nombreTest}</p>
      {fasesDe && datosFases.get(fasesDe) && <ModalFases s={s} cepa={fasesDe} origen="ufc" yTxt="log₁₀ UFC/mL" {...datosFases.get(fasesDe)} onClose={() => setFasesDe(null)} />}
      {zoom && <ZoomTiempo titulo={`${zoom.m} · T = ${fx(zoom.t, zoom.t % 1 ? 2 : 0)} h`} cepa={zoom.m} colores={s.colores} o={{ puntos: true, medias: false, errores: false, etiquetas: false, mostrar: mo, error: o.error }}
        onClick={(k) => { const r = ufcRes.reps.find((x) => clave(x) === k); if (r) alternar(r) }} estilo={{ ...s.estiloGrafico('exclusion'), yTxt: 'log₁₀ UFC/mL' }} onClose={() => setZoom(null)} lect={lectZoom(zoom)} />}
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
                  <td className="grupo">{i === 0 ? <b>{g.Muestra}</b> : ''}</td><td className="num grupo">{i === 0 ? g.T_h : ''}</td><td className="num">{r.Replica}</td>
                  <td>{r.Diluciones_usadas || '(sin conteos)'}{r._manual && <small className="ayuda"> · a mano</small>}</td>
                  <td className="num"><Valor f={fRep(r)}>{sciCorto(r.UFC_mL)}</Valor></td><td className="num">{fx(r.log10, 2)}</td>
                  <td><span className={`chip ${fuera ? 'peligro' : dx ? 'aviso' : CHIP[r._estado]} ${dx ? 'calc' : ''}`} data-tip={dx ? `${dx}\nClic: ver el test` : undefined} onClick={dx ? () => s.abrirFicha(fAtip(g)()) : undefined}>{fuera ? (dx && !exp.ufcExcl.includes(clave(r)) ? `${nombreTest}: excluida` : 'Excluida a mano') : dx ? (auto ? `${nombreTest} (reincorporada)` : `${nombreTest}: marcada`) : r.Estado}</span></td>
                  <td className="num grupo">{i === 0 ? <span style={{ color: cv > 50 ? 'var(--aviso)' : undefined }} data-tip={tipCv}>{fx(cv, 0)}</span> : ''}</td>
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
