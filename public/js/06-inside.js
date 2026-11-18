// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Inside a cube. A double click on a folder cube, or on a program in «En vivo», enters it: it turns into a glass case
// and everything it holds is a cube of its own inside, grouped in labelled clusters.
// - Folder: subfolders (real cubes, they can be entered too), code, data, documents and media, executables. Files are
//   coloured by kind and sized by weight; when a cluster is very large, the smallest ones gather in a summary cube.
// - Program: its processes (RAM, CPU, PID), its network connections by remote host, the folders it uses and its
//   modules or open files. It refreshes every few seconds.
// What appears is born with an emerald flash, what disappears turns ruby, drops and fades (a deleted file leaves its
// outline for a few minutes), what changes pulses. O sorts, / searches, N shows only today's news. Esc climbs out.
// === Inside ===
const IN = { key: null, mode: null, path: null, files: [], gen: 0, dims: new THREE.Vector3(), cur: new THREE.Vector3(), center: new THREE.Vector3(),
  hover: null, sel: null, pre: null, gone: [], groups: [], sort: 'size', q: '', today: false, open: new Set(), shellCol: new THREE.Color('#AEB9C5'), lp: null, timer: 0 };
const MAXF = 600, IN_U = 1.2, IN_FOLDER = .4, IN_GAP = .8, GROUP_MAX = 110; // grid step, folder cube scale inside, gap between clusters, cubes shown per cluster before summarising
const DIR_GROUPS = ['folder', 'code', 'data', 'docs', 'exe'], PROG_GROUPS = ['proc', 'net', 'link', 'mod', 'pfile'];
const IN_NAMES = { folder: 'Carpetas', code: 'Código', data: 'Datos', docs: 'Documentos y medios', exe: 'Ejecutables', proc: 'Procesos', net: 'Conexiones', link: 'Carpetas que usa', mod: 'Módulos', pfile: 'Archivos abiertos' };
const IN_HEX = { ...Object.fromEntries(Object.entries(GEM_HEX).map(([k, v]) => [k, v[1]])), proc: '#F0EBDD', net: '#5aa2ea', link: '#dfe6ee', mod: '#f0707e', pfile: '#f3d77e' };
const IN_GEM = { proc: 'folder', net: 'code', link: 'folder', mod: 'exe', pfile: 'docs' }; // body colour of program items without their own
const IN_SORTS = { size: 'tamaño', date: 'fecha', name: 'nombre' };
const fileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .72, roughness: .22, envMapIntensity: .8 }); // files: smaller and more polished than folders
fileMat.onBeforeCompile = sh => withEdges(sh, .9);
const fileIM = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, .09), fileMat, MAXF);
fileIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fileIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3); fileIM.instanceColor.setUsage(THREE.DynamicDrawUsage);
fileIM.frustumCulled = false; fileIM.count = 0; scene.add(fileIM);
const FM = fileIM.instanceMatrix.array, FC = fileIM.instanceColor.array;
// the case: faint glass walls and bright edges
const inShell = new THREE.Group(); inShell.visible = false; scene.add(inShell);
const inGlass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .1, roughness: .08, transparent: true, opacity: .06, depthWrite: false, side: THREE.DoubleSide }));
const inEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false }));
inShell.add(inGlass, inEdges);
const inLabels = PROG_GROUPS.concat(DIR_GROUPS).map(() => { const sp = textSprite(640, 64); sp.material.sizeAttenuation = false; sp.material.depthTest = false; sp.renderOrder = 6; sp.center.set(.5, 0); sp.visible = false; scene.add(sp); return sp; });
const TRACE_MS = 5 * 60000, TRACES = new Map(); // folder -> [{ name, size, pos, s, t }]: where deleted files were
const traceGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), tracePool = [];
function traceMesh(i) { if (!tracePool[i]) { const m = new THREE.LineSegments(traceGeo, new THREE.LineBasicMaterial({ color: 0xf0707e, transparent: true, opacity: .8, depthWrite: false })); m.visible = false; scene.add(m); tracePool[i] = m; } return tracePool[i]; }
const isToday = t => t && new Date(t).toDateString() === new Date().toDateString();
const IN_BORN = new THREE.Color('#4fd39a'), IN_DEAD = new THREE.Color('#f0707e'), IN_TOUCH = new THREE.Color('#F0EBDD'), inTmp = new THREE.Color();
const inside = () => !!(S.enter || S.enterLP);

/** Gem of a single file, from its extension (same families as the cubes). */
function fileGem(ext) { const e = String(ext || '').toLowerCase(); return EXE_EXT.has(e) ? 'exe' : CODE.has(e) ? 'code' : DATA.has(e) ? 'data' : 'docs'; }
const edgeOf = (v, lo, hi) => (.3 + .5 * Math.min(1, Math.max(0, Math.log10(1 + (v || 0)) - lo) / (hi - lo))) * IN_U * .82;
const fileSize = size => edgeOf(size, 0, 7);

/** Lists a folder: used before entering (an empty folder is not entered) and to fill the case. */
const inList = p => apiT('/api/ls?path=' + encodeURIComponent(p));
const extOf = p => ((String(p).match(/\.([^.\\/]+)$/) || [])[1] || '').toLowerCase();

function inItem(en, from) { const gem = fileGem(en.ext); return { id: K(en.path), path: en.path, name: en.name, size: en.size, mtime: en.mtime, ext: en.ext, gem, grp: gem, p: from.clone(), t: from.clone(), s: 0, ts: fileSize(en.size), fx: null }; }

// ---------- entering and leaving ----------
async function inLoad(c) {
  const gen = ++IN.gen; inReset(); IN.key = c.key; IN.mode = 'dir'; IN.path = c.path; IN.shellCol.copy(GEM[c.gem || 'folder'][0]);
  let ls = IN.pre && IN.pre.key === c.key ? IN.pre.ls : null; IN.pre = null;
  if (!ls) { try { ls = await inList(c.path); } catch (e) { feed('error', '#C52235', e.message); return; } }
  if (gen !== IN.gen) return;
  IN.files = ls.entries.filter(en => !en.dir).map(en => inItem(en, c.pos));
  layout(); renderCubes(); if (S.enter === c.key) setTimeout(fitAll, 60); // frame the whole case once its contents are known
}

/** Program in «En vivo»: its processes, connections, folders and modules, refreshed every 3 s. */
function inEnterProg(o) {
  if (!o || S.enterLP === o.id) return;
  if (!S.enter && !S.enterLP) S.camBack = { p: camera.position.clone(), t: controls.target.clone() };
  S.enter = null; S.enterLP = o.id; S.geoDirty = true; layout(); feed('entra', '#D97757', o.p.win || o.p.name);
}
async function inLoadProg(o) {
  const gen = ++IN.gen; inReset(); IN.key = 'lp:' + o.id; IN.mode = 'prog'; IN.lp = o; IN.path = null; IN.center.set(o.base.x, LPB, o.base.z);
  IN.shellCol.set(procCat(o.p.name, o.kind)[1]);
  const pull = async () => {
    if (gen !== IN.gen) return; let d; try { d = await apiT('/api/follow?pid=' + ((o.p.pids || [])[0] || o.p.pid)); } catch (e) { feed('error', '#C52235', e.message); return; }
    if (gen !== IN.gen) return; if (d.gone) toast((o.p.win || o.p.name) + ' ya no está en marcha');
    const col = new THREE.Color(procCat(o.p.name, o.kind)[1]), want = [];
    for (const p of d.procs || []) want.push({ id: 'p' + p.pid, grp: 'proc', name: p.name, pid: p.pid, size: p.ws, cpu: p.cpu, io: p.io, cmd: p.cmd, ts: edgeOf(p.ws, 6, 10), col });
    const hosts = new Map(); for (const c of d.net || []) { const h = c.host || c.rip || (c.state === 'escucha' ? 'escucha :' + c.lport : '?'); const x = hosts.get(h) || hosts.set(h, { n: 0, ports: new Set(), pids: new Set() }).get(h); x.n++; x.ports.add(c.rport || c.lport); x.pids.add(c.pid); }
    for (const [h, x] of hosts) want.push({ id: 'n' + h, grp: 'net', name: h, size: x.n, n: x.n, ports: [...x.ports].filter(Boolean).slice(0, 6), pids: [...x.pids], gem: 'code', ts: edgeOf(x.n, 0, 1.6) });
    for (const l of o.p.links || []) want.push({ id: 'l' + K(l), grp: 'link', name: base(l), path: l, gem: 'folder', size: 0, ts: IN_U * .62 });
    for (const m of (d.modules || []).slice(0, 160)) want.push({ id: 'm' + String(m).toLowerCase(), grp: 'mod', name: m, gem: 'exe', size: 0, ts: IN_U * .32 });
    for (const f of (d.files || []).slice(0, 200)) want.push({ id: 'f' + K(f), grp: 'pfile', name: base(f), path: f, gem: fileGem(extOf(f)), size: 0, ts: IN_U * .36 });
    inMerge(want); IN.timer = setTimeout(pull, 3000);
  };
  await pull();
}

/** New items are born, missing ones die, the rest update in place (programs refresh while you watch). */
function inMerge(want) {
  const now = performance.now(), have = new Map(IN.files.map(f => [f.id, f])), seen = new Set(), first = !IN.files.length; let changed = false;
  for (const w of want) { seen.add(w.id); const f = have.get(w.id);
    if (f) { if (f.dead) { f.dead = 0; changed = true; } if (w.cpu != null && Math.abs((f.cpu || 0) - w.cpu) > 15) f.fx = { col: GEM.code[1], t: now, soft: true }; Object.assign(f, { ...w, p: f.p, t: f.t, s: f.s, fx: f.fx }); }
    else { IN.files.push({ ...w, p: IN.center.clone(), t: IN.center.clone(), s: 0, fx: first ? null : { col: IN_BORN, t: now } }); changed = true; } }
  for (const f of IN.files) if (!seen.has(f.id) && !f.dead && !f.summary) { f.dead = now; f.fx = { col: IN_DEAD, t: now }; changed = true;
    if (IN.mode === 'dir') { const L = TRACES.get(K(IN.path)) || []; L.push({ name: f.name, size: f.size, pos: f.t.clone().sub(IN.center), s: f.ts, t: Date.now() }); TRACES.set(K(IN.path), L.slice(-60)); } }
  if (changed) { layout(); if (first) setTimeout(fitAll, 60); }
}

async function inRefreshDir() {
  if (IN.mode !== 'dir' || !IN.path) return; const gen = IN.gen, p = IN.path; let ls; try { ls = await inList(p); } catch { return; }
  if (gen !== IN.gen) return; inMerge(ls.entries.filter(en => !en.dir).map(en => { const it = inItem(en, IN.center); delete it.p; delete it.t; delete it.s; delete it.fx; return it; }));
}
function inReset() { clearTimeout(IN.rt); clearTimeout(IN.timer); for (const f of IN.files) IN.gone.push(f); IN.files = []; IN.hover = IN.sel = null; IN.groups = []; IN.q = ''; IN.today = false; IN.open.clear(); IN.lp = null; inSearchClose(); if (S.mode === 'item') { S.mode = 'cube'; renderPanel(); } }
function inLeave() { IN.gen++; inReset(); IN.key = IN.path = IN.mode = null; }

// ---------- layout: clusters side by side, each one a little cube ----------
const bySort = { size: (a, b) => (b.size || 0) - (a.size || 0) || String(a.name).localeCompare(b.name), date: (a, b) => (b.mtime || 0) - (a.mtime || 0) || String(a.name).localeCompare(b.name), name: (a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }) };
function inLayout(all) {
  const C = S.enter && S.cubes.get(S.enter), prog = IN.mode === 'prog' && S.enterLP;
  if (!C && !prog) return;
  if (C) { C.rel = null; C.tScale = 1; C.home.set(0, 0, 0); IN.center.copy(C.home); }
  const ctr = IN.center, mine = (C && IN.key === C.key) || prog ? IN.files.filter(f => !f.dead && !f.summary) : [], sort = bySort[IN.sort] || bySort.size;
  const kids = C ? all.filter(x => x !== C && x.parent && K(x.parent) === C.key).sort((a, b) => IN.sort === 'name' ? String(a.name).localeCompare(b.name, 'es') : (b.data ? b.data.totals.bytes : 0) - (a.data ? a.data.totals.bytes : 0) || a.seq - b.seq) : [];
  const groups = (prog ? PROG_GROUPS : DIR_GROUPS).map(g => ({ g, items: g === 'folder' ? kids : mine.filter(f => f.grp === g).sort(sort) })).filter(x => x.items.length);
  for (const f of IN.files) f.hidden = false;
  for (const G of groups) { // a huge cluster shows its first ones (biggest, newest…) and gathers the rest in a summary cube; a double click on it opens them all
    let sm = IN.files.find(f => f.summary && f.grp === G.g);
    if (G.g !== 'folder' && G.items.length > GROUP_MAX && !IN.open.has(G.g)) { const rest = G.items.slice(GROUP_MAX - 1); rest.forEach(f => { f.hidden = true; });
      if (!sm) { sm = { id: 'sum' + G.g, summary: true, grp: G.g, gem: G.items[0].gem, p: ctr.clone(), t: ctr.clone(), s: 0, fx: null }; IN.files.push(sm); }
      Object.assign(sm, { name: `+${fmtN(rest.length)} más`, n: rest.length, size: rest.reduce((s, f) => s + (f.size || 0), 0), ts: IN_U * .9, dead: 0 }); G.items = G.items.slice(0, GROUP_MAX - 1).concat(sm); G.total = GROUP_MAX - 1 + rest.length; }
    else { if (sm) sm.hidden = true; G.total = G.items.length; }
    const n = G.items.length; G.side = Math.max(1, Math.ceil(Math.cbrt(n))); G.layers = Math.ceil(n / (G.side * G.side)); G.w = G.side * IN_U; }
  for (const f of IN.files) if (f.summary && !groups.some(G => G.items.includes(f))) f.hidden = true;
  const rowsW = Math.max(...groups.map(G => G.w), Math.sqrt(groups.reduce((s, G) => s + (G.w + IN_GAP) ** 2, 0)) * 1.2); // about as wide as deep
  const rows = []; let row = [], rw = 0; for (const G of groups) { if (row.length && rw + IN_GAP + G.w > rowsW * 1.05) { rows.push(row); row = []; rw = 0; } rw += (row.length ? IN_GAP : 0) + G.w; row.push(G); } if (row.length) rows.push(row);
  const depthOf = r => Math.max(...r.map(G => G.side)) * IN_U, Dtot = rows.reduce((s, r) => s + depthOf(r), 0) + IN_GAP * Math.max(0, rows.length - 1), H = Math.max(1, ...groups.map(G => G.layers)) * IN_U;
  let z = -Dtot / 2;
  for (const r of rows) { const W = r.reduce((s, G) => s + G.w, 0) + IN_GAP * (r.length - 1), D = depthOf(r); let x = -W / 2;
    for (const G of r) { const o = (G.side - 1) / 2;
      G.items.forEach((it, i) => { const col = i % G.side, dep = (i / G.side | 0) % G.side, lay = i / (G.side * G.side) | 0;
        const p = v1.set(x + G.w / 2 + (col - o) * IN_U, -H / 2 + IN_U / 2 + lay * IN_U, z + D / 2 + (dep - o) * IN_U).add(ctr);
        if (G.g === 'folder') { it.rel = null; it.manual = null; it.tScale = IN_FOLDER; it.home.copy(p); } else it.t.copy(p); });
      G.top = new THREE.Vector3(x + G.w / 2, -H / 2 + G.layers * IN_U + .15, z + D / 2).add(ctr); x += G.w + IN_GAP; }
    z += D + IN_GAP; }
  for (const f of IN.files) if (f.hidden) f.t.copy(ctr);
  IN.groups = groups; IN.dims.set(Math.max(1, ...rows.map(r => r.reduce((s, G) => s + G.w, 0) + IN_GAP * (r.length - 1))) + .8, H + .9, Math.max(Dtot, 1) + .8);
}

/** Live changes inside a folder's case: born (emerald, grows), deleted (ruby, drops, leaves its outline), changed (pulses). */
function inFsEvent(c, m) {
  if (IN.mode !== 'dir' || !IN.path || !IN.key) return; const abs = trimSep(c.path) + SEP(c.path) + m.file, dir = abs.replace(/[\\/][^\\/]*$/, '');
  if (K(dir) !== K(IN.path)) return;
  clearTimeout(IN.rt); IN.rt = setTimeout(inRefreshDir, 1500); // bursts of changes can outrun the watcher: list the folder again once they settle
  const f = IN.files.find(x => x.id === K(abs)), now = performance.now();
  if (m.type === 'borrado') { if (f && !f.dead) { f.dead = now; f.fx = { col: IN_DEAD, t: now }; const L = TRACES.get(K(IN.path)) || []; L.push({ name: f.name, size: f.size, pos: f.t.clone().sub(IN.center), s: f.ts, t: Date.now() }); TRACES.set(K(IN.path), L.slice(-60)); } return; }
  if (m.type === 'acceso') { if (f) f.fx = { col: IN_TOUCH, t: now, soft: true }; return; }
  if (f) { f.size = m.size; f.ts = fileSize(m.size); f.mtime = m.t; f.dead = 0; f.fx = { col: m.type === 'creado' ? IN_BORN : GEM[f.gem][1], t: now }; return; }
  const it = inItem({ path: abs, name: base(abs), size: m.size, mtime: m.t, ext: extOf(abs) }, IN.center); it.fx = { col: IN_BORN, t: now }; IN.files.push(it); layout();
}

/** Nearest item under the ray (analytic boxes, like the cubes). */
function inPick() {
  if (!IN.files.length || !fileIM.visible) return null; let best = null, bd = Infinity;
  for (const f of IN.files) { if (f.s < .05 || f.dead || f.hidden) continue; const h = f.s / 2; box.set(bmin.copy(f.p).subScalar(h), bmax.copy(f.p).addScalar(h));
    if (ray.ray.intersectBox(box, hit)) { const d = hit.distanceToSquared(ray.ray.origin); if (d < bd) { bd = d; best = { f, d }; } } }
  return best;
}
const inMatch = f => !IN.q || String(f.name).toLowerCase().includes(IN.q) || (!!f.path && String(f.path).toLowerCase().includes(IN.q));

// ---------- every frame ----------
function inStep(dt, kf) {
  const C = S.enter && S.cubes.get(S.enter), o = S.enterLP && LP.get(S.enterLP), want = C ? C.key : o ? 'lp:' + o.id : null;
  if (S.enterLP && !o) { S.enterLP = null; layout(); }
  if (want !== IN.key) { if (IN.key) inLeave(); if (C) inLoad(C); else if (o) inLoadProg(o); }
  const on = !!(C || o), show = VIEW.cur === 'espacio' && !VW.o; fileIM.visible = show;
  const ctr = C ? C.pos : IN.center;
  // case: grows out of the cube's own body (or the program) and shrinks back into it
  if (on) IN.cur.lerp(IN.dims, kf * .8); else IN.cur.multiplyScalar(1 - kf);
  inShell.visible = show && IN.cur.x > .05;
  if (inShell.visible) { inShell.position.copy(ctr); inShell.scale.copy(IN.cur); inGlass.material.color.copy(IN.shellCol); inEdges.material.color.copy(IN.shellCol).lerp(IN_TOUCH, .35); }
  // cluster labels
  inLabels.forEach(sp => { sp.visible = false; });
  if (on && show && IN.cur.x > IN.dims.x * .8) IN.groups.forEach((G, i) => { if (G.g === 'folder') return; /* folders carry their own names */ const sp = inLabels[i], hits = IN.q ? G.items.filter(f => !f.summary && inMatch(f)).length : 0, key = G.g + G.total + IN.q + hits;
    if (sp.userData.key !== key) { sp.userData.key = key; drawText(sp, [[`◆ ${IN_NAMES[G.g]} · ${fmtN(G.total)}${IN.q ? ' · ' + fmtN(hits) + ' coinciden' : ''}`, 30, IN_HEX[G.g], 34]]); }
    sp.position.copy(G.top); sp.scale.set(pxScale(22) * 10, pxScale(22), 1); sp.visible = true; });
  // items: rise from the centre into their place; the dead drop and fade; when leaving, everything sinks back
  const now = performance.now(), tsec = clock.elapsedTime; let n = 0;
  const put = (f, leaving) => {
    if (leaving || f.hidden) { if (leaving && on) f.t.copy(ctr); f.s += (0 - f.s) * kf; }
    else if (f.dead) { const a = (now - f.dead) / 1000; f.t.y -= dt * (1 + a * 3); if (a > .5) f.s += (0 - f.s) * kf * .7; }
    else f.s += (f.ts - f.s) * kf * .8;
    f.p.lerp(f.t, kf * .9);
    if (n >= MAXF || f.s < .004) return;
    const dim = !leaving && ((IN.today && IN.mode === 'dir' && !isToday(f.mtime)) || (IN.q && !f.summary && !inMatch(f))), hit = !leaving && IN.q && !f.summary && inMatch(f);
    const col = f.col || GEM[f.gem || IN_GEM[f.grp] || 'folder'][0], sel = f === IN.sel, hov = f === IN.hover, busy = f.cpu ? Math.min(1, f.cpu / 25) : 0;
    const b = (sel ? .9 : hov || hit ? .62 : .36 + busy * .4 * (1 + .2 * Math.sin(tsec * (2 + busy * 5)))) * (dim ? .22 : 1), s = f.s * (hov ? 1.08 : 1) * (dim ? .55 : 1);
    let r = col.r * b + (sel ? .35 : .02), g = col.g * b + (sel ? .35 : .02), bl = col.b * b + (sel ? .35 : .025);
    if (f.fx) { const a = (now - f.fx.t) / 1000, life = f.dead ? 3 : 2.2, w = Math.max(0, 1 - a / life) * (f.fx.soft ? .5 : 1.6) * (f.dead ? 1 : (1 + .35 * Math.sin(a * 14)));
      if (w <= 0 && !f.dead) f.fx = null; else { inTmp.copy(f.fx.col); r += inTmp.r * w; g += inTmp.g * w; bl += inTmp.b * w; } }
    setM(FM, n, f.p.x, f.p.y, f.p.z, s, s, s); const k = n * 3; FC[k] = r; FC[k+1] = g; FC[k+2] = bl; n++; };
  for (const f of IN.files) put(f, false);
  const gone = IN.files.filter(f => f.dead && now - f.dead > 3000); if (gone.length) { if (gone.includes(IN.sel)) { IN.sel = null; if (S.mode === 'item') { S.mode = 'cube'; renderPanel(); } } IN.files = IN.files.filter(f => !gone.includes(f)); layout(); }
  IN.gone = IN.gone.filter(f => f.s > .004); for (const f of IN.gone) put(f, true);
  // traces of what was deleted here: a ruby outline that fades over a few minutes
  const tk = IN.mode === 'dir' ? K(IN.path || '') : '', tr = C && show && tk ? (TRACES.get(tk) || []).filter(x => Date.now() - x.t < TRACE_MS) : []; if (C && tk) TRACES.set(tk, tr);
  tr.forEach((x, j) => { const m = traceMesh(j); m.visible = true; m.position.copy(C.home).add(x.pos); m.scale.setScalar(x.s); m.material.opacity = .85 * (1 - (Date.now() - x.t) / TRACE_MS); });
  for (let j = tr.length; j < tracePool.length; j++) tracePool[j].visible = false;
  fileIM.count = n; if (n) { fileIM.instanceMatrix.needsUpdate = true; fileIM.instanceColor.needsUpdate = true; }
}

/** Points that frame the case, for fitAll: all eight corners (two opposite ones can line up with the view). */
function inFrame() { if (!inside()) return null; const h = v1.copy(IN.dims).multiplyScalar(.46).max(v2.set(1.4, 1.4, 1.4)), P = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) P.push(IN.center.clone().add(v2.set(h.x * x, h.y * y, h.z * z))); return P; }

// ---------- what an item says, selects and opens ----------
function inTip(f) {
  const head = `<b>${esc(f.name)}</b><br>`;
  if (f.summary) return head + `<span style="color:var(--dim)">${fmtN(f.n)} más · ${fmtB(f.size)} en total · doble clic para verlos todos</span>`;
  if (f.grp === 'proc') return head + `<span style="color:var(--dim)">PID ${f.pid} · ${fmtB(f.size)} · ${(f.cpu || 0).toFixed(1)} % CPU${f.io ? ' · ' + fmtB(f.io) + '/s' : ''}</span>`;
  if (f.grp === 'net') return head + `<span style="color:var(--dim)">${f.n} conexión${f.n > 1 ? 'es' : ''}${f.ports.length ? ' · puertos ' + f.ports.join(', ') : ''}</span>`;
  if (f.grp === 'mod') return head + '<span style="color:var(--dim)">módulo cargado</span>';
  if (f.grp === 'link') return head + `<span style="color:var(--dim)">${esc(f.path)} · doble clic para entrar</span>`;
  return head + `<span style="color:${GEM_HEX[f.gem][1]}">◆ ${GEM_TXT[f.gem]}</span> <span style="color:var(--dim)">${f.size != null ? '· ' + fmtB(f.size) : ''}${f.mtime ? ' · hace ' + ago(f.mtime) : ''}</span>`;
}

function inSelect(f) { if (f.summary) return inOpen(f); IN.sel = f; S.sel = null; S.mode = 'item'; renderPanel(); renderCubes(); focusOn([f.t.clone().addScalar(1.2), f.t.clone().subScalar(1.2)], .35, 5, false, f.t.clone()); }

async function inOpen(f) {
  if (f.summary) { IN.open.add(f.grp); const n = f.n; layout(); return toast(`${IN_NAMES[f.grp]}: se ven todos (${fmtN(n + GROUP_MAX - 1)})`); }
  if (f.grp === 'link') { try { await post('/api/open', { path: f.path, here: true }); } catch (e) { return feed('error', '#C52235', e.message); } S.enterLP = null; setTimeout(() => { const c = S.cubes.get(K(f.path)); if (c) enterCube(c); }, 600); return; }
  if (!f.path || f.grp === 'proc' || f.grp === 'net' || f.grp === 'mod') return inSelect(f);
  await openObject(f.path, false); const o = OB.list.find(x => K(x.path) === K(f.path)); if (o) enterViewer(o);
}

/** Right-hand panel for the selected item: a file's card with a preview, or a process, connection or module. */
let itemGen = 0;
async function renderItemPanel() {
  const f = IN.sel, el = $('#tab'), gen = ++itemGen; panelFrame('item', f.name, f.path || (f.grp === 'proc' ? 'PID ' + f.pid : IN_NAMES[f.grp]), 'ficha'); builtFor = '';
  const kv = rows => `<div class="kv">${rows.filter(r => r[1] != null && r[1] !== '').map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div>`;
  if (f.grp === 'proc') { el.innerHTML = kv([['Programa', f.name], ['PID', String(f.pid)], ['RAM', fmtB(f.size)], ['CPU', (f.cpu || 0).toFixed(1) + ' %'], ['Disco (E/S)', f.io ? fmtB(f.io) + '/s' : '—']]) + (f.cmd ? `<pre class="code" style="white-space:pre-wrap">${esc(f.cmd)}</pre>` : '') + '<div class="note">Solo lectura: Prisma observa el proceso, no lo controla.</div>'; return; }
  if (f.grp === 'net') { el.innerHTML = kv([['Equipo remoto', f.name], ['Conexiones', String(f.n)], ['Puertos', f.ports.join(', ')], ['Procesos', f.pids.join(', ')]]); return; }
  if (f.grp === 'mod') { el.innerHTML = kv([['Módulo', f.name]]) + '<div class="note">Biblioteca cargada por el programa.</div>'; return; }
  el.innerHTML = `<div class="acts" style="margin:0 0 12px"><button id="it-open" class="on">${IC('eye')}${f.grp === 'link' ? 'Entrar' : 'Abrir en el visor'}</button><button id="it-copy">Copiar ruta</button></div>`
    + kv([['Tipo', f.gem ? GEM_TXT[f.gem] : ''], ['Tamaño', f.size != null && f.grp !== 'link' ? fmtB(f.size) : ''], ['Modificado', f.mtime ? new Date(f.mtime).toLocaleString('es') + ' · hace ' + ago(f.mtime) : '']])
    + (f.grp === 'link' ? '' : '<div class="pvbox" id="it-pv"><div class="note">Cargando la vista previa…</div></div>');
  $('#it-open').onclick = () => inOpen(f); $('#it-copy').onclick = () => copy(f.path);
  if (f.grp === 'link') return;
  let i; try { i = await apiT('/api/file?path=' + encodeURIComponent(f.path)); } catch (e) { if (gen === itemGen && $('#it-pv')) $('#it-pv').innerHTML = `<div class="note">${esc(e.message)}</div>`; return; }
  if (gen !== itemGen || !$('#it-pv')) return; const u = rawURL(f.path); let h = '';
  if (i.kind === 'image' && i.mime) h = `<img class="pv" src="${u}">`;
  else if (i.kind === 'video' && i.mime) h = `<video class="pv" src="${u}" controls muted loop autoplay></video>`;
  else if (i.kind === 'audio' && i.mime) h = `<audio src="${u}" controls style="width:100%"></audio>`;
  else if (i.table) h = `<table class="tb">${i.table.slice(0, 20).map((r, k) => `<tr>${r.slice(0, 8).map(c => k ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>`;
  else if (i.json) h = `<div class="kv">${i.json.slice(0, 24).map(([k, v]) => `<span style="color:var(--ai)">${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>`;
  else if (i.text != null) h = `<pre class="code">${i.text.split('\n').slice(0, 40).map((l, k) => `<i>${String(k + 1).padStart(4)}</i> ${esc(l.slice(0, 160))}`).join('\n')}</pre>`;
  else if (i.hex) h = `<pre class="code">${(i.hex.match(/.{1,24}/g) || []).slice(0, 12).map((r, k) => `<i>${(k * 12).toString(16).padStart(4, '0')}</i> ${r.match(/../g).join(' ')}`).join('\n')}</pre><div class="note">${esc(i.magic || 'formato desconocido')}</div>`;
  $('#it-pv').innerHTML = h || '<div class="note">Sin vista previa para este tipo.</div>';
}

// ---------- sort, search, today ----------
function inCycleSort() { if (!inside()) return toast('Entra en una carpeta o un programa (doble clic) para ordenar lo que tiene dentro'); const k = Object.keys(IN_SORTS); IN.sort = k[(k.indexOf(IN.sort) + 1) % k.length]; layout(); toast('Ordenado por ' + IN_SORTS[IN.sort]); }
function toggleToday() { if (!S.enter) { toast('Entra en una carpeta (doble clic) para ver sus novedades de hoy'); return; } IN.today = !IN.today;
  const n = IN.files.filter(f => !f.summary && isToday(f.mtime)).length, d = (TRACES.get(K(IN.path)) || []).length; toast(IN.today ? `Novedades de hoy: ${n} creados o cambiados${d ? ' · ' + d + ' borrados' : ''}` : 'Se ve todo'); }
function inSearchOpen() {
  if (!inside()) return toast('Entra en una carpeta o un programa (doble clic) para buscar dentro');
  let el = $('#insearch'); if (!el) { el = document.createElement('input'); el.id = 'insearch'; el.placeholder = 'Buscar dentro…  (Intro selecciona · Esc cierra)'; el.spellcheck = false; el.autocomplete = 'off'; document.body.appendChild(el);
    el.addEventListener('input', () => { IN.q = el.value.trim().toLowerCase(); IN.open.clear(); if (IN.q) for (const f of IN.files) if (f.hidden && !f.summary && inMatch(f)) IN.open.add(f.grp); layout(); }); // a match hidden in a summary opens its cluster
    el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { inSearchClose(); layout(); } else if (e.key === 'Enter') { const f = IN.files.find(x => !x.dead && !x.hidden && !x.summary && inMatch(x)); if (f) inSelect(f); } }); }
  el.classList.add('on'); el.focus(); el.select();
}
function inSearchClose() { const el = $('#insearch'); IN.q = ''; if (el) { el.value = ''; el.classList.remove('on'); el.blur(); } }

/** Short notice in the middle of the screen (an empty folder, nothing more to go back to…). */
let toastT = 0;
function toast(text) { let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400); }
S.IN = IN; S.TRACES = TRACES; S.toggleToday = () => toggleToday(); S.inEnterProg = o => inEnterProg(o); // test hooks
