import { useEffect, useRef, useState } from 'react'
import { usePlanilla } from '../ui/planilla.js'
import { ajusteDiluciones, estimarUfc, textoEstado } from '../motor/ufc.js'
import { dAjuste, dUfc } from '../calculos.js'
import { claveGrupoUfc, claveUfc, dilucionesUfc, serieUfc } from '../modelo.js'
import { dixonQ } from '../motor/pipeline.js'
import { detectarCV } from '../motor/atipicos.js'
import { desvio, media } from '../motor/analisis.js'
import { Campo, Check, Encabezado, Icono, navegarTabla, Num, Sel, Seg } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo } from '../ui/cinta.jsx'
import { fin, nuevoId, sciCorto } from '../utils.js'

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const sup = (t) => t.replace(/[-0-9.]/g, (c) => (c === '.' ? '·' : SUP[c]))
// concentración relativa a la suspensión original, en base 10 (10⁻³) y como fracción (1/1000)
export const base10 = (D) => { if (!(D > 0)) return '—'; if (D === 1) return '10⁰'; const x = -Math.log10(D); const r = Math.round(x); return `10${sup(String(Math.abs(x - r) < 1e-9 ? r : Number(x.toFixed(2))))}` }
const redondo = (x) => (Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : Number(x.toPrecision(4)))
export const fraccion = (D) => (!(D > 0) ? '—' : D === 1 ? '1 (sin diluir)' : `1/${redondo(D).toLocaleString('es')}`)
// número ordinal de la dilución (1ra, 2da, 3ra…), contando solo las columnas diluidas
const SUF = { 1: 'ra', 2: 'da', 3: 'ra', 4: 'ta', 5: 'ta', 6: 'ta', 7: 'ma', 8: 'va', 9: 'na', 10: 'ma', 11: 'ra', 12: 'da' }
export const ordinal = (d) => (d?.diluida ? `${d.n}${SUF[d.n] || 'a'}` : '')
export const etqD = (d) => (!d ? '' : !d.diluida ? 'Sin diluir' : `${ordinal(d)} · ${base10(d.D)}`)

export function Conteo({ s }) {
  const { exp, upd, avisar } = s
  const u = exp.ufc
  const setU = (patch) => upd((e) => ({ ufc: { ...e.ufc, ...(typeof patch === 'function' ? patch(e.ufc) : patch) } }))
  const ks = Array.from({ length: u.nd }, (_, k) => k)
  // k0: dilución con la que empieza cada réplica; paso: cuántas diluciones de la réplica ya se cargaron
  const [f, setF] = useState({ muestra: exp.cepas[0] || '', replica: 1, t: 0, k: 4, k0: 4, paso: 0, n: '', vol: '' })
  const [serie, setSerie] = useState({ muestra: exp.cepas[0] || '', reps: 3, n: 7, cada: 2, nDil: 3 })
  const tiemposSerie = () => Array.from({ length: Math.max(0, Math.round(Number(serie.n) || 0)) }, (_, i) => Math.round(i * (Number(serie.cada) || 0) * 1000) / 1000)
  const textoTiempos = () => { const ts = tiemposSerie(); return ts.length > 4 ? `${ts.slice(0, 3).join(', ')} … ${ts[ts.length - 1]}` : ts.join(', ') }
  const refN = useRef()
  const planilla = usePlanilla(), planillaDil = usePlanilla()
  // la carga sigue a la cinta: cepa elegida arriba; Enter pasa a la réplica siguiente y, después de la última, al tiempo siguiente
  useEffect(() => { if (serie.muestra) setF((ff) => ({ ...ff, muestra: serie.muestra })) }, [serie.muestra])
  const siguiente = (ff) => {
    const reps = Math.max(1, Math.round(Number(serie.reps) || 1)), r = Number(ff.replica) || 1
    return r < reps ? { replica: r + 1, t: ff.t } : { replica: 1, t: Math.round((Number(ff.t) + (Number(serie.cada) || 0)) * 1000) / 1000 }
  }
  let nDil = 0
  const dilG = dilucionesUfc(u)
  // Para cada cepa y tiempo, y cada dilución posible: UFC/mL de cada réplica con esa dilución, DE de log10,
  // CV % y qué réplica marcaría el test de Dixon (o Grubbs con más de 10) sobre log10 UFC/mL.
  const confDixon = Number(exp.aj.ufc_dixon_conf) || 95
  const candidatas = (g) => {
    const fs = u.filas.filter((f) => claveGrupoUfc(f) === g)
    const out = {}
    ks.forEach((k) => {
      const reps = fs.filter((f) => fin(f.c?.[k])).map((f) => ({ f, e: estimarUfc(f.c, { ...par(f), usar: k }) })).filter((r) => fin(r.e.ufc) && r.e.ufc > 0)
      if (!fs.some((f) => fin(f.c?.[k]))) return
      const lg = reps.map((r) => Math.log10(r.e.ufc))
      const vals = reps.map((r) => r.e.ufc)
      const rsd = exp.aj.ufc_atip_metodo === 'cv'
      const lim = Number(exp.aj.ufc_cvmax) || 20
      const dc = rsd && vals.length >= 3 && exp.aj.ufc_dixon_on !== false ? detectarCV(vals, lim) : null
      const d = !rsd && lg.length >= 3 && exp.aj.ufc_dixon_on !== false ? dixonQ(lg, confDixon) : dc && dc.idx !== null ? { i: dc.idx, metodo: 'RSD', q: dc.stat, crit: lim } : null
      out[k] = {
        n: reps.length, total: fs.length, sd: lg.length > 1 ? desvio(lg) : NaN, cv: vals.length > 1 ? (100 * desvio(vals)) / media(vals) : NaN,
        enRango: reps.filter((r) => r.e.estado === 'ok').length,
        dixon: d ? { replica: reps[d.i].f.replica, texto: d.metodo === 'RSD' ? `RSD = ${d.q.toFixed(1)} % > ${d.crit} %` : `${d.metodo === 'Grubbs' ? 'G' : 'Q'} = ${d.q.toFixed(2)} > ${d.crit.toFixed(2)}` } : null,
      }
    })
    return out
  }
  const cacheCand = {}
  const candDe = (g) => (cacheCand[g] ||= candidatas(g))
  const nomTest = exp.aj.ufc_atip_metodo === 'cv' ? 'RSD' : 'Dixon'
  const dec = (x, n = 2) => (fin(x) ? x.toFixed(n).replace('.', ',') : '—')
  const resumenCand = (c) => `${c.n}/${c.total} réplicas · DE ${dec(c.sd)} log · RSD ${dec(c.cv, 0)} %${exp.aj.ufc_dixon_on === false ? '' : c.dixon ? ` · ${nomTest} excluye réplica ${c.dixon.replica}` : ` · ${nomTest}: ninguna`}`
  const setDilGrupo = (g, k) => setU((uu) => { const d = { ...(uu.dilGrupo || {}) }; if (k === undefined || k === null) delete d[g]; else d[g] = k; return { dilGrupo: d } })
  const serieD = serieUfc(u).map((d) => (d.diluida ? { ...d, n: ++nDil } : d))
  const par = (fila) => ({ vol: (Number(fila.vol) || u.vol) / 1000, factor: u.factor, min: u.min, max: u.max, D: serieD.map((d) => d.D), usar: dilG[claveGrupoUfc(fila)]?.k, manual: dilG[claveGrupoUfc(fila)]?.manual })
  const setGlobal = (patch) => setU((uu) => { const n = { ...uu, ...patch }; const t = Number(n.toma), d = Number(n.diluyente); return { ...patch, ...(t > 0 && d >= 0 ? { factor: (t + d) / t } : {}) } })
  const setPaso = (k, campo, v) => setU((uu) => { const p = { ...(uu.pasos?.[k] || {}) }; if (v === '' || !fin(v)) delete p[campo]; else p[campo] = v; const ps = { ...(uu.pasos || {}) }; if (Object.keys(p).length) ps[k] = p; else delete ps[k]; return { pasos: ps } })
  const fGlobal = Number(u.toma) > 0 ? (Number(u.toma) + Number(u.diluyente)) / Number(u.toma) : NaN

  const agregar = () => {
    if (!f.muestra) return avisar('Elegí la cepa.', 'error')
    if (!fin(Number(f.t))) return avisar('Escribí el tiempo.', 'error')
    if (!fin(Number(f.n)) || f.n === '') return avisar('Escribí las colonias contadas.', 'error')
    s.agregarCepa(f.muestra)
    const n = Math.max(0, Math.round(Number(f.n)))
    setU((uu) => {
      const i = uu.filas.findIndex((x) => x.muestra === f.muestra && Number(x.replica) === Number(f.replica) && Number(x.t) === Number(f.t))
      if (i >= 0) return { filas: uu.filas.map((x, j) => (j === i ? { ...x, c: { ...x.c, [f.k]: n }, vol: f.vol !== '' ? f.vol : x.vol } : x)) }
      return { filas: [...uu.filas, { id: nuevoId(), muestra: f.muestra, replica: Number(f.replica) || 1, t: Number(f.t), vol: f.vol, c: { [f.k]: n } }] }
    })
    // siguiente: la dilución siguiente de la misma réplica
    // secuencia: las diluciones contadas de la réplica, después la réplica siguiente y, tras la última, el tiempo siguiente
    const nDil = Math.max(1, Math.round(Number(serie.nDil) || 1)), paso = Number(f.paso) || 0, k0 = Number(f.k0 ?? f.k)
    const otraDil = paso + 1 < nDil && Number(f.k) + 1 < u.nd
    setF({ ...f, ...(otraDil ? { k: Number(f.k) + 1, paso: paso + 1 } : { k: k0, paso: 0, ...siguiente(f) }), n: '' })
    setTimeout(() => refN.current?.focus(), 30)
  }
  const crearSerie = () => {
    const ts = tiemposSerie()
    if (!serie.muestra || !ts.length || !(Number(serie.cada) > 0)) return avisar('Elegí la cepa, la cantidad de tiempos y el intervalo.', 'error')
    const nuevas = []
    ts.forEach((t) => { for (let r = 1; r <= (Number(serie.reps) || 1); r++) if (!u.filas.some((x) => x.muestra === serie.muestra && x.replica === r && x.t === t)) nuevas.push({ id: nuevoId(), muestra: serie.muestra, replica: r, t, vol: '', c: {} }) })
    setU((uu) => ({ filas: [...uu.filas, ...nuevas] }))
    avisar(`${nuevas.length} filas creadas: completá las colonias en la tabla.`)
  }
  const setFila = (id, patch) => setU((uu) => ({ filas: uu.filas.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  const setC = (id, k, v) => setU((uu) => ({ filas: uu.filas.map((x) => { if (x.id !== id) return x; const c = { ...x.c }; if (v === '' || !fin(v)) delete c[k]; else c[k] = Math.max(0, Math.round(v)); return { ...x, c } }) }))
  const filas = [...u.filas].sort((a, b) => (a.muestra < b.muestra ? -1 : a.muestra > b.muestra ? 1 : a.t - b.t || a.replica - b.replica))
  const color = (n) => (!fin(n) ? undefined : n >= u.min && n <= u.max ? 'var(--ok-suave)' : n > u.max ? 'var(--peligro-suave)' : 'var(--aviso-suave)')

  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Crear filas vacías">
          <CampoCinta etiqueta="Cepa"><Sel value={serie.muestra} onChange={(v) => setSerie({ ...serie, muestra: v })} opciones={exp.cepas.map((c) => [c, c])} /></CampoCinta>
          <CampoCinta etiqueta="Réplicas"><Num value={serie.reps} onChange={(v) => setSerie({ ...serie, reps: v })} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="Tiempos" tip="Cantidad de tiempos, empezando en t = 0"><Num value={serie.n} onChange={(v) => setSerie({ ...serie, n: v })} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="Cada (h)" tip="Intervalo entre tiempos, desde t = 0"><Num value={serie.cada} onChange={(v) => setSerie({ ...serie, cada: v })} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="Contadas por réplica" tip={'Cuántas diluciones se cuentan en cada réplica\nAl cargar, Enter pasa a la dilución siguiente hasta completar esa cantidad y después sigue con la réplica siguiente, empezando otra vez en la primera dilución.'}><Num value={serie.nDil} onChange={(v) => setSerie({ ...serie, nDil: v })} ancho={56} /></CampoCinta>
          <BotonCinta icono="mas" texto="Crear filas" onClick={crearSerie} tip={`Crea filas vacías para ${serie.muestra}: ${serie.reps} réplicas en t = ${textoTiempos()} h`} />
        </Grupo>
        <Grupo titulo="Conteos">
          <BotonCinta icono="borrar" texto="Borrar todos" peligro deshabilitado={!u.filas.length} onClick={() => { if (window.confirm('Se borran todos los conteos. ¿Continuar?')) setU({ filas: [] }) }} />
        </Grupo>
        <Grupo titulo="Siembra">
          <CampoCinta etiqueta="Vol. sembrado (µL)" tip="Volumen de la dilución que se siembra en cada placa o gota. Si una fila usó otro, se escribe en su columna."><Num value={u.vol} onChange={(v) => setU({ vol: v })} ancho={64} /></CampoCinta>
          <CampoCinta etiqueta="Columnas"><Num value={u.nd} onChange={(v) => { if (fin(v)) setU({ nd: Math.min(12, Math.max(1, Math.round(v))) }) }} ancho={52} /></CampoCinta>
        </Grupo>
        <Grupo titulo="Rango contable">
          <CampoCinta etiqueta="Mínimo" tip="Placas de Petri: 25–250 (o 30–300). Gotas de 10–20 µL: 3–30."><Num value={u.min} onChange={(v) => setU({ min: v })} ancho={56} /></CampoCinta>
          <CampoCinta etiqueta="Máximo" tip="Placas de Petri: 25–250 (o 30–300). Gotas de 10–20 µL: 3–30."><Num value={u.max} onChange={(v) => setU({ max: v })} ancho={56} /></CampoCinta>
        </Grupo>
        <Grupo titulo="Fuera de rango">
          <BotonCinta simbolo="≈" texto="Usar estimados" activo={u.estimados} onClick={() => setU({ estimados: !u.estimados })} tip={'Usar estimados\nSi ninguna dilución es contable, se estima con la más cercana al rango, se marca y entra en las medias.'} />
        </Grupo>
        <Grupo titulo="Siguiente"><BotonCinta icono="escudo" texto="Calidad UFC" deshabilitado={!u.filas.length} onClick={() => s.irA('calidadUfc')} /></Grupo>
      </Cinta>
      <Encabezado titulo="Conteo de colonias" sub="Elegí la cepa, la réplica y el tiempo, y anotá las colonias de cada dilución. Las UFC/mL se calculan solas con las diluciones dentro del rango contable.">
        <button className="primario" disabled={!u.filas.length} onClick={() => s.irA('calidadUfc')}>Calidad UFC<Icono n="flecha" size={16} /></button>
      </Encabezado>
      <div>
        <div style={{ minWidth: 0 }}>
          <div className="tarjeta" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}>
            <h2>Nuevo conteo</h2>
            <div className="fila fin">
              <Campo label="1 · Cepa"><Sel value={f.muestra} onChange={(v) => setF({ ...f, muestra: v })} opciones={exp.cepas.map((c) => [c, c])} style={{ minWidth: 160 }} /></Campo>
              <Campo label="2 · Réplica"><Num value={f.replica} onChange={(v) => setF({ ...f, replica: v })} ancho={70} /></Campo>
              <Campo label="3 · Tiempo (h)"><Num value={f.t} onChange={(v) => setF({ ...f, t: v })} ancho={80} /></Campo>
              <Campo label="4 · Dilución"><Sel value={String(f.k)} onChange={(v) => setF({ ...f, k: Number(v), k0: Number(v), paso: 0 })} opciones={ks.map((k) => [String(k), `${etqD(serieD[k])}  ·  ${fraccion(serieD[k]?.D)}`])} /></Campo>
              <Campo label="5 · Colonias">
                <input ref={refN} inputMode="numeric" style={{ width: 90, background: color(Number(f.n)) }} value={f.n} onChange={(e) => setF({ ...f, n: e.target.value.replace(/\D/g, '') })} placeholder="n" />
              </Campo>
              <Campo label="Vol. (µL)"><Num value={f.vol} onChange={(v) => setF({ ...f, vol: v })} placeholder={String(u.vol)} ancho={76} /></Campo>
              <button className="primario" onClick={agregar}><Icono n="mas" size={15} />Agregar</button>
            </div>
            <p className="ayuda" style={{ margin: '10px 0 0' }}>Enter agrega y pasa a la dilución siguiente hasta contar {serie.nDil} por réplica (empezando en la elegida); después sigue con la réplica siguiente y, tras la réplica {serie.reps}, con el tiempo siguiente (t + {serie.cada} h). Verde: dentro del rango contable ({u.min}–{u.max}); ámbar: por debajo; rojo: por encima.</p>
          </div>
          <div className="tarjeta">
            <div className="fila" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Conteos ({u.filas.length} réplicas)</h2>
              <span className="espacio" />
              <span className="ayuda">Para crear filas vacías elegí cepa, réplicas, cantidad de tiempos e intervalo en la cinta.</span>
            </div>
            {filas.length > 0 && <p className="ayuda" style={{ margin: '-4px 0 10px' }}>Todas las réplicas de una cepa en un mismo tiempo usan <b>la misma dilución</b> (recuadrada); las demás quedan atenuadas y solo sirven para revisar la coherencia (⚠). Para cambiarla: columna <b>«Dilución usada»</b> o <b>clic derecho</b> sobre el conteo.</p>}
            {!filas.length ? <p className="ayuda">Todavía no hay conteos.</p> : (
              <div className="tabla-scroll">
                <table className="tabla" ref={planilla} onKeyDown={navegarTabla}>
                  <thead><tr><th>Cepa</th><th className="num">Réplica</th><th className="num">T (h)</th><th className="num">Vol. µL</th><th data-tip={'Dilución usada para calcular las UFC/mL (la misma para todas las réplicas de la cepa en ese tiempo)\nAuto: la que tiene más réplicas dentro del rango contable. Podés elegir otra acá o con clic derecho sobre un conteo.\nLas demás diluciones de la réplica no entran en el cálculo.'}>Dilución usada</th><th data-tip={'Réplicas con la dilución usada\nDE: desviación estándar de log₁₀ UFC/mL entre las réplicas de la cepa en ese tiempo.\n⚠ Dixon: esta réplica quedaría excluida por el test (Q de Dixon, o Grubbs con más de 10).'}>DE · Dixon</th>{ks.map((k) => <th key={k} className="num" data-tip={fraccion(serieD[k]?.D)}>{etqD(serieD[k])}</th>)}<th className="num" data-tip={'Coherencia entre diluciones\nSi una dilución tiene C colonias, la siguiente debería tener C dividido por el factor del paso.\n⚠: alguna dilución no coincide con lo esperado (prueba binomial, p < 0,05).'}>Ajuste</th><th className="num">UFC/mL</th><th className="num">log₁₀ UFC/mL</th><th>Estado</th><th /></tr></thead>
                  <tbody>{filas.map((x) => {
                    const p = par(x)
                    const e = estimarUfc(x.c, p)
                    const aj = ajusteDiluciones(x.c, p)
                    const malas = new Set(aj.malos.map((m) => m.k2))
                    const conDatos = ks.filter((k) => u.filas.some((f) => claveGrupoUfc(f) === claveGrupoUfc(x) && fin(f.c[k])))
                    const tip = dUfc({ _cont: x.c, _par: p, _usados: e.usados, _S: e.S, _estado: e.estado, _manual: e.manual, UFC_mL: e.ufc, IC95_inf: e.lo, IC95_sup: e.hi, Limite: e.lim })
                    const fuera = s.ufcRes?.fuera?.has(claveUfc(x))
                    return (
                      <tr key={x.id} className={fuera ? 'fuera' : ''}>
                        <td>{x.muestra}</td>
                        <td className="num"><Num value={x.replica} onChange={(v) => setFila(x.id, { replica: v })} ancho={52} /></td>
                        <td className="num"><Num value={x.t} onChange={(v) => setFila(x.id, { t: v })} ancho={58} /></td>
                        <td className="num"><Num value={x.vol} placeholder={String(u.vol)} onChange={(v) => setFila(x.id, { vol: v })} ancho={58} /></td>
                        <td data-tip={conDatos.length ? ['Opciones de dilución para esta cepa y tiempo:', ...Object.entries(candDe(claveGrupoUfc(x))).map(([k, c]) => `${etqD(serieD[k])}: ${resumenCand(c)}${c.dixon ? ` (${c.dixon.texto})` : ''}`)].join('\n') : undefined}>{conDatos.length > 0 && <Sel value={dilG[claveGrupoUfc(x)]?.manual ? String(dilG[claveGrupoUfc(x)].k) : ''} onChange={(v) => setDilGrupo(claveGrupoUfc(x), v === '' ? undefined : Number(v))} style={{ minWidth: 120 }}
                          opciones={[['', `Auto · ${dilG[claveGrupoUfc(x)]?.sugerida != null ? etqD(serieD[dilG[claveGrupoUfc(x)].sugerida]) : '—'}`], ...Object.entries(candDe(claveGrupoUfc(x))).map(([k, c]) => [k, `${etqD(serieD[k])} · ${resumenCand(c)}`])]} />}</td>
                        {(() => { const g = claveGrupoUfc(x), c = candDe(g)[dilG[g]?.k]; if (!c) return <td />; const sale = c.dixon && c.dixon.replica === x.replica
                          return <td data-tip={resumenCand(c) + (c.dixon ? `\n${c.dixon.texto}` : '')}>{sale ? <span className="aviso-texto">⚠ {nomTest}</span> : <small className="ayuda">DE {dec(c.sd)} log</small>}</td> })()}
                        {ks.map((k) => <td key={k} className={`num celda-conteo ${e.usados[0] === k ? 'usada' : fin(x.c[k]) ? 'no-usada' : ''}`}
                          onContextMenu={(ev) => { if (!fin(x.c[k])) return; ev.preventDefault(); const g = claveGrupoUfc(x); setDilGrupo(g, dilG[g]?.manual && dilG[g].k === k ? undefined : k) }} style={{ background: color(x.c[k]) }} data-tip={malas.has(k) ? dAjuste(aj) : e.usados[0] === k ? `Dilución usada para las UFC/mL de esta cepa en este tiempo${e.manual ? ' (elegida a mano)' : ' (sugerida)'}` : fin(x.c[k]) ? 'No entra en el cálculo (solo se usa para revisar la coherencia entre diluciones).\nClic derecho para usar esta dilución.' : undefined}><Num value={x.c[k] ?? ''} onChange={(v) => setC(x.id, k, v)} ancho={60} />{malas.has(k) && <span className="marca-aviso">⚠</span>}</td>)}
                        <td className="num" data-tip={dAjuste(aj) || undefined}>{aj.malos.length ? <span className="aviso-texto">⚠ {aj.malos.length}</span> : aj.evaluados ? <span style={{ color: 'var(--ok)' }}>✓</span> : <span className="ayuda">—</span>}</td>
                        <td className="num" data-tip={tip || undefined}><b>{fin(e.ufc) ? sciCorto(e.ufc) : e.estado === 'cero' ? `< ${sciCorto(e.lim)}` : ''}</b></td>
                        <td className="num">{fin(e.ufc) && e.ufc > 0 ? Math.log10(e.ufc).toFixed(2) : ''}</td>
                        <td><small>{Object.keys(x.c).length ? (fuera ? 'Excluida' : textoEstado(e.estado)) : ''}</small></td>
                        <td><button className="fantasma icono" aria-label="Quitar" onClick={() => setU((uu) => ({ filas: uu.filas.filter((y) => y.id !== x.id) }))}><Icono n="borrar" size={15} /></button></td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
          <div className="tarjeta serie-dil">
            <div className="fila" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
              <h2 style={{ margin: 0 }}>Serie de diluciones</h2>
              <span className="espacio" />
              <Campo label="Primera columna">
                <Seg value={u.primero} onChange={(v) => setU({ primero: v })} opciones={[['madre', 'Suspensión sin diluir'], ['dilucion', 'Ya es la 1.ª dilución']]} />
              </Campo>
              <Campo label="Transferido (µL)"><Num value={u.toma} onChange={(v) => setGlobal({ toma: v })} ancho={80} /></Campo>
              <Campo label="Diluyente (µL)"><Num value={u.diluyente} onChange={(v) => setGlobal({ diluyente: v })} ancho={80} /></Campo>
              <span className="ayuda" style={{ paddingBottom: 9 }}>→ factor {fin(fGlobal) ? redondo(fGlobal) : '—'} por paso</span>
            </div>
            <div className="tabla-scroll">
              <table className="tabla compacta" ref={planillaDil} onKeyDown={navegarTabla}>
                <thead><tr><th>Columna</th><th className="num">Transferido µL</th><th className="num">Diluyente µL</th><th className="num">Factor del paso</th><th className="num">Dilución total</th><th className="num">Concentración</th><th className="num">Base 10</th><th /></tr></thead>
                <tbody>{serieD.map((d) => (
                  <tr key={d.k} className={d.propio ? 'propio' : ''}>
                    <td>{d.k + 1}{d.diluida && <span className="ayuda"> · {ordinal(d)} dilución</span>}</td>
                    {d.diluida ? (<>
                      <td className="num"><Num value={u.pasos?.[d.k]?.toma ?? ''} placeholder={String(u.toma)} onChange={(v) => setPaso(d.k, 'toma', v)} ancho={70} /></td>
                      <td className="num"><Num value={u.pasos?.[d.k]?.diluyente ?? ''} placeholder={String(u.diluyente)} onChange={(v) => setPaso(d.k, 'diluyente', v)} ancho={70} /></td>
                      <td className="num">{fin(d.f) ? `×${redondo(d.f)}` : '—'}</td>
                    </>) : <td colSpan={3} className="ayuda">Suspensión de partida (sin diluir)</td>}
                    <td className="num">{fin(d.D) ? `1:${redondo(d.D).toLocaleString('es')}` : '—'}</td>
                    <td className="num">{fraccion(d.D)}</td>
                    <td className="num"><b>{base10(d.D)}</b></td>
                    <td>{d.propio && <button className="fantasma icono" aria-label="Volver a los volúmenes generales" data-tip="Volver a los volúmenes generales" onClick={() => setU((uu) => { const ps = { ...(uu.pasos || {}) }; delete ps[d.k]; return { pasos: ps } })}><Icono n="refrescar" size={14} /></button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="ayuda" style={{ margin: '8px 0 0' }}>Cada paso pasa el volumen transferido a un tubo o pocillo con el diluyente: factor = (transferido + diluyente) / transferido. Si un paso se hizo distinto, escribí sus volúmenes en su fila. Las UFC/mL se calculan con la dilución total de cada columna.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
