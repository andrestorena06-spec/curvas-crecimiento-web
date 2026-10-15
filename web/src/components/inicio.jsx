import { useState } from 'react'
import { Modal } from './ui.jsx'
import { Icono, Ilustracion } from './iconos.jsx'
import { MODOS, ORIGENES_OD } from '../experimento.js'

const ICONO_ORIGEN = { tecan: 'tecan', placa: 'placa', manual: 'odmanual' }

// Pantalla de inicio / nuevo experimento: ¿solo OD, OD + conteo o solo conteo? y, si hay OD, de dónde sale.
export function Elegir({ onCrear, nombreSugerido, onCancelar }) {
  const [modo, setModo] = useState('')
  const [origen, setOrigen] = useState('tecan')
  const [nombre, setNombre] = useState(nombreSugerido || '')
  const conOd = modo === 'od' || modo === 'ambos'
  return (
    <div className="inicio">
      <h2>¿Qué vas a analizar?</h2>
      <div className="tarjetas-modo">
        {Object.entries(MODOS).map(([id, m]) => (
          <button key={id} className={`tarjeta-modo ${modo === id ? 'on' : ''}`} onClick={() => setModo(id)}>
            <Ilustracion tipo={id} />
            <b>{m.titulo}</b><span>{m.texto}</span>
          </button>
        ))}
      </div>
      {conOd && (
        <>
          <h3>Origen de la OD</h3>
          <div className="tarjetas-modo">
            {Object.entries(ORIGENES_OD).map(([id, m]) => (
              <button key={id} className={`tarjeta-modo chica ${origen === id ? 'on' : ''}`} onClick={() => setOrigen(id)}>
                <span className="ico-origen"><Icono n={ICONO_ORIGEN[id]} size={22} /></span>
                <b>{m.titulo}</b><span>{m.texto}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {modo && (
        <div className="fila-ctrl" style={{ marginTop: 16 }}>
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
    <Modal titulo="Nuevo experimento" onClose={onClose} ancho={860}>
      <Elegir onCrear={onCrear} onCancelar={onClose} nombreSugerido={nombreSugerido} />
    </Modal>
  )
}
