// Íconos de línea y pequeñas ilustraciones con el tema del programa (curvas de crecimiento, placas de Petri, colonias)
const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }

const ICONOS = {
  experimento: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></>,
  placa: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="8" cy="10" r="1.2" /><circle cx="12" cy="10" r="1.2" /><circle cx="16" cy="10" r="1.2" /><circle cx="8" cy="14" r="1.2" /><circle cx="12" cy="14" r="1.2" /><circle cx="16" cy="14" r="1.2" /></>,
  odmanual: <><path d="M8 3h8v15a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3Z" /><path d="M8 9h8" /><path d="M12 13v3" /></>,
  preproc: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  grafico: <><path d="M4 4v16h16" /><path d="M6 16c3 0 4-1 6-5s4-5 7-5" /></>,
  analisis: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" /></>,
  conteo: <><circle cx="12" cy="12" r="8.5" /><circle cx="9" cy="10" r="1" /><circle cx="14.5" cy="9" r="1" /><circle cx="13" cy="14" r="1" /><circle cx="8.5" cy="15" r=".8" /><circle cx="16" cy="13.5" r=".8" /></>,
  calibracion: <><path d="M4 4v16h16" /><circle cx="8" cy="15" r="1" /><circle cx="11" cy="12" r="1" /><circle cx="14" cy="11" r="1" /><circle cx="17" cy="7.5" r="1" /><path d="M6 17.5 19 6" /></>,
  comparar: <><path d="M4 4v16h16" /><path d="M6 15c3 0 4-1 6-4s4-3 7-3" /><path d="M6 18c3 0 5-2 7-2s4 1 6 0" strokeDasharray="2 3" /></>,
  datos: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M3 14.5h18M9 5v14" /></>,
  metodos: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5Z" /><path d="M5 4.5v17M9 7h6" /></>,
  tecan: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
}

export const Icono = ({ n, size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...trazo}>{ICONOS[n] || ICONOS.experimento}</svg>
)

// Ilustración de cada tipo de experimento (pantalla inicial)
export function Ilustracion({ tipo }) {
  const curva = <path d="M10 62 C36 62 42 58 56 40 S86 14 112 12" fill="none" stroke="#d9731f" strokeWidth="4" strokeLinecap="round" />
  const ejes = <path d="M10 8 V68 H116" fill="none" stroke="#c9a77c" strokeWidth="2" strokeLinecap="round" />
  const placa = (cx, cy, r) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#fff3d6" stroke="#c99a5b" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r={r - 5} fill="none" stroke="#e8c98f" strokeWidth="1.2" />
      {[[-.35, -.3, 3.4], [.1, -.5, 2.6], [.4, -.05, 3], [-.1, .1, 3.8], [-.45, .35, 2.4], [.25, .45, 3.2], [.05, -.1, 2]].map(([x, y, q], i) => <circle key={i} cx={cx + x * r} cy={cy + y * r} r={q} fill="#c0702a" fillOpacity=".85" />)}
    </g>
  )
  return (
    <svg viewBox="0 0 126 76" className="ilustracion" aria-hidden>
      {tipo !== 'conteo' && <>{ejes}{curva}{[[22, 61], [48, 49], [72, 28], [98, 14]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.4" fill="#fffdf9" stroke="#d9731f" strokeWidth="2" />)}</>}
      {tipo === 'ambos' && <g transform="translate(66 6) scale(.62)">{placa(30, 30, 28)}</g>}
      {tipo === 'conteo' && <>{placa(38, 38, 30)}{placa(92, 38, 22)}<path d="M62 38h8" stroke="#c9a77c" strokeWidth="2" strokeLinecap="round" /></>}
    </svg>
  )
}

