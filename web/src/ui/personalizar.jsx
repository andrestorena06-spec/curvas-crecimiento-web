// Panel «Personalizar gráfico»: textos, tamaños, trazos, ejes, leyenda, fondo y colores de las cepas.
// Cada gráfico guarda su estilo en el experimento (exp.graficos[id]); los colores de las cepas son comunes a todos.
import { Campo, Check, Num, Sel } from './base.jsx'
import { estiloGraficoDef } from './grafico.jsx'

const FUENTES = [['IBM Plex Sans', 'IBM Plex Sans'], ['Segoe UI', 'Segoe UI'], ['Arial', 'Arial'], ['Calibri', 'Calibri'], ['Times New Roman', 'Times New Roman'], ['Georgia', 'Georgia']]

export function PanelPersonalizar({ s, id, ejeDerecho = false, cepas }) {
  const e = { ...estiloGraficoDef(), ...(s.exp.graficos?.[id] || {}) }
  const set = (k, v) => s.setEstiloGrafico(id, { [k]: v })
  const txt = (k, etiqueta, ayuda) => (
    <Campo label={etiqueta} ayuda={ayuda}>
      <input value={e[k] ?? ''} placeholder="Automático" onChange={(ev) => set(k, ev.target.value)} />
    </Campo>
  )
  const lista = cepas || s.muestras
  return (
    <div className="personalizar">
      <h3>Textos</h3>
      {txt('titulo', 'Título', 'Vacío para no mostrar título; «Automático» usa el nombre del experimento')}
      {txt('xTxt', 'Eje X')}
      {txt('yTxt', 'Eje Y')}
      {ejeDerecho && txt('yTxtDer', 'Eje Y derecho')}
      <button className="chico" onClick={() => s.setEstiloGrafico(id, { titulo: undefined, xTxt: undefined, yTxt: undefined, yTxtDer: undefined })}>Volver a los textos automáticos</button>
      <Campo label="Fuente"><Sel value={e.fuente} onChange={(v) => set('fuente', v)} opciones={FUENTES} /></Campo>

      <h3>Tamaño de letra</h3>
      <div className="grilla-2">
        <Campo label="Título"><Num value={e.tamTitulo} onChange={(v) => set('tamTitulo', v || 15)} /></Campo>
        <Campo label="Nombres de ejes"><Num value={e.tamEjes} onChange={(v) => set('tamEjes', v || 12.5)} /></Campo>
        <Campo label="Números de ejes"><Num value={e.tamNumeros} onChange={(v) => set('tamNumeros', v || 11.5)} /></Campo>
        <Campo label="Leyenda"><Num value={e.tamLeyenda} onChange={(v) => set('tamLeyenda', v || 11.5)} /></Campo>
        <Campo label="Valores sobre puntos"><Num value={e.tamValores} onChange={(v) => set('tamValores', v || 10.5)} /></Campo>
      </div>

      <h3>Líneas y puntos</h3>
      <Campo label={`Grosor de líneas · ×${Number(e.grosor).toFixed(1).replace('.', ',')}`}>
        <input type="range" min="0.5" max="3" step="0.1" value={e.grosor} onChange={(ev) => set('grosor', Number(ev.target.value))} />
      </Campo>
      <Campo label={`Tamaño de puntos · ×${Number(e.radio).toFixed(1).replace('.', ',')}`}>
        <input type="range" min="0.5" max="3" step="0.1" value={e.radio} onChange={(ev) => set('radio', Number(ev.target.value))} />
      </Campo>

      <h3>Ejes y tamaño</h3>
      <div className="grilla-2">
        <Campo label="X mínimo"><Num value={e.xmin} placeholder="auto" onChange={(v) => set('xmin', v)} /></Campo>
        <Campo label="X máximo"><Num value={e.xmax} placeholder="auto" onChange={(v) => set('xmax', v)} /></Campo>
        <Campo label="Y mínimo"><Num value={e.ymin} placeholder="auto" onChange={(v) => set('ymin', v)} /></Campo>
        <Campo label="Y máximo"><Num value={e.ymax} placeholder="auto" onChange={(v) => set('ymax', v)} /></Campo>
        <Campo label="Alto del gráfico (px)"><Num value={e.alto} placeholder="auto" onChange={(v) => set('alto', v)} /></Campo>
      </div>
      <Check label="Mostrar grilla" checked={e.grilla} onChange={(v) => set('grilla', v)} />
      <Campo label="Leyenda"><Sel value={e.leyenda} onChange={(v) => set('leyenda', v)} opciones={[['abajo', 'Abajo'], ['derecha', 'A la derecha'], ['no', 'Sin leyenda']]} /></Campo>
      <Campo label="Fondo" ayuda="«Blanco» dibuja el gráfico con fondo blanco y colores claros, también al exportar: útil para informes y publicaciones aunque uses el tema oscuro.">
        <Sel value={e.fondo} onChange={(v) => set('fondo', v)} opciones={[['tema', 'Como el tema'], ['blanco', 'Blanco (para publicar)']]} />
      </Campo>

      {lista.length > 0 && (<>
        <h3>Colores de las cepas</h3>
        <p className="ayuda" style={{ marginTop: 0 }}>Valen para todos los gráficos y para la placa.</p>
        {lista.map((m) => (
          <label key={m} className="fila color-cepa">
            <input type="color" value={s.colores[m] || '#8C9BB0'} onChange={(ev) => s.setColorCepa(m, ev.target.value)} />
            <span>{m}</span>
          </label>
        ))}
        <button className="chico" onClick={s.restablecerColores}>Colores originales</button>
      </>)}

      <div style={{ marginTop: 18 }}><button className="peligro" onClick={() => s.setEstiloGrafico(id, null)}>Restablecer este gráfico</button></div>
    </div>
  )
}
