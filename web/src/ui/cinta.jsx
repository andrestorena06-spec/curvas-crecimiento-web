// Cinta de herramientas (estilo Office): cada vista «pone» sus grupos de botones en la cinta de arriba con <Cinta>.
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icono } from './base.jsx'

export const CintaCtx = createContext(null)

// Lo que se ponga dentro aparece en la cinta (portal al nodo de la cinta)
export function Cinta({ children }) {
  const nodo = useContext(CintaCtx)
  return nodo ? createPortal(children, nodo) : null
}

export const Grupo = ({ titulo, children }) => (
  <div className="cinta-grupo">
    <div className="cinta-items">{children}</div>
    {titulo && <div className="cinta-titulo">{titulo}</div>}
  </div>
)

// Botón grande con ícono y texto
export const BotonCinta = ({ icono, texto, onClick, activo, deshabilitado, tip, peligro, simbolo }) => (
  <button className={`cinta-boton ${activo ? 'on' : ''} ${peligro ? 'peligro' : ''}`} onClick={onClick} disabled={deshabilitado} data-tip={tip} aria-pressed={activo || undefined}>
    {simbolo ? <span className="simbolo">{simbolo}</span> : <Icono n={icono} size={20} />}
    <span>{texto}</span>
  </button>
)

// Grupo de opciones excluyentes (como un selector segmentado)
export const OpcionesCinta = ({ valor, onChange, opciones }) => opciones.map(([v, texto, simbolo, icono, tip]) => (
  <BotonCinta key={v} simbolo={simbolo} icono={icono} texto={texto} activo={valor === v} onClick={() => onChange(v)} tip={tip} />
))

// Campo chico dentro de la cinta (número o lista)
export const CampoCinta = ({ etiqueta, children, tip }) => (
  <label className="cinta-campo" data-tip={tip}><span>{etiqueta}</span>{children}</label>
)

// Panel desplegable que baja desde la cinta (ajustes detallados que no entran en ella).
// Todos los menús del programa están arriba: no hay paneles laterales.
export function Cajon({ titulo, abierto, onClose, children }) {
  const nodo = useContext(CintaCtx)
  const [pos, setPos] = useState({ top: 130, left: 0 })
  useLayoutEffect(() => {
    if (!abierto || !nodo) return
    const f = () => { const r = nodo.getBoundingClientRect(); setPos({ top: r.bottom, left: r.left }) }
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [abierto, nodo])
  useEffect(() => {
    if (!abierto) return
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [abierto, onClose])
  if (!abierto) return null
  return (
    <section className="panel-cinta" style={pos} aria-label={titulo}>
      <header><b>{titulo}</b><button className="chico" onClick={onClose}><Icono n="x" size={14} />Cerrar</button></header>
      <div className="cajon-cuerpo">{children}</div>
    </section>
  )
}

// Mosaico (tarjeta redondeada con título y acción opcional)
export const Mosaico = ({ titulo, accion, onAccion, children, className = '', style }) => (
  <section className={`mosaico ${className}`} style={style}>
    {(titulo || accion) && (
      <div className="mosaico-cab">
        {titulo && <h2>{titulo}</h2>}
        {accion && <button className="fantasma chico" onClick={onAccion}>{accion}<Icono n="flecha" size={14} /></button>}
      </div>
    )}
    {children}
  </section>
)
