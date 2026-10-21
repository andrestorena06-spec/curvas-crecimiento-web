import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { TEMAS, TemaCtx, coloresCepas, estilosSeries } from './tema.js'
import { TIPOS, ORIGENES, analizarPorCepa, expNuevo, idCepa, muestrasDe, normalizarExp, resultadosUfc, seriesOd, seriesPorCepa, tieneOd, tieneUfc } from './modelo.js'
import { analizarTodos, clavePunto, preprocesar } from './motor/pipeline.js'
import { Globo, Icono } from './ui/base.jsx'
import { Cajon, CintaCtx } from './ui/cinta.jsx'
import { GraficoCtx } from './ui/guardarImagen.jsx'
import { PanelPersonalizar } from './ui/personalizar.jsx'
import { Revision } from './ui/revision.jsx'
import { descargarTexto, fs } from './utils.js'
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
import { Parametros } from './vistas/Parametros.jsx'
import { Combinado } from './vistas/Combinado.jsx'
import { Datos } from './vistas/Datos.jsx'
import { Metodos } from './vistas/Metodos.jsx'

const CLAVE = 'curvas-crecimiento-v2'
const CLAVE_TEMA = 'curvas-crecimiento-v2-tema-mesada'
const CLAVE_MENU = 'curvas-crecimiento-v2-menu-corto'
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }

const ICONOS = { resumen: 'nuevo', archivo: 'tecan', placa: 'placa', placas: 'tiempo', lecturas: 'cubeta', conteo: 'colonia', calidad: 'escudo', calidadUfc: 'escudo', curva: 'curva', curvaUfc: 'curva', combinado: 'combinar', parametros: 'sigma', datos: 'tabla', metodos: 'libro' }

// pestañas: [título, vista]
const PASOS = {
  resumen: ['Resumen', Resumen],
  archivo: ['Lecturas de OD', ArchivoTecan],
  placa: ['Pocillos', PlacaTecan],
  placas: ['Lecturas de OD', PlacasTiempo],
  lecturas: ['Lecturas de OD', Cubeta],
  conteo: ['Colonias', Conteo],
  calidad: ['Calidad OD', Calidad],
  calidadUfc: ['Calidad UFC', CalidadUfc],
  curva: ['Curva OD vs t', Curva],
  curvaUfc: ['Curva UFC vs t', CurvaUfc],
  combinado: ['OD + UFC', Combinado],
  parametros: ['Parámetros', Parametros],
  datos: ['Datos', Datos],
  metodos: ['Métodos', Metodos],
}
// Menús con submenús: OD (lecturas, calidad y curva) y Conteo (colonias, calidad y curva)
const GRUPOS = {
  od: { titulo: 'OD', icono: 'placa', hijos: ['archivo', 'placa', 'placas', 'lecturas', 'calidad', 'curva'] },
  conteo: { titulo: 'Conteo', icono: 'colonia', hijos: ['conteo', 'calidadUfc', 'curvaUfc'] },
}
const grupoDe = (id) => Object.keys(GRUPOS).find((g) => GRUPOS[g].hijos.includes(id))
export const TITULO_PASO = Object.fromEntries(Object.entries(PASOS).map(([k, v]) => [k, v[0]]))
export function pasosDe(e) {
  if (!e) return []
  const od = { tecan: ['archivo', 'placa'], placas: ['placas'], cubeta: ['lecturas'] }[e.origenOd] || []
  if (e.tipo === 'od') return ['resumen', ...od, 'calidad', 'curva', 'parametros', 'datos', 'metodos']
  if (e.tipo === 'ufc') return ['resumen', 'conteo', 'calidadUfc', 'curvaUfc', 'datos', 'metodos']
  return ['resumen', 'conteo', 'calidadUfc', 'curvaUfc', ...od, 'calidad', 'curva', 'combinado', 'parametros', 'datos', 'metodos']
}

const Logo = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <rect width="24" height="24" rx="6" fill="#EF9F27" />
    <path d="M5 18 C9 18 10 17 12 12 S16 6 20 6" fill="none" stroke="#412402" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

export default function App() {
  const [tema, setTema] = useState(() => leer(CLAVE_TEMA) || 'claro')
  const guardado = useMemo(() => leer(CLAVE), [])
  const [exp, setExp] = useState(null)
  const [paso, setPaso] = useState(null)
  const [archivoAbierto, setArchivoAbierto] = useState(false)   // pestaña «Archivo» (nuevo, abrir, guardar)
  const [asistente, setAsistente] = useState(false)
  const [avisos, setAvisos] = useState([])
  const [revisar, setRevisar] = useState(false)
  const [panelRev, setPanelRev] = useState(false)
  const [nodoCinta, setNodoCinta] = useState(null)
  const [menuCorto, setMenuCorto] = useState(() => leer(CLAVE_MENU) || false)
  const [gruposCerrados, setGruposCerrados] = useState([])
  const [persGraf, setPersGraf] = useState(null)   // gráfico abierto con clic derecho › Personalizar   // grupos del menú plegados a mano
  const archivoRef = useRef(null)          // el File del Tecan (para cambiar de hoja)
  const inputCargar = useRef()

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    try { localStorage.setItem(CLAVE_TEMA, JSON.stringify(tema)) } catch { /* sin almacenamiento */ }
  }, [tema])
  useEffect(() => { try { localStorage.setItem(CLAVE_MENU, JSON.stringify(menuCorto)) } catch { /* sin almacenamiento */ } }, [menuCorto])
  useEffect(() => {
    if (!exp) return
    const t = setTimeout(() => { try { localStorage.setItem(CLAVE, JSON.stringify({ fecha: new Date().toISOString(), exp })) } catch { /* sin espacio */ } }, 500)
    return () => clearTimeout(t)
  }, [exp])
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

  const pasos = pasosDe(exp)
  const pasoAct = pasos.includes(paso) ? paso : pasos[0]
  const irA = (p) => { setPaso(p); setArchivoAbierto(false); setAsistente(false); document.querySelector('.principal')?.scrollTo(0, 0) }

  // ---------- experimento ----------
  const abrir = (e, aviso, primero) => { setExp(e); setPaso(primero || 'resumen'); setAsistente(false); setArchivoAbierto(false); archivoRef.current = null; if (aviso) avisar(aviso) }
  const crear = (datos) => { const e = expNuevo(datos); abrir(e, `Experimento «${datos.nombre}» creado.`, pasosDe(e)[1]) }
  const guardar = () => {
    if (!exp) return
    descargarTexto(JSON.stringify({ tipo: 'curvas-de-crecimiento', ...exp, guardado: new Date().toISOString() }), `${exp.nombre.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '_')}.curvas.json`, 'application/json')
  }
  const cargarArchivo = async (file) => {
    try { abrir(normalizarExp(JSON.parse(await file.text())), `Experimento «${file.name}» cargado.`) } catch (e) { avisar(`No se pudo cargar: ${e.message}`, 'error') }
  }
  const continuar = () => { try { abrir(normalizarExp(guardado.exp), 'Experimento recuperado.') } catch (e) { avisar(e.message, 'error') } }

  const upd = useCallback((patch) => setExp((e) => (e ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)), [])
  const setAj = (k, v) => upd((e) => ({ aj: { ...e.aj, [k]: v } }))
  const setE = (f) => upd((e) => ({ E: f(e.E) }))

  // ---------- cálculo ----------
  const expD = useDeferredValue(exp)
  const serie = useMemo(() => (expD && tieneOd(expD) ? seriesOd(expD) : { datos: null, config: [], aj: expD?.aj || {}, avisos: [] }), [expD])
  const pre = useMemo(() => (serie.datos && serie.config.length ? preprocesar({ datos: serie.datos, config: serie.config, E: expD.E, aj: serie.aj, blancosSel: expD.blancosSel }) : null), [serie, expD])
  // placas por tiempo: la curva es por cepa (cada placa es un instante); en los demás orígenes, una curva por réplica
  const porCepa = expD?.origenOd === 'placas'
  const modoCurva = expD?.aj?.placas_curva || 'media'
  const res = useMemo(() => (pre && !pre.error
    ? (porCepa ? analizarPorCepa(pre.proc, serie.aj, expD.E.ventanas, modoCurva) : analizarTodos(pre.proc, serie.aj, expD.E.ventanas))
    : null), [pre, serie.aj, expD, porCepa, modoCurva])
  const seriesAn = useMemo(() => (pre && !pre.error ? (porCepa ? seriesPorCepa(pre.proc) : pre.proc.filter((w) => !w.EsBlanco)) : []), [pre, porCepa])
  const ufcRes = useMemo(() => (expD && tieneUfc(expD) ? resultadosUfc(expD) : null), [expD])
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
      if (f && f.marca) return { ...E, forzados: [...E.forzados, k] }
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
      case 'lecturas': return exp.manual.filas.length > 0
      case 'conteo': return exp.ufc.filas.length > 0
      case 'calidad': case 'curva': case 'parametros': return !!res?.length
      case 'calidadUfc': case 'curvaUfc': return !!ufcRes?.hay
      case 'combinado': return !!res?.length && !!ufcRes?.hay
      default: return false
    }
  }

  const s = {
    exp, upd, setAj, setE, avisar, irA, archivoRef, agregarCepa, guardar, pasos, listo, estiloGrafico, setEstiloGrafico, setColorCepa, restablecerColores,
    serie, pre, res, seriesAn, porCepa, modoCurva, ufcRes, muestras, colores, estilos, tema: TEMAS[tema],
    alternarPunto, alternarPocillo, reincorporarPocillo, setVentana, alternarLectura, restablecerLecturas,
  }

  // barra de estado
  const estado = (() => {
    if (!exp) return 'Sin experimento abierto'
    const usadas = new Set([...serie.config.filter((c) => !c.EsBlanco).map((c) => c.Muestra), ...(ufcRes?.reps || []).map((r) => r.Muestra)])
    const p = [TIPOS[exp.tipo].corto + (exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : ''), `${usadas.size} cepa${usadas.size === 1 ? '' : 's'}`]
    if (exp.origenOd === 'placas') { const l = serie.extra?.lecturas || []; p.push(`${exp.placas.length} tiempos`, `${l.filter((x) => x.Usado).length}/${l.length} lecturas aceptadas`) }
    if (res?.length) { const mu = res.map((r) => r.mu_max).filter(Number.isFinite); if (mu.length) p.push(`μmax medio ${fs(mu.reduce((a, b) => a + b, 0) / mu.length, 3)} h⁻¹`) }
    if (ufcRes?.hay) p.push(`${ufcRes.reps.filter((r) => r.Conteos > 0).length} conteos de UFC`)
    p.push('guardado en este navegador')
    return p.join(' · ')
  })()

  const enArchivo = archivoAbierto || !exp
  const Vista = exp && !asistente && !enArchivo ? PASOS[pasoAct][1] : null
  const pestanaActual = asistente ? 'Nuevo experimento' : enArchivo ? 'Archivo' : PASOS[pasoAct][0]

  return (
    <TemaCtx.Provider value={TEMAS[tema]}>
      <GraficoCtx.Provider value={{ abrirPersonalizar: exp ? setPersGraf : null }}><CintaCtx.Provider value={nodoCinta}>
        <div className="app">
          <header className="barra-titulo">
            <Logo /><b>Curvas de crecimiento</b>
            <span className="titulo-exp">{exp ? exp.nombre : ''}</span>
            <span className="espacio" />
            <button className={`titulo-boton ${panelRev ? 'on' : ''}`} onClick={() => setPanelRev(!panelRev)} data-tip={'Modo revisión\nMarcá zonas de la pantalla y comentá qué cambiarías'}>
              💬 Revisión
            </button>
            <button className="titulo-boton" onClick={() => setTema(tema === 'oscuro' ? 'claro' : 'oscuro')} data-tip="Cambiar entre tema claro y oscuro">
              <Icono n={tema === 'oscuro' ? 'sol' : 'luna'} size={15} />
            </button>
          </header>
          <div className="cuerpo-app">
          <nav className={`menu-lateral ${menuCorto ? 'corto' : ''}`}>
            <button className={`item-menu archivo ${enArchivo && !asistente ? 'on' : ''}`} onClick={() => { setArchivoAbierto(true); setAsistente(false) }} data-tip={menuCorto ? 'Archivo' : undefined}>
              <span className="ico"><Icono n="carpeta" size={18} /></span><span className="txt">Archivo</span>
            </button>
            {exp && <div className="sep-menu" />}
            {exp && (() => {
              const item = (id, sub) => (
                <button key={id} className={`item-menu ${sub ? 'sub' : ''} ${!enArchivo && !asistente && pasoAct === id ? 'on' : ''}`} onClick={() => irA(id)} data-tip={menuCorto ? PASOS[id][0] : undefined}>
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
            {asistente ? <Asistente onCrear={crear} onCancelar={() => setAsistente(false)} hayExperimento={!!exp} />
              : Vista ? <Vista s={s} key={exp.id + pasoAct} />
                : <Inicio onNuevo={() => setAsistente(true)} onCargar={() => inputCargar.current.click()} guardado={guardado} onContinuar={continuar}
                  exp={exp} onGuardar={guardar} onVolver={() => setArchivoAbierto(false)} />}
          </main>
          </div>
          </div>
          <footer className="barra-estado">{estado}</footer>
          <input ref={inputCargar} type="file" hidden accept=".json" onChange={(e) => { if (e.target.files[0]) cargarArchivo(e.target.files[0]); e.target.value = '' }} />
          <Revision pestana={pestanaActual} experimento={exp?.nombre} activo={revisar} setActivo={setRevisar} panel={panelRev} setPanel={setPanelRev} avisar={avisar} />
          <Globo />
          {exp && <Cajon titulo="Personalizar gráfico" abierto={!!persGraf} onClose={() => setPersGraf(null)}><PanelPersonalizar s={s} id={persGraf} /></Cajon>}
          <div className="toasts">{avisos.map((x) => <div key={x.id} className={`toast ${x.tipo}`}>{x.texto}</div>)}</div>
        </div>
      </CintaCtx.Provider></GraficoCtx.Provider>
    </TemaCtx.Provider>
  )
}
