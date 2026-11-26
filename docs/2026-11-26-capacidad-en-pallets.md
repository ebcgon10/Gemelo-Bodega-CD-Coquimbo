# Capacidad de bodega en pallets: antes vs ahora (26-11-2026)

## Qué fallaba
En la presentación se cuestionó la capacidad del gemelo: NEWEN (Revit) muestra 2.611 pallets y el gemelo mostraba 1.983 con 96 % de ocupación.
No medían lo mismo:

| | Antes | Ahora |
|---|---|---|
| Unidad | Ubicaciones del WMS (una percha = 1) | Pallets que caben en cada ubicación |
| Alcance | Solo picking, pasillos 1–16 | Pasillos 1–16, 18 y 19 (sin 17; carpa C5 aparte, 1.500 pallets) |
| Perchas | 1 por percha | Fijas: P10 = 5, P11 = 8, P19 = 14 (19-01 a 19-22) y 10 (19-23 a 19-44) |
| Restos remontados | Cada LPN contaba como pallet entero | Cajas ÷ cajas por pallet (BBDD); lo que pasa de la capacidad se muestra como remontado |
| Disponibles | No cuadraban con capacidad − ocupados | Capacidad real − ocupados = disponibles, exacto |
| Subposiciones (vino, P18) | — | Agrupadas en su posición física: 1 pallet base, no suman capacidad |

El 96 % no estaba mal calculado: era la ocupación de posiciones de picking del corte 12-11, no de la bodega completa.

## Reglas de cálculo (src/model.js · capacityReport)
- Universo: hoja MAESTRO UBI de "Datos para armar", agrupada en posición física PP-MM-NN.
- Capacidad: Palés del WMS en racks N2–N3 (pasillo 1 = 3); surtido N1 = 1 pallet base; perchas fijas (arriba).
- Ocupación: P19 por LPN; resto por cajas ÷ cajas por pallet (mínimo 1 si hay stock); surtido N1 = 1 si tiene stock.
- Capacidad real = completa − posiciones vacías bloqueadas por altura (N2) o doble espacio (N1), según preferencias.
- Fuera: pasillo 17 y niveles 2–3 de P10/P11 (creados en el WMS, pero son perchas de un nivel).

## Resultado con la cuadratura del 26-11 16:34
| Zona | Cap. real | Ocupados | Disponibles | % |
|---|---|---|---|---|
| Picking N1 surtido | 556 | 526 | 30 | 95 % |
| Picking N2–N3 | 1.099 | 781 | 318 | 71 % |
| Perchas P10/P11 | 234 | 126 | 108 | 54 % |
| Pasillo 18 · Bodega 2 | 168 | 160 | 8 | 95 % |
| Pasillo 19 · Bodega 1 | 528 | 231 | 297 | 44 % |
| **Total** | **2.585** | **1.824** | **761** | **71 %** |

Capacidad completa 2.762 pallets (−177 bloqueados). +30 pallets remontados sobre capacidad. Carpa C5: 303 de 1.500.
Mismo corte medido como antes (posiciones de picking): 1.983 / 1.806 reales, 85 %.

## Datos del maestro a validar en el WMS
- 15-38-01-01 dice "45 Palés" (se usa 1).
- 02-07-01-03 figura con pasillo 18.
