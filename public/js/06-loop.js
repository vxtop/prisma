// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Render loop: per-frame animation of cubes, windows, particles, selection and labels,
// plus adaptive resolution.
// === Render Loop ===
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches; // no travelling shimmer for people who ask for less motion
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camR = new THREE.Vector3();
const selTrack = { c: null, p: new THREE.Vector3() };
let uiAcc = 0, fpsAcc = 0, fpsN = 0, slowT = 0, fastT = 0;
function tick() {
  requestAnimationFrame(tick); if (document.body.classList.contains('gal')) { clock.getDelta(); return; } // the media gallery covers the space: no 3D frames meanwhile
  const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime, now = Date.now(), kf = 1 - Math.pow(.0006, dt);
  if (!REDUCED_MOTION) shimmer.value = t;
  handleMove();
  // the camera follows the selected cube when the layout moves it (new cubes, ring changes)
  if (S.sel && S.space === 'vivo' && VIEW.cur === 'espacio' && !S.ptr && !VW.o) { if (selTrack.c === S.sel && !focusing) { tmp.subVectors(S.sel.pos, selTrack.p); const l2 = tmp.lengthSq(); if (l2 > 1e-8 && l2 < 900) { controls.target.add(tmp); camera.position.add(tmp); } } selTrack.c = S.sel; selTrack.p.copy(S.sel.pos); } else selTrack.c = null;
  if (focusing && focusDir) { if (focusSel && S.sel) focusT.copy(S.sel.pos); /* while centering, track the cube even if the layout repositions it */ tmp.copy(focusT).sub(controls.target).multiplyScalar(kf); controls.target.add(tmp); tmp2.copy(focusT).addScaledVector(focusDir, focusD); camera.position.lerp(tmp2, kf * .8);
    if (camera.position.distanceToSquared(tmp2) < 1e-4) { focusing = false; focusDir = null; } }
  else if (focusing) { tmp.copy(focusT).sub(controls.target).multiplyScalar(kf); controls.target.add(tmp); camera.position.add(tmp);
    tmp2.copy(camera.position).sub(controls.target); const len = tmp2.length(), nl = len + (focusD - len) * kf * .7; camera.position.copy(controls.target).add(tmp2.multiplyScalar(nl / len));
    if (!S.follow && tmp.lengthSq() < 1e-8 && Math.abs(len - focusD) < .05) focusing = false; }
  const lp = linkGeo.attributes.position.array; let ln = 0; const geo = S.geoDirty; S.geoDirty = false;
  const dec = Math.pow(.3, dt), pdec = Math.pow(.12, dt);
  const gone = [];
  for (const c of S.order) {
    let tgt = c.home;
    if (c.manual) tgt = c.manual;
    else if (c.rel) { const p = c.rel.p.pos, a = c.rel.a + t * c.rel.spin, Rr = c.rel.R + 1.5 * c.rel.p.s * .9 * c.rel.p.ex; tgt = tmp.set(p.x + Math.cos(a) * Rr, p.y + Math.sin(a) * Rr * c.rel.tilt, p.z + Math.sin(a) * Rr); } // when a parent opens, its children move with it
    let ts = c.vis === false || c.leaving || performance.now() < (c.born || 0) ? .001 : c.tScale;
    if (c.leaving && performance.now() - c.leaving > 650) { gone.push(c); continue; }
    if (S.space === 'vivo' && c.act && c.vis !== false) { const cool = vivoCool(c), heat = vivoHeat(c); if (cool) { tgt = tmp2.copy(tgt); tgt.y -= cool * 1.6; ts *= 1 - .32 * cool; }
      else if (heat > .05 && c !== S.sel) ts *= 1 + .022 * heat * Math.sin(t * (1.1 + 2.2 * heat) + c.seq); } // subtle breathing, faster with more activity
    if (c.off.lengthSq() > 1e-6) tgt = offT.copy(tgt).add(c.off);
    c.pos.lerp(tgt, S.space === 'vivo' ? kf * .3 : kf); c.s += (ts - c.s) * kf;
    if (c.arrive) { if (performance.now() > c.arrive.until) c.arrive = null; else if (Math.random() < dt * 30) emit(c.arrive.from, c.pos, c.arrive.col, 1, .7, .25, .08); }
    if (!c.data && c.vis !== false) { for (let i = 0; i < 27; i++) c.pulse[i] = Math.max(c.pulse[i], .2 * (.5 + .5 * Math.sin(t * 5 - i * .45))); c.cellDirty = true; } // reading: a wave across the cells
    { const ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360)), rp = 1.6 * c.s * ph / Math.max(.1, camera.position.distanceTo(c.pos)), prox = Math.min(1, Math.max(0, (rp - 170) / 330));
      const deep = c.deepT && Date.now() - c.deepT < 6000 ? .25 : 0, quietN = S.follow && S.followC && c !== S.followC && c !== S.sel, want = quietN ? 0 : c === S.sel && S.exploded ? 1 : Math.min(.85, (c === S.sel ? Math.max(OPEN_EX, prox * .6) : prox * .5) + deep);
      c.rp = rp; c.ex = 0; } // one body: it no longer opens into cells // the closer, the more it opens; a deep change opens it briefly
    const L = c.last; if (geo || L[0] !== c.pos.x || Math.abs(L[1] - c.pos.y) + Math.abs(L[2] - c.pos.z) > 1e-5 || Math.abs(L[3] - c.s) > 1e-5 || Math.abs(L[4] - c.ex) > 1e-5) {
      if (geo || isNaN(L[0]) || Math.abs(L[0] - c.pos.x) + Math.abs(L[1] - c.pos.y) + Math.abs(L[2] - c.pos.z) + Math.abs(L[3] - c.s) + Math.abs(L[4] - c.ex) > 2e-5) writeCube(c);
      L[0] = c.pos.x; L[1] = c.pos.y; L[2] = c.pos.z; L[3] = c.s; L[4] = c.ex; }
    // cell brightness (only when changed)
    let pk = 0; for (let i = 0; i < 27; i++) { if (c.pulse[i] > .002) { c.pulse[i] *= pdec; pk = 1; } else c.pulse[i] = 0; }
    if (pk || c.cellDirty || geo) { c.cellDirty = false; const b0 = c.slot * 27, hv = S.hover && S.hover.c === c ? S.hover.idx : -1, sc = c === S.sel ? c.cell : -1;
      { let ht = 0, pu = 0; for (let i = 0; i < 27; i++) { ht += c.heat[i]; pu = Math.max(pu, c.pulse[i]); } // the whole body glows with its activity
        const col = c.flashC && pu > .03 ? c.flashC : GEM[c.gem || 'folder'][1]; if (pu <= .03) c.flashC = null;
        const h = Math.min(.6, ht * .012 + pu * .7 + (hv >= 0 ? .05 : 0)) * (c.dimF || 1); for (let i = 0; i < 27; i++) { const o = (b0 + i) * 3, v = i === 13 ? h : 0; CG[o] = col.r * v; CG[o+1] = col.g * v; CG[o+2] = col.b * v; } }
      glowAttr.addUpdateRange(b0 * 3, 81); glowAttr.needsUpdate = true; }
    // windows: base color + flashes
    let vk = 0; if (c.colDirty || geo) vk = 1; else for (let k = 0; k < c.nv; k++) if (c.vheat[k] > 0) { vk = 1; break; }
    if (vk && c.nv) { c.colDirty = false; const v0 = c.slot * VPC * 3;
      for (let k = 0; k < c.nv; k++) { const h = c.vheat[k], o = k * 3; if (h > .003) c.vheat[k] = h * dec; else c.vheat[k] = 0;
        const df = c.dimF || 1; VC[v0+o] = (c.vbase[o] + c.vfl[o] * h) * df; VC[v0+o+1] = (c.vbase[o+1] + c.vfl[o+1] * h) * df; VC[v0+o+2] = (c.vbase[o+2] + c.vfl[o+2] * h) * df; }
      voxIM.instanceColor.addUpdateRange(v0, c.nv * 3); voxIM.instanceColor.needsUpdate = true; }
    const par = c.parent && S.cubes.get(K(c.parent));
    if (par && c.vis !== false && par.vis !== false && par.key !== S.enter) { lp[ln*6] = par.pos.x; lp[ln*6+1] = par.pos.y; lp[ln*6+2] = par.pos.z; lp[ln*6+3] = c.pos.x; lp[ln*6+4] = c.pos.y; lp[ln*6+5] = c.pos.z; ln++; }
    if (c.emb === undefined) applyKind(c);
    if (c.emb && c.kind) { const sp = (1 + .9 * c.ex) * c.s; c.emb.visible = c.vis !== false && c.key !== S.enter && c.s > .08 && !c.leaving && VIEW.cur === 'espacio' && !VW.o; c.emb.position.set(c.pos.x, c.pos.y + sp + .47 * c.s, c.pos.z); c.emb.scale.setScalar(c.s * 1.2); }
    const lab = c.label, lh = c === S.sel ? 46 : c.depth ? 34 : 40; lab.position.set(c.pos.x, c.pos.y + (c.key === S.enter ? Math.max(IN.cur / 2, 1.5) + .25 : 1.72 * c.s + .12), c.pos.z); lab.scale.set(pxScale(lh) * 8, pxScale(lh), 1); lab.visible = c.labelOn !== false && c.vis !== false && c.s > .08 && !c.leaving && !(c.dimF < 1) && !(S.layout === 'stack' && c.depth && c !== S.sel && !(S.hover && S.hover.c === c)); { const fam = !S.sel || c === S.sel || (c.parent && K(c.parent) === S.sel.key) || (S.sel.parent && K(S.sel.parent) === c.key); lab.material.opacity += ((fam ? 1 : .32) - lab.material.opacity) * kf; }
  }
  linkGeo.setDrawRange(0, ln * 2); linkGeo.attributes.position.needsUpdate = true; inStep(dt, kf);
  if (gone.length) { gone.forEach(c => { if (S.cubes.get(c.key) === c) dropCube(c); }); layout(); renderCubes(); $('#empty').style.display = S.cubes.size || VIEW.cur !== 'espacio' ? 'none' : 'block'; } // once fully empty, the welcome prompt appears
  if (VIEW.cur === 'espacio') spaceBodies(dt);
  stepProbes(dt, t, now); stepObjects(dt); stepSystem(dt); stepTasks(dt); stepTree(dt);
  stepParticles(t); if (VIEW.cur === 'espacio') declutterCubes(dt); peekTick();
  { // brackets on the hovered cube
    const hc = S.hover && S.hover.c !== S.sel && S.hover.c.vis !== false ? S.hover.c : null; hovBr.visible = !!hc && !VW.o;
    if (hc) { const hp = hovGeo.attributes.position.array, h = 1.6 * hc.s * (1 + .9 * hc.ex), L = h * .22; let o = 0;
      for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) { const x = hc.pos.x + sx * h, y = hc.pos.y + sy * h, z = hc.pos.z + sz * h; hp.set([x, y, z, x - sx * L, y, z, x, y, z, x, y - sy * L, z, x, y, z, x, y, z - sz * L], o); o += 18; }
      hovGeo.attributes.position.needsUpdate = true; } }
  stepViewer(dt); stepLiveProcs(dt, t); drawHud();
  uiAcc += dt; if (uiAcc > .25) { uiAcc = 0; renderDock(); renderHud(); renderCrumb(); renderLoad(); if (feedDirty) { feedDirty = false; $('#feed').innerHTML = S.feed.map(f => `<span class="chip" style="--k:${f.color}"><b>${esc(f.kind)}</b> ${esc(f.text)}</span>`).join(''); } }
  if (!VW.o) scene.fog.density = SET.fog * Math.min(1, Math.max(VIEW.cur === 'arbol' ? .004 : Math.max(.02, Math.min(.12, 70 / Math.max(1, camera.position.distanceTo(controls.target)))), 24 / Math.max(1, camera.position.distanceTo(controls.target)))); // the tree can be viewed from far away without fading
  grain.uniforms.uT.value = t % 10;
  controls.update(); composer.render();
  // adaptive resolution: no stutter as the scene grows
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { const fps = fpsN / fpsAcc; $('#fps').textContent = `${fps.toFixed(0)} fps · ${DPR.toFixed(2)}x`; fpsAcc = 0; fpsN = 0;
    if (fps < 50) { slowT++; fastT = 0; } else if (fps > 58) { fastT++; slowT = 0; } else { slowT = fastT = 0; }
    if (slowT >= 2 && DPR > .6) { DPR = Math.max(.6, DPR - .2); resize(); slowT = 0; } else if (fastT >= 5 && DPR < Math.min(devicePixelRatio, SET.dpr)) { DPR = Math.min(Math.min(devicePixelRatio, SET.dpr), DPR + .1); resize(); fastT = 0; } }
}
const offT = new THREE.Vector3();
const AMB_AI = new THREE.Color(.45, .24, .17);

