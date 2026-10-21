// Tablas de carga de datos como una planilla: arrastrar (o Shift + clic) selecciona un rectángulo de celdas,
// Ctrl + C lo copia como texto separado por tabulaciones (se pega directo en Excel) y Ctrl + V sobre una
// celda pega un bloque copiado de Excel desde esa celda hacia la derecha y hacia abajo.
import { useCallback, useRef } from 'react'

const fijarValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set

function activar(tabla) {
  let ancla = null, fin = null, arrastrando = false
  const filas = () => (tabla.tBodies[0] ? [...tabla.tBodies[0].rows] : [])
  const celda = (el) => {
    const td = el?.closest?.('td')
    if (!td || !tabla.contains(td) || td.parentElement.parentElement !== tabla.tBodies[0]) return null
    return { r: filas().indexOf(td.parentElement), c: [...td.parentElement.cells].indexOf(td) }
  }
  const varias = () => ancla && fin && (ancla.r !== fin.r || ancla.c !== fin.c)
  const rango = () => [Math.min(ancla.r, fin.r), Math.max(ancla.r, fin.r), Math.min(ancla.c, fin.c), Math.max(ancla.c, fin.c)]
  const pintar = () => {
    tabla.querySelectorAll('.sel-celda').forEach((x) => x.classList.remove('sel-celda'))
    if (!varias()) return
    const [r0, r1, c0, c1] = rango()
    const fs = filas()
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fs[r]?.cells[c]?.classList.add('sel-celda')
  }
  const limpiar = () => { ancla = fin = null; pintar() }
  const valor = (td) => {
    if (!td) return ''
    const i = td.querySelector('input, select')
    if (i) return i.tagName === 'SELECT' ? (i.selectedOptions[0]?.text || '') : i.value || ''
    return td.innerText.trim()
  }

  const abajo = (e) => {
    if (e.button !== 0) return
    const x = celda(e.target)
    if (!x) return
    if (e.shiftKey && ancla) { fin = x; e.preventDefault(); pintar(); return }
    ancla = x; fin = x; arrastrando = true; pintar()
  }
  const encima = (e) => {
    if (!arrastrando || !ancla) return
    const x = celda(e.target)
    if (!x || (x.r === fin.r && x.c === fin.c)) return
    fin = x
    if (document.activeElement && tabla.contains(document.activeElement)) document.activeElement.blur()
    window.getSelection()?.removeAllRanges()
    pintar()
  }
  const arriba = () => { arrastrando = false }
  const copiar = (e) => {
    if (!varias()) return
    const [r0, r1, c0, c1] = rango()
    const fs = filas()
    const tsv = []
    for (let r = r0; r <= r1; r++) { const linea = []; for (let c = c0; c <= c1; c++) linea.push(valor(fs[r]?.cells[c])); tsv.push(linea.join('\t')) }
    e.clipboardData.setData('text/plain', tsv.join('\r\n'))
    e.preventDefault()
  }
  const pegar = (e) => {
    const x = celda(e.target)
    if (!x) return
    const txt = e.clipboardData.getData('text/plain')
    if (!/[\t\n]/.test(txt.replace(/\s+$/, ''))) return          // un solo valor: pegado normal
    e.preventDefault()
    const bloque = txt.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'))
    const fs = filas()
    bloque.forEach((fila, i) => fila.forEach((v, j) => {
      const inp = fs[x.r + i]?.cells[x.c + j]?.querySelector('input')
      if (!inp) return
      fijarValor.call(inp, v.trim())
      inp.dispatchEvent(new Event('input', { bubbles: true }))
    }))
  }
  const tecla = (e) => {
    if (e.key === 'Escape') limpiar()
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && tabla.contains(document.activeElement) && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); const fs = filas(); ancla = { r: 0, c: 0 }; fin = { r: fs.length - 1, c: (fs[0]?.cells.length || 1) - 1 }; pintar()
    }
  }
  const fuera = (e) => { if (!tabla.contains(e.target)) limpiar() }

  tabla.addEventListener('mousedown', abajo)
  tabla.addEventListener('mouseover', encima)
  tabla.addEventListener('paste', pegar)
  document.addEventListener('mouseup', arriba)
  document.addEventListener('copy', copiar)
  document.addEventListener('keydown', tecla)
  document.addEventListener('mousedown', fuera)
  return () => {
    tabla.removeEventListener('mousedown', abajo)
    tabla.removeEventListener('mouseover', encima)
    tabla.removeEventListener('paste', pegar)
    document.removeEventListener('mouseup', arriba)
    document.removeEventListener('copy', copiar)
    document.removeEventListener('keydown', tecla)
    document.removeEventListener('mousedown', fuera)
  }
}

// Devuelve una ref para poner en <table ref={...}>
export function usePlanilla() {
  const quitar = useRef(null)
  return useCallback((nodo) => {
    quitar.current?.()
    quitar.current = nodo ? activar(nodo) : null
  }, [])
}
