import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo, Modal, Select } from './ui.jsx'
import { descargarBlob } from '../utils.js'

// ---------------------------------------------------------------
// Ventana de descarga: se elige visualmente la PROPORCIÓN de la figura.
// No recorta: el gráfico se vuelve a componer (márgenes, ejes, textos) con el
// tamaño elegido. La imagen sale del dibujo vectorial, sin perder calidad.
// ---------------------------------------------------------------
const RATIOS = [
  ['libre', 'Libre (arrastrar)'], ['original', 'La de la pantalla'], ['16:9', '16:9 (panorámica)'],
  ['4:3', '4:3'], ['3:2', '3:2'], ['1:1', '1:1 (cuadrada)'], ['2:3', '2:3 (vertical)'],
]
const MAX_PX = 12000
const LIM = { wMin: 360, wMax: 1400, hMin: 240, hMax: 1000 }
const clamp = (v, a, b) => Math.min(Math.max(v, a), b)

export function ExportDialog({ render, size0, nombre, onClose }) {
  const ini = useMemo(() => ({ w: clamp(Math.round(size0.w), 480, 1100), h: clamp(Math.round(size0.h), LIM.hMin, LIM.hMax) }), [size0])
  const [fig, setFig] = useState(ini)
  const [lock, setLock] = useState('libre')
  const [anchoCm, setAnchoCm] = useState(20)
  const [dpi, setDpi] = useState(300)
  const [formato, setFormato] = useState('png')
  const [trabajando, setTrabajando] = useState(false)
  const svgRef = useRef()
  const S = 0.6 // píxeles de pantalla por unidad de figura (fijo, para que el arrastre sea estable)
  const ratioDe = (l) => (l === 'libre' ? null : l === 'original' ? ini.w / ini.h : l.split(':').reduce((a, b) => a / b))
  const r = ratioDe(lock)

  // si el gráfico necesita más alto del elegido (textos grandes), el marco se ajusta a ese mínimo
  useEffect(() => {
    const v = svgRef.current?.viewBox?.baseVal
    if (v && v.height > fig.h + 0.5) setFig((f) => ({ ...f, h: Math.ceil(v.height) }))
  }, [fig])

  const altoCm = (anchoCm * fig.h) / fig.w
  const outW = Math.round((anchoCm / 2.54) * dpi)
  const outH = Math.round((outW * fig.h) / fig.w)
  const demasiado = Math.max(outW, outH) > MAX_PX

  const fijarRatio = (rr, w0) => {
    const w = clamp(w0, Math.max(LIM.wMin, LIM.hMin * rr), Math.min(LIM.wMax, LIM.hMax * rr))
    setFig({ w: Math.round(w), h: Math.round(w / rr) })
  }
  const elegirRatio = (l) => {
    setLock(l)
    const rr = ratioDe(l)
    if (rr) fijarRatio(rr, fig.w)
  }

  const arrastrar = (dir) => (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    const p0 = { x: ev.clientX, y: ev.clientY }
    const f0 = { ...fig }
    const mover = (e) => {
      const dx = (e.clientX - p0.x) / S
      const dy = (e.clientY - p0.y) / S
      if (r) {
        fijarRatio(r, f0.w + dx)
      } else {
        setFig({
          w: Math.round(dir.includes('e') ? clamp(f0.w + dx, LIM.wMin, LIM.wMax) : f0.w),
          h: Math.round(dir.includes('s') ? clamp(f0.h + dy, LIM.hMin, LIM.hMax) : f0.h),
        })
      }
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const cambiarAlto = (v) => {
    if (!(v > 0)) return
    setLock('libre')
    setFig({ ...fig, h: Math.round(clamp((fig.w * v) / anchoCm, LIM.hMin, LIM.hMax)) })
  }

  const exportar = async () => {
    const svg = svgRef.current
    if (!svg) return
    setTrabajando(true)
    try {
      const c = svg.cloneNode(true)
      c.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      if (formato === 'svg') {
        c.setAttribute('width', `${anchoCm}cm`)
        c.setAttribute('height', `${altoCm}cm`)
        descargarBlob(new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' }), nombre + '.svg')
      } else {
        c.setAttribute('width', outW)
        c.setAttribute('height', outH)
        const img = new Image()
        await new Promise((ok, mal) => {
          img.onload = ok
          img.onerror = mal
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c))
        })
        const cv = document.createElement('canvas')
        cv.width = outW
        cv.height = outH
        const g = cv.getContext('2d')
        g.fillStyle = '#fff'
        g.fillRect(0, 0, outW, outH)
        g.imageSmoothingQuality = 'high'
        g.drawImage(img, 0, 0, outW, outH)
        const blob = await new Promise((ok) => cv.toBlob(ok, formato === 'jpg' ? 'image/jpeg' : 'image/png', 0.95))
        descargarBlob(blob, `${nombre}.${formato}`)
      }
      onClose()
    } catch {
      alert('No se pudo generar la imagen. Probá con un tamaño menor.')
    }
    setTrabajando(false)
  }

  return (
    <Modal titulo="Descargar imagen" onClose={onClose} ancho={1080}
      pie={<><button onClick={onClose}>Cancelar</button>
        <button className="primario" disabled={trabajando || (demasiado && formato !== 'svg')} onClick={exportar}>
          {trabajando ? 'Generando…' : 'Descargar'}</button></>}>
      <div className="export-grid">
        <div>
          <p className="ayuda">Arrastrá el borde derecho, el inferior o la esquina para elegir la proporción. El gráfico se reacomoda solo: ejes, márgenes y textos se adaptan al nuevo tamaño y no se recorta nada.</p>
          <div className="export-escenario">
            <div className="export-fig" style={{ width: fig.w * S, height: fig.h * S }}>
              {render(svgRef, fig)}
              {!r && <span className="asa asa-e" onPointerDown={arrastrar('e')} title="Ancho" />}
              {!r && <span className="asa asa-s" onPointerDown={arrastrar('s')} title="Alto" />}
              <span className="asa asa-se" onPointerDown={arrastrar('se')} title={r ? 'Escala manteniendo la proporción' : 'Ancho y alto'} />
            </div>
          </div>
          <p className="ayuda">Proporción actual: <b>{(fig.w / fig.h).toFixed(2)} : 1</b> ({fig.w} × {fig.h} unidades)</p>
        </div>
        <div className="export-ctrl">
          <Campo label="Proporción">
            <Select value={lock} onChange={elegirRatio} opciones={RATIOS} />
          </Campo>
          <div className="fila-ctrl">
            <Campo label="Ancho (cm)"><input type="number" min="2" step="0.5" value={Number(anchoCm.toFixed(2))} onChange={(e) => setAnchoCm(Number(e.target.value) || 1)} /></Campo>
            <Campo label="Alto (cm)"><input type="number" min="2" step="0.5" value={Number(altoCm.toFixed(2))} onChange={(e) => cambiarAlto(Number(e.target.value))} /></Campo>
          </div>
          <Campo label="Resolución (DPI)">
            <Select value={String(dpi)} onChange={(v) => setDpi(Number(v))}
              opciones={[['150', '150 (pantalla)'], ['300', '300 (impresión)'], ['600', '600 (alta calidad)']]} />
          </Campo>
          <Campo label="Formato">
            <Select value={formato} onChange={setFormato} opciones={[['png', 'PNG'], ['jpg', 'JPG'], ['svg', 'SVG (vectorial)']]} />
          </Campo>
          <button className="ancho" onClick={() => { setFig(ini); setLock('libre') }}>Volver al tamaño de pantalla</button>
          <p className="ayuda">
            {formato === 'svg' ? 'Vectorial: se puede ampliar sin pérdida de calidad.' : `Salida: ${outW} × ${outH} px`}
            {demasiado && formato !== 'svg' && <b style={{ color: 'var(--peligro)' }}> — demasiado grande, bajá el ancho o los DPI.</b>}
          </p>
        </div>
      </div>
    </Modal>
  )
}
