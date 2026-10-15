import { useRef, useState } from 'react'
import { ACEPTA_LIBRO } from '../libro.js'
import { Campo, Check, Modal, Num, Select } from './ui.jsx'
import { Nota } from './tip.jsx'
import { MODOS, ORIGENES_OD, hayConteo, hayOd, odPorPocillos } from '../experimento.js'
import { aCSV, descargarBlob, descargarTexto, fmt, pocillos96 } from '../utils.js'
import { hayConteos, lineasPetri, texto10 } from '../motor/ufc.js'

const nConteos = (u) => (u.metodo === 'extendida'
  ? u.tabla.filas.reduce((n, f) => n + Object.keys(f.c || {}).length, 0) + lineasPetri(u).filter((l) => Number.isFinite(l.n)).length
  : u.placasG.reduce((n, p) => n + Object.keys(p.conteos).length, 0))

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
  const extendida = ufc.metodo === 'extendida'
  const setParG = (k, v) => s.setUfc((u) => ({ ...u, par: { ...u.par, [k]: v } }))
  const setTb = (k, v) => s.setUfc((u) => ({ ...u, tabla: { ...u.tabla, [k]: v } }))
  const setMetodo = (m) => s.setUfc((u) => ({ ...u, metodo: m }))
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
          <Campo label="Nombre">
            <input key={a.id} defaultValue={a.nombre} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== a.nombre) s.renombrarExp(a.id, v) }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </Campo>
          <Campo label="Tipo">
            <Select value={a.modo} onChange={(v) => s.setModo(v)} opciones={Object.entries(MODOS).map(([id, m]) => [id, m.titulo])} />
          </Campo>
          {conOd && (
            <Campo label="Origen de la OD">
              <Select value={a.origenOd} onChange={(v) => s.setOrigenOd(v)} opciones={Object.entries(ORIGENES_OD).map(([id, m]) => [id, m.titulo])} />
            </Campo>
          )}
          <Campo label="Organismo / especie"><input value={cond.organismo} onChange={(e) => setC('organismo', e.target.value)} placeholder="Ej.: S. aureus" /></Campo>
          <Campo label="Medio de cultivo"><input value={cond.medio} onChange={(e) => setC('medio', e.target.value)} placeholder="BHI, TSB, LB…" list="medios-sugeridos" /></Campo>
          <Campo label="Temperatura (°C)"><input value={cond.temperatura} onChange={(e) => setC('temperatura', e.target.value)} placeholder="37" /></Campo>
          {conOd && <Campo label="Equipo de OD"><input value={cond.equipo} onChange={(e) => setC('equipo', e.target.value)} placeholder="Tecan Sunrise, espectrofotómetro…" /></Campo>}
          {conOd && <Campo label="Longitud de onda (nm)"><Num value={cond.lambda} min={200} max={1000} step={5} onChange={(v) => setC('lambda', v)} /></Campo>}
          <Campo label="Fecha"><input type="date" value={cond.fecha} onChange={(e) => setC('fecha', e.target.value)} /></Campo>
        </div>
        <div className="campo">
          <label>Cepas del experimento <Nota>Podés usar varias. Son las que después vas a poder elegir en las placas (OD y conteo). Las que escribas se agregan también a la lista general.</Nota></label>
          <div className="fila-chips">
            {a.cepas.map((c) => (
              <span key={c} className="chip-cepa" style={{ borderColor: s.coloresGlobal[c] || '#c99a5b', background: (s.coloresGlobal[c] || '#c99a5b') + '26' }}>
                <i style={{ background: s.coloresGlobal[c] || '#c99a5b' }} />{c}
                <button aria-label={`Quitar ${c}`} onClick={() => s.setCepas((x) => x.filter((y) => y !== c))}>×</button>
              </span>
            ))}
            <input className="entrada-cepa" list="cepas-lista" placeholder="Agregar cepa y Enter" onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const v = e.currentTarget.value.trim()
              if (!v) return
              if (!s.muestras.includes(v)) s.setMuestras([...s.muestras, v])
              if (!a.cepas.includes(v)) s.setCepas((x) => [...x, v])
              e.currentTarget.value = ''
            }} />
            <datalist id="cepas-lista">{s.muestras.filter((m) => !a.cepas.includes(m)).map((m) => <option key={m} value={m} />)}</datalist>
          </div>
        </div>
        <datalist id="medios-sugeridos">{['BHI', 'TSB', 'TSBye', 'LB', 'M9', 'MH'].map((m) => <option key={m} value={m} />)}</datalist>
        <Campo label="Notas"><textarea rows={2} value={cond.notas} onChange={(e) => setC('notas', e.target.value)} placeholder="Datos que quieras que figuren en el informe" /></Campo>

        {conConteo && (
          <div className="subseccion">
            <h3>Siembra y diluciones <Nota>Dilución −k: la suspensión está f<sup>k</sup> veces más diluida que la original (k = 0: sin diluir). UFC/mL = colonias ÷ volumen sembrado × f<sup>k</sup>. Con varias diluciones en el rango contable se usa la media ponderada (ISO 7218).</Nota></h3>
            <div className="fila-ctrl" style={{ alignItems: 'center' }}>
              <span className="etq-campo">Método de siembra</span>
              <div className="seg">
                <button className={!extendida ? 'on' : ''} onClick={() => setMetodo('gota')} data-tip={'Siembra por gota\nGotas de volumen fijo sobre agar, una por pocillo de una placa de 96 con diluciones seriadas.'}>Por gota</button>
                <button className={extendida ? 'on' : ''} onClick={() => setMetodo('extendida')} data-tip={'Siembra extendida\nUn volumen esparcido sobre el agar de cada placa de Petri (se puede dividir en sectores).'}>Extendida</button>
              </div>
            </div>
            <div className="rejilla-campos">
              {!extendida ? (
                <>
                  <Campo label="Volumen de la gota (µL)"><Num value={parG.vol * 1000} min={1} step={1} onChange={(v) => setParG('vol', v === '' ? 0.02 : v / 1000)} /></Campo>
                  <Campo label="Toma de cada dilución (µL)"><Num value={parG.toma} min={1} step={5} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, toma: v === '' ? 40 : v, factor: u.par.final / (v === '' ? 40 : v) } }))} /></Campo>
                  <Campo label="Volumen final por pocillo (µL)"><Num value={parG.final} min={2} step={10} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, final: v === '' ? 200 : v, factor: (v === '' ? 200 : v) / u.par.toma } }))} /></Campo>
                  <Campo label="Factor de dilución (f)"><div className="valor-calculado" data-tip={`Factor de dilución\nf = volumen final / toma = ${parG.final} / ${parG.toma} = ${Number(parG.factor.toPrecision(4))}\n${texto10(Math.log10(1 / parG.factor))} por pocillo`}>{Number(parG.factor.toPrecision(4))} <small>= {texto10(Math.log10(1 / parG.factor))}</small></div></Campo>
                  <Campo label="El pocillo 1 es…">
                    <Select value={parG.primero} onChange={(v) => setParG('primero', v)} opciones={[['dilucion', 'La primera dilución'], ['madre', 'La solución madre (sin diluir)']]} />
                  </Campo>
                  <Campo label="Contable desde (col./gota)"><Num value={parG.min} min={1} onChange={(v) => setParG('min', v === '' ? 3 : v)} /></Campo>
                  <Campo label="Contable hasta"><Num value={parG.max} min={2} onChange={(v) => setParG('max', v === '' ? 30 : v)} /></Campo>
                </>
              ) : (
                <>
                  <Campo label="Volumen sembrado (µL)"><Num value={tb.vol} min={1} step={10} onChange={(v) => setTb('vol', v === '' ? 100 : v)} /></Campo>
                  <Campo label="Factor de dilución (f)"><Num value={tb.factor} min={1.1} step={0.5} onChange={(v) => setTb('factor', v === '' ? 10 : v)} /></Campo>
                  <Campo label="Contable desde (col./placa)"><Num value={tb.min} min={1} onChange={(v) => setTb('min', v === '' ? 25 : v)} /></Campo>
                  <Campo label="Contable hasta"><Num value={tb.max} min={2} onChange={(v) => setTb('max', v === '' ? 250 : v)} /></Campo>
                </>
              )}
            </div>
            {!extendida && parG.primero === 'dilucion' && (
              <div className="rejilla-campos" style={{ marginTop: 6 }}>
                <Check label={<>Partir de una solución madre<Nota>Opcional. Se toma un volumen de la solución madre para llegar al pocillo 1 con el volumen final indicado; ese paso puede tener un factor distinto del resto de la serie.</Nota></>} checked={!!parG.madre.usar} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, madre: { ...u.par.madre, usar: v } } }))} />
                {parG.madre.usar && <Campo label="Toma de la madre (µL)"><Num value={parG.madre.toma} min={1} step={5} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, madre: { ...u.par.madre, toma: v === '' ? 20 : v } } }))} /></Campo>}
                {parG.madre.usar && <Campo label="Volumen final del pocillo 1 (µL)"><Num value={parG.madre.final} min={2} step={10} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, madre: { ...u.par.madre, final: v === '' ? 200 : v } } }))} /></Campo>}
              </div>
            )}
            <Check label="Incluir en las medias las estimaciones fuera del rango contable" checked={parG.estimados !== false} onChange={(v) => setParG('estimados', v)} />
            {conOd && (
              <Campo label="La OD se leyó en…">
                <Select value={cond.origenOdMuestra} onChange={(v) => setC('origenOdMuestra', v)}
                  opciones={[['misma', 'La misma suspensión que se sembró'], ['paralelo', 'Un cultivo paralelo en las mismas condiciones']]} />
              </Campo>
            )}
          </div>
        )}
        {conOd && a.origenOd === 'manual' && (
          <div className="subseccion">
            <h3>Lecturas manuales <Nota>La OD de la suspensión original es (lectura − blanco) × f<sup>k</sup>. Se promedian las lecturas dentro de la ventana lineal del equipo.</Nota></h3>
            <div className="rejilla-campos">
              <Campo label="Factor de dilución (f)"><Num value={man.factor} min={1.1} step={0.5} onChange={(v) => setMan('factor', v === '' ? 10 : v)} /></Campo>
              <Campo label="Ventana lineal desde (OD)"><Num value={man.vmin} min={0} step={0.01} onChange={(v) => setMan('vmin', v === '' ? 0.05 : v)} /></Campo>
              <Campo label="Hasta"><Num value={man.vmax} min={0.1} step={0.05} onChange={(v) => setMan('vmax', v === '' ? 0.8 : v)} /></Campo>
              <Campo label="Blanco (OD del medio)"><Num value={man.blanco} min={0} step={0.001} onChange={(v) => setMan('blanco', v === '' ? 0 : v)} /></Campo>
            </div>
            <Check label="Las lecturas ya vienen corregidas por el blanco" checked={man.yaCorregido} onChange={(v) => setMan('yaCorregido', v)} />
          </div>
        )}
      </section>

      {conOd && (
        <section className="tarjeta">
          <div className="titulo-fila"><h2>Datos de OD <Nota>Los cálculos se hacen en tu navegador: los archivos no se envían a ningún servidor. Se leen planillas de Excel o LibreOffice (.xlsx, .xls, .xlsm, .xlsb, .ods).</Nota></h2><small className="ayuda">{ORIGENES_OD[a.origenOd].titulo}</small></div>
          {a.origenOd === 'tecan' && (
            <>
              <div className="dropzone" onClick={() => inputRef.current.click()} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); abrir(e.dataTransfer.files) }}>
                <strong>{cargando ? 'Leyendo…' : d ? 'Soltá otro archivo para reemplazar el actual, o hacé clic' : 'Soltá el Excel del lector acá, o hacé clic para elegirlo'}</strong>
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
                <span>{ORIGENES_OD.placa.texto}</span>
              </div>
              <input ref={lecturasRef} type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { abrirLecturas(e.target.files); e.target.value = '' }} />
              {a.lecturas.length > 0 && <p className="ayuda">Placa cargada: <b>{a.lecturas[0].nombre}</b>{a.lecturas[0].onda ? ` · ${a.lecturas[0].onda} nm` : ''}. Definí los tiempos de las columnas y las cepas de las filas en «Placa de OD».{' '}<button className="chico primario" onClick={() => s.irA('placa')}>Abrir Placa de OD</button></p>}
              {d && <p className="ayuda">Curva armada: {Object.keys(d.pocillos).length} pocillos × {d.tiempos.length} tiempos.</p>}
            </>
          )}
          {a.origenOd === 'manual' && (
            <p>{a.manual.filas.length ? `${a.manual.filas.length} filas cargadas.` : 'Todavía no hay filas.'}{' '}
              <button className="chico primario" onClick={() => s.irA('odmanual')}>Abrir OD manual</button></p>
          )}
        </section>
      )}

      {conConteo && (
        <section className="tarjeta">
          <h2>Datos de conteo</h2>
          <p>{hayConteos(ufc) ? `${nConteos(ufc)} conteos cargados.` : 'Todavía no hay conteos.'}{' '}
            <button className="chico primario" onClick={() => s.irA('conteo')}>Abrir Recuento</button></p>
        </section>
      )}

      <div className="rejilla-2">
        <section className="tarjeta">
          <h2>Muestras <Nota>La lista es común a todos los experimentos. Para que la OD y el conteo se junten, la muestra tiene que llamarse igual en ambos.</Nota></h2>
          <div className="fila-ctrl">
            <input className="grande" placeholder="Nombre de la muestra y Enter (ej.: L100A1)" value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregarMuestra()} />
            <button className="primario" onClick={agregarMuestra}>Agregar</button>
          </div>
          <ul className="lista-muestras">
            {s.muestras.map((m, i) => {
              const n = s.exps.reduce((t, x) => t + x.config.filter((c) => c.Muestra === m).length + x.ufc.placasG.reduce((q, p) => q + Object.values(p.filas).filter((f) => f.muestra === m).length, 0), 0)
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
            {!s.muestras.length && <li className="ayuda">Sin muestras todavía.</li>}
          </ul>
        </section>
        <div className="columna-tarjetas">
          <section className="tarjeta">
            <h2>Sesión <Nota>Guarda todos los experimentos con sus datos (condiciones, Excel, lecturas, conteos, pocillos, exclusiones, ajustes y estilos). Para continuar otro día alcanza con cargarla.</Nota></h2>
            <div className="fila-ctrl">
              <button className="primario" onClick={guardarSesion}>Guardar sesión</button>
              <button onClick={() => sesionRef.current.click()}>Cargar sesión</button>
              <input ref={sesionRef} type="file" hidden accept=".json" onChange={(e) => { e.target.files[0] && cargarSesion(e.target.files[0]); e.target.value = '' }} />
            </div>
          </section>
          {odPorPocillos(a) && (
            <section className="tarjeta">
              <h2>Layout de la placa de OD <Nota>CSV con las columnas Pocillo, Muestra y, opcionalmente, Replica y Blanco (1/0).</Nota></h2>
              <div className="fila-ctrl">
                <button onClick={exportarLayout} disabled={!s.config.length}>Exportar CSV</button>
                <button onClick={() => layoutRef.current.click()} disabled={!d}>Importar CSV</button>
                <input ref={layoutRef} type="file" hidden accept=".csv,.txt" onChange={(e) => { e.target.files[0] && importarLayout(e.target.files[0]); e.target.value = '' }} />
              </div>
              {s.exps.filter((x) => x.id !== a.id && x.config.length).length > 0 && (
                <Campo label="Usar el layout de otro experimento">
                  <select value="" onChange={(e) => e.target.value && s.copiarLayoutDe(e.target.value)}>
                    <option value="">Elegí un experimento…</option>
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
          <p className="ayuda">También se aplica a los pocillos y tablas de todos los experimentos que usan esta muestra.</p>
        </Modal>
      )}
    </div>
  )
}
