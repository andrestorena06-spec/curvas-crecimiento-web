// Lectura de planillas: Excel (.xlsx, .xlsm, .xlsb, .xls antiguo) y LibreOffice (.ods, .fods, plantillas).
// .xlsx se lee con read-excel-file; el resto con SheetJS (se carga solo cuando hace falta).
export const EXT_LIBRO = ['xlsx', 'xlsm', 'xlsb', 'xls', 'xlt', 'xltx', 'xltm', 'ods', 'ots', 'fods']
export const ACEPTA_LIBRO = EXT_LIBRO.map((e) => '.' + e).join(',')
export const TEXTO_FORMATOS = 'Excel o LibreOffice: .xlsx, .xls, .xlsm, .xlsb, .ods'
export const esLibro = (nombre) => EXT_LIBRO.includes(String(nombre).split('.').pop().toLowerCase())
export const MSG_FORMATO = `Formato no reconocido. Se aceptan planillas de ${TEXTO_FORMATOS} (y sus plantillas).`

// Devuelve [{ sheet, data: [[celdas]] }] con el mismo formato que read-excel-file
export async function leerHojasLibro(file) {
  if (!esLibro(file.name)) throw new Error(MSG_FORMATO)
  if (/\.xlsx$/i.test(file.name)) {
    const { default: leer } = await import('read-excel-file/browser')
    return leer(file)
  }
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  let wb
  try {
    wb = XLSX.read(buf, { type: 'array', cellDates: true })
  } catch (e) {
    throw new Error(`No se pudo leer el archivo (${e.message}).`)
  }
  return wb.SheetNames.map((nombre) => ({
    sheet: nombre,
    data: XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: '', blankrows: true }),
  }))
}
