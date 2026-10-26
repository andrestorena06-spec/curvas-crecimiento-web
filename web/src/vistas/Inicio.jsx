import { Icono } from '../ui/base.jsx'
import { BotonCinta, Cinta, Grupo } from '../ui/cinta.jsx'
import { TIPOS, ORIGENES } from '../modelo.js'

const fecha = (f) => { try { return new Date(f).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' } }

// Pestaña «Archivo»: empezar, abrir, guardar y retomar los experimentos recientes de este equipo
export function Inicio({ onNuevo, onCargar, exp, onGuardar, onGuardarComo, archivoExp, onVolver, recientes = [], onAbrirReciente, onBorrarReciente }) {
  const otros = recientes.filter((r) => r.exp?.id !== exp?.id)
  return (
    <div className="pagina inicio">
      <Cinta>
        <Grupo titulo="Experimento">
          <BotonCinta icono="nuevo" texto="Nuevo" onClick={onNuevo} tip="Empezar un experimento nuevo: elegís el tipo de curva y cómo mediste" />
          <BotonCinta icono="carpeta" texto="Abrir" onClick={onCargar} tip="Abrir un experimento guardado (.curvas.json)" />
          <BotonCinta icono="guardar" texto="Guardar" onClick={onGuardar} deshabilitado={!exp} tip={archivoExp ? `Guarda los cambios en «${archivoExp.nombre}» (Ctrl + S)` : 'Guarda el experimento en un archivo .curvas.json (Ctrl + S)'} />
          <BotonCinta icono="guardarComo" texto="Guardar como" onClick={onGuardarComo} deshabilitado={!exp} tip="Guarda una copia con otro nombre o en otra carpeta (Ctrl + Mayús + S)" />
        </Grupo>
        {exp && <Grupo titulo="Volver"><BotonCinta icono="flecha" texto="Al experimento" onClick={onVolver} /></Grupo>}
      </Cinta>

      <div className="portada">
        <div>
          <span className="etiqueta-seccion">Análisis de crecimiento bacteriano</span>
          <h1>Curvas de crecimiento</h1>
          <p className="sub">Densidad óptica (lector Tecan, placas leídas por tiempo o cubeta), recuento de UFC/mL o ambos.
            Todo se calcula en este equipo: los archivos no se envían a ningún lado.</p>
        </div>
        <div className="acciones-portada">
          <button className="accion-portada primaria" onClick={onNuevo}><Icono n="nuevo" size={22} /><b>Nuevo experimento</b><small>Elegís qué medir y cómo; el asistente arma los pasos.</small></button>
          <button className="accion-portada" onClick={onCargar}><Icono n="carpeta" size={22} /><b>Abrir un archivo</b><small>Un .curvas.json guardado antes, en esta u otra computadora.</small></button>
        </div>
      </div>

      {exp && (
        <section className="tarjeta ficha-abierta">
          <div className="cabeza-tarjeta"><span className="etiqueta-seccion">Experimento abierto</span></div>
          <div className="fila">
            <div style={{ flex: 1, minWidth: 220 }}>
              <h2 style={{ margin: '2px 0' }}>{exp.nombre}</h2>
              <span className="ayuda">{TIPOS[exp.tipo].titulo}{exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : ''}{archivoExp ? ` · archivo «${archivoExp.nombre}»` : ' · todavía sin archivo'}</span>
            </div>
            <button onClick={onGuardar}><Icono n="guardar" size={15} />{archivoExp ? 'Guardar' : 'Guardar archivo'}</button>
            <button className="primario" onClick={onVolver}>Seguir trabajando<Icono n="flecha" size={15} /></button>
          </div>
        </section>
      )}

      <section className="tarjeta">
        <div className="cabeza-tarjeta">
          <span className="etiqueta-seccion">Recientes en este equipo</span>
          <span className="ayuda">Se guardan solos mientras trabajás. Para llevarlos a otro equipo, usá «Guardar».</span>
        </div>
        {!otros.length ? <p className="ayuda" style={{ margin: '8px 0 0' }}>{exp ? 'No hay otros experimentos recientes.' : 'Todavía no hay experimentos recientes.'}</p> : (
          <div className="lista-recientes">
            {otros.map((r) => (
              <div key={r.exp.id} className="reciente">
                <button className="abrir-reciente" onClick={() => onAbrirReciente(r)}>
                  <Icono n={r.exp.tipo === 'ufc' ? 'colonia' : r.exp.tipo === 'od' ? 'curva' : 'combinar'} size={18} />
                  <span><b>{r.exp.nombre}</b><small>{TIPOS[r.exp.tipo]?.titulo}{r.exp.origenOd ? ` · ${ORIGENES[r.exp.origenOd]?.titulo}` : ''}{r.exp.cond?.organismo ? ` · ${r.exp.cond.organismo}` : ''}</small></span>
                  <small className="fecha-reciente">{fecha(r.fecha)}</small>
                </button>
                <button className="fantasma icono" aria-label="Quitar de recientes" data-tip="Quitar de la lista (no borra archivos guardados)" onClick={() => onBorrarReciente(r)}><Icono n="x" size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
