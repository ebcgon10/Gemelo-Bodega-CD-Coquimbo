const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/model.js');

const rows = [
  { sku: 'A1', desc: 'PEPSI <3L>', lpn: 'L000123', vu: 40, origen: '05-01-02', destino: '19-07-01', qty: 80, tipo: 'asignar' },
  { sku: 'B2', desc: 'AGUA', lpn: 'L000124', vu: 20, origen: 'STREC01', destino: 'REBA-02 · F01-L', qty: 60 },
  { sku: 'C3', desc: 'KEM', lpn: 'L000125', vu: 30, origen: '05-09-03', destino: '19-02-01', qty: 70, tipo: 'liberar' }
];

test('hojaRuta: formato de hoja de ruta, agrupa por pasillo, escapa texto', () => {
  const h = M.hojaRuta(rows, { titulo: 'Consolidar P19 / Hoja de Ruta', emision: '20-11-2026 19:00', agrupar: 'origen' });
  assert.match(h, /CONSOLIDAR P19 \/ HOJA DE RUTA|Consolidar P19 \/ Hoja de Ruta/);
  assert.match(h, /Fecha emisión:<\/strong> 20-11-2026 19:00/);
  assert.match(h, /Pasillo 05/);
  assert.match(h, /Stage C1 · STREC01/);
  assert.match(h, /PEPSI &lt;3L&gt;/);
  assert.ok(!h.includes('<3L>'));
  assert.match(h, /Check \(✓\)/);
  assert.match(h, /@page \{ size: A4 landscape/);
  assert.match(h, /Operario:/);
  assert.match(h, /Tareas: 3/);
  // liberar va primero dentro de su pasillo
  const iC3 = h.indexOf('C3'), iA1 = h.indexOf('A1');
  assert.ok(iC3 < iA1);
});

test('hojaRuta modo pasillo: salto de página entre grupos', () => {
  const h = M.hojaRuta(rows, { titulo: 'X', emision: 'x', agrupar: 'origen', modo: 'pasillo' });
  assert.strictEqual((h.match(/class="salto"/g) || []).length, 1);
});

test('hojaRuta: el grupo con tareas de liberar va primero', () => {
  const r = [{ sku: 'A', desc: 'a', origen: '05-01-02', destino: '19-07-01', qty: 1, tipo: 'asignar' },
             { sku: 'Z', desc: 'z', origen: '19-07-01', destino: '08-01-02', qty: 1, tipo: 'liberar' }];
  const h = M.hojaRuta(r, { agrupar: 'origen' });
  assert.ok(h.indexOf('Pasillo 19 &nbsp;') < h.indexOf('Pasillo 05 &nbsp;'));
});
