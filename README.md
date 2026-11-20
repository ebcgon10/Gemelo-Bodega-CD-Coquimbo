# Gemelo Bodega · CD CCU Coquimbo

Plano interactivo de la bodega del CD Coquimbo que pinta cada posición con los datos exportados del WMS
(cuadratura de stock y operaciones de vida útil) para ver la **ocupación real**, los **niveles bloqueados** y sugerir movimientos.

## Qué hace
- **Plano**: Bodega 1 (pasillo 19, perchas de 14 pallets), Picking 1 y 2 (pasillos 1–16 en U: 1–18 una cara, 19–20 cabecera, 21–38 otra cara),
  perchas de picking del pasillo 10 (módulos 1–18, 6 pallets) y 11 (21–38, 10 pallets), Bodega 2 (18), bodega chica (17) y stage C1 (REBA-01, STREC01–06).
- **Capacidad completa vs real**: descuenta niveles bloqueados por altura del pallet de picking y picking de doble espacio (hoja de preferencias).
- **Stage C1**: destino sugerido para cada LPN por FEFO, en su pasillo o zona de trabajo.
- **Picking bloqueado**: doble altura, doble espacio, surtido sin preferencia, preferencias duplicadas o sin stock.
- **Consolidar P19**: completa perchas del mismo código, libera perchas con pocos pallets y asigna perchas a códigos con mucho volumen
  (un código por percha, ventana de caducidad ≤ 30 días, máx. 14 pallets; parámetros editables).
- **Llenado de picking**: llena cada ubicación de surtido hasta su capacidad con LPN completos (FEFO, restos primero) para liberar posiciones.
- Todo movimiento se exporta como **ADC** (control de cambios).

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

Proyecto de Elías Cortés (Planificador y Control Bodega, CCU Chile).
