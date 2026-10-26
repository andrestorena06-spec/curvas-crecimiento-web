import { useMemo, useState } from 'react'
import { PARAMS } from '../ayuda.js'
import { excelDe } from '../excel.js'
import { finito } from '../motor/analisis.js'
import { odCorregida } from '../motor/odmanual.js'
import { TIPOS, ORIGENES } from '../modelo.js'
import { Encabezado, Icono, Vacio } from '../ui/base.jsx'
import { BotonCinta, CampoCinta, Cinta, Grupo, Mosaico, OpcionesCinta } from '../ui/cinta.jsx'
import { descargarBlob, signif } from '../utils.js'
import { CLAVES_RESUMEN, resumenPorCepa } from './Parametros.jsx'
import { crecimientoPorCepa } from './CurvaUfc.jsx'
import { paresOdUfc } from './Combinado.jsx'

const r4 = (x) => (typeof x === 'number' ? (finito(x) ? signif(x, 6) : null) : x)
const limpiar = (filas) => filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k[0] !== '_').map(([k, v]) => [k, r4(v)])))

// Todas las tablas del experimento: [{ id, titulo, columnas, filas, nota }]
export function tablasDe(s) {
  const { exp, pre, res, ufcRes, serie } = s
  const T = []
  if (serie.datos) {
    const ps = Object.keys(serie.datos.pocillos).filter((p) => serie.config.some((c) => c.Pocillo === p))
    const nombre = (p) => { const c = serie.config.find((x) => x.Pocillo === p); return c ? `${c.Muestra}${c.EsBlanco ? ' (blanco)' : ` r${c.Replica}`}${exp.origenOd === 'tecan' ? ` [${p}]` : ''}` : p }
    T.push({ id: 'crudos', titulo: exp.origenOd === 'tecan' ? 'OD leída (sin procesar)' : 'OD por serie', nota: exp.origenOd === 'tecan' ? 'Valores tal como vienen del lector.' : exp.origenOd === 'placas' ? 'Ya con el blanco de cada placa restado y multiplicada por el factor de dilución.' : 'OD corregida de la cubeta (blanco y dilución aplicados).',
      columnas: ['Tiempo_h', ...ps.map(nombre)], filas: serie.datos.tiempos.map((t, i) => Object.fromEntries([['Tiempo_h', t / 3600], ...ps.map((p) => [nombre(p), serie.datos.pocillos[p][i]])])) })
  }
  if (exp.origenOd === 'placas' && serie.extra?.detalle?.length) T.push({ id: 'placas', titulo: 'Lecturas de placas, blanco y dilución', columnas: Object.keys(serie.extra.detalle[0]), filas: serie.extra.detalle })
  if (exp.origenOd === 'placas' && serie.extra?.blancos?.length) T.push({ id: 'blancos', titulo: 'Blanco de cada placa', columnas: ['T_h', 'Blanco_tomado_de_T_h', 'Pocillos', 'Media', 'DE'], filas: serie.extra.blancos.map((b) => ({ T_h: b.t, Blanco_tomado_de_T_h: b.origen, Pocillos: (b.pocillos || []).join(' '), Media: b.valor, DE: b.de })) })
  if (exp.origenOd === 'cubeta' && exp.manual.filas.length) {
    T.push({ id: 'cubeta', titulo: 'Lecturas de cubeta', columnas: ['Muestra', 'Replica', 'T_h', ...Array.from({ length: exp.manual.nd }, (_, k) => (k ? `Lectura_1:${exp.manual.factor ** k}` : 'Lectura_sin_diluir')), 'OD_corregida', 'Estado'],
      filas: exp.manual.filas.map((f) => { const c = odCorregida(f, exp.manual); return { Muestra: f.muestra, Replica: f.replica, T_h: f.t, ...Object.fromEntries(Array.from({ length: exp.manual.nd }, (_, k) => [k ? `Lectura_1:${exp.manual.factor ** k}` : 'Lectura_sin_diluir', f.od?.[k]])), OD_corregida: c.od, Estado: c.estado } }) })
  }
  if (pre && !pre.error) {
    const proc = pre.proc.filter((w) => !w.EsBlanco)
    const ts = [...new Set(proc.flatMap((w) => w.t))].sort((a, b) => a - b)
    const nom = (w) => `${w.Muestra} r${w.Replica}${exp.origenOd === 'tecan' ? ` [${w.Pocillo}]` : ''}`
    T.push({ id: 'procesada', titulo: 'OD procesada (para el análisis)', nota: 'Blanco restado, sin puntos ni réplicas excluidos, con el suavizado y la normalización elegidos.',
      columnas: ['Tiempo_h', ...proc.map(nom)], filas: ts.map((t) => Object.fromEntries([['Tiempo_h', t / 3600], ...proc.map((w) => { const i = w.t.indexOf(t); return [nom(w), i >= 0 ? w.y[i] : null] })])) })
    const excl = []
    pre.marcado.forEach((w) => w.filas.forEach((f) => { if (f.motivo) excl.push({ Serie: w.Pocillo, Muestra: w.Muestra, Replica: w.Replica, T_h: f.t / 3600, OD: f.yAntes, Motivo: f.motivo, Detalle: f.detalle }) }))
    exp.E.puntosExcl.forEach((k) => { const [p, t] = k.split('|'); const c = serie.config.find((x) => x.Pocillo === p); excl.push({ Serie: p, Muestra: c?.Muestra, Replica: c?.Replica, T_h: Number(t) / 3600, OD: null, Motivo: 'Excluido a mano', Detalle: '' }) })
    T.push({ id: 'excluidos', titulo: 'Puntos excluidos', columnas: ['Serie', 'Muestra', 'Replica', 'T_h', 'OD', 'Motivo', 'Detalle'], filas: excl })
    if (!s.porCepa) T.push({ id: 'qc', titulo: 'Control de calidad por réplica', columnas: ['Pocillo', 'Muestra', 'Replica', 'Categoria', 'Estado', 'd_mediana', 'ratio', 'dif_pct', 'N_quitados', 'Pts_aberrantes', 'Pts_OD_alta'], filas: pre.qc.map((q) => ({ ...q, Estado: pre.fuera.has(q.Pocillo) ? 'Excluido del análisis' : q.Estado })) })
  }
  if (res?.length) {
    const claves = ['od0', 'mu_max', 'mu_se', 'td_min', 'td_se_min', 'lag_h', 'K', 't_K_h', 'delta_od', 'generaciones', 'auc_od', 'auc_ln', 't_umbral_od_h', 'dod_max', 't_max_dod_h', 'mu_spline', 't_estacionaria', 't_muerte', 'caida_pct', 'r2', 'n_ventana', 't_ini_ventana', 't_fin_ventana']
    T.push(s.porCepa
      ? { id: 'parametros', titulo: 'Parámetros por cepa', nota: `Placas por tiempo: una curva por cepa (${s.modoCurva === 'puntos' ? 'regresión con todos los pocillos' : 'media de los pocillos en cada tiempo'}).`, columnas: ['Muestra', 'n_pocillos', 'modo_curva', ...claves, 'ventana_manual', 'aviso'], filas: res, etiquetas: PARAMS }
      : { id: 'parametros', titulo: 'Parámetros por réplica', columnas: ['Pocillo', 'Muestra', 'Replica', ...claves, 'ventana_manual', 'aviso'], filas: res, etiquetas: PARAMS })
    if (s.porCepa) {
      const curvas = s.seriesAn.flatMap((c) => c.t.map((t, i) => ({ Muestra: c.Muestra, T_h: t / 3600, n_pocillos: c.n[i], OD_media: c.y[i], DE: c.sd[i] })))
      T.push({ id: 'curva_cepa', titulo: 'Curva de cada cepa (media por tiempo)', columnas: ['Muestra', 'T_h', 'n_pocillos', 'OD_media', 'DE'], filas: curvas })
    }
    const rs = resumenPorCepa(res)
    const cols = ['Muestra', 'n', ...CLAVES_RESUMEN.flatMap((k) => [`${k}_media`, `${k}_DE`, `${k}_IC95`])]
    T.push({ id: 'resumen', titulo: 'Resumen por cepa (media, DE, semiancho del IC 95 %)', columnas: cols,
      filas: rs.map((r) => ({ Muestra: r.Muestra, n: r.n, ...Object.fromEntries(CLAVES_RESUMEN.flatMap((k) => [[`${k}_media`, r[k].m], [`${k}_DE`, r[k].sd], [`${k}_IC95`, r[k].ic]])) })) })
  }
  if (ufcRes?.hay) {
    T.push({ id: 'ufc_rep', titulo: 'UFC/mL por réplica', columnas: ['Muestra', 'T_h', 'Replica', 'Diluciones_usadas', 'Colonias_usadas', 'UFC_mL', 'IC95_inf', 'IC95_sup', 'log10', 'Estado', 'Incluida'],
      filas: ufcRes.reps.filter((r) => r.Conteos > 0).map((r) => ({ ...r, Incluida: ufcRes.fuera.has(`${r.Muestra}|${r.T_h}|${r.Replica}`) ? 'No' : 'Sí' })) })
    T.push({ id: 'ufc_res', titulo: 'UFC/mL por cepa y tiempo (Σ colonias / Σ volumen sembrado)', columnas: ['Muestra', 'T_h', 'N', 'Colonias_suma', 'Volumen_mL', 'UFC_mL', 'IC95_inf', 'IC95_sup', 'log10', 'DE_log10', 'Media_geometrica', 'CV_pct', 'Estado'], filas: ufcRes.res })
    const cr = crecimientoPorCepa(ufcRes.res).map(({ Muestra, c }) => ({ Muestra, mu_h: c?.mu, td_min: c?.td_min, lag_h: c?.lag_h, R2: c?.r2, Ventana: c?.ventana || c?.aviso, log10_N0: c?.log10_N0, aumento_log10: c?.crecimiento_log10, generaciones: c?.generaciones }))
    T.push({ id: 'ufc_crec', titulo: 'Crecimiento por recuento', columnas: Object.keys(cr[0] || { Muestra: 1 }), filas: cr })
  }
  if (exp.tipo === 'odufc') {
    const p = paresOdUfc(s)
    if (p.length) T.push({ id: 'pares', titulo: 'Pares OD–UFC', columnas: Object.keys(p[0]), filas: p })
  }
  return T.map((t) => ({ ...t, filas: limpiar(t.filas) }))
}

// Excel completo: una hoja con las condiciones y los ajustes, y una hoja por tabla
export async function descargarExcel(s, tablas = tablasDe(s)) {
  const exp = s.exp
  const info = [
    { Campo: 'Experimento', Valor: exp.nombre }, { Campo: 'Tipo', Valor: TIPOS[exp.tipo].titulo + (exp.origenOd ? ` · ${ORIGENES[exp.origenOd].titulo}` : '') },
    ...Object.entries(exp.cond).map(([k, v]) => ({ Campo: k, Valor: v })), { Campo: 'Generado', Valor: new Date().toLocaleString('es') },
    ...Object.entries(exp.aj).map(([k, v]) => ({ Campo: `ajuste: ${k}`, Valor: String(v) })),
  ]
  const hojas = [{ nombre: 'Experimento', columnas: ['Campo', 'Valor'], filas: info }, ...tablas.map((x) => ({ nombre: x.titulo.slice(0, 31), columnas: x.columnas, filas: x.filas }))]
  descargarBlob(await excelDe(hojas), `${exp.nombre.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '_')} - analisis.xlsx`)
}

const celda = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(signif(v, 5)).replace('.', ',')) : String(v))

export function Datos({ s }) {
  const tablas = useMemo(() => tablasDe(s), [s.pre, s.res, s.ufcRes, s.serie, s.exp]) // eslint-disable-line react-hooks/exhaustive-deps
  const [act, setAct] = useState(null)
  const t = tablas.find((x) => x.id === act) || tablas[0]
  const exp = s.exp
  const descargar = () => descargarExcel(s, tablas)
  if (!tablas.length) return <div className="pagina"><Encabezado titulo="Datos" /><Vacio titulo="Todavía no hay datos">Cargá datos para ver las tablas.</Vacio></div>
  return (
    <div className="pagina">
      <Cinta>
        <Grupo titulo="Exportar">
          <BotonCinta icono="bajar" texto="Excel completo" onClick={descargar} />
          <BotonCinta icono="imprimir" texto="Imprimir / PDF" onClick={() => window.print()} />
        </Grupo>
      </Cinta>
      <Encabezado titulo="Datos" sub="Todas las tablas del análisis, desde la lectura original hasta los parámetros. El Excel incluye una hoja por tabla y otra con las condiciones y todos los ajustes usados." />
      <div className="pestanas no-imprimir">
        {tablas.map((x) => <button key={x.id} className={t.id === x.id ? 'on' : ''} onClick={() => setAct(x.id)}>{x.titulo}<span className="chip" style={{ marginLeft: 4 }}>{x.filas.length}</span></button>)}
      </div>
      <div className="tarjeta">
        <h2>{t.titulo}</h2>
        {t.nota && <p className="ayuda">{t.nota}</p>}
        {!t.filas.length ? <p className="ayuda">Sin filas.</p> : (
          <div className="tabla-scroll" style={{ maxHeight: 620 }}><table className="tabla">
            <thead><tr>{t.columnas.map((c) => <th key={c} className={typeof t.filas[0][c] === 'number' ? 'num' : ''} data-tip={t.etiquetas?.[c]}>{c}</th>)}</tr></thead>
            <tbody>{t.filas.slice(0, 2000).map((f, i) => <tr key={i}>{t.columnas.map((c) => <td key={c} className={typeof f[c] === 'number' ? 'num' : ''}>{celda(f[c])}</td>)}</tr>)}</tbody>
          </table></div>
        )}
        {t.filas.length > 2000 && <p className="ayuda">Se muestran las primeras 2000 filas; el Excel tiene todas.</p>}
      </div>
    </div>
  )
}
