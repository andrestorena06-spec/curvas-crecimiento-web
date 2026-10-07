import { useMemo, useRef, useState } from 'react'
import { LineChart } from './charts.jsx'
import { Campo, Check, MenuContextual, Num, Panel, Select, useMenuContextual } from './ui.jsx'
import { ExportDialog } from './exportar.jsx'
import { EstiloCurvaDialog, estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { Vacio } from './placa.jsx'
import { desvio, finito, media } from '../motor/analisis.js'
import { clavePunto, nombreReplica, r3 } from '../motor/pipeline.js'
import { tCuantil } from '../utils.js'

export const DIV = { s: 1, min: 60, h: 3600 }
const tamDe = (svg) => ({ w: svg.viewBox.baseVal.width, h: svg.viewBox.baseVal.height })
const nombreError = { sd: 'SD', sem: 'SEM', ic95: 'IC 95%' }

// ---------------------------------------------------------------
// Selector de muestras y réplicas (lo usan Gráfico y Análisis)
// ---------------------------------------------------------------
export function SelectorMuestras({ s }) {
  const todas = s.muestrasCfg
  if (!todas.length) return <div className="aviso-sel">Primero configurá los pocillos en la pestaña «Configurar pocillos».</div>
  const act = s.selMuestras
  const alternar = (m) => s.setSelMuestras(act.includes(m) ? act.filter((x) => x !== m) : todas.filter((x) => act.includes(x) || x === m))
  return (
    <>
      <div className="fila-ctrl" style={{ marginBottom: 4 }}>
        <label style={{ fontWeight: 600 }}>Muestras a mostrar</label>
        <button className="chico" onClick={() => s.setSelMuestras(todas)}>Todas</button>
        <button className="chico" onClick={() => s.setSelMuestras([])}>Ninguna</button>
      </div>
      <div className="lista-checks">
        {todas.map((m) => (
          <label key={m} className="check"><input type="checkbox" checked={act.includes(m)} onChange={() => alternar(m)} />
            <span><i className="punto-color" style={{ background: s.colores.porMuestra[m] }} />{m}</span></label>
        ))}
      </div>
      {act.length > 0 && <label style={{ fontWeight: 600, marginTop: 8, display: 'block' }}>Réplicas a mostrar</label>}
      {act.map((m) => {
        const reps = s.config.filter((c) => c.Muestra === m).sort((a, b) => a.Replica - b.Replica)
        const marc = s.replicasSel(m)
        return (
          <div key={m} className="bloque-reps">
            <b>{m}</b>
            {reps.map((c) => (
              <label key={c.Pocillo} className="check">
                <input type="checkbox" checked={marc.includes(c.Replica)}
                  onChange={() => s.setRepsDe(m, marc.includes(c.Replica) ? marc.filter((x) => x !== c.Replica) : [...marc, c.Replica])} />
                <span><i className="punto-color" style={{ background: s.colores.porPocillo[c.Pocillo]?.color }} />{nombreReplica(m, c.Replica)} ({c.Pocillo})</span>
              </label>
            ))}
          </div>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------
// Construcción del gráfico (series, puntos excluidos y límites)
// ---------------------------------------------------------------
export function armarGrafico(s) {
  const { aj, pre } = s
  const o = s.opts.graf
  const div = DIV[aj.unidad_tiempo] || 3600
  const etq = aj.unidad_tiempo
  const tmin = o.tmin === '' || o.tmin == null ? NaN : Number(o.tmin)
  const tmax = o.tmax === '' || o.tmax == null ? NaN : Number(o.tmax)
  if (finito(tmin) && finito(tmax) && tmin >= tmax) return { error: "En el rango de tiempo, 'Desde' tiene que ser menor que 'Hasta'." }
  const enRango = (x) => (!finito(tmin) || x >= tmin) && (!finito(tmax) || x <= tmax)
  const selPoc = new Set(s.seleccion.map((c) => c.Pocillo))
  if (!selPoc.size) return { error: 'Seleccioná al menos una muestra y una réplica.' }
  const wells = pre.proc.filter((w) => selPoc.has(w.Pocillo))
  if (!wells.length) return { error: 'No hay datos para los pocillos seleccionados.' }
  const ln = aj.escala_y === 'ln'
  const tr = (y) => (ln ? Math.log(y) : y)
  const ok = (y) => finito(y) && (!ln || y > 0)
  const etqY = ln ? 'ln(Abs)' : 'Absorbancia'

  const todosT = wells.flatMap((w) => w.t.filter((_, i) => ok(w.y[i]))).map((t) => t / div)
  if (!todosT.length) return { error: ln ? 'No hay valores positivos para calcular ln(OD).' : 'No hay datos.' }
  if (!todosT.some(enRango)) return { error: 'No hay datos en ese rango de tiempo.' }
  let xlim = [finito(tmin) ? tmin : Math.min(...todosT), finito(tmax) ? tmax : Math.max(...todosT)]
  if (xlim[1] > xlim[0]) { const p = (xlim[1] - xlim[0]) * 0.01; xlim = [xlim[0] - p, xlim[1] + p] }
  const rangoY = (v) => {
    v = v.filter(finito)
    if (!v.length) return [0, 1]
    const a = Math.min(...v), b = Math.max(...v)
    let pad = (b - a) * 0.05
    if (pad === 0) pad = Math.max(Math.abs(a) * 0.05, 0.01)
    return [a - pad, b + pad]
  }
  const xTxt = `Tiempo (${etq})`
  const yBase = ln ? 'ln(Absorbancia)' : 'Absorbancia'
  const yTxt = aj.corregir_blanco ? `${yBase} (corregida al blanco)` : yBase

  if (aj.modo_grafico === 'individual') {
    const series = wells.map((w) => {
      const est = s.colores.porPocillo[w.Pocillo]
      const data = []
      w.t.forEach((t, i) => {
        if (!ok(w.y[i])) return
        const x = t / div
        data.push({ x, y: tr(w.y[i]), key: clavePunto(w.Pocillo, t),
          tip: `${w.ReplicaNombre} (${w.Pocillo})\nTiempo: ${x.toFixed(2)} ${etq}\n${etqY}: ${tr(w.y[i]).toFixed(3)}` })
      })
      return { id: w.Pocillo, nombre: w.ReplicaNombre, color: est?.color || '#555', dash: est?.linea || 'solid', puntos: true, data }
    })
    // puntos excluidos (x rojas), solo sin normalización
    const extras = []
    if (aj.mostrar_excluidos && aj.normalizar === 'ninguna') {
      const vis = new Set(wells.map((w) => w.Pocillo))
      const nom = Object.fromEntries(wells.map((w) => [w.Pocillo, w.ReplicaNombre]))
      pre.marcado.forEach((w) => {
        if (!vis.has(w.Pocillo)) return
        w.filas.forEach((f) => {
          if (!f.motivo || f.motivo === 'Aberrante (interpolado)') return
          const v = f.yAntes
          if (!ok(v)) return
          const x = f.t / div
          extras.push({ x, y: tr(v), key: clavePunto(w.Pocillo, f.t), forma: 'x',
            tip: `${nom[w.Pocillo]} (${w.Pocillo})\n${f.motivo}\n${f.detalle}\nTiempo: ${x.toFixed(2)} ${etq}\n${etqY}: ${tr(v).toFixed(3)}` })
        })
      })
      s.E.puntosExcl.forEach((k) => {
        const [p, tt] = k.split('|')
        if (!vis.has(p)) return
        const t = Number(tt)
        const i = s.datos.tiempos.findIndex((x) => r3(x) === r3(t))
        if (i < 0) return
        let v = s.datos.pocillos[p][i]
        if (pre.blanco) {
          const b = pre.blanco.prom.get(r3(t))
          if (b === undefined) return
          v -= b
        }
        if (!ok(v)) return
        const x = t / div
        extras.push({ x, y: tr(v), key: k, forma: 'x',
          tip: `${nom[p]} (${p})\nExcluido manualmente. Clic para reincorporarlo.\nTiempo: ${x.toFixed(2)} ${etq}\n${etqY}: ${tr(v).toFixed(3)}` })
      })
    }
    const visY = [...series.flatMap((se) => se.data.filter((p) => enRango(p.x)).map((p) => p.y)), ...extras.filter((e) => enRango(e.x)).map((e) => e.y)]
    return { series, extras, xlim, ylim: rangoY(visY), xTxt, yTxt, titulo: 'Curvas de crecimiento - Réplicas individuales' }
  }

  // Media y Media ± error: se agrupa por muestra, tiempo a tiempo
  const conErr = aj.modo_grafico === 'sd'
  const tipo = aj.tipo_error || 'sd'
  const porMuestra = new Map()
  wells.forEach((w) => {
    if (!porMuestra.has(w.Muestra)) porMuestra.set(w.Muestra, new Map())
    const mp = porMuestra.get(w.Muestra)
    w.t.forEach((t, i) => { if (ok(w.y[i])) { if (!mp.has(t)) mp.set(t, []); mp.get(t).push(tr(w.y[i])) } })
  })
  const series = []
  const visY = []
  for (const m of s.muestrasCfg) {
    const mp = porMuestra.get(m)
    if (!mp) continue
    const ts = [...mp.keys()].sort((a, b) => a - b)
    const data = [], banda = []
    ts.forEach((t) => {
      const v = mp.get(t), n = v.length
      const mu = media(v)
      const dv = n > 1 ? desvio(v) : 0
      const err = tipo === 'sem' ? dv / Math.sqrt(n) : tipo === 'ic95' ? (n > 1 ? (tCuantil(0.975, n - 1) * dv) / Math.sqrt(n) : 0) : dv
      const x = t / div
      data.push({ x, y: mu, tip: `${m}\nTiempo: ${x.toFixed(2)} ${etq}\n${etqY} media: ${mu.toFixed(3)}${conErr ? `\n${nombreError[tipo]}: ${err.toFixed(3)}` : ''}\nn = ${n}` })
      banda.push({ x, lo: mu - err, hi: mu + err })
      if (enRango(x)) visY.push(conErr ? mu - err : mu, conErr ? mu + err : mu)
    })
    series.push({ id: m, nombre: m, color: s.colores.porMuestra[m], dash: 'solid', grosor: 2.2, puntos: true, data, banda: conErr ? banda : null })
  }
  return { series, extras: [], xlim, ylim: rangoY(visY), xTxt, yTxt,
    titulo: conErr ? `Curvas de crecimiento - Media ± ${nombreError[tipo]}` : 'Curvas de crecimiento - Media' }
}

// Estilo efectivo: si no hay título escrito se usa el automático
export const estiloConTitulo = (est, defecto) => ({ ...est, titulo: { ...est.titulo, texto: est.titulo.texto || defecto } })

// ===============================================================
// GRÁFICO
// ===============================================================
export function GraficoTab({ s }) {
  const svg = useRef()
  const [menu, abrirMenu, cerrarMenu] = useMenuContextual()
  const [dlg, setDlg] = useState(false)
  const [exp, setExp] = useState(false)
  const { aj, setAj } = s
  const o = s.opts.graf
  const setO = (k, v) => s.setOpt('graf', k, v)
  const g = useMemo(() => (s.pre && !s.pre.error ? armarGrafico(s) : { error: s.pre?.error || 'Configurá los pocillos primero.' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.pre, s.seleccion, aj, o.tmin, o.tmax, s.colores, s.muestrasCfg, s.E, s.datos])

  if (!s.datos) return <Vacio texto="Primero cargá el archivo del lector en la pestaña Archivo." />
  const blancos = s.config.filter((c) => c.EsBlanco)
  const individual = aj.modo_grafico === 'individual'
  const est = estiloConTitulo(s.estilo, g.titulo || '')

  return (
    <div className="con-lateral">
      <Panel titulo="Gráfico">
        <Campo label="Tipo de gráfico">
          <Select value={aj.modo_grafico} onChange={(v) => setAj('modo_grafico', v)}
            opciones={[['individual', 'Réplicas individuales'], ['media', 'Media'], ['sd', 'Media ± error']]} />
        </Campo>
        {aj.modo_grafico !== 'individual' && (
          <Campo label="Barras de error">
            <Select value={aj.tipo_error} onChange={(v) => setAj('tipo_error', v)} opciones={[['sd', 'SD'], ['sem', 'SEM'], ['ic95', 'IC 95%']]} />
          </Campo>
        )}
        <Campo label="Unidad de tiempo">
          <div className="seg">
            {[['s', 'Segundos'], ['min', 'Minutos'], ['h', 'Horas']].map(([v, t]) => (
              <button key={v} className={aj.unidad_tiempo === v ? 'on' : ''} onClick={() => { setAj('unidad_tiempo', v); s.setOpt('graf', 'tmin', ''); s.setOpt('graf', 'tmax', '') }}>{t}</button>
            ))}
          </div>
        </Campo>
        <div className="fila-ctrl">
          <Campo label={`Desde (${aj.unidad_tiempo})`}><Num value={o.tmin} min={0} step={0.5} onChange={(v) => setO('tmin', v)} /></Campo>
          <Campo label={`Hasta (${aj.unidad_tiempo})`}><Num value={o.tmax} min={0} step={0.5} onChange={(v) => setO('tmax', v)} /></Campo>
        </div>
        <button className="chico" onClick={() => { setO('tmin', ''); setO('tmax', '') }}>Mostrar todo el rango</button>
        <Campo label="Escala del eje Y">
          <div className="seg">
            <button className={aj.escala_y === 'lineal' ? 'on' : ''} onClick={() => setAj('escala_y', 'lineal')}>OD (lineal)</button>
            <button className={aj.escala_y === 'ln' ? 'on' : ''} onClick={() => setAj('escala_y', 'ln')}>ln(OD)</button>
          </div>
        </Campo>
        <Check label="Mostrar puntos excluidos (x roja)" checked={aj.mostrar_excluidos} onChange={(v) => setAj('mostrar_excluidos', v)} />
        <Check label="Clic en un punto = excluirlo / reincorporarlo (réplicas individuales)" checked={o.click} onChange={(v) => setO('click', v)} />

        <h3>Blanco</h3>
        <Check label="Corregir al blanco" checked={aj.corregir_blanco} onChange={(v) => setAj('corregir_blanco', v)} />
        {aj.corregir_blanco && (
          <Campo label="Método de blanco">
            <Select value={aj.blanco_metodo} onChange={(v) => setAj('blanco_metodo', v)}
              opciones={[['tiempo', 'Promedio, tiempo a tiempo'], ['const_media', 'Constante: media de todo el blanco'], ['const_min', 'Constante: mínimo del blanco']]} />
          </Campo>
        )}
        <p className="ayuda">{blancos.length
          ? `Pocillos de blanco: ${blancos.map((b) => b.Pocillo).join(', ')}.`
          : "No hay pocillos definidos como blanco (se definen al configurar cada pocillo, con la casilla «Definir como blanco»)."}</p>
        {aj.corregir_blanco && blancos.length > 0 && (
          <>
            <label style={{ fontWeight: 600 }}>Réplicas del blanco usadas en el promedio</label>
            {blancos.map((b) => {
              const usados = s.blancosSel || blancos.map((x) => x.Pocillo)
              return (
                <label key={b.Pocillo} className="check">
                  <input type="checkbox" checked={usados.includes(b.Pocillo)}
                    onChange={() => s.setBlancosSel(usados.includes(b.Pocillo) ? usados.filter((x) => x !== b.Pocillo) : [...usados, b.Pocillo])} />
                  <span>{nombreReplica(b.Muestra, b.Replica)} ({b.Pocillo})</span>
                </label>
              )
            })}
          </>
        )}
        <h3>Muestras</h3>
        <SelectorMuestras s={s} />
      </Panel>
      <div className="principal">
        {g.error ? <Vacio texto={g.error} /> : (
          <>
            <LineChart ref={svg} series={g.series} extras={g.extras} xlim={g.xlim} ylim={g.ylim} est={est} ejes={s.ejes}
              xTxt={g.xTxt} yTxt={g.yTxt} altoBase={440}
              onPuntoClick={individual && o.click ? s.alternarPunto : undefined}
              onBrush={o.click && individual ? undefined : (a, b) => { setO('tmin', Number(a.toFixed(3))); setO('tmax', Number(b.toFixed(3))) }}
              onContext={abrirMenu} />
            <div className="fila-ctrl">
              <button className="primario" onClick={() => setExp(true)}>Descargar imagen…</button>
              <span className="ayuda">
                {o.click && individual ? 'Clic en un punto para excluirlo o reincorporarlo. ' : 'Arrastrá sobre el gráfico para hacer zoom. '}
                Clic derecho: estilo de textos y ejes.
              </span>
            </div>
          </>
        )}
      </div>
      <MenuContextual menu={menu} items={[
        ['Estilo de texto y ejes…', () => { cerrarMenu(); setDlg(true) }],
        ['Restablecer estilo y ejes', () => { cerrarMenu(); s.setEstilo(estiloCurvaDefecto()); s.setEjes(ejesDefecto()) }],
      ]} />
      {dlg && (
        <EstiloCurvaDialog estilo={s.estilo} ejes={s.ejes} xDefecto={g.xTxt || ''} yDefecto={g.yTxt || ''} onClose={() => setDlg(false)}
          onGuardar={(e, ej) => { s.setEstilo(e); s.setEjes(ej); setDlg(false) }} />
      )}
      {exp && svg.current && !g.error && (
        <ExportDialog nombre="curvas_crecimiento" size0={tamDe(svg.current)} onClose={() => setExp(false)}
          render={(ref, tam) => <LineChart ref={ref} series={g.series} extras={g.extras} xlim={g.xlim} ylim={g.ylim} est={est} ejes={s.ejes}
            xTxt={g.xTxt} yTxt={g.yTxt} tam={tam} onContext={(e) => e.preventDefault()} />} />
      )}
    </div>
  )
}
