const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/model.js');

const H = 'Almacen,Area,Ubicacion,LPN,Articulo,Descripcion,Cantidad,Estado de inventario,Vida util,Vida util pond,Fecha de fabricacion,Fecha de caducidad\n';
const row = (area, ub, lpn, sku, qty, vu) => `C,${area},${ub},${lpn},${sku},D ${sku},${qty},D,${vu},x,,\n`;
const PREFH = 'Ubicación,Número de artículo,Posicion Picking NIVEL 1,Posicion Picking NIVEL 2\n';
const CAPH = 'NOMBRE UBICACIÓN,AREA,PASILLO,CAPACIDAD MAXIMA\n';
const rows = s => M.parseCSV(s).rows;
function build(vu, pref, cap) {
  return M.buildModel(M.normalize(rows(H + vu), 'vidautil'), {
    prefs: pref ? M.parsePrefs(rows(PREFH + pref)) : [],
    caps: cap ? M.parseCaps(rows(CAPH + cap)) : null
  });
}

test('detectKind y parseCaps leen la hoja UBICACIONES', () => {
  assert.strictEqual(M.detectKind(M.parseCSV(CAPH).headers), 'capacidades');
  const c = M.parseCaps(rows(CAPH + '01-01-01-01,SURTID,1,20 Piezas\n'));
  assert.strictEqual(c.get('01-01-01-01'), 20);
});

test('P19 completar: mismo código, ventana ≤ 30 días, FEFO', () => {
  const vu =
    row('ALMAC', '19-01-01-01', 'P1', 'A', 80, 100) + row('ALMAC', '19-01-01-01', 'P2', 'A', 80, 110) +
    row('ALMPIC', '05-01-02-01', 'X1', 'A', 80, 95) +   // cabe (ventana 95..110)
    row('ALMPIC', '05-02-02-01', 'X2', 'A', 80, 125) +  // 125-95 = 30 → cabe
    row('ALMPIC', '05-03-02-01', 'X3', 'A', 80, 140);   // 140-95 > 30 → no
  const r = M.consolidateP19(build(vu), {});
  const mv = r.moves.filter(m => m.tipo === 'completar').map(m => m.lpn).sort();
  assert.deepStrictEqual(mv, ['X1', 'X2']);
  assert.ok(r.moves.every(m => m.destino !== '19-01-01' || m.sku === 'A'));
  assert.strictEqual(r.liberadas, 2);
});

test('P19 respeta el máximo de pallets', () => {
  let vu = row('ALMAC', '19-01-01-01', 'P1', 'A', 80, 100);
  for (let i = 1; i <= 5; i++) vu += row('ALMPIC', `05-${String(i).padStart(2, '0')}-02-01`, 'X' + i, 'A', 80, 100);
  const r = M.consolidateP19(build(vu), { cap: 3 });
  assert.strictEqual(r.moves.filter(m => m.tipo === 'completar').length, 2);
});

test('P19 asignar: código con mucho volumen a percha vacía, mejor ventana', () => {
  let vu = '';
  for (let i = 1; i <= 7; i++) vu += row('ALMPIC', `06-${String(i).padStart(2, '0')}-03-01`, 'B' + i, 'B', 80, 50 + i);
  vu += row('ALMPIC', '06-20-03-01', 'B9', 'B', 80, 200);
  const r = M.consolidateP19(build(vu), { minPallets: 6 });
  const as = r.moves.filter(m => m.tipo === 'asignar');
  assert.strictEqual(as.length, 7);
  assert.ok(as.every(m => m.destino.startsWith('19-') && m.lpn !== 'B9'));
  assert.strictEqual(new Set(as.map(m => m.destino)).size, 1);
});

test('P19 liberar: percha con pocos pallets se vacía solo si conviene', () => {
  // todas las perchas ocupadas salvo una con 1 pallet de C → liberable
  let vu = '';
  for (let i = 1; i <= 44; i++) vu += row('ALMAC', `19-${String(i).padStart(2, '0')}-01-01`, 'F' + i, i === 7 ? 'C' : 'F' + i, 80, 100) + (i === 7 ? '' : row('ALMAC', `19-${String(i).padStart(2, '0')}-01-01`, 'G' + i, 'F' + i, 80, 100) + row('ALMAC', `19-${String(i).padStart(2, '0')}-01-01`, 'H' + i, 'F' + i, 80, 100) + row('ALMAC', `19-${String(i).padStart(2, '0')}-01-01`, 'I' + i, 'F' + i, 80, 100) + row('ALMAC', `19-${String(i).padStart(2, '0')}-01-01`, 'J' + i, 'F' + i, 80, 100));
  for (let i = 1; i <= 8; i++) vu += row('ALMPIC', `08-${String(i).padStart(2, '0')}-02-01`, 'D' + i, 'D', 80, 60);
  const r = M.consolidateP19(build(vu), { minPallets: 6, liberarMax: 3 });
  const lib = r.moves.filter(m => m.tipo === 'liberar');
  assert.strictEqual(lib.length, 1);
  assert.strictEqual(lib[0].origen, '19-07-01');
  assert.ok(!lib[0].destino.startsWith('19-'));
  assert.strictEqual(r.moves.filter(m => m.tipo === 'asignar' && m.destino === '19-07-01').length, 8);
  assert.strictEqual(r.liberadas, 8 - 1);
});

test('Llenado: llena hasta la capacidad, FEFO, restos primero y libera posición', () => {
  const vu =
    row('SURTID', '05-01-01-01', 'S1', 'A', 10, 90) +
    row('ALMPIC', '05-01-02-01', 'R1', 'A', 20, 80) +   // resto, cabe → libera 05-01-02
    row('ALMPIC', '05-02-02-01', 'R2', 'A', 80, 85) +   // pallet completo, no cabe
    row('ALMPIC', '05-03-02-01', 'R3', 'A', 15, 100);   // resto posterior: cabe, pero se saltó R2 → aviso FEFO
  const m = build(vu, '05-01-01-01,A,1,1\n', '05-01-01-01,SURTID,5,50 Piezas\n');
  const r = M.fillPicking(m);
  assert.deepStrictEqual(r.moves.map(x => x.lpn), ['R1', 'R3']);
  assert.strictEqual(r.moves[0].destino, '05-01-01-01');
  assert.ok(!r.moves[0].avisoFefo);
  assert.ok(r.moves[1].avisoFefo);
  assert.strictEqual(r.liberadas, 2);
  assert.strictEqual(r.moves.reduce((s, x) => s + x.qty, 0) <= 40, true);
});

test('Llenado: no usa surtido como origen ni ubicaciones sin capacidad', () => {
  const vu = row('SURTID', '05-01-01-01', 'S1', 'A', 10, 90) + row('SURTID', '05-09-01-01', 'S2', 'A', 5, 80);
  const r = M.fillPicking(build(vu, '05-01-01-01,A,1,1\n', '05-01-01-01,SURTID,5,50 Piezas\n'));
  assert.strictEqual(r.moves.length, 0);
});

test('fix C1: percha completada no se libera ni mezcla códigos', () => {
  let vu = '';
  for (let i = 1; i <= 44; i++) {
    const pc = `19-${String(i).padStart(2, '0')}-01-01`;
    if (i === 5) { for (let k = 0; k < 3; k++) vu += row('ALMAC', pc, 'A' + k, 'A', 80, 100); continue; }
    for (let k = 0; k < 14; k++) vu += row('ALMAC', pc, 'F' + i + '_' + k, 'F' + i, 80, 100);
  }
  for (let i = 1; i <= 11; i++) vu += row('ALMPIC', `05-${String(i).padStart(2, '0')}-02-01`, 'XA' + i, 'A', 80, 105);
  for (let i = 1; i <= 11; i++) vu += row('ALMPIC', `06-${String(i).padStart(2, '0')}-02-01`, 'XB' + i, 'B', 80, 60);
  const r = M.consolidateP19(build(vu), { liberarMax: 3, minPallets: 6 });
  assert.strictEqual(r.moves.filter(m => m.tipo === 'liberar').length, 0);
  const skus = new Set(r.moves.filter(m => m.destino === '19-05-01').map(m => m.sku));
  assert.deepStrictEqual([...skus], ['A']);
});

test('fix C2: dos preferencias en la misma ubicación comparten la capacidad', () => {
  const vu = row('SURTID', '05-01-01-01', 'S1', 'A', 30, 90) + row('ALMPIC', '05-01-02-01', 'R1', 'B', 40, 80) + row('ALMPIC', '05-02-02-01', 'R2', 'B', 15, 81);
  const m = build(vu, '05-01-01-01,A,1,1\n05-01-01-01,B,1,1\n', '05-01-01-01,SURTID,5,50 Piezas\n');
  const r = M.fillPicking(m);
  assert.deepStrictEqual(r.moves.map(x => x.lpn), ['R2']);
});

test('fix I1: sin días de vida útil se avisa que la ventana no se valida', () => {
  const cu = 'almacen,area,descripcion_area,ubicacion,articulo,descripcion,estado_de_inventario,lpn,cantidad\nC,ALMAC,x,19-01-01-01,A,PA,D,1,80\nC,ALMPIC,x,05-01-02-01,A,PA,D,1,80\n';
  const m = M.buildModel(M.normalize(M.parseCSV(cu).rows, 'cuadratura'));
  assert.strictEqual(M.consolidateP19(m, {}).sinFechas, true);
});

test('fix I2: llenado no cuenta como liberada una posición que conserva pallets', () => {
  const vu = row('SURTID', '05-01-01-01', 'S1', 'A', 10, 90) + row('ALMPIC', '05-01-02-01', 'R1', 'A', 20, 80) + row('SURTID', '05-01-02-02', 'Z1', 'Z', 5, 80) +
    row('ALMAC', '19-03-01-01', 'P1', 'A', 10, 85);
  const r = M.fillPicking(build(vu, '05-01-01-01,A,1,1\n', '05-01-01-01,SURTID,5,50 Piezas\n'));
  assert.deepStrictEqual(r.moves.map(x => x.lpn).sort(), ['P1', 'R1']);
  assert.strictEqual(r.liberadas, 0);
});
