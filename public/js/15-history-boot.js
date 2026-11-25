// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Browser history integration (Back/Forward step through prisma views) and client boot.
// === History ===
// Each change of view, space, level, selection or viewer is one history step. Back on the first step stays in the app.
const NAV = { restoring: false, t: 0, last: '' };
const navState = () => ({ prisma: 1, view: VIEW.cur, space: S.space, enter: S.enter, sel: S.sel ? S.sel.key : null, obj: OB.sel && S.mode === 'obj' ? OB.sel.path : null, viewer: VW.o ? VW.o.path : null, node: VIEW.cur === 'sistema' && G.sel ? G.sel.id : null });
function navPush() { if (NAV.restoring) return; clearTimeout(NAV.t); NAV.t = setTimeout(() => { const st = navState(), k = JSON.stringify(st); if (k === NAV.last) return; NAV.last = k; history.pushState(st, ''); }, 60); }
async function navApply(st) {
  NAV.restoring = true;
  try {
    if (st.space && st.space !== S.space && S.spaces.some(x => x.id === st.space)) { await post('/api/space', { action: 'switch', id: st.space }).catch(() => {}); await new Promise(r => setTimeout(r, 350)); }
    if (VW.o && !st.viewer) exitViewer();
    if (st.view !== VIEW.cur) setView(st.view);
    if (st.view === 'tareas') { TKS.sel = null; if (S.mode === 'task') S.mode = 'cube'; renderPanel(); }
    else if (st.view === 'sistema') { const nd = st.node && G.nodes.get(st.node); if (nd) selectNode(nd); else { G.sel = null; S.mode = 'cube'; renderPanel(); } }
    else {
      S.enter = st.enter && S.cubes.has(st.enter) ? st.enter : null; layout();
      const c = st.sel && S.cubes.get(st.sel); if (c) select(c, false); else deselect();
      const o = (st.viewer || st.obj) && OB.list.find(x => x.path === (st.viewer || st.obj));
      if (o && st.viewer) enterViewer(o); else if (o) selectObj(o, false);
      setTimeout(fitAll, 250);
    }
  } finally { NAV.last = JSON.stringify(navState()); NAV.restoring = false; }
}
addEventListener('popstate', e => {
  const st = e.state;
  if (!st || !st.prisma || st.root) { history.go(1); return; } // first step: stay in Prisma without clearing the Forward history
  navApply(st);
});
history.replaceState({ prisma: 1, root: true }, ''); history.pushState(navState(), ''); NAV.last = JSON.stringify(navState());
{ // every navigation records a history step
  const w = f => function (...a) { const r = f.apply(this, a); navPush(); return r; };
  setView = w(setView); select = w(select); deselect = w(deselect); selectNode = w(selectNode); selectObj = w(selectObj);
  enterViewer = w(enterViewer); exitViewer = w(exitViewer); leaveLevel = w(leaveLevel); onSpaceChange = w(onSpaceChange);
  enterCube = (f => async (...a) => { const r = await f(...a); navPush(); return r; })(enterCube);
}

// === Boot ===
resize(); requestAnimationFrame(tick); renderTop();
const es = new EventSource('/api/events');
es.onmessage = ev => { const m = JSON.parse(ev.data);
  if (m.k === 'fg') onFg(m); else if (m.k === 'state') { applyState(m); if (m.fg && (!S.fg || S.fg.t !== m.fg.t)) onFg(m.fg); } else if (m.k === 'proc') onProcEv(m); else if (m.k === 'fs') onFs(m); else if (m.k === 'index') onIndex(m); else if (m.k === 'assistant') onAssistant(m); else if (m.k === 'show') onShow(m).catch(() => {}); else if (m.k === 'reload') devReload(m); else if (m.k === 'fit') { if (VIEW.cur === 'espacio' && !S.sel) setTimeout(fitAll, 500); }
  else if (m.k === 'log') feed(m.by === 'ia' ? 'IA' : 'usuario', m.by === 'ia' ? '#D97757' : '#1768B5', `${m.action} ${base(m.target)}`); };
api('/api/version').then(v => { if (v.running !== v.disk) feedStale(); }).catch(() => feedStale()); // older servers have no /api/version
function feedStale() { const b = document.createElement('div'); b.id = 'stale'; b.innerHTML = '<b>Prisma se ha actualizado</b> pero el servidor en marcha es el anterior: cierra esta ventana y vuelve a abrir <b>prisma.vbs</b>.'; document.body.appendChild(b); }
api('/api/state').then(st => { S.platform = st.platform; CI = st.platform === 'win32' || st.platform === 'darwin'; }).catch(() => {});
pollSys(); setInterval(pollSys, 1000); pollProcs(); let procT = 0; setInterval(() => { procT += 3; const need = S.tab === 'procs' || (typeof VIEW !== 'undefined' && VIEW.cur === 'sistema'); if (procT >= (need ? 6 : 20)) { procT = 0; pollProcs(); } }, 3000);
setInterval(() => { const set = new Set(S.cores); if (S.sel) set.add(S.sel); set.forEach(pollAgent); }, 4000);
setInterval(pollPulse, 1200); setTimeout(pollPulse, 600);
setInterval(() => { const c = S.sel; if (c && Date.now() - c.lastScan > 20000) scanCube(c); }, 5000);
