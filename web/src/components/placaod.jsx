import { useEffect, useState } from 'react'
import { Campo, Modal, Num, Select } from './ui.jsx'
import { Nota } from './tip.jsx'
import { Vacio } from './placa.jsx'
import { finito } from '../motor/analisis.js'
import { LETRAS } from '../motor/lectura.js'
import { ordenFilas, tiempoDeCol, tiempoDePocillo } from '../motor/placas.js'

const COLS = Array.from({ length: 12 }, (_, i) => i + 1)
export const BLANCO = 'Blanco'

const rgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return `rgba(201,154,91,${a})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// Controles comunes para armar las filas de una placa: réplicas por cepa, orden y filas vacías entre filas
export function ControlesFormato({ f, set }) {
  return (
    <>
      <Campo label="Réplicas por cepa"><Num value={f.reps} min={1} max={8} onChange={(v) => set({ ...f, reps: v === '' ? 1 : v })} /></Campo>
      <Campo label={<>Orden<Nota>{'Agrupado: L100 L100 SCV SCV.\nAlternado: L100 SCV L100 SCV.'}</Nota></>}>
        <Select value={f.orden} onChange={(v) => set({ ...f, orden: v })} opciones={[['agrupado', 'Agrupado por cepa'], ['alternado', 'Alternado']]} />
      </Campo>
      <Campo label={<>Espaciado<Nota>Filas vacías entre una fila usada y la siguiente (por ejemplo, una fila sí y una no).</Nota></>}>
        <Select value={String(f.espacio)} onChange={(v) => set({ ...f, espacio: Number(v) })} opciones={[['0', 'Sin espaciado'], ['1', '1 fila vacía'], ['2', '2 filas vacías'], ['3', '3 filas vacías']]} />
      </Campo>
    </>
  )
}

// ===============================================================
// PLACA DE OD (única): cada COLUMNA es un tiempo (t0 en la 1, t2 en la 2…). La cepa se define por POCILLO:
// se selecciona uno o varios (clic o clic y arrastrar) y se elige la cepa o «Blanco». La cepa de la fila asigna la fila entera.
// ===============================================================
export function PlacaOdTab({ s }) {
  const a = s.a
  const lect = a.lecturas[0]
  const d = a.disenoOd
  const [auto, setAuto] = useState({ reps: 3, orden: 'agrupado', espacio: 0, t0: 0, paso: 2 })
  const [arr, setArr] = useState(null)
  const [act, setAct] = useState(null)
  const [sel, setSel] = useState(null)   // pocillos seleccionados
  const [form, setForm] = useState({ muestra: '', blanco: false, todos: true, tiempo: 'columna' })

  const rect = arr && act ? { f1: Math.min(arr.f, act.f), f2: Math.max(arr.f, act.f), c1: Math.min(arr.c, act.c), c2: Math.max(arr.c, act.c) } : null
  const enRect = (fi, c) => rect && fi >= rect.f1 && fi <= rect.f2 && c >= rect.c1 && c <= rect.c2
  useEffect(() => {
    const up = () => {
      if (!arr) return
      if (rect) {
        const ids = []
        for (let fi = rect.f1; fi <= rect.f2; fi++) for (let c = rect.c1; c <= rect.c2; c++) ids.push(LETRAS[fi] + c)
        const ws = ids.map((p) => d.pocillos[p]).filter(Boolean)
        const nombres = [...new Set(ws.map((w) => w.muestra))]
        const unica = ws.length === ids.length && nombres.length === 1
        setSel(ids)
        setForm({ muestra: unica ? nombres[0] : '', blanco: unica ? ws.every((w) => w.blanco) : false, todos: !ws.some((w) => w.blanco && !w.todos), tiempo: ws.some((w) => w.t !== undefined) ? 'propio' : 'columna' })
      }
      setArr(null); setAct(null)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  })

  if (!lect) return <Vacio texto="Primero cargá la placa de OD en «Experimento» (Origen de la OD: Excel por pocillos)." />
  const val = Object.fromEntries(lect.datos.map((x) => [x.Pocillo, x.OD]))
  const cepas = s.opcionesMuestra
  const color = (m) => (m === BLANCO ? '#9aa5b1' : s.coloresGlobal[m] || '#c99a5b')
  const setT = (c, v) => s.setDisenoOd((x) => ({ ...x, tiempos: { ...x.tiempos, [c]: v } }))
  const setPocillos = (f) => s.setDisenoOd((x) => ({ ...x, pocillos: f(x.pocillos) }))
  const usadas = (c) => finito(tiempoDeCol(d, c))
  const deFila = (L) => COLS.map((c) => d.pocillos[L + c]).filter(Boolean)
  const muestraFila = (L) => {
    const ws = deFila(L).filter((w) => !w.blanco)
    const ms = [...new Set(ws.map((w) => w.muestra))]
    return ms.length === 1 && ws.length === 12 ? ms[0] : ms.length ? '*' : ''
  }
  const setFila = (L, m) => setPocillos((ps) => {
    const out = { ...ps }
    COLS.forEach((c) => { if (m) out[L + c] = { muestra: m, blanco: false }; else delete out[L + c] })
    return out
  })
  const blancoFila = (L, on) => setPocillos((ps) => {
    const out = { ...ps }
    COLS.forEach((c) => {
      const w = out[L + c]
      if (on) out[L + c] = w && w.muestra !== BLANCO ? { ...w, blanco: true, todos: true } : { muestra: BLANCO, blanco: true, todos: true }
      else if (w) { if (w.muestra === BLANCO) delete out[L + c]; else out[L + c] = { ...w, blanco: false } }
    })
    return out
  })

  // réplica de cada curva (fila + cepa), en el mismo orden que placaADatos
  const repDe = {}
  const cuenta = {}
  LETRAS.forEach((L) => {
    COLS.forEach((c) => {
      const w = d.pocillos[L + c]
      if (!w?.muestra) return
      const k = `${L}|${w.muestra}|${w.blanco ? 1 : 0}`
      if (!(k in repDe)) { cuenta[w.muestra] = (cuenta[w.muestra] || 0) + 1; repDe[k] = cuenta[w.muestra] }
    })
  })
  const repPocillo = (p) => { const w = d.pocillos[p]; return w ? repDe[`${p[0]}|${w.muestra}|${w.blanco ? 1 : 0}`] : null }

  const asignarFilas = () => {
    if (!cepas.length) return s.avisar('Elegí las cepas del experimento en «Experimento».', 'error')
    const seq = ordenFilas(cepas, auto.reps, auto.orden, auto.espacio)
    if (seq.length > 8) s.avisar(`Las filas no alcanzan: se necesitan ${seq.length} y la placa tiene 8. Se asignaron las primeras.`, 'error')
    const ps = {}
    seq.slice(0, 8).forEach((x, i) => { if (x) COLS.forEach((c) => { ps[LETRAS[i] + c] = { muestra: x.muestra, blanco: false } }) })
    setPocillos(() => ps)
  }
  const formatoRecuento = () => {
    const pl = s.ufc.placasG[0]
    if (!pl) return s.avisar('Todavía no hay placas de recuento.', 'error')
    const ps = {}
    LETRAS.forEach((L) => { const f = pl.filas[L]; if (f?.muestra) COLS.forEach((c) => { ps[L + c] = { muestra: f.muestra, blanco: false } }) })
    setPocillos(() => ps)
    s.avisar(`Formato copiado de «${pl.nombre}» del recuento.`)
  }
  const llenarTiempos = () => {
    const t = {}
    for (let c = 1; c <= 12; c++) t[c] = Number((Number(auto.t0) + (c - 1) * Number(auto.paso)).toFixed(4))
    s.setDisenoOd((x) => ({ ...x, tiempos: t }))
  }

  const guardar = (elegida) => {
    const m = (typeof elegida === 'string' ? elegida : form.muestra) || (form.blanco ? BLANCO : '')
    if (!m) return s.avisar('Elegí una cepa o «Blanco».', 'error')
    const c1 = Math.min(...sel.map((p) => Number(p.slice(1))))
    setPocillos((ps) => {
      const out = { ...ps }
      sel.forEach((p) => {
        const w = { muestra: m, blanco: m === BLANCO || form.blanco }
        if (w.blanco && form.todos) w.todos = true
        // la primera columna seleccionada pasa a ser t0 (útil con dos cepas en una misma fila)
        if (form.tiempo === 'reinicia') w.t = tiempoDeCol(d, Number(p.slice(1)) - c1 + 1)
        else if (form.tiempo === 'propio' && ps[p]?.t !== undefined) w.t = ps[p].t
        if (w.t !== undefined && !finito(w.t)) delete w.t
        out[p] = w
      })
      return out
    })
    setSel(null)
  }
  const quitar = () => { setPocillos((ps) => Object.fromEntries(Object.entries(ps).filter(([p]) => !sel.includes(p)))); setSel(null) }

  const nCurvas = Object.keys(repDe).length
  const enUso = [...new Set(Object.values(d.pocillos).map((w) => w.muestra))]

  return (
    <div className="pagina">
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Placa de OD <Nota>La placa es única. Cada columna es un tiempo (t0 en la columna 1, t2 en la 2, …; dejá vacía una columna para no usarla). Hacé clic en un pocillo, o clic y arrastrá para seleccionar varios, y elegí la cepa o «Blanco»: así una fila puede tener dos cepas o el blanco puede ir al final de la placa. La cepa de la fila asigna la fila entera. Las cepas son las que elegiste en «Experimento».</Nota></h2>
          <small className="ayuda">{lect.nombre}{lect.onda ? ` · ${lect.onda} nm` : ''}</small>
        </div>
        <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
          <ControlesFormato f={auto} set={setAuto} />
          <button onClick={asignarFilas} data-tip={'Asignar filas\nCada cepa del experimento ocupa esa cantidad de filas, de la A en adelante, con el orden y el espaciado elegidos.'}>Asignar filas</button>
          {s.ufc.placasG.length > 0 && <button onClick={formatoRecuento} data-tip={'Mismo formato que en el recuento\nCada fila toma la cepa de la misma fila de la primera placa de recuento.'}>Usar formato del recuento</button>}
        </div>
        <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
          <Campo label="t de la columna 1 (h)"><Num value={auto.t0} min={0} step={0.5} onChange={(v) => setAuto({ ...auto, t0: v === '' ? 0 : v })} /></Campo>
          <Campo label="Cada (h)"><Num value={auto.paso} min={0.1} step={0.5} onChange={(v) => setAuto({ ...auto, paso: v === '' ? 1 : v })} /></Campo>
          <button onClick={llenarTiempos}>Asignar tiempos</button>
        </div>
        <div className="tabla-scroll" style={{ maxHeight: 'none' }}>
          <table className="tabla placa-od">
            <thead>
              <tr>
                <th>Fila</th><th>Cepa de la fila</th><th title="Medio sin inocular">Blanco</th>
                {COLS.map((c) => (
                  <th key={c} className={usadas(c) ? '' : 'col-sin-t'}>
                    <div className="col-num">{c}</div>
                    <div className="t-col"><input type="number" step="any" min="0" placeholder="t" value={d.tiempos[c] ?? ''}
                      onChange={(e) => setT(c, e.target.value === '' ? '' : Number(e.target.value))} data-tip={`Columna ${c}\nTiempo de la columna (h). Vacío = no se usa.`} /> <small>h</small></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LETRAS.map((L, fi) => {
                const mf = muestraFila(L)
                const ws = deFila(L)
                const todoBlanco = ws.length === 12 && ws.every((w) => w.blanco)
                return (
                  <tr key={L}>
                    <th>{L}</th>
                    <td>
                      <select value={mf} onChange={(e) => e.target.value !== '*' && setFila(L, e.target.value)}>
                        <option value="">(sin cepa)</option>
                        {mf === '*' && <option value="*">(varias)</option>}
                        {[...new Set([...cepas, ...(mf && mf !== '*' ? [mf] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={todoBlanco} ref={(el) => { if (el) el.indeterminate = !todoBlanco && ws.some((w) => w.blanco) }}
                        onChange={(e) => blancoFila(L, e.target.checked)} data-tip="Toda la fila es blanco (medio sin inocular)" />
                    </td>
                    {COLS.map((c) => {
                      const p = L + c
                      const v = val[p]
                      const w = d.pocillos[p]
                      const t = tiempoDePocillo(d, p)
                      const activo = !!w && finito(t)
                      const enSel = enRect(fi, c) || (sel && sel.includes(p))
                      return (
                        <td key={c} className={`celda-od sel-od ${enSel ? 'sel' : ''}`}
                          style={{ background: w ? rgba(color(w.muestra), w.blanco ? 0.14 : activo ? 0.32 : 0.12) : undefined, opacity: activo || !w ? 1 : 0.6, boxShadow: w ? `inset 0 3px 0 ${color(w.muestra)}` : undefined }}
                          onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); setArr({ f: fi, c }); setAct({ f: fi, c }) } }}
                          onMouseEnter={() => arr && setAct({ f: fi, c })}
                          data-tip={`${p}${w ? ` · ${w.muestra}${w.blanco ? (w.todos ? ' (blanco, todos los tiempos)' : ' (blanco)') : ` R${repPocillo(p)}`}` : ' · sin cepa'}${finito(v) ? `\nOD = ${v.toFixed(4)}` : ''}${finito(t) ? `\nt = ${t} h${w?.t !== undefined ? ' (propio del pocillo)' : ''}` : '\nColumna sin tiempo: no se usa'}\nClic o arrastrá para definir`}>
                          {finito(v) ? v.toFixed(3) : ''}
                          {w?.t !== undefined && <i className="marca-t" />}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="leyenda-petri">
          {enUso.map((m) => <span key={m}><i style={{ background: color(m) }} />{m}</span>)}
        </div>
        <p className="ayuda">{nCurvas ? `${nCurvas} curvas armadas` : 'Seleccioná pocillos (o usá la cepa de cada fila) para armar las curvas'}{s.datos ? ` · ${s.datos.tiempos.length} tiempos` : ''}. Una curva = los pocillos de una fila con la misma cepa.</p>
      </section>

      {sel && (
        <Modal titulo={sel.length > 1 ? `Definir ${sel.length} pocillos` : `Definir el pocillo ${sel[0]}`} onClose={() => setSel(null)}
          pie={<>
            <button onClick={() => setSel(null)}>Cancelar</button>
            {sel.some((p) => d.pocillos[p]) && <button className="peligro" onClick={quitar}>Quitar</button>}
            <button className="primario" onClick={guardar}>Guardar</button></>}>
          <div onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
            const t = e.target
            if (t.tagName === 'BUTTON' && t.getAttribute('role') !== 'option') return
            e.preventDefault()
            guardar(t.getAttribute('role') === 'option' ? t.dataset.muestra : undefined)
          }}>
            {sel.length > 1 && <p className="ayuda"><b>Pocillos:</b> {sel.length <= 24 ? sel.join(', ') : `${sel[0]} a ${sel.at(-1)}`}</p>}
            <div className="opciones-muestra" role="listbox">
              {[...cepas, BLANCO].map((m) => (
                <button key={m} role="option" data-muestra={m} aria-selected={form.muestra === m} className={form.muestra === m ? 'on' : ''}
                  onClick={() => setForm({ ...form, muestra: m, blanco: m === BLANCO ? true : form.blanco })}>
                  <span><i className="punto-cepa" style={{ background: color(m) }} />{m === BLANCO ? 'Blanco (medio sin inocular)' : m}</span>
                </button>
              ))}
            </div>
            {!cepas.length && <p className="aviso-sel">No hay cepas elegidas: elegilas en «Experimento».</p>}
            {form.muestra !== BLANCO && (
              <label className="check"><input type="checkbox" checked={form.blanco} onChange={(e) => setForm({ ...form, blanco: e.target.checked })} />
                <span>Es blanco de esta cepa<small>Medio sin inocular; se resta a las curvas.</small></span></label>
            )}
            {(form.muestra === BLANCO || form.blanco) && (
              <label className="check"><input type="checkbox" checked={form.todos} onChange={(e) => setForm({ ...form, todos: e.target.checked })} />
                <span>Aplicar el blanco a todos los tiempos<small>Su OD promedio se resta en cada tiempo de la placa, esté en la columna que esté. Sin marcar, cada pocillo de blanco se usa solo en el tiempo de su columna.</small></span></label>
            )}
            <Campo label="Tiempo de cada pocillo">
              <Select value={form.tiempo} onChange={(v) => setForm({ ...form, tiempo: v })} opciones={[
                ['columna', 'El de su columna'],
                ['reinicia', 'La primera columna seleccionada es t0'],
                ...(sel.some((p) => d.pocillos[p]?.t !== undefined) ? [['propio', 'Conservar el que tenía']] : []),
              ]} />
            </Campo>
            {form.tiempo === 'reinicia' && <p className="ayuda">Por ejemplo, con L100 en A1–A6 y SCV en A7–A12, SCV usa en A7 el tiempo de la columna 1, en A8 el de la 2, etc.</p>}
            <p className="ayuda">Elegí la cepa y apretá <b>Enter</b>: se guarda y se cierra la ventana.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
