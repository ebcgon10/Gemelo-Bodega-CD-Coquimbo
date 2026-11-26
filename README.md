# Gemelo Bodega · CD CCU Coquimbo

Plano interactivo de la bodega del CD Coquimbo que pinta cada posición con los datos exportados del WMS
(cuadratura de stock y operaciones de vida útil) para ver la **ocupación real**, los **niveles bloqueados** y sugerir movimientos.

## Qué hace
- **Plano**: Bodega 1 (pasillo 19 en U, perchas de 14 pallets), Picking 1 y 2 (pasillos 1–16 en U: 1–18 una cara, 19–20 cabecera, 21–38 otra cara),
  perchas de picking de un solo nivel en el pasillo 10 (módulos 1–18, 5 pallets) y 11 (21–38, 8 pallets), Bodega 2 (18: racks en muros y dos bloques centrales de doble cara según croquis; numeración provisoria en B18_TRAMOS de app.js), bodega chica (17),
  stage C1 (REBA-01, STREC01–06) y carpa C5 (REBA-02, 120 perchas, ~1.500 pallets).
- **Capacidad completa vs real**: descuenta niveles bloqueados por altura del pallet de picking y picking de doble espacio (hoja de preferencias).
- **Capacidad total de bodega (pallets)**: pasillos 1–16, 18 y 19 desde la hoja MAESTRO UBI (sin pasillo 17 ni carpa C5, que va aparte con ~1.500 pallets).
  Capacidades fijas de perchas: P10 = 5, P11 = 8, P19 = 14 (19-01 a 19-22) y 10 (19-23 a 19-44). Disponibles = capacidad real − ocupados;
  los restos remontados cuentan por cajas ÷ cajas por pallet. El Resumen muestra estos mismos números.
- **Stage C1**: destino sugerido para cada LPN por FEFO, en su pasillo o zona de trabajo.
- **Picking bloqueado**: doble altura, doble espacio, surtido sin preferencia, preferencias duplicadas o sin stock.
- **Consolidar P19**: completa perchas del mismo código, libera perchas con pocos pallets y asigna perchas a códigos con mucho volumen
  (un código por percha, ventana de caducidad ≤ 30 días, máx. 14 pallets; parámetros editables).
- **Llenado de picking**: llena cada ubicación de surtido hasta su capacidad con LPN completos (FEFO, restos primero) para liberar posiciones.
- **Carpa C5 (REBA-02)**: traslado de aguas (centro 8006) y gaseosas (9006) según la BBDD de materiales, desde STREC, racks y pasillo 19,
  con plan de una percha por código.
- Todo movimiento se exporta como **ADC** (control de cambios) y como **hoja de ruta imprimible** para el gruero (mismo formato que Reabasto ZM: por pasillo, check y firmas, A4 apaisado).

Los datos se procesan solo en el navegador; no se envían a ningún servidor.

## Estructura
```
src/index.html   página (estilos y estructura)
src/model.js     cálculo: lectura de CSV, posiciones, bloqueos, sugerencias, consolidación y llenado
src/app.js       interfaz: plano SVG, paneles, exportación ADC
src/data/        datos de demo (no incluidos, ver LEEME.md)
test/            pruebas (node --test) y prueba de interfaz (Playwright)
docs/            diseño y plan
```

## Uso local
```bash
cd src
python3 -m http.server 8000
# abrir http://localhost:8000 y arrastrar los CSV / el Excel "Datos para armar"
```

## Pruebas
```bash
node --test test/*.test.js
```

Archivos que lee: cuadratura de stock, operaciones de vida útil, Excel "Datos para armar" (preferencias, zonas, capacidades, maestro de ubicaciones) y BBDD de materiales (centro por código).

Proyecto de Elías Cortés (Planificador y Control Bodega, CCU Chile).
