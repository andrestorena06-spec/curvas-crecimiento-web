import { useRef, useState } from 'react'
import { ACEPTA_LIBRO } from '../libro.js'
import { Campo, Check, Modal, Num, Select } from './ui.jsx'
import { MODOS, ORIGENES_OD, hayConteo, hayOd, odPorPocillos } from '../experimento.js'
import { aCSV, descargarBlob, descargarTexto, fmt, pocillos96 } from '../utils.js'
import { hayConteos } from '../motor/ufc.js'

const nConteos = (u) => Object.values(u.conteos).reduce((n, o) => n + Object.keys(o).length, 0) + u.tabla.filas.length

// ===============================================================
// EXPERIMENTO: condiciones (primer cuadro), datos de OD y de conteo, muestras, sesión y layout
// ===============================================================
export function ExperimentoTab({ s }) {
  const a = s.a
  const [nueva, setNueva] = useState('')
  const [edit, setEdit] = useState(null)
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef()
  const lecturasRef = useRef()
  const sesionRef = useRef()
  const layoutRef = useRef()

  if (!a) return null
  const { cond, ufc } = a
  const conOd = hayOd(a), conConteo = hayConteo(a)
  const setC = (k, v) => s.setCond(k, v)
  const parG = ufc.par, tb = ufc.tabla
  const setParG = (k, v) => s.setUfc((u) => ({ ...u, par: { ...u.par, [k]: v } }))
  const setTb = (k, v) => s.setUfc((u) => ({ ...u, tabla: { ...u.tabla, [k]: v } }))
  const man = a.manual
  const setMan = (k, v) => s.setManual((m) => ({ ...m, [k]: v }))
  const d = s.datos

  const abrir = async (files) => {
    if (!files || !files.length) return
    setCargando(true)
    await s.cargarArchivos(files, a.id)
    setCargando(false)
  }
  const abrirLecturas = async (files) => {
    if (!files || !files.length) return
    setCargando(true)
    await s.agregarLecturas(files)
    setCargando(false)
  }
  const exportarLayout = () => {
    const filas = [...s.config].sort((x, y) => pocillos96().indexOf(x.Pocillo) - pocillos96().indexOf(y.Pocillo))
      .map((c) => ({ Pocillo: c.Pocillo, Muestra: c.Muestra, Replica: c.Replica, Blanco: c.EsBlanco ? 1 : 0 }))
    descargarTexto(aCSV(filas, ['Pocillo', 'Muestra', 'Replica', 'Blanco']), 'layout_placa_od.csv')
  }
  const importarLayout = async (file) => {
    const txt = (await file.text()).replace(/^﻿/, '')
    const lineas = txt.split(/\r?\n/).filter(Boolean)
    if (!lineas.length) return s.avisar('El archivo está vacío.', 'error')
    const sep = lineas[0].includes(';') ? ';' : lineas[0].includes('\t') ? '\t' : ','
    const cab = lineas[0].split(sep).map((x) => x.trim().toLowerCase())
    const ix = (n) => cab.findIndex((c) => n.includes(c))
    const iP = ix(['pocillo', 'well']), iM = ix(['muestra', 'sample']), iR = ix(['replica', 'rep']), iB = ix(['blanco', 'blank', 'esblanco'])
    if (iP < 0 || iM < 0) return s.avisar("El layout necesita las columnas 'Pocillo' y 'Muestra'.", 'error')
    const validos = new Set(pocillos96())
    const cfg = []
    for (const l of lineas.slice(1)) {
      const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''))
      const p = c[iP]?.toUpperCase().replace(/^([A-H])0+(\d)/, '$1$2')
      if (!p || !validos.has(p) || !c[iM] || cfg.some((x) => x.Pocillo === p)) continue
      cfg.push({ Pocillo: p, Muestra: c[iM], Replica: iR >= 0 ? Number(c[iR]) || 0 : 0,
        EsBlanco: iB >= 0 && ['1', 'true', 'si', 'sí', 'yes', 'x'].includes((c[iB] || '').toLowerCase()) })
    }
    if (!cfg.length) return s.avisar('Ningún pocillo válido (A1 a H12) con muestra en el layout.', 'error')
    const ordenados = cfg.sort((x, y) => pocillos96().indexOf(x.Pocillo) - pocillos96().indexOf(y.Pocillo))
    const cont = {}
    ordenados.forEach((c) => { cont[c.Muestra] = (cont[c.Muestra] || 0) + 1; if (!c.Replica) c.Replica = cont[c.Muestra] })
    s.aplicarLayout(ordenados)
  }
  const guardarSesion = () => descargarBlob(new Blob([JSON.stringify(s.exportarSesion())], { type: 'application/json' }), 'sesion_curvas_de_crecimiento.json')
  const cargarSesion = async (file) => {
    try { s.importarSesion(JSON.parse(await file.text())); s.avisar('Sesión cargada.') } catch { s.avisar('No se pudo leer la sesión.', 'error') }
  }
  const agregarMuestra = () => {
    const n = nueva.trim()
    if (!n) return
    if (s.muestras.some((m) => m.toLowerCase() === n.toLowerCase())) return s.avisar(`La muestra '${n}' ya existe.`, 'error')
    s.setMuestras([...s.muestras, n])
    setNueva('')
  }

  return (
    <div className="pagina">
      <section className="tarjeta">
        <h2>Condiciones del experimento</h2>
        <div className="rejilla-campos">
          <Campo label="Nombre del experimento">
            <input key={a.id} defaultValue={a.nombre} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.nombre) s.renombrarExp(a.id, v) }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </Campo>
          <Campo label="Tipo de experimento">
            <Select value={a.modo} onChange={(v) => s.setModo(v)} opciones={Object.entries(MODOS).map(([id, m]) => [id, m.titulo])} />
          </Campo>
          {conOd && (
            <Campo label="Origen de la OD">
              <Select value={a.origenOd} onChange={(v) => s.setOrigenOd(v)} opciones={Object.entries(ORIGENES_OD).map(([id, m]) => [id, m.titulo])} />
            </Campo>
          )}
          <Campo label="Organismo / cepa"><input value={cond.organismo} onChange={(e) => setC('organismo', e.target.value)} placeholder="Ej.: S. aureus L100A1" /></Campo>
          <Campo label="Medio de cultivo"><input value={cond.medio} onChange={(e) => setC('medio', e.target.value)} placeholder="Ej.: BHI, TSB, LB…" list="medios-sugeridos" /></Campo>
          <Campo label="Temperatura (°C)"><input value={cond.temperatura} onChange={(e) => setC('temperatura', e.target.value)} placeholder="37" /></Campo>
          {conOd && <Campo label="Equipo de OD"><input value={cond.equipo} onChange={(e) => setC('equipo', e.target.value)} placeholder="Ej.: Tecan Sunrise, espectrofotómetro…" /></Campo>}
          {conOd && <Campo label="Longitud de onda (nm)"><Num value={cond.lambda} min={200} max={1000} step={5} onChange={(v) => setC('lambda', v)} /></Campo>}
          <Campo label="Fecha"><input type="date" value={cond.fecha} onChange={(e) => setC('fecha', e.target.value)} /></Campo>
        </div>
        <datalist id="medios-sugeridos">{['BHI', 'TSB', 'TSBye', 'LB', 'M9', 'MH'].map((m) => <option key={m} value={m} />)}</datalist>
        <Campo label="Notas"><textarea rows={2} value={cond.notas} onChange={(e) => setC('notas', e.target.value)} placeholder="Cualquier dato del experimento que quieras que figure en el informe" /></Campo>

        {conConteo && (
          <>
            <h3>Diluciones y siembra</h3>
            <p className="ayuda" style={{ marginTop: 0 }}>Dilución −k: la suspensión está <i>factor</i>ᵏ veces más diluida que la original (k = 0: sin diluir). UFC/mL = colonias ÷ volumen sembrado × factorᵏ; con varias diluciones en rango se usa la media ponderada (ISO 7218).</p>
            <div className="rejilla-2">
              <div className="bloque-estilo">
                <h4>Placa de 96 con gotas (cada fila una réplica, cada columna una dilución)</h4>
                <div className="rejilla-campos">
                  <Campo label="Volumen de la gota (µL)"><Num value={parG.vol * 1000} min={1} step={1} onChange={(v) => setParG('vol', v === '' ? 0.02 : v / 1000)} /></Campo>
                  <Campo label="Factor de dilución entre columnas"><Num value={parG.factor} min={1.1} step={0.5} onChange={(v) => setParG('factor', v === '' ? 5 : v)} /></Campo>
                  <Campo label="Contable desde (colonias/gota)"><Num value={parG.min} min={1} onChange={(v) => setParG('min', v === '' ? 3 : v)} /></Campo>
                  <Campo label="Contable hasta"><Num value={parG.max} min={2} onChange={(v) => setParG('max', v === '' ? 30 : v)} /></Campo>
                </div>
              </div>
              <div className="bloque-estilo">
                <h4>Placas de Petri (tabla de recuentos)</h4>
                <div className="rejilla-campos">
                  <Campo label="Volumen sembrado (µL)"><Num value={tb.vol} min={1} step={10} onChange={(v) => setTb('vol', v === '' ? 100 : v)} /></Campo>
                  <Campo label="Factor de dilución"><Num value={tb.factor} min={1.1} step={0.5} onChange={(v) => setTb('factor', v === '' ? 10 : v)} /></Campo>
                  <Campo label="Rango contable desde"><Num value={tb.min} min={1} onChange={(v) => setTb('min', v === '' ? 25 : v)} /></Campo>
                  <Campo label="Rango contable hasta"><Num value={tb.max} min={2} onChange={(v) => setTb('max', v === '' ? 250 : v)} /></Campo>
                </div>
              </div>
            </div>
            <Check label="Incluir en las medias las estimaciones fuera del rango contable (se marcan en las tablas)" checked={parG.estimados !== false} onChange={(v) => setParG('estimados', v)} />
          </>
        )}
        {conOd && conConteo && (
          <Campo label="La OD se leyó en…">
            <Select value={cond.origenOdMuestra} onChange={(v) => setC('origenOdMuestra', v)}
              opciones={[['misma', 'La misma suspensión que se sembró'], ['paralelo', 'Un cultivo paralelo hecho en las mismas condiciones']]} />
          </Campo>
        )}
        {conOd && a.origenOd === 'manual' && (
          <>
            <h3>Lecturas manuales de OD (espectrofotómetro)</h3>
            <div className="rejilla-campos">
              <Campo label="Factor de dilución de las lecturas"><Num value={man.factor} min={1.1} step={0.5} onChange={(v) => setMan('factor', v === '' ? 10 : v)} /></Campo>
              <Campo label="Ventana lineal desde (OD neta)"><Num value={man.vmin} min={0} step={0.01} onChange={(v) => setMan('vmin', v === '' ? 0.05 : v)} /></Campo>
              <Campo label="Ventana lineal hasta"><Num value={man.vmax} min={0.1} step={0.05} onChange={(v) => setMan('vmax', v === '' ? 0.8 : v)} /></Campo>
              <Campo label="Blanco general (OD del medio)"><Num value={man.blanco} min={0} step={0.001} onChange={(v) => setMan('blanco', v === '' ? 0 : v)} /></Campo>
            </div>
            <Check label="Las lecturas ya vienen corregidas por el blanco (blanco = 0)" checked={man.yaCorregido} onChange={(v) => setMan('yaCorregido', v)} />
          </>
        )}
      </section>

      {conOd && (
        <section className="tarjeta">
          <div className="titulo-fila"><h2>Datos de OD</h2><small className="ayuda">{ORIGENES_OD[a.origenOd].titulo}</small></div>
          <p className="ayuda aviso-privacidad">Los cálculos se hacen en tu navegador: los archivos y los resultados <b>no se envían a ningún servidor</b>. Se leen planillas de Excel o LibreOffice (.xlsx, .xls, .xlsm, .xlsb, .ods).</p>
          {a.origenOd === 'tecan' && (
            <>
              <div className="dropzone" onClick={() => inputRef.current.click()} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); abrir(e.dataTransfer.files) }}>
                <strong>{cargando ? 'Leyendo…' : d ? 'Soltá otro archivo acá para reemplazar el actual, o hacé clic' : 'Soltá el Excel del lector acá, o hacé clic para elegirlo'}</strong>
                <span>{ORIGENES_OD.tecan.texto}</span>
              </div>
              <input ref={inputRef} type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { abrir(e.target.files); e.target.value = '' }} />
              {s.archivo?.hojas?.length > 1 && s.tieneArchivo && (
                <Campo label="Hoja del Excel"><Select value={s.archivo.hoja} onChange={(h) => s.cambiarHoja(h)} opciones={s.archivo.hojas.map((h) => [h, h])} /></Campo>
              )}
              {d && (
                <dl className="datos">
                  <dt>Archivo</dt><dd>{s.archivo?.nombre}{s.archivo?.hoja ? ` · hoja ${s.archivo.hoja}` : ''}</dd>
                  <dt>Pocillos con datos</dt><dd>{Object.keys(d.pocillos).length}</dd>
                  <dt>Mediciones por pocillo</dt><dd>{d.tiempos.length}</dd>
                  <dt>Duración</dt><dd>{fmt((Math.max(...d.tiempos) - Math.min(...d.tiempos)) / 3600, 2)} h</dd>
                </dl>
              )}
            </>
          )}
          {a.origenOd === 'placa' && (
            <>
              <div className="dropzone" onClick={() => lecturasRef.current.click()} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); abrirLecturas(e.dataTransfer.files) }}>
                <strong>{cargando ? 'Leyendo…' : 'Soltá las placas leídas (una por tiempo) o hacé clic para elegirlas'}</strong>
                <span>{ORIGENES_OD.placa.texto} Cada archivo u hoja con una placa es una lectura.</span>
              </div>
              <input ref={lecturasRef} type="file" multiple hidden accept={ACEPTA_LIBRO} onChange={(e) => { abrirLecturas(e.target.files); e.target.value = '' }} />
              {a.lecturas.length > 0 && (
                <div className="tabla-scroll" style={{ marginTop: 12 }}>
                  <table className="tabla">
                    <thead><tr><th>Lectura</th><th>Tiempo (h)</th><th>Pocillos</th><th>Longitud de onda</th><th /></tr></thead>
                    <tbody>
                      {[...a.lecturas].sort((x, y) => x.t - y.t).map((l) => (
                        <tr key={l.id}>
                          <td>{l.nombre}</td>
                          <td><input type="number" step="any" style={{ width: 90 }} value={l.t} onChange={(e) => s.setLectura(l.id, { t: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                          <td>{l.datos.length}</td><td>{l.onda ? `${l.onda} nm` : '–'}</td>
                          <td style={{ textAlign: 'right' }}><button className="chico peligro" onClick={() => s.quitarLectura(l.id)}>Quitar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="ayuda">El tiempo se sugiere desde el nombre (por ejemplo «t2h», «T=3», «90 min»); si no, por el orden. Corregilo si hace falta. {d ? `Curva armada: ${Object.keys(d.pocillos).length} pocillos × ${d.tiempos.length} tiempos.` : ''}</p>
            </>
          )}
          {a.origenOd === 'manual' && (
            <p>Las lecturas se escriben o se pegan en la pestaña <b>OD manual</b>. {a.manual.filas.length ? `Hay ${a.manual.filas.length} filas cargadas.` : 'Todavía no hay filas.'}{' '}
              <button className="chico primario" onClick={() => s.irA('odmanual')}>Abrir OD manual</button></p>
          )}
        </section>
      )}

      {conConteo && (
        <section className="tarjeta">
          <h2>Datos de conteo</h2>
          <p>{hayConteos(ufc) ? `Hay ${nConteos(ufc)} conteos cargados.` : 'Todavía no hay conteos cargados.'} Se escriben, se pegan o se importan desde Excel en la pestaña <b>Recuento</b> (grilla de gotas o tabla de placas).{' '}
            <button className="chico primario" onClick={() => s.irA('conteo')}>Abrir Recuento</button></p>
        </section>
      )}

      <div className="rejilla-2">
        <section className="tarjeta">
          <h2>Muestras</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>La lista de muestras (cepas) es común a todos los experimentos. Para que la OD y el conteo se junten, la muestra tiene que llamarse igual en ambos.</p>
          <div className="fila-ctrl">
            <input className="grande" placeholder="Nombre de la muestra y Enter (ej.: L100A1)" value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregarMuestra()} />
            <button className="primario" onClick={agregarMuestra}>Agregar</button>
          </div>
          <ul className="lista-muestras">
            {s.muestras.map((m, i) => {
              const n = s.exps.reduce((t, x) => t + x.config.filter((c) => c.Muestra === m).length + x.ufc.layout.filter((c) => c.Muestra === m).length, 0)
              return (
                <li key={m}>
                  <span><b>{m}</b>{n > 0 && <small> ({n} {n === 1 ? 'pocillo' : 'pocillos'} en total)</small>}</span>
                  <span>
                    <button onClick={() => setEdit({ i, viejo: m, nuevo: m })}>Modificar</button>
                    <button className="peligro" onClick={() => s.borrarMuestra(m)}>Borrar</button>
                  </span>
                </li>
              )
            })}
            {!s.muestras.length && <li className="ayuda">Todavía no hay muestras. También podés escribir una nueva al configurar un pocillo o en las tablas.</li>}
          </ul>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="tarjeta">
            <h2>Sesión</h2>
            <p className="ayuda" style={{ marginTop: 0 }}>Guarda <b>todos los experimentos con sus datos</b>: condiciones, Excel, lecturas, tablas de conteo, configuración de pocillos, exclusiones, ajustes y estilos. Para continuar otro día alcanza con cargar la sesión.</p>
            <div className="fila-ctrl">
              <button className="primario" onClick={guardarSesion}>Guardar sesión</button>
              <button onClick={() => sesionRef.current.click()}>Cargar sesión</button>
              <input ref={sesionRef} type="file" hidden accept=".json" onChange={(e) => { e.target.files[0] && cargarSesion(e.target.files[0]); e.target.value = '' }} />
            </div>
          </section>
          {odPorPocillos(a) && (
            <section className="tarjeta">
              <h2>Layout de la placa de OD</h2>
              <p className="ayuda" style={{ marginTop: 0 }}>CSV con las columnas Pocillo, Muestra y, opcionalmente, Replica y Blanco (1/0).</p>
              <div className="fila-ctrl">
                <button onClick={exportarLayout} disabled={!s.config.length}>Exportar CSV</button>
                <button onClick={() => layoutRef.current.click()} disabled={!d}>Importar CSV</button>
                <input ref={layoutRef} type="file" hidden accept=".csv,.txt" onChange={(e) => { e.target.files[0] && importarLayout(e.target.files[0]); e.target.value = '' }} />
              </div>
              {s.exps.filter((x) => x.id !== a.id && x.config.length).length > 0 && (
                <Campo label="Usar el layout de otro experimento">
                  <select value="" onChange={(e) => e.target.value && s.copiarLayoutDe(e.target.value)}>
                    <option value="">Elegí un experimento con layout…</option>
                    {s.exps.filter((x) => x.id !== a.id && x.config.length).map((x) => <option key={x.id} value={x.id}>{x.nombre} ({x.config.length} pocillos)</option>)}
                  </select>
                </Campo>
              )}
            </section>
          )}
        </div>
      </div>

      {s.preview && a.origenOd === 'tecan' && (
        <section className="tarjeta">
          <h2>Vista previa del archivo</h2>
          <div className="tabla-scroll">
            <table className="tabla"><tbody>{s.preview.map((fila, i) => <tr key={i}>{fila.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table>
          </div>
        </section>
      )}

      {edit && (
        <Modal titulo="Modificar muestra" onClose={() => setEdit(null)}
          pie={<><button onClick={() => setEdit(null)}>Cancelar</button>
            <button className="primario" onClick={() => { s.renombrarMuestra(edit.viejo, edit.nuevo.trim()); setEdit(null) }}>Guardar</button></>}>
          <Campo label="Nuevo nombre"><input autoFocus value={edit.nuevo} onChange={(e) => setEdit({ ...edit, nuevo: e.target.value })} /></Campo>
          <p className="ayuda">El cambio también se aplica a los pocillos y tablas de todos los experimentos que ya usan esta muestra.</p>
        </Modal>
      )}
    </div>
  )
}
