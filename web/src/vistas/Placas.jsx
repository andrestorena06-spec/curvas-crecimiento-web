import { useEffect, useState } from 'react'
import { ACEPTA_LIBRO } from '../libro.js'
import { hojasDe, leerCrudo } from '../motor/lectura.js'
import { leerPlacaDeMatriz, tiempoDeNombre } from '../motor/placas.js'
import { blancoDePlaca, incorporarExcelsSueltos, placaNueva } from '../modelo.js'
import { Campo, Check, Encabezado, Icono, Modal, Num, Sel, Vacio } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo, Mosaico } from '../ui/cinta.jsx'
import { DILUCIONES, PlacaEditor } from '../ui/placa.jsx'
import { GrupoCamino } from '../ui/camino.jsx'
import { fx, fin, nuevoId } from '../utils.js'

async function leerPlacaArchivo(file) {
  const { hojas } = await hojasDe(file)
  let ultimo = null
  for (const h of hojas) {
    try { const r = leerPlacaDeMatriz(await leerCrudo(file, h)); return { ...r, hoja: h } } catch (e) { ultimo = e }
  }
  throw ultimo || new Error('No encontré una placa (filas A a H con valores).')
}
const th = (t) => `${fx(t, t % 1 ? 2 : 0)} h`

export function PlacasTiempo({ s }) {
  const { exp, upd, avisar } = s
  const placas = [...exp.placas].sort((a, b) => a.t - b.t)
  const excels = exp.excels || []
  const [selId, setSelId] = useState(placas[0]?.id || null)
  const [nuevo, setNuevo] = useState(null)        // { modo: 'uno' | 'varios', t, desde, hasta, paso }
  const [aplicar, setAplicar] = useState(null)    // { que: 'layout' | 'blanco', modo, destinos: [ids] }
  const [menu, setMenu] = useState(null)          // menú contextual de un tiempo: { x, y, id }
  const sel = placas.find((p) => p.id === selId) || placas[0]
  useEffect(() => { const r = incorporarExcelsSueltos(exp.placas, exp.excels); if (r) upd(() => r) }, [exp.placas, exp.excels])
  useEffect(() => {
    if (!menu) return
    const cerrar = () => setMenu(null)
    window.addEventListener('click', cerrar)
    return () => window.removeEventListener('click', cerrar)
  }, [menu])

  const setPlacas = (f) => upd((e) => ({ placas: f(e.placas) }))
  const setPlaca = (id, patch) => setPlacas((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const intervalo = placas.length > 1 ? placas[placas.length - 1].t - placas[placas.length - 2].t : 1

  // ---------- tiempos ----------
  const crear = () => {
    let ts = []
    if (nuevo.modo === 'uno') ts = [Number(nuevo.t)]
    else for (let t = Number(nuevo.desde); t <= Number(nuevo.hasta) + 1e-9; t += Number(nuevo.paso)) ts.push(Math.round(t * 1000) / 1000)
    ts = ts.filter((t) => fin(t) && t >= 0 && !placas.some((p) => Math.abs(p.t - t) < 1e-6))
    if (!ts.length) return avisar('Esos tiempos ya existen o no son válidos.', 'error')
    const base = nuevo.copiar && sel ? sel.layout : {}
    const nuevas = ts.map((t) => placaNueva(t, base))
    setPlacas((ps) => [...ps, ...nuevas])
    setSelId(nuevas[0].id)
    setNuevo(null)
    avisar(nuevas.length === 1 ? `Placa t = ${th(ts[0])} agregada.` : `${nuevas.length} placas agregadas.`)
  }
  const quitar = (id) => {
    const p = placas.find((x) => x.id === id)
    if (!p || !window.confirm(`Se borra la placa t = ${th(p.t)} con su layout (el Excel sigue en la lista de archivos). ¿Continuar?`)) return
    setPlacas((ps) => ps.filter((x) => x.id !== id).map((x) => (x.blancoDe === id ? { ...x, blancoDe: null } : x)))
    if (selId === id) setSelId(null)
  }

  // ---------- Excel: quedan en una lista y después se asocian a las placas ----------
  const cargarExcels = async (files) => {
    const nuevos = []
    for (const f of files) {
      try {
        const r = await leerPlacaArchivo(f)
        nuevos.push({ id: nuevoId(), nombre: f.name, hoja: r.hoja, onda: r.onda, valores: Object.fromEntries(r.datos.map((d) => [d.Pocillo, d.OD])), tNombre: tiempoDeNombre(f.name.replace(/\.[^.]+$/, ''), NaN) })
      } catch (e) { avisar(`${f.name}: ${e.message}`, 'error') }
    }
    if (!nuevos.length) return
    // cada archivo va solo a la placa sin Excel cuyo tiempo figura en su nombre (t2h, 4 h, T=6…)
    const libres = placas.filter((p) => !p.valores)
    const auto = new Map()
    nuevos.forEach((x) => { const p = libres.find((q) => fin(x.tNombre) && Math.abs(q.t - x.tNombre) < 1e-6 && !auto.has(q.id)); if (p) auto.set(p.id, x) })
    if (!auto.size && nuevos.length === 1 && sel && !sel.valores) auto.set(sel.id, nuevos[0])
    upd((e) => ({
      excels: [...(e.excels || []), ...nuevos],
      placas: e.placas.map((p) => { const x = auto.get(p.id); return x ? { ...p, excelId: x.id, archivo: { nombre: x.nombre, hoja: x.hoja, onda: x.onda }, valores: { ...x.valores } } : p }),
    }))
    const resto = nuevos.length - auto.size
    avisar(`${nuevos.length} archivo${nuevos.length > 1 ? 's' : ''} cargado${nuevos.length > 1 ? 's' : ''}` +
      (auto.size ? ` · ${auto.size} asociado${auto.size > 1 ? 's' : ''} a su placa por el tiempo del nombre` : '') +
      (resto ? ` · ${resto} sin placa: elegilo${resto > 1 ? 's' : ''} en «Excel» (cinta) o con «Usar» en la lista.` : '.'))
  }
  // arrastrar varios archivos sobre la página
  const [arrastrando, setArrastrando] = useState(false)
  const soltar = (e) => { e.preventDefault(); setArrastrando(false); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) cargarExcels(fs) }
  const asociar = (idPlaca, x) => setPlaca(idPlaca, x
    ? { excelId: x.id, archivo: { nombre: x.nombre, hoja: x.hoja, onda: x.onda }, valores: { ...x.valores } }
    : { excelId: null, archivo: null, valores: null })
  // asociación automática por el tiempo que figura en el nombre del archivo
  const asociarPorNombre = () => {
    const m = new Map()
    placas.forEach((p) => { const x = excels.find((q) => fin(q.tNombre) && Math.abs(q.tNombre - p.t) < 1e-6); if (x) m.set(p.id, x) })
    if (!m.size) return avisar('Ningún archivo tiene en el nombre un tiempo que coincida con una placa (t2h, 4 h, T=6…).', 'error')
    setPlacas((ps) => ps.map((p) => { const x = m.get(p.id); return x ? { ...p, excelId: x.id, archivo: { nombre: x.nombre, hoja: x.hoja, onda: x.onda }, valores: { ...x.valores } } : p }))
    avisar(`${m.size} placa(s) asociadas por el tiempo del nombre del archivo.`)
  }
  const quitarExcel = (id) => {
    if (placas.some((p) => p.excelId === id) && !window.confirm('Ese archivo está asociado a alguna placa: la placa queda sin datos. ¿Continuar?')) return
    upd((e) => ({ excels: (e.excels || []).filter((x) => x.id !== id), placas: e.placas.map((p) => (p.excelId === id ? { ...p, excelId: null, archivo: null, valores: null } : p)) }))
  }

  // ---------- layout ----------
  const asignar = (ps, v, todas) => {
    setPlacas((lista) => lista.map((p) => {
      if (!todas && p.id !== sel.id) return p
      const lay = { ...p.layout }
      ps.forEach((q) => { if (v) lay[q] = v; else delete lay[q] })
      return { ...p, layout: lay }
    }))
  }
  const hacerAplicar = () => {
    const { que, destinos } = aplicar
    setPlacas((ps) => ps.map((p) => {
      if (!destinos.includes(p.id) || p.id === sel.id) return p
      if (que === 'layout') return { ...p, layout: { ...sel.layout } }
      if (aplicar.modo === 'valor') return { ...p, blancoDe: sel.id }
      const lay = Object.fromEntries(Object.entries(p.layout).filter(([, l]) => !l?.blanco))
      Object.entries(sel.layout).forEach(([k, l]) => { if (l?.blanco) lay[k] = { ...l } })
      return { ...p, layout: lay }
    }).map((p) => (p.id === sel.id && que === 'blanco' && aplicar.modo === 'valor' ? { ...p, blancoDe: null } : p)))
    const n = destinos.filter((d) => d !== sel.id).length
    avisar(que === 'layout' ? `Layout aplicado a ${n} placa(s).` : aplicar.modo === 'valor' ? `${n} placa(s) usan ahora el valor del blanco de t = ${th(sel.t)}.` : `Posición de los blancos copiada a ${n} placa(s).`)
    setAplicar(null)
  }
  const setDilucion = (f, todas) => {
    setPlacas((ps) => ps.map((p) => (todas || p.id === sel.id
      ? { ...p, layout: Object.fromEntries(Object.entries(p.layout).map(([k, l]) => [k, l?.muestra && !l.blanco ? { ...l, factor: f } : l])) }
      : p)))
    avisar(`Dilución ${f === 1 ? 'sin diluir' : `1:${f}`} aplicada a ${todas ? 'todas las placas' : `la placa t = ${th(sel.t)}`}.`)
  }

  // blanco que realmente se usa (sin los pocillos de blanco excluidos en el control de calidad)
  const bReal = sel ? s.serie.extra?.blancos?.find((x) => x.id === sel.id) : null
  const b = sel ? (bReal && !sel.blancoDe ? bReal : blancoDePlaca(sel)) : null
  const nBl = sel ? Object.values(sel.layout).filter((l) => l?.blanco).length : 0
  const origenBl = sel?.blancoDe ? placas.find((p) => p.id === sel.blancoDe) : null
  const bOrigen = origenBl ? blancoDePlaca(origenBl) : null
  const factores = sel ? [...new Set(Object.values(sel.layout).filter((l) => l?.muestra && !l.blanco).map((l) => Number(l.factor) || 1))] : []
  const listas = placas.filter((p) => p.valores && !p.oculta).length
  const usosDe = (id) => placas.filter((p) => p.excelId === id).map((p) => th(p.t))
  const nuevoTiempo = (modo) => setNuevo({ modo, t: placas.length ? placas[placas.length - 1].t + intervalo : 0, desde: 0, hasta: 12, paso: 2, copiar: false })

  return (
    <div className={`pagina ${arrastrando ? 'soltar-aqui' : ''}`} onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setArrastrando(true) } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false) }} onDrop={soltar}>
      <Cinta>
        <Grupo titulo="Tiempos">
          <BotonCinta icono="mas" texto="Agregar tiempo" onClick={() => nuevoTiempo('uno')} tip="Agregar una placa para un tiempo nuevo (empieza vacía)" />
          <BotonCinta simbolo="⋯" texto="Varios tiempos" onClick={() => nuevoTiempo('varios')} tip="Agregar varias placas a intervalo fijo (por ejemplo de 0 a 12 h cada 2 h)" />
        </Grupo>
        <Grupo titulo="Excel">
          <label className="cinta-boton" style={{ cursor: 'pointer' }} data-tip={'Cargar Excel\nLos archivos quedan en la lista «Archivos cargados» y después elegís a qué placa corresponde cada uno.\nSi cargás uno solo y la placa elegida no tiene Excel, se le asocia directamente.'}>
            <Icono n="subir" size={20} /><span>Cargar Excel</span>
            <input type="file" hidden multiple accept={ACEPTA_LIBRO} onChange={(e) => { if (e.target.files.length) cargarExcels([...e.target.files]); e.target.value = '' }} />
          </label>
          <BotonCinta simbolo="t↔" texto="Asociar por nombre" deshabilitado={!excels.length || !placas.length} onClick={asociarPorNombre} tip={'Asociar automáticamente\nCada archivo va a la placa cuyo tiempo figura en su nombre (t2h, 4 h, T=6…)'} />
        </Grupo>
        {sel && (
          <Grupo titulo={`Placa t = ${th(sel.t)}`}>
            <BotonCinta icono="copiar" texto="Aplicar layout a…" deshabilitado={placas.length < 2} onClick={() => setAplicar({ que: 'layout', destinos: placas.map((p) => p.id) })} tip="Copiar la definición de pocillos de esta placa a otras" />
            <BotonCinta simbolo="B" texto="Aplicar blancos a…" deshabilitado={placas.length < 2 || !nBl} onClick={() => setAplicar({ que: 'blanco', modo: 'valor', destinos: placas.map((p) => p.id) })} tip="Usar el valor del blanco de esta placa (o la posición de sus pocillos) en otras" />
            <BotonCinta icono="borrar" texto="Borrar placa" peligro onClick={() => quitar(sel.id)} tip="También con clic derecho sobre el tiempo" />
          </Grupo>
        )}
        {sel && (
          <Grupo titulo="Esta placa">
            <CampoCinta etiqueta="Tiempo (h)"><Num value={sel.t} onChange={(v) => { if (fin(v)) setPlaca(sel.id, { t: v }) }} ancho={64} /></CampoCinta>
            <CampoCinta etiqueta="Excel" tip={sel.archivo ? `Hoja «${sel.archivo.hoja}»${sel.archivo.onda ? ` · ${sel.archivo.onda} nm` : ''}` : 'Elegí uno de los archivos cargados (también los de otras placas)'}>
              <Sel value={sel.excelId || (sel.valores ? '__viejo' : '')} style={{ width: 210 }}
                onChange={(v) => asociar(sel.id, excels.find((x) => x.id === v) || null)}
                opciones={[['', '— Sin Excel —'], ...(sel.valores && !sel.excelId ? [['__viejo', sel.archivo?.nombre || 'Excel anterior']] : []),
                  ...excels.map((x) => { const u = usosDe(x.id).filter((t) => t !== th(sel.t)); return [x.id, `${x.nombre}${u.length ? `  · usado en t = ${u.join(', ')}` : ''}`] })]} />
            </CampoCinta>
            <CampoCinta etiqueta="Dilución" tip="Dilución de todos los pocillos con cepa de esta placa. OD = (lectura − blanco) × factor.">
              <Sel value={factores.length === 1 ? String(factores[0]) : ''} onChange={(v) => v && setDilucion(Number(v), false)}
                opciones={[...(factores.length !== 1 ? [['', factores.length ? 'Varias' : '—']] : []), ...DILUCIONES.map((d) => [String(d), d === 1 ? 'Sin diluir' : `1:${d}`])]} />
            </CampoCinta>
            <BotonCinta icono="copiar" texto="Dilución en todas" deshabilitado={placas.length < 2 || factores.length !== 1} onClick={() => setDilucion(factores[0], true)} tip="Usar la dilución de esta placa en todas las placas" />
          </Grupo>
        )}
        <GrupoCamino s={s} />
        <Grupo titulo="Blanco">
          <BotonCinta simbolo="−B" texto="Restar blanco" activo={exp.aj.corregir_blanco} onClick={() => s.setAj('corregir_blanco', !exp.aj.corregir_blanco)} tip="Restar a cada lectura el promedio de los blancos de su placa" />
        </Grupo>
      </Cinta>
      <Encabezado titulo="Lecturas de OD" sub="Placas por tiempo. Una placa por cada tiempo de lectura. En cada una definí los pocillos (cepa, blanco y dilución) y elegí su Excel. Clic derecho sobre un tiempo para ocultarlo (no entra en la curva) o borrarlo. Podés cargar varios Excel a la vez (Ctrl o Shift en la ventana de archivos) o arrastrarlos sobre la página." />

      {placas.length > 0 && (
        <div className="tiempos">
          {placas.map((p) => {
            const n = Object.values(p.layout).filter((l) => l?.muestra).length
            return (
              <button key={p.id} className={`tiempo ${sel?.id === p.id ? 'on' : ''} ${p.oculta ? 'oculta' : ''}`} onClick={() => setSelId(p.id)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: p.id }) }}>
                <b>t = {th(p.t)}{p.oculta && <Icono n="ojo" size={13} style={{ marginLeft: 6, opacity: 0.7 }} />}</b>
                <small className="estado-t">{p.blancoDe && <span title="Usa el valor del blanco de otra placa">B↗ · </span>}{p.oculta ? 'oculta: no entra en la curva' : <>{p.valores ? <><Icono n="check" size={12} ancho={3} style={{ color: 'var(--ok)' }} />Excel</> : 'sin Excel'} · {n} pocillos</>}</small>
              </button>
            )
          })}
        </div>
      )}
      {menu && (
        <div className="menu-contextual" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setSelId(menu.id); setMenu(null) }}><Icono n="ojo" size={15} />Abrir esta placa</button>
          {(() => { const p = placas.find((x) => x.id === menu.id); return (
            <button onClick={() => { setPlaca(menu.id, { oculta: !p?.oculta }); avisar(p?.oculta ? `t = ${th(p.t)} vuelve a entrar en la curva.` : `t = ${th(p.t)} oculta: no entra en la curva ni en el control de calidad. Clic derecho para mostrarla.`); setMenu(null) }}>
              <Icono n={p?.oculta ? 'ojo' : 'x'} size={15} />{p?.oculta ? 'Mostrar esta placa' : 'Ocultar esta placa'}
            </button>) })()}
          <button className="peligro" style={{ border: 0 }} onClick={() => { const id = menu.id; setMenu(null); quitar(id) }}><Icono n="borrar" size={15} />Borrar esta placa</button>
        </div>
      )}

      {!sel ? (
        <Vacio titulo="Todavía no hay placas">
          Usá <strong>Agregar tiempo</strong> o <strong>Varios tiempos</strong> en la barra de arriba para crear las placas, y <strong>Cargar Excel</strong> para subir las lecturas.
          {excels.length > 0 && <p style={{ marginTop: 10 }}>Ya hay {excels.length} archivo{excels.length > 1 ? 's' : ''} cargado{excels.length > 1 ? 's' : ''} esperando su placa.</p>}
        </Vacio>
      ) : (
        <>
          {excels.length > 0 && (
            <Mosaico titulo={`Archivos cargados (${excels.length})`}>
              <div className="biblioteca horizontal">
                {excels.map((x) => {
                  const u = usosDe(x.id)
                  return (
                    <div key={x.id} className={`item-bib ${sel.excelId === x.id ? 'usado' : ''}`}>
                      <Icono n="archivo" size={14} />
                      <span data-tip={`${x.nombre}\nHoja «${x.hoja}»${u.length ? `\nUsado en: ${u.join(', ')}` : '\nSin placa asociada'}`}>{x.nombre}<br /><small className="ayuda">{u.length ? u.join(', ') : 'sin placa'}</small></span>
                      {sel.excelId !== x.id && <button className="chico" onClick={() => asociar(sel.id, x)} data-tip={`Usar este archivo en t = ${th(sel.t)}`}>Usar</button>}
                      <button className="fantasma icono" aria-label="Quitar archivo" onClick={() => quitarExcel(x.id)}><Icono n="borrar" size={14} /></button>
                    </div>
                  )
                })}
              </div>
            </Mosaico>
          )}
          <div className="tarjeta" style={{ minWidth: 0 }}>
            <h2 style={{ marginTop: 0 }}>Placa t = {th(sel.t)}</h2>
            <div className="info-placa">
              <span><Icono n="archivo" size={14} /> {sel.archivo ? <>{sel.archivo.nombre} <span className="ayuda">· hoja «{sel.archivo.hoja}»</span></> : <span className="ayuda">Sin Excel: elegilo en la cinta («Excel»).</span>}</span>
              {origenBl ? (
                <span>Blanco: usa el <b>valor</b> de t = {th(origenBl.t)}{fin(bOrigen.valor) ? <> ({fx(bOrigen.valor, 4)})</> : ''} <button className="chico" onClick={() => setPlaca(sel.id, { blancoDe: null })}>Usar su propio blanco</button></span>
              ) : nBl ? <span>Blanco: {nBl} pocillo{nBl > 1 ? 's' : ''}{fin(b.valor) ? <> · media <b>{fx(b.valor, 4)}</b>{fin(b.de) ? ` ± ${fx(b.de, 4)}` : ''}</> : ''}</span>
                : <span className="aviso-texto">Esta placa no tiene blanco.</span>}
              <span>Dilución: {factores.length > 1 ? 'varias' : factores.length ? (factores[0] === 1 ? 'sin diluir' : '1:' + factores[0]) : '—'}</span>
            </div>
            <PlacaEditor layout={sel.layout} onAsignar={asignar} cepas={exp.cepas} colores={s.colores} valores={sel.valores} mostrarFactor onNuevaCepa={s.agregarCepa} compacta
              opcionTodas={placas.length > 1 ? `Aplicar también a las demás placas (${placas.length - 1})` : null} />
          </div>
        </>
      )}

      {nuevo && (
        <Modal titulo="Agregar tiempos" onClose={() => setNuevo(null)} ancho={480}
          pie={<><button onClick={() => setNuevo(null)}>Cancelar</button><button className="primario" onClick={crear}>Agregar</button></>}>
          <div className="seg" style={{ marginBottom: 14 }}>
            <button className={nuevo.modo === 'uno' ? 'on' : ''} onClick={() => setNuevo({ ...nuevo, modo: 'uno' })}>Un tiempo</button>
            <button className={nuevo.modo === 'varios' ? 'on' : ''} onClick={() => setNuevo({ ...nuevo, modo: 'varios' })}>Varios a intervalo fijo</button>
          </div>
          {nuevo.modo === 'uno' ? <Campo label="Tiempo (h)"><Num value={nuevo.t} onChange={(v) => setNuevo({ ...nuevo, t: v })} /></Campo> : (
            <div className="fila">
              <Campo label="Desde (h)"><Num value={nuevo.desde} onChange={(v) => setNuevo({ ...nuevo, desde: v })} ancho={90} /></Campo>
              <Campo label="Hasta (h)"><Num value={nuevo.hasta} onChange={(v) => setNuevo({ ...nuevo, hasta: v })} ancho={90} /></Campo>
              <Campo label="Cada (h)"><Num value={nuevo.paso} onChange={(v) => setNuevo({ ...nuevo, paso: v })} ancho={90} /></Campo>
            </div>
          )}
          {sel && <Check label={`Copiar el layout de la placa t = ${th(sel.t)}`} checked={nuevo.copiar} onChange={(v) => setNuevo({ ...nuevo, copiar: v })}
            ayuda="Si no lo marcás, las placas nuevas empiezan vacías." />}
        </Modal>
      )}
      {aplicar && (
        <Modal titulo={aplicar.que === 'layout' ? `Aplicar el layout de t = ${th(sel.t)}` : `Aplicar los blancos de t = ${th(sel.t)}`} onClose={() => setAplicar(null)} ancho={480}
          pie={<><button onClick={() => setAplicar(null)}>Cancelar</button><button className="primario" onClick={hacerAplicar}>Aplicar</button></>}>
          {aplicar.que === 'blanco' && (
            <div className="seg" style={{ marginBottom: 10 }}>
              <button className={aplicar.modo === 'valor' ? 'on' : ''} onClick={() => setAplicar({ ...aplicar, modo: 'valor' })}>Usar el valor de este blanco</button>
              <button className={aplicar.modo === 'posicion' ? 'on' : ''} onClick={() => setAplicar({ ...aplicar, modo: 'posicion' })}>Copiar la posición de los pocillos</button>
            </div>
          )}
          <p className="ayuda">{aplicar.que === 'layout' ? 'Reemplaza la definición de todos los pocillos (cepas, blancos y diluciones) de las placas elegidas.'
            : aplicar.modo === 'valor' ? `Las placas elegidas restan el blanco medido en t = ${th(sel.t)} (${fin(b?.valor) ? fx(b.valor, 4) : 'sin valor'}), en lugar del suyo. Sirve cuando el blanco se leyó en un solo tiempo.`
              : 'Copia solo la ubicación de los pocillos de blanco: cada placa resta el promedio de sus propios pocillos en esas posiciones.'}</p>
          <div className="fila" style={{ marginBottom: 8 }}>
            <button className="chico" onClick={() => setAplicar({ ...aplicar, destinos: placas.map((p) => p.id) })}>Todas</button>
            <button className="chico" onClick={() => setAplicar({ ...aplicar, destinos: [] })}>Ninguna</button>
          </div>
          {placas.filter((p) => p.id !== sel.id).map((p) => (
            <Check key={p.id} label={`t = ${th(p.t)}`} checked={aplicar.destinos.includes(p.id)}
              onChange={(v) => setAplicar({ ...aplicar, destinos: v ? [...aplicar.destinos, p.id] : aplicar.destinos.filter((x) => x !== p.id) })} />
          ))}
        </Modal>
      )}
    </div>
  )
}
