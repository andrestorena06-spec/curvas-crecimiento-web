// Ilustraciones de las opciones del asistente (SVG con los colores del tema)
import { useTema } from '../tema.js'

const Marco = ({ children }) => <svg viewBox="0 0 200 110" width="190" height="104" aria-hidden>{children}</svg>

const curva = 'M24 88 C52 88 60 86 74 70 S100 26 128 22 S160 20 178 20'

export function IlusOD() {
  const T = useTema()
  return (
    <Marco>
      <path d="M20 12 V92 H184" fill="none" stroke={T.eje} strokeWidth="1.6" strokeLinecap="round" />
      <path d={curva} fill="none" stroke={T.acento} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24 90 C54 90 64 89 80 78 S108 46 134 42 S164 40 178 40" fill="none" stroke={T.acento2} strokeWidth="2.4" strokeDasharray="5 4" strokeLinecap="round" />
      {[40, 74, 100, 128, 160].map((x, i) => <circle key={x} cx={x} cy={[88, 70, 40, 22, 20][i]} r="3.2" fill={T.panel} stroke={T.acento} strokeWidth="1.6" />)}
      <text x="26" y="20" fontSize="10" fill={T.sec} fontFamily="Segoe UI">OD</text>
    </Marco>
  )
}

export function IlusUFC() {
  const T = useTema()
  const col = [[82, 46, 5], [96, 62, 4], [110, 44, 3.5], [118, 64, 5.5], [100, 78, 3], [86, 70, 4], [124, 52, 3], [92, 34, 3], [108, 30, 2.5], [130, 72, 2.5], [76, 60, 2.5]]
  return (
    <Marco>
      <ellipse cx="102" cy="58" rx="56" ry="42" fill={T.panel} stroke={T.eje} strokeWidth="1.6" />
      <ellipse cx="102" cy="58" rx="48" ry="35" fill={T.acento} opacity="0.1" />
      {col.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={i % 3 ? T.acento : T.acento2} opacity="0.85" />)}
      <text x="160" y="24" fontSize="10" fill={T.sec} fontFamily="Segoe UI">UFC</text>
    </Marco>
  )
}

export function IlusAmbos() {
  const T = useTema()
  return (
    <Marco>
      <path d="M20 12 V92 H184" fill="none" stroke={T.eje} strokeWidth="1.6" strokeLinecap="round" />
      <path d={curva} fill="none" stroke={T.acento} strokeWidth="3" strokeLinecap="round" />
      {[[40, 80], [72, 62], [100, 36], [128, 26], [160, 24]].map(([x, y]) => (
        <g key={x}><line x1={x} x2={x} y1={y - 7} y2={y + 7} stroke={T.acento2} strokeWidth="1.3" /><rect x={x - 4} y={y - 4} width="8" height="8" fill={T.acento2} /></g>
      ))}
      <text x="26" y="20" fontSize="10" fill={T.sec} fontFamily="Segoe UI">OD · UFC</text>
    </Marco>
  )
}

const MiniPlaca = ({ x, y, cols = 6, filas = 4, T, relleno }) => (
  <g>
    <rect x={x} y={y} width={cols * 11 + 8} height={filas * 11 + 8} rx="5" fill={T.panel} stroke={T.eje} strokeWidth="1.3" />
    {Array.from({ length: filas }, (_, f) => Array.from({ length: cols }, (_, c) => (
      <circle key={`${f}${c}`} cx={x + 9.5 + c * 11} cy={y + 9.5 + f * 11} r="3.8" fill={relleno ? relleno(f, c) : T.acento} opacity={relleno ? 1 : 0.25 + 0.12 * c} />
    )))}
  </g>
)

export function IlusTecan() {
  const T = useTema()
  return (
    <Marco>
      <rect x="40" y="14" width="120" height="80" rx="9" fill={T.panel2} stroke={T.eje} strokeWidth="1.5" />
      <rect x="52" y="24" width="96" height="10" rx="3" fill={T.acento} opacity="0.2" />
      <circle cx="138" cy="29" r="2.5" fill={T.ok} />
      <MiniPlaca x={63} y={44} T={T} />
      <path d="M150 50 h22 M150 60 h16 M150 70 h20" stroke={T.acento2} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </Marco>
  )
}

export function IlusPlacas() {
  const T = useTema()
  return (
    <Marco>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <MiniPlaca x={22 + i * 56} y={30 - i * 4 + 6} cols={4} filas={4} T={T} relleno={() => T.acento} />
          <rect x={22 + i * 56} y={30 - i * 4 + 6} width="52" height="52" rx="5" fill={T.panel} opacity={0.75 - i * 0.3} />
          <text x={22 + i * 56 + 26} y={100} textAnchor="middle" fontSize="10" fill={T.sec} fontFamily="Segoe UI">t = {i * 2} h</text>
        </g>
      ))}
    </Marco>
  )
}

export function IlusCubeta() {
  const T = useTema()
  return (
    <Marco>
      <rect x="30" y="34" width="104" height="58" rx="8" fill={T.panel2} stroke={T.eje} strokeWidth="1.5" />
      <rect x="40" y="44" width="40" height="16" rx="3" fill={T.fondo} stroke={T.eje} />
      <text x="60" y="56" textAnchor="middle" fontSize="10" fill={T.acento} fontFamily="Consolas, monospace">0.482</text>
      <rect x="96" y="22" width="22" height="44" rx="2" fill={T.panel} stroke={T.eje} strokeWidth="1.4" />
      <rect x="97.5" y="38" width="19" height="26" fill={T.acento} opacity="0.35" />
      <path d="M140 52 H178" stroke={T.acento2} strokeWidth="2" strokeDasharray="4 3" />
      <path d="M172 47 l6 5 -6 5" fill="none" stroke={T.acento2} strokeWidth="2" />
      <text x="158" y="44" fontSize="10" fill={T.sec} fontFamily="Segoe UI">λ</text>
    </Marco>
  )
}
