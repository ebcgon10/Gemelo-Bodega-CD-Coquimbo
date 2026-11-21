const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/model.js');

const H = 'Almacen,Area,Ubicacion,LPN,Articulo,Descripcion,Cantidad,Estado de inventario,Vida util,Vida util pond,Fecha de fabricacion,Fecha de caducidad\n';
const row = (area, ub, lpn, sku, qty, vu) => `C,${area},${ub},${lpn},${sku},D ${sku},${qty},D,${vu},x,,\n`;
const BB = 'Numero de material,Texto breve de material,Cajas por Pallet,Centro,Grupo de articulos\n' +
  'G1,PEPSI,80,9006,Pasillo 2.0\nA1,CACHANTUN,100,8006,Pasillo 1.5/1.6\nB1,CRISTAL,60,2306,Lata\n';
const rows = s => M.parseCSV(s).rows;
const build = vu => M.buildModel(M.normalize(rows(H + vu), 'vidautil'));

test('detectKind y parseBBDD', () => {
  assert.strictEqual(M.detectKind(M.parseCSV(BB).headers), 'bbdd');
  const b = M.parseBBDD(rows(BB));
  assert.strictEqual(b.get('G1').centro, '9006');
  assert.strictEqual(b.get('A1').cajasPallet, 100);
});

test('C5: solo centros 8006/9006, desde STREC, racks N2–N3 y P19; nunca surtido', () => {
  const vu = row('PATCA', 'STREC01', 'S1', 'G1', 80, 50) + row('PATCA', 'STREC02', 'S2', 'B1', 60, 50) +
    row('ALMPIC', '05-01-02-01', 'R1', 'A1', 100, 60) + row('SURTID', '05-01-01-01', 'P1', 'A1', 20, 40) +
    row('ALMAC', '19-04-01-01', 'Q1', 'G1', 80, 55) + row('PATCA', 'REBA-01', 'X1', 'G1', 80, 52);
  const r = M.moveToC5(build(vu), M.parseBBDD(rows(BB)), {});
  assert.deepStrictEqual(r.moves.map(m => m.lpn).sort(), ['Q1', 'R1', 'S1']);
  assert.ok(r.moves.every(m => m.destino === 'REBA-02'));
  assert.strictEqual(r.liberadas, 1);       // 05-01-02 queda vacía
  assert.strictEqual(r.stageLpn, 1);
  assert.strictEqual(r.p19Pallets, 1);
});

test('C5: un código por percha, ventana de fechas y capacidad por percha', () => {
  let vu = '';
  for (let i = 1; i <= 16; i++) vu += row('PATCA', 'STREC01', 'S' + i, 'G1', 80, i <= 15 ? 50 : 200);
  const r = M.moveToC5(build(vu), M.parseBBDD(rows(BB)), { ventana: 30 });
  const plan = r.perchas.filter(p => p.sku);
  assert.ok(plan.every(p => p.pallets <= p.cap));
  assert.ok(plan.every(p => p.spread <= 30));
  assert.strictEqual(new Set(plan.map(p => p.sku)).size, 1);
  assert.strictEqual(plan.reduce((s, p) => s + p.pallets, 0), 16);
  assert.ok(r.moves.every(m => m.percha));
});

test('C5: respeta lo que ya hay en REBA-02 y avisa si no cabe', () => {
  let vu = '';
  for (let i = 1; i <= 5; i++) vu += row('PATCA', 'REBA-02', 'E' + i, 'A1', 100, 90);
  for (let i = 1; i <= 4; i++) vu += row('PATCA', 'STREC01', 'S' + i, 'G1', 80, 50);
  const r = M.moveToC5(build(vu), M.parseBBDD(rows(BB)), { capacidad: 7 });
  assert.strictEqual(r.moves.length, 2);
  assert.strictEqual(r.sinEspacio, 2);
});

test('C5 con plan fijado: los pallets ya movidos cuentan y el resto mantiene sus perchas', () => {
  let vu1 = '';
  for (let i = 1; i <= 16; i++) vu1 += row('ALMPIC', `05-${String(i).padStart(2, '0')}-02-01`, 'G' + i, 'G1', 80, 50);
  for (let i = 1; i <= 5; i++) vu1 += row('PATCA', 'STREC01', 'A' + i, 'A1', 100, 60);
  const bb = M.parseBBDD(rows(BB));
  const r1 = M.moveToC5(build(vu1), bb, {});
  const plan = M.planC5(r1);
  const percha1 = {}; r1.moves.forEach(m => { percha1[m.lpn] = m.percha; });
  // ya se movieron G1..G10 y A1..A2 a REBA-02
  let vu2 = '';
  for (let i = 1; i <= 16; i++) vu2 += i <= 10 ? row('PATCA', 'REBA-02', 'G' + i, 'G1', 80, 50) : row('ALMPIC', `05-${String(i).padStart(2, '0')}-02-01`, 'G' + i, 'G1', 80, 50);
  for (let i = 1; i <= 5; i++) vu2 += row('PATCA', i <= 2 ? 'REBA-02' : 'STREC01', 'A' + i, 'A1', 100, 60);
  vu2 += row('PATCA', 'STREC02', 'N1', 'A1', 100, 61);   // llega otro pallet del mismo código
  const r2 = M.moveToC5(build(vu2), bb, {}, plan);
  assert.deepStrictEqual(r2.moves.filter(m => m.lpn !== 'N1').map(m => m.lpn + ':' + m.percha).sort(),
    ['A3', 'A4', 'A5', 'G11', 'G12', 'G13', 'G14', 'G15', 'G16'].map(l => l + ':' + percha1[l]).sort());
  assert.strictEqual(r2.ocupacionFinal, 22);
  const pA = r2.perchas.filter(p => p.sku === 'A1');
  assert.ok(pA.every(p => plan.some(q => q.id === p.id && q.sku === 'A1')));
  assert.strictEqual(r2.perchas.find(p => p.id === percha1.G1).existente, 10);
});
