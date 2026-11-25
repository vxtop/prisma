// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// File objects: each file rendered with the view for its type.
// === Objects ===
const OB = { list: [], sel: null, hover: null, id: 0, dying: [] };
const objGeo = new THREE.PlaneGeometry(1, 1), tabGeo = new RoundedBoxGeometry(1, 1, .08, 2, .025), spineGeo = new THREE.BoxGeometry(.006, 1.04, .1);
const olGeo = new THREE.BufferGeometry(); olGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 6), 3));
const objLines = new THREE.LineSegments(olGeo, new THREE.LineBasicMaterial({ color: 0x8fa3a8, transparent: true, opacity: .35, depthWrite: false })); objLines.frustumCulled = false; scene.add(objLines);
async function openObject(p, focus = true) {
  let o = OB.list.find(x => K(x.path) === K(p)); if (o) return selectObj(o, focus);
  let info; try { info = await apiT('/api/file?path=' + encodeURIComponent(p)); } catch (e) { feed('error', '#C52235', e.message); return; }
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 640; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(objGeo, new THREE.MeshBasicMaterial({ map: tex, color: 0xe2e2e2, toneMapped: false, side: THREE.DoubleSide, transparent: true, depthWrite: true })); // just below white so it does not bloom
  const slab = new THREE.Mesh(tabGeo, new THREE.MeshStandardMaterial({ color: GRAPHENE, roughness: .85, metalness: .05 })); slab.position.z = -.05; slab.scale.set(1.04, 1.035, 1); mesh.add(slab);
  const spine = new THREE.Mesh(spineGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(KIND_COL[info.kind] || '#888').multiplyScalar(.9), toneMapped: false })); spine.position.set(-.54, 0, -.03); mesh.add(spine);
  const label = textSprite(1024, 128); label.userData.plate = true; label.material.sizeAttenuation = false; label.material.depthTest = false; label.renderOrder = 5; label.center.set(.5, 1); scene.add(mesh, label);
  const cube = new THREE.Mesh(cellGeo, objCubeMat()), sym = symMesh(); sym.material.map = symTex(fileSym(info), symCol(info.kind)); scene.add(cube, sym); // the file itself: a graphene cube like any other, its symbol on the faces
  mesh.visible = false; // its content shows only when selected (a preview over the cube) or in the viewer
  o = { id: ++OB.id, path: info.path, info, mesh, slab, spine, tex, cv, label, cube, sym, born: performance.now(), aspect: .8, pos: new THREE.Vector3(), s: .01, cs: .01, el: null, scroll: 0, wave: null };
  drawText(label, [[info.name, 44, 'rgba(240,235,221,.95)', 44], [`${KIND_TXT[info.kind] || info.kind} · ${fmtB(info.size)}`, 32, KIND_COL[info.kind] || '#888', 92]]);
  OB.list.push(o); if (OB.list.length > 16) closeObj(OB.list[0]);
  const home = cubeOfPath(o.path); o.pos.copy(home ? home.pos : objAnchor(o, 0, v3)); // born out of the folder that holds it
  layout(); buildPreview(o); selectObj(o, focus); feed('objeto', KIND_COL[info.kind] || '#888', info.name);
}
function closeObj(o, now) {
  if (!now && !o.view) { if (OB.list.includes(o)) { OB.list.splice(OB.list.indexOf(o), 1); OB.dying.push(o); setTimeout(layout, 0); if (OB.sel === o) { OB.sel = null; if (S.mode === 'obj') { S.mode = 'cube'; renderPanel(); } } } return; }
  scene.remove(o.mesh, o.label, o.cube, o.sym); o.mesh.material.dispose(); o.tex.dispose(); o.label.userData.tex.dispose(); o.label.material.dispose(); o.sym.material.dispose(); if (OB.list.includes(o)) setTimeout(layout, 0);
  if (VW.o === o) exitViewer(true); if (o.pdf) o.pdf.destroy(); if (o.audio) o.audio.pause();
  if (o.el) { o.el.pause(); o.el.removeAttribute('src'); o.el.load(); } if (o.model) { scene.remove(o.model); disposeTree(o.model); } if (OB.list.includes(o)) OB.list.splice(OB.list.indexOf(o), 1);
  if (OB.sel === o) { OB.sel = null; if (S.mode === 'obj') { S.mode = 'cube'; renderPanel(); } }
}
function cubeOfPath(p) { let best = null; const a = K(p); for (const c of S.cubes.values()) if (c.vis !== false && under(a, c.key) && (!best || c.key.length > best.key.length)) best = c; return best; } // the deepest cube you can see
// Files sit on a ring around the folder cube that holds them, all at the same height and the same size as it
const OBJ_E = 1; // edge of a file cube: one thing, one cube (a cell-sized body next to the cubes of 27)
function objRing(c) { const n = OB.list.filter(x => cubeOfPath(x.path) === c).length; return Math.max(1.46 * c.s + OBJ_E * 1.9, n * (OBJ_E + 1.05) / (2 * Math.PI)); }
function objRingExt(c) { return OB.list.some(x => cubeOfPath(x.path) === c) ? objRing(c) + OBJ_E * .7 : 0; }
function objAnchor(o, i, out) {
  const c = cubeOfPath(o.path);
  if (c) { const sib = OB.list.filter(x => cubeOfPath(x.path) === c), j = sib.indexOf(o), n = sib.length, R = objRing(c), a = j / n * Math.PI * 2 + Math.PI / 2;
    return out.set(c.pos.x + Math.cos(a) * R, c.pos.y, c.pos.z + Math.sin(a) * R); }
  const free = OB.list.filter(x => !cubeOfPath(x.path)), j = free.indexOf(o), n = free.length; return out.set((j - (n - 1) / 2) * (OBJ_E + 1.5), 0, 9);
}
function buildPreview(o) {
  const i = o.info;
  if (i.kind === 'image' && i.mime) { drawCard(o); new THREE.TextureLoader().load(rawURL(i.path), t => { if (!OB.list.includes(o)) return t.dispose(); t.colorSpace = THREE.SRGBColorSpace; o.mesh.material.map = t; o.mesh.material.needsUpdate = true; o.tex.dispose(); o.tex = t; o.aspect = t.image.width / t.image.height || 1; i.dims = `${t.image.width}×${t.image.height}`; if (OB.sel === o) renderPanel(); }, undefined, () => {}); return; }
  if (i.kind === 'model3d' && /^(glb|gltf|obj|stl|fbx)$/.test(i.ext)) { drawCard(o); loadModel(o).catch(e => feed('error', '#C52235', 'modelo 3D: ' + e.message)); return; }
  if (i.ext === 'pdf') { drawCard(o); loadPdf(o).catch(e => feed('error', '#C52235', 'PDF: ' + e.message)); return; }
  if (i.kind === 'video') { const v = document.createElement('video'); v.onerror = () => { new THREE.TextureLoader().load('/api/thumb?t=' + TK() + '&path=' + encodeURIComponent(i.path), t => { if (!OB.list.includes(o)) return t.dispose(); t.colorSpace = THREE.SRGBColorSpace; o.mesh.material.map = t; o.mesh.material.needsUpdate = true; o.aspect = t.image.width / t.image.height || 1.7; i.dims = 'fotograma (formato no reproducible en el navegador)'; }, undefined, () => drawCard(o)); }; v.src = rawURL(i.path); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.onloadedmetadata = () => { o.aspect = v.videoWidth / v.videoHeight || 1.7; i.dims = `${v.videoWidth}×${v.videoHeight} · ${v.duration.toFixed(1)} s`; v.play().catch(() => {}); if (OB.sel === o) renderPanel(); };
    const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; o.mesh.material.map = t; o.mesh.material.needsUpdate = true; o.tex.dispose(); o.tex = t; o.el = v; o.aspect = 1.7; return; }
  if (i.kind === 'audio' && i.size < 60e6) { drawCard(o); fetch(rawURL(i.path)).then(r => r.arrayBuffer()).then(b => { const ac = new (window.AudioContext || window.webkitAudioContext)(); return ac.decodeAudioData(b).finally(() => ac.close()); }).then(buf => {
      const ch = buf.getChannelData(0), N = 400, step = Math.max(1, ch.length / N | 0), pk = new Float32Array(N); for (let k = 0; k < N; k++) { let m = 0; for (let j = k * step; j < Math.min(ch.length, (k + 1) * step); j += 8) m = Math.max(m, Math.abs(ch[j])); pk[k] = m; }
      o.wave = pk; i.dims = `${buf.duration.toFixed(1)} s · ${buf.sampleRate} Hz · ${buf.numberOfChannels} canal${buf.numberOfChannels > 1 ? 'es' : ''}`; drawCard(o); if (OB.sel === o) renderPanel(); }).catch(() => {}); return; }
  if (i.kind === 'font') { const fam = 'simobj' + o.id; new FontFace(fam, `url("${rawURL(i.path).replace(/[()'"]/g, c => '%' + c.charCodeAt(0).toString(16))}")`).load().then(f => { document.fonts.add(f); o.font = fam; drawCard(o); if (OB.sel === o) renderPanel(); }).catch(() => {}); }
  drawCard(o);
}
const KW = /^(function|const|let|var|return|if|else|for|while|do|import|from|export|default|class|extends|def|async|await|new|try|catch|finally|throw|switch|case|break|continue|in|of|typeof|null|true|false|None|True|False|self|this|public|private|static|void|int|string|struct|fn|pub|use|mod|impl|match|package|interface|type|enum|lambda|yield|with|as|elif|pass|not|and|or)$/;
function tokLine(g, line, x, y, maxW) {
  const parts = line.split(/(\/\/.*$|#(?![\w-]*[;{]).*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\b\w+\b)/);
  for (const p of parts) { if (!p) continue; if (x > maxW) break;
    g.fillStyle = /^(\/\/|#)/.test(p) ? 'rgba(150,160,168,.8)' : /^["'`]/.test(p) ? '#7cc4bd' : KW.test(p) ? '#D97757' : /^\d/.test(p) ? '#b9a0d6' : 'rgba(222,228,232,.86)';
    g.fillText(p, x, y); x += g.measureText(p).width; }
}
function drawCard(o) {
  const i = o.info, cv = o.cv, g = cv.getContext('2d'), W = cv.width, H = cv.height, col = KIND_COL[i.kind] || '#888';
  g.fillStyle = '#0f1216'; g.fillRect(0, 0, W, H); g.fillStyle = col; g.fillRect(0, 0, W, 3);
  g.font = '600 15px "Segoe UI",sans-serif'; g.fillStyle = rgba(col, .9); g.fillText((KIND_TXT[i.kind] || i.kind).toUpperCase() + (i.ext ? ' · .' + i.ext : ''), 16, 26);
  g.fillStyle = 'rgba(160,170,176,.6)'; g.textAlign = 'right'; g.fillText(fmtB(i.size) + (i.lines ? ' · ' + i.lines + ' líneas' : ''), W - 16, 26); g.textAlign = 'left';
  const top = 44;
  if (i.text != null && !i.table && !i.json) { g.font = '12px "Cascadia Code",Consolas,monospace'; const ls = i.text.split('\n'), nl = Math.floor((H - top - 8) / 15);
    ls.slice(0, nl).forEach((l, k) => { g.fillStyle = 'rgba(120,130,136,.4)'; g.fillText(String(k + 1).padStart(3), 8, top + 12 + k * 15); tokLine(g, l.replace(/\t/g, '  ').slice(0, 90), 40, top + 12 + k * 15, W - 8); }); }
  else if (i.table) { const rows = i.table.slice(0, 30), cols = Math.min(6, Math.max(...rows.map(r => r.length))), cw = (W - 24) / cols; g.font = '11px "Cascadia Code",Consolas,monospace';
    rows.forEach((r, k) => { if (k === 0) { g.fillStyle = rgba(col, .15); g.fillRect(8, top, W - 16, 18); } for (let c = 0; c < cols; c++) { g.fillStyle = k ? 'rgba(222,228,232,.8)' : rgba(col, 1); g.fillText(String(r[c] ?? '').slice(0, Math.floor(cw / 7) - 1), 12 + c * cw, top + 13 + k * 19); } g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(8, top + 18 + k * 19, W - 16, 1); }); }
  else if (i.json) { g.font = '12px "Cascadia Code",Consolas,monospace'; i.json.slice(0, 34).forEach(([k, v], j) => { g.fillStyle = '#a9c6ea'; g.fillText(k.slice(0, 22), 14, top + 14 + j * 16); g.fillStyle = 'rgba(200,208,212,.7)'; g.fillText(v.slice(0, 48), 190, top + 14 + j * 16); }); }
  else if (o.wave) { const N = o.wave.length, mid = H / 2 + 10; g.fillStyle = rgba(col, .9); for (let k = 0; k < N; k++) { const h = o.wave[k] * (H * .36); g.fillRect(16 + k * (W - 32) / N, mid - h, Math.max(1, (W - 32) / N - .6), h * 2); } }
  else if (o.font) { g.fillStyle = 'rgba(240,235,221,.9)'; [64, 40, 26, 18].forEach((s, k) => { g.font = `${s}px ${o.font}`; g.fillText(k ? 'Aa Bb Cc 0123 ñ á' : 'Aa Gg Ññ', 18, top + 70 + k * 80); }); }
  else if (i.hex) { g.font = '12px "Cascadia Code",Consolas,monospace'; const by = i.hex.match(/../g) || [];
    for (let r = 0; r < Math.min(30, Math.ceil(by.length / 12)); r++) { const row = by.slice(r * 12, r * 12 + 12); g.fillStyle = 'rgba(120,130,136,.45)'; g.fillText((r * 12).toString(16).padStart(4, '0'), 10, top + 14 + r * 17);
      g.fillStyle = 'rgba(210,216,220,.8)'; g.fillText(row.join(' '), 56, top + 14 + r * 17); g.fillStyle = rgba(col, .8); g.fillText(row.map(h => { const c = parseInt(h, 16); return c > 31 && c < 127 ? String.fromCharCode(c) : '·'; }).join(''), 390, top + 14 + r * 17); } }
  else { g.font = '600 46px "Segoe UI",sans-serif'; g.fillStyle = rgba(col, .85); g.fillText('.' + (i.ext || '?'), 24, H / 2); }
  if (i.magic) { g.font = '12px "Segoe UI",sans-serif'; g.fillStyle = 'rgba(160,170,176,.7)'; g.fillText('firma: ' + i.magic, 16, H - 12); }
  o.tex.needsUpdate = true;
}
function stepObjects(dt) {
  const k = 1 - Math.pow(.002, dt), now = performance.now();
  for (const o of [...OB.dying]) { o.cs *= Math.pow(.004, dt); o.s *= Math.pow(.004, dt); o.mesh.scale.multiplyScalar(Math.pow(.004, dt)); o.cube.scale.setScalar(o.cs * OBJ_E); o.sym.scale.setScalar(o.cs * OBJ_E); o.label.material.opacity = Math.max(0, o.label.material.opacity - dt * 3); if (o.cs < .03) { OB.dying.splice(OB.dying.indexOf(o), 1); closeObj(o, true); } }
  const space = VIEW.cur === 'espacio' && !S.enter && !S.enterLP;
  OB.list.forEach((o, i) => { const sel = o === OB.sel, hov = o === OB.hover, other = VW.o && VW.o !== o;
    objAnchor(o, i, v2); o.pos.lerp(v2, k);
    // the cube: same size as a folder cube, a touch bigger under the cursor; hidden while it is open in the viewer, and while another one is
    const cs = o.view || other || !space ? .001 : hov || sel ? 1.04 : 1; o.cs += (cs - o.cs) * k;
    o.cube.position.copy(o.pos); o.cube.scale.setScalar(o.cs * OBJ_E); o.sym.position.copy(o.pos); o.sym.scale.setScalar(o.cs * OBJ_E); o.cube.visible = o.sym.visible = o.cs > .02;
    const dim = (OB.sel && !sel) || (!OB.sel && S.sel && cubeOfPath(o.path) !== S.sel); o.sym.material.opacity = dim ? .3 : 1; o.sym.material.color.setScalar(sel ? 1.5 + .25 * Math.sin(now / 260) : hov ? 1.15 : .74); // focus: what is unrelated to the selection fades
    // its content: a preview floating over the cube when selected, full size in the viewer
    const show = o.view || (sel && space && !VW.o), h = o.view ? 4 : show ? 2.4 : .01; o.s += (h - o.s) * k;
    const w = o.view ? o.s * o.aspect : Math.min(4.2, o.s * o.aspect), hh = w / o.aspect, top = o.view ? o.pos.y : o.pos.y + OBJ_E * 1.05 + .5 + hh / 2; // above the radial ring
    o.mesh.visible = show || o.s > .05; o.mesh.position.set(o.pos.x, top, o.pos.z); o.mesh.scale.set(w, hh, 1); o.mesh.quaternion.copy(camera.quaternion);
    if (o.model) { o.model.visible = o.view || (sel && space && !VW.o); o.model.position.set(o.pos.x, o.view ? o.pos.y : top, o.pos.z); if (!o.view && !o.spun) o.model.rotation.y += dt * .35;
      o.model.scale.setScalar(o.model.scale.x + ((o.view ? 1.05 : 1) * o.model.userData.k0 - o.model.scale.x) * k || o.model.scale.x); }
    if (o.el) { const play = show; if (play && o.el.paused && !o.userPaused) o.el.play().catch(() => {}); else if (!play && !o.el.paused && !o.view) o.el.pause(); }
    o.slab.visible = !o.model; o.spine.visible = !o.model && !o.view; /* a model floats on its own, with no card behind it */ o.spine.material.color.set(KIND_COL[o.info.kind] || '#888').multiplyScalar(.8); o.slab.material.color.copy(GRAPHENE).multiplyScalar(o.view ? .5 : 1.1);
    o.label.position.set(o.pos.x, o.pos.y - OBJ_E / 2 - .2, o.pos.z); o.label.scale.set(pxScale(sel || hov ? 40 : 32) * 8, pxScale(sel || hov ? 40 : 32), 1); o.label.visible = o.labelOn !== false && o.cs > .3 && (!!SET.labels || sel || hov) && (!dim || hov); });
  objLines.visible = false; // links are drawn by stepLinks, one style per meaning
}
function selectObj(o, focus) { OB.sel = o; S.mode = 'obj'; S.tabs.obj = S.tabs.obj || 'vista'; if (focus) { const p = objAnchor(o, 0, new THREE.Vector3()); focusOn([p.clone().add(new THREE.Vector3(-2.6, -1.6, -2.6)), p.clone().add(new THREE.Vector3(2.6, 6.2, 2.6))], .55, 10, false); } /* the cube and its preview */ renderPanel(); }
function objMenu(o) { return [['Abrir en el visor', () => enterViewer(o)], ['Seleccionar', () => selectObj(o, false)], ['Enfocar', () => selectObj(o, true)], ...(o.el ? [[o.el.paused ? 'Reproducir' : 'Pausar', () => o.el.paused ? o.el.play() : o.el.pause()]] : []),
  ['Explorar su carpeta', () => { setLeft('explorer'); exGo(o.path.replace(/[\\/][^\\/]*$/, '')); }], ['Abrir su carpeta como cubo', () => post('/api/open', { path: o.path.replace(/[\\/][^\\/]*$/, '') }).catch(() => {})], '-', ['Copiar ruta', () => copy(o.path)], ['Cerrar objeto', () => closeObj(o)]]; }

