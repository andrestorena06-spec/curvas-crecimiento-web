# Curvas de crecimiento (versión web)

Aplicación para analizar el crecimiento bacteriano **por densidad óptica (OD), por recuento de colonias (UFC/mL) o por ambos**.

**Todo se calcula en tu navegador.** Los archivos y los resultados no se envían a ningún servidor.

Abrir en línea: **https://andrestorena06-spec.github.io/curvas-crecimiento-web/**

## Usar sin internet

[**Curvas.html**](docs/Curvas.html): un solo archivo; se descarga y se abre con doble clic en Edge, Chrome o Firefox.

## Qué hace
- **Asistente al empezar**: curva por OD, por conteo de UFC/mL o por OD + UFC. La OD puede venir de un lector Tecan (cinética),
  de placas leídas una por tiempo o de lecturas en cubeta.
- **Placas por tiempo**: cada placa es un tiempo, con su layout (cepa, blanco y dilución por pocillo) y su Excel; varios Excel a la vez,
  asociación por el tiempo del nombre del archivo, blanco propio o tomado de otra placa, placas ocultas y corrección a 1 cm de camino óptico.
- **Control de calidad** con exclusión de puntos (Dixon, Grubbs o CV; Hampel en cinéticas) y todo reversible con un clic.
- **Parámetros**: μmax por ventana deslizante, tiempo de duplicación, lag, K, ΔOD, AUC, fases y modelos (Gompertz, logístico, Richards, Baranyi).
- **Recuento de UFC**: serie de diluciones con volúmenes transferidos, una dilución por cepa y tiempo (sugerida o elegida a mano),
  coherencia entre diluciones (prueba binomial), IC 95 % de Poisson exacto, media geométrica de las réplicas y test de atípicos.
- **OD + UFC**: ambas curvas con doble eje y calibración OD ↔ UFC/mL.
- **Gráficos personalizables** (textos, tamaños, ejes, colores de las cepas, fondo blanco) y exportación PNG/SVG; tablas a Excel.
- **Métodos**: descripción completa de los cálculos y texto para el informe.
- **Resumen** con el avance del análisis y una lista «Para revisar» (avisos con acceso directo a la pantalla que corresponde).
- **Recientes**: los experimentos se guardan solos en el navegador (hasta 8); deshacer y rehacer (Ctrl + Z / Ctrl + Y);
  edición de los datos del experimento y renombrado de cepas en todo el experimento.
- **Compatible con archivos anteriores**: abre los `.curvas.json` de versiones previas y las sesiones del programa anterior
  (sesión del Tecan y archivos con varios experimentos); lo que había quedado guardado en el navegador pasa a «Recientes».
- Planillas Excel y LibreOffice (.xlsx, .xls, .ods). Tema oscuro y claro.

## Código

El código fuente está en [`web/`](web) (React + Vite). `npm ci`, y luego `npx vite build --mode web --outDir dist-web` para el sitio
o `npx vite build --mode single --outDir dist-single` para el archivo único.
