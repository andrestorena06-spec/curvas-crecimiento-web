// Modo revisión: marcar zonas de la pantalla con comentarios, para pasárselos a quien modifica el programa.
// Cada comentario guarda la pestaña, el rectángulo (en % de la ventana y en píxeles de la página),
// el texto que había debajo y el título de la sección. Se exportan como Markdown (copiar o descargar).
import { useEffect, useRef, useState } from 'react'
import { descargarTexto } from '../utils.js'
import { Icono } from './base.jsx'

const CLAVE = 'curvas-crecimiento-v2-revision'
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || [] } catch { return [] } }

function contextoDe(x, y, w, h) {
  const els = document.elementsFromPoint(x + w / 2, y + h / 2).filter((e) => !e.closest('.revision-capa, .revision-panel, .revision-pin'))
  const el = els.find((e) => (e.innerText || e.textContent || '').trim()) || els[0]
  const texto = (el?.innerText || el?.textContent || el?.getAttribute?.('data-tip') || '').trim().replace(/\s+/g, ' ').slice(0, 160)
  const sec = el?.closest?.('.mosaico, .tarjeta, .modal, .cinta-grupo, .cajon')
  const titulo = sec?.querySelector?.('h2, h3, h4, .cinta-titulo, header b')?.innerText?.trim() || ''
  const tip = el?.closest?.('[data-tip]')?.getAttribute('data-tip')?.split('\n')[0] || ''
  return { texto, seccion: titulo, tip, etiqueta: el?.tagName?.toLowerCase() || '' }
}

export function Revision({ pestana, experimento, activo, setActivo, panel, setPanel, avisar }) {
  const [com, setCom] = useState(leer)
  const [ini, setIni] = useState(null)
  const [act, setAct] = useState(null)
  const [nuevo, setNuevo] = useState(null)
  const [scroll, setScroll] = useState(0)
  const texto = useRef()
  useEffect(() => { try { localStorage.setItem(CLAVE, JSON.stringify(com)) } catch { /* sin almacenamiento */ } }, [com])
  useEffect(() => {
    const p = document.querySelector('.principal')
    if (!p) return
    const f = () => setScroll(p.scrollTop)
    p.addEventListener('scroll', f)
    return () => p.removeEventListener('scroll', f)
  })
  useEffect(() => { if (nuevo) setTimeout(() => texto.current?.focus(), 30) }, [nuevo])

  const terminar = () => {
    if (!ini || !act) return
    let x = Math.min(ini.x, act.x), y = Math.min(ini.y, act.y), w = Math.abs(act.x - ini.x), h = Math.abs(act.y - ini.y)
    if (w < 8 && h < 8) { x -= 20; y -= 14; w = 40; h = 28 }
    const pScroll = document.querySelector('.principal')?.scrollTop || 0
    setNuevo({ x, y, w, h, pScroll, ctx: contextoDe(x, y, w, h), texto: '' })
    setIni(null); setAct(null)
  }
  const guardar = () => {
    if (!nuevo.texto.trim()) return setNuevo(null)
    const n = (com.reduce((m, c) => Math.max(m, c.n), 0) || 0) + 1
    const W = window.innerWidth, H = window.innerHeight
    setCom([...com, { n, pestana, fecha: new Date().toISOString(), x: nuevo.x, y: nuevo.y + nuevo.pScroll, w: nuevo.w, h: nuevo.h,
      pct: { x: Math.round((nuevo.x / W) * 100), y: Math.round((nuevo.y / H) * 100), w: Math.round((nuevo.w / W) * 100), h: Math.round((nuevo.h / H) * 100) },
      ventana: `${W}×${H}`, ...nuevo.ctx, comentario: nuevo.texto.trim() }])
    setNuevo(null)
    avisar?.(`Comentario ${n} guardado.`)
  }
  const markdown = () => [
    `# Comentarios de revisión · Curvas de crecimiento`,
    `Experimento: ${experimento || '(ninguno)'} · ${new Date().toLocaleString('es')} · ${com.length} comentario(s)`, '',
    ...com.map((c) => [
      `## ${c.n}. Pestaña «${c.pestana}»`,
      `- **Comentario:** ${c.comentario}`,
      `- Zona: desde ${c.pct.x} % del ancho y ${c.pct.y} % del alto, de ${c.pct.w} % × ${c.pct.h} % (ventana ${c.ventana})`,
      c.seccion && `- Sección: ${c.seccion}`,
      c.texto && `- Texto debajo: «${c.texto}»`,
      c.tip && `- Ayuda del elemento: «${c.tip}»`, '',
    ].filter(Boolean).join('\n')),
  ].join('\n')
  const copiar = async () => {
    try { await navigator.clipboard.writeText(markdown()); avisar?.('Comentarios copiados: pegalos en el chat.') } catch { avisar?.('No se pudo copiar; usá «Descargar».', 'error') }
  }

  const visibles = com.filter((c) => c.pestana === pestana)
  return (
    <>
      {visibles.map((c) => (
        <div key={c.n} className="revision-pin" style={{ left: c.x, top: c.y - scroll, width: c.w, height: c.h }} data-tip={`Comentario ${c.n}\n${c.comentario}`}>
          <span>{c.n}</span>
        </div>
      ))}
      {activo && (
        <div className="revision-capa"
          onMouseDown={(e) => { if (nuevo) return; setIni({ x: e.clientX, y: e.clientY }); setAct({ x: e.clientX, y: e.clientY }) }}
          onMouseMove={(e) => ini && setAct({ x: e.clientX, y: e.clientY })}
          onMouseUp={terminar}>
          <div className="revision-ayuda">Modo revisión · arrastrá sobre una zona (o hacé clic) y escribí tu comentario · Esc para salir</div>
          {ini && act && <div className="revision-rect" style={{ left: Math.min(ini.x, act.x), top: Math.min(ini.y, act.y), width: Math.abs(act.x - ini.x), height: Math.abs(act.y - ini.y) }} />}
          {nuevo && (
            <>
              <div className="revision-rect fijo" style={{ left: nuevo.x, top: nuevo.y, width: nuevo.w, height: nuevo.h }} />
              <div className="revision-nota" onMouseDown={(e) => e.stopPropagation()}
                style={{ left: Math.min(nuevo.x, window.innerWidth - 360), top: Math.min(nuevo.y + nuevo.h + 8, window.innerHeight - 200) }}>
                <textarea ref={texto} rows={4} value={nuevo.texto} placeholder="¿Qué querés cambiar acá?"
                  onChange={(e) => setNuevo({ ...nuevo, texto: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar(); if (e.key === 'Escape') setNuevo(null) }} />
                <div className="fila" style={{ justifyContent: 'space-between' }}>
                  <small className="ayuda">Ctrl + Enter guarda</small>
                  <span className="fila"><button className="chico" onClick={() => setNuevo(null)}>Cancelar</button><button className="chico primario" onClick={guardar}>Guardar</button></span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {panel && (
        <aside className="revision-panel">
          <header>
            <b>Revisión ({com.length})</b>
            <button className="chico" onClick={() => { setPanel(false); setActivo(false) }}><Icono n="x" size={14} />Ocultar panel</button>
          </header>
          <div className="fila" style={{ padding: '10px 14px', borderBottom: '1px solid var(--borde)' }}>
            <button className={activo ? 'primario' : ''} onClick={() => setActivo(!activo)}><Icono n="editar" size={15} />{activo ? 'Marcando… (Esc)' : 'Marcar zona'}</button>
            <button onClick={copiar} disabled={!com.length}><Icono n="copiar" size={15} />Copiar todo</button>
            <button onClick={() => descargarTexto(markdown(), `revision_curvas_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`, 'text/markdown;charset=utf-8')} disabled={!com.length}><Icono n="bajar" size={15} />Descargar</button>
          </div>
          <div className="revision-lista">
            {!com.length && <p className="ayuda" style={{ padding: 14 }}>Todavía no hay comentarios. Tocá «Marcar zona», arrastrá sobre lo que quieras cambiar y escribí qué cambiarías. Los comentarios quedan guardados en este navegador.</p>}
            {com.map((c) => (
              <div key={c.n} className={`revision-item ${c.pestana === pestana ? 'aca' : ''}`}>
                <div className="fila" style={{ justifyContent: 'space-between' }}>
                  <b><span className="revision-num">{c.n}</span> {c.pestana}</b>
                  <button className="fantasma icono" aria-label="Borrar comentario" onClick={() => setCom(com.filter((x) => x.n !== c.n))}><Icono n="borrar" size={14} /></button>
                </div>
                <textarea rows={2} value={c.comentario} onChange={(e) => setCom(com.map((x) => (x.n === c.n ? { ...x, comentario: e.target.value } : x)))} />
                {(c.seccion || c.texto) && <small className="ayuda">{c.seccion ? `${c.seccion} · ` : ''}{c.texto.slice(0, 80)}</small>}
              </div>
            ))}
          </div>
          {com.length > 0 && <div style={{ padding: 12, borderTop: '1px solid var(--borde)' }}><button className="peligro" onClick={() => { if (window.confirm('Se borran todos los comentarios de revisión. ¿Continuar?')) setCom([]) }}>Borrar todos</button></div>}
        </aside>
      )}
    </>
  )
}
