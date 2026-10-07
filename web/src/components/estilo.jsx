import { useState } from 'react'
import { ejeDefecto } from './charts.jsx'
import { Campo, Modal, Select } from './ui.jsx'

const t = (size, color = '#1f2933', extra = {}) => ({
  size, color, bold: false, italic: false, underline: false, strike: false, texto: '', ...extra,
})

// Cada texto del gráfico tiene su propio formato. `texto` vacío = texto por defecto.
export const estiloCurvaDefecto = () => ({
  titulo: t(18, '#1f2933', { bold: true }),
  leyendaX: t(14),
  leyendaY: t(14),
  numerosX: t(12),
  numerosY: t(12),
  leyenda: t(12),
})

export const ejesDefecto = () => ({ x: ejeDefecto(), y: ejeDefecto() })

export function normalizarEstilo(e = {}) {
  const base = estiloCurvaDefecto()
  const out = {}
  for (const k of Object.keys(base)) out[k] = { ...base[k], ...(e[k] && typeof e[k] === 'object' ? e[k] : {}) }
  return out
}
export function normalizarEjes(e = {}) {
  const b = ejesDefecto()
  const mezclar = (x, d) => ({ ...d, ...(x || {}), pers: { ...d.pers, ...(x?.pers || {}), items: x?.pers?.items || [] } })
  return { x: mezclar(e.x, b.x), y: mezclar(e.y, b.y) }
}

function Formato({ v, onChange, compacto }) {
  const set = (k, x) => onChange({ ...v, [k]: x })
  return (
    <div className="fila-ctrl" style={{ margin: 0 }}>
      <Campo label={compacto ? '' : 'Tamaño (px)'}>
        <input type="number" min="6" max="60" style={{ width: compacto ? 64 : undefined }} value={v.size} onChange={(e) => set('size', Number(e.target.value) || 12)} />
      </Campo>
      <Campo label={compacto ? '' : 'Color'}>
        <input type="color" value={v.color} onChange={(e) => set('color', e.target.value)} />
      </Campo>
      <Campo label={compacto ? '' : 'Estilo'}>
        <div className="seg">
          <button title="Negrita" className={v.bold ? 'on' : ''} onClick={() => set('bold', !v.bold)}><b>N</b></button>
          <button title="Cursiva" className={v.italic ? 'on' : ''} onClick={() => set('italic', !v.italic)}><i>C</i></button>
          <button title="Subrayado" className={v.underline ? 'on' : ''} onClick={() => set('underline', !v.underline)}><u>S</u></button>
          <button title="Tachado" className={v.strike ? 'on' : ''} onClick={() => set('strike', !v.strike)}><s>T</s></button>
        </div>
      </Campo>
    </div>
  )
}

function Bloque({ titulo, v, onChange, conTexto, placeholder }) {
  const deco = [v.underline && 'underline', v.strike && 'line-through'].filter(Boolean).join(' ')
  return (
    <div className="bloque-estilo">
      <h4>{titulo}</h4>
      {conTexto && (
        <Campo label="Texto">
          <input value={v.texto || ''} placeholder={placeholder} onChange={(e) => onChange({ ...v, texto: e.target.value })} />
        </Campo>
      )}
      <div className="fila-ctrl" style={{ margin: 0 }}>
        <Formato v={v} onChange={onChange} />
        <div className="muestra-estilo" style={{ fontSize: Math.min(v.size, 26), color: v.color, textDecoration: deco || 'none',
          fontWeight: v.bold ? 700 : 400, fontStyle: v.italic ? 'italic' : 'normal' }}>Abc 0.123</div>
      </div>
    </div>
  )
}

function ConfigEje({ titulo, cfg, onChange }) {
  const [nuevo, setNuevo] = useState({ pos: '', texto: '' })
  const items = cfg.pers.items
  const setItems = (it) => onChange({ ...cfg, pers: { ...cfg.pers, items: it } })
  return (
    <div className="bloque-estilo">
      <h4>{titulo}</h4>
      <div className="fila-ctrl">
        <Campo label="Cantidad de etiquetas">
          <Select value={cfg.modo} onChange={(v) => onChange({ ...cfg, modo: v })}
            opciones={[['auto', 'Automática'], ['n', 'Cantidad fija'], ['manual', 'Lista manual']]} />
        </Campo>
        {cfg.modo === 'n' && (
          <Campo label="Cantidad"><input type="number" min="2" max="30" style={{ width: 80 }} value={cfg.n} onChange={(e) => onChange({ ...cfg, n: Number(e.target.value) || 6 })} /></Campo>
        )}
        {cfg.modo === 'manual' && (
          <Campo label="Valores separados por coma"><input value={cfg.valores} placeholder="Ej.: 0, 4, 8, 12" onChange={(e) => onChange({ ...cfg, valores: e.target.value })} /></Campo>
        )}
      </div>
      <label className="check"><input type="checkbox" checked={!!cfg.pers.ocultarAuto} onChange={(e) => onChange({ ...cfg, pers: { ...cfg.pers, ocultarAuto: e.target.checked } })} />
        <span>Ocultar las etiquetas automáticas (solo se ven las personalizadas)</span></label>
      <p className="ayuda" style={{ marginBottom: 4 }}><b>Etiquetas personalizadas</b>: reemplazan el número de esa posición o agregan una nueva.</p>
      {items.map((it, i) => (
        <div key={i} className="fila-ctrl fila-pers">
          <input type="number" step="any" style={{ width: 80 }} value={it.pos} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)))} title="Posición en el eje" />
          <input value={it.texto} style={{ width: 130 }} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} title="Texto" />
          <Formato compacto v={it.est} onChange={(est) => setItems(items.map((x, j) => (j === i ? { ...x, est } : x)))} />
          <button className="chico peligro" onClick={() => setItems(items.filter((_, j) => j !== i))}>Borrar</button>
        </div>
      ))}
      <div className="fila-ctrl">
        <input type="number" step="any" style={{ width: 90 }} placeholder="Posición" value={nuevo.pos} onChange={(e) => setNuevo({ ...nuevo, pos: e.target.value })} />
        <input placeholder="Texto" style={{ width: 150 }} value={nuevo.texto} onChange={(e) => setNuevo({ ...nuevo, texto: e.target.value })} />
        <button className="chico" disabled={nuevo.pos === '' || !nuevo.texto.trim()}
          onClick={() => { setItems([...items, { pos: nuevo.pos, texto: nuevo.texto.trim(), est: t(12) }]); setNuevo({ pos: '', texto: '' }) }}>Agregar</button>
      </div>
    </div>
  )
}

export function EstiloCurvaDialog({ estilo, ejes, xDefecto, yDefecto, onGuardar, onClose, conLeyenda = true }) {
  const [e, setE] = useState(estilo)
  const [x, setX] = useState(ejes)
  const up = (k) => (v) => setE({ ...e, [k]: v })
  return (
    <Modal titulo="Estilo de texto y ejes del gráfico" onClose={onClose} ancho={680}
      pie={<><button onClick={onClose}>Cancelar</button><button className="primario" onClick={() => onGuardar(e, x)}>Aplicar</button></>}>
      <p className="ayuda">Cada texto tiene su propio formato. Si dejás un texto vacío se usa el automático.</p>
      <Bloque titulo="Título del gráfico" v={e.titulo} onChange={up('titulo')} conTexto placeholder="(sin título)" />
      <Bloque titulo="Leyenda del eje X" v={e.leyendaX} onChange={up('leyendaX')} conTexto placeholder={xDefecto} />
      <Bloque titulo="Leyenda del eje Y" v={e.leyendaY} onChange={up('leyendaY')} conTexto placeholder={yDefecto} />
      <Bloque titulo="Números del eje X" v={e.numerosX} onChange={up('numerosX')} />
      <Bloque titulo="Números del eje Y" v={e.numerosY} onChange={up('numerosY')} />
      {conLeyenda && <Bloque titulo="Leyenda de las curvas (nombres de muestras o réplicas)" v={e.leyenda} onChange={up('leyenda')} />}
      <ConfigEje titulo="Eje X: etiquetas" cfg={x.x} onChange={(c) => setX({ ...x, x: c })} />
      <ConfigEje titulo="Eje Y: etiquetas" cfg={x.y} onChange={(c) => setX({ ...x, y: c })} />
    </Modal>
  )
}
