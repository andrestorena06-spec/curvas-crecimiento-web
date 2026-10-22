// Funciones de la app de Android (Capacitor). En el navegador no hacen nada.
// - Guardar archivos: Android no tiene «descargas» dentro de la app, así que el archivo se escribe en la
//   carpeta de la app y se abre el menú «Compartir» (Drive, WhatsApp, mail, Archivos…).
// - Botón Atrás: cierra el menú o la ventana abierta; con dos toques seguidos sale de la app.
import { Capacitor } from '@capacitor/core'

export const esNativo = () => Capacitor.isNativePlatform()

const aBase64 = (blob) => new Promise((ok, mal) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1] || '')
  r.onerror = mal
  r.readAsDataURL(blob)
})

export async function guardarNativo(blob, nombre) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const limpio = nombre.replace(/[\\/:*?"<>|]+/g, '_')
  const escrito = await Filesystem.writeFile({ path: limpio, data: await aBase64(blob), directory: Directory.Cache, recursive: true })
  try {
    await Share.share({ title: limpio, files: [escrito.uri], dialogTitle: 'Guardar o compartir ' + limpio })
  } catch (e) {
    // si se cierra el menú sin elegir nada no es un error
    if (!/cancel/i.test(String(e?.message || e))) throw e
  }
}

// alAtras() devuelve true si cerró algo (menú, ventana); si no, el segundo toque en 2 s sale de la app
export async function escucharAtras(alAtras, avisar) {
  if (!esNativo()) return () => {}
  const { App } = await import('@capacitor/app')
  let ultimo = 0
  const h = await App.addListener('backButton', () => {
    if (alAtras()) return
    const ahora = Date.now()
    if (ahora - ultimo < 2000) App.exitApp()
    else { ultimo = ahora; avisar?.('Tocá «Atrás» otra vez para salir.') }
  })
  return () => h.remove()
}
