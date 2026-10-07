import { useRef, useState } from 'react'
import { Campo, Modal, Select } from './ui.jsx'
import { aCSV, descargarBlob, descargarTexto, fmt, pocillos96 } from '../utils.js'

// ===============================================================
// ARCHIVO: un Excel, muestras, sesión y layout
// ===============================================================
export function ArchivoTab({ s }) {
  const [nueva, setNueva] = useState('')
  const [edit, setEdit] = useState(null)
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef()
  const sesionRef = useRef()
  const layoutRef = useRef()

  const abrir = async (files) => {
    if (!files || !files.length) return
    setCargando(true)
    await s.cargarArchivo(files[0])
    setCargando(false)
  }

  const exportarLayout = () => {
    const filas = [...s.config].sort((a, b) => pocillos96().indexOf(a.Pocillo) - pocillos96().indexOf(b.Pocillo))
      .map((c) => ({ Pocillo: c.Pocillo, Muestra: c.Muestra, Replica: c.Replica, Blanco: c.EsBlanco ? 1 : 0 }))
    descargarTexto(aCSV(filas, ['Pocillo', 'Muestra', 'Replica', 'Blanco']), 'layout_placa.csv')
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
    const ordenados = cfg.sort((a, b) => pocillos96().indexOf(a.Pocillo) - pocillos96().indexOf(b.Pocillo))
    const cont = {}
    ordenados.forEach((c) => { cont[c.Muestra] = (cont[c.Muestra] || 0) + 1; if (!c.Replica) c.Replica = cont[c.Muestra] })
    s.aplicarLayout(ordenados)
  }

  const guardarSesion = () => descargarBlob(new Blob([JSON.stringify(s.exportarSesion())], { type: 'application/json' }), 'sesion_curvas.json')
  const cargarSesion = async (file) => {
    try { s.importarSesion(JSON.parse(await file.text())); s.avisar('Sesión cargada.') } catch { s.avisar('No se pudo leer la sesión.', 'error') }
  }

  const agregar = () => {
    const n = nueva.trim()
    if (!n) return
    if (s.muestras.some((m) => m.toLowerCase() === n.toLowerCase())) return s.avisar(`La muestra '${n}' ya existe.`, 'error')
    s.setMuestras([...s.muestras, n])
    setNueva('')
  }

  const d = s.datos
  const nT = d ? d.tiempos.length : 0
  const dur = d && nT ? (Math.max(...d.tiempos) - Math.min(...d.tiempos)) / 3600 : 0
  return (
    <div className="pagina">
      <section className="tarjeta">
        <div className="titulo-fila"><h2>Archivo del lector</h2></div>
        <p className="ayuda aviso-privacidad">Los cálculos se hacen en tu navegador: el archivo y los resultados <b>no se envían a ningún servidor</b>. Se trabaja con un Excel a la vez.</p>
        <div className="dropzone" onClick={() => inputRef.current.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); abrir(e.dataTransfer.files) }}>
          <strong>{cargando ? 'Leyendo…' : d ? 'Soltá otro archivo acá para reemplazar el actual, o hacé clic' : 'Soltá el Excel acá, o hacé clic para elegirlo'}</strong>
          <span>.xlsx · .csv · .txt — formato del lector: «Time [s]» con los pocillos A1 a H12, o una columna de tiempo con los pocillos como encabezados</span>
        </div>
        <input ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv,.txt"
          onChange={(e) => { abrir(e.target.files); e.target.value = '' }} />
        {s.archivo?.hojas?.length > 1 && s.tieneArchivo && (
          <Campo label="Hoja del Excel">
            <Select value={s.archivo.hoja} onChange={(h) => s.cambiarHoja(h)} opciones={s.archivo.hojas.map((h) => [h, h])} />
          </Campo>
        )}
        {d ? (
          <dl className="datos">
            <dt>Archivo</dt><dd>{s.archivo?.nombre}{s.archivo?.hoja && s.archivo.hoja !== 'csv' ? ` · hoja ${s.archivo.hoja}` : ''}</dd>
            <dt>Pocillos con datos</dt><dd>{Object.keys(d.pocillos).length}</dd>
            <dt>Mediciones por pocillo</dt><dd>{nT}</dd>
            <dt>Duración</dt><dd>{fmt(dur, 2)} h</dd>
            <dt>Pocillos configurados</dt><dd>{s.config.length}</dd>
          </dl>
        ) : <p className="ayuda">Todavía no hay ningún archivo cargado.</p>}
      </section>

      <div className="rejilla-2">
        <section className="tarjeta">
          <h2>Muestras</h2>
          <div className="fila-ctrl">
            <input className="grande" placeholder="Nombre de la muestra y Enter (ej.: L100)" value={nueva}
              onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} />
            <button className="primario" onClick={agregar}>Agregar</button>
          </div>
          <ul className="lista-muestras">
            {s.muestras.map((m, i) => {
              const n = s.config.filter((c) => c.Muestra === m).length
              return (
                <li key={m}>
                  <span><b>{m}</b>{n > 0 && <small> ({n} {n === 1 ? 'pocillo' : 'pocillos'})</small>}</span>
                  <span>
                    <button onClick={() => setEdit({ i, viejo: m, nuevo: m })}>Modificar</button>
                    <button className="peligro" onClick={() => s.borrarMuestra(m)}>Borrar</button>
                  </span>
                </li>
              )
            })}
            {!s.muestras.length && <li className="ayuda">Todavía no hay muestras. También podés escribir una nueva al configurar un pocillo.</li>}
          </ul>
          <p className="ayuda">Estas muestras aparecen en el menú al configurar cada pocillo.</p>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="tarjeta">
            <h2>Sesión</h2>
            <p className="ayuda" style={{ marginTop: 0 }}>Guarda <b>los datos del Excel</b>, la configuración de pocillos, muestras, exclusiones, ventanas manuales, ajustes y estilo del gráfico. Para continuar otro día alcanza con cargar la sesión: no hace falta volver a subir el Excel.</p>
            <div className="fila-ctrl">
              <button className="primario" onClick={guardarSesion} disabled={!d}>Guardar sesión</button>
              <button onClick={() => sesionRef.current.click()}>Cargar sesión</button>
              <input ref={sesionRef} type="file" hidden accept=".json" onChange={(e) => { e.target.files[0] && cargarSesion(e.target.files[0]); e.target.value = '' }} />
            </div>
          </section>
          <section className="tarjeta">
            <h2>Layout de la placa</h2>
            <p className="ayuda" style={{ marginTop: 0 }}>CSV con las columnas Pocillo, Muestra y, opcionalmente, Replica y Blanco (1/0). Si falta Replica se numera sola.</p>
            <div className="fila-ctrl">
              <button onClick={exportarLayout} disabled={!s.config.length}>Exportar CSV</button>
              <button onClick={() => layoutRef.current.click()} disabled={!d}>Importar CSV</button>
              <input ref={layoutRef} type="file" hidden accept=".csv,.txt"
                onChange={(e) => { e.target.files[0] && importarLayout(e.target.files[0]); e.target.value = '' }} />
            </div>
          </section>
        </div>
      </div>

      {s.preview && (
        <section className="tarjeta">
          <h2>Vista previa del archivo</h2>
          <div className="tabla-scroll">
            <table className="tabla">
              <tbody>
                {s.preview.map((fila, i) => (
                  <tr key={i}>{fila.map((v, j) => <td key={j}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {edit && (
        <Modal titulo="Modificar muestra" onClose={() => setEdit(null)}
          pie={<><button onClick={() => setEdit(null)}>Cancelar</button>
            <button className="primario" onClick={() => { s.renombrarMuestra(edit.viejo, edit.nuevo.trim()); setEdit(null) }}>Guardar</button></>}>
          <Campo label="Nuevo nombre"><input autoFocus value={edit.nuevo} onChange={(e) => setEdit({ ...edit, nuevo: e.target.value })} /></Campo>
          <p className="ayuda">El cambio también se aplica a los pocillos que ya usan esta muestra.</p>
        </Modal>
      )}
    </div>
  )
}
