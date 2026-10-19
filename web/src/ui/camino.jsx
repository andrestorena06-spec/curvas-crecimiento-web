// Grupo de la cinta para llevar la OD de un lector de placas a 1 cm de camino óptico
import { caminoOptico } from '../modelo.js'
import { fx } from '../utils.js'
import { Num } from './base.jsx'
import { BotonCinta, CampoCinta, Grupo } from './cinta.jsx'

export function GrupoCamino({ s }) {
  const aj = s.exp.aj
  const c = caminoOptico(aj, true)
  return (
    <Grupo titulo="Camino óptico">
      <BotonCinta simbolo="1 cm" texto="Llevar a 1 cm" activo={!!aj.camino_on} onClick={() => s.setAj('camino_on', !aj.camino_on)}
        tip={'Llevar la OD a 1 cm de camino óptico\nEn el lector el haz atraviesa la altura del líquido: l = V / área del pocillo.\nOD (1 cm) = OD × 1/l. Sirve para comparar con cubeta o entre volúmenes distintos.\nNo cambia μmax ni el lag; sí K, ΔOD, AUC, el tiempo hasta la OD umbral y la calibración OD ↔ UFC.'} />
      <CampoCinta etiqueta="Volumen (µL)" tip="Volumen de líquido en cada pocillo"><Num value={aj.pocillo_vol} onChange={(v) => s.setAj('pocillo_vol', v)} ancho={58} /></CampoCinta>
      <CampoCinta etiqueta="Diámetro (mm)" tip={'Diámetro interno del pocillo (en el fondo)\nPlaca de 96 de fondo plano: 6,4 a 6,9 mm según la marca. Media área: ≈ 4,5 mm. 384: ≈ 3,3 mm.'}><Num value={aj.pocillo_diam} onChange={(v) => s.setAj('pocillo_diam', v)} ancho={58} /></CampoCinta>
      <CampoCinta etiqueta="Camino"><span className="valor-cinta" data-tip={c ? `l = V / (π d²/4) = ${fx(aj.pocillo_vol / 1000, 3)} cm³ / ${fx(c.area, 4)} cm² = ${fx(c.l, 3)} cm\nFactor a 1 cm = 1 / l = ${fx(c.f, 3)}` : undefined}>{c ? `${fx(c.l, 3)} cm · ×${fx(c.f, 2)}` : '—'}</span></CampoCinta>
    </Grupo>
  )
}
