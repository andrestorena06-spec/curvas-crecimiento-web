// Opciones de vista de la cinta (escala, tipo de error, qué mostrar…): se recuerdan al cambiar de pantalla
// y entre sesiones, en este navegador. No forman parte del experimento ni cambian los cálculos.
import { useState } from 'react'

const CLAVE = 'curvas-crecimiento-v2-opciones'
let memoria = null
const todas = () => {
  if (memoria) return memoria
  try { memoria = JSON.parse(localStorage.getItem(CLAVE)) || {} } catch { memoria = {} }
  return memoria
}

export function useOpcion(clave, def) {
  const [valor, setValor] = useState(() => (clave in todas() ? todas()[clave] : def))
  const set = (x) => setValor((ant) => {
    const nuevo = typeof x === 'function' ? x(ant) : x
    todas()[clave] = nuevo
    try { localStorage.setItem(CLAVE, JSON.stringify(todas())) } catch { /* sin almacenamiento */ }
    return nuevo
  })
  return [valor, set]
}
