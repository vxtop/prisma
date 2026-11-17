// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Right-hand panel (cube / object / process) and UI helpers: index progress, confirm dialog,
// scenes, local 3D/PDF loaders, tooltips, help, breadcrumb and multi-select.
// === Side Panel: Cube / Object / Process ===
S.mode = 'cube'; S.tabs = { obj: 'vista', proc: 'proc' };
const TABS = { tnode: [['info', 'Carpeta']], cube: [['ficha', 'Ficha'], ['props', 'Datos'], ['celda', 'Celdas'], ['act', 'Actividad'], ['procs', 'Procesos']], obj: [['vista', 'Vista'], ['props', 'Datos'], ['rel', 'Relaciones']], proc: [['proc', 'Proceso'], ['seguir', 'Seguir'], ['mem', 'Memoria'], ['arbol', 'Árbol'], ['red', 'Red']] };
function panelFrame(mode, name, path, cur) {
  const was = $('#right').style.display; $('#right').style.display = 'flex'; if (was !== 'flex') applyView();
  $('#rn').textContent = name; $('#rp').innerHTML = '<span style="direction:ltr;unicode-bidi:isolate">' + esc(path) + '</span>';
  $('#tabs').innerHTML = TABS[mode].map(([k, l]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join(''); $('#r-exp').style.display = mode === 'cube' ? '' : 'none';
}
function renderObjPanel() {
  const o = OB.sel, i = o.info, t = S.tabs.obj, el = $('#tab'); panelFrame('obj', i.name, i.path, t); builtFor = '';
  if (t === 'vista') {
    const u = rawURL(i.path); let h = '<div class="acts" style="margin:0 0 12px"><button id="ob-view" class="on">' + IC('eye') + 'Abrir en el visor</button><span class="hint" style="align-self:center">o doble clic en el objeto</span></div>';
    if (o.model) h += '<div class="note" style="padding:18px 4px">El modelo gira en el espacio junto a su carpeta. Doble clic en él para acercarte; arrastra para orbitar a su alrededor.</div>';
    else if (i.kind === 'image' && i.mime) h += `<img class="pv" src="${u}">`;
    else if (i.kind === 'video' && i.mime) h += `<video class="pv" src="${u}" controls muted loop autoplay></video>`;
    else if (i.kind === 'audio' && i.mime) h += `<canvas id="pvw" width="700" height="160" class="pv"></canvas><audio src="${u}" controls style="width:100%;margin-top:8px"></audio>`;
    else if (i.ext === 'pdf') h += `<iframe class="pv" src="${u}" style="height:100%"></iframe>`;
    else if (o.font) h += `<div style="font-family:${o.font};font-size:34px;line-height:1.3">Aa Bb Cc Ññ<br><span style="font-size:20px">El veloz murciélago hindú comía feliz cardillo y kiwi. 0123456789</span></div>`;
    else if (i.table) h += `<table class="tb">${i.table.slice(0, 24).map((r, k) => `<tr>${r.slice(0, 8).map(c => k ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>`;
    else if (i.json) h += `<div class="kv">${i.json.slice(0, 30).map(([k, v]) => `<span style="color:var(--ai)">${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>`;
    else if (i.text != null) { const ls = i.text.split('\n'), n = 44, off = Math.max(0, Math.min(o.scroll, ls.length - n));
      h += `<pre id="pvt" class="code">${ls.slice(off, off + n).map((l, k) => `<i>${String(off + k + 1).padStart(4)}</i> ${esc(l.slice(0, 160))}`).join('\n')}</pre><div class="note">${off + 1}–${Math.min(ls.length, off + n)} de ${i.lines} líneas · rueda para desplazar</div>`; }
    else if (i.hex) h += `<pre class="code">${(i.hex.match(/.{1,24}/g) || []).slice(0, 16).map((r, k) => `<i>${(k * 12).toString(16).padStart(4, '0')}</i> ${r.match(/../g).join(' ')}`).join('\n')}</pre><div class="note">${esc(i.magic || 'formato desconocido')}</div>`;
    el.innerHTML = `<div class="pvbox">${h}</div><div class="note" style="margin-top:6px">${esc(i.dims || '')}</div>`;
    const w = $('#pvw'); if (w && o.wave) { const g = w.getContext('2d'), N = o.wave.length; g.fillStyle = '#a98bc9'; for (let k = 0; k < N; k++) { const hh = o.wave[k] * 70; g.fillRect(k * 700 / N, 80 - hh, Math.max(1, 700 / N - .5), hh * 2); } }
    $('#ob-view').onclick = () => enterViewer(o);
    const pre = $('#pvt'); if (pre) pre.onwheel = e => { e.preventDefault(); o.scroll = Math.max(0, o.scroll + Math.sign(e.deltaY) * 6); renderObjPanel(); };
  } else if (t === 'props') {
    el.innerHTML = `<div class="kv"><span>Tipo</span><b>${esc(KIND_TXT[i.kind] || i.kind)}${i.ext ? ' · .' + esc(i.ext) : ''}</b><span>MIME</span><b>${esc(i.mime || '—')}</b><span>Firma</span><b>${esc(i.magic || '—')}</b>
      <span>Tamaño</span><b>${fmtB(i.size)} · ${fmtN(i.size)} B</b>${i.lines ? `<span>Líneas</span><b>${i.lines}</b>` : ''}${i.dims ? `<span>Medidas</span><b>${esc(i.dims)}</b>` : ''}
      <span>Creado</span><b>${ago(i.birth)}</b><span>Modificado</span><b>${ago(i.mtime)}</b><span>Último acceso</span><b>${ago(i.atime)}</b><span>Cubo</span><b>${i.cube ? esc(base(i.cube)) : 'ninguno abierto'}</b><span>Abierto ahora por</span><b id="ob-lk">consultando…</b></div>
      <h2 class="sub">Acciones</h2><button id="ob-cube">Abrir su carpeta como cubo</button> <button id="ob-close">Cerrar objeto</button>`;
    apiT('/api/lockers?path=' + encodeURIComponent(i.path)).then(l => { const e = $('#ob-lk'); if (e) e.textContent = l.length ? l.map(x => x.name + ' #' + x.pid).join(', ') : 'nadie'; }).catch(er => { const e = $('#ob-lk'); if (e) e.textContent = '—'; });
    $('#ob-cube').onclick = () => post('/api/open', { path: i.path.replace(/[\\/][^\\/]*$/, '') }).catch(() => {}); $('#ob-close').onclick = () => closeObj(o);
  } else {
    const row = (r, dir) => `<div data-r="${esc(r)}" style="cursor:pointer"><span>${dir} ${esc(r)}</span><span>ver</span></div>`;
    el.innerHTML = i.cube ? `<h2>Nombra a (${(i.refsOut || []).length})</h2><div class="list">${(i.refsOut || []).slice(0, 12).map(r => row(r, '→')).join('') || '<div class="note">Nada.</div>'}</div>
      <h2 class="sub">Lo nombran (${(i.refsIn || []).length})</h2><div class="list">${(i.refsIn || []).slice(0, 12).map(r => row(r, '←')).join('') || '<div class="note">Nadie.</div>'}</div>${i.refsOut == null ? '<div class="note">Selecciona el cubo una vez para analizar sus referencias.</div>' : ''}`
      : '<div class="note">Abre la carpeta que lo contiene como cubo para ver sus referencias con otros archivos.</div>';
    el.querySelectorAll('[data-r]').forEach(d => d.onclick = () => openObject(joinP(i.cube, d.dataset.r)));
  }
}
function renderProcPanel() {
  const nd = G.sel; if (!nd) return; const n = nd.n, t = S.tabs.proc, el = $('#tab'); builtFor = '';
  panelFrame('proc', nodeName(n), n.exe || n.cmd || KIND_ES[n.kind], t); if (n.kind === 'group' || n.kind === 'group-root' || n.kind === 'net') document.querySelectorAll('#tabs [data-t=seguir], #tabs [data-t=mem]').forEach(b => b.style.display = 'none');
  const canAct = n.pid && !String(n.pid).startsWith('g') && n.kind !== 'net' && n.kind !== 'core' && n.kind !== 'group-root';
  if (t === 'seguir') return renderFollowTab(el, nd);
  if (t === 'mem') { const pd = procDet.get(String(n.pid)); if (canAct && (!pd || Date.now() - pd.t > 8000)) loadProcDetail(n.pid); const d = pd && pd.d;
    el.innerHTML = !canAct ? '<div class="note">Sin detalle para este nodo.</div>' : !d ? '<div class="note">Leyendo el proceso…</div>' : `<div class="kv">${d.desc ? `<span>Descripción</span><b>${esc(d.desc)}</b>` : ''}${d.company ? `<span>Fabricante</span><b>${esc(d.company)}</b>` : ''}${d.ver ? `<span>Versión</span><b>${esc(d.ver)}</b>` : ''}
      ${d.start ? `<span>Inicio</span><b>${ago(Date.parse(d.start))}</b>` : ''}<span>Hilos</span><b>${d.threads ?? '—'}</b>${d.gui ? `<span>Objetos GDI / USER</span><b>${d.gui.split('|').join(' / ')}</b>` : ''}${d.handles != null ? `<span>Identificadores</span><b>${fmtN(d.handles)}</b>` : ''}<span>Memoria privada</span><b>${fmtB(d.priv)}</b>${d.peak ? `<span>Pico de RAM</span><b>${fmtB(d.peak)}</b>` : ''}${d.prio ? `<span>Prioridad</span><b>${esc(d.prio)}</b>` : ''}${d.responding === false ? '<span>Estado</span><b style="color:var(--bad)">no responde</b>' : ''}</div>
      ${d.err ? `<div class="note" style="margin-top:6px">${esc(d.err)}</div>` : ''}${d.thl && d.thl.length ? `<h2 class="sub">Hilos más activos (${d.thl.length})</h2><div class="list">${[...d.thl].sort((a, b) => b.dc - a.dc || (b.c || 0) - (a.c || 0)).slice(0, 10).map(x => `<div><span>#${x.id} · ${x.s === 'Running' ? 'ejecutando' : x.s === 'Wait' ? 'espera' + (x.w ? ' (' + x.w + ')' : '') : x.s}</span><span>${x.dc ? '+' + x.dc + ' ms' : x.c != null ? Math.round(x.c / 1000) + ' s' : '—'}</span></div>`).join('')}</div>` : ''}<h2 class="sub">Módulos cargados en memoria (${(d.modules || []).length})</h2><div class="list">${(d.modules || []).slice(0, 14).map(m => `<div title="${esc(m.f)}"><span>${esc(m.n)}</span><span>${fmtB(m.s)}</span></div>`).join('') || '<div class="note">No accesibles (proceso protegido o de otro usuario).</div>'}</div>
      ${d.files ? `<h2 class="sub">Archivos abiertos (${d.files.length})</h2><div class="list">${d.files.slice(0, 10).map(f => `<div><span>${esc(f)}</span><span></span></div>`).join('')}</div>` : '<div class="note" style="margin-top:8px">Para saber qué proceso usa un archivo concreto, ábrelo como objeto: sus propiedades lo muestran.</div>'}`; return; }
  if (t === 'proc') {
    const sess = n.kind === 'claude' ? [...S.sessions.values()].find(s => !s.ghost && s.meta && (s.meta.account === n.account || !n.account) && s.meta.active) : null, m = sess && sess.meta;
    el.innerHTML = `<div class="kv"><span>Tipo</span><b>${esc(KIND_ES[n.kind] || n.kind)}</b>${n.pid && n.kind !== 'net' && !/^g\d/.test(String(n.pid)) ? `<span>PID / padre</span><b>${esc(n.pid)} / ${esc(n.ppid ?? '—')}</b>` : ''}
      ${n.win ? `<span>Ventana</span><b>${esc(n.win)}</b>` : ''}${n.account ? `<span>Cuenta</span><b>${esc(n.account)}</b>` : ''}${n.count ? `<span>Procesos</span><b>${n.count}</b>` : ''}
      ${n.kind !== 'net' ? `<span>RAM</span><b>${fmtB(n.ws)}</b><span>CPU</span><b>${cpuEq(n.cpu)} % del equipo · ${n.cpu || 0} % de un núcleo</b><span>E/S total</span><b>${fmtB(n.io)}/s</b><span>Conexiones</span><b>${(n.net || []).length}</b><span>Hijos</span><b>${(n.kids || []).length}</b>` : `<span>Conexiones</span><b>${n.count}</b><span>Desde</span><b>${(n.owners || []).map(o => esc(nodeName((G.nodes.get(o) || { n: { name: o } }).n))).join(', ')}</b>`}</div>
      ${n.cmd ? `<h2 class="sub">Línea de órdenes</h2><pre class="code" style="white-space:pre-wrap;max-height:120px">${esc(n.cmd)}</pre>` : ''}
      ${m ? `<h2 class="sub" style="color:var(--ai)">Sesión de IA en curso</h2><div class="kv"><span>Modelo</span><b>${esc(m.model || '—')}</b><span>Contexto</span><b>${fmtK(m.ctx)} tok</b><span>Proyecto</span><b>${esc(m.project)}</b></div>
        <div class="list" style="margin-top:6px">${m.trace.slice(-7).reverse().map(e => `<div><span><span style="color:var(--ai)">${esc(e.op)}</span> ${esc(e.abs ? base(e.abs) : e.target)}</span><span>${ago(e.t)}</span></div>`).join('')}</div>` : ''}`;
  } else if (t === 'arbol') {
    const lines = []; const walk = (x, d) => { if (lines.length > 26) return; lines.push([x, d]); (x.kids || []).forEach(k => walk(k, d + 1)); }; walk(n, 0);
    el.innerHTML = `<div class="list">${lines.map(([x, d]) => `<div data-pid="${esc(x.pid)}" style="cursor:pointer"><span style="padding-left:${d * 12}px"><span style="color:${NODE_COL[x.kind] || '#888'}">●</span> ${esc(nodeName(x))}</span><span>${fmtB(x.ws)} · ${x.cpu || 0} %</span></div>`).join('')}</div><div class="note" style="margin-top:6px">Clic en una línea para inspeccionar ese proceso.</div>`;
    el.querySelectorAll('[data-pid]').forEach(d => d.onclick = () => { const g = G.nodes.get(d.dataset.pid); if (g) { selectNode(g); flyTo(g.pos, 7); } });
  } else {
    const all = []; const walk = x => { (x.net || []).forEach(c => all.push([x, c])); (x.kids || []).forEach(walk); }; if (n.kind === 'net') (n.owners || []).forEach(o => { const g = G.nodes.get(o); if (g) (g.n.net || []).forEach(c => (c.host === n.name || c.rip === n.name) && all.push([g.n, c])); }); else walk(n);
    const lis = all.filter(([, c]) => c.state === 'escucha'), est = all.filter(([, c]) => c.state === 'establecida');
    el.innerHTML = `<h2>Escuchando (${lis.length})</h2><div class="list">${lis.slice(0, 8).map(([x, c]) => `<div><span>:${c.lport} <span style="color:var(--dim)">${esc(c.lip)}</span></span><span>${esc(nodeName(x))}</span></div>`).join('') || '<div class="note">Ningún puerto abierto.</div>'}</div>
      <h2 class="sub">Conexiones establecidas (${est.length})</h2><div class="list">${est.slice(0, 16).map(([x, c]) => `<div><span>${esc(c.host && c.host !== 'local' ? c.host : c.rip)}:${c.rport}</span><span>${esc(nodeName(x))} · :${c.lport}</span></div>`).join('') || '<div class="note">Sin conexiones.</div>'}</div>
      ${n.kind === 'claude' ? (() => { const reqs = [...S.sessions.values()].filter(s => s.meta && (!n.account || s.meta.account === n.account)).flatMap(s => s.meta.trace).filter(e => /^(WebFetch|WebSearch)$/.test(e.tool)).slice(-10).reverse();
        return `<h2 class="sub" style="color:var(--ai)">Peticiones web de la IA (${reqs.length})</h2><div class="list">${reqs.map(e => `<div><span>${esc(e.tool === 'WebSearch' ? 'busca ' + e.target : e.target)}</span><span>${ago(e.t)}</span></div>`).join('') || '<div class="note">Ninguna en esta sesión.</div>'}</div>`; })() : ''}
      <div class="note" style="margin-top:8px">Conexiones TCP vistas por el sistema, con el dominio cuando se conoce. El contenido de las peticiones va cifrado: verlo exigiría un proxy que descifre TLS, que vxtop no instala.</div>`;
  }
}

// === Index Progress and Effects ===
S.idx = new Map();
const fmtC = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' k' : String(n | 0);
function onIndex(m) {
  const prev = S.idx.get(K(m.root)); S.idx.set(K(m.root), m);
  if (m.state === 'done' && (!prev || prev.state !== 'done')) {
    feed('índice', '#4fb3ad', `${base(m.root) || m.root} · ${fmtC(m.files)} archivos · ${fmtB(m.bytes)} · ${(m.ms / 1000).toFixed(0)} s`);
    const inRoot = p => trimSep(K(p)) === trimSep(K(m.root)) || under(K(p), K(m.root));
    for (const c of S.cubes.values()) if (inRoot(c.path)) scanCube(c);
    if (EX.data && inRoot(EX.data.path)) exGo(EX.data.path);
  }
  renderIndexLine();
}
function renderIndexLine() {
  const run = [...S.idx.values()].filter(x => x.state === 'running'), el = $('#L3b'); if (!el) return;
  if (run.length) { const x = run[0]; el.innerHTML = `<span style="color:var(--c)">indexando</span> ${esc(base(x.root) || x.root)} · ${fmtC(x.files)} · ${fmtB(x.bytes)} · ${((x.ms || 0) / 1000).toFixed(0)} s`; el.title = x.cur || ''; }
}
const startIx = p => post('/api/index', { path: p }).then(() => feed('índice', '#4fb3ad', 'indexando ' + p)).catch(e => feed('error', '#d9534f', e.message));
api('/api/index').then(l => l.forEach(onIndex)).catch(() => {});

$('#empty').onclick = e => { const q = e.target.closest('[data-p]'); if (q) return post('/api/open', { path: q.dataset.p, depth: 1 }).catch(er => feed('error', '#d9534f', er.message)); if (e.target.closest('[data-e]')) setLeft('explorer'); };
apiT('/api/roots').then(r => { EX.roots = r; $('#emptyq').innerHTML = r.slice(0, 7).map(x => `<button data-p="${esc(x.path)}">${esc(x.name)}</button>`).join(''); }).catch(() => {});

// === Confirm Dialog (no browser dialogs) ===
function confirmBox(title, text, okLabel, danger) {
  return new Promise(res => {
    const m = $('#modal'); m.innerHTML = `<div class="mb"><b>${esc(title)}</b><p>${text}</p><div class="mbb"><button data-r="0">Cancelar</button><button data-r="1" class="${danger ? 'danger' : 'on'}">${esc(okLabel)}</button></div></div>`;
    m.style.display = 'flex'; const done = v => { m.style.display = 'none'; removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.stopPropagation(); done(true); } }; addEventListener('keydown', key, true);
    m.onclick = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === m) done(false); };
  });
}

const procDet = new Map();
setInterval(() => { const n = G.sel && G.sel.n; if (VIEW.cur === 'sistema' && n && n.pid && !String(n.pid).startsWith('g') && !['net', 'core', 'group-root'].includes(n.kind)) loadProcDetail(n.pid); }, 3000);
async function loadProcDetail(pid) { try { const d = await apiT('/api/proc?pid=' + pid), pv = procDet.get(String(pid)), pm = new Map(((pv && pv.d && pv.d.thl) || []).map(x => [x.id, x.c]));
  (d.thl = [].concat(d.thl || [])).forEach(x => { const c0 = pm.get(x.id); x.dc = c0 != null && x.c != null ? Math.max(0, x.c - c0) : 0; }); d.dt = pv ? Date.now() - pv.t : 0; procDet.set(String(pid), { t: Date.now(), d }); if (G.sel && String(G.sel.n.pid) === String(pid)) renderPanel(); } catch (e) { procDet.set(String(pid), { t: Date.now(), d: { err: e.message } }); } }

// === Scenes and Templates ===
async function openScenes() {
  const box = $('#scn'); let all = {}; try { all = await apiT('/api/scenes'); } catch {}
  const names = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  box.innerHTML = `<h2>Escenas</h2><div class="note" style="margin-bottom:8px">Guardan lo abierto (cubos, objetos, cámara y espacio) para volver a ello.</div>
    <div style="display:flex;gap:6px;margin-bottom:10px"><input id="scn-n" placeholder="Nombre de la escena" style="flex:1;width:auto"><button id="scn-s">Guardar</button></div>
    <div class="list">${names.map(n => `<div><span data-a="${esc(n)}" style="cursor:pointer;color:#eef1f3">${esc(n)}</span><span>${(all[n].cubes || []).length} cubos · ${ago(all[n].at)} <u data-d="${esc(n)}" style="cursor:pointer;text-decoration:none;color:var(--bad);margin-left:6px">✕</u></span></div>`).join('') || '<div class="note">Todavía no hay escenas.</div>'}</div>`;
  box.style.display = 'block'; $('#scn-n').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#scn-s').click(); });
  $('#scn-s').onclick = async () => { const name = $('#scn-n').value.trim(); if (!name) return $('#scn-n').focus();
    const data = { objs: OB.list.map(o => o.path), cam: { p: camera.position.toArray(), t: controls.target.toArray() }, view: VIEW.cur, exploded: S.exploded };
    try { await post('/api/scene', { action: 'save', name, data }); feed('escena', '#4fb3ad', 'guardada ' + name); openScenes(); } catch (e) { feed('error', '#d9534f', e.message); } };
  box.onclick = async e => { const a = e.target.closest('[data-a]'), d = e.target.closest('[data-d]');
    if (d) { if (await confirmBox('Borrar escena', `Se borra la escena «${esc(d.dataset.d)}». Los archivos no se tocan.`, 'Borrar', true)) { await post('/api/scene', { action: 'delete', name: d.dataset.d }).catch(() => {}); openScenes(); } return; }
    if (a) { try { const sc = await post('/api/scene', { action: 'apply', name: a.dataset.a }); box.style.display = 'none'; [...OB.list].forEach(closeObj);
      if (sc.view && sc.view !== VIEW.cur) setView(sc.view); S.exploded = !!sc.exploded; renderTop();
      setTimeout(async () => { for (const p of sc.objs || []) await openObject(p, false); if (sc.cam) { camera.position.fromArray(sc.cam.p); controls.target.fromArray(sc.cam.t); focusing = false; } }, 900); } catch (er) { feed('error', '#d9534f', er.message); } } };
}
$('#b-scn').onclick = () => { const b = $('#scn'); if (b.style.display === 'block') b.style.display = 'none'; else openScenes(); };
addEventListener('pointerdown', e => { if (!e.target.closest('#scn') && !e.target.closest('#b-scn')) $('#scn').style.display = 'none'; }, true);
const presetOpen = (c, which) => { const d = c.data; if (!d || !d.preset) return;
  if (which === 'key') d.preset.keyFiles.forEach(f => openObject(joinP(c.path, f), false));
  else openGallery(c); };

// === 3D Models and PDF (local libraries, no CDN) ===
let LIB3D = null;
async function lib3d() {
  if (LIB3D) return LIB3D;
  const [{ GLTFLoader }, { OBJLoader }, { STLLoader }, { FBXLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/OBJLoader.js'), import('three/addons/loaders/STLLoader.js'), import('three/addons/loaders/FBXLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
  return LIB3D = { GLTFLoader, OBJLoader, STLLoader, FBXLoader, DRACOLoader, MeshoptDecoder };
}
async function loadModel(o) {
  const i = o.info, ext = i.ext, dir = i.path.replace(/[\\/][^\\/]*$/, ''); if (i.size > 200e6) return;
  const L = await lib3d(), man = new THREE.LoadingManager();
  man.setURLModifier(u => /^(blob:|data:|\/api\/raw|\/vendor)/.test(u) ? u : rawURL(joinP(dir, decodeURIComponent(u).replace(/^\.\//, '').replace(/\//g, SEP(dir)))));
  const buf = await (await fetch(rawURL(i.path))).arrayBuffer(); let obj;
  if (ext === 'glb' || ext === 'gltf') { const ld = new L.GLTFLoader(man), dr = new L.DRACOLoader(); dr.setDecoderPath('/vendor/three/examples/jsm/libs/draco/gltf/'); ld.setDRACOLoader(dr); ld.setMeshoptDecoder(L.MeshoptDecoder);
    obj = (await new Promise((ok, ko) => ld.parse(buf, '', ok, ko))).scene; dr.dispose(); }
  else if (ext === 'obj') obj = new L.OBJLoader(man).parse(new TextDecoder().decode(buf));
  else if (ext === 'stl') { const g = new L.STLLoader(man).parse(buf); g.computeVertexNormals(); obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xb8c2c8, metalness: .2, roughness: .55 })); }
  else if (ext === 'fbx') obj = new L.FBXLoader(man).parse(buf, '');
  else return;
  if (!OB.list.includes(o)) return disposeTree(obj);
  const bx = new THREE.Box3().setFromObject(obj), sz = bx.getSize(new THREE.Vector3()), c = bx.getCenter(new THREE.Vector3()), k = 2.2 / Math.max(sz.x, sz.y, sz.z, 1e-6);
  let tris = 0; obj.traverse(m => { if (m.isMesh) { const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  const g = new THREE.Group(); obj.position.sub(c); g.add(obj); g.scale.setScalar(k); g.userData.k0 = k; scene.add(g); o.model = g;
  o.mesh.material.opacity = 0; o.mesh.material.depthWrite = false; o.aspect = 1; i.dims = `${fmtN(Math.round(tris))} triángulos · ${sz.x.toFixed(2)} × ${sz.y.toFixed(2)} × ${sz.z.toFixed(2)}`; if (OB.sel === o) renderPanel();
}
const disposeTree = obj => obj.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) [].concat(m.material).forEach(x => { for (const k in x) if (x[k] && x[k].isTexture) x[k].dispose(); x.dispose(); }); });
let PDFJS = null;
async function loadPdf(o) {
  if (!PDFJS) { PDFJS = await import('/vendor/pdfjs/pdf.min.mjs'); PDFJS.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs'; }
  const doc = await PDFJS.getDocument({ url: rawURL(o.info.path), isEvalSupported: false }).promise, page = await doc.getPage(1), vp0 = page.getViewport({ scale: 1 }), sc = 640 / vp0.width, vp = page.getViewport({ scale: sc });
  if (!OB.list.includes(o)) return doc.destroy();
  o.cv.width = Math.round(vp.width); o.cv.height = Math.round(vp.height); const g = o.cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.cv.width, o.cv.height);
  await page.render({ canvasContext: g, viewport: vp }).promise; o.tex.dispose(); o.tex = new THREE.CanvasTexture(o.cv); o.tex.colorSpace = THREE.SRGBColorSpace; o.mesh.material.map = o.tex; o.mesh.material.needsUpdate = true;
  o.aspect = vp.width / vp.height; o.info.dims = `${doc.numPages} página${doc.numPages > 1 ? 's' : ''} · ${Math.round(vp0.width)}×${Math.round(vp0.height)} pt`; doc.destroy(); if (OB.sel === o) renderPanel();
}

// === Tooltips (data-tip="Title|Description", data-key="shortcut") ===
{
  const tipEl = $('#tip'); let tipT = 0, tipFor = null;
  document.addEventListener('mouseover', e => {
    if (e.target === canvas) return; const t = e.target.closest('[data-tip]'); if (t === tipFor) return; tipFor = t; clearTimeout(tipT);
    if (!t) { tipEl.style.display = 'none'; return; }
    tipT = setTimeout(() => { if (!t.isConnected) return; const [a, b] = t.dataset.tip.split('|');
      tipEl.innerHTML = `<b>${esc(a)}</b>${t.dataset.key ? ' <kbd>' + esc(t.dataset.key) + '</kbd>' : ''}${b ? '<span class="hint">' + esc(b) + '</span>' : ''}`;
      tipEl.style.display = 'block'; const r = t.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
      tipEl.style.left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px'; tipEl.style.top = (r.bottom + 8 + th > innerHeight ? r.top - th - 8 : r.bottom + 8) + 'px'; }, 380);
  });
  document.addEventListener('pointerdown', () => { clearTimeout(tipT); if (tipFor) { tipEl.style.display = 'none'; tipFor = null; } }, true);
}

// === Help: Controls, Shortcuts, Legend ===
const HELP = [['Arrastrar con el botón izquierdo', 'orbitar'], ['Arrastrar con el botón derecho', 'desplazar'], ['Rueda', 'acercar / alejar'], ['Clic', 'seleccionar'], ['Ctrl + clic en cubos', 'comparar varios'],
  ['Doble clic', 'enfocar · abrir en el visor'], ['Clic derecho', 'menú de opciones'], ['Mayús + arrastrar un cubo', 'moverlo']];
const KEYS = [['H', 'encuadrar todo'], ['V', 'espacio ↔ sistema'], ['T', 'administrador de tareas'], ['Tab', 'siguiente cubo'], ['E', 'explotar el cubo'], ['G', 'galería de medios del cubo'], ['X · Y · Z', 'cortes por eje'], ['1 – 4', 'disposición del espacio'], ['Espacio', 'seguir (IA o proceso)'], ['Esc', 'salir · limpiar'], ['?', 'esta ayuda']];
const LEGEND = [['#4fb3ad', 'Código y actividad de disco'], ['#6f8fb3', 'Datos'], ['#9a8f7a', 'Documentos y medios'], ['#e8a33d', 'IA: foco, lecturas y escrituras'], ['#8a9399', 'Lecturas de vxtop y accesos'], ['#ffffff', 'Selección']];
$('#help').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:var(--t4)">Controles y leyenda</b><button class="ico" data-hc><svg class="i"><use href="#i-close"/></svg></button></div>
  <div class="cols"><div><h2>Ratón</h2>${HELP.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('')}<h2 class="sub">Colores</h2>${LEGEND.map(([c, t]) => `<div class="row"><span><i class="sw" style="background:${c}"></i>${t}</span></div>`).join('')}</div>
  <div><h2>Teclado</h2>${KEYS.map(([a, b]) => `<div class="row"><span><kbd>${a}</kbd></span><span>${b}</span></div>`).join('')}<h2 class="sub">El cubo</h2><div class="note" style="line-height:1.6">27 celdas = tipo (X: código · datos · documentos) × profundidad (Y: raíz · niveles 1–2 · 3+) × antigüedad (Z: &lt;24 h · &lt;30 d · histórico). Cada ventanita es un archivo reciente.</div></div></div>
  <p class="hint" style="margin:14px 0 0">vxtop solo observa: no modifica archivos ni actúa sobre procesos.</p>`;
const toggleHelp = v => { const h = $('#help'); h.style.display = (v ?? h.style.display !== 'block') ? 'block' : 'none'; };
$('#b-help').onclick = () => toggleHelp(); $('#help').addEventListener('click', e => { if (e.target.closest('[data-hc]')) toggleHelp(false); });
addEventListener('pointerdown', e => { if (!e.target.closest('#help') && !e.target.closest('#b-help')) $('#help').style.display = 'none'; }, true);
$('#b-home').onclick = () => fitAll();

// === Breadcrumb ===
let crumbKey = '';
function renderCrumb() {
  const parts = [];
  if (VIEW.cur === 'tareas') { parts.push(['Tareas', 'home']); if (TKS.sel) { const z = TKS.zones.find(q => q.k === TKS.sel.zone); parts.push([z.name, 'zone:' + z.k], [TKS.sel.label, 'task']); } }
  else if (VIEW.cur === 'sistema') { parts.push(['Sistema', 'home']); if (G.sel) { const ch = []; for (let x = G.sel; x && x.id !== 'core'; x = G.nodes.get(x.parent)) ch.unshift(x); ch.forEach(x => parts.push([x.n.win && x.n.kind !== 'shell' && x.n.kind !== 'group-root' ? x.n.name.replace(/\.exe$/i, '') + ' · ' + x.n.win : nodeName(x.n), 'node:' + x.id])); } }
  else { parts.push([(S.spaces.find(x => x.id === S.space) || { name: 'Espacio' }).name, 'home']); const base0 = S.sel || (S.enter && S.cubes.get(S.enter)); if (base0) { const ch = []; for (let c = base0; c; c = c.parent && S.cubes.get(K(c.parent))) ch.unshift(c); ch.forEach(c => parts.push([c.name, 'cube:' + c.key])); }
    if (S.mode === 'obj' && OB.sel) parts.push([OB.sel.info.name, 'obj']); if (S.multi.size > 1) parts.push([`${S.multi.size} cubos seleccionados`, 'cmp']); }
  const k = parts.map(p => p[1] + p[0]).join('|'); if (k === crumbKey) return; crumbKey = k;
  $('#crumb').innerHTML = parts.map((p, i) => `<a data-go="${esc(p[1])}" class="${i === parts.length - 1 ? 'cur' : ''}" data-tip="${i ? 'Ir aquí' : 'Encuadrar todo'}">${esc(p[0])}</a>`).join('<i>›</i>');
}
$('#crumb').onclick = e => { const a = e.target.closest('[data-go]'); if (!a) return; const g = a.dataset.go;
  if (g === 'home') { if (VIEW.cur === 'espacio' && S.enter) { S.enter = null; layout(); deselect(); } return fitAll(); } if (g.startsWith('cube:')) { const c = S.cubes.get(g.slice(5)); if (c) { const hasKids = [...S.cubes.values()].some(x => x.parent && K(x.parent) === c.key); if (hasKids && c !== S.sel) { S.enter = c.key; layout(); select(c, false); setTimeout(fitAll, 350); } else select(c, true); } return; }
  if (g.startsWith('zone:')) { const z = TKS.zones.find(q => q.k === g.slice(5)); if (z) flyTo(z.c.clone(), 34); return; }
  if (g === 'task' && TKS.sel) return flyTo(new THREE.Vector3(TKS.sel.x, TKS.sel.ch / 2, TKS.sel.z), 16);
  if (g.startsWith('node:')) { const x = G.nodes.get(g.slice(5)); if (x) { selectNode(x); flyTo(x.pos, 16); } return; } if (g === 'obj' && OB.sel) enterViewer(OB.sel); };

// === Multi-Select Cubes (Compare) ===
S.multi = new Set();
function toggleMulti(c) { if (!S.multi.size && S.sel) S.multi.add(S.sel.key); S.multi.has(c.key) ? S.multi.delete(c.key) : S.multi.add(c.key); if (S.multi.size < 2) S.multi.clear(); else S.tab = 'cmp'; S.sel = c; S.mode = 'cube'; renderPanel(); renderCubes(); }
function renderCompare(el) {
  const cs = [...S.multi].map(k => S.cubes.get(k)).filter(c => c && c.data), mx = f => Math.max(1, ...cs.map(f));
  const B = c => c.data.totals.bytes, Fl = c => c.data.totals.files, now = Date.now();
  el.innerHTML = `<div class="note" style="margin-bottom:10px">Ctrl + clic en otro cubo para añadir o quitar. Esc para salir.</div>
    <h2>Tamaño</h2><div class="cmp">${cs.map(c => `<span>${esc(c.name)}</span><b class="num">${fmtB(B(c))}</b><span class="hint">${(B(c) / cs.reduce((s, x) => s + B(x), 0) * 100).toFixed(0)} %</span><div class="bar"><i style="width:${B(c) / mx(B) * 100}%"></i></div>`).join('')}</div>
    <h2 class="sub">Archivos</h2><div class="cmp">${cs.map(c => `<span>${esc(c.name)}</span><b class="num">${fmtN(Fl(c))}</b><span class="hint">${fmtN(c.data.totals.dirs)} carp.</span><div class="bar" style="--k:#6f8fb3"><i style="width:${Fl(c) / mx(Fl) * 100}%"></i></div>`).join('')}</div>
    <h2 class="sub">Actividad</h2><div class="list">${cs.map(c => `<div><span>${esc(c.name)}</span><span>${c.data.newest ? 'último cambio ' + ago(c.data.newest) : '—'}${now - c.aiHot < 600000 ? ' · IA' : ''}</span></div>`).join('')}</div>`;
}

