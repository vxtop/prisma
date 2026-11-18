// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Scene setup: renderer, camera and controls, lights, instanced cube/voxel meshes,
// lines, particles, text sprites and post-processing.
// === Scene ===
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
let DPR = Math.min(devicePixelRatio, 1.5); renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0d11); scene.fog = new THREE.FogExp2(0x0b0d11, .011);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 700); camera.position.set(12, 9, 20);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .085; controls.minDistance = 2; controls.maxDistance = 420; controls.rotateSpeed = .7; controls.panSpeed = .9; controls.zoomSpeed = 1;
// Mouse: left click selects, left drag orbits; wheel zooms toward the center; right click opens the menu, right drag pans
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }; controls.zoomToCursor = false; controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI * .485; controls.dampingFactor = .07; controls.zoomSpeed = 1.15; // never below the floor plane
// any user gesture cancels automatic camera moves
canvas.addEventListener('wheel', e => { S.autoFit = false; if (S.follow) { S.fz = Math.max(.3, Math.min(6, (S.fz || 1) * (e.deltaY > 0 ? 1.15 : .87))); return; } focusing = false; focusDir = null; }, { passive: true });
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xdfe7ee, 1.1); key.position.set(8, 14, 10); scene.add(key);
scene.add(new THREE.HemisphereLight(0x1c2a30, 0x050505, .55));
const rim = new THREE.DirectionalLight(0x7ec4c8, .45); rim.position.set(-12, 7, -14); scene.add(rim); // rim light: separates cubes from the background
const FLOOR = -3.6;
const hovGeo = new THREE.BufferGeometry(); hovGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
const hovBr = new THREE.LineSegments(hovGeo, new THREE.LineBasicMaterial({ color: 0x1768b5, transparent: true, opacity: .9, depthWrite: false })); hovBr.frustumCulled = false; scene.add(hovBr);
{ // data dust
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i*3] = (Math.random() - .5) * 200; pos[i*3+1] = Math.random() * 60 - 8; pos[i*3+2] = (Math.random() - .5) * 200; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x40585e, size: .07, transparent: true, opacity: .55, depthWrite: false })));
}

// --- Cells: one instanced mesh for all cubes ---
const MAXC = 256, SPF = 16, VPC = 27 * SPF; // must match the server's MAX_CUBES
const cellGeo = new RoundedBoxGeometry(1, 1, 1, 2, .07);
const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 27 * 3), 3); glowAttr.setUsage(THREE.DynamicDrawUsage); cellGeo.setAttribute('aGlow', glowAttr);
const cellMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .62, roughness: .38, envMapIntensity: .55 });
// Lit edges: every cube's edges catch a thin line of its own colour (local position on the unit box, on the GPU; needs instance colours)
function withEdges(sh, k) {
  sh.vertexShader = 'varying vec3 vLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocal = position;');
  sh.fragmentShader = 'varying vec3 vLocal;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { vec3 a = abs(vLocal) * 2.0; float hi = max(a.x, max(a.y, a.z)), lo = min(a.x, min(a.y, a.z)), mid = a.x + a.y + a.z - hi - lo;\n    totalEmissiveRadiance += vColor * smoothstep(0.84, 0.97, mid) * ' + k.toFixed(2) + '; }');
}
// Shimmer: a slow wave of glints travels through the cells of every cube in the cube's own gem (its instance colour, on the GPU).
const shimmer = { value: 0 };
cellMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = shimmer;
  sh.vertexShader = 'attribute vec3 aGlow;\nvarying vec3 vGlow;\nvarying float vShine;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vGlow = aGlow;
  float cell = mod(float(gl_InstanceID), 27.0), slot = floor(float(gl_InstanceID) / 27.0);
  vShine = pow(max(0.0, sin(uTime * 0.85 - dot(position, vec3(2.6, 3.8, 2.0)) - slot * 0.37)), 8.0); // a band of light sweeping across the cube's faces`);
  sh.fragmentShader = 'varying vec3 vGlow;\nvarying float vShine;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vGlow + vColor * vShine * 0.55;');
  withEdges(sh, 2.2);
};
const cellsIM = new THREE.InstancedMesh(cellGeo, cellMat, MAXC * 27);
cellsIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cellsIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 27 * 3), 3);
cellsIM.frustumCulled = false; cellsIM.instanceMatrix.array.fill(0); scene.add(cellsIM);
// --- Voxels: each file is a window on the surface of its cell ---
const voxIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAXC * VPC);
voxIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); voxIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * VPC * 3), 3); voxIM.instanceColor.setUsage(THREE.DynamicDrawUsage);
voxIM.frustumCulled = false; voxIM.instanceMatrix.array.fill(0); scene.add(voxIM);
const CM = cellsIM.instanceMatrix.array, CC = cellsIM.instanceColor.array, CG = glowAttr.array, VM = voxIM.instanceMatrix.array, VC = voxIM.instanceColor.array;
const setM = (A, i, x, y, z, sx, sy, sz) => { const o = i * 16; A[o] = sx; A[o+1] = 0; A[o+2] = 0; A[o+3] = 0; A[o+4] = 0; A[o+5] = sy; A[o+6] = 0; A[o+7] = 0; A[o+8] = 0; A[o+9] = 0; A[o+10] = sz; A[o+11] = 0; A[o+12] = x; A[o+13] = y; A[o+14] = z; A[o+15] = 1; };
const freeSlots = Array.from({ length: MAXC }, (_, i) => MAXC - 1 - i);
// slots per cell: 4x4 per outer face
const SLOTS = BASE.map(b => { const out = [];
  for (let ax = 0; ax < 3; ax++) if (Math.abs(b[ax]) === 1) { const n = [0, 0, 0]; n[ax] = b[ax]; const u = (ax + 1) % 3, v = (ax + 2) % 3;
    for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) { const o = [n[0] * .474, n[1] * .474, n[2] * .474], s = [.165, .165, .165]; o[u] = (a - 1.5) * .205; o[v] = (c - 1.5) * .205; s[ax] = .022; out.push([...o, ...s]); } }
  return out; });

// --- Lines: parent-child links ---
const linkGeo = new THREE.BufferGeometry(); linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXC * 6), 3));
const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ color: 0x2b4c4f, transparent: true, opacity: .55, depthWrite: false })); links.frustumCulled = false; scene.add(links);

// --- Particles: information flow ---
const PN = 4000, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pA = new Float32Array(PN * 3), pB = new Float32Array(PN * 3), pT = new Float32Array(PN * 4); // t0, dur, arc, alive
const pRGB = new Float32Array(PN * 3); let pHead = 0;
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage)); pGeo.setAttribute('aCol', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
const pMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 500 } },
  vertexShader: 'attribute vec3 aCol; varying vec3 vC; uniform float uScale; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(0.06 * uScale / -mv.z, 1.0, 7.0); }',
  fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a, 1.0); }' });
const particles = new THREE.Points(pGeo, pMat); particles.frustumCulled = false; scene.add(particles);
let pLive = 0;
function emit(a, b, col, n = 1, dur = .9, arc = .5, jitter = .12) {
  for (let k = 0; k < n; k++) { const i = pHead; pHead = (pHead + 1) % PN; const o = i * 3;
    pA[o] = a.x + (Math.random() - .5) * jitter; pA[o+1] = a.y + (Math.random() - .5) * jitter; pA[o+2] = a.z + (Math.random() - .5) * jitter;
    pB[o] = b.x + (Math.random() - .5) * jitter; pB[o+1] = b.y + (Math.random() - .5) * jitter; pB[o+2] = b.z + (Math.random() - .5) * jitter;
    pRGB[o] = col.r; pRGB[o+1] = col.g; pRGB[o+2] = col.b; const q = i * 4; pT[q] = clock.elapsedTime + k * .035; pT[q+1] = dur * (.75 + Math.random() * .5); pT[q+2] = arc * (Math.random() + .3); if (!pT[q+3]) { pT[q+3] = 1; pLive++; } }
}
function stepParticles(t) {
  if (!pLive) return; let live = 0;
  for (let i = 0; i < PN; i++) { const q = i * 4; if (!pT[q+3]) continue; const o = i * 3, u = (t - pT[q]) / pT[q+1];
    if (u >= 1) { pT[q+3] = 0; pCol[o] = pCol[o+1] = pCol[o+2] = 0; continue; } live++;
    if (u < 0) { pCol[o] = pCol[o+1] = pCol[o+2] = 0; continue; }
    const e = u * u * (3 - 2 * u), h = Math.sin(u * Math.PI) * pT[q+2], f = Math.sin(u * Math.PI);
    pPos[o] = pA[o] + (pB[o] - pA[o]) * e; pPos[o+1] = pA[o+1] + (pB[o+1] - pA[o+1]) * e + h; pPos[o+2] = pA[o+2] + (pB[o+2] - pA[o+2]) * e;
    pCol[o] = pRGB[o] * f; pCol[o+1] = pRGB[o+1] * f; pCol[o+2] = pRGB[o+2] * f; }
  pLive = live; pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aCol.needsUpdate = true;
}

// --- Text sprites ---
function textSprite(w = 1024, h = 128) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })); sp.userData = { ctx: cv.getContext('2d'), tex, w, h }; return sp; }
function drawText(sp, lines) { const { ctx: g, tex, w, h } = sp.userData; let tw = 0; g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([txt, size, col, y]) => { g.font = `600 ${size}px "Segoe UI",system-ui,sans-serif`; g.fillStyle = col; let t = txt; while (g.measureText(t).width > w - 20 && t.length > 4) t = t.slice(0, -2); if (t !== txt) t += '…'; g.fillText(t, w / 2, y); tw = Math.max(tw, g.measureText(t).width); }); sp.userData.tw = (tw + 16) / w; tex.needsUpdate = true; }
const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();

// --- Post-processing: bloom only for truly emissive things, vignette and grain ---
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), .42, .28, .92); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uT: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float uT; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float v = smoothstep(1.05, .3, length(vUv - .5) * 1.3); float n = fract(sin(dot(vUv * 913.7 + uT, vec2(12.9898, 78.233))) * 43758.5453); c.rgb = c.rgb * mix(.66, 1.0, v) + (n - .5) * .022; gl_FragColor = c; }' });
composer.addPass(grain);
function applyView() { // centers the scene in the free area between panels (no panels in the viewer)
  const w = innerWidth, h = innerHeight, viewer = document.body.classList.contains('viewer'), rv = !viewer && $('#right').style.display === 'flex';
  const L = viewer ? 0 : $('#left').offsetWidth + 10, R = rv ? $('#right').offsetWidth + 10 : 0, shift = (L - R) / 2;
  document.body.classList.toggle('noright', !rv); camera.aspect = w / h; camera.setViewOffset(w, h, -shift, viewer ? -24 : 0, w, h); camera.updateProjectionMatrix(); }
// on-screen sprite size with sizeAttenuation off: pixel height -> scale
const pxScale = px => 2 * px / (camera.projectionMatrix.elements[5] * innerHeight);
function resize() { const w = innerWidth, h = innerHeight; renderer.setPixelRatio(DPR); renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h); pMat.uniforms.uScale.value = h * DPR; applyView(); renderCubes(); }
addEventListener('resize', resize);

