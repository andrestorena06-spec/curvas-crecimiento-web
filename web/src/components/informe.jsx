import { renderToStaticMarkup } from 'react-dom/server'
import { LineChart } from './charts.jsx'
import { estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { datosExp } from './comparar.jsx'
import { signif, PARAMS } from '../ayuda.js'
import { desvio, finito, interpolar, media } from '../motor/analisis.js'
import { analizarTodos, preprocesar } from '../motor/pipeline.js'
import { calcularUfc, crecimientoUfc } from '../motor/ufc.js'
import { TEXTO_OD, resumenOdManual } from '../motor/odmanual.js'
import { MODELOS_CALIB, ajustarCalibracion } from '../motor/calibracion.js'
import { MODOS, ORIGENES_OD, ajParaExp, hayConteo, hayOd, textoAgitacion } from '../experimento.js'

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const r4 = (x, d = 4) => (finito(x) ? signif(x, d) : '')

const tabla = (cols, filas) => `<table><thead><tr>${cols.map((c) => `<th>${esc(String(c).replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>${
  filas.map((f) => `<tr>${cols.map((c) => `<td>${esc(f[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`

const TAM = { w: 900, h: 460 }

// Informe en PDF de todo lo procesado: se arma una página con gráficos y tablas y se abre el cuadro de impresión
// (en Chrome: Destino › «Guardar como PDF»).
export function abrirInforme(s, metodos = '') {
  const exps = s.exps.filter((e) => (hayOd(e) && e.datos && e.config.length) || (hayConteo(e) && calcularUfc(e.ufc).hay))
  if (!exps.length) return false
  const svgStr = (el) => renderToStaticMarkup(el)
  const fecha = new Date().toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' })
  const colorDe = (m) => s.coloresGlobal[m] || '#555'
  const est = estiloCurvaDefecto()
  est.titulo.texto = ''
  const rango = (v) => {
    const f = v.filter(finito)
    if (!f.length) return [0, 1]
    const a = Math.min(...f), b = Math.max(...f)
    const pad = (b - a) * 0.06 || 0.1
    return [a - pad, b + pad]
  }

  const secciones = exps.map((e, i) => {
    const d = datosExp(e, s.aj)
    const conOd = hayOd(e) && Object.keys(d.od).length > 0
    const rU = hayConteo(e) ? calcularUfc(e.ufc) : null
    const conUfc = !!rU && rU.hay
    const c = e.cond
    let html = `<section class="${i ? 'salto' : ''}"><h2>${esc(e.nombre)} <small>· ${esc(MODOS[e.modo].titulo)}</small></h2>
      <table class="cond"><tbody>
        ${[['Cepas y especies', e.cepas.join(', ')], ['Medio de cultivo', c.medio], ['Temperatura (°C)', c.temperatura], ['Agitación', textoAgitacion(c)], ...(hayOd(e) ? [['Equipo de OD', c.equipo], ['Longitud de onda (nm)', c.lambda], ['Origen de la OD', ORIGENES_OD[e.origenOd].titulo]] : []), ['Fecha', c.fecha], ['Notas', c.notas]]
    .filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
      </tbody></table>`

    if (conOd) {
      const ajE = ajParaExp(s.aj, e)
      const pre = preprocesar({ datos: e.datos, config: e.config, E: e.E, aj: ajE, blancosSel: e.blancosSel })
      const series = Object.entries(d.od).map(([m, cu]) => ({ id: m, nombre: m, color: colorDe(m), grosor: 2.2, data: cu.t.map((t, k) => ({ x: t, y: cu.y[k] })).filter((p) => finito(p.y)) }))
      const xs = series.flatMap((x) => x.data.map((p) => p.x))
      const [y0, y1] = rango(series.flatMap((x) => x.data.map((p) => p.y)))
      html += '<h3>Curva de crecimiento por densidad óptica</h3>'
      if (series.length) {
        html += `<div class="fig">${svgStr(<LineChart series={series} xlim={[Math.min(...xs), Math.max(...xs)]} ylim={[Math.min(0, y0), y1]} est={est} ejes={ejesDefecto()}
          xTxt="Tiempo (h)" yTxt={s.aj.corregir_blanco && e.origenOd !== 'manual' ? 'Absorbancia (corregida al blanco)' : 'Absorbancia (OD)'} tam={TAM} />)}</div>`
      }
      if (e.origenOd === 'manual') {
        const { filas: fm } = resumenOdManual(e.manual)
        const sobre = fm.filter((f) => f.estado === 'sobre_ventana' || f.estado === 'bajo_ventana')
        if (sobre.length) html += `<p class="meta">⚠ ${sobre.length} lecturas quedaron fuera de la ventana lineal (${esc(TEXTO_OD.sobre_ventana)} / ${esc(TEXTO_OD.bajo_ventana)}).</p>`
      }
      if (pre && !pre.error) {
        const res = analizarTodos(pre.proc, ajE, e.E.ventanas)
        const blancos = new Set(e.config.filter((q) => q.EsBlanco).map((q) => q.Pocillo))
        const por = {}
        res.filter((r) => !blancos.has(r.Pocillo)).forEach((r) => { (por[r.Muestra] ||= []).push(r) })
        const claves = ['mu_max', 'td_min', 'lag_h', 'K', 'auc_od']
        const filasP = Object.entries(por).map(([m, g]) => {
          const f = { Muestra: m, n: g.length }
          claves.forEach((k) => {
            const v = g.map((r) => r[k]).filter(finito)
            f[PARAMS[k]] = v.length ? r4(media(v)) : ''
            f[PARAMS[k] + ' DE'] = v.length > 1 ? r4(desvio(v), 3) : ''
          })
          return f
        })
        if (filasP.length) html += `<h3>Parámetros de crecimiento (media de las réplicas)</h3>${tabla(Object.keys(filasP[0]), filasP)}`
        const ex = [...e.E.pocillosExcl, ...pre.auto]
        if (ex.length || e.E.puntosExcl.length) html += `<p class="meta">Exclusiones: ${ex.length} pocillos completos${ex.length ? ' (' + esc(ex.join(', ')) + ')' : ''} y ${e.E.puntosExcl.length} puntos sueltos.</p>`
      }
    }

    if (conUfc) {
      const porM = {}
      rU.res.filter((r) => finito(r.log10)).forEach((r) => { (porM[r.Muestra] ||= []).push(r) })
      const series = Object.entries(porM).map(([m, rs]) => ({
        id: m, nombre: m, color: colorDe(m), puntos: true, radio: 4.5, grosor: 1.6, errores: true,
        data: rs.sort((a, b) => a.T_h - b.T_h).map((r) => ({ x: r.T_h, y: r.log10, err: r.DE_log10 })),
      }))
      html += '<h3>Recuento de UFC/mL</h3>'
      if (series.length) {
        const xs = series.flatMap((x) => x.data.map((p) => p.x))
        const [y0, y1] = rango(series.flatMap((x) => x.data.flatMap((p) => [p.y - (p.err || 0), p.y + (p.err || 0)])))
        html += `<div class="fig">${svgStr(<LineChart series={series} xlim={[Math.min(...xs) - 0.3, Math.max(...xs) + 0.3]} ylim={[y0, y1]} est={est} ejes={ejesDefecto()}
          xTxt="Tiempo (h)" yTxt="log10 UFC/mL (media geométrica ± DE)" tam={TAM} />)}</div>`
      }
      const filasRes = rU.res.filter((r) => r.Con_conteos > 0).map((r) => ({
        Muestra: r.Muestra, T_h: r.T_h, Replicas: r.N, UFC_mL: r4(r.UFC_mL), IC95_inf: r4(r.IC95_inf, 3), IC95_sup: r4(r.IC95_sup, 3), log10: r4(r.log10), DE_log10: r4(r.DE_log10, 3), Estado: r.Estado,
      }))
      html += tabla(Object.keys(filasRes[0]), filasRes)
      const cr = Object.entries(porM).map(([m, rs]) => ({ m, c: crecimientoUfc(rs) })).filter((x) => x.c && finito(x.c.mu))
        .map(({ m, c }) => ({ Muestra: m, 'μ (h⁻¹)': r4(c.mu), 'td (min)': r4(c.td_min), 'lag (h)': r4(c.lag_h, 3), R2: r4(c.r2, 3), Ventana: c.ventana, Generaciones: r4(c.generaciones, 3) }))
      if (cr.length) html += `<h3>Crecimiento según los recuentos</h3>${tabla(Object.keys(cr[0]), cr)}`
      const filasRep = rU.reps.filter((r) => r.Conteos > 0).map((r) => ({
        Muestra: r.Muestra, T_h: r.T_h, Replica: r.Replica, Origen: r.Origen === 'tabla' ? 'Placa' : r.Origen === 'petri' ? 'Sector de placa' : `Gotas ${r.Fila}`, Diluciones_usadas: r.Diluciones_usadas || '–', UFC_mL: r4(r.UFC_mL), Estado: r.Estado,
      }))
      html += `<h3 class="salto">UFC/mL por réplica</h3>${tabla(Object.keys(filasRep[0]), filasRep)}`
    }

    if (conOd && conUfc) {
      const series = []
      Object.entries(d.od).forEach(([m, cu]) => series.push({ id: 'od' + m, nombre: `${m} (OD)`, color: colorDe(m), grosor: 2, data: cu.t.map((t, k) => ({ x: t, y: cu.y[k] })).filter((p) => finito(p.y)) }))
      const mu = [...new Set(d.ufc.map((r) => r.Muestra))]
      mu.forEach((m) => series.push({ id: 'u' + m, nombre: `${m} (UFC)`, color: colorDe(m), dash: 'dotted', grosor: 1.3, puntos: true, forma: 'cuadrado', radio: 4.5, errores: true, eje: 'der',
        data: d.ufc.filter((r) => r.Muestra === m).sort((a, b) => a.T_h - b.T_h).map((r) => ({ x: r.T_h, y: r.log10, err: r.DE_log10 })) }))
      const sOd = series.filter((x) => !x.eje), sU = series.filter((x) => x.eje)
      const xs = series.flatMap((x) => x.data.map((p) => p.x))
      const yo = rango(sOd.flatMap((x) => x.data.map((p) => p.y)))
      const yu = rango(sU.flatMap((x) => x.data.flatMap((p) => [p.y - (p.err || 0), p.y + (p.err || 0)])))
      html += `<h3 class="salto">OD y UFC juntas</h3><div class="fig">${svgStr(<LineChart series={series} xlim={[Math.min(...xs) - 0.2, Math.max(...xs) + 0.2]} ylim={[Math.min(0, yo[0]), yo[1]]} ylimDer={yu} est={est} ejes={ejesDefecto()}
        xTxt="Tiempo (h)" yTxt="Absorbancia (OD)" yTxtDer="log10 UFC/mL" tam={TAM} />)}</div>
        <p class="meta">Líneas: OD (eje izquierdo). Cuadrados con barra: UFC/mL en log10 (eje derecho).</p>`
      // calibración
      const pares = []
      mu.forEach((m) => { const cu = d.od[m]; if (cu) d.ufc.filter((r) => r.Muestra === m).forEach((r) => { const od = interpolar(cu.t, cu.y, [r.T_h])[0]; if (finito(od) && od > 0) pares.push({ od, ufc: r.UFC_mL }) }) })
      const modelos = Object.keys(MODELOS_CALIB).map((k) => ({ k, c: ajustarCalibracion(pares, k) })).filter((x) => x.c.ok)
      if (modelos.length) {
        const filasC = modelos.map(({ k, c }) => ({ Modelo: MODELOS_CALIB[k], n: c.n, Ecuacion: c.ecuacion, R2_log10: r4(c.R2, 3), Error_tipico_log10: r4(c.sigma, 3) }))
        html += `<h3>Calibración OD–UFC/mL</h3>${tabla(Object.keys(filasC[0]), filasC)}`
      }
    }
    return html + '</section>'
  })

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de curvas de crecimiento</title><style>
    @page { size: A4; margin: 14mm 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #2b2118; font-size: 11px; line-height: 1.4; }
    h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 0 0 4px; border-bottom: 2px solid #d9731f; padding-bottom: 3px; } h2 small { font-weight: 400; color: #7a4a1c; }
    h3 { font-size: 13px; margin: 14px 0 4px; color: #7a4a1c; }
    .meta { color: #6b5d4f; margin: 2px 0 6px; }
    .fig { text-align: center; page-break-inside: avoid; } .fig svg { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 9.5px; }
    th, td { border: 1px solid #d8cfc2; padding: 2px 5px; text-align: left; } th { background: #f6efe3; }
    table.cond { width: auto; min-width: 50%; } table.cond th { width: 150px; }
    tr { page-break-inside: avoid; } thead { display: table-header-group; }
    .salto { page-break-before: always; }
  </style></head><body>
    <h1>Informe de curvas de crecimiento</h1>
    <p class="meta">Generado el ${esc(fecha)} · ${exps.length} ${exps.length === 1 ? 'experimento' : 'experimentos'}</p>
    <p><b>Métodos.</b> ${esc(metodos)}</p>
    ${secciones.join('')}
  </body></html>`

  // se imprime desde un marco oculto (en Chrome: Destino › Guardar como PDF)
  const marco = document.createElement('iframe')
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(marco)
  marco.contentDocument.open()
  marco.contentDocument.write(html)
  marco.contentDocument.close()
  setTimeout(() => {
    marco.contentWindow.focus()
    marco.contentWindow.print()
    setTimeout(() => marco.remove(), 60000)
  }, 400)
  return true
}
