const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/model.js');

test('parseCSV: ; + BOM + comillas', () => {
  const r = M.parseCSV('﻿a;b;c\n1;"x;y, z";3\r\n4;5;6\n');
  assert.deepStrictEqual(r.headers, ['a', 'b', 'c']);
  assert.strictEqual(r.rows.length, 2);
  assert.strictEqual(r.rows[0].b, 'x;y, z');
});

test('parseCSV: comas y comillas dobles escapadas', () => {
  const r = M.parseCSV('a,b\n"he said ""hi""",2\n');
  assert.strictEqual(r.rows[0].a, 'he said "hi"');
});

test('parseUbic', () => {
  assert.strictEqual(M.parseUbic('03-05-01-04').pos, '03-05-01');
  assert.strictEqual(M.parseUbic('03-05-01-04').n, 1);
  assert.strictEqual(M.parseUbic('STREC01'), null);
  assert.strictEqual(M.parseUbic('1001'), null);
});

test('detectKind', () => {
  assert.strictEqual(M.detectKind(['almacen', 'area', 'ubicacion', 'articulo', 'cantidad']), 'cuadratura');
  assert.strictEqual(M.detectKind(['Almacen', 'Area', 'Ubicacion', 'LPN', 'Articulo', 'Vida util']), 'vidautil');
  assert.strictEqual(M.detectKind(['foo', 'bar']), null);
});

test('fecha dd/mm/aaaa', () => {
  assert.strictEqual(M.parseFecha('05/02/2027 00:00'), '2027-02-05');
  assert.strictEqual(M.parseFecha(''), null);
});

const VU = 'Almacen,Area,Ubicacion,LPN,Articulo,Descripcion,Cantidad,Estado de inventario,Vida util,Vida util pond,Fecha de fabricacion,Fecha de caducidad\n' +
  'C,ALMPIC,02-03-02-01,L1,A1,PROD A,10,D,20,x,01/01/2026 00:00,05/02/2027 00:00\n' +
  'C,SURTID,02-01-01-01,L2,A2,PROD B,5,D,200,x,,\n' +
  'C,SURTID,02-01-01-02,L3,A3,PROD C,5,D,100,x,,\n' +
  'C,ALMAC,19-02-01-01,P1,A1,PROD A,80,D,300,x,,\n' +
  'C,ALMAC,19-02-01-01,P2,A1,PROD A,80,D,300,x,,\n' +
  'C,ALMAC,19-02-01-01,P2,A1,PROD A,80,D,301,x,,\n' +
  'C,PATCA,STREC01,S1,A3,PROD C,50,D,250,x,,\n' +
  'C,PATCA,STREC01,S2,A1,PROD A,50,D,250,x,,\n' +
  'C,PATCA,STREC01,S3,A9,PROD Z,50,D,250,x,,\n' +
  'C,REEM,REEMP-01,R1,A1,PROD A,50,REMP,250,x,,\n';

function mk() {
  const p = M.parseCSV(VU);
  return M.buildModel(M.normalize(p.rows, M.detectKind(p.headers)));
}

test('universo y ocupación por pasillo', () => {
  const m = mk();
  const a2 = m.kpi.porPasillo.find(x => x.p === 2);
  assert.strictEqual(a2.total, 114); // layout conocido 38 módulos × 3 niveles
  assert.strictEqual(a2.ocup, 2);    // 02-01-01 (2 subpos) y 02-03-02
  assert.strictEqual(m.positions.get('02-01-01').items.length, 2);
  assert.strictEqual(m.positions.get('02-03-02').minVU, 20);
  assert.strictEqual(m.positions.get('02-02-01').status, 'vacia');
});

test('pasillo 19: pallets por LPN distinto y capacidad 14', () => {
  const m = mk();
  assert.strictEqual(m.positions.get('19-02-01').pallets, 2);
  assert.strictEqual(m.kpi.p19.pallets, 2);
  assert.strictEqual(m.kpi.p19.capacidad, 44 * 14);
  assert.ok(m.positions.has('19-44-01'));
});

test('stage separado y fuera del % de ocupación', () => {
  const m = mk();
  const s = m.stage.find(x => x.id === 'STREC01');
  assert.strictEqual(s.lpns, 3);
  assert.strictEqual(m.positions.has('STREC01'), false);
  assert.ok(!m.kpi.porPasillo.some(x => isNaN(x.p)));
});

test('suggestStage: prioriza pasillo del SKU y no repite destino', () => {
  const m = mk();
  const sug = M.suggestStage(m, 'STREC01');
  assert.strictEqual(sug.length, 3);
  const a1 = sug.find(x => x.lpn === 'S1');
  assert.strictEqual(a1.destino.slice(0, 2), '02');
  assert.match(a1.motivo, /mismo pasillo/i);
  const dest = sug.filter(x => x.destino).map(x => x.destino);
  assert.strictEqual(new Set(dest).size, dest.length);
  for (const d of dest.filter(x => !x.startsWith('19'))) assert.notStrictEqual(d.split('-')[2], '01'); // no a surtido
});

test('suggestStage: SKU que ya está en Bodega 1 va a su percha con cupo', () => {
  const m = mk();
  const s2 = M.suggestStage(m, 'STREC01').find(x => x.lpn === 'S2');
  assert.strictEqual(s2.destino, '19-02-01');
});

test('fix: subposición de 3 dígitos (P17) se agrupa en su posición', () => {
  assert.strictEqual(M.parseUbic('17-01-01-100').pos, '17-01-01');
});

test('fix: comilla suelta dentro de un campo no rompe la fila', () => {
  const r = M.parseCSV('a,b\nTV 32" LED,2\n');
  assert.strictEqual(r.rows[0].b, '2');
});

test('fix: fila de cuadratura con varios LPN se reparte en varias posiciones', () => {
  const csv = 'almacen,area,descripcion_area,ubicacion,articulo,descripcion,estado_de_inventario,lpn,cantidad\n' +
    'C,ALMPIC,x,05-01-02-01,A1,PROD A,D,1,10\nC,PATCA,x,STREC01,A1,PROD A,D,3,30\n';
  const p = M.parseCSV(csv); const m = M.buildModel(M.normalize(p.rows, 'cuadratura'));
  const sug = M.suggestStage(m, 'STREC01');
  const dest = sug.filter(s => s.destino).map(s => s.destino);
  assert.strictEqual(dest.length, 3);
  assert.strictEqual(new Set(dest).size, 3);
  assert.ok(sug.every(s => s.pallets === 1));
});

test('fix: suggestAll no repite destino entre zonas', () => {
  const m = mk();
  const all = M.suggestAll(m);
  const dest = Object.values(all).flat().filter(s => s.destino && !s.destino.startsWith('19')).map(s => s.destino);
  assert.strictEqual(new Set(dest).size, dest.length);
  assert.ok(all['STREC01'].length === 3);
});

test('modulePlace: pasillo en U (1–18 cara, 19–20 cabecera, 21–38 otra cara)', () => {
  assert.deepStrictEqual(M.modulePlace(38, 1), { side: 'L', i: 0, k: 18 });
  assert.deepStrictEqual(M.modulePlace(38, 18), { side: 'L', i: 17, k: 18 });
  assert.deepStrictEqual(M.modulePlace(38, 19), { side: 'H', i: 0, k: 18 });
  assert.deepStrictEqual(M.modulePlace(38, 20), { side: 'H', i: 1, k: 18 });
  assert.deepStrictEqual(M.modulePlace(38, 21), { side: 'R', i: 0, k: 18 });
  assert.deepStrictEqual(M.modulePlace(38, 38), { side: 'R', i: 17, k: 18 });
  assert.deepStrictEqual(M.modulePlace(42, 21), { side: 'H', i: 0, k: 20 });
  assert.deepStrictEqual(M.modulePlace(40, 22), { side: 'R', i: 0, k: 19 });
});

test('perchas de picking: P10 1–18 (6 pallets) y P11 21–38 (10) tienen un solo nivel', () => {
  const H = 'Almacen,Area,Ubicacion,LPN,Articulo,Descripcion,Cantidad,Estado de inventario,Vida util,Vida util pond,Fecha de fabricacion,Fecha de caducidad\n';
  const vu = H + 'C,SURTID,10-02-01-01,L1,A,PA,120,D,90,x,,\n';
  const caps = M.parseCaps(M.parseCSV('NOMBRE UBICACIÓN,AREA,PASILLO,CAPACIDAD MAXIMA\n10-02-01-01,SURTID,10,240 Piezas\n').rows);
  const m = M.buildModel(M.normalize(M.parseCSV(vu).rows, 'vidautil'), { caps });
  assert.strictEqual(m.positions.has('10-05-02'), false);
  assert.strictEqual(m.positions.has('10-05-03'), false);
  assert.strictEqual(m.positions.has('10-25-02'), true);
  assert.strictEqual(m.positions.has('11-25-02'), false);
  assert.strictEqual(m.positions.has('11-05-02'), true);
  const P = m.positions.get('10-02-01');
  assert.strictEqual(P.percha, 6);
  assert.strictEqual(P.fill, 0.5);
  assert.strictEqual(P.palletsEst, 3);
  assert.strictEqual(m.positions.get('11-30-01').percha, 10);
  assert.strictEqual(m.kpi.porPasillo.find(x => x.p === 10).total, 38 + 20 * 2);
});
