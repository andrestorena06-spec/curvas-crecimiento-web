import { useMemo, useRef, useState } from 'react'
import { Campo, Num, Select } from './ui.jsx'
import { Nota } from './tip.jsx'
import { finito } from '../motor/analisis.js'
import { LETRAS } from '../motor/lectura.js'
import { calcularUfc, coloniasEsperadas, contable, dilucionDe, potenciaDe, texto10 } from '../motor/ufc.js'
import { nuevoId } from '../experimento.js'
import { dUfc, sci } from '../calculos.js'

const COLS = Array.from({ length: 12 }, (_, i) => i + 1)
const placaNueva = (t) => ({ id: nuevoId(), nombre: `T = ${t} h`, t, filas: {}, conteos: {} })
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

// cada placa es un tiempo: las filas toman el tiempo de su placa y la réplica se numera sola (por cepa y tiempo, de la A a la H;
// si un tiempo ocupa más de una placa, la numeración sigue de una a la otra)
function renumerar(ps) {
  const cuenta = {}
  return [...ps].sort((a, b) => tPlaca(a) - tPlaca(b)).map((p) => {
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
const clonar = (x) => JSON.parse(JSON.stringify(x))
const leerTiempos = (txt) => [...new Set(String(txt).split(/[;,\s]+/).map(num).filter((v) => v !== null && v >= 0))].sort((a, b) => a - b)

// ===============================================================
// CONTEOS: en cada fila se elige la cepa (eso define las réplicas) y el formato se repite en todos los tiempos;
// se escribe el número de colonias de cada gota. Las diluciones que no se cuentan se dejan vacías.
// ===============================================================
export function ConteosGota({ s }) {
  const { ufc } = s
  const par = ufc.par
  const o = s.opts.ufc
  const placas = ufc.placasG
  const ts = [...new Set(placas.map(tPlaca))].sort((a, b) => a - b)
  const [txtT, setTxtT] = useState(ts.length ? ts.join(', ') : '0, 1, 2, 3, 4, 5, 6')
  const t = ts.includes(Number(o.t)) ? Number(o.t) : ts[0]
  const refs = useRef({})
  const res = useMemo(() => calcularUfc(ufc), [ufc])
  const cepas = s.opcionesMuestra
  const color = (m) => s.coloresGlobal[m] || '#c99a5b'
  const setPlacas = (f) => s.setUfc((u) => ({ ...u, placasG: renumerar(typeof f === 'function' ? f(u.placasG) : f) }))

  // una placa por tiempo, con el mismo formato que las placas del primer tiempo
  const conTiempos = (ps, lista) => {
    const t0 = ps.length ? Math.min(...ps.map(tPlaca)) : null
    const modelo = ps.length ? ps.filter((p) => tPlaca(p) === t0) : [{ filas: {} }]
    const out = ps.filter((p) => lista.includes(tPlaca(p)))
    lista.forEach((x) => { if (!out.some((p) => tPlaca(p) === x)) modelo.forEach((m) => out.push({ ...placaNueva(x), filas: clonar(m.filas) })) })
    return out
  }
  const aplicarTiempos = () => {
    const lista = leerTiempos(txtT)
    if (!lista.length) return s.avisar('Escribí los tiempos en horas, separados por comas.', 'error')
    const sacar = placas.filter((p) => !lista.includes(tPlaca(p)) && Object.keys(p.conteos).length)
    if (sacar.length && !window.confirm(`Los tiempos ${[...new Set(sacar.map(tPlaca))].join(', ')} h tienen conteos y se van a quitar. ¿Continuar?`)) return
    setPlacas((ps) => conTiempos(ps, lista))
    setTxtT(lista.join(', '))
    if (!lista.includes(t)) s.setOpt('ufc', 't', lista[0])
  }
  // la cepa de una fila se aplica a esa fila en todos los tiempos (k: n.º de placa dentro de su tiempo)
  const setCepaFila = (k, L, m) => {
    const conCuentas = placas.some((p) => Object.keys(p.conteos).some((x) => x[0] === L))
    if (!m && conCuentas && !window.confirm(`La fila ${L} tiene conteos en algún tiempo. Si le quitás la cepa se borran. ¿Continuar?`)) return
    setPlacas((ps0) => {
      const ps = ps0.length ? ps0 : conTiempos([], leerTiempos(txtT).length ? leerTiempos(txtT) : [0])
      const idx = {}
      return ps.map((p) => {
        const tp = tPlaca(p)
        idx[tp] = (idx[tp] ?? -1) + 1
        if (idx[tp] !== k) return p
        const filas = { ...p.filas }
        if (m) filas[L] = { ...(filas[L] || {}), muestra: m, desde: 1, hasta: 12 }
        else delete filas[L]
        return { ...p, filas }
      })
    })
  }
  const formatoOd = () => {
    const pc = s.a.disenoOd.pocillos
    const filasOd = {}
    LETRAS.forEach((L) => {
      const ms = [...new Set(COLS.map((c) => pc[L + c]).filter((w) => w && !w.blanco).map((w) => w.muestra))]
      if (ms.length === 1) filasOd[L] = { muestra: ms[0], desde: 1, hasta: 12 }
    })
    if (placas.some((p) => Object.keys(p.conteos).some((x) => !filasOd[x[0]])) && !window.confirm('Hay conteos en filas que quedan vacías y se van a borrar. ¿Continuar?')) return
    setPlacas((ps0) => {
      const ps = ps0.length ? ps0 : conTiempos([], leerTiempos(txtT).length ? leerTiempos(txtT) : [0])
      return ps.map((p) => ({ ...p, filas: clonar(filasOd) }))
    })
    s.avisar('Formato copiado de la placa de OD.')
  }

  const delTiempo = placas.filter((p) => tPlaca(p) === t)
  const vista = delTiempo.length ? delTiempo : [{ id: '', nombre: '', filas: {}, conteos: {} }]
  const filas = vista.flatMap((p, k) => LETRAS.map((L) => ({ p, k, L, f: p.filas[L] })))
  const stock = finito(t) ? s.stock[String(Math.round(t * 1000) / 1000)] : undefined
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
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) { e.preventDefault(); enfocar(i, Math.min(j + 1, 12)) }
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) { e.preventDefault(); enfocar(i, Math.max(j - 1, 1)) }
  }
  const pegar = (e, i, j) => {
    const txt = e.clipboardData.getData('text')
    if (!/[\t\n]/.test(txt.trim())) return
    e.preventDefault()
    const porPlaca = {}
    txt.trim().split(/\r?\n/).forEach((fila, a) => fila.split('\t').forEach((v, b) => {
      const r = filas[i + a]; const jj = j + b
      if (!r || !r.f?.muestra || jj > 12) return
      const n = num(v)
      ;(porPlaca[r.p.id] ||= {})[r.L + jj] = String(v).trim() === '' ? null : n !== null && n >= 0 ? Math.round(n) : undefined
    }))
    Object.entries(porPlaca).forEach(([pid, m]) => { Object.keys(m).forEach((k) => m[k] === undefined && delete m[k]); poner(pid, m) })
  }
  const repDe = (f) => res.reps.find((r) => r.Muestra === f.muestra && r.T_h === Number(f.t) && r.Replica === (Number(f.rep) || 1))
  const varias = vista.length > 1

  return (
    <section className="tarjeta">
      <div className="titulo-fila">
        <h2>Conteos de colonias <Nota>En cada fila elegí la cepa: las filas con la misma cepa son sus réplicas, y el formato se repite en todos los tiempos. Escribí las colonias de cada gota; las diluciones que no contaste dejalas vacías. Se pueden pegar bloques de Excel; Enter y las flechas mueven entre celdas. El número gris es lo esperado según la concentración estimada (solo guía).</Nota></h2>
        <div className="fila-ctrl" style={{ margin: 0 }}>
          {ts.map((x) => <button key={x} className={`chip-t ${x === t ? 'on' : ''}`} onClick={() => s.setOpt('ufc', 't', x)}>T = {x} h</button>)}
        </div>
      </div>
      <div className="fila-ctrl" style={{ alignItems: 'flex-end' }}>
        <Campo label={<>Tiempos (h)<Nota>Una placa por tiempo, todas con las mismas cepas en las mismas filas.</Nota></>}>
          <input style={{ width: 220 }} value={txtT} onChange={(e) => setTxtT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aplicarTiempos()} />
        </Campo>
        <button className="primario" onClick={aplicarTiempos}>Aplicar tiempos</button>
        {s.a.disenoOd && Object.keys(s.a.disenoOd.pocillos).length > 0 && <button onClick={formatoOd} data-tip={'Mismo formato que la placa de OD\nCada fila toma la cepa de la misma fila de la placa de OD.'}>Usar formato de la placa de OD</button>}
        <Campo label={<>UFC/mL esperadas en T = 0<Nota>Guía para saber qué diluciones van a ser contables; no entra en el cálculo.</Nota></>}>
          <Num value={par.c0} min={1} step={100000} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, c0: v === '' ? 1e6 : v } }))} />
        </Campo>
        <Campo label="Esperadas según">
          <Select value={par.esperadoDe} onChange={(v) => s.setUfc((u) => ({ ...u, par: { ...u.par, esperadoDe: v } }))} opciones={[['od', 'Curva de OD'], ['manual', 'Planilla importada']]} />
        </Campo>
      </div>
      {!cepas.length && <p className="aviso-sel">No hay cepas elegidas: elegilas en «Experimento».</p>}
      <div className="tabla-scroll" style={{ maxHeight: 'none' }}>
        <table className="grilla-conteo">
          <thead>
            <tr>
              <th>Fila</th><th>Cepa</th>
              {COLS.map((j) => <th key={j} data-tip={`Pocillo ${j}\nDilución 1 : ${Number(dilucionDe(par, j).toPrecision(5))}\n${texto10(potenciaDe(par, j))}${finito(stock) ? `\nesperadas ≈ ${Number(coloniasEsperadas(stock, j, par).toPrecision(2))} colonias` : ''}`}><b>{j}</b><small>{texto10(potenciaDe(par, j))}</small></th>)}
              <th>UFC/mL</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ p, k, L, f }, i) => {
              const r = f?.muestra ? repDe(f) : null
              return (
                <tr key={p.id + L + k} className={f?.muestra ? '' : 'fila-libre'}>
                  <th data-tip={varias ? `${p.nombre} · fila ${L}` : undefined}>{L}{varias && <small>{k + 1}</small>}</th>
                  <td className="cepa-fila">
                    <i style={{ background: f?.muestra ? color(f.muestra) : 'transparent' }} />
                    <select value={f?.muestra || ''} onChange={(e) => setCepaFila(k, L, e.target.value)}>
                      <option value="">(vacía)</option>
                      {[...new Set([...cepas, ...(f?.muestra ? [f.muestra] : [])])].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {f?.muestra && <small> R{f.rep}</small>}
                  </td>
                  {COLS.map((j) => {
                    const activo = !!f?.muestra
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
          </tbody>
        </table>
      </div>
      <p className="ayuda">
        <span className="leyenda-ufc"><i style={{ background: '#e3f1dc' }} /> contable ({par.min}–{par.max})</span>
        <span className="leyenda-ufc"><i style={{ background: '#fbf0cf' }} /> pocas</span>
        <span className="leyenda-ufc"><i style={{ background: '#f8d9d6' }} /> demasiadas</span>
      </p>
      <details className="como-placa">
        <summary>Cómo se hizo la placa</summary>
        <ol className="pasos-placa">{pasosDePlaca(par).map((x, i) => <li key={i}>{x}</li>)}</ol>
      </details>
    </section>
  )
}
