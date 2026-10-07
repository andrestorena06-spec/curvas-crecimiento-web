# Curvas de crecimiento – análisis de placa de 96 pocillos (versión web)

Aplicación web para analizar curvas de crecimiento bacteriano medidas en lectores de placas (densidad óptica
contra el tiempo): preprocesado y control de calidad, gráficos, parámetros de crecimiento (μmax, tiempo de
duplicación, lag, K, AUC, fases) y ajuste de modelos (Gompertz, logístico, Richards y Baranyi-Roberts).

**Todo se calcula en tu navegador.** El archivo y los resultados no se envían a ningún servidor.

## Usar sin internet

[**Curvas.html**](Curvas.html) (450 KB): un solo archivo; se descarga y se abre con doble clic en Edge, Chrome o Firefox.
No requiere instalar nada (ni R ni Node.js) ni conexión a internet.

## Qué hace
- **Un Excel a la vez**: lee el archivo del lector (`.xlsx`, `.csv`, `.txt`) con los pocillos A1 a H12 y el tiempo.
- **La sesión guarda los datos del Excel**: para continuar otro día alcanza con cargar la sesión. Al abrir la página
  pregunta si querés continuar con el trabajo anterior o empezar de cero.
- Configuración de pocillos por arrastre, con muestras, réplicas automáticas y blancos (también por layout en CSV).
- **Preprocesado**: corrección al blanco, filtro de Hampel (mediana y MAD), OD máxima confiable, suavizado
  (media, mediana, LOESS), normalización, control de calidad por pocillo y exclusión de puntos o pocillos con un clic.
- **Gráfico**: réplicas individuales, media o media ± error (SD, SEM, IC 95 %), escala lineal o ln(OD), zoom por
  arrastre, textos y ejes editables con clic derecho (subrayado y tachado incluidos) y descarga de imagen con ajuste
  visual de proporción (PNG, JPG, SVG).
- **Análisis**: parámetros por pocillo y por muestra, detalle con ln(OD), ventana de μmax y fases (con ventana manual),
  mapa de placa con explicación de cada valor y modelos con comparación por AIC.
- Tablas con filtros por columna, columnas movibles y descarga a Excel; análisis completo en un Excel.
- Descripción de todos los cálculos, paso a paso y en lenguaje llano, en la pestaña *Métodos*.

## Limitaciones
- No lee archivos `.xls` antiguos: guardalos como `.xlsx` o `.csv`.
- La configuración se guarda en el navegador de cada persona; para llevarla a otra computadora usá *Guardar sesión*
  en la pestaña Archivo.

## Estructura
- `docs/` – sitio ya compilado (es lo que publica GitHub Pages).
- `web/` – código fuente (React + Vite). Para recompilar:

```bash
cd web
npm install
npm run build:web      # genera web/dist-web (copiar su contenido a docs/)
npm run build:single   # genera web/dist-single/index.html (un solo archivo)
```

- `icono/` – ícono de la aplicación (una curva de crecimiento): `curvas.svg`, `curvas.ico` y PNG.

Los cálculos coinciden con los de la aplicación en R (`curvas.R`): se verificó con los mismos datos el filtro de Hampel,
la OD₀ de tres fases, las ventanas de μmax, los parámetros, el control de calidad y los modelos.
