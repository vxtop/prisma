// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Hologram mode of «En vivo»: the machine as a holographic projection.
// - Table: a circular projection floor (polar grid, radial ticks, the three activity tracks, a radar sweep) with a
//   curtain of light rising from its rim.
// - Core: the computer itself at the centre, an orb of light with gauges around it (CPU, RAM, GPU, disk) that fill
//   as arcs; the programs orbit it and a beam joins it to the table.
// - Material: cubes stay the same matte graphene as everywhere else; only the table and the core are light.
// - Floating panels: the card of what you select unfolds in space beside it, joined to it by a line of light.
// Static spaces keep the graphene look. Everything fades in and out with the mode.
// === Hologram ===
const HOLO = { k: 0, on: false, panel: false, lastTxt: 0 };
const HOLO_U = { value: 0 }, HOLO_MAT = { value: 0 } /* the cube materials no longer turn into holograms: graphene everywhere */, HCYAN = new THREE.Color('#5aa2ea') /* the interface blue, not a colour of its own */;
/** Shader patch shared by every cube material: cyan tint, Fresnel rim, scanlines and translucency, scaled by uHolo. */
function withHolo(sh) {
  sh.uniforms.uHolo = HOLO_MAT; sh.uniforms.uHT = shimmer;
  sh.fragmentShader = 'uniform float uHolo;\nuniform float uHT;\n' + sh.fragmentShader
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uHolo > 0.001) { float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2), scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.35 - uHT * 6.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015, 0.07, 0.1), uHolo);
    totalEmissiveRadiance += vec3(0.28, 0.83, 1.0) * uHolo * (rim * 0.95 + scan * 0.06 + 0.035); }`)
    .replace('#include <opaque_fragment>', `if (uHolo > 0.001) { float rim2 = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0); diffuseColor.a *= mix(1.0, 0.38 + 0.62 * rim2, uHolo); }
#include <opaque_fragment>`);
}
{ const prev = cellMat.onBeforeCompile; cellMat.onBeforeCompile = sh => { prev(sh); withHolo(sh); }; cellMat.needsUpdate = true; }

// --- Table ---
const H_Y = -2.3, H_R = 28;
const holo = new THREE.Group(); holo.visible = false; scene.add(holo);
const hMat = (frag, extra = {}) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  uniforms: { uT: shimmer, uK: { value: 0 }, uCol: { value: HCYAN }, ...extra },
  vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: frag });
const tableMat = hMat(`uniform float uT, uK; uniform vec3 uCol; varying vec3 vP;
  float ln(float d, float w) { return 1.0 - smoothstep(w * 0.4, w, abs(d)); }
  void main() { vec2 p = vP.xy; float r = length(p), a = atan(p.y, p.x), PI = 3.14159265;
    float rings = ln(r - floor(r / 2.5 + 0.5) * 2.5, 0.05) * step(2.0, r);
    float sa = PI / 12.0, da = (a / sa - floor(a / sa + 0.5)) * sa * r, radial = ln(da, 0.05) * step(3.0, r) * (0.4 + 0.6 * step(0.5, fract(r / 5.0)));
    float tracks = ln(r - 12.0, 0.12) + ln(r - 17.5, 0.12) + ln(r - 23.0, 0.12);
    float ta = PI / 90.0, tk = ln((a / ta - floor(a / ta + 0.5)) * ta * r, 0.04) * (ln(r - 12.6, 0.5) + ln(r - 18.1, 0.5) + ln(r - 23.6, 0.5));
    float rim = ln(r - 27.4, 0.18) + ln(r - 26.6, 0.06) * 0.6;
    float sw = pow(fract((a - uT * 0.32) / (2.0 * PI)), 22.0) * step(r, 27.4) * smoothstep(1.0, 6.0, r);
    float glow = 0.0, edge = smoothstep(28.0, 25.5, r);
    float v = rings * 0.16 + radial * 0.08 + tracks * 0.5 + tk * 0.35 + rim * 0.9 + sw * 0.28 + glow;
    gl_FragColor = vec4(uCol * v * edge * uK * 0.3, 1.0); }`);
const table = new THREE.Mesh(new THREE.CircleGeometry(H_R, 160), tableMat); table.rotation.x = -Math.PI / 2; table.position.y = H_Y; holo.add(table);
const curtainMat = hMat(`uniform float uT, uK; uniform vec3 uCol; varying vec3 vP;
  void main() { float h = clamp((vP.y + 1.6) / 3.2, 0.0, 1.0), a = atan(vP.z, vP.x), sc = 0.75 + 0.25 * sin(a * 40.0 + uT * 1.5);
    gl_FragColor = vec4(uCol * pow(1.0 - h, 2.6) * 0.06 * sc * uK, 1.0); }`);
const curtain = new THREE.Mesh(new THREE.CylinderGeometry(27.4, 27.4, 3.2, 128, 1, true), curtainMat); curtain.position.y = H_Y + 1.6; holo.add(curtain);
const hTrack = [[12, 'ACTIVO AHORA'], [17.5, 'EN REPOSO'], [23, 'APAGÁNDOSE']].map(([R, t]) => { const sp = textSprite(512, 64); drawText(sp, [[t, 30, 'rgba(169,198,234,.9)', 32]]); sp.position.set(Math.cos(-2.35) * R, H_Y + .25, Math.sin(-2.35) * R); sp.scale.set(5.2, .65, 1); holo.add(sp); return sp; });

// --- Core: the computer at the centre ---
const H_CY = LPB + 1.6;
const core = new THREE.Group(); core.position.y = H_CY; core.visible = false; holo.add(core); // the orb, its gauges and the beam are off: nothing stands in the middle of the table (CPU, RAM, GPU and disk are read in the left panel)
const orbMat = hMat(`uniform float uT, uK; uniform vec3 uCol; varying vec3 vP;
  void main() { gl_FragColor = vec4(uCol * uK * (0.18 + 0.1 * sin(uT * 2.0 + vP.y * 6.0)), 1.0); }`);
const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), orbMat); core.add(orb);
const orbRim = new THREE.Mesh(new THREE.SphereGeometry(1.06, 48, 32), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uK: { value: 0 }, uCol: { value: HCYAN } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float uK; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uCol * f * 1.6 * uK, 1.0); }' }));
core.add(orbRim);
const lattice = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(.62, 1)), new THREE.LineBasicMaterial({ color: HCYAN, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); core.add(lattice);
const gyro = [0, 1].map(i => { const m = new THREE.Mesh(new THREE.TorusGeometry(1.35 + i * .12, .012, 8, 96), new THREE.MeshBasicMaterial({ color: HCYAN, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); core.add(m); return m; });
const gaugeMat = col => hMat(`uniform float uT, uK, uFill; uniform vec3 uCol; varying vec3 vP;
  void main() { float a = atan(vP.y, vP.x), f = fract(0.25 - a / 6.2831853), on = step(f, uFill), tick = step(0.86, fract(f * 60.0));
    gl_FragColor = vec4(uCol * uK * (on * (0.95 + 0.25 * tick) + (1.0 - on) * (0.1 + 0.12 * tick)), 1.0); }`, { uFill: { value: 0 }, uCol: { value: new THREE.Color(col) } });
const GAUGES = [['CPU', () => cpuAvg() / 100, '#5aa2ea'], ['RAM', () => S.sys ? 1 - S.sys.mem.free / S.sys.mem.total : 0, '#dfe6ee'],
  ['GPU', () => S.sys && S.sys.gpu ? (S.sys.gpu.util || 0) / 100 : 0, '#5aa2ea'], ['DISCO', () => S.sys && S.sys.disk ? 1 - S.sys.disk.free / S.sys.disk.total : 0, '#D97757']].map(([name, val, col], i) => {
  const R = 1.75 + i * .36, mesh = new THREE.Mesh(new THREE.RingGeometry(R, R + .16, 128, 1), gaugeMat(col)); mesh.rotation.x = -Math.PI / 2; core.add(mesh);
  const lab = textSprite(512, 64); lab.material.sizeAttenuation = false; lab.center.set(0, .5); lab.position.set(R + .05, .02, -.02); core.add(lab);
  return { name, val, mesh, lab, R, v: 0 }; });
const beamMat = hMat(`uniform float uT, uK; uniform vec3 uCol; varying vec3 vP;
  void main() { float h = clamp(vP.y / ${(H_CY - H_Y).toFixed(2)} + 0.5, 0.0, 1.0), s = 0.6 + 0.4 * sin(vP.y * 9.0 - uT * 7.0); gl_FragColor = vec4(uCol * (0.05 + 0.2 * (1.0 - h)) * s * uK, 1.0); }`);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, 1.3, H_CY - H_Y, 48, 1, true), beamMat); beam.position.y = (H_CY + H_Y) / 2 - H_CY; core.add(beam);

// --- Floating panel ---
const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); hLine.id = 'hololine'; hLine.innerHTML = '<line/><circle r="4"/>'; document.body.appendChild(hLine);
function holoTarget() { if (OB.sel) return { p: OB.sel.pos, r: OBJ_E * .6 }; if (S.lpSel) { const o = S.lpSel; return { p: v1.set(o.base.x, LPB + o.h / 2, o.base.z), r: o.h * .6 }; } if (S.sel) return { p: S.sel.pos, r: 1.6 * S.sel.s }; return null; }
function holoPanel(on) {
  const R = $('#right'), want = on && R.style.display === 'flex', tg = want ? holoTarget() : null;
  if (!!tg !== HOLO.panel) { HOLO.panel = !!tg; document.body.classList.toggle('holo', HOLO.panel); if (!HOLO.panel) { R.style.left = R.style.top = ''; hLine.style.display = 'none'; } applyView(); }
  if (!tg) return;
  const s = v2.copy(tg.p).project(camera); if (s.z > 1) { hLine.style.display = 'none'; return; }
  const x = (s.x * .5 + .5) * innerWidth, y = (-s.y * .5 + .5) * innerHeight, ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360)), rp = tg.r * ph / Math.max(.1, camera.position.distanceTo(tg.p));
  const w = R.offsetWidth, h = R.offsetHeight, gap = rp + 90, left = x + gap + w < innerWidth - 12 ? x + gap : Math.max(12, x - gap - w), top = Math.min(innerHeight - h - 48, Math.max(56, y - h * .4));
  R.style.left = left + 'px'; R.style.top = top + 'px';
  const ex = left > x ? left : left + w, ey = Math.min(top + h - 20, Math.max(top + 20, y)); hLine.style.display = 'block';
  const l = hLine.firstChild; l.setAttribute('x1', x + (left > x ? rp : -rp) * .7); l.setAttribute('y1', y); l.setAttribute('x2', ex); l.setAttribute('y2', ey); hLine.lastChild.setAttribute('cx', ex); hLine.lastChild.setAttribute('cy', ey);
}

// --- Each frame ---
function stepHolo(dt) {
  const on = S.space === 'vivo' && VIEW.cur === 'espacio' && !S.enter && !S.enterLP && !VW.o && (S.layout === 'cluster' || S.layout === 'orbit');
  HOLO.on = on; HOLO.k += ((on ? 1 : 0) - HOLO.k) * Math.min(1, dt * 3); if (HOLO.k < .002) HOLO.k = 0;
  const k = HOLO.k; HOLO_U.value = k; holo.visible = k > 0; holoPanel(VIEW.cur === 'espacio' && !S.enter && !S.enterLP && !VW.o); // the card unfolds from the cube itself, in every space
  if (!k) return;
  for (const m of [tableMat, curtainMat, orbMat, beamMat, orbRim.material, ...GAUGES.map(g => g.mesh.material)]) m.uniforms.uK.value = k;
  lattice.material.opacity = .8 * k; gyro.forEach(g => g.material.opacity = .7 * k); hTrack.forEach(s => s.material.opacity = k);
  const t = performance.now() / 1000; lattice.rotation.set(t * .3, t * .45, 0); gyro[0].rotation.set(Math.PI / 2 + Math.sin(t * .4) * .5, t * .6, 0); gyro[1].rotation.set(t * .5, Math.PI / 3, Math.cos(t * .3) * .6);
  orb.scale.setScalar(1 + .04 * Math.sin(t * 2.2)); core.rotation.y = t * .06;
  const txt = t - HOLO.lastTxt > 1; if (txt) HOLO.lastTxt = t;
  for (const g of GAUGES) { const v = Math.max(0, Math.min(1, g.val() || 0)); g.v += (v - g.v) * Math.min(1, dt * 2.5); g.mesh.material.uniforms.uFill.value = g.v;
    g.lab.scale.set(pxScale(20) * 8, pxScale(20), 1); g.lab.material.opacity = k; if (txt) drawText(g.lab, [[`${g.name} ${Math.round(v * 100)} %`, 30, 'rgba(223,230,238,.95)', 32]]); }
}
