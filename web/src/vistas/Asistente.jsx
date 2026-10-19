import { useEffect, useRef, useState } from 'react'
import { CEPAS_DEF, ORIGENES, condDef } from '../modelo.js'
import { Campo, Icono, Num } from '../ui/base.jsx'
import { IlusAmbos, IlusCubeta, IlusOD, IlusPlacas, IlusTecan, IlusUFC } from '../ui/ilustraciones.jsx'

const Opcion = ({ on, apagada, onClick, Ilus, titulo, texto }) => (
  <button className={`opcion ${on ? 'on' : ''} ${apagada ? 'apagada' : ''}`} onClick={onClick} aria-pressed={on}>
    <div className="ilus"><Ilus /></div>
    <div className="txt">
      <b>{titulo}{on && <Icono n="check" size={16} style={{ marginLeft: 6, verticalAlign: -3, color: 'var(--acento)' }} />}</b>
      <small>{texto}</small>
    </div>
  </button>
)

function Etapa({ n, titulo, children, refEtapa }) {
  return (
    <section className="etapa" ref={refEtapa}>
      <div className="titulo-etapa"><span className="n">{n}</span><b>{titulo}</b></div>
      {children}
    </section>
  )
}

// Valores habituales, para elegir con un clic (también se puede escribir otro)
const SUGERENCIAS = {
  organismo: ['Listeria monocytogenes', 'Listeria innocua', 'Escherichia coli', 'Staphylococcus aureus', 'Salmonella enterica', 'Pseudomonas aeruginosa', 'Bacillus subtilis', 'Enterococcus faecalis'],
  medio: ['BHI', 'TSB', 'TSBYE', 'LB', 'Mueller-Hinton', 'Caldo nutritivo', 'M9 mínimo', 'MRS'],
  temperatura: [37, 30, 25, 20, 10, 4],
  lambda: [600, 560, 595, 620, 540],
}
const Sugerencias = ({ valores, actual, onElegir, unidad = '' }) => (
  <div className="sugerencias">
    {valores.map((v) => <button key={v} type="button" className={String(actual) === String(v) ? 'on' : ''} onClick={() => onElegir(v)}>{v}{unidad}</button>)}
  </div>
)

// Asistente de nuevo experimento: cada respuesta despliega la pregunta siguiente
export function Asistente({ onCrear, onCancelar, hayExperimento }) {
  const [tipo, setTipo] = useState(null)
  const [origen, setOrigen] = useState(null)
  const [nombre, setNombre] = useState('')
  const [cond, setCond] = useState(condDef())
  const [lista, setLista] = useState([...CEPAS_DEF])      // cepas disponibles
  const [cepas, setCepas] = useState([])                  // cepas elegidas (ninguna al empezar)
  const [nuevaCepa, setNuevaCepa] = useState('')
  const refFinal = useRef()
  const refOrigen = useRef()

  const necesitaOrigen = tipo === 'od' || tipo === 'odufc'
  const listo = tipo && (!necesitaOrigen || origen)
  useEffect(() => { if (necesitaOrigen && !origen) setTimeout(() => refOrigen.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60) }, [tipo]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (listo) setTimeout(() => refFinal.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60) }, [listo, origen])

  const elegirTipo = (t) => { setTipo(t); setOrigen(null) }
  const agregarCepa = () => {
    const c = nuevaCepa.trim()
    if (c && !lista.some((x) => x.toLowerCase() === c.toLowerCase())) setLista([...lista, c])
    if (c && !cepas.some((x) => x.toLowerCase() === c.toLowerCase())) setCepas([...cepas, c])
    setNuevaCepa('')
  }
  const opcionesOrigen = tipo === 'od' ? ['tecan', 'placas', 'cubeta'] : ['cubeta', 'placas']
  const ilus = { tecan: IlusTecan, placas: IlusPlacas, cubeta: IlusCubeta }
  const textoOrigen = {
    tecan: ORIGENES.tecan.texto,
    placas: tipo === 'odufc' ? 'Lector de placas: una placa por tiempo (Excel como el de biofilm). Si leíste una dilución, se indica el factor por pocillo.' : ORIGENES.placas.texto,
    cubeta: tipo === 'odufc' ? 'Absorbancia leída a mano en cubeta, con las diluciones cuando la OD se sale de la zona lineal.' : ORIGENES.cubeta.texto,
  }

  return (
    <div className="pagina asistente">
      <div className="encabezado">
        <div><h1>Nuevo experimento</h1><p className="sub">Respondé de arriba hacia abajo: cada elección abre la siguiente.</p></div>
        {hayExperimento && <button className="fantasma" onClick={onCancelar}><Icono n="x" />Cancelar</button>}
      </div>

      <Etapa n={1} titulo="¿Qué vas a analizar?">
        <div className="opciones">
          <Opcion on={tipo === 'od'} apagada={tipo && tipo !== 'od'} onClick={() => elegirTipo('od')} Ilus={IlusOD} titulo="Curva por OD"
            texto="Densidad óptica en el tiempo: μmax, tiempo de duplicación, lag, K y AUC." />
          <Opcion on={tipo === 'ufc'} apagada={tipo && tipo !== 'ufc'} onClick={() => elegirTipo('ufc')} Ilus={IlusUFC} titulo="Curva por conteo UFC/mL"
            texto="Colonias contadas en diluciones seriadas: UFC/mL con IC 95 % y crecimiento." />
          <Opcion on={tipo === 'odufc'} apagada={tipo && tipo !== 'odufc'} onClick={() => elegirTipo('odufc')} Ilus={IlusAmbos} titulo="OD + conteo UFC/mL"
            texto="Las dos mediciones de las mismas muestras, combinadas y con calibración OD ↔ UFC." />
        </div>
      </Etapa>

      {necesitaOrigen && (
        <Etapa key={'o' + tipo} n={2} titulo={tipo === 'od' ? '¿Cómo mediste la OD?' : '¿De dónde viene la OD?'} refEtapa={refOrigen}>
          <div className="opciones">
            {opcionesOrigen.map((o) => (
              <Opcion key={o} on={origen === o} apagada={origen && origen !== o} onClick={() => setOrigen(o)} Ilus={ilus[o]}
                titulo={o === 'placas' && tipo === 'odufc' ? 'Lector de placas' : ORIGENES[o].titulo} texto={textoOrigen[o]} />
            ))}
          </div>
        </Etapa>
      )}

      {listo && (
        <Etapa key={'f' + tipo + origen} n={necesitaOrigen ? 3 : 2} titulo="Datos del experimento" refEtapa={refFinal}>
          <div className="tarjeta">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 14px' }}>
              <Campo label="Nombre del experimento" style={{ gridColumn: '1 / -1' }}>
                <input autoFocus value={nombre} placeholder="Ej.: Curva L100A1 en BHI, 37 °C" onChange={(e) => setNombre(e.target.value)} />
              </Campo>
              <div>
                <Campo label="Organismo"><input value={cond.organismo} placeholder="Elegí o escribí" onChange={(e) => setCond({ ...cond, organismo: e.target.value })} /></Campo>
                <Sugerencias valores={SUGERENCIAS.organismo} actual={cond.organismo} onElegir={(v) => setCond({ ...cond, organismo: v })} />
              </div>
              <div>
                <Campo label="Medio"><input value={cond.medio} placeholder="Elegí o escribí" onChange={(e) => setCond({ ...cond, medio: e.target.value })} /></Campo>
                <Sugerencias valores={SUGERENCIAS.medio} actual={cond.medio} onElegir={(v) => setCond({ ...cond, medio: v })} />
              </div>
              <div>
                <Campo label="Temperatura (°C)"><Num value={cond.temperatura} onChange={(v) => setCond({ ...cond, temperatura: v })} /></Campo>
                <Sugerencias valores={SUGERENCIAS.temperatura} actual={cond.temperatura} onElegir={(v) => setCond({ ...cond, temperatura: v })} unidad=" °C" />
              </div>
              {tipo !== 'ufc' && <div>
                <Campo label="Longitud de onda (nm)"><Num value={cond.lambda} onChange={(v) => setCond({ ...cond, lambda: v })} /></Campo>
                <Sugerencias valores={SUGERENCIAS.lambda} actual={cond.lambda} onElegir={(v) => setCond({ ...cond, lambda: v })} unidad=" nm" />
              </div>}
              <Campo label="Fecha"><input type="date" value={cond.fecha} onChange={(e) => setCond({ ...cond, fecha: e.target.value })} /></Campo>
            </div>
            <Campo label={`Cepas o muestras del experimento · ${cepas.length ? `${cepas.length} elegida${cepas.length > 1 ? 's' : ''}` : 'tocá las que vas a usar'}`}>
              <div className="lista-opciones" style={{ marginBottom: 6 }}>
                {lista.map((c) => {
                  const on = cepas.includes(c)
                  return (
                    <button key={c} type="button" className={on ? 'on' : 'off'} aria-pressed={on} onClick={() => setCepas(on ? cepas.filter((x) => x !== c) : [...cepas, c])}>
                      {on && <Icono n="check" size={13} ancho={3} />}{c}
                    </button>
                  )
                })}
              </div>
            </Campo>
            <div className="fila" style={{ marginBottom: 16 }}>
              <input value={nuevaCepa} placeholder="Agregar cepa…" onChange={(e) => setNuevaCepa(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarCepa() }} style={{ width: 240 }} />
              <button onClick={agregarCepa}><Icono n="mas" size={15} />Agregar</button>
              <span className="ayuda">También podés agregar cepas después, al definir la placa o los conteos.</span>
            </div>
            <div className="fila" style={{ justifyContent: 'flex-end' }}>
              <button className="primario" onClick={() => onCrear({ nombre: nombre.trim() || 'Experimento', tipo, origenOd: necesitaOrigen ? origen : null, cond, cepas })}>
                Crear experimento<Icono n="flecha" size={16} />
              </button>
            </div>
          </div>
        </Etapa>
      )}
    </div>
  )
}
