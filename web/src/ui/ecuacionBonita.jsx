// ============================================================
// Ecuaciones con formato de ecuación (fracciones, exponentes, subíndices) en MathML: lo dibuja el navegador, sin librerías
// y sin conexión. Es el ÚNICO formato de ecuación del programa: todas las pantallas usan estos armadores.
// Todo va en log₁₀ (el motor ajusta en ln: μ₁₀ = μ / ln 10, η = h₀ / ln 10).
// ============================================================
import { finito } from '../motor/analisis.js'
import { fs } from '../utils.js'

const num = (x, d = 4) => fs(x, d)
const Mn = ({ x, d }) => <mn>{(typeof x === 'string' ? x : num(x, d)).replace(/^-/, '−')}</mn>
const Mi = ({ children, normal }) => <mi mathvariant={normal ? 'normal' : undefined}>{children}</mi>
const Mo = ({ children, grande }) => <mo {...(grande ? { stretchy: 'true' } : {})}>{children}</mo>
export const Log10 = () => <><msub><mi mathvariant="normal">log</mi><mn>10</mn></msub><mspace width="0.17em" /></>
const Pot10 = ({ children }) => <msup><mn>10</mn><mrow>{children}</mrow></msup>
const Frac = ({ a, b }) => <mfrac><mrow>{a}</mrow><mrow>{b}</mrow></mfrac>
const Par = ({ children, tipo = '(' }) => { const c = { '(': ')', '[': ']' }[tipo]; return <mrow><mo stretchy="true">{tipo}</mo>{children}<mo stretchy="true">{c}</mo></mrow> }
// «+ x» o «− x» según el signo
const Sg = ({ x, d }) => <><mo>{x < 0 ? '−' : '+'}</mo><Mn x={Math.abs(x)} d={d} /></>
// número en notación científica: 1,234 · 10^5
const Sci = ({ x }) => {
  if (!finito(x) || x === 0) return <mn>0</mn>
  const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e
  return <mrow><mn>{String(Number(m.toPrecision(4))).replace('.', ',')}</mn><mo>·</mo><msup><mn>10</mn><mn>{e}</mn></msup></mrow>
}

export function Ec({ children, bloque = true }) {
  return <math display={bloque ? 'block' : 'inline'} className="ec-math"><mrow>{children}</mrow></math>
}

// y(t) del crecimiento: log₁₀ N(t) (UFC) o log₁₀ OD(t)
const Y = ({ vy }) => <><Log10 /><mi mathvariant={vy === 'OD' ? 'normal' : undefined}>{vy}</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo></>

// Modelo del ajuste. «Linealizar log₁₀»: log₁₀ y = a + b·t. Baranyi y Roberts: en ln, que es en lo que se calcula
// (y = ln N o ln OD; μ en h⁻¹; c.y0 y c.yEnd vienen en log₁₀ y se pasan a ln).
const Ln = () => <><mi mathvariant="normal">ln</mi><mspace width="0.17em" /></>
const Exp = ({ children }) => <msup><mi>e</mi><mrow>{children}</mrow></msup>
export function EcModelo({ c, vy }) {
  const vyi = <mi mathvariant={vy === 'OD' ? 'normal' : undefined}>{vy}</mi>
  const T = <><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo></>
  if (c.modelo === 'lineal') {
    return <Ec><Log10 />{vyi}{T}<mo>=</mo><Mn x={c.y0} /><Sg x={c.mu / Math.LN10} /><mo>·</mo><mi>t</mi></Ec>
  }
  if (c.modelo === 'huang') {
    const y0h = c.y0 * Math.LN10, ymh = c.yEnd * Math.LN10, lam = c.lag_h
    const Bt = <><mi>B</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo></>
    return (
      <div className="ec-par">
        <Ec><Ln />{vyi}{T}<mo>=</mo><Mn x={y0h} /><Sg x={ymh} /><mo>−</mo><Ln /><Par tipo="["><Exp><Mn x={y0h} /></Exp><mo>+</mo><Par><Exp><Mn x={ymh} /></Exp><mo>−</mo><Exp><Mn x={y0h} /></Exp></Par><mo>·</mo><Exp><mo>−</mo><Mn x={c.mu} /><mo>·</mo>{Bt}</Exp></Par></Ec>
        <Ec>{Bt}<mo>=</mo><mi>t</mi><mo>+</mo><Frac a={<mn>1</mn>} b={<mn>4</mn>} /><mo>·</mo><Ln /><Par><Frac a={<><mn>1</mn><mo>+</mo><Exp><mo>−</mo><mn>4</mn><mo>·</mo><Par><mi>t</mi><mo>−</mo><Mn x={lam} /></Par></Exp></>} b={<><mn>1</mn><mo>+</mo><Exp><mn>4</mn><mo>·</mo><Mn x={lam} /></Exp></>} /></Par></Ec>
      </div>
    )
  }
  const y0 = c.y0 * Math.LN10, ymax = c.yEnd * Math.LN10, mu = c.mu, h0 = c.h0
  const m = finito(c.mcurv) && c.mcurv > 0 ? c.mcurv : 1
  const At = <><mi>A</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo></>
  const Aexp = <><Mn x={mu} /><mo>·</mo>{At}</>
  const tramo = m === 1
    ? <><Ln /><Par tipo="[">
        <mn>1</mn><mo>+</mo>
        <Frac a={<><Exp>{Aexp}</Exp><mo>−</mo><mn>1</mn></>} b={<Exp><Mn x={ymax} /><Sg x={-y0} /></Exp>} />
      </Par></>
    : <><Frac a={<mn>1</mn>} b={<Mn x={m} />} /><mo>·</mo><Ln /><Par tipo="[">
        <mn>1</mn><mo>+</mo>
        <Frac a={<><Exp><Mn x={m} /><mo>·</mo>{Aexp}</Exp><mo>−</mo><mn>1</mn></>} b={<Exp><Mn x={m} /><mo>·</mo><Par><Mn x={ymax} /><Sg x={-y0} /></Par></Exp>} />
      </Par></>
  return (
    <div className="ec-par">
      <Ec><Ln />{vyi}{T}<mo>=</mo><Mn x={y0} /><mo>+</mo><Mn x={mu} /><mo>·</mo>{At}<mo>−</mo>{tramo}</Ec>
      {Math.abs(h0) < 1e-9
        ? <Ec>{At}<mo>=</mo><mi>t</mi></Ec>
        : <Ec>{At}<mo>=</mo><mi>t</mi><mo>+</mo>
          <Frac a={<><Ln /><Par><Exp><mo>−</mo><Mn x={mu} /><mo>·</mo><mi>t</mi></Exp><mo>+</mo><Exp><mo>−</mo><Mn x={h0} /></Exp><mo>−</mo><Exp><mo>−</mo><Mn x={mu} /><mo>·</mo><mi>t</mi><mo>−</mo><Mn x={h0} /></Exp></Par></>} b={<Mn x={mu} />} />
        </Ec>}
    </div>
  )
}

// Calibración OD ↔ UFC/mL (c = resultado de ajustarCalibracion)
export function EcCalibracion({ c }) {
  const OD = <mi mathvariant="normal">OD</mi>, UFC = <mi mathvariant="normal">UFC</mi>
  if (c.modelo === 'clasico') return <Ec><Log10 />{UFC}<mo>=</mo><Mn x={c.coef.m} /><mo>·</mo>{OD}<Sg x={c.coef.b} /></Ec>
  if (c.modelo === 'lineal') return <Ec>{UFC}<mo>=</mo><Sci x={c.coef.a} /><mo>{c.coef.b < 0 ? '−' : '+'}</mo><Sci x={Math.abs(c.coef.b)} /><mo>·</mo>{OD}</Ec>
  if (c.modelo === 'proporcional') return <Ec>{UFC}<mo>=</mo><Sci x={c.coef.b} /><mo>·</mo>{OD}</Ec>
  if (c.modelo === 'potencia') return <Ec><Log10 />{UFC}<mo>=</mo><Mn x={c.coef.a} /><Sg x={c.coef.b} /><mo>·</mo><Log10 />{OD}</Ec>
  return <Ec><mtext>{c.ecuacion}</mtext></Ec>
}

// Recta de la fase exponencial de una curva de OD: log₁₀ OD = a + b·t, y la misma sin logaritmo: OD = A · 10^(b·t)
export function EcRectaOd({ intercepto10, pendiente10 }) {
  return <Ec><Log10 /><mi mathvariant="normal">OD</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo><mo>=</mo><Mn x={intercepto10} /><Sg x={pendiente10} /><mo>·</mo><mi>t</mi></Ec>
}
export function EcRectaOdExp({ intercepto10, pendiente10 }) {
  return <Ec><mi mathvariant="normal">OD</mi><mo stretchy="false">(</mo><mi>t</mi><mo stretchy="false">)</mo><mo>=</mo><Sci x={10 ** intercepto10} /><mo>·</mo><Pot10><Mn x={pendiente10} /><mo>·</mo><mi>t</mi></Pot10></Ec>
}
