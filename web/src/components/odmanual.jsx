import { ACEPTA_LIBRO } from '../libro.js'
import { Nota } from './tip.jsx'
import { useMemo, useRef, useState } from 'react'
import { Campo, Modal } from './ui.jsx'
import { TablaAvanzada } from './tabla.jsx'
import { signif } from '../ayuda.js'
import { finito } from '../motor/analisis.js'
import { leerCrudo, hojasDe } from '../motor/lectura.js'
import { leerTablaConteos } from '../motor/ufc.js'
import { TEXTO_OD, resumenOdManual } from '../motor/odmanual.js'
import { nuevoId } from '../experimento.js'
import { dOdManual } from '../calculos.js'

const num = (v) => {
  const t = String(v ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const etqK = (k) => (k === 0 ? 'Sin diluir' : `−${k}`)
const COLOR_ESTADO = { ok: '#e3f1dc', sobre_ventana: '#f8d9d6', bajo_ventana: '#fbf0cf', od_no_positiva: '#f8d9d6' }

// ===============================================================
// OD MANUAL: lecturas de espectrofotómetro con cubeta (con diluciones si hicieron falta)
// ===============================================================
export function OdManualTab({ s }) {
  const m = s.a.manual
  const setM = (f) => s.setManual(f)
  const [serie, setSerie] = useState({ muestra: '', reps: 3, tiempos: '0, 1, 2, 3, 4, 5, 6' })
  const [pegar, setPegar] = useState(null)
  const importRef = useRef()
  const refs = useRef({})
  const { filas, res } = useMemo(() => resumenOdManual(m), [m])
  const todas = [...new Set([...s.opcionesMuestra])]
  const ks = Array.from({ length: m.nd }, (_, k) => k)

  const nuevaFila = (extra = {}) => ({ id: nuevoId(), muestra: '', replica: 1, t: '', od: {}, ...extra })
  const agregarMuestras = (nombres) => {
    const nuevas = [...new Set(nombres)].filter((x) => x && !s.muestras.includes(x))
    if (nuevas.length) s.setMuestras([...s.muestras, ...nuevas])
  }
  const setFila = (id, patch) => setM((x) => ({ ...x, filas: x.filas.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  const setOd = (id, k, v) => setM((x) => ({
    ...x, filas: x.filas.map((f) => {
      if (f.id !== id) return f
      const od = { ...f.od }
      if (v === '') delete od[k]; else od[k] = v
      return { ...f, od }
    }),
  }))
  const quitarFila = (id) => setM((x) => ({ ...x, filas: x.filas.filter((f) => f.id !== id) }))
  const enfocar = (i, col) => { const el = refs.current[`${i}|${col}`]; if (el) { el.focus(); el.select?.() } }
  const tecla = (e, i, col) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); enfocar(i + 1, col) } else if (e.key === 'ArrowUp') { e.preventDefault(); enfocar(i - 1, col) } }

  const agregarSerie = () => {
    const ts = serie.tiempos.split(/[;,\s]+/).map(num).filter((v) => v !== null && v >= 0)
    const mu = serie.muestra.trim()
    if (!mu) return s.avisar('Escribí el nombre de la muestra.', 'error')
    if (!ts.length) return s.avisar('Escribí los tiempos en horas, separados por comas.', 'error')
    const reps = Math.max(1, Math.min(12, Math.round(Number(serie.reps) || 1)))
    const nuevas = []
    for (let r = 1; r <= reps; r++) ts.forEach((t) => nuevas.push(nuevaFila({ muestra: mu, replica: r, t })))
    agregarMuestras([mu])
    setM((x) => ({ ...x, filas: [...x.filas, ...nuevas] }))
    s.avisar(`${nuevas.length} filas agregadas: completá las lecturas de OD.`)
  }

  // pegado desde Excel: Muestra, Réplica, Tiempo (h) y una columna por lectura (sin diluir, −1, −2, …)
  const aplicarPegado = () => {
    const lin = pegar.trim().split(/\r?\n/).filter((l) => l.trim())
    const nuevas = []
    lin.forEach((l) => {
      const c = l.split('\t')
      if (c.length < 4 || !c[0].trim()) return
      const t = num(c[2])
      if (t === null) return
      const od = {}
      c.slice(3).forEach((v, k) => { const n = num(v); if (n !== null) od[k] = n })
      nuevas.push(nuevaFila({ muestra: c[0].trim(), replica: Math.round(num(c[1]) || 1), t, od }))
    })
    if (!nuevas.length) return s.avisar('No encontré filas válidas. Pegá columnas: Muestra, Réplica, Tiempo (h) y las lecturas.', 'error')
    const nd = Math.max(m.nd, ...lin.map((l) => l.split('\t').length - 3))
    agregarMuestras(nuevas.map((f) => f.muestra))
    setM((x) => ({ ...x, nd: Math.min(nd, 8), filas: [...x.filas, ...nuevas] }))
    setPegar(null)
    s.avisar(`${nuevas.length} filas pegadas.`)
  }

  // importa una tabla de Excel con encabezados Muestra, Tiempo, Réplica y columnas «Sin diluir», «-1», «-2»…
  const importar = async (file) => {
    try {
      const { hojas } = await hojasDe(file)
      let r = null, ult = null
      for (const h of hojas) { try { r = leerTablaConteos(await leerCrudo(file, h)); break } catch (e) { ult = e } }
      if (!r) throw ult || new Error('No encontré la tabla.')
      const nuevas = r.filas.map((f) => nuevaFila({ muestra: f.muestra, replica: f.replica, t: f.t, od: Object.fromEntries(Object.entries(f.c).map(([k, v]) => [Number(k), v])) }))
      agregarMuestras(nuevas.map((f) => f.muestra))
      setM((x) => ({ ...x, nd: Math.min(Math.max(x.nd, r.nd), 8), filas: [...x.filas, ...nuevas] }))
      s.avisar(`Tabla importada: ${nuevas.length} filas.`)
    } catch (e) { s.avisar(e.message, 'error') }
  }

  const filasRes = res.map((r) => ({ Muestra: r.Muestra, T_h: r.T_h, N: r.N, OD: signif(r.OD, 4), DE: finito(r.DE) ? signif(r.DE, 3) : null }))
  const sinVentana = filas.filter((f) => f.estado === 'sobre_ventana').length
  const usaBlanco = !m.yaCorregido

  return (
    <div className="pagina">
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Lecturas de OD con cubeta</h2>
          <div className="fila-ctrl" style={{ margin: 0 }}>
            <button onClick={() => importRef.current.click()}>Importar Excel</button>
            <button onClick={() => setPegar('')}>Pegar desde Excel</button>
            <button className="primario" onClick={() => setM((x) => ({ ...x, filas: [...x.filas, nuevaFila({ muestra: x.filas.at(-1)?.muestra || '', replica: x.filas.at(-1)?.replica || 1, t: '' })] }))}>+ Fila</button>
            <input ref={importRef} type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { e.target.files[0] && importar(e.target.files[0]); e.target.value = '' }} />
          </div>
        </div>
        <div className="barra-parametros" style={{ marginBottom: 6 }}>
          <span className="chip-param" data-tip="Ventana lineal del equipo (OD neta)">ventana {m.vmin}–{m.vmax}</span>
          <span className="chip-param" data-tip="Factor de dilución entre lecturas">f = {m.factor}</span>
          <span className="chip-param" data-tip="OD del medio estéril">{usaBlanco ? `blanco ${m.blanco}` : 'ya corregida por blanco'}</span>
          <button className="chico" onClick={() => s.irA('experimento')}>Editar</button>
          <Nota>Cada fila es una muestra, una réplica y un tiempo. Si la OD se sale de la zona lineal, diluí y anotá la lectura en la columna de esa dilución (−1, −2…). La OD final es la media de las lecturas dentro de la ventana, multiplicadas por f<sup>k</sup>.</Nota>
        </div>
        <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
          <Campo label="Agregar una serie: muestra">
            <input list="muestras-om" value={serie.muestra} onChange={(e) => setSerie({ ...serie, muestra: e.target.value })} placeholder="Ej.: L100A1" />
          </Campo>
          <Campo label="Réplicas"><input type="number" min="1" max="12" style={{ width: 70 }} value={serie.reps} onChange={(e) => setSerie({ ...serie, reps: e.target.value })} /></Campo>
          <Campo label="Tiempos (h)"><input style={{ width: 220 }} value={serie.tiempos} onChange={(e) => setSerie({ ...serie, tiempos: e.target.value })} /></Campo>
          <button onClick={agregarSerie}>Crear filas</button>
          <Campo label="Columnas de dilución">
            <div className="seg">
              <button onClick={() => setM((x) => ({ ...x, nd: Math.max(1, x.nd - 1) }))}>−</button>
              <button className="on" style={{ pointerEvents: 'none' }}>{m.nd}</button>
              <button onClick={() => setM((x) => ({ ...x, nd: Math.min(8, x.nd + 1) }))}>+</button>
            </div>
          </Campo>
        </div>
        <datalist id="muestras-om">{todas.map((x) => <option key={x} value={x} />)}</datalist>
        {s.a.manualError && <p className="aviso-error">{s.a.manualError}</p>}
        {!m.filas.length ? (
          <div className="vacio">Todavía no hay lecturas. Creá una serie (muestra, réplicas y tiempos), pegá una tabla de Excel o agregá filas una por una.</div>
        ) : (
          <div className="tabla-scroll" style={{ maxHeight: 520 }}>
            <table className="tabla tabla-od">
              <thead>
                <tr><th>#</th><th>Muestra</th><th>Réplica</th><th>Tiempo (h)</th>{ks.map((k) => <th key={k} title={k ? `Dilución ${m.factor}^${k}` : 'Lectura directa'}>{etqK(k)}</th>)}<th>OD corregida</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {m.filas.map((f, i) => { const c = filas[i] || {}; return (
                  <tr key={f.id}>
                    <td>{i + 1}</td>
                    <td><input ref={(el) => { refs.current[`${i}|m`] = el }} list="muestras-om" style={{ width: 120 }} value={f.muestra} onKeyDown={(e) => tecla(e, i, 'm')}
                      onChange={(e) => setFila(f.id, { muestra: e.target.value })} onBlur={(e) => agregarMuestras([e.target.value.trim()])} /></td>
                    <td><input ref={(el) => { refs.current[`${i}|r`] = el }} type="number" min="1" style={{ width: 56 }} value={f.replica} onKeyDown={(e) => tecla(e, i, 'r')}
                      onChange={(e) => setFila(f.id, { replica: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                    <td><input ref={(el) => { refs.current[`${i}|t`] = el }} type="number" step="any" style={{ width: 72 }} value={f.t} onKeyDown={(e) => tecla(e, i, 't')}
                      onChange={(e) => setFila(f.id, { t: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                    {ks.map((k) => (
                      <td key={k}><input ref={(el) => { refs.current[`${i}|${k}`] = el }} type="number" step="any" style={{ width: 72 }} value={f.od[k] ?? ''} onKeyDown={(e) => tecla(e, i, k)}
                        onChange={(e) => setOd(f.id, k, e.target.value)} onPaste={(e) => {
                          const txt = e.clipboardData.getData('text')
                          if (!/\t/.test(txt)) return
                          e.preventDefault()
                          txt.trim().split('\t').forEach((v, j) => { const n = num(v); if (n !== null && k + j < m.nd) setOd(f.id, k + j, n) })
                        }} /></td>
                    ))}
                    <td data-tip={dOdManual(f, m, c) || undefined} className="con-calculo"><b>{finito(c.od) ? signif(c.od, 4) : ''}</b></td>
                    <td style={{ background: COLOR_ESTADO[c.estado] }} title={TEXTO_OD[c.estado]}><small>{Object.keys(f.od).length ? TEXTO_OD[c.estado] : ''}</small></td>
                    <td><button className="chico peligro" onClick={() => quitarFila(f.id)} aria-label="Quitar fila">×</button></td>
                  </tr>
                ) })}
              </tbody>
            </table>
          </div>
        )}
        {sinVentana > 0 && <p className="ayuda">⚠ {sinVentana} {sinVentana === 1 ? 'fila quedó' : 'filas quedaron'} sobre la ventana lineal: diluí esa muestra y volvé a leer para que la OD sea confiable.</p>}
        {m.filas.length > 0 && <div className="fila-ctrl"><button className="peligro" onClick={() => { if (window.confirm('Se borran todas las lecturas manuales. ¿Continuar?')) setM((x) => ({ ...x, filas: [] })) }}>Borrar todas las lecturas</button></div>}
      </section>

      {filasRes.length > 0 && (
        <section className="tarjeta">
          <TablaAvanzada id="od_manual_resumen" titulo="OD por muestra y tiempo (media de las réplicas)" columnas={['Muestra', 'T_h', 'N', 'OD', 'DE']} filas={filasRes} onVista={s.onVista} />
          <p className="ayuda"><Nota titulo="Ayuda">Con estas lecturas se arma una curva por muestra y réplica: las pestañas «Gráfico» y «Análisis» calculan μmax, el tiempo de duplicación y el lag igual que con una placa.</Nota></p>
        </section>
      )}

      {pegar !== null && (
        <Modal titulo="Pegar lecturas desde Excel" onClose={() => setPegar(null)} ancho={640}
          pie={<><button onClick={() => setPegar(null)}>Cancelar</button><button className="primario" onClick={aplicarPegado}>Agregar filas</button></>}>
          <p className="ayuda" style={{ marginTop: 0 }}><Nota titulo="Ayuda">Copiá en Excel las columnas <b>Muestra · Réplica · Tiempo (h) · Sin diluir · −1 · −2 …</b> (sin encabezados) y pegalas acá.</Nota></p>
          <textarea autoFocus rows={10} style={{ width: '100%', fontFamily: 'monospace' }} value={pegar} onChange={(e) => setPegar(e.target.value)} />
        </Modal>
      )}
    </div>
  )
}
