// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// HUD overlay: 2D canvas labels, data boxes and guide lines drawn over the 3D scene.
// === HUD Data Layer ===
const H2 = $('#hud2'), h2 = H2.getContext('2d');
function sizeHud() { const r = Math.min(2, devicePixelRatio || 1); H2.width = innerWidth * r; H2.height = innerHeight * r; h2.setTransform(r, 0, 0, r, 0, 0); }
addEventListener('resize', sizeHud); sizeHud();
const scr = v => { v1.copy(v).project(camera); return [(v1.x + 1) / 2 * innerWidth, (1 - v1.y) / 2 * innerHeight, v1.z < 1]; };
function hudBox(x, y, w, title, rows, col = '#1768B5') { // data box with a header and rows
  const hgt = 22 + rows.length * 15 + 6; h2.fillStyle = 'rgba(11,13,17,.78)'; h2.fillRect(x, y, w, hgt); h2.strokeStyle = 'rgba(255,255,255,.14)'; h2.lineWidth = 1; h2.strokeRect(x + .5, y + .5, w - 1, hgt - 1);
  h2.fillStyle = col; h2.fillRect(x, y, 3, hgt); h2.font = '600 10px "Segoe UI",sans-serif'; h2.fillText(title, x + 10, y + 15);
  rows.forEach((r, i) => { const yy = y + 32 + i * 15; if (r.bar != null) { h2.fillStyle = 'rgba(255,255,255,.07)'; h2.fillRect(x + 10, yy + 2, w - 20, 2); h2.fillStyle = r.col || col; h2.fillRect(x + 10, yy + 2, (w - 20) * Math.min(1, r.bar), 2); }
    h2.font = '11px "Cascadia Mono",Consolas,monospace'; h2.fillStyle = r.dim ? 'rgba(240,235,221,.5)' : 'rgba(240,235,221,.9)'; h2.fillText(String(r.l).slice(0, Math.floor((w - 20) / 6.6) - (r.r ? String(r.r).length + 1 : 0)), x + 10, yy - 2);
    if (r.r != null) { h2.textAlign = 'right'; h2.fillStyle = 'rgba(240,235,221,.6)'; h2.fillText(String(r.r), x + w - 10, yy - 2); h2.textAlign = 'left'; } });
  return hgt;
}
function leader(x1, y1, x2, y2, col = 'rgba(23,104,181,.6)') { h2.strokeStyle = col; h2.lineWidth = 1; h2.beginPath(); h2.moveTo(x1, y1); h2.lineTo(x2, y1 + (y2 - y1) * .0); h2.lineTo(x2, y2); h2.stroke(); h2.fillStyle = col; h2.beginPath(); h2.arc(x1, y1, 2.5, 0, 7); h2.fill(); }
const cpuEq = v => ((v || 0) / ((S.sys && S.sys.cpu.length) || 1)).toFixed(1); // % of the whole machine, as Task Manager shows it
const PROC_NOISE = /^(conhost|backgroundTaskHost|RuntimeBroker|dllhost|SearchProtocolHost|SearchFilterHost|WmiPrvSE|smartscreen|taskhostw|audiodg|sppsvc|TrustedInstaller|TiWorker)(\.exe)?$/i;
function onProcEv(m) { if (PROC_NOISE.test(m.name)) return;
  feed(m.type === 'inicia' ? 'inicia' : 'termina', m.type === 'inicia' ? '#269B65' : '#8b95a3', (m.win || m.name) + ' #' + m.pid + (m.parent ? ' · desde ' + m.parent : ''));
  for (const o of LP.values()) if (o.p.name === m.name) o.flash = performance.now(); }
function drawSysSel() {
  const nd = G.sel; if (!nd || !nd.n.pid) return; const pd = procDet.get(String(nd.n.pid)), d = pd && pd.d; if (!d || d.err) return;
  const [x, y, ok] = scr(nd.pos); if (!ok) return; const ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360)), r = Math.max(26, nd.size * SET.icon * .62 * ph / nd.pos.distanceTo(camera.position)), t = performance.now() / 1000;
  const hnd = d.handles || 0, [gdi, usr] = (d.gui || '0|0').split('|').map(Number), tot = hnd + gdi + usr;
  if (tot) { let a0 = -Math.PI / 2; h2.lineWidth = 4; for (const [v, col] of [[hnd, '#1768B5'], [gdi, '#269B65'], [usr, '#D97757']]) { if (!v) continue; const a1 = a0 + v / tot * Math.PI * 2; h2.strokeStyle = col; h2.beginPath(); h2.arc(x, y, r + 10, a0 + .03, a1 - .03); h2.stroke(); a0 = a1; } }
  const th = d.thl || [], mx = Math.max(1, ...th.map(q => q.dc || 0)); // threads orbit as dots; brightness and size = CPU used since the last sample
  th.forEach((q, i) => { const ring = i % 3, rr = r + 22 + ring * 9, sp = .25 + (q.dc / mx) * 1.2, a = i / th.length * Math.PI * 2 + t * sp * (ring % 2 ? -1 : 1), act = q.dc / mx;
    h2.fillStyle = act > .02 ? 'rgba(217,119,87,' + (.35 + .65 * act) + ')' : q.s === 'Running' ? 'rgba(217,119,87,.6)' : 'rgba(174,182,189,.35)'; h2.beginPath(); h2.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * .55, 1.5 + act * 3, 0, 7); h2.fill(); });
  h2.font = '600 11px "Segoe UI",sans-serif'; h2.textAlign = 'center'; const txt = (d.threads || th.length) + ' hilos · ' + fmtN(hnd) + ' identificadores' + (gdi || usr ? ' · ' + gdi + ' GDI · ' + usr + ' USER' : ''), w = h2.measureText(txt).width + 16, yy = y + r + 52;
  h2.fillStyle = 'rgba(11,13,17,.8)'; h2.fillRect(x - w / 2, yy - 13, w, 19); h2.fillStyle = '#d9dee3'; h2.fillText(txt, x, yy); h2.textAlign = 'left';
}
function drawHud() {
  h2.clearRect(0, 0, innerWidth, innerHeight); if (!VW.o && VIEW.cur === 'tareas') return drawTasks(); if (!VW.o && VIEW.cur === 'sistema') return drawSysSel(); if (VW.o || VIEW.cur !== 'espacio') return;
  const L = $('#left').offsetWidth + 18, R = innerWidth - ($('#right').style.display === 'flex' ? $('#right').offsetWidth + 18 : 8), T = 120, B = innerHeight - 64, now = Date.now();
  // chips under each label: activity source (Live) or folder type
  h2.font = '600 10px "Segoe UI",sans-serif';
  const famOf = c => !S.sel || c === S.sel || (c.parent && K(c.parent) === S.sel.key) || (S.sel.parent && K(S.sel.parent) === c.key);
  for (const c of S.vorder || []) { if (c.labelOn === false || c.s < .1 || !famOf(c) || (S.layout === 'stack' && c.depth && c !== S.sel && !(S.hover && S.hover.c === c))) continue; const [x, y, ok] = scr(c.label.position); if (!ok || x < L || x > R) continue;
    let chips = []; if (c.act && c.act.fading && c.act.leaveAt) { const sLeft = Math.max(0, (c.act.leaveAt - now) / 1000 | 0); chips = [['se apaga · ' + sLeft + ' s', '#9aa4ab']]; }
    // no source/type chips here: the lid color and emblem already convey that
    if (!c.data) chips.unshift(['leyendo…', '#8b95a3']);
    let w = chips.reduce((s, [t]) => s + h2.measureText(t).width + 16, 0), xx = x - w / 2; const yy = y + 6;
    for (const [t, col] of chips) { const tw = h2.measureText(t).width + 12; h2.globalAlpha = c.act && c.act.fading ? .45 : 1; h2.strokeStyle = col; h2.strokeRect(xx + .5, yy + .5, tw, 15); h2.fillStyle = col; h2.fillText(t, xx + 6, yy + 11); xx += tw + 4; } h2.globalAlpha = 1; }
  // selected cube: four data boxes joined by guide lines
  const c = S.sel; if (!c || !c.data || c.vis === false || S.mode !== 'cube') return;
  const [cx, cy, ok] = scr(c.pos); if (!ok) return; const [ex] = scr(v3.copy(c.pos).addScaledVector(camR.setFromMatrixColumn(camera.matrixWorld, 0), 1.6 * c.s * (1 + .9 * c.ex))); const r = Math.max(40, Math.abs(ex - cx));
  const d = c.data;
  // one guide line to the side card (an HTML panel with collapsible sections)
  const dk = $('#dock'); if (dk.style.display === 'block') { const b = dk.getBoundingClientRect(); DOCK.side === 'left' ? leader(cx - r * .9, cy - r * .2, b.right + 2, b.top + 16, 'rgba(23,104,181,.5)') : leader(cx + r * .9, cy - r * .2, b.left - 2, b.top + 16, 'rgba(23,104,181,.5)'); }
}

