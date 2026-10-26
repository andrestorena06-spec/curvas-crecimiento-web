// Pestaña «Resumen»: panel del experimento. Ficha con las condiciones, avance de los pasos, lo que conviene revisar
// (con un enlace a cada lugar) y los resultados principales. Cada mosaico lleva a su pestaña.
import { useMemo, useState } from 'react'
import { finito } from '../motor/analisis.js'
import { curvaSuaveUfc } from '../motor/ufc.js'
import { TIPOS, ORIGENES, filasConConteo, filasConOd } from '../modelo.js'
import { Icono } from '../ui/base.jsx'
import { BotonCinta, Cinta, Grupo, Mosaico } from '../ui/cinta.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, sciCorto } from '../utils.js'
import { mediaPorTiempo } from './Curva.jsx'
import { descargarExcel } from './Datos.jsx'
import { EditarExperimento } from './EditarExperimento.jsx'

const NOMBRE_PASO = { archivo: 'Lecturas de OD', placa: 'Pocillos', placas: 'Lecturas de OD', lecturas: 'Lecturas de OD', conteo: 'Colonias', calidad: 'Calidad OD', calidadUfc: 'Calidad UFC', curva: 'Curva OD vs t', curvaUfc: 'Curva UFC vs t', combinado: 'OD + UFC', parametros: 'Parámetros' }

// Lo que conviene revisar antes de dar el análisis por terminado: [{ nivel: 'aviso' | 'info', texto, ir }]
function pendientes(s) {
  const { exp, pre, res, ufcRes, serie } = s
  const out = []
  const od = exp.tipo !== 'ufc', ufc = exp.tipo !== 'od'
  if (od) {
    if (exp.origenOd === 'tecan' && !exp.tecan.datos) out.push({ nivel: 'aviso', texto: 'Falta cargar el Excel del lector.', ir: 'archivo' })
    else if (exp.origenOd === 'tecan' && !exp.tecan.config.length) out.push({ nivel: 'aviso', texto: 'Falta definir qué cepa hay en cada pocillo.', ir: 'placa' })
    if (exp.origenOd === 'tecan' && exp.tecan.datos && exp.tecan.config.length && !exp.tecan.config.some((c) => c.EsBlanco) && exp.aj.corregir_blanco) out.push({ nivel: 'aviso', texto: 'No hay pocillos de blanco: no se puede restar el blanco.', ir: 'placa' })
    if (exp.origenOd === 'placas') {
      const sin = exp.placas.filter((p) => !p.valores && !p.oculta)
      if (!exp.placas.length) out.push({ nivel: 'aviso', texto: 'Todavía no hay placas (tiempos).', ir: 'placas' })
      if (sin.length) out.push({ nivel: 'aviso', texto: `${sin.length} placa${sin.length > 1 ? 's' : ''} sin Excel: t = ${sin.map((p) => p.t).sort((a, b) => a - b).join(', ')} h.`, ir: 'placas' })
      const ocultas = exp.placas.filter((p) => p.oculta)
      if (ocultas.length) out.push({ nivel: 'info', texto: `${ocultas.length} placa${ocultas.length > 1 ? 's' : ''} oculta${ocultas.length > 1 ? 's' : ''} (no entra${ocultas.length > 1 ? 'n' : ''} en la curva).`, ir: 'placas' })
    }
    if (exp.origenOd === 'cubeta' && !filasConOd(exp).length) out.push({ nivel: 'aviso', texto: exp.manual.filas.length ? `Todavía no hay lecturas de OD: las ${exp.manual.filas.length} filas están vacías.` : 'Todavía no hay lecturas cargadas.', ir: 'lecturas' })
    ;(serie.avisos || []).forEach((a) => out.push({ nivel: 'aviso', texto: a, ir: 'calidad' }))
    if (pre?.error) out.push({ nivel: 'aviso', texto: pre.error, ir: 'calidad' })
    const fuera = exp.origenOd === 'placas' ? (serie.extra?.lecturas || []).filter((l) => !l.Usado).length : pre && !pre.error ? pre.marcado.reduce((n, w) => n + w.filas.filter((f) => f.motivo).length, 0) : 0
    if (fuera) out.push({ nivel: 'info', texto: `${fuera} lectura${fuera > 1 ? 's' : ''} de OD fuera del análisis (test de atípicos o a mano).`, ir: 'calidad' })
    const conAviso = (res || []).filter((r) => r.aviso)
    if (conAviso.length) out.push({ nivel: 'info', texto: `${conAviso.length} curva${conAviso.length > 1 ? 's' : ''} con avisos en los parámetros (por ejemplo, pocos puntos o R² bajo).`, ir: 'parametros' })
  }
  if (ufc) {
    if (!filasConConteo(exp).length) out.push({ nivel: 'aviso', texto: exp.ufc.filas.length ? `Todavía no hay conteos de colonias: las ${exp.ufc.filas.length} filas están vacías.` : 'Todavía no hay conteos de colonias.', ir: 'conteo' })
    if (ufcRes?.hay) {
      const incoh = ufcRes.reps.filter((r) => r._aj?.malos?.length).length
      if (incoh) out.push({ nivel: 'aviso', texto: `${incoh} réplica${incoh > 1 ? 's' : ''} con diluciones que no coinciden con lo esperado.`, ir: 'conteo' })
      const sinDil = ufcRes.reps.filter((r) => r._estado === 'sin_dilucion').length
      if (sinDil) out.push({ nivel: 'aviso', texto: `${sinDil} réplica${sinDil > 1 ? 's' : ''} sin conteo en la dilución elegida para su cepa.`, ir: 'conteo' })
      const est = ufcRes.reps.filter((r) => ['bajo', 'alto'].includes(r._estado)).length
      if (est) out.push({ nivel: 'info', texto: `${est} réplica${est > 1 ? 's' : ''} estimada${est > 1 ? 's' : ''} fuera del rango contable.`, ir: 'calidadUfc' })
      if (ufcRes.fuera.size) out.push({ nivel: 'info', texto: `${ufcRes.fuera.size} réplica${ufcRes.fuera.size > 1 ? 's' : ''} de UFC fuera de la media (test o a mano).`, ir: 'calidadUfc' })
    }
  }
  return out
}

export function Resumen({ s }) {
  const { exp, res, ufcRes, pre, serie } = s
  const [editar, setEditar] = useState(false)
  const od = exp.tipo !== 'ufc', ufc = exp.tipo !== 'od'
  const pasoDatos = s.pasos.find((p) => ['archivo', 'placas', 'lecturas', 'conteo'].includes(p))
  const metodoSuave = exp.aj.ufc_suave === false ? null : exp.aj.ufc_suave === true || exp.aj.ufc_suave === undefined ? 'baranyi' : exp.aj.ufc_suave

  const seriesOd = useMemo(() => {
    if (!pre || pre.error) return []
    const ws = pre.proc.filter((w) => !w.EsBlanco)
    return [...new Set(ws.map((w) => w.Muestra))].map((m) => ({
      id: m, nombre: m, color: s.colores[m], ancho: 2.2, banda: exp.origenOd === 'tecan', puntos: exp.origenOd !== 'tecan', radio: 2.6,
      data: mediaPorTiempo(ws.filter((w) => w.Muestra === m), (v) => v, 'sd').map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, tip: `${m}\nt = ${fx(q.t / 3600, 2)} h\nOD = ${fx(q.m, 3)}` })),
    }))
  }, [pre, s.colores, exp.origenOd])
  const seriesUfc = useMemo(() => {
    if (!ufcRes?.hay) return []
    return [...new Set(ufcRes.res.map((r) => r.Muestra))].flatMap((m) => {
      const filas = ufcRes.res.filter((r) => r.Muestra === m && finito(r.log10)).sort((a, b) => a.T_h - b.T_h)
      const puntos = { id: m, nombre: m, color: s.colores[m], linea: false, puntos: true, forma: 'cuadrado', radio: 3.5, data: filas.map((r) => ({ x: r.T_h, y: r.log10, tip: `${m} · T = ${r.T_h} h\n${sciCorto(r.UFC_mL)} UFC/mL` })) }
      const cs = metodoSuave ? curvaSuaveUfc(filas, metodoSuave) : null
      return cs?.ok ? [{ id: 'sv' + m, nombre: '', color: s.colores[m], ancho: 1.6, data: cs.puntos }, puntos] : [puntos]
    })
  }, [ufcRes, s.colores, metodoSuave])

  const pend = pendientes(s)
  const pasosTrabajo = s.pasos.filter((p) => NOMBRE_PASO[p])
  const hechos = pasosTrabajo.filter((p) => s.listo(p)).length
  const proximo = pasosTrabajo.find((p) => !s.listo(p))
  const muPorCepa = (res || []).reduce((acc, r) => { if (finito(r.mu_max)) (acc[r.Muestra] ||= []).push(r.mu_max); return acc }, {})
  const muMax = Math.max(0.01, ...Object.values(muPorCepa).map((v) => v.reduce((a, b) => a + b, 0) / v.length))
  const c = exp.cond
  const ficha = [
    ['Organismo', c.organismo], ['Medio', c.medio], ['Temperatura', c.temperatura !== '' && c.temperatura !== undefined ? `${c.temperatura} °C` : ''],
    ...(od ? [['Longitud de onda', c.lambda ? `${c.lambda} nm` : '']] : []), ['Fecha', c.fecha], ['Equipo', c.equipo],
    ['Medición', TIPOS[exp.tipo].titulo + (exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : '')],
  ]

  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Experimento">
          <BotonCinta icono="guardar" texto="Guardar" onClick={s.guardar} tip={s.archivoExp ? `Guarda los cambios en «${s.archivoExp.nombre}» (Ctrl + S)` : 'Guarda el experimento en un archivo .curvas.json (Ctrl + S)'} />
          <BotonCinta icono="guardarComo" texto="Guardar como" onClick={s.guardarComo} tip="Guarda una copia con otro nombre o en otra carpeta (Ctrl + Mayús + S)" />
          <BotonCinta icono="editar" texto="Datos del experimento" onClick={() => setEditar(true)} tip="Nombre, condiciones, notas y cepas (renombrar o agregar)" />
        </Grupo>
        <Grupo titulo="Exportar">
          <BotonCinta icono="tabla" texto="Excel completo" onClick={() => descargarExcel(s)} tip="Todas las tablas del análisis, una por hoja, con las condiciones y los ajustes" />
          <BotonCinta icono="imprimir" texto="Imprimir" onClick={() => window.print()} />
        </Grupo>
        {proximo && <Grupo titulo="Siguiente"><BotonCinta icono="flecha" texto={NOMBRE_PASO[proximo]} onClick={() => s.irA(proximo)} tip="Primer paso que falta completar" /></Grupo>}
      </Cinta>
      {editar && <EditarExperimento s={s} onClose={() => setEditar(false)} />}

      <section className="ficha-exp">
        <div className="ficha-titulo">
          <span className="etiqueta-seccion">Experimento</span>
          <h1>{exp.nombre}</h1>
          {c.notas && <p className="ayuda" style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>{c.notas}</p>}
        </div>
        <dl className="ficha-datos">
          {ficha.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="tenue">—</span>}</dd></div>)}
          <div><dt>Cepas</dt><dd className="ficha-cepas">{s.muestras.length ? s.muestras.map((m) => <span key={m}><i className="punto" style={{ background: s.colores[m] }} />{m}</span>) : <span className="tenue">—</span>}</dd></div>
        </dl>
        <button className="fantasma chico ficha-editar" onClick={() => setEditar(true)}><Icono n="editar" size={14} />Editar</button>
      </section>

      <div className="tablero">
        <Mosaico titulo="Avance del análisis" className="m-avance">
          <div className="barra-prog"><i style={{ width: `${(100 * hechos) / Math.max(pasosTrabajo.length, 1)}%` }} /></div>
          <p className="ayuda" style={{ margin: '6px 0 10px' }}>{hechos} de {pasosTrabajo.length} pasos con datos</p>
          <ol className="lista-pasos">
            {pasosTrabajo.map((p) => (
              <li key={p} className={s.listo(p) ? 'hecho' : p === proximo ? 'proximo' : ''}>
                <button className="fantasma" onClick={() => s.irA(p)}>
                  <span className="marca-paso">{s.listo(p) ? <Icono n="check" size={12} ancho={3} /> : null}</span>{NOMBRE_PASO[p]}
                  {p === proximo && <span className="chip acento" style={{ marginLeft: 'auto' }}>siguiente</span>}
                </button>
              </li>
            ))}
          </ol>
        </Mosaico>

        <Mosaico titulo={`Para revisar${pend.length ? ` (${pend.length})` : ''}`} className="m-pendientes">
          {!pend.length ? <p className="todo-bien"><Icono n="check" size={16} ancho={3} />No hay nada pendiente.</p> : (
            <ul className="lista-pendientes">
              {pend.map((x, i) => (
                <li key={i} className={x.nivel}>
                  <span className="icono-pend">{x.nivel === 'aviso' ? '!' : 'i'}</span>
                  <span className="texto-pend">{x.texto}</span>
                  {x.ir && s.pasos.includes(x.ir) && <button className="fantasma chico" onClick={() => s.irA(x.ir)}>{NOMBRE_PASO[x.ir]}<Icono n="flecha" size={12} /></button>}
                </li>
              ))}
            </ul>
          )}
        </Mosaico>

        {od && (
          <Mosaico titulo="Curva OD vs t" accion="Abrir" onAccion={() => s.irA('curva')} className="m-grande">
            {seriesOd.length ? <Grafico series={seriesOd} yTxt="OD (media)" alto={300} exportar={false} nombre="resumen_curva" />
              : <p className="ayuda">{pre?.error || 'Todavía no hay curvas: cargá las lecturas y definí las cepas.'}</p>}
          </Mosaico>
        )}
        {od && (
          <Mosaico titulo="μmax por cepa" accion="Parámetros" onAccion={() => s.irA('parametros')}>
            {Object.keys(muPorCepa).length ? Object.entries(muPorCepa).map(([m, v]) => {
              const mu = v.reduce((a, b) => a + b, 0) / v.length
              return (
                <div key={m} className="barra-cepa">
                  <span>{m}</span>
                  <div><i style={{ width: `${(100 * mu) / muMax}%`, background: s.colores[m] }} /></div>
                  <b>{fs(mu, 3)}</b>
                </div>
              )
            }) : <p className="ayuda">Sin parámetros todavía.</p>}
            {Object.keys(muPorCepa).length > 0 && <p className="ayuda" style={{ marginTop: 6 }}>μmax en h⁻¹; tiempo de duplicación = ln 2 / μmax.</p>}
          </Mosaico>
        )}
        {ufc && (
          <Mosaico titulo="Curva UFC vs t" accion="Abrir" onAccion={() => s.irA('curvaUfc')} className={od ? '' : 'm-grande'}>
            {seriesUfc.length ? <Grafico series={seriesUfc} yTxt="log₁₀ UFC/mL" alto={od ? 240 : 300} exportar={false} nombre="resumen_ufc" leyenda={!od} />
              : <p className="ayuda">Todavía no hay conteos.</p>}
          </Mosaico>
        )}
        {pasoDatos && (
          <Mosaico titulo={NOMBRE_PASO[pasoDatos]} accion="Abrir" onAccion={() => s.irA(pasoDatos)}>
            {pasoDatos === 'placas' ? (
              <div className="mini-placas">{[...exp.placas].sort((a, b) => a.t - b.t).map((p) => (
                <button key={p.id} className={`mini-placa ${p.oculta ? 'oculta' : ''}`} onClick={() => s.irA('placas')} data-tip={`t = ${p.t} h\n${p.archivo?.nombre || 'sin Excel'}${p.oculta ? '\nOculta' : ''}`}>
                  <b>{fx(p.t, p.t % 1 ? 1 : 0)} h</b><small>{p.valores ? '✓' : '—'}</small>
                </button>
              ))}{!exp.placas.length && <p className="ayuda">Sin placas todavía.</p>}</div>
            ) : pasoDatos === 'archivo' ? (
              <p>{exp.tecan.archivo ? <><Icono n="archivo" size={15} style={{ verticalAlign: -3 }} /> {exp.tecan.archivo.nombre}<br /><span className="ayuda">{Object.keys(exp.tecan.datos?.pocillos || {}).length} pocillos · {exp.tecan.datos?.tiempos.length} lecturas · {exp.tecan.config.length} definidos</span></> : <span className="ayuda">Todavía no cargaste el Excel.</span>}</p>
            ) : pasoDatos === 'lecturas' ? (
              <div className="cifra"><b>{filasConOd(exp).length}</b><span>lecturas cargadas{filasConOd(exp).length < exp.manual.filas.length ? ` de ${exp.manual.filas.length} filas` : ''}</span></div>
            ) : (
              <div className="cifra"><b>{filasConConteo(exp).length}</b><span>réplicas con conteo{filasConConteo(exp).length < exp.ufc.filas.length ? ` de ${exp.ufc.filas.length} filas` : ''}</span></div>
            )}
          </Mosaico>
        )}
      </div>
    </div>
  )
}
