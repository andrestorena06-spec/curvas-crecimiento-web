import { useEffect, useMemo, useRef, useState } from 'react'
import { Campo, Num } from './ui.jsx'
import { Nota } from './tip.jsx'
import { Vacio } from './placa.jsx'
import { estimarUfc, textoEstado } from '../motor/ufc.js'
import { finito } from '../motor/analisis.js'
import { nuevoId } from '../experimento.js'
import { dUfc, sci } from '../calculos.js'

// ===============================================================
// DISEÑO DE PLACAS DE PETRI (siembra extendida)
// Cada placa se divide en sectores iguales y simétricos (1, 2, 3, 4, 6 u 8). En cada sector se siembra una muestra
// a un tiempo; las líneas (estrías) apiladas son las diluciones y réplicas, y cada una lleva su recuento de colonias.
// ===============================================================
const SECTORES = [1, 2, 3, 4, 6, 8]
const R = 150          // radio de la placa en el dibujo
const sectorVacio = () => ({ muestra: '', t: 0, lineas: [] })
const placaNueva = (n, nombre) => ({ id: nuevoId(), nombre, n, sectores: Array.from({ length: n }, sectorVacio) })
const rad = (g) => (g * Math.PI) / 180

// ángulo de inicio de cada sector: arranca arriba y sigue en el sentido de las agujas del reloj
const a0 = -90
function trazoSector(i, n) {
  if (n === 1) return `M ${-R} 0 A ${R} ${R} 0 1 1 ${R} 0 A ${R} ${R} 0 1 1 ${-R} 0 Z`
  const d = 360 / n
  const A = rad(a0 + i * d), B = rad(a0 + (i + 1) * d)
  const grande = d > 180 ? 1 : 0
  return `M 0 0 L ${R * Math.cos(A)} ${R * Math.sin(A)} A ${R} ${R} 0 ${grande} 1 ${R * Math.cos(B)} ${R * Math.sin(B)} Z`
}

// posición de las estrías de un sector: paralelas a la bisectriz, una debajo de la otra
function geometriaLineas(i, n, L) {
  const d = n === 1 ? 180 : 360 / n
  const th = n === 1 ? 0 : rad(a0 + (i + 0.5) * d)
  const u = [Math.cos(th), Math.sin(th)], v = n <= 2 ? [0, 1] : [-Math.sin(th), Math.cos(th)]
  const ancho = n <= 2 ? R * 1.25 : Math.min(2 * R * 0.55 * Math.tan(rad(d / 2)) * 0.82, R * 1.25)
  const tope = n <= 2 ? 0.9 : 0.8
  return Array.from({ length: L }, (_, j) => {
    const off = ((j + 0.5) / L - 0.5) * ancho
    const fin = Math.sqrt(Math.max((R * tope) ** 2 - off ** 2, 0))
    const ini = n === 1 ? -fin : n === 2 ? R * 0.1 : Math.max(R * 0.16, Math.abs(off) / Math.tan(rad(d / 2)) + R * 0.1)
    return { x1: v[0] * off + u[0] * ini, y1: v[1] * off + u[1] * ini, x2: v[0] * off + u[0] * fin, y2: v[1] * off + u[1] * fin, ux: u[0], uy: u[1] }
  })
}

// colonias: puntos repartidos a lo largo de la estría (siempre en los mismos lugares)
function colonias(g, n, semilla) {
  const q = Math.min(Math.max(Math.round(n), 0), 36)
  return Array.from({ length: q }, (_, i) => {
    const t = (((i * 0.6180339887 + semilla * 0.137) % 1) * 0.66) + 0.06
    const j = ((((i * 0.7548776662 + semilla * 0.31) % 1) - 0.5) * 7)
    return { x: g.x1 + (g.x2 - g.x1) * t - g.uy * j, y: g.y1 + (g.y2 - g.y1) * t + g.ux * j }
  })
}

function Dish({ placa, sel, setSel, color, ts, tick }) {
  const n = placa.n
  return (
    <svg viewBox={`${-R - 16} ${-R - 16} ${2 * R + 32} ${2 * R + 32}`} className="petri-svg" role="img" aria-label="Placa de Petri">
      <defs>
        <radialGradient id="agar" cx="50%" cy="45%" r="60%"><stop offset="0%" stopColor="#fff3d6" /><stop offset="100%" stopColor="#f6dcaa" /></radialGradient>
        {placa.sectores.map((_, i) => <clipPath key={i} id={`cp-${placa.id}-${i}`}><path d={trazoSector(i, n)} /></clipPath>)}
      </defs>
      <circle r={R + 10} fill="#fffaf2" stroke="#d9b98c" strokeWidth="2" />
      <circle r={R} fill="url(#agar)" stroke="#c99a5b" strokeWidth="1.5" />
      {placa.sectores.map((sc, i) => {
        const c = sc.muestra ? color(sc.muestra) : null
        const g = geometriaLineas(i, n, Math.max(sc.lineas.length, 1))
        const activo = sel === i
        const d = n === 1 ? 180 : 360 / n
        const th = n === 1 ? 0 : rad(a0 + (i + 0.5) * d)
        const etq = n === 1 ? [0, -R * 0.86] : n === 2 ? [Math.cos(th) * R * 0.42, -R * 0.84] : [Math.cos(th) * R * 0.88, Math.sin(th) * R * 0.88]
        return (
          <g key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}
            data-tip={`Sector ${i + 1}${sc.muestra ? ` · ${sc.muestra}` : ' · sin muestra'}\nTiempo: ${sc.t} h\n${sc.lineas.length} ${sc.lineas.length === 1 ? 'estría' : 'estrías'}\nClic para editar`}>
            <path d={trazoSector(i, n)} fill={c || 'transparent'} fillOpacity={c ? 0.28 : 0} />
            <g clipPath={`url(#cp-${placa.id}-${i})`}>
              {sc.lineas.map((l, j) => {
                const gl = g[j]
                if (!gl) return null
                const puntos = finito(l.n) ? colonias(gl, l.n, j + i * 7) : []
                return (
                  <g key={l.id} data-tip={`Estría ${j + 1} · ${sc.muestra || 'sin muestra'}\nDilución −${l.k} · réplica ${l.rep || 1}\n${finito(l.n) ? `${l.n} colonias` : 'sin contar'}`}>
                    <line x1={gl.x1} y1={gl.y1} x2={gl.x2} y2={gl.y2} stroke={c || '#b98a4e'} strokeWidth="7" strokeLinecap="round" strokeOpacity=".35" />
                    <line x1={gl.x1} y1={gl.y1} x2={gl.x2} y2={gl.y2} stroke={c || '#b98a4e'} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1 5" />
                    {puntos.map((p, q) => <circle key={q} cx={p.x} cy={p.y} r="2.3" fill="#8a4b1d" fillOpacity=".85" stroke="#fff6e6" strokeWidth=".5" />)}
                  </g>
                )
              })}
            </g>
            <path d={trazoSector(i, n)} fill="none" stroke={activo ? '#d9731f' : 'transparent'} strokeWidth="4" />
            {sc.lineas.map((l, j) => {
              const gl = g[j]
              return gl ? (
                <text key={'t' + l.id} x={gl.x2 - gl.ux * 4} y={gl.y2 - gl.uy * 4 - 4} fontSize="9.5" textAnchor={gl.ux >= 0 ? 'end' : 'start'} fill="#5b3512" fontWeight="600" style={{ pointerEvents: 'none' }}>
                  −{l.k}{finito(l.n) ? ` · ${l.n}` : ''}
                </text>
              ) : null
            })}
            <text x={etq[0]} y={etq[1]} textAnchor="middle" fontSize="11" fontWeight="700" fill="#3b2a1f" style={{ pointerEvents: 'none' }}>{i + 1}{sc.muestra ? ' · ' + sc.muestra + ' · T=' + sc.t + ' h' : ''}</text>
          </g>
        )
      })}
      {n > 1 && placa.sectores.map((_, i) => {
        const A = rad(a0 + i * (360 / n))
        return <line key={'c' + i} x1="0" y1="0" x2={R * Math.cos(A)} y2={R * Math.sin(A)} stroke="#9c6a2e" strokeWidth="1.6" strokeDasharray="5 3" style={{ pointerEvents: 'none' }} />
      })}
    </svg>
  )
}

export function PetriDiseno({ s }) {
  const { ufc } = s
  const placas = ufc.petri
  const [pid, setPid] = useState(placas[0]?.id || null)
  const [sel, setSel] = useState(0)
  const [gen, setGen] = useState({ m: 4, k0: 1, reps: 1 })
  const refs = useRef({})
  const placa = placas.find((p) => p.id === pid) || placas[0] || null
  useEffect(() => { if (placa && placa.id !== pid) setPid(placa.id) }, [placa, pid])
  const setPetri = (f) => s.setUfc((u) => ({ ...u, petri: typeof f === 'function' ? f(u.petri) : f }))
  const setPlaca = (patch) => setPetri((ps) => ps.map((p) => (p.id === placa.id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)))
  const setSector = (i, patch) => setPlaca((p) => ({ sectores: p.sectores.map((sc, j) => (j === i ? { ...sc, ...(typeof patch === 'function' ? patch(sc) : patch) } : sc)) }))
  const ts = useMemo(() => [...new Set([...ufc.par.tiempos, ...placas.flatMap((p) => p.sectores.map((x) => Number(x.t)))])].filter(finito).sort((a, b) => a - b), [ufc.par.tiempos, placas])
  const todas = [...new Set([...s.opcionesMuestra])]
  const color = (m) => s.coloresGlobal[m] || '#c99a5b'

  const crear = () => {
    const p = placaNueva(2, `Placa ${placas.length + 1}`)
    setPetri((ps) => [...ps, p]); setPid(p.id); setSel(0)
  }
  const quitar = () => {
    const hay = placa.sectores.some((x) => x.lineas.some((l) => finito(l.n)))
    if (hay && !window.confirm(`«${placa.nombre}» tiene colonias cargadas. ¿Quitarla?`)) return
    setPetri((ps) => ps.filter((p) => p.id !== placa.id)); setPid(null); setSel(0)
  }
  const cambiarN = (n) => {
    if (n === placa.n) return
    const pierde = placa.sectores.slice(n).some((x) => x.muestra || x.lineas.length)
    if (pierde && !window.confirm('Al reducir los sectores se pierden los últimos. ¿Continuar?')) return
    setPlaca((p) => ({ n, sectores: Array.from({ length: n }, (_, i) => p.sectores[i] || sectorVacio()) }))
    setSel((x) => Math.min(x, n - 1))
  }
  const sc = placa?.sectores[Math.min(sel, (placa?.n || 1) - 1)]
  const si = Math.min(sel, (placa?.n || 1) - 1)

  const agregarMuestra = (m) => { const v = m.trim(); if (v && !s.muestras.includes(v)) s.setMuestras([...s.muestras, v]) }
  const generar = () => {
    const nuevas = []
    for (let r = 1; r <= Math.max(1, gen.reps); r++) for (let j = 0; j < Math.max(1, gen.m); j++) nuevas.push({ id: nuevoId(), k: Number(gen.k0) + j, rep: r, n: null })
    setSector(si, { lineas: nuevas })
  }
  const setLinea = (id, patch) => setSector(si, (x) => ({ lineas: x.lineas.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  const quitarLinea = (id) => setSector(si, (x) => ({ lineas: x.lineas.filter((l) => l.id !== id) }))
  const tb = ufc.tabla

  // resultado de cada réplica del sector
  const porRep = useMemo(() => {
    if (!sc) return []
    const g = new Map()
    sc.lineas.forEach((l) => { const k = Number(l.rep) || 1; if (!g.has(k)) g.set(k, {}); if (finito(l.n)) g.get(k)[Number(l.k)] = Number(l.n) })
    const par = { vol: tb.vol / 1000, factor: tb.factor, min: tb.min, max: tb.max }
    return [...g].sort((a, b) => a[0] - b[0]).map(([rep, cont]) => {
      const e = estimarUfc(cont, par)
      return { rep, e, tip: dUfc({ _cont: cont, _par: par, _usados: e.usados, _S: e.S, _estado: e.estado, UFC_mL: e.ufc, IC95_inf: e.lo, IC95_sup: e.hi, Limite: e.lim }) }
    })
  }, [sc, tb.vol, tb.factor, tb.min, tb.max])

  return (
    <section className="tarjeta">
      <div className="titulo-fila">
        <h2>Placas de Petri <Nota>Cada placa se divide en sectores iguales y simétricos. En cada sector se siembra una muestra a un tiempo; las estrías apiladas son las diluciones y réplicas. Hacé clic en un sector para editarlo y escribí las colonias de cada estría.</Nota></h2>
        <div className="fila-ctrl" style={{ margin: 0 }}>
          {placas.map((p) => <button key={p.id} className={`chip-t ${placa && p.id === placa.id ? 'on' : ''}`} onClick={() => { setPid(p.id); setSel(0) }}>{p.nombre}</button>)}
          <button className="chico primario" onClick={crear}>+ Placa</button>
        </div>
      </div>
      {!placa ? <Vacio texto="Todavía no hay placas. Creá una con «+ Placa», elegí en cuántos sectores se divide y qué se siembra en cada uno." /> : (
        <div className="petri-pagina">
          <div className="petri-izq">
            <div className="fila-ctrl" style={{ justifyContent: 'center' }}>
              <input className="nombre-placa-in" value={placa.nombre} onChange={(e) => setPlaca({ nombre: e.target.value })} aria-label="Nombre de la placa" />
              <div className="seg" data-tip="Sectores de la placa (cortes iguales y simétricos)">
                {SECTORES.map((n) => <button key={n} className={placa.n === n ? 'on' : ''} onClick={() => cambiarN(n)}>{n}</button>)}
              </div>
              <button className="chico peligro" onClick={quitar}>Quitar</button>
            </div>
            <Dish placa={placa} sel={si} setSel={setSel} color={color} ts={ts} />
            <div className="leyenda-petri">
              {[...new Set(placa.sectores.map((x) => x.muestra).filter(Boolean))].map((m) => <span key={m}><i style={{ background: color(m) }} />{m}</span>)}
              <span className="suave"><i className="colonia" />colonia</span>
            </div>
          </div>
          <div className="petri-der">
            <h3 style={{ marginTop: 0 }}>Sector {si + 1} de {placa.n}</h3>
            <div className="rejilla-campos">
              <Campo label="Muestra">
                <input list="muestras-petri" value={sc.muestra} placeholder="Ej.: L100A1"
                  onChange={(e) => setSector(si, { muestra: e.target.value })} onBlur={(e) => agregarMuestra(e.target.value)} />
                <datalist id="muestras-petri">{todas.map((m) => <option key={m} value={m} />)}</datalist>
              </Campo>
              <Campo label="Tiempo (h)">
                <input type="number" step="any" min="0" list="tiempos-petri" value={sc.t} onChange={(e) => setSector(si, { t: e.target.value === '' ? '' : Number(e.target.value) })} />
                <datalist id="tiempos-petri">{ts.map((t) => <option key={t} value={t} />)}</datalist>
              </Campo>
            </div>
            <div className="bloque-estilo">
              <h4>Estrías <Nota>Cada estría es una dilución de una réplica, una debajo de otra. «Generar» las crea de una vez: cuántas diluciones, desde cuál (−1, −2…) y cuántas réplicas de cada una.</Nota></h4>
              <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
                <Campo label="Diluciones"><Num value={gen.m} min={1} max={10} onChange={(v) => setGen({ ...gen, m: v === '' ? 1 : v })} /></Campo>
                <Campo label="Desde −k"><Num value={gen.k0} min={0} max={9} onChange={(v) => setGen({ ...gen, k0: v === '' ? 0 : v })} /></Campo>
                <Campo label="Réplicas"><Num value={gen.reps} min={1} max={6} onChange={(v) => setGen({ ...gen, reps: v === '' ? 1 : v })} /></Campo>
                <button className="primario" onClick={generar}>Generar</button>
              </div>
              {sc.lineas.length === 0 ? <p className="ayuda">Todavía no hay estrías en este sector.</p> : (
                <table className="tabla tabla-od">
                  <thead><tr><th>#</th><th>Dilución −k</th><th>Réplica</th><th>Colonias</th><th /></tr></thead>
                  <tbody>
                    {sc.lineas.map((l, j) => {
                      const cont = Number(l.n)
                      const fondo = finito(l.n) ? (cont >= tb.min && cont <= tb.max ? '#e3f1dc' : cont > tb.max ? '#f8d9d6' : cont === 0 ? '#efece6' : '#fbf0cf') : undefined
                      return (
                        <tr key={l.id}>
                          <td>{j + 1}</td>
                          <td><input type="number" min="0" max="12" style={{ width: 64 }} value={l.k} onChange={(e) => setLinea(l.id, { k: Number(e.target.value) })} /></td>
                          <td><input type="number" min="1" max="12" style={{ width: 56 }} value={l.rep} onChange={(e) => setLinea(l.id, { rep: Number(e.target.value) || 1 })} /></td>
                          <td style={{ background: fondo }}>
                            <input ref={(el) => { refs.current[j] = el }} type="number" min="0" style={{ width: 80 }} value={l.n ?? ''}
                              data-tip={`Colonias de la estría ${j + 1}\nRango contable: ${tb.min} a ${tb.max}`}
                              onChange={(e) => setLinea(l.id, { n: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); refs.current[j + 1]?.focus(); refs.current[j + 1]?.select() } else if (e.key === 'ArrowUp') { e.preventDefault(); refs.current[j - 1]?.focus() } }} />
                          </td>
                          <td><button className="chico peligro" aria-label="Quitar estría" onClick={() => quitarLinea(l.id)}>×</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {porRep.length > 0 && (
                <div className="res-sector">
                  {porRep.map(({ rep, e, tip }) => (
                    <div key={rep} data-tip={tip || undefined} className="con-calculo">
                      <b>Réplica {rep}</b>: {finito(e.ufc) ? `${sci(e.ufc)} UFC/mL` : e.estado === 'cero' ? `< ${sci(e.lim)} UFC/mL` : textoEstado(e.estado)}
                      {finito(e.lo) && <small> (IC 95 % {sci(e.lo)} – {sci(e.hi)})</small>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
