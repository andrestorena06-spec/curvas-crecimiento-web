# Curvas de crecimiento (versión web)

Aplicación web para analizar el crecimiento de cultivos **por densidad óptica (OD), por recuento de colonias (UFC/mL) o por ambos**.
Al empezar se elige qué se va a analizar (solo OD, OD + conteo o solo conteo) y de dónde sale la OD.

**Todo se calcula en tu navegador.** Los archivos y los resultados no se envían a ningún servidor.

## Usar sin internet

[**Curvas.html**](docs/Curvas.html): un solo archivo; se descarga y se abre con doble clic en Edge, Chrome o Firefox.

## Qué hace
- **Pantalla inicial**: solo OD · OD + conteo · solo conteo. La OD puede venir de un Excel del lector (Tecan u otro), de una placa
  de 96 leída en el formato del programa de Biofilm (cada columna es un tiempo) o de lecturas manuales con cubeta.
- **Condiciones del experimento** (primer cuadro): cepas (se eligen de la lista común), medio, temperatura, agitación, equipo,
  longitud de onda, fecha y notas; si hay conteo, también la siembra y las diluciones (factor, volumen, solución madre, rango contable).
- **Placa de OD**: la cepa o el blanco se definen por pocillo (clic o arrastrar), con orden agrupado o alternado y filas de espaciado;
  el blanco se puede aplicar a todos los tiempos.
- **OD manual**: tabla con muestra, réplica, tiempo y lecturas sin diluir y diluidas; la OD corregida usa la ventana lineal del equipo.
- **Recuento**: gotas en placa de 96 (en «Conteos» se elige la cepa de cada fila, que define las réplicas, y el formato se repite en
  todos los tiempos; las diluciones que no se cuentan quedan vacías) o siembra extendida en placas de Petri (tabla). Media ponderada
  ISO 7218, IC 95 % de Poisson exacto (Garwood), media geométrica de las réplicas, límite de detección y parámetros de crecimiento.
- **Curvas de OD**: preprocesado y QC (blanco, Hampel, suavizado, normalización), μmax, tiempo de duplicación, lag, K, AUC, fases y modelos.
- **Calibración OD–UFC/mL** y **Comparar** (OD y UFC en el mismo gráfico con doble eje, varios experimentos).
- **Planillas**: Excel y LibreOffice (.xlsx, .xls, .xlsm, .xlsb, .ods).
- **Sesión** con todos los datos, **Excel** con todo el análisis e **informe en PDF**.
