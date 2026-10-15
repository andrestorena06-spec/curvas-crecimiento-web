// Genera un archivo Excel en el navegador. hojas: [{ nombre, columnas, filas: [objetos] }]
export async function excelDe(hojas) {
  const { default: escribir } = await import('write-excel-file/browser')
  const data = hojas.map((h) => ({
    sheet: String(h.nombre || 'Hoja').replace(/[[\]*?/\:]/g, '_').slice(0, 31),
    data: [
      h.columnas.map((c) => ({ value: c, fontWeight: 'bold' })),
      ...h.filas.map((f) => h.columnas.map((c) => {
        const v = f[c]
        return v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? null : v
      })),
    ],
  }))
  return escribir(data).toBlob()
}

// Excel a partir de matrices de celdas: hojas = [{ nombre, matriz: [[celdas]] }]
export async function excelMatriz(hojas) {
  const { default: escribir } = await import('write-excel-file/browser')
  const data = hojas.map((h) => ({
    sheet: String(h.nombre || 'Hoja').replace(/[[\]*?/\:]/g, '_').slice(0, 31),
    data: h.matriz.map((f) => (f.length ? f.map((v) => (v === '' || v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v)) ? null : v)) : [null])),
  }))
  return escribir(data).toBlob()
}