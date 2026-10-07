// ============================================================
// Lectura del archivo del lector (Excel / CSV) y conversión a series por pocillo.
// Equivale a leer_crudo() y raw_a_largo() de la aplicación en R.
// ============================================================

export const LETRAS = 'ABCDEFGH'.split('')
export const pocillos96 = () => LETRAS.flatMap((f) => Array.from({ length: 12 }, (_, i) => f + (i + 1)))
const VALIDOS = new Set(pocillos96())

export function convertirNumero(x) {
  if (typeof x === 'number') return x
  if (x === null || x === undefined) return NaN
  const s = String(x).trim().replace(',', '.')
  return s === '' ? NaN : Number(s)
}

// ---------- CSV ----------
export function parsearCSV(texto) {
  const limpio = texto.replace(/^﻿/, '')
  const muestra = limpio.split(/\r?\n/).slice(0, 30)
  const cuenta = [';', '\t', ','].map((s) => muestra.reduce((a, l) => a + (l.split(s).length - 1), 0))
  const max = Math.max(...cuenta)
  const sep = max === 0 ? ',' : [';', '\t', ','][cuenta.indexOf(max)]
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (comillas) {
      if (c === '"') { if (limpio[i + 1] === '"') { campo += '"'; i++ } else comillas = false } else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(campo.trim()); campo = '' }
    else if (c === '\n') { fila.push(campo.trim()); filas.push(fila); fila = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo.trim()); filas.push(fila) }
  const ancho = Math.max(...filas.map((f) => f.length), 1)
  return filas.map((f) => Array.from({ length: ancho }, (_, j) => f[j] ?? ''))
}

async function decodificar(file) {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

// ---------- Excel ----------
const cacheHojas = new WeakMap()
async function hojasExcel(file) {
  if (!cacheHojas.has(file)) {
    const { default: leer } = await import('read-excel-file/browser')
    cacheHojas.set(file, await leer(file))
  }
  return cacheHojas.get(file)
}

const esCSV = (nombre) => ['csv', 'txt', 'tsv'].includes(nombre.split('.').pop().toLowerCase())

export async function hojasDe(file) {
  if (esCSV(file.name)) return { hojas: ['csv'] }
  if (file.name.toLowerCase().endsWith('.xls')) {
    throw new Error('Los archivos .xls antiguos no se pueden leer en el navegador. Guardalo como .xlsx o .csv y probá de nuevo.')
  }
  return { hojas: (await hojasExcel(file)).map((h) => h.sheet) }
}

// Matriz cruda (filas × columnas) de la hoja elegida
export async function leerCrudo(file, hoja) {
  if (esCSV(file.name)) return parsearCSV(await decodificar(file))
  const hojas = await hojasExcel(file)
  const h = hojas.find((x) => x.sheet === hoja) || hojas[0]
  const ancho = Math.max(...h.data.map((f) => f.length), 1)
  return h.data.map((f) => Array.from({ length: ancho }, (_, j) => (f[j] === undefined || f[j] === null ? '' : f[j])))
}

// ---------- Tiempos ----------
// Factor a segundos si el encabezado trae unidad: "Time [min]" o "Time (h)". null si no hay unidad
function factorUnidadEncabezado(encabezado) {
  const m = String(encabezado ?? '').match(/[[(]\s*([A-Za-z]+)\s*[\])]/)
  if (!m) return null
  return { s: 1, sec: 1, seg: 1, min: 60, h: 3600, hr: 3600, hs: 3600 }[m[1].toLowerCase()] ?? null
}

// Convierte tiempos (numéricos o hh:mm:ss, o fechas con solo hora) a segundos
export function tiempoASegundos(x, encabezado = '', unidad = 'auto') {
  let f = factorUnidadEncabezado(encabezado)
  if (f === null) f = { s: 1, min: 60, h: 3600, dia: 86400 }[unidad] ?? 1
  return x.map((v) => {
    if (v instanceof Date) return v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds()
    const s = String(v ?? '').trim()
    if (/^[0-9]+:[0-9]{1,2}(:[0-9]{1,2}([.,][0-9]+)?)?$/.test(s)) {
      const p = s.replace(',', '.').split(':').map(Number)
      return p.length === 2 ? p[0] * 3600 + p[1] * 60 : p[0] * 3600 + p[1] * 60 + p[2]
    }
    return convertirNumero(v) * f
  })
}

const esPoc = (x) => /^[A-Ha-h]0*([1-9]|1[0-2])$/.test(String(x ?? '').trim())
const normPoc = (x) => String(x).trim().toUpperCase().replace(/^([A-H])0+([1-9])/, '$1$2')
const r3 = (t) => Math.round(t * 1000) / 1000

// Arma {tiempos, pocillos:{A1:[y...]}} con los valores alineados a los tiempos (NaN = sin dato)
function armar(trios) {
  const porPoc = new Map()
  for (const [p, t, y] of trios) {
    if (!VALIDOS.has(p) || !Number.isFinite(t) || !Number.isFinite(y)) continue
    if (!porPoc.has(p)) porPoc.set(p, new Map())
    const m = porPoc.get(p)
    const k = r3(t)
    if (!m.has(k)) m.set(k, y)             // duplicados (pocillo, tiempo): se conserva el primero
  }
  if (!porPoc.size) throw new Error('No se encontraron datos de absorbancia válidos.')
  const tiempos = [...new Set([...porPoc.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => a - b)
  const pocillos = {}
  for (const p of pocillos96()) if (porPoc.has(p)) pocillos[p] = tiempos.map((t) => (porPoc.get(p).has(t) ? porPoc.get(p).get(t) : NaN))
  return { tiempos, pocillos }
}

// Formato A (filas):    "Time [s]" en la columna A de una fila, tiempos en esa fila, pocillos (A1..H12) debajo.
// Formato B (columnas): una fila de encabezado con los pocillos A1..H12 y una columna Time.
export function rawADatos(raw, unidad = 'auto') {
  const nr = raw.length
  const nc = raw[0]?.length || 0
  if (nr < 2 || nc < 2) throw new Error('El archivo no contiene suficientes filas o columnas.')

  // ---- Formato A ----
  for (let r = 0; r < Math.min(nr, 300); r++) {
    if (/^\s*Time/i.test(String(raw[r][0] ?? ''))) {
      const tt = tiempoASegundos(raw[r].slice(1), raw[r][0], unidad)
      if (tt.filter(Number.isFinite).length >= 2) {
        const trios = []
        for (let i = r + 1; i < nr; i++) {
          if (!esPoc(raw[i][0])) continue
          const p = normPoc(raw[i][0])
          for (let j = 1; j < nc; j++) trios.push([p, tt[j - 1], convertirNumero(raw[i][j])])
        }
        if (!trios.length) throw new Error('No se encontraron pocillos (A1 a H12) en la primera columna.')
        return armar(trios)
      }
    }
  }

  // ---- Formato B ----
  let h = -1
  for (let r = 0; r < Math.min(nr, 300); r++) {
    if (raw[r].filter(esPoc).length >= 8) { h = r; break }
  }
  if (h < 0 || h >= nr - 1) {
    throw new Error("No se reconoció el formato. Se espera 'Time [s]' en la columna A con los tiempos en esa fila y los pocillos (A1..H12) debajo, o bien una fila de encabezado con los pocillos y una columna 'Time'.")
  }
  const enc = raw[h].map((x) => String(x ?? ''))
  const colsP = enc.map((x, j) => (esPoc(x) ? j : -1)).filter((j) => j >= 0)
  let colT = enc.findIndex((x) => /^\s*Time/i.test(x))
  if (colT < 0) colT = enc.findIndex((_, j) => !colsP.includes(j))
  if (colT < 0) throw new Error('No se encontró la columna de tiempo.')
  const tt = tiempoASegundos(raw.slice(h + 1).map((f) => f[colT]), enc[colT], unidad)
  const trios = []
  tt.forEach((t, i) => {
    if (!Number.isFinite(t)) return
    colsP.forEach((j) => trios.push([normPoc(enc[j]), t, convertirNumero(raw[h + 1 + i][j])]))
  })
  if (!trios.length) throw new Error('No se encontraron valores de tiempo válidos.')
  return armar(trios)
}

export async function leerArchivo(file, hoja, unidad = 'auto') {
  const raw = await leerCrudo(file, hoja)
  const datos = rawADatos(raw, unidad)
  const aTexto = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : String(v))
  return { datos, preview: raw.slice(0, 12).map((f) => f.slice(0, 14).map(aTexto)) }
}
