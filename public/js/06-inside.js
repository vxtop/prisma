// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Inside a cube: a double click on a folder cube enters it. The cube turns into a glass case of its own gem and
// everything it holds is a cube of its own inside, grouped in clusters: subfolders (real cubes, they can be entered
// too), code, data, documents and media, executables. Files are coloured by kind and sized by weight. What is created
// is born with an emerald flash, what is deleted turns ruby, drops and fades, what changes pulses. Esc climbs back
// out and the contents sink into the cube again.
// === Inside ===
const IN = { key: null, path: null, files: [], gen: 0, dims: new THREE.Vector3(), cur: new THREE.Vector3(), hover: null, sel: null, pre: null, gone: [], groups: [] };
const MAXF = 600, IN_U = 1.2, IN_FOLDER = .4, IN_GAP = .8; // grid step, folder cube scale inside (body 2.92 × scale), gap between clusters
const IN_ORDER = ['folder', 'code', 'data', 'docs', 'exe'], IN_NAMES = { folder: 'Carpetas', code: 'Código', data: 'Datos', docs: 'Documentos y medios', exe: 'Ejecutables' };
const fileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .72, roughness: .22, envMapIntensity: .8 }); // files: smaller and more polished than folders
fileMat.onBeforeCompile = sh => withEdges(sh, .9);
const fileIM = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, .09), fileMat, MAXF);
fileIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fileIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3); fileIM.instanceColor.setUsage(THREE.DynamicDrawUsage);
fileIM.frustumCulled = false; fileIM.count = 0; scene.add(fileIM);
const FM = fileIM.instanceMatrix.array, FC = fileIM.instanceColor.array;
// the case: faint glass walls and bright edges in the cube's gem
const inShell = new THREE.Group(); inShell.visible = false; scene.add(inShell);
const inGlass = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .1, roughness: .08, transparent: true, opacity: .06, depthWrite: false, side: THREE.DoubleSide }));
const inEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false }));
inShell.add(inGlass, inEdges);
// one label per cluster, over its block
const inLabels = IN_ORDER.map(() => { const sp = textSprite(512, 64); sp.material.sizeAttenuation = false; sp.material.depthTest = false; sp.renderOrder = 6; sp.center.set(.5, 0); sp.visible = false; scene.add(sp); return sp; });
const TRACE_MS = 5 * 60000, TRACES = new Map(); // folder -> [{ name, size, pos, s, t }]
const traceGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), tracePool = [];
function traceMesh(i) { if (!tracePool[i]) { const m = new THREE.LineSegments(traceGeo, new THREE.LineBasicMaterial({ color: 0xf0707e, transparent: true, opacity: .8, depthWrite: false })); m.visible = false; scene.add(m); tracePool[i] = m; } return tracePool[i]; }
const isToday = t => t && new Date(t).toDateString() === new Date().toDateString();
const IN_BORN = new THREE.Color('#4fd39a'), IN_DEAD = new THREE.Color('#f0707e'), IN_TOUCH = new THREE.Color('#F0EBDD'), inTmp = new THREE.Color();

/** Gem of a single file, from its extension (same families as the cubes). */
function fileGem(ext) { const e = String(ext || '').toLowerCase(); return EXE_EXT.has(e) ? 'exe' : CODE.has(e) ? 'code' : DATA.has(e) ? 'data' : 'docs'; }
const fileSize = size => (.3 + .5 * Math.min(1, Math.log10(1 + (size || 0)) / 7)) * IN_U * .82;

/** Lists a folder: used before entering (an empty folder is not entered) and to fill the case. */
const inList = p => apiT('/api/ls?path=' + encodeURIComponent(p));

function inItem(en, from) { return { path: en.path, name: en.name, size: en.size, mtime: en.mtime, ext: en.ext, gem: fileGem(en.ext), p: from.clone(), t: from.clone(), s: 0, ts: fileSize(en.size), fx: null }; }

async function inLoad(c) {
  const gen = ++IN.gen; IN.key = c.key; IN.path = c.path; IN.hover = IN.sel = null;
  for (const f of IN.files) IN.gone.push(f); IN.files = []; // what was on screen sinks away
  let ls = IN.pre && IN.pre.key === c.key ? IN.pre.ls : null; IN.pre = null;
  if (!ls) { try { ls = await inList(c.path); } catch (e) { feed('error', '#C52235', e.message); return; } }
  if (gen !== IN.gen) return;
  const all = ls.entries.filter(en => !en.dir);
  IN.files = all.sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, MAXF).map(en => inItem(en, c.pos)); // the most recent ones when there are too many
  IN.more = all.length - IN.files.length;
  layout(); renderCubes(); if (S.enter === c.key) setTimeout(fitAll, 60); // frame the whole case once its contents are known
}

function inLeave() { IN.today = false; IN.gen++; for (const f of IN.files) IN.gone.push(f); IN.files = []; IN.key = IN.path = null; IN.hover = IN.sel = null; IN.groups = []; }

/** Clusters inside the case, side by side: subfolders, then each family of files; inside a cluster the biggest go first, at the bottom. Called from layoutCore. */
function inLayout(all) {
  const C = S.cubes.get(S.enter); if (!C) return;
  C.rel = null; C.tScale = 1; C.home.set(0, 0, 0);
  const kids = all.filter(x => x !== C && x.parent && K(x.parent) === C.key).sort((a, b) => (b.data ? b.data.totals.bytes : 0) - (a.data ? a.data.totals.bytes : 0) || a.seq - b.seq);
  const files = IN.key === C.key ? IN.files.filter(f => !f.dead) : [];
  const groups = IN_ORDER.map(g => ({ g, items: g === 'folder' ? kids : files.filter(f => f.gem === g).sort((a, b) => (b.size || 0) - (a.size || 0) || a.name.localeCompare(b.name)) })).filter(x => x.items.length);
  for (const G of groups) { const n = G.items.length; G.side = Math.max(1, Math.ceil(Math.cbrt(n))); G.layers = Math.ceil(n / (G.side * G.side)); G.w = G.side * IN_U; } // each cluster is itself a little cube
  // clusters wrap into rows so the whole case stays close to a cube
  const rowsW = Math.max(...groups.map(G => G.w), Math.sqrt(groups.reduce((s, G) => s + (G.w + IN_GAP) ** 2, 0)) * 1.2); // about as wide as deep
  const rows = []; let row = [], rw = 0; for (const G of groups) { if (row.length && rw + IN_GAP + G.w > rowsW * 1.05) { rows.push(row); row = []; rw = 0; } rw += (row.length ? IN_GAP : 0) + G.w; row.push(G); } if (row.length) rows.push(row);
  const depthOf = r => Math.max(...r.map(G => G.side)) * IN_U, Dtot = rows.reduce((s, r) => s + depthOf(r), 0) + IN_GAP * Math.max(0, rows.length - 1), H = Math.max(1, ...groups.map(G => G.layers)) * IN_U;
  let z = -Dtot / 2;
  for (const r of rows) { const W = r.reduce((s, G) => s + G.w, 0) + IN_GAP * (r.length - 1), D = depthOf(r); let x = -W / 2;
    for (const G of r) { const o = (G.side - 1) / 2;
      G.items.forEach((it, i) => { const col = i % G.side, dep = (i / G.side | 0) % G.side, lay = i / (G.side * G.side) | 0;
        const p = v1.set(x + G.w / 2 + (col - o) * IN_U, -H / 2 + IN_U / 2 + lay * IN_U, z + D / 2 + (dep - o) * IN_U).add(C.home);
        if (G.g === 'folder') { it.rel = null; it.manual = null; it.tScale = IN_FOLDER; it.home.copy(p); } else it.t.copy(p); });
      G.top = new THREE.Vector3(x + G.w / 2, -H / 2 + G.layers * IN_U + .15, z + D / 2).add(C.home); x += G.w + IN_GAP; }
    z += D + IN_GAP; }
  IN.groups = groups; IN.dims.set(Math.max(...rows.map(r => r.reduce((s, G) => s + G.w, 0) + IN_GAP * (r.length - 1)), 1) + .8, H + .9, Math.max(Dtot, 1) + .8);
}

/** Live changes inside the case: born (emerald, grows), deleted (ruby, drops and fades), changed (pulses). */
function inFsEvent(c, m) {
  if (!IN.path || !IN.key) return; const abs = trimSep(c.path) + SEP(c.path) + m.file, dir = abs.replace(/[\\/][^\\/]*$/, '');
  if (K(dir) !== K(IN.path)) return;
  const f = IN.files.find(x => K(x.path) === K(abs)), now = performance.now();
  if (m.type === 'borrado') { if (f && !f.dead) { f.dead = now; f.fx = { col: IN_DEAD, t: now }; const L = TRACES.get(K(IN.path)) || []; L.push({ name: f.name, size: f.size, pos: f.t.clone().sub(S.cubes.get(IN.key).home), s: f.ts, t: Date.now() }); TRACES.set(K(IN.path), L.slice(-60)); } return; }
  if (m.type === 'acceso') { if (f) f.fx = { col: IN_TOUCH, t: now, soft: true }; return; }
  if (f) { f.size = m.size; f.ts = fileSize(m.size); f.mtime = m.t; f.dead = 0; f.fx = { col: m.type === 'creado' ? IN_BORN : GEM[f.gem][1], t: now }; return; }
  if (IN.files.length >= MAXF) return;
  const C = S.cubes.get(IN.key), it = inItem({ path: abs, name: base(abs), size: m.size, mtime: m.t, ext: (abs.match(/\.([^.\\/]+)$/) || [])[1] || '' }, C ? C.pos : v1.set(0, 0, 0));
  it.fx = { col: IN_BORN, t: now }; IN.files.push(it); layout();
}

/** Nearest file under the ray (analytic boxes, like the cubes). */
function inPick() {
  if (!IN.files.length || !fileIM.visible) return null; let best = null, bd = Infinity;
  for (const f of IN.files) { if (f.s < .05 || f.dead) continue; const h = f.s / 2; box.set(bmin.copy(f.p).subScalar(h), bmax.copy(f.p).addScalar(h));
    if (ray.ray.intersectBox(box, hit)) { const d = hit.distanceToSquared(ray.ray.origin); if (d < bd) { bd = d; best = { f, d }; } } }
  return best;
}

function inStep(dt, kf) {
  const C = S.enter && S.cubes.get(S.enter);
  if (S.enter !== IN.key) { if (IN.key) inLeave(); if (C) inLoad(C); } // entering or leaving by any route: breadcrumbs, history, Esc, new space
  const show = VIEW.cur === 'espacio' && !VW.o; fileIM.visible = show;
  // case: grows out of the cube's own body and shrinks back into it
  if (C) IN.cur.lerp(IN.dims, kf * .8); else IN.cur.multiplyScalar(1 - kf);
  inShell.visible = show && IN.cur.x > .05;
  if (inShell.visible && C) { inShell.position.copy(C.pos); inShell.scale.copy(IN.cur); const g = GEM[C.gem || 'folder']; inGlass.material.color.copy(g[0]); inEdges.material.color.copy(g[1]); }
  // cluster labels
  inLabels.forEach(sp => { sp.visible = false; });
  if (C && show && IN.cur.x > IN.dims.x * .8) IN.groups.forEach((G, i) => { if (G.g === 'folder') return; /* folders carry their own names */ const sp = inLabels[i], key = G.g + G.items.length; if (sp.userData.key !== key) { sp.userData.key = key; drawText(sp, [[`◆ ${IN_NAMES[G.g]} · ${fmtN(G.items.length)}${G.g !== 'folder' && IN.more && G === IN.groups[IN.groups.length - 1] ? ' (+' + fmtN(IN.more) + ' más)' : ''}`, 30, GEM_HEX[G.g][1], 34]]); }
    sp.position.copy(G.top); sp.scale.set(pxScale(22) * 8, pxScale(22), 1); sp.visible = true; });
  // files: rise from the centre into their place; deleted ones drop and fade; when leaving, everything sinks back
  const home = C ? C.pos : null, now = performance.now(); let n = 0;
  const put = (f, leaving) => {
    if (leaving) { if (home) f.t.copy(home); f.s += (0 - f.s) * kf; }
    else if (f.dead) { const a = (now - f.dead) / 1000; f.t.y -= dt * (1 + a * 3); if (a > .5) f.s += (0 - f.s) * kf * .7; }
    else f.s += (f.ts - f.s) * kf * .8;
    f.p.lerp(f.t, kf * .9);
    if (n >= MAXF || f.s < .004) return;
    const old = IN.today && !leaving && !isToday(f.mtime), col = GEM[f.gem][0], sel = f === IN.sel, hov = f === IN.hover, b = (sel ? .9 : hov ? .62 : .36) * (old ? .22 : 1), s = f.s * (hov ? 1.08 : 1) * (old ? .55 : 1);
    let r = col.r * b + (sel ? .35 : .02), g = col.g * b + (sel ? .35 : .02), bl = col.b * b + (sel ? .35 : .025);
    if (f.fx) { const a = (now - f.fx.t) / 1000, life = f.dead ? 3 : 2.2, w = Math.max(0, 1 - a / life) * (f.fx.soft ? .5 : 1.6) * (f.dead ? 1 : (1 + .35 * Math.sin(a * 14)));
      if (w <= 0 && !f.dead) f.fx = null; else { inTmp.copy(f.fx.col); r += inTmp.r * w; g += inTmp.g * w; bl += inTmp.b * w; } }
    setM(FM, n, f.p.x, f.p.y, f.p.z, s, s, s); const o = n * 3; FC[o] = r; FC[o+1] = g; FC[o+2] = bl; n++; };
  for (const f of IN.files) put(f, false);
  if (IN.files.some(f => f.dead && now - f.dead > 3000)) { for (const f of IN.files.filter(f => f.dead && now - f.dead > 3000)) if (IN.sel === f) IN.sel = null; IN.files = IN.files.filter(f => !(f.dead && now - f.dead > 3000)); layout(); }
  IN.gone = IN.gone.filter(f => f.s > .004); for (const f of IN.gone) put(f, true);
  // traces of what was deleted here: a ruby outline that fades over a few minutes
  const tr = C && show ? (TRACES.get(K(IN.path || '')) || []).filter(x => Date.now() - x.t < TRACE_MS) : []; if (C) TRACES.set(K(IN.path || ''), tr);
  tr.forEach((x, j) => { const m = traceMesh(j); m.visible = true; m.position.copy(C.home).add(x.pos); m.scale.setScalar(x.s); m.material.opacity = .85 * (1 - (Date.now() - x.t) / TRACE_MS); });
  for (let j = tr.length; j < tracePool.length; j++) tracePool[j].visible = false;
  fileIM.count = n; if (n) { fileIM.instanceMatrix.needsUpdate = true; fileIM.instanceColor.needsUpdate = true; }
}

/** Points that frame the case, for fitAll. */
function inFrame() { const C = S.cubes.get(S.enter); if (!C) return null; const h = v1.copy(IN.dims).multiplyScalar(.46).max(v2.set(1.4, 1.4, 1.4)); /* a little inside the glass: the camera comes closer */ const P = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) P.push(C.home.clone().add(v2.set(h.x * x, h.y * y, h.z * z))); return P; } // all eight corners: two opposite ones can line up with the view

/** «Novedades de hoy» (N): only what was created or changed today keeps its colour; the deleted leave their trace. */
function toggleToday() { if (!S.enter) { toast('Entra en una carpeta (doble clic) para ver sus novedades de hoy'); return; } IN.today = !IN.today;
  const n = IN.files.filter(f => isToday(f.mtime)).length, d = (TRACES.get(K(IN.path)) || []).length; toast(IN.today ? `Novedades de hoy: ${n} creados o cambiados${d ? ' · ' + d + ' borrados' : ''}` : 'Se ve todo'); }
function inTip(f) { return `<b>${esc(f.name)}</b><br><span style="color:${GEM_HEX[f.gem][1]}">◆ ${GEM_TXT[f.gem]}</span> <span style="color:var(--dim)">· ${fmtB(f.size)}${f.mtime ? ' · hace ' + ago(f.mtime) : ''}</span>`; }

function inSelect(f) { IN.sel = f; S.sel = null; S.mode = 'cube'; renderPanel(); renderCubes(); feed('fichero', GEM_HEX[f.gem][0], f.name + ' · ' + fmtB(f.size)); focusOn([f.t.clone().addScalar(1.2), f.t.clone().subScalar(1.2)], .35, 5, false, f.t.clone()); }

async function inOpen(f) { await openObject(f.path, false); const o = OB.list.find(x => K(x.path) === K(f.path)); if (o) enterViewer(o); }

/** Short notice in the middle of the screen (an empty folder, nothing more to go back to…). */
let toastT = 0;
function toast(text) { let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400); }
S.IN = IN; // test hook
S.TRACES = TRACES; S.toggleToday = () => toggleToday(); // test hooks
