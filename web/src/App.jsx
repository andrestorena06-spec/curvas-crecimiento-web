import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { TEMAS, TemaCtx, coloresCepas, estilosSeries } from './tema.js'
import { TIPOS, ORIGENES, analizarPorCepa, expNuevo, filasConConteo, filasConOd, idCepa, importarArchivo, muestrasDe, normalizarExp, resultadosUfc, seriesOd, seriesPorCepa, tieneOd, tieneUfc } from './modelo.js'
import { analizarTodos, clavePunto, preprocesar } from './motor/pipeline.js'
import { Globo, Icono } from './ui/base.jsx'
import { Cajon, CintaCtx } from './ui/cinta.jsx'
import { GraficoCtx } from './ui/guardarImagen.jsx'
import { PanelPersonalizar } from './ui/personalizar.jsx'
import { Revision } from './ui/revision.jsx'
import { descargarTexto } from './utils.js'
import { OpcionesCtx } from './ui/opciones.js'
import { archivoDe, cancelado, elegirArchivo, elegirDestino, escribir, olvidarArchivo, puedeSobrescribir, recordarArchivo } from './archivoLocal.js'
import { Asistente } from './vistas/Asistente.jsx'
import { Inicio } from './vistas/Inicio.jsx'
import { Resumen } from './vistas/Resumen.jsx'
import { ArchivoTecan, PlacaTecan } from './vistas/Tecan.jsx'
import { PlacasTiempo } from './vistas/Placas.jsx'
import { Cubeta } from './vistas/Cubeta.jsx'
import { Conteo } from './vistas/Conteo.jsx'
import { Calidad } from './vistas/Calidad.jsx'
import { CalidadUfc } from './vistas/CalidadUfc.jsx'
import { Curva } from './vistas/Curva.jsx'
import { CurvaUfc } from './vistas/CurvaUfc.jsx'
import { Combinado } from './vistas/Combinado.jsx'
import { Datos } from './vistas/Datos.jsx'
import { Metodos } from './vistas/Metodos.jsx'
import { FichaCalculo, FichaCtx } from './fichas/FichaCalculo.jsx'

const CLAVE = 'curvas-crecimiento-v2'
const CLAVE_TEMA = 'curvas-crecimiento-v2-tema-mesada'
const CLAVE_MENU = 'curvas-crecimiento-v2-menu-corto'
const CLAVE_RECIENTES = 'curvas-crecimiento-v2-recientes'
const MAX_RECIENTES = 8
const CLAVE_PROGRAMA_ANTERIOR = 'curvas-crecimiento-v1'   // guardado automático del programa anterior (mismo sitio web)
const CLAVE_MIGRADO = 'curvas-crecimiento-v2-migrado'
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }

const ICONOS = { resumen: 'nuevo', archivo: 'tecan', placa: 'placa', placas: 'tiempo', lecturas: 'cubeta', conteo: 'colonia', calidad: 'escudo', calidadUfc: 'escudo', curva: 'curva', curvaUfc: 'curva', combinado: 'combinar', parametros: 'sigma', datos: 'tabla', metodos: 'libro' }

// pestañas: [título, vista]
const PASOS = {
  resumen: ['Resumen', Resumen],
  archivo: ['Cargar datos', ArchivoTecan],
  placa: ['Pocillos', PlacaTecan],
  placas: ['Cargar datos', PlacasTiempo],
  lecturas: ['Cargar datos', Cubeta],
  conteo: ['Cargar datos', Conteo],
  calidad: ['Revisión', Calidad],
  calidadUfc: ['Revisión', CalidadUfc],
  curva: ['Curva OD vs t', Curva],
  curvaUfc: ['Curva UFC vs t', CurvaUfc],
  combinado: ['OD ↔ UFC', Combinado],
  datos: ['Datos', Datos],
  metodos: ['Métodos', Metodos],
}
// Menús con submenús: OD (lecturas, calidad y curva) y Conteo (colonias, calidad y curva). El orden sigue el cálculo:
// datos → calidad → curva de cada medición; después los parámetros (OD y recuento), la calibración OD ↔ UFC (usa los
// ajustes de los recuentos), Métodos y las tablas.
const GRUPOS = {
  od: { titulo: 'OD', icono: 'placa', hijos: ['archivo', 'placa', 'placas', 'lecturas', 'calidad', 'curva'] },
  conteo: { titulo: 'Conteo', icono: 'colonia', hijos: ['conteo', 'calidadUfc', 'curvaUfc'] },
}
const grupoDe = (id) => Object.keys(GRUPOS).find((g) => GRUPOS[g].hijos.includes(id))
export const TITULO_PASO = Object.fromEntries(Object.entries(PASOS).map(([k, v]) => [k, v[0]]))
// nombre completo (los submenús de OD y de Conteo repiten «Cargar datos» y «Revisión»): para anterior/siguiente y globos
export const NOMBRE_LARGO = { ...TITULO_PASO, archivo: 'Cargar datos de OD', placas: 'Cargar datos de OD', lecturas: 'Cargar datos de OD', conteo: 'Cargar conteos', calidad: 'Revisión de la OD', calidadUfc: 'Revisión de los recuentos' }
export function pasosDe(e) {
  if (!e) return []
  const od = { tecan: ['archivo', 'placa'], placas: ['placas'], cubeta: ['lecturas'] }[e.origenOd] || []
  if (e.tipo === 'od') return ['resumen', ...od, 'calidad', 'curva', 'metodos', 'datos']
  if (e.tipo === 'ufc') return ['resumen', 'conteo', 'calidadUfc', 'curvaUfc', 'metodos', 'datos']
  return ['resumen', ...od, 'calidad', 'curva', 'conteo', 'calidadUfc', 'curvaUfc', 'combinado', 'metodos', 'datos']
}

const Logo = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <rect width="24" height="24" rx="6" fill="#EF9F27" />
    <path d="M5 18 C9 18 10 17 12 12 S16 6 20 6" fill="none" stroke="#412402" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

// Guarda la lista de recientes (máximo 8); si no hay lugar en el navegador, se quedan los más nuevos que entren
function guardarRecientes(lista) {
  const nuevo = lista.slice(0, MAX_RECIENTES)
  for (let n = nuevo.length; n > 0; n--) {
    try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(nuevo.slice(0, n))); localStorage.removeItem(CLAVE); return nuevo.slice(0, n) } catch { /* sin espacio: se guardan menos */ }
  }
  return nuevo
}

export default function App() {
  const [tema, setTema] = useState(() => leer(CLAVE_TEMA) || 'claro')
  const [recientes, setRecientes] = useState(() => {
    let r = leer(CLAVE_RECIENTES)
    if (!Array.isArray(r)) { const g = leer(CLAVE); r = g?.exp ? [{ fecha: g.fecha, exp: g.exp }] : [] }
    // una sola vez: lo que había quedado guardado en este navegador con el programa anterior pasa a «Recientes»
    if (!leer(CLAVE_MIGRADO)) {
      try {
        const viejo = leer(CLAVE_PROGRAMA_ANTERIOR)
        const j = viejo?.exps ? viejo : viejo?.datos ? { ...viejo, tipo: 'curvas-crecimiento' } : null
        if (j) r = guardarRecientes([...importarArchivo(j).exps.map((e) => ({ fecha: viejo.fecha || new Date().toISOString(), exp: e })), ...r])
      } catch { /* datos viejos ilegibles: se ignoran */ }
      try { localStorage.setItem(CLAVE_MIGRADO, 'true') } catch { /* sin almacenamiento */ }
    }
    return r
  })
  const [exp, setExp] = useState(null)
  const [paso, setPaso] = useState(null)
  const [archivoAbierto, setArchivoAbierto] = useState(false)   // pestaña «Archivo» (nuevo, abrir, guardar)
  const [asistente, setAsistente] = useState(false)
  const [avisos, setAvisos] = useState([])
  const [revisar, setRevisar] = useState(false)
  const [panelRev, setPanelRev] = useState(false)
  const [nodoCinta, setNodoCinta] = useState(null)
  const [menuCorto, setMenuCorto] = useState(() => leer(CLAVE_MENU) || false)
  const [persGraf, setPersGraf] = useState(null)               // gráfico abierto con clic derecho › Personalizar
  const [ficha, setFicha] = useState(null)                     // ficha «Cómo se calculó» abierta
  const [menuMovil, setMenuMovil] = useState(false)            // celular: el menú lateral se abre como cajón
  const archivoRef = useRef(null)          // el File del Tecan (para cambiar de hoja)
  const [archivoExp, setArchivoExp] = useState(null)   // { handle, nombre }: el .curvas.json de este experimento (Guardar lo sobrescribe)
  const inputCargar = useRef()

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    try { localStorage.setItem(CLAVE_TEMA, JSON.stringify(tema)) } catch { /* sin almacenamiento */ }
  }, [tema])
  useEffect(() => { try { localStorage.setItem(CLAVE_MENU, JSON.stringify(menuCorto)) } catch { /* sin almacenamiento */ } }, [menuCorto])
  // guardado automático: el experimento abierto pasa al primer lugar de «Recientes» (máximo 8)
  useEffect(() => {
    if (!exp) return
    const t = setTimeout(() => setRecientes((rs) => guardarRecientes([{ fecha: new Date().toISOString(), exp }, ...rs.filter((r) => r.exp?.id !== exp.id)])), 600)
    return () => clearTimeout(t)
  }, [exp])
  const borrarReciente = (r) => setRecientes((rs) => { const n = rs.filter((x) => x.exp?.id !== r.exp?.id); try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(n)) } catch { /* nada */ } return n })
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && revisar && !['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) setRevisar(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [revisar])

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setAvisos((x) => [...x, { id, texto, tipo }])
    setTimeout(() => setAvisos((x) => x.filter((v) => v.id !== id)), 4500)
  }, [])
  // Android: el botón Atrás cierra el menú o la ventana abierta antes de salir de la app
  const menuMovilRef = useRef(false)
  menuMovilRef.current = menuMovil
  useEffect(() => {
    let quitar = () => {}
    import('./nativo.js').then(({ escucharAtras }) => escucharAtras(() => {
      if (menuMovilRef.current) { setMenuMovil(false); return true }
      if (document.querySelector('.velo, .panel-cinta, .menu-contextual')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true }
      return false
    }, avisar)).then((f) => { quitar = f })
    return () => quitar()
  }, [avisar])

  const pasos = pasosDe(exp)
  const pasoAct = pasos.includes(paso) ? paso : pasos[0]
  const irA = (p) => { setPaso(p); guardarOpcion('app.paso', p); setArchivoAbierto(false); setAsistente(false); setMenuMovil(false); document.querySelector('.principal')?.scrollTo(0, 0) }

  // ---------- experimento ----------
  const abrir = (e, aviso, primero) => { hist.current = { pasado: [], futuro: [], ultimo: 0 }; setArchivoExp(null); setExp(e); setPaso(primero || e.opciones?.['app.paso'] || 'resumen'); setAsistente(false); setArchivoAbierto(false); archivoRef.current = null; if (aviso) avisar(aviso) }
  const crear = (datos) => { const e = expNuevo(datos); abrir(e, `Experimento «${datos.nombre}» creado.`, pasosDe(e)[1]) }
  const nombreSugerido = (e) => `${e.nombre.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '_')}.curvas.json`
  const textoExp = (e) => JSON.stringify({ tipo: 'curvas-de-crecimiento', ...e, guardado: new Date().toISOString() })
  // Guardar como: elegir dónde (Chrome / Edge); desde entonces «Guardar» escribe sobre ese archivo
  const guardarComo = async () => {
    if (!exp) return
    if (!puedeSobrescribir()) return descargarTexto(textoExp(exp), nombreSugerido(exp), 'application/json')
    try {
      const handle = await elegirDestino(archivoExp?.nombre || nombreSugerido(exp))
      await escribir(handle, textoExp(exp))
      setArchivoExp({ handle, nombre: handle.name })
      recordarArchivo(exp.id, handle)
      avisar(`Guardado en «${handle.name}».`)
    } catch (e) { if (!cancelado(e)) avisar(`No se pudo guardar: ${e.message}`, 'error') }
  }
  // Guardar: si el experimento vino de un archivo (o ya se guardó una vez), se sobrescribe ese archivo
  const guardar = async () => {
    if (!exp) return
    if (!archivoExp?.handle) return guardarComo()
    try {
      await escribir(archivoExp.handle, textoExp(exp))
      avisar(`Guardado en «${archivoExp.nombre}».`)
    } catch (e) {
      if (cancelado(e)) return
      avisar(`No se pudo escribir «${archivoExp.nombre}» (${e.message}). Elegí dónde guardarlo.`, 'error')
      guardarComo()
    }
  }
  // Abrir: con Chrome / Edge se recuerda el archivo elegido para poder sobrescribirlo al guardar
  const abrirArchivo = async () => {
    if (!puedeSobrescribir()) return inputCargar.current.click()
    try { const { handle, file } = await elegirArchivo(); cargarArchivo(file, handle) } catch (e) {
      if (cancelado(e)) return
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return inputCargar.current.click()   // navegador integrado u otro contexto sin permiso: selector clásico
      avisar(`No se pudo abrir: ${e.message}`, 'error')
    }
  }
  // Abre un .curvas.json o una sesión de una versión anterior del programa. Si el archivo trae varios
  // experimentos (versión anterior), se abre el que estaba activo y los demás quedan en «Recientes».
  // Los archivos de versiones anteriores no se sobrescriben: el primer «Guardar» pide dónde guardar el nuevo.
  const cargarArchivo = async (file, handle = null) => {
    try {
      const j = JSON.parse((await file.text()).replace(/^\uFEFF/, ''))
      const legado = Array.isArray(j?.exps) || j?.tipo === 'curvas-crecimiento'
      const { exps, activo, avisos: notas } = importarArchivo(j)
      const otros = exps.filter((_, i) => i !== activo)
      if (otros.length) setRecientes((rs) => guardarRecientes([...otros.map((e) => ({ fecha: new Date().toISOString(), exp: e })), ...rs.filter((r) => !exps.some((e) => e.id === r.exp?.id))]))
      abrir(exps[activo], `Experimento «${file.name}» cargado${otros.length ? `; los otros ${otros.length} del archivo quedaron en «Recientes»` : ''}.`)
      if (handle && !legado) { setArchivoExp({ handle, nombre: file.name }); recordarArchivo(exps[activo].id, handle) }
      else olvidarArchivo(exps[activo].id)
      if (legado) notas.unshift('Archivo de una versión anterior: al guardar se crea un archivo nuevo y el original queda como estaba.')
      notas.forEach((n) => avisar(n, 'error'))
    } catch (e) { avisar(`No se pudo cargar: ${e.message}`, 'error') }
  }
  const guardarRef = useRef(null), guardarComoRef = useRef(null)
  guardarRef.current = guardar
  guardarComoRef.current = guardarComo
  const abrirReciente = (r) => {
    try { abrir(normalizarExp(r.exp), `«${r.exp.nombre}» abierto.`) } catch (e) { return avisar(e.message, 'error') }
    archivoDe(r.exp.id).then((h) => setArchivoExp(h ? { handle: h, nombre: h.name } : null))
  }

  // Deshacer / rehacer: los cambios seguidos (menos de 0,7 s entre uno y otro, como al escribir) cuentan como uno solo
  // opciones de vista guardadas en el experimento (sin pasar por deshacer / rehacer)
  const guardarOpcion = useCallback((clave, valor) => setExp((e) => (e ? { ...e, opciones: { ...(e.opciones || {}), [clave]: valor } } : e)), [])
  const gruposCerrados = exp?.opciones?.['menu.cerrados'] || []
  const setGruposCerrados = (x) => guardarOpcion('menu.cerrados', typeof x === 'function' ? x(gruposCerrados) : x)
  const expRef = useRef(null)
  expRef.current = exp
  const hist = useRef({ pasado: [], futuro: [], ultimo: 0 })
  const [, setNHist] = useState(0)
  const upd = useCallback((patch) => {
    const h = hist.current, ahora = Date.now()
    if (expRef.current && ahora - h.ultimo > 700) { h.pasado.push(expRef.current); if (h.pasado.length > 80) h.pasado.shift() }
    h.ultimo = ahora
    h.futuro = []
    setNHist((n) => n + 1)
    setExp((e) => (e ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e))
  }, [])
  const deshacer = useCallback(() => {
    const h = hist.current
    if (!h.pasado.length) return
    h.futuro.push(expRef.current); h.ultimo = 0
    setExp(h.pasado.pop()); setNHist((n) => n + 1)
  }, [])
  const rehacer = useCallback(() => {
    const h = hist.current
    if (!h.futuro.length) return
    h.pasado.push(expRef.current); h.ultimo = 0
    setExp(h.futuro.pop()); setNHist((n) => n + 1)
  }, [])
  useEffect(() => {
    const k = (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      const t = ev.key.toLowerCase()
      if (t === 's') { ev.preventDefault(); (ev.shiftKey ? guardarComoRef : guardarRef).current?.(); return }   // Ctrl + S / Ctrl + Mayús + S
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (t === 'z' && !ev.shiftKey) { ev.preventDefault(); deshacer() }
      else if (t === 'y' || (t === 'z' && ev.shiftKey)) { ev.preventDefault(); rehacer() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [deshacer, rehacer])
  const setAj = (k, v) => upd((e) => ({ aj: { ...e.aj, [k]: v } }))
  const setE = (f) => upd((e) => ({ E: f(e.E) }))

  // ---------- cálculo ----------
  const expD = useDeferredValue(exp)
  // Los cálculos pesados (series, preprocesado, parámetros, UFC) NO dependen de lo que solo cambia cómo se ve (ocultar una cepa, opciones de pantalla,
  // colores, estilos de gráficos, selección del tramo): sin esto, cada clic en una cepa recalculaba todo el experimento.
  const AJ_VISTA = ['cepas_ocultas', 'calib_incl', 'calib_ventana', 'ufc_ventana']
  const ajCalc = useMemo(() => (expD ? Object.fromEntries(Object.entries(expD.aj || {}).filter(([k]) => !AJ_VISTA.includes(k))) : null), [expD?.aj]) // eslint-disable-line react-hooks/exhaustive-deps
  const ajClave = useMemo(() => JSON.stringify(ajCalc), [ajCalc])   // aj es chico: solo esto se serializa
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const expC = useMemo(() => expD, [expD?.E, expD?.blancosSel, expD?.tipo, expD?.origenOd, expD?.cond, expD?.cepas, expD?.tecan, expD?.placas, expD?.excels, expD?.manual, expD?.ufc, expD?.ufcExcl, expD?.ufcForz, expD?.plExcl, expD?.plForz, expD?.nombre, ajClave])
  const serie = useMemo(() => (expC && tieneOd(expC) ? seriesOd(expC) : { datos: null, config: [], aj: expC?.aj || {}, avisos: [] }), [expC])
  const pre = useMemo(() => (serie.datos && serie.config.length ? preprocesar({ datos: serie.datos, config: serie.config, E: expC.E, aj: serie.aj, blancosSel: expC.blancosSel }) : null), [serie, expC])
  // placas por tiempo: la curva es por cepa (cada placa es un instante); en los demás orígenes, una curva por réplica.
  // Los parámetros salen de pre.analisis (OD corregida, sin suavizar ni normalizar); pre.proc es solo para los gráficos.
  const porCepa = expD?.origenOd === 'placas'
  const modoCurva = expD?.aj?.placas_curva || 'puntos'   // sin promediar: todos los puntos
  const res = useMemo(() => (pre && !pre.error
    ? (porCepa ? analizarPorCepa(pre.analisis, serie.aj, expC.E.ventanas, modoCurva) : analizarTodos(pre.analisis, serie.aj, expC.E.ventanas))
    : null), [pre, serie.aj, expC, porCepa, modoCurva])
  const seriesAn = useMemo(() => (pre && !pre.error ? (porCepa ? seriesPorCepa(pre.analisis) : pre.analisis.filter((w) => !w.EsBlanco)) : []), [pre, porCepa])
  const ufcRes = useMemo(() => (expC && tieneUfc(expC) ? resultadosUfc(expC) : null), [expC])
  const muestras = useMemo(() => (exp ? muestrasDe(exp) : []), [exp])
  const colores = useMemo(() => ({ ...coloresCepas(muestras), ...(exp?.coloresCepa || {}) }), [muestras, exp?.coloresCepa])
  const estilos = useMemo(() => ({ ...estilosSeries(serie.config, colores), ...Object.fromEntries(muestras.map((m) => [idCepa(m), { color: colores[m] }])) }), [serie.config, colores, muestras])

  // exclusiones de puntos y pocillos
  const alternarPunto = (k) => {
    const [p] = k.split('|')
    setE((E) => {
      if (E.puntosExcl.includes(k)) return { ...E, puntosExcl: E.puntosExcl.filter((x) => x !== k) }
      if (E.forzados.includes(k)) return { ...E, forzados: E.forzados.filter((x) => x !== k) }
      const w = pre?.marcado?.find((x) => x.Pocillo === p)
      const f = w?.filas.find((q) => clavePunto(p, q.t) === k)
      // excluido por un filtro → se conserva a mano; marcado pero en el análisis («solo marcar») o normal → se excluye a mano
      if (f && f.motivo) return { ...E, forzados: [...E.forzados, k] }
      return { ...E, puntosExcl: [...E.puntosExcl, k] }
    })
  }
  const alternarPocillo = (p) => setE((E) => ({ ...E, pocillosExcl: E.pocillosExcl.includes(p) ? E.pocillosExcl.filter((x) => x !== p) : [...E.pocillosExcl, p] }))
  const reincorporarPocillo = (p) => setE((E) => {
    const w = pre?.marcado?.find((x) => x.Pocillo === p)
    const marc = w ? w.filas.filter((f) => f.motivo).map((f) => clavePunto(p, f.t)) : []
    return { ...E, puntosExcl: E.puntosExcl.filter((k) => !k.startsWith(p + '|')), forzados: [...new Set([...E.forzados, ...marc])] }
  })
  // placas por tiempo: clic sobre una lectura (igual que en Biofilm)
  //   excluida a mano → se reincorpora · excluida por el test → se conserva · sospechosa conservada → vuelve a excluirse · aceptada → se excluye a mano
  const alternarLectura = (k) => upd((e) => {
    const l = serie.extra?.lecturas?.find((x) => x.clave === k)
    if (e.plExcl.includes(k)) return { plExcl: e.plExcl.filter((x) => x !== k) }
    if (l?.AutoExcl) return { plForz: [...e.plForz, k] }
    if (e.plForz.includes(k) && l?.Sospechoso) return { plForz: e.plForz.filter((x) => x !== k) }
    return { plExcl: [...e.plExcl, k] }
  })
  const restablecerLecturas = () => upd({ plExcl: [], plForz: [] })
  // tramo exponencial de la OD de una cepa (una ventana por réplica) y de las UFC: se eligen POR SEPARADO, cada uno en un solo cambio
  const redondeo = (v) => (v ? [Number(v[0].toFixed(3)), Number(v[1].toFixed(3))] : null)
  const setTramoOd = (pocillos, v) => upd((e) => {
    const w = redondeo(v), ven = { ...e.E.ventanas }
    pocillos.forEach((p) => { if (w) ven[p] = w; else delete ven[p] })
    return { E: { ...e.E, ventanas: ven } }
  })
  const setTramoUfc = (cepa, v) => upd((e) => {
    const w = redondeo(v), cv = { ...(e.aj.ufc_ventana || {}) }
    if (w) cv[cepa] = w; else delete cv[cepa]
    return { aj: { ...e.aj, ufc_ventana: cv } }
  })
  const setVentana = (p, v) => setE((E) => { const ven = { ...E.ventanas }; if (v) ven[p] = v; else delete ven[p]; return { ...E, ventanas: ven } })
  // personalización de gráficos (se guarda con el experimento)
  const estiloGrafico = (id) => exp?.graficos?.[id] || {}
  const setEstiloGrafico = (id, patch) => upd((e) => ({ graficos: { ...(e.graficos || {}), [id]: patch === null ? {} : { ...(e.graficos?.[id] || {}), ...patch } } }))
  const setColorCepa = (m, c) => upd((e) => ({ coloresCepa: { ...(e.coloresCepa || {}), [m]: c } }))
  const restablecerColores = () => upd({ coloresCepa: {} })
  const agregarCepa = (c) => { const n = String(c || '').trim(); if (n && !exp.cepas.includes(n)) upd((e) => ({ cepas: [...e.cepas, n] })) }

  const listo = (id) => {
    if (!exp) return false
    switch (id) {
      case 'archivo': return !!exp.tecan.datos
      case 'placa': return exp.tecan.config.length > 0
      case 'placas': return exp.placas.some((p) => p.valores)
      case 'lecturas': return filasConOd(exp).length > 0
      case 'conteo': return filasConConteo(exp).length > 0
      case 'calidad': case 'curva': return !!res?.length
      case 'calidadUfc': case 'curvaUfc': return !!ufcRes?.hay
      case 'combinado': return !!res?.length && !!ufcRes?.hay
      default: return false
    }
  }

  const s = {
    exp, upd, setAj, setE, avisar, irA, archivoRef, agregarCepa, guardar, guardarComo, archivoExp, pasos, listo, estiloGrafico, setEstiloGrafico, setColorCepa, restablecerColores,
    serie, pre, res, seriesAn, porCepa, modoCurva, ufcRes, muestras, colores, estilos, tema: TEMAS[tema],
    alternarPunto, alternarPocillo, reincorporarPocillo, setVentana, setTramoOd, setTramoUfc, alternarLectura, restablecerLecturas, abrirFicha: setFicha,
  }

  // barra de estado
  const estado = (() => {
    if (!exp) return 'Sin experimento abierto'
    const usadas = new Set([...serie.config.filter((c) => !c.EsBlanco).map((c) => c.Muestra), ...(ufcRes?.reps || []).map((r) => r.Muestra)])
    const p = [TIPOS[exp.tipo].corto + (exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : ''), `${usadas.size} cepa${usadas.size === 1 ? '' : 's'}`]
    if (exp.origenOd === 'placas') { const l = serie.extra?.lecturas || []; p.push(`${exp.placas.length} tiempos`, `${l.filter((x) => x.Usado).length}/${l.length} lecturas aceptadas`) }
    if (ufcRes?.hay) p.push(`${ufcRes.reps.filter((r) => r.Conteos > 0).length} conteos de UFC`)
    p.push(archivoExp ? `archivo «${archivoExp.nombre}» (Ctrl + S guarda)` : 'sin archivo: Ctrl + S para guardarlo', 'copia automática en «Recientes»')
    return p.join(' · ')
  })()

  const enArchivo = archivoAbierto || !exp
  const Vista = exp && !asistente && !enArchivo ? PASOS[pasoAct][1] : null
  const pestanaActual = asistente ? 'Nuevo experimento' : enArchivo ? 'Archivo' : PASOS[pasoAct][0]

  return (
    <TemaCtx.Provider value={TEMAS[tema]}>
      <GraficoCtx.Provider value={{ abrirPersonalizar: exp ? setPersGraf : null }}><CintaCtx.Provider value={nodoCinta}><OpcionesCtx.Provider value={{ opciones: exp?.opciones || {}, set: guardarOpcion }}><FichaCtx.Provider value={setFicha}>
        <div className="app">
          <header className="barra-titulo">
            <button className="titulo-boton solo-movil hamburguesa" onClick={() => setMenuMovil(!menuMovil)} aria-label="Menú"><Icono n={menuMovil ? 'x' : 'hamburguesa'} size={18} /></button>
            <Logo /><b>Curvas de crecimiento</b>
            <span className="titulo-exp">{exp ? exp.nombre : ''}</span>
            <span className="espacio" />
            {exp && <>
              <button className="titulo-boton" onClick={deshacer} disabled={!hist.current.pasado.length} aria-label="Deshacer" data-tip="Deshacer (Ctrl + Z)"><Icono n="deshacer" size={16} /></button>
              <button className="titulo-boton" onClick={rehacer} disabled={!hist.current.futuro.length} aria-label="Rehacer" data-tip="Rehacer (Ctrl + Y)"><Icono n="rehacer" size={16} /></button>
            </>}
            <button className={`titulo-boton solo-compu ${panelRev ? 'on' : ''}`} onClick={() => setPanelRev(!panelRev)} data-tip={'Modo revisión\nMarcá zonas de la pantalla y comentá qué cambiarías'}>
              💬 Comentar
            </button>
            <button className="titulo-boton" onClick={() => setTema(tema === 'oscuro' ? 'claro' : 'oscuro')} data-tip="Cambiar entre tema claro y oscuro">
              <Icono n={tema === 'oscuro' ? 'sol' : 'luna'} size={15} />
            </button>
          </header>
          <div className="cuerpo-app">
          {menuMovil && <div className="velo-menu solo-movil" onClick={() => setMenuMovil(false)} />}
          <nav className={`menu-lateral ${menuCorto ? 'corto' : ''} ${menuMovil ? 'abierto' : ''}`}>
            <button className={`item-menu archivo ${enArchivo && !asistente ? 'on' : ''}`} onClick={() => { setArchivoAbierto(true); setAsistente(false); setMenuMovil(false) }} data-tip={menuCorto ? 'Archivo' : undefined}>
              <span className="ico"><Icono n="carpeta" size={18} /></span><span className="txt">Archivo</span>
            </button>
            {exp && <div className="sep-menu" />}
            {exp && (() => {
              const item = (id, sub) => (
                <button key={id} className={`item-menu ${sub ? 'sub' : ''} ${!enArchivo && !asistente && pasoAct === id ? 'on' : ''}`} onClick={() => irA(id)} data-tip={menuCorto ? NOMBRE_LARGO[id] : undefined}>
                  <span className="ico"><Icono n={ICONOS[id]} size={sub ? 16 : 18} />{listo(id) && <i className="hecho" aria-label="listo"><Icono n="check" size={9} ancho={4} /></i>}</span>
                  <span className="txt">{PASOS[id][0]}</span>
                </button>
              )
              const hechos = new Set()
              return pasos.map((id) => {
                const g = grupoDe(id)
                if (!g) return item(id, false)
                if (hechos.has(g)) return null
                hechos.add(g)
                const hijos = GRUPOS[g].hijos.filter((h) => pasos.includes(h))
                const activo = !enArchivo && !asistente && hijos.includes(pasoAct)
                const abierto = !gruposCerrados.includes(g)
                const alternar = () => setGruposCerrados((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]))
                return (
                  <div key={g} className={`grupo-menu ${activo ? 'activo' : ''}`}>
                    {/* el título lleva a la primera pantalla del grupo; la flecha (botón aparte) pliega o despliega */}
                    <div className="fila-grupo">
                      <button className="item-menu cabeza" onClick={() => { setGruposCerrados((c) => c.filter((x) => x !== g)); if (!activo) irA(hijos[0]) }}
                        data-tip={menuCorto ? GRUPOS[g].titulo : undefined}>
                        <span className="ico"><Icono n={GRUPOS[g].icono} size={18} />{hijos.every((h) => listo(h)) && <i className="hecho" aria-label="listo"><Icono n="check" size={9} ancho={4} /></i>}</span>
                        <span className="txt">{GRUPOS[g].titulo}</span>
                      </button>
                      <button className="plegar-grupo txt" onClick={alternar} aria-expanded={abierto} aria-label={abierto ? `Plegar ${GRUPOS[g].titulo}` : `Desplegar ${GRUPOS[g].titulo}`}
                        data-tip={abierto ? 'Plegar' : 'Desplegar'}>
                        <Icono n="abajo" size={16} style={{ transform: abierto ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                      </button>
                    </div>
                    {abierto && <div className="submenu">{hijos.map((h) => item(h, true))}</div>}
                  </div>
                )
              })
            })()}
            <span className="espacio" />
            <button className="item-menu plegar" onClick={() => setMenuCorto(!menuCorto)} data-tip={menuCorto ? 'Mostrar los nombres' : 'Solo íconos'}>
              <span className="ico"><Icono n="flecha" size={16} style={{ transform: menuCorto ? 'none' : 'rotate(180deg)' }} /></span><span className="txt">Contraer</span>
            </button>
          </nav>
          <div className="zona-trabajo">
          <div className="cinta" ref={setNodoCinta} />
          <main className="principal">
            {Vista && (() => {
              const i = pasos.indexOf(pasoAct), g = grupoDe(pasoAct)
              const ant = pasos[i - 1], sig = pasos[i + 1]
              return (
                <nav className="migas no-imprimir" aria-label="Ubicación">
                  <span className="ruta">{g && <span>{GRUPOS[g].titulo}</span>}<b>{PASOS[pasoAct][0]}</b></span>
                  <span className="paso-n">paso {i + 1} de {pasos.length}</span>
                  <span className="espacio" />
                  {ant && <button className="fantasma chico" onClick={() => irA(ant)} data-tip={`Anterior: ${NOMBRE_LARGO[ant]}`}><Icono n="flecha" size={13} style={{ transform: 'rotate(180deg)' }} />{NOMBRE_LARGO[ant]}</button>}
                  {sig && <button className="chico" onClick={() => irA(sig)} data-tip={`Siguiente: ${NOMBRE_LARGO[sig]}`}>{NOMBRE_LARGO[sig]}<Icono n="flecha" size={13} /></button>}
                </nav>
              )
            })()}
            {asistente ? <Asistente onCrear={crear} onCancelar={() => setAsistente(false)} hayExperimento={!!exp} />
              : Vista ? <Vista s={s} key={exp.id + pasoAct} />
                : <Inicio onNuevo={() => setAsistente(true)} onCargar={abrirArchivo} onGuardarComo={guardarComo} archivoExp={archivoExp} recientes={recientes} onAbrirReciente={abrirReciente} onBorrarReciente={borrarReciente}
                  exp={exp} onGuardar={guardar} onVolver={() => setArchivoAbierto(false)} />}
          </main>
          </div>
          </div>
          <footer className="barra-estado">{estado}</footer>
          <input ref={inputCargar} type="file" hidden accept=".json" onChange={(e) => { if (e.target.files[0]) cargarArchivo(e.target.files[0]); e.target.value = '' }} />
          <Revision pestana={pestanaActual} experimento={exp?.nombre} activo={revisar} setActivo={setRevisar} panel={panelRev} setPanel={setPanelRev} avisar={avisar} />
          <Globo />
          {exp && <Cajon titulo="Personalizar gráfico" abierto={!!persGraf} onClose={() => setPersGraf(null)}><PanelPersonalizar s={s} id={persGraf} ejeDerecho={persGraf === 'combinado'} /></Cajon>}
          {ficha && <FichaCalculo ficha={ficha} onClose={() => setFicha(null)}
            onMetodos={exp ? (ancla) => { setFicha(null); irA('metodos'); setTimeout(() => document.getElementById(ancla)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450) } : null} />}
          <div className="toasts">{avisos.map((x) => <div key={x.id} className={`toast ${x.tipo}`}>{x.texto}</div>)}</div>
        </div>
      </FichaCtx.Provider></OpcionesCtx.Provider></CintaCtx.Provider></GraficoCtx.Provider>
    </TemaCtx.Provider>
  )
}
