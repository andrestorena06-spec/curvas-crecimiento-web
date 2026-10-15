# Curvas de crecimiento (versión web)

Aplicación web para analizar el crecimiento de cultivos **por densidad óptica (OD), por recuento de colonias (UFC/mL) o por ambos**.
Al empezar se elige qué se va a analizar (solo OD, OD + conteo o solo conteo) y de dónde sale la OD.

**Todo se calcula en tu navegador.** Los archivos y los resultados no se envían a ningún servidor.

## Usar sin internet

[**Curvas.html**](docs/Curvas.html): un solo archivo; se descarga y se abre con doble clic en Edge, Chrome o Firefox.

## Qué hace
- **Pantalla inicial**: solo OD · OD + conteo · solo conteo. La OD puede venir de un Excel del lector (Tecan u otro), de placas de 96
  leídas por separado (formato del programa de Biofilm: una matriz A–H × 1–12 por lectura) o de lecturas manuales con cubeta.
- **Condiciones del experimento** (primer cuadro): organismo, medio, temperatura, equipo, longitud de onda, fecha y notas; si hay
  conteo, también las diluciones (factor, volumen sembrado, rango contable).
- **OD manual**: tabla con muestra, réplica, tiempo y lecturas sin diluir y diluidas; la OD corregida usa la ventana lineal del equipo.
- **Recuento**: gotas en placa de 96 (filas = réplicas, columnas = diluciones) o placas de Petri en una tabla. Media ponderada
  ISO 7218, IC 95 % de Poisson exacto (Garwood), media geométrica de las réplicas, límite de detección y parámetros de crecimiento.
- **Curvas de OD**: preprocesado y QC (blanco, Hampel, suavizado, normalización), μmax, tiempo de duplicación, lag, K, AUC, fases y modelos.
- **Calibración OD–UFC/mL** y **Comparar** (OD y UFC en el mismo gráfico con doble eje, varios experimentos).
- **Planillas**: Excel y LibreOffice (.xlsx, .xls, .xlsm, .xlsb, .ods).
- **Sesión** con todos los datos, **Excel** con todo el análisis e **informe en PDF**.
