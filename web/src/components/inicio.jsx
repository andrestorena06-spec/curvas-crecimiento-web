import { useState } from 'react'
import { Modal } from './ui.jsx'
import { MODOS, ORIGENES_OD } from '../experimento.js'

// Pantalla de inicio / nuevo experimento: ¿solo OD, OD + conteo o solo conteo? y, si hay OD, de dónde sale.
export function Elegir({ onCrear, nombreSugerido, onCancelar }) {
  const [modo, setModo] = useState('')
  const [origen, setOrigen] = useState('tecan')
  const [nombre, setNombre] = useState(nombreSugerido || '')
  const conOd = modo === 'od' || modo === 'ambos'
  return (
    <div className="inicio">
      <h2>¿Qué vas a analizar?</h2>
      <p className="ayuda">Elegí el tipo de experimento. Después cargás los datos, y las condiciones se completan en el primer cuadro. Podés cambiarlo más adelante.</p>
      <div className="tarjetas-modo">
        {Object.entries(MODOS).map(([id, m]) => (
          <button key={id} className={`tarjeta-modo ${modo === id ? 'on' : ''}`} onClick={() => setModo(id)}>
            <b>{m.titulo}</b><span>{m.texto}</span>
          </button>
        ))}
      </div>
      {conOd && (
        <>
          <h3>¿De dónde sale la OD?</h3>
          <div className="tarjetas-modo">
            {Object.entries(ORIGENES_OD).map(([id, m]) => (
              <button key={id} className={`tarjeta-modo chica ${origen === id ? 'on' : ''}`} onClick={() => setOrigen(id)}>
                <b>{m.titulo}</b><span>{m.texto}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {modo && (
        <div className="fila-ctrl" style={{ marginTop: 14 }}>
          <input className="grande" placeholder="Nombre del experimento (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCrear({ modo, origenOd: origen, nombre: nombre.trim() })} />
          <button className="primario" onClick={() => onCrear({ modo, origenOd: origen, nombre: nombre.trim() })}>Crear experimento</button>
          {onCancelar && <button onClick={onCancelar}>Cancelar</button>}
        </div>
      )}
    </div>
  )
}

export function NuevoExperimentoModal({ onCrear, onClose, nombreSugerido }) {
  return (
    <Modal titulo="Nuevo experimento" onClose={onClose} ancho={820}>
      <Elegir onCrear={onCrear} onCancelar={onClose} nombreSugerido={nombreSugerido} />
    </Modal>
  )
}
