// Pestaña «Resumen»: tablero de mosaicos con el estado de todo el experimento; cada mosaico lleva a su pestaña
import { useMemo } from 'react'
import { finito } from '../motor/analisis.js'
import { TIPOS, ORIGENES } from '../modelo.js'
import { useTema } from '../tema.js'
import { Icono } from '../ui/base.jsx'
import { BotonCinta, Cinta, Grupo, Mosaico } from '../ui/cinta.jsx'
import { Grafico } from '../ui/grafico.jsx'
import { fs, fx, sciCorto } from '../utils.js'
import { mediaPorTiempo } from './Curva.jsx'

export function Resumen({ s }) {
  const T = useTema()
  const { exp, res, ufcRes, pre, serie } = s
  const od = exp.tipo !== 'ufc', ufc = exp.tipo !== 'od'
  const pasoDatos = s.pasos.find((p) => ['archivo', 'placas', 'lecturas', 'conteo'].includes(p))

  const seriesOd = useMemo(() => {
    if (!pre || pre.error) return []
    const ws = pre.proc.filter((w) => !w.EsBlanco)
    return [...new Set(ws.map((w) => w.Muestra))].map((m) => ({
      id: m, nombre: m, color: s.colores[m], ancho: 2.4, banda: exp.origenOd === 'tecan',
      data: mediaPorTiempo(ws.filter((w) => w.Muestra === m), (v) => v, 'sd').map((q) => ({ x: q.t / 3600, y: q.m, lo: q.lo, hi: q.hi, tip: `${m}\nt = ${fx(q.t / 3600, 2)} h\nOD = ${fx(q.m, 3)}` })),
    }))
  }, [pre, s.colores, exp.origenOd])
  const seriesUfc = useMemo(() => (ufcRes?.hay ? [...new Set(ufcRes.res.map((r) => r.Muestra))].map((m) => ({
    id: m, nombre: m, color: s.colores[m], puntos: true, forma: 'cuadrado', radio: 3.5, ancho: 1.8,
    data: ufcRes.res.filter((r) => r.Muestra === m && finito(r.log10)).sort((a, b) => a.T_h - b.T_h).map((r) => ({ x: r.T_h, y: r.log10, tip: `${m} · T = ${r.T_h} h\n${sciCorto(r.UFC_mL)} UFC/mL` })),
  })) : []), [ufcRes, s.colores])

  // control de calidad
  const lect = serie.extra?.lecturas || []
  const qc = exp.origenOd === 'placas'
    ? { total: lect.length, ok: lect.filter((l) => l.Usado).length, sosp: lect.filter((l) => l.Sospechoso && l.Usado).length, txt: 'lecturas aceptadas' }
    : pre && !pre.error ? { total: pre.marcado.reduce((n, w) => n + w.filas.length, 0), ok: pre.marcado.reduce((n, w) => n + w.filas.filter((f) => !f.motivo).length, 0), sosp: pre.qc.filter((q) => ['Sospechoso', 'Divergentes'].includes(q.Categoria)).length, txt: 'puntos en el análisis' } : null
  const muPorCepa = (res || []).reduce((acc, r) => { if (finito(r.mu_max)) (acc[r.Muestra] ||= []).push(r.mu_max); return acc }, {})
  const muMax = Math.max(0.01, ...Object.values(muPorCepa).map((v) => v.reduce((a, b) => a + b, 0) / v.length))

  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Experimento">
          <BotonCinta icono="guardar" texto="Guardar" onClick={s.guardar} tip="Descarga un .curvas.json con todo el experimento" />
        </Grupo>
        <Grupo titulo="Exportar">
          <BotonCinta icono="tabla" texto="Excel" onClick={() => s.irA('datos')} tip="Ir a Datos para descargar el Excel completo" />
          <BotonCinta icono="libro" texto="Métodos" onClick={() => s.irA('metodos')} />
          <BotonCinta icono="imprimir" texto="Imprimir" onClick={() => window.print()} />
        </Grupo>
        <Grupo titulo="Ir a">
          {pasoDatos && <BotonCinta icono={{ archivo: 'tecan', placas: 'placa', lecturas: 'cubeta', conteo: 'colonia' }[pasoDatos]} texto="Datos de entrada" onClick={() => s.irA(pasoDatos)} />}
          {od && <BotonCinta icono="escudo" texto="Calidad" onClick={() => s.irA('calidad')} />}
          {od && <BotonCinta icono="curva" texto="Curva" onClick={() => s.irA('curva')} />}
          {od && <BotonCinta icono="sigma" texto="Parámetros" onClick={() => s.irA('parametros')} />}
        </Grupo>
      </Cinta>

      <div className="encabezado">
        <div>
          <h1>{exp.nombre}</h1>
          <p className="sub">{[exp.cond.organismo, exp.cond.medio, exp.cond.temperatura && `${exp.cond.temperatura} °C`, TIPOS[exp.tipo].titulo + (exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : ''), exp.cond.fecha].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <div className="tablero">
        {od && (
          <Mosaico titulo="Curva de crecimiento" accion="Curva" onAccion={() => s.irA('curva')} className="m-grande">
            {seriesOd.length ? <Grafico series={seriesOd} yTxt="OD (media)" alto={330} ancho={760} exportar={false} nombre="resumen_curva" />
              : <p className="ayuda">{pre?.error || 'Todavía no hay curvas: cargá los datos y definí las cepas.'}</p>}
          </Mosaico>
        )}
        {od && (
          <Mosaico titulo="Control de calidad" accion="Calidad" onAccion={() => s.irA('calidad')}>
            {qc ? (<>
              <div className="cifra"><b>{qc.total - qc.ok}</b><span>fuera del análisis</span></div>
              <div className="barra-prog"><i style={{ width: `${(100 * qc.ok) / Math.max(qc.total, 1)}%` }} /></div>
              <p className="ayuda">{qc.ok} de {qc.total} {qc.txt}{qc.sosp ? ` · ${qc.sosp} para revisar` : ''}</p>
            </>) : <p className="ayuda">Sin datos todavía.</p>}
          </Mosaico>
        )}
        {pasoDatos && (
          <Mosaico titulo={{ archivo: 'Archivo del lector', placas: 'Placas', lecturas: 'Lecturas en cubeta', conteo: 'Conteos' }[pasoDatos]} accion="Abrir" onAccion={() => s.irA(pasoDatos)}>
            {pasoDatos === 'placas' ? (
              <div className="mini-placas">{[...exp.placas].sort((a, b) => a.t - b.t).map((p) => (
                <button key={p.id} className="mini-placa" onClick={() => s.irA('placas')} data-tip={`t = ${p.t} h\n${p.archivo?.nombre || 'sin Excel'}`}>
                  <b>{fx(p.t, p.t % 1 ? 1 : 0)} h</b><small>{p.valores ? '✓' : '—'}</small>
                </button>
              ))}{!exp.placas.length && <p className="ayuda">Sin placas todavía.</p>}</div>
            ) : pasoDatos === 'archivo' ? (
              <p>{exp.tecan.archivo ? <><Icono n="archivo" size={15} style={{ verticalAlign: -3 }} /> {exp.tecan.archivo.nombre}<br /><span className="ayuda">{Object.keys(exp.tecan.datos?.pocillos || {}).length} pocillos · {exp.tecan.datos?.tiempos.length} lecturas · {exp.tecan.config.length} definidos</span></> : <span className="ayuda">Todavía no cargaste el Excel.</span>}</p>
            ) : pasoDatos === 'lecturas' ? (
              <div className="cifra"><b>{exp.manual.filas.length}</b><span>lecturas cargadas</span></div>
            ) : (
              <div className="cifra"><b>{exp.ufc.filas.length}</b><span>réplicas con conteo</span></div>
            )}
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
            {Object.keys(muPorCepa).length > 0 && <p className="ayuda" style={{ marginTop: 6 }}>h⁻¹ · td = ln 2 / μmax</p>}
          </Mosaico>
        )}
        {ufc && (
          <Mosaico titulo="Curva UFC" accion={exp.tipo === 'odufc' ? 'OD + UFC' : 'Curva UFC'} onAccion={() => s.irA(exp.tipo === 'odufc' ? 'combinado' : 'curvaUfc')} className={od ? '' : 'm-grande'}>
            {seriesUfc.length ? <Grafico series={seriesUfc} yTxt="log₁₀ UFC/mL" alto={od ? 230 : 330} ancho={od ? 520 : 760} exportar={false} nombre="resumen_ufc" leyenda={!od} />
              : <p className="ayuda">Todavía no hay conteos.</p>}
          </Mosaico>
        )}
        <Mosaico titulo="Datos y métodos" accion="Métodos" onAccion={() => s.irA('metodos')}>
          <div className="lista-enlaces">
            <button className="fantasma" onClick={() => s.irA('datos')}><Icono n="tabla" size={16} />Tablas y Excel completo</button>
            <button className="fantasma" onClick={() => s.irA('metodos')}><Icono n="libro" size={16} />Métodos y texto para el informe</button>
            <button className="fantasma" onClick={s.guardar}><Icono n="guardar" size={16} />Guardar el experimento</button>
          </div>
        </Mosaico>
      </div>
      {T && null}
    </div>
  )
}
