// Temas: «Océano nocturno» (oscuro, por defecto) y «Laboratorio marino» (claro).
// Los colores están también en styles.css como variables; acá se repiten para los gráficos SVG,
// que usan colores explícitos para poder exportarse igual que se ven.
import { createContext, useContext } from 'react'

export const TEMAS = {
  oscuro: {
    nombre: 'Océano nocturno', fondo: '#0B1424', panel: '#121F35', panel2: '#172843', texto: '#E2ECF8', sec: '#8EA3BF', borde: '#24365A',
    grilla: '#1F3050', eje: '#5D7392', acento: '#38BDF8', acento2: '#818CF8', peligro: '#F87171', ok: '#4ADE80', aviso: '#FBBF24',
    pocilloVacio: '#13203A', mezcla: 0.55,
  },
  claro: {
    nombre: 'Laboratorio marino', fondo: '#E9F0F8', panel: '#FFFFFF', panel2: '#F1F5FB', texto: '#0B2545', sec: '#5A6F89', borde: '#DCE6F2',
    grilla: '#E8EEF6', eje: '#8A9BB2', acento: '#1D6FD8', acento2: '#5AA2F0', peligro: '#C2410C', ok: '#15803D', aviso: '#B45309',
    pocilloVacio: '#F7FAFD', mezcla: 0.68,
  },
}

export const TemaCtx = createContext(TEMAS.oscuro)
export const useTema = () => useContext(TemaCtx)

// Paleta de cepas: tonos apagados (no chillones), distinguibles entre sí y legibles en los dos temas
const BASE = ['#5B8FD9', '#E0975A', '#5FAE84', '#B48AC9', '#D9737A', '#4FB3B8', '#C9B458', '#8C9BB0', '#C98BA8', '#7F9A5B', '#A4805F', '#6E7FD1']

const aRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const aHex = (v) => '#' + v.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')
export const mezclar = (a, b, f) => { const x = aRgb(a), y = aRgb(b); return aHex(x.map((v, i) => v + (y[i] - v) * f)) }

export function coloresCepas(muestras) {
  const out = {}
  muestras.forEach((m, i) => { out[m] = BASE[i % BASE.length] })
  return out
}
// Réplicas: el tono de la cepa, de más oscuro a más claro
export function colorReplica(base, i, n) {
  if (n <= 1) return base
  const f = -0.25 + (0.6 * i) / (n - 1)
  return f < 0 ? mezclar(base, '#000000', -f) : mezclar(base, '#ffffff', f)
}
// Relleno suave de un pocillo de la placa según el tema
export const rellenoPocillo = (color, tema) => mezclar(color, tema.fondo, tema.mezcla)

export const DASH = [null, '7 4', '2 3', '9 3 2 3', '12 4', '3 3 9 3']

// Estilo de cada serie del motor (pocillo real o virtual): { [Pocillo]: { color, dash } }
export function estilosSeries(config, colores) {
  const out = {}
  const muestras = [...new Set(config.map((c) => c.Muestra))]
  muestras.forEach((m) => {
    const reps = config.filter((c) => c.Muestra === m && !c.EsBlanco).sort((a, b) => a.Replica - b.Replica)
    reps.forEach((c, i) => { out[c.Pocillo] = { color: colorReplica(colores[m] || '#8C9BB0', i, reps.length), dash: DASH[i % DASH.length], base: colores[m] } })
    config.filter((c) => c.Muestra === m && c.EsBlanco).forEach((c) => { out[c.Pocillo] = { color: '#8C9BB0', dash: '2 2', base: '#8C9BB0' } })
  })
  return out
}
