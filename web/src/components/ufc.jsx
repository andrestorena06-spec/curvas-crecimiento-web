import { ACEPTA_LIBRO } from '../libro.js'
import { useMemo, useRef, useState } from 'react'
import { LineChart } from './charts.jsx'
import { Campo, Modal, Num, Select } from './ui.jsx'
import { Vacio } from './placa.jsx'
import { ConteosGota } from './gota.jsx'
import { TablaAvanzada } from './tabla.jsx'
import { estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { signif } from '../ayuda.js'
import { finito } from '../motor/analisis.js'
import { hojasDe, LETRAS, leerCrudo } from '../motor/lectura.js'
import { crecimientoUfc, estimarUfc, leerPlantillaUfc, leerTablaConteos, lineasPetri, placasDeGrilla, textoEstado } from '../motor/ufc.js'
import { nuevoId } from '../experimento.js'
import { PetriDiseno } from './petri.jsx'
import { Nota } from './tip.jsx'
import { dGeo, dMuUfc, dUfc } from '../calculos.js'
import { descargarBlob, fmt } from '../utils.js'
import { excelMatriz } from '../excel.js'

const sci = (x) => (finito(x) ? x.toExponential(1).replace('e+', 'E+').replace('e-', 'E-') : '–')
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

// ---------------------------------------------------------------
// Placas de Petri: una fila por muestra, tiempo y réplica; una columna por dilución
// ---------------------------------------------------------------
const num = (v) => {
  const t = String(v ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const etqK = (k) => (k === 0 ? 'Sin diluir' : `−${k}`)

function TablaPlacas({ s }) {
  const tb = s.ufc.tabla
  const [serie, setSerie] = useState({ muestra: '', reps: 2, tiempos: '0, 1, 2, 3, 4, 5, 6' })
  const [pegar, setPegar] = useState(null)
  const importRef = useRef()
  const refs = useRef({})
  const todas = [...new Set([...s.opcionesMuestra])]
  const ks = Array.from({ length: tb.nd }, (_, k) => k)
  const setTb = (f) => s.setUfc((u) => ({ ...u, tabla: typeof f === 'function' ? f(u.tabla) : { ...u.tabla, ...f } }))
  const nuevaFila = (extra = {}) => ({ id: nuevoId(), muestra: '', replica: 1, t: '', vol: '', c: {}, ...extra })
  const agregarMuestras = (nombres) => {
    const nuevas = [...new Set(nombres)].filter((x) => x && !s.muestras.includes(x))
    if (nuevas.length) s.setMuestras([...s.muestras, ...nuevas])
  }
  const setFila = (id, patch) => setTb((t) => ({ ...t, filas: t.filas.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  const setC = (id, k, v) => setTb((t) => ({
    ...t, filas: t.filas.map((f) => {
      if (f.id !== id) return f
      const c = { ...f.c }
      if (v === '') delete c[k]; else c[k] = Math.max(0, Math.round(Number(v)))
      return { ...f, c }
    }),
  }))
  const enfocar = (i, col) => { const el = refs.current[`${i}|${col}`]; if (el) { el.focus(); el.select?.() } }
  const tecla = (e, i, col) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); enfocar(i + 1, col) } else if (e.key === 'ArrowUp') { e.preventDefault(); enfocar(i - 1, col) } }

  const agregarSerie = () => {
    const ts = serie.tiempos.split(/[;,\s]+/).map(num).filter((v) => v !== null && v >= 0)
    const mu = serie.muestra.trim()
    if (!mu) return s.avisar('Escribí el nombre de la muestra.', 'error')
    if (!ts.length) return s.avisar('Escribí los tiempos en horas, separados por comas.', 'error')
    const reps = Math.max(1, Math.min(12, Math.round(Number(serie.reps) || 1)))
    const nuevas = []
    ts.forEach((t) => { for (let r = 1; r <= reps; r++) nuevas.push(nuevaFila({ muestra: mu, replica: r, t })) })
    agregarMuestras([mu])
    setTb((t) => ({ ...t, filas: [...t.filas, ...nuevas] }))
    s.avisar(`${nuevas.length} filas agregadas: completá las colonias contadas.`)
  }
  const aplicarPegado = () => {
    const lin = pegar.trim().split(/\r?\n/).filter((l) => l.trim())
    const nuevas = []
    lin.forEach((l) => {
      const c = l.split('\t')
      if (c.length < 4 || !c[0].trim()) return
      const t = num(c[2])
      if (t === null) return
      const cc = {}
      c.slice(3).forEach((v, k) => { const n = num(v); if (n !== null && n >= 0) cc[k] = n })
      nuevas.push(nuevaFila({ muestra: c[0].trim(), replica: Math.round(num(c[1]) || 1), t, c: cc }))
    })
    if (!nuevas.length) return s.avisar('No encontré filas válidas. Pegá columnas: Muestra, Réplica, Tiempo (h) y los conteos.', 'error')
    const nd = Math.max(tb.nd, ...lin.map((l) => l.split('\t').length - 3))
    agregarMuestras(nuevas.map((f) => f.muestra))
    setTb((t) => ({ ...t, nd: Math.min(nd, 10), filas: [...t.filas, ...nuevas] }))
    setPegar(null)
    s.avisar(`${nuevas.length} filas pegadas.`)
  }
  const importar = async (file) => {
    try {
      const { hojas } = await hojasDe(file)
      let r = null, ult = null
      for (const h of hojas) { try { r = leerTablaConteos(await leerCrudo(file, h)); break } catch (e) { ult = e } }
      if (!r) throw ult || new Error('No encontré la tabla de conteos.')
      const nuevas = r.filas.map((f) => nuevaFila({ muestra: f.muestra, replica: f.replica, t: f.t, vol: f.vol ?? '', c: f.c }))
      agregarMuestras(nuevas.map((f) => f.muestra))
      setTb((t) => ({ ...t, nd: Math.min(Math.max(t.nd, r.nd), 10), filas: [...t.filas, ...nuevas] }))
      s.avisar(`Tabla importada: ${nuevas.length} filas.`)
    } catch (e) { s.avisar(e.message, 'error') }
  }
  const plantilla = async () => {
    const cab = ['Muestra', 'Réplica', 'Tiempo (h)', 'Volumen (µL)', ...ks.map((k) => (k === 0 ? 'Sin diluir' : `-${k}`))]
    const ej = [['L100A1', 1, 0, tb.vol, ...ks.map(() => '')], ['L100A1', 2, 0, tb.vol, ...ks.map(() => '')]]
    const b = await excelMatriz([{ nombre: 'Conteos', matriz: [cab, ...ej] }])
    descargarBlob(b, 'plantilla_conteo_placas.xlsx')
  }

  const estimar = (f) => estimarUfc(f.c, { vol: (num(f.vol) || tb.vol) / 1000, factor: tb.factor, min: tb.min, max: tb.max })

  return (
    <section className="tarjeta">
      <div className="titulo-fila">
        <h2>Conteos en placas de Petri</h2>
        <div className="fila-ctrl" style={{ margin: 0 }}>
          <button onClick={plantilla}>Plantilla de Excel</button>
          <button onClick={() => importRef.current.click()}>Importar Excel</button>
          <button onClick={() => setPegar('')}>Pegar desde Excel</button>
          <button className="primario" onClick={() => setTb((t) => ({ ...t, filas: [...t.filas, nuevaFila({ muestra: t.filas.at(-1)?.muestra || '', replica: t.filas.at(-1)?.replica || 1, t: t.filas.at(-1)?.t ?? '' })] }))}>+ Fila</button>
          <input ref={importRef} type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { e.target.files[0] && importar(e.target.files[0]); e.target.value = '' }} />
        </div>
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Anotá las colonias de cada placa en la columna de su dilución. UFC/mL = colonias ÷ volumen sembrado × {tb.factor}<sup>k</sup>; con varias diluciones en el rango contable ({tb.min} a {tb.max}) se usa la media ponderada de la ISO 7218.
        El volumen sembrado ({tb.vol} µL) se cambia en «Experimento»; si una fila usó otro, escribilo en su columna «Vol. (µL)».{' '}
        <button className="chico" onClick={() => s.irA('experimento')}>Cambiar parámetros</button>
      </p>
      <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
        <Campo label="Agregar una serie: muestra">
          <input list="muestras-pl" value={serie.muestra} onChange={(e) => setSerie({ ...serie, muestra: e.target.value })} placeholder="Ej.: L100A1" />
        </Campo>
        <Campo label="Réplicas"><input type="number" min="1" max="12" style={{ width: 70 }} value={serie.reps} onChange={(e) => setSerie({ ...serie, reps: e.target.value })} /></Campo>
        <Campo label="Tiempos (h)"><input style={{ width: 220 }} value={serie.tiempos} onChange={(e) => setSerie({ ...serie, tiempos: e.target.value })} /></Campo>
        <button onClick={agregarSerie}>Crear filas</button>
        <Campo label="Columnas de dilución">
          <div className="seg">
            <button onClick={() => setTb((t) => ({ ...t, nd: Math.max(1, t.nd - 1) }))}>−</button>
            <button className="on" style={{ pointerEvents: 'none' }}>{tb.nd}</button>
            <button onClick={() => setTb((t) => ({ ...t, nd: Math.min(10, t.nd + 1) }))}>+</button>
          </div>
        </Campo>
      </div>
      <datalist id="muestras-pl">{todas.map((x) => <option key={x} value={x} />)}</datalist>
      {!tb.filas.length ? (
        <div className="vacio">Todavía no hay conteos de placas. Creá una serie (muestra, réplicas y tiempos), pegá o importá una tabla de Excel, o agregá filas una por una.</div>
      ) : (
        <div className="tabla-scroll" style={{ maxHeight: 560 }}>
          <table className="tabla tabla-od">
            <thead>
              <tr><th>#</th><th>Muestra</th><th>Réplica</th><th>Tiempo (h)</th><th>Vol. (µL)</th>{ks.map((k) => <th key={k} title={k ? `Dilución ${tb.factor}^${k}` : 'Sin diluir'}>{etqK(k)}</th>)}<th>UFC/mL</th><th>IC 95 % (Poisson)</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {tb.filas.map((f, i) => {
                const e = estimar(f)
                return (
                  <tr key={f.id}>
                    <td>{i + 1}</td>
                    <td><input ref={(el) => { refs.current[`${i}|m`] = el }} list="muestras-pl" style={{ width: 120 }} value={f.muestra} onKeyDown={(ev) => tecla(ev, i, 'm')}
                      onChange={(ev) => setFila(f.id, { muestra: ev.target.value })} onBlur={(ev) => agregarMuestras([ev.target.value.trim()])} /></td>
                    <td><input ref={(el) => { refs.current[`${i}|r`] = el }} type="number" min="1" style={{ width: 56 }} value={f.replica} onKeyDown={(ev) => tecla(ev, i, 'r')}
                      onChange={(ev) => setFila(f.id, { replica: ev.target.value === '' ? '' : Number(ev.target.value) })} /></td>
                    <td><input ref={(el) => { refs.current[`${i}|t`] = el }} type="number" step="any" style={{ width: 72 }} value={f.t} onKeyDown={(ev) => tecla(ev, i, 't')}
                      onChange={(ev) => setFila(f.id, { t: ev.target.value === '' ? '' : Number(ev.target.value) })} /></td>
                    <td><input ref={(el) => { refs.current[`${i}|v`] = el }} type="number" step="any" style={{ width: 66 }} placeholder={String(tb.vol)} value={f.vol} onKeyDown={(ev) => tecla(ev, i, 'v')}
                      onChange={(ev) => setFila(f.id, { vol: ev.target.value === '' ? '' : Number(ev.target.value) })} /></td>
                    {ks.map((k) => {
                      const n = f.c[k]
                      return (
                        <td key={k} style={{ background: finito(n) ? (n >= tb.min && n <= tb.max ? '#e3f1dc' : n > tb.max ? '#f8d9d6' : n === 0 ? '#efece6' : '#fbf0cf') : undefined }}>
                          <input ref={(el) => { refs.current[`${i}|${k}`] = el }} type="number" min="0" step="1" style={{ width: 64 }} value={n ?? ''} onKeyDown={(ev) => tecla(ev, i, k)}
                            onChange={(ev) => setC(f.id, k, ev.target.value)} onPaste={(ev) => {
                              const txt = ev.clipboardData.getData('text')
                              if (!/\t/.test(txt)) return
                              ev.preventDefault()
                              txt.trim().split('\t').forEach((v, j) => { const q = num(v); if (q !== null && k + j < tb.nd) setC(f.id, k + j, q) })
                            }} />
                        </td>
                      )
                    })}
                    <td data-tip={dUfc({ _cont: f.c, _par: { vol: (num(f.vol) || tb.vol) / 1000, factor: tb.factor, min: tb.min, max: tb.max }, _usados: e.usados, _S: e.S, _estado: e.estado, UFC_mL: e.ufc, IC95_inf: e.lo, IC95_sup: e.hi, Limite: e.lim }) || undefined} className="con-calculo"><b>{finito(e.ufc) ? sci(e.ufc) : e.estado === 'cero' ? `< ${sci(e.lim)}` : ''}</b></td>
                    <td><small>{finito(e.lo) ? `${sci(e.lo)} – ${sci(e.hi)}` : ''}</small></td>
                    <td><small>{Object.keys(f.c).length ? textoEstado(e.estado) : ''}</small></td>
                    <td><button className="chico peligro" aria-label="Quitar fila" onClick={() => setTb((t) => ({ ...t, filas: t.filas.filter((x) => x.id !== f.id) }))}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {tb.filas.length > 0 && <div className="fila-ctrl"><button className="peligro" onClick={() => { if (window.confirm('Se borran todos los conteos de placas. ¿Continuar?')) setTb((t) => ({ ...t, filas: [] })) }}>Borrar todas las filas</button></div>}
      {pegar !== null && (
        <Modal titulo="Pegar conteos desde Excel" onClose={() => setPegar(null)} ancho={640}
          pie={<><button onClick={() => setPegar(null)}>Cancelar</button><button className="primario" onClick={aplicarPegado}>Agregar filas</button></>}>
          <p className="ayuda" style={{ marginTop: 0 }}><Nota titulo="Ayuda">Copiá en Excel las columnas <b>Muestra · Réplica · Tiempo (h) · Sin diluir · −1 · −2 …</b> (sin encabezados) y pegalas acá.</Nota></p>
          <textarea autoFocus rows={10} style={{ width: '100%', fontFamily: 'monospace' }} value={pegar} onChange={(e) => setPegar(e.target.value)} />
        </Modal>
      )}
    </section>
  )
}

// ---------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------
function Resultados({ s }) {
  const { reps, res } = s.ufcRes
  const [escala, setEscala] = useState('log10')
  const filasRes = useMemo(() => res.filter((r) => r.Con_conteos > 0).map((r) => ({
    _r: r, Muestra: r.Muestra, T_h: r.T_h, Replicas_con_conteos: r.Con_conteos, Replicas_validas: r.N,
    UFC_mL: finito(r.UFC_mL) ? signif(r.UFC_mL, 4) : null, IC95_inf: finito(r.IC95_inf) ? signif(r.IC95_inf, 3) : null, IC95_sup: finito(r.IC95_sup) ? signif(r.IC95_sup, 3) : null,
    log10_UFC_mL: finito(r.log10) ? signif(r.log10, 4) : null, DE_log10: finito(r.DE_log10) ? signif(r.DE_log10, 3) : null,
    Media_aritmetica: finito(r.Media_aritmetica) ? signif(r.Media_aritmetica, 4) : null, CV_pct: finito(r.CV_pct) ? signif(r.CV_pct, 3) : null,
    Estado: r.Estado || '', Limite_deteccion: finito(r.Limite) ? signif(r.Limite, 3) : null,
  })), [res])
  const filasRep = useMemo(() => reps.filter((r) => r.Conteos > 0).map((r) => ({
    _r: r, Muestra: r.Muestra, T_h: r.T_h, Replica: r.Replica, Origen: r.Origen === 'tabla' ? 'Placa de Petri' : r.Origen === 'petri' ? 'Sector de placa' : `Gotas (fila ${r.Fila})`,
    Diluciones_usadas: r.Diluciones_usadas || '(ninguna contable)',
    UFC_mL: finito(r.UFC_mL) ? signif(r.UFC_mL, 4) : null, IC95_inf: finito(r.IC95_inf) ? signif(r.IC95_inf, 3) : null, IC95_sup: finito(r.IC95_sup) ? signif(r.IC95_sup, 3) : null,
    log10_UFC_mL: finito(r.log10) ? signif(r.log10, 4) : null, Estado: r.Estado, Limite_deteccion: finito(r.Limite) ? signif(r.Limite, 3) : null,
  })), [reps])
  const crec = useMemo(() => {
    const por = {}
    res.forEach((r) => { (por[r.Muestra] ||= []).push(r) })
    return Object.entries(por).map(([m, rs]) => {
      const c = crecimientoUfc(rs)
      if (!c) return null
      return finito(c.mu) ? {
        _c: c, Muestra: m, mu_h: signif(c.mu, 4), td_min: signif(c.td_min, 4), lag_h: signif(c.lag_h, 3), R2: signif(c.r2, 3), Ventana: c.ventana,
        log10_N0: signif(c.log10_N0, 3), Crecimiento_log10: signif(c.crecimiento_log10, 3), Generaciones: signif(c.generaciones, 3),
      } : { Muestra: m, mu_h: null, td_min: null, lag_h: null, R2: null, Ventana: c.aviso, log10_N0: null, Crecimiento_log10: null, Generaciones: null }
    }).filter(Boolean)
  }, [res])
  if (!filasRes.length) return <Vacio texto="Todavía no hay conteos cargados. Escribí las colonias en «Gotas» o en «Placas de Petri»." />
  const lin = escala === 'lineal'
  const porM = {}
  res.filter((r) => finito(r.log10)).forEach((r) => { (porM[r.Muestra] ||= []).push(r) })
  const maxU = Math.max(1, ...res.filter((r) => finito(r.UFC_mL)).map((r) => r.UFC_mL + (finito(r.DE) ? r.DE : 0)))
  const pot = lin ? Math.floor(Math.log10(maxU)) : 0
  const yf = (r) => (lin ? r.UFC_mL / 10 ** pot : r.log10)
  const ef = (r) => (lin ? r.DE / 10 ** pot : r.DE_log10)
  const series = Object.entries(porM).map(([m, rs]) => ({
    id: m, nombre: m, color: s.coloresGlobal[m] || '#555', puntos: true, radio: 4.5, grosor: 1.6, errores: true,
    data: rs.sort((a, b) => a.T_h - b.T_h).map((r) => ({ x: r.T_h, y: yf(r), err: ef(r), tip: `${m}\nT = ${r.T_h} h\nUFC/mL = ${sci(r.UFC_mL)} (media geométrica)\nlog10 = ${r.log10.toFixed(2)}${finito(r.DE_log10) ? ` ± ${r.DE_log10.toFixed(2)}` : ''}\n${r.N} ${r.N === 1 ? 'réplica válida' : 'réplicas válidas'}` })),
  }))
  const est = estiloCurvaDefecto()
  est.titulo.texto = ''
  const vals = series.flatMap((x) => x.data.flatMap((d) => [d.y - (d.err || 0), d.y + (d.err || 0)]))
  const xs = series.flatMap((x) => x.data.map((d) => d.x))
  const a = vals.length ? Math.min(...vals) : 0, b = vals.length ? Math.max(...vals) : 1
  const pad = (b - a) * 0.1 || 0.3
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  return (
    <>
      <div className="fila-ctrl">
        <div className="seg">
          <button className={escala === 'log10' ? 'on' : ''} onClick={() => setEscala('log10')}>log10</button>
          <button className={escala === 'lineal' ? 'on' : ''} onClick={() => setEscala('lineal')}>Lineal</button>
        </div>
      </div>
      {series.length > 0 && (
        <LineChart series={series} xlim={[x0 - 0.3, x1 + 0.3]} ylim={[lin ? Math.min(0, a - pad) : a - pad, b + pad]} est={est} ejes={ejesDefecto()}
          xTxt="Tiempo (h)" yTxt={lin ? `UFC/mL${pot ? ` (×10^${pot})` : ''}` : 'log10 UFC/mL (media geométrica ± DE)'} altoBase={320} />
      )}
      <p className="ayuda"><Nota titulo="Ayuda">Media geométrica ± DE (log₁₀) <Nota>Cada punto es la media geométrica de las réplicas (el error de un recuento es multiplicativo); la barra es la desviación estándar en log₁₀. De cada réplica se usan las diluciones dentro del rango contable, ponderadas (ISO 7218). Pasá el mouse por cualquier número de las tablas para ver su cálculo.</Nota></Nota></p>
      <TablaAvanzada id="ufc_muestras" titulo="UFC/mL por muestra y tiempo" columnas={Object.keys(filasRes[0]).filter((k) => k[0] !== '_')} filas={filasRes} onVista={s.onVista}
        tips={(f, c) => (['UFC_mL', 'IC95_inf', 'IC95_sup', 'log10_UFC_mL', 'DE_log10'].includes(c) ? dGeo(f._r) : null)} />
      {crec.length > 0 && <TablaAvanzada id="ufc_crecimiento" titulo="Crecimiento según los recuentos" columnas={Object.keys(crec[0]).filter((k) => k[0] !== '_')} filas={crec} onVista={s.onVista}
        tips={(f, c) => (f._c && ['mu_h', 'td_min', 'lag_h', 'R2', 'Generaciones'].includes(c) ? dMuUfc(f._c) : null)} />}
      <TablaAvanzada id="ufc_replicas" titulo="UFC/mL por réplica" columnas={Object.keys(filasRep[0] || { Muestra: 1 }).filter((k) => k[0] !== '_')} filas={filasRep} onVista={s.onVista}
        tips={(f, c) => (['UFC_mL', 'IC95_inf', 'IC95_sup', 'log10_UFC_mL', 'Diluciones_usadas', 'Estado'].includes(c) ? dUfc(f._r) : null)} />
    </>
  )
}

// ===============================================================
// RECUENTO
// ===============================================================
export function ConteoTab({ s }) {
  const importRef = useRef()
  const { ufc } = s
  const par = ufc.par
  const o = s.opts.ufc
  const setO = (k, v) => s.setOpt('ufc', k, v)

  // Importa una planilla con bloques «T=0, T=1…»: una placa por tiempo con las muestras por fila y los conteos
  const importar = async (file) => {
    try {
      const { hojas } = await hojasDe(file)
      const layout = new Map(), conteos = {}, esperado = {}
      let ok = 0
      for (const h of hojas) {
        try {
          const r = leerPlantillaUfc(await leerCrudo(file, h))
          ok++
          r.layout.forEach((c) => { if (!layout.has(c.Pocillo)) layout.set(c.Pocillo, c.Muestra) })
          Object.entries(r.conteos).forEach(([kk, o2]) => { conteos[kk] = { ...(conteos[kk] || {}), ...o2 } })
          Object.assign(esperado, r.esperado)
        } catch { /* hoja sin bloques */ }
      }
      if (!ok) throw new Error('No encontré bloques «T=…» con la placa A..H en ninguna hoja.')
      const lay = [...layout].map(([Pocillo, Muestra]) => ({ Pocillo, Muestra }))
      const placas = placasDeGrilla(lay, conteos)
      const nuevas = [...new Set(lay.map((c) => c.Muestra))].filter((m) => !s.muestras.includes(m))
      if (nuevas.length) s.setMuestras([...s.muestras, ...nuevas])
      s.setUfc((u) => ({ ...u, placasG: [...u.placasG, ...placas], esperado: { ...u.esperado, ...esperado }, par: { ...u.par, esperadoDe: Object.keys(esperado).length && !s.datos ? 'manual' : u.par.esperadoDe } }))
      s.avisar(`Planilla importada: ${placas.length} placas.`)
    } catch (e) { s.avisar(e.message, 'error') }
  }

  const exportar = async () => {
    const hojas = ufc.placasG.map((p, i) => {
      const m = [['Fila', 'Cepa', 'Tiempo (h)', 'Réplica', ...COLS.map((j) => `Pocillo ${j}`)]]
      LETRAS.forEach((L) => {
        const f = p.filas[L]
        if (f && f.muestra) m.push([L, f.muestra, f.t, f.rep, ...COLS.map((j) => (finito(p.conteos[L + j]) ? p.conteos[L + j] : ''))])
      })
      return { nombre: (p.nombre || `Placa ${i + 1}`).replace(/[\/?*[\]:]/g, '_').slice(0, 30), matriz: m }
    })
    const b = await excelMatriz(hojas.length ? hojas : [{ nombre: 'Placa', matriz: [[]] }])
    descargarBlob(b, `recuento_ufc_${(s.a.nombre || 'experimento').replace(/[^\w-]+/g, '_')}.xlsx`)
  }

  const metodo = ufc.metodo
  const SUBS = metodo === 'extendida'
    // la siembra extendida cubre toda la placa: no lleva diseño (solo se muestra si una sesión anterior tiene sectores cargados)
    ? [...(lineasPetri(ufc).length ? [['petri', 'Sectores (sesión anterior)']] : []), ['placas', 'Tabla'], ['res', 'Resultados']]
    : [['gotas', 'Conteos'], ['res', 'Resultados']]
  const sub0 = SUBS.some(([id]) => id === o.sub) ? o.sub : SUBS[0][0]
  const sub = sub0
  const p = metodo === 'extendida' ? ufc.tabla : null
  return (
    <div className="pagina">
      <div className="barra-parametros">
        <span className="chip-param" data-tip={metodo === 'extendida' ? 'Siembra extendida: se esparce un volumen sobre agar en una placa de Petri' : 'Siembra por gota: gotas de volumen fijo sobre agar, una por pocillo de la placa de diluciones'}>
          {metodo === 'extendida' ? 'Siembra extendida' : 'Siembra por gota'}
        </span>
        <span className="chip-param">{metodo === 'extendida' ? `${p.vol} µL` : `${par.vol * 1000} µL`}</span>
        <span className="chip-param" data-tip={metodo === 'extendida' ? 'Factor de dilución' : `Factor de dilución = volumen final / toma = ${par.final} / ${par.toma}`}>f = {Number((metodo === 'extendida' ? p.factor : par.factor).toPrecision(4))}</span>
        <span className="chip-param" data-tip="Colonias por placa (o gota) que se consideran contables">contable {metodo === 'extendida' ? `${p.min}–${p.max}` : `${par.min}–${par.max}`}</span>
        <button className="chico" onClick={() => s.irA('experimento')}>Editar en Experimento</button>
        {metodo === 'gota' && (
          <span className="chip-acciones">
            <button className="chico" onClick={() => importRef.current.click()}>Importar planilla</button>
            <button className="chico" onClick={exportar} disabled={!ufc.placasG.length}>Exportar a Excel</button>
            <input ref={importRef} type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { e.target.files[0] && importar(e.target.files[0]); e.target.value = '' }} />
          </span>
        )}
      </div>
      <div className="subtabs">
        {SUBS.map(([id, tt]) => (
          <button key={id} className={sub === id ? 'on' : ''} onClick={() => setO('sub', id)}>{tt}</button>
        ))}
      </div>
      {sub === 'gotas' && <ConteosGota s={s} />}
      {sub === 'petri' && <PetriDiseno s={s} />}
      {sub === 'placas' && <TablaPlacas s={s} />}
      {sub === 'res' && <Resultados s={s} />}
    </div>
  )
}
