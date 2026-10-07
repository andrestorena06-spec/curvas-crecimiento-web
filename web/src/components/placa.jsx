import { useEffect, useMemo, useState } from 'react'
import { Campo, Modal, Panel } from './ui.jsx'
import { LETRAS } from '../motor/lectura.js'
import { nombreReplica } from '../motor/pipeline.js'

export const Vacio = ({ texto }) => <div className="vacio">{texto}</div>

// Color de texto legible sobre un fondo (#rrggbb)
export function textoSobre(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return l > 0.62 ? '#1f2933' : '#ffffff'
}

// ===============================================================
// CONFIGURAR POCILLOS
// ===============================================================
export function PlacaTab({ s }) {
  const [arr, setArr] = useState(null) // {f,c} inicio
  const [act, setAct] = useState(null)
  const [sel, setSel] = useState(null) // pocillos seleccionados para el modal
  const [muestra, setMuestra] = useState('')
  const [blanco, setBlanco] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const disp = useMemo(() => new Set(Object.keys(s.datos?.pocillos || {})), [s.datos])
  const cfgDe = (p) => s.config.find((c) => c.Pocillo === p)

  const rect = arr && act
    ? { f1: Math.min(arr.f, act.f), f2: Math.max(arr.f, act.f), c1: Math.min(arr.c, act.c), c2: Math.max(arr.c, act.c) }
    : null
  const enRect = (f, c) => rect && f >= rect.f1 && f <= rect.f2 && c >= rect.c1 && c <= rect.c2

  useEffect(() => {
    const up = () => {
      if (!arr) return
      if (rect) {
        const ids = []
        for (let f = rect.f1; f <= rect.f2; f++) for (let c = rect.c1; c <= rect.c2; c++) {
          const p = LETRAS[f] + (c + 1)
          if (disp.has(p)) ids.push(p)
        }
        if (ids.length) {
          const info = ids.map(cfgDe).filter(Boolean)
          const nombres = [...new Set(info.map((i) => i.Muestra))]
          // si todos los pocillos ya tienen la MISMA muestra, se muestra seleccionada (como en un pocillo solo)
          const unica = info.length === ids.length && nombres.length === 1
          const estadosBlanco = [...new Set(info.map((i) => !!i.EsBlanco))]
          setSel(ids)
          setMuestra(unica ? nombres[0] : '')
          setBlanco(estadosBlanco.length === 0 ? false : estadosBlanco.length === 1 ? estadosBlanco[0] : null)
        }
      }
      setArr(null); setAct(null)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  })

  const guardar = () => {
    const m = muestra.trim()
    if (!m) return s.avisar('Tenés que indicar una muestra.', 'error')
    const nombre = s.muestras.find((x) => x.toLowerCase() === m.toLowerCase()) || m
    if (!s.muestras.includes(nombre)) s.setMuestras([...s.muestras, nombre])
    let cfg = [...s.config]
    for (const p of sel) {
      const previo = cfg.find((c) => c.Pocillo === p)
      const otros = cfg.filter((c) => c.Pocillo !== p)
      let rep
      if (previo && previo.Muestra === nombre) rep = previo.Replica
      else {
        const ex = otros.filter((c) => c.Muestra === nombre).map((c) => c.Replica)
        rep = ex.length ? Math.max(...ex) + 1 : 1
      }
      // blanco === null: la selección era mixta y no se tocó; cada pocillo conserva su estado
      cfg = [...otros, { Pocillo: p, Muestra: nombre, Replica: rep, EsBlanco: blanco === null ? !!previo?.EsBlanco : blanco }]
    }
    s.setConfig(cfg)
    s.avisar(sel.length === 1 ? `${sel[0]} configurado como ${nombre}` : `${sel.length} pocillos configurados como ${nombre}`)
    setSel(null)
  }
  const quitar = () => { s.setConfig(s.config.filter((c) => !sel.includes(c.Pocillo))); setSel(null) }

  if (!s.datos) return <Vacio texto="Primero cargá el archivo del lector en la pestaña Archivo." />

  const resumen = [...new Set(s.config.map((c) => c.Muestra))].map((m) => {
    const g = s.config.filter((c) => c.Muestra === m)
    return { m, n: g.length, b: g.filter((c) => c.EsBlanco).length, reps: g.map((c) => c.Replica).sort((a, b) => a - b).join(', ') }
  })

  return (
    <div className="con-lateral lateral-der">
      <div className="principal">
        <h1>Placa de 96 pocillos</h1>
        <p className="ayuda">Hacé clic en un pocillo, o clic y arrastrá para seleccionar varios. Elegí una muestra de la lista o escribí una nueva; la réplica se asigna sola. Si es medio sin inocular (blanco), marcá «Definir como blanco». El color de cada pocillo es el de su curva en el gráfico.</p>
        <div className="placa-wrap">
          <table className="placa">
            <thead><tr><th />{Array.from({ length: 12 }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
            <tbody>
              {LETRAS.map((f, fi) => (
                <tr key={f}>
                  <th>{f}</th>
                  {Array.from({ length: 12 }, (_, ci) => {
                    const p = f + (ci + 1)
                    const c = cfgDe(p)
                    const ok = disp.has(p)
                    const enSel = ok && enRect(fi, ci)
                    const fondo = c ? s.colores.porPocillo[p]?.color : null
                    return (
                      <td key={p}
                        onMouseDown={(e) => { if (e.button === 0 && ok) { e.preventDefault(); setArr({ f: fi, c: ci }); setAct({ f: fi, c: ci }) } }}
                        onMouseEnter={() => arr && setAct({ f: fi, c: ci })}>
                        <div className={`pocillo ${!ok ? 'sin-datos' : ''} ${enSel ? 'sel' : ''} ${c ? 'asig' : ''}`}
                          style={fondo && !enSel ? { background: fondo, color: textoSobre(fondo) } : undefined}>
                          {!ok ? <><b>Sin datos</b><small>{p}</small></>
                            : c ? <><b>{nombreReplica(c.Muestra, c.Replica)}</b><small>{c.EsBlanco ? `${p} · blanco` : p}</small></>
                              : <><b>Libre</b><small>{p}</small></>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Panel titulo="Configuración">
        <button className="peligro ancho" disabled={!s.config.length} onClick={() => setConfirmar(true)}>Limpiar configuración</button>
        {resumen.length === 0 ? <p className="ayuda">Todavía no hay pocillos configurados.</p> : (
          <>
            <h3>Pocillos configurados: {s.config.length}</h3>
            {resumen.map((r) => (
              <div key={r.m} className="resumen-m">
                <b>{r.m}</b>
                <span>{r.n} {r.n === 1 ? 'pocillo' : 'pocillos'}{r.b > 0 && ` (${r.b} blanco)`}</span>
                <span>Réplicas: {r.reps}</span>
              </div>
            ))}
          </>
        )}
      </Panel>

      {sel && (
        <Modal titulo={sel.length > 1 ? `Configurar ${sel.length} pocillos` : `Configurar pocillo ${sel[0]}`} onClose={() => setSel(null)}
          pie={<>
            <button onClick={() => setSel(null)}>Cancelar</button>
            {sel.some(cfgDe) && <button className="peligro" onClick={quitar}>Quitar</button>}
            <button className="primario" onClick={guardar}>Guardar</button></>}>
          {sel.length > 1 && <p><b>Pocillos:</b> {sel.join(', ')}</p>}
          {sel.length > 1 && (() => {
            const cnt = {}
            let libres = 0
            sel.forEach((p) => { const c = cfgDe(p); if (c) cnt[c.Muestra] = (cnt[c.Muestra] || 0) + 1; else libres++ })
            const partes = Object.entries(cnt).map(([m, n]) => `${m} (${n})`)
            if (libres) partes.push(`sin asignar (${libres})`)
            const varias = Object.keys(cnt).length > 1 || (Object.keys(cnt).length === 1 && libres > 0)
            return (
              <p className={varias ? 'aviso-sel' : 'ayuda'}>
                {varias ? 'La selección tiene distintas muestras: ' : 'Muestra actual de la selección: '}{partes.join(' · ')}.
                {varias && ' Elegí una para asignarla a todos los pocillos seleccionados.'}
              </p>
            )
          })()}
          <Campo label="Muestra">
            <input autoFocus value={muestra} placeholder="Elegí una muestra de la lista o escribí una nueva"
              onChange={(e) => setMuestra(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} />
          </Campo>
          {(() => {
            const todas = [...new Set([...s.muestras, ...s.config.map((c) => c.Muestra)])]
            const existe = todas.some((m) => m.toLowerCase() === muestra.trim().toLowerCase())
            return (
              <>
                <div className="opciones-muestra" role="listbox">
                  {todas.map((m) => {
                    const n = s.config.filter((c) => c.Muestra === m).length
                    return (
                      <button key={m} role="option" aria-selected={m.toLowerCase() === muestra.trim().toLowerCase()}
                        className={m.toLowerCase() === muestra.trim().toLowerCase() ? 'on' : ''} onClick={() => setMuestra(m)}>
                        <span>{m}</span>{n > 0 && <small>{n} {n === 1 ? 'pocillo' : 'pocillos'}</small>}
                      </button>
                    )
                  })}
                </div>
                {muestra.trim() && !existe && <p className="ayuda">Se creará la muestra nueva «{muestra.trim()}».</p>}
              </>
            )
          })()}
          <label className="check">
            <input type="checkbox" checked={blanco === true} ref={(el) => { if (el) el.indeterminate = blanco === null }}
              onChange={() => setBlanco(blanco === true ? false : true)} />
            <span>Definir como blanco{blanco === null && <small>Mixto: algunos pocillos son blanco y otros no. Si no lo cambiás, cada uno conserva su estado.</small>}</span>
          </label>
          <p className="ayuda">{sel.length > 1 ? 'A cada pocillo se le asigna un número de réplica automático, en orden por filas.' : 'La réplica se asigna sola según cuántas veces uses esta muestra.'}</p>
        </Modal>
      )}
      {confirmar && (
        <Modal titulo="Limpiar configuración" onClose={() => setConfirmar(false)}
          pie={<><button onClick={() => setConfirmar(false)}>Cancelar</button>
            <button className="peligro" onClick={() => { s.setConfig([]); setConfirmar(false) }}>Sí, limpiar</button></>}>
          ¿Querés eliminar toda la configuración de los pocillos?
        </Modal>
      )}
    </div>
  )
}
