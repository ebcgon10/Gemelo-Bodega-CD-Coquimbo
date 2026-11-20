# Gemelo digital bodega CD Coquimbo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página web única e interactiva que dibuja la bodega y pinta cada posición con la cuadratura / vida útil del WMS.

**Architecture:** Lógica pura en `src/model.js` (parseo CSV, universo de posiciones, ocupación, sugerencias de stage), probada con `node --test`. Interfaz en `src/app.html` + `src/app.js` (SVG del plano, paneles). `build.py` incrusta model.js, app.js y datos demo (compactados) en `dist/index.html`, que se publica como artifact.

**Tech Stack:** JS vanilla (ES2020), SVG, node:test, Python solo para el build. Sin dependencias externas.

**Spec:** `docs/2026-11-19-gemelo-bodega-coquimbo-design.md`

## Global Constraints
- Ubicación `PP-MM-NN-SS`; posición física = `PP-MM-NN`. Nivel 01 = surtido, 02–03 = almacenamiento.
- Pasillo 19 = 44 perchas, capacidad 14 pallets c/u; ocupación = nº LPN distintos (vida útil).
- Stage = `STREC01`–`STREC06` + `REBA-01`, dibujados dentro de C1. Excluir del % de ocupación todo lo que no sea `PP-MM-NN-SS`.
- Vida útil: columna `Vida util` = días a caducidad. Bandas: ≤30 rojo, ≤60 naranjo, ≤90 amarillo.
- Si se cargan ambos archivos, la ocupación sale del más completo en LPN (vida útil); la cuadratura queda como respaldo.
- Textos en español de Chile. Datos se procesan solo en el navegador.

## Review Focus
- CSV con `;` como separador o BOM (exportado desde Excel) → se debe parsear igual.
- Comillas con comas dentro de la descripción → no romper columnas.
- Ubicación con subposición alta (vino `03-05-01-04`) → cae en la posición `03-05-01`, no crea casillero nuevo.
- Archivo sin columna reconocible → mensaje claro, no pantalla en blanco.
- Fechas `dd/mm/aaaa hh:mm` → no confundir día y mes.

---

### Task 1: Modelo de datos (`src/model.js`)

**Files:** Create `src/model.js`, `test/model.test.js`

**Interfaces — Produces:**
- `parseCSV(text: string) -> {headers: string[], rows: object[]}` (detecta `,`/`;`, BOM, comillas)
- `detectKind(headers) -> 'cuadratura'|'vidautil'|null`
- `normalize(rows, kind) -> Rec[]` con `Rec = {ubic, area, sku, desc, qty:number, lpn:string|null, vu:number|null, cad:string|null, estado}`
- `parseUbic(u) -> {p,m,n,s,pos}|null`
- `buildModel(recs: Rec[]) -> {positions: Map<pos, Pos>, aisles: Aisle[], stage: StageArea[], kpi}`
  - `Pos = {pos,p,m,n, items: Rec[], pallets:number, minVU:number|null, status:'vacia'|'surtido'|'almac'}`
  - universo: módulos 1..max de cada pasillo × niveles 1..max (pasillo 19: 44×1, capacidad 14)
  - `kpi = {total, ocupadas, libres, pctOcc, porPasillo:[{p,total,ocup,libres}], porNivel:[...], p19:{pallets, capacidad:616}}`
- `suggestStage(model, stageArea) -> [{lpn, sku, desc, qty, origen, destino, motivo}]` (vacías en pasillos donde ya está el SKU, luego vacías nivel 02/03 de pasillos con más libres; un destino por LPN, sin repetir)

- [ ] Tests: parseo con `;` + BOM + comillas; `parseUbic('03-05-01-04').pos==='03-05-01'`; `parseUbic('STREC01')===null`; con fixture de 3 filas, pasillo 02 con max módulo 3 → 9 posiciones, 3 ocupadas; pasillo 19 cuenta pallets por LPN distinto; `suggestStage` nunca asigna dos LPN a la misma posición; fecha `05/02/2027 00:00` → `2027-02-05`.
- [ ] Run `node --test test/` → FAIL, implementar, → PASS.
- [ ] Verificar con los CSV reales: total ≈ 2.055 posiciones, libres ≈ 341 (cuadratura).

### Task 2: Interfaz (`src/app.html`, `src/app.js`) y build

**Files:** Create `src/app.html`, `src/app.js`, `build.py`; Output `dist/index.html`

**Interfaces — Consumes:** todo lo de Task 1.

- [ ] Layout SVG: Bodega 1 (19) a la izquierda, pasillos 1–16 de poniente a oriente, Bodega 2 (18) al poniente, bodega 17 abajo, C1 abajo de picking con REBA-01 (recuadro vertical) y STREC (recuadro grande). Cada pasillo = dos caras de racks con módulos impares/pares; cada módulo = 3 franjas de nivel.
- [ ] Interacción: zoom/paneo (rueda + arrastre), tooltip, clic → panel de detalle, filtro nivel, buscador SKU, modo color Ocupación / Vida útil.
- [ ] Paneles: KPI, ranking de pasillos con más libres, tarjeta stage con sugerencias y botón exportar CSV con ADC (fecha, origen, destino, SKU, cantidad, motivo, responsable, estado).
- [ ] Carga de archivos por arrastrar/seleccionar; demo precargada (vida útil del 19-11 + cuadratura 12-11).
- [ ] `python3 build.py` genera `dist/index.html`; abrir con navegador headless/inspección y revisar que no hay errores de consola y que los KPI coinciden con Task 1.
- [ ] Publicar artifact.
