/* Interfaz del gemelo de bodega. Depende de window.Model (model.js). */
(function () {
  'use strict';
  const M = window.Model;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('map');

  // ---------- Geometría (metros, origen = esquina NO de la bodega; según láminas Revit NEWEN) ----------
  // Centros de pasillo = centro de cada cabecera en el render Revit nov-2026 (escala 9,19 px/m desde Bodega 1).
  const AISLE_X = { 1: 16.7, 2: 24.1, 3: 31.3, 4: 37.3, 5: 43.4, 6: 51.3, 7: 57.5, 8: 64.9, 9: 71.1, 10: 80.1,
    11: 85.9, 12: 95.4, 13: 101.3, 14: 107.5, 15: 116.2, 16: 121.7 };
  const RACK_D = 1.1, HALF = 1.9, Y0 = 1.5, YLEN = 30, HEAD_Y = 1.2, RACK_TOP = 2.5, RACK_LEN = 24.2;
  const PERCHAS_P2 = [['P1 · 133', 73.6, 4.4], ['P2 · 200', 88.3, 4.9]];
  const AREAS = {
    bodega: [0, 0, 125.8, 33], c1: [18.2, 34.2, 19.5, 13.2], c2: [38.7, 34.2, 38.4, 13.2], c3: [78.3, 34.2, 38.8, 13.2],
    c4: [107.5, 48.4, 9.6, 27.6], c5: [109.7, 97.4, 33.8, 42.2], b2: [-26.2, 35.7, 18.4, 71.3],
    ed5: [3.2, 105.8, 22.8, 13.7], sub: [-23.6, -9, 9.3, 18.7]
  };
  const VIEW_ALL = [-32, -14, 180, 158], VIEW_BOD = [-4, -5, 134, 57];

  function geo(p, m, mods) {
    if (p === 19) { // Bodega 1: B1-O (1–22) y B1-E (23–44)
      // en U como los pasillos: B1-O sube desde el sur (19-01 → 19-22), B1-E baja desde el norte (19-23 → 19-44)
      const side = m <= 22 ? 0 : 1, i = (m - 1) % 22, h = YLEN / 22;
      return { x: side ? 7.6 : 2.0, y: side ? Y0 + i * h : Y0 + YLEN - (i + 1) * h, w: 3.6, h };
    }
    if (p === 18) { // Bodega 2: 4 líneas de 14 módulos
      const b = AREAS.b2, col = Math.floor((m - 1) / 14), i = (m - 1) % 14, h = (b[3] - 4) / 14;
      const xs = [b[0] + 0.8, b[0] + 6.2, b[0] + 10.4, b[0] + b[2] - 2.2];
      return { x: xs[Math.min(col, 3)], y: b[1] + 2 + i * h, w: 1.4, h };
    }
    if (p === 17) { const b = AREAS.ed5; return { x: b[0] + 0.8, y: b[1] + 1, w: 6.5, h: b[3] - 2 }; }
    const c = AISLE_X[p]; if (c === undefined) return null;
    // U: sube por la cara poniente desde el sur, cruza la cabecera norte y baja por la cara oriente
    const u = M.modulePlace(mods, m), h = RACK_LEN / u.k;
    const PW = { 10: 3.8, 11: 4.4 }[p], deep = M.perchaCap(p, m) ? PW : RACK_D;   // perchas de picking P1/P2 son más profundas
    if (u.side === 'L') return { x: c - HALF - deep, y: RACK_TOP + RACK_LEN - (u.i + 1) * h, w: deep, h };
    if (u.side === 'R' && deep !== RACK_D) return { x: c + HALF, y: RACK_TOP + u.i * h, w: deep, h };
    if (u.side === 'L') return { x: c - HALF - RACK_D, y: RACK_TOP + RACK_LEN - (u.i + 1) * h, w: RACK_D, h };
    if (u.side === 'R') return { x: c + HALF, y: RACK_TOP + u.i * h, w: RACK_D, h };
    const hw = 1.35;
    return { x: c - hw + u.i * hw, y: HEAD_Y, w: hw, h: RACK_D };
  }

  // ---------- Estado ----------
  const S = { panel: 'resumen', p19tab: 'todos', filltab: 'todos', ref: {}, zt: '', ptab: 'doble_altura', report: [], files: {}, main: null, model: null, mode: 'occ', lvl: 0, q: '', stageTab: 'STREC01', sug: [], cells: new Map(), vb: VIEW_BOD.slice(), hl: null };

  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const C = {};
  function loadColors() { ['--alt', '--ext', '--asig', '--free', '--occ', '--occ-2', '--crit', '--warn', '--watch', '--accent', '--line', '--muted', '--ink', '--panel-2'].forEach(k => C[k] = css(k)); }
  function vuColor(v) { if (v === null || v === undefined) return '#3a4d63'; if (v <= 30) return C['--crit']; if (v <= 60) return C['--warn']; if (v <= 90) return C['--watch']; return '#3a4d63'; }
  function fillFor(P) {
    if (S.mode === 'vu') return P.items.length ? vuColor(P.minVU) : P.block ? '#2b2633' : P.status === 'asignada' ? '#1d3440' : '#1b3a2f';
    if (P.block === 'altura') return C['--alt'];
    if (P.block === 'ext') return C['--ext'];
    if (!P.items.length) return P.status === 'asignada' ? C['--asig'] : C['--free'];
    return P.status === 'surtido' ? C['--occ'] : C['--occ-2'];
  }

  // ---------- Dibujo ----------
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function rectA(a, attrs, parent) { return el('rect', Object.assign({ x: a[0], y: a[1], width: a[2], height: a[3] }, attrs), parent); }
  function label(x, y, t, attrs, parent) { const e = el('text', Object.assign({ x, y, fill: C['--muted'], 'font-size': 1.6, 'font-family': 'Barlow Condensed, sans-serif', 'text-anchor': 'middle' }, attrs), parent); e.textContent = t; return e; }

  function drawBase() {
    svg.innerHTML = '';
    const g = el('g', { id: 'base' }, svg);
    const ln = C['--line'];
    // recinto y edificios de contexto
    rectA(AREAS.bodega, { fill: '#111922', stroke: '#c0392b', 'stroke-width': .25, 'stroke-dasharray': '1 .6' }, g);
    rectA(AREAS.b2, { fill: '#18212c', stroke: ln, 'stroke-width': .2 }, g);
    rectA(AREAS.ed5, { fill: '#2a1d16', stroke: '#5a3a28', 'stroke-width': .2 }, g);
    rectA(AREAS.sub, { fill: '#10302b', stroke: '#1f7a6b', 'stroke-width': .2 }, g);
    for (const k of ['c2', 'c3', 'c4', 'c5']) rectA(AREAS[k], { fill: 'none', stroke: ln, 'stroke-width': .2, 'stroke-dasharray': '.8 .5' }, g);
    rectA(AREAS.c1, { fill: '#1d1a10', stroke: C['--accent'], 'stroke-width': .3 }, g);
    // perchas P1 y P2 de Picking 2 (render Revit)
    for (const [n, x, w] of PERCHAS_P2) { label(x + w / 2, RACK_TOP + RACK_LEN + 1.6, n, { fill: '#e08a3a', 'font-size': 1.2, 'font-weight': 600 }, g); }
    // cruce sur
    label(70, 30.6, 'PASILLO DE CRUCE', { 'font-size': 1.1, 'letter-spacing': .2 }, g);
    // divisiones de zonas
    for (const x of [13.19, 61.19]) el('line', { x1: x, y1: 0, x2: x, y2: 33, stroke: ln, 'stroke-width': .2 }, g);
    label(6.6, -2.4, 'BODEGA 1 · P19', { fill: C['--ink'] }, g);
    label(37.2, -2.4, 'PICKING 1', { fill: C['--ink'] }, g);
    label(93.5, -2.4, 'PICKING 2', { fill: C['--ink'] }, g);
    for (const p in AISLE_X) {
      label(AISLE_X[p], -0.35, p, { fill: C['--accent'], 'font-size': 1.3, 'font-weight': 700, 'data-aisle': p, style: 'cursor:pointer' }, g);
    }
    label(AREAS.b2[0] + AREAS.b2[2] / 2, AREAS.b2[1] - 1, 'BODEGA 2 · P18', { fill: C['--ink'] }, g);
    label(AREAS.ed5[0] + 4, AREAS.ed5[1] - 1, 'P17 · bodega chica', { fill: C['--ink'] }, g);
    label(AREAS.sub[0] + AREAS.sub[2] / 2, AREAS.sub[1] + AREAS.sub[3] / 2, 'SUBESTÁNDAR', { 'font-size': 1.3 }, g);
    for (const k of ['c2', 'c3', 'c4', 'c5']) { const a = AREAS[k]; label(a[0] + a[2] / 2, a[1] + a[3] / 2 + .6, k.toUpperCase() + ' · staging', { 'font-size': 1.6 }, g); }
    label(AREAS.c1[0] + AREAS.c1[2] / 2, AREAS.c1[1] + AREAS.c1[3] + 2, 'C1 · STAGE DE RECEPCIÓN', { fill: C['--accent'], 'font-weight': 700 }, g);
    el('g', { id: 'cells' }, svg);
    el('g', { id: 'stage' }, svg);
    el('g', { id: 'hl' }, svg);
  }

  function drawCells() {
    const g = svg.querySelector('#cells'); g.innerHTML = ''; S.cells.clear();
    const m = S.model; if (!m) return;
    const frag = document.createDocumentFragment();
    for (const a of m.aisles) {
      for (let mod = 1; mod <= a.mods; mod++) {
        const G = geo(a.p, mod, a.mods); if (!G) continue;
        const grp = document.createElementNS(NS, 'g');
        grp.setAttribute('class', 'cell');
        rectA([G.x, G.y + .06, G.w, G.h - .12], { fill: '#0b1016', stroke: '#24303d', 'stroke-width': .06 }, grp);
        const strips = [];
        for (let n = 1; n <= a.nivs; n++) {
          const pos = pad(a.p) + '-' + pad(mod) + '-' + pad(n);
          const P = m.positions.get(pos); if (!P) continue;
          const r = el('rect', { 'data-pos': pos }, grp);
          strips.push({ n, r, P });
          S.cells.set(pos, { r, P, G, nivs: a.nivs, grp });
          if (a.p === 19 || P.percha) { // barra de llenado en pallets
            const f = el('rect', { 'pointer-events': 'none' }, grp);
            S.cells.get(pos).fill = f;
          }
        }
        frag.appendChild(grp);
      }
    }
    g.appendChild(frag);
    layoutCells(); paint();
  }
  const pad = n => String(n).padStart(2, '0');

  function layoutCells() {
    for (const [pos, c] of S.cells) {
      const { G, nivs, P, r } = c;
      let x = G.x, w = G.w, show = true;
      if (P.percha) { show = S.lvl <= 1; }
      else if (nivs > 1) {
        if (S.lvl === 0) { const gap = .05, sw = (G.w - gap * (nivs - 1)) / nivs; x = G.x + (P.n - 1) * (sw + gap); w = sw; }
        else show = P.n === S.lvl;
      } else if (S.lvl > 1 && P.p !== 19) show = false;
      r.setAttribute('x', x); r.setAttribute('y', G.y + .08); r.setAttribute('width', w); r.setAttribute('height', Math.max(.05, G.h - .16));
      r.style.display = show ? '' : 'none';
      if (c.fill) c.fill.style.display = show ? '' : 'none';
    }
  }

  function matches(P) {
    if (S.zt && !(P.zona && P.zona.zt === S.zt)) return false;
    if (!S.q) return true;
    const q = S.q;
    return P.items.some(i => i.sku.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)) || P.pref.some(k => k.toLowerCase().includes(q));
  }

  function paint() {
    let hits = 0;
    for (const [pos, c] of S.cells) {
      const P = c.P, r = c.r, hit = matches(P);
      if ((S.q || S.zt) && hit) hits++;
      if ((P.p === 19 || P.percha) && S.mode === 'occ') {
        const raw = P.p === 19 ? P.pallets / M.CAP_P19 : (P.fill ?? (P.items.length ? 1 : 0)), ratio = Math.min(1, raw);
        r.setAttribute('fill', C['--free']); r.setAttribute('fill-opacity', .9);
        const G = c.G, hh = (G.h - .16) * 1;
        c.fill.setAttribute('x', G.x); c.fill.setAttribute('width', G.w * ratio);
        c.fill.setAttribute('y', G.y + .08); c.fill.setAttribute('height', hh);
        c.fill.setAttribute('fill', raw > 1 ? C['--warn'] : P.percha ? C['--occ'] : C['--occ-2']);
      } else {
        r.setAttribute('fill', fillFor(P)); r.setAttribute('fill-opacity', 1);
        if (c.fill) c.fill.setAttribute('width', 0);
      }
      const dim = (S.q || S.zt) && !hit;
      c.grp.style.opacity = dim ? .15 : 1;
      r.setAttribute('stroke', S.q && hit ? C['--accent'] : 'none');
      r.setAttribute('stroke-width', .18);
    }
    $('qres').textContent = (S.q || S.zt) ? hits + ' posiciones' : '';
    drawStage(); drawLegend();
  }

  function drawStage() {
    const g = svg.querySelector('#stage'); g.innerHTML = '';
    const m = S.model; if (!m) return;
    const c1 = AREAS.c1, max = Math.max(1, ...m.stage.map(s => s.lpns));
    // REBA-01: recuadro vertical a la entrada (poniente)
    const boxes = { 'REBA-01': [c1[0] + .6, c1[1] + .8, 3.2, c1[3] - 1.6] };
    const sx = c1[0] + 4.6, sw = (c1[2] - 5.2) / 3, sh = (c1[3] - 1.6) / 2;
    ['STREC01', 'STREC02', 'STREC03', 'STREC04', 'STREC05', 'STREC06'].forEach((id, i) => {
      boxes[id] = [sx + (i % 3) * sw + .15, c1[1] + .8 + Math.floor(i / 3) * sh + .15, sw - .3, sh - .3];
    });
    S.stageBoxes = boxes;
    for (const s of m.stage) {
      const b = boxes[s.id]; if (!b) continue;
      const on = S.stageTab === s.id;
      const t = s.lpns / max;
      const grp = el('g', { 'data-stage': s.id, style: 'cursor:pointer' }, g);
      rectA(b, { fill: C['--accent'], 'fill-opacity': .12 + .55 * t, stroke: on ? C['--ink'] : C['--accent'], 'stroke-width': on ? .35 : .15, rx: .3 }, grp);
      const short = s.id === 'REBA-01' ? 'REBA' : 'ST ' + s.id.slice(-2);
      label(b[0] + b[2] / 2, b[1] + b[3] / 2 - .5, short, { fill: C['--ink'], 'font-size': 1.05, 'font-weight': 600, 'pointer-events': 'none' }, grp);
      label(b[0] + b[2] / 2, b[1] + b[3] / 2 + 1.3, String(s.lpns), { fill: C['--ink'], 'font-size': 1.8, 'font-weight': 700, 'pointer-events': 'none' }, grp);
    }
  }

  function drawLegend() {
    const L = $('legend');
    if (S.mode === 'occ') L.innerHTML =
      `<span><i style="background:${C['--free']}"></i>Libre</span><span><i style="background:${C['--occ']}"></i>Surtido (N1)</span><span><i style="background:${C['--occ-2']}"></i>Almacenamiento (N2–N3)</span><span><i style="background:linear-gradient(90deg,${C['--occ-2']} 55%,${C['--free']} 55%)"></i>Percha: llenado (P19 pallets / 14 · P10–P11 cajas / capacidad)</span><span><i style="background:${C['--alt']}"></i>Bloqueada por altura</span><span><i style="background:${C['--ext']}"></i>2º espacio de picking</span><span><i style="background:${C['--asig']}"></i>Preferencia sin stock</span><span><i style="background:${C['--accent']}"></i>Stage por guardar</span>`;
    else L.innerHTML =
      `<span><i style="background:${C['--crit']}"></i>≤ 30 días</span><span><i style="background:${C['--warn']}"></i>31–60</span><span><i style="background:${C['--watch']}"></i>61–90</span><span><i style="background:#3a4d63"></i>&gt; 90 o sin dato</span><span><i style="background:#1b3a2f"></i>Libre</span>`;
  }

  // ---------- Paneles ----------
  const fmt = n => Math.round(n).toLocaleString('es-CL');
  const pct = n => Math.round(n * 100) + ' %';

  function renderPanels() {
    const m = S.model, k = m.kpi;
    const sinDest = Object.values(S.allSug || (S.allSug = M.suggestAll(m))).flat().filter(x => !x.destino).length;
    const capTxt = m.hasPrefs ? `<div class="l">−${fmt(k.bloqueadas)} bloqueadas: ${fmt(k.bloqAltura)} por altura de picking (N2) y ${fmt(k.bloqExt)} por picking de doble espacio (N1)</div>` : '<div class="l">Carga las preferencias para descontar los niveles bloqueados.</div>';
    $('kpis').innerHTML = `
      <div class="kpi cap" style="grid-column:span 2"><div class="row" style="gap:18px;align-items:flex-end"><div><div class="v">${fmt(k.capCompleta)}</div><div class="l">capacidad completa</div></div><div style="color:var(--muted);font:600 22px var(--display)">→</div><div><div class="v" style="color:var(--accent)">${fmt(k.capReal)}</div><div class="l">capacidad real</div></div></div>${capTxt}<div class="meter cap"><span style="width:${k.capReal / k.capCompleta * 100}%;background:var(--accent)"></span><span style="width:${k.bloqueadas / k.capCompleta * 100}%;background:var(--alt)"></span></div></div>
      <div class="kpi free"><div class="v">${fmt(k.libres)}</div><div class="l">libres reales${m.hasPrefs ? ` (${fmt(k.total - k.ocupadas)} vacías en el sistema, ${fmt(k.asignadasVacias)} con preferencia)` : ''}</div></div>
      <div class="kpi"><div class="v">${pct(k.pctOcc)}</div><div class="l">ocupación sobre capacidad real</div><div class="meter"><span style="width:${Math.round(k.pctOcc * 100)}%"></span></div></div>
      <div class="kpi free"><div class="v">${fmt(k.p19.libres)}</div><div class="l">pallets libres Bodega 1 (${fmt(k.p19.pallets)} de ${fmt(k.p19.capacidad)})</div></div>
      <div class="kpi stage"><div class="v">${fmt(k.stageLpn)}</div><div class="l">LPN en stage C1 por guardar${sinDest ? ` · <span style="color:var(--crit)">${fmt(sinDest)} sin espacio libre</span>` : ''}</div></div>
      <div class="kpi crit" style="grid-column:span 2"><div class="row" style="justify-content:space-between"><div><div class="v" style="color:var(--crit)">${fmt(k.vence30)}</div><div class="l">posiciones con producto a ≤ 30 días de vencer</div></div><button class="btn" id="seevu">Ver en el plano</button></div></div>`;
    $('seevu').onclick = () => setMode('vu');
    $('levels').innerHTML = k.porNivel.map(n => `<div><b>${fmt(n.libres)}</b><small>N${n.n} libres${n.bloq ? ` · <span style="color:var(--alt)">${fmt(n.bloq)} bloq.</span>` : ''}</small></div>`).join('');
    const rk = k.porPasillo.filter(x => x.p !== 17 && x.p !== 19).sort((a, b) => b.libres - a.libres);
    $('rank').innerHTML = rk.map(x => `<button data-p="${x.p}" title="Ver pasillo ${x.p}"><span class="n">P${pad(x.p)}</span><span class="bar"><span class="o" style="width:${x.ocup / x.total * 100}%"></span><span style="background:var(--asig);width:${Math.max(0, x.total - x.ocup - x.bloq - x.libres) / x.total * 100}%"></span><span style="background:var(--alt);width:${x.bloq / x.total * 100}%"></span><span class="f" style="width:${x.libres / x.total * 100}%"></span></span><span class="c">${x.libres} libres</span></button>`).join('');
    renderStage(); renderPicking(); renderP19(); renderFill();
  }

  // ---------- Módulos de movimientos ----------
  const TIPO = { completar: 'Completar percha', asignar: 'Asignar percha', liberar: 'Liberar percha' };
  function moveRows(list) {
    return list.map((x, i) => `<tr class="sug${x.avisoFefo ? ' warnrow' : ''}" data-i="${i}"><td>${x.tipo ? `<span class="chip-t">${esc(TIPO[x.tipo])}</span><br>` : ''}<span class="mono">${esc(String(x.lpn).slice(-8))}</span> · ${esc(x.desc)}<br><span class="note mono">${esc(x.sku)} · ${fmt(x.qty)} cj</span></td><td>${vuBadge(x.vu)}</td><td><b class="mono">${esc(x.origen)}</b> → <b class="mono" style="color:var(--free)">${esc(x.destino)}</b><br><span class="note">${esc(x.motivo)}</span></td></tr>`).join('') || '<tr><td colspan="3" class="note">Sin movimientos sugeridos.</td></tr>';
  }
  function p19params() { const v = id => +$(id).value; return { cap: v('p19cap') || 14, ventana: v('p19ven'), liberarMax: v('p19lib'), minPallets: v('p19min') || 1 }; }
  function renderP19() {
    const m = S.model; S.p19 = M.consolidateP19(m, p19params());
    const r = S.p19, cnt = t => r.moves.filter(x => x.tipo === t).length;
    const perchas = new Set(r.moves.filter(x => x.tipo === 'asignar').map(x => x.destino)).size;
    $('p19kpi').innerHTML = (r.sinFechas ? '<div class="note" style="grid-column:span 2;color:var(--warn)">El archivo cargado no trae días de vida útil: la ventana de fechas no se está validando. Carga la vida útil para respetar FEFO.</div>' : '') + `<div class="kpi free"><div class="v">${fmt(r.liberadas)}</div><div class="l">posiciones de almacenamiento liberadas (netas)</div></div><div class="kpi"><div class="v">${fmt(r.moves.length - cnt('liberar'))}</div><div class="l">pallets hacia el pasillo 19 · ${perchas} perchas reasignadas</div></div>`;
    const tabs = { todos: 'Todos', completar: TIPO.completar, asignar: TIPO.asignar, liberar: TIPO.liberar };
    $('p19tabs').innerHTML = Object.keys(tabs).map(t => `<button data-t="${t}" aria-pressed="${t === S.p19tab}">${tabs[t]}<em>${t === 'todos' ? r.moves.length : cnt(t)}</em></button>`).join('');
    S.p19rows = S.p19tab === 'todos' ? r.moves : r.moves.filter(x => x.tipo === S.p19tab);
    $('p19body').innerHTML = moveRows(S.p19rows);
  }
  function renderFill() {
    const m = S.model; S.fill = M.fillPicking(m);
    const r = S.fill, av = r.moves.filter(x => x.avisoFefo).length;
    if (r.sinCapacidad) { $('fillkpi').innerHTML = '<div class="note" style="grid-column:span 2">Carga la hoja UBICACIONES (capacidad máxima) y las preferencias para calcular el llenado.</div>'; $('filltabs').innerHTML = ''; $('fillbody').innerHTML = ''; S.fillrows = []; return; }
    const dest = new Set(r.moves.map(x => x.destino)).size;
    $('fillkpi').innerHTML = `<div class="kpi free"><div class="v">${fmt(r.liberadas)}</div><div class="l">posiciones liberadas</div></div><div class="kpi"><div class="v">${fmt(r.moves.length)}</div><div class="l">LPN a ${dest} ubicaciones de surtido${av ? ` · <span style="color:var(--warn)">${av} con aviso FEFO</span>` : ''}</div></div>`;
    const tabs = { todos: 'Todos', rack: 'Desde racks', stage: 'Desde stage / MIX', fefo: 'Aviso FEFO' };
    const f = { todos: () => true, rack: x => /^\d/.test(x.origen), stage: x => !/^\d/.test(x.origen), fefo: x => x.avisoFefo };
    $('filltabs').innerHTML = Object.keys(tabs).map(t => `<button data-t="${t}" aria-pressed="${t === S.filltab}">${tabs[t]}<em>${r.moves.filter(f[t]).length}</em></button>`).join('');
    S.fillrows = r.moves.filter(f[S.filltab]);
    $('fillbody').innerHTML = moveRows(S.fillrows);
  }

  const PT = { doble_altura: 'Doble altura', doble_ancho: 'Doble espacio', sin_preferencia: 'Sin preferencia', pref_duplicada: 'Pref. duplicada', asignada_vacia: 'Pref. sin stock' };
  function renderPicking() {
    const m = S.model;
    if (!m.hasPrefs) { $('ptabs').innerHTML = ''; $('pnote').textContent = 'Carga el Excel de preferencias (hoja PREFERENCIA) para ver los bloqueos.'; $('pbody').innerHTML = ''; return; }
    S.report = M.pickingReport(m);
    const cnt = {}; S.report.forEach(r => { cnt[r.tipo] = (cnt[r.tipo] || 0) + 1; });
    $('ptabs').innerHTML = Object.keys(PT).map(t => `<button data-t="${t}" aria-pressed="${t === S.ptab}">${PT[t]}<em>${cnt[t] || 0}</em></button>`).join('');
    const rows = S.report.filter(r => r.tipo === S.ptab);
    const help = { doble_altura: 'Pallets de picking tan altos que inutilizan el nivel 2 de su módulo.', doble_ancho: 'SKUs que usan dos módulos del nivel 1.', sin_preferencia: 'Stock en surtido en una posición sin preferencia: picking duplicado o fuera de lugar.', pref_duplicada: 'SKUs con más de una preferencia de picking.', asignada_vacia: 'Preferencias sin stock: la posición queda reservada y vacía.' };
    $('pnote').textContent = help[S.ptab] + ' Clic en una fila para verla en el plano.';
    $('pbody').innerHTML = rows.map((r, i) => `<tr class="sug" data-i="${i}"><td><b class="mono" style="color:var(--accent)">${esc(r.pos)}</b><br>${esc(r.desc || '—')}<br><span class="note mono">${esc(r.sku)}</span></td><td>${esc(r.detalle)}<br><span class="note">${esc(r.accion)}</span></td></tr>`).join('') || '<tr><td colspan="2" class="note">Sin casos.</td></tr>';
    S.prows = rows;
  }
  function renderStage() {
    const m = S.model;
    $('stabs').innerHTML = m.stage.map(s => `<button data-s="${s.id}" aria-pressed="${s.id === S.stageTab}">${s.id}<em>${s.lpns}</em></button>`).join('');
    if (!S.allSug) S.allSug = M.suggestAll(m);
    S.sug = S.allSug[S.stageTab] || [];
    const ok = S.sug.filter(x => x.destino).length;
    $('snote').innerHTML = S.sug.length ? `${S.sug.length} LPN · <span class="ok">${ok} con destino sugerido</span> · ordenado por vencimiento (FEFO). Pasa el mouse para ver el destino en el plano.` : 'Sin stock en esta zona.';
    $('sbody').innerHTML = S.sug.map((s, i) => `<tr class="sug" data-i="${i}"><td><span class="mono">${s.lpn.startsWith('—') ? esc(s.lpn) : esc(s.lpn.slice(-8))}</span><br>${esc(s.desc)}<br><span class="note mono">${esc(s.sku)} · ${fmt(s.qty)}</span></td><td>${vuBadge(s.vu)}</td><td><b class="mono" style="color:${s.destino ? 'var(--free)' : 'var(--crit)'}">${esc(s.destino || 'sin espacio')}</b><br><span class="note">${esc(s.motivo)}</span></td></tr>`).join('');
  }
  function vuBadge(v) { return v === null || v === undefined ? '<span class="note">—</span>' : `<span class="vu" style="background:${vuColor(v) === '#3a4d63' ? '#8fa3b8' : vuColor(v)}">${v}</span>`; }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function showDetail(pos) {
    const c = S.cells.get(pos); if (!c) return;
    const P = c.P, D = $('detail');
    const zona = P.p === 19 ? 'Bodega 1' : P.p === 18 ? 'Bodega 2' : P.p === 17 ? 'Bodega chica' : (P.p <= 7 ? 'Picking 1' : 'Picking 2');
    const est = P.block === 'altura' ? `<b style="color:var(--alt)">BLOQUEADA</b> · el pallet de picking de ${esc(P.blockBy)} ocupa este nivel por altura`
      : P.block === 'ext' ? `<b style="color:var(--ext)">BLOQUEADA</b> · segundo espacio del picking de ${esc(P.blockBy)}`
      : (!P.items.length && P.status === 'asignada') ? `<b style="color:var(--asig)">PREFERENCIA SIN STOCK</b> · reservada para ${esc(P.pref.join(', '))}`
      : P.percha ? `Percha de picking (un solo nivel) · ${P.capCj ? fmt(P.items.reduce((s, i) => s + i.qty, 0)) + ' de ' + fmt(P.capCj) + ' cajas · ≈' + P.palletsEst + ' de ' + P.percha + ' pallets' : 'capacidad ' + P.percha + ' pallets'}`
      : !P.items.length ? '<span class="ok">LIBRE</span>' : P.p === 19 ? `${P.pallets} de ${M.CAP_P19} pallets` : (P.n === 1 ? 'Surtido' : 'Almacenamiento');
    const rows = P.items.slice().sort((a, b) => (a.vu ?? 1e9) - (b.vu ?? 1e9)).map(i => `<tr><td class="mono">${esc(i.ubic.split('-').pop())}</td><td>${esc(i.desc)}<br><span class="note mono">${esc(i.sku)}${i.lpn ? ' · ' + esc(i.lpn.slice(-8)) : ''}</span></td><td class="mono">${fmt(i.qty)}</td><td>${vuBadge(i.vu)}</td></tr>`).join('');
    D.innerHTML = `<button class="x" aria-label="Cerrar">×</button><div class="mono" style="font-size:18px;color:var(--accent)">${pos}</div><div class="note">${zona} · Pasillo ${P.p} · Módulo ${P.m} · Nivel ${P.n}${P.zona ? ' · ' + esc(P.zona.zt) + ' / ' + esc(P.zona.zm) : ''}${P.pref.length && P.items.length ? ' · Preferencia: ' + esc(P.pref.join(', ')) : ''}</div><div style="margin:6px 0">${est}</div>${rows ? `<div class="tablebox" style="max-height:220px"><table><thead><tr><th>Sub</th><th>Producto</th><th>Cant.</th><th>Días</th></tr></thead><tbody>${rows}</tbody></table></div>` : (P.block || P.status === 'asignada' ? '' : '<div class="note">Posición disponible para guardar.</div>')}`;
    D.classList.add('on'); D.querySelector('.x').onclick = () => { D.classList.remove('on'); highlight(null); };
    highlight(pos);
    D.scrollIntoView({ block: 'nearest' });
  }

  function geomOf(id) {
    if (!id) return null;
    const c = S.cells.get(String(id).slice(0, 8)); if (c) return c.G;
    const b = S.stageBoxes && S.stageBoxes[id]; if (b) return { x: b[0], y: b[1], w: b[2], h: b[3] };
    return null;
  }
  function highlightMove(o, d) {
    const g = svg.querySelector('#hl'); g.innerHTML = '';
    const A = geomOf(o), B = geomOf(d);
    if (!svg.querySelector('#arr')) { const defs = el('defs', {}, svg); const mk = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs); el('path', { d: 'M0,0 L10,5 L0,10 z', fill: C['--accent'] }, mk); }
    if (A) rectA([A.x - .4, A.y - .3, A.w + .8, A.h + .6], { fill: 'none', stroke: C['--warn'], 'stroke-width': .3, rx: .3 }, g);
    if (B) rectA([B.x - .4, B.y - .3, B.w + .8, B.h + .6], { fill: 'none', stroke: C['--free'], 'stroke-width': .35, rx: .3 }, g);
    if (A && B) el('line', { x1: A.x + A.w / 2, y1: A.y + A.h / 2, x2: B.x + B.w / 2, y2: B.y + B.h / 2, stroke: C['--accent'], 'stroke-width': .3, 'stroke-dasharray': '.8 .4', 'marker-end': 'url(#arr)' }, g);
  }
  function fitMove(o, d) {
    const A = geomOf(o), B = geomOf(d); const gs = [A, B].filter(Boolean); if (!gs.length) return;
    const x0 = Math.min(...gs.map(g => g.x)) - 8, y0 = Math.min(...gs.map(g => g.y)) - 6, x1 = Math.max(...gs.map(g => g.x + g.w)) + 8, y1 = Math.max(...gs.map(g => g.y + g.h)) + 6;
    fit([x0, y0, Math.max(20, x1 - x0), Math.max(14, y1 - y0)]); highlightMove(o, d);
  }

  function highlight(pos) {
    const g = svg.querySelector('#hl'); g.innerHTML = '';
    if (!pos) return;
    const c = S.cells.get(pos); if (!c) return;
    const G = c.G;
    rectA([G.x - .5, G.y - .4, G.w + 1, G.h + .8], { fill: 'none', stroke: C['--ink'], 'stroke-width': .3, rx: .3 }, g);
    el('circle', { cx: G.x + G.w / 2, cy: G.y + G.h / 2, r: 2.2, fill: 'none', stroke: C['--accent'], 'stroke-width': .25 }, g);
  }

  // ---------- Vista: zoom y paneo ----------
  function setVB() { svg.setAttribute('viewBox', S.vb.join(' ')); }
  function fit(v) {
    const r = svg.getBoundingClientRect(), ar = r.width / Math.max(1, r.height);
    let [x, y, w, h] = v;
    if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y -= Math.min((nh - h) / 2, 6); h = nh; }
    S.vb = [x, y, w, h]; setVB();
  }
  function zoomAt(f, cx, cy) {
    const [x, y, w, h] = S.vb; const nw = Math.min(400, Math.max(8, w * f)), k = nw / w;
    S.vb = [cx - (cx - x) * k, cy - (cy - y) * k, nw, h * k]; setVB();
  }
  function toSvg(e) { const r = svg.getBoundingClientRect(); return [S.vb[0] + (e.clientX - r.left) / r.width * S.vb[2], S.vb[1] + (e.clientY - r.top) / r.height * S.vb[3]]; }
  function zoomAisle(p) {
    const a = S.model.aisles.find(x => x.p === +p); if (!a) return;
    const gs = []; for (let k = 1; k <= a.mods; k++) { const g = geo(a.p, k, a.mods); if (g) gs.push(g); }
    const xs = gs.flatMap(g => [g.x, g.x + g.w]), ys = gs.flatMap(g => [g.y, g.y + g.h]);
    if (a.p === 18) { const b = AREAS.b2; fit([b[0] - 2, b[1] - 3, b[2] + 4, b[3] + 6]); return; }
    if (a.p === 17) { const b = AREAS.ed5; fit([b[0] - 4, b[1] - 4, b[2] + 8, b[3] + 8]); return; }
    const x0 = Math.min(...xs) - 4, x1 = Math.max(...xs) + 4;
    fit([x0, Math.min(...ys) - 3, x1 - x0, Math.max(...ys) - Math.min(...ys) + 6]);
  }

  let drag = null;
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vb: S.vb.slice(), moved: false }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; svg.classList.add('drag'); }
      if (drag.moved) { const r = svg.getBoundingClientRect(); S.vb = [drag.vb[0] - dx / r.width * drag.vb[2], drag.vb[1] - dy / r.height * drag.vb[3], drag.vb[2], drag.vb[3]]; setVB(); }
      $('tip').style.display = 'none'; return;
    }
    tip(e);
  });
  svg.addEventListener('pointerup', e => {
    svg.classList.remove('drag');
    const moved = drag && drag.moved; drag = null;
    if (moved) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    if (!t) return;
    const pos = t.getAttribute && t.getAttribute('data-pos');
    if (pos) return showDetail(pos);
    const a = t.getAttribute && t.getAttribute('data-aisle'); if (a) return zoomAisle(a);
    const st = t.closest && t.closest('[data-stage]'); if (st) { S.stageTab = st.getAttribute('data-stage'); renderStage(); drawStage(); $('nav').querySelector('[data-panel="stage"]').click(); $('stabs').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  svg.addEventListener('pointerleave', () => { $('tip').style.display = 'none'; });
  svg.addEventListener('wheel', e => { e.preventDefault(); const [cx, cy] = toSvg(e); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy); }, { passive: false });
  $('zin').onclick = () => zoomAt(1 / 1.4, S.vb[0] + S.vb[2] / 2, S.vb[1] + S.vb[3] / 2);
  $('zout').onclick = () => zoomAt(1.4, S.vb[0] + S.vb[2] / 2, S.vb[1] + S.vb[3] / 2);
  $('zbod').onclick = () => fit(VIEW_BOD);
  $('zall').onclick = () => fit(VIEW_ALL);

  function tip(e) {
    const T = $('tip'), pos = e.target.getAttribute && e.target.getAttribute('data-pos');
    if (!pos) { T.style.display = 'none'; return; }
    const P = S.cells.get(pos).P;
    let body;
    if (P.block) body = `<span style="color:var(--alt)">Bloqueada</span> por ${esc(P.blockBy)}`;
    else if (!P.items.length && P.status === 'asignada') body = `<span style="color:var(--asig)">Preferencia sin stock</span><br>${esc(P.pref.join(', '))}`;
    else if (!P.items.length) body = '<span class="ok">Libre</span>';
    else {
      const sk = [...new Set(P.items.map(i => i.desc))];
      body = (P.p === 19 ? `<b>${P.pallets} / ${M.CAP_P19} pallets</b><br>` : P.percha ? `<b>Percha de picking · ${P.fill != null ? '≈' + P.palletsEst + ' de ' + P.percha + ' pallets (' + Math.round(P.fill * 100) + ' %)' : 'capacidad ' + P.percha + ' pallets'}</b><br>` : '') + sk.slice(0, 3).map(esc).join('<br>') + (sk.length > 3 ? `<br><span class="note">+${sk.length - 3} más</span>` : '') + (P.minVU !== null ? `<br><span class="note">Vence en ${P.minVU} días</span>` : '');
    }
    T.innerHTML = `<div class="t">${esc(pos)}</div>${body}`;
    const r = $('mapwrap').getBoundingClientRect();
    T.style.display = 'block';
    T.style.left = Math.min(r.width - 310, e.clientX - r.left + 14) + 'px';
    T.style.top = Math.min(r.height - 120, e.clientY - r.top + 14) + 'px';
  }

  // ---------- Controles ----------
  function setMode(v) { S.mode = v; [...$('mode').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); paint(); }
  $('mode').onclick = e => { const v = e.target.dataset && e.target.dataset.v; if (v) setMode(v); };
  $('lvl').onclick = e => { const v = e.target.dataset && e.target.dataset.v; if (v === undefined) return; S.lvl = +v; [...$('lvl').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); layoutCells(); };
  let qt; $('q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value.trim().toLowerCase(); paint(); }, 150); });
  $('rank').onclick = e => { const b = e.target.closest('button'); if (b) zoomAisle(b.dataset.p); };
  $('stabs').onclick = e => { const b = e.target.closest('button'); if (b) { S.stageTab = b.dataset.s; renderStage(); drawStage(); } };
  $('sbody').addEventListener('mouseover', e => { const tr = e.target.closest('tr'); if (tr) { const s = S.sug[+tr.dataset.i]; highlight(s && s.destino); } });
  $('sbody').addEventListener('click', e => { const tr = e.target.closest('tr'); if (tr) { const s = S.sug[+tr.dataset.i]; if (s && s.destino) { const c = S.cells.get(s.destino); if (c) { const G = c.G; fit([G.x - 12, G.y - 8, 24 + G.w, 16 + G.h]); highlight(s.destino); } } } });

  // ---------- ADC ----------
  function movesADC(list, tipoCambio) {
    const f = new Date().toLocaleDateString('es-CL'), q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = ['N°', 'Fecha', 'Tipo de cambio', 'Movimiento', 'LPN', 'SKU', 'Descripción', 'Cantidad (cj)', 'Días vida útil', 'Ubicación origen', 'Ubicación destino', 'Motivo', 'Solicitado por', 'Estado', 'Ejecutado por', 'Validado por', 'Observación'];
    const rows = list.map((x, i) => [i + 1, f, tipoCambio, x.tipo ? TIPO[x.tipo] : 'Llenado de surtido', x.lpn, x.sku, x.desc, x.qty, x.vu ?? '', x.origen, x.destino, x.motivo, FIRMA, 'Pendiente', '', '', '']);
    return '\uFEFF' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  }
  const today = () => new Date().toISOString().slice(0, 10);
  function wireMoves(prefix, tabKey, rowsKey, render, tipoCambio, fileTag) {
    $(prefix + 'tabs').onclick = e => { const b = e.target.closest('button'); if (b) { S[tabKey] = b.dataset.t; render(); } };
    $(prefix + 'body').addEventListener('mouseover', e => { const tr = e.target.closest('tr'); const x = tr && (S[rowsKey] || [])[+tr.dataset.i]; if (x) highlightMove(x.origen, x.destino); });
    $(prefix + 'body').addEventListener('click', e => { const tr = e.target.closest('tr'); const x = tr && (S[rowsKey] || [])[+tr.dataset.i]; if (x) fitMove(x.origen, x.destino); });
    const msg = $(prefix === 'p19' ? 'p19msg' : 'fillmsg');
    $(prefix + 'adc').onclick = () => { const L = S[rowsKey] || []; if (!L.length) { msg.textContent = 'No hay movimientos en esta vista.'; return; } saveADC(movesADC(L, tipoCambio), 'ADC_' + fileTag + '_' + S[tabKey] + '_' + today() + '.csv', msg); };
    $(prefix === 'p19' ? 'p19copy' : 'fillcopy').onclick = () => saveADC(movesADC(S[rowsKey] || [], tipoCambio), '', msg, true);
  }
  const FIRMA = 'Elías Cortés · Planificador y Control Bodega';
  function pickADC() {
    const f = new Date().toLocaleDateString('es-CL'), q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = ['N°', 'Fecha', 'Tipo de cambio', 'Hallazgo', 'Ubicación', 'SKU', 'Descripción', 'Detalle', 'Acción propuesta', 'Solicitado por', 'Estado', 'Validado por', 'Observación'];
    const rows = (S.prows || []).map((r, i) => [i + 1, f, 'Configuración preferencia de picking', PT[r.tipo], r.pos, r.sku, r.desc, r.detalle, r.accion, FIRMA, 'Pendiente', '', '']);
    return '\uFEFF' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  }
  async function saveADC(csv, name, msgEl, copy) {
    if (copy) { try { await navigator.clipboard.writeText(csv.replace(/^\uFEFF/, '').replace(/;/g, '\t').replace(/"/g, '')); msgEl.textContent = 'Copiado: pégalo en Excel.'; } catch { msgEl.textContent = 'El navegador no permitió copiar.'; } return; }
    if (!downloads) { msgEl.textContent = 'La descarga no está disponible aquí; usa Copiar ADC y pégalo en Excel.'; return; }
    try { await downloads.save({ filename: name, data: csv }); msgEl.textContent = 'ADC descargado.'; }
    catch (err) { msgEl.textContent = 'No se descargó (' + (err && err.message || 'cancelado') + '). Prueba Copiar ADC.'; }
  }
  const pname = () => 'ADC_picking_' + S.ptab + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  function adcCSV() {
    const hoy = new Date(), f = hoy.toLocaleDateString('es-CL');
    const head = ['N°', 'Fecha', 'Tipo de cambio', 'LPN', 'SKU', 'Descripción', 'Cantidad', 'Días vida útil', 'Ubicación origen', 'Ubicación destino', 'Motivo', 'Solicitado por', 'Estado', 'Validado por', 'Observación'];
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = S.sug.filter(s => s.destino).map((s, i) => [i + 1, f, 'Reubicación stage → posición', s.lpn, s.sku, s.desc, s.qty, s.vu ?? '', s.origen, s.destino, s.motivo, FIRMA, 'Pendiente', '', '']);
    return '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  }
  const fname = () => 'ADC_' + S.stageTab + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  let downloads = null;
  if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloads = d; }).catch(() => {});
  $('adc').onclick = async () => {
    const m = $('adcmsg');
    if (!S.sug.some(s => s.destino)) { m.textContent = 'No hay sugerencias con destino.'; return; }
    if (!downloads) { m.textContent = 'La descarga no está disponible aquí; usa Copiar ADC y pégalo en Excel.'; return; }
    try { await downloads.save({ filename: fname(), data: adcCSV() }); m.textContent = 'ADC descargado.'; }
    catch (err) { m.textContent = 'No se descargó (' + (err && err.message || 'cancelado') + '). Prueba Copiar ADC.'; }
  };
  $('adccopy').onclick = async () => {
    const m = $('adcmsg');
    try { await navigator.clipboard.writeText(adcCSV().replace(/^﻿/, '').replace(/;/g, '\t').replace(/"/g, '')); m.textContent = 'Copiado: pégalo en Excel.'; }
    catch { m.textContent = 'El navegador no permitió copiar.'; }
  };

  $('padc').onclick = () => { if (!(S.prows || []).length) { $('padcmsg').textContent = 'No hay filas en esta pestaña.'; return; } saveADC(pickADC(), pname(), $('padcmsg')); };
  $('padccopy').onclick = () => saveADC(pickADC(), '', $('padcmsg'), true);
  $('ptabs').onclick = e => { const b = e.target.closest('button'); if (b) { S.ptab = b.dataset.t; renderPicking(); } };
  $('pbody').addEventListener('mouseover', e => { const tr = e.target.closest('tr'); if (tr && S.prows[+tr.dataset.i]) highlight(S.prows[+tr.dataset.i].pos); });
  $('pbody').addEventListener('click', e => { const tr = e.target.closest('tr'); const r = tr && S.prows[+tr.dataset.i]; if (r) { const c = S.cells.get(r.pos); if (c) { const G = c.G; fit([G.x - 12, G.y - 8, 24 + G.w, 16 + G.h]); showDetail(r.pos); } } });
  $('zt').onchange = e => { S.zt = e.target.value; paint(); };
  wireMoves('p19', 'p19tab', 'p19rows', () => renderP19(), 'Movimiento no dirigido · consolidación pasillo 19', 'P19');
  wireMoves('fill', 'filltab', 'fillrows', () => renderFill(), 'Movimiento no dirigido · llenado de surtido', 'llenado');
  let pt; ['p19cap', 'p19ven', 'p19lib', 'p19min'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(pt); pt = setTimeout(() => { if (S.model) renderP19(); }, 250); }));
  $('nav').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    S.panel = b.dataset.panel;
    [...$('nav').children].forEach(x => x.setAttribute('aria-pressed', x === b));
    document.querySelectorAll('aside section[data-panel]').forEach(sec => { sec.hidden = sec.dataset.panel !== S.panel; });
    highlight(null);
  };

  // ---------- Carga de datos ----------
  function ingest(name, text, user) {
    const p = M.parseCSV(text), kind = M.detectKind(p.headers);
    if (!kind) { if (user) $('msg').textContent = `"${name}" no se reconoce: se esperaba cuadratura, vida útil o la hoja de preferencias / zonas.`; return false; }
    if (kind === 'preferencia' || kind === 'zonas' || kind === 'capacidades') {
      S.ref[kind] = { name, n: p.rows.length, data: kind === 'preferencia' ? M.parsePrefs(p.rows) : kind === 'zonas' ? M.parseZonas(p.rows) : M.parseCaps(p.rows) };
      $('msg').textContent = ''; return true;
    }
    S.files[kind] = { name, recs: M.normalize(p.rows, kind), n: p.rows.length };
    if (user) { for (const k in S.files) if (S.files[k].demo) delete S.files[k]; }
    S.files[kind].demo = !user;
    S.main = user ? kind : (S.files.vidautil ? 'vidautil' : 'cuadratura');
    $('msg').textContent = '';
    return true;
  }
  function rebuild() {
    if (!S.main) return;
    S.model = M.buildModel(S.files[S.main].recs, { prefs: S.ref.preferencia && S.ref.preferencia.data, zonas: S.ref.zonas && S.ref.zonas.data, caps: S.ref.capacidades && S.ref.capacidades.data }); S.allSug = null;
    const zts = S.ref.zonas ? [...new Set([...S.ref.zonas.data.values()].map(z => z.zt).filter(Boolean))].sort() : [];
    $('zt').innerHTML = '<option value="">Todas las zonas</option>' + zts.map(z => `<option${z === S.zt ? ' selected' : ''}>${esc(z)}</option>`).join('');
    $('zt').style.display = zts.length ? '' : 'none';
    drawCells(); renderPanels(); renderSrc();
  }
  function renderSrc() {
    const lab = { vidautil: 'Vida útil', cuadratura: 'Cuadratura', preferencia: 'Preferencias', zonas: 'Zonas', capacidades: 'Capacidades' };
    $('src').innerHTML = Object.keys(S.files).map(k => `<button class="chip ${k === S.main ? 'on' : ''}" data-k="${k}" title="${esc(S.files[k].name)}">${k === S.main ? '● ' : ''}${lab[k]} · ${fmt(S.files[k].n)} filas</button>`).join('')
      + Object.keys(S.ref).map(k => `<span class="chip" title="${esc(S.ref[k].name)}">${lab[k]} · ${fmt(S.ref[k].n)}</span>`).join('');
  }
  $('src').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.k !== S.main) { S.main = b.dataset.k; rebuild(); } };
  async function readFiles(list) {
    let ok = false;
    for (const f of list) {
      if (/\.xlsx?$/i.test(f.name)) {
        try {
          const X = await loadXLSX(), wb = X.read(await f.arrayBuffer(), { type: 'array' });
          let any = false;
          for (const sh of wb.SheetNames) any = ingest(f.name + ' · ' + sh, X.utils.sheet_to_csv(wb.Sheets[sh], { blankrows: false }), true) || any;
          if (!any) $('msg').textContent = `Ninguna hoja de "${f.name}" se reconoce.`;
          ok = any || ok;
        } catch (e) { $('msg').textContent = 'No se pudo leer el Excel (' + (e.message || e) + '). Guárdalo como CSV y vuelve a cargarlo.'; }
      } else ok = ingest(f.name, await f.text(), true) || ok;
    }
    if (ok) rebuild();
  }
  $('file').onchange = e => readFiles(e.target.files);
  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return xlsxP || (xlsxP = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = () => res(window.XLSX); sc.onerror = () => { xlsxP = null; rej(new Error('no cargó el lector de Excel')); }; document.head.appendChild(sc); }));
  }
  let dc = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); dc++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { if (--dc <= 0) { dc = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); dc = 0; document.body.classList.remove('dragging'); readFiles(e.dataTransfer.files); });

  async function boot() {
    loadColors(); drawBase(); fit(VIEW_BOD);
    window.addEventListener('resize', () => fit(S.vb));
    const demo = [['data/preferencias.csv', 'Preferencias (Datos para armar 19-11)'], ['data/zonas.csv', 'Zonas ZM (Datos para armar 19-11)'], ['data/capacidades.csv', 'Capacidades UBICACIONES (Datos para armar 19-11)'], ['data/vidautil.csv', 'Vida útil 19-11 (demo)'], ['data/cuadratura.csv', 'Cuadratura 12-11 (demo)']];
    for (const [u, n] of demo) { try { const r = await fetch(u); if (r.ok) ingest(n, await r.text()); } catch (e) { /* sin demo */ } }
    if (S.main) rebuild(); else $('msg').textContent = 'Arrastra aquí la cuadratura de stock o las operaciones de vida útil exportadas del WMS.';
  }
  boot();
})();
