import { useState } from 'react'
import { Campo, Num } from './ui.jsx'
import { Nota } from './tip.jsx'
import { Vacio } from './placa.jsx'
import { finito } from '../motor/analisis.js'
import { LETRAS } from '../motor/lectura.js'

const rgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return `rgba(201,154,91,${a})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ===============================================================
// PLACA DE OD (única): cada COLUMNA es un tiempo (t0 en la 1, t2 en la 2…) y cada FILA una réplica de una cepa.
// ===============================================================
export function PlacaOdTab({ s }) {
  const a = s.a
  const lect = a.lecturas[0]
  const d = a.disenoOd
  const [auto, setAuto] = useState({ reps: 3, t0: 0, paso: 2 })
  if (!lect) return <Vacio texto="Primero cargá la placa de OD en «Experimento» (Origen de la OD: Excel por pocillos)." />
  const val = Object.fromEntries(lect.datos.map((x) => [x.Pocillo, x.OD]))
  const cepas = s.opcionesMuestra
  const setT = (c, v) => s.setDisenoOd((x) => ({ ...x, tiempos: { ...x.tiempos, [c]: v } }))
  const setFila = (L, patch) => s.setDisenoOd((x) => ({ ...x, filas: { ...x.filas, [L]: { ...(x.filas[L] || { muestra: '', blanco: false }), ...patch } } }))
  const usadas = (c) => d.tiempos[c] !== '' && d.tiempos[c] !== undefined && d.tiempos[c] !== null && finito(Number(d.tiempos[c]))
  const color = (m) => s.coloresGlobal[m] || '#c99a5b'
  const cuenta = {}
  const replica = Object.fromEntries(LETRAS.map((L) => {
    const m = d.filas[L]?.muestra
    if (!m) return [L, null]
    cuenta[m] = (cuenta[m] || 0) + 1
    return [L, cuenta[m]]
  }))
  const llenarFilas = () => {
    if (!cepas.length) return s.avisar('Definí las cepas del experimento en «Experimento».', 'error')
    const filas = {}
    let i = 0
    for (const m of cepas) for (let r = 0; r < Math.max(1, auto.reps); r++) { if (i < 8) filas[LETRAS[i]] = { muestra: m, blanco: false }; i++ }
    s.setDisenoOd((x) => ({ ...x, filas }))
  }
  const llenarTiempos = () => {
    const t = {}
    for (let c = 1; c <= 12; c++) t[c] = Number((Number(auto.t0) + (c - 1) * Number(auto.paso)).toFixed(4))
    s.setDisenoOd((x) => ({ ...x, tiempos: t }))
  }
  const nCurvas = LETRAS.filter((L) => d.filas[L]?.muestra).length

  return (
    <div className="pagina">
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Placa de OD <Nota>La placa es única. Cada columna es un tiempo (t0 en la columna 1, t2 en la 2, …; dejá vacía una columna para no usarla) y cada fila es una réplica de una cepa. Las cepas salen de las que definiste en «Experimento». Marcá «Blanco» en las filas del medio sin inocular.</Nota></h2>
          <small className="ayuda">{lect.nombre}{lect.onda ? ` · ${lect.onda} nm` : ''}</small>
        </div>
        <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
          <Campo label="Réplicas por cepa"><Num value={auto.reps} min={1} max={8} onChange={(v) => setAuto({ ...auto, reps: v === '' ? 1 : v })} /></Campo>
          <button onClick={llenarFilas} data-tip={'Asignar filas\nCada cepa del experimento ocupa esa cantidad de filas, de la A en adelante.'}>Asignar filas</button>
          <Campo label="t de la columna 1 (h)"><Num value={auto.t0} min={0} step={0.5} onChange={(v) => setAuto({ ...auto, t0: v === '' ? 0 : v })} /></Campo>
          <Campo label="Cada (h)"><Num value={auto.paso} min={0.1} step={0.5} onChange={(v) => setAuto({ ...auto, paso: v === '' ? 1 : v })} /></Campo>
          <button onClick={llenarTiempos}>Asignar tiempos</button>
        </div>
        <div className="tabla-scroll" style={{ maxHeight: 'none' }}>
          <table className="tabla placa-od">
            <thead>
              <tr>
                <th>Fila</th><th>Cepa</th><th title="Medio sin inocular">Blanco</th>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((c) => (
                  <th key={c} className={usadas(c) ? '' : 'col-sin-t'}>
                    <div className="col-num">{c}</div>
                    <div className="t-col"><input type="number" step="any" min="0" placeholder="t" value={d.tiempos[c] ?? ''}
                      onChange={(e) => setT(c, e.target.value === '' ? '' : Number(e.target.value))} data-tip={`Columna ${c}\nTiempo de la columna (h). Vacío = no se usa.`} /> <small>h</small></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LETRAS.map((L) => {
                const f = d.filas[L] || {}
                const m = f.muestra
                return (
                  <tr key={L}>
                    <th>{L}{replica[L] ? <small> R{replica[L]}</small> : ''}</th>
                    <td>
                      <select value={m || ''} onChange={(e) => setFila(L, { muestra: e.target.value })}>
                        <option value="">(sin cepa)</option>
                        {[...new Set([...cepas, ...(m ? [m] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!f.blanco} disabled={!m} onChange={(e) => setFila(L, { blanco: e.target.checked })} /></td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((c) => {
                      const v = val[L + c]
                      const act = !!m && usadas(c)
                      return (
                        <td key={c} className="celda-od" style={{ background: act ? rgba(color(m), f.blanco ? 0.12 : 0.3) : undefined, opacity: act ? 1 : 0.5 }}
                          data-tip={finito(v) ? `${L}${c}${m ? ` · ${m}${f.blanco ? ' (blanco)' : ` R${replica[L]}`}` : ''}\nOD = ${v.toFixed(4)}${usadas(c) ? `\nt = ${d.tiempos[c]} h` : '\nColumna sin tiempo: no se usa'}` : undefined}>
                          {finito(v) ? v.toFixed(3) : ''}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="ayuda">{nCurvas ? `${nCurvas} curvas armadas` : 'Asigná una cepa a cada fila para armar las curvas'}{s.datos ? ` · ${s.datos.tiempos.length} tiempos` : ''}.</p>
      </section>
    </div>
  )
}
