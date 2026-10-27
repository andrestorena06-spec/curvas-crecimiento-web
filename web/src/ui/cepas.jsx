// Selector de cepas visibles, el mismo arriba de todos los gráficos (Curva OD, Calidad UFC, Curva UFC, OD + UFC).
// Las cepas ocultas se guardan en el experimento y se ocultan en todos los gráficos a la vez (el análisis no cambia).
import { Icono } from './base.jsx'

export const cepasOcultas = (exp) => exp.aj.cepas_ocultas || []
export const setCepasOcultas = (s, lista) => s.upd((e) => ({ aj: { ...e.aj, cepas_ocultas: lista } }))

// extra(m, on): contenido opcional dentro de la ficha de cada cepa (por ejemplo, los botones de las réplicas)
// tip(m, on): texto al pasar el mouse sobre el nombre. hayMas: hay además réplicas ocultas (para «Mostrar todas»)
export function SelectorCepas({ s, muestras, extra, tip, hayMas = false, onMostrarTodas }) {
  const ocultas = cepasOcultas(s.exp)
  const alternar = (m, on) => setCepasOcultas(s, on ? [...ocultas, m] : ocultas.filter((x) => x !== m))
  const algunaOculta = muestras.some((m) => ocultas.includes(m))
  return (
    <div className="selector-cepas">
      {muestras.map((m) => {
        const on = !ocultas.includes(m)
        return (
          <div key={m} className={`chip-cepa ${on ? '' : 'apagado'}`}>
            <button className="nombre-cepa" onClick={() => alternar(m, on)} data-tip={tip ? tip(m, on) : `${m}\n${on ? 'Clic para ocultar la cepa' : 'Clic para mostrarla'}`}>
              <i className="punto" style={{ background: on ? s.colores[m] : 'var(--tenue)' }} />{m}
            </button>
            {extra && extra(m, on)}
          </div>
        )
      })}
      {(algunaOculta || hayMas) && <button className="fantasma chico" onClick={() => { setCepasOcultas(s, ocultas.filter((x) => !muestras.includes(x))); onMostrarTodas?.() }}><Icono n="refrescar" size={13} />Mostrar todas</button>}
    </div>
  )
}
