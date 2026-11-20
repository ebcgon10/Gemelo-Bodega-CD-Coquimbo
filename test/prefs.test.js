const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/model.js');

const PREF = 'Ubicación,Número de artículo,Posicion Picking NIVEL 1,Posicion Picking NIVEL 2\n' +
  '05-01-01-01,A1,2,2\n' +   // doble ancho y doble altura: bloquea 05-02-01, 05-01-02, 05-02-02
  '05-05-01-01,A5,1,2\n' +   // doble altura: bloquea 05-05-02
  '05-07-01-01,A7,1,1\n' +   // asignada, sin stock
  '05-09-01-01,A9,1,1\n05-11-01-01,A9,1,1\n'; // preferencia duplicada
const ZON = 'UBICACIÓN,ZONA DE TRABAJO,ZONA DE MOVIMIENTO\n05-01-01-01,ZTLATAS,ZM_CAJ\n';
const VU = 'Almacen,Area,Ubicacion,LPN,Articulo,Descripcion,Cantidad,Estado de inventario,Vida util,Vida util pond,Fecha de fabricacion,Fecha de caducidad\n' +
  'C,SURTID,05-01-01-01,L1,A1,PROD A,10,D,100,x,,\n' +
  'C,SURTID,05-05-01-01,L2,A5,PROD 5,10,D,100,x,,\n' +
  'C,SURTID,05-09-01-01,L3,A9,PROD 9,10,D,100,x,,\n' +
  'C,SURTID,05-13-01-01,L4,A1,PROD A,10,D,100,x,,\n' +   // surtido sin preferencia
  'C,PATCA,STREC01,S1,A1,PROD A,10,D,100,x,,\n';

function mk() {
  const kinds = {};
  for (const t of [PREF, ZON, VU]) { const p = M.parseCSV(t); kinds[M.detectKind(p.headers)] = p.rows; }
  return M.buildModel(M.normalize(kinds.vidautil, 'vidautil'), { prefs: M.parsePrefs(kinds.preferencia), zonas: M.parseZonas(kinds.zonas) });
}

test('detectKind reconoce preferencias y zonas con tildes', () => {
  assert.strictEqual(M.detectKind(M.parseCSV(PREF).headers), 'preferencia');
  assert.strictEqual(M.detectKind(M.parseCSV(ZON).headers), 'zonas');
  assert.strictEqual(M.detectKind(['Ubicación', 'Artículo', 'Cantidad']), 'cuadratura');
});

test('bloqueos por doble ancho y doble altura', () => {
  const m = mk();
  assert.strictEqual(m.positions.get('05-02-01').block, 'ext');
  assert.strictEqual(m.positions.get('05-01-02').block, 'altura');
  assert.strictEqual(m.positions.get('05-02-02').block, 'altura');
  assert.strictEqual(m.positions.get('05-05-02').block, 'altura');
  assert.strictEqual(m.positions.get('05-03-02').block, null);
  assert.strictEqual(m.positions.get('05-07-01').status, 'asignada');
  assert.strictEqual(m.positions.get('05-01-01').zona.zt, 'ZTLATAS');
});

test('capacidad completa vs real y libres reales', () => {
  const m = mk(), k = m.kpi;
  assert.strictEqual(k.capCompleta, k.total);
  assert.strictEqual(k.capReal, k.total - 4);                 // 1 ext + 3 altura
  const vacias = k.total - k.ocupadas;
  assert.strictEqual(k.libres, vacias - 4 - 2);               // menos bloqueadas y 2 asignadas vacías (05-07, 05-11)
  const n2 = k.porNivel.find(x => x.n === 2);
  assert.strictEqual(n2.bloq, 3);
});

test('stage no se sugiere en posiciones bloqueadas ni asignadas', () => {
  const m = mk();
  for (const s of M.suggestAll(m).STREC01) {
    const P = m.positions.get(s.destino);
    assert.ok(P && !P.block && P.status !== 'asignada', s.destino);
  }
});

test('informe de picking bloqueado', () => {
  const r = M.pickingReport(mk());
  const by = t => r.filter(x => x.tipo === t).map(x => x.pos).sort();
  assert.deepStrictEqual(by('doble_ancho'), ['05-01-01']);
  assert.deepStrictEqual(by('doble_altura'), ['05-01-01', '05-05-01']);
  assert.deepStrictEqual(by('pref_duplicada'), ['05-09-01', '05-11-01']);
  assert.deepStrictEqual(by('sin_preferencia'), ['05-13-01']);
  assert.deepStrictEqual(by('asignada_vacia'), ['05-07-01', '05-11-01']);
  assert.ok(r.every(x => x.accion));
});

test('stage: si no hay espacio en el pasillo del SKU, prefiere su misma zona de trabajo', () => {
  const pref = 'Ubicación,Número de artículo,Posicion Picking NIVEL 1,Posicion Picking NIVEL 2\n17-01-01-01,K1,1,1\n';
  const zon = 'UBICACIÓN,ZONA DE TRABAJO,ZONA DE MOVIMIENTO\n17-01-01-01,ZTKEG,ZM_PICK\n02-05-02-01,ZTKEG,ZM_ALM_PICK\n';
  const vu = 'Almacen,Area,Ubicacion,LPN,Articulo,Descripcion,Cantidad,Estado de inventario,Vida util,Vida util pond,Fecha de fabricacion,Fecha de caducidad\nC,PATCA,STREC01,S1,K1,KEG,8,D,30,x,,\n';
  const P = s => M.parseCSV(s).rows;
  const m = M.buildModel(M.normalize(P(vu), 'vidautil'), { prefs: M.parsePrefs(P(pref)), zonas: M.parseZonas(P(zon)) });
  const s = M.suggestStage(m, 'STREC01')[0];
  assert.strictEqual(s.destino, '02-05-02');
  assert.match(s.motivo, /zona ZTKEG/);
});

test('fix: bloqueo no depende del orden y no bloquea posiciones con preferencia', () => {
  const vu = 'Almacen,Area,Ubicacion,LPN,Articulo,Descripcion,Cantidad,Estado de inventario,Vida util,Vida util pond,Fecha de fabricacion,Fecha de caducidad\n';
  const P = s => M.parseCSV(s).rows, H = 'Ubicación,Número de artículo,Posicion Picking NIVEL 1,Posicion Picking NIVEL 2\n';
  for (const body of ['05-01-01-01,A,2,1\n05-02-01-01,B,1,1\n', '05-02-01-01,B,1,1\n05-01-01-01,A,2,1\n']) {
    const m = M.buildModel(M.normalize(P(vu), 'vidautil'), { prefs: M.parsePrefs(P(H + body)) });
    assert.strictEqual(m.positions.get('05-02-01').block, null);
    assert.strictEqual(m.kpi.libres + m.kpi.bloqueadas + m.kpi.asignadasVacias + m.kpi.ocupadas, m.kpi.total);
  }
});

test('fix: mismo SKU en dos subposiciones de una posición no es duplicado', () => {
  const P = s => M.parseCSV(s).rows;
  const pref = 'Ubicación,Número de artículo,Posicion Picking NIVEL 1,Posicion Picking NIVEL 2\n05-01-01-01,A,1,1\n05-01-01-02,A,1,1\n';
  const m = M.buildModel([], { prefs: M.parsePrefs(P(pref)) });
  assert.deepStrictEqual(m.positions.get('05-01-01').pref, ['A']);
  const r = M.pickingReport(m);
  assert.strictEqual(r.filter(x => x.tipo === 'pref_duplicada').length, 0);
  assert.strictEqual(r.filter(x => x.tipo === 'asignada_vacia').length, 1);
});
