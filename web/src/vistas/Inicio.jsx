import { Icono } from '../ui/base.jsx'
import { BotonCinta, Cinta, Grupo } from '../ui/cinta.jsx'
import { IlusOD } from '../ui/ilustraciones.jsx'
import { TIPOS, ORIGENES } from '../modelo.js'

const Accion = ({ icono, titulo, texto, onClick, primaria }) => (
  <button className={`opcion ${primaria ? 'on' : ''}`} onClick={onClick}>
    <div className="txt" style={{ padding: '18px 18px 20px' }}>
      <Icono n={icono} size={24} style={{ color: 'var(--acento)', marginBottom: 8 }} />
      <b>{titulo}</b>
      <small>{texto}</small>
    </div>
  </button>
)

// Pestaña «Archivo»: empezar, abrir, guardar y continuar
export function Inicio({ onNuevo, onCargar, guardado, onContinuar, exp, onGuardar, onVolver }) {
  return (
    <div className="inicio">
      <Cinta>
        <Grupo titulo="Experimento">
          <BotonCinta icono="nuevo" texto="Nuevo" onClick={onNuevo} tip="Empezar un experimento nuevo: elegís el tipo de curva y cómo mediste" />
          <BotonCinta icono="carpeta" texto="Abrir" onClick={onCargar} tip="Abrir un experimento guardado (.curvas.json)" />
          <BotonCinta icono="guardar" texto="Guardar" onClick={onGuardar} deshabilitado={!exp} tip="Descarga un .curvas.json con todo el experimento" />
          {guardado?.exp && !exp && <BotonCinta icono="tiempo" texto="Continuar el último" onClick={onContinuar} tip={`${guardado.exp.nombre}\nGuardado en este navegador el ${new Date(guardado.fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}`} />}
        </Grupo>
        {exp && <Grupo titulo="Volver"><BotonCinta icono="flecha" texto="Al experimento" onClick={onVolver} /></Grupo>}
      </Cinta>
      <IlusOD />
      <h1>Curvas de crecimiento</h1>
      <p className="sub" style={{ fontSize: 15 }}>
        Análisis de crecimiento bacteriano por densidad óptica (lector Tecan, placas leídas por tiempo o cubeta), por conteo de UFC/mL o por ambos.
        Todo se calcula en este navegador: los archivos no se envían a ningún lado.
      </p>
      {exp && (
        <div className="mosaico" style={{ marginTop: 18 }}>
          <div className="fila">
            <div style={{ flex: 1 }}>
              <small className="ayuda">Experimento abierto</small>
              <h2 style={{ margin: '2px 0' }}>{exp.nombre}</h2>
              <span className="ayuda">{TIPOS[exp.tipo].titulo}{exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : ''}</span>
            </div>
          </div>
        </div>
      )}
      {!exp && <p className="ayuda" style={{ marginTop: 16 }}>Usá los botones de arriba: <strong>Nuevo</strong> para empezar{guardado?.exp ? <>, <strong>Continuar el último</strong> para seguir con «{guardado.exp.nombre}»</> : ''} o <strong>Abrir</strong> para cargar un experimento guardado.</p>}
    </div>
  )
}
