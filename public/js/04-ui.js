// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// User interface: top bar, cube list, layers, HUD, info panel and tabs,
// search and the layout/slice/follow toggles.
// === Interface ===
function renderTop() {
  document.querySelectorAll('#lay button').forEach(b => b.classList.toggle('on', b.dataset.m === S.layout));
  document.querySelectorAll('#sl button').forEach(b => { const on = S.slice && S.slice.axis === +b.dataset.a; b.classList.toggle('on', !!on); b.textContent = 'XYZ'[b.dataset.a] + (on ? ' ' + (S.slice.layer + 1) : ''); });
  $('#b-ex').classList.toggle('on', S.exploded); $('#b-follow').classList.toggle('on', S.follow || FW.on); const fl = $('#b-follow .tl'); if (fl) fl.textContent = FW.on ? 'Siguiendo' : S.follow ? 'Siguiendo IA' : 'Seguir';
}
function renderCubes() {
  dimFocus();
  const el = $('#cubes'), rows = Math.max(1, Math.floor(el.clientHeight / 26)), o = S.order;
  if (typeof VIEW !== 'undefined' && VIEW.cur === 'arbol') return renderTreeList(el);
  if (typeof VIEW !== 'undefined' && VIEW.cur === 'tareas') { $('#ncubes').textContent = TKS.data ? '· ' + TKS.data.procs : '';
    el.innerHTML = TKS.zones.map(z => `<div class="ci" data-z="${z.k}"><span><span style="color:${z.col}">■</span> ${esc(z.name)}</span><span>${esc(z.n ?? '')}</span></div>`).join(''); return; }
  if (typeof VIEW !== 'undefined' && VIEW.cur === 'sistema') { const roots = G.data ? G.data.roots : []; $('#ncubes').textContent = '· ' + roots.length;
    el.innerHTML = roots.slice(0, rows).map(r => `<div class="ci ${G.sel && G.sel.id === String(r.pid) ? 'on' : ''}" data-pid="${esc(r.pid)}"><span><span style="color:${NODE_COL[r.kind] || '#888'}">●</span> ${esc(nodeName(r))}</span><span>${fmtB(r.ws)}</span></div>`).join(''); return; } $('#ncubes').textContent = o.length ? '· ' + o.length : '';
  let start = 0; const si = o.indexOf(S.sel); if (si >= rows) start = Math.min(si - (rows >> 1), o.length - rows);
  const now = Date.now();
  el.innerHTML = o.slice(start, start + rows).map(c => `<div class="ci ${c === S.sel ? 'on' : ''}" data-k="${esc(c.key)}"><span style="padding-left:${c.depth * 11}px">${c.depth ? '' : '◆ '}${esc(c.name)}${now - c.aiHot < 20000 ? '<em>●</em>' : ''}</span><span>${c.data ? fmtB(c.data.totals.bytes) : '…'}</span></div>`).join('');
}
$('#cubes').onclick = e => { const el = e.target.closest('.ci'); if (!el) return; if (el.dataset.tk) { const n = TR.nodes.get(el.dataset.tk); if (!n) return; if (e.target.closest('[data-tt]')) return trToggle(n); return trSelect(n); } if (el.dataset.z) { const z = TKS.zones.find(q => q.k === el.dataset.z); if (z) flyTo(z.c.clone(), 34); return; } if (el.dataset.pid) { const g = G.nodes.get(el.dataset.pid); if (g) { selectNode(g); flyTo(g.pos, 18); } return; } select(S.cubes.get(el.dataset.k), true); };
function renderLayers() {
  const s = S.sys, c = S.sel, p = S.procs; if (!s) return;
  const avg = S.cpuHist[S.cpuHist.length - 1] || 0, mu = (s.mem.total - s.mem.free) / s.mem.total, g = s.gpu, dk = (c && c.data && c.data.disk) || s.disk; // no cube: system disk
  $('#L1').textContent = (s.cpuModel || '').replace(/\(R\)|\(TM\)|CPU|Processor|\d+-Core/g, '').replace(/\s+/g, ' ').trim().slice(0, 22);
  $('#h-cpu').style.width = avg * 100 + '%'; $('#v-cpu').textContent = pct(avg) + ' · ' + s.cpu.length + 'n';
  $('#h-ram').style.width = mu * 100 + '%'; $('#v-ram').textContent = fmtB(s.mem.total - s.mem.free);
  $('#h-gpu').style.width = (g ? g.util : 0) + '%'; $('#v-gpu').textContent = g ? g.util + ' % · ' + (g.temp != null ? Math.round(g.temp) : '—') + '°' : 'N/D';
  $('#h-vram').style.width = (g ? g.memUsed / g.memTotal * 100 : 0) + '%'; $('#v-vram').textContent = g ? fmtB(g.memUsed) : '—';
  $('#h-disk').style.width = (dk ? (1 - dk.free / dk.total) * 100 : 0) + '%'; $('#v-disk').textContent = dk ? fmtB(dk.free) + ' lib.' : '—';
  const sp = $('#spark'), x = sp.getContext('2d'), W = sp.width, H = sp.height; x.clearRect(0, 0, W, H); x.beginPath();
  S.cpuHist.forEach((v, i) => { const px = W - (S.cpuHist.length - 1 - i) * (W / 89), py = H - 2 - v * (H - 4); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = 'rgba(79,179,173,.8)'; x.lineWidth = 1.5; x.stroke();
  if (p) { $('#L2').textContent = fmtN(p.count); $('#L2a').textContent = `E/S  ↓ ${fmtB(p.rd)}/s   ↑ ${fmtB(p.wr)}/s`; const t = p.top[0]; $('#L2b').textContent = t ? `top  ${t.name} · ${t.cpu.toFixed(0)} % · ${fmtB(t.ws)}` : ''; }
  let files = 0, bytes = 0, ev = 0; S.cores.forEach(k => { if (k.data) { files += k.data.totals.files; bytes += k.data.totals.bytes; } ev += k.evCount; });
  $('#L3').textContent = fmtB(bytes); $('#L3a').textContent = `${fmtN(files)} archivos en ${S.cubes.size} cubos`; if (![...S.idx.values()].some(x => x.state === 'running')) $('#L3b').textContent = `${fmtN(ev)} eventos de disco observados`; else renderIndexLine();
  const git = c && c.data && c.data.git; $('#L4').textContent = git ? git.branch : 'sin git'; $('#L4a').textContent = git ? `${git.commits} commits · ${git.dirty} sin commit · ${ago(git.lastTime)}` : (c ? c.name : '');
  const ss = [...S.sessions.values()].sort((a, b) => b.meta.last - a.meta.last), act = ss.filter(x => x.meta.active).length;
  $('#L5').textContent = ss.length ? `${act} activa${act === 1 ? '' : 's'} · ${ss.length}` : '—';
  $('#L5s').innerHTML = ss.slice(0, 4).map(x => { const m = x.meta, tr = m.trace[m.trace.length - 1];
    return `<div class="ll ${x.ghost ? '' : 'ai'}" style="--sc:${x.hex || '#666'}" title="${esc(m.project)}">${esc((m.model || '?').replace('claude-', ''))} · ${esc(m.account)} · ${x.ghost ? esc(m.project.replace(/^[A-Za-z]--Users-[^-]+-(Desktop-|Documents-|Escritorio-)?/, '')) + ' · ' : ''}${tr ? esc(tr.op + ' ' + (tr.abs ? base(tr.abs) : tr.target.slice(0, 30))) : '—'}</div>`; }).join('') || '<div class="ll">sin sesiones recientes</div>';
  renderCubes();
}
function renderHud() {
  const pr = [...S.sessions.values()].filter(x => !x.ghost && x.cur).sort((a, b) => b.until - a.until)[0];
  $('#hud').innerHTML = FW.on ? `<b>SIGUIENDO</b> · <i>${esc(FW.name)}</i> · ${esc(FW.last || 'esperando actividad')}` : pr ? `<b>IA</b> · <i>${esc(pr.labelTxt.length > 60 ? pr.labelTxt.slice(0, 59) + '…' : pr.labelTxt)}</i>${pr.cur.r ? ' · ' + esc(pr.cur.r.c.name) : ''} · ${ago(pr.cur.e.t)}` : '';
}
function renderPanel() {
  if (VIEW.cur === 'arbol') { if (S.mode === 'tnode' && TR.sel) return renderTreePanel(); if ($('#right').style.display !== 'none') { $('#right').style.display = 'none'; applyView(); } return; }
  if (VIEW.cur === 'tareas') { if (S.mode === 'task' && TKS.sel) return renderTaskPanel(); if ($('#right').style.display !== 'none') { $('#right').style.display = 'none'; applyView(); } return; }
  if (VIEW.cur === 'sistema' && !(S.mode === 'proc' && G.sel)) { if ($('#right').style.display !== 'none') { $('#right').style.display = 'none'; applyView(); } return; }
  if (S.mode === 'obj' && OB.sel) return renderObjPanel(); if (S.mode === 'proc' && G.sel) return renderProcPanel(); if (S.mode === 'lp' && S.lpSel && VIEW.cur === 'espacio') return renderLpPanel(); S.mode = 'cube';
  const c = S.sel; if (!c) { if ($('#right').style.display !== 'none') { $('#right').style.display = 'none'; applyView(); } return; } if (S.multi.size < 2 && S.tab === 'cmp') S.tab = 'ficha'; $('#tabs').innerHTML = (S.multi.size > 1 ? [['cmp', 'Comparar'], ...TABS.cube] : TABS.cube).map(([k, l]) => '<button data-t="' + k + '">' + l + '</button>').join(''); $('#r-exp').style.display = ''; const was = $('#right').style.display; $('#right').style.display = 'flex'; if (was !== 'flex') applyView();
  $('#rn').textContent = c.name; $('#rp').innerHTML = '<span style="direction:ltr;unicode-bidi:isolate">' + esc(c.path) + '</span>';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
  renderTab();
}
let builtFor = '';
function renderTab() {
  if (S.mode !== 'cube') return; const c = S.sel, el = $('#tab'); if (!c) return; const d = c.data;
  if (!d) { el.innerHTML = '<div class="note">Leyendo directorio…</div>'; builtFor = ''; return; }
  const sig = S.tab + '|' + c.key;
  if (S.tab === 'cmp') { builtFor = ''; return renderCompare(el); }
  if (S.tab === 'ficha') { if (builtFor !== sig || !$('#dockin')) { builtFor = sig; DOCK.html = ''; el.innerHTML = '<div class="dockin" id="dockin"></div>'; } return renderDock(); }
  builtFor = sig;
  if (S.tab === 'props') {
    const g = d.git, a = c.agent || d.agents, mx = Math.max(1, ...d.exts.map(x => x.bytes));
    el.innerHTML = `<div class="kv">
      <span>Bytes</span><b>${fmtB(d.totals.bytes)} · ${fmtN(d.totals.bytes)}</b>
      <span>Archivos / carpetas</span><b>${fmtN(d.totals.files)} / ${fmtN(d.totals.dirs)}${d.truncated ? ' · parcial' : ''}</b>
      <span>Mayor archivo</span><b>${d.largest ? esc(base(d.largest.rel)) + ' · ' + fmtB(d.largest.size) : '—'}</b>
      <span>Creado / modificado</span><b>${ago(d.created)} / ${ago(d.modified)}</b>
      <span>Rango temporal</span><b>${ago(d.oldest)} → ${ago(d.newest)}</b>
      <span>Versiones</span><b>${g ? esc(g.branch) + ' · ' + g.commits + ' commits · ' + g.dirty + ' sin commit' : 'sin git'}</b>
      <span>Sesiones de IA</span><b>${a.sessions} · ${fmtB(a.bytes)} · ${ago(a.last)}</b>
      <span>Memorias de IA</span><b>${a.memories}</b>
      <span>Ventanas (archivos)</span><b>${c.nv}</b>
      <span>Abierto por</span><b>${esc(c.by)}</b>
      <span>Escaneo</span><b>${d.scanMs} ms · hace ${ago(c.lastScan)}</b>
      <span>Índice</span><b>${d.indexed ? 'completo · ' + esc(base(d.indexed.root) || d.indexed.root) + ' · ' + ago(d.indexed.at) : d.indexing ? 'indexando ' + esc(base(d.indexing) || d.indexing) + '…' : 'no (no hace falta)'}</b></div>
      ${d.preset ? `<h2 class="sub">Plantilla</h2>${d.preset.types.map(x => `<span class="pill">${esc(x[1])}</span>`).join('')}<div class="acts">${d.preset.keyFiles.length ? `<button id="pr-key">Abrir archivos clave (${d.preset.keyFiles.length})</button>` : ''}${d.preset.media ? `<button id="pr-med">Abrir galería</button>` : ''}</div>` : ''}
      <h2 class="sub">Composición por extensión</h2>
      ${d.exts.map(x => `<div class="extrow"><span>.${esc(x.ext)} ×${x.n}</span><div class="bar"><i style="width:${x.bytes / mx * 100}%"></i></div><span>${fmtB(x.bytes)}</span></div>`).join('')}
      <h2 class="sub">Marcadores</h2>${d.markers.map(m => `<span class="tag">${esc(m)}</span>`).join('') || '<span class="note">Ninguno</span>'}`;
    if ($('#pr-key')) $('#pr-key').onclick = () => presetOpen(c, 'key'); if ($('#pr-med')) $('#pr-med').onclick = () => presetOpen(c, 'media');
  } else if (S.tab === 'celda') {
    const mxb = Math.max(1, ...d.cells.map(x => x.bytes)), sl = S.slice, inS = i => !sl || coord(i)[sl.axis] === sl.layer;
    let files = 0, bytes = 0, top = [], title;
    if (c.cell != null) { const x = d.cells[c.cell]; files = x.files; bytes = x.bytes; top = x.top; title = cellName(c.cell); }
    else { d.cells.forEach((x, i) => { if (inS(i)) { files += x.files; bytes += x.bytes; top.push(...x.top); } }); top.sort((p, q) => q.mtime - p.mtime); title = sl ? `Corte ${AXN[sl.axis]} = ${AX[sl.axis][sl.layer]}` : 'Cubo completo'; }
    el.innerHTML = `<div class="cmap">${AGES.map((n, z) => `<div><div class="lab">${n}</div><div class="cgrid">${Array.from({ length: 9 }, (_, j) => { const i = z * 9 + j, x = d.cells[i];
        return `<i data-i="${i}" class="${c.cell === i ? 'on' : ''} ${inS(i) ? '' : 'dimmed'}" title="${esc(cellName(i))}" style="background:${rgba(TYPE_HEX[i % 3], x.bytes ? .1 + .75 * Math.log(1 + x.bytes) / Math.log(1 + mxb) : 0)}"></i>`; }).join('')}</div></div>`).join('')}</div>
      <div class="note" style="margin-top:6px">Columnas: código · datos · docs. Filas: raíz · nivel 1–2 · nivel 3+.</div>
      <h2 class="sub">${esc(title)}</h2>
      <div class="kv"><span>Archivos</span><b>${fmtN(files)}</b><span>Bytes</span><b>${fmtB(bytes)}</b><span>Peso en el cubo</span><b>${d.totals.bytes ? (bytes / d.totals.bytes * 100).toFixed(1) + ' %' : '—'}</b></div>
      <h2 class="sub">Más recientes</h2><div class="list">${top.slice(0, 9).map(f => `<div><span>${esc(f.rel)}</span><span>${fmtB(f.size)} · ${ago(f.mtime)}</span></div>`).join('') || '<div class="note">Vacío</div>'}</div>`;
  } else if (S.tab === 'act') {
    const tr = [...c.ai.values()].sort((a, b) => b.t - a.t).slice(0, 10);
    el.innerHTML = `<h2>Disco · cambios detectados</h2><div class="list">${c.events.slice(0, 8).map(e => `<div title="${esc(e.who || '')}"><span>${esc(e.by ? e.by + ' ' : '')}${esc(e.type)} · ${esc(e.file)}</span><span>${esc(e.who ? e.who.replace(/^probable: /, '~') + ' · ' : '')}${ago(e.t)}</span></div>`).join('') || '<div class="note">Sin cambios desde que se abrió el cubo.</div>'}</div>
      <h2 class="sub">IA · archivos en foco</h2>
      <div class="list">${tr.map(e => `<div><span><span style="color:var(--ai)">${esc(e.op)}</span> ${esc(e.rel)}</span><span>peso ${(e.w * Math.exp(-(Date.now() - e.t) / 120000)).toFixed(2)} · ${ago(e.t)}</span></div>`).join('') || '<div class="note">Ninguna IA ha tocado este directorio en esta sesión.</div>'}</div>`;
  } else if (S.tab === 'procs') {
    const p = S.procs, L = p && p.linked, row = x => `<div><span>${esc(x.name)} <span style="color:var(--dim)">#${x.pid}</span></span><span>${fmtB(x.ws)} · ${x.cpu.toFixed(0)} % · ↓${fmtB(x.rd)}/s</span></div>`;
    el.innerHTML = `<h2>Vinculados a este directorio</h2>
      <div class="kv"><span>Procesos</span><b>${L ? L.n : '—'}</b><span>RAM</span><b>${L ? fmtB(L.ram) : '—'}</b><span>CPU</span><b>${L ? L.cpu.toFixed(0) + ' % de un núcleo' : '—'}</b><span>Lectura / escritura</span><b>${L ? fmtB(L.rd) + '/s · ' + fmtB(L.wr) + '/s' : '—'}</b></div>
      <div class="list" style="margin-top:6px">${L && L.list.length ? L.list.slice(0, 6).map(row).join('') : '<div class="note">Ningún proceso nombra esta ruta en su línea de comandos.</div>'}</div>
      <h2 class="sub">Sistema · mayor uso de CPU</h2><div class="list">${p ? p.top.map(row).join('') : '<div class="note">Leyendo procesos…</div>'}</div>`;
  }
}
$('#tab').onclick = e => { const i = e.target.closest('.cgrid i'); if (i && S.sel) { const n = +i.dataset.i; S.sel.cell = S.sel.cell === n ? null : n; renderTab(); } };
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (S.mode === 'cube') S.tab = b.dataset.t; else S.tabs[S.mode] = b.dataset.t; renderPanel(); };
const openPath = async expand => { const inp = $('#path'), p = inp.value.trim(); if (!p) return inp.focus();
  const many = p.split(/\s*[;\n]\s*/).filter(Boolean); // several paths separated by ";": all open and are placed in turn
  if (VIEW.cur === 'arbol' && many.length === 1) { inp.value = ''; return trOpen(p); }
  try { if (many.length > 1) await post('/api/openmany', { paths: many }); else await post('/api/open', { path: p, expand });inp.value = ''; inp.classList.remove('bad'); } catch (e) { inp.classList.add('bad'); feed('error', '#d9534f', e.message); } };
$('#b-open').onclick = () => openPath(false); $('#b-expand').onclick = () => openPath(true);
const SR = { list: [], i: -1, t: 0, q: '' };
function renderSrch() { const el = $('#srch'); if (!SR.q) { el.classList.remove('on'); return; } el.classList.add('on');
  el.innerHTML = SR.list.length ? SR.list.map((r, i) => `<div class="${i === SR.i ? 'on' : ''}" data-i="${i}"><b>${esc(r.name)}</b><span>${r.bytes != null ? fmtB(r.bytes) : ''}</span><i>${esc(r.path)}</i></div>`).join('') : '<div class="note">Sin resultados en los índices · Intro abre la ruta escrita</div>'; }
function srchOpen(r, expand) { const inp = $('#path'); inp.value = ''; SR.q = ''; renderSrch(); inp.blur(); if (VIEW.cur === 'arbol') return trOpen(r.path); if (VIEW.cur !== 'espacio') setView('espacio'); post('/api/open', { path: r.path, expand }).catch(er => feed('error', '#d9534f', er.message)); }
$('#path').oninput = () => { const q = $('#path').value.trim(); SR.q = q; SR.i = -1; clearTimeout(SR.t); if (!q || q.includes(';')) { SR.list = []; return renderSrch(); }
  SR.t = setTimeout(async () => { try { const r = await api('/api/search?q=' + encodeURIComponent(q)); if (SR.q === q) { SR.list = r; renderSrch(); } } catch {} }, 120); };
$('#path').onblur = () => setTimeout(() => { SR.q = ''; renderSrch(); }, 160);
$('#srch').onmousedown = e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); srchOpen(SR.list[+d.dataset.i], e.shiftKey); } };
$('#path').onkeydown = e => { e.stopPropagation();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (SR.list.length) { SR.i = (SR.i + (e.key === 'ArrowDown' ? 1 : SR.list.length - 1) + (SR.i < 0 && e.key === 'ArrowUp' ? 1 : 0)) % SR.list.length; renderSrch(); } return; }
  if (e.key === 'Escape') { $('#path').value = ''; SR.q = ''; renderSrch(); return $('#path').blur(); }
  if (e.key === 'Enter') { const r = SR.i >= 0 ? SR.list[SR.i] : null; if (r) return srchOpen(r, e.shiftKey); const v = $('#path').value.trim(); if (!/[\\/:;]/.test(v) && SR.list[0]) return srchOpen(SR.list[0], e.shiftKey); SR.q = ''; renderSrch(); openPath(e.shiftKey); } };
const setLayout = m => post('/api/layout', { mode: m }).catch(() => {});
$('#lay').onclick = e => { const b = e.target.closest('button'); if (b) setLayout(b.dataset.m); };
$('#r-exp').onclick = () => S.sel && post('/api/open', { path: S.sel.path, expand: true }).catch(e => feed('error', '#d9534f', e.message));
$('#r-close').onclick = () => { if (S.mode === 'obj' && OB.sel) return closeObj(OB.sel); if (S.mode === 'proc') { G.sel = null; S.mode = 'cube'; return renderPanel(); } S.sel && post('/api/close', { path: S.sel.path }).catch(() => {}); };
function setSlice(axis) {
  const s = S.slice; S.slice = axis == null ? null : !s || s.axis !== axis ? { axis, layer: 0 } : s.layer < 2 ? { axis, layer: s.layer + 1 } : null;
  S.geoDirty = true; if (S.sel) S.sel.cell = null; renderTop(); if (S.slice) { S.tab = 'celda'; renderPanel(); } else renderTab();
}
$('#sl').onclick = e => { const b = e.target.closest('button'); if (b) setSlice(+b.dataset.a); };
const toggleEx = () => { S.exploded = !S.exploded; renderTop(); }; $('#b-ex').onclick = toggleEx;
const toggleFollow = () => { if (FW.on) return stopFollow(); if (VIEW.cur === 'sistema' && G.sel && canFollow(G.sel)) return startFollow(G.sel); S.follow = !S.follow; renderTop(); }; $('#b-follow').onclick = toggleFollow;

