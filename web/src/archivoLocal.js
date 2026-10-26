// ============================================================
// Guardar sobre el mismo archivo que se abrió (Chrome y Edge: File System Access API).
// Cada experimento recuerda su archivo (en IndexedDB del navegador), también al abrirlo desde «Recientes».
// En otros navegadores y en la app de Android no se puede escribir un archivo elegido: se descarga una copia.
// ============================================================
const TIPO = { description: 'Experimento de Curvas de crecimiento', accept: { 'application/json': ['.json'] } }

export const puedeSobrescribir = () =>
  typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window && !window.Capacitor?.isNativePlatform?.()

// el usuario canceló el cuadro de diálogo
export const cancelado = (e) => e?.name === 'AbortError'

export async function elegirArchivo() {
  const [handle] = await window.showOpenFilePicker({ types: [TIPO], multiple: false })
  return { handle, file: await handle.getFile() }
}

export const elegirDestino = (nombre) => window.showSaveFilePicker({ suggestedName: nombre, types: [TIPO] })

export async function escribir(handle, texto) {
  const op = { mode: 'readwrite' }
  if ((await handle.queryPermission?.(op)) !== 'granted' && (await handle.requestPermission?.(op)) !== 'granted') throw new Error('No diste permiso para escribir el archivo.')
  const w = await handle.createWritable()
  await w.write(texto)
  await w.close()
}

// ---------- qué archivo corresponde a cada experimento ----------
const base = () => new Promise((ok, mal) => {
  const r = indexedDB.open('curvas-crecimiento-archivos', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('archivos')
  r.onsuccess = () => ok(r.result)
  r.onerror = () => mal(r.error)
})
const pedido = (modo, fn) => base().then((db) => new Promise((ok) => {
  const q = fn(db.transaction('archivos', modo).objectStore('archivos'))
  q.onsuccess = () => ok(q.result ?? null)
  q.onerror = () => ok(null)
})).catch(() => null)

export const recordarArchivo = (id, handle) => (id && handle ? pedido('readwrite', (st) => st.put(handle, id)) : Promise.resolve(null))
export const archivoDe = (id) => (id && puedeSobrescribir() ? pedido('readonly', (st) => st.get(id)) : Promise.resolve(null))
export const olvidarArchivo = (id) => (id ? pedido('readwrite', (st) => st.delete(id)) : Promise.resolve(null))
