/* Modelo de datos del gemelo de bodega CD Coquimbo. Funciona en navegador y en Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Model = factory();
})(this, function () {
  'use strict';

  // Tamaño conocido de cada pasillo (módulos × niveles) según cuadratura 12-11-2026.
  const LAYOUT = {
    1: [42, 3], 2: [38, 3], 3: [38, 3], 4: [38, 3], 5: [38, 3], 6: [38, 3], 7: [38, 3], 8: [38, 3],
    9: [38, 3], 10: [38, 3], 11: [38, 3], 12: [38, 3], 13: [38, 3], 14: [38, 3], 15: [38, 3],
    16: [40, 3], 17: [1, 1], 18: [56, 3], 19: [44, 1]
  };
  const CAP_P19 = 14;
  // Carpa C5 (REBA-02): 30 filas × (percha lateral 14 + 2 centrales 11 + lateral 14) = 120 perchas, ~1.500 pallets
  const C5 = { id: 'REBA-02', filas: 30, lateral: 14, central: 11, capacidad: 1500 };
  // Perchas de picking (un solo nivel, varios pallets): pasillo → [módulo desde, hasta, pallets]
  const PERCHA_PICK = { 10: [1, 18, 6], 11: [21, 38, 10] };
  const perchaCap = (p, m) => { const c = PERCHA_PICK[p]; return c && m >= c[0] && m <= c[1] ? c[2] : 0; };
  const STAGE_IDS = ['REBA-01', 'STREC01', 'STREC02', 'STREC03', 'STREC04', 'STREC05', 'STREC06'];

  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
    const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
    const out = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"' && f === '') q = true;
      else if (c === sep) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); f = '';
        if (row.length > 1 || row[0] !== '') out.push(row);
        row = [];
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); out.push(row); }
    const headers = (out.shift() || []).map(h => h.trim());
    const rows = out.map(r => { const o = {}; headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
    return { headers, rows };
  }

  const key = h => String(h).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const low = hs => hs.map(key);
  function detectKind(headers) {
    const h = low(headers);
    if (h.includes('numero de articulo') && h.some(x => x.startsWith('posicion picking nivel 1'))) return 'preferencia';
    if (h.includes('ubicacion') && h.includes('zona de trabajo')) return 'zonas';
    if (h.includes('nombre ubicacion') && h.includes('capacidad maxima')) return 'capacidades';
    if (h.includes('numero de material') && h.includes('centro')) return 'bbdd';
    if (!h.includes('ubicacion') || !h.includes('articulo')) return null;
    if (h.includes('vida util')) return 'vidautil';
    if (h.includes('cantidad')) return 'cuadratura';
    return null;
  }

  function parseUbic(u) {
    const m = /^(\d{2})-(\d{2})-(\d{2})-(\d{2,3})$/.exec(String(u).trim());
    if (!m) return null;
    const p = +m[1], mo = +m[2], n = +m[3], s = +m[4];
    return { p, m: mo, n, s, pos: m[1] + '-' + m[2] + '-' + m[3] };
  }

  function parseFecha(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '').trim());
    if (!m) return null;
    return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }

  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

  function normalize(rows, kind) {
    const g = (r, k) => { for (const kk in r) if (key(kk) === k) return r[kk]; return ''; };
    return rows.map(r => {
      const vu = kind === 'vidautil';
      return {
        ubic: g(r, 'ubicacion').toUpperCase(),
        area: g(r, 'area'),
        sku: g(r, 'articulo'),
        desc: g(r, 'descripcion'),
        qty: num(g(r, 'cantidad')) || 0,
        lpn: vu ? (g(r, 'lpn') || null) : null,
        lpnCount: vu ? 1 : (num(g(r, 'lpn')) || 1),
        vu: vu ? num(g(r, 'vida util')) : num(g(r, 'dias_hasta_caducidad')),
        cad: vu ? parseFecha(g(r, 'fecha de caducidad')) : parseFecha(g(r, 'fecha_de_caducidad')),
        estado: vu ? g(r, 'estado de inventario') : g(r, 'estado_de_inventario')
      };
    }).filter(r => r.ubic);
  }

  const gk = (r, k) => { for (const kk in r) if (key(kk).startsWith(k)) return String(r[kk] ?? '').trim(); return ''; };

  // Hoja PREFERENCIA: ubicación de picking asignada a cada SKU y cuánto espacio usa.
  function parsePrefs(rows) {
    const out = [], seen = new Set();
    for (const r of rows) {
      const ubic = gk(r, 'ubicacion').toUpperCase(), u = parseUbic(ubic);
      if (!u) continue;
      const kk = u.pos + '|' + gk(r, 'numero de articulo');
      if (seen.has(kk)) continue; seen.add(kk);
      out.push({ ubic, pos: u.pos, p: u.p, m: u.m, sku: gk(r, 'numero de articulo'),
        n1: (num(gk(r, 'posicion picking nivel 1')) || 1), n2: (num(gk(r, 'posicion picking nivel 2')) || 1) });
    }
    return out;
  }

  // Hoja ZM: zona de trabajo y zona de movimiento de cada ubicación.
  function parseZonas(rows) {
    const z = new Map();
    for (const r of rows) {
      const u = parseUbic(gk(r, 'ubicacion')); if (!u || z.has(u.pos)) continue;
      z.set(u.pos, { zt: gk(r, 'zona de trabajo'), zm: gk(r, 'zona de movimiento') });
    }
    return z;
  }

  // Hoja UBICACIONES: capacidad máxima (piezas = cajas) por ubicación de surtido.
  function parseCaps(rows) {
    const c = new Map();
    for (const r of rows) {
      const u = gk(r, 'nombre ubicacion').toUpperCase(), n = num((gk(r, 'capacidad maxima').match(/[\d.,]+/) || [''])[0]);
      if (u && n) c.set(u, n);
    }
    return c;
  }

  function countPallets(items) {
    const ids = new Set(); let extra = 0;
    for (const it of items) { if (it.lpn) ids.add(it.lpn); else extra += it.lpnCount; }
    return ids.size + extra;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function buildModel(recs, opts) {
    opts = opts || {};
    const dims = {};
    for (const k in LAYOUT) dims[k] = LAYOUT[k].slice();
    const inRack = [], stageRecs = {};
    STAGE_IDS.forEach(id => { stageRecs[id] = []; });
    let otros = 0; const c5recs = [];
    for (const r of recs) {
      if (r.ubic === C5.id) { c5recs.push(r); continue; }
      const u = parseUbic(r.ubic);
      if (u) {
        r._u = u; inRack.push(r);
        if (!dims[u.p]) dims[u.p] = [0, 0];
        dims[u.p][0] = Math.max(dims[u.p][0], u.m);
        dims[u.p][1] = Math.max(dims[u.p][1], u.n);
      } else if (stageRecs[r.ubic]) stageRecs[r.ubic].push(r);
      else otros++;
    }
    const positions = new Map();
    for (const p in dims) {
      const [mods, nivs] = dims[p];
      for (let m = 1; m <= mods; m++) for (let n = 1; n <= nivs; n++) {
        if (n > 1 && perchaCap(+p, m)) continue;   // percha de picking: solo nivel 1
        const pos = pad(p) + '-' + pad(m) + '-' + pad(n);
        positions.set(pos, { pos, p: +p, m, n, items: [], pallets: 0, minVU: null, status: 'vacia', block: null, blockBy: null, pref: [], zona: null });
      }
    }
    for (const r of inRack) {
      let P = positions.get(r._u.pos);
      if (!P) { P = { pos: r._u.pos, p: r._u.p, m: r._u.m, n: r._u.n, items: [], pallets: 0, minVU: null, status: 'vacia', block: null, blockBy: null, pref: [], zona: null }; positions.set(P.pos, P); }
      P.items.push(r);
    }
    for (const P of positions.values()) {
      const pc = perchaCap(P.p, P.m); if (!pc || P.n !== 1) continue;
      P.percha = pc;
      const cap = opts.caps && opts.caps.get(P.pos + '-01');
      if (cap) { P.capCj = cap; const q = P.items.reduce((s, i) => s + i.qty, 0); P.fill = Math.round(q / cap * 1000) / 1000; P.palletsEst = Math.round(P.fill * pc); }
    }
    for (const P of positions.values()) {
      if (!P.items.length) continue;
      P.pallets = countPallets(P.items);
      const vus = P.items.map(i => i.vu).filter(v => v !== null);
      P.minVU = vus.length ? Math.min(...vus) : null;
      P.status = P.n === 1 && P.p !== 19 ? 'surtido' : 'almac';
      P.skus = [...new Set(P.items.map(i => i.sku))];
    }
    const prefs = opts.prefs || [];
    for (const r of prefs) { const P = positions.get(r.pos); if (P) P.pref.push(r.sku); }
    for (const r of prefs) {
      const P = positions.get(r.pos); if (!P) continue;
      const mods = [r.m].concat(r.n1 >= 2 ? [r.m + 1] : []);
      if (r.n1 >= 2) { const E = positions.get(pad(r.p) + '-' + pad(r.m + 1) + '-01'); if (E && !E.items.length && !E.pref.length) { E.block = 'ext'; E.blockBy = r.pos; } }
      if (r.n2 >= 2) for (const m of mods) { const H = positions.get(pad(r.p) + '-' + pad(m) + '-02'); if (H && !H.items.length && !H.pref.length) { H.block = 'altura'; H.blockBy = r.pos; } }
    }
    if (opts.zonas) for (const P of positions.values()) P.zona = opts.zonas.get(P.pos) || opts.zonas.get(P.pos.slice(0, 6) + '01') || null;
    for (const P of positions.values()) if (!P.items.length && P.pref.length) P.status = 'asignada';
    const esLibre = x => !x.items.length && !x.block && x.status !== 'asignada';
    const aisles = Object.keys(dims).map(Number).sort((a, b) => a - b)
      .map(p => ({ p, mods: dims[p][0], nivs: dims[p][1] }));
    const all = [...positions.values()];
    const porPasillo = aisles.map(a => {
      const ps = all.filter(x => x.p === a.p);
      const ocup = ps.filter(x => x.items.length).length, libres = ps.filter(esLibre).length, bloq = ps.filter(x => x.block).length;
      return { p: a.p, total: ps.length, ocup, bloq, libres, pct: ps.length ? 1 - libres / ps.length : 0 };
    });
    const porNivel = [1, 2, 3].map(n => {
      const ps = all.filter(x => x.n === n && x.p !== 19 && x.p !== 17);
      const ocup = ps.filter(x => x.items.length).length, libres = ps.filter(esLibre).length, bloq = ps.filter(x => x.block).length;
      return { n, total: ps.length, ocup, bloq, libres, pct: ps.length ? 1 - libres / ps.length : 0 };
    });
    const ocupadas = all.filter(x => x.items.length).length;
    const p19 = all.filter(x => x.p === 19);
    const p19pal = p19.reduce((s, x) => s + x.pallets, 0);
    const stage = STAGE_IDS.map(id => ({
      id, items: stageRecs[id], lpns: countPallets(stageRecs[id]),
      skus: new Set(stageRecs[id].map(i => i.sku)).size
    }));
    const vence = all.filter(x => x.minVU !== null && x.minVU <= 30).length;
    const bloqueadas = all.filter(x => x.block).length, asignadas = all.filter(x => x.status === 'asignada').length;
    const capReal = all.length - bloqueadas;
    return {
      c5: { id: C5.id, items: c5recs, pallets: countPallets(c5recs), skus: new Set(c5recs.map(i => i.sku)).size, capacidad: C5.capacidad },
      positions, aisles, stage, prefs, hasPrefs: prefs.length > 0, recs, caps: opts.caps || null,
      kpi: {
        total: all.length, ocupadas, libres: all.filter(esLibre).length, pctOcc: capReal ? ocupadas / capReal : 0,
        capCompleta: all.length, capReal, bloqueadas, asignadasVacias: asignadas,
        bloqAltura: all.filter(x => x.block === 'altura').length, bloqExt: all.filter(x => x.block === 'ext').length,
        porPasillo, porNivel, vence30: vence, otrasFilas: otros,
        p19: { pallets: p19pal, capacidad: p19.length * CAP_P19, libres: Math.max(0, p19.length * CAP_P19 - p19pal) },
        stageLpn: stage.reduce((s, x) => s + x.lpns, 0)
      }
    };
  }

  // Sugerencia de guardado para los LPN de una zona de stage.
  function newCtx(model) {
    const ctx = { used: new Set(), p19room: {} };
    for (const P of model.positions.values()) if (P.p === 19) ctx.p19room[P.pos] = CAP_P19 - P.pallets;
    return ctx;
  }

  // Sugerencias de todas las zonas en un solo paso, sin repetir destino entre zonas.
  function suggestAll(model) {
    const ctx = newCtx(model), out = {};
    for (const s of model.stage) out[s.id] = suggestStage(model, s.id, ctx);
    return out;
  }

  function suggestStage(model, stageId, ctx) {
    const area = model.stage.find(s => s.id === stageId);
    if (!area) return [];
    ctx = ctx || newCtx(model);
    const used = ctx.used, p19room = ctx.p19room;
    const all = [...model.positions.values()];
    const libresPas = {};
    model.kpi.porPasillo.forEach(x => { libresPas[x.p] = x.libres; });
    const vacias = all.filter(P => !P.items.length && !P.block && P.status !== 'asignada' && P.n >= 2 && P.p !== 19 && P.p !== 17);
    const dondeSku = {};
    for (const P of all) for (const s of new Set([...(P.skus || []), ...P.pref])) (dondeSku[s] = dondeSku[s] || []).push(P);

    // agrupar por LPN (vida útil) o por fila (cuadratura)
    const groups = [];
    const byLpn = {};
    for (const it of area.items) {
      if (it.lpn) {
        if (!byLpn[it.lpn]) { byLpn[it.lpn] = { lpn: it.lpn, sku: it.sku, desc: it.desc, qty: 0, pallets: 1, vu: it.vu }; groups.push(byLpn[it.lpn]); }
        byLpn[it.lpn].qty += it.qty;
      } else {
        const n = Math.max(1, Math.round(it.lpnCount));
        for (let k = 0; k < n; k++) groups.push({ lpn: n > 1 ? '— ' + (k + 1) + '/' + n : '—', sku: it.sku, desc: it.desc, qty: Math.round(it.qty / n), pallets: 1, vu: it.vu });
      }
    }
    // FEFO: primero lo que vence antes
    groups.sort((a, b) => (a.vu ?? 1e9) - (b.vu ?? 1e9));

    return groups.map(g => {
      const res = { lpn: g.lpn, sku: g.sku, desc: g.desc, qty: g.qty, pallets: g.pallets, vu: g.vu, origen: stageId, destino: null, motivo: 'Sin posición libre disponible' };
      const here = dondeSku[g.sku] || [];
      // 1) Bodega 1: misma percha con cupo
      const perch = here.filter(P => P.p === 19 && p19room[P.pos] >= g.pallets).sort((a, b) => p19room[b.pos] - p19room[a.pos])[0];
      if (perch) { p19room[perch.pos] -= g.pallets; res.destino = perch.pos; res.motivo = 'Misma percha Bodega 1 (con cupo)'; return res; }
      // 2) vacía en mismo pasillo, lo más cerca del módulo donde ya está
      const pas = here.filter(P => P.p !== 19);
      let best = null, bd = 1e9;
      for (const V of vacias) {
        if (used.has(V.pos)) continue;
        for (const P of pas) if (P.p === V.p) { const d = Math.abs(P.m - V.m) + (V.n - 2) * 0.1; if (d < bd) { bd = d; best = V; } }
      }
      if (best) { used.add(best.pos); res.destino = best.pos; res.motivo = 'Mismo pasillo del SKU (a ' + Math.round(bd) + ' módulos)'; return res; }
      // 3) vacía en la misma zona de trabajo del SKU (KEG con KEG, vino con vino...)
      const zt = (here.find(P => P.zona && P.zona.zt) || {}).zona;
      if (zt) {
        const z = vacias.filter(V => !used.has(V.pos) && V.zona && V.zona.zt === zt.zt).sort((a, b) => (libresPas[b.p] - libresPas[a.p]) || (a.n - b.n) || (a.m - b.m))[0];
        if (z) { used.add(z.pos); res.destino = z.pos; res.motivo = 'Misma zona ' + zt.zt + ' (pasillo ' + z.p + ')'; return res; }
      }
      // 4) vacía en el pasillo con más espacio libre
      const cand = vacias.filter(V => !used.has(V.pos)).sort((a, b) => (libresPas[b.p] - libresPas[a.p]) || (a.n - b.n) || (a.m - b.m))[0];
      if (cand) { used.add(cand.pos); res.destino = cand.pos; res.motivo = (here.length ? 'Sin espacio en su pasillo ni zona; ' : '') + 'pasillo con más espacio libre (' + cand.p + ')'; }
      return res;
    });
  }

  // ---------- Consolidación del pasillo 19 ----------
  const libreReal = P => !P.items.length && !P.block && P.status !== 'asignada';
  function unitsOf(P) { // LPN de una posición (cuadratura: una unidad por LPN contado)
    const by = new Map(), out = [];
    for (const it of P.items) {
      if (it.lpn) { if (!by.has(it.lpn)) { by.set(it.lpn, { lpn: it.lpn, sku: it.sku, desc: it.desc, qty: 0, vu: it.vu, pos: P.pos, ubic: it.ubic }); out.push(by.get(it.lpn)); } by.get(it.lpn).qty += it.qty; }
      else { const n = Math.max(1, Math.round(it.lpnCount)); for (let k = 0; k < n; k++) out.push({ lpn: '—', sku: it.sku, desc: it.desc, qty: Math.round(it.qty / n), vu: it.vu, pos: P.pos, ubic: it.ubic }); }
    }
    return out;
  }
  const spread = vs => vs.length ? Math.max(...vs) - Math.min(...vs) : 0;

  function consolidateP19(model, params) {
    const o = Object.assign({ cap: CAP_P19, ventana: 30, liberarMax: 3, minPallets: 6 }, params || {});
    const all = [...model.positions.values()];
    const sources = [], posTotal = {}, moved = {};
    for (const P of all) {
      if (P.p === 19 || P.p === 17 || P.n < 2 || !P.items.length) continue;
      const u = unitsOf(P); posTotal[P.pos] = u.length; sources.push(...u);
    }
    const bySku = {};
    for (const u of sources) (bySku[u.sku] = bySku[u.sku] || []).push(u);
    for (const k in bySku) bySku[k].sort((a, b) => (a.vu ?? 1e9) - (b.vu ?? 1e9));
    const perchas = all.filter(P => P.p === 19).map(P => {
      const u = unitsOf(P);
      return { pos: P.pos, units: u, skus: new Set(u.map(x => x.sku)), vus: u.map(x => x.vu).filter(v => v !== null) };
    });
    const moves = [], used = new Set(), completadas = new Set();
    const mv = (tipo, u, destino, motivo) => { used.add(u); moved[u.pos] = (moved[u.pos] || 0) + 1; moves.push({ tipo, lpn: u.lpn, sku: u.sku, desc: u.desc, qty: u.qty, vu: u.vu, origen: u.pos, destino, motivo }); };

    // A) completar perchas de un código con cupo
    for (const pc of perchas) {
      if (pc.skus.size !== 1) continue;
      const sku = [...pc.skus][0], vus = pc.vus.slice();
      let room = o.cap - pc.units.length;
      for (const u of (bySku[sku] || [])) {
        if (room <= 0) break;
        if (used.has(u)) continue;
        if (u.vu !== null && vus.length && spread(vus.concat(u.vu)) > o.ventana) continue;
        mv('completar', u, pc.pos, 'Completa percha de su mismo código'); if (u.vu !== null) vus.push(u.vu); room--; completadas.add(pc.pos);
      }
    }
    // B/C) asignar perchas a códigos con mucho volumen fuera del pasillo 19
    const enP19 = new Set(perchas.flatMap(pc => [...pc.skus]));
    const cands = [];
    for (const sku in bySku) {
      if (enP19.has(sku)) continue;
      const list = bySku[sku].filter(u => !used.has(u));
      if (list.length < o.minPallets) continue;
      let best = [], i = 0;   // ventana FEFO más temprana con más pallets
      for (let j = 0; j < list.length; j++) {
        while (list[j].vu !== null && list[i].vu !== null && list[j].vu - list[i].vu > o.ventana) i++;
        if (j - i + 1 > best.length) best = list.slice(i, j + 1);
      }
      best = best.slice(0, o.cap);
      if (best.length >= o.minPallets) cands.push({ sku, units: best });
    }
    cands.sort((a, b) => b.units.length - a.units.length);
    const vacias = perchas.filter(pc => !pc.units.length);
    const liberables = perchas.filter(pc => pc.units.length && pc.units.length <= o.liberarMax && !completadas.has(pc.pos)).sort((a, b) => a.units.length - b.units.length);
    const libresReal = all.filter(P => libreReal(P) && P.n >= 2 && P.p !== 19 && P.p !== 17);
    const tomadas = new Set(); let consumidas = 0;
    const prefPas = {};
    for (const r of model.prefs || []) prefPas[r.sku] = r.p;
    for (const c of cands) {
      let target = vacias.shift(), motivo = 'Percha vacía';
      if (!target) {
        const idx = liberables.findIndex(pc => c.units.length - pc.units.length > 0);
        if (idx < 0) continue;
        const pc = liberables[idx];
        const dests = [];
        for (const u of pc.units) {
          const pas = prefPas[u.sku];
          const d = libresReal.filter(P => !tomadas.has(P.pos)).sort((a, b) => ((a.p === pas) ? 0 : 1) - ((b.p === pas) ? 0 : 1) || a.n - b.n || a.p - b.p || a.m - b.m)[0];
          if (!d) break; tomadas.add(d.pos); dests.push(d.pos);
        }
        if (dests.length < pc.units.length) { dests.forEach(d => tomadas.delete(d)); continue; }
        liberables.splice(idx, 1);
        pc.units.forEach((u, k) => moves.push({ tipo: 'liberar', lpn: u.lpn, sku: u.sku, desc: u.desc, qty: u.qty, vu: u.vu, origen: pc.pos, destino: dests[k], motivo: 'Libera la percha para ' + c.sku + ' (' + c.units.length + ' pallets)' }));
        consumidas += dests.length; target = pc; motivo = 'Percha liberada';
      }
      for (const u of c.units) mv('asignar', u, target.pos, motivo + ' asignada a código con ' + c.units.length + ' pallets en almacenamiento');
    }
    let liberadas = 0;
    for (const pos in moved) if (moved[pos] >= posTotal[pos]) liberadas++;
    const sinFechas = sources.length > 0 && sources.every(u => u.vu === null);
    return { moves, liberadas: liberadas - consumidas, posicionesVaciadas: liberadas, consumidas, params: o, sinFechas };
  }

  // ---------- Llenado de ubicaciones de picking ----------
  const ORIGEN_OK = it => /^(ALMAC|ALMPIC)$/i.test(it.area) || it.ubic === 'MIX-01' || it.ubic === 'REBA-01' || /^STREC/.test(it.ubic);
  function fillPicking(model) {
    const moves = [];
    if (!model.caps || !(model.prefs || []).length) return { moves, liberadas: 0, sinCapacidad: true };
    const units = [], posTotal = {};
    const by = new Map();
    for (const it of model.recs) {
      const u = parseUbic(it.ubic);
      if (u && u.n === 1 && u.p !== 19) continue;            // surtido no es origen
      if (!ORIGEN_OK(it)) continue;
      const pos = u ? u.pos : it.ubic;
      if (it.lpn) {
        const k = it.lpn + '|' + it.sku;
        if (!by.has(k)) { const x = { lpn: it.lpn, sku: it.sku, desc: it.desc, qty: 0, vu: it.vu, pos, rack: !!u && u.p !== 19 }; by.set(k, x); units.push(x); }
        by.get(k).qty += it.qty;
      } else {
        const n = Math.max(1, Math.round(it.lpnCount));
        for (let i = 0; i < n; i++) units.push({ lpn: '—', sku: it.sku, desc: it.desc, qty: Math.round(it.qty / n), vu: it.vu, pos, rack: !!u && u.p !== 19 });
      }
    }
    for (const x of units) posTotal[x.pos] = (posTotal[x.pos] || 0) + 1;
    const bySku = {};
    for (const x of units) (bySku[x.sku] = bySku[x.sku] || []).push(x);
    for (const k in bySku) bySku[k].sort((a, b) => ((a.vu ?? 1e9) - (b.vu ?? 1e9)) || (a.qty - b.qty));
    const stock = {};   // stock total por ubicación (todas las preferencias comparten la capacidad)
    for (const it of model.recs) stock[it.ubic] = (stock[it.ubic] || 0) + it.qty;
    const used = new Set(), moved = {};
    for (const r of model.prefs) {
      const cap = model.caps.get(r.ubic); if (!cap) continue;
      let space = cap - (stock[r.ubic] || 0);
      if (space <= 0) continue;
      let skippedVu = null;
      for (const x of (bySku[r.sku] || [])) {
        if (space <= 0) break;
        if (used.has(x)) continue;
        if (x.qty > space) { if (skippedVu === null) skippedVu = x.vu; continue; }
        used.add(x); space -= x.qty; stock[r.ubic] = (stock[r.ubic] || 0) + x.qty; moved[x.pos] = (moved[x.pos] || 0) + 1;
        const aviso = skippedVu !== null && x.vu !== null && skippedVu < x.vu;
        moves.push({ lpn: x.lpn, sku: x.sku, desc: x.desc, qty: x.qty, vu: x.vu, origen: x.pos, destino: r.ubic, cap, avisoFefo: aviso,
          motivo: (aviso ? 'Aviso FEFO: queda un pallet que vence antes (' + skippedVu + ' días) porque no cabe. ' : '') + 'Llena surtido hasta ' + cap + ' cajas' });
      }
    }
    let liberadas = 0;
    for (const pos in moved) {
      const P = model.positions.get(pos);
      if (P && P.p !== 19 && moved[pos] >= countPallets(P.items)) liberadas++;
    }
    return { moves, liberadas };
  }

  // ---------- BBDD de materiales (centro: 2306 cerveza, 5006 vino, 7106 pisco, 8006 aguas, 9006 gaseosas) ----------
  function parseBBDD(rows) {
    const b = new Map();
    for (const r of rows) {
      const k = gk(r, 'numero de material'); if (!k || b.has(k)) continue;
      b.set(k, { desc: gk(r, 'texto breve'), centro: gk(r, 'centro'), grupo: gk(r, 'grupo de articulos'), cajasPallet: num(gk(r, 'cajas por pallet')) || null });
    }
    return b;
  }

  // ---------- Carpa C5 (REBA-02): solo aguas y gaseosas ----------
  function unitsFromItems(items, pos) {
    const by = new Map(), out = [];
    for (const it of items) {
      if (it.lpn) { if (!by.has(it.lpn)) { by.set(it.lpn, { lpn: it.lpn, sku: it.sku, desc: it.desc, qty: 0, vu: it.vu, pos }); out.push(by.get(it.lpn)); } by.get(it.lpn).qty += it.qty; }
      else { const n = Math.max(1, Math.round(it.lpnCount)); for (let k = 0; k < n; k++) out.push({ lpn: '—', sku: it.sku, desc: it.desc, qty: Math.round(it.qty / n), vu: it.vu, pos }); }
    }
    return out;
  }
  function c5Perchas() {
    const out = [];
    for (let f = 1; f <= C5.filas; f++) for (const [lado, cap] of [['L', C5.lateral], ['CO', C5.central], ['CE', C5.central], ['E', C5.lateral]])
      out.push({ id: 'F' + pad(f) + '-' + lado, fila: f, lado, cap, sku: null, desc: '', pallets: 0, vus: [], existente: 0 });
    return out;
  }
  function moveToC5(model, bbdd, params) {
    const o = Object.assign({ centros: ['8006', '9006'], ventana: 30, capacidad: C5.capacidad }, params || {});
    const perchas = c5Perchas();
    let total = 0;
    const place = (u, existente) => {
      if (total >= o.capacidad) return null;
      const fits = p => p.sku === u.sku && p.pallets < p.cap && (u.vu === null || !p.vus.length || spread(p.vus.concat(u.vu)) <= o.ventana);
      const p = perchas.find(fits) || perchas.find(q => !q.sku);
      if (!p) return null;
      if (!p.sku) { p.sku = u.sku; p.desc = u.desc; }
      p.pallets++; if (u.vu !== null) p.vus.push(u.vu); if (existente) p.existente++; total++;
      return p;
    };
    // lo que ya está en REBA-02 ocupa perchas primero
    const exist = unitsFromItems(model.c5.items, C5.id);
    const bySkuE = {}; exist.forEach(u => (bySkuE[u.sku] = bySkuE[u.sku] || []).push(u));
    for (const k in bySkuE) bySkuE[k].sort((a, b) => (a.vu ?? 1e9) - (b.vu ?? 1e9)).forEach(u => place(u, true));
    // orígenes: STREC*, racks N2–N3 (pasillos 1–16 y 18) y pasillo 19
    const ok = sku => { const b = bbdd && bbdd.get(sku); return !!b && o.centros.includes(String(b.centro)); };
    const units = [], posTotal = {};
    for (const s of model.stage) if (/^STREC/.test(s.id)) units.push(...unitsFromItems(s.items, s.id).map(u => Object.assign(u, { origenTipo: 'stage' })));
    for (const P of model.positions.values()) {
      if (!P.items.length || P.p === 17 || (P.p !== 19 && P.n < 2)) continue;
      const us = unitsFromItems(P.items, P.pos); posTotal[P.pos] = us.length;
      units.push(...us.map(u => Object.assign(u, { origenTipo: P.p === 19 ? 'p19' : 'rack' })));
    }
    const cand = units.filter(u => ok(u.sku));
    const bySku = {}; cand.forEach(u => (bySku[u.sku] = bySku[u.sku] || []).push(u));
    const skus = Object.keys(bySku).sort((a, b) => bySku[b].length - bySku[a].length);
    const moves = [], moved = {}; let sinEspacio = 0;
    for (const k of skus) {
      for (const u of bySku[k].sort((a, b) => (a.vu ?? 1e9) - (b.vu ?? 1e9))) {
        const p = place(u, false);
        if (!p) { sinEspacio++; continue; }
        moved[u.pos] = (moved[u.pos] || 0) + 1;
        const b = bbdd.get(u.sku);
        moves.push({ lpn: u.lpn, sku: u.sku, desc: u.desc, qty: u.qty, vu: u.vu, origen: u.pos, origenTipo: u.origenTipo, destino: C5.id, percha: p.id, centro: b.centro,
          motivo: (b.centro === '8006' ? 'Agua' : 'Gaseosa') + ' → C5 percha ' + p.id });
      }
    }
    let liberadas = 0;
    for (const pos in moved) { const P = model.positions.get(pos); if (P && P.p !== 19 && moved[pos] >= posTotal[pos]) liberadas++; }
    perchas.forEach(p => { p.spread = spread(p.vus); });
    return { moves, perchas, liberadas, sinEspacio, stageLpn: moves.filter(m => m.origenTipo === 'stage').length,
      p19Pallets: moves.filter(m => m.origenTipo === 'p19').length, ocupacionFinal: total, capacidad: o.capacidad,
      sinClasificar: units.filter(u => !(bbdd && bbdd.has(u.sku))).length };
  }

  // ---------- Hoja de ruta imprimible (mismo formato que Reabasto ZM / Llenado ZM_CAJA) ----------
  const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const grupoDe = id => /^\d\d-/.test(id) ? 'Pasillo ' + id.slice(0, 2) : /^STREC/.test(id) ? 'Stage C1 · ' + id : /^REBA-02/.test(id) ? 'Carpa C5 · REBA-02' : id;
  function hojaRuta(rows, o) {
    o = Object.assign({ titulo: 'Hoja de Ruta', emision: '', agrupar: 'origen', modo: 'continuo', filtros: '' }, o || {});
    const ord = { liberar: 0, completar: 1, asignar: 2 };
    const key = r => grupoDe(o.agrupar === 'destino' ? r.destino : r.origen);
    const grupos = new Map();
    rows.slice().sort((a, b) => key(a).localeCompare(key(b)) || ((ord[a.tipo] ?? 1) - (ord[b.tipo] ?? 1)) || String(a.origen).localeCompare(String(b.origen)))
      .forEach(r => { const k = key(r); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); });
    const primero = [...grupos].filter(([, rs]) => rs.some(r => r.tipo === 'liberar')), resto = [...grupos].filter(([, rs]) => !rs.some(r => r.tipo === 'liberar'));
    grupos.clear(); [...primero, ...resto].forEach(([k, rs]) => grupos.set(k, rs));
    const tot = rs => ` &nbsp;·&nbsp; Pallets: ${rs.length} &nbsp;·&nbsp; Cajas: ${rs.reduce((s, r) => s + (+r.qty || 0), 0).toLocaleString('es-CL')}`;
    const TIPO = { completar: 'Completar', asignar: 'Asignar', liberar: 'Liberar 1º' };
    const tabla = rs => `<table class="data-table"><thead><tr><th>#</th><th>SKU</th><th>Descripción producto</th><th>LPN</th><th>Vence (días)</th><th>Origen</th><th>Destino</th><th>Cantidad</th><th>Check (✓)</th></tr></thead><tbody>` +
      rs.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="mono b">${escH(r.sku)}</td><td>${escH(r.desc)}${r.tipo ? ` <span class="tag">${escH(TIPO[r.tipo] || r.tipo)}</span>` : ''}${r.avisoFefo ? ' <span class="tag warn">FEFO</span>' : ''}</td><td class="c mono">${escH(String(r.lpn || '').slice(-10))}</td><td class="c">${r.vu ?? ''}</td><td class="c b org">${escH(r.origen)}</td><td class="c b dst">${escH(r.destino)}</td><td class="c b qty">1 PALLET<br><span class="small">${(+r.qty || 0).toLocaleString('es-CL')} cj</span></td><td class="chk"></td></tr>`).join('') + '</tbody></table>';
    const encab = (rs, t) => `<table class="header-table"><tr><td class="title">${escH(o.titulo)}</td><td class="r small"><strong>Fecha emisión:</strong> ${escH(o.emision)}</td></tr><tr><td class="sub"><strong>${escH(t)}</strong> &nbsp;·&nbsp; Tareas: ${rs.length}${tot(rs)}</td><td class="r small">${escH(o.filtros)}</td></tr></table>`;
    const firmas = '<table class="firmas"><tr><td>Operario: ____________________</td><td>Hora inicio: ______</td><td>Hora término: ______</td><td>Firma: ____________________</td></tr></table>';
    let cuerpo;
    if (o.modo === 'pasillo') cuerpo = [...grupos].map(([k, rs]) => `<div class="report-card">${encab(rs, k)}${tabla(rs)}${firmas}</div>`).join('<div class="salto"></div>');
    else cuerpo = `<div class="report-card">${encab(rows, [...grupos.keys()].join(', '))}` + [...grupos].map(([k, rs]) => `<div class="seccion"><div class="sec-tit">${escH(k)} &nbsp;·&nbsp; Tareas: ${rs.length}${tot(rs)}</div>${tabla(rs)}</div>`).join('') + `${firmas}</div>`;
    return `<style>
      body { font-family: Arial, sans-serif; background:#fff; margin:12px; }
      .report-card { border:2px solid #1E293B; border-radius:8px; padding:18px; margin-bottom:18px; background:#FFFFFF; color:#0F172A; }
      .header-table { width:100%; border-collapse:collapse; margin-bottom:10px; } .header-table td { padding:3px; }
      .title { font-size:20px; font-weight:bold; text-transform:uppercase; letter-spacing:1px; }
      .sub { font-size:14px; color:#334155; } .small { font-size:11px; color:#475569; } .r { text-align:right; }
      .data-table { width:100%; border-collapse:collapse; margin-top:8px; }
      .data-table th { background:#1E293B; color:#fff; border:1px solid #1E293B; padding:7px 5px; font-size:12px; text-transform:uppercase; }
      .data-table td { border:1px solid #94A3B8; padding:7px 5px; font-size:13px; }
      .data-table tr:nth-child(even) td { background:#F8FAFC; }
      .c { text-align:center; } .b { font-weight:bold; } .mono { font-family:monospace; font-size:13px; }
      .org { color:#1E3A8A; font-size:14px; } .dst { color:#065F46; font-size:14px; } .qty { font-size:15px; } .chk { width:70px; }
      .tag { display:inline-block; font-size:10px; font-weight:bold; border:1px solid #64748B; border-radius:3px; padding:0 4px; color:#334155; }
      .tag.warn { border-color:#B45309; color:#B45309; }
      .seccion { margin-top:12px; } .sec-tit { font-size:14px; font-weight:bold; color:#fff; background:#5BB030; padding:5px 8px; border-radius:4px; }
      .firmas { width:100%; margin-top:14px; font-size:12px; } .firmas td { padding-top:10px; }
      .btn { background:#5BB030; color:#fff; font-weight:bold; padding:10px 24px; font-size:15px; border:none; border-radius:6px; cursor:pointer; }
      @media print { body { margin:0; } .no-print { display:none !important; } .report-card { border:none; padding:0; margin:0; }
        .salto { page-break-after:always; break-after:page; } .data-table tr { page-break-inside:avoid; } .data-table thead { display:table-header-group; }
        .data-table th { padding:4px; font-size:11px; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .data-table td { padding:4px; font-size:12px; }
        .sec-tit { break-after:avoid; page-break-after:avoid; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        @page { size: A4 landscape; margin: 10mm; } }
    </style>${cuerpo}`;
  }

  // Informe de picking bloqueado / mal asignado.
  function pickingReport(model) {
    const desc = {}, out = [];
    for (const P of model.positions.values()) for (const i of P.items) if (!desc[i.sku]) desc[i.sku] = i.desc;
    const prefPos = {};
    for (const r of model.prefs) (prefPos[r.sku] = prefPos[r.sku] || []).push(r.pos);
    const row = (tipo, pos, sku, detalle, accion) => out.push({ tipo, pos, sku, desc: desc[sku] || '', detalle, accion });
    for (const r of model.prefs) {
      const P = model.positions.get(r.pos); if (!P) continue;
      if (r.n1 >= 2 && model.positions.has(pad(r.p) + '-' + pad(r.m + 1) + '-01')) { const e = pad(r.p) + '-' + pad(r.m + 1) + '-01'; row('doble_ancho', r.pos, r.sku, 'Usa también ' + e, 'Revisar si necesita 2 espacios; si no, liberar ' + e); }
      if (r.n2 >= 2) { const hs = [r.m].concat(r.n1 >= 2 ? [r.m + 1] : []).map(m => pad(r.p) + '-' + pad(m) + '-02'); row('doble_altura', r.pos, r.sku, 'Bloquea ' + hs.join(', '), 'Evaluar pallet de picking más bajo para liberar ' + hs.join(', ')); }
      if (prefPos[r.sku].length > 1) row('pref_duplicada', r.pos, r.sku, 'Preferencias: ' + prefPos[r.sku].join(', '), 'Consolidar en una sola posición de picking');
      if (!P.items.length) row('asignada_vacia', r.pos, r.sku, 'Preferencia sin stock', 'Reabastecer o desasignar la preferencia');
    }
    for (const P of model.positions.values()) {
      if (P.n !== 1 || P.p === 19 || P.p === 17 || !P.items.length || P.pref.length) continue;
      for (const sku of P.skus) {
        const otra = (prefPos[sku] || []).join(', ');
        row('sin_preferencia', P.pos, sku, otra ? 'Su preferencia está en ' + otra : 'SKU sin preferencia', otra ? 'Consolidar en ' + otra + ' y liberar ' + P.pos : 'Crear preferencia en ' + P.pos + ' o reubicar');
      }
    }
    return out;
  }

  // Pasillo en U: 1..k suben por una cara, k+1 y k+2 cruzan la cabecera, k+3..2k+2 bajan por la otra cara.
  function modulePlace(mods, m) {
    const k = Math.max(1, Math.floor((mods - 2) / 2));
    if (m <= k) return { side: 'L', i: m - 1, k };
    if (m <= k + 2) return { side: 'H', i: m - k - 1, k };
    return { side: 'R', i: m - k - 3, k };
  }

  return { hojaRuta, parseBBDD, moveToC5, C5, PERCHA_PICK, perchaCap, modulePlace, consolidateP19, fillPicking, parseCaps, pickingReport, parsePrefs, parseZonas, LAYOUT, CAP_P19, STAGE_IDS, parseCSV, detectKind, parseUbic, parseFecha, normalize, buildModel, suggestStage, suggestAll, countPallets };
});
