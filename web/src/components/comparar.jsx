import { useMemo, useRef, useState } from 'react'
import { Nota } from './tip.jsx'
import { LineChart } from './charts.jsx'
import { Campo, Check, MenuContextual, Panel, Select, useMenuContextual } from './ui.jsx'
import { ExportDialog } from './exportar.jsx'
import { EstiloCurvaDialog, estiloCurvaDefecto, ejesDefecto, normalizarEjes, normalizarEstilo } from './estilo.jsx'
import { estiloConTitulo } from './grafico.jsx'
import { TablaAvanzada } from './tabla.jsx'
import { Vacio } from './placa.jsx'
import { signif } from '../ayuda.js'
import { analizarCurva, desvio, finito, interpolar, media, regLineal } from '../motor/analisis.js'
import { curvaMedia, opAnalisis, preprocesar } from '../motor/pipeline.js'
import { calcularUfc } from '../motor/ufc.js'
import { TIPOS_LINEA } from '../colores.js'
import { tCuantil } from '../utils.js'

const tamDe = (svg) => ({ w: svg.viewBox.baseVal.width, h: svg.viewBox.baseVal.height })
const ERR = { sd: 'SD', sem: 'SEM', ic95: 'IC 95%' }
const errDe = (v, tipo) => {
  const n = v.length
  if (n < 2) return NaN
  const sd = desvio(v)
  return tipo === 'sem' ? sd / Math.sqrt(n) : tipo === 'ic95' ? (tCuantil(0.975, n - 1) * sd) / Math.sqrt(n) : sd
}

// OD (curva media por muestra, ya corregida) y UFC de un experimento
export function datosExp(e, aj0) {
  const aj = e.origenOd === 'manual' ? { ...aj0, corregir_blanco: false } : aj0
  const out = { id: e.id, nombre: e.nombre, od: {}, mu: {}, ufc: [] }
  if (e.modo !== 'conteo' && e.datos && e.config.length) {
    const pre = preprocesar({ datos: e.datos, config: e.config, E: e.E, aj, blancosSel: e.blancosSel })
    if (!pre.error) {
      const por = {}
      pre.proc.filter((w) => !w.EsBlanco).forEach((w) => { (por[w.Muestra] ||= []).push(w) })
      const op = opAnalisis(aj)
      Object.entries(por).forEach(([m, ws]) => {
        const cm = curvaMedia(ws)
        const t = cm.t.map((x) => x / 3600)
        out.od[m] = { t, y: cm.y }
        out.mu[m] = analizarCurva(t, cm.y, op, e.E.ventanas['muestra:' + m] || null)
      })
    }
  }
  if (e.modo !== 'od') out.ufc = calcularUfc(e.ufc).res.filter((r) => finito(r.UFC_mL) && r.UFC_mL > 0)
  return out
}

// μ a partir de UFC: pendiente máxima de ln(UFC) contra t en ventanas de 3 tiempos consecutivos
function muUfc(rows) {
  const p = rows.filter((r) => finito(r.UFC_mL) && r.UFC_mL > 0).sort((a, b) => a.T_h - b.T_h)
  let mejor = null
  for (let i = 0; i + 2 < p.length; i++) {
    const w = p.slice(i, i + 3)
    const rg = regLineal(w.map((r) => r.T_h), w.map((r) => Math.log(r.UFC_mL)))
    if (finito(rg.b) && (!mejor || rg.b > mejor.b)) mejor = { b: rg.b, r2: rg.r2, t0: w[0].T_h, t1: w[2].T_h }
  }
  return mejor
}

// ===============================================================
// COMPARAR: curva de OD y recuento de UFC de todos los experimentos juntos
// ===============================================================
export function CompararTab({ s }) {
  const svg = useRef()
  const [menu, abrirMenu, cerrarMenu] = useMenuContextual()
  const [dlg, setDlg] = useState(false)
  const [exp, setExp] = useState(false)
  const o = s.opts.comp
  const setO = (k, v) => s.setOpt('comp', k, v)
  const todos = useMemo(() => s.exps.map((e) => datosExp(e, s.aj)), [s.exps, s.aj])
  const conDatos = todos.filter((d) => Object.keys(d.od).length || d.ufc.length)
  const incl = conDatos.filter((d) => !o.exps || o.exps.includes(d.id))
  const muestrasTodas = [...new Set([...s.todasMuestras].filter((m) => incl.some((d) => d.od[m] || d.ufc.some((r) => r.Muestra === m))))]
  const muestras = muestrasTodas.filter((m) => !o.muestras || o.muestras.includes(m))
  const est0 = normalizarEstilo(o.estilo)
  const ejes0 = normalizarEjes(o.ejes)

  const g = useMemo(() => {
    if (!incl.length || !muestras.length) return null
    const ofOn = o.od, uOn = o.ufc
    if (!ofOn && !uOn) return null
    const dos = ofOn && uOn
    const lin = o.escala === 'lineal'
    const series = []
    // escala de las UFC en lineal: se divide por una potencia de 10
    const maxU = Math.max(1, ...incl.flatMap((d) => d.ufc.filter((r) => muestras.includes(r.Muestra)).map((r) => r.UFC_mL + (finito(r.DE) ? r.DE : 0))))
    const pot = lin ? Math.floor(Math.log10(maxU)) : 0
    const fU = (u) => (lin ? u / 10 ** pot : Math.log10(u))
    const eje = dos ? 'der' : undefined
    const colorDe = (m) => s.coloresGlobal[m] || '#555'
    const unico = incl.length === 1

    if (o.modo === 'por_exp') {
      incl.forEach((d, ei) => {
        muestras.forEach((m) => {
          const nom = unico ? m : `${m} · ${d.nombre}`
          if (ofOn && d.od[m]) {
            series.push({ id: `od|${d.id}|${m}`, nombre: `${nom} (OD)`, color: colorDe(m), dash: TIPOS_LINEA[ei % TIPOS_LINEA.length], grosor: 2,
              data: d.od[m].t.map((t, i) => ({ x: t, y: d.od[m].y[i], tip: `${nom} · OD\nT = ${t.toFixed(2)} h\nOD = ${d.od[m].y[i].toFixed(3)}` })).filter((p) => finito(p.y)) })
          }
          const rs = d.ufc.filter((r) => r.Muestra === m).sort((a, b) => a.T_h - b.T_h)
          if (uOn && rs.length) {
            series.push({ id: `ufc|${d.id}|${m}`, nombre: `${nom} (UFC)`, color: colorDe(m), dash: 'dotted', grosor: 1.3, puntos: true, forma: 'cuadrado', radio: 4.5, errores: true, eje,
              data: rs.map((r) => ({ x: r.T_h, y: fU(r.UFC_mL), err: lin ? r.DE / 10 ** pot : r.DE_log10,
                tip: `${nom} · UFC\nT = ${r.T_h} h\nUFC/mL = ${r.UFC_mL.toExponential(2)}\nlog10 = ${Math.log10(r.UFC_mL).toFixed(2)}${finito(r.DE_log10) ? ` ± ${r.DE_log10.toFixed(2)}` : ''}\n${r.N} réplicas` })) })
          }
        })
      })
    } else {
      // promedio entre experimentos (cada experimento aporta un valor por tiempo)
      muestras.forEach((m) => {
        if (ofOn) {
          const mapa = new Map()
          incl.forEach((d) => { const c = d.od[m]; if (c) c.t.forEach((t, i) => { if (!finito(c.y[i])) return; const k = Math.round(t * 60); if (!mapa.has(k)) mapa.set(k, { t: 0, v: [] }); const q = mapa.get(k); q.t += t; q.v.push(c.y[i]) }) })
          const pts = [...mapa.values()].map((q) => ({ x: q.t / q.v.length, y: media(q.v), e: errDe(q.v, o.error), n: q.v.length })).sort((a, b) => a.x - b.x)
          if (pts.length) {
            const nmax = Math.max(...pts.map((p) => p.n))
            series.push({ id: `od|${m}`, nombre: `${m} (OD${nmax > 1 ? `, media de ${nmax} exp.` : ''})`, color: colorDe(m), grosor: 2.2,
              banda: nmax > 1 ? pts.filter((p) => finito(p.e)).map((p) => ({ x: p.x, lo: p.y - p.e, hi: p.y + p.e })) : null,
              data: pts.map((p) => ({ x: p.x, y: p.y, tip: `${m} · OD\nT = ${p.x.toFixed(2)} h\nOD = ${p.y.toFixed(3)}${finito(p.e) ? ` ± ${p.e.toFixed(3)} (${ERR[o.error]})` : ''}\nn = ${p.n} exp.` })) })
          }
        }
        if (uOn) {
          const mapa = new Map()
          incl.forEach((d) => d.ufc.filter((r) => r.Muestra === m).forEach((r) => { if (!mapa.has(r.T_h)) mapa.set(r.T_h, []); mapa.get(r.T_h).push(r) }))
          const pts = [...mapa].map(([t, rs]) => {
            const v = rs.map((r) => (lin ? r.UFC_mL : r.log10))
            const e = rs.length > 1 ? errDe(v, o.error) : lin ? rs[0].DE : rs[0].DE_log10
            const y = media(v)
            return { x: t, y: lin ? y / 10 ** pot : y, e: lin ? e / 10 ** pot : e, n: rs.length, u: lin ? y : 10 ** y }
          }).sort((a, b) => a.x - b.x)
          if (pts.length) {
            series.push({ id: `ufc|${m}`, nombre: `${m} (UFC)`, color: colorDe(m), dash: 'dotted', grosor: 1.3, puntos: true, forma: 'cuadrado', radio: 4.5, errores: true, eje,
              data: pts.map((p) => ({ x: p.x, y: p.y, err: p.e, tip: `${m} · UFC\nT = ${p.x} h\nUFC/mL = ${p.u.toExponential(2)}${finito(p.e) ? `\nerror (${p.n > 1 ? ERR[o.error] + ' entre exp.' : 'DE entre réplicas'}) = ${p.e.toFixed(2)}` : ''}\nn = ${p.n} exp.` })) })
          }
        }
      })
    }
    if (!series.length) return null
    const rango = (ss, conErr) => {
      const v = ss.flatMap((x) => [...x.data.flatMap((p) => (conErr ? [p.y - (p.err || 0), p.y + (p.err || 0)] : [p.y])), ...(x.banda || []).flatMap((b) => [b.lo, b.hi])]).filter(finito)
      if (!v.length) return [0, 1]
      const a = Math.min(...v), b = Math.max(...v)
      const pad = (b - a) * 0.06 || 0.1
      return [a - pad, b + pad]
    }
    const sOd = series.filter((x) => !x.eje && !x.forma), sU = series.filter((x) => x.forma)
    const todosX = series.flatMap((x) => x.data.map((p) => p.x))
    const x0 = Math.min(...todosX), x1 = Math.max(...todosX)
    const px = (x1 - x0) * 0.02 || 0.2
    let ylim, ylimDer
    if (dos) { ylim = rango(sOd, false); ylim = [Math.min(0, ylim[0]), ylim[1]]; ylimDer = rango(sU, true) }
    else if (ofOn) { ylim = rango(sOd, false); ylim = [Math.min(0, ylim[0]), ylim[1]] }
    else ylim = rango(sU, true)
    const yUfc = lin ? `UFC/mL${pot ? ` (×10^${pot})` : ''}` : 'log10 UFC/mL'
    return { series, xlim: [x0 - px, x1 + px], ylim, ylimDer,
      yTxt: ofOn ? (s.aj.corregir_blanco ? 'Absorbancia (corregida al blanco)' : 'Absorbancia (OD)') : yUfc, yTxtDer: dos ? yUfc : undefined,
      titulo: o.modo === 'por_exp' ? 'Curvas de crecimiento: OD y recuento de UFC' : 'Curvas de crecimiento: promedio de los experimentos' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, o.exps, o.muestras, o.modo, o.od, o.ufc, o.escala, o.error, s.coloresGlobal, s.todasMuestras])

  // OD ↔ UFC en los mismos tiempos y crecimiento según cada método
  const tablas = useMemo(() => {
    const rel = [], cre = []
    incl.forEach((d) => {
      muestras.forEach((m) => {
        const rs = d.ufc.filter((r) => r.Muestra === m)
        const c = d.od[m]
        rs.forEach((r) => {
          const od = c ? interpolar(c.t, c.y, [r.T_h])[0] : NaN
          rel.push({ Experimento: d.nombre, Muestra: m, T_h: r.T_h, OD: finito(od) ? signif(od, 4) : null, UFC_mL: signif(r.UFC_mL, 4), log10_UFC_mL: signif(Math.log10(r.UFC_mL), 4), _od: od, _lg: Math.log10(r.UFC_mL) })
        })
        const mu = muUfc(rs)
        const r2 = d.mu[m]
        if (mu || (r2 && finito(r2.mu_max))) {
          cre.push({
            Experimento: d.nombre, Muestra: m,
            mu_UFC_h: mu ? signif(mu.b, 4) : null, td_UFC_min: mu && mu.b > 0 ? signif((Math.log(2) / mu.b) * 60, 4) : null,
            R2_UFC: mu && finito(mu.r2) ? signif(mu.r2, 4) : null, ventana_UFC_h: mu ? `${mu.t0} a ${mu.t1}` : '',
            mu_OD_h: r2 && finito(r2.mu_max) ? signif(r2.mu_max, 4) : null, td_OD_min: r2 && finito(r2.td_min) ? signif(r2.td_min, 4) : null,
            cociente_UFC_sobre_OD: mu && r2 && finito(r2.mu_max) && r2.mu_max > 0 ? signif(mu.b / r2.mu_max, 3) : null,
          })
        }
      })
    })
    const reg = muestras.map((m) => {
      const p = rel.filter((r) => r.Muestra === m && finito(r._od) && r._od > 0)
      if (p.length < 3) return null
      const rg = regLineal(p.map((r) => Math.log(r._od)), p.map((r) => r._lg))
      return { Muestra: m, n: p.length, pendiente: signif(rg.b, 4), intercepto: signif(rg.a, 4), R2: finito(rg.r2) ? signif(rg.r2, 4) : null }
    }).filter(Boolean)
    return { rel: rel.map(({ _od, _lg, ...r }) => r), cre, reg }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, o.exps, o.muestras])

  if (!s.exps.length) return <Vacio texto="Cargá al menos un experimento (Excel de OD y/o recuento de UFC) para compararlos." />
  const est = estiloConTitulo(est0, g?.titulo || '')
  const alternar = (campo, lista, id, todasIds) => {
    const act = o[campo] || todasIds
    setO(campo, act.includes(id) ? act.filter((x) => x !== id) : todasIds.filter((x) => act.includes(x) || x === id))
  }

  return (
    <div className="con-lateral">
      <Panel titulo="Comparar">
        <p className="ayuda"><Nota titulo="Ayuda">Junta la curva de OD y el recuento de UFC de los experimentos que elijas. Las muestras se emparejan por nombre.</Nota></p>
        <Campo label="Cómo juntar los experimentos">
          <Select value={o.modo} onChange={(v) => setO('modo', v)} opciones={[['por_exp', 'Cada experimento por separado'], ['promedio', 'Promedio de los experimentos']]} />
        </Campo>
        {o.modo === 'promedio' && (
          <Campo label="Error entre experimentos">
            <Select value={o.error} onChange={(v) => setO('error', v)} opciones={[['sd', 'SD'], ['sem', 'SEM'], ['ic95', 'IC 95%']]} />
          </Campo>
        )}
        <Check label="Mostrar la curva de OD (eje izquierdo)" checked={o.od} onChange={(v) => setO('od', v)} />
        <Check label="Mostrar el recuento de UFC (cuadrados, eje derecho)" checked={o.ufc} onChange={(v) => setO('ufc', v)} />
        <Campo label="Escala de las UFC">
          <div className="seg">
            <button className={o.escala === 'log10' ? 'on' : ''} onClick={() => setO('escala', 'log10')}>log10</button>
            <button className={o.escala === 'lineal' ? 'on' : ''} onClick={() => setO('escala', 'lineal')}>Lineal</button>
          </div>
        </Campo>
        <h3>Experimentos</h3>
        <div className="fila-ctrl">
          <button className="chico" onClick={() => setO('exps', null)}>Todos</button>
          <button className="chico" onClick={() => setO('exps', [])}>Ninguno</button>
        </div>
        <div className="lista-checks">
          {conDatos.map((d) => (
            <label key={d.id} className="check"><input type="checkbox" checked={!o.exps || o.exps.includes(d.id)} onChange={() => alternar('exps', o.exps, d.id, conDatos.map((x) => x.id))} />
              <span>{d.nombre}<small>{Object.keys(d.od).length ? ' · OD' : ''}{d.ufc.length ? ' · UFC' : ''}</small></span></label>
          ))}
          {!conDatos.length && <span className="ayuda">Ningún experimento tiene OD configurada ni conteos de UFC.</span>}
        </div>
        <h3>Muestras</h3>
        <div className="fila-ctrl">
          <button className="chico" onClick={() => setO('muestras', null)}>Todas</button>
          <button className="chico" onClick={() => setO('muestras', [])}>Ninguna</button>
        </div>
        <div className="lista-checks">
          {muestrasTodas.map((m) => (
            <label key={m} className="check"><input type="checkbox" checked={!o.muestras || o.muestras.includes(m)} onChange={() => alternar('muestras', o.muestras, m, muestrasTodas)} />
              <span><i className="punto-color" style={{ background: s.coloresGlobal[m] }} />{m}</span></label>
          ))}
        </div>
      </Panel>
      <div className="principal">
        {!g ? <Vacio texto="Elegí al menos un experimento, una muestra y qué mostrar (OD y/o UFC). Para ver las UFC hay que cargar conteos en «Recuento UFC»." /> : (
          <>
            <LineChart ref={svg} series={g.series} xlim={g.xlim} ylim={g.ylim} ylimDer={g.ylimDer} est={est} ejes={ejes0}
              xTxt="Tiempo (h)" yTxt={g.yTxt} yTxtDer={g.yTxtDer} altoBase={440} onContext={abrirMenu} />
            <div className="fila-ctrl">
              <button className="primario" onClick={() => setExp(true)}>Descargar imagen…</button>
              <span className="ayuda">Líneas: OD. Cuadrados con barra de error: UFC. Clic derecho sobre el gráfico: estilo de textos y ejes.</span>
            </div>
          </>
        )}
        {tablas.cre.length > 0 && (
          <TablaAvanzada id="crecimiento_ufc_od" titulo="Crecimiento según UFC y según OD" columnas={Object.keys(tablas.cre[0])} filas={tablas.cre} onVista={s.onVista} />
        )}
        {tablas.rel.length > 0 && (
          <>
            <TablaAvanzada id="relacion_od_ufc" titulo="OD y UFC en los mismos tiempos" columnas={Object.keys(tablas.rel[0])} filas={tablas.rel} onVista={s.onVista} />
            {tablas.reg.length > 0 && <TablaAvanzada id="regresion_od_ufc" titulo="Regresión: log10(UFC/mL) = intercepto + pendiente × ln(OD)" columnas={Object.keys(tablas.reg[0])} filas={tablas.reg} onVista={s.onVista} />}
            <p className="ayuda"><Nota titulo="Ayuda">Si la OD y las UFC crecieran en proporción, la pendiente de log10(UFC/mL) frente a ln(OD) sería 1/ln(10) = 0,434. Un valor muy distinto indica que la OD deja de seguir a las células viables (por ejemplo por células muertas o fuera del rango lineal del lector).</Nota></p>
          </>
        )}
      </div>
      <MenuContextual menu={menu} items={[
        ['Estilo de texto y ejes…', () => { cerrarMenu(); setDlg(true) }],
        ['Restablecer estilo y ejes', () => { cerrarMenu(); setO('estilo', estiloCurvaDefecto()); setO('ejes', ejesDefecto()) }],
      ]} />
      {dlg && g && (
        <EstiloCurvaDialog estilo={est0} ejes={ejes0} xDefecto="Tiempo (h)" yDefecto={g.yTxt} onClose={() => setDlg(false)}
          onGuardar={(e, ej) => { setO('estilo', e); setO('ejes', ej); setDlg(false) }} />
      )}
      {exp && svg.current && g && (
        <ExportDialog nombre="comparacion_od_ufc" size0={tamDe(svg.current)} onClose={() => setExp(false)}
          render={(ref, tam) => <LineChart ref={ref} series={g.series} xlim={g.xlim} ylim={g.ylim} ylimDer={g.ylimDer} est={est} ejes={ejes0}
            xTxt="Tiempo (h)" yTxt={g.yTxt} yTxtDer={g.yTxtDer} tam={tam} onContext={(e) => e.preventDefault()} />} />
      )}
    </div>
  )
}
