// ============================================================
// Esquemas de las fichas «Cómo se calculó»: dibujos chicos que acompañan cada paso.
//   grafico    → el Grafico del programa (series y extras con colores del tema: 'acento', 'acento2', 'sec', 'aviso', 'tenue')
//   diluciones → la serie de diluciones de una réplica, con la usada resaltada
//   replicas   → una tarjeta por réplica con sus colonias (C) y su volumen de suspensión original (V)
//   intervalo  → el valor y su IC sobre una recta numérica (log si las magnitudes son UFC/mL)
//   tira       → valores de réplicas sobre una recta, con la media (± DE) y el sospechoso marcado
//   barras     → colonias observadas y esperadas por réplica (sobredispersión)
// ============================================================
import { finito } from '../motor/analisis.js'
import { useTema } from '../tema.js'
import { Grafico } from '../ui/grafico.jsx'
import { fs } from '../utils.js'
import { sci } from './definiciones.js'

const colorDe = (T, c) => (!c ? T.acento : c.startsWith('#') ? c : c === 'tenue' ? T.eje : T[c] || c)

function Intervalo({ e, T }) {
  const tr = e.log ? Math.log10 : (x) => x
  const a = tr(e.lo), m = tr(e.m), b = tr(e.hi)
  if (![a, m, b].every(finito)) return null
  const sp = Math.max(b - a, 1e-9), x0 = a - sp * 0.45, x1 = b + sp * 0.45
  const W = 560, X = (x) => 20 + ((x - x0) / (x1 - x0)) * (W - 40)
  const fmt = (x) => (e.log ? sci(x) : fs(x, 4))
  return (
    <svg viewBox={`0 0 ${W} 64`} width="100%" style={{ maxWidth: W, display: 'block' }} fontSize="12" fontFamily="'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif">
      <line x1="20" x2={W - 20} y1="34" y2="34" stroke={T.eje} />
      <rect x={X(a)} y="27" width={X(b) - X(a)} height="14" rx="7" fill={T.acento} opacity="0.18" stroke={T.acento} />
      <line x1={X(m)} x2={X(m)} y1="22" y2="46" stroke={T.acento} strokeWidth="3" />
      <text x={X(m)} y="16" textAnchor="middle" fill={T.acento} fontWeight="700">{fmt(e.m)}</text>
      <text x={X(a)} y="60" textAnchor="middle" fill={T.sec}>{fmt(e.lo)}</text>
      <text x={X(b)} y="60" textAnchor="middle" fill={T.sec}>{fmt(e.hi)}</text>
      {e.etiqueta && <text x={W - 20} y="16" textAnchor="end" fill={T.sec}>{e.etiqueta}</text>}
    </svg>
  )
}

function Tira({ e, T }) {
  const xs = e.valores.map((q) => q.x).filter(finito)
  if (!xs.length) return null
  const ext = [...xs, ...(finito(e.media) && finito(e.de) ? [e.media - e.de, e.media + e.de] : [])]
  let a = Math.min(...ext), b = Math.max(...ext)
  if (a === b) { a -= Math.abs(a) * 0.1 || 1; b += Math.abs(b) * 0.1 || 1 }
  const sp = b - a, x0 = a - sp * 0.12, x1 = b + sp * 0.12
  const W = 560, X = (x) => 24 + ((x - x0) / (x1 - x0)) * (W - 48)
  const orden = e.valores.map((q, i) => ({ ...q, i })).filter((q) => finito(q.x)).sort((p, q) => p.x - q.x)
  return (
    <svg viewBox={`0 0 ${W} 86`} width="100%" style={{ maxWidth: W, display: 'block' }} fontSize="11.5" fontFamily="'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif">
      <line x1="24" x2={W - 24} y1="52" y2="52" stroke={T.eje} />
      {finito(e.media) && finito(e.de) && <rect x={X(e.media - e.de)} y="44" width={X(e.media + e.de) - X(e.media - e.de)} height="16" rx="4" fill={T.acento} opacity="0.12" />}
      {finito(e.media) && <><line x1={X(e.media)} x2={X(e.media)} y1="38" y2="66" stroke={T.acento} strokeWidth="2.4" /><text x={X(e.media)} y="80" textAnchor="middle" fill={T.acento}>{finito(e.de) ? 'media ± DE' : 'media'}</text></>}
      {orden.map((q, k) => (
        <g key={q.i}>
          {q.sospechoso && <circle cx={X(q.x)} cy="52" r="9" fill="none" stroke={T.aviso} strokeWidth="2.2" />}
          <circle cx={X(q.x)} cy="52" r="5" fill={q.sospechoso ? T.aviso : T.texto} />
          <text x={X(q.x)} y={k % 2 ? 22 : 34} textAnchor="middle" fill={q.sospechoso ? T.aviso : T.sec}>{q.etiqueta}</text>
        </g>
      ))}
      <text x="24" y="80" fill={T.sec}>{fs(x0 + (x1 - x0) * 0.04, 3)}</text>
      <text x={W - 24} y="80" textAnchor="end" fill={T.sec}>{fs(x1 - (x1 - x0) * 0.04, 3)}{e.unidad ? ` ${e.unidad}` : ''}</text>
    </svg>
  )
}

function Barras({ e, T }) {
  const max = Math.max(...e.items.flatMap((q) => [q.obs, q.esp]).filter(finito), 1)
  const W = 560, H = 136, n = e.items.length, banda = (W - 40) / n
  const Y = (x) => H - 26 - (x / max) * (H - 62)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} fontSize="11.5" fontFamily="'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif">
      <line x1="20" x2={W - 20} y1={H - 26} y2={H - 26} stroke={T.eje} />
      {e.items.map((q, i) => {
        const cx = 20 + banda * (i + 0.5), w = Math.min(26, banda * 0.28)
        return (
          <g key={i}>
            <rect x={cx - w - 2} y={Y(q.obs)} width={w} height={H - 26 - Y(q.obs)} fill={T.acento} rx="3" />
            <rect x={cx + 2} y={Y(q.esp)} width={w} height={H - 26 - Y(q.esp)} fill="none" stroke={T.sec} strokeDasharray="3 2" rx="3" />
            <text x={cx - w / 2 - 2} y={Y(q.obs) - 4} textAnchor="middle" fill={T.texto}>{q.obs}</text>
            <text x={cx + w / 2 + 2} y={Y(q.esp) - 4} textAnchor="middle" fill={T.sec}>{fs(q.esp, 3)}</text>
            <text x={cx} y={H - 10} textAnchor="middle" fill={T.sec}>{q.etiqueta}</text>
          </g>
        )
      })}
      <g transform="translate(20 4)"><rect width="12" height="10" fill={T.acento} rx="2" /><text x="16" y="9" fill={T.texto}>observadas</text><rect x="96" width="12" height="10" fill="none" stroke={T.sec} strokeDasharray="3 2" rx="2" /><text x="112" y="9" fill={T.texto}>esperadas</text></g>
    </svg>
  )
}

export function Esquema({ e }) {
  const T = useTema()
  if (!e) return null
  if (e.tipo === 'grafico') {
    return (
      <div className="ficha-esquema">
        <Grafico series={e.series.map((s) => ({ ...s, color: colorDe(T, s.color) }))} extras={(e.extras || []).map((q) => ({ ...q, color: colorDe(T, q.color) }))}
          xTxt={e.xTxt || 'Tiempo (h)'} yTxt={e.yTxt || ''} alto={e.alto || 200} ventana={e.ventana} exportar={false} leyenda={e.leyenda !== false} nombre="ficha" />
      </div>
    )
  }
  if (e.tipo === 'diluciones') {
    return (
      <div className="dil-fila">
        {e.columnas.map((c, i) => (
          <div key={i} className={`dil-col ${c.estado}`}>
            <small>{c.etiqueta}</small><b>{c.colonias}</b>
            <small>{c.estado === 'elegida' ? 'usada' : c.estado === 'rango' ? 'en rango' : c.estado === 'incontable' ? 'incontable' : 'colonias'}</small>
          </div>
        ))}
      </div>
    )
  }
  if (e.tipo === 'replicas') {
    return (
      <div className="rep-tarjetas">
        {e.tarjetas.map((q, i) => (
          <div key={i} className="rep-tarjeta"><small>{q.titulo}</small><b className="v1">C = {q.c}</b><span className="v2">V = {sci(q.v, 2)} mL</span></div>
        ))}
      </div>
    )
  }
  return <div className="ficha-esquema">{e.tipo === 'intervalo' ? <Intervalo e={e} T={T} /> : e.tipo === 'tira' ? <Tira e={e} T={T} /> : e.tipo === 'barras' ? <Barras e={e} T={T} /> : null}</div>
}
