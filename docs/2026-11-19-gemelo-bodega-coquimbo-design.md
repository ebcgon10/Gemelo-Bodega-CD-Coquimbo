# Gemelo digital de bodega — CD CCU Coquimbo (diseño)

## Para qué
Ver de un vistazo la ocupación real de las posiciones (sin stage de despacho, subestándar, merma ni reempaque),
encontrar las posiciones libres para ordenar mejor la bodega y decidir qué puede salir hoy del stage de recepción (C1).
Más adelante: conexión directa al WMS (Oracle WMS Cloud) con un compañero informático.

## Metas
- Plano interactivo y atractivo de la bodega (Bodega 1, Picking 1 y 2, Bodega 2, bodega 17) y de la C1.
- Cargar la cuadratura de stock del WMS (CSV) y que cada fila caiga en su casillero.
- Mostrar libres / ocupadas por pasillo y nivel, con KPI arriba.
- Tarjeta de stage (STREC01–06 + REBA-01) con LPN, SKU y sugerencia de destino.
- Capa de vida útil cuando se suba ese archivo.

## No metas (v1)
- Vista 3D (fase 2 sobre la misma página).
- Conexión en vivo al WMS, historial entre días.
- Carpas C2–C5, subestándar, andenes 10xx, REEMP, RETFLET, TRF_PCK, MERMA, REVISION, CONSUMO, VENCIDO.

## Anti-metas
- Que el % de ocupación vuelva a mezclar stage/subestándar/merma (eso es justo lo que se quiere evitar).
- Una página lenta o que haya que mantener a mano cada vez que cambie el stock.

## Datos (decidido)
- Cuadratura: columnas `area, ubicacion, articulo, descripcion, estado_de_inventario, lpn, cantidad, ...`.
- Ubicación `PP-MM-NN-SS` = pasillo-módulo-nivel-subposición. Nivel 01 = SURTID (surtido), 02–03 = ALMPIC.
- Posición física = PP-MM-NN. Subposiciones (vino, pasillo 1, 17, 18) se agrupan dentro de su posición.
- Pasillo 19 (Bodega 1, perchas B1-O/B1-E) = 44 ubicaciones ALMAC de ~14 pallets cada una (~616 ≈ 598 Revit).
- Pasillos 1–16: Picking 1 (1–?) y Picking 2, numerados de poniente a oriente según imagen del usuario.
- Pasillo 17 = bodega pequeña en edificio de servicios (sur). Pasillo 18 = Bodega 2 (poniente), 56 módulos × 3 niveles.
- Stage: STREC01–06 (recuadro grande de C1) y REBA-01 (recuadro vertical a la entrada de C1).
- Las fechas de la cuadratura vienen vacías: vencimiento sale del archivo de vida útil.

## Enfoques considerados
- A. Página web interactiva (elegido): plano 2D dibujado en el navegador, carga local de CSV, link compartible.
- B. Streamlit: consistente con apps existentes, pero plano más tosco y lento.
- C. 3D desde el inicio: vistoso pero peor para leer huecos → fase 2.
Elegido A por el usuario ("la mejor, interactiva y que se vea bien").

## Diseño (llamadas mías, corregibles)
- Página única publicada como artifact; todo el cálculo en el navegador (los datos no salen del equipo).
- Plano: vista de planta con pasillos como columnas; cada módulo un casillero dividido en 3 niveles; colores
  vacío / surtido / almacenamiento / con vencimiento. Zoom y paneo; clic en casillero → detalle (SKU, cantidad, LPN).
- Filtros: nivel (1/2/3/todos), pasillo, buscar SKU (resalta dónde está).
- Panel KPI: posiciones totales, ocupadas, libres, % por pasillo y por nivel (barra ordenada: dónde hay más espacio).
- Universo de posiciones: inferido como módulos 1..máx de cada pasillo × niveles, hasta tener el maestro de ubicaciones
  (se podrá subir y reemplaza la inferencia).
- Pasillo 19: ocupación en pallets = cantidad / norma cajas-pallet si se sube la BBDD; si no, "ubicación con stock".
- Stage: lista por STREC con LPN y SKU; para cada SKU, posiciones vacías en pasillos donde ese SKU ya está, si no
  las vacías más cercanas en nivel 02/03. Exportable a CSV con ADC (origen, destino, SKU, cantidad, motivo).
- Trae precargada la cuadratura del 12-11 como demo.

## Pendiente del usuario
- Ejemplo del archivo de operaciones de vida útil.
- (Opcional) maestro de ubicaciones y BBDD de norma cajas/pallet.

---
## Extensión 2 (aprobada 19-11): Consolidar P19 y Llenado de picking

### Consolidar P19
- Percha = un solo código; diferencia entre caducidades ≤ 30 días; máx. 14 pallets (parámetros editables).
- Orden dentro de la percha lo resuelve el gruero (lo más próximo a vencer adelante) → no se modela.
- Completar: percha de un código con cupo ← LPN del mismo código desde almacenamiento (niveles 2–3, ALMPIC/ALMAC), por FEFO, si la ventana sigue ≤ 30 días.
- Asignar: códigos que no están en P19 y tienen ≥ 6 LPN en almacenamiento → perchas vacías, luego perchas liberables (≤ 3 pallets) si se libera más de lo que cuesta sacar sus pallets.
- Liberar: los pallets de una percha liberable van a posiciones libres reales (nivel 2–3), primero en el pasillo de su preferencia.
- Indicador: posiciones de almacenamiento liberadas netas. Movimientos con ADC.

### Llenado de picking
- Espacio = capacidad máxima (hoja UBICACIONES, "Piezas" = cajas) − stock actual de la ubicación de surtido con preferencia.
- Orígenes: ALMAC, ALMPIC, MIX-01, REBA-01, STREC*. Orden FEFO; a igual fecha, restos primero.
- Un LPN se mueve completo solo si cabe (así libera su posición); si se salta un LPN que vence antes, se marca aviso FEFO.
- Indicador: posiciones liberadas; movimientos con ADC.
