import { curvaSuaveUfc } from '../motor/ufc.js'
import { useMemo, useState } from 'react'
import { dUfc, dAjuste } from '../calculos.js'
import { finito, media, desvio } from '../motor/analisis.js'
import { useTema } from '../tema.js'
import { Campo, Check, Encabezado, Icono, Seg, Vacio, Num, Sel } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fx, sciCorto } from '../utils.js'

const CHIP = { ok: 'ok', bajo: 'aviso', alto: 'aviso', cero: '', incontable: 'peligro', sin_datos: '' }

export function CalidadUfc({ s }) {
  const T = useTema()
  const [pers, setPers] = useState(null)
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
  const alternar = (r) => {
    const k = clave(r)
    if (exp.ufcExcl.includes(k)) return upd({ ufcExcl: exp.ufcExcl.filter((x) => x !== k) })
    if (ufcRes.dixon[k] && aj.ufc_dixon_on !== false) return upd({ ufcForz: exp.ufcForz.includes(k) ? exp.ufcForz.filter((x) => x !== k) : [...exp.ufcForz, k] })
    upd({ ufcExcl: [...exp.ufcExcl, k] })
  }
  const nFuera = ufcRes.fuera.size
  const nEst = ufcRes.reps.filter((r) => ['bajo', 'alto'].includes(r._estado)).length
  // gráfico: cada réplica en log10, las excluidas con ✕
  const muestras = [...new Set(grupos.map((g) => g.Muestra))]
  const series = muestras.map((m) => ({
    id: m, nombre: m, color: s.colores[m], linea: false, puntos: true, radio: 3.6,
    data: ufcRes.reps.filter((r) => r.Muestra === m && finito(r.log10) && !ufcRes.fuera.has(clave(r))).map((r) => ({ x: r.T_h, y: r.log10, key: clave(r), tip: `${m} · réplica ${r.Replica}\nT = ${r.T_h} h\nlog₁₀ UFC/mL = ${fx(r.log10, 2)}\n${r.Estado}\nClic para excluir` })),
  }))
  // promedio de cada tiempo (suma de colonias / suma de volúmenes de las réplicas incluidas)
  const promedios = muestras.map((m) => ({
    id: 'prom' + m, nombre: '', color: s.colores[m], linea: false, puntos: true, forma: 'cuadrado', hueco: true, radio: 5.5,
    data: ufcRes.res.filter((r) => r.Muestra === m && finito(r.log10)).map((r) => ({ x: r.T_h, y: r.log10, tip: `${m} · T = ${r.T_h} h\nPromedio de ${r.N} réplica${r.N === 1 ? '' : 's'}: ${r.Colonias_suma} colonias / ${fx(r.Volumen_mL * 1000, 3)} µL de suspensión original\nlog₁₀ UFC/mL = ${fx(r.log10, 2)}` })),
  }))
  // curva suavizada (opcional) en lugar de unir las medias con líneas
  const medias = exp.aj.ufc_suave === false ? [] : muestras.map((m) => { const cs = curvaSuaveUfc(ufcRes.res.filter((r) => r.Muestra === m), (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave)); return cs.ok ? { id: 'sv' + m, nombre: '', color: s.colores[m], ancho: 1.6, opacidad: 0.7, data: cs.puntos } : null }).filter(Boolean)
  const extras = ufcRes.reps.filter((r) => finito(r.log10) && ufcRes.fuera.has(clave(r))).map((r) => ({ x: r.T_h, y: r.log10, key: clave(r), color: T.peligro, forma: 'x', tip: `${r.Muestra} · réplica ${r.Replica} (excluida)\n${ufcRes.dixon[clave(r)] || 'Excluida a mano'}\nClic para reincorporar` }))

  return (
    <div className="pagina">
      <Encabezado titulo="Calidad UFC" sub="Revisá qué diluciones entraron en el cálculo de cada réplica, cuáles se estimaron fuera del rango contable y qué réplicas se apartan de las demás (test Q de Dixon sobre log₁₀ o RSD %, a elección en la cinta).">
      </Encabezado>
      <Cinta>
        <Grupo titulo="Réplicas atípicas">
          <OpcionesCinta valor={aj.ufc_dixon_on === false ? 'no' : aj.ufc_atip_metodo || 'q'} onChange={(v) => { s.setAj('ufc_dixon_on', v !== 'no'); if (v !== 'no') s.setAj('ufc_atip_metodo', v) }}
            opciones={[['no', 'Ninguno', '·', null, 'No comparar las réplicas entre sí'], ['q', 'Dixon', 'Q', null, 'Test Q de Dixon sobre log₁₀ UFC/mL (Grubbs con más de 10 réplicas)'], ['cv', 'RSD', '%', null, 'Desviación estándar relativa (CV %) de UFC/mL: si las réplicas de un tiempo la superan, sale la más alejada de la media']]} />
          {aj.ufc_dixon_on !== false && (aj.ufc_atip_metodo || 'q') === 'q' && <CampoCinta etiqueta="Confianza"><Sel value={String(aj.ufc_dixon_conf || 95)} onChange={(v) => s.setAj('ufc_dixon_conf', Number(v))} opciones={[['90', '90 %'], ['95', '95 %'], ['99', '99 %']]} /></CampoCinta>}
          {aj.ufc_dixon_on !== false && aj.ufc_atip_metodo === 'cv' && <CampoCinta etiqueta="RSD máx. (%)"><Num value={aj.ufc_cvmax ?? 20} onChange={(v) => s.setAj('ufc_cvmax', v)} ancho={56} /></CampoCinta>}
        </Grupo>
        <Grupo titulo="Fuera de rango">
          <BotonCinta simbolo="≈" texto="Usar estimados" activo={exp.ufc.estimados} onClick={() => upd((e) => ({ ufc: { ...e.ufc, estimados: !e.ufc.estimados } }))} />
        </Grupo>
        <Grupo titulo="Gráfico">
          <OpcionesCinta valor={exp.aj.ufc_suave === false ? 'no' : (exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave)} onChange={(v) => s.setAj('ufc_suave', v === 'no' ? false : v)} opciones={[['no', 'Sin curva', '·', null, 'Solo los puntos, sin líneas'], ['baranyi', 'Baranyi', '∿', null, 'Curva del modelo de Baranyi-Roberts ajustado a ln(UFC/mL) (4 o más tiempos)'], ['spline', 'Spline', '⌇', null, 'Spline cúbica monótona que pasa por cada media sin oscilar']]} />
          <BotonCinta icono="editar" texto="Personalizar" activo={pers === 'calidadUfc'} onClick={() => setPers(pers === 'calidadUfc' ? null : 'calidadUfc')} tip="Títulos, tamaños de letra, grosores, ejes, leyenda, fondo y colores de las cepas" />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers === 'calidadUfc'} onClose={() => setPers(null)}><PanelPersonalizar s={s} id="calidadUfc" /></Cajon>
      <div>
        <div style={{ minWidth: 0 }}>
          <div className="tarjeta">
            <Grafico series={[...medias, ...promedios, ...series]} extras={extras} yTxt="log₁₀ UFC/mL (cada réplica)" alto={300} estilo={s.estiloGrafico('calidadUfc')} idEstilo="calidadUfc" onPuntoClick={(k) => { const r = ufcRes.reps.find((x) => clave(x) === k); if (r) alternar(r) }} nombre="calidad_ufc" />
            <p className="ayuda" style={{ marginTop: 6 }}>Cada punto es una réplica y el cuadrado, el promedio del tiempo (suma de colonias / suma de volúmenes){exp.aj.ufc_suave !== false ? '; la línea es la curva suavizada de los promedios' : ''}. Clic en un punto para excluirlo o reincorporarlo. · {ufcRes.reps.filter((r) => r.Conteos > 0).length} réplicas · {nFuera} excluidas · {nEst} estimadas · {Object.keys(ufcRes.dixon).length} marcadas por {aj.ufc_atip_metodo === 'cv' ? 'RSD' : 'Dixon'}</p>
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
                      <td><span className={`chip ${fuera ? 'peligro' : CHIP[r._estado]}`} data-tip={dx || undefined}>{fuera ? (dx && !exp.ufcExcl.includes(clave(r)) ? (aj.ufc_atip_metodo === 'cv' ? 'RSD: excluida' : 'Dixon: excluida') : 'Excluida a mano') : dx ? (aj.ufc_atip_metodo === 'cv' ? 'RSD (reincorporada)' : 'Dixon (reincorporada)') : r.Estado}</span></td>
                      <td className="num">{i === 0 ? <span style={{ color: cv > 50 ? 'var(--aviso)' : undefined }}>{fx(cv, 0)}</span> : ''}</td>
                      <td><button className="chico" onClick={() => alternar(r)}>{fuera ? 'Reincorporar' : 'Excluir'}</button></td>
                    </tr>
                  )
                })
              })}</tbody>
            </table></div>
          </div>
        </div>
      </div>
    </div>
  )
}
