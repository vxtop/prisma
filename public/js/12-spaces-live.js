// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Spaces ("En vivo" and user spaces), folder drag-and-drop, cube levels, loading indicator,
// and live processes shown as cubes in the "En vivo" room.
// === Spaces: «En vivo» and User Spaces ===
S.space = 'vivo'; S.spaces = []; S.enter = null;
function renderSpaces() { document.body.classList.toggle('vivo', S.space === 'vivo');
  $('#spaces').innerHTML = S.spaces.map(s => `<button class="spt ${s.id === S.space ? 'on' : ''}" data-sp="${esc(s.id)}" data-tip="${s.auto ? 'En vivo|Lo que se está usando ahora en el equipo: disco, IA, programas y descargas. Se actualiza solo.' : esc(s.name) + '|Espacio propio: lo que abras aquí se queda.'}">${s.auto ? '<i class="ldot"></i>' : ''}${esc(s.name)}<span>${s.n}</span>${s.auto ? '' : `<u data-x="${esc(s.id)}" data-tip="Cerrar este espacio">×</u>`}</button>`).join('')
    + `<button class="spt add" id="sp-add" data-tip="Nuevo espacio|Vacío, o con una foto fija de lo que hay ahora en vivo.">+</button>`;
}
$('#spaces').onclick = e => {
  const x = e.target.closest('[data-x]'); if (x) { e.stopPropagation(); return post('/api/space', { action: 'close', id: x.dataset.x }).catch(er => feed('error', '#e0605c', er.message)); }
  if (e.target.closest('#sp-add')) { const r = e.target.closest('#sp-add').getBoundingClientRect();
    return menu(r.left, r.bottom + 6, [['Varios cubos…', () => pickMany(), 'elige carpetas; se van colocando'], ['Espacio vacío', () => post('/api/space', { action: 'new' }).catch(() => {}), 'abre lo que quieras'], ['Foto fija de «En vivo»', () => post('/api/space', { action: 'new', name: 'Foto ' + new Date().toTimeString().slice(0, 5), snapshot: true }).catch(() => {}), 'no cambia']]); }
  const b = e.target.closest('[data-sp]'); if (b && b.dataset.sp !== S.space) post('/api/space', { action: 'switch', id: b.dataset.sp }).catch(er => feed('error', '#e0605c', er.message));
};
// «+ → Varios cubos…»: native multi-folder picker; the server creates a space and cubes arrive one by one
let picking = false;
async function pickMany() { if (picking) return; picking = true; try { await pickMany0(); } finally { picking = false; } }
async function pickMany0() {
  feed('elige', '#4fb3ad', 'carpetas en la ventana de Windows…');
  try { const { paths } = await post('/api/pick', {}); if (!paths.length) return feed('selector', '#8a949c', 'cancelado');
    const r = await post('/api/openmany', { paths, space: 'new' }); feed('abre', '#4fb3ad', `${r.n} cubo${r.n > 1 ? 's' : ''}`); }
  catch (er) { feed('error', '#e0605c', er.message); }
}
// Drag from Windows Explorer: folders become cubes, files become objects.
// The browser hides the path, so we send the name and top-level listing and the server locates it (read-only).
const legend = document.createElement('div'); legend.id = 'legend'; legend.innerHTML = '<span><i style="background:#e8a33d"></i>Claude</span><span><i style="background:#7fd6cf"></i>tú</span><span><i style="background:#8fa6c8"></i>otro programa</span><span class="lg">● punto = archivo tocado ahora · ― línea = programa ↔ carpeta que usa</span>'; document.body.appendChild(legend);
const nowbar = document.createElement('div'); nowbar.id = 'nowbar'; document.body.appendChild(nowbar);
const fgName = f => (f.name || '').replace(/\.exe$/i, '') || 'programa';
function onFg(f) { const prev = S.fg; S.fg = f; if (!f || !f.pid) { nowbar.classList.remove('on'); return; } const cu = f.cur;
  nowbar.innerHTML = '<i></i><b>' + esc(fgName(f)) + '</b><span>' + esc(f.title || '') + '</span>' + (cu && cu.pid && cu.pid !== f.pid ? '<em>cursor sobre</em><b class="cur">' + esc(fgName(cu)) + '</b><span>' + esc((cu.title || '').slice(0, 40)) + '</span>' : ''); nowbar.classList.add('on');
  if (!prev || prev.pid !== f.pid || prev.title !== f.title) feed('delante', '#e8a33d', fgName(f) + (f.title ? ' · ' + f.title.slice(0, 70) : '')); }
const dropHint = document.createElement('div'); dropHint.id = 'drophint'; dropHint.innerHTML = '<b>Suelta para verlo</b><span>carpetas → cubos · archivos → objetos</span>'; document.body.appendChild(dropHint);
const canDrop = e => VIEW.cur === 'espacio' && !document.body.classList.contains('viewer') && [...(e.dataTransfer?.types || [])].some(t => t === 'Files' || t === 'text/plain');
let dropT = 0;
addEventListener('dragover', e => { if (!canDrop(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropHint.classList.add('on'); clearTimeout(dropT); dropT = setTimeout(() => dropHint.classList.remove('on'), 250); });
addEventListener('drop', async e => {
  if (!canDrop(e)) return; e.preventDefault(); dropHint.classList.remove('on');
  const txt = e.dataTransfer.getData('text/plain').trim(), ents = [...e.dataTransfer.items].filter(i => i.kind === 'file').map(i => [i.webkitGetAsEntry && i.webkitGetAsEntry(), i.getAsFile()]).filter(x => x[0]);
  if (!ents.length && txt) { const many = txt.split(/\s*[;\r\n]+\s*/).filter(p => /^([a-z]:[\\/]|\/)/i.test(p)); if (many.length) return post('/api/openmany', { paths: many }).catch(er => feed('error', '#e0605c', er.message)); return; }
  const kidsOf = d => new Promise(ok => { const r = d.createReader(); r.readEntries(l => ok(l.slice(0, 30).map(x => x.name.slice(0, 120))), () => ok([])); });
  const items = await Promise.all(ents.slice(0, 64).map(async ([en, f]) => en.isDirectory ? { name: en.name, dir: true, kids: await kidsOf(en) } : { name: en.name, dir: false, size: f ? f.size : 0, mtime: f ? f.lastModified : 0 }));
  feed('suelta', '#4fb3ad', items.length === 1 ? items[0].name : items.length + ' elementos');
  try { const res = await post('/api/resolve', { items }), dirs = res.filter(r => r.dir && r.path).map(r => r.path), files = res.filter(r => !r.dir && r.path).map(r => r.path), miss = res.filter(r => !r.path);
    if (miss.length) feed('no encuentro', '#e0605c', miss.map(m => m.name).join(', ') + ' · escribe su ruta arriba');
    if (dirs.length) await post('/api/openmany', { paths: dirs });
    for (const p of files) await openObject(p, files.length === 1); }
  catch (er) { feed('error', '#e0605c', er.message); }
});
function onSpaceChange() { S.peek = null; S.enter = null; S.sel = null; S.multi.clear(); OB.sel = null; S.mode = 'cube'; renderPanel(); S.focusRev = -2; setTimeout(fitAll, 1200); }
function renderEmpty() {
  const live = S.space === 'vivo', e = $('#empty');
  e.querySelector('b').textContent = live ? 'Escuchando el equipo…' : 'Este espacio está vacío';
  e.querySelector('p').innerHTML = live ? 'Aquí aparecerá lo que se esté usando: actividad de disco, IA, programas y descargas. También puedes abrir algo concreto:' : 'Arrastra aquí carpetas desde el Explorador, escribe una ruta arriba, usa el <u data-e="ex">explorador</u> o empieza por:';
}

// === Levels: top-level cubes only; double-click enters, Esc exits ===
async function enterCube(c) {
  if (!c) return; const hasKids = [...S.cubes.values()].some(x => x.parent && K(x.parent) === c.key);
  if (!hasKids) { try { await post('/api/open', { path: c.path, depth: 1, here: true }); } catch (er) { feed('error', '#e0605c', er.message); } }
  if (!S.enter) S.camBack = { p: camera.position.clone(), t: controls.target.clone() }; S.enter = c.key; layout(); select(c, false); setTimeout(fitAll, 450); feed('entra', '#4fb3ad', c.name);
}
function leaveLevel() {
  if (!S.enter) return false; const c = S.cubes.get(S.enter); S.enter = c && c.parent && S.cubes.has(K(c.parent)) ? K(c.parent) : null;
  layout(); if (c) select(c, false);
  if (!S.enter && S.camBack) { const b = S.camBack; S.camBack = null; focusT.copy(b.t); focusDir = b.p.clone().sub(b.t).normalize(); focusD = b.p.distanceTo(b.t); focusSel = false; focusing = true; } else setTimeout(fitAll, 350); return true;
}
function deselect() {
  if (VIEW.cur === 'arbol') { TR.sel = null; TR.dirtyCol = true; S.mode = 'cube'; renderPanel(); renderCubes(); return; }
  if (VIEW.cur === 'tareas') { TKS.sel = null; S.mode = 'cube'; renderPanel(); renderCubes(); return; }
  if (VIEW.cur === 'sistema') { G.sel = null; S.mode = 'cube'; renderPanel(); renderCubes(); return; }
  if (S.space === 'vivo' && S.sel) post('/api/hold', {}).catch(() => {}); S.sel = null; OB.sel = null; S.lpSel = null; S.multi.clear(); S.mode = 'cube'; renderPanel(); renderCubes();
}

// === Loading Indicator ===
function renderLoad() {
  const busy = queue.length + running, ix = [...(S.idx || new Map()).values()].find(x => x.state === 'running'), el = $('#load'); let h = '';
  if (busy) h = `<i class="spin"></i>Leyendo ${busy} carpeta${busy > 1 ? 's' : ''}`;
  else if (ix) h = `<i class="spin"></i>Indexando ${esc(base(ix.root) || ix.root)} · ${fmtC(ix.files)}`;
  else if (VIEW.cur === 'tareas' && !TKS.data) h = '<i class="spin"></i>Leyendo el administrador de tareas';
  else if (VIEW.cur === 'arbol' && TR.busy) h = '<i class="spin"></i>Leyendo carpetas';
  else if (S.space === 'vivo' && VIEW.cur === 'espacio') h = '<i class="ldot"></i>En vivo';
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; el.style.display = h ? 'inline-flex' : 'none'; }
}

// === Live Processes in «En vivo» (observe only) ===
const LP = new Map(), LPMAX = 48, LPB = 3.2; // LPB: float height of program cubes (they rest on nothing)
const lpGeo = new THREE.BufferGeometry(); lpGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 6), 3)); lpGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(96 * 6), 3));
const lpLines = new THREE.LineSegments(lpGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8, depthWrite: false, toneMapped: false })); lpLines.frustumCulled = false; scene.add(lpLines);
// each program is a 27-cell cube: color = type, size = memory, lit cells (bottom-up) = CPU
const cellsOf = (max) => { const im = new THREE.InstancedMesh(cellGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .55, roughness: .42, envMapIntensity: .5 }), max); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); im.frustumCulled = false; im.count = 0; scene.add(im); return im; };
const lpFgRing = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 64), new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: .75, depthWrite: false, toneMapped: false })); lpFgRing.visible = false; scene.add(lpFgRing); // ring for the foreground program
// live screen: the foreground window image, floating above its cube
const fgScreen = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: .96 })); fgScreen.visible = false; fgScreen.center.set(.5, 0); scene.add(fgScreen);
const fgFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: .8, toneMapped: false })); fgFrame.visible = false; scene.add(fgFrame);
let fgShotBusy = false, fgShotT = 0, fgAspect = .56;
function pullFgShot() { if (!SET.screens) { fgScreen.material.map = null; return; } if (fgShotBusy || !S.fg || /^vxtop$/.test(S.fg.title || '') || S.space !== 'vivo' || VIEW.cur !== 'espacio') return; fgShotBusy = true;
  fetch('/api/fgshot?t=' + TK(), { cache: 'no-store' }).then(r => r.status === 200 ? r.blob() : null).then(b => { if (!b) return; const u = URL.createObjectURL(b); return new Promise(ok => { const img = new Image(); img.onload = () => { URL.revokeObjectURL(u); ok(img); }; img.onerror = () => { URL.revokeObjectURL(u); ok(null); }; img.src = u; }).then(img => { if (!img) return; const tx = fgScreen.material.map; if (tx) tx.dispose(); const nt = new THREE.Texture(img); nt.colorSpace = THREE.SRGBColorSpace; nt.needsUpdate = true; fgScreen.material.map = nt; fgScreen.material.needsUpdate = true; fgAspect = img.height / img.width; }); }).catch(() => {}).finally(() => { fgShotBusy = false; }); }
setInterval(pullFgShot, 1000);
const lpCurRing = new THREE.Mesh(new THREE.RingGeometry(.9, .96, 64), new THREE.MeshBasicMaterial({ color: 0x4fb3ad, transparent: true, opacity: .8, depthWrite: false, toneMapped: false })); lpCurRing.visible = false; scene.add(lpCurRing); // ring for the program under the cursor
const lpCells = cellsOf(LPMAX * 27), UPORDER = [...Array(27).keys()].sort((a, b) => BASE[a][1] - BASE[b][1] || a - b); // cell indices ordered bottom-up
const scrGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const LP_COL = { claude: new THREE.Color('#e8a33d'), app: new THREE.Color('#5f8f95'), node: new THREE.Color('#6f9a5c'), proc: new THREE.Color('#5d666c') }, lpTmp = new THREE.Color();
function syncLiveProcs(list) {
  { const g = new Map(); for (const p of list || []) { const k = p.win || p.name; const e = g.get(k); if (!e) g.set(k, { ...p, n: 1, pids: [p.pid], links: [...(p.links || [])] }); else { e.n++; e.pids.push(p.pid); e.cpu += p.cpu; e.ws += p.ws; for (const l of p.links || []) if (!e.links.includes(l)) e.links.push(l); } } list = [...g.values()]; }
  const seen = new Set();
  (list || []).forEach(p => { const id = p.win || p.name; seen.add(id); let o = LP.get(id);
    if (!o) { const kind = p.claude ? 'claude' : p.win ? 'app' : /^node(\.exe)?$/i.test(p.name) ? 'node' : 'proc';
      o = { id, kind, off: new THREE.Vector3(), icon: new THREE.Mesh(scrGeo, new THREE.MeshBasicMaterial({ map: screenFor({ name: p.name, exe: p.exe, kind }), transparent: true, toneMapped: false, depthWrite: false })), pos: new THREE.Vector3(0, LPB, 0), base: new THREE.Vector3(0, LPB, 0), h: .02 };
      scene.add(o.icon); LP.set(id, o); }
    o.p = p; o.dead = false; if (o.slot == null) { const used = new Set([...LP.values()].map(x => x.slot)); let k = 0; while (used.has(k)) k++; o.slot = k; } });
  for (const [id, o] of LP) if (!seen.has(id)) { o.dead = true; if (S.lpSel === o) { S.lpSel = null; if (S.mode === 'lp') { S.mode = 'cube'; renderPanel(); } } }
}
function stepLiveProcs(dt, t) {
  const on = S.space === 'vivo' && VIEW.cur === 'espacio' && !VW.o && !S.enter; lpLines.visible = lpCells.visible = on; if (!on) { lpFgRing.visible = false; lpCurRing.visible = false; fgScreen.visible = fgFrame.visible = false; }
  for (const [id, o] of LP) if (o.dead && o.h < .06) { scene.remove(o.icon); o.icon.material.dispose(); LP.delete(id); }
  for (const o of LP.values()) o.icon.visible = on; if (!on || !LP.size) { lpCells.count = 0; return; }
  const river = S.layout === 'cluster' || S.layout === 'orbit', hub = v3.set(0, 0, 0); if (!river && S.vorder && S.vorder.length) { const b = new THREE.Box3(); S.vorder.forEach(c => b.expandByPoint(c.home)); b.getCenter(hub); hub.z = b.max.z + 9; hub.y = 0; }
  const NS = Math.max(12, ...[...LP.values()].map(o => o.slot + 1)), R = Math.max(4.6, NS * 2.7 / (2 * Math.PI)), k = 1 - Math.pow(.02, dt), P = lpGeo.attributes.position.array, C = lpGeo.attributes.color.array, A = lpCells.instanceMatrix.array, IC = lpCells.instanceColor.array; let m = 0, i = 0;
  for (const o of LP.values()) { if (i >= LPMAX) break; const a = o.slot / NS * Math.PI * 2, p = o.p;
    o.base.lerp(v2.set(hub.x + Math.cos(a) * R, LPB, hub.z + Math.sin(a) * R), k); const hw = o.dead ? 0 : .9 + 1.5 * Math.sqrt(Math.min(1, p.ws / 3e9)); o.h += (hw - o.h) * k; // cube edge: memory
    const isFg = !!(S.fg && (o.p.pids || [o.p.pid]).includes(S.fg.pid)); o.fg = isFg;
    const sel = o === S.lpSel, hov = o === S.lpHover, E = o.h * (hov || sel ? 1.06 : 1) * (isFg ? 1.35 : 1), sp = E / 3, cy = LPB + E / 2 + .02, w = E; o.pos.set(o.base.x, LPB + E, o.base.z);
    for (let q = 0; q < 27; q++) { const b = BASE[q]; setM(A, i * 27 + q, o.base.x + b[0] * sp, cy + b[1] * sp, o.base.z + b[2] * sp, sp * .9, sp * .9, sp * .9); }
    const rel = !S.sel || (p.links || []).some(q => K(q) === S.sel.key), heat = Math.min(1, p.cpu / 60), br = (sel ? 1.8 : hov ? 1.45 : 1) * (rel ? 1 : .4) * (1 + heat * .9 * (.85 + .15 * Math.sin(t * (2 + heat * 6) + i)));
    const kc = lpTmp.set(procCat(p.name, o.kind)[1]), fl = o.flash ? Math.max(0, 1 - (performance.now() - o.flash) / 1200) : 0, dim = (sel ? 1.6 : hov ? 1.3 : isFg ? 1.45 : 1) * (rel || isFg ? 1 : .45), lit = p.cpu > .5 ? Math.max(1, Math.round(heat * 27)) : 0;
    for (let q = 0; q < 27; q++) { const on2 = UPORDER.indexOf(q) < lit, f = on2 ? (1.1 + .25 * Math.sin(t * (2 + heat * 5) + q)) : .34 + fl; const o3 = (i * 27 + q) * 3; // off: graphite tinted by type; on: full type color
      IC[o3] = (GRAPHITE.r * (1 - f * .6) + kc.r * f * .6) * dim; IC[o3 + 1] = (GRAPHITE.g * (1 - f * .6) + kc.g * f * .6) * dim; IC[o3 + 2] = (GRAPHITE.b * (1 - f * .6) + kc.b * f * .6) * dim; }
    i++; void br;
    o.icon.position.set(o.base.x, LPB + E + .03, o.base.z); o.icon.scale.setScalar(w * .62); o.icon.material.opacity = (rel ? 1 : .4) * Math.min(1, o.h * 2);
    if (sel || hov || isFg || (S.fg && S.fg.cur && (p.pids || [p.pid]).includes(S.fg.cur.pid))) for (const lp of p.links || []) { const c = S.cubes.get(K(lp)); if (!c || c.vis === false || m >= 96) continue; /* line = this program uses this folder */ const col = o.kind === 'claude' ? [.7, .45, .14] : [.12, .4, .38], f = sel || hov ? 2 : 1;
      P.set([o.pos.x, o.pos.y, o.pos.z, c.pos.x, c.pos.y, c.pos.z], m * 6); C.set([...col.map(x => x * f), ...col.map(x => x * .35 * f)], m * 6); m++;
    } }
  lpCells.count = i * 27; lpCells.instanceMatrix.needsUpdate = true; lpCells.instanceColor.needsUpdate = true;
  { const f = [...LP.values()].find(o => o.fg && !o.dead), showS = !!(f && fgScreen.material.map && S.fg && !/^vxtop$/.test(S.fg.title || '')); fgScreen.visible = fgFrame.visible = showS;
    if (showS) { const W = Math.min(40, Math.max(4, camera.position.distanceTo(f.base) * .24)), Hs = W * fgAspect, y = LPB + f.h * 1.35 + .8; /* readable at any distance: ~1/4 of the view width */ fgScreen.position.set(f.base.x, y, f.base.z); fgScreen.scale.set(W, Hs, 1); const away = (S.sel || S.lpSel) && S.lpSel !== f; fgScreen.material.opacity = away ? .22 : .96; fgFrame.material.opacity = away ? .2 : .8; lpFgRing.material.opacity = away ? .25 : .9; fgFrame.position.set(f.base.x, y + Hs / 2, f.base.z); fgFrame.quaternion.copy(camera.quaternion); fgFrame.scale.set(W * 1.02, Hs * 1.02, 1); }
    { const cu = S.fg && S.fg.cur, oc = cu && cu.pid ? [...LP.values()].find(o => !o.dead && (o.p.pids || [o.p.pid]).includes(cu.pid)) : null; lpCurRing.visible = !!oc && on; if (oc) { const E2 = oc.h * (oc.fg ? 1.35 : 1); lpCurRing.position.set(oc.base.x, LPB + E2 / 2, oc.base.z); lpCurRing.quaternion.copy(camera.quaternion); lpCurRing.scale.setScalar(E2 * .95 + .25); lpCurRing.material.opacity = (S.sel || S.lpSel) && S.lpSel !== oc ? .2 : .8; lpFgRing.material.opacity = (S.sel || S.lpSel) && !(S.lpSel && S.lpSel.fg) ? .25 : .9; } }
    lpFgRing.visible = !!f; if (f) { const E1 = f.h * 1.35; lpFgRing.position.set(f.base.x, LPB + E1 / 2, f.base.z); lpFgRing.quaternion.copy(camera.quaternion); lpFgRing.scale.setScalar(E1 * 1.05 + .35); } }
  lpGeo.setDrawRange(0, m * 2); lpGeo.attributes.position.needsUpdate = true; lpGeo.attributes.color.needsUpdate = true;
}
function pickLP(x, y) { if (S.space !== 'vivo' || VIEW.cur !== 'espacio' || S.enter || !lpCells.visible) return null; let best = null, bs = Infinity; const ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
  // the program cube whose screen center is nearest the click, within its silhouette (foreground cube is larger)
  for (const o of LP.values()) { if (o.dead) continue; const E = o.h * (o.fg ? 1.35 : 1), [cx, cy, ok] = scr(v1.set(o.base.x, LPB + E / 2 + .02, o.base.z)); if (!ok) continue; const r = Math.max(10, E * .8 * ph / v1.distanceTo(camera.position)), d = Math.hypot(x - cx, y - cy) / r; if (d < 1 && d < bs) { bs = d; best = o; } }
  return best; }
TABS.lp = [['info', 'Proceso']];
function selectLP(o) { S.lpSel = o; S.mode = 'lp'; renderPanel(); }
function followProc(pid) { setView('sistema'); let tries = 0; const go = () => { const nd = G.nodes.get(String(pid)); if (nd && canFollow(nd)) startFollow(nd); else if (tries++ < 12) setTimeout(go, 500); else feed('seguir', '#e0605c', 'no se puede seguir ese proceso'); }; setTimeout(go, 400); }
function lpMenu(o) { const dir = o.p.exe ? o.p.exe.replace(/[\\/][^\\/]*$/, '') : null, links = (o.p.links || []).map(l => S.cubes.get(K(l))).filter(Boolean);
  return [['Ver detalle', () => selectLP(o), 'clic'], ['Seguir este programa', () => followProc(o.p.pid), 'qué abre, lee y toca'], ...(links.length ? [['Ir a la carpeta que usa', () => select(links[0], true), links[0].name]] : []), ...(dir ? [['Abrir su carpeta como cubo', () => post('/api/open', { path: dir, here: true }).catch(er => feed('error', '#e0605c', er.message))]] : []), '-', ['Ver en la vista Sistema', () => jumpToProc(o.p.pid)], ['Ver en Tareas', () => setView('tareas')], '-', ['Copiar nombre', () => copy(o.p.win || o.p.name)], ...(o.p.exe ? [['Copiar ruta', () => copy(o.p.exe)]] : [])]; }
function renderLpPanel() {
  const o = S.lpSel; if (!o) return; const p = o.p, el = $('#tab'); builtFor = ''; panelFrame('lp', p.win || p.name, p.exe || p.name, 'info');
  el.innerHTML = kvH([['Programa', p.name], ['Ventana', p.win], ['Procesos', p.n || 1], ['CPU', (p.cpu / ((S.sys && S.sys.cpu.length) || 1)).toFixed(1) + ' % del equipo'], ['GPU', (p.gpu || 0) + ' %'], ['Disco (E/S)', fmtB(p.io || 0) + '/s'], ['RAM', fmtB(p.ws)]]) + '<div class="hint" style="margin-top:6px">Su cubo: el tamaño es la memoria y las celdas encendidas (de abajo arriba), la CPU. Halo ámbar: lo tienes delante; turquesa: está bajo tu cursor.</div>'
    + '<h2 class="sub">Carpetas que usa ahora</h2><div class="list">' + ((p.links || []).map(l => '<div data-k="' + esc(K(l)) + '" style="cursor:pointer"><span>' + esc(base(l) || l) + '</span><span>ver cubo ›</span></div>').join('') || '<div class="note">Ninguna de las carpetas abiertas.</div>') + '</div>'
    + '<h2 class="sub">Procesos</h2><div class="list">' + (p.pids || [p.pid]).slice(0, 12).map(x => '<div data-pid="' + x + '" style="cursor:pointer"><span>PID ' + x + '</span><span>ver en Sistema ›</span></div>').join('') + '</div>'
    + '<div class="note" style="margin-top:10px">Solo lectura: vxtop observa este programa; no lo controla. La velocidad de red por programa no se mide (requiere el rastreo de eventos del sistema).</div>';
  el.querySelectorAll('[data-k]').forEach(d => d.onclick = () => { const c = S.cubes.get(d.dataset.k); if (c) select(c, true); });
  el.querySelectorAll('[data-pid]').forEach(d => d.onclick = () => jumpToProc(+d.dataset.pid));
}
function jumpToProc(pid) { setView('sistema'); let tries = 0; const go = () => { const nd = G.nodes.get(String(pid)); if (nd) { selectNode(nd); flyTo(nd.pos, 14); } else if (tries++ < 10) setTimeout(go, 500); }; setTimeout(go, 400); }

