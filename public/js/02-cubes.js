// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Cube layout: file-to-window assignment, the space layouts (cluster/stack/network/orbit),
// trail silhouettes, collision spacing, heat halos and the six info faces.
// === Cubes ===
let CUBESEQ = 0;
function makeCube(info) {
  const slot = freeSlots.pop(); if (slot == null) return null;
  const c = { seq: ++CUBESEQ, path: info.path, key: K(info.path), name: info.name, parent: info.parent, by: info.by, slot, data: null, pos: new THREE.Vector3(), s: .01, ex: 0, home: new THREE.Vector3(), rel: null, manual: null, tScale: 1, depth: 0,
    last: [NaN, 0, 0, 0, 0], cell: null, events: [], evCount: 0, lastEv: null, hot: new Map(), live: { files: [], w: new Map(), at: new Map() }, agent: null, deps: null, linkK: null, lastScan: 0,
    heat: new Float32Array(27), pulse: new Float32Array(27), nv: 0, vcell: new Uint8Array(VPC), vslot: new Float32Array(VPC * 6), vbase: new Float32Array(VPC * 3), vheat: new Float32Array(VPC), vfl: new Float32Array(VPC * 3),
    slotOf: new Map(), relOf: [], ai: new Map(), cellDirty: true, colDirty: true, aiHot: 0, att: null, off: new THREE.Vector3() };
  const par = info.parent && S.cubes.get(K(info.parent)); if (par) c.pos.copy(par.pos);
  for (let i = 0; i < 27; i++) { const o = (slot * 27 + i) * 3, t = TYPE_COL[i % 3]; CC[o] = .05 + t.r * .03; CC[o+1] = .055 + t.g * .03; CC[o+2] = .062 + t.b * .03; }
  cellsIM.instanceColor.needsUpdate = true;
  c.label = textSprite(768, 96); c.label.material.sizeAttenuation = false; c.label.material.depthTest = false; c.label.renderOrder = 6; c.label.center.set(.5, 0); scene.add(c.label); drawLabel(c);
  S.cubes.set(c.key, c); return c;
}
function drawLabel(c) { const pr = c.data && c.data.preset ? c.data.preset.types.filter(x => x[0] !== 'carpeta').map(x => x[1]).slice(0, 2).join(' · ') : ''; drawText(c.label, [[c.name, 44, '#f2f4f5', 35], [(c.kind ? KINDS[c.kind][1] + ' ' + KINDS[c.kind][2] + ' · ' : '') + (c.data ? `${fmtB(c.data.totals.bytes)} · ${fmtN(c.data.totals.files)} archivos${pr && !c.kind ? ' · ' + pr : ''}` : 'leyendo…'), 36, c.kind ? KINDS[c.kind][0] : 'rgba(190,200,206,.85)', 76]]); }
const lastPos = new Map();
function dropCube(c) {
  for (let i = 0; i < 27; i++) setM(CM, c.slot * 27 + i, 0, 0, 0, 0, 0, 0);
  for (let k = 0; k < VPC; k++) setM(VM, c.slot * VPC + k, 0, 0, 0, 0, 0, 0);
  cellsIM.instanceMatrix.addUpdateRange(c.slot * 27 * 16, 27 * 16); voxIM.instanceMatrix.addUpdateRange(c.slot * VPC * 16, VPC * 16);
  cellsIM.instanceMatrix.needsUpdate = true; voxIM.instanceMatrix.needsUpdate = true;
  lastPos.set(c.key, c.pos.clone()); if (c.aslot != null) lastAng.set(c.key, c.aslot); if (lastPos.size > 60) lastPos.delete(lastPos.keys().next().value);
  if (c.emb) { scene.remove(c.emb); c.emb.material.dispose(); } scene.remove(c.label); c.label.userData.tex.dispose(); c.label.material.dispose(); freeSlots.push(c.slot); S.cubes.delete(c.key); if (S.sel === c) S.sel = null;
}
// assigns files to windows
function buildVoxels(c) {
  const d = c.data, now = Date.now(); c.slotOf.clear(); c.relOf = []; let k = 0;
  for (let i = 0; i < 27; i++) { const sl = SLOTS[i], top = d.cells[i].top || [], col = TYPE_COL[i % 3];
    for (let j = 0; j < Math.min(sl.length, top.length); j++) { const f = top[j];
      c.vcell[k] = i; c.vslot.set(sl[j], k * 6);
      const age = (now - f.mtime) / 864e5, rec = Math.exp(-age / 6) * .7 + Math.min(1, Math.log10(1 + f.size) / 7) * .3, br = .16 + .62 * rec;
      c.vbase[k*3] = col.r * br; c.vbase[k*3+1] = col.g * br; c.vbase[k*3+2] = col.b * br;
      c.slotOf.set(K(f.rel), k); c.relOf[k] = f.rel; k++; } }
  for (let j = k; j < c.nv; j++) setM(VM, c.slot * VPC + j, 0, 0, 0, 0, 0, 0); if (c.nv > k) voxIM.instanceMatrix.addUpdateRange((c.slot * VPC + k) * 16, (c.nv - k) * 16);
  c.nv = k; c.cellDirty = true; c.colDirty = true; voxIM.instanceMatrix.needsUpdate = true;
}
const sliceOut = i => S.slice && coord(i)[S.slice.axis] !== S.slice.layer;
function cellWorld(c, i, out) { const sp = (1 + .9 * c.ex) * c.s, b = BASE[i]; return out.set(c.pos.x + b[0] * sp, c.pos.y + b[1] * sp, c.pos.z + b[2] * sp); }
function voxWorld(c, k, out) { const i = c.vcell[k], sp = (1 + .9 * c.ex) * c.s, b = BASE[i], o = k * 6; return out.set(c.pos.x + b[0] * sp + c.vslot[o] * c.s, c.pos.y + b[1] * sp + c.vslot[o+1] * c.s, c.pos.z + b[2] * sp + c.vslot[o+2] * c.s); }
function writeCube(c) {
  const P = c.pos, s = c.s, sp = (1 + .9 * c.ex) * s, b0 = c.slot * 27, v0 = c.slot * VPC, hv = S.hover && S.hover.c === c ? S.hover.idx : -1;
  for (let i = 0; i < 27; i++) { const b = BASE[i], out = sliceOut(i), sc = s * .92 * (out ? .3 : 1) * (i === hv ? 1.05 : 1); setM(CM, b0 + i, P.x + b[0] * sp, P.y + b[1] * sp, P.z + b[2] * sp, sc, sc, sc); }
  for (let k = 0; k < c.nv; k++) { const i = c.vcell[k], b = BASE[i], o = k * 6, out = sliceOut(i) ? 0 : s;
    setM(VM, v0 + k, P.x + b[0] * sp + c.vslot[o] * s, P.y + b[1] * sp + c.vslot[o+1] * s, P.z + b[2] * sp + c.vslot[o+2] * s, c.vslot[o+3] * out, c.vslot[o+4] * out, c.vslot[o+5] * out); }
  cellsIM.instanceMatrix.addUpdateRange(b0 * 16, 27 * 16); if (c.nv) voxIM.instanceMatrix.addUpdateRange(v0 * 16, c.nv * 16);
  cellsIM.instanceMatrix.needsUpdate = true; voxIM.instanceMatrix.needsUpdate = true;
}

// === Space: cluster / stack / network / orbit ===
const SC = [1, .55, .32, .2], OPEN_EX = .3; // spacing of the 27 cells of the selected cube
function layout(resetManual) {
  layoutCore(resetManual);
  for (const c of S.cubes.values()) if (!c.vis) { c.rel = null; let p = c; while (p && !p.vis) p = p.parent && S.cubes.get(K(p.parent)); c.home.copy(p ? (p.manual || p.home) : v3.set(0, 0, 0)); }
}
function layoutCore(resetManual) {
  const allC = [...S.cubes.values()], bytes = c => c.data ? c.data.totals.bytes : 0;
  const kidsOf = (list, c) => list.filter(x => x.parent && K(x.parent) === c.key).sort((a, b) => a.seq - b.seq); // arrival order, so nothing jumps when data loads
  const full = [], walkF = (c, d) => { c.depth = d; full.push(c); kidsOf(allC, c).forEach(x => walkF(x, d + 1)); }; allC.filter(c => !c.parent || !S.cubes.has(K(c.parent))).forEach(c => walkF(c, 0));
  if (S.enter && !S.cubes.has(S.enter)) S.enter = null;
  for (const c of allC) c.vis = S.enter ? (c.key === S.enter || (!!c.parent && K(c.parent) === S.enter)) : (!c.parent || !S.cubes.has(K(c.parent)) || S.layout === 'stack' || (!!S.peek && K(c.parent) === S.peek));
  const all = allC.filter(c => c.vis), kids = c => kidsOf(all, c), cores = all.filter(c => !c.parent || !all.some(o => o.key === K(c.parent))), order = [];
  const walk = (c, d) => { c.vdepth = d; order.push(c); kids(c).forEach(x => walk(x, d + 1)); }; cores.forEach(c => walk(c, 0));
  S.order = full; S.vorder = order; S.cores = cores; const mode = S.layout;
  if (resetManual) order.forEach(c => c.manual = null);
  if (mode === 'grid') {
    const n = order.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), sp = 5.4;
    order.forEach((c, i) => { c.rel = null; c.tScale = c.vdepth ? .7 : 1; c.home.set((i % cols - (cols - 1) / 2) * sp, 0, ((i / cols | 0) - (rows - 1) / 2) * sp); }); return;
  }
  const ring = (c, depth, spin) => {
    c.tScale = SC[Math.min(depth, 3)]; const ks = kids(c); if (!ks.length) return 1.9 * c.tScale;
    const foot = 5.2 * SC[Math.min(depth + 1, 3)]; let placed = 0, r = 0, R = 0;
    while (placed < ks.length) { R = r ? R + foot * 1.2 : 3.1 * c.tScale + foot;
      const m = Math.min(Math.max(1, Math.floor(2 * Math.PI * R / foot)), ks.length - placed);
      for (let i = 0; i < m; i++) { const ch = ks[placed + i]; ch.rel = { p: c, R, a: i / m * Math.PI * 2 + r * .5, spin: spin * (r % 2 ? -1 : 1) / (1 + r), tilt: spin ? .2 : 0 }; ring(ch, depth + 1, spin); }
      placed += m; r++; }
    return R + foot;
  };
  const desc = new Map();
  for (const core of cores) { core.rel = null;
    if (mode === 'stack') { const towers = kids(core).sort((a, b) => bytes(b) - bytes(a)).map(k => { const d = []; (function w(c) { kids(c).forEach(x => { d.push(x); w(x); }); })(k); return [k, ...d.sort((a, b) => bytes(b) - bytes(a))]; });
      const gsz = l => Math.ceil(Math.sqrt(Math.ceil(l.length / 8))), foot = Math.max(1, ...towers.map(gsz)) * 1.3 + 1.3; let R = 2.6 + foot / 2 + .6, cap = 0, n = 0; const rings = []; while (n < towers.length) { cap = Math.max(1, Math.floor(2 * Math.PI * R / foot)); rings.push([R, Math.min(cap, towers.length - n)]); n += cap; R += foot; }
      desc.set(core, { towers, rings }); core.tScale = 1; core._ext = (rings.length ? rings[rings.length - 1][0] : 2.6) + 1.4; }
    else core._ext = ring(core, 0, mode === 'orbit' ? .07 : 0); }
  const river = S.space === 'vivo' && !S.enter && (mode === 'cluster' || mode === 'orbit');
  if (river) riverLayout(cores);
  else if (cores.length > 4 && mode !== 'stack') { // each top-level cube keeps its slot on the circle; newcomers take free slots
    const used = new Set(); for (const c of cores) if (c.ring != null && !used.has(c.ring)) used.add(c.ring); else c.ring = null;
    for (const c of cores) if (c.ring == null) { let i = 0; while (used.has(i)) i++; c.ring = i; used.add(i); }
    const cap = Math.max(8, Math.ceil((Math.max(...used) + 1) / 4) * 4), ext = Math.max(2.4, ...cores.map(c => c._ext)), need = Math.max(9, cap * (2 * ext + 3.5) / (2 * Math.PI));
    S.ringR = S.ringR && need <= S.ringR && need > S.ringR * .7 ? S.ringR : need;
    if (cap <= 24) cores.forEach(c => { const a = c.ring / cap * Math.PI * 2; c.home.set(Math.cos(a) * S.ringR, 0, Math.sin(a) * S.ringR); });
    else { const sp = 2 * Math.min(ext, 3.2) + 3.2, R0 = Math.max(9, sp * 1.3), slots = []; for (let k = 0; slots.length < cap; k++) { const Rk = R0 + k * sp, n = Math.floor(2 * Math.PI * Rk / sp); for (let j = 0; j < n; j++) slots.push([Rk, (j + (k % 2) * .5) / n * Math.PI * 2]); }
      cores.forEach(c => { const [Rk, a] = slots[c.ring]; c.home.set(Math.cos(a) * Rk, 0, Math.sin(a) * Rk); }); S.ringR = slots[cap - 1][0]; } }
  else { let x = 0; cores.forEach((core, i) => { if (i) x += core._ext; core.home.set(x, 0, 0); x += core._ext + 1.5; }); }
  if (!river && !(cores.length > 4 && mode !== 'stack')) { const mid = cores.length ? (cores[0].home.x + cores[cores.length - 1].home.x) / 2 : 0; cores.forEach(c => c.home.x -= mid); }
  for (const [core, { towers, rings }] of desc) { let t = 0; // each tower: the subfolder at the base (largest), its contents stacked on top
    rings.forEach(([R, m], ri) => { for (let j = 0; j < m; j++, t++) { const a = j / m * Math.PI * 2 + ri * .35, x = core.home.x + Math.cos(a) * R, z = core.home.z + Math.sin(a) * R; let y = FLOOR;
      const T = towers[t], gs = Math.ceil(Math.sqrt(Math.ceil(T.length / 8))), ys = []; void y; // columns of at most 8, heaviest at the bottom
      T.forEach((c, i) => { const col = i / 8 | 0, sc = i ? .34 : .46, cx = x + ((col % gs) - (gs - 1) / 2) * 1.3, cz = z + ((col / gs | 0) - (gs - 1) / 2) * 1.3; let yy = ys[col] ?? FLOOR;
        c.rel = null; c.tScale = sc; yy += 1.46 * sc + .1; c.home.set(cx, yy, cz); ys[col] = yy + 1.46 * sc; }); } }); }
}

const lastAct = c => (c.act && c.act.last) || (c.act && c.act.since) || 0;
const NSLOT = 16, BAND_R = [12, 17.5, 23, 28.5], BAND_TXT = ['AHORA', 'HACE SEGUNDOS', 'SE APAGA', ''], lastAng = new Map();
function bandOf(c) { if (!c.act) return 1; if (c.act.fading) return 2; return Date.now() - lastAct(c) < 10000 ? 0 : 1; }
function riverLayout(cores) {
  const used = new Map(); for (const c of cores) if (c.aslot != null) used.set(c.aslot, (used.get(c.aslot) || 0) + 1);
  for (const c of cores) if (c.aslot == null) { // nearest free slot to the program that touched it, so its beam runs straight from the center
    const lp = [...LP.values()].find(o => (o.p.links || []).some(p => K(p) === c.key)), pref = lastAng.has(c.key) ? lastAng.get(c.key) : lp ? Math.round(lp.slot / 14 * NSLOT) % NSLOT : (c.seq * 7) % NSLOT;
    let best = pref, bd = Infinity; for (let i = 0; i < NSLOT; i++) { const d = Math.min(Math.abs(i - pref), NSLOT - Math.abs(i - pref)) + (used.get(i) || 0) * 100; if (d < bd) { bd = d; best = i; } } c.aslot = best; used.set(best, (used.get(best) || 0) + 1); }
  for (const c of cores) { if (c === S.sel && c.band != null) continue; // the selection never moves
    c.band = bandOf(c); const a = c.aslot / NSLOT * Math.PI * 2, R = BAND_R[c.band]; c.home.set(Math.cos(a) * R, 0, Math.sin(a) * R); }
  placeGhosts();
}
const ringGeo = new THREE.BufferGeometry(); { const P = []; for (const R of BAND_R) for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2, b = (i + 1) / 128 * Math.PI * 2; P.push(Math.cos(a) * R, FLOOR + .02, Math.sin(a) * R, Math.cos(b) * R, FLOOR + .02, Math.sin(b) * R); } ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); }
const bandRings = new THREE.LineSegments(ringGeo, new THREE.LineDashedMaterial({ color: 0x3d5357, dashSize: .5, gapSize: .5, transparent: true, opacity: .7 })); bandRings.computeLineDistances(); scene.add(bandRings);
// === Trail: what stopped being used stays as a silhouette at the end of the river ===
const GH = new Map();
const ghGeo = new THREE.BufferGeometry(); ghGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 24 * 3), 3).setUsage(THREE.DynamicDrawUsage));
const ghLines = new THREE.LineSegments(ghGeo, new THREE.LineBasicMaterial({ color: 0x7fa3aa, transparent: true, opacity: .8, depthWrite: false })); ghLines.frustumCulled = false; ghLines.material.visible = false; scene.add(ghLines); // only flags whether there is a trail; drawn as cubes
const GHMAX = 18, GH_COL = new THREE.Color('#262d31'); let ghCells = null; // no longer in use: dimmed, grey and slightly smaller
const BOXE = [[-1,-1,-1,1,-1,-1],[1,-1,-1,1,-1,1],[1,-1,1,-1,-1,1],[-1,-1,1,-1,-1,-1],[-1,1,-1,1,1,-1],[1,1,-1,1,1,1],[1,1,1,-1,1,1],[-1,1,1,-1,1,-1],[-1,-1,-1,-1,1,-1],[1,-1,-1,1,1,-1],[1,-1,1,1,1,1],[-1,-1,1,-1,1,1]];
function syncGhosts(mem) {
  const keep = new Set();
  for (const m of mem) { const k = K(m.path); keep.add(k); if (S.cubes.has(k)) continue; let g = GH.get(k);
    if (!g) { const from = lastPos.get(k); g = { k, path: m.path, name: m.name, t: m.t, slot: lastAng.get(k), pos: from ? from.clone() : new THREE.Vector3(0, FLOOR, 0), tgt: new THREE.Vector3(), s: from ? 1 : 0, off: new THREE.Vector3() }; GH.set(k, g); } g.t = m.t; g.last = m.last; }
  for (const k of [...GH.keys()]) if (!keep.has(k) || S.cubes.has(k)) GH.delete(k);
}
function placeGhosts() { // each silhouette keeps its cube's angle, on the outer ring
  const taken = new Set(); for (const g of [...GH.values()].sort((a, b) => b.t - a.t)) { let sl = g.slot ?? 0; for (let i = 0; i < NSLOT && taken.has(sl); i++) sl = (sl + 1) % NSLOT; taken.add(sl); const a = sl / NSLOT * Math.PI * 2; g.tgt.set(Math.cos(a) * BAND_R[3], -1.6, Math.sin(a) * BAND_R[3]); } }
function pickGhost(x, y) { if (!ghLines.visible) return null; let best = null, bd = 34;
  for (const g of GH.values()) { const [sx, sy, ok] = scr(g.pos); if (!ok) continue; const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = g; } } return best; }
const ghostMenu = g => [['Volver a abrir como cubo', () => post('/api/open', { path: g.path }).catch(e => feed('error', '#d9534f', e.message)), 'doble clic'], ['Explorar esta carpeta', () => { setLeft('explorer'); exGo(g.path); }], '-', ['Copiar ruta', () => copy(g.path)]];
// Personal space and gravity: each cube occupies its real volume (larger when open or exploded). Overlapping cubes are pushed apart horizontally, heavier ones move less; the selected, dragged or hand-placed cube stays put. Gravity eases them back when there is room. Trail silhouettes are spaced too.
function spaceBodies(dt) {
  const B = [], decay = Math.pow(.8, dt), soft = Math.min(1, dt * 6);
  for (const c of S.vorder || []) { if (c.vis === false || c.s < .1 || c.leaving) continue; const ex = 1 + .9 * c.ex;
    B.push({ o: c, r: 1.5 * c.s * ex, h: 1.46 * c.s * ex, y: c.pos.y, m: c === S.sel || c === drag || c.manual ? Infinity : Math.pow(c.s * ex, 3) }); }
  if (ghLines.visible) for (const g of GH.values()) B.push({ o: g, r: 1.5 * g.s, h: 1.5 * g.s, y: g.pos.y, m: .02 });
  if (lpCells.visible) for (const o of LP.values()) if (!o.dead && o.h > .3) B.push({ o: { pos: v3.set(o.base.x, LPB + o.h / 2, o.base.z).clone(), off: o.off }, r: o.h * .75, h: o.h / 2, y: LPB + o.h / 2, m: Infinity }); // processes stay put; cubes move around them
  for (const b of B) if (b.m !== Infinity) b.o.off.multiplyScalar(decay); // gravity: return home unless blocked
  for (let i = 0; i < B.length; i++) { const a = B[i];
    for (let j = i + 1; j < B.length; j++) { const b = B[j]; if (a.m === Infinity && b.m === Infinity) continue;
      if (Math.abs(a.y - b.y) >= a.h + b.h) continue; // stacked vertically (stack towers): no conflict
      const dx = b.o.pos.x - a.o.pos.x, dz = b.o.pos.z - a.o.pos.z, dl = Math.hypot(dx, dz), need = a.r + b.r + .7; if (dl >= need) continue;
      let nx = 1, nz = 0; if (dl > 1e-4) { nx = dx / dl; nz = dz / dl; } else { const q = (i * 7 + j * 13) % 360 * Math.PI / 180; nx = Math.cos(q); nz = Math.sin(q); }
      const push = (need - dl) * soft, wa = a.m === Infinity ? 0 : b.m === Infinity ? 1 : b.m / (a.m + b.m); // gradual, no oscillation
      if (wa) { a.o.off.x -= nx * push * wa; a.o.off.z -= nz * push * wa; }
      if (wa < 1) { b.o.off.x += nx * push * (1 - wa); b.o.off.z += nz * push * (1 - wa); } } }
  for (const b of B) if (b.o.off.lengthSq() > 1600) b.o.off.setLength(40);
}
function stepGhosts(dt) {
  if (!ghCells) ghCells = cellsOf(GHMAX * 27);
  const on = false; ghLines.visible = ghCells.visible = on && GH.size > 0; if (!ghLines.visible) { ghCells.count = 0; return; } // "En vivo" shows current activity only: the trail is not drawn
  { const A = ghCells.instanceMatrix.array, IC = ghCells.instanceColor.array; let n = 0; for (const g of GH.values()) { if (n >= GHMAX) break; const sp = g.s * .95, hv = g === S.ghHover ? 1.5 : 1;
      for (let q = 0; q < 27; q++) { const b = BASE[q], j = n * 27 + q; setM(A, j, g.pos.x + b[0] * sp, g.pos.y + b[1] * sp, g.pos.z + b[2] * sp, sp * .9, sp * .9, sp * .9); IC[j * 3] = GH_COL.r * hv; IC[j * 3 + 1] = GH_COL.g * hv; IC[j * 3 + 2] = GH_COL.b * hv; } n++; }
    ghCells.count = n * 27; ghCells.instanceMatrix.needsUpdate = true; ghCells.instanceColor.needsUpdate = true; }
  const k = 1 - Math.pow(.05, dt), P = ghGeo.attributes.position.array; let m = 0;
  for (const g of GH.values()) { if (m >= 18 * 24) break; g.pos.lerp(offT.copy(g.tgt).add(g.off), k * .6); g.s += (.62 - g.s) * k; const h = 1.5 * g.s;
    for (const e of BOXE) { P.set([g.pos.x + e[0] * h, g.pos.y + e[1] * h, g.pos.z + e[2] * h, g.pos.x + e[3] * h, g.pos.y + e[4] * h, g.pos.z + e[5] * h], m * 3); m += 2; } }
  ghGeo.setDrawRange(0, m); ghGeo.attributes.position.needsUpdate = true;
}
// === Heat: floor halo under each live cube (teal = disk, amber = AI) ===
const heatIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radTex('rgba(255,255,255,.9)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 64);
heatIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); heatIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3); heatIM.frustumCulled = false; heatIM.renderOrder = -1; scene.add(heatIM);
const HEAT_FS = new THREE.Color('#4fb3ad'), HEAT_AI = new THREE.Color('#e8a33d');
const vivoHeat = c => { if (!c.act || c.act.fading) return 0; const age = (Date.now() - lastAct(c)) / 1000; return Math.min(1, (c.act.score || 0) / 12) * .6 + Math.exp(-age / 20) * .4; };
const vivoCool = c => c.act && c.act.fading && c.act.leaveAt ? Math.min(1, Math.max(0, 1 - (c.act.leaveAt - Date.now()) / 8000)) : 0;

// === Six faces (flat, monochrome) ===
const T = (l, v, h) => ({ l, v: v == null || v === '' ? '—' : String(v), h: h || 0 });
function facets(c) {
  const d = c.data, s = S.sys, tot = d ? d.totals : null, g = d && d.git, gp = s && s.gpu, dk = d && d.disk, ag = c.agent || (d && d.agents) || null;
  const L = (c === S.sel && S.procs && S.procs.linked) || { n: 0, ram: 0, cpu: 0, rd: 0, wr: 0 };
  const memU = s ? (s.mem.total - s.mem.free) / s.mem.total : null, cores = s ? s.cpu : [], avg = cores.length ? cores.reduce((x, y) => x + y, 0) / cores.length : null;
  const bins = []; for (let j = 0; j < 8; j++) { const a0 = Math.floor(j * cores.length / 8), b0 = Math.max(a0 + 1, Math.floor((j + 1) * cores.length / 8)), sl = cores.slice(a0, b0);
    const v = sl.length ? sl.reduce((x, y) => x + y, 0) / sl.length : null; bins.push(T(sl.length > 1 ? `N${a0}–${b0 - 1}` : `N${a0}`, pct(v), v)); }
  const aiN = [...c.ai.values()].filter(v => Date.now() - v.t < 600000).length;
  return [
    { name: 'DISCO', color: '#4fb3ad', head: tot ? fmtB(tot.bytes) : '…', tiles: [T('Archivos', tot && fmtN(tot.files) + (d.truncated ? '+' : '')), T('Carpetas', tot && fmtN(tot.dirs)), T('Mayor', d && d.largest && fmtB(d.largest.size)),
      T('Medio', tot && tot.files ? fmtB(tot.bytes / tot.files) : '—'), T('Extensiones', d && d.extCount), T('Libre', dk && fmtB(dk.free), dk ? 1 - dk.free / dk.total : 0), T('Unidad', dk && fmtB(dk.total)), T('Escaneo', d && d.scanMs + ' ms')] },
    { name: 'AGENTES', color: '#e8a33d', head: ag ? ag.sessions + ' ses.' : '…', hh: ag && ag.active ? 1 : 0, tiles: [T('Estado', ag && ag.active ? 'activa' : ago(ag && ag.last), ag && ag.active ? 1 : 0), T('Modelo', ag && ag.model ? ag.model.replace('claude-', '') : '—'),
      T('Contexto', ag && ag.ctx != null ? fmtK(ag.ctx) + ' tok' : '—', ag && ag.ctx ? Math.min(1, ag.ctx / 1e6) : 0), T('Foco IA', aiN + ' arch.', Math.min(1, aiN / 10)), T('Sesiones', ag && fmtB(ag.bytes)),
      T('Memorias', ag && ag.memories), T('Eventos fs', c.evCount, Math.min(1, c.evCount / 50)), T('Último', ago(c.lastEv), c.lastEv && Date.now() - c.lastEv < 4000 ? 1 : 0)] },
    { name: 'RAM', color: '#aeb6bd', head: pct(memU), hh: memU, tiles: [T('Usada', s && fmtB(s.mem.total - s.mem.free), memU), T('Libre', s && fmtB(s.mem.free)), T('Total', s && fmtB(s.mem.total)),
      T('Procesos', L.n), T('RAM vinc.', fmtB(L.ram), s ? Math.min(1, L.ram / s.mem.total * 4) : 0), T('Lectura/s', fmtB(L.rd), Math.min(1, L.rd / 5e6)), T('Escritura/s', fmtB(L.wr), Math.min(1, L.wr / 5e6)), T('Monitor', s && fmtB(s.srvRss))] },
    { name: 'GPU', color: '#aeb6bd', head: gp ? (gp.util ?? '—') + ' %' : 'N/D', hh: gp ? gp.util / 100 : 0, tiles: gp ? [T('Modelo', gp.name.replace(/NVIDIA |GeForce /g, '')), T('VRAM', fmtB(gp.memUsed), gp.memUsed / gp.memTotal), T('Total', fmtB(gp.memTotal)),
      T('VRAM %', pct(gp.memUsed / gp.memTotal), gp.memUsed / gp.memTotal), T('Temp', gp.temp != null ? Math.round(gp.temp) + ' °C' : '—', (gp.temp || 0) / 95), T('Potencia', gp.power != null ? Math.round(gp.power) + ' W' : '—'),
      T('Ventilador', gp.fan != null ? gp.fan + ' %' : '—', (gp.fan || 0) / 100), T('Ctrl. mem', gp.memUtil != null ? gp.memUtil + ' %' : '—', (gp.memUtil || 0) / 100)] : Array.from({ length: 8 }, (_, i) => i ? { l: '', v: '', h: 0 } : T('Telemetría', 'sin nvidia-smi')) },
    { name: 'CPU', color: '#aeb6bd', head: pct(avg), hh: avg, tiles: bins },
    { name: 'VERSIONES', color: '#aeb6bd', head: g ? g.branch : (d ? 'sin git' : '…'), tiles: [T('Commits', g && g.commits), T('Sin commit', g && g.dirty, g ? Math.min(1, g.dirty / 20) : 0), T('Último', g && ago(g.lastTime)),
      T('Mensaje', g && g.lastMsg), T('Creado', d && ago(d.created)), T('Modificado', d && ago(d.modified)), T('Más antiguo', d && ago(d.oldest)), T('Más reciente', d && ago(d.newest))] },
  ];
}
function fit(g, text, max, size, min, weight) { do { g.font = `${weight} ${size}px "Segoe UI",system-ui,sans-serif`; if (g.measureText(text).width <= max) break; size -= 2; } while (size > min);
  while (g.measureText(text).width > max && text.length > 3) text = text.slice(0, -2); return text; }
function drawFace(c, fi, F) { // header (facet and main value) + 4 large metrics: readable even when the cube is small
  const f = faces[fi], g = f.ctx, SZ = 512, P = 22; g.clearRect(0, 0, SZ, SZ); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.strokeStyle = rgba(F.color, .5); g.lineWidth = 3; g.strokeRect(P, P, SZ - 2 * P, 132);
  g.fillStyle = rgba(F.color, .95); g.fillText(fit(g, F.name, 230, 30, 18, 700), P + 18, P + 46);
  g.fillStyle = '#f2f4f5'; g.textAlign = 'right'; g.fillText(fit(g, F.head, 240, 56, 22, 600), SZ - P - 18, P + 112); g.textAlign = 'left';
  if (F.hh > 0) { g.fillStyle = rgba(F.color, .8); g.fillRect(P + 18, P + 118, (SZ - 2 * P - 36) * Math.min(1, F.hh), 4); }
  for (let i = 0; i < 4; i++) { const t = F.tiles[i] || { l: '', v: '', h: 0 }, x = P + (i % 2) * ((SZ - 2 * P) / 2 + 6), y = P + 150 + (i / 2 | 0) * 162, w = (SZ - 2 * P) / 2 - 6;
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.strokeRect(x, y, w, 150);
    g.fillStyle = 'rgba(200,208,214,.75)'; g.fillText(fit(g, t.l.toUpperCase(), w - 28, 24, 15, 600), x + 14, y + 38);
    g.fillStyle = '#eef1f3'; g.fillText(fit(g, t.v, w - 28, 46, 18, 600), x + 14, y + 118);
    if (t.h > 0) { g.fillStyle = rgba(F.color, .8); g.fillRect(x + 14, y + 132, (w - 28) * Math.min(1, t.h), 4); } }
  f.tex.needsUpdate = true;
}
let faceQ = 0, faceAcc = 0, faceCache = null;
function stepFaces(dt) { const c = S.sel; if (!c || !c.data) return; faceAcc += dt; if (faceAcc < .08) return; faceAcc = 0; drawCellFace(c, faceQ); faceQ = (faceQ + 1) % 6; }
function drawCellFace(c, fi) { // each slot = one cell of the cube: files (large), size and relative bar
  const f = faces[fi], g = f.ctx, SZ = 512, W = SZ / 3, d = c.data, mx = Math.max(1, ...d.cells.map(x => x.files)), sig = FACE_MAP[fi].map(i => d.cells[i].files + ':' + d.cells[i].bytes).join() + (c.cell ?? '');
  if (f.sig === sig && f.for === c.key) return; f.sig = sig; f.for = c.key; g.clearRect(0, 0, SZ, SZ); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  FACE_MAP[fi].forEach((ci, k) => { const x = (k % 3) * W, y = (k / 3 | 0) * W, cell = d.cells[ci], col = TYPE_HEX[ci % 3], on = c.cell === ci;
    g.strokeStyle = on ? '#ffffff' : rgba(col, .4); g.lineWidth = on ? 4 : 2; g.strokeRect(x + 12, y + 12, W - 24, W - 24);
    if (!cell.files) { g.fillStyle = 'rgba(200,208,214,.22)'; g.font = '500 30px "Segoe UI",sans-serif'; g.fillText('·', x + W / 2, y + W / 2 + 10); return; }
    g.fillStyle = '#f0f3f5'; g.font = '600 52px "Segoe UI",sans-serif'; g.fillText(fmtK(cell.files), x + W / 2, y + W / 2 + 4);
    g.fillStyle = rgba(col, 1); g.font = '500 24px "Segoe UI",sans-serif'; g.fillText(fmtB(cell.bytes), x + W / 2, y + W / 2 + 38);
    g.fillStyle = rgba(col, .85); g.fillRect(x + 26, y + W - 28, (W - 52) * Math.min(1, cell.files / mx), 4); });
  f.tex.needsUpdate = true; }

