import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo, Select } from './ui.jsx'
import { excelDe } from '../excel.js'
import { descargarBlob } from '../utils.js'

// Tabla con filtro por columna (botón ▾), columnas movibles, orden por clic y descarga a Excel
const num = (v) => (typeof v === 'number' ? v : NaN)

// Filtro de una columna. Numéricas: >0.3  <=0.5  =1  !=2  0.1..0.4  (varias condiciones separadas por espacio).
const OPERADORES = [['gt', 'Mayor que'], ['ge', 'Mayor o igual que'], ['lt', 'Menor que'], ['le', 'Menor o igual que'], ['eq', 'Igual a'], ['entre', 'Entre']]

function cumpleNum(valor, f) {
  const a = parseFloat(String(f?.a ?? '').replace(',', '.'))
  if (!f || !Number.isFinite(a)) return true
  const x = num(valor)
  if (!Number.isFinite(x)) return false
  const b = parseFloat(String(f.b ?? '').replace(',', '.'))
  switch (f.op) {
    case 'gt': return x > a
    case 'ge': return x >= a
    case 'lt': return x < a
    case 'le': return x <= a
    case 'eq': return Math.abs(x - a) < 1e-9
    case 'entre': return Number.isFinite(b) ? x >= Math.min(a, b) && x <= Math.max(a, b) : x >= a
    default: return true
  }
}

const filtroActivo = (f) => f && Number.isFinite(parseFloat(String(f.a ?? '').replace(',', '.')))
const resumenFiltro = (f) => {
  const op = { gt: '>', ge: '≥', lt: '<', le: '≤', eq: '=' }[f.op]
  return f.op === 'entre' ? `entre ${f.a} y ${f.b || '…'}` : `${op} ${f.a}`
}

function PopoverFiltro({ col, pos, valor, onChange, onClose }) {
  const ref = useRef()
  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const tecla = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])
  const f = valor || { op: 'gt', a: '', b: '' }
  const set = (k, v) => onChange({ ...f, [k]: v })
  return (
    <div ref={ref} className="popover-filtro" style={{ left: pos.x, top: pos.y }}>
      <h5>Filtrar: {col.replace(/_/g, ' ')}</h5>
      <Select value={f.op} onChange={(v) => set('op', v)} opciones={OPERADORES} />
      <Campo label={f.op === 'entre' ? 'Desde' : 'Valor'}>
        <input autoFocus type="number" step="any" value={f.a} onChange={(e) => set('a', e.target.value)} />
      </Campo>
      {f.op === 'entre' && (
        <Campo label="Hasta"><input type="number" step="any" value={f.b} onChange={(e) => set('b', e.target.value)} /></Campo>
      )}
      <div className="fila-ctrl">
        <button className="chico" onClick={() => { onChange(null); onClose() }}>Quitar filtro</button>
        <button className="chico primario" onClick={onClose}>Listo</button>
      </div>
    </div>
  )
}

export function TablaAvanzada({ id, titulo, columnas, filas, onVista }) {
  const [orden, setOrden] = useState(columnas)
  const [filtros, setFiltros] = useState({})
  const [abierto, setAbierto] = useState(null)
  const [sort, setSort] = useState(null)
  const [limite, setLimite] = useState(300)
  const arrastre = useRef(null)
  useEffect(() => { setOrden((o) => (columnas.every((c) => o.includes(c)) && o.length === columnas.length ? o : columnas)) }, [columnas.join('|')])

  const esNum = useMemo(() => Object.fromEntries(columnas.map((c) => [c, filas.some((f) => typeof f[c] === 'number')])), [columnas, filas])
  const vista = useMemo(() => {
    let r = filas.filter((f) => orden.every((c) => !esNum[c] || cumpleNum(f[c], filtros[c])))
    if (sort) {
      const k = sort.col
      r = [...r].sort((a, b) => {
        const x = a[k], y = b[k]
        const c = esNum[k] ? (num(x) || 0) - (num(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''))
        return sort.dir === 'asc' ? c : -c
      })
    }
    return r
  }, [filas, filtros, sort, orden, esNum])

  useEffect(() => { onVista(id, { nombre: titulo, columnas: orden, filas: vista }) }, [vista, orden])

  const soltar = (destino) => {
    const o = arrastre.current
    if (!o || o === destino) return
    const nuevo = orden.filter((c) => c !== o)
    nuevo.splice(nuevo.indexOf(destino), 0, o)
    setOrden(nuevo)
  }
  const hayFiltro = Object.values(filtros).some(filtroActivo)

  return (
    <section className="tarjeta">
      <div className="titulo-fila">
        <h2>{titulo} <small className="ayuda">({vista.length} de {filas.length} filas)</small></h2>
        <div className="fila-ctrl" style={{ margin: 0 }}>
          {hayFiltro && <button className="chico" onClick={() => setFiltros({})}>Quitar filtros</button>}
          <button className="chico" onClick={() => { setOrden(columnas); setSort(null) }}>Orden original</button>
          <button className="chico primario" onClick={() => excelDe([{ nombre: titulo, columnas: orden, filas: vista }]).then((b) => descargarBlob(b, `${id}_curvas.xlsx`))}>Descargar Excel</button>
        </div>
      </div>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              {orden.map((c) => (
                <th key={c} draggable onDragStart={() => { arrastre.current = c }} onDragOver={(e) => e.preventDefault()}
                  onDrop={() => soltar(c)} title="Arrastrá para mover la columna · clic para ordenar"
                  onClick={() => setSort(sort?.col === c ? (sort.dir === 'asc' ? { col: c, dir: 'desc' } : null) : { col: c, dir: 'asc' })}>
                  <span className="agarre">⋮⋮</span> {c.replace(/_/g, ' ')}
                  {sort?.col === c && <span> {sort.dir === 'asc' ? '▲' : '▼'}</span>}
                  {esNum[c] && (
                    <button className={`th-filtro ${filtroActivo(filtros[c]) ? 'activo' : ''}`}
                      title={filtroActivo(filtros[c]) ? `Filtro: ${resumenFiltro(filtros[c])}` : 'Filtrar esta columna'}
                      onClick={(e) => {
                        e.stopPropagation()
                        const r = e.currentTarget.getBoundingClientRect()
                        setAbierto({ col: c, pos: { x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 6 } })
                      }}>
                      ▾{filtroActivo(filtros[c]) ? ' ' + resumenFiltro(filtros[c]) : ''}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vista.slice(0, limite).map((f, i) => <tr key={i}>{orden.map((c) => <td key={c}>{f[c]}</td>)}</tr>)}
            {!vista.length && <tr><td colSpan={orden.length} className="ayuda">Ninguna fila cumple los filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      {vista.length > limite && (
        <div className="fila-ctrl">
          <span className="ayuda">Se muestran {limite} de {vista.length} filas (el Excel descargado incluye todas).</span>
          <button className="chico" onClick={() => setLimite(limite + 300)}>Mostrar más</button>
        </div>
      )}
      {abierto && (
        <PopoverFiltro col={abierto.col} pos={abierto.pos} valor={filtros[abierto.col]}
          onChange={(v) => setFiltros((p) => ({ ...p, [abierto.col]: v }))} onClose={() => setAbierto(null)} />
      )}
    </section>
  )
}

