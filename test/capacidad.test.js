const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/model.js');

const MAESTRO = 'UBICACIÓN,AREA,PASILLO,CAPACIDAD MAXIMA\n' +
  '02-01-01-01,SURTID,2,40 Piezas\n02-01-02-01,ALMPIC,2,1 Palés\n02-01-03-01,ALMPIC,2,1 Palés\n' +
  '01-01-02-01,ALMPIC,1,3 Palés\n' +
  '10-01-01-01,SURTID,10,240 Piezas\n10-01-02-01,ALMPIC,10,1 Palés\n' +
  '15-38-01-01,SURTID,15,45 Palés\n' +
  '17-01-01-01,SURTID,17,9 Piezas\n' +
  '19-01-01-01,ALMAC,19,14 Palés\n19-02-01-01,ALMAC,19,14 Palés\n19-30-01-01,ALMAC,19,14 Palés\n';
const CUAD = 'area,ubicacion,articulo,descripcion,estado_de_inventario,lpn,cantidad\n' +
  'SURTID,02-01-01-01,A1,PROD A,D,1,10\n' +
  'ALMPIC,02-01-02-01,A1,PROD A,D,1,20\nALMPIC,02-01-02-01,B1,PROD B,D,1,10\nALMPIC,02-01-02-01,C1,PROD C,D,1,10\n' +
  'SURTID,10-01-01-01,P1,PERCHA,D,1,250\n' +
  'ALMAC,19-01-01-01,X1,PROD X,D,5,500\n' +
  'ALMAC,REBA-02,W1,AGUA,D,7,700\n';
const BB = new Map([['A1', { cajasPallet: 40 }], ['B1', { cajasPallet: 40 }], ['C1', { cajasPallet: 40 }], ['P1', { cajasPallet: 50 }], ['X1', { cajasPallet: 100 }]]);

function rep(o) {
  const c = M.parseCSV(CUAD), model = M.buildModel(M.normalize(c.rows, 'cuadratura'));
  const mp = M.parseCSV(MAESTRO);
  assert.strictEqual(M.detectKind(mp.headers), 'maestro');
  return M.capacityReport(model, M.parseMaestro(mp.rows), Object.assign({ bbdd: BB }, o));
}

test('capacidad en pallets por tipo de ubicación', () => {
  const R = rep();
  const pos = id => R.posiciones.find(x => x.pos === id);
  assert.strictEqual(pos('02-01-01').cap, 1);       // surtido = 1 pallet base
  assert.strictEqual(pos('01-01-02').cap, 3);       // Palés del WMS
  assert.strictEqual(pos('10-01-01').cap, 5);       // percha P10 fija
  assert.strictEqual(pos('19-01-01').cap, 14);
  assert.ok(!pos('10-01-02'), 'N2 de percha P10 fuera');
  assert.ok(!R.posiciones.some(x => x.p === 17), 'pasillo 17 fuera');
  assert.strictEqual(R.excluidas.p17, 1);
  assert.strictEqual(pos('15-38-01').cap, 1);       // 45 palés = dato a validar
  assert.ok(R.anomalias.some(a => a.pos === '15-38-01'));
});

test('restos remontados pesan por cajas, no por LPN', () => {
  const X = rep().posiciones.find(x => x.pos === '02-01-02');
  assert.strictEqual(X.lpn, 3);
  assert.strictEqual(X.pal, 1);                      // 40 cajas / 40 = 1 pallet
  assert.ok(X.remonte);
  assert.strictEqual(rep().posiciones.find(x => x.pos === '10-01-01').pal, 5); // 250 / 50
});

test('P19 mitad de 14 y mitad de 10, disponibles cuadran y C5 aparte', () => {
  const R = rep();
  const pos = id => R.posiciones.find(x => x.pos === id);
  assert.strictEqual(pos('19-01-01').cap, 14);
  assert.strictEqual(pos('19-30-01').cap, 10);
  assert.strictEqual(R.zonas.find(z => z.id === 'p19').cap, 38);
  for (const z of R.zonas.concat([R.total])) assert.strictEqual(z.capReal - z.ocup, z.libres, z.label);
  assert.strictEqual(R.fuera.c5.pal, 7);
  assert.strictEqual(R.fuera.c5.cap, 1500);
});
