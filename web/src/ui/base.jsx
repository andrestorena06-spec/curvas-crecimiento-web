import { useEffect, useRef, useState } from 'react'

export const Campo = ({ label, children, ayuda, style }) => (
  <label className="campo" style={style}>
    <span>{label}{ayuda && <i data-tip={ayuda} style={{ marginLeft: 5, fontStyle: 'normal', color: 'var(--acento)' }}>ⓘ</i>}</span>
    {children}
  </label>
)

// Número con texto libre: acepta coma decimal y vacío
export function Num({ value, onChange, step = 'any', min, max, style, placeholder, ancho }) {
  const [txt, setTxt] = useState(value === '' || value === null || value === undefined || Number.isNaN(value) ? '' : String(value).replace('.', ','))
  const ultimo = useRef(value)
  useEffect(() => {
    if (value !== ultimo.current) { setTxt(value === '' || value === null || value === undefined || Number.isNaN(value) ? '' : String(value).replace('.', ',')); ultimo.current = value }
  }, [value])
  return (
    <input inputMode="decimal" value={txt} placeholder={placeholder} step={step} min={min} max={max} style={{ width: ancho, ...style }}
      onChange={(e) => {
        const t = e.target.value
        setTxt(t)
        const s = t.trim().replace(',', '.')
        if (s === '') { ultimo.current = ''; onChange(''); return }
        const n = Number(s)
        if (Number.isFinite(n)) { ultimo.current = n; onChange(n) }
      }} />
  )
}

// Tablas para cargar datos: las flechas mueven el cursor entre casillas y Enter baja a la fila siguiente
export function navegarTabla(e) {
  const k = e.key
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(k) || e.target.tagName !== 'INPUT') return
  const td = e.target.closest('td'), tr = td?.parentElement
  if (!tr) return
  const col = [...tr.children].indexOf(td)
  const conInput = (c) => c && c.querySelector('input')
  let destino = null
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    const paso = k === 'ArrowLeft' ? -1 : 1
    for (let j = col + paso; j >= 0 && j < tr.children.length && !destino; j += paso) if (conInput(tr.children[j])) destino = tr.children[j]
  } else {
    let f = k === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling
    while (f && !conInput(f.children[col])) f = k === 'ArrowUp' ? f.previousElementSibling : f.nextElementSibling
    destino = f?.children[col]
  }
  e.preventDefault()
  if (!destino) return
  const inp = destino.querySelector('input')
  inp.focus()
  inp.select()
}

export const Sel = ({ value, onChange, opciones, style }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={style}>
    {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
  </select>
)

export const Check = ({ label, checked, onChange, ayuda }) => (
  <label className="check">
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}{ayuda && <small>{ayuda}</small>}</span>
  </label>
)

export const Seg = ({ value, onChange, opciones }) => (
  <div className="seg">
    {opciones.map(([v, t]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}
  </div>
)

export function Modal({ titulo, children, pie, onClose, ancho = 560 }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" style={{ maxWidth: ancho }} role="dialog" aria-modal="true">
        <header><b>{titulo}</b>{onClose && <button className="fantasma icono" aria-label="Cerrar" onClick={onClose}><Icono n="x" /></button>}</header>
        <div className="cuerpo">{children}</div>
        {pie && <footer>{pie}</footer>}
      </div>
    </div>
  )
}

export const Vacio = ({ titulo, children, accion }) => (
  <div className="vacio">
    {titulo && <b>{titulo}</b>}
    <div>{children}</div>
    {accion && <div style={{ marginTop: 14 }}>{accion}</div>}
  </div>
)

export const Encabezado = ({ titulo, sub, children }) => (
  <div className="encabezado">
    <div><h1>{titulo}</h1>{sub && <p className="sub">{sub}</p>}</div>
    {children && <div className="fila">{children}</div>}
  </div>
)

// Zona para soltar o elegir un archivo
export function ZonaCarga({ onArchivos, acepta, titulo = 'Elegí o soltá un archivo', texto, multiple = false, compacta = false }) {
  const ref = useRef()
  const [sobre, setSobre] = useState(false)
  return (
    <div className={`zona-carga ${sobre ? 'sobre' : ''}`} style={compacta ? { padding: 14 } : undefined}
      onClick={() => ref.current.click()} onDragOver={(e) => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); if (e.dataTransfer.files.length) onArchivos([...e.dataTransfer.files]) }}>
      <Icono n="subir" size={compacta ? 20 : 26} />
      <b>{titulo}</b>
      {texto && <small>{texto}</small>}
      <input ref={ref} type="file" hidden multiple={multiple} accept={acepta} onChange={(e) => { if (e.target.files.length) onArchivos([...e.target.files]); e.target.value = '' }} />
    </div>
  )
}

// Globo de ayuda global: cualquier elemento con data-tip muestra su texto (la primera línea en negrita)
export function Globo() {
  const [g, setG] = useState(null)
  useEffect(() => {
    const mover = (e) => {
      const el = e.target.closest?.('[data-tip]')
      if (!el || !el.dataset.tip) return setG(null)
      const x = Math.min(e.clientX + 14, window.innerWidth - 450)
      const y = e.clientY + 16 > window.innerHeight - 160 ? e.clientY - 120 : e.clientY + 16
      setG({ x, y, t: el.dataset.tip })
    }
    const salir = () => setG(null)
    window.addEventListener('mousemove', mover)
    window.addEventListener('scroll', salir, true)
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('scroll', salir, true) }
  }, [])
  if (!g) return null
  const [t1, ...resto] = g.t.split('\n')
  return <div className="globo" style={{ left: g.x, top: g.y }}>{resto.length ? <><b>{t1}</b>{resto.join('\n')}</> : t1}</div>
}

// Íconos de trazo (24 × 24)
const P = {
  x: 'M6 6l12 12M18 6L6 18',
  subir: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  bajar: 'M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  mas: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  flecha: 'M9 6l6 6-6 6',
  abajo: 'M6 9l6 6 6-6',
  sol: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  luna: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z',
  archivo: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  carpeta: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  guardar: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8V3M7 21v-7h10v7',
  nuevo: 'M12 8v8M8 12h8M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  placa: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01M8 17h.01',
  escudo: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4',
  curva: 'M4 4v16h16M7 16c3 0 4-1 6-5s3-5 6-5',
  tabla: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  libro: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5A2.5 2.5 0 0 0 6.5 24H20',
  sigma: 'M18 5H7l6 7-6 7h11',
  colonia: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9h.01M14 8h.01M15 13h.01M10 14h.01M12 11h.01',
  combinar: 'M4 18h16M4 18V6M6 15c3 0 4-6 7-8M6 13c4 0 6-1 8-6M15 9l3-3',
  cubeta: 'M8 3h8M9 3v15a3 3 0 0 0 6 0V3M9 12h6',
  tecan: 'M3 7h18v12H3zM6 7V5h12v2M7 11h10v4H7z',
  tiempo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3',
  borrar: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  copiar: 'M8 8h12v12H8zM4 16V4h12',
  ojo: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  imprimir: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  editar: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  refrescar: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
}
export const Icono = ({ n, size = 18, ancho = 1.8, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ancho} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style}>
    <path d={P[n] || P.info} />
  </svg>
)
