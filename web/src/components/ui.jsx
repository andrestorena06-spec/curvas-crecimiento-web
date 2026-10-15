import { useEffect, useState } from 'react'

export function Modal({ titulo, children, pie, onClose, ancho = 520 }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose && onClose()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onClose])
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="modal" style={{ maxWidth: ancho }}>
        <div className="modal-cab">
          <h3>{titulo}</h3>
          {onClose && <button className="icono" onClick={onClose} aria-label="Cerrar">×</button>}
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>
  )
}

export const Check = ({ label, checked, onChange, ayuda }) => (
  <label className="check">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}{ayuda && <small>{ayuda}</small>}</span>
  </label>
)

export const Campo = ({ label, children }) => (
  <div className="campo"><label>{label}</label>{children}</div>
)

export const Select = ({ value, onChange, opciones }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
  </select>
)

export const Num = ({ value, onChange, min, max, step = 1 }) => (
  <input type="number" value={value} min={min} max={max} step={step}
    onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
)

export const Panel = ({ titulo, children }) => (
  <aside className="lateral">{titulo && <h2>{titulo}</h2>}{children}</aside>
)

// ---- Menú contextual (clic derecho sobre un gráfico) ----
export function useMenuContextual() {
  const [menu, setMenu] = useState(null)
  useEffect(() => {
    if (!menu) return
    const cerrar = () => setMenu(null)
    window.addEventListener('click', cerrar)
    window.addEventListener('scroll', cerrar, true)
    return () => {
      window.removeEventListener('click', cerrar)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [menu])
  const abrir = (e) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }
  return [menu, abrir, () => setMenu(null)]
}

export function MenuContextual({ menu, items }) {
  if (!menu) return null
  return (
    <div className="menu-ctx" style={{ left: menu.x, top: menu.y }}>
      {items.map(([t, f]) => <button key={t} onClick={f}>{t}</button>)}
    </div>
  )
}


