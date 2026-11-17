// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Media gallery of a cube: every image, video and audio file under the folder, with folders, filters,
// sorting and keyboard navigation, and a lightbox (zoom to the cursor, pan, 1:1, navigator, rotation,
// filmstrip, slideshow). Read-only: it only reads files through /api/raw.
const GA = { c: null, root: '', sep: '\\', all: [], list: [], dirs: [], tree: new Map(), dir: '', kind: 'all', q: '', sort: 'name', group: true, crop: false,
  size: 180, sel: -1, shown: 0, lb: null, req: 0, truncated: false };
try { const g = JSON.parse(localStorage.getItem('vxtop.gallery') || '{}'); for (const k of ['sort', 'group', 'crop', 'size']) if (g[k] != null) GA[k] = g[k]; } catch {}
const gaSave = () => { try { localStorage.setItem('vxtop.gallery', JSON.stringify({ sort: GA.sort, group: GA.group, crop: GA.crop, size: GA.size })); } catch {} };
const GA_IC = { image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9.5h.01', video: 'M4 6h12v12H4z M16 10l4-2.5v9L16 14', audio: 'M9 17V6l10-2v11 M9 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 15a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z' };
const gaSvg = (d, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${d.split(' M').map((p, i) => `<path d="${i ? 'M' + p : p}"/>`).join('')}</svg>`;
const GA_KT = { image: 'Imágenes', video: 'Vídeos', audio: 'Audio' };
const gaColl = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const gaAbs = it => GA.root.replace(/[\\/]+$/, '') + GA.sep + it.r;

// --- thumbnails: decoded once, cached in memory and in IndexedDB (key = path + size + mtime) ---
const TH = { mem: new Map(), q: [], busy: 0, db: null, dbP: null };
function thDB() { if (TH.dbP) return TH.dbP; TH.dbP = new Promise(res => { try { const r = indexedDB.open('vxtop-thumbs', 1); r.onupgradeneeded = () => r.result.createObjectStore('t'); r.onsuccess = () => res(TH.db = r.result); r.onerror = () => res(null); } catch { res(null); } }); return TH.dbP; }
async function thGet(k) { const db = await thDB(); if (!db) return null; return new Promise(res => { try { const q = db.transaction('t').objectStore('t').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } }); }
async function thPut(k, v) { const db = await thDB(); if (!db) return; try { db.transaction('t', 'readwrite').objectStore('t').put(v, k); } catch {} }
const thKey = it => K(gaAbs(it)) + '|' + it.s + '|' + it.m;
async function thMake(it) {
  const p = gaAbs(it), ext = (it.r.match(/\.([^.\\/]+)$/) || [])[1]?.toLowerCase();
  if (it.k === 'audio') return null;
  if (it.k === 'video') return thVideo(p);
  const b = await (await fetch(rawURL(p))).blob();
  if (ext === 'svg') { const u = URL.createObjectURL(b), im = new Image(); im.src = u; try { await im.decode(); } catch {} const v = { b, w: im.naturalWidth || 0, h: im.naturalHeight || 0 }; URL.revokeObjectURL(u); return v; }
  const bm = await createImageBitmap(b), w = bm.width, h = bm.height, sc = Math.min(1, 420 / Math.max(w, h)); let out = b;
  if (sc < 1 || b.size > 400000) { const tw = Math.max(1, Math.round(w * sc)), tht = Math.max(1, Math.round(h * sc)); const r = await createImageBitmap(bm, { resizeWidth: tw, resizeHeight: tht, resizeQuality: 'high' });
    const cv = new OffscreenCanvas(tw, tht); cv.getContext('2d').drawImage(r, 0, 0); r.close(); out = await cv.convertToBlob({ type: 'image/webp', quality: .82 }); }
  bm.close(); return { b: out, w, h };
}
function thVideo(p) { // a frame at 10 % of the video (the browser decodes it; nothing is written)
  return new Promise(res => { const v = document.createElement('video'); let done = false; const end = r => { if (done) return; done = true; clearTimeout(to); v.removeAttribute('src'); v.load(); res(r); }, to = setTimeout(() => end(null), 9000);
    v.muted = true; v.preload = 'metadata'; v.src = rawURL(p);
    v.onloadedmetadata = () => { v.currentTime = Math.min(isFinite(v.duration) ? v.duration * .1 : 1, 8); };
    v.onseeked = async () => { try { const w = v.videoWidth, h = v.videoHeight, sc = Math.min(1, 420 / Math.max(w, h)), cv = new OffscreenCanvas(Math.round(w * sc) || 1, Math.round(h * sc) || 1);
      cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); end({ b: await cv.convertToBlob({ type: 'image/webp', quality: .8 }), w, h, d: v.duration }); } catch { end(null); } };
    v.onerror = () => end(null); });
}
function thumbOf(it) { // → Promise<{url,w,h}|null>, deduplicated and throttled (4 decodes at a time)
  const k = thKey(it); let e = TH.mem.get(k); if (e) return e.p;
  e = { p: null }; e.p = new Promise(res => TH.q.push({ it, k, res })); TH.mem.set(k, e); thPump(); return e.p;
}
function thPump() {
  while (TH.busy < 4 && TH.q.length) { const j = TH.q.pop(); TH.busy++; // newest request first: what you are looking at now
    (async () => { let v = await thGet(j.k); if (!v) { try { v = await thMake(j.it); } catch { v = null; } if (v) thPut(j.k, v); }
      const r = v ? { url: URL.createObjectURL(v.b), w: v.w, h: v.h, d: v.d } : null; if (r) { j.it.w = r.w; j.it.h = r.h; if (r.d) j.it.d = r.d; } j.res(r); })()
      .finally(() => { TH.busy--; thPump(); }); }
}
async function paintTile(el) { const it = GA.list[+el.dataset.i]; if (!it || it.k === 'audio') return; const r = await thumbOf(it); if (!el.isConnected) return;
  if (!r) { el.classList.add('nothumb'); return; } const im = el.querySelector('img'); im.src = r.url; im.onload = () => el.classList.add('ok');
  const m = el.querySelector('.gm'); if (m && r.w) m.textContent = `${r.w}×${r.h}` + (r.d ? ' · ' + fmtT(r.d) : ''); }

// --- the gallery window ---
const gal = document.createElement('div'); gal.id = 'gal'; document.body.appendChild(gal);
gal.innerHTML = `<div class="gh"><span class="gti">${gaSvg(GA_IC.image)}<b id="ga-n"></b><span id="ga-c"></span></span>
  <div id="ga-sw"><svg class="i"><use href="#i-search"/></svg><input id="ga-q" placeholder="Filtrar por nombre o carpeta…" spellcheck="false" autocomplete="off"></div>
  <div class="seg" id="ga-k"></div>
  <select id="ga-s" data-tip="Ordenar"><option value="name">Nombre</option><option value="new">Más recientes</option><option value="old">Más antiguos</option><option value="big">Más pesados</option><option value="small">Más ligeros</option></select>
  <button id="ga-g" data-tip="Agrupar por carpeta|Una sección por carpeta." data-key="G">${gaSvg('M3 6.5h6l2 2h10V19H3z')}<span class="tl">Carpetas</span></button>
  <button id="ga-cr" class="ico" data-tip="Recortar al cuadrado|O mostrar cada imagen completa." data-key="C">${gaSvg('M6 2v16h16 M2 6h16v16')}</button>
  <span class="gsz">${gaSvg('M4 5h16v14H4z', 'i sm')}<input id="ga-z" type="range" min="100" max="380" step="10" data-tip="Tamaño de las miniaturas|Teclas + y −">${gaSvg('M4 5h16v14H4z')}</span>
  <button id="ga-x" data-tip="Volver al espacio" data-key="Esc"><svg class="i"><use href="#i-close"/></svg>Cerrar</button></div>
  <div class="gb"><aside id="ga-t"></aside><main id="ga-m" tabindex="0"></main></div>
  <div class="gf"><span id="ga-st"></span><span class="grow"></span><span class="hint"><kbd>←↑→↓</kbd> moverse · <kbd>Intro</kbd> abrir · <kbd>/</kbd> filtrar · <kbd>G</kbd> carpetas · <kbd>+ −</kbd> tamaño · <kbd>Esc</kbd> cerrar</span></div>`;
const gm = $('#ga-m');
const thIO = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { thIO.unobserve(e.target); paintTile(e.target); } }, { root: gm, rootMargin: '900px 0px' });

async function openGallery(c) {
  if (!c) return; if (VW.o) exitViewer(true); hideMenu(); $('#tip').style.display = 'none';
  const req = ++GA.req; Object.assign(GA, { c, root: c.path, dir: '', kind: 'all', q: '', sel: -1, all: [], list: [] }); $('#ga-q').value = '';
  $('#ga-n').textContent = c.name || base(c.path); $('#ga-c').textContent = 'leyendo…'; gm.innerHTML = '<div class="gempty">Buscando imágenes, vídeos y audio…</div>'; $('#ga-t').innerHTML = '';
  document.body.classList.add('gal'); gal.style.display = 'flex'; gm.focus();
  let d; try { d = await api('/api/media?path=' + encodeURIComponent(c.path)); } catch (e) { if (req === GA.req) gm.innerHTML = `<div class="gempty">${esc(e.message)}</div>`; return; }
  if (req !== GA.req || !galOpen()) return;
  GA.root = d.root; GA.sep = d.sep; GA.truncated = d.truncated;
  GA.all = d.items.map(it => { const i = it.r.lastIndexOf(d.sep); return { ...it, n: i < 0 ? it.r : it.r.slice(i + 1), dir: i < 0 ? '' : it.r.slice(0, i), lc: it.r.toLowerCase() }; });
  buildTree(); renderKinds(); applyFilter(true);
  if (!GA.all.length) gm.innerHTML = '<div class="gempty">Esta carpeta no tiene imágenes, vídeos ni audio.</div>';
}
const galOpen = () => gal.style.display === 'flex';
function closeGallery() { if (GA.lb) closeLightbox(); gal.style.display = 'none'; document.body.classList.remove('gal'); GA.req++; TH.q.length = 0; }

function buildTree() { // folder → { n: own, t: total under it, kids }
  const T = new Map(), node = p => { let x = T.get(p); if (!x) { x = { p, n: 0, t: 0, kids: new Set(), b: 0 }; T.set(p, x); if (p) { const i = p.lastIndexOf(GA.sep), par = i < 0 ? '' : p.slice(0, i); node(par).kids.add(p); } } return x; };
  node('');
  for (const it of GA.all) { node(it.dir).n++; let p = it.dir; for (;;) { const x = T.get(p); x.t++; x.b += it.s; if (!p) break; const i = p.lastIndexOf(GA.sep); p = i < 0 ? '' : p.slice(0, i); } }
  GA.tree = T; GA.open = GA.open || new Set(); GA.open.clear(); for (const [p] of T) if (p.split(GA.sep).length < 2) GA.open.add(p); renderTree();
}
function renderTree() {
  const T = GA.tree, rows = [], walk = (p, dpt) => { const x = T.get(p), kids = [...x.kids].sort(gaColl.compare);
    rows.push(`<div class="gtr${GA.dir === p ? ' on' : ''}" data-p="${esc(p)}" style="--d:${dpt}">${kids.length ? `<i class="car${GA.open.has(p) ? ' op' : ''}" data-c="${esc(p)}"></i>` : '<i class="car no"></i>'}<span class="gtn" title="${esc(p || GA.root)}">${esc(p ? p.slice(p.lastIndexOf(GA.sep) + 1) : 'Todo')}</span><span class="gtc">${fmtN(x.t)}</span></div>`);
    if (GA.open.has(p) || !p) kids.forEach(k => walk(k, dpt + 1)); };
  if (T.size) walk('', 0); $('#ga-t').innerHTML = rows.join('');
}
$('#ga-t').onclick = e => { const c = e.target.closest('[data-c]'); if (c) { const p = c.dataset.c; GA.open.has(p) ? GA.open.delete(p) : GA.open.add(p); return renderTree(); }
  const r = e.target.closest('[data-p]'); if (r) { GA.dir = r.dataset.p; if (GA.tree.get(GA.dir).kids.size) GA.open.add(GA.dir); renderTree(); applyFilter(true); } };
function renderKinds() { const n = { all: GA.all.length, image: 0, video: 0, audio: 0 }; GA.all.forEach(it => n[it.k]++);
  $('#ga-k').innerHTML = ['all', 'image', 'video', 'audio'].filter(k => k === 'all' || n[k]).map(k => `<button data-k="${k}" class="${GA.kind === k ? 'on' : ''}">${k === 'all' ? 'Todo' : GA_KT[k]} <span class="gtc">${fmtN(n[k])}</span></button>`).join(''); }
$('#ga-k').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; GA.kind = b.dataset.k; renderKinds(); applyFilter(true); };
$('#ga-q').oninput = () => { GA.q = $('#ga-q').value.trim().toLowerCase(); applyFilter(true); };
$('#ga-q').onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') { if ($('#ga-q').value) { $('#ga-q').value = ''; GA.q = ''; applyFilter(true); } else gm.focus(); } else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); gm.focus(); if (GA.sel < 0 && GA.list.length) gaSelect(0); } };
$('#ga-s').onchange = () => { GA.sort = $('#ga-s').value; gaSave(); applyFilter(false); };
$('#ga-g').onclick = () => { GA.group = !GA.group; gaSave(); applyFilter(false); };
$('#ga-cr').onclick = () => { GA.crop = !GA.crop; gaSave(); gaStyle(); };
$('#ga-z').oninput = () => { GA.size = +$('#ga-z').value; gaSave(); gaStyle(); };
$('#ga-x').onclick = closeGallery;
function gaStyle() { gm.style.setProperty('--gs', GA.size + 'px'); gm.classList.toggle('crop', GA.crop); $('#ga-cr').classList.toggle('on', GA.crop); $('#ga-g').classList.toggle('on', GA.group); $('#ga-z').value = GA.size; $('#ga-s').value = GA.sort; }

const SORTS = { name: (a, b) => gaColl.compare(a.r, b.r), new: (a, b) => b.m - a.m, old: (a, b) => a.m - b.m, big: (a, b) => b.s - a.s, small: (a, b) => a.s - b.s };
function applyFilter(reset) {
  const keep = !reset && GA.sel >= 0 ? GA.list[GA.sel] : null, d = GA.dir, pre = d ? d + GA.sep : '', words = GA.q.split(/\s+/).filter(Boolean);
  let l = GA.all.filter(it => (GA.kind === 'all' || it.k === GA.kind) && (!d || it.dir === d || it.r.startsWith(pre)) && words.every(w => it.lc.includes(w)));
  const s = SORTS[GA.sort] || SORTS.name; l.sort(GA.group ? (a, b) => gaColl.compare(a.dir, b.dir) || s(a, b) : s);
  GA.list = l; GA.sel = keep ? l.indexOf(keep) : -1; GA.shown = 0; gaStyle(); gm.innerHTML = ''; gm.scrollTop = 0; renderMore(Math.max(400, GA.sel + 100));
  const bytes = l.reduce((a, it) => a + it.s, 0), all = GA.all.reduce((a, it) => a + it.s, 0);
  $('#ga-c').textContent = `${fmtN(GA.all.length)} archivos · ${fmtB(all)}${GA.truncated ? ' · lista parcial' : ''}`;
  $('#ga-st').textContent = l.length === GA.all.length ? `${fmtN(l.length)} archivos · ${fmtB(bytes)}` : `${fmtN(l.length)} de ${fmtN(GA.all.length)} · ${fmtB(bytes)}${d ? ' · en ' + d : ''}`;
  if (!l.length && GA.all.length) gm.innerHTML = '<div class="gempty">Nada coincide con el filtro.</div>';
  if (GA.sel >= 0) gaSelect(GA.sel, true);
}
function renderMore(upto) { // tiles are added in pages as you scroll (tens of thousands stay fluid)
  const l = GA.list, end = Math.min(l.length, Math.max(upto || 0, GA.shown + 400)); if (GA.shown >= end) return; let h = '', cur = GA.shown ? l[GA.shown - 1].dir : null;
  gm.querySelector('.gmore')?.remove();
  for (let i = GA.shown; i < end; i++) { const it = l[i];
    if (GA.group && it.dir !== cur) { cur = it.dir; const x = GA.tree.get(it.dir); h += `<h3 class="gsec" data-p="${esc(it.dir)}">${gaSvg('M3 6.5h6l2 2h10V19H3z')}<span>${esc(it.dir || base(GA.root))}</span><span class="gtc">${fmtN(x ? x.n : 0)}</span></h3>`; }
    h += `<div class="gi k-${it.k}${i === GA.sel ? ' sel' : ''}" data-i="${i}" title="${esc(it.r)}"><div class="gp"><img alt="" draggable="false" decoding="async">${it.k !== 'image' ? `<span class="gk">${gaSvg(GA_IC[it.k])}</span>` : ''}</div><span class="gn">${esc(it.n)}</span><span class="gm">${it.w ? `${it.w}×${it.h}` : fmtB(it.s)}</span></div>`; }
  gm.insertAdjacentHTML('beforeend', h + (end < l.length ? '<div class="gmore"></div>' : '')); GA.shown = end;
  gm.querySelectorAll('.gi:not([data-o])').forEach(el => { el.dataset.o = 1; thIO.observe(el); });
  const m = gm.querySelector('.gmore'); if (m) moreIO.observe(m);
}
const moreIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) renderMore(); }, { root: gm, rootMargin: '1200px 0px' });
gm.onclick = e => { const s = e.target.closest('.gsec'); if (s) { GA.dir = s.dataset.p; GA.open.add(s.dataset.p); renderTree(); return applyFilter(true); }
  const t = e.target.closest('.gi'); if (t) { gaSelect(+t.dataset.i); openLightbox(+t.dataset.i); } };
gm.oncontextmenu = e => { const t = e.target.closest('.gi'); if (!t) return; e.preventDefault(); e.stopPropagation(); const it = GA.list[+t.dataset.i]; gaSelect(+t.dataset.i);
  menu(e.clientX, e.clientY, [['Abrir', () => openLightbox(+t.dataset.i)], ['Ver en el espacio', () => { closeGallery(); openObject(gaAbs(it), true); }], ['Solo esta carpeta', () => { GA.dir = it.dir; renderTree(); applyFilter(false); }], ['Copiar ruta', () => copy(gaAbs(it))]]); };
function gaSelect(i, noScroll) { const l = GA.list; if (!l.length) return; i = Math.max(0, Math.min(l.length - 1, i)); if (i >= GA.shown) renderMore(i + 200);
  gm.querySelector('.gi.sel')?.classList.remove('sel'); GA.sel = i; const el = gm.querySelector(`.gi[data-i="${i}"]`); if (el) { el.classList.add('sel'); if (!noScroll) el.scrollIntoView({ block: 'nearest' }); }
  const it = l[i]; $('#ga-st').textContent = `${i + 1} / ${fmtN(l.length)} · ${it.r} · ${fmtB(it.s)}${it.w ? ' · ' + it.w + '×' + it.h : ''}`; }
function gaMove(dx, dy) { // arrows follow the grid as it is drawn, sections included
  const cur = gm.querySelector(`.gi[data-i="${GA.sel}"]`); if (!cur) return gaSelect(0); if (!dy) return gaSelect(GA.sel + dx);
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2; let best = null, bd = 1e9;
  for (let j = GA.sel + dy, n = 0; j >= 0 && j < GA.shown && n < 600; j += dy, n++) { const el = gm.querySelector(`.gi[data-i="${j}"]`), q = el.getBoundingClientRect();
    if (dy > 0 ? q.top <= r.top + 2 : q.top >= r.top - 2) continue; if (best && Math.abs(q.top - best.top) > 2) break; const dd = Math.abs(q.left + q.width / 2 - cx); if (dd < bd) { bd = dd; best = { j, top: q.top }; } }
  if (best) gaSelect(best.j); else if (dy > 0 && GA.shown < GA.list.length) { renderMore(); gaMove(dx, dy); } }

// --- lightbox ---
const lbx = document.createElement('div'); lbx.id = 'lbx'; document.body.appendChild(lbx);
lbx.innerHTML = `<div class="lt"><span class="ltn"><b id="lb-n"></b><span id="lb-k"></span></span><span class="grow"></span>
  <button class="ico" data-l="zout" data-tip="Alejar" data-key="−"><svg class="i"><use href="#i-zout"/></svg></button><span id="lb-z" class="vpos" data-tip="Zoom|Doble clic alterna entre ajustar y 100 %."></span><button class="ico" data-l="zin" data-tip="Acercar" data-key="+"><svg class="i"><use href="#i-zin"/></svg></button>
  <button class="ico" data-l="fit" data-tip="Ajustar a la pantalla" data-key="0"><svg class="i"><use href="#i-fit"/></svg></button><button data-l="one" data-tip="Tamaño real|Un píxel de la imagen, un píxel de la pantalla." data-key="1">1:1</button>
  <div class="sep"></div><button class="ico" data-l="rot" data-tip="Girar 90°|Mayús+R al otro lado. Solo la vista: el archivo no cambia." data-key="R">${gaSvg('M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7')}</button>
  <button class="ico" data-l="bg" data-tip="Fondo|Oscuro, claro o damero (para ver transparencias)." data-key="B">${gaSvg('M4 4h16v16H4z M4 12h16 M12 4v16')}</button>
  <button class="ico" data-l="show" data-tip="Pase de diapositivas|Cada 4 s." data-key="P"><svg class="i"><use href="#i-play"/></svg></button>
  <button class="ico" data-l="full" data-tip="Pantalla completa" data-key="F">${gaSvg('M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5')}</button>
  <button class="ico" data-l="info" data-tip="Información" data-key="I">${gaSvg('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5h.01')}</button>
  <div class="sep"></div><button data-l="close" data-tip="Volver a la galería" data-key="Esc"><svg class="i"><use href="#i-close"/></svg>Cerrar</button></div>
  <div class="lv" id="lb-v"><div id="lb-c"></div><button class="lnav l" data-l="prev" data-tip="Anterior" data-key="←"><svg class="i"><use href="#i-prev"/></svg></button><button class="lnav r" data-l="next" data-tip="Siguiente" data-key="→"><svg class="i"><use href="#i-next"/></svg></button>
    <div id="lb-mm"><img alt=""><i></i></div><div id="lb-ld"></div></div>
  <aside id="lb-i"></aside><div class="lf" id="lb-f"></div>`;
const LB = { i: -1, s: 1, cx: 0, cy: 0, rot: 0, w: 0, h: 0, el: null, bg: 0, info: false, show: 0, ptr: new Map(), pinch: null, fit: 1 };
try { const g = JSON.parse(localStorage.getItem('vxtop.lightbox') || '{}'); LB.bg = g.bg | 0; LB.info = !!g.info; } catch {}
const lbSave = () => { try { localStorage.setItem('vxtop.lightbox', JSON.stringify({ bg: LB.bg, info: LB.info })); } catch {} };
const lv = $('#lb-v'), lc = $('#lb-c');
function openLightbox(i) { GA.lb = true; lbx.style.display = 'flex'; lbShow(i); }
function closeLightbox() { lbStopShow(); const m = lc.querySelector('video,audio'); if (m) m.pause(); lc.innerHTML = ''; GA.lb = null; lbx.style.display = 'none'; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); gaSelect(LB.i); gm.focus(); }
async function lbShow(i) {
  const l = GA.list; if (!l.length) return; i = (i + l.length) % l.length; LB.i = i; const it = l[i], p = gaAbs(it), tk = ++LB.tok;
  const old = lc.querySelector('video,audio'); if (old) old.pause();
  LB.rot = 0; LB.el = null; lc.innerHTML = ''; lbx.classList.remove('pix'); lv.className = 'lv bg' + LB.bg; $('#lb-ld').style.display = 'none';
  $('#lb-n').textContent = it.n; $('#lb-k').textContent = `${i + 1} / ${fmtN(l.length)} · ${it.dir || base(GA.root)}`;
  lbStrip(); lbInfo(it); gaSelect(i, true);
  if (it.k !== 'image') { const m = document.createElement(it.k === 'video' ? 'video' : 'audio'); m.src = rawURL(p); m.controls = true; m.autoplay = true; m.className = 'lmed'; if (it.k === 'audio') lc.innerHTML = `<div class="laud">${gaSvg(GA_IC.audio)}<b>${esc(it.n)}</b></div>`;
    lc.appendChild(m); m.onloadedmetadata = () => { if (it.k === 'video') { it.w = m.videoWidth; it.h = m.videoHeight; } it.d = m.duration; lbInfo(it); }; lbZoomUI(); return; }
  const im = new Image(); im.className = 'lim'; im.draggable = false; im.alt = ''; LB.el = im; lc.appendChild(im);
  const th = await thumbOf(it); if (tk !== LB.tok) return;
  if (th && th.w) { LB.w = th.w; LB.h = th.h; im.src = th.url; lbFit(false); $('#lb-mm img').src = th.url; } // the thumbnail stands in until the full image is decoded
  const ld = setTimeout(() => { if (tk === LB.tok) $('#lb-ld').style.display = 'block'; }, 250);
  const full = LB.pre.get(p) || new Image(); LB.pre.delete(p); if (!full.src) full.src = rawURL(p);
  try { await full.decode(); } catch { clearTimeout(ld); if (tk === LB.tok) { $('#lb-ld').style.display = 'none'; if (!th) lc.innerHTML = `<div class="laud">${gaSvg(GA_IC.image)}<b>El navegador no puede mostrar este formato</b><span>${esc(it.n)}</span></div>`; } return; }
  clearTimeout(ld); if (tk !== LB.tok) return; $('#lb-ld').style.display = 'none';
  const first = !th || !th.w; LB.w = full.naturalWidth; LB.h = full.naturalHeight; it.w = LB.w; it.h = LB.h; full.className = 'lim'; full.draggable = false; lc.replaceChild(full, im); LB.el = full; if (first || !th) lbFit(false); else lbApply(false); if (!th) $('#lb-mm img').src = full.src;
  lbInfo(it); lbPreload(i);
}
LB.tok = 0; LB.pre = new Map();
function lbPreload(i) { // the neighbours are decoded ahead (raw files are never cached, so the decoded image itself is kept)
  const want = new Set(); for (const d of [1, -1, 2]) { const it = GA.list[(i + d + GA.list.length) % GA.list.length]; if (!it || it.k !== 'image') continue; thumbOf(it);
    if (Math.abs(d) === 1 && it.s < 40e6) { const p = gaAbs(it); want.add(p); if (!LB.pre.has(p)) { const im = new Image(); im.src = rawURL(p); im.decode().catch(() => {}); LB.pre.set(p, im); } } }
  for (const [p, im] of LB.pre) if (!want.has(p)) { im.src = ''; LB.pre.delete(p); } }
const lbVW = () => lv.clientWidth, lbVH = () => lv.clientHeight;
const lbEff = () => LB.rot % 180 ? [LB.h, LB.w] : [LB.w, LB.h];
function lbFitScale() { const [w, h] = lbEff(); return w && h ? Math.min(1, (lbVW() - 48) / w, (lbVH() - 48) / h) : 1; }
function lbFit(anim = true) { LB.fit = lbFitScale(); LB.s = LB.fit; LB.cx = lbVW() / 2; LB.cy = lbVH() / 2; lbApply(anim); }
function lbClamp() { const [w, h] = lbEff(), hw = w * LB.s / 2, hh = h * LB.s / 2, W = lbVW(), H = lbVH();
  LB.cx = hw * 2 <= W ? W / 2 : Math.min(hw, Math.max(W - hw, LB.cx)); LB.cy = hh * 2 <= H ? H / 2 : Math.min(hh, Math.max(H - hh, LB.cy)); }
function lbApply(anim) { const im = LB.el; if (!im) return; lbClamp(); im.classList.toggle('anim', !!anim); im.style.width = LB.w + 'px'; im.style.height = LB.h + 'px';
  im.style.transform = `translate(${LB.cx - LB.w / 2}px,${LB.cy - LB.h / 2}px) rotate(${LB.rot}deg) scale(${LB.s})`; lbx.classList.toggle('pix', LB.s >= 2.5); lbZoomUI(); lbMini(); }
function lbZoomAt(f, px = lbVW() / 2, py = lbVH() / 2, anim) { if (!LB.el || !LB.w) return; const ns = Math.max(Math.min(lbFitScale(), 1) * .25, Math.min(40, LB.s * f)), k = ns / LB.s;
  LB.cx = px + (LB.cx - px) * k; LB.cy = py + (LB.cy - py) * k; LB.s = ns; lbApply(anim); }
function lbZoomTo(s, px, py, anim = true) { lbZoomAt(s / LB.s, px, py, anim); }
function lbZoomUI() { $('#lb-z').textContent = LB.el && LB.w ? Math.round(LB.s * 100) + ' %' : '—'; }
function lbMini() { const mm = $('#lb-mm'), [w, h] = lbEff(), W = lbVW(), H = lbVH(), big = LB.el && LB.w && (w * LB.s > W + 2 || h * LB.s > H + 2) && !LB.rot; mm.style.display = big ? 'block' : 'none'; if (!big) return;
  const mw = 180, mh = Math.round(mw * h / w), r = mm.querySelector('i'); mm.style.width = mw + 'px'; mm.style.height = mh + 'px'; const k = mw / (w * LB.s), x0 = LB.cx - w * LB.s / 2, y0 = LB.cy - h * LB.s / 2;
  r.style.left = Math.max(0, -x0 * k) + 'px'; r.style.top = Math.max(0, -y0 * k) + 'px'; r.style.width = Math.min(mw, W * k) + 'px'; r.style.height = Math.min(mh, H * k) + 'px'; }
function lbMiniGo(e) { const mm = $('#lb-mm'), b = mm.getBoundingClientRect(), [w, h] = lbEff(), fx = (e.clientX - b.left) / b.width, fy = (e.clientY - b.top) / b.height;
  LB.cx = lbVW() / 2 - (fx - .5) * w * LB.s; LB.cy = lbVH() / 2 - (fy - .5) * h * LB.s; lbApply(false); }
$('#lb-mm').onpointerdown = e => { e.stopPropagation(); const mm = $('#lb-mm'); mm.setPointerCapture(e.pointerId); lbMiniGo(e); mm.onpointermove = ev => lbMiniGo(ev); mm.onpointerup = () => { mm.onpointermove = null; }; };
lv.addEventListener('wheel', e => { if (!LB.el) return; e.preventDefault(); const b = lv.getBoundingClientRect(); lbZoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)), e.clientX - b.left, e.clientY - b.top, false); }, { passive: false });
lv.onpointerdown = e => { if (e.target.closest('button,#lb-mm,video,audio') || e.button !== 0) return; lv.setPointerCapture(e.pointerId); LB.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); LB.moved = 0; lv.classList.add('drag');
  if (LB.ptr.size === 2) { const [a, b] = [...LB.ptr.values()]; LB.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: LB.s }; } };
lv.onpointermove = e => { const p = LB.ptr.get(e.pointerId); if (!p || !LB.el) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; LB.moved += Math.abs(dx) + Math.abs(dy);
  if (LB.ptr.size === 2 && LB.pinch) { const [a, b] = [...LB.ptr.values()], r = lv.getBoundingClientRect(); lbZoomTo(LB.pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / LB.pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, false); return; }
  LB.cx += dx; LB.cy += dy; lbApply(false); };
lv.onpointerup = lv.onpointercancel = e => { LB.ptr.delete(e.pointerId); if (LB.ptr.size < 2) LB.pinch = null; if (!LB.ptr.size) lv.classList.remove('drag');
  if (e.type === 'pointerup' && LB.moved < 4 && !LB.el && e.target === lv) lbAct('close'); };
lv.ondblclick = e => { if (!LB.el || e.target.closest('button,#lb-mm')) return; const b = lv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  if (LB.s > lbFitScale() * 1.05) lbFit(); else lbZoomTo(Math.max(1, lbFitScale() * 2.5), x, y); };
lbx.onclick = e => { const b = e.target.closest('[data-l]'); if (b) lbAct(b.dataset.l); const f = e.target.closest('.lfi'); if (f) lbShow(+f.dataset.i); };
function lbAct(a, ev) {
  const it = GA.list[LB.i]; if (a === 'close') return closeLightbox(); if (a === 'prev') return lbShow(LB.i - 1); if (a === 'next') return lbShow(LB.i + 1);
  if (a === 'first') return lbShow(0); if (a === 'last') return lbShow(GA.list.length - 1);
  if (a === 'zin') return lbZoomAt(1.4, undefined, undefined, true); if (a === 'zout') return lbZoomAt(1 / 1.4, undefined, undefined, true); if (a === 'fit') return lbFit(); if (a === 'one') return lbZoomTo(1);
  if (a === 'rot' || a === 'rotb') { LB.rot = (LB.rot + (a === 'rot' ? 90 : 270)) % 360; const keep = LB.s > LB.fit * 1.02; LB.fit = lbFitScale(); if (!keep) LB.s = LB.fit; return lbApply(true); }
  if (a === 'bg') { LB.bg = (LB.bg + 1) % 3; lv.className = 'lv bg' + LB.bg; return lbSave(); }
  if (a === 'info') { LB.info = !LB.info; lbSave(); lbInfo(it); return setTimeout(() => lbFit(false), 0); }
  if (a === 'full') return document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : lbx.requestFullscreen().catch(() => {});
  if (a === 'show') return LB.show ? lbStopShow() : lbStartShow();
  if (a === 'play') { const m = lc.querySelector('video,audio'); if (m) m.paused ? m.play().catch(() => {}) : m.pause(); else lbAct('show'); return; }
  if (a === 'space' && it) { const p = gaAbs(it); closeGallery(); return openObject(p, true); }
  if (a === 'copy' && it) return copy(gaAbs(it));
  if (a === 'folder' && it) { GA.dir = it.dir; renderTree(); applyFilter(false); return closeLightbox(); }
}
function lbStartShow() { lbStopShow(); LB.show = setInterval(() => { if (!GA.lb) return lbStopShow(); lbShow(LB.i + 1); }, 4000); lbx.classList.add('showing'); $('[data-l="show"]').innerHTML = '<svg class="i"><use href="#i-pause"/></svg>'; }
function lbStopShow() { if (LB.show) clearInterval(LB.show); LB.show = 0; lbx.classList.remove('showing'); const b = lbx.querySelector('[data-l="show"]'); if (b) b.innerHTML = '<svg class="i"><use href="#i-play"/></svg>'; }
function lbStrip() { // filmstrip: a window of thumbnails around the current one
  const l = GA.list, n = l.length, R = 30, a = Math.max(0, Math.min(LB.i - R, n - 2 * R - 1)), b = Math.min(n, a + 2 * R + 1); let h = '';
  for (let j = a; j < b; j++) h += `<div class="lfi${j === LB.i ? ' on' : ''} k-${l[j].k}" data-i="${j}" title="${esc(l[j].n)}"><img alt="" draggable="false"></div>`;
  const f = $('#lb-f'); f.innerHTML = h; f.querySelectorAll('.lfi').forEach(el => { const it = l[+el.dataset.i]; if (it.k === 'audio') { el.innerHTML = gaSvg(GA_IC.audio); return; } thumbOf(it).then(r => { if (r && el.isConnected) el.querySelector('img').src = r.url; }); });
  const on = f.querySelector('.on'); if (on) f.scrollLeft = on.offsetLeft - f.clientWidth / 2 + on.offsetWidth / 2; }
function lbInfo(it) { const box = $('#lb-i'); lbx.classList.toggle('info', LB.info); if (!LB.info || !it) return; const ext = (it.n.match(/\.([^.]+)$/) || [])[1] || '';
  const row = (k, v) => v ? `<div class="kv"><span>${k}</span><b>${v}</b></div>` : '';
  box.innerHTML = `<h3>${esc(it.n)}</h3>${row('Tipo', esc(({ image: 'Imagen', video: 'Vídeo', audio: 'Audio' }[it.k] || it.k) + (ext ? ' · .' + ext.toLowerCase() : '')))}${row('Dimensiones', it.w ? `${it.w} × ${it.h} px` : '')}${row('Megapíxeles', it.w && it.k === 'image' ? (it.w * it.h / 1e6).toFixed(1) + ' MP' : '')}
    ${row('Duración', it.d && isFinite(it.d) ? fmtT(it.d) : '')}${row('Tamaño', fmtB(it.s))}${row('Modificado', new Date(it.m).toLocaleString('es'))}${row('Carpeta', esc(it.dir || '(raíz)'))}
    <div class="kv col"><span>Ruta</span><code>${esc(gaAbs(it))}</code></div>
    <div class="acts"><button data-l="copy">Copiar ruta</button><button data-l="folder">Solo esta carpeta</button><button data-l="space">Ver en el espacio</button></div>`; }
addEventListener('resize', () => { if (GA.lb && LB.el) { const wasFit = Math.abs(LB.s - LB.fit) < 1e-3; LB.fit = lbFitScale(); if (wasFit) lbFit(false); else lbApply(false); } });
document.addEventListener('fullscreenchange', () => setTimeout(() => GA.lb && lbFit(false), 50));

// the gallery and its lightbox own the keyboard while open
addEventListener('keydown', e => {
  if (!galOpen()) return; if (e.target.tagName === 'INPUT' && e.target.id !== 'ga-z') return; if (e.ctrlKey && e.key.toLowerCase() !== 'f' || e.metaKey || e.altKey) return;
  const k = e.key; e.stopImmediatePropagation();
  if (GA.lb) { const m = { Escape: 'close', ArrowLeft: 'prev', ArrowRight: 'next', PageUp: 'prev', PageDown: 'next', Home: 'first', End: 'last', '+': 'zin', '=': 'zin', '-': 'zout', '0': 'fit', '1': 'one', r: 'rot', R: 'rotb', b: 'bg', B: 'bg', i: 'info', I: 'info', p: 'show', P: 'show', f: 'full', F: 'full', ' ': 'play' }[k];
    if (m && !(k === ' ' && e.target.closest && e.target.closest('video,audio'))) { e.preventDefault(); if (k === 'Escape' && document.fullscreenElement) return document.exitFullscreen().catch(() => {}); lbAct(m); } return; }
  if (k === 'Escape') { e.preventDefault(); return closeGallery(); }
  if (k === '/' || (e.ctrlKey && k.toLowerCase() === 'f')) { e.preventDefault(); return $('#ga-q').focus(); }
  if (/^Arrow/.test(k)) { e.preventDefault(); if (GA.sel < 0) return gaSelect(0); return gaMove(k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0); }
  if (k === 'Enter' || k === ' ') { e.preventDefault(); if (GA.sel < 0) gaSelect(0); return GA.list.length && openLightbox(GA.sel); }
  if (k === 'Home') { e.preventDefault(); return gaSelect(0); } if (k === 'End') { e.preventDefault(); return gaSelect(GA.list.length - 1); }
  if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); const n = Math.max(1, Math.floor(gm.clientWidth / (GA.size + 12))) * Math.max(1, Math.floor(gm.clientHeight / (GA.size + 50))); return gaSelect(GA.sel + (k === 'PageDown' ? n : -n)); }
  if (k === '+' || k === '=' || k === '-') { GA.size = Math.max(100, Math.min(380, GA.size + (k === '-' ? -30 : 30))); gaSave(); return gaStyle(); }
  if (k === 'g' || k === 'G') return $('#ga-g').click(); if (k === 'c' || k === 'C') return $('#ga-cr').click();
  if (k === 'Backspace' && GA.dir) { const i = GA.dir.lastIndexOf(GA.sep); GA.dir = i < 0 ? '' : GA.dir.slice(0, i); renderTree(); return applyFilter(true); }
}, true);
S.openGallery = openGallery; S.GA = GA; /* test hooks */
