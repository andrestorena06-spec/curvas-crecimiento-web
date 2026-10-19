import { useMemo, useState } from 'react'
import { ACEPTA_LIBRO, TEXTO_FORMATOS } from '../libro.js'
import { hojasDe, leerArchivo } from '../motor/lectura.js'
import { estadoVacio } from '../motor/pipeline.js'
import { Encabezado, Icono, Sel, Vacio, ZonaCarga } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { GrupoCamino } from '../ui/camino.jsx'
import { PlacaEditor, numerarReplicas } from '../ui/placa.jsx'
import { fx } from '../utils.js'

const UNIDADES = [['auto', 'Automática (según el encabezado)'], ['s', 'Segundos'], ['min', 'Minutos'], ['h', 'Horas']]

// ===============================================================
// Archivo del lector Tecan
// ===============================================================
export function ArchivoTecan({ s }) {
  const { exp, upd, avisar, archivoRef } = s
  const t = exp.tecan
  const [cargando, setCargando] = useState(false)

  const leer = async (file, hoja, unidad = t.archivo?.unidad || 'auto') => {
    setCargando(true)
    try {
      const { hojas } = await hojasDe(file)
      const orden = hoja ? [hoja] : hojas
      let r = null, usada = null, ultimo = null
      for (const h of orden) { try { r = await leerArchivo(file, h, unidad); usada = h; break } catch (e) { ultimo = e } }
      if (!r) throw ultimo || new Error('No encontré datos de absorbancia.')
      archivoRef.current = file
      upd((e) => ({
        tecan: { ...e.tecan, archivo: { nombre: file.name, hoja: usada, hojas, unidad }, datos: r.datos, preview: r.preview, config: e.tecan.config.filter((c) => r.datos.pocillos[c.Pocillo]) },
        E: estadoVacio(),
      }))
      avisar(`Leído: ${Object.keys(r.datos.pocillos).length} pocillos × ${r.datos.tiempos.length} mediciones (hoja «${usada}»).`)
    } catch (e) { avisar(`${file.name}: ${e.message}`, 'error') }
    setCargando(false)
  }
  const releer = (hoja, unidad) => {
    if (!archivoRef.current) return avisar('Para cambiar la hoja o la unidad, volvé a elegir el archivo (el navegador no lo conserva entre sesiones).', 'error')
    leer(archivoRef.current, hoja, unidad)
  }

  const d = t.datos
  const dur = d ? (d.tiempos[d.tiempos.length - 1] - d.tiempos[0]) / 3600 : 0
  const paso = d && d.tiempos.length > 1 ? (d.tiempos[1] - d.tiempos[0]) / 60 : NaN
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Archivo">
          <label className="cinta-boton" style={{ cursor: 'pointer' }}><Icono n="subir" size={20} /><span>{d ? 'Reemplazar Excel' : 'Cargar Excel'}</span>
            <input type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { if (e.target.files[0]) leer(e.target.files[0]); e.target.value = '' }} /></label>
        </Grupo>
        {d && (
          <Grupo titulo="Lectura">
            {t.archivo?.hojas?.length > 1 && <CampoCinta etiqueta="Hoja"><Sel value={t.archivo.hoja} onChange={(h) => releer(h, t.archivo.unidad)} opciones={t.archivo.hojas.map((h) => [h, h])} /></CampoCinta>}
            <CampoCinta etiqueta="Unidad de tiempo"><Sel value={t.archivo?.unidad || 'auto'} onChange={(u) => releer(t.archivo.hoja, u)} opciones={UNIDADES} /></CampoCinta>
          </Grupo>
        )}
        {d && <GrupoCamino s={s} />}
        <Grupo titulo="Siguiente"><BotonCinta icono="placa" texto="Definir pocillos" onClick={() => s.irA('placa')} deshabilitado={!d} /></Grupo>
      </Cinta>
      <Encabezado titulo="Archivo del lector" sub={`Excel exportado por el Tecan (o cualquier lector con cinética). Se aceptan ${TEXTO_FORMATOS}, incluidos los .xls viejos y los de LibreOffice.`} />
      <ZonaCarga acepta={ACEPTA_LIBRO} onArchivos={(f) => leer(f[0])} titulo={cargando ? 'Leyendo…' : d ? 'Reemplazar el archivo' : 'Elegí o soltá el Excel del lector'}
        texto="Formatos reconocidos: «Time [s]» en la columna A con los pocillos debajo, una fila con A1…H12 y una columna de tiempo, o bloques «T=…» con la matriz A–H." compacta={!!d} />
      {d && (
        <>
          <div className="grid-kpi" style={{ marginTop: 16 }}>
            <div className="kpi"><small>Archivo</small><b style={{ fontSize: 14 }}>{t.archivo?.nombre}</b></div>
            <div className="kpi"><small>Pocillos con datos</small><b>{Object.keys(d.pocillos).length}</b></div>
            <div className="kpi"><small>Mediciones por pocillo</small><b>{d.tiempos.length}</b></div>
            <div className="kpi"><small>Duración</small><b>{fx(dur, 2)} h</b></div>
            <div className="kpi"><small>Intervalo</small><b>{fx(paso, 1)} min</b></div>
          </div>
          <div className="tarjeta">
            <div className="fila fin" style={{ marginBottom: 12 }}>
              {t.archivo?.hojas?.length > 1 && (
                <label className="campo"><span>Hoja</span><Sel value={t.archivo.hoja} onChange={(h) => releer(h, t.archivo.unidad)} opciones={t.archivo.hojas.map((h) => [h, h])} /></label>
              )}
              <label className="campo"><span>Unidad de tiempo del archivo</span><Sel value={t.archivo?.unidad || 'auto'} onChange={(u) => releer(t.archivo.hoja, u)} opciones={UNIDADES} /></label>
              <span className="ayuda">Primeras filas del archivo, tal como se leyeron.</span>
            </div>
            <div className="tabla-scroll" style={{ maxHeight: 330 }}>
              <table className="tabla mono"><tbody>
                {t.preview?.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j}>{String(c).slice(0, 14)}</td>)}</tr>)}
              </tbody></table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ===============================================================
// Definición de los pocillos de la placa del Tecan
// ===============================================================
export const configDeLayout = (layout) => {
  const reps = numerarReplicas(layout)
  return Object.entries(layout).filter(([, l]) => l?.muestra).map(([p, l]) => ({ Pocillo: p, Muestra: l.muestra, Replica: reps[p], EsBlanco: !!l.blanco }))
}

export function PlacaTecan({ s }) {
  const { exp, upd } = s
  const d = exp.tecan.datos
  const layout = useMemo(() => Object.fromEntries(exp.tecan.config.map((c) => [c.Pocillo, { muestra: c.Muestra, blanco: c.EsBlanco }])), [exp.tecan.config])
  const disp = useMemo(() => new Set(Object.keys(d?.pocillos || {})), [d])
  const ultimos = useMemo(() => (d ? Object.fromEntries(Object.entries(d.pocillos).map(([p, v]) => [p, [...v].reverse().find(Number.isFinite)])) : {}), [d])
  if (!d) return <div className="pagina"><Vacio titulo="Todavía no hay datos" accion={<button className="primario" onClick={() => s.irA('archivo')}>Cargar el Excel</button>}>Primero cargá el archivo del lector.</Vacio></div>

  const asignar = (ps, v) => {
    const nuevo = { ...layout }
    ps.forEach((p) => { if (v) nuevo[p] = { muestra: v.muestra, blanco: v.blanco }; else delete nuevo[p] })
    upd((e) => ({ tecan: { ...e.tecan, config: configDeLayout(nuevo) } }))
  }
  const n = exp.tecan.config.length
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Placa">
          <BotonCinta icono="borrar" texto="Limpiar placa" peligro deshabilitado={!n} onClick={() => { if (window.confirm('Se borra la definición de todos los pocillos. ¿Continuar?')) upd((e) => ({ tecan: { ...e.tecan, config: [] } })) }} />
        </Grupo>
        <Grupo titulo="Selección">
          <BotonCinta simbolo="⇧" texto="Shift: sumar" tip={'Con Shift (o Ctrl) apretado, cada clic o arrastre suma pocillos salteados.\nAl soltar la tecla se abre la ventana para asignarlos.'} />
        </Grupo>
        <Grupo titulo="Siguiente"><BotonCinta icono="escudo" texto="Control de calidad" onClick={() => s.irA('calidad')} deshabilitado={!n} /></Grupo>
      </Cinta>
      <Encabezado titulo="Definir pocillos" sub="Asigná a cada pocillo su cepa (las réplicas se numeran solas) y marcá los blancos. Debajo de cada pocillo libre se ve la OD de la última lectura." />
      <div className="tarjeta">
        <PlacaEditor layout={layout} onAsignar={asignar} cepas={exp.cepas} colores={s.colores} disponibles={disp} valores={ultimos} onNuevaCepa={s.agregarCepa} />
      </div>
    </div>
  )
}
