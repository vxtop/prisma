// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Data handling: cube kinds, focus dimming, camera framing, activity particles,
// system/process/agent views, AI focus probes and "Seguir IA".
// === Data ===
let layT = 0;
// kind of each cube, from its contents (server template) and location; shown on the lid emblem and in the tint
const KINDS = { unidad: ['#AEB9C5', '◉', 'Unidad'], ia: ['#D97757', '✦', 'Trabajado con IA'], codigo: ['#5aa2ea', '</>', 'Proyecto de código'], medios: ['#b79cf5', '▶', 'Medios'],
  sistema: ['#8b95a3', '⚙', 'Sistema'], app: ['#269B65', '▣', 'Datos de programas'], temporal: ['#6a7381', '◷', 'Temporal o caché'], descargas: ['#7fb8ef', '↓', 'Descargas'], usuario: ['#F0EBDD', '★', 'Carpeta personal'] };
function cubeKind(c) { const p = K(c.path).replace(/\//g, '\\'), t = c.data && c.data.preset ? c.data.preset.types.map(x => x[0]) : [];
  if (t.includes('unidad') || /^[a-z]:\\?$/.test(p)) return 'unidad';
  if (t.some(x => ['node', 'python', 'rust', 'go', 'git'].includes(x))) return 'codigo'; if (t.includes('medios')) return 'medios';
  // «worked with AI» only for folders about AI (.claude, CLAUDE.md, AGENTS.md); a session merely touching a folder shows on its links instead
  const mk = (c.data && c.data.markers) || []; if (/\\\.claude(\\|$)/.test(p) || mk.some(m => m === '.claude' || m === 'CLAUDE.md' || m === 'AGENTS.md')) return 'ia';
  if (/(\\|^)(temp|tmp|cache|caches|code cache|gpucache|crashpad|logs?)(\\|$)/.test(p)) return 'temporal';
  if (/^[a-z]:\\(windows|program files( \(x86\))?|programdata|\$recycle\.bin|system volume information)(\\|$)/.test(p)) return 'sistema';
  if (/\\appdata\\|\\\.config(\\|$)/.test(p)) return 'app'; if (/\\(downloads|descargas)(\\|$)/.test(p)) return 'descargas';
  if (/\\(desktop|escritorio|documents|documentos|pictures|imágenes|music|música|videos|vídeos|onedrive)(\\|$)/.test(p)) return 'usuario'; return null; }
const EXE_EXT = new Set('exe dll msi sys com scr appx msix msixbundle cpl ocx drv efi lnk bat cmd ps1'.split(' '));
/** One gem per cube: what the folder is (project, media, drive) or else what fills it, by bytes. */
function cubeGem(c) {
  const k = cubeKind(c), d = c.data;
  if (k === 'codigo') return 'code'; if (k === 'medios') return 'docs'; if (k === 'unidad' || !d || !d.totals || !d.totals.files) return 'folder';
  const w = { code: 0, data: 0, docs: 0, exe: 0 };
  for (const x of d.exts || []) { const e = String(x.ext || '').toLowerCase(); w[EXE_EXT.has(e) ? 'exe' : CODE.has(e) ? 'code' : DATA.has(e) ? 'data' : 'docs'] += x.bytes || 1; }
  let best = 'folder', bw = 0; for (const g in w) if (w[g] > bw) { bw = w[g]; best = g; } return best;
}
const kindTex = new Map();
function kindTexOf(k) { if (kindTex.has(k)) return kindTex.get(k); const [col, g] = KINDS[k], cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = 'rgba(12,16,18,.92)'; x.strokeStyle = col; x.lineWidth = 7; x.beginPath(); x.roundRect(8, 8, 112, 112, 22); x.fill(); x.stroke();
  x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${g.length > 1 ? 44 : 64}px "Segoe UI Symbol","Segoe UI",sans-serif`; x.fillText(g, 64, 68);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; kindTex.set(k, tx); return tx; }
// focus: with something selected, unrelated cubes and labels are dimmed
const related = (c, sel) => !sel || c === sel || (c.parent && K(c.parent) === sel.key) || (sel.parent && K(sel.parent) === c.key) || S.multi.has(c.key);
function dimOne(c) { if (!c.cc0) return; const f = VIEW.cur === 'espacio' && S.sel && !related(c, S.sel) ? .22 : 1; if (c.dimF === f) return; c.dimF = f; c.cellDirty = c.colDirty = true; for (let i = 0; i < 81; i++) CC[c.slot * 81 + i] = c.cc0[i] * f; cellsIM.instanceColor.addUpdateRange(c.slot * 81, 81); cellsIM.instanceColor.needsUpdate = true; if (c.label) c.label.material.opacity = f < 1 ? 0 : 1; if (c.emb) c.emb.material.opacity = f < 1 ? .15 : 1; }
function dimFocus() { for (const c of S.cubes.values()) dimOne(c); }
function applyKind(c) { const k = cubeKind(c), g = cubeGem(c); if (k === c.kind && g === c.gem && c.emb && c.kindData === !!c.data) return; c.kindData = !!c.data; c.kind = k; c.gem = g;
  gemBody(c);
  c.cc0 = CC.slice(c.slot * 81, c.slot * 81 + 81); dimOne(c); cellsIM.instanceColor.addUpdateRange(c.slot * 81, 81); cellsIM.instanceColor.needsUpdate = true;
  if (!c.emb) { c.emb = symMesh(); scene.add(c.emb); } // its symbol, engraved on every face and glowing in its gem
  c.emb.material.map = symTex(k || 'g-' + (g || 'folder'), k === 'ia' ? '#D97757' : k === 'medios' ? '#b79cf5' : GEM_HEX[g || 'folder'][1]); /* Claude's colour only for what Claude worked on */ c.emb.material.needsUpdate = true; drawLabel(c); }
/** The 27 cells share the cube's gem as a dark polished metal; empty cells keep their size but sink into shadow. */
function gemBody(c) { // every body is the same graphene; the gem lives in the symbol
  for (let i = 0; i < 27; i++) { const o = (c.slot * 27 + i) * 3; CC[o] = GRAPHENE.r; CC[o+1] = GRAPHENE.g; CC[o+2] = GRAPHENE.b; }
}
function applyScan(c, d) {
  c.data = d; c.lastScan = Date.now(); c.evCount = Math.max(c.evCount, d.events || 0);
  const max = Math.max(1, ...d.cells.map(x => x.bytes)); d.cells.forEach((x, i) => c.heat[i] = x.bytes > 0 ? .25 + .75 * Math.log(1 + x.bytes) / Math.log(1 + max) : 0);
  buildVoxels(c); drawLabel(c); c.kindData = null; applyKind(c); clearTimeout(layT); layT = setTimeout(() => { layout(); renderCubes(); }, 120);
  if (c === S.sel) renderTab();
}
const queue = []; let running = 0;
function scanCube(c) { if (!queue.includes(c)) queue.push(c); pump(); }
async function pump() { while (running < 6 && queue.length) { const c = queue.shift(); if (!S.cubes.has(c.key)) continue; running++;
  api('/api/cube?path=' + encodeURIComponent(c.path) + (S.space === 'vivo' ? '&fast=1' : '')).then(d => applyScan(c, d)).catch(() => {}).finally(() => { running--; pump(); }); } }
const newBorn = [];
function applyState(st) {
  if (st.boot) { if (S.boot && S.boot !== st.boot) return location.reload(); S.boot = st.boot; }
  if ('admin' in st) { const b = document.querySelector('.badge'); if (b && b.dataset.admin !== String(st.admin)) { b.dataset.admin = String(st.admin); b.textContent = st.admin ? 'SOLO LECTURA · ADMIN' : 'SOLO LECTURA'; if (!st.admin) b.dataset.tip = 'Monitor de solo lectura|No crea, modifica ni borra nada. Clic: reiniciar con administrador para ver más datos (caché DNS, archivos abiertos por proceso).'; } }
  if (st.spaces) { S.spaces = st.spaces; const changed = st.space !== S.space; S.space = st.space; if (changed) onSpaceChange(); renderSpaces(); renderEmpty(); }
  if ('procs' in st) syncLiveProcs(st.procs);
  const keys = new Set(st.cubes.map(c => K(c.path))), modeChanged = st.layout !== S.layout; S.layout = st.layout; let born = 0;
  for (const c of S.cubes.values()) { if (!keys.has(c.key)) { if (!c.leaving) c.leaving = performance.now(); } else c.leaving = 0; }
  for (const c of st.cubes) { const ex = S.cubes.get(K(c.path)); if (ex) { ex.parent = c.parent; ex.act = c.live || null; } else { const n = makeCube(c); if (n) { n.act = c.live || null; n.born = performance.now() + born++ * Math.min(80, 1600 / Math.max(1, st.cubes.length - S.cubes.size + 1)); scanCube(n); if (S.space === 'vivo' && !c.parent) newBorn.push(n); } } }
  if (st.mem) syncGhosts(st.mem);
  layout(modeChanged);
  for (const n of newBorn.splice(0)) { const gh = GH.get(n.key), lp = [...LP.values()].find(o => (o.p.links || []).some(p => K(p) === n.key));
    if (lp) { n.pos.copy(lp.pos); n.arrive = { from: lp.pos.clone(), until: performance.now() + 1800, col: lp.kind === 'claude' ? AMB_AI : FS_COL }; }
    else if (gh) { n.pos.copy(gh.pos); n.arrive = { from: gh.pos.clone(), until: performance.now() + 1200, col: FS_COL }; }
    else n.pos.copy(n.home).setY(FLOOR - 2.5); // rises from the floor
    if (gh) GH.delete(n.key); }
  if (S.focusRev < 0) { const first = S.focusRev === -1; S.focusRev = st.focusRev; if (first) setTimeout(fitAll, 1200); }
  if (S.autoFit && VIEW.cur === 'espacio' && !S.follow && st.cubes && st.cubes.length !== S.autoN) { S.autoN = st.cubes.length; clearTimeout(S.autoT); S.autoT = setTimeout(() => { if (S.autoFit && !S.sel) fitAll(); }, 900); }
  else if (!st.quiet && st.focusRev !== S.focusRev && st.focus && S.cubes.has(K(st.focus))) { S.focusRev = st.focusRev; select(S.cubes.get(K(st.focus)), true); }
  if (!S.cubes.size) { $('#right').style.display = 'none'; applyView(); }
  $('#empty').style.display = S.cubes.size || VIEW.cur !== 'espacio' ? 'none' : 'block';
  renderCubes(); renderTop();
}
const focusT = new THREE.Vector3(); let focusing = false, focusD = 0, focusDir = null, focusSel = false;
// frames everything visible in the current view, keeping the camera direction
function fitAll() {
  const pts = []; if (VIEW.cur === 'arbol') { for (const n of TR.list) pts.push(n.tgt.clone().addScalar(n.ts), n.tgt.clone().subScalar(n.ts)); }
  else if (VIEW.cur === 'sistema') { for (const nd of G.nodes.values()) pts.push(nd.tgt); }
  else if (VIEW.cur === 'tareas') { for (const z of TKS.zones) pts.push(new THREE.Vector3(z.c.x - ZW / 2, 0, z.c.z - ZD / 2), new THREE.Vector3(z.c.x + ZW / 2, 5, z.c.z + ZD / 2)); }
  else if (inside() && inFrame()) pts.push(...inFrame());
  else { for (const c of S.cubes.values()) { const p = (c.manual || (c.rel ? c.pos : c.home)).clone().add(c.off); pts.push(p.clone().addScalar(1.6 * c.tScale), p.clone().subScalar(1.6 * c.tScale)); } OB.list.forEach(o => pts.push(o.pos)); }
  if (!pts.length) return; const { ctr: c0, d, dir } = fitPts(pts); const sph = { center: c0 };
  if (d * 1.4 > 420 || VIEW.cur === 'arbol') { controls.maxDistance = Math.max(420, d * 1.4); camera.far = Math.max(700, d * 2.6); camera.updateProjectionMatrix(); } // a large tree needs more distance than the Space view
  focusT.copy(sph.center); focusD = d; focusDir = dir; focusSel = false; focusing = true;
}
// distance at which the points fill the free area (between panels, below the bar, above the ribbon), keeping the angle
function fitPts(pts, fill = .86) {
  const sample = pts.length > 3000 ? pts.filter((_, i) => i % Math.ceil(pts.length / 3000) === 0) : pts, bx = new THREE.Box3().setFromPoints(sample), ctr = bx.getCenter(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize(); if (dir.y < .25) { dir.y = .45; dir.normalize(); }
  if (VIEW.cur === 'arbol' && dir.y < .8) { const h = Math.hypot(dir.x, dir.z) || 1; dir.set(dir.x / h * .6, .8, dir.z / h * .6); } // the tree reads from above: everything visible, no foreshortening
  const viewer = document.body.classList.contains('viewer'), Lp = viewer ? 0 : $('#left').offsetWidth + 10, Rp = !viewer && $('#right').style.display === 'flex' ? $('#right').offsetWidth + 10 : 0;
  const top = viewer ? 0 : $('#top').offsetHeight + 70, bot = viewer ? 0 : 56, aw = (innerWidth - Lp - Rp) / 2 * fill, ah = (innerHeight - top - bot) / 2 * fill, cx = Lp + (innerWidth - Lp - Rp) / 2, cy = innerHeight / 2;
  const cam = camera.clone(); let d = Math.max(4, bx.getBoundingSphere(new THREE.Sphere()).radius / Math.sin(camera.fov * Math.PI / 360) * 1.02);
  for (let it = 0; it < 4; it++) { cam.position.copy(ctr).addScaledVector(dir, d); cam.lookAt(ctr); cam.updateMatrixWorld(); let need = 0;
    for (const p of sample) { v1.copy(p).project(cam); if (v1.z > 1) { need = Math.max(need, 1.25); continue; } const sx = (v1.x + 1) / 2 * innerWidth, sy = (1 - v1.y) / 2 * innerHeight;
      need = Math.max(need, Math.abs(sx - cx) / aw, Math.abs(sy - cy) / ah); }
    d = Math.max(3, d * Math.max(.25, Math.min(4, need))); }
  return { ctr, d, dir };
}
// moves the camera so "pts" fits comfortably in the free area (fill = fraction occupied), no closer than minD
function focusOn(pts, fill = .5, minD = 8, follow = false, center = null) { setTimeout(() => { if (center) pts = pts.concat(pts.map(p => center.clone().multiplyScalar(2).sub(p))); const r = fitPts(pts, fill); focusT.copy(center || r.ctr); /* with a center: the object stays in the middle and its surroundings fit */ focusDir = r.dir; focusD = Math.max(minD, r.d); focusSel = follow; focusing = true; }, 0); } // after the info panel opens, so its width is accounted for
const cubeBox = c => { const h = 1.6 * Math.max(c.tScale || c.s, .3) * 1.77, p = (c.manual || (c.rel ? c.pos : c.home)).clone().add(c.off); const P = []; for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) P.push(p.clone().add(new THREE.Vector3(a * h, b * h, d * h))); return P; };
function select(c, focus) { if (S.space === 'vivo' && c) post('/api/hold', { path: c.path }).catch(() => {});
  if (!c) return; if (c.vis === false) { S.enter = c.parent && S.cubes.has(K(c.parent)) ? K(c.parent) : null; layout(); } S.sel = c; S.mode = 'cube';
  if (focus) { focusT.copy(c.manual || (c.rel ? c.pos : c.home)).add(c.off); focusing = true; focusD = c.depth ? 7 + 9 * c.tScale : Math.max(16, 7 + (c._ext || 0) * 2.3);
    const par = c.parent && S.cubes.get(K(c.parent)), at = x => x.manual || (x.rel ? x.pos : x.home); focusDir = null;
    if (par) { const d = new THREE.Vector3().subVectors(at(c), at(par)).setY(0); if (d.lengthSq() > 1e-4) focusDir = d.normalize().add(new THREE.Vector3(0, .6, 0)).normalize(); } focusSel = !!focusDir; }
  renderCubes(); renderPanel(); pollProcs(); pollAgent(c); loadDeps(c);
}
function loadDeps(c) { if (c.deps) return; c.deps = { pending: true, nodes: [], m: [], deg: [], links: {} };
  api('/api/deps?path=' + encodeURIComponent(c.path)).then(v => { c.deps = v; if (c === S.sel) renderTab(); }).catch(() => { c.deps = null; }); }
function feed(kind, color, text) { const last = S.feed[0]; if (last && last.kind === kind && last.text === text) return;
  const dir = t => String(t).replace(/[\\/][^\\/]*$/, ''); if (last && last.kind === kind && dir(last.base || last.text) === dir(text) && dir(text) !== String(text)) { last.n = (last.n || 1) + 1; last.base = last.base || last.text; last.text = dir(text) + '/… ×' + last.n; feedDirty = true; return; } S.feed.unshift({ kind, color, text }); S.feed.length = Math.min(S.feed.length, 14); feedDirty = true; }
let feedDirty = false;
function actorOf(abs, t) { const a = K(abs); for (const pr of S.sessions.values()) { if (!pr.meta) continue; for (const e of pr.meta.trace) if (e.abs && K(e.abs) === a && Math.abs(t - e.t) < 15000) return 'Claude'; } return null; }
const byYou = m => { if (!S.fg || !m.who) return null; const pids = [...String(m.who).matchAll(/#(\d+)/g)].map(x => +x[1]); if (pids.includes(S.fg.pid) || (S.fg.cur && pids.includes(S.fg.cur.pid))) return 'tú · ' + fgName(pids.includes(S.fg.pid) ? S.fg : S.fg.cur); return null; }; // done by the program you are using
function onFs(m) {
  const c = S.cubes.get(K(m.root)); if (!c) return; m.by = m.by || actorOf(trimSep(c.path) + SEP(c.path) + m.file, m.t); if (m.by === 'prisma') { c.evCount++; c.lastEv = m.t; if (deepestCube(trimSep(c.path) + SEP(c.path) + m.file) !== c) return; return feed('Prisma lee', '#5b6370', `${c.name}/${m.file.split(/[\\/]/).slice(-2).join('/')}`); }
  c.evCount++; c.lastEv = m.t; c.events.unshift(m); c.events.length = Math.min(c.events.length, 30);
  inFsEvent(c, m); // inside its glass case, the file itself is born, changes or dies
  if (deepestCube(trimSep(c.path) + SEP(c.path) + m.file) === c || c.vis !== false) { const rdv = m.type === 'acceso'; c.pulse[13] = Math.max(c.pulse[13], rdv ? .25 : .9); c.flashC = m.type === 'creado' ? IN_BORN : m.type === 'borrado' ? IN_DEAD : rdv ? null : IN_TOUCH; c.cellDirty = true; } // the whole body flashes: emerald created, ruby deleted, pearl changed
  const rd = m.type === 'acceso'; if (m.cell != null) { c.pulse[m.cell] = Math.max(c.pulse[m.cell], rd ? .35 : 1); if (((m.cell / 3 | 0) % 3) === 2) c.deepT = Date.now(); } c.cellDirty = true;
  const k = c.slotOf.get(K(m.file)); if (k != null) flashVox(c, k, rd ? .5 : .9, rd ? FL_RD : FL_FS);
  if (S.space === 'vivo' && VIEW.cur === 'espacio' && c.vis !== false) { const dst = k != null ? voxWorld(c, k, new THREE.Vector3()) : m.cell != null ? cellWorld(c, m.cell, new THREE.Vector3()) : c.pos.clone();
    const pids = m.who ? [...String(m.who).matchAll(/#(\d+)/g)].map(x => +x[1]) : [], src = pids.length ? [...LP.values()].find(o => (o.p.pids || [o.p.pid]).some(p => pids.includes(p))) : null;
    const who = m.by === 'Claude' || (src && src.kind === 'claude') ? AMB_AI : byYou(m) ? YOU_COL : OTHER_COL, from = src ? src.pos : v1.copy(dst).add(v2.set(0, 5, 0)); // origin: its program or, if unknown, from above
    emit(from, dst, rd ? who.clone().multiplyScalar(.45) : who, rd ? 1 : 3, .9, src ? .35 : .05, .05);
    if (c.act) c.act.last = Math.max(c.act.last || 0, m.t || Date.now()); }
  const L = c.live, f = m.file; L.files = [f, ...L.files.filter(x => x !== f)].slice(0, 16);
  L.at.set(f, m.t);
  const par = c.parent && S.cubes.get(K(c.parent));
  followFs(m, c);
  const tmpN = /(^|[\\/])(temp|tmp|cache|caches|gpucache|code cache|crashpad)([\\/]|$)|\.(tmp|temp|lock|log|etl|journal)$|~$/i.test(m.file) || /[\\/]temp$/i.test(c.path);
  const you = !m.by && byYou(m); if (!tmpN && (c.depth === 0 || !par)) { const parts = m.file.split(/[\\/]/); feed((m.by ? m.by + ' ' : you ? you + ' ' : '') + m.type, m.by ? '#D97757' : you ? '#F0EBDD' : rd ? '#8b95a3' : '#1768B5', `${c.name.replace(/[\\/]+$/, '')}/${parts.length > 3 ? '…/' + parts.slice(-2).join('/') : parts.join('/')}${m.who && !m.by ? ' · ' + m.who : ''}`); }
  if (!c.rt) c.rt = setTimeout(() => { c.rt = null; scanCube(c); }, 2500);
}
const YOU_COL = new THREE.Color(1.6, 1.5, 1.3), OTHER_COL = new THREE.Color(.72, .78, .86); // particles: you (pearl) and other programs (silver); Claude uses AMB_AI
const FL_RD = new THREE.Color(.9, 1.1, 1.2), FL_AI = new THREE.Color(2.5, 1.3, .9), FL_W = new THREE.Color(2.8, 2.1, 1.2), FL_FS = new THREE.Color(.45, 1.15, 2.4), FS_COL = new THREE.Color(.25, .75, .7);
function flashVox(c, k, h, col) { c.vheat[k] = Math.max(c.vheat[k], h); c.vfl[k*3] = col.r; c.vfl[k*3+1] = col.g; c.vfl[k*3+2] = col.b; c.colDirty = true; }

// --- System, processes, agent ---
async function pollSys() {
  try { S.sys = await api('/api/sys'); } catch { return; }
  const s = S.sys; S.cpuHist.push(s.cpu.reduce((a, b) => a + b, 0) / (s.cpu.length || 1)); if (S.cpuHist.length > 90) S.cpuHist.shift();
  const nowP = Date.now();
  for (const c of S.cubes.values()) { for (const [f, t] of c.live.at) if (nowP - t > 600000) c.live.at.delete(f);
    for (const [f, v] of c.ai) if (nowP - v.t > 1800000) c.ai.delete(f); if (c.live.at.size > 400) c.live.at = new Map([...c.live.at].slice(-200)); }
  for (const pr of S.sessions.values()) if (pr.seen && pr.seen.size > 3000) pr.seen = new Set(pr.meta ? pr.meta.trace.map(e => e.t + '|' + e.tool + '|' + e.target) : []);
  renderLayers(); renderTab();
}
async function pollProcs() { const c = S.sel; try { S.procs = await api('/api/procs' + (c ? '?path=' + encodeURIComponent(c.path) : '')); } catch {} }
async function pollAgent(c) { try { c.agent = await api('/api/agent?path=' + encodeURIComponent(c.path)); } catch {} }

// === AI focus: probes that travel the structure ===
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const OPW = { lee: 1, busca: .55, escribe: 1.7, ejecuta: .25, delega: .3, red: .2, usa: .3 };
function deepestCube(abs) { let best = null; const a = K(abs); for (const c of S.cubes.values()) { const k = c.key; if ((trimSep(a) === trimSep(k) || under(a, k)) && (!best || k.length > best.key.length)) best = c; } return best; }
function relevant(sess) { for (const c of S.cubes.values()) { let p = c.path; for (let i = 0; i < 6; i++) { if (slug(p) === sess.project) return c; const up = p.replace(/[\\/][^\\/]*$/, ''); if (!up || up === p) break; p = up; } } return null; }
function makeProbe(sess, idx) {
  const color = new THREE.Color(AI_HEX[idx % AI_HEX.length]);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color.clone().multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  core.scale.setScalar(.3); const N = 70, tp = new Float32Array(N * 3), tc = new Float32Array(N * 3), tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  for (let i = 0; i < N; i++) { const f = Math.pow(1 - i / N, 1.6) * 1.6; tc[i*3] = color.r * f; tc[i*3+1] = color.g * f; tc[i*3+2] = color.b * f; }
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); trail.frustumCulled = false;
  const label = textSprite(768, 96); label.material.sizeAttenuation = false; label.center.set(.5, -.5); label.userData.px = 26;
  scene.add(core, trail, label);
  return { id: sess.id, idx, color, hex: AI_HEX[idx % AI_HEX.length], core, trail, tp, N, label, pos: new THREE.Vector3(0, 6, 0), tgt: new THREE.Vector3(0, 6, 0), q: [], cur: null, until: 0, arrive: 0, fired: true, seen: new Set(), init: false, home: null, labelTxt: '' };
}
function resolveEvent(e) {
  if (!e.abs) return null; const c = deepestCube(e.abs); if (!c) return null;
  if (trimSep(K(e.abs)) === trimSep(c.key) || e.dir) return { c, kind: 'cube' };
  const rel = relTo(e.abs, c.path), k = c.slotOf.get(K(rel));
  if (k != null) return { c, kind: 'vox', k, rel };
  return { c, kind: 'cell', cell: e.mtime ? cellOf(rel, e.mtime) : 13, rel };
}
function targetPos(r, out) { if (r.kind === 'vox') return voxWorld(r.c, r.k, out); if (r.kind === 'cell') return cellWorld(r.c, r.cell, out); return out.copy(r.c.pos).add(v3.set(0, 1.9 * r.c.s, 0)); }
function noteAttention(e, now) { // records the focus in every open cube that contains the file
  if (!e.abs) return; const a = K(e.abs), w = OPW[e.op] || .3;
  for (const c of S.cubes.values()) { if (!under(a, c.key)) continue; const rel = relTo(e.abs, c.path), kk = K(rel), o = c.ai.get(kk);
    c.ai.set(kk, { rel, t: now, w: Math.min(3, (o ? o.w * Math.exp(-(now - o.t) / 120000) : 0) + w), op: e.op, last: e }); c.aiHot = now; }
}
async function pollPulse() {
  let p; try { p = await api('/api/pulse'); } catch { return; }
  const now = Date.now(), alive = new Set();
  p.sessions.forEach(sess => {
    const home = relevant(sess); const touches = sess.trace.some(e => e.abs && deepestCube(e.abs));
    let pr = S.sessions.get(sess.id);
    if (!home && !touches) { if (pr) pr.meta = sess; else S.sessions.set(sess.id, { id: sess.id, meta: sess, ghost: true }); alive.add(sess.id); return; }
    if (!pr || pr.ghost) { pr = makeProbe(sess, [...S.sessions.values()].filter(x => !x.ghost).length); S.sessions.set(sess.id, pr); }
    pr.meta = sess; pr.home = home; alive.add(sess.id);
    for (const e of sess.trace) { const id = e.t + '|' + e.tool + '|' + e.target; if (pr.seen.has(id)) continue; pr.seen.add(id);
      if (!pr.init && now - e.t > 240000) continue; // replay the last 4 min on open
      pr.q.push({ ...e, replay: !pr.init }); }
    pr.init = true;
    if (pr.q.length > 40) pr.q.splice(0, pr.q.length - 40);
  });
  for (const [id, pr] of S.sessions) if (!alive.has(id)) { if (!pr.ghost) { scene.remove(pr.core, pr.trail, pr.label); pr.core.material.dispose(); pr.trail.geometry.dispose(); pr.trail.material.dispose(); pr.label.userData.tex.dispose(); pr.label.material.dispose(); } S.sessions.delete(id); }
}
// "Seguir IA": the folder containing what the AI edits (or reads outside the open cubes) opens as its own cube; closed after 90 s unused
const FWA = new Map(), FWA_IDLE = 20000; let fwOpenT = 0; // folder -> { path, t, ops }
function followOpen(e) { const dir = e.dir ? e.abs : e.abs.replace(/[\\/][^\\/]*$/, ''), k = K(dir); if (!dir) return; const now = Date.now(), a = FWA.get(k);
  if (a) { a.t = now; a.ops++; return; } if (S.cubes.has(k) || now - fwOpenT < 1500) return;
  fwOpenT = now; FWA.set(k, { path: dir, t: now, ops: 1, born: now }); post('/api/open', { path: dir, here: true, root: true, quiet: true }).then(() => feed('sigue IA', '#D97757', 'abre ' + base(dir))).catch(() => FWA.delete(k)); }
function followTouch(e) { if (!e.abs) return; const a = K(e.abs); for (const [k, v] of FWA) if (a === k || under(a, k)) v.t = Date.now(); }
setInterval(() => { const now = Date.now(); for (const [k, v] of FWA) { const c = S.cubes.get(k); if (!c) { if (now - v.born > 15000) FWA.delete(k); continue; } // closed by someone else
    if (now - v.t > FWA_IDLE && c !== S.sel) { FWA.delete(k); post('/api/close', { path: v.path }).then(() => feed('sigue IA', '#8b95a3', 'cierra ' + base(v.path) + ' (sin uso)')).catch(() => {}); } } }, 3000);
// "Seguir IA" camera: each frame, to the exact point of every active session (the file's slot, not the cube center)
const fwp = document.createElement('div'); fwp.id = 'fwpanel'; document.body.appendChild(fwp); let fwpKey = '';
function renderFollowPanel() { const on = S.follow && VIEW.cur === 'espacio' && !VW.o; fwp.style.display = on ? 'block' : 'none'; if (!on) return; const now = Date.now();
  const prs = [...S.sessions.values()].filter(p => !p.ghost), ev = prs.flatMap(p => (p.meta && p.meta.trace || []).slice(-12).map(e => ({ ...e, hex: p.hex }))).sort((a, b) => b.t - a.t).slice(0, 7);
  const cur = prs.find(p => p.cur && now - (p.lastEv || 0) < 45000), sh = p => String(p || '').replace(/\\/g, '/').split('/').slice(-3).join('/');
  const h = `<h3><i class="ldot"></i>Siguiendo IA <span>${prs.length} ${prs.length === 1 ? 'sesión' : 'sesiones'}</span></h3>`
    + (cur ? `<div class="now" style="--k:${cur.hex}"><b>${esc(cur.cur.e.op)}</b> ${esc(sh(cur.cur.e.abs || cur.cur.e.target))}</div>` : '<div class="now idle">esperando a que haga algo…</div>')
    + (ev.length ? '<div class="tl2">' + ev.map(e => `<div style="--k:${e.hex}"><time>${ago(e.t)}</time><b>${esc(e.op)}</b><span>${esc(sh(e.abs || e.target))}</span></div>`).join('') + '</div>' : '')
    + (FWA.size ? '<h4>Abiertas para seguirla</h4>' + [...FWA.values()].map(v => `<div class="fwa"><span>${esc(base(v.path))}</span><em>${Math.max(0, Math.ceil((FWA_IDLE - (now - v.t)) / 1000))} s</em></div>`).join('') : '')
    + '<div class="hint">Lo que edita se abre como cubo y se cierra a los 20 s sin uso · rueda: distancia · clic: dejar de seguir</div>';
  if (h !== fwpKey) { fwpKey = h; fwp.innerHTML = h; } }
setInterval(renderFollowPanel, 500);
function followCam(now) {
  if (!S.follow || VIEW.cur !== 'espacio' || VW.o) return; const pts = [];
  for (const pr of S.sessions.values()) if (!pr.ghost && pr.lastR && S.cubes.get(pr.lastR.c.key) === pr.lastR.c && now - (pr.lastRT || 0) < 120000) pts.push(pr);
  for (const pr of pts) if (pr.lastE && (!pr.reT || now - pr.reT > 500)) { pr.reT = now; const r2 = resolveEvent(pr.lastE); if (r2) pr.lastR = r2; } // is there a tighter-fitting cube already?
  S.followC = pts.length ? pts[0].lastR.c : null; if (!pts.length) return;
  const P = pts.map(pr => targetPos(pr.lastR, new THREE.Vector3())), ctr = v2.set(0, 0, 0); P.forEach(p => ctr.add(p)); ctr.divideScalar(P.length);
  let spread = 0; P.forEach(p => spread = Math.max(spread, p.distanceTo(ctr)));
  const c = S.followC; focusT.copy(pts.length === 1 ? v3.copy(c.pos).lerp(ctr, .55) : ctr); focusing = true; focusSel = false; // the point, with its cube around it
  // from above and slightly to the side, so neighboring cubes don't hide the target
  const d0 = camera.position.clone().sub(controls.target).setY(0); if (d0.lengthSq() < 1e-4) d0.set(0, 0, 1); d0.normalize().multiplyScalar(.62); focusDir = d0.setY(.78).normalize();
  focusD = (pts.length === 1 ? Math.max(10, 14 * Math.max(c.tScale, .5)) : Math.max(14, spread * 2.4 + 10)) * (S.fz || 1); // the whole cube in view
}
function stepProbes(dt, t, now) {
  followCam(now);
  for (const pr of S.sessions.values()) { if (pr.ghost) continue;
    if (now > pr.until && pr.q.length) { // next event
      const e = pr.q.shift(), r = resolveEvent(e), dwell = Math.max(.18, (e.replay ? .35 : .9) / (1 + pr.q.length / 5));
      pr.cur = { e, r }; if (r && e.abs) { pr.lastR = r; pr.lastE = e; pr.lastRT = now; } pr.until = now + dwell * 1000; pr.arrive = now + Math.min(450, dwell * 600); pr.fired = false;
      const where = r ? (r.rel ? r.rel.replace(/\\/g, '/').split('/').slice(-2).join('/') : r.c.name) : (e.abs ? base(e.abs) : e.target.replace(/"[^"]*?([^\\/"]+)"/g, '$1').replace(/\s+/g, ' ').slice(0, 44));
      pr.labelTxt = `${e.op} · ${where}`.slice(0, 80); drawText(pr.label, [[pr.labelTxt, 40, pr.hex, 48]]);
      noteAttention(e, now);
      if (!e.replay) feed('Claude ' + e.op, pr.hex, where);
      pr.lastEv = now; if (!e.replay) followTouch(e); if (S.follow && e.abs && !e.replay && (e.op === 'escribe' || !r)) followOpen(e); // edits something or reads outside the open cubes: open what contains it
    }
    const cur = pr.cur;
    if (cur && cur.r) targetPos(cur.r, pr.tgt).add(v3.set(.25, .45, .25).multiplyScalar(Math.max(.4, cur.r.c.s)));
    else if (pr.home) pr.tgt.copy(pr.home.pos).add(v3.set(Math.cos(t * .4 + pr.idx * 2) * 3 * pr.home.s, 2.6 * pr.home.s + .6, Math.sin(t * .4 + pr.idx * 2) * 3 * pr.home.s));
    const k = 1 - Math.pow(.004, dt); pr.pos.lerp(pr.tgt, k);
    pr.core.position.copy(pr.pos); pr.core.scale.setScalar(.28 + Math.sin(t * 6 + pr.idx) * .03 + (cur && !pr.fired ? .12 : 0)); pr.core.material.opacity = Math.min(1, Math.max(0, (pr.pos.distanceTo(camera.position) - 1.2) / 3)); pr.label.position.copy(pr.pos); pr.label.scale.set(pxScale(26) * 8, pxScale(26), 1);
    pr.label.visible = !!cur && now < pr.until + 2500;
    // trail
    const tp = pr.tp; tp.copyWithin(3, 0, (pr.N - 1) * 3); tp[0] = pr.pos.x; tp[1] = pr.pos.y; tp[2] = pr.pos.z; pr.trail.geometry.attributes.position.needsUpdate = true;
    if (cur && !pr.fired && now >= pr.arrive) { pr.fired = true; const { e, r } = cur;
      if (r) { const p0 = targetPos(r, v1);
        if (e.op === 'escribe') { emit(pr.pos, p0, pr.color.clone().multiplyScalar(1.6), 18, .5, .15, .05); }
        else if (e.op === 'busca') { for (let j = 0; j < 10 && r.c.nv; j++) { const kk = Math.random() * r.c.nv | 0; flashVox(r.c, kk, .7, FL_AI); emit(voxWorld(r.c, kk, v2), pr.pos, pr.color, 2, .7, .3, .02); } }
        else emit(p0, pr.pos, pr.color, e.op === 'lee' ? 14 : 6, .55, .12, .05);
        if (r.kind === 'vox') flashVox(r.c, r.k, e.op === 'escribe' ? 1.6 : 1.1, e.op === 'escribe' ? FL_W : FL_AI);
        else if (r.kind === 'cell') { r.c.pulse[r.cell] = Math.max(r.c.pulse[r.cell], .9); r.c.cellDirty = true; }
        else for (let i = 0; i < 27; i++) r.c.pulse[i] = Math.max(r.c.pulse[i], .25), r.c.cellDirty = true;
      } else emit(pr.pos, v1.copy(pr.pos).add(v2.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(2)), pr.color, 6, .6, 0, .1);
    }
  }
}

