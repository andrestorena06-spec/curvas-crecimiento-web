import { useMemo, useRef, useState } from 'react'
import { Campo, Num, Select } from './ui.jsx'
import { Nota } from './tip.jsx'
import { Vacio } from './placa.jsx'
import { finito } from '../motor/analisis.js'
import { LETRAS } from '../motor/lectura.js'
import { calcularUfc, coloniasEsperadas, contable, dilucionDe, potenciaDe, texto10, tiemposG } from '../motor/ufc.js'
import { nuevoId } from '../experimento.js'
import { dUfc, sci } from '../calculos.js'

const COLS = Array.from({ length: 12 }, (_, i) => i + 1)
const filaVacia = () => ({ muestra: '', desde: 1, hasta: 11 })
const placaNueva = (n) => ({ id: nuevoId(), nombre: `Placa ${n}`, filas: {}, conteos: {} })
// tiempo (h) de una placa de gotas; sesiones anteriores sin tiempo en la placa: el de su primera fila usada
const tPlaca = (p) => {
  if (p.t !== undefined && p.t !== '' && finito(Number(p.t))) return Number(p.t)
  const t = Number(Object.values(p.filas || {}).find((f) => f?.muestra)?.t)
  return finito(t) ? t : 0
}
const fondo = (n, par) => (!finito(n) ? undefined : contable(n, par) ? '#e3f1dc' : n > par.max ? '#f8d9d6' : n === 0 ? '#efece6' : '#fbf0cf')
const num = (v) => { const t = String(v ?? '').trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null }

// pasos reales con los que se armó la placa (a partir de los parámetros de dilución)
export function pasosDePlaca(par) {
  const f = par.factor
  const out = []
  if (par.primero === 'madre') out.push(`Pocillo 1: solución madre sin diluir (${texto10(0)}).`)
  else out.push(`Solución madre: tomar ${par.madre.toma} µL y llevar a ${par.madre.final} µL en el pocillo 1 (1 : ${Number((par.madre.final / par.madre.toma).toPrecision(4))} = ${texto10(potenciaDe(par, 1))}).`)
  out.push(`Pocillos siguientes: pasar ${par.toma} µL de un pocillo al siguiente y completar a ${par.final} µL con diluyente (factor ${Number(f.toPrecision(4))} = ${texto10(Math.log10(1 / f))} por paso).`)
  out.push(`Gota: ${par.vol * 1000} µL de cada pocillo sobre el agar; contables entre ${par.min} y ${par.max} colonias.`)
  return out
}

// ===============================================================
// DISEÑO DE PLACA: qué hay en cada fila (cepa, tiempo, réplica y pocillos usados) y cómo se hicieron las diluciones
// ===============================================================
export function DisenoGota({ s }) {
  const { ufc } = s
  const par = ufc.par
  const placas = ufc.placasG
  const [pid, setPid] = useState(placas[0]?.id || null)
  const [gen, setGen] = useState({ cepa: '', tiempos: '0, 1, 2, 3, 4, 5, 6', reps: 2, desde: 1, hasta: 11, espacio: 0 })
  const placa = placas.find((p) => p.id === pid) || placas[0] || null
  const cepas = s.opcionesMuestra
  const color = (m) => s.coloresGlobal[m] || '#c99a5b'
  // cada placa es un tiempo: las filas toman el tiempo de su placa y la réplica se numera sola (por cepa, de la A a la H)
  //   (si un tiempo ocupa más de una placa, la numeración sigue de una a la otra)
  const ordenar = (ps) => {
    const cuenta = {}
    return ps.map((p) => {
      const t = tPlaca(p)
      const filas = {}
      LETRAS.forEach((L) => {
        const f = p.filas[L]
        if (!f?.muestra) return
        const k = `${t}|${f.muestra}`
        cuenta[k] = (cuenta[k] || 0) + 1
        filas[L] = { ...f, t, rep: cuenta[k] }
      })
      return { ...p, t, nombre: `T = ${t} h`, filas, conteos: Object.fromEntries(Object.entries(p.conteos || {}).filter(([k]) => filas[k[0]])) }
    })
  }
  const setPlacas = (f) => s.setUfc((u) => ({ ...u, placasG: ordenar(typeof f === 'function' ? f(u.placasG) : f) }))
  const setFila = (L, patch) => setPlacas((ps) => ps.map((p) => (p.id === placa.id ? { ...p, filas: { ...p.filas, [L]: { ...(p.filas[L] || filaVacia()), ...patch } } } : p)))
  const quitarFila = (L) => setPlacas((ps) => ps.map((p) => {
    if (p.id !== placa.id) return p
    const filas = { ...p.filas }; delete filas[L]
    return { ...p, filas }
  }))
  const setTiempo = (v) => setPlacas((ps) => ps.map((p) => (p.id === placa.id ? { ...p, t: v === '' ? 0 : v } : p)))
  // nuevo tiempo: una placa con el mismo formato que la que se está viendo, sin conteos
  const crear = () => {
    const t = placas.length ? Math.max(...placas.map(tPlaca).filter(finito)) + 1 : 0
    const p = { ...placaNueva(placas.length + 1), t, filas: placa ? JSON.parse(JSON.stringify(placa.filas)) : {} }
    setPlacas((ps) => [...ps, p].sort((a, b) => tPlaca(a) - tPlaca(b))); setPid(p.id)
  }
  const quitar = () => {
    if (Object.keys(placa.conteos).length && !window.confirm(`La placa de T = ${tPlaca(placa)} h tiene conteos cargados. ¿Quitarla?`)) return
    setPlacas((ps) => ps.filter((p) => p.id !== placa.id)); setPid(null)
  }

  // formato de la placa de OD: cada fila con una sola cepa (sin contar los blancos) pasa a esta placa
  const formatoOd = () => {
    const pc = s.a.disenoOd.pocillos
    const filas = {}
    LETRAS.forEach((L) => {
      const ms = [...new Set(COLS.map((c) => pc[L + c]).filter((w) => w && !w.blanco).map((w) => w.muestra))]
      if (ms.length === 1) filas[L] = { ...filaVacia(), ...(placa.filas[L] || {}), muestra: ms[0] }
    })
    setPlacas((ps) => ps.map((p) => (p.id === placa.id ? { ...p, filas } : p)))
    s.avisar('Formato copiado de la placa de OD.')
  }
  // copia el formato de esta placa a las demás; cada una conserva su tiempo
  const aTodas = () => {
    if (placas.some((p) => p.id !== placa.id && Object.keys(p.conteos).length) && !window.confirm('Otras placas tienen conteos: se conservan los de las filas que siguen usadas. ¿Continuar?')) return
    setPlacas((ps) => ps.map((p) => (p.id === placa.id ? p : { ...p, filas: JSON.parse(JSON.stringify(placa.filas)) })))
    s.avisar('Formato aplicado a todas las placas. Podés editar cada una.')
  }

  // genera filas: para cada tiempo, sus réplicas en las filas libres de la placa de ese tiempo (si no hay lugar, se crea otra)
  const generar = () => {
    const ts = gen.tiempos.split(/[;,\s]+/).map(num).filter((v) => v !== null && v >= 0)
    if (!gen.cepa) return s.avisar('Elegí la cepa.', 'error')
    if (!ts.length) return s.avisar('Escribí los tiempos en horas, separados por comas.', 'error')
    const esp = Math.max(0, Number(gen.espacio) || 0)
    setPlacas((ps) => {
      const out = ps.map((p) => ({ ...p, filas: { ...p.filas } }))
      ts.forEach((t) => {
        // null = fila vacía (espaciado): ocupa una fila libre y la deja sin cepa
        const nuevas = []
        for (let r = 1; r <= Math.max(1, gen.reps); r++) { if (nuevas.length) for (let k = 0; k < esp; k++) nuevas.push(null); nuevas.push({ muestra: gen.cepa, desde: Number(gen.desde), hasta: Number(gen.hasta) }) }
        let i = 0
        for (const p of out) if (tPlaca(p) === t) for (const L of LETRAS) if (i < nuevas.length && !p.filas[L]?.muestra) { if (nuevas[i]) p.filas[L] = nuevas[i]; i++ }
        while (i < nuevas.length) {
          const p = { ...placaNueva(out.length + 1), t }
          for (const L of LETRAS) if (i < nuevas.length) { if (nuevas[i]) p.filas[L] = nuevas[i]; i++ }
          out.push(p)
        }
      })
      return out.sort((a, b) => tPlaca(a) - tPlaca(b))
    })
    s.avisar(`${Math.max(1, gen.reps) * ts.length} filas generadas.`)
  }
  const tPlacas = placas.map(tPlaca)
  const etiqueta = (p, i) => `T = ${tPlacas[i]} h${tPlacas.filter((x) => x === tPlacas[i]).length > 1 ? ` (${tPlacas.slice(0, i + 1).filter((x) => x === tPlacas[i]).length})` : ''}`

  return (
    <>
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Diseño de placa <Nota>Cada placa de 96 es un tiempo. Cada FILA es una réplica de una cepa (la réplica se numera sola) y cada COLUMNA, una dilución seriada: elegí desde qué columna hasta cuál se sembró. Después, en «Conteos», elegís el tiempo y escribís las colonias.</Nota></h2>
          <div className="fila-ctrl" style={{ margin: 0 }}>
            {placas.map((p, i) => <button key={p.id} className={`chip-t ${placa && p.id === placa.id ? 'on' : ''}`} onClick={() => setPid(p.id)}>{etiqueta(p, i)}</button>)}
            <button className="chico primario" onClick={crear} data-tip={'Nuevo tiempo\nUna placa más, con el mismo formato que la que estás viendo.'}>+ Tiempo</button>
          </div>
        </div>
        <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
          <Campo label="Generar filas · cepa">
            <select value={gen.cepa} onChange={(e) => setGen({ ...gen, cepa: e.target.value })}>
              <option value="">Elegí…</option>
              {cepas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Campo>
          <Campo label="Tiempos (h)"><input style={{ width: 200 }} value={gen.tiempos} onChange={(e) => setGen({ ...gen, tiempos: e.target.value })} /></Campo>
          <Campo label="Réplicas por tiempo"><Num value={gen.reps} min={1} max={8} onChange={(v) => setGen({ ...gen, reps: v === '' ? 1 : v })} /></Campo>
          <Campo label="Pocillos desde"><Num value={gen.desde} min={1} max={12} onChange={(v) => setGen({ ...gen, desde: v === '' ? 1 : v })} /></Campo>
          <Campo label="hasta"><Num value={gen.hasta} min={1} max={12} onChange={(v) => setGen({ ...gen, hasta: v === '' ? 12 : v })} /></Campo>
          <Campo label={<>Espaciado<Nota>Filas vacías entre una fila y la siguiente: deja lugar para sembrar las gotas de cada réplica con suficiente espacio.</Nota></>}>
            <Select value={String(gen.espacio)} onChange={(v) => setGen({ ...gen, espacio: Number(v) })} opciones={[['0', 'Sin espaciado'], ['1', '1 fila vacía'], ['2', '2 filas vacías'], ['3', '3 filas vacías']]} />
          </Campo>
          <button className="primario" onClick={generar} data-tip={'Generar filas\nPara cada tiempo, las réplicas en las filas libres de la placa de ese tiempo (se crea la placa si no existe).'}>Generar</button>
        </div>
        {!placa ? <Vacio texto="Todavía no hay placas. Creá una con «+ Tiempo» o generá filas." /> : (
          <>
            <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
              <Campo label="Tiempo de esta placa (h)"><Num value={tPlaca(placa)} min={0} step={0.5} onChange={setTiempo} /></Campo>
              {s.a.disenoOd && Object.keys(s.a.disenoOd.pocillos).length > 0 && <button className="chico" onClick={formatoOd} data-tip={'Mismo formato que la placa de OD\nCada fila de esta placa toma la cepa de la misma fila de la placa de OD.'}>Usar formato de la placa de OD</button>}
              {placas.length > 1 && <button className="chico" onClick={aTodas} data-tip={'Mismo formato en todas las placas\nCopia las cepas y las columnas de esta placa a las demás (cada placa conserva su tiempo y sus conteos). Después se puede editar cada una, por ejemplo si en los primeros tiempos se hicieron menos diluciones.'}>Aplicar este formato a todas las placas</button>}
              <button className="chico peligro" onClick={quitar}>Quitar placa</button>
            </div>
            <div className="tabla-scroll" style={{ maxHeight: 'none' }}>
              <table className="tabla tabla-od">
                <thead><tr><th>Fila</th><th>Cepa</th><th>Desde la columna</th><th>Hasta la columna</th><th /></tr></thead>
                <tbody>
                  {LETRAS.map((L) => {
                    const f = placa.filas[L]
                    return (
                      <tr key={L}>
                        <th>{L}{f?.muestra && <small> R{f.rep}</small>}</th>
                        <td>
                          <select value={f?.muestra || ''} onChange={(e) => (e.target.value ? setFila(L, { muestra: e.target.value }) : quitarFila(L))}>
                            <option value="">(sin cepa)</option>
                            {[...new Set([...cepas, ...(f?.muestra ? [f.muestra] : [])])].map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </td>
                        <td><input type="number" min="1" max="12" style={{ width: 64 }} disabled={!f} value={f?.desde ?? ''} onChange={(e) => setFila(L, { desde: Number(e.target.value) || 1 })} /></td>
                        <td><input type="number" min="1" max="12" style={{ width: 64 }} disabled={!f} value={f?.hasta ?? ''} onChange={(e) => setFila(L, { hasta: Number(e.target.value) || 12 })} /></td>
                        <td>{f && <button className="chico peligro" aria-label="Vaciar fila" onClick={() => quitarFila(L)}>×</button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="tarjeta">
        <h2>Cómo se hizo la placa</h2>
        <ol className="pasos-placa">{pasosDePlaca(par).map((t, i) => <li key={i}>{t}</li>)}</ol>
        <div className="tabla-scroll" style={{ maxHeight: 'none' }}>
          <table className="plano-placa">
            <thead>
              <tr>
                <th rowSpan="2">Fila</th>
                {COLS.map((j) => <th key={j}>{j}</th>)}
              </tr>
              <tr className="fila-pot">
                {COLS.map((j) => <th key={j} data-tip={`Pocillo ${j}\nDilución 1 : ${Number(dilucionDe(par, j).toPrecision(5))}\n${texto10(potenciaDe(par, j))}`}>{texto10(potenciaDe(par, j))}</th>)}
              </tr>
            </thead>
            <tbody>
              {LETRAS.map((L) => {
                const f = placa?.filas[L]
                return (
                  <tr key={L}>
                    <th>{L}<small>{f?.muestra ? ` ${f.muestra} · T=${f.t} h · R${f.rep}` : ''}</small></th>
                    {COLS.map((j) => {
                      const usa = f && j >= (f.desde || 1) && j <= (f.hasta || 12)
                      return (
                        <td key={j} className={usa ? 'pozo-usado' : 'pozo-libre'} style={usa ? { background: color(f.muestra) + '55', borderColor: color(f.muestra) } : undefined}
                          data-tip={usa ? `${L}${j} · ${f.muestra}\nT = ${f.t} h · réplica ${f.rep}\nDilución 1 : ${Number(dilucionDe(par, j).toPrecision(5))} (${texto10(potenciaDe(par, j))})\nUFC/mL = colonias / ${par.vol} mL × ${Number(dilucionDe(par, j).toPrecision(5))}` : undefined} />
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="leyenda-petri">
          {[...new Set(placas.flatMap((p) => Object.values(p.filas).map((f) => f.muestra)).filter(Boolean))].map((m) => <span key={m}><i style={{ background: color(m) }} />{m}</span>)}
        </div>
      </section>
    </>
  )
}

// ===============================================================
// CONTEOS: se elige el tiempo y el rango de diluciones; se escribe el número de colonias en cada pocillo
// ===============================================================
export function ConteosGota({ s }) {
  const { ufc } = s
  const par = ufc.par
  const o = s.opts.ufc
  const ts = tiemposG(ufc)
  const t = ts.includes(Number(o.t)) ? Number(o.t) : ts[0]
  const cd = Math.max(1, Math.min(12, Number(o.cd) || 1)), ch = Math.max(cd, Math.min(12, Number(o.ch) || 12))
  const refs = useRef({})
  const res = useMemo(() => calcularUfc(ufc), [ufc])
  const color = (m) => s.coloresGlobal[m] || '#c99a5b'
  if (!ts.length) return <Vacio texto="Primero definí qué hay en cada fila en «Diseño de placa»." />
  const filas = ufc.placasG.flatMap((p) => Object.entries(p.filas).filter(([, f]) => f && f.muestra && Number(f.t) === t).map(([L, f]) => ({ p, L, f })))
  const cols = Array.from({ length: ch - cd + 1 }, (_, i) => cd + i)
  const stock = s.stock[String(Math.round(t * 1000) / 1000)]
  const poner = (pid, mapa) => s.setUfc((u) => ({
    ...u, placasG: u.placasG.map((p) => {
      if (p.id !== pid) return p
      const c = { ...p.conteos }
      Object.entries(mapa).forEach(([k, v]) => { if (v === null) delete c[k]; else c[k] = v })
      return { ...p, conteos: c }
    }),
  }))
  const enfocar = (i, j) => { const el = refs.current[`${i}|${j}`]; if (el) { el.focus(); el.select?.() } }
  const tecla = (e, i, j) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); enfocar(Math.min(i + 1, filas.length - 1), j) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); enfocar(Math.max(i - 1, 0), j) }
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) { e.preventDefault(); enfocar(i, Math.min(j + 1, ch)) }
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) { e.preventDefault(); enfocar(i, Math.max(j - 1, cd)) }
  }
  const pegar = (e, i, j) => {
    const txt = e.clipboardData.getData('text')
    if (!/[\t\n]/.test(txt.trim())) return
    e.preventDefault()
    const porPlaca = {}
    txt.trim().split(/\r?\n/).forEach((fila, a) => fila.split('\t').forEach((v, b) => {
      const r = filas[i + a]; const jj = j + b
      if (!r || jj > ch || jj < cd || jj < (r.f.desde || 1) || jj > (r.f.hasta || 12)) return
      const n = num(v)
      ;(porPlaca[r.p.id] ||= {})[r.L + jj] = String(v).trim() === '' ? null : n !== null && n >= 0 ? Math.round(n) : undefined
    }))
    Object.entries(porPlaca).forEach(([pid, m]) => { Object.keys(m).forEach((k) => m[k] === undefined && delete m[k]); poner(pid, m) })
  }
  const repDe = (L, f) => res.reps.find((r) => r.Muestra === f.muestra && r.T_h === Number(f.t) && r.Replica === (Number(f.rep) || 1))

  return (
    <section className="tarjeta">
      <div className="titulo-fila">
        <h2>Conteos de colonias <Nota>Elegí el tiempo y el rango de diluciones con el que vas a trabajar y escribí las colonias de cada gota. Se pueden pegar bloques de Excel; Enter y las flechas mueven entre celdas. El número gris es lo esperado según la concentración estimada (solo guía).</Nota></h2>
        <div className="fila-ctrl" style={{ margin: 0 }}>
          {ts.map((x) => <button key={x} className={`chip-t ${x === t ? 'on' : ''}`} onClick={() => s.setOpt('ufc', 't', x)}>T = {x} h</button>)}
        </div>
      </div>
      <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
        <Campo label="Diluciones a trabajar: del pocillo"><Num value={cd} min={1} max={12} onChange={(v) => s.setOpt('ufc', 'cd', v === '' ? 1 : v)} /></Campo>
        <Campo label="al pocillo"><Num value={ch} min={1} max={12} onChange={(v) => s.setOpt('ufc', 'ch', v === '' ? 12 : v)} /></Campo>
        <Campo label={<>UFC/mL esperadas en T = 0<Nota>Guía para saber qué diluciones van a ser contables; no entra en el cálculo.</Nota></>}>
          <Num value={par.c0} min={1} step={100000} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, c0: v === '' ? 1e6 : v } }))} />
        </Campo>
        <Campo label="Esperadas según">
          <Select value={par.esperadoDe} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, esperadoDe: v } }))} opciones={[['od', 'Curva de OD'], ['manual', 'Planilla importada']]} />
        </Campo>
      </div>
      <div className="tabla-scroll" style={{ maxHeight: 'none' }}>
        <table className="grilla-conteo">
          <thead>
            <tr>
              <th>Fila</th><th>Cepa</th>
              {cols.map((j) => <th key={j} data-tip={`Pocillo ${j}\nDilución 1 : ${Number(dilucionDe(par, j).toPrecision(5))}\n${texto10(potenciaDe(par, j))}${finito(stock) ? `\nesperadas ≈ ${Number(coloniasEsperadas(stock, j, par).toPrecision(2))} colonias` : ''}`}><b>{j}</b><small>{texto10(potenciaDe(par, j))}</small></th>)}
              <th>UFC/mL</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ p, L, f }, i) => {
              const r = repDe(L, f)
              return (
                <tr key={p.id + L}>
                  <th data-tip={`${p.nombre} · fila ${L}`}>{L}<small>{p.nombre}</small></th>
                  <td className="cepa-fila"><i style={{ background: color(f.muestra) }} />{f.muestra}<small> R{f.rep}</small></td>
                  {cols.map((j) => {
                    const activo = j >= (f.desde || 1) && j <= (f.hasta || 12)
                    const n = p.conteos[L + j]
                    return (
                      <td key={j} style={{ background: activo ? fondo(n, par) : '#f4efe6' }}>
                        <input ref={(el) => { refs.current[`${i}|${j}`] = el }} type="number" min="0" step="1" disabled={!activo}
                          value={finito(n) ? n : ''} placeholder={activo && finito(stock) ? String(Number(coloniasEsperadas(stock, j, par).toPrecision(2))) : ''}
                          onChange={(e) => poner(p.id, { [L + j]: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })}
                          onKeyDown={(e) => tecla(e, i, j)} onPaste={(e) => pegar(e, i, j)} />
                      </td>
                    )
                  })}
                  <td className="res-fila con-calculo" data-tip={r ? dUfc(r) || undefined : undefined}>{r && finito(r.UFC_mL) ? sci(r.UFC_mL) : '–'}</td>
                </tr>
              )
            })}
            {!filas.length && <tr><td colSpan={cols.length + 3} className="ayuda">No hay filas para T = {t} h.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="ayuda">
        <span className="leyenda-ufc"><i style={{ background: '#e3f1dc' }} /> contable ({par.min}–{par.max})</span>
        <span className="leyenda-ufc"><i style={{ background: '#fbf0cf' }} /> pocas</span>
        <span className="leyenda-ufc"><i style={{ background: '#f8d9d6' }} /> demasiadas</span>
      </p>
    </section>
  )
}
