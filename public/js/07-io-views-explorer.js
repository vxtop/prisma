// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Token-authenticated reads, context menu and settings; the Spaces / System view switch;
// and the folder explorer.
// === Token Reads, Context Menu, Settings ===
const TOKEN = (document.querySelector('meta[name=vxtop]') || {}).content || '';
const apiT = api;
const rawURL = p => '/api/raw?t=' + TOKEN + '&path=' + encodeURIComponent(p);
const iconURL = p => '/api/icon?t=' + TOKEN + '&exe=' + encodeURIComponent(p);
const SEP = p => (String(p).includes('\\') ? '\\' : '/');
const joinP = (a, b) => a.replace(/[\\/]+$/, '') + SEP(a) + b;
const KIND_COL = { dir: '#4fb3ad', drive: '#aeb6bd', code: '#4fb3ad', data: '#6f8fb3', image: '#c9a26b', video: '#c98a6b', audio: '#a98bc9', doc: '#9a8f7a', archive: '#8a8f96', exe: '#d9534f', font: '#aeb6bd', model3d: '#c9a26b', other: '#6b7278', link: '#6b7278' };
const KIND_TXT = { dir: 'carpeta', drive: 'unidad', code: 'código', data: 'datos', image: 'imagen', video: 'vídeo', audio: 'audio', doc: 'documento', archive: 'comprimido', exe: 'binario', font: 'fuente', model3d: 'modelo / diseño', other: 'archivo', link: 'enlace' };
const ctxEl = $('#ctx');
function menu(x, y, items) {
  ctxEl.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<div data-i="${i}">${esc(it[0])}${it[2] ? `<span>${esc(it[2])}</span>` : ''}</div>`).join('');
  ctxEl.style.display = 'block'; $('#tip').style.display = 'none'; const r = ctxEl.getBoundingClientRect(); ctxEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; ctxEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  ctxEl.onclick = e => { const d = e.target.closest('[data-i]'); if (!d) return; hideMenu(); items[+d.dataset.i][1](); };
}
const hideMenu = () => { ctxEl.style.display = 'none'; };
addEventListener('pointerdown', e => { if (!e.target.closest('#ctx')) hideMenu(); if (!e.target.closest('#set') && !e.target.closest('#b-set')) $('#set').style.display = 'none'; }, true);
addEventListener('contextmenu', e => { if (!e.target.closest('input')) e.preventDefault(); });
const copy = t => navigator.clipboard ? navigator.clipboard.writeText(String(t)).then(() => feed('copiado', '#aeb6bd', String(t).slice(0, 60)), () => {}) : null;
const openDeep = (p, depth) => post('/api/open', { path: p, depth }).catch(e => feed('error', '#d9534f', e.message));

const SET = { fog: .011, bloom: .42, flow: 1, icon: 1, dpr: 1.5, labels: 1, zoomCur: 0, screens: 0 };
try { Object.assign(SET, JSON.parse(localStorage.getItem('vxtop.set') || '{}')); } catch {}
const SETDEF = [['fog', 'Profundidad de visión', .002, .03, .001, v => (1 / v | 0) + ' u', true], ['bloom', 'Brillo de emisión', 0, 1.2, .02, v => v.toFixed(2)], ['flow', 'Flujo de partículas', 0, 3, .1, v => v.toFixed(1) + '×'],
  ['icon', 'Tamaño de procesos', .5, 2.5, .05, v => v.toFixed(2) + '×'], ['labels', 'Etiquetas', 0, 1, 1, v => v ? 'sí' : 'no'], ['zoomCur', 'Rueda hacia el cursor', 0, 1, 1, v => v ? 'sí' : 'al centro'], ['screens', 'Pantallas en vivo de tus ventanas', 0, 1, 1, v => v ? 'sí' : 'no'], ['dpr', 'Resolución máxima', .6, 2, .1, v => v.toFixed(1) + '×']];
function applySet() { scene.fog.density = SET.fog; bloom.strength = SET.bloom; controls.zoomToCursor = !!SET.zoomCur; try { localStorage.setItem('vxtop.set', JSON.stringify(SET)); } catch {} if (DPR > SET.dpr) { DPR = SET.dpr; resize(); } }
$('#set').innerHTML = '<h2>Ajustes</h2>' + SETDEF.map(([k, l, a, b, st]) => `<label>${l}<span id="sv-${k}"></span><input type="range" min="${a}" max="${b}" step="${st}" data-k="${k}" value="${SET[k]}"></label>`).join('');
const setLabels = () => SETDEF.forEach(([k, , , , , f, inv]) => $('#sv-' + k).textContent = f(SET[k]));
controls.zoomToCursor = !!SET.zoomCur;
$('#set').oninput = e => { const k = e.target.dataset.k; if (!k) return; SET[k] = +e.target.value; setLabels(); applySet(); }; setLabels();
$('#b-set').onclick = () => { const s = $('#set'); s.style.display = s.style.display === 'block' ? 'none' : 'block'; };
$('#set').addEventListener('keydown', e => e.stopPropagation());

// === Views: Folder Space / System ===
const SYS = new THREE.Vector3(0, 0, -1400);
const VIEW = { cur: 'espacio', cam: {} };
function flyTo(p, d) { focusT.copy(p); focusing = true; focusDir = null; focusD = d; }
const remember = () => { try { localStorage.setItem('vxtop.view', JSON.stringify({ v: VIEW.cur, root: TR.root ? TR.root.path : null, mode: TR.mode })); } catch {} };
function setView(v) {
  if (v === VIEW.cur) return; if (VW.o && v !== 'espacio') exitViewer(true); VIEW.cam[VIEW.cur] = { p: camera.position.clone(), t: controls.target.clone() }; VIEW.cur = v;
  const s = VIEW.cam[v]; if (s) { camera.position.copy(s.p); controls.target.copy(s.t); } else if (v === 'sistema') { controls.target.copy(SYS); camera.position.copy(SYS).add(v1.set(0, 52, 66)); } else if (v === 'tareas') { controls.target.copy(TASKS); camera.position.copy(TASKS).add(v1.set(0, 62, 70)); } else if (v === 'arbol') { controls.target.copy(TREE).add(v1.set(0, 0, 8)); camera.position.copy(TREE).add(v1.set(0, 30, -22)); }
  focusing = false; focusDir = null; $('#tip').style.display = 'none'; setHover(null); $('#fade').classList.add('on'); setTimeout(() => $('#fade').classList.remove('on'), 60);
  document.querySelectorAll('#view button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); document.body.classList.toggle('sys', v !== 'espacio'); document.body.classList.toggle('tasks', v === 'tareas'); document.body.classList.toggle('tree', v === 'arbol'); if (v !== 'arbol' && camera.far !== 700) { TR.lim = [controls.maxDistance, camera.far]; const dd = camera.position.distanceTo(controls.target); controls.maxDistance = Math.max(420, dd * 1.4); camera.far = Math.max(700, dd * 2.6); camera.updateProjectionMatrix(); }
  if (v === 'arbol' && TR.lim) { [controls.maxDistance, camera.far] = TR.lim; camera.updateProjectionMatrix(); }
  $('#ltabs [data-l=cubes]').firstChild.textContent = v === 'sistema' ? 'PROCESOS ' : v === 'tareas' ? 'APARTADOS ' : v === 'arbol' ? 'CARPETAS ' : 'CUBOS '; setLeft('cubes');
  if (VIEW.cur !== 'espacio' && OB.sel && !VW.o) { OB.sel = null; if (S.mode === 'obj') S.mode = 'cube'; }
  if (v === 'sistema') { pollSystem(); if (G.sel) S.mode = 'proc'; if (!G.fitted && !s) { G.fitted = true; setTimeout(fitAll, 1600); } } else if (v === 'tareas') { pollTasks(); if (TKS.sel) S.mode = 'task'; } else if (v === 'arbol') { if (TR.sel) S.mode = 'tnode'; renderTrBar(); if (!TR.root && !TR.want) { const p = (S.sel && S.sel.path) || (S.cores && S.cores[0] && S.cores[0].path); if (p) setTimeout(() => trOpen(p), 0); } } else if (S.mode === 'proc' || S.mode === 'task' || S.mode === 'tnode') S.mode = OB.sel ? 'obj' : 'cube';
  renderPanel();
}
addEventListener('beforeunload', remember);
$('#view').onclick = e => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); };

// === Explorer ===
const EX = { path: null, data: null, roots: null, off: 0, depth: 2, extIcon: new Map(), hidden: false };
function setLeft(t) { document.querySelectorAll('#ltabs button').forEach(b => b.classList.toggle('on', b.dataset.l === t)); $('#cubes').style.display = t === 'cubes' ? '' : 'none'; $('#explorer').style.display = t === 'explorer' ? 'flex' : 'none'; if (t === 'explorer') { if (!EX.roots) exGo(EX.path); else renderExplorer(); } else renderCubes(); }
$('#ltabs').onclick = e => { const b = e.target.closest('button'); if (b) setLeft(b.dataset.l); };
async function exGo(p) {
  try { if (!EX.roots) EX.roots = await apiT('/api/roots'); EX.data = p ? await apiT('/api/ls?path=' + encodeURIComponent(p)) : null; EX.path = p; EX.off = 0; } catch (e) { feed('error', '#d9534f', e.message); }
  renderExplorer();
}
const FOLDER = '<svg viewBox="0 0 16 16"><path d="M1.5 3.5h4.2l1.4 1.5h7.4v8H1.5z" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';
const DRIVE = '<svg viewBox="0 0 16 16"><rect x="1.5" y="5" width="13" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="8" r=".9" fill="currentColor"/></svg>';
function entIcon(en) {
  if (S.platform && S.platform !== 'win32' && !(en.dir || en.kind === 'dir' || en.kind === 'drive')) return `<i class="ic dot" style="background:${KIND_COL[en.kind] || '#666'}"></i>`;
  if (en.kind === 'drive') return `<i class="ic" style="color:${KIND_COL.drive}">${DRIVE}</i>`; if (en.dir || en.kind === 'dir') return `<i class="ic" style="color:${KIND_COL.dir}">${FOLDER}</i>`;
  const own = /^(exe|lnk|ico|url|msi|appref-ms)$/.test(en.ext), k = own ? en.path : en.ext || '·'; if (!EX.extIcon.has(k)) EX.extIcon.set(k, iconURL(en.path));
  return `<img class="ic" src="${EX.extIcon.get(k)}" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'ic dot',style:'background:${KIND_COL[en.kind] || '#666'}'}))">`;
}
function exRows() { const d = EX.data; return d ? d.entries.filter(x => EX.hidden || !x.hidden) : (EX.roots || []); }
function renderExplorer() {
  const el = $('#explorer'); if (el.style.display === 'none') return; const d = EX.data, rows = exRows();
  const crumbs = d ? d.path.split(/[\\/]/).filter(Boolean) : [];
  let acc = ''; const crumbHtml = d ? crumbs.map((s, i) => { acc = i === 0 && /:$/.test(s) ? s + '\\' : acc + (acc.endsWith('\\') || acc.endsWith('/') ? '' : SEP(d.path)) + s; if (i === 0 && !/:$/.test(s)) acc = '/' + s; return `<b data-p="${esc(acc)}">${esc(s)}</b>`; }).join('<i>›</i>') : '<b>Equipo</b>';
  el.innerHTML = `<div id="exbar"><button data-x="up" class="ico" data-tip="Subir un nivel"><svg class="i"><use href="#i-up"/></svg></button><button data-x="home" class="ico" data-tip="Unidades y carpetas del usuario"><svg class="i"><use href="#i-drives"/></svg></button><div id="crumbs">${crumbHtml}</div></div>
    <div id="exopt"><span class="lab" data-tip="Niveles|Profundidad al abrir de forma recursiva (doble clic en una carpeta).">Niveles</span><div class="seg" id="exdepth">${[1, 2, 3, 4].map(n => `<button data-d="${n}" class="${EX.depth === n ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${d ? `<button data-x="cube" data-tip="Abrir esta carpeta como cubo"><svg class="i"><use href="#i-cube"/></svg>Cubo</button>` : ''}<button data-x="hid" class="${EX.hidden ? 'on' : ''}" data-tip="Mostrar archivos ocultos|Los que empiezan por punto o por $.">Ocultos</button></div>
    <div id="exlist"></div><div id="exfoot" class="note"></div>`;
  drawExList();
}
function drawExList() {
  const L = $('#exlist'); if (!L) return; const rows = exRows(), n = Math.max(1, Math.floor(L.clientHeight / 26)); EX.off = Math.max(0, Math.min(EX.off, rows.length - n));
  const mx = Math.max(1, ...rows.filter(x => x.dir && x.size).map(x => x.size));
  L.innerHTML = rows.slice(EX.off, EX.off + n).map((en, i) => `<div class="er ${en.dir || en.kind === 'drive' || en.kind === 'dir' ? 'd' : ''}" data-i="${EX.off + i}">${en.dir && en.size ? `<i class="szb" style="width:${(en.size / mx * 100).toFixed(1)}%"></i>` : ''}${entIcon(en)}<span>${esc(en.name)}</span><em>${en.kind === 'drive' ? fmtB(en.free) + ' lib.' : en.size != null ? fmtB(en.size) : en.dir ? '' : ''}</em>${en.dir || en.kind === 'drive' || en.kind === 'dir' ? '<u data-a="cube" data-tip="Abrir como cubo"><svg class="i"><use href="#i-cube"/></svg></u><u data-a="deep" data-tip="Abrir con sus subcarpetas|Usa los niveles elegidos arriba."><svg class="i"><use href="#i-layers"/></svg></u>' : '<u data-a="obj" data-tip="Ver como objeto|Doble clic: abrir en el visor."><svg class="i"><use href="#i-eye"/></svg></u>'}</div>`).join('');
  const ixd = EX.data && EX.data.indexed; $('#exfoot').innerHTML = (rows.length ? `${EX.off + 1}–${Math.min(rows.length, EX.off + n)} de ${fmtN(rows.length)}${EX.data && EX.data.truncated ? '+' : ''}` : 'Vacío') + (EX.data ? (ixd ? ` · <span style="color:var(--c)">índice</span> ${fmtC(ixd.files)} arch. · ${fmtB(ixd.bytes)}` : ' · sin índice (clic derecho → Indexar)') : '');
}
$('#explorer').addEventListener('wheel', e => { if (!e.target.closest('#exlist')) return; e.preventDefault(); EX.off += Math.sign(e.deltaY) * 3; drawExList(); }, { passive: false });
const isDirEnt = en => en.dir || en.kind === 'drive' || en.kind === 'dir';
$('#explorer').addEventListener('click', e => {
  const x = e.target.closest('[data-x]'), dd = e.target.closest('[data-d]'), cr = e.target.closest('#crumbs b[data-p]'), a = e.target.closest('u[data-a]'), r = e.target.closest('.er');
  if (dd) { EX.depth = +dd.dataset.d; return renderExplorer(); }
  if (cr) return exGo(cr.dataset.p);
  if (x) { const v = x.dataset.x; if (v === 'up') return exGo(EX.data ? EX.data.parent : null); if (v === 'home') return exGo(null); if (v === 'cube' && EX.data) return post('/api/open', { path: EX.data.path }).catch(er => feed('error', '#d9534f', er.message)); if (v === 'hid') { EX.hidden = !EX.hidden; return renderExplorer(); } }
  if (!r) return; const en = exRows()[+r.dataset.i]; if (!en) return;
  if (a) { if (a.dataset.a === 'cube') post('/api/open', { path: en.path }).catch(er => feed('error', '#d9534f', er.message)); else if (a.dataset.a === 'deep') openDeep(en.path, EX.depth); else openObject(en.path); return; }
  if (isDirEnt(en)) exGo(en.path); else { if (VIEW.cur !== 'espacio') setView('espacio'); openObject(en.path); }
});
$('#explorer').addEventListener('dblclick', e => { const r = e.target.closest('.er'); if (!r) return; const en = exRows()[+r.dataset.i]; if (en && isDirEnt(en)) openDeep(en.path, EX.depth); });
$('#explorer').addEventListener('contextmenu', e => {
  const r = e.target.closest('.er'); if (!r) return; e.preventDefault(); const en = exRows()[+r.dataset.i]; if (!en) return;
  menu(e.clientX, e.clientY, isDirEnt(en) ? [['Entrar', () => exGo(en.path)], ['Ver en árbol (como tree)', () => trOpen(en.path)], ['Indexar (carga completa)', () => startIx(en.path)], ['Abrir como cubo', () => post('/api/open', { path: en.path }).catch(() => {})], ...[1, 2, 3, 4].map(n => [`Abrir recursivo · ${n} nivel${n > 1 ? 'es' : ''}`, () => openDeep(en.path, n)]), '-', ['Copiar ruta', () => copy(en.path)]]
    : [['Ver como objeto', () => { setView('espacio'); openObject(en.path); }], ['Abrir su carpeta como cubo', () => post('/api/open', { path: EX.data.path }).catch(() => {})], '-', ['Copiar ruta', () => copy(en.path)], ['Copiar nombre', () => copy(en.name)]]);
});

