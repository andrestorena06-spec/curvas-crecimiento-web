// ============================================================
// Ficha «Cómo se calculó»: ventana emergente (centrada, no un panel lateral) con el paso a paso de un número.
//   <Valor f={() => ficha}>número</Valor> hace que un número abra su ficha con un clic (o un toque en el celular).
//   La ficha se arma recién al hacer clic (f es una función), así las tablas grandes no la calculan de antemano.
// ============================================================
import { createContext, useContext } from 'react'
import { Icono, Modal } from '../ui/base.jsx'
import { Esquema } from './esquemas.jsx'

export const FichaCtx = createContext(null)

export function Valor({ f, children, tip, className = '' }) {
  const abrir = useContext(FichaCtx)
  if (!abrir || !f) return children ?? null
  const ir = (ev) => { ev.stopPropagation(); const x = f(); if (x) abrir(x) }
  return (
    <span className={`calc ${className}`} role="button" tabIndex={0} data-tip={tip || 'Clic: cómo se calculó'} onClick={ir}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ir(ev) } }}>{children}</span>
  )
}

// fórmula o cuenta: texto y variables coloreadas (el mismo color es la misma variable en la fórmula y en la cuenta)
function Partes({ partes, cuenta }) {
  return (
    <div className={`ficha-formula ${cuenta ? 'cuenta' : ''}`}>
      {partes.map((p, i) => (typeof p === 'string'
        ? p.split('\n').map((l, j) => <span key={`${i}-${j}`}>{j > 0 && <br />}{l}</span>)
        : <span key={i} className={`var v${p.c}`}>{p.v}</span>))}
    </div>
  )
}

export function FichaCalculo({ ficha: f, onClose, onMetodos }) {
  return (
    <Modal titulo={<><span className="ficha-etq">Cómo se calculó ·</span>{f.titulo}</>} onClose={onClose} ancho={760}
      pie={<>
        {(f.ajustes || []).length > 0 && <span className="ficha-ajustes"><small>Ajustes usados:</small>{f.ajustes.map((a) => <span key={a} className="chip">{a}</span>)}</span>}
        <span className="espacio" />
        {f.metodos && onMetodos && <button className="fantasma" onClick={() => onMetodos(f.metodos)}>Ver en Métodos<Icono n="flecha" size={14} /></button>}
        <button className="primario" onClick={onClose}>Cerrar</button>
      </>}>
      <div className="ficha">
        <div className="ficha-cab">
          {f.sujeto && <small>{f.sujeto}</small>}
          <div className="ficha-valor">{f.valor}{f.unidad ? <span> {f.unidad}</span> : null}</div>
          {f.sub && <div className="ficha-sub">{f.sub}</div>}
          {f.que && <p className="ficha-que">{f.que}</p>}
        </div>
        <ol className="ficha-pasos">
          {f.pasos.map((p, i) => (
            <li key={i}>
              <span className="ficha-n">{i + 1}</span>
              <div className="ficha-paso">
                <b>{p.titulo}</b>
                {p.texto && <p>{p.texto}</p>}
                {p.formula && <Partes partes={p.formula} />}
                {p.cuenta && <Partes partes={p.cuenta} cuenta />}
                {p.esquema && <Esquema e={p.esquema} />}
                {p.nota && <p className="ficha-nota">{p.nota}</p>}
              </div>
            </li>
          ))}
        </ol>
        {(f.avisos || []).length > 0 && <div className="aviso-caja" style={{ marginTop: 14, marginBottom: 0 }}>{f.avisos.map((a, i) => <div key={i}>{a}</div>)}</div>}
        {f.nota && <p className="ayuda" style={{ marginTop: 10, marginBottom: 0 }}>{f.nota}</p>}
      </div>
    </Modal>
  )
}
