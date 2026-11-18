// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Tree view: like `tree`, but each folder is a lightweight cube (plane or radial layout).
// === Tree View ===
// One InstancedMesh for thousands of folders (no file cells, no per-cube scan); data comes from the index or a quick listing.
// Double-click (or the list triangle) expands/collapses; right-click: expand all below, view as root, open as cube.
const TREE = new THREE.Vector3(0, 0, 1400), TRMAX = 8000, TR_DZ = 5.2;
const TR = { gen: 0, lim: null, root: null, nodes: new Map(), list: [], mode: 'plano', sel: null, hover: null, src: '', busy: false, dirty: false, dirtyCol: false, moving: false, fit: false, capped: false, pool: [], decl: 0 };
const trGeo = (() => { const g = [], b = new THREE.BoxGeometry(.3, .3, .3); for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) g.push(b.clone().translate(x * .34, y * .34, z * .34)); return mergeGeometries(g); })();
const trIM = new THREE.InstancedMesh(trGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .62, roughness: .38, envMapIntensity: .55 }), TRMAX); // same dark finish as the Space cubes
trIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); trIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TRMAX * 3), 3); trIM.count = 0; trIM.frustumCulled = false; trIM.visible = false; scene.add(trIM);
const trLGeo = new THREE.BufferGeometry(); trLGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRMAX * 18), 3));
const trLines = new THREE.LineSegments(trLGeo, new THREE.LineBasicMaterial({ color: 0x12528f, transparent: true, opacity: .5, depthWrite: false })); trLines.frustumCulled = false; trLines.visible = false; scene.add(trLines);
const trRing = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0x1768b5, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); trRing.rotation.x = -Math.PI / 2; trRing.visible = false; scene.add(trRing);
const trSize = n => (n.depth ? 1 : 1.35) * (n.b != null && n.b > 0 ? .5 + 1.1 * Math.min(1, Math.max(0, (Math.log10(n.b + 1) - 3) / 8)) : .45);
const TRC = { new: new THREE.Color(.07, .2, .19), mid: new THREE.Color(.08, .11, .16), old: new THREE.Color(.075, .08, .09), empty: new THREE.Color(.035, .038, .042), skip: new THREE.Color(.19, .13, .05), tmp: new THREE.Color() }; // tinted graphite, no glow
function trColor(n) { const d = (Date.now() - (n.t || 0)) / 864e5, c = TRC.tmp.copy(n.skip ? TRC.skip : !n.f && !n.k ? TRC.empty : d < 1 / 24 ? TRC.new : d < 1 ? TRC.mid : TRC.old); // now (<1 h) · today · older
  if (n === TR.sel) c.multiplyScalar(2.6); else if (n === TR.hover) c.multiplyScalar(1.8); else if (!n.open && n.k) c.multiplyScalar(1.15); return c; }
function trMerge(j, par, p) {
  const key = K(p); let n = TR.nodes.get(key);
  if (!n) { n = { key, path: p, name: j.n, parent: par, depth: par ? par.depth + 1 : 0, kids: null, open: false, pos: (par ? par.pos : TREE).clone(), tgt: new THREE.Vector3(), s: 0, ts: .5, lab: false, sp: null, pre: '', br: '' }; TR.nodes.set(key, n); }
  Object.assign(n, { b: j.b, f: j.f, d: j.d, own: j.own, k: j.k, t: j.t, skip: !!j.skip, part: !!j.part });
  if (j.c) { n.kids = j.c.map(cj => trMerge(cj, n, joinP(p, cj.n))); n.open = true; }
  return n;
}
function trLayout() {
  const L = [], root = TR.root; TR.capped = false; for (const n of TR.nodes.values()) n.vis = false; if (!root) { TR.list = L; return; }
  let cur = 0, maxD = 0;
  const walk = (n, pre, last) => { if (L.length >= TRMAX) { TR.capped = true; return; } L.push(n); n.vis = true; n.ts = trSize(n); n.dz = 0; n.pre = pre; n.br = n.depth ? (last ? '└─ ' : '├─ ') : ''; maxD = Math.max(maxD, n.depth);
    const ks = n.open && n.kids ? n.kids : []; ks.forEach((ch, i) => walk(ch, n.depth ? pre + (last ? '   ' : '│  ') : '', i === ks.length - 1)); };
  walk(root, '', true);
  const slot = c => Math.max(1.7, c.ts * 1.45 + .5), kidsV = n => n.open && n.kids ? n.kids.filter(c => c.vis) : [];
  if (TR.mode === 'radial') { // root at the center, one ring per level; angle follows leaf order
    const lx = n => { const ks = kidsV(n); if (!ks.length) { const w = slot(n); n.lx = cur + w / 2; cur += w; return; } ks.forEach(lx); n.lx = (ks[0].lx + ks[ks.length - 1].lx) / 2; };
    lx(root); const W = Math.max(cur, 1), cnt = []; for (const n of L) cnt[n.depth] = (cnt[n.depth] || 0) + slot(n); let step = TR_DZ; for (let d = 1; d <= maxD; d++) step = Math.max(step, (cnt[d] || 0) * 1.05 / 3 / (2 * Math.PI) / d); const RD = [...Array(maxD + 1).keys()].map(d => d * step); // evenly spaced, tight rings; leaves use three lanes
    let lane = 0; for (const n of L) { const leaf = !kidsV(n).length, a = n.lx / W * Math.PI * 2, R = RD[n.depth] + (leaf && n.depth ? (lane++ % 3) * 2.1 : 0); n.tgt.set(TREE.x + Math.cos(a) * R, FLOOR + n.ts / 2, TREE.z + Math.sin(a) * R); }
  } else { // plane: each folder is a block with its children behind it; wide child sets wrap into rows
    // (shelf packing) so hundreds of folders form a surface rather than an endless strip
    const GAP = .6, blk = n => { const ks = kidsV(n);
      if (!ks.length) { n.bw = slot(n); n.bd = 2; n.ox = n.bw / 2; return; }
      ks.forEach(blk); const sumW = ks.reduce((s, c) => s + c.bw + GAP, 0), area = ks.reduce((s, c) => s + (c.bw + GAP) * (c.bd + GAP), 0), maxW = Math.max(...ks.map(c => c.bw));
      const tw = sumW <= 40 ? sumW : Math.max(maxW, Math.sqrt(area * 1.7)); let x = 0, z = TR_DZ, rh = 0, w = 0;
      for (const c of ks) { if (x > 0 && x + c.bw > tw) { z += rh + GAP * 2; x = 0; rh = 0; } c.bx = x; c.bz = z; x += c.bw + GAP; w = Math.max(w, x - GAP); rh = Math.max(rh, c.bd); }
      n.bw = Math.max(w, slot(n)); n.bd = z + rh; n.ox = n.bw / 2; };
    blk(root); const abs = (n, X, Z) => { n.tgt.set(X + n.ox, FLOOR + n.ts / 2, Z); for (const c of kidsV(n)) abs(c, X + c.bx, Z + c.bz); };
    abs(root, TREE.x - root.bw / 2, TREE.z); }
  TR.list = L; TR.moving = true; TR.dirtyCol = true;
  if (TR.capped) feed('árbol', '#D97757', `se muestran ${fmtN(TRMAX)} carpetas como máximo: contrae ramas para ver otras`);
}
async function trFetch(p, depth, max) {
  TR.busy = true; renderTrBar();
  try { const r = await api(`/api/tree?path=${encodeURIComponent(p)}&depth=${depth}&max=${Math.max(50, max | 0)}`); TR.src = r.src; if (r.truncated) feed('árbol', '#D97757', `tope de ${fmtN(r.count)} carpetas en esta lectura · despliega por ramas`); return r; }
  finally { TR.busy = false; renderTrBar(); }
}
async function trOpen(p) {
  if (!p) return; TR.want = p; const gen = ++TR.gen; if (VIEW.cur !== 'arbol') setView('arbol');
  try { const r = await trFetch(p, 3, 3000); if (gen !== TR.gen) return; for (const sp of TR.pool) { sp.userData.node = null; sp.visible = false; } TR.nodes.clear(); /* free the labels for the new root */ TR.sel = null; TR.hover = null; if (S.mode === 'tnode') S.mode = 'cube';
    TR.root = trMerge(r.node, null, r.root); TR.root.open = true; TR.dirty = true; TR.fit = true; feed('árbol', '#1768B5', `${TR.root.name} · ${fmtN(r.count)} carpetas · ${r.src === 'indice' ? 'del índice' : 'leídas del disco'}`); renderPanel(); }
  catch (er) { feed('error', '#C52235', er.message); }
}
function trWalk(n, f, lvl = 0) { f(n, lvl); if (n.kids) for (const ch of n.kids) trWalk(ch, f, lvl + 1); }
async function trToggle(n) {
  if (n.open) { n.open = false; TR.dirty = true; return; }
  if (n.kids) { n.open = true; TR.dirty = true; return; }
  if (!n.k) return feed('árbol', '#8b95a3', n.name + ' no tiene subcarpetas');
  const gen = TR.gen; try { const r = await trFetch(n.path, 1, TRMAX); if (gen !== TR.gen) return; trMerge(r.node, n.parent, n.path); n.open = true; TR.dirty = true; } catch (er) { feed('error', '#C52235', er.message); }
}
async function trExpand(n, levels) { // expand everything below, up to `levels` deep (subject to the folder cap)
  const gen = TR.gen; try { const r = await trFetch(n.path, levels, TRMAX - TR.list.length + (n.kids ? n.kids.length : 0)); if (gen !== TR.gen) return; trMerge(r.node, n.parent, n.path);
    trWalk(n, (x, l) => { if (l < levels && x.kids) x.open = true; }); TR.dirty = true; } catch (er) { feed('error', '#C52235', er.message); }
}
function trCollapse(n) { trWalk(n, x => { x.open = false; }); TR.dirty = true; }
async function trLevels(N) { // like `tree -L N`: open N levels from the root, collapse the rest
  const R = TR.root; if (!R) return;
  const gen = TR.gen; try { const r = await trFetch(R.path, N, TRMAX); if (gen !== TR.gen) return; trMerge(r.node, null, R.path); trWalk(R, (x, l) => { x.open = l < N && !!x.kids; }); R.open = !!R.kids; TR.dirty = true; TR.fit = true; } catch (er) { feed('error', '#C52235', er.message); }
}
function trSelect(n) { TR.sel = n; S.mode = 'tnode'; TR.dirtyCol = true; renderPanel(); renderCubes(); setTimeout(() => { const p2 = [n.tgt.clone().addScalar(n.ts + 1), n.tgt.clone().subScalar(n.ts + 1)]; if (n.open && n.kids) n.kids.slice(0, 200).forEach(k => k.vis && p2.push(k.tgt.clone())); if (n.parent) { p2.push(n.parent.tgt.clone()); (n.parent.kids || []).slice(0, 40).forEach(k => k.vis && p2.push(k.tgt.clone())); } /* frame it with its parent and siblings for context */ focusOn(p2, .5, 8, false, n.tgt.clone()); }, 90); }
function trPick() { let best = null, bd = Infinity;
  for (const n of TR.list) { const h = n.s * .52 + .04; box.set(bmin.copy(n.pos).subScalar(h), bmax.copy(n.pos).addScalar(h)); if (!ray.ray.intersectBox(box, hit)) continue; const d = hit.distanceToSquared(ray.ray.origin); if (d < bd) { bd = d; best = n; } }
  return best; }
const trInfo = n => `${n.b != null ? fmtB(n.b) + (n.part ? '+' : '') : '—'} · ${fmtN(n.f || 0)} arch.${n.k ? ' · ' + fmtN(n.k) + ' carp.' : ''}`;
const trTip = n => `<b>${esc(n.name)}</b><br><span style="color:var(--dim)">${esc(trInfo(n))}${n.k ? (n.open ? ' · clic contrae' : ' · clic despliega') : ''}${n.skip ? ' · pesada, no se abre sola' : ''}</span>`;
function trMenu(n) { const up = n.path.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '');
  return [[n.open ? 'Contraer' : 'Desplegar', () => trToggle(n), 'doble clic'], ['Desplegar todo debajo · 3 niveles', () => trExpand(n, 3)], ['Desplegar todo debajo · 6 niveles', () => trExpand(n, 6)], ['Contraer todo debajo', () => trCollapse(n)], '-',
    ['Ver esta carpeta como raíz', () => trOpen(n.path)], ...(n === TR.root && up && up !== n.path ? [['Subir a la carpeta superior', () => trOpen(/^[a-z]:$/i.test(up) ? up + '\\' : up)]] : []),
    ['Abrir como cubo en el Espacio', () => { setView('espacio'); post('/api/open', { path: n.path }).catch(e => feed('error', '#C52235', e.message)); }], ['Explorar esta carpeta', () => { setLeft('explorer'); exGo(n.path); }], ['Indexar (tamaños completos)', () => startIx(n.path)], '-', ['Copiar ruta', () => copy(n.path)]]; }
function renderTreePanel() {
  const n = TR.sel; if (!n) return; builtFor = ''; panelFrame('tnode', n.name, n.path, 'info');
  const kids = (n.kids || []).slice().sort((a, b) => (b.b || 0) - (a.b || 0)).slice(0, 14), mx = Math.max(1, ...kids.map(x => x.b || 0));
  $('#tab').innerHTML = kvH([['Tamaño', n.b != null ? fmtB(n.b) + (n.part ? ' (parcial: indexa para el total)' : '') : '—'], ['Archivos en total', fmtN(n.f || 0)], ['Carpetas en total', fmtN(n.d || 0)], ['Archivos aquí', fmtN(n.own || 0)], ['Subcarpetas', fmtN(n.k || 0)], ['Último cambio aquí', n.t ? 'hace ' + ago(n.t) : '—'], ['Nivel', n.depth], ['Datos', TR.src === 'indice' ? 'índice (completos)' : 'lectura del disco']])
    + `<div class="acts">${n.k ? `<button data-ta="t">${n.open ? 'Contraer' : 'Desplegar'}</button><button data-ta="x3">Todo debajo · 3</button><button data-ta="c">Contraer todo</button>` : ''}<button data-ta="root">Ver como raíz</button><button data-ta="cube">Abrir como cubo</button><button data-ta="copy">Copiar ruta</button></div>`
    + (kids.length ? `<h2 class="sub">Subcarpetas por tamaño</h2>${kids.map(x => `<div class="extrow" data-tk="${esc(x.key)}" style="cursor:pointer"><span>${esc(x.name)}</span><div class="bar"><i style="width:${(x.b || 0) / mx * 100}%"></i></div><span>${x.b != null ? fmtB(x.b) : '—'}</span></div>`).join('')}` : '');
  const A = { t: () => trToggle(n), x3: () => trExpand(n, 3), c: () => trCollapse(n), root: () => trOpen(n.path), cube: () => { setView('espacio'); post('/api/open', { path: n.path }).catch(e => feed('error', '#C52235', e.message)); }, copy: () => copy(n.path) };
  $('#tab').querySelectorAll('[data-ta]').forEach(b => b.onclick = () => A[b.dataset.ta]());
  $('#tab').querySelectorAll('[data-tk]').forEach(r => r.onclick = () => { const x = TR.nodes.get(r.dataset.tk); if (x) trSelect(x); });
}
function renderTreeList(el) {
  const L = TR.list; $('#ncubes').textContent = L.length ? '· ' + fmtN(L.length) : '';
  if (!L.length) { el.innerHTML = `<div class="note" style="padding:8px 4px;line-height:1.6">${TR.busy ? 'Leyendo…' : 'Elige una carpeta: escribe su ruta arriba, o clic derecho en un cubo o en el explorador → «Ver en árbol».'}</div>`; return; }
  const si = TR.sel ? L.indexOf(TR.sel) : 0, from = Math.max(0, Math.min(si - 200, L.length - 600));
  el.innerHTML = L.slice(from, from + 600).map(n => `<div class="ci tri ${n === TR.sel ? 'on' : ''}" data-tk="${esc(n.key)}"><span><i class="tpre">${n.pre}${n.br}</i><u data-tt>${n.k ? (n.open && n.kids ? '▾' : '▸') : '·'}</u> ${esc(n.name)}</span><span>${n.b != null ? fmtB(n.b) : ''}</span></div>`).join('');
  const on = el.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function renderTrBar() {
  const b = $('#trbar'); if (!b) return; const R = TR.root;
  $('#trname').textContent = R ? R.path : 'Árbol'; $('#trinfo').textContent = TR.busy ? 'leyendo…' : R ? `${fmtN(TR.list.length)}${TR.list.length >= TRMAX ? ' (tope)' : ''} carpetas a la vista · ${TR.src === 'indice' ? 'índice' : 'disco'}` : 'sin carpeta';
  b.querySelectorAll('[data-tm]').forEach(x => x.classList.toggle('on', x.dataset.tm === TR.mode));
}
$('#trbar').onclick = e => { const x = e.target.closest('button'); if (!x || !TR.root) return;
  if (x.dataset.lv) return trLevels(+x.dataset.lv); if (x.dataset.tm) { TR.mode = x.dataset.tm; TR.dirty = true; TR.fit = true; return renderTrBar(); }
  if (x.dataset.tb === 'all') return trLevels(12); if (x.dataset.tb === 'none') { trWalk(TR.root, n => { n.open = false; }); TR.root.open = !!TR.root.kids; TR.dirty = true; TR.fit = true; return; }
  if (x.dataset.tb === 'up') { const up = TR.root.path.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, ''); if (up && up !== TR.root.path) trOpen(/^[a-z]:$/i.test(up) ? up + '\\' : up); }
  if (x.dataset.tb === 'fit') fitAll(); };
function stepTree(dt) {
  const on = VIEW.cur === 'arbol' && !VW.o; trIM.visible = trLines.visible = on; if (!on) { trRing.visible = false; for (const s of TR.pool) s.visible = false; return; }
  if (TR.dirty) { TR.dirty = false; trLayout(); renderCubes(); renderTrBar(); if (TR.sel && !TR.sel.vis) TR.sel = null; if (VIEW.cur === 'arbol') renderPanel(); if (TR.fit) { TR.fit = false; fitAll(); } }
  const L = TR.list, k = 1 - Math.pow(.004, dt), A = trIM.instanceMatrix.array;
  if (TR.moving) { let mv = false; L.forEach((n, i) => { n.pos.lerp(n.tgt, k); n.s += (n.ts - n.s) * k; if (n.pos.distanceToSquared(n.tgt) > 1e-5 || Math.abs(n.ts - n.s) > 1e-3) mv = true; setM(A, i, n.pos.x, n.pos.y, n.pos.z, n.s, n.s, n.s); });
    trIM.count = L.length; trIM.instanceMatrix.needsUpdate = true; TR.moving = mv;
    const P = trLGeo.attributes.position.array; let m = 0, y = FLOOR + .02;
    for (const n of L) { const p = n.parent; if (!p) continue;
      if (TR.mode === 'radial') { P.set([p.pos.x, y, p.pos.z, n.pos.x, y, n.pos.z], m); m += 6; }
      else { const mz = n.pos.z - 1.3; P.set([p.pos.x, y, p.pos.z, p.pos.x, y, mz, p.pos.x, y, mz, n.pos.x, y, mz, n.pos.x, y, mz, n.pos.x, y, n.pos.z], m); m += 18; } }
    trLGeo.setDrawRange(0, m / 3); trLGeo.attributes.position.needsUpdate = true; trLines.material.opacity = L.length > 2000 ? .2 : L.length > 500 ? .32 : .5; }
  if (TR.dirtyCol) { TR.dirtyCol = false; const C = trIM.instanceColor.array; L.forEach((n, i) => { const c = trColor(n); C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; }); trIM.instanceColor.needsUpdate = true; }
  const s = TR.sel; trRing.visible = !!s && !!s.vis; if (trRing.visible) { trRing.position.set(s.pos.x, FLOOR + .015, s.pos.z); trRing.scale.setScalar(s.s * .78 + .2); }
  // labels: only those that fit without overlap, by priority (selected, hovered, nearest, largest)
  TR.decl += dt; if (TR.decl > .15) { TR.decl = 0; const ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    const cand = L.map(n => ({ n, rp: n.s * ph / Math.max(.1, camera.position.distanceTo(n.pos)) })).filter(x => x.n === TR.sel || x.n === TR.hover || x.rp > 9 || x.n.depth <= 1).sort((a, b) => b.rp - a.rp).slice(0, 260);
    for (const n of L) n.lab = false;
    declutterLabels(cand.map(({ n, rp }) => { const sel = n === TR.sel || n === TR.hover, lh = sel ? 40 : n.depth ? 30 : 36; n.lp = n.lp || new THREE.Vector3(); n.lp.set(n.pos.x, n.pos.y + n.s * .55 + .05, n.pos.z);
      return { pos: n.lp, w: lh * 768 / 112 * .55, h: lh, pr: sel ? 1e16 : (n.depth ? 0 : 1e12) + (n.depth === 1 ? 1e9 : n.depth === 2 ? 1e6 : 0) + rp, set: v => n.lab = v }; }), 44);
    const free = TR.pool.filter(sp => !sp.userData.node || !sp.userData.node.lab || !sp.userData.node.vis); free.forEach(sp => { if (sp.userData.node) sp.userData.node.sp = null; sp.userData.node = null; sp.visible = false; });
    for (const n of L) { if (!n.lab || n.sp) continue; let sp = free.pop(); if (!sp) { if (TR.pool.length >= 60) continue; sp = textSprite(768, 112); sp.material.sizeAttenuation = false; sp.center.set(.5, 0); scene.add(sp); TR.pool.push(sp); } sp.userData.node = n; sp.userData.key = ''; n.sp = sp; } }
  for (const sp of TR.pool) { const n = sp.userData.node; if (!n) { sp.visible = false; continue; } const key = (n.k ? (n.open && n.kids ? '▾ ' : '▸ ') : '') + n.name + '|' + trInfo(n);
    if (sp.userData.key !== key) { sp.userData.key = key; drawText(sp, [[key.split('|')[0], 40, n.skip ? '#E6B844' : '#F0EBDD', 40], [trInfo(n), 30, 'rgba(190,200,206,.8)', 86]]); }
    const sel = n === TR.sel || n === TR.hover, lh = sel ? 40 : n.depth ? 30 : 36; sp.visible = true; sp.position.set(n.pos.x, n.pos.y + n.s * .55 + .05, n.pos.z); sp.scale.set(pxScale(lh) * 768 / 112, pxScale(lh), 1); }
}

try { const m = JSON.parse(localStorage.getItem('prisma.view') || 'null'); if (m && m.v && m.v !== 'espacio') setTimeout(() => { if (m.mode) TR.mode = m.mode; if (m.v === 'arbol' && m.root) trOpen(m.root); else setView(m.v); }, 600); } catch {}
