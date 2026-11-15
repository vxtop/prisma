// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// 3D interaction: analytic picking (no mesh raycasting) of files, cubes and processes, and click handling.
// === 3D Interaction (analytic picking, no mesh raycast) ===
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), box = new THREE.Box3(), bmin = new THREE.Vector3(), bmax = new THREE.Vector3();
let down = null, drag = null, pendingMove = null;
const aim = e => { mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera); };
function pickCube() {
  let best = null, bd = Infinity;
  for (const c of S.order) { if (c.vis === false) continue; const h = 1.5 * c.s * (1 + .9 * c.ex) + .05; box.set(bmin.copy(c.pos).subScalar(h), bmax.copy(c.pos).addScalar(h)); if (!ray.ray.intersectBox(box, hit)) continue;
    for (let i = 0; i < 27; i++) { if (sliceOut(i)) continue; cellWorld(c, i, v1); const r = .46 * c.s; box.set(bmin.copy(v1).subScalar(r), bmax.copy(v1).addScalar(r));
      if (ray.ray.intersectBox(box, hit)) { const d = hit.distanceToSquared(ray.ray.origin); if (d < bd) { bd = d; best = { c, idx: i, d }; } } } }
  return best;
}
// unified picking: objects (files), cubes and, in the System view, processes
function pick(e) {
  aim(e);
  if (VW.o) { const h = ray.intersectObject(VW.o.model || VW.o.mesh, true)[0]; return h ? { o: VW.o } : null; }
  if (VIEW.cur === 'sistema') { const n = sysPick(e.clientX, e.clientY); return n ? { node: n } : null; }
  if (VIEW.cur === 'tareas') { const it = taskPick(e.clientX, e.clientY); return it ? { task: it } : null; }
  if (VIEW.cur === 'arbol') { const n = trPick(); return n ? { tn: n } : null; }
  const oh = ray.intersectObjects(OB.list.map(o => o.mesh), false)[0], cb = pickCube();
  if (oh && (!cb || oh.distance * oh.distance < cb.d)) return { o: OB.list.find(o => o.mesh === oh.object) };
  return cb;
}
canvas.addEventListener('pointerleave', () => { $('#tip').style.display = 'none'; setHover(null); });
addEventListener('pointerup', () => { S.ptr = false; }, true); // while dragging the camera, don't follow the selection
canvas.addEventListener('pointerdown', e => { S.ptr = true; $('#tip').style.display = 'none'; S.autoFit = false; down = [e.clientX, e.clientY, e.button]; if (performance.now() - (S.selT || 0) > 450) { focusing = false; focusDir = null; } /* the second click of a habitual double click does not interrupt framing */ if (S.follow) { S.follow = false; renderTop(); }
  if (e.shiftKey && e.button === 0) { const m = pick(e); if (m && m.c) { drag = m.c; m.c.off.set(0, 0, 0); controls.enabled = false; canvas.setPointerCapture(e.pointerId); } } });
canvas.addEventListener('pointermove', e => { pendingMove = e; });
function setHover(h) {
  const prev = S.hover; S.hover = h && h.c ? h : null; G.hover = h && h.node ? h.node : null; TKS.hover = h && h.task ? h.task : null; OB.hover = h && h.o ? h.o : null; const th = h && h.tn ? h.tn : null; if (th !== TR.hover) { TR.hover = th; TR.dirtyCol = true; }
  if ((prev && prev.c) !== (S.hover && S.hover.c) || (prev && prev.idx) !== (S.hover && S.hover.idx)) { if (prev) { prev.c.cellDirty = true; prev.c.last[0] = NaN; } if (S.hover) { S.hover.c.cellDirty = true; S.hover.c.last[0] = NaN; } }
}
function handleMove() {
  const e = pendingMove; if (!e) return; pendingMove = null; const tip = $('#tip');
  if (drag) { aim(e); if (ray.ray.intersectPlane(ground, hit)) { drag.manual = (drag.manual || new THREE.Vector3()).copy(hit); drag.off.set(0, 0, 0); } tip.style.display = 'none'; return; }
  const busy = e.buttons || ctxEl.style.display === 'block', lph = busy ? null : pickLP(e.clientX, e.clientY); S.lpHover = lph; const h = busy || lph ? null : pick(e); setHover(h); let html = '';
  if (lph) { const p = lph.p; html = `<b>${esc(p.win || p.name)}</b><br><span style="color:var(--dim)">${p.name}${p.io ? ' · disco ' + fmtB(p.io) + '/s' : ''}${p.gpu ? ' · GPU ' + p.gpu + ' %' : ''}</span><br><span style="color:var(--dim)">${fmtB(p.ws)} · ${(p.cpu / ((S.sys && S.sys.cpu.length) || 1)).toFixed(1)} % CPU${p.n > 1 ? ' · ' + p.n + ' procesos' : ''} · ${(p.links || []).length} carpetas</span>`; }
  if (h && h.c) { const { c, idx } = h, cd = c.data && c.data.cells[idx]; html = `<b>${esc(c.name)}</b> <span style="color:var(--dim)">› celda</span><br>${esc(cellName(idx))}<br><span style="color:var(--dim)">${cd ? fmtN(cd.files) + ' archivos · ' + fmtB(cd.bytes) : '…'}</span>`; }
  else if (h && h.o) { const i = h.o.info; html = `<b>${esc(i.name)}</b><br><span style="color:var(--dim)">${KIND_TXT[i.kind] || i.kind} · ${fmtB(i.size)}</span>`; }
  else if (h && h.node) html = nodeTip(h.node);
  else if (h && h.tn) html = trTip(h.tn);
  else if (h && h.task) { const it = h.task; html = `<b>${esc(it.label)}</b><br><span style="color:var(--dim)">${esc(it.kind === 'perf' ? it.fmt(it.val()) : it.sub)}</span>`; }
  if (html) { tip.innerHTML = html + '<br><span style="color:rgba(255,255,255,.3)">clic · clic derecho</span>'; tip.style.display = 'block'; tip.style.left = Math.min(e.clientX + 14, innerWidth - 300) + 'px'; tip.style.top = e.clientY + 14 + 'px'; canvas.style.cursor = 'pointer'; }
  else { tip.style.display = 'none'; canvas.style.cursor = ''; }
}
canvas.addEventListener('pointerup', e => {
  if (drag) { drag = null; controls.enabled = true; return; }
  if (!down || e.button !== 0 || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  if (performance.now() - (S.selT || 0) < 450) return; S.selT = performance.now(); // a habitual double click does not deselect: the second click is ignored
  // a single click does everything: select, center and open or expand
  const lp = pickLP(e.clientX, e.clientY); if (lp) { selectLP(lp); const c0 = new THREE.Vector3(lp.base.x, LPB + lp.h / 2, lp.base.z), lk = (lp.p.links || []).map(l => S.cubes.get(K(l))).filter(Boolean).slice(0, 4).map(c => c.pos.clone());
    return focusOn([c0.clone().addScalar(2.5), c0.clone().subScalar(2.5), ...lk], .5, 10, false, c0); } // the program in the center, the folders it uses around it
  const m = pick(e); if (!m) return deselect();
  if (m.node) { const n = m.node.n; if (n.kind === 'group-root') { const k = String(n.pid); G.open.has(k) ? G.open.delete(k) : G.open.add(k); pollSystem(); } else if (n.kind === 'group') { G.openG.add(String(n.pid)); feed('despliega', '#8a9399', n.name + ' ×' + n.count); pollSystem(); }
    selectNode(m.node); const nb = [m.node.pos.clone()]; for (const [a, b] of G.edges) { const o = a === m.node.id ? G.nodes.get(b) : b === m.node.id ? G.nodes.get(a) : null; if (o && nb.length < 12) nb.push(o.pos.clone()); }
    return focusOn(nb.length > 1 ? nb : [m.node.pos.clone().addScalar(4), m.node.pos.clone().subScalar(4)], .55, 16, false, m.node.pos.clone()); }
  if (m.tn) { trToggle(m.tn); return trSelect(m.tn); } // tree folder: expand or collapse immediately
  if (m.task) { selectTask(m.task); const z = TKS.zones.find(q => q.k === m.task.zone); return focusOn(z ? [new THREE.Vector3(z.c.x - ZW / 2, 0, z.c.z - ZD / 2), new THREE.Vector3(z.c.x + ZW / 2, 4, z.c.z + ZD / 2)] : [new THREE.Vector3(m.task.x, 0, m.task.z)], .7, 18, false, new THREE.Vector3(m.task.x, 0, m.task.z)); }
  if (m.o) { selectObj(m.o, false); return enterViewer(m.o); } // a file opens in the viewer
  const c = m.c;
  if (e.ctrlKey || e.metaKey) return toggleMulti(c);
  if (S.multi.size) { S.multi.clear(); renderCubes(); }
  if (c !== S.sel || S.mode !== 'cube') { c.cell = null; select(c, false); S.peek = c.key; layout(); focusOn(cubeBox(c), .62, 9, true); } // center the cube and expand its subfolders around it
  else { c.cell = c.cell === m.idx ? null : m.idx; c.cellDirty = true; S.tab = 'celda'; renderPanel(); } // second click on the same cube: that cell
});
canvas.addEventListener('dblclick', e => e.preventDefault()); // no double click: everything is done with a single click
canvas.addEventListener('contextmenu', e => {
  e.preventDefault(); if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const lpc = pickLP(e.clientX, e.clientY); if (lpc) return menu(e.clientX, e.clientY, lpMenu(lpc)); const m = pick(e); if (!m) return;
  if (m.node) return menu(e.clientX, e.clientY, nodeMenu(m.node));
  if (m.tn) { trSelect(m.tn); return menu(e.clientX, e.clientY, trMenu(m.tn)); }
  if (m.task) return menu(e.clientX, e.clientY, taskMenu(m.task));
  if (m.o) return menu(e.clientX, e.clientY, objMenu(m.o));
  const c = m.c, files = c.data ? c.data.cells[m.idx].top : [];
  menu(e.clientX, e.clientY, [[`Seleccionar ${c.name}`, () => select(c, true)], [S.exploded && S.sel === c ? 'Recoger celdas' : 'Explotar celdas', () => { select(c, false); toggleEx(); }],
    ['Ver esta celda', () => { select(c, false); c.cell = m.idx; S.tab = 'celda'; renderPanel(); }, cellName(m.idx)],
    ...(files.length ? [['Abrir su archivo más reciente', () => openObject(c.path + SEP(c.path) + files[0].rel), base(files[0].rel)]] : []), '-',
    ['Ver en árbol (como tree)', () => trOpen(c.path), 'A'], ['Desplegar 1 nivel', () => openDeep(c.path, 1)], ['Desplegar 2 niveles', () => openDeep(c.path, 2)], ['Desplegar 3 niveles', () => openDeep(c.path, 3)],
    ...(c.data && c.data.preset && c.data.preset.keyFiles.length ? [['Abrir archivos clave', () => presetOpen(c, 'key'), c.data.preset.types[0][1]]] : []), ...(c.data && c.data.preset && c.data.preset.media ? [['Abrir galería de medios', () => presetOpen(c, 'media')]] : []),
    ['Explorar esta carpeta', () => { setLeft('explorer'); exGo(c.path); }], ['Indexar (carga completa)', () => startIx(c.path)], '-',
    ['Copiar ruta', () => copy(c.path)], ['Cerrar cubo', () => post('/api/close', { path: c.path }).catch(() => {})]]);
});
addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key.toLowerCase();
  if (k === 'escape') { hideMenu(); $('#tip').style.display = 'none'; toggleHelp(false); if (S.slice) return setSlice(null); if (S.multi.size) { S.multi.clear(); renderPanel(); renderCubes(); return; } if (VIEW.cur === 'espacio' && leaveLevel()) return; deselect(); return; }
  if (k === 'v') return setView(VIEW.cur === 'espacio' ? 'sistema' : 'espacio');
  if (k === 't') return setView(VIEW.cur === 'tareas' ? 'espacio' : 'tareas');
  if (k === 'a') return setView(VIEW.cur === 'arbol' ? 'espacio' : 'arbol');
  if (VIEW.cur === 'arbol' && TR.sel) { if (k === 'enter') return trToggle(TR.sel); if (k === 'f') return flyTo(TR.sel.pos.clone(), 8 + TR.sel.s * 7); }
  if (k === 'h') return fitAll(); if (e.key === '?') return toggleHelp();
  if (!VW.o && /^Arrow/.test(e.key)) { e.preventDefault(); const dist = camera.position.distanceTo(controls.target), fw = v2.subVectors(controls.target, camera.position).setY(0).normalize(), rt = v3.crossVectors(fw, camera.up).normalize(), st = dist * (e.shiftKey ? .3 : .12);
    const mv = e.key === 'ArrowUp' ? fw.multiplyScalar(st) : e.key === 'ArrowDown' ? fw.multiplyScalar(-st) : e.key === 'ArrowLeft' ? rt.multiplyScalar(-st) : rt.multiplyScalar(st);
    focusT.copy(controls.target).add(mv); focusD = dist; focusDir = null; focusing = true; return; }
  if (!VW.o && (e.key === '+' || e.key === '-' || e.key === '=')) { const dist = camera.position.distanceTo(controls.target); focusT.copy(controls.target); focusDir = null; focusD = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist * (e.key === '-' ? 1.3 : .77))); focusing = true; return; }
  if (k === ' ') { e.preventDefault(); return toggleFollow(); }
  if (k === 'enter' && S.mode === 'obj' && OB.sel) return enterViewer(OB.sel);
  if (VIEW.cur !== 'espacio') return;
  if (k === 'e') toggleEx(); else if (k === 'f' && S.sel) { const c = S.sel, h = 1.6 * c.s * (1 + .9 * Math.max(c.ex, S.exploded ? 1 : OPEN_EX)); const r = fitPts([c.pos.clone().addScalar(h), c.pos.clone().subScalar(h)], .7); focusT.copy(c.pos); focusing = true; focusDir = r.dir; focusD = r.d; focusSel = true; }
  else if (k === 'x' || k === 'y' || k === 'z') setSlice('xyz'.indexOf(k));
  else if (k === ' ') { e.preventDefault(); toggleFollow(); }
  else if (k === 'tab') { e.preventDefault(); const o = S.order; if (o.length) select(o[(o.indexOf(S.sel) + (e.shiftKey ? o.length - 1 : 1)) % o.length], true); }
  else if ('1234'.includes(k)) setLayout(['cluster', 'stack', 'grid', 'orbit'][+k - 1]);
});

