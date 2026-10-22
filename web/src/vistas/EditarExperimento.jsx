// Datos del experimento: nombre, condiciones, notas y cepas (agregar, renombrar en todo el experimento o quitar)
import { useState } from 'react'
import { renombrarCepa, usosDeCepa } from '../modelo.js'
import { Campo, Icono, Modal, Num } from '../ui/base.jsx'

export function EditarExperimento({ s, onClose }) {
  const { exp, upd, avisar } = s
  const [nombre, setNombre] = useState(exp.nombre)
  const [cond, setCond] = useState({ ...exp.cond })
  const [nombres, setNombres] = useState(Object.fromEntries(exp.cepas.map((c) => [c, c])))
  const [nueva, setNueva] = useState('')
  const [quitar, setQuitar] = useState([])
  const set = (k, v) => setCond({ ...cond, [k]: v })

  const guardar = () => {
    upd((e) => {
      let x = { ...e, nombre: nombre.trim() || e.nombre, cond: { ...e.cond, ...cond } }
      Object.entries(nombres).forEach(([viejo, n]) => { if (n.trim() && n.trim() !== viejo && !quitar.includes(viejo)) x = { ...x, ...renombrarCepa(x, viejo, n.trim()) } })
      x.cepas = x.cepas.filter((c) => !quitar.includes(c))
      return x
    })
    avisar('Datos del experimento actualizados.')
    onClose()
  }
  const agregar = () => {
    const c = nueva.trim()
    if (!c) return
    if (Object.values(nombres).some((x) => x.toLowerCase() === c.toLowerCase())) return avisar('Esa cepa ya está en la lista.', 'error')
    upd((e) => ({ cepas: [...e.cepas, c] }))
    setNombres({ ...nombres, [c]: c })
    setNueva('')
  }
  return (
    <Modal titulo="Datos del experimento" onClose={onClose} ancho={720}
      pie={<><button onClick={onClose}>Cancelar</button><button className="primario" onClick={guardar}>Guardar cambios</button></>}>
      <div className="grilla-form">
        <Campo label="Nombre" style={{ gridColumn: '1 / -1' }}><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
        <Campo label="Organismo"><input value={cond.organismo || ''} onChange={(e) => set('organismo', e.target.value)} /></Campo>
        <Campo label="Medio"><input value={cond.medio || ''} onChange={(e) => set('medio', e.target.value)} /></Campo>
        <Campo label="Temperatura (°C)"><Num value={cond.temperatura} onChange={(v) => set('temperatura', v)} /></Campo>
        {exp.tipo !== 'ufc' && <Campo label="Longitud de onda (nm)"><Num value={cond.lambda} onChange={(v) => set('lambda', v)} /></Campo>}
        <Campo label="Fecha"><input type="date" value={cond.fecha || ''} onChange={(e) => set('fecha', e.target.value)} /></Campo>
        <Campo label="Equipo"><input value={cond.equipo || ''} placeholder="Ej.: Tecan Infinite M200" onChange={(e) => set('equipo', e.target.value)} /></Campo>
        <Campo label="Notas" style={{ gridColumn: '1 / -1' }}><textarea rows={3} value={cond.notas || ''} placeholder="Observaciones del ensayo, inóculo, agitación…" onChange={(e) => set('notas', e.target.value)} /></Campo>
      </div>
      <h3>Cepas o muestras</h3>
      <p className="ayuda" style={{ marginTop: -4 }}>Al renombrar una cepa el cambio se aplica en todo el experimento: pocillos, placas, lecturas, conteos y colores.</p>
      <div className="lista-cepas-edit">
        {exp.cepas.map((c) => {
          const usos = usosDeCepa(exp, c)
          const fuera = quitar.includes(c)
          return (
            <div key={c} className={`fila ${fuera ? 'tachada' : ''}`}>
              <i className="punto" style={{ background: s.colores[c] || 'var(--tenue)' }} />
              <input value={nombres[c] ?? c} disabled={fuera} onChange={(e) => setNombres({ ...nombres, [c]: e.target.value })} style={{ flex: 1 }} />
              <small className="ayuda" style={{ minWidth: 90 }}>{usos ? `${usos} dato${usos > 1 ? 's' : ''}` : 'sin datos'}</small>
              <button className="fantasma icono" aria-label={fuera ? 'No quitar' : 'Quitar de la lista'} disabled={usos > 0}
                data-tip={usos > 0 ? 'Tiene datos cargados: no se puede quitar' : fuera ? 'No quitar' : 'Quitar de la lista'}
                onClick={() => setQuitar(fuera ? quitar.filter((x) => x !== c) : [...quitar, c])}><Icono n={fuera ? 'refrescar' : 'borrar'} size={15} /></button>
            </div>
          )
        })}
      </div>
      <div className="fila" style={{ marginTop: 10 }}>
        <input value={nueva} placeholder="Agregar cepa…" onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregar() }} style={{ flex: 1, maxWidth: 280 }} />
        <button onClick={agregar}><Icono n="mas" size={15} />Agregar</button>
      </div>
    </Modal>
  )
}
