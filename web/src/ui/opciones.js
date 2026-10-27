// Opciones de vista (escala, tipo de error, qué mostrar…, pantalla abierta y menú plegado): se guardan en el
// experimento (exp.opciones), así quedan en el .curvas.json y en «Recientes» y se recuperan al abrirlo.
// No cambian los cálculos ni entran en deshacer / rehacer. La última elección de cada opción también se
// recuerda en el navegador como valor inicial para los experimentos que todavía no la tienen.
import { createContext, useContext } from 'react'

const CLAVE = 'curvas-crecimiento-v2-opciones'
let memoria = null
const preferidas = () => {
  if (memoria) return memoria
  try { memoria = JSON.parse(localStorage.getItem(CLAVE)) || {} } catch { memoria = {} }
  return memoria
}
export const recordarPreferida = (clave, valor) => {
  preferidas()[clave] = valor
  try { localStorage.setItem(CLAVE, JSON.stringify(preferidas())) } catch { /* sin almacenamiento */ }
}

// valor: { opciones (las del experimento abierto), set(clave, valor) }
export const OpcionesCtx = createContext({ opciones: {}, set: () => {} })

export function useOpcion(clave, def) {
  const { opciones, set } = useContext(OpcionesCtx)
  const valor = clave in (opciones || {}) ? opciones[clave] : clave in preferidas() ? preferidas()[clave] : def
  const cambiar = (x) => {
    const nuevo = typeof x === 'function' ? x(valor) : x
    recordarPreferida(clave, nuevo)
    set(clave, nuevo)
  }
  return [valor, cambiar]
}
