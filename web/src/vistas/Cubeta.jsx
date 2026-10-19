import { useRef, useState } from 'react'
import { TEXTO_OD, odCorregida } from '../motor/odmanual.js'
import { Campo, Check, Encabezado, Icono, navegarTabla, Num, Sel } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { fx, fin, nuevoId } from '../utils.js'

const etqDil = (k, f) => (k === 0 ? 'Sin diluir' : `1:${f ** k}`)

export function Cubeta({ s }) {
  const { exp, upd, avisar } = s
  const m = exp.manual
  const setM = (patch) => upd((e) => ({ manual: { ...e.manual, ...(typeof patch === 'function' ? patch(e.manual) : patch) } }))
  const ks = Array.from({ length: m.nd }, (_, k) => k)
  const ult = m.filas[m.filas.length - 1]
  const [f, setF] = useState({ muestra: ult?.muestra || exp.cepas[0] || '', replica: 1, t: ult ? ult.t : 0, od: {} })
  const [serie, setSerie] = useState({ muestra: exp.cepas[0] || '', reps: 3, n: 7, cada: 2 })
  const tiemposSerie = () => Array.from({ length: Math.max(0, Math.round(Number(serie.n) || 0)) }, (_, i) => Math.round(i * (Number(serie.cada) || 0) * 1000) / 1000)
  const textoTiempos = () => { const ts = tiemposSerie(); return ts.length > 4 ? `${ts.slice(0, 3).join(', ')} … ${ts[ts.length - 1]}` : ts.join(', ') }
  const primero = useRef()

  const agregar = () => {
    if (!f.muestra) return avisar('Elegí la cepa.', 'error')
    if (!fin(Number(f.t))) return avisar('Escribí el tiempo.', 'error')
    const od = Object.fromEntries(Object.entries(f.od).map(([k, v]) => [k, Number(String(v).replace(',', '.'))]).filter(([, v]) => fin(v)))
    if (!Object.keys(od).length) return avisar('Escribí al menos una lectura.', 'error')
    s.agregarCepa(f.muestra)
    setM((mm) => {
      const i = mm.filas.findIndex((x) => x.muestra === f.muestra && Number(x.replica) === Number(f.replica) && Number(x.t) === Number(f.t))
      if (i >= 0) return { filas: mm.filas.map((x, j) => (j === i ? { ...x, od: { ...x.od, ...od } } : x)) }
      return { filas: [...mm.filas, { id: nuevoId(), muestra: f.muestra, replica: Number(f.replica) || 1, t: Number(f.t), od }] }
    })
    // siguiente: misma cepa y tiempo, réplica siguiente
    setF({ ...f, replica: Number(f.replica) + 1, od: {} })
    setTimeout(() => primero.current?.focus(), 30)
  }
  const crearSerie = () => {
    const ts = tiemposSerie()
    if (!serie.muestra || !ts.length || !(Number(serie.cada) > 0)) return avisar('Elegí la cepa, la cantidad de tiempos y el intervalo.', 'error')
    const filas = []
    ts.forEach((t) => { for (let r = 1; r <= (Number(serie.reps) || 1); r++) if (!m.filas.some((x) => x.muestra === serie.muestra && x.replica === r && x.t === t)) filas.push({ id: nuevoId(), muestra: serie.muestra, replica: r, t, od: {} }) })
    setM((mm) => ({ filas: [...mm.filas, ...filas] }))
    avisar(`${filas.length} filas vacías creadas: completá las lecturas en la tabla.`)
  }
  const setFila = (id, patch) => setM((mm) => ({ filas: mm.filas.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  const setOd = (id, k, v) => setM((mm) => ({ filas: mm.filas.map((x) => { if (x.id !== id) return x; const od = { ...x.od }; if (v === '') delete od[k]; else od[k] = v; return { ...x, od } }) }))
  const filas = [...m.filas].sort((a, b) => (a.muestra < b.muestra ? -1 : a.muestra > b.muestra ? 1 : a.t - b.t || a.replica - b.replica))

  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Crear filas vacías">
          <CampoCinta etiqueta="Cepa"><Sel value={serie.muestra} onChange={(v) => setSerie({ ...serie, muestra: v })} opciones={exp.cepas.map((c) => [c, c])} /></CampoCinta>
          <CampoCinta etiqueta="Réplicas"><Num value={serie.reps} onChange={(v) => setSerie({ ...serie, reps: v })} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="Tiempos" tip="Cantidad de tiempos, empezando en t = 0"><Num value={serie.n} onChange={(v) => setSerie({ ...serie, n: v })} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="Cada (h)" tip="Intervalo entre tiempos, desde t = 0"><Num value={serie.cada} onChange={(v) => setSerie({ ...serie, cada: v })} ancho={52} /></CampoCinta>
          <BotonCinta icono="mas" texto="Crear filas" onClick={crearSerie} tip={`Crea filas vacías para ${serie.muestra}: ${serie.reps} réplicas en t = ${textoTiempos()} h`} />
        </Grupo>
        <Grupo titulo="Lecturas">
          <BotonCinta icono="borrar" texto="Borrar todas" peligro deshabilitado={!m.filas.length} onClick={() => { if (window.confirm('Se borran todas las lecturas. ¿Continuar?')) setM({ filas: [] }) }} />
        </Grupo>
        <Grupo titulo="Blanco">
          <BotonCinta simbolo="✓B" texto="Ya restado" activo={m.yaCorregido} onClick={() => setM({ yaCorregido: !m.yaCorregido })} tip="El equipo ya restó el blanco" />
          {!m.yaCorregido && <CampoCinta etiqueta="OD del blanco" tip="OD del medio estéril"><Num value={m.blanco} onChange={(v) => setM({ blanco: v })} ancho={64} /></CampoCinta>}
        </Grupo>
        <Grupo titulo="Ventana lineal del equipo">
          <CampoCinta etiqueta="OD mínima"><Num value={m.vmin} onChange={(v) => setM({ vmin: v })} ancho={56} /></CampoCinta>
          <CampoCinta etiqueta="OD máxima" tip="Por encima de este valor la absorbancia deja de ser proporcional a la concentración: diluí y volvé a leer."><Num value={m.vmax} onChange={(v) => setM({ vmax: v })} ancho={56} /></CampoCinta>
        </Grupo>
        <Grupo titulo="Diluciones">
          <CampoCinta etiqueta="Factor" tip={'OD = (lectura − blanco) × factorᵏ\nSi hay varias lecturas dentro de la ventana se promedian; si ninguna cae, se usa la más cercana y se avisa.'}><Num value={m.factor} onChange={(v) => setM({ factor: v })} ancho={52} /></CampoCinta>
          <CampoCinta etiqueta="Columnas"><Num value={m.nd} onChange={(v) => { if (fin(v)) setM({ nd: Math.min(6, Math.max(1, Math.round(v))) }) }} ancho={52} /></CampoCinta>
        </Grupo>
        <Grupo titulo="Siguiente"><BotonCinta icono="escudo" texto="Control de calidad" onClick={() => s.irA('calidad')} deshabilitado={!m.filas.length} /></Grupo>
      </Cinta>
      <Encabezado titulo="Lecturas en cubeta" sub="Cargá la absorbancia de cada cepa, réplica y tiempo. Si la lectura se salió de la zona lineal del equipo, cargá también la de la dilución: se usa la que cae dentro de la ventana lineal." />
      <div>
        <div style={{ minWidth: 0 }}>
          <div className="tarjeta" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}>
            <h2>Nueva lectura</h2>
            <div className="fila fin">
              <Campo label="Cepa"><Sel value={f.muestra} onChange={(v) => setF({ ...f, muestra: v })} opciones={exp.cepas.map((c) => [c, c])} style={{ minWidth: 160 }} /></Campo>
              <Campo label="Réplica"><Num value={f.replica} onChange={(v) => setF({ ...f, replica: v })} ancho={70} /></Campo>
              <Campo label="Tiempo (h)"><Num value={f.t} onChange={(v) => setF({ ...f, t: v })} ancho={80} /></Campo>
              {ks.map((k) => (
                <Campo key={k} label={etqDil(k, m.factor)}>
                  <input ref={k === 0 ? primero : undefined} inputMode="decimal" style={{ width: 86 }} value={f.od[k] ?? ''} placeholder="OD"
                    onChange={(e) => { const t = e.target.value.replace(/[^0-9.,-]/g, ''); setF({ ...f, od: { ...f.od, [k]: t === '' ? undefined : t } }) }} />
                </Campo>
              ))}
              <button className="primario" onClick={agregar}><Icono n="mas" size={15} />Agregar</button>
            </div>
            <p className="ayuda" style={{ margin: '10px 0 0' }}>Enter agrega la lectura y pasa a la réplica siguiente. Si ya existe la misma cepa, réplica y tiempo, se completa esa fila.</p>
          </div>
          <div className="tarjeta">
            <div className="fila" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Lecturas ({m.filas.length})</h2>
              <span className="espacio" />
              <span className="ayuda">Para crear filas vacías elegí cepa, réplicas, cantidad de tiempos e intervalo en la cinta.</span>
            </div>
            {!filas.length ? <p className="ayuda">Todavía no hay lecturas.</p> : (
              <div className="tabla-scroll">
                <table className="tabla" onKeyDown={navegarTabla}>
                  <thead><tr><th>Cepa</th><th className="num">Réplica</th><th className="num">Tiempo (h)</th>{ks.map((k) => <th key={k} className="num">{etqDil(k, m.factor)}</th>)}<th className="num">OD corregida</th><th>Estado</th><th /></tr></thead>
                  <tbody>{filas.map((x) => {
                    const c = odCorregida(x, m)
                    return (
                      <tr key={x.id}>
                        <td>{x.muestra}</td>
                        <td className="num"><Num value={x.replica} onChange={(v) => setFila(x.id, { replica: v })} ancho={54} /></td>
                        <td className="num"><Num value={x.t} onChange={(v) => setFila(x.id, { t: v })} ancho={64} /></td>
                        {ks.map((k) => <td key={k} className="num" style={{ background: c.usados.includes(k) ? 'var(--acento-suave)' : undefined }}><Num value={x.od[k] ?? ''} onChange={(v) => setOd(x.id, k, v)} ancho={74} /></td>)}
                        <td className="num" data-tip={`OD corregida\n(lectura − blanco) × factor de la dilución usada\nen celeste: lecturas dentro de la ventana lineal (${m.vmin}–${m.vmax})`}><b>{fx(c.od, 4)}</b></td>
                        <td><span className={`chip ${c.estado === 'ok' ? 'ok' : c.estado === 'sin_od' ? '' : 'aviso'}`}>{TEXTO_OD[c.estado]}</span></td>
                        <td><button className="fantasma icono" aria-label="Quitar" onClick={() => setM((mm) => ({ filas: mm.filas.filter((y) => y.id !== x.id) }))}><Icono n="borrar" size={15} /></button></td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
