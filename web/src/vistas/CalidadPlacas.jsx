import { useMemo, useRef, useState } from 'react'
import { desvio, finito, media } from '../motor/analisis.js'
import { METODOS_ATIPICOS } from '../motor/atipicos.js'
import { TEMAS, rellenoPocillo, useTema } from '../tema.js'
import { estiloGraficoDef, useAncho } from '../ui/grafico.jsx'
import { ModalGuardarImagen, useGraficoCtx } from '../ui/guardarImagen.jsx'
import { PanelPersonalizar } from '../ui/personalizar.jsx'
import { Icono, Num } from '../ui/base.jsx'
import { BotonCinta, Cajon, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { LETRAS, exportarSVG, fmtTick, fx, tCuantil, ticks } from '../utils.js'

const ERRORES = [['sd', 'Desviación estándar'], ['sem', 'Error estándar (EEM)'], ['ic95', 'IC 95 %']]
const errorDe = (v, tipo) => {
  const n = v.length
  if (n < 2) return NaN
  const sd = desvio(v)
  return tipo === 'sd' ? sd : tipo === 'sem' ? sd / Math.sqrt(n) : (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n)
}
const valorDe = (l) => (l.EsBlanco ? l.OD_leida : l.OD_corregida)

// ---------------------------------------------------------------
// Gráfico de exclusión (como el de Biofilm): una columna por cepa con sus pocillos de ese tiempo
// ---------------------------------------------------------------
function GraficoExclusion(props) {
  const { lect, orden, colores, o, onClick, titulo, estilo = {}, anchoFijo, altoTotal, refSvg, interactivo = true, idEstilo } = props
  const [guardar, setGuardar] = useState(false)
  const [menu, setMenu] = useState(null)
  const ctx = useGraficoCtx()
  const Tt = useTema()
  const e = { ...estiloGraficoDef(), ...estilo }
  const T = e.fondo === 'blanco' ? TEMAS.claro : Tt
  const tit = e.titulo !== undefined ? e.titulo : titulo
  const yT = e.yTxt !== undefined ? e.yTxt : 'OD (cepas: corregida · blanco: leída)'
  const refInt = useRef()
  const ref = refSvg || refInt
  const [cont, anchoMedido] = useAncho(900)
  const W = anchoFijo || anchoMedido, H = altoTotal || (Number(e.alto) > 150 ? Number(e.alto) : 420), L = 30 + e.tamNumeros * 3, R = 16, TOP = tit ? 18 + e.tamTitulo * 1.5 : 18, B = 40 + e.tamEjes * 2
  const grupos = orden.map((m) => lect.filter((l) => l.Muestra === m))
  const res = grupos.map((g) => {
    const v = g.filter((l) => l.Usado).map(valorDe).filter(finito)
    return v.length ? { m: media(v), err: errorDe(v, o.error), n: v.length } : null
  })
  const vals = [...lect.map(valorDe).filter(finito), ...res.filter(Boolean).flatMap((r) => (finito(r.err) ? [r.m + r.err, r.m - r.err] : [r.m]))]
  let lo = Math.min(0, ...vals), hi = Math.max(0.1, ...vals)
  const fijoMin = e.ymin !== '' && Number.isFinite(Number(e.ymin)), fijoMax = e.ymax !== '' && Number.isFinite(Number(e.ymax))
  if (o.medias) hi += (hi - lo) * (o.errores ? 0.16 : 0.1)
  hi += (hi - lo) * 0.04
  if (fijoMin) lo = Number(e.ymin)
  if (fijoMax) hi = Number(e.ymax)
  const ty = ticks(lo, hi, 7)
  const y0 = ty.ticks[0], y1 = ty.ticks[ty.ticks.length - 1]
  const band = (W - L - R) / Math.max(orden.length, 1)
  const py = (v) => TOP + (1 - (v - y0) / (y1 - y0 || 1)) * (H - TOP - B)
  const cx = (i) => L + band * (i + 0.5)
  const px = (g, k, i) => cx(i) + (g.length > 1 ? (k - (g.length - 1) / 2) * Math.min(band * 0.7 / g.length, 18) : 0)
  return (
    <div className="grafico" ref={cont} style={{ position: 'relative' }}>
      {interactivo && <div className="fila no-imprimir" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
        <button className="fantasma chico" onClick={() => setGuardar(true)} data-tip={'Guardar imagen\nFormato (PNG, JPG o SVG), tamaño, resolución y fondo'}><Icono n="bajar" size={14} />Guardar imagen</button>
      </div>}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} fontFamily={`'${e.fuente}', system-ui, sans-serif`}
        onContextMenu={interactivo ? (ev) => { ev.preventDefault(); const r = ev.currentTarget.getBoundingClientRect(); setMenu({ cx: ev.clientX - r.left, cy: ev.clientY - r.top }) } : undefined}>
        <rect className="fondo-graf" width={W} height={H} fill={e.fondo === 'blanco' ? '#ffffff' : T.panel} />
        {tit && <text x={W / 2} y={10 + e.tamTitulo} textAnchor="middle" fontSize={e.tamTitulo} fontWeight="600" fill={T.texto}>{tit}</text>}
        {ty.ticks.map((v) => (
          <g key={v}>
            {e.grilla && <line x1={L} x2={W - R} y1={py(v)} y2={py(v)} stroke={T.grilla} />}
            <text x={L - 8} y={py(v)} textAnchor="end" dominantBaseline="central" fontSize={e.tamNumeros} fill={T.sec}>{fmtTick(v, ty.paso)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={py(0)} y2={py(0)} stroke={T.eje} />
        <line x1={L} x2={L} y1={TOP} y2={H - B} stroke={T.eje} />
        <text transform={`translate(16 ${(TOP + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{yT}</text>
        {orden.map((m, i) => (
          <g key={m}>
            <rect x={cx(i) - band * 0.42} y={TOP} width={band * 0.84} height={H - TOP - B} fill={m === 'Blanco' ? T.grilla : colores[m]} opacity={m === 'Blanco' ? 0.35 : 0.07} rx="6" />
            <text x={cx(i)} y={H - B + 6 + e.tamEjes} textAnchor="middle" fontSize={e.tamEjes} fill={T.texto}>{m}</text>
            <text x={cx(i)} y={H - B + 10 + e.tamEjes * 2} textAnchor="middle" fontSize={e.tamNumeros * 0.95} fill={T.sec}>{res[i] ? `n = ${res[i].n} de ${grupos[i].length}` : ''}</text>
          </g>
        ))}
        {res.map((r, i) => r && (o.medias || o.errores) && (
          <g key={'m' + i} stroke={T.texto} strokeWidth={1.5 * e.grosor}>
            <line x1={cx(i) - band * 0.3} x2={cx(i) + band * 0.3} y1={py(r.m)} y2={py(r.m)} />
            {o.errores && finito(r.err) && <path d={`M${cx(i)},${py(r.m - r.err)}V${py(r.m + r.err)}M${cx(i) - band * 0.1},${py(r.m + r.err)}h${band * 0.2}M${cx(i) - band * 0.1},${py(r.m - r.err)}h${band * 0.2}`} fill="none" />}
          </g>
        ))}
        {o.puntos && grupos.map((g, i) => g.map((l, k) => {
          const X = px(g, k, i), Y = py(valorDe(l))
          if (!finito(Y)) return null
          const col = l.EsBlanco ? '#8C9BB0' : colores[l.Muestra] || T.acento
          return (
            <g key={l.clave} onClick={() => onClick(l.clave)} style={{ cursor: 'pointer' }}
              data-tip={`${l.Pocillo} · ${l.Muestra}${l.EsBlanco ? '' : ` (réplica ${l.Replica})`} · t = ${l.Placa_T_h} h\n${l.EsBlanco ? `OD leída = ${fx(l.OD_leida, 4)}` : `OD = (${fx(l.OD_leida, 4)} − ${fx(l.Blanco, 4)})${l.Factor_dilucion > 1 ? ` × ${l.Factor_dilucion}` : ''} = ${fx(l.OD_corregida, 4)}`}\n${l.Motivo || (l.Usado ? 'Aceptado' : 'Excluido')}\nClic: ${l.Usado ? 'excluir' : 'reincorporar'}`}>
              <circle cx={X} cy={Y} r="13" fill="transparent" />
              {l.Sospechoso && <circle cx={X} cy={Y} r="9" fill="none" stroke={T.aviso} strokeWidth="2.4" />}
              {l.Usado ? <circle cx={X} cy={Y} r={5 * e.radio} fill={col} stroke={T.panel} strokeWidth="1" />
                : <path d={`M${X - 5},${Y - 5}L${X + 5},${Y + 5}M${X - 5},${Y + 5}L${X + 5},${Y - 5}`} stroke={T.peligro} strokeWidth="2.4" />}
            </g>
          )
        }))}
        {o.medias && res.map((r, i) => {
          if (!r) return null
          const top = Math.max(...grupos[i].map(valorDe).filter(finito), r.m + (o.errores && finito(r.err) ? r.err : 0))
          const txt = o.errores && finito(r.err) ? `${fx(r.m, 3)} ± ${fx(r.err, 3)}` : fx(r.m, 3)
          return (
            <g key={'t' + i}>
              <rect x={cx(i) - txt.length * 3.6 - 6} y={py(top) - 30} width={txt.length * 7.2 + 12} height="20" rx="5" fill={T.panel2} stroke={T.borde} />
              <text x={cx(i)} y={py(top) - 16} textAnchor="middle" fontSize={e.tamValores + 1.5} fontWeight="600" fill={T.texto}>{txt}</text>
            </g>
          )
        })}
        <g transform={`translate(${W / 2 - 150},${H - 10})`} fontSize="12" fill={T.texto}>
          <circle cx="0" cy="-4" r="5" fill={T.acento} /><text x="10" y="0">Aceptado</text>
          <path d="M95,-9L105,1M95,1L105,-9" stroke={T.peligro} strokeWidth="2.2" /><text x="112" y="0">Excluido</text>
          <circle cx="200" cy="-4" r="7" fill="none" stroke={T.aviso} strokeWidth="2.2" /><text x="212" y="0">Sospechoso</text>
        </g>
      </svg>
      {menu && (
        <div className="menu-contextual" style={{ left: menu.cx, top: menu.cy, position: 'absolute' }} onMouseLeave={() => setMenu(null)}>
          {ctx.abrirPersonalizar && idEstilo && <button onClick={() => { setMenu(null); ctx.abrirPersonalizar(idEstilo) }}><Icono n="editar" size={15} />Personalizar gráfico…</button>}
          <button onClick={() => { setMenu(null); setGuardar(true) }}><Icono n="bajar" size={15} />Guardar imagen…</button>
        </div>
      )}
      {guardar && <ModalGuardarImagen nombre="exclusion" anchoPantalla={W} altoPantalla={H} onClose={() => setGuardar(false)}
        renderizar={(w, h, r, blanco) => <GraficoExclusion {...props} anchoFijo={w} altoTotal={h} refSvg={r} interactivo={false} estilo={blanco ? { ...estilo, fondo: 'blanco' } : estilo} />} />}
    </div>
  )
}

// ---------------------------------------------------------------
// Placa de un tiempo con el estado de cada pocillo
// ---------------------------------------------------------------
function PlacaDeTiempo({ s, lect, pl }) {
  const T = useTema()
  const porPoc = Object.fromEntries(lect.map((l) => [l.Pocillo, l]))
  return (
    <div className="placa-wrap">
      <table className="placa"><thead><tr><th />{Array.from({ length: 12 }, (_, c) => <th key={c}>{c + 1}</th>)}</tr></thead>
        <tbody>{LETRAS.map((L) => (
          <tr key={L}><th>{L}</th>{Array.from({ length: 12 }, (_, c) => {
            const p = L + (c + 1)
            const l = porPoc[p]
            const lay = pl?.layout[p]
            const col = lay?.muestra ? (lay.blanco ? '#8C9BB0' : s.colores[lay.muestra]) : null
            const borde = l && !l.Usado ? T.peligro : l?.Sospechoso ? T.aviso : col
            return (
              <td key={p}>
                <div className={`pozo ${!lay?.muestra ? 'vacio-poz' : ''} ${lay?.blanco ? 'blanco' : ''}`} onClick={l ? () => s.alternarLectura(l.clave) : undefined}
                  data-tip={l ? `${p} · ${l.Muestra}\n${l.EsBlanco ? 'OD leída' : 'OD corregida'} = ${fx(valorDe(l), 4)}\n${l.Motivo || 'Aceptado'}\nClic: ${l.Usado ? 'excluir' : 'reincorporar'}` : undefined}
                  style={{ width: 54, height: 44, fontSize: 10.5, background: col ? rellenoPocillo(col, T) : undefined, borderColor: borde || undefined, borderWidth: l && (!l.Usado || l.Sospechoso) ? 2 : 1, cursor: l ? 'pointer' : 'default' }}>
                  {l ? <><b style={{ color: l.Usado ? T.texto : T.peligro, textDecoration: l.Usado ? 'none' : 'line-through' }}>{fx(valorDe(l), 3)}</b><small>{l.EsBlanco ? 'blanco' : p}</small></> : <small>{p}</small>}
                </div>
              </td>
            )
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function ResumenTiempos({ lect }) {
  const filas = useMemo(() => {
    const g = new Map()
    lect.forEach((l) => { const k = `${l.Muestra}|${l.Placa_T_h}`; if (!g.has(k)) g.set(k, []); g.get(k).push(l) })
    return [...g.values()].map((ls) => {
      const v = ls.filter((l) => l.Usado).map(valorDe).filter(finito)
      const m = media(v), sd = v.length > 1 ? desvio(v) : NaN
      return { Muestra: ls[0].Muestra, T: ls[0].Placa_T_h, n: v.length, N: ls.length, m, sd, cv: m ? (100 * sd) / Math.abs(m) : NaN, fuera: ls.filter((l) => !l.Usado).map((l) => l.Pocillo), sosp: ls.filter((l) => l.Sospechoso && l.Usado).map((l) => l.Pocillo) }
    }).sort((a, b) => a.T - b.T || (a.Muestra === 'Blanco' ? -1 : b.Muestra === 'Blanco' ? 1 : a.Muestra < b.Muestra ? -1 : 1))
  }, [lect])
  return (
    <div className="tabla-scroll alta"><table className="tabla">
      <thead><tr><th className="num">T (h)</th><th>Grupo</th><th className="num">Pocillos usados</th><th className="num">Media</th><th className="num">DE</th><th className="num">CV %</th><th>Excluidos</th><th>Sospechosos conservados</th></tr></thead>
      <tbody>{filas.map((f) => (
        <tr key={f.Muestra + f.T}><td className="num">{f.T}</td><td>{f.Muestra === 'Blanco' ? <i>Blanco</i> : f.Muestra}</td><td className="num">{f.n} / {f.N}</td><td className="num">{fx(f.m, 4)}</td><td className="num">{fx(f.sd, 4)}</td>
          <td className="num" style={{ color: f.cv > 20 ? 'var(--aviso)' : undefined }}>{fx(f.cv, 1)}</td><td>{f.fuera.join(', ')}</td><td>{f.sosp.join(', ')}</td></tr>
      ))}</tbody>
    </table></div>
  )
}

// ---------------------------------------------------------------
// Control de calidad de placas por tiempo (panel + vistas)
// ---------------------------------------------------------------
export function VistaCalidadPlacas({ s }) {
  const { exp, setAj } = s
  const aj = exp.aj
  const lecturas = s.serie.extra?.lecturas || []
  const tiempos = [...new Set(lecturas.map((l) => l.Placa_T_h))].sort((a, b) => a - b)
  const [t, setT] = useState(tiempos[0])
  const [vista, setVista] = useState('puntos')
  const [pers, setPers] = useState(false)
  const [o, setOAll] = useState({ puntos: true, medias: true, errores: true, error: 'sd', blanco: true })
  const setO = (k, v) => setOAll({ ...o, [k]: v })
  const tt = tiempos.includes(t) ? t : tiempos[0]
  const lectT = lecturas.filter((l) => l.Placa_T_h === tt && (o.blanco || !l.EsBlanco))
  const pl = exp.placas.find((p) => Math.abs(p.t - tt) < 1e-9)
  const cepas = [...new Set(lecturas.filter((l) => !l.EsBlanco).map((l) => l.Muestra))]
  const orden = [...cepas, ...(o.blanco && lectT.some((l) => l.EsBlanco) ? ['Blanco'] : [])]
  const excluidas = lecturas.filter((l) => !l.Usado)
  const metodo = aj.pl_metodo || 'q'
  const bl = s.serie.extra?.blancos?.find((b) => b.id === pl?.id)
  const revisar = lecturas.filter((l) => !l.Usado || l.Sospechoso).sort((a, b) => a.Placa_T_h - b.Placa_T_h)
  return (
    <>
      <Cinta>
        <Grupo titulo="Método">
          <OpcionesCinta valor={metodo} onChange={(v) => setAj('pl_metodo', v)} opciones={[['q', 'Dixon', 'Q', null, METODOS_ATIPICOS.q], ['grubbs', 'Grubbs', 'G', null, METODOS_ATIPICOS.grubbs], ['cv', 'CV %', 'CV', null, METODOS_ATIPICOS.cv]]} />
        </Grupo>
        {metodo === 'cv'
          ? <Grupo titulo="Límite"><CampoCinta etiqueta="CV máximo (%)"><Num value={aj.pl_cvmax ?? 20} onChange={(v) => setAj('pl_cvmax', v)} ancho={70} /></CampoCinta></Grupo>
          : <Grupo titulo="Confianza"><OpcionesCinta valor={String(aj.pl_conf || 95)} onChange={(v) => setAj('pl_conf', Number(v))} opciones={[['90', '90 %', '90', null, 'Confianza 90 %: marca más atípicos'], ['95', '95 %', '95', null, 'Confianza 95 % (la habitual)'], ['99', '99 %', '99', null, 'Confianza 99 %: solo marca valores muy extremos']]} /></Grupo>}
        <Grupo titulo="Sospechosos">
          <OpcionesCinta valor={aj.pl_auto !== false ? 'si' : 'no'} onChange={(v) => setAj('pl_auto', v === 'si')} opciones={[['si', 'Excluir', '⛔', null, 'Excluir automáticamente los sospechosos'], ['no', 'Solo marcar', '◯', null, 'Marcarlos con un anillo y dejarlos en el análisis']]} />
          <BotonCinta icono="refrescar" texto="Restablecer" tip="Borra todas las exclusiones y conservaciones hechas a mano" onClick={() => { if (window.confirm('Se borran todas las exclusiones y conservaciones manuales de las placas. ¿Continuar?')) s.restablecerLecturas() }} />
        </Grupo>
        <Grupo titulo="Gráfico">
          <BotonCinta simbolo="•" texto="Puntos" activo={o.puntos} onClick={() => setO('puntos', !o.puntos)} tip={'Mostrar puntos\nUn punto por pocillo; clic sobre un punto para excluirlo o reincorporarlo'} />
          <BotonCinta simbolo="x̄" texto="Media" activo={o.medias} onClick={() => setO('medias', !o.medias)} tip={'Valor medio\nLínea y etiqueta con la media de los pocillos aceptados de cada cepa'} />
          <BotonCinta simbolo="±" texto="Error" activo={o.errores} onClick={() => setO('errores', !o.errores)} tip={'Error junto a la media\nBarras y valor del error elegido en «Tipo de error»'} />
          <BotonCinta simbolo="B" texto="Blancos" activo={o.blanco} onClick={() => setO('blanco', !o.blanco)} tip={'Mostrar los blancos\nColumna con los pocillos de blanco de la placa (su OD leída)'} />
          <BotonCinta icono="editar" texto="Personalizar" activo={pers} onClick={() => setPers(!pers)} tip="Títulos, tamaños de letra, grosores, eje Y, fondo y colores de las cepas" />
        </Grupo>
        <Grupo titulo="Tipo de error">
          <OpcionesCinta valor={o.error} onChange={(v) => setO('error', v)} opciones={[['sd', 'DE', 's', null, 'Desviación estándar\nCuánto se dispersan los pocillos entre sí'], ['sem', 'EEM', 's/√n', null, 'Error estándar de la media = DE / √n\nIncertidumbre de la media'], ['ic95', 'IC 95 %', 'IC', null, 'Intervalo de confianza del 95 %\nmedia ± t(0,975; n − 1) × DE / √n']]} />
        </Grupo>
      </Cinta>
      <Cajon titulo="Personalizar gráfico" abierto={pers} onClose={() => setPers(false)}><PanelPersonalizar s={s} id="exclusion" /></Cajon>
      <div className="tiempos" style={{ marginBottom: 12 }}>
        {tiempos.map((x) => {
          const n = lecturas.filter((l) => l.Placa_T_h === x && !l.Usado).length
          const sp = lecturas.filter((l) => l.Placa_T_h === x && l.Sospechoso && l.Usado).length
          return <button key={x} className={`tiempo ${x === tt ? 'on' : ''}`} onClick={() => setT(x)}><b>t = {fx(x, x % 1 ? 2 : 0)} h</b><small>{n ? `${n} excluida${n > 1 ? 's' : ''}` : sp ? `${sp} sospechosa${sp > 1 ? 's' : ''}` : 'sin marcas'}</small></button>
        })}
      </div>
      <div className="dos-columnas ancha">
        <Mosaico>
          <div className="pestanas" style={{ marginTop: -6 }}>
            <button className={vista === 'puntos' ? 'on' : ''} onClick={() => setVista('puntos')}>Excluir puntos</button>
            <button className={vista === 'placa' ? 'on' : ''} onClick={() => setVista('placa')}>Placa</button>
            <button className={vista === 'tabla' ? 'on' : ''} onClick={() => setVista('tabla')}>Resumen de todos los tiempos</button>
          </div>
          {vista === 'puntos' && <GraficoExclusion lect={lectT} orden={orden} colores={s.colores} o={o} onClick={s.alternarLectura} titulo={`t = ${fx(tt, tt % 1 ? 2 : 0)} h`} estilo={s.estiloGrafico('exclusion')} idEstilo="exclusion" />}
          {vista === 'placa' && <PlacaDeTiempo s={s} lect={lecturas.filter((l) => l.Placa_T_h === tt)} pl={pl} />}
          {vista === 'tabla' && <ResumenTiempos lect={lecturas} />}
          <p className="ayuda" style={{ marginTop: 8, marginBottom: 0 }}>Clic sobre un punto para excluirlo o reincorporarlo. Color: aceptado · cruz roja: excluido · anillo naranja: sospechoso según el test.</p>
        </Mosaico>
        <div className="columna-mosaicos">
          <Mosaico titulo={`Blanco de t = ${fx(tt, tt % 1 ? 2 : 0)} h`}>
            {bl && finito(bl.valor) ? (<>
              <div className="cifra"><b>{fx(bl.valor, 4)}</b>{finito(bl.de) && <span>± {fx(bl.de, 4)}</span>}</div>
              <p className="ayuda" style={{ margin: 0 }}>Media de {bl.n} pocillo{bl.n === 1 ? '' : 's'} ({bl.pocillos.join(', ')}){bl.origen !== tt ? `, tomado de la placa t = ${bl.origen} h` : ''}. Se resta a cada lectura y el resultado se multiplica por la dilución.</p>
            </>) : <p className="ayuda">Sin blanco aceptado en esta placa.</p>}
          </Mosaico>
          <Mosaico titulo={`Para revisar (${revisar.length})`}>
            {!revisar.length ? <p className="ayuda" style={{ margin: 0 }}>Nada marcado: todas las lecturas fueron aceptadas.</p> : (
              <div className="lista-revisar">
                {revisar.map((l) => (
                  <button key={l.clave} className="fantasma" onClick={() => { setT(l.Placa_T_h); s.alternarLectura(l.clave) }} data-tip={`${l.Motivo || ''}\nClic: ${l.Usado ? 'excluir' : 'reincorporar'}`}>
                    <span><b>{l.Pocillo}</b> · {l.Muestra} · {l.Placa_T_h} h<br /><small className="ayuda">{l.Manual ? 'a mano' : l.AutoExcl ? 'test' : 'sospechoso conservado'}</small></span>
                    <span className={`chip ${l.Usado ? 'aviso' : 'peligro'}`}>{l.Usado ? 'aceptada' : 'excluida'}</span>
                  </button>
                ))}
              </div>
            )}
          </Mosaico>
        </div>
      </div>
    </>
  )
}

// lecturas para otras vistas (Datos, compatibilidad)
export const lecturasPlacas = (s) => s.serie.extra?.lecturas || []
export const fueraLect = (l) => !l.Usado
