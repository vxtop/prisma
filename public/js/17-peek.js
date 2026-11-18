// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Hover preview: live windows, recent files and open files for the cube under the cursor;
// also exposes test hooks on window.__prisma.
// === Hover Preview ===
// Folder cube: live windows of programs using it, recently touched files and files a program has open.
// Program cube: its live window and what it touched last. Images/videos are shown; text shows its first lines. Hides when the cursor leaves.
const PK = { key: null, cand: null, t0: 0, el: null, items: [], shotT: 0, anchor: null, gen: 0 };
const pkEl = document.createElement('div'); pkEl.id = 'peekbox'; document.body.appendChild(pkEl);
const PK_IMG = /\.(png|jpe?g|gif|webp|bmp|avif|ico|svg)$/i, PK_VID = /\.(mp4|webm|mov|m4v|ogv|mkv)$/i, PK_TXT = /\.(txt|md|log|json|js|mjs|ts|tsx|jsx|css|html?|py|ps1|bat|cmd|ini|ya?ml|toml|csv|xml|c|cpp|h|cs|java|go|rs|sh|sql)$/i;
const pkUrl = (ep, p) => '/api/' + ep + '?t=' + TK() + '&path=' + encodeURIComponent(p);
function pkTarget() {
  if (VIEW.cur !== 'espacio' || VW.o || S.ptr || ctxEl.style.display === 'block') return null;
  if (S.lpHover && !S.lpHover.dead) return { key: 'lp:' + S.lpHover.id, lp: S.lpHover };
  if (S.hover && S.hover.c && S.hover.c.data) return { key: 'c:' + S.hover.c.key, c: S.hover.c };
  return null;
}
function pkHide() { PK.key = null; PK.gen++; pkEl.classList.remove('on'); setTimeout(() => { if (!PK.key) { for (const v of pkEl.querySelectorAll('video')) { v.pause(); v.removeAttribute('src'); v.load(); } pkEl.innerHTML = ''; } }, 180); }
function pkCard(it) {
  const who = it.who ? '<em class="' + (it.by === 'Claude' ? 'ai' : it.by && /^tú/.test(it.by) ? 'you' : '') + '">' + esc(it.who) + '</em>' : '';
  if (it.win) return '<div class="pc win"><img data-win="' + esc(it.pids) + '" alt=""><b>' + esc(it.name) + '</b>' + (it.title ? '<span>' + esc(it.title) + '</span>' : '') + '</div>';
  const n = esc(it.name), head = '<b>' + n + '</b><span>' + esc(it.sub || '') + '</span>' + who;
  if (PK_IMG.test(it.path)) return '<div class="pc"><img src="' + pkUrl('thumb', it.path) + '" alt="">' + head + '</div>';
  if (PK_VID.test(it.path)) return '<div class="pc"><video muted autoplay loop playsinline preload="metadata" src="' + pkUrl('raw', it.path) + '"></video>' + head + '</div>';
  if (PK_TXT.test(it.path)) return '<div class="pc"><pre data-txt="' + esc(it.path) + '">…</pre>' + head + '</div>';
  return '<div class="pr"><i>' + esc((it.path.match(/\.([a-z0-9]{1,5})$/i) || [, '·'])[1].toLowerCase()) + '</i><b>' + n + '</b><span>' + esc(it.sub || '') + '</span>' + who + '</div>';
}
function pkBuild(tg) {
  const gen = ++PK.gen, now = Date.now(), items = [], seen = new Set(), add = it => { const k = it.win ? 'w' + it.pids : K(it.path); if (seen.has(k) || items.length >= 12) return; seen.add(k); items.push(it); };
  let title = '';
  if (tg.c) { const c = tg.c, base = trimSep(c.path) + SEP(c.path); title = c.name;
    if (SET.screens) for (const o of LP.values()) if (!o.dead && o.p.win && (o.p.links || []).some(l => K(l) === c.key)) add({ win: true, pids: (o.p.pids || [o.p.pid]).join(','), name: o.p.name, title: o.p.win });
    const L = c.live; if (L) for (const rel of L.files) { const t = L.at.get(rel) || 0; if (now - t > 180000) continue; const ev = c.events.find(e => e.file === rel); add({ path: base + rel, name: rel.split(/[\\/]/).pop(), sub: (ev ? ev.type + ' · ' : '') + ago(t), who: ev ? (ev.by === 'Claude' ? 'Claude' : byYou(ev) || (ev.who || '').replace(/ #\d+.*/, '')) : '', by: ev && (ev.by === 'Claude' ? 'Claude' : byYou(ev)) }); }
    apiT('/api/inuse?path=' + encodeURIComponent(c.path)).then(v => { if (gen !== PK.gen) return; const before = items.length; for (const x of v.open || []) add({ path: base + x.file, name: x.file.split(/[\\/]/).pop(), sub: 'abierto ahora', who: x.who.map(w => w.name).slice(0, 2).join(', ') }); if (items.length !== before) pkRender(title, items, gen); }).catch(() => {});
  } else { const o = tg.lp; title = o.p.name;
    if (o.p.win && SET.screens) add({ win: true, pids: (o.p.pids || [o.p.pid]).join(','), name: o.p.name, title: o.p.win });
    const pids = new Set(o.p.pids || [o.p.pid]);
    for (const c of S.cubes.values()) for (const ev of c.events.slice(0, 12)) { if (now - ev.t > 180000) continue; const ps = [...String(ev.who || '').matchAll(/#(\d+)/g)].map(x => +x[1]); if (!ps.some(p => pids.has(p))) continue; add({ path: trimSep(c.path) + SEP(c.path) + ev.file, name: ev.file.split(/[\\/]/).pop(), sub: ev.type + ' · ' + ago(ev.t) }); } }
  PK.items = items; pkRender(title, items, gen);
}
function pkRender(title, items, gen) {
  if (!items.length) { pkEl.innerHTML = '<div class="ph">' + esc(title) + '</div><div class="pe">nada en uso ahora mismo</div>'; pkEl.classList.add('on'); return; }
  const H = items.map(pkCard), cards = H.filter(h => !h.startsWith('<div class="pr"')), rows = H.filter(h => h.startsWith('<div class="pr"'));
  pkEl.innerHTML = '<div class="ph">' + esc(title) + ' · en uso ahora</div>' + (cards.length ? '<div class="pg">' + cards.join('') + '</div>' : '') + (rows.length ? '<div class="pl">' + rows.join('') + '</div>' : ''); pkEl.classList.add('on');
  for (const pre of pkEl.querySelectorAll('pre[data-txt]')) apiT('/api/file?path=' + encodeURIComponent(pre.dataset.txt)).then(v => { if (gen !== PK.gen) return; if (v.text && v.text.trim()) pre.textContent = v.text.split(/\r?\n/).slice(0, 9).join('\n').slice(0, 600); else pre.closest('.pc').classList.add('nt'); }).catch(() => { pre.closest('.pc').classList.add('nt'); });
  pkShots();
}
function pkShots() { PK.shotT = performance.now(); for (const im of pkEl.querySelectorAll('img[data-win]')) { const u = '/api/winshot?t=' + TK() + '&pids=' + im.dataset.win + '&n=' + Date.now(); fetch(u, { cache: 'no-store' }).then(r => r.status === 200 ? r.blob() : null).then(b => { if (!im.isConnected) return; if (!b) { if (!im.src) im.closest('.pc').classList.add('gone'); return; } im.closest('.pc').classList.remove('gone'); const old = im.src; im.src = URL.createObjectURL(b); if (old.startsWith('blob:')) URL.revokeObjectURL(old); }).catch(() => {}); } }
function peekTick() {
  const tg = pkTarget(), now = performance.now();
  if (!tg) { PK.cand = null; if (PK.key && now - (PK.leave || (PK.leave = now)) > 220) pkHide(); return; } PK.leave = 0;
  if (tg.key !== PK.key) { if (PK.cand !== tg.key) { PK.cand = tg.key; PK.t0 = now; } if (now - PK.t0 < 280) return; PK.key = tg.key; PK.anchor = tg; pkBuild(tg); } else PK.anchor = tg;
  if (now - PK.shotT > 1200) pkShots(); // refresh live window shots while hovering
  const p = tg.c ? tg.c.pos : v3.set(tg.lp.base.x, LPB + tg.lp.h, tg.lp.base.z), a = v1.copy(p).project(camera); if (a.z > 1) return;
  const x = (a.x + 1) / 2 * innerWidth, y = (1 - a.y) / 2 * innerHeight, w = pkEl.offsetWidth, h = pkEl.offsetHeight, Lm = $('#left').offsetWidth + 16, Rm = innerWidth - ($('#right').style.display === 'flex' ? $('#right').offsetWidth + 16 : 16);
  /* above the cube (the cursor tip goes below); to the side if it doesn't fit */ let px = x - w / 2, py = y - h - 70; if (py < 60) { py = Math.max(60, Math.min(innerHeight - 70 - h, y - h / 2)); px = x + 110; if (px + w > Rm) px = x - 110 - w; } px = Math.max(Lm, Math.min(Rm - w, px));
  pkEl.style.transform = 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px)';
}
window.__prisma = S; S.pickAt = (x, y) => { const m = pick({ clientX: x, clientY: y }); return m ? (m.c ? m.c.key : m.tn ? m.tn.key : m.node ? m.node.id : m.o ? "obj" : m.task ? "task" : null) : (pickLP(x, y) ? "lp" : null); }; /* test hook: what is under a point */ S.TR = TR; S.trOpen = trOpen; S.openObject = openObject; S.trToggle = trToggle; S.trLevels = trLevels; S.camera = camera; S.controls = controls; S.fitAll = () => fitAll(); S.enterCube = (...a) => enterCube(...a); S.leaveLevel = () => leaveLevel(); S.openObject = openObject; S.setView = setView; S.G = G; S.OB = OB; S.TKS = TKS; S.selectTask = it => selectTask(it); S.LP = LP; S.GH = GH; S.selectNode = n => selectNode(n); S.selectLP = o => selectLP(o);
