import { useMemo } from 'react'
import { Nota } from './tip.jsx'
import { LineChart } from './charts.jsx'
import { Campo, Panel, Select } from './ui.jsx'
import { TablaAvanzada } from './tabla.jsx'
import { Vacio } from './placa.jsx'
import { datosExp } from './comparar.jsx'
import { estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { signif } from '../ayuda.js'
import { finito, interpolar } from '../motor/analisis.js'
import { MODELOS_CALIB, ajustarCalibracion, odDesdeUfc } from '../motor/calibracion.js'

const sci = (x) => (finito(x) ? x.toExponential(2) : '–')

// ===============================================================
// CALIBRACIÓN OD ↔ UFC/mL: con los pares (OD, UFC/mL) de los mismos tiempos se ajusta una curva
// que permite estimar las UFC/mL a partir de la OD (y al revés) dentro del rango calibrado.
// ===============================================================
export function CalibracionTab({ s }) {
  const o = s.opts.calib
  const setO = (k, v) => s.setOpt('calib', k, v)
  const todos = useMemo(() => s.exps.map((e) => datosExp(e, s.aj)), [s.exps, s.aj])
  const conPares = todos.filter((d) => Object.keys(d.od).length && d.ufc.length)
  const incl = conPares.filter((d) => !o.exps || o.exps.includes(d.id))
  const muestrasTodas = [...new Set(incl.flatMap((d) => d.ufc.map((r) => r.Muestra).filter((m) => d.od[m])))]
  const muestras = muestrasTodas.filter((m) => !o.muestras || o.muestras.includes(m))

  const pares = useMemo(() => {
    const out = []
    incl.forEach((d) => muestras.forEach((m) => {
      const c = d.od[m]
      if (!c) return
      d.ufc.filter((r) => r.Muestra === m).forEach((r) => {
        const od = interpolar(c.t, c.y, [r.T_h])[0]
        if (finito(od) && od > 0) out.push({ exp: d.nombre, muestra: m, t: r.T_h, od, ufc: r.UFC_mL })
      })
    }))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, o.exps, o.muestras])
  const cal = useMemo(() => ajustarCalibracion(pares, o.modelo), [pares, o.modelo])
  const comparacion = useMemo(() => Object.keys(MODELOS_CALIB).map((md) => {
    const c = ajustarCalibracion(pares, md)
    return { Modelo: MODELOS_CALIB[md], n: c.n, R2_log10: c.ok && finito(c.R2) ? signif(c.R2, 4) : null, Error_tipico_log10: c.ok && finito(c.sigma) ? signif(c.sigma, 3) : null, Error_relativo_pct: c.ok && finito(c.errorRelPct) ? signif(c.errorRelPct, 3) : null, Ecuacion: c.ok ? c.ecuacion : c.motivo }
  }), [pares])

  if (!conPares.length) {
    return <Vacio texto="La calibración necesita al menos un experimento con curva de OD (configurada) y recuentos de UFC en los mismos tiempos. Cargá ambos en «Experimento», «Recuento» y la pestaña de OD." />
  }
  const alternar = (campo, id, todasIds) => {
    const act = o[campo] || todasIds
    setO(campo, act.includes(id) ? act.filter((x) => x !== id) : todasIds.filter((x) => act.includes(x) || x === id))
  }
  const colorDe = (m) => s.coloresGlobal[m] || '#555'

  let grafico = null
  if (pares.length) {
    const est = estiloCurvaDefecto()
    est.titulo.texto = ''
    const series = muestras.map((m) => ({
      id: m, nombre: m, color: colorDe(m), sinLinea: true, puntos: true, radio: 5, grosor: 1,
      data: pares.filter((p) => p.muestra === m).sort((a, b) => a.od - b.od).map((p) => ({ x: p.od, y: Math.log10(p.ufc), tip: `${p.muestra} · ${p.exp}\nT = ${p.t} h\nOD = ${p.od.toFixed(3)}\nUFC/mL = ${sci(p.ufc)}` })),
    })).filter((x) => x.data.length)
    const x0 = Math.min(...pares.map((p) => p.od)), x1 = Math.max(...pares.map((p) => p.od))
    if (cal.ok) {
      const pts = Array.from({ length: 60 }, (_, i) => x0 + ((x1 - x0) * i) / 59).map((x) => ({ x, y: Math.log10(cal.pred(x)) })).filter((p) => finito(p.y))
      series.push({ id: '__aj', nombre: 'Ajuste', color: '#3b2a1f', dash: 'dashed', grosor: 2, data: pts })
    }
    const ys = series.flatMap((x) => x.data.map((p) => p.y)).filter(finito)
    const a = Math.min(...ys), b = Math.max(...ys)
    const pad = (b - a) * 0.08 || 0.3
    const px = (x1 - x0) * 0.05 || 0.05
    grafico = <LineChart series={series} xlim={[Math.max(0, x0 - px), x1 + px]} ylim={[a - pad, b + pad]} est={est} ejes={ejesDefecto()} xTxt="OD corregida" yTxt="log10 UFC/mL" altoBase={380} />
  }

  const odE = Number(o.odEntrada), ufE = Number(o.ufcEntrada)
  const fuera = (x) => cal.ok && (x < cal.rango[0] || x > cal.rango[1])
  const ufcDeOd = cal.ok && finito(odE) && odE > 0 ? cal.pred(odE) : NaN
  const odDeUfc = cal.ok && finito(ufE) && ufE > 0 ? odDesdeUfc(cal, ufE) : NaN

  // UFC/mL estimadas a lo largo de la curva de OD del experimento activo
  const estimadas = useMemo(() => {
    if (!cal.ok) return []
    const d = todos.find((x) => x.id === s.a.id)
    if (!d) return []
    const out = []
    Object.entries(d.od).forEach(([m, c]) => c.t.forEach((t, i) => {
      if (!finito(c.y[i]) || c.y[i] <= 0) return
      const u = cal.pred(c.y[i])
      if (finito(u)) out.push({ Muestra: m, T_h: signif(t, 4), OD: signif(c.y[i], 4), UFC_mL_estimadas: signif(u, 4), log10: signif(Math.log10(u), 4), Dentro_del_rango_calibrado: c.y[i] >= cal.rango[0] && c.y[i] <= cal.rango[1] ? 'Sí' : 'No (extrapolado)' })
    }))
    return out
  }, [cal, todos, s.a.id])

  return (
    <div className="con-lateral">
      <Panel titulo="Calibración OD–UFC">
        <p className="ayuda"><Nota titulo="Ayuda">Ajusta una curva a los pares (OD, UFC/mL) de los mismos tiempos para <b>estimar las UFC/mL a partir de la OD</b> (por ejemplo, en los tiempos donde no contaste). Solo es válida dentro del rango de OD calibrado, con el mismo organismo, medio y equipo.</Nota></p>
        <Campo label="Modelo de calibración">
          <Select value={o.modelo} onChange={(v) => setO('modelo', v)} opciones={Object.entries(MODELOS_CALIB)} />
        </Campo>
        <h3>Experimentos</h3>
        <div className="lista-checks">
          {conPares.map((d) => (
            <label key={d.id} className="check"><input type="checkbox" checked={!o.exps || o.exps.includes(d.id)} onChange={() => alternar('exps', d.id, conPares.map((x) => x.id))} />
              <span>{d.nombre}</span></label>
          ))}
        </div>
        <h3>Muestras</h3>
        <div className="lista-checks">
          {muestrasTodas.map((m) => (
            <label key={m} className="check"><input type="checkbox" checked={!o.muestras || o.muestras.includes(m)} onChange={() => alternar('muestras', m, muestrasTodas)} />
              <span><i className="punto-color" style={{ background: colorDe(m) }} />{m}</span></label>
          ))}
        </div>
      </Panel>
      <div className="principal">
        {!cal.ok ? <Vacio texto={cal.motivo || 'No se pudo ajustar.'} /> : (
          <section className="tarjeta">
            <h2>Curva de calibración</h2>
            {grafico}
            <dl className="datos">
              <dt>Ecuación</dt><dd>{cal.ecuacion}</dd>
              <dt>Pares usados</dt><dd>{cal.n}</dd>
              <dt>R² (en log10)</dt><dd>{finito(cal.R2) ? cal.R2.toFixed(3) : '–'}</dd>
              <dt>Error típico</dt><dd>{finito(cal.sigma) ? `${cal.sigma.toFixed(2)} log10 (± ${cal.errorRelPct.toFixed(0)} %)` : '–'}</dd>
              <dt>Rango de OD calibrado</dt><dd>{cal.rango[0].toFixed(3)} a {cal.rango[1].toFixed(3)}</dd>
            </dl>
            <div className="rejilla-2">
              <div className="bloque-estilo">
                <h4>De OD a UFC/mL</h4>
                <Campo label="OD corregida"><input type="number" step="any" value={o.odEntrada} onChange={(e) => setO('odEntrada', e.target.value)} /></Campo>
                <p><b>{finito(ufcDeOd) ? `${sci(ufcDeOd)} UFC/mL` : '–'}</b>{finito(ufcDeOd) && fuera(odE) && <small> · fuera del rango calibrado (extrapolado)</small>}</p>
              </div>
              <div className="bloque-estilo">
                <h4>De UFC/mL a OD</h4>
                <Campo label="UFC/mL"><input type="number" step="any" value={o.ufcEntrada} onChange={(e) => setO('ufcEntrada', e.target.value)} /></Campo>
                <p><b>{finito(odDeUfc) ? `OD = ${odDeUfc.toFixed(3)}` : '–'}</b></p>
              </div>
            </div>
          </section>
        )}
        <TablaAvanzada id="calib_modelos" titulo="Comparación de modelos" columnas={Object.keys(comparacion[0])} filas={comparacion} onVista={s.onVista} />
        {pares.length > 0 && (
          <TablaAvanzada id="calib_pares" titulo="Pares OD–UFC usados" columnas={['Experimento', 'Muestra', 'T_h', 'OD', 'UFC_mL', 'log10_UFC_mL']}
            filas={pares.map((p) => ({ Experimento: p.exp, Muestra: p.muestra, T_h: p.t, OD: signif(p.od, 4), UFC_mL: signif(p.ufc, 4), log10_UFC_mL: signif(Math.log10(p.ufc), 4) }))} onVista={s.onVista} />
        )}
        {estimadas.length > 0 && (
          <TablaAvanzada id="calib_estimadas" titulo={`UFC/mL estimadas desde la OD de «${s.a.nombre}»`} columnas={Object.keys(estimadas[0])} filas={estimadas} onVista={s.onVista} />
        )}
      </div>
    </div>
  )
}
