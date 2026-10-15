import { ACEPTA_LIBRO } from '../libro.js'
import { useMemo, useRef, useState } from 'react'
import { LineChart } from './charts.jsx'
import { Campo, Modal, Num, Panel, Select } from './ui.jsx'
import { PlacaTab, Vacio } from './placa.jsx'
import { TablaAvanzada } from './tabla.jsx'
import { estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { signif } from '../ayuda.js'
import { finito } from '../motor/analisis.js'
import { hojasDe, LETRAS, leerCrudo } from '../motor/lectura.js'
import { claveT, coloniasEsperadas, contable, crecimientoUfc, estimarUfc, leerPlantillaUfc, leerTablaConteos, textoEstado } from '../motor/ufc.js'
import { nuevoId } from '../experimento.js'
import { descargarBlob, fmt } from '../utils.js'
import { excelMatriz } from '../excel.js'

const sci = (x) => (finito(x) ? x.toExponential(1).replace('e+', 'E+').replace('e-', 'E-') : '–')
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

const fondoCelda = (n, par) => {
  if (!finito(n)) return undefined
  if (contable(n, par)) return '#e3f1dc'
  if (n > par.max) return '#f8d9d6'
  if (n === 0) return '#efece6'
  return '#fbf0cf'
}

// ---------------------------------------------------------------
// Grilla de conteos de un tiempo
// ---------------------------------------------------------------
function GrillaConteos({ s, t }) {
  const { ufc, stock, ufcRes } = s
  const par = ufc.par
  const k = claveT(t)
  const cont = ufc.conteos[k] || {}
  const de = Object.fromEntries(ufc.layout.map((c) => [c.Pocillo, c.Muestra]))
  const st = stock[k]
  const refs = useRef({})

  const poner = (mapa) => s.setUfc((u) => {
    const actual = { ...(u.conteos[k] || {}) }
    Object.entries(mapa).forEach(([p, v]) => { if (v === null) delete actual[p]; else actual[p] = v })
    return { ...u, conteos: { ...u.conteos, [k]: actual } }
  })
  const enfocar = (f, c) => { const el = refs.current[LETRAS[f] + c]; if (el) { el.focus(); el.select() } }
  const tecla = (e, f, c) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); enfocar(Math.min(f + 1, 7), c) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); enfocar(Math.max(f - 1, 0), c) }
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) { e.preventDefault(); enfocar(f, Math.min(c + 1, 12)) }
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) { e.preventDefault(); enfocar(f, Math.max(c - 1, 1)) }
  }
  // pegar un bloque copiado de Excel a partir de la celda elegida
  const pegar = (e, f, c) => {
    const txt = e.clipboardData.getData('text')
    if (!/[\t\n]/.test(txt.trim())) return
    e.preventDefault()
    const mapa = {}
    txt.trim().split(/\r?\n/).forEach((fila, i) => fila.split('\t').forEach((v, j) => {
      const ff = f + i, cc = c + j
      if (ff > 7 || cc > 12) return
      const p = LETRAS[ff] + cc
      if (!de[p]) return
      const n = Number(String(v).trim().replace(',', '.'))
      if (String(v).trim() === '') mapa[p] = null
      else if (Number.isFinite(n) && n >= 0) mapa[p] = n
    }))
    poner(mapa)
  }

  const repDe = (L) => s.ufcRes.reps.find((r) => r.Fila === L && r.T_h === t)
  const muestraDe = (L) => ufc.layout.find((c) => c.Pocillo[0] === L)?.Muestra

  return (
    <div className="placa-wrap">
      <table className="grilla-ufc">
        <thead>
          <tr>
            <th />
            <th className="cab-fila">Muestra</th>
            {COLS.map((c) => (
              <th key={c} title={`Dilución ${par.factor}^${c}`}>
                <b>−{c}</b>
                <small>{sci(st / par.factor ** c)}</small>
              </th>
            ))}
            <th className="cab-fila">UFC/mL</th>
          </tr>
        </thead>
        <tbody>
          {LETRAS.map((L, f) => {
            const r = repDe(L)
            const muestra = muestraDe(L)
            const color = muestra ? s.coloresGlobal[muestra] : null
            return (
              <tr key={L}>
                <th>{L}</th>
                <td className="nombre-fila">{muestra ? <><i className="punto-color" style={{ background: color }} />{muestra}</> : <span className="ayuda">sin muestra</span>}</td>
                {COLS.map((c) => {
                  const p = L + c
                  const n = cont[p]
                  const activo = !!de[p]
                  return (
                    <td key={p} style={{ background: fondoCelda(n, par) }}>
                      <input ref={(el) => { refs.current[p] = el }} type="number" min="0" step="1" disabled={!activo}
                        value={finito(n) ? n : ''} placeholder={finito(st) ? String(Number(coloniasEsperadas(st, c, par).toPrecision(2))) : ''}
                        title={activo ? `${p} · ${de[p]}` : 'Definí la muestra de este pocillo en «Distribución»'}
                        onChange={(e) => { const v = e.target.value; poner({ [p]: v === '' ? null : Math.max(0, Math.round(Number(v))) }) }}
                        onKeyDown={(e) => tecla(e, f, c)} onPaste={(e) => pegar(e, f, c)} />
                    </td>
                  )
                })}
                <td className="res-fila">{r && finito(r.UFC_mL) ? sci(r.UFC_mL) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="ayuda">
        Escribí cuántas colonias salieron en la gota de cada pocillo (el número gris es lo esperado según la concentración estimada).
        <span className="leyenda-ufc"><i style={{ background: '#e3f1dc' }} /> contable ({par.min}–{par.max})</span>
        <span className="leyenda-ufc"><i style={{ background: '#fbf0cf' }} /> pocas</span>
        <span className="leyenda-ufc"><i style={{ background: '#f8d9d6' }} /> demasiadas</span>
        {' '}Se pueden pegar bloques copiados de Excel; Enter y las flechas mueven entre celdas.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------
// Distribución de muestras en la placa de diluciones
// ---------------------------------------------------------------
function Distribucion({ s }) {
  const [filas, setFilas] = useState({})
  const todas = [...new Set([...s.muestras, ...s.todasMuestras])]
  const set = (config) => s.setUfc((u) => ({ ...u, layout: config.map((c) => ({ Pocillo: c.Pocillo, Muestra: c.Muestra })) }))
  const stub = {
    datos: { pocillos: Object.fromEntries(LETRAS.flatMap((L) => COLS.map((c) => [L + c, true]))) },
    config: s.ufc.layout.map((c) => ({ ...c, Replica: 1, EsBlanco: false })),
    setConfig: (c) => set(typeof c === 'function' ? c(s.ufc.layout) : c),
    muestras: s.muestras, setMuestras: s.setMuestras, avisar: s.avisar,
    colores: { porPocillo: Object.fromEntries(s.ufc.layout.map((c) => [c.Pocillo, { color: s.coloresGlobal[c.Muestra] || '#999' }])) },
    sinReplicas: true, sinBlanco: true,
    tituloPlaca: 'Placa de diluciones: muestras',
    ayudaPlaca: 'Hacé clic en un pocillo, o clic y arrastrá para seleccionar varios, y elegí la muestra. Cada FILA es una réplica de la muestra y cada COLUMNA una dilución. Para asignar filas enteras podés usar el atajo de abajo.',
  }
  const aplicar = () => {
    const nuevos = []
    LETRAS.forEach((L) => { const m = filas[L]; if (m) COLS.forEach((c) => nuevos.push({ Pocillo: L + c, Muestra: m })) })
    if (!nuevos.length) return s.avisar('Elegí al menos una muestra para alguna fila.', 'error')
    const nuevas = [...new Set(nuevos.map((x) => x.Muestra))].filter((m) => !s.muestras.includes(m))
    if (nuevas.length) s.setMuestras([...s.muestras, ...nuevas])
    const filasDef = new Set(Object.keys(filas).filter((L) => filas[L]))
    s.setUfc((u) => ({ ...u, layout: [...u.layout.filter((c) => !filasDef.has(c.Pocillo[0])), ...nuevos] }))
    s.avisar('Muestras asignadas por fila.')
  }
  return (
    <>
      <section className="tarjeta" style={{ marginBottom: 14 }}>
        <h2>Atajo: una muestra por fila</h2>
        <div className="fila-ctrl">
          {LETRAS.map((L) => (
            <Campo key={L} label={`Fila ${L}`}>
              <select value={filas[L] ?? ''} onChange={(e) => setFilas({ ...filas, [L]: e.target.value })}>
                <option value="">(sin cambio)</option>
                {todas.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Campo>
          ))}
        </div>
        <div className="fila-ctrl">
          <button className="primario" onClick={aplicar}>Aplicar a las 12 columnas de cada fila</button>
          <button onClick={() => setFilas({ A: todas[0], B: todas[1], C: todas[0], D: todas[1], E: todas[0], F: todas[1], G: todas[0], H: todas[1] })} disabled={todas.length < 2}>Alternar las dos primeras muestras</button>
          <button className="peligro" onClick={() => s.setUfc((u) => ({ ...u, layout: [] }))} disabled={!s.ufc.layout.length}>Vaciar la placa</button>
        </div>
      </section>
      <PlacaTab s={stub} />
    </>
  )
}

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
  const todas = [...new Set([...s.muestras, ...s.todasMuestras])]
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
                    <td><b>{finito(e.ufc) ? sci(e.ufc) : e.estado === 'cero' ? `< ${sci(e.lim)}` : ''}</b></td>
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
          <p className="ayuda" style={{ marginTop: 0 }}>Copiá en Excel las columnas <b>Muestra · Réplica · Tiempo (h) · Sin diluir · −1 · −2 …</b> (sin encabezados) y pegalas acá.</p>
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
    Muestra: r.Muestra, T_h: r.T_h, Replicas_con_conteos: r.Con_conteos, Replicas_validas: r.N,
    UFC_mL: finito(r.UFC_mL) ? signif(r.UFC_mL, 4) : null, IC95_inf: finito(r.IC95_inf) ? signif(r.IC95_inf, 3) : null, IC95_sup: finito(r.IC95_sup) ? signif(r.IC95_sup, 3) : null,
    log10_UFC_mL: finito(r.log10) ? signif(r.log10, 4) : null, DE_log10: finito(r.DE_log10) ? signif(r.DE_log10, 3) : null,
    Media_aritmetica: finito(r.Media_aritmetica) ? signif(r.Media_aritmetica, 4) : null, CV_pct: finito(r.CV_pct) ? signif(r.CV_pct, 3) : null,
    Estado: r.Estado || '', Limite_deteccion: finito(r.Limite) ? signif(r.Limite, 3) : null,
  })), [res])
  const filasRep = useMemo(() => reps.filter((r) => r.Conteos > 0).map((r) => ({
    Muestra: r.Muestra, T_h: r.T_h, Replica: r.Replica, Origen: r.Origen === 'tabla' ? 'Placa de Petri' : `Gotas (fila ${r.Fila})`,
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
        Muestra: m, mu_h: signif(c.mu, 4), td_min: signif(c.td_min, 4), lag_h: signif(c.lag_h, 3), R2: signif(c.r2, 3), Ventana: c.ventana,
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
      <p className="ayuda">Cada punto es la <b>media geométrica</b> de las réplicas (el error de un recuento es multiplicativo); la barra es la desviación estándar en log10. De cada réplica se usan las diluciones con colonias dentro del rango contable, ponderadas (ISO 7218). El IC 95 % de cada réplica es el de Poisson exacto (Garwood) según las colonias contadas.</p>
      <TablaAvanzada id="ufc_muestras" titulo="UFC/mL por muestra y tiempo" columnas={Object.keys(filasRes[0])} filas={filasRes} onVista={s.onVista} />
      {crec.length > 0 && <TablaAvanzada id="ufc_crecimiento" titulo="Crecimiento según los recuentos" columnas={Object.keys(crec[0])} filas={crec} onVista={s.onVista} />}
      <TablaAvanzada id="ufc_replicas" titulo="UFC/mL por réplica" columnas={Object.keys(filasRep[0] || { Muestra: 1 })} filas={filasRep} onVista={s.onVista} />
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
  const setPar = (k, v) => s.setUfc((u) => ({ ...u, par: { ...u.par, [k]: v } }))
  const ts = [...par.tiempos].sort((a, b) => a - b)
  const t = ts.includes(Number(o.t)) ? Number(o.t) : ts[0]
  const k = claveT(t)

  const agregarTiempo = () => {
    const v = window.prompt('Tiempo en horas (por ejemplo 7 o 7.5)')
    if (v === null) return
    const n = Number(String(v).replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return s.avisar('Tiempo inválido.', 'error')
    if (ts.includes(n)) return s.avisar('Ese tiempo ya existe.', 'error')
    setPar('tiempos', [...ts, n].sort((a, b) => a - b))
    setO('t', n)
  }
  const quitarTiempo = () => {
    if (ts.length < 2) return
    const n = Object.keys(ufc.conteos[k] || {}).length
    if (n && !window.confirm(`T=${t} h tiene ${n} conteos cargados. Si lo quitás se borran. ¿Continuar?`)) return
    s.setUfc((u) => { const c = { ...u.conteos }; delete c[k]; return { ...u, conteos: c, par: { ...u.par, tiempos: u.par.tiempos.filter((x) => x !== t) } } })
  }

  // Importa una planilla: distribución de muestras (celdas con texto), conteos (celdas con números) y concentración esperada
  const importar = async (file) => {
    try {
      const { hojas } = await hojasDe(file)
      const L = new Map(), cont = {}, esp = {}, tiempos = new Set()
      let ok = 0
      for (const h of hojas) {
        try {
          const r = leerPlantillaUfc(await leerCrudo(file, h))
          ok++
          r.layout.forEach((c) => { if (!L.has(c.Pocillo)) L.set(c.Pocillo, c.Muestra) })
          Object.entries(r.conteos).forEach(([kk, o2]) => { cont[kk] = { ...(cont[kk] || {}), ...o2 } })
          Object.assign(esp, r.esperado)
          r.tiempos.forEach((x) => tiempos.add(x))
        } catch { /* hoja sin bloques */ }
      }
      if (!ok) throw new Error('No encontré bloques «T=…» con la placa A..H en ninguna hoja.')
      const nuevas = [...new Set([...L.values()])].filter((m) => !s.muestras.includes(m))
      if (nuevas.length) s.setMuestras([...s.muestras, ...nuevas])
      s.setUfc((u) => ({
        ...u,
        layout: L.size ? [...L].map(([Pocillo, Muestra]) => ({ Pocillo, Muestra })) : u.layout,
        conteos: { ...u.conteos, ...Object.fromEntries(Object.entries(cont).map(([kk, v]) => [kk, { ...(u.conteos[kk] || {}), ...v }])) },
        esperado: { ...u.esperado, ...esp },
        par: { ...u.par, tiempos: [...new Set([...u.par.tiempos, ...tiempos])].sort((a, b) => a - b), esperadoDe: Object.keys(esp).length && !s.datos ? 'manual' : u.par.esperadoDe },
      }))
      const nC = Object.values(cont).reduce((n, v) => n + Object.keys(v).length, 0)
      s.avisar(`Planilla importada: ${L.size} pocillos con muestra, ${nC} conteos, ${tiempos.size} tiempos${Object.keys(esp).length ? ', concentración esperada' : ''}.`)
    } catch (e) { s.avisar(e.message, 'error') }
  }

  const exportar = async () => {
    const bloques = (conNombres) => {
      const m = []
      const de = Object.fromEntries(ufc.layout.map((c) => [c.Pocillo, c.Muestra]))
      ts.forEach((tt) => {
        const kk = claveT(tt)
        const st = s.stock[kk]
        m.push([`T=${tt}`, finito(st) ? Number(Math.log10(st).toFixed(2)) : '', ...COLS.map((c) => (finito(st) ? Math.round(st / par.factor ** c) : ''))])
        m.push(['Conc esperada', finito(st) ? st : '', ...COLS.map((c) => (finito(st) ? st / par.factor ** c : ''))])
        m.push(['', '', ...COLS.map((c) => -c)])
        LETRAS.forEach((L) => m.push(['', L, ...COLS.map((c) => {
          const p = L + c
          if (conNombres) return de[p] || ''
          const n = (ufc.conteos[kk] || {})[p]
          return finito(n) ? n : ''
        })]))
        m.push([])
      })
      return m
    }
    const b = await excelMatriz([{ nombre: 'Distribucion', matriz: bloques(true) }, { nombre: 'Conteos', matriz: bloques(false) }])
    descargarBlob(b, `recuento_ufc_${(s.a.nombre || 'experimento').replace(/[^\w-]+/g, '_')}.xlsx`)
  }

  const sub = o.sub === 'conteos' ? 'gotas' : o.sub
  return (
    <div className="con-lateral">
      <Panel titulo="Recuento de UFC">
        <p className="ayuda">Las diluciones, el volumen sembrado y el rango contable se definen en <b>Experimento</b> (primer cuadro).</p>
        <dl className="datos">
          <dt>Gotas</dt><dd>{par.vol * 1000} µL · factor {par.factor} · {par.min} a {par.max} col.</dd>
          <dt>Placas</dt><dd>{ufc.tabla.vol} µL · factor {ufc.tabla.factor} · {ufc.tabla.min} a {ufc.tabla.max} col.</dd>
        </dl>
        <button className="chico" onClick={() => s.irA('experimento')}>Cambiar parámetros</button>
        {(sub === 'gotas' || sub === 'dist') && (
          <>
            <h3>Guía de la grilla de gotas</h3>
            <Campo label="UFC/mL esperadas en el pocillo de partida a T=0"><Num value={par.c0} min={1} step={100000} onChange={(v) => setPar('c0', v === '' ? 1e6 : v)} /></Campo>
            <Campo label="Concentración esperada en cada hora">
              <Select value={par.esperadoDe} onChange={(v) => setPar('esperadoDe', v)}
                opciones={[['od', 'Según la curva de OD (c0 × OD(T)/OD(0))'], ['manual', 'La de la planilla importada']]} />
            </Campo>
            <p className="ayuda">La concentración esperada solo sirve de guía (números grises) para saber qué diluciones van a ser contables; <b>no entra en el cálculo</b>.</p>
            <h3>Planilla de Excel</h3>
            <p className="ayuda">Importá una planilla con bloques «T=0, T=1…» (muestras por pocillo, concentración esperada y, si ya los tiene, los conteos).</p>
            <div className="fila-ctrl">
              <button onClick={() => importRef.current.click()}>Importar planilla</button>
              <button onClick={exportar} disabled={!ufc.layout.length}>Exportar a Excel</button>
            </div>
            <input ref={importRef} type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { e.target.files[0] && importar(e.target.files[0]); e.target.value = '' }} />
          </>
        )}
      </Panel>
      <div className="principal">
        <div className="subtabs">
          {[['gotas', 'Gotas: conteos por hora'], ['dist', 'Gotas: distribución de muestras'], ['placas', 'Placas de Petri'], ['res', 'Resultados']].map(([id, tt]) => (
            <button key={id} className={sub === id ? 'on' : ''} onClick={() => setO('sub', id)}>{tt}</button>
          ))}
        </div>
        {sub === 'gotas' && (
          !ufc.layout.length ? (
            <Vacio texto="Para contar gotas definí primero qué muestra hay en cada pocillo de la placa de diluciones («Gotas: distribución de muestras»), o importá la planilla. Si contaste placas de Petri, usá la pestaña «Placas de Petri»." />
          ) : (
            <>
              <div className="fila-ctrl">
                {ts.map((x) => <button key={x} className={`chip-t ${x === t ? 'on' : ''}`} onClick={() => setO('t', x)}>T={x} h</button>)}
                <button className="chico" onClick={agregarTiempo}>+ Tiempo</button>
                <button className="chico peligro" onClick={quitarTiempo} disabled={ts.length < 2}>Quitar T={t}</button>
              </div>
              <p className="ayuda">Concentración esperada en el pocillo de partida a T={t} h: <b>{sci(s.stock[k])} UFC/mL</b> (log10 = {finito(s.stock[k]) ? Math.log10(s.stock[k]).toFixed(2) : '–'}) · {par.esperadoDe === 'od' && s.curvaExp ? 'estimada con la curva de OD' : 'valor cargado'}.</p>
              <GrillaConteos s={s} t={t} />
            </>
          )
        )}
        {sub === 'dist' && <Distribucion s={s} />}
        {sub === 'placas' && <TablaPlacas s={s} />}
        {sub === 'res' && <Resultados s={s} />}
      </div>
    </div>
  )
}
