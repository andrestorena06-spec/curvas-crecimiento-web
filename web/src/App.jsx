import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArchivoTab } from './components/archivo.jsx'
import { PlacaTab } from './components/placa.jsx'
import { PreprocTab } from './components/preproc.jsx'
import { GraficoTab } from './components/grafico.jsx'
import { AnalisisTab } from './components/analisis.jsx'
import { DatosTab, MetodosTab } from './components/datos.jsx'
import { Modal } from './components/ui.jsx'
import { normalizarEjes, normalizarEstilo } from './components/estilo.jsx'
import { ajustesDef } from './ayuda.js'
import { estilosPocillos } from './colores.js'
import { hojasDe, leerArchivo } from './motor/lectura.js'
import { analizarTodos, clavePunto, estadoVacio, preprocesar, r3 } from './motor/pipeline.js'

const CLAVE = 'curvas-crecimiento-v1'

const optsDef = () => ({
  graf: { tmin: '', tmax: '', click: false },
  det: { modo: 'pocillo', pocillo: '', muestra: '', replicas: true, modelo: 'ninguno', fases: true },
  mapa: { param: 'mu_max' },
  modelos: { sel: ['gompertz', 'logistico', 'richards', 'baranyi'] },
})
const optsDe = (x) => {
  const d = optsDef()
  return Object.fromEntries(Object.keys(d).map((k) => [k, { ...d[k], ...(x.opts?.[k] || {}) }]))
}

function cargarGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {} } catch { return {} }
}

// JSON guarda NaN como null: se restituye al leer
const reviveDatos = (d) => (d && d.tiempos && d.pocillos ? {
  tiempos: d.tiempos.map((x) => (x === null ? NaN : x)),
  pocillos: Object.fromEntries(Object.entries(d.pocillos).map(([k, v]) => [k, v.map((x) => (x === null ? NaN : x))])),
} : null)

const PESTANAS = [
  ['archivo', 'Archivo', 'Excel, muestras y sesión'],
  ['placa', 'Configurar pocillos', 'Placa de 96 pocillos'],
  ['preproc', 'Preprocesado y QC', 'Blanco, filtros y calidad'],
  ['grafico', 'Gráfico', 'Curvas de crecimiento'],
  ['analisis', 'Análisis', 'μmax, lag, K, modelos'],
  ['datos', 'Datos', 'Tablas y Excel'],
  ['metodos', 'Métodos', 'Cómo se calcula'],
]

// Logo: un gráfico con una curva de crecimiento (lag, fase exponencial y meseta)
export const LogoCurva = ({ ancho = 40, alto = 30 }) => (
  <svg viewBox="0 0 48 36" width={ancho} height={alto} aria-hidden>
    <path d="M5 4 V31 H45" fill="none" stroke="#ffe3c2" strokeOpacity=".85" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 28.5 C16 28.5 18.5 27.5 22.5 19.5 S31 8 43 7" fill="none" stroke="#ffb35c" strokeWidth="2.8" strokeLinecap="round" />
    <circle cx="14" cy="28.3" r="1.7" fill="#ffe3c2" /><circle cx="22.5" cy="19.5" r="1.7" fill="#ffe3c2" /><circle cx="35" cy="9.2" r="1.7" fill="#ffe3c2" />
  </svg>
)

export default function App() {
  const g = useMemo(cargarGuardado, [])
  // Si hay un trabajo anterior no se carga solo: se le pregunta a la persona
  const [pendiente, setPendiente] = useState(() => !!(g.datos || (g.config && g.config.length)))
  const gi = pendiente ? {} : g
  const [tab, setTab] = useState('archivo')
  const [archivo, setArchivo] = useState(gi.archivo || null)
  const [datos, setDatos] = useState(() => reviveDatos(gi.datos))
  const [preview, setPreview] = useState(gi.preview || null)
  const [muestras, setMuestras] = useState(gi.muestras || [])
  const [config, setConfig] = useState(gi.config || [])
  const [E, setE] = useState(() => ({ ...estadoVacio(), ...(gi.E || {}) }))
  const [aj, setAjObj] = useState(() => ({ ...ajustesDef(), ...(gi.aj || {}) }))
  const [blancosSel, setBlancosSel] = useState(gi.blancosSel ?? null)
  const [selMuestrasRaw, setSelMuestras] = useState(gi.selMuestras ?? null)
  const [selReps, setSelReps] = useState(gi.selReps || {})
  const [estilo, setEstilo] = useState(() => normalizarEstilo(gi.estilo))
  const [ejes, setEjes] = useState(() => normalizarEjes(gi.ejes))
  const [opts, setOpts] = useState(() => optsDe(gi))
  const [modelosRes, setModelosRes] = useState(null)
  const [avisos, setAvisos] = useState([])
  const fileRef = useRef(null)
  const vistas = useRef({})

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setAvisos((a) => [...a, { id, texto, tipo }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4200)
  }, [])

  // El trabajo (incluidos los datos del Excel) se guarda en el navegador.
  // Mientras se espera la decisión sobre el trabajo anterior no se guarda nada, para no pisarlo.
  useEffect(() => {
    if (pendiente) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ fecha: new Date().toISOString(), archivo, datos, preview, muestras, config, E, aj, blancosSel, selMuestras: selMuestrasRaw, selReps, estilo, ejes, opts }))
      } catch { /* sin almacenamiento o sin espacio */ }
    }, 400)
    return () => clearTimeout(t)
  }, [pendiente, archivo, datos, preview, muestras, config, E, aj, blancosSel, selMuestrasRaw, selReps, estilo, ejes, opts])

  const aplicarGuardado = (x) => {
    setArchivo(x.archivo || null)
    setDatos(reviveDatos(x.datos))
    setPreview(x.preview || null)
    setMuestras(x.muestras || [])
    setConfig(x.config || [])
    setE({ ...estadoVacio(), ...(x.E || {}) })
    setAjObj({ ...ajustesDef(), ...(x.aj || {}) })
    setBlancosSel(x.blancosSel ?? null)
    setSelMuestras(x.selMuestras ?? null)
    setSelReps(x.selReps || {})
    setEstilo(normalizarEstilo(x.estilo))
    setEjes(normalizarEjes(x.ejes))
    setOpts(optsDe(x))
    fileRef.current = null
  }
  const continuarAnterior = () => { aplicarGuardado(g); setPendiente(false) }
  const empezarDeCero = () => {
    try { localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ }
    setPendiente(false)
  }

  // ---------------------------------------------------------------
  // Derivados
  // ---------------------------------------------------------------
  const muestrasCfg = useMemo(() => {
    const pres = [...new Set(config.map((c) => c.Muestra))]
    return [...muestras.filter((m) => pres.includes(m)), ...pres.filter((m) => !muestras.includes(m))]
  }, [config, muestras])
  const colores = useMemo(() => estilosPocillos(config), [config])
  const soloBlanco = useMemo(() => muestrasCfg.filter((m) => config.filter((c) => c.Muestra === m).every((c) => c.EsBlanco)), [muestrasCfg, config])
  const selMuestras = selMuestrasRaw ? muestrasCfg.filter((m) => selMuestrasRaw.includes(m)) : (aj.corregir_blanco ? muestrasCfg.filter((m) => !soloBlanco.includes(m)) : muestrasCfg)
  const replicasSel = (m) => {
    const todas = config.filter((c) => c.Muestra === m).map((c) => c.Replica)
    return selReps[m] ? selReps[m].filter((r) => todas.includes(r)) : todas
  }
  const seleccion = useMemo(
    () => config.filter((c) => selMuestras.includes(c.Muestra) && replicasSel(c.Muestra).includes(c.Replica)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, selMuestras.join('|'), JSON.stringify(selReps)],
  )

  const ajD = useDeferredValue(aj)
  const pre = useMemo(
    () => (datos && config.length ? preprocesar({ datos, config, E, aj: ajD, blancosSel }) : null),
    [datos, config, E, ajD, blancosSel],
  )
  const res = useMemo(() => (pre && !pre.error ? analizarTodos(pre.proc, ajD, E.ventanas) : null), [pre, ajD, E.ventanas])
  useEffect(() => { setModelosRes(null) }, [res])

  // ---------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------
  const setAj = (k, v) => {
    if (k === 'corregir_blanco' && v && !selMuestrasRaw) {
      // al activar la corrección, las muestras que son solo blanco salen de «Muestras a mostrar» (se pueden volver a elegir)
      setSelMuestras(muestrasCfg.filter((m) => !soloBlanco.includes(m)))
    }
    setAjObj((a) => ({ ...a, [k]: v }))
  }
  const setOpt = (grupo, k, v) => setOpts((o) => ({ ...o, [grupo]: { ...o[grupo], [k]: v } }))
  const setRepsDe = (m, arr) => setSelReps((x) => ({ ...x, [m]: arr }))

  const cargarArchivo = async (file) => {
    try {
      const { hojas } = await hojasDe(file)
      let lectura = null, hoja = hojas[0], err = null
      for (const h of hojas) {
        try { lectura = await leerArchivo(file, h); hoja = h; break } catch (e) { err = e }
      }
      if (!lectura) throw err
      fileRef.current = file
      setArchivo({ nombre: file.name, hoja, hojas })
      setDatos(lectura.datos)
      setPreview(lectura.preview)
      setE(estadoVacio())
      setConfig((c) => c.filter((x) => lectura.datos.pocillos[x.Pocillo]))
      avisar(`Archivo cargado: ${Object.keys(lectura.datos.pocillos).length} pocillos, ${lectura.datos.tiempos.length} mediciones.`)
    } catch (e) {
      avisar(`${file.name}: ${e.message}`, 'error')
    }
  }
  const cambiarHoja = async (hoja) => {
    if (!fileRef.current) return avisar('Para cambiar de hoja hay que volver a cargar el archivo.', 'error')
    try {
      const l = await leerArchivo(fileRef.current, hoja)
      setArchivo((a) => ({ ...a, hoja }))
      setDatos(l.datos); setPreview(l.preview); setE(estadoVacio())
      setConfig((c) => c.filter((x) => l.datos.pocillos[x.Pocillo]))
    } catch (e) { avisar(e.message, 'error') }
  }

  const aplicarLayout = (cfgCrudo) => {
    if (!datos) return avisar('Primero cargá el archivo del lector.', 'error')
    const cfg = cfgCrudo.filter((c) => datos.pocillos[c.Pocillo]).map((c) => ({ ...c }))
    const omitidos = cfgCrudo.length - cfg.length
    setConfig(cfg)
    setE(estadoVacio())
    setMuestras((m) => [...new Set([...m, ...cfg.map((c) => c.Muestra)])])
    avisar(`Layout importado: ${cfg.length} pocillos.${omitidos ? ` Sin datos en el archivo: ${omitidos}.` : ''}`, omitidos ? 'error' : 'ok')
  }

  const borrarMuestra = (m) => {
    const n = config.filter((c) => c.Muestra === m).length
    if (n > 0 && !window.confirm(`La muestra '${m}' está asignada a ${n} pocillo(s). Si la borrás, esos pocillos quedan sin asignar. ¿Continuar?`)) return
    setMuestras(muestras.filter((x) => x !== m))
    setConfig(config.filter((c) => c.Muestra !== m))
  }
  const renombrarMuestra = (viejo, nuevo) => {
    if (!nuevo) return avisar('El nombre no puede estar vacío.', 'error')
    if (muestras.some((m) => m !== viejo && m.toLowerCase() === nuevo.toLowerCase())) return avisar(`Ya existe una muestra llamada '${nuevo}'.`, 'error')
    setMuestras(muestras.map((m) => (m === viejo ? nuevo : m)))
    setConfig(config.map((c) => (c.Muestra === viejo ? { ...c, Muestra: nuevo } : c)))
    setSelMuestras((x) => (x ? x.map((m) => (m === viejo ? nuevo : m)) : x))
    setSelReps((x) => (x[viejo] ? { ...Object.fromEntries(Object.entries(x).filter(([k]) => k !== viejo)), [nuevo]: x[viejo] } : x))
  }

  // Exclusión de puntos y pocillos
  const alternarPunto = (k) => {
    const [p] = k.split('|')
    setE((e) => {
      if (e.puntosExcl.includes(k)) return { ...e, puntosExcl: e.puntosExcl.filter((x) => x !== k) }
      if (e.forzados.includes(k)) return { ...e, forzados: e.forzados.filter((x) => x !== k) }
      const w = pre?.marcado?.find((x) => x.Pocillo === p)
      const f = w?.filas.find((q) => clavePunto(p, q.t) === k)
      if (f && f.marca) return { ...e, forzados: [...e.forzados, k] }
      return { ...e, puntosExcl: [...e.puntosExcl, k] }
    })
  }
  const excluirPocillos = (ps) => setE((e) => ({ ...e, pocillosExcl: [...new Set([...e.pocillosExcl, ...ps])] }))
  const reincorporarPocillos = (ps) => {
    setE((e) => ({ ...e, pocillosExcl: e.pocillosExcl.filter((p) => !ps.includes(p)) }))
    if (ps.some((p) => pre?.auto?.includes(p))) avisar('Algunos pocillos siguen excluidos por el criterio automático. Desactivá la exclusión automática para reincorporarlos.', 'error')
  }
  const alternarPocilloCompleto = (p) => setE((e) => ({ ...e, pocillosExcl: e.pocillosExcl.includes(p) ? e.pocillosExcl.filter((x) => x !== p) : [...e.pocillosExcl, p] }))
  const reincorporarPocillo = (p) => setE((e) => {
    const w = pre?.marcado?.find((x) => x.Pocillo === p)
    const marc = w ? w.filas.filter((f) => f.motivo).map((f) => clavePunto(p, f.t)) : []
    return { ...e, puntosExcl: e.puntosExcl.filter((k) => !k.startsWith(p + '|')), forzados: [...new Set([...e.forzados, ...marc])] }
  })
  const excluirRango = (p, desde, hasta) => {
    if (!(desde <= hasta)) return avisar("'Desde' tiene que ser menor o igual que 'Hasta'.", 'error')
    const ys = datos.pocillos[p] || []
    const nuevos = datos.tiempos.filter((t, i) => Number.isFinite(ys[i]) && t / 3600 >= desde && t / 3600 <= hasta).map((t) => clavePunto(p, t))
    if (!nuevos.length) return avisar('No hay puntos de ese pocillo en ese rango.', 'error')
    setE((e) => ({ ...e, puntosExcl: [...new Set([...e.puntosExcl, ...nuevos])] }))
    avisar(`${nuevos.length} puntos excluidos en ${p}`)
  }
  const reincorporarPuntos = (ks) => setE((e) => ({ ...e, puntosExcl: e.puntosExcl.filter((k) => !ks.includes(k)) }))
  const reincorporarTodosPuntos = () => setE((e) => ({ ...e, puntosExcl: [], forzados: [] }))

  // Ventanas manuales de μmax
  const aplicarVentana = (claves, rango) => setE((e) => {
    const v = { ...e.ventanas }
    claves.forEach((c) => { v[c] = [rango[0], rango[1]] })
    return { ...e, ventanas: v }
  })
  const quitarVentanas = (claves) => setE((e) => {
    if (!claves) return { ...e, ventanas: {} }
    const v = { ...e.ventanas }
    claves.forEach((c) => { delete v[c] })
    return { ...e, ventanas: v }
  })

  // Sesión
  const exportarSesion = () => ({ version: 1, tipo: 'curvas-crecimiento', fecha: new Date().toISOString(), archivo, datos, preview, muestras, config, E, aj, blancosSel, selMuestras: selMuestrasRaw, selReps, estilo, ejes, opts })
  const importarSesion = (x) => {
    if (!x?.datos || !x?.config) throw new Error('inválida')
    aplicarGuardado(x)
  }
  const onVista = useCallback((id, v) => { vistas.current[id] = v }, [])

  const s = {
    archivo, datos, preview, tieneArchivo: !!fileRef.current, cargarArchivo, cambiarHoja,
    muestras, setMuestras, muestrasCfg, config, setConfig, colores, aplicarLayout, borrarMuestra, renombrarMuestra,
    E, aj, setAj, opts, setOpt, estilo, setEstilo, ejes, setEjes,
    blancosSel, setBlancosSel, selMuestras, setSelMuestras, replicasSel, setRepsDe, seleccion,
    pre, res, modelosRes, setModelosRes, onVista, avisar,
    alternarPunto, excluirPocillos, reincorporarPocillos, alternarPocilloCompleto, reincorporarPocillo, excluirRango,
    reincorporarPuntos, reincorporarTodosPuntos, aplicarVentana, quitarVentanas,
    exportarSesion, importarSesion,
  }

  const Vista = { archivo: ArchivoTab, placa: PlacaTab, preproc: PreprocTab, grafico: GraficoTab, analisis: AnalisisTab, datos: DatosTab, metodos: MetodosTab }[tab]

  return (
    <div className="app">
      <nav className="barra">
        <div className="marca">
          <div className="logo"><LogoCurva /></div>
          <div><b>Curvas de crecimiento</b><small>Placa de 96 pocillos</small></div>
        </div>
        {PESTANAS.map(([id, t, d], i) => (
          <button key={id} className={`nav ${tab === id ? 'activa' : ''}`} onClick={() => setTab(id)}>
            <span className="num">{i + 1}</span>
            <span><b>{t}</b><small>{d}</small></span>
          </button>
        ))}
        <div className="pie-nav">
          {res?.length > 0 && <div className="chip-odc">{res.length} curvas analizadas</div>}
          <small>{archivo ? archivo.nombre : 'Sin archivo'}</small>
        </div>
      </nav>
      <main className="contenido">
        <Vista s={s} />
      </main>
      {pendiente && (
        <Modal titulo="Encontré trabajo anterior" ancho={540}
          pie={<>
            <button onClick={empezarDeCero}>Empezar de cero</button>
            <button className="primario" onClick={continuarAnterior}>Continuar con lo anterior</button>
          </>}>
          <p>
            En este navegador quedó guardado un trabajo
            {g.fecha ? <> del <b>{new Date(g.fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}</b></> : ''}:
          </p>
          <ul className="resumen-guardado">
            <li><b>{g.archivo?.nombre || 'Sin archivo'}</b> <small>{g.datos ? `${Object.keys(g.datos.pocillos).length} pocillos` : 'sin datos'} · {g.config?.length || 0} configurados</small></li>
          </ul>
          <p className="ayuda">«Continuar con lo anterior» recupera todo tal como lo dejaste. «Empezar de cero» borra ese trabajo guardado del navegador y arranca vacío (si querés conservarlo antes, cargá un archivo de sesión que hayas descargado).</p>
        </Modal>
      )}
      <div className="toasts">{avisos.map((a) => <div key={a.id} className={`toast ${a.tipo}`}>{a.texto}</div>)}</div>
    </div>
  )
}
