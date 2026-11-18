// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// System view: applications, terminals, processes and network as a graph,
// plus the shared label decluttering.
// === System View ===
const G = { openG: new Set(), open: new Set(), fitted: false, nodes: new Map(), edges: [], data: null, sel: null, hover: null, polling: false };
const egGeo = new THREE.BufferGeometry(); egGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4000 * 6), 3).setUsage(THREE.DynamicDrawUsage)); egGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(4000 * 6), 3).setUsage(THREE.DynamicDrawUsage));
const sysEdges = new THREE.LineSegments(egGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .9, depthWrite: false, toneMapped: false })); sysEdges.frustumCulled = false; scene.add(sysEdges);
const SCREENS = new Map(), GRAPHITE = new THREE.Color('#252B35');
function procCat(name, kind) { const n = String(name || '').toLowerCase();
  if (kind === 'claude' || /claude|copilot|cursor|chatgpt|ollama|codex/.test(n)) return ['ia', '#D97757'];
  if (/^(cmd|powershell|pwsh|bash|sh|zsh|wsl|conhost|openconsole|windowsterminal|termius|wezterm)/.test(n)) return ['term', '#AEB9C5'];
  if (/chrome|msedge|firefox|brave|opera|vivaldi/.test(n)) return ['web', '#269B65'];
  if (/^(node|python|java|dotnet|deno|bun|ruby|php|uv|uvx)/.test(n)) return ['run', '#269B65'];
  if (/league|riot|steam|epic|game|blitz|valorant|battle/.test(n)) return ['game', '#E6B844'];
  if (/svchost|services|lsass|csrss|wininit|winlogon|dwm|msmpeng|system|wmi|spool|search|runtimebroker|dllhost|sihost|ctfmon|fontdrv|registry|smss|audiodg|nvidia|nv/.test(n)) return ['sys', '#8b95a3'];
  return ['app', '#1768B5']; }
function glyph(g, cat, col) { // hand-drawn glyphs on a 128×128 canvas
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  if (cat === 'term') { g.moveTo(38, 48); g.lineTo(58, 64); g.lineTo(38, 80); g.moveTo(66, 84); g.lineTo(92, 84); }
  else if (cat === 'web') { g.arc(64, 64, 28, 0, 7); g.moveTo(36, 64); g.lineTo(92, 64); g.moveTo(64, 36); g.bezierCurveTo(48, 50, 48, 78, 64, 92); g.moveTo(64, 36); g.bezierCurveTo(80, 50, 80, 78, 64, 92); }
  else if (cat === 'ia') { for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10); g.lineTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30); } }
  else if (cat === 'run') { for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; i ? g.lineTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28) : g.moveTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28); } }
  else if (cat === 'game') { g.roundRect(32, 48, 64, 34, 14); g.moveTo(46, 65); g.lineTo(58, 65); g.moveTo(52, 59); g.lineTo(52, 71); g.moveTo(76, 61); g.arc(76, 61, 1, 0, 7); g.moveTo(84, 69); g.arc(84, 69, 1, 0, 7); }
  else if (cat === 'sys') { g.arc(64, 64, 13, 0, 7); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20); g.lineTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30); } }
  else { g.roundRect(34, 38, 60, 52, 6); g.moveTo(34, 52); g.lineTo(94, 52); }
  g.stroke(); }
function screenFor(n) { // real system icon on a dark screen; falls back to the category glyph
  const ip = n.exe || (/\.exe$/i.test(n.name || '') ? n.name : null), key = (ip ? K(ip) : 'g:' + n.name) + '|' + (n.kind || ''); if (SCREENS.has(key)) return SCREENS.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const [cat, col] = procCat(n.name, n.kind), base = () => { g.clearRect(0, 0, 128, 128); g.fillStyle = '#0a0e11'; g.beginPath(); g.roundRect(4, 4, 120, 120, 18); g.fill(); g.strokeStyle = rgba(col, .55); g.lineWidth = 3; g.stroke(); };
  base(); glyph(g, cat, col); tex.needsUpdate = true; SCREENS.set(key, tex);
  if (ip && (!S.platform || S.platform === 'win32')) { const im = new Image(); im.onload = () => { base(); g.imageSmoothingQuality = 'high'; g.drawImage(im, 24, 24, 80, 80); tex.needsUpdate = true; }; im.src = iconURL(ip); }
  return tex; }
const NODE_COL = { claude: '#D97757', 'claude-app': '#D97757', editor: '#4f8fd0', terminal: '#AEB9C5', shell: '#7cc4bd', node: '#269B65', app: '#AEB9C5', proc: '#5b6370', group: '#5b6370', 'group-root': '#1768B5', net: '#1768B5', core: '#F0EBDD' };
const KIND_ES = { claude: 'sesión de Claude Code', 'claude-app': 'Claude (escritorio)', editor: 'editor', terminal: 'terminal', shell: 'intérprete de órdenes', node: 'Node.js', app: 'aplicación', proc: 'proceso', group: 'grupo de procesos', 'group-root': 'servicios', net: 'equipo remoto', core: 'equipo' };
function makeNode(n, id) {
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: n.kind === 'net' || n.kind === 'core' ? glowTex : screenFor(n), color: n.kind === 'net' ? new THREE.Color(.35, 1.1, 1.05) : n.kind === 'core' ? new THREE.Color(2, 2, 2) : 0xffffff, transparent: true, depthWrite: false, toneMapped: n.kind !== 'net' && n.kind !== 'core', blending: n.kind === 'net' || n.kind === 'core' ? THREE.AdditiveBlending : THREE.NormalBlending }));
  scene.add(icon);
  return { id, n, icon, label: null, labelKey: '', pos: SYS.clone(), tgt: SYS.clone(), size: 1, depth: 0, angle: 0, parent: null };
}
function dropNode(nd) { scene.remove(nd.icon); nd.icon.material.dispose(); if (nd.label) { scene.remove(nd.label); nd.label.userData.tex.dispose(); nd.label.material.dispose(); } }
const leaves = n => n.kids && n.kids.length ? n.kids.reduce((s, k) => s + leaves(k), 0) : 1;
const nodeName = n => nodeName0(n);
const nodeName0 = n => n.kind === 'group-root' ? n.name + (n.hidden ? ` (${n.hidden})` : '') : (n.win && n.kind !== 'shell' ? n.win : n.name.replace(/\.exe$/i, '')) + (n.count ? ' ×' + n.count : '');
function layoutSys(data) {
  for (const r of data.roots) if (r.kind === 'group-root' && !G.open.has(String(r.pid)) && r.kids.length) { r.hidden = r.kids.length; r.kids = []; }
  const seen = new Set(), edges = [], roots = data.roots, tot = roots.reduce((s, r) => s + leaves(r) + 1, 0) || 1, R1 = 9 + Math.sqrt(roots.length) * 2.4;
  let core = G.nodes.get('core'); if (!core) { core = makeNode({ name: 'Este equipo', kind: 'core', kids: [], net: [] }, 'core'); G.nodes.set('core', core); } seen.add('core'); core.tgt.copy(SYS); core.size = 1.4;
  const hostOwners = new Map();
  const place = (n, d, a, span, parent) => {
    const id = String(n.pid); seen.add(id); let nd = G.nodes.get(id); if (!nd) { nd = makeNode(n, id); G.nodes.set(id, nd); const p = G.nodes.get(parent); nd.pos.copy(p ? p.pos : SYS); }
    nd.n = n; nd.parent = parent; nd.depth = d; nd.angle = a; const R = R1 + d * 3.3; nd.tgt.set(SYS.x + Math.cos(a) * R, SYS.y - d * 4.2, SYS.z + Math.sin(a) * R);
    nd.size = Math.min(2.2, .55 + .32 * Math.log10(1 + (n.ws || 0) / 4e6)) * (d === 0 ? 1.15 : 1); edges.push([parent, id, n.kind === 'claude' ? 'claude' : d === 0 ? 'root' : 'tree']);
    const L = (n.kids || []).map(leaves), T = L.reduce((s, x) => s + x, 0) || 1; let b = a - span / 2;
    (n.kids || []).forEach((k, i) => { const sp = span * L[i] / T; place(k, d + 1, b + sp / 2, sp, id); b += sp; });
    for (const c of n.net || []) if (c.state === 'establecida') { const h = c.host && c.host !== 'local' ? c.host : c.rip; if (!hostOwners.has(h)) hostOwners.set(h, new Map()); const m = hostOwners.get(h); m.set(id, (m.get(id) || 0) + 1); }
  };
  roots.forEach(r => { const w = (leaves(r) + 1) / tot * Math.PI * 2; place(r, 0, (place.a = (place.a || 0)) + w / 2, w * .9, 'core'); place.a += w; });
  // Claude processes also link to their host terminal
  for (const nd of G.nodes.values()) if (seen.has(nd.id) && nd.n.kind === 'claude' && nd.n.ppid && seen.has(String(nd.n.ppid))) edges.push([String(nd.n.ppid), nd.id, 'host']);
  let hi = 0; const Rn = R1 + 3.3 * 4 + 7;
  for (const [h, owners] of [...hostOwners].slice(0, 140)) {
    const id = 'h:' + h; seen.add(id); let nd = G.nodes.get(id); const first = G.nodes.get([...owners.keys()][0]);
    if (!nd) { nd = makeNode({ name: h, kind: 'net', kids: [], net: [] }, id); G.nodes.set(id, nd); nd.pos.copy(first ? first.pos : SYS); }
    const cnt = [...owners.values()].reduce((s, x) => s + x, 0); nd.n = { name: h, kind: 'net', count: cnt, owners: [...owners.keys()], kids: [], net: [] };
    const a = (first ? first.angle : 0) + ((hi++ % 7) - 3) * .045; nd.tgt.set(SYS.x + Math.cos(a) * Rn, SYS.y + 9 + (hi % 3) * 1.6, SYS.z + Math.sin(a) * Rn); nd.size = .35 + Math.min(.6, cnt * .08);
    for (const [o, c] of owners) edges.push([o, id, 'net', c]);
  }
  for (const [id, nd] of [...G.nodes]) if (!seen.has(id)) { dropNode(nd); G.nodes.delete(id); if (G.sel === nd) G.sel = null; }
  G.edges = edges; place.a = 0; let maxD = 0; for (const nd of G.nodes.values()) if (nd.n.kind !== 'net' && nd.id !== 'core') maxD = Math.max(maxD, nd.depth); buildGuides(R1, maxD, Rn); renderCubes();
}
async function pollSystem() { if (G.polling) return; G.polling = true; try { G.data = await apiT('/api/system' + (G.openG.size ? '?open=' + [...G.openG].map(encodeURIComponent).join(',') : '')); layoutSys(G.data); if (S.mode === 'proc' && S.tabs.proc !== 'seguir') renderPanel(); if (!G.fitted && VIEW.cur === 'sistema') { G.fitted = true; setTimeout(fitAll, 400); } } catch {} G.polling = false; }
setInterval(() => { if (VIEW.cur === 'sistema') pollSystem(); }, 5000);
const EC = { root: [.08, .12, .13], tree: [.15, .19, .21], claude: [.7, .45, .14], host: [.6, .4, .12], net: [.05, .2, .19] };
let declAcc = 1;
// places labels by priority and drops those that would overlap on screen (cubes, objects and processes)
function declutterLabels(items, max = 40) {
  const placed = [], L = document.body.classList.contains('viewer') ? 0 : $('#left').offsetWidth + 14, R = innerWidth - ($('#right').style.display === 'flex' && !document.body.classList.contains('viewer') ? $('#right').offsetWidth + 14 : 0);
  items.sort((a, b) => b.pr - a.pr); const T = document.body.classList.contains('viewer') ? 0 : $('#top').offsetHeight + 64, Bm = innerHeight - 58;
  for (const it of items) { it.set(false); if (placed.length >= max) continue; v1.copy(it.pos).project(camera); if (v1.z > 1 || Math.abs(v1.x) > 1.02 || Math.abs(v1.y) > 1.02) continue;
    const x = (v1.x + 1) / 2 * innerWidth, y = (1 - v1.y) / 2 * innerHeight - it.h / 2; if ((it.pr < 1e15 && (x - it.w / 2 < L || x + it.w / 2 > R)) || (it.pr < 1e16 && (y - it.h / 2 < T || y + it.h / 2 > Bm))) continue;
    if (placed.some(r => Math.abs(r[0] - x) < (r[2] + it.w) / 2 + 8 && Math.abs(r[1] - y) < (r[3] + it.h) / 2 + 3)) continue; placed.push([x, y, it.w, it.h]); it.set(true); }
}
let cubeDecl = 0;
function declutterCubes(dt) { cubeDecl += dt; if (cubeDecl < .12) return; cubeDecl = 0;
  declutterLabels([...S.cubes.values()].filter(c => c.vis !== false && !(c.dimF < 1)).map(c => ({ pos: c.label.position, w: (c === S.sel ? 46 : c.depth ? 34 : 40) * 8 * (c.label.userData.tw || .6), h: c === S.sel ? 46 : c.depth ? 34 : 40,
    pr: c === S.sel || (S.hover && S.hover.c === c) ? 1e16 : (c.labelOn ? 5e14 : 0) + (c.depth ? 0 : 1e12) + (c.data ? c.data.totals.bytes : 0), set: v => c.labelOn = v })), 30); }
// label priority: selected, Claude, machine, most RAM, most connections
function declutter() {
  return declutterLabels([...G.nodes.values()].map(nd => { const sel = nd === G.sel || nd === G.hover, lh = sel ? 54 : nd.depth === 0 || nd.n.kind === 'core' ? 46 : 38; /* must match the rendered label height */
    return { pos: nd.label ? nd.label.position : nd.pos, w: lh * 768 / 112 * (nd.label ? nd.label.userData.tw || .6 : .6), h: lh, pr: sel ? 1e16 : nd.n.kind === 'claude' ? 1e15 : nd.n.kind === 'core' ? 1e14 : nd.n.kind === 'net' ? (nd.n.count || 0) * 2e7 : (nd.n.ws || 0) * (nd.depth === 0 ? 4 : 1), set: v => nd.labelOn = v }; }), 26);
}
// guide rings: one per system layer, at its height
const guide = new THREE.Group(); scene.add(guide); let guideKey = '';
function buildGuides(R1, maxD, Rn) {
  const k = R1.toFixed(1) + '|' + maxD + '|' + Rn.toFixed(1); if (k === guideKey) return; guideKey = k;
  guide.children.slice().forEach(o => { guide.remove(o); o.geometry && o.geometry.dispose(); o.material.dispose(); if (o.material.map) o.material.map.dispose(); });
  const ring = (R, y, col, name) => { const pts = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new THREE.Vector3(SYS.x + Math.cos(a) * R, SYS.y + y, SYS.z + Math.sin(a) * R)); }
    guide.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .32, depthWrite: false })));
    const lb = textSprite(512, 64); drawText(lb, [[name, 30, rgba('#8fa3a8', .75), 32]]); lb.position.set(SYS.x, SYS.y + y + .5, SYS.z + R); lb.scale.set(4.4, .55, 1); guide.add(lb); };
  const NAMES = ['aplicaciones', 'procesos', 'subprocesos', 'hilos de trabajo', 'capas profundas', 'capas profundas'];
  for (let d = 0; d <= Math.min(maxD, 5); d++) ring(R1 + d * 3.3, -d * 2.6, d ? 0x1c2a2e : 0x2b4c4f, NAMES[d]);
  ring(Rn, 6, 0x1f4a47, 'red exterior');
}
let sysCells = null; const SYSMAX = 700;
function stepSystem(dt) {
  if (!sysCells) sysCells = cellsOf(SYSMAX * 27);
  if (VIEW.cur !== 'sistema') { sysEdges.visible = false; guide.visible = false; sysCells.visible = false; return; } sysEdges.visible = true; guide.visible = true; sysCells.visible = true;
  const SA = sysCells.instanceMatrix.array, SC = sysCells.instanceColor.array; let sn = 0, scol = new THREE.Color();
  declAcc += dt; if (declAcc > .15) { declAcc = 0; declutter(); }
  const k = 1 - Math.pow(.004, dt);
  for (const nd of G.nodes.values()) {
    nd.pos.lerp(nd.tgt, k); const sel = nd === G.sel, hov = nd === G.hover, s = nd.size * (nd.n.kind === 'net' || nd.n.kind === 'core' ? 1 : SET.icon) * (hov ? 1.15 : 1);
    const isCube = nd.n.kind !== 'net' && nd.n.kind !== 'core', E = s * 1.05 * (.7 + .5 * Math.min(1, Math.sqrt((nd.n.ws || 0) / 2e9))); // edge length: memory
    nd.icon.position.copy(nd.pos); if (isCube) nd.icon.position.y += E * .5 + s * .2; nd.icon.scale.setScalar(s * (nd.n.kind === 'net' ? 1 : isCube ? .36 : .62));
    if (isCube && sn < SYSMAX) { const sp = E / 3, heat = Math.min(1, (nd.n.cpu || 0) / 40), lit = (nd.n.cpu || 0) > .5 ? Math.max(1, Math.round(heat * 27)) : 0, dim = sel ? 1.7 : hov ? 1.35 : 1; scol.set(NODE_COL[nd.n.kind] || '#888');
      { const j = sn, f = Math.min(1.15, .32 + heat * .8); setM(SA, j, nd.pos.x, nd.pos.y, nd.pos.z, E * .97, E * .97, E * .97); // one cube per process: edge = memory, brightness = CPU
        SC[j * 3] = (GRAPHITE.r * (1 - f * .6) + scol.r * f * .6) * dim; SC[j * 3 + 1] = (GRAPHITE.g * (1 - f * .6) + scol.g * f * .6) * dim; SC[j * 3 + 2] = (GRAPHITE.b * (1 - f * .6) + scol.b * f * .6) * dim; } sn++; }
    const want = sel || hov || (SET.labels && nd.labelOn);
    if (want) { const key = nodeName(nd.n) + '|' + (nd.n.kind === 'net' ? nd.n.count : fmtB(nd.n.ws) + nd.n.cpu);
      if (!nd.label) { nd.label = textSprite(768, 112); nd.label.material.sizeAttenuation = false; nd.label.center.set(.5, 0); scene.add(nd.label); }
      if (nd.labelKey !== key) { nd.labelKey = key; drawText(nd.label, [[nodeName(nd.n).slice(0, 48), 38, nd.n.kind === 'claude' ? '#D97757' : 'rgba(240,235,221,.9)', 40], [nd.n.kind === 'net' ? `${nd.n.count} conexión${nd.n.count > 1 ? 'es' : ''}` : nd.n.kind === 'core' ? `${G.data ? G.data.procs : '…'} procesos · ${G.data ? G.data.conns : '…'} conexiones` : `${fmtB(nd.n.ws)} · ${cpuEq(nd.n.cpu)} % CPU${nd.n.net && nd.n.net.length ? ' · ' + nd.n.net.length + ' con.' : ''}`, 31, 'rgba(176,188,196,.85)', 86]]); }
      nd.label.visible = true; nd.label.position.set(nd.pos.x, nd.pos.y + s * .55 + (nd.n.kind !== 'net' && nd.n.kind !== 'core' ? s * .3 : 0), nd.pos.z); const lh = sel || hov ? 54 : nd.depth === 0 || nd.n.kind === 'core' ? 46 : 38; nd.label.scale.set(pxScale(lh) * 768 / 112, pxScale(lh), 1);
    } else if (nd.label) nd.label.visible = false;
  }
  sysCells.count = sn; sysCells.instanceMatrix.needsUpdate = true; sysCells.instanceColor.needsUpdate = true;
  const P = egGeo.attributes.position.array, C = egGeo.attributes.color.array; let m = 0;
  for (const [a, b, kind] of G.edges) { const A = G.nodes.get(a), B = G.nodes.get(b); if (!A || !B || m >= 4000) continue; const c = EC[kind] || EC.tree, on = (G.sel && (G.sel === A || G.sel === B)) || (G.hover && (G.hover === A || G.hover === B)), hl = on ? (kind === 'net' ? 4.5 : 2.4) : kind === 'net' ? .18 : 1; /* network lines stay faint until you point at one of their ends: no hairball */
    P.set([A.pos.x, A.pos.y, A.pos.z, B.pos.x, B.pos.y, B.pos.z], m * 6); C.set([c[0] * hl, c[1] * hl, c[2] * hl, c[0] * hl, c[1] * hl, c[2] * hl], m * 6); m++; }
  egGeo.setDrawRange(0, m * 2); egGeo.attributes.position.needsUpdate = true; egGeo.attributes.color.needsUpdate = true;
}
function sysPick(x, y) {
  let best = null, bd = Infinity; const ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
  for (const nd of G.nodes.values()) { v1.copy(nd.pos).project(camera); if (v1.z > 1) continue; const sx = (v1.x + 1) / 2 * innerWidth, sy = (1 - v1.y) / 2 * innerHeight, dist = nd.pos.distanceTo(camera.position);
    const r = Math.max(10, nd.size * SET.icon * .55 * ph / dist), d = Math.hypot(sx - x, sy - y); if (d < r && d < bd) { bd = d; best = nd; } }
  return best;
}
function nodeTip(nd) { const n = nd.n; return `<b>${esc(nodeName(n))}</b><br><span style="color:var(--dim)">${KIND_ES[n.kind] || n.kind}${n.pid && !String(n.pid).startsWith('g') && n.kind !== 'net' ? ' · pid ' + n.pid : ''}${n.ws ? ' · ' + fmtB(n.ws) : ''}${n.cpu ? ' · ' + n.cpu + ' % CPU' : ''}</span>`; }
function selectNode(nd) { G.sel = nd; S.mode = 'proc'; S.tabs.proc = S.tabs.proc || 'proc'; renderPanel(); renderCubes(); }
function nodeMenu(nd) { const n = nd.n, dir = n.exe ? n.exe.replace(/[\\/][^\\/]*$/, '') : null;
  return [['Inspeccionar', () => selectNode(nd)], ['Enfocar', () => { selectNode(nd); flyTo(nd.pos, 7); }], ['Memoria y módulos', () => { selectNode(nd); S.tabs.proc = 'mem'; renderPanel(); }], ...(canFollow(nd) ? [['Seguir', () => startFollow(nd), 'solo observa']] : []), ...(n.kind === 'group' ? [['Desplegar sus ' + n.count + ' procesos', () => { G.openG.add(String(n.pid)); pollSystem(); }, 'doble clic']] : []), ...(n.group ? [['Volver a agrupar ' + n.name, () => { G.openG.delete(n.group); G.sel = null; pollSystem(); }]] : []), ...(n.kind === 'group-root' ? [[G.open.has(String(n.pid)) ? 'Recoger' : 'Desplegar', () => { G.open.has(String(n.pid)) ? G.open.delete(String(n.pid)) : G.open.add(String(n.pid)); pollSystem(); }]] : []),
    ...(n.exe ? [['Ver el ejecutable como objeto', () => { setView('espacio'); openObject(n.exe); }], ['Abrir su carpeta como cubo', () => { setView('espacio'); post('/api/open', { path: dir }).catch(() => {}); }]] : []), '-',
    ...(n.pid && !String(n.pid).startsWith('g') ? [['Copiar PID', () => copy(n.pid)]] : []), ...(n.cmd ? [['Copiar línea de órdenes', () => copy(n.cmd)]] : []), ...(n.exe ? [['Copiar ruta', () => copy(n.exe)]] : [])]; }
function findPid(n, pid) { if (String(n.pid) === String(pid)) return n; for (const k of n.kids || []) { const r = findPid(k, pid); if (r) return r; } return null; }

