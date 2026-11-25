// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// In-space object viewer and process following (observe only).
// === Object Viewer ===
const VW = { o: null, prev: null };
function setCanvasTex(o) { const old = o.tex; o.tex = new THREE.CanvasTexture(o.cv); o.tex.colorSpace = THREE.SRGBColorSpace; o.tex.anisotropy = 8; o.mesh.material.map = o.tex; o.mesh.material.needsUpdate = true; if (old && old !== o.tex && !old.isVideoTexture) old.dispose(); }
const fmtT = s => !isFinite(s) ? '—' : `${s / 60 | 0}:${String(s % 60 | 0).padStart(2, '0')}`;
function drawHi(o) { // high-resolution text texture for reading in the viewer
  const i = o.info, cv = o.cv, g = cv.getContext('2d'), W = cv.width, H = cv.height, col = KIND_COL[i.kind] || '#888', top = 84;
  g.fillStyle = '#0f1216'; g.fillRect(0, 0, W, H); g.fillStyle = col; g.fillRect(0, 0, W, 5); g.textAlign = 'left';
  g.font = '600 24px "Segoe UI",sans-serif'; g.fillStyle = rgba(col, .95); g.fillText((KIND_TXT[i.kind] || i.kind).toUpperCase() + (i.ext ? ' · .' + i.ext : ''), 28, 48);
  g.fillStyle = 'rgba(200,208,214,.75)'; g.textAlign = 'right'; g.fillText(fmtB(i.size) + (i.lines ? ' · ' + i.lines + ' líneas' : ''), W - 28, 48); g.textAlign = 'left';
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(28, 64, W - 56, 1);
  if (i.table) { const rows = i.table, cols = Math.min(7, Math.max(...rows.map(r => r.length))), cw = (W - 56) / cols, lh = 40, nl = Math.floor((H - top - 20) / lh) - 1; o.vlines = rows.length; o.vpage = nl;
    const show = [rows[0], ...rows.slice(1 + o.scroll, 1 + o.scroll + nl)]; g.font = '22px "Cascadia Mono",Consolas,monospace';
    show.forEach((r, k) => { if (!k) { g.fillStyle = rgba(col, .16); g.fillRect(28, top, W - 56, lh); } for (let c = 0; c < cols; c++) { g.fillStyle = k ? 'rgba(230,234,237,.9)' : col; g.fillText(String(r[c] ?? '').slice(0, Math.floor(cw / 13.5) - 1), 36 + c * cw, top + 27 + k * lh); } g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(28, top + lh + k * lh, W - 56, 1); }); }
  else if (i.json) { const lh = 36, nl = Math.floor((H - top - 20) / lh); o.vlines = i.json.length; o.vpage = nl; g.font = '23px "Cascadia Mono",Consolas,monospace';
    i.json.slice(o.scroll, o.scroll + nl).forEach(([k, v], j) => { g.fillStyle = '#a9c6ea'; g.fillText(k.slice(0, 26), 36, top + 24 + j * lh); g.fillStyle = 'rgba(230,234,237,.9)'; g.fillText(v.slice(0, 66), 420, top + 24 + j * lh); }); }
  else if (i.text != null) { const ls = i.text.split('\n'), lh = 34, nl = Math.floor((H - top - 20) / lh); o.vlines = ls.length; o.vpage = nl; g.font = '23px "Cascadia Mono",Consolas,monospace';
    ls.slice(o.scroll, o.scroll + nl).forEach((l, k) => { const y = top + 22 + k * lh; g.fillStyle = 'rgba(150,160,168,.7)'; g.fillText(String(o.scroll + k + 1).padStart(4), 14, y); tokLine(g, l.replace(/\t/g, '  ').slice(0, 96), 96, y, W - 16); }); }
  else if (i.hex && !MEDIA_K.has(i.kind)) { const by = i.hex.match(/../g) || [], lh = 30; o.vlines = 0; g.font = '19px "Cascadia Mono",Consolas,monospace';
    for (let r = 0; r < Math.min(Math.floor((H - top) / lh), Math.ceil(by.length / 16)); r++) { const row = by.slice(r * 16, r * 16 + 16), y = top + 24 + r * lh; g.fillStyle = 'rgba(130,140,146,.55)'; g.fillText((r * 16).toString(16).padStart(4, '0'), 20, y);
      g.fillStyle = 'rgba(220,226,230,.88)'; g.fillText(row.join(' '), 96, y); g.fillStyle = rgba(col, .85); g.fillText(row.map(h => { const c = parseInt(h, 16); return c > 31 && c < 127 ? String.fromCharCode(c) : '·'; }).join(''), 720, y); } }
  else if (o.wave) { const N = o.wave.length, mid = H / 2, p = o.audio && o.audio.duration ? o.audio.currentTime / o.audio.duration : 0;
    for (let k = 0; k < N; k++) { const h = o.wave[k] * H * .38, x = 28 + k * (W - 56) / N; g.fillStyle = k / N <= p ? '#D97757' : rgba(col, .85); g.fillRect(x, mid - h, Math.max(1.5, (W - 56) / N - 1), h * 2); } }
  if (i.magic) { g.font = '18px "Segoe UI",sans-serif'; g.fillStyle = 'rgba(170,180,186,.7)'; g.fillText('firma: ' + i.magic, 28, H - 18); }
}
const MEDIA_K = new Set(['image', 'video', 'audio', 'model3d']); // these have a real view; their hex dump stays in the panel
const textLike = i => i.text != null || i.table || i.json || (i.hex && !MEDIA_K.has(i.kind));
function pdfPage(o, page, width) { return o.pdfQ = (o.pdfQ || Promise.resolve()).catch(() => {}).then(() => pdfPage1(o, page, width)); } // one render at a time on a canvas
async function pdfPage1(o, page, width) {
  if (!PDFJS) { PDFJS = await import('/vendor/pdfjs/pdf.min.mjs'); PDFJS.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs'; }
  if (!o.pdf) o.pdf = await PDFJS.getDocument({ url: rawURL(o.info.path), isEvalSupported: false }).promise;
  const p = Math.max(1, Math.min(o.pdf.numPages, page)); o.page = p; o.info.pages = o.pdf.numPages;
  const pg = await o.pdf.getPage(p), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: width / vp0.width }); if (!OB.list.includes(o)) return;
  o.cv.width = Math.round(vp.width); o.cv.height = Math.round(vp.height); const g = o.cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.cv.width, o.cv.height);
  await pg.render({ canvasContext: g, viewport: vp }).promise; setCanvasTex(o); o.aspect = vp.width / vp.height; renderVbar();
}
function hiRes(o) { const i = o.info;
  if (i.ext === 'pdf') return pdfPage(o, o.page || 1, 1500).catch(e => feed('error', '#C52235', 'PDF: ' + e.message));
  if (textLike(i) || o.wave) { o.cv.width = o.wave ? 1100 : 1400; o.cv.height = o.wave ? 560 : 1400; o.aspect = o.cv.width / o.cv.height; drawHi(o); setCanvasTex(o); } }
function lowRes(o) { const i = o.info;
  if (i.ext === 'pdf') return pdfPage(o, 1, 640).catch(() => {});
  if (textLike(i) || o.wave) { o.cv.width = 512; o.cv.height = 640; o.aspect = .8; drawCard(o); setCanvasTex(o); } }
function setFog(obj, on) { obj.traverse(m => { if (m.material) [].concat(m.material).forEach(x => { x.fog = on; x.needsUpdate = true; }); }); }
function enterViewer(o) {
  if (!o) return; if (VIEW.cur !== 'espacio') setView('espacio'); if (VW.o && VW.o !== o) exitViewer(true);
  OB.sel = o; S.mode = 'obj'; if (!VW.o) VW.prev = { p: camera.position.clone(), t: controls.target.clone() }; VW.o = o; o.view = true; o.scroll = o.scroll || 0;
  document.body.classList.add('viewer'); applyView(); hideMenu(); $('#tip').style.display = 'none';
  setFog(o.mesh, false); if (o.model) setFog(o.model, false); scene.fog.density = .2; particles.visible = false; controls.enableRotate = false; // a 3D model turns itself under the pointer (22-graphene); the camera stays put bloom.strength = 0;
  hiRes(o); renderVbar(); setTimeout(viewerFrame, 60);
}
function viewerFrame() { const o = VW.o; if (!o) return; // frames the object, leaving room for the viewer bar and the strip
  const vf = camera.fov * Math.PI / 180, t = Math.tan(vf / 2), fracV = Math.max(.4, (innerHeight - 270) / innerHeight), asp = innerWidth / innerHeight;
  const hh = o.model ? 3 : 4, w = o.model ? 3 : hh * o.aspect, d = Math.max(hh / 2 / t / fracV, w / 2 / (t * asp) / .9);
  focusT.copy(o.pos); focusDir = camera.position.clone().sub(controls.target).normalize(); focusD = d; focusSel = false; focusing = true; }
function exitViewer(noFly) {
  const o = VW.o; if (!o) return; o.view = false; VW.o = null; document.body.classList.remove('viewer'); applyView();
  setFog(o.mesh, true); if (o.model) setFog(o.model, true); scene.fog.density = SET.fog; particles.visible = true; controls.enableRotate = true; bloom.strength = SET.bloom;
  if (o.el && !o.el.muted) o.el.muted = true; if (o.audio) o.audio.pause(); if (OB.list.includes(o)) lowRes(o);
  if (!noFly && VW.prev) { focusT.copy(VW.prev.t); focusDir = VW.prev.p.clone().sub(VW.prev.t).normalize(); focusD = VW.prev.p.distanceTo(VW.prev.t); focusSel = false; focusing = true; }
  $('#vbar').innerHTML = ''; renderPanel();
}
const IC = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
function renderVbar() {
  const o = VW.o; if (!o) return; const i = o.info, m = o.el || o.audio; let ctr = '';
  if (i.ext === 'pdf') ctr = `<button class="ico" data-v="prev" data-tip="Página anterior" data-key="←">${IC('prev')}</button><span class="vpos">${o.page || 1} / ${i.pages || '…'}</span><button class="ico" data-v="next" data-tip="Página siguiente" data-key="→">${IC('next')}</button>`;
  else if (o.el || o.wave) ctr = `<button class="ico" data-v="play" data-tip="${m && !m.paused ? 'Pausar' : 'Reproducir'}" data-key="Espacio">${IC(m && !m.paused ? 'pause' : 'play')}</button>${o.el ? `<button class="ico" data-v="mute" data-tip="${o.el.muted ? 'Activar sonido' : 'Silenciar'}" data-key="M">${IC(o.el.muted ? 'mute' : 'sound')}</button>` : ''}<span class="vpos">${m ? fmtT(m.currentTime) + ' / ' + fmtT(m.duration) : '0:00'}</span>`;
  else if (textLike(i) && o.vlines) ctr = `<button class="ico" data-v="prev" data-tip="Retroceder" data-key="↑ · RePág">${IC('prev')}</button><span class="vpos">${o.scroll + 1}–${Math.min(o.vlines, o.scroll + (o.vpage || 0))} de ${o.vlines}${i.partial ? '+' : ''}</span><button class="ico" data-v="next" data-tip="Avanzar" data-key="↓ · AvPág">${IC('next')}</button>`;
  else if (o.model) ctr = `<span class="hint">Arrastra para girar alrededor del modelo</span>`;
  $('#vbar').innerHTML = `${IC('file')}<span class="vn">${esc(i.name)}</span><span class="vk">${esc(KIND_TXT[i.kind] || i.kind)} · ${fmtB(i.size)}${i.dims ? ' · ' + esc(i.dims) : ''}</span><div class="sep"></div>${ctr}${ctr ? '<div class="sep"></div>' : ''}
    <button class="ico" data-v="zout" data-tip="Alejar" data-key="−">${IC('zout')}</button><button class="ico" data-v="fit" data-tip="Ajustar a la pantalla" data-key="0">${IC('fit')}</button><button class="ico" data-v="zin" data-tip="Acercar" data-key="+">${IC('zin')}</button><div class="sep"></div>
    <button data-v="close" data-tip="Volver al espacio" data-key="Esc">${IC('close')}Cerrar</button>`;
}
$('#vbar').onclick = e => { const b = e.target.closest('[data-v]'); if (b) viewerAct(b.dataset.v); };
function viewerAct(a, n = 1) {
  const o = VW.o; if (!o) return; const i = o.info;
  if (a === 'close') return exitViewer(); if (a === 'fit') return viewerFrame();
  if (a === 'zin' || a === 'zout') { const d = camera.position.clone().sub(controls.target).multiplyScalar(a === 'zin' ? .8 : 1.25); camera.position.copy(controls.target).add(d); return; }
  if (a === 'play') { const m = o.el || o.audio || (o.wave ? (o.audio = Object.assign(new Audio(rawURL(i.path)), { onended: () => renderVbar() })) : null); if (m) { m.paused ? m.play().catch(() => {}) : m.pause(); } return renderVbar(); }
  if (a === 'mute' && o.el) { o.el.muted = !o.el.muted; if (!o.el.muted) o.el.play().catch(() => {}); return renderVbar(); }
  if (a === 'prev' || a === 'next' || a === 'up' || a === 'down') { const s = (a === 'next' || a === 'down' ? 1 : -1) * n;
    if (i.ext === 'pdf') { if (a === 'prev' || a === 'next') pdfPage(o, (o.page || 1) + s, 1500).catch(() => {}); return; }
    if (o.el) { o.el.currentTime = Math.max(0, Math.min(o.el.duration || 0, o.el.currentTime + s * 5)); return renderVbar(); }
    if (textLike(i) && o.vlines) { const step = a === 'up' || a === 'down' ? 3 : (o.vpage || 30) - 2; o.scroll = Math.max(0, Math.min(Math.max(0, o.vlines - 5), o.scroll + Math.sign(s) * step)); drawHi(o); o.tex.needsUpdate = true; renderVbar(); } }
}
addEventListener('keydown', e => { // the viewer owns the keyboard while open
  if (!VW.o || e.target.tagName === 'INPUT') return; const k = e.key, map = { Escape: 'close', ArrowLeft: 'prev', ArrowRight: 'next', ArrowUp: 'up', ArrowDown: 'down', PageUp: 'prev', PageDown: 'next', ' ': 'play', m: 'mute', M: 'mute', '+': 'zin', '=': 'zin', '-': 'zout', '0': 'fit' };
  e.preventDefault(); e.stopImmediatePropagation(); if (map[k]) viewerAct(map[k]);
}, true);
let vwAcc = 0;
function stepViewer(dt) { const o = VW.o; if (!o) return; vwAcc += dt; if (vwAcc < .25) return; vwAcc = 0; const m = o.el || o.audio;
  if (m && !m.paused) { renderVbar(); if (o.wave) { drawHi(o); o.tex.needsUpdate = true; } } }

// === Follow a Process (observe only) ===
const FW = { on: false, pid: null, id: null, name: '', snap: null, ev: [], hist: [], last: '', aiT: 0, timer: 0 };
const canFollow = nd => nd && nd.n.pid && !String(nd.n.pid).startsWith('g') && !['net', 'core', 'group-root'].includes(nd.n.kind);
function startFollow(nd) {
  if (!canFollow(nd)) return; stopFollow(true); S.follow = false;
  Object.assign(FW, { on: true, pid: nd.n.pid, id: nd.id, name: nodeName(nd.n), snap: null, ev: [], hist: [], last: '', aiT: Date.now() - 120000 });
  S.tabs.proc = 'seguir'; selectNode(nd); flyTo(nd.pos, 16); pollFollow(); FW.timer = setInterval(pollFollow, 2500); renderTop(); feed('siguiendo', '#D97757', FW.name);
}
function stopFollow(silent) { if (!FW.on) return; clearInterval(FW.timer); FW.on = false; renderTop(); if (!silent) feed('deja de seguir', '#8b95a3', FW.name); if (S.mode === 'proc') renderPanel(); }
function fwEvent(k, txt, col) { FW.ev.unshift({ t: Date.now(), k, txt, col }); FW.ev.length = Math.min(FW.ev.length, 120); FW.last = k + ' ' + txt; }
async function pollFollow() {
  if (!FW.on) return; let d; try { d = await apiT('/api/follow?pid=' + FW.pid); } catch { return; } if (!FW.on) return;
  if (d.gone) { fwEvent('termina', FW.name, '#C52235'); stopFollow(); return; }
  const prev = FW.snap; FW.pids = new Set(d.procs.map(p => p.pid));
  const root = d.procs.find(p => p.pid === d.pid); if (root) { FW.hist.push({ cpu: root.cpu, ws: root.ws, io: root.io }); if (FW.hist.length > 90) FW.hist.shift(); }
  if (prev) {
    const pp = new Map(prev.procs.map(p => [p.pid, p])), np = new Map(d.procs.map(p => [p.pid, p]));
    for (const [pid, p] of np) if (!pp.has(pid)) fwEvent('lanza', `${p.name} · ${p.cmd.replace(/^"[^"]*"\s*/, '').slice(0, 70)}`, '#1768B5');
    for (const [pid, p] of pp) if (!np.has(pid)) fwEvent('termina', p.name, '#8b95a3');
    const loc = c => c.state !== 'escucha' && /^(127.|::1$|::ffff:127.)/.test(c.rip || ''), ck = c => c.pid + '|' + (c.state === 'escucha' ? 'L' + c.lport : c.rip + ':' + c.rport);
    const nl = d.net.filter(loc).length, pl = prev.net.filter(loc).length; if (nl !== pl) FW.locals = nl;
    prev.net = prev.net.filter(c => !loc(c)); const dnet = d.net.filter(c => !loc(c)); const pc = new Set(prev.net.map(ck)), nc = new Set(dnet.map(ck));
    for (const c of dnet) if (!pc.has(ck(c))) fwEvent(c.state === 'escucha' ? 'escucha' : 'conecta', c.state === 'escucha' ? ':' + c.lport : `${c.host && c.host !== 'local' ? c.host : c.rip}:${c.rport}`, '#269B65');
    for (const c of prev.net) if (!nc.has(ck(c)) && c.state !== 'escucha') fwEvent('cierra', `${c.host && c.host !== 'local' ? c.host : c.rip}:${c.rport}`, '#8b95a3');
    if (prev.modules && d.modules) { const pm = new Set(prev.modules); d.modules.filter(m => !pm.has(m)).slice(0, 6).forEach(m => fwEvent('carga', m, '#E6B844')); }
    if (prev.files && d.files) { const pf = new Set(prev.files), nf = new Set(d.files); d.files.filter(f => !pf.has(f)).slice(0, 8).forEach(f => fwEvent('abre', f, '#1768B5')); prev.files.filter(f => !nf.has(f)).slice(0, 4).forEach(f => fwEvent('cierra', f, '#8b95a3')); }
  } else fwEvent('empieza', `${d.procs.length} proceso${d.procs.length > 1 ? 's' : ''} · ${d.net.length} conexiones${d.modules ? ' · ' + d.modules.length + ' módulos' : ''}${d.files ? ' · ' + d.files.length + ' archivos abiertos' : ''}`, '#D97757');
  // for Claude sessions, the tool trace also goes on the timeline
  const nd = G.nodes.get(FW.id); if (nd && nd.n.kind === 'claude') for (const s of S.sessions.values()) if (s.meta && (!nd.n.account || s.meta.account === nd.n.account)) for (const e of s.meta.trace) if (e.t > FW.aiT) { fwEvent('IA ' + e.op, e.abs ? base(e.abs) : e.target.slice(0, 70), '#D97757'); FW.aiT = Math.max(FW.aiT, e.t); }
  FW.snap = d; if (nd && VIEW.cur === 'sistema') { focusT.copy(nd.pos); focusing = true; focusDir = null; focusD = Math.min(30, Math.max(10, camera.position.distanceTo(controls.target))); }
  if (S.mode === 'proc' && S.tabs.proc === 'seguir') renderPanel();
}
function followFs(m, c) { if (!FW.on || !FW.pids || !m.who) return; for (const pid of FW.pids) if (m.who.includes('#' + pid)) { fwEvent(m.type, `${c.name}/${m.file.replace(/\\/g, '/')}`, '#1768B5'); break; } }
function renderFollowTab(el, nd) {
  if (!FW.on || FW.id !== nd.id) { el.innerHTML = canFollow(nd) ? `<div class="note" style="line-height:1.6">Acompaña en vivo a este proceso y a sus hijos: qué lanza, qué carga en memoria, con quién conecta y qué archivos toca. Solo observa; no lo modifica.</div><div class="acts"><button id="fw-go" class="ai on">${IC('eye')}Seguir ${esc(nodeName(nd.n))}</button></div>` : '<div class="note">Este nodo no se puede seguir.</div>';
    const b = $('#fw-go'); if (b) b.onclick = () => startFollow(nd); return; }
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span class="note">${FW.ev.length ? 'Siguiendo desde hace ' + ago(FW.ev[FW.ev.length - 1].t) : 'Siguiendo desde ahora'}${FW.locals ? ' · ' + FW.locals + ' conexiones locales' : ''}</span><button id="fw-stop">Dejar de seguir</button></div>
    <canvas id="fspark" width="680" height="88"></canvas><div class="hint" style="margin:-4px 0 8px"><i class="sw" style="background:#D97757"></i>CPU <i class="sw" style="background:#1768B5;margin-left:10px"></i>RAM</div>
    <div class="tl">${FW.ev.slice(0, 40).map(e => `<div style="--k:${e.col}"><time>${new Date(e.t).toTimeString().slice(0, 8)}</time><span><b>${esc(e.k)}</b> ${esc(e.txt)}</span></div>`).join('') || '<div class="note">Todavía no ha lanzado procesos, abierto conexiones ni tocado archivos. La gráfica de arriba ya muestra su CPU y RAM.</div>'}</div>`;
  $('#fw-stop').onclick = () => stopFollow();
  const cv = $('#fspark'), g = cv.getContext('2d'), W = cv.width, H = cv.height, hs = FW.hist.length === 1 ? [FW.hist[0], FW.hist[0]] : FW.hist; if (hs.length > 1) { g.fillStyle = 'rgba(200,208,214,.75)'; g.font = '12px Segoe UI'; g.fillText('CPU ' + hs[hs.length - 1].cpu + ' % · RAM ' + fmtB(hs[hs.length - 1].ws), 6, 14); const mc = Math.max(10, ...hs.map(h => h.cpu)), mw = Math.max(...hs.map(h => h.ws));
    [['cpu', mc, '#D97757'], ['ws', mw, '#1768B5']].forEach(([f, mx, col]) => { g.beginPath(); hs.forEach((h, i) => { const x = i / 89 * W, y = H - 4 - h[f] / mx * (H - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); }); }
}

