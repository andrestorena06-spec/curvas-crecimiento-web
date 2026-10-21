// Guardar un gráfico como imagen: un solo botón abre esta ventana para elegir formato, tamaño,
// resolución, fondo y nombre, con una vista previa del resultado.
// También el contexto con el que el clic derecho de un gráfico abre «Personalizar gráfico».
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { exportarSVG } from '../utils.js'
import { Campo, Modal, Num, Seg } from './base.jsx'

export const GraficoCtx = createContext({ abrirPersonalizar: null })
export const useGraficoCtx = () => useContext(GraficoCtx)

const PRESETS = [['pantalla', 'Como en pantalla'], ['800x500', '800 × 500'], ['1200x750', '1200 × 750'], ['1600x900', '1600 × 900 (16:9)'], ['1000x1000', '1000 × 1000 (cuadrado)'], ['a mano', 'Otro']]

// renderizar(ancho, alto, refSvg, fondoBlanco) dibuja el gráfico con ese tamaño para la vista previa y la descarga
export function ModalGuardarImagen({ nombre, anchoPantalla, altoPantalla, renderizar, onClose }) {
  const [formato, setFormato] = useState('png')
  const [preset, setPreset] = useState('pantalla')
  const [w, setW] = useState(Math.round(anchoPantalla))
  const [h, setH] = useState(Math.round(altoPantalla))
  const [escala, setEscala] = useState('3')
  const [fondo, setFondo] = useState('tema')
  const [nom, setNom] = useState(nombre || 'grafico')
  const [real, setReal] = useState(null)
  const svg = useRef()
  useEffect(() => {
    if (preset === 'pantalla') { setW(Math.round(anchoPantalla)); setH(Math.round(altoPantalla)) }
    else if (preset !== 'a mano') { const [a, b] = preset.split('x').map(Number); setW(a); setH(b) }
  }, [preset, anchoPantalla, altoPantalla])
  useEffect(() => {
    const t = setTimeout(() => { const v = svg.current?.viewBox?.baseVal; if (v) setReal([Math.round(v.width), Math.round(v.height)]) }, 60)
    return () => clearTimeout(t)
  })
  const ancho = Math.max(200, Math.min(4000, Number(w) || 800)), alto = Math.max(150, Math.min(4000, Number(h) || 500))
  const caja = 640, k = Math.min(1, caja / ancho)
  const k2 = Number(escala) || 1
  const guardar = () => {
    if (!svg.current) return
    const fondoColor = fondo === 'transparente' && formato !== 'jpg' ? null : fondo === 'blanco' || formato === 'jpg' && fondo === 'transparente' ? '#ffffff' : undefined
    exportarSVG(svg.current, (nom || 'grafico').replace(/[\\/:*?"<>|]+/g, '_'), formato, fondoColor, formato === 'svg' ? 1 : k2)
    onClose()
  }
  return (
    <Modal titulo="Guardar imagen" onClose={onClose} ancho={720}
      pie={<><button onClick={onClose}>Cancelar</button><button className="primario" onClick={guardar}>Guardar {formato.toUpperCase()}</button></>}>
      <div className="fila" style={{ flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <Campo label="Formato"><Seg value={formato} onChange={setFormato} opciones={[['png', 'PNG'], ['jpg', 'JPG'], ['svg', 'SVG']]} /></Campo>
        <Campo label="Tamaño">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </Campo>
        <Campo label="Ancho (px)"><Num value={w} onChange={(v) => { setW(v); setPreset('a mano') }} ancho={80} /></Campo>
        <Campo label="Alto (px)"><Num value={h} onChange={(v) => { setH(v); setPreset('a mano') }} ancho={80} /></Campo>
        {formato !== 'svg' && <Campo label="Resolución"><Seg value={escala} onChange={setEscala} opciones={[['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4×']]} /></Campo>}
        <Campo label="Fondo"><Seg value={fondo} onChange={setFondo} opciones={[['tema', 'Como se ve'], ['blanco', 'Blanco'], ...(formato !== 'jpg' ? [['transparente', 'Transparente']] : [])]} /></Campo>
        <Campo label="Nombre del archivo"><input value={nom} onChange={(e) => setNom(e.target.value)} style={{ width: 220 }} /></Campo>
      </div>
      <p className="ayuda" style={{ margin: '10px 0 6px' }}>
        Vista previa{real ? ` · ${real[0]} × ${real[1]} px` : ''}{formato !== 'svg' && real ? ` · archivo de ${real[0] * k2} × ${real[1] * k2} px` : ''}{formato === 'svg' ? ' · vectorial: se puede agrandar sin perder calidad' : ''}
      </p>
      <div style={{ width: ancho * k, height: (real ? real[1] : alto) * k, overflow: 'hidden', border: '1px solid var(--borde)', borderRadius: 8, background: fondo === 'transparente' ? 'repeating-conic-gradient(var(--panel2) 0% 25%, transparent 0% 50%) 50% / 16px 16px' : undefined }}>
        <div style={{ width: ancho, transform: `scale(${k})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          {renderizar(ancho, alto, svg, fondo === 'blanco' || formato === 'jpg' && fondo === 'transparente')}
        </div>
      </div>
    </Modal>
  )
}
