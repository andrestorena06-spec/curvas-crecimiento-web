import { useEffect, useMemo, useRef, useState } from 'react'
import { rellenoPocillo, useTema } from '../tema.js'
import { LETRAS, ordenPocillo, sub } from '../utils.js'
import { Campo, Check, Icono, Modal, Num } from './base.jsx'

export const DILUCIONES = [1, 2, 4, 5, 10, 20, 50, 100]

// Numera las réplicas de cada cepa en orden de lectura (A1, A2, …, B1, …); los blancos se numeran aparte
export function numerarReplicas(layout) {
  const cuenta = {}
  const out = {}
  Object.keys(layout).sort((a, b) => ordenPocillo(a) - ordenPocillo(b)).forEach((p) => {
    const L = layout[p]
    if (!L?.muestra) return
    const k = (L.blanco ? 'b|' : 'm|') + L.muestra
    cuenta[k] = (cuenta[k] || 0) + 1
    out[p] = cuenta[k]
  })
  return out
}

// Editor de placa de 96 pocillos.
//   layout: { A1: { muestra, blanco, factor } }   disponibles: Set de pocillos con datos (null = todos)
//   valores: { A1: OD } (opcional, se muestra en cada pocillo)
export function PlacaEditor({ layout, onAsignar, cepas, colores, disponibles = null, valores = null, mostrarFactor = false, onNuevaCepa, compacta = false, opcionTodas = null }) {
  const T = useTema()
  const [ini, setIni] = useState(null)
  const [act, setAct] = useState(null)
  const [sel, setSel] = useState(null)
  const [extra, setExtra] = useState([])        // selección acumulada con Shift/Ctrl (pocillos salteados)
  const mod = useRef(false)
  const reps = useMemo(() => numerarReplicas(layout), [layout])
  const ok = (p) => !disponibles || disponibles.has(p)

  const rect = ini && act ? { f1: Math.min(ini.f, act.f), f2: Math.max(ini.f, act.f), c1: Math.min(ini.c, act.c), c2: Math.max(ini.c, act.c) } : null
  const enRect = (f, c) => rect && f >= rect.f1 && f <= rect.f2 && c >= rect.c1 && c <= rect.c2
  // con Shift o Ctrl los pocillos se suman (o se quitan si ya estaban) y la ventana se abre al soltar la tecla
  const acumular = (ids) => setExtra((x) => {
    const set = new Set(x)
    if (ids.length === 1 && set.has(ids[0])) set.delete(ids[0]); else ids.forEach((p) => set.add(p))
    return [...set]
  })
  useEffect(() => {
    const up = () => {
      if (!ini || !rect) return
      const ids = []
      for (let f = rect.f1; f <= rect.f2; f++) for (let c = rect.c1; c <= rect.c2; c++) { const p = LETRAS[f] + (c + 1); if (ok(p)) ids.push(p) }
      setIni(null); setAct(null)
      if (!ids.length) return
      if (mod.current) acumular(ids); else setSel(ids)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  })
  useEffect(() => {
    const k = (e) => {
      if ((e.key === 'Shift' || e.key === 'Control') && !e.shiftKey && !e.ctrlKey && extra.length) { setSel(extra); setExtra([]) }
      if (e.key === 'Escape') setExtra([])
    }
    window.addEventListener('keyup', k)
    return () => window.removeEventListener('keyup', k)
  }, [extra])
  const elegirGrupo = (ids, e) => { const v = ids.filter(ok); if (!v.length) return; if (e?.shiftKey || e?.ctrlKey) acumular(v); else setSel(v) }
  const enExtra = new Set(extra)

  const W = compacta ? 55 : 74
  return (
    <>
      <div className="placa-wrap">
        <table className="placa">
          <thead><tr>
            <th />
            {Array.from({ length: 12 }, (_, c) => (
              <th key={c}><button className="fantasma chico" style={{ width: W, justifyContent: 'center' }} title={`Seleccionar la columna ${c + 1}`}
                onClick={(e) => elegirGrupo(LETRAS.map((L) => L + (c + 1)), e)}>{c + 1}</button></th>
            ))}
          </tr></thead>
          <tbody>
            {LETRAS.map((L, f) => (
              <tr key={L}>
                <th><button className="fantasma chico" title={`Seleccionar la fila ${L}`} onClick={(e) => elegirGrupo(Array.from({ length: 12 }, (_, c) => L + (c + 1)), e)}>{L}</button></th>
                {Array.from({ length: 12 }, (_, c) => {
                  const p = L + (c + 1)
                  const info = layout[p]
                  const col = info?.muestra ? (info.blanco ? '#8C9BB0' : colores[info.muestra] || '#8C9BB0') : null
                  const v = valores?.[p]
                  return (
                    <td key={p} onMouseDown={(e) => { if (e.button === 0 && ok(p)) { e.preventDefault(); mod.current = e.shiftKey || e.ctrlKey; setIni({ f, c }); setAct({ f, c }) } }}
                      onMouseEnter={() => ini && setAct({ f, c })}>
                      <div className={`pozo ${enRect(f, c) || enExtra.has(p) ? 'sel' : ''} ${!ok(p) ? 'vacio-poz' : ''} ${info?.blanco ? 'blanco' : ''}`}
                        style={{ width: W, height: compacta ? 44 : 50, fontSize: compacta ? 10.5 : undefined, background: col ? rellenoPocillo(col, T) : undefined, borderColor: col || undefined }}
                        data-tip={info?.muestra ? `${p}: ${info.muestra}${info.blanco ? ' (blanco)' : ` · réplica ${reps[p]}`}${Number(info.factor) > 1 ? `\nOD leída sobre una dilución 1:${info.factor}` : ''}${Number.isFinite(v) ? `\nOD leída: ${v.toFixed(3)}` : ''}` : undefined}>
                        {!ok(p) ? <small>{p}<br />sin datos</small> : info?.muestra ? (
                          <>
                            <b style={{ color: T.texto }}>{info.blanco ? 'Blanco' : info.muestra}</b>
                            <small>{info.blanco ? p : `${p} · ${sub(reps[p])}`}{Number(info.factor) > 1 ? ` · ×${info.factor}` : ''}</small>
                          </>
                        ) : (
                          <><small>{p}</small>{Number.isFinite(v) && <small className="mono">{v.toFixed(3)}</small>}</>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {extra.length > 0 && (
        <div className="barra-seleccion">
          <b>{extra.length} pocillo{extra.length > 1 ? 's' : ''} seleccionado{extra.length > 1 ? 's' : ''}</b>
          <span className="ayuda">{extra.join(', ')}</span>
          <span className="espacio" />
          <span className="ayuda">Soltá Shift para asignarlos</span>
          <button className="chico" onClick={() => setExtra([])}>Limpiar</button>
          <button className="chico primario" onClick={() => { setSel(extra); setExtra([]) }}>Asignar</button>
        </div>
      )}
      <Leyenda layout={layout} colores={colores} />
      {sel && <ModalAsignar sel={sel} layout={layout} cepas={cepas} colores={colores} mostrarFactor={mostrarFactor} onNuevaCepa={onNuevaCepa} opcionTodas={opcionTodas}
        onClose={() => setSel(null)} onGuardar={(v, todas) => { onAsignar(sel, v, todas); setSel(null) }} />}
    </>
  )
}

export function Leyenda({ layout, colores }) {
  const T = useTema()
  const cnt = {}
  let nb = 0
  Object.values(layout).forEach((l) => { if (!l?.muestra) return; if (l.blanco) nb++; else cnt[l.muestra] = (cnt[l.muestra] || 0) + 1 })
  if (!Object.keys(cnt).length && !nb) return <p className="ayuda" style={{ marginTop: 10 }}>Hacé clic en un pocillo, arrastrá para elegir un rectángulo, o tocá el número de una columna o la letra de una fila. Con Shift (o Ctrl) apretado podés sumar pocillos salteados; al soltar la tecla se abre la ventana para asignarlos.</p>
  return (
    <div className="leyenda-cepas">
      {Object.entries(cnt).map(([m, n]) => <span key={m}><i className="punto" style={{ background: rellenoPocillo(colores[m] || '#8C9BB0', T), border: `1.5px solid ${colores[m]}` }} />{m} · {n} {n === 1 ? 'réplica' : 'réplicas'}</span>)}
      {nb > 0 && <span><i className="punto" style={{ background: '#8C9BB0' }} />Blanco · {nb}</span>}
    </div>
  )
}

function ModalAsignar({ sel, layout, cepas, colores, mostrarFactor, onClose, onGuardar, onNuevaCepa, opcionTodas }) {
  const [todas, setTodas] = useState(false)
  const previos = sel.map((p) => layout[p]).filter((x) => x?.muestra)
  const unica = previos.length === sel.length && new Set(previos.map((x) => x.muestra)).size === 1
  const [muestra, setMuestra] = useState(unica ? previos[0].muestra : '')
  const [blanco, setBlanco] = useState(previos.length > 0 && previos.every((x) => x.blanco))
  const [factor, setFactor] = useState(previos[0]?.factor || 1)
  const T = useTema()
  const guardar = (m = muestra) => {
    const n = (blanco ? m || 'Blanco' : m).trim()
    if (!n) return
    if (!cepas.includes(n) && !blanco) onNuevaCepa?.(n)
    onGuardar({ muestra: n, blanco, factor: Number(factor) > 0 ? Number(factor) : 1 }, todas)
  }
  const existe = cepas.some((c) => c.toLowerCase() === muestra.trim().toLowerCase())
  return (
    <Modal titulo={sel.length === 1 ? `Pocillo ${sel[0]}` : `${sel.length} pocillos seleccionados`} onClose={onClose} ancho={560}
      pie={<>
        {previos.length > 0 && <button className="peligro" onClick={() => onGuardar(null, todas)}><Icono n="borrar" size={15} />Vaciar</button>}
        <span className="espacio" />
        <button onClick={onClose}>Cancelar</button>
        <button className="primario" disabled={!blanco && !muestra.trim()} onClick={() => guardar()}>Guardar</button>
      </>}>
      <div onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); guardar() } }}>
        {sel.length > 1 && <p className="ayuda">{sel.join(', ')}. Las réplicas se numeran solas, en orden de lectura.</p>}
        <Campo label="Cepa o muestra">
          <input autoFocus value={muestra} placeholder="Elegí de la lista o escribí una nueva" onChange={(e) => setMuestra(e.target.value)} />
        </Campo>
        <div className="lista-opciones">
          {cepas.map((c) => (
            <button key={c} className={c === muestra ? 'on' : ''} onClick={() => setMuestra(c)} onDoubleClick={() => { setMuestra(c); guardar(c) }}>
              <i className="punto" style={{ background: rellenoPocillo(colores[c] || '#8C9BB0', T), border: `1.5px solid ${colores[c] || '#8C9BB0'}` }} />{c}
            </button>
          ))}
        </div>
        {muestra.trim() && !existe && !blanco && <p className="ayuda">Se agrega la cepa nueva «{muestra.trim()}».</p>}
        <Check label="Es blanco (medio sin inocular)" checked={blanco} onChange={setBlanco}
          ayuda="Su OD se resta a las demás. Si no escribís un nombre se llama «Blanco»." />
        {mostrarFactor && !blanco && (
          <Campo label="Factor de dilución de la lectura" ayuda="Si la OD se leyó sobre una dilución de la muestra (por ejemplo 1:10 porque estaba fuera de la zona lineal), escribí 10: la OD se calcula como (lectura − blanco) × factor.">
            <div className="lista-opciones" style={{ marginBottom: 6 }}>
              {DILUCIONES.map((d) => <button key={d} className={Number(factor) === d ? 'on' : ''} onClick={() => setFactor(d)}>{d === 1 ? 'Sin diluir' : `1:${d}`}</button>)}
            </div>
            <div className="fila"><span className="ayuda">Otra: 1 :</span><Num value={factor} onChange={setFactor} ancho={90} /></div>
          </Campo>
        )}
        {opcionTodas && <Check label={opcionTodas} checked={todas} onChange={setTodas} ayuda="Los mismos pocillos quedan definidos igual en todas las placas (tiempos)." />}
        <p className="ayuda" style={{ marginBottom: 0 }}>Enter guarda · doble clic en una cepa la asigna directamente.</p>
      </div>
    </Modal>
  )
}
