import { useEffect, useMemo, useRef, useState } from 'react'
import { descargarBlob } from '../utils.js'

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

// ---------------------------------------------------------------
// Ventana de estilo de texto: cada texto del gráfico se configura por separado
// ---------------------------------------------------------------
function BloqueEstilo({ titulo, v, onChange, conTexto, placeholder }) {
  const set = (k, x) => onChange({ ...v, [k]: x })
  const deco = [v.underline && 'underline', v.strike && 'line-through'].filter(Boolean).join(' ')
  return (
    <div className="bloque-estilo">
      <h4>{titulo}</h4>
      {conTexto && (
        <Campo label="Texto">
          <input value={v.texto || ''} placeholder={placeholder} onChange={(e) => set('texto', e.target.value)} />
        </Campo>
      )}
      <div className="fila-ctrl">
        <Campo label="Tamaño (px)">
          <input type="number" min="6" max="60" value={v.size} onChange={(e) => set('size', Number(e.target.value) || 12)} />
        </Campo>
        <Campo label="Color">
          <input type="color" value={v.color} onChange={(e) => set('color', e.target.value)} />
        </Campo>
        <Campo label="Estilo">
          <div className="seg">
            <button title="Negrita" className={v.bold ? 'on' : ''} onClick={() => set('bold', !v.bold)}><b>N</b></button>
            <button title="Cursiva" className={v.italic ? 'on' : ''} onClick={() => set('italic', !v.italic)}><i>C</i></button>
            <button title="Subrayado" className={v.underline ? 'on' : ''} onClick={() => set('underline', !v.underline)}><u>S</u></button>
            <button title="Tachado" className={v.strike ? 'on' : ''} onClick={() => set('strike', !v.strike)}><s>T</s></button>
          </div>
        </Campo>
        <div className="muestra-estilo" style={{ fontSize: Math.min(v.size, 26), color: v.color, textDecoration: deco || 'none',
          fontWeight: v.bold ? 700 : 400, fontStyle: v.italic ? 'italic' : 'normal' }}>Abc 0.123</div>
      </div>
    </div>
  )
}

export function EstiloDialog({ estilo, conClases, ejeDefecto, onGuardar, onClose }) {
  const [e, setE] = useState(estilo)
  const up = (k) => (v) => setE({ ...e, [k]: v })
  return (
    <Modal titulo="Estilo de texto del gráfico" onClose={onClose} ancho={620}
      pie={<><button onClick={onClose}>Cancelar</button><button className="primario" onClick={() => onGuardar(e)}>Aplicar</button></>}>
      <p className="ayuda">Cada texto tiene su propio formato. Si dejás el texto vacío se usa el automático.</p>
      <BloqueEstilo titulo="Título del gráfico" v={e.titulo} onChange={up('titulo')} conTexto placeholder="(sin título)" />
      <BloqueEstilo titulo="Leyenda del eje Y" v={e.leyendaY} onChange={up('leyendaY')} conTexto placeholder={ejeDefecto} />
      <BloqueEstilo titulo="Leyenda del eje X" v={e.leyendaX} onChange={up('leyendaX')} conTexto placeholder="(sin leyenda)" />
      <BloqueEstilo titulo="Etiquetas del eje X (nombres de las muestras)" v={e.nombresX} onChange={up('nombresX')} />
      <BloqueEstilo titulo="Números del eje Y" v={e.numerosY} onChange={up('numerosY')} />
      <BloqueEstilo titulo="Valor medio (y error) sobre cada muestra" v={e.valores} onChange={up('valores')} />
      {conClases && <BloqueEstilo titulo="Marcaciones de clasificación" v={e.clases} onChange={up('clases')} />}
    </Modal>
  )
}

