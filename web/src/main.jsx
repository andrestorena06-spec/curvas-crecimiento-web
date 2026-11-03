import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans/greek-400.css'
import '@fontsource/ibm-plex-sans/greek-600.css'
import './styles.css'
import './cinta.css'

// Si algo falla al dibujar, se muestra el error (y se puede copiar) en vez de dejar la pantalla en blanco
class Falla extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const texto = String(error?.stack || error?.message || error)
    return (
      <div style={{ padding: 32, maxWidth: 760, margin: '40px auto', fontFamily: 'IBM Plex Sans, sans-serif', color: '#4a2c05' }}>
        <h2>Algo falló al mostrar esta pantalla</h2>
        <p>Tus datos no se perdieron. Podés volver a intentar, o copiar el mensaje de abajo y mandármelo para arreglarlo.</p>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #e0c9a0', borderRadius: 8, padding: 12, fontSize: 12, maxHeight: 280, overflow: 'auto' }}>{texto}</pre>
        <button onClick={() => location.reload()}>Recargar</button>{' '}
        <button onClick={() => { try { const k = 'curvas-crecimiento-v2-recientes', l = JSON.parse(localStorage.getItem(k) || '[]'); localStorage.setItem(k, JSON.stringify(l.map((r) => ({ ...r, exp: { ...r.exp, opciones: {} } })))) } catch { /* nada */ } location.reload() }}>Recargar con ajustes de pantalla por defecto</button>
      </div>
    )
  }
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Falla><App /></Falla></React.StrictMode>)
