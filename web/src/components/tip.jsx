import { useEffect, useRef, useState } from 'react'

// Información al pasar el mouse, inmediata y en todos lados:
//  · cualquier elemento con data-tip="texto" (también dentro de gráficos SVG) muestra un globo con ese texto;
//    la primera línea va en negrita y las demás pueden ser fórmulas o desarrollo de cálculo (se respetan los saltos de línea);
//  · los atributos title de los elementos HTML se convierten solos en ese mismo globo (el nativo tarda y a veces no sale).
// Se monta una sola vez en la aplicación.
export function GloboInfo() {
  const [t, setT] = useState(null)
  const caja = useRef(null)
  useEffect(() => {
    let actual = null
    const buscar = (el) => {
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        if (e.hasAttribute('title') && e.namespaceURI === 'http://www.w3.org/1999/xhtml') {
          e.setAttribute('data-tip', e.getAttribute('title'))
          e.removeAttribute('title')
        }
        const v = e.getAttribute('data-tip')
        if (v) return { el: e, txt: v }
      }
      return null
    }
    const mover = (e) => {
      const f = buscar(e.target)
      if (!f) { if (actual) { actual = null; setT(null) } return }
      actual = f.el
      setT({ txt: f.txt, x: e.clientX, y: e.clientY })
    }
    const salir = () => { actual = null; setT(null) }
    document.addEventListener('mousemove', mover)
    document.addEventListener('mouseleave', salir)
    document.addEventListener('mousedown', salir)
    window.addEventListener('scroll', salir, true)
    return () => {
      document.removeEventListener('mousemove', mover); document.removeEventListener('mouseleave', salir)
      document.removeEventListener('mousedown', salir); window.removeEventListener('scroll', salir, true)
    }
  }, [])
  if (!t) return null
  const [tit, ...resto] = t.txt.split('\n')
  const W = window.innerWidth, H = window.innerHeight
  const ancho = 340
  const left = Math.min(Math.max(8, t.x + 14), W - ancho - 8)
  const abajo = t.y + 16 + 200 < H
  return (
    <div ref={caja} className="globo-info" style={{ left, top: abajo ? t.y + 16 : undefined, bottom: abajo ? undefined : H - t.y + 12, maxWidth: ancho }}>
      <b>{tit}</b>
      {resto.length > 0 && <div className="globo-cuerpo">{resto.join('\n')}</div>}
    </div>
  )
}

// Nota explicativa que no ocupa lugar: un ícono ⓘ que muestra su contenido (puede llevar formato) al pasar el mouse.
export function Nota({ children, titulo }) {
  return (
    <span className="nota" tabIndex={0}>
      <i aria-hidden>ⓘ</i>{titulo && <span className="nota-t">{titulo}</span>}
      <span className="nota-cont">{children}</span>
    </span>
  )
}
