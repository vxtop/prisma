// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Graphene language: everything is one cube of the same size and the same matte graphene; what it is shows only in the
// symbol engraved on its faces, glowing in its gem. The links between cubes say what relates them:
//   contains   a solid graphene g_filament, thicker the more it weighs
//   references a thread of dots flowing from the file that names another towards it
//   uses now   pulses of light travelling from a running program to what it has open
//   AI touched the g_filament takes Claude's colour when Claude reads or changes what is at its end, and cools back down
// Left click looks (selects, frames, shows its card); right click acts: a ring of everything that can be done with it. Enter does the main one.
// === Graphene ===

// --- Symbols ---
const SYMT = new Map();
const symGeo = f => { const d = .503, P = (rx, ry, x, y, z) => { const g = new THREE.PlaneGeometry(f, f); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
  return mergeGeometries([P(0, 0, 0, 0, d), P(0, Math.PI, 0, 0, -d), P(0, Math.PI / 2, d, 0, 0), P(0, -Math.PI / 2, -d, 0, 0), P(-Math.PI / 2, 0, 0, d, 0)]); }; // four sides and the lid
const SYM_GEO = symGeo(.5), SYM_S = symGeo(.29); // on a single cube the symbol fills half the face; on a cube of 27 it sits inside the centre cell
function symMesh() { const m = new THREE.Mesh(SYM_GEO, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.renderOrder = 2; return m; }
const SYM_COL = { code: '#5aa2ea', data: '#4fd39a', image: '#b79cf5', video: '#b79cf5', audio: '#b79cf5', doc: '#f3d77e', model3d: '#b79cf5', exe: '#f0707e', archive: '#AEB9C5', font: '#dfe6ee', dir: '#dfe6ee', drive: '#dfe6ee', other: '#AEB9C5', link: '#AEB9C5' };
const symCol = k => SYM_COL[k] || '#AEB9C5';
function fileSym(i) { const e = String(i.ext || '').toLowerCase();
  if (e === 'html' || e === 'htm') return 'web'; if (e === 'pdf') return 'pdf'; if (i.kind === 'doc') return 'text'; return i.kind || 'other'; }
const symTxt = (g, s, px = 96) => { g.font = `700 ${px}px "Segoe UI","Segoe UI Symbol",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, 128, 132); };
const symPage = (g, lines) => { g.beginPath(); g.moveTo(78, 46); g.lineTo(150, 46); g.lineTo(182, 78); g.lineTo(182, 210); g.lineTo(78, 210); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(150, 46); g.lineTo(150, 78); g.lineTo(182, 78); g.stroke();
  if (lines) { g.lineWidth = 8; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(98, 106 + k * 26); g.lineTo(k === 3 ? 140 : 162, 106 + k * 26); g.stroke(); } } };
const SYMDRAW = {
  code: g => symTxt(g, '</>', 80), 'g-code': g => symTxt(g, '</>', 80), codigo: g => symTxt(g, '</>', 80),
  data: g => symTxt(g, '{ }', 96), 'g-data': g => symTxt(g, '{ }', 96),
  exe: g => symTxt(g, '>_', 92), 'g-exe': g => symTxt(g, '>_', 92),
  font: g => symTxt(g, 'Aa', 100), ia: g => symTxt(g, '✦', 128), other: g => symTxt(g, '•••', 54), link: g => symTxt(g, '↗', 110),
  text: g => symPage(g, true), 'g-docs': g => symPage(g, true),
  pdf: g => { symPage(g, false); g.font = '800 42px "Segoe UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PDF', 130, 150); },
  'g-folder': g => { g.beginPath(); g.moveTo(52, 84); g.lineTo(104, 84); g.lineTo(120, 102); g.lineTo(204, 102); g.lineTo(204, 190); g.lineTo(52, 190); g.closePath(); g.stroke(); },
  unidad: g => { g.beginPath(); g.roundRect(48, 92, 160, 76, 16); g.stroke(); g.beginPath(); g.arc(178, 130, 9, 0, 7); g.fill(); g.beginPath(); g.moveTo(74, 130); g.lineTo(140, 130); g.stroke(); },
  video: g => { g.beginPath(); g.moveTo(100, 74); g.lineTo(190, 128); g.lineTo(100, 182); g.closePath(); g.stroke(); g.globalAlpha = .25; g.fill(); g.globalAlpha = 1; },
  medios: g => SYMDRAW.video(g),
  audio: g => { [44, 96, 140, 70, 116, 54].forEach((h, k) => { const x = 68 + k * 24; g.beginPath(); g.moveTo(x, 128 - h / 2); g.lineTo(x, 128 + h / 2); g.stroke(); }); },
  image: g => { g.beginPath(); g.roundRect(50, 66, 156, 124, 14); g.stroke(); g.beginPath(); g.moveTo(64, 176); g.lineTo(108, 124); g.lineTo(138, 156); g.lineTo(160, 136); g.lineTo(194, 176); g.stroke(); g.beginPath(); g.arc(164, 98, 11, 0, 7); g.fill(); },
  model3d: g => { const c = [128, 132], r = 70, p = k => [c[0] + r * Math.cos(Math.PI / 6 + k * Math.PI / 3), c[1] + r * Math.sin(Math.PI / 6 + k * Math.PI / 3)];
    g.beginPath(); for (let k = 0; k <= 6; k++) { const [x, y] = p(k); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.beginPath(); g.moveTo(...c); g.lineTo(...p(1)); g.moveTo(...c); g.lineTo(...p(3)); g.moveTo(...c); g.lineTo(...p(5)); g.stroke(); },
  web: g => { g.beginPath(); g.arc(128, 128, 70, 0, 7); g.stroke(); g.beginPath(); g.ellipse(128, 128, 30, 70, 0, 0, 7); g.stroke(); g.beginPath(); g.moveTo(58, 128); g.lineTo(198, 128); g.moveTo(70, 94); g.lineTo(186, 94); g.moveTo(70, 162); g.lineTo(186, 162); g.stroke(); },
  archive: g => { g.beginPath(); g.roundRect(66, 52, 124, 156, 12); g.stroke(); g.lineWidth = 8; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(k % 2 ? 128 : 116, 68 + k * 18); g.lineTo(k % 2 ? 140 : 128, 68 + k * 18); g.stroke(); } g.beginPath(); g.roundRect(112, 160, 32, 30, 6); g.stroke(); },
  sistema: g => { g.beginPath(); g.arc(128, 128, 32, 0, 7); g.stroke(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(128 + Math.cos(a) * 46, 128 + Math.sin(a) * 46); g.lineTo(128 + Math.cos(a) * 66, 128 + Math.sin(a) * 66); g.stroke(); } },
  app: g => { for (let k = 0; k < 4; k++) { g.beginPath(); g.roundRect(66 + (k % 2) * 68, 66 + (k >> 1) * 68, 56, 56, 10); g.stroke(); } },
  temporal: g => { g.beginPath(); g.arc(128, 128, 68, 0, 7); g.stroke(); g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 84); g.moveTo(128, 128); g.lineTo(160, 146); g.stroke(); },
  descargas: g => { g.beginPath(); g.moveTo(128, 56); g.lineTo(128, 158); g.moveTo(86, 118); g.lineTo(128, 160); g.lineTo(170, 118); g.moveTo(66, 200); g.lineTo(190, 200); g.stroke(); },
  usuario: g => { g.beginPath(); g.arc(128, 96, 32, 0, 7); g.stroke(); g.beginPath(); g.arc(128, 212, 70, Math.PI * 1.12, Math.PI * 1.88); g.stroke(); },
};
function symTex(key, col) { const id = key + col; if (SYMT.has(id)) return SYMT.get(id);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.save(); g.strokeStyle = col; g.globalAlpha = .13; g.lineWidth = 3; g.beginPath(); g.roundRect(16, 16, 224, 224, 30); g.stroke(); g.restore(); // the engraved plate
  g.strokeStyle = g.fillStyle = col; g.lineWidth = 11; g.lineCap = g.lineJoin = 'round'; g.shadowColor = col; g.shadowBlur = 7;
  (SYMDRAW[key] || SYMDRAW.other)(g);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; SYMT.set(id, t); return t; }

// --- File cubes: the same graphene as folder cubes (not instanced, so the edges and shimmer use the material colour) ---
let OCM = null;
function objCubeMat() { if (OCM) return OCM;
  OCM = new THREE.MeshStandardMaterial({ color: GRAPHENE, metalness: GM.m, roughness: GM.r, envMapIntensity: GM.e });
  OCM.onBeforeCompile = sh => { sh.uniforms.uTime = shimmer;
    sh.vertexShader = 'varying vec3 vLocal;\nvarying float vShine;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vLocal = position; vec4 o0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vShine = pow(max(0.0, sin(uTime * 0.85 - dot(position, vec3(2.6, 3.8, 2.0)) - (o0.x + o0.z) * 0.15)), 8.0);`);
    sh.fragmentShader = 'varying vec3 vLocal;\nvarying float vShine;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 a = abs(vLocal) * 2.0; float hi = max(a.x, max(a.y, a.z)), lo = min(a.x, min(a.y, a.z)), mid = a.x + a.y + a.z - hi - lo;
    totalEmissiveRadiance += diffuseColor.rgb * smoothstep(0.84, 0.97, mid) * ${EDGE_K.toFixed(2)}; }`);
    withGraphene(sh, '0.0'); withHolo(sh); };
  OCM.transparent = true; return OCM; }

// --- Links ---
const FIL_MAX = 700, DOT_MAX = 5000;
const g_mkIM = (geo, max) => { const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false }), max); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; scene.add(im); return im; };
const filIM = g_mkIM(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), FIL_MAX), dotIM = g_mkIM(new THREE.SphereGeometry(1, 8, 6), DOT_MAX);
const L_FIL = new THREE.Color('#4a5361'), L_AI = new THREE.Color('#D97757'), L_REF = new THREE.Color('#a9a69b'), L_USE = new THREE.Color('#d8d3c5'), g_lc = new THREE.Color();
const g_m = new THREE.Matrix4(), g_q = new THREE.Quaternion(), g_sc = new THREE.Vector3(), g_d = new THREE.Vector3(), g_p = new THREE.Vector3(), g_Y = new THREE.Vector3(0, 1, 0), g_a = new THREE.Vector3(), g_b = new THREE.Vector3();
let g_nF = 0, g_nD = 0;
function g_filament(a, b, r, col, c0, c1) { // a solid strand from the surface of one cube to the surface of the other
  g_d.subVectors(b, a); const L = g_d.length(), len = L - c0 - c1; if (len <= .05 || g_nF >= FIL_MAX) return; g_d.divideScalar(L);
  g_p.copy(a).addScaledVector(g_d, c0 + len / 2); g_q.setFromUnitVectors(g_Y, g_d); g_m.compose(g_p, g_q, g_sc.set(r, len, r)); filIM.setMatrixAt(g_nF, g_m); filIM.setColorAt(g_nF, col); g_nF++; }
function g_dot(p, r, col) { if (g_nD >= DOT_MAX) return; g_m.compose(p, g_q.identity(), g_sc.setScalar(r)); dotIM.setMatrixAt(g_nD, g_m); dotIM.setColorAt(g_nD, col); g_nD++; }
function g_dotsAlong(a, b, gap, r, col, phase, c0, c1) { // a dotted thread; phase moves the dots along it (direction = meaning)
  g_d.subVectors(b, a); const L = g_d.length(), len = L - c0 - c1; if (len <= .05) return; g_d.divideScalar(L);
  for (let s = ((phase % 1) + 1) % 1 * gap; s < len; s += gap) g_dot(g_p.copy(a).addScaledVector(g_d, c0 + s), r, col); }
function g_beads(a, b, n, r, col, phase, c0, c1) { // pulses of light travelling from a to b
  g_d.subVectors(b, a); const L = g_d.length(), len = L - c0 - c1; if (len <= .05) return; g_d.divideScalar(L);
  for (let k = 0; k < n; k++) { const f = ((phase + k / n) % 1 + 1) % 1, fade = Math.sin(f * Math.PI); g_dot(g_p.copy(a).addScaledVector(g_d, c0 + f * len), r * (.6 + .4 * fade), g_lc.copy(col).multiplyScalar(.35 + .9 * fade)); } }
const aiHeat = t => t ? Math.exp(-(Date.now() - t) / 180000) : 0; // Claude's colour cools down over a few minutes
const normRel = r => K(r).replace(/\\/g, '/');
function depsOf(c) { // file → files it names, normalised; loaded once per cube (never for a whole drive)
  if (!c.deps) { if (c.kind !== 'unidad' && c.data && c.data.totals.files < 60000) loadDeps(c); return null; }
  if (c.deps.pending || !c.deps.links) return null;
  if (c._depsN !== c.deps) { c._depsN = c.deps; c._depsM = new Map(Object.entries(c.deps.links).map(([k, v]) => [normRel(k), new Set(v.map(normRel))])); }
  return c._depsM; }
function stepLinks() {
  g_nF = 0; g_nD = 0; const t = performance.now() / 1000, iso = !!VW.o, space = VIEW.cur === 'espacio';
  links.visible = false; objLines.visible = false; cellsIM.visible = !iso; // the viewer isolates what you are looking at
  if (iso) for (const c of S.cubes.values()) { c.label.visible = false; if (c.emb) c.emb.visible = false; }
  if (space && !iso) {
    const half = c => 1.46 * c.s;
    // contains: folder → subfolder (when both show)
    for (const c of S.cubes.values()) { const par = c.parent && S.cubes.get(K(c.parent)); if (!par || c.vis === false || par.vis === false || par.key === S.enter || c.s < .1) continue;
      const w = c.data && par.data && par.data.totals.bytes ? Math.min(1, c.data.totals.bytes / par.data.totals.bytes) : .1, ai = aiHeat(c.aiHot);
      g_filament(par.pos, c.pos, .022 + .05 * Math.sqrt(w), g_lc.copy(L_FIL).lerp(L_AI, ai), half(par), half(c)); if (ai > .05) g_beads(par.pos, c.pos, 2, .1, L_AI, t * .5, half(par), half(c)); }
    // contains: folder → its files (open as cubes), and references between those files
    const byCube = new Map();
    for (const o of OB.list) { const c = cubeOfPath(o.path); if (!c || c.vis === false || c.key === S.enter || o.cs < .1) continue;
      const rel = relTo(o.path, c.path), a = c.ai.get(K(rel)), ai = aiHeat(a && a.t), w = Math.min(1, Math.log10(1 + (o.info.size || 0)) / 9), r0 = half(c), r1 = OBJ_E / 2 * o.cs;
      g_filament(c.pos, o.pos, .018 + .034 * w, g_lc.copy(L_FIL).lerp(L_AI, ai), r0, r1); if (ai > .05) g_beads(c.pos, o.pos, 2, .1, L_AI, t * .5, r0, r1);
      if (!byCube.has(c)) byCube.set(c, []); byCube.get(c).push([normRel(rel), o]); }
    for (const [c, list] of byCube) { if (list.length < 2) continue; const dm = depsOf(c); if (!dm) continue;
      for (const [ra, oa] of list) { const to = dm.get(ra); if (to) for (const [rb, ob] of list) if (ob !== oa && to.has(rb)) g_dotsAlong(oa.pos, ob.pos, .3, .045, L_REF, t * .6, OBJ_E / 2, OBJ_E / 2); } }
    // uses now: a running program → the folders it has open («En vivo»)
    if (lpCells.visible) for (const o of LP.values()) { if (o.dead || o.h < .3) continue; g_a.set(o.base.x, LPB + o.h / 2, o.base.z);
      for (const l of (o.p.links || []).slice(0, 6)) { const c = S.cubes.get(K(l)); if (c && c.vis !== false && c.s > .1) g_beads(g_a, c.pos, 3, .085, L_USE, t * .45 + o.slot * .13, o.h * .55, half(c)); } }
  }
  filIM.count = g_nF; dotIM.count = g_nD; filIM.instanceMatrix.needsUpdate = true; dotIM.instanceMatrix.needsUpdate = true;
  if (filIM.instanceColor) filIM.instanceColor.needsUpdate = true; if (dotIM.instanceColor) dotIM.instanceColor.needsUpdate = true;
}

// --- Radial menu: the one way to act on a thing ---
const RICON = {
  enter: '<path d="M10 4h8v16h-8"/><path d="M3 12h10"/><path d="M9 8l4 4-4 4"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M8 4v16M16 4v16"/>', rotate: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>',
  tree: '<path d="M5 4v16M5 8h7M5 15h7"/><rect x="13" y="5" width="6" height="5" rx="1"/><rect x="13" y="12" width="6" height="5" rx="1"/>', gallery: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M5 17l5-6 4 4 2-2 3 4"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>', expand: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>', explore: '<path d="M3 6h6l2 2h10v4"/><path d="M3 6v13h8"/><circle cx="17" cy="17" r="3"/><path d="M19.5 19.5L22 22"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  index: '<path d="M4 19h16M7 16V9M12 16V5M17 16v-4"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
};
const RAD = { t: null, el: null, at: 0 };
function radialEl() { if (RAD.el) return RAD.el; const el = document.createElement('div'); el.id = 'radial'; el.innerHTML = '<div class="rl"></div>'; document.body.appendChild(el);
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; const it = RAD.items[+b.dataset.r]; radialHide(); it[2](e); });
  el.addEventListener('pointerover', e => { const b = e.target.closest('[data-r]'); el.querySelector('.rl').textContent = b ? RAD.items[+b.dataset.r][0] : RAD.name; });
  el.addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-r]')) el.querySelector('.rl').textContent = RAD.name; });
  RAD.el = el; return el; }
const dirOf = p => p.replace(/[\\/][^\\/]*$/, '');
function radialItems(t) {
  if (t.c) { const c = t.c, pr = c.data && c.data.preset, files = c.data ? c.data.cells.flatMap(x => x.top || []).sort((a, b) => b.mtime - a.mtime) : [];
    return [['Entrar', 'enter', () => enterCube(c)], ['Árbol', 'tree', () => trOpen(c.path)], ...(pr && pr.media ? [['Galería de medios', 'gallery', () => presetOpen(c, 'media')]] : []),
      ...(pr && pr.keyFiles && pr.keyFiles.length ? [['Archivos clave', 'key', () => presetOpen(c, 'key')]] : []), ...(files.length ? [['Su archivo más reciente · ' + base(files[0].rel), 'eye', () => openObject(c.path + SEP(c.path) + files[0].rel)]] : []),
      ['Desplegar un nivel', 'expand', () => openDeep(c.path, 1)], ['Explorar', 'explore', () => { setLeft('explorer'); exGo(c.path); }], ['Indexar (carga completa)', 'index', () => startIx(c.path)],
      ['Copiar ruta', 'copy', () => copy(c.path)], ['Cerrar cubo', 'close', () => post('/api/close', { path: c.path }).catch(() => {})]]; }
  if (t.o) { const o = t.o, i = o.info, media = o.el || o.wave || i.kind === 'audio', web = fileSym(i) === 'web';
    return [[i.kind === 'model3d' ? 'Girar' : web ? 'Ver código' : 'Ver', i.kind === 'model3d' ? 'rotate' : 'eye', () => enterViewer(o)],
      ...(media ? [['Reproducir', 'play', () => { enterViewer(o); setTimeout(() => viewerAct('play'), 120); }]] : []), ...(web ? [['Abrir la página', 'web', () => window.open(rawURL(i.path), '_blank', 'noopener')]] : []),
      ['Su carpeta como cubo', 'folder', () => post('/api/open', { path: dirOf(o.path) }).catch(() => {})], ['Explorar su carpeta', 'explore', () => { setLeft('explorer'); exGo(dirOf(o.path)); }],
      ['Copiar ruta', 'copy', () => copy(o.path)], ['Cerrar', 'close', () => closeObj(o)]]; }
  if (t.f) { const f = t.f, dir = f.grp === 'folder' || f.grp === 'link' || f.summary; return [[dir ? 'Entrar' : 'Ver', dir ? 'enter' : 'eye', () => inOpen(f)], ...(f.path ? [['Copiar ruta', 'copy', () => copy(f.path)]] : [])]; }
  if (t.lp) { const o = t.lp; return [['Entrar', 'enter', () => inEnterProg(o)], ...lpMenu(o).filter(x => x !== '-' && !/^Ver detalle/.test(x[0])).map(x => [x[0], /Seguir/.test(x[0]) ? 'eye' : /carpeta/i.test(x[0]) ? 'folder' : /Copiar/.test(x[0]) ? 'copy' : /Sistema|Tareas/.test(x[0]) ? 'tree' : 'more', x[1]])]; }
  return [];
}
function radialMain() { // Enter: the first action of what is selected, ring or not
  if (VW.o || VIEW.cur !== 'espacio') return false; const t = OB.sel ? { o: OB.sel } : IN.sel ? { f: IN.sel } : S.lpSel ? { lp: S.lpSel } : S.sel ? { c: S.sel } : null; if (!t) return false;
  const it = radialItems(t)[0]; if (!it) return false; radialHide(); it[2](); return true; }
function radialAnchor(t, out) { if (t.c) return out.copy(t.c.pos); if (t.o) return out.copy(t.o.pos); if (t.lp) return out.set(t.lp.base.x, LPB + t.lp.h / 2, t.lp.base.z); if (t.f && t.f.p) return out.copy(t.f.p); return null; }
function radialAlive(t) { if (VW.o || VIEW.cur !== 'espacio') return false; if (t.c) return S.sel === t.c && S.cubes.has(t.c.key); if (t.o) return OB.sel === t.o && OB.list.includes(t.o); if (t.lp) return S.lpSel === t.lp && !t.lp.dead; if (t.f) return IN.sel === t.f; return false; }
function radialFor(t, x, y) { const items = radialItems(t); if (!items.length) return hideMenu(); // the context menu, at the pointer (or on the thing itself when called without one)
  if (x == null) { const p = radialAnchor(t, g_a); if (!p) return; const s = g_b.copy(p).project(camera); x = (s.x * .5 + .5) * innerWidth + 24; y = (-s.y * .5 + .5) * innerHeight + 24; }
  const out = []; items.forEach(([label, , fn], k) => { if (k && /^(Copiar ruta|Cerrar)/.test(label) && !out.includes('-')) out.push('-'); out.push([label, fn, k ? '' : 'Enter']); }); return menu(x, y, out); }
function radialRing(t) { const items = radialItems(t); if (!items.length) return radialHide(); const el = radialEl();
  RAD.t = t; S.radC = t.c || null; RAD.items = items; RAD.at = performance.now(); RAD.name = t.c ? dispName(t.c) : t.o ? t.o.info.name : t.f ? t.f.name : t.lp ? t.lp.p.name || 'programa' : '';
  const n = items.length; el.querySelectorAll('button').forEach(b => b.remove());
  items.forEach(([label, icon], k) => { const b = document.createElement('button'); b.dataset.r = k; b.setAttribute('aria-label', label); b.style.setProperty('--a', (k / n * 360 - 90) + 'deg'); b.style.setProperty('--d', (k * 18) + 'ms');
    b.innerHTML = `<svg viewBox="0 0 24 24">${RICON[icon] || RICON.more}</svg>`; el.appendChild(b); });
  el.querySelector('.rl').textContent = RAD.name; el.classList.remove('on'); radialTick(); void el.offsetWidth; el.classList.add('on'); }
function radialHide() { RAD.t = null; S.radC = null; if (RAD.el) RAD.el.classList.remove('on'); }
function radialTick() { const t = RAD.t; if (!t) return; if (!radialAlive(t)) return radialHide();
  const p = radialAnchor(t, g_a); if (!p) return radialHide(); const s = g_b.copy(p).project(camera); if (s.z > 1) return radialHide();
  const x = (s.x * .5 + .5) * innerWidth, y = (-s.y * .5 + .5) * innerHeight, dist = Math.max(.1, camera.position.distanceTo(p)), ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
  const edge = t.c ? 2.92 * t.c.s : t.o ? OBJ_E : t.lp ? t.lp.h : 1.2, R = Math.max(74, Math.min(220, edge * .82 * ph / dist + 34));
  RAD.x = x; RAD.y = y; const el = RAD.el; $('#tip').style.display = 'none'; pkEl.style.display = 'none'; /* nothing floats over the ring */ el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.setProperty('--R', R + 'px'); }
addEventListener('pointerdown', e => { if (RAD.t && !e.target.closest('#radial') && e.target !== canvas) radialHide(); }, true); // a click elsewhere in the interface closes it; on the canvas the new pick decides
addEventListener('keydown', e => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key === 'Escape' && ctxEl.style.display === 'block') { hideMenu(); e.stopImmediatePropagation(); } // Esc closes the menu first, the selection stays
  else if (e.key === 'Escape' && RAD.t && RAD.el.classList.contains('on')) { radialHide(); e.stopImmediatePropagation(); }
  else if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && radialMain()) e.preventDefault(); }, true);
canvas.addEventListener('pointerdown', e => { if (RAD.t && e.button !== 2) radialHide(); }); // any other click closes it; a right click picks again // the click that follows picks again (and reopens it on the new thing)

// --- Viewer: a 3D model turns in your hand, the camera stays still ---
const SPIN = { on: false, x: 0, y: 0 };
canvas.addEventListener('pointerdown', e => { const o = VW.o; if (!o || !o.model || e.button !== 0) return; SPIN.on = true; SPIN.x = e.clientX; SPIN.y = e.clientY; controls.enableRotate = false; });
addEventListener('pointermove', e => { const o = VW.o; if (!SPIN.on || !o || !o.model) return; const dx = e.clientX - SPIN.x, dy = e.clientY - SPIN.y; SPIN.x = e.clientX; SPIN.y = e.clientY;
  o.spun = true; o.model.rotation.y += dx * .01; o.model.rotation.x = Math.max(-1.3, Math.min(1.3, o.model.rotation.x + dy * .01)); });
addEventListener('pointerup', () => { SPIN.on = false; });
S.radialFor = radialFor; S.selectObjR = o => { selectObj(o, true); radialFor({ o }); }; S.selectCubeR = c => { select(c, false); focusOn(cubeBox(c), .62, 9, true); radialFor({ c }); }; // test hooks
