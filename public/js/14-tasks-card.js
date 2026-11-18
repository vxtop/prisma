// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Tasks view: a read-only 3D Task Manager (nothing is ended or changed),
// plus the collapsible card for the selected cube.
// === Tasks View ===
const TASKS = new THREE.Vector3(1400, 0, 0), ZW = 26, ZD = 17, ZG = 11; // wide spacing so one zone's labels don't overlap the next
const TKS = { data: null, items: [], byKey: new Map(), sel: null, hover: null, polling: false, fitted: false, zones: [], icons: [], iconN: 0 };
const TKZ = [['apps', 'Aplicaciones', 0, 0, '#1768B5'], ['bg', 'Segundo plano', 1, 0, '#269B65'], ['windows', 'Procesos de Windows', 2, 0, '#8b95a3'],
  ['perf', 'Rendimiento', 0, 1, '#D97757'], ['net', 'Red', 1, 1, '#1768B5'], ['files', 'Archivos en uso', 2, 1, '#E6B844'],
  ['svc', 'Servicios', 0, 2, '#269B65'], ['start', 'Inicio', 1, 2, '#E6B844'], ['users', 'Usuarios', 2, 2, '#AEB9C5'], ['sched', 'Tareas programadas', 0, 3, '#269B65'], ['fails', 'Fallos (7 días)', 1, 3, '#C52235']];
const tkGroup = new THREE.Group(); tkGroup.visible = false; scene.add(tkGroup);
for (const [k, name, cx, cz, col] of TKZ) { const c = new THREE.Vector3(TASKS.x + (cx - 1) * (ZW + ZG), 0, TASKS.z + (cz - 1) * (ZD + ZG));
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(ZW, ZD), new THREE.MeshBasicMaterial({ color: 0x0e1117, transparent: true, opacity: .92, depthWrite: false })); pl.rotation.x = -Math.PI / 2; pl.position.set(c.x, -.02, c.z);
  const ed = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(ZW, ZD)), new THREE.LineBasicMaterial({ color: new THREE.Color(col).multiplyScalar(.5) })); ed.rotation.x = -Math.PI / 2; ed.position.set(c.x, -.01, c.z);
  tkGroup.add(pl, ed); TKS.zones.push({ k, name, c, col, n: null }); }
const tkMat = new THREE.MeshStandardMaterial({ roughness: .4, metalness: .45 }); tkMat.onBeforeCompile = sh => withEdges(sh, 1.4);
const TKMAX = 1400, tkIM = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, .06), tkMat, TKMAX);
// services: a glass cube each; a running one holds its process as a solid cube inside
const tkGlassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .2, roughness: .1, transparent: true, opacity: .18, depthWrite: false }); tkGlassMat.onBeforeCompile = sh => withEdges(sh, 3);
const tkGlass = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, .05), tkGlassMat, 600); tkGlass.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tkGlass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3); tkGlass.count = 0; tkGlass.frustumCulled = false; tkGlass.renderOrder = 3;
tkIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tkIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TKMAX * 3), 3); tkIM.instanceColor.setUsage(THREE.DynamicDrawUsage); tkIM.count = 0; tkIM.frustumCulled = false; tkGroup.add(tkIM, tkGlass);
const tkCol = new THREE.Color(), tkAmber = new THREE.Color('#D97757'), v3c = new THREE.Color();
const cpuAvg = () => S.sys && S.sys.cpu.length ? S.sys.cpu.reduce((a, b) => a + b, 0) / S.sys.cpu.length * 100 : 0; // the API reports 0–1 fractions
function tkBuild(d) {
  const items = [], zone = k => TKS.zones.find(z => z.k === k), cores = d.cores || 1, failN = new Map(); for (const f of d.fails || []) failN.set(String(f.app).toLowerCase(), (failN.get(String(f.app).toLowerCase()) || 0) + 1);
  const grid = (k, list, f, fill = .7) => { const z = zone(k), n = list.length; z.n = n; if (!n) return; const W = ZW - 2.4, Dd = ZD - 3.4, cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * W / Dd)))), rows = Math.ceil(n / cols), cw = W / cols, cd = Dd / rows, cell = Math.min(cw, cd);
    list.forEach((g, i) => { const it = f(g, i); it.zone = k; it.x = z.c.x - W / 2 + cw * (i % cols + .5); it.z = z.c.z - Dd / 2 + .7 + cd * ((i / cols | 0) + .5); it.w = it.w || cell * fill; it.d = it.d || it.w; if (it.cubeF) { it.w = it.d = it.h = it.w * it.cubeF; } items.push(it); }); }; // programs and services are cubes: one edge for everything
  const procF = (sec, col) => { const mx = Math.max(1, ...d[sec].map(g => g.ws)); return g => ({ key: sec + ':' + g.name, kind: 'proc', g, sec, col, label: g.win || g.name.replace(/\.exe$/i, ''),
    sub: fmtB(g.ws) + ' · ' + (g.cpu / cores).toFixed(1) + ' % CPU' + (g.gpu ? ' · GPU ' + g.gpu + ' %' : '') + (g.io > 1e5 ? ' · ' + fmtB(g.io) + '/s' : '') + (g.n > 1 ? ' · ' + g.n + ' procesos' : ''), cubeF: .42 + .58 * Math.sqrt(g.ws / mx), heat: Math.min(1, Math.max(g.cpu / cores / 15, (g.gpu || 0) / 50)), fail: failN.get(g.name.toLowerCase()) || 0, pri: g.ws }); };
  grid('apps', d.apps, procF('apps', '#1768B5')); grid('bg', d.bg, procF('bg', '#269B65')); grid('windows', d.windows, procF('windows', '#5b6370'));
  { const z = zone('perf'), nC = S.sys ? S.sys.cpu.length : cores, W = ZW - 2.4, bw = W / Math.max(nC, 1);
    for (let i = 0; i < nC; i++) items.push({ key: 'cpu' + i, kind: 'perf', zone: 'perf', label: i ? 'Núcleo ' + i : 'CPU', val: () => S.sys ? (S.sys.cpu[i] || 0) : 0, fmt: i ? v => (v * 100).toFixed(0) + ' %' : () => cpuAvg().toFixed(0) + ' % · ' + nC + ' núcleos', x: z.c.x - W / 2 + bw * (i + .5), z: z.c.z - 3.4, w: bw * .7, d: 2.4, col: '#D97757', pri: i ? 0 : 9 });
    const gp = () => S.sys && S.sys.gpu, io = () => TKS.data ? TKS.data.io : { rd: 0, wr: 0 };
    const bars = [['RAM', () => S.sys ? 1 - S.sys.mem.free / S.sys.mem.total : 0, v => (S.sys ? fmtB(S.sys.mem.total - S.sys.mem.free) : '—') + ' · ' + (v * 100).toFixed(0) + ' %', '#AEB9C5'],
      ['GPU', () => gp() ? (gp().util || 0) / 100 : 0, v => gp() ? (v * 100).toFixed(0) + ' %' : 'N/D', '#269B65'],
      ['VRAM', () => gp() ? gp().memUsed / gp().memTotal : 0, () => gp() ? fmtB(gp().memUsed) : 'N/D', '#269B65'],
      ['Disco', () => S.sys && S.sys.disk ? 1 - S.sys.disk.free / S.sys.disk.total : 0, () => S.sys && S.sys.disk ? fmtB(S.sys.disk.free) + ' libres' : '—', '#269B65'],
      ['Lectura', () => Math.min(1, Math.log10(1 + io().rd) / 9), () => fmtB(io().rd) + '/s', '#1768B5'],
      ['Escritura', () => Math.min(1, Math.log10(1 + io().wr) / 9), () => fmtB(io().wr) + '/s', '#E6B844'],
      ['Conexiones', () => Math.min(1, (TKS.data ? TKS.data.net.est : 0) / 300), () => (TKS.data ? TKS.data.net.est : 0) + ' abiertas', '#1768B5']];
    const bw2 = W / bars.length; bars.forEach(([l, val, fmt, col], i) => items.push({ key: 'perf:' + l, kind: 'perf', zone: 'perf', label: l, val, fmt, x: z.c.x - W / 2 + bw2 * (i + .5), z: z.c.z + 3.8, w: bw2 * .5, d: bw2 * .5, col, pri: 8 })); z.n = d.procs + ' procesos'; }
  { const L = d.net.hosts, mx = Math.max(1, ...L.map(h => h.n)); grid('net', L, h => ({ key: 'net:' + h.host, kind: 'net', hst: h, col: '#1768B5', label: h.host, sub: h.n + (h.n > 1 ? ' conexiones' : ' conexión') + (h.procs.length ? ' · ' + h.procs.slice(0, 2).join(', ') : ''), h: .3 + 4 * Math.sqrt(h.n / mx), pri: h.n })); zone('net').n = d.net.est + ' conexiones · ' + d.net.listen + ' en escucha'; }
  { const z = zone('files'), L = d.files; z.n = L.length;
    grid('files', L, f => { const age = (Date.now() - f.t) / 1000; return { key: 'file:' + f.path, kind: 'file', f, col: f.src === 'ia' ? '#D97757' : '#E6B844', label: base(f.path), sub: ago(f.t) + ' · ' + f.src + ' · ' + base(f.path.replace(/[\\/][^\\/]*$/, '')), h: .06 + .5 * Math.exp(-age / 90), pri: 1e9 - age }; }, .7); for (const it of items) if (it.kind === 'file') it.d = it.w * .62; }
  { const L = [...d.services].sort((a, b) => (b.s === 'Running') - (a.s === 'Running') || String(a.d || a.n).localeCompare(String(b.d || b.n))), on = L.filter(v => v.s === 'Running').length;
    grid('svc', L, v => { const run = v.s === 'Running', auto = /auto/i.test(v.m || ''); return { key: 'svc:' + v.n, kind: 'svc', v, col: run ? '#1768B5' : auto ? '#8a6d3b' : '#3a4146', label: v.d || v.n, sub: (run ? 'en ejecución' : 'detenido') + (v.m ? ' · inicio ' + String(v.m).toLowerCase() : '') + (v.pid ? ' · PID ' + v.pid : ''), run, cubeF: 1, pri: 0 }; }, .82);
    zone('svc').n = L.length ? on + ' de ' + L.length + ' en ejecución' : 'sin datos'; }
  grid('start', d.startup, v => ({ key: 'start:' + v.n + '|' + v.l, kind: 'start', v, col: '#E6B844', label: v.n, sub: (v.u ? v.u + ' · ' : '') + String(v.l || '').split(/[\\/]/).pop(), h: 1.1, pri: 1 }), .55);
  { const now = Date.now(), L = [...(d.sched || [])].sort((a, b) => (Date.parse(a.next) || 9e15) - (Date.parse(b.next) || 9e15)), inT = ms => ms < 36e5 ? Math.round(ms / 6e4) + ' min' : ms < 864e5 ? Math.round(ms / 36e5) + ' h' : Math.round(ms / 864e5) + ' d';
    grid('sched', L, v => { const nx = Date.parse(v.next) || 0, dt = nx ? nx - now : Infinity, bad = v.res && v.res !== 267011 && v.res !== 267009 && v.res !== 267008 && v.res !== 1; return { key: 'sched:' + v.p, kind: 'sched', v, col: bad ? '#E6B844' : v.s === 4 ? '#D97757' : '#269B65', label: v.n, sub: (nx ? 'próxima en ' + inT(Math.max(0, dt)) : 'sin próxima') + (v.last ? ' · última hace ' + ago(Date.parse(v.last)).replace(/^hace /, '') : '') + (bad ? ' · error 0x' + (v.res >>> 0).toString(16) : ''), h: dt < 36e5 ? 1.2 : dt < 864e5 ? .6 : .22, pri: dt < 864e5 ? 1e12 - dt : 0 }; }, .62);
    zone('sched').n = L.length + ' activas'; }
  { const m = new Map(); for (const f of d.fails || []) { const k = String(f.app).toLowerCase(), e = m.get(k) || m.set(k, { app: f.app, n: 0, hang: 0, t: 0 }).get(k); e.n++; if (f.id === 1002) e.hang++; e.t = Math.max(e.t, Date.parse(f.t) || 0); }
    const L = [...m.values()].sort((a, b) => b.t - a.t); grid('fails', L, f => ({ key: 'fail:' + f.app, kind: 'fail', f, col: '#C52235', label: f.app, sub: f.n + (f.n > 1 ? ' fallos' : ' fallo') + (f.hang ? ' (' + f.hang + ' sin responder)' : '') + ' · último ' + ago(f.t), h: .3 + Math.min(2.2, f.n * .35), pri: f.t }), .55); zone('fails').n = L.length ? (d.fails || []).length + ' eventos' : 'ninguno'; }
  { const mx = Math.max(1, ...d.users.map(u => u.n)); grid('users', d.users, u => ({ key: 'user:' + u.id, kind: 'user', u, col: '#AEB9C5', label: u.user, sub: u.n + ' procesos · ' + fmtB(u.ws), h: .4 + 5 * u.n / mx, pri: u.n }), .45); }
  for (const it of items) { const old = TKS.byKey.get(it.key); it.ch = old ? old.ch : 0; }
  TKS.items = items.slice(0, TKMAX); TKS.byKey = new Map(TKS.items.map(it => [it.key, it])); if (TKS.sel) TKS.sel = TKS.byKey.get(TKS.sel.key) || TKS.sel; TKS.hover = null;
  const per = { apps: 0, bg: 0 }; TKS.iconN = 0; // real system icons over apps and the heaviest processes
  for (const it of TKS.items) if (it.kind === 'proc' && it.sec !== 'windows' && it.g.exe && per[it.sec] < (it.sec === 'apps' ? 16 : 10)) { per[it.sec]++;
    let sp = TKS.icons[TKS.iconN]; if (!sp) { sp = new THREE.Mesh(scrGeo, new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false })); TKS.icons.push(sp); tkGroup.add(sp); }
    const tex = screenFor({ name: it.g.name, exe: it.g.exe, kind: it.sec === 'apps' ? 'app' : 'proc' }); if (sp.material.map !== tex) { sp.material.map = tex; sp.material.needsUpdate = true; } sp.userData.it = it; it.icon = sp; sp.visible = true; TKS.iconN++; }
  for (let i = TKS.iconN; i < TKS.icons.length; i++) TKS.icons[i].visible = false;
}
async function pollTasks() { if (TKS.polling) return; TKS.polling = true;
  try { TKS.data = await apiT('/api/tasks'); tkBuild(TKS.data); if (S.mode === 'task' && VIEW.cur === 'tareas') renderPanel(); renderCubes(); if (!TKS.fitted && VIEW.cur === 'tareas') { TKS.fitted = true; setTimeout(fitAll, 250); } }
  catch (e) { feed('error', '#C52235', 'tareas: ' + e.message); } TKS.polling = false; }
setInterval(() => { if (VIEW.cur === 'tareas') pollTasks(); }, 4000);
function stepTasks(dt) {
  const on = VIEW.cur === 'tareas' && !VW.o; tkGroup.visible = on; if (!on) return;
  const k = 1 - Math.pow(.02, dt), A = tkIM.instanceMatrix.array, C = tkIM.instanceColor.array, GA = tkGlass.instanceMatrix.array, GC = tkGlass.instanceColor.array; let i = 0, g = 0;
  for (const it of TKS.items) { const want = it.val ? .2 + 8 * Math.max(0, Math.min(1, it.val())) : it.h; it.ch += (want - it.ch) * k;
    if (it.kind === 'svc') { const e = Math.max(.02, it.ch), inner = it.run ? e * .5 : 0; if (g < 600) { setM(GA, g, it.x, e / 2, it.z, it.w, e, it.d); v3c.set(it.run ? '#5aa2ea' : '#5b6370').multiplyScalar(it === TKS.sel ? 1 : it === TKS.hover ? .8 : .5); GC[g * 3] = v3c.r; GC[g * 3 + 1] = v3c.g; GC[g * 3 + 2] = v3c.b; g++; }
      setM(A, i, it.x, e / 2, it.z, inner, inner, inner); }
    else setM(A, i, it.x, it.ch / 2, it.z, it.w, Math.max(.02, it.ch), it.d);
    tkCol.copy(GRAPHITE).lerp(v3c.set(it.fail ? '#C52235' : it.col), it.fail ? .5 : it.kind === 'perf' ? .8 : it.kind === 'svc' ? .55 : it.kind === 'fail' ? .6 : .1); if (it.heat) tkCol.lerp(tkAmber, it.heat * .25); tkCol.multiplyScalar(it === TKS.sel ? 1.9 : it === TKS.hover ? 1.5 : TKS.sel && it.zone !== TKS.sel.zone ? .7 : 1);
    C[i * 3] = tkCol.r; C[i * 3 + 1] = tkCol.g; C[i * 3 + 2] = tkCol.b; i++;
    if (it.icon) { it.icon.position.set(it.x, it.ch + .012, it.z); it.icon.scale.setScalar(it.w * .8); } it.top = it.ch; }
  tkIM.count = i; tkIM.instanceMatrix.needsUpdate = true; tkIM.instanceColor.needsUpdate = true; tkGlass.count = g; tkGlass.instanceMatrix.needsUpdate = true; tkGlass.instanceColor.needsUpdate = true;
}
function taskPick(x, y) {
  let best = null, bd = Infinity; const ph = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
  for (const it of TKS.items) { const [ax, ay, ok] = scr(v1.set(it.x, it.top || it.ch, it.z)); if (!ok) continue; const [bx, by] = scr(v1.set(it.x, 0, it.z)), dist = v1.set(it.x, it.ch / 2, it.z).distanceTo(camera.position), r = Math.max(4, Math.max(it.w, it.d) * .5 * ph / dist);
    if (x < Math.min(ax, bx) - r || x > Math.max(ax, bx) + r || y < Math.min(ay, by) - r * .5 || y > Math.max(ay, by) + r * .5) continue; if (dist < bd) { bd = dist; best = it; } }
  return best;
}
function drawTasks() {
  const L = $('#left').offsetWidth + 18, R = innerWidth - ($('#right').style.display === 'flex' ? $('#right').offsetWidth + 18 : 8), T = 92, B = innerHeight - 60, placed = [];
  const free = rc => !placed.some(p => rc[0] < p[0] + p[2] && p[0] < rc[0] + rc[2] && rc[1] < p[1] + p[3] && p[1] < rc[1] + rc[3]);
  for (const z of TKS.zones) { const [x, y, ok] = scr(v1.set(z.c.x - ZW / 2 + .5, 0, z.c.z - ZD / 2 + .2)); if (!ok || x < L || x > R - 60 || y < T || y > B) continue;
    h2.font = '600 12px "Segoe UI",sans-serif'; const t1 = z.name.toUpperCase(), w = h2.measureText(t1).width; h2.fillStyle = z.col; h2.fillText(t1, x, y - 6);
    if (z.n != null) { h2.font = '11px "Segoe UI",sans-serif'; h2.fillStyle = 'rgba(200,208,214,.62)'; h2.fillText(String(z.n), x + w + 10, y - 6); } placed.push([x, y - 20, w + (z.n != null ? h2.measureText(String(z.n)).width + 14 : 0), 18]); }
  const far = camera.position.distanceTo(controls.target) > 70, lim = far ? { apps: 3, bg: 2, windows: 2, net: 2, files: 2, start: 2, users: 2, svc: 0, perf: 2, sched: 2, fails: 3 } : { apps: 8, bg: 6, windows: 4, net: 6, files: 8, start: 5, users: 6, svc: 0, perf: 99, sched: 5, fails: 6 }, cnt = {}, done = new Set();
  for (const it of [TKS.sel, TKS.hover, ...TKS.items]) { if (!it || done.has(it)) continue; done.add(it); const sp = it === TKS.sel || it === TKS.hover;
    if (!sp) { if (!it.pri) continue; cnt[it.zone] = (cnt[it.zone] || 0) + 1; if (cnt[it.zone] > (lim[it.zone] || 0)) continue; }
    const [x, y0, ok] = scr(v1.set(it.x, 0, it.z + it.d / 2 + .05)), y = y0 + 38; if (!ok || x < L || x > R || y - 34 < T || y > B) continue;
    const t1 = String(it.label).slice(0, 34), t2 = String(it.kind === 'perf' ? it.fmt(it.val()) : it.sub).slice(0, 46);
    h2.font = '600 11px "Segoe UI",sans-serif'; const w1 = h2.measureText(t1).width; h2.font = '10px "Segoe UI",sans-serif'; const w = Math.max(w1, h2.measureText(t2).width) + 14, rc = [x - w / 2, y - 34, w, 30];
    if (!sp && !free(rc)) continue; placed.push(rc);
    h2.fillStyle = sp ? 'rgba(12,16,19,.96)' : 'rgba(11,13,17,.74)'; h2.fillRect(rc[0], rc[1], rc[2], rc[3]); if (sp) { h2.strokeStyle = 'rgba(255,255,255,.45)'; h2.lineWidth = 1; h2.strokeRect(rc[0] + .5, rc[1] + .5, rc[2] - 1, rc[3] - 1); }
    h2.fillStyle = it.col; h2.fillRect(rc[0], rc[1], 2, rc[3]); h2.textAlign = 'center'; h2.font = '600 11px "Segoe UI",sans-serif'; h2.fillStyle = '#F0EBDD'; h2.fillText(t1, x, y - 20);
    h2.font = '10px "Segoe UI",sans-serif'; h2.fillStyle = 'rgba(200,208,214,.72)'; h2.fillText(t2, x, y - 8); h2.textAlign = 'left'; }
}
TABS.task = [['info', 'Detalle']];
const kvH = rows => '<div class="kv">' + rows.filter(r => r && r[1] != null && r[1] !== '').map(([a, b]) => '<span>' + esc(a) + '</span><b title="' + esc(b) + '">' + esc(b) + '</b>').join('') + '</div>';
function selectTask(it) { TKS.sel = it; S.mode = 'task'; renderPanel(); renderCrumb(); }
function taskDir(it) { const p = it.kind === 'proc' ? it.g.exe : it.kind === 'file' ? it.f.path : null; return p ? p.replace(/[\\/][^\\/]*$/, '') : null; }
function taskMenu(it) { const dir = taskDir(it), pid = it.kind === 'proc' ? it.g.pids[0] : it.kind === 'svc' && it.v.pid ? it.v.pid : null;
  return [['Ver detalle', () => selectTask(it)], ...(pid ? [['Ver en la vista Sistema', () => jumpToProc(pid)]] : []), ...(it.kind === 'file' ? [['Abrir en el visor', () => { setView('espacio'); openObject(it.f.path); }]] : []),
    ...(dir ? [['Abrir su carpeta como cubo', () => { setView('espacio'); post('/api/open', { path: dir }).catch(e => feed('error', '#C52235', e.message)); }]] : []), '-', ['Copiar nombre', () => copy(it.label)], ...(dir ? [['Copiar ruta', () => copy(it.kind === 'file' ? it.f.path : it.g.exe)]] : [])]; }
function renderTaskPanel() {
  const it = TKS.sel; if (!it) return; const el = $('#tab'), z = TKS.zones.find(q => q.k === it.zone), cores = TKS.data ? TKS.data.cores : 1; builtFor = '';
  panelFrame('task', it.label, (it.kind === 'proc' && it.g.exe) || (it.kind === 'file' && it.f.path) || z.name, 'info'); let h = '';
  if (it.kind === 'proc') { const g = it.g; h = kvH([['Apartado', z.name], ['Programa', g.name], ['Ventana', g.win], ['Procesos', g.n], ['RAM', fmtB(g.ws)], ['CPU', (g.cpu / cores).toFixed(1) + ' % del equipo'], ['GPU', (g.gpu || 0) + ' %'], ['Disco (E/S)', fmtB(g.io) + '/s'], ['Conexiones', g.net], ['Fallos en 7 días', it.fail || '']])
    + '<h2 class="sub">Procesos (' + g.pids.length + ')</h2><div class="list">' + g.pids.slice(0, 14).map(p => '<div data-pid="' + p + '" style="cursor:pointer"><span>PID ' + p + '</span><span>ver en Sistema ›</span></div>').join('') + '</div>'; }
  else if (it.kind === 'perf') { h = kvH([['Valor', it.fmt(it.val())], ['Uso', (it.val() * 100).toFixed(1) + ' %']]); if (it.key === 'cpu0' && S.sys) h += '<h2 class="sub">Por núcleo</h2><div class="list">' + S.sys.cpu.map((v, i) => '<div><span>Núcleo ' + i + '</span><span>' + Math.round(v * 100) + ' %</span></div>').join('') + '</div>'; }
  else if (it.kind === 'net') { const x = it.hst; h = '<div class="hint" style="margin-bottom:6px">Conexiones abiertas; la velocidad por programa no se mide (requiere el rastreo de eventos del sistema).</div>' + kvH([['Equipo remoto', x.host], ['IP', x.ip], ['Conexiones', x.n]]) + '<h2 class="sub">Programas conectados</h2><div class="list">' + x.procs.map(p => '<div><span>' + esc(p) + '</span><span></span></div>').join('') + '</div>'; }
  else if (it.kind === 'file') { const f = it.f; h = kvH([['Archivo', base(f.path)], ['Carpeta', f.path.replace(/[\\/][^\\/]*$/, '')], ['Origen', f.src], ['Último uso', 'hace ' + ago(f.t)]]) + '<div class="row" style="margin-top:10px"><button data-a="view">Abrir en el visor</button></div>'; }
  else if (it.kind === 'svc') { const v = it.v; h = kvH([['Servicio', v.n], ['Nombre', v.d], ['Estado', v.s === 'Running' ? 'en ejecución' : 'detenido'], ['Inicio', v.m], ['PID', v.pid || '']]); }
  else if (it.kind === 'start') { const v = it.v; h = kvH([['Programa', v.n], ['Usuario', v.u], ['Registrado en', v.l]]) + (v.c ? '<h2 class="sub">Orden</h2><pre class="code" style="white-space:pre-wrap;max-height:120px">' + esc(v.c) + '</pre>' : ''); }
  else if (it.kind === 'sched') { const v = it.v; h = kvH([['Tarea', v.n], ['Ruta', v.p], ['Estado', v.s === 4 ? 'ejecutándose' : v.s === 3 ? 'lista' : String(v.s)], ['Próxima', v.next ? new Date(v.next).toLocaleString('es') : '—'], ['Última', v.last ? new Date(v.last).toLocaleString('es') : '—'], ['Último resultado', '0x' + ((v.res || 0) >>> 0).toString(16)]]); }
  else if (it.kind === 'fail') { const f = it.f; h = kvH([['Programa', f.app], ['Fallos', f.n], ['Sin responder', f.hang], ['Último', new Date(f.t).toLocaleString('es')]]) + '<div class="hint" style="margin-top:6px">Del registro de eventos «Aplicación» de Windows (errores 1000 y cuelgues 1002).</div>'; }
  else if (it.kind === 'user') { const u = it.u; h = kvH([['Usuario', u.user], ['Sesión', u.id], ['Procesos', u.n], ['RAM', fmtB(u.ws)]]); }
  el.innerHTML = h + '<div class="note" style="margin-top:10px">Solo lectura: Prisma observa; no finaliza, pausa ni cambia nada.</div>';
  el.querySelectorAll('[data-pid]').forEach(d => d.onclick = () => jumpToProc(+d.dataset.pid));
  const vb = el.querySelector('[data-a=view]'); if (vb) vb.onclick = () => { setView('espacio'); openObject(it.f.path); };
}

// === Selection Card ===
const DOCK = { open: new Set(['cont', 'act', 'tam']), html: '', min: (() => { try { return localStorage.getItem('prisma.dockmin') === '1'; } catch { return false; } })() }; // the card can collapse to its title
try { const o = JSON.parse(localStorage.getItem('prisma.dock') || 'null'); if (Array.isArray(o)) DOCK.open = new Set(o); } catch {}
$('#dock').addEventListener('click', e => { if (!e.target.closest('[data-dmin]')) return; DOCK.min = !DOCK.min; DOCK.html = ''; try { localStorage.setItem('prisma.dockmin', DOCK.min ? '1' : '0'); } catch {} renderDock(); });
$('#tab').addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.s; if (!k || !e.target.closest('.dockin')) return; e.target.open ? DOCK.open.add(k) : DOCK.open.delete(k); try { localStorage.setItem('prisma.dock', JSON.stringify([...DOCK.open])); } catch {} }, true);
$('#dock').addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.s; if (!k) return; e.target.open ? DOCK.open.add(k) : DOCK.open.delete(k); try { localStorage.setItem('prisma.dock', JSON.stringify([...DOCK.open])); } catch {} }, true);
function renderDock() {
  $('#dock').style.display = 'none'; const el = $('#dockin'), c = S.sel; // the card lives in the right panel's card tab, not over the scene
  if (!el || !c || !c.data || S.mode !== 'cube' || S.tab !== 'ficha') return;
  if (!c.metaBusy && (!c.meta || Date.now() - c.metaT > 10000)) { c.metaBusy = true; apiT('/api/meta?path=' + encodeURIComponent(c.path)).then(v => { c.meta = v; c.metaT = Date.now(); }).catch(() => { c.metaT = Date.now(); }).finally(() => { c.metaBusy = false; }); }
  const mt = c.meta, d = c.data, g = d.git, a = c.agent || d.agents, lv = c.act, ev = c.events.slice(0, 5), mx = Math.max(1, ...d.exts.map(x => x.bytes)), lk = S.procs && S.procs.linked, dp = c.deps && !c.deps.pending ? c.deps : null;
  const row = (l, r, bar, col) => `<div class="dr"><span>${esc(l)}</span><b>${esc(r ?? '')}</b>${bar != null ? `<i style="--w:${Math.min(100, bar * 100).toFixed(1)}%"></i>` : ''}</div>`;
  const sec = (k, title, head, col, body) => /^(sin git|ninguna declarada|ninguno)$/.test(head) ? '' : /* skip empty sections */ `<details data-s="${k}" ${DOCK.open.has(k) ? 'open' : ''} style="--c:${col}"><summary><span>${title}</span><em>${esc(head)}</em></summary>${body}</details>`;
  const actRows = lv && lv.files && lv.files.length ? lv.files.slice(0, 5).map(f => row(f.replace(/\\/g, '/').split('/').slice(-2).join('/'), '')) : ev.length ? ev.map(e => row(e.type + ' ' + e.file.replace(/\\/g, '/').split('/').pop(), ago(e.t))) : [row('sin cambios recientes', '')];
  const html = sec('cont', 'Contenido', d.exts.length + ' tipos', '#1768B5', d.exts.slice(0, 6).map(x => row('.' + x.ext + ' ×' + fmtN(x.n), fmtB(x.bytes), x.bytes / mx)).join(''))
    + sec('act', 'Actividad', lv && lv.files && lv.files.length ? 'en vivo' : ev.length ? ago(ev[0].t) : 'quieto', '#D97757', actRows.join(''))
    + sec('tam', 'Tamaño', fmtB(d.totals.bytes), '#269B65', row('archivos', fmtN(d.totals.files)) + row('carpetas', fmtN(d.totals.dirs)) + row('mayor', d.largest ? fmtB(d.largest.size) : '—') + (d.disk ? row('del disco', (d.totals.bytes / d.disk.total * 100).toFixed(2) + ' %', d.totals.bytes / d.disk.total * 20) + row('libre en la unidad', fmtB(d.disk.free)) : ''))
    + sec('est', 'Estado', g ? 'git ' + g.branch : 'sin git', '#AEB9C5', (g ? row('commits', fmtN(g.commits)) + row('sin commit', g.dirty) + row('último', ago(g.lastTime)) + (g.lastMsg ? `<div class="dn">${esc(g.lastMsg.slice(0, 90))}</div>` : '') : '') + row('índice', d.indexed ? 'completo' : d.truncated ? 'parcial' : 'directo') + row('último cambio', ago(d.newest)) + row('más antiguo', ago(d.oldest)) + row('escaneo', d.scanMs + ' ms'))
    + sec('dep', 'Dependencias', !mt ? '…' : mt.deps ? mt.deps.kind + ' · ' + mt.deps.list.length : 'ninguna declarada', '#269B65', !mt ? row('leyendo…', '') : mt.deps ? (mt.deps.list.length ? '' : row('no depende de ningún paquete', '')) + mt.deps.list.slice(0, 10).map(([n, v]) => row(n, v)).join('') + (mt.deps.list.length > 10 ? row('… y ' + (mt.deps.list.length - 10) + ' más', '') : '') + (mt.deps.dev ? row('de desarrollo', mt.deps.dev) : '') : row('sin package.json, requirements, pyproject, Cargo ni go.mod', ''))
    + sec('hist', 'Historial', !mt ? '…' : mt.commits.length ? mt.commits.length + ' commits' : 'sin git', '#AEB9C5', !mt ? row('leyendo…', '') : mt.commits.length ? mt.commits.map(x => `<div class="dn"><b style="color:var(--tx)">${esc(x.h)}</b> ${esc(x.s)} <span style="opacity:.6">· ${esc(x.a)} · ${ago(x.t)}</span></div>`).join('') : row('no es un repositorio git', ''))
    + sec('red', 'Red', !mt ? '…' : (mt.net.length ? mt.net.length + ' destinos' : 'sin conexiones'), '#1768B5', !mt ? row('leyendo…', '') : (mt.procs.slice(0, 4).map(p => row(p.win || p.name, fmtB(p.ws))).join('') || row('ningún proceso la usa ahora', '')) + mt.net.map(x => x.listen ? row('escucha :' + x.port, 'PID ' + x.pid) : row(x.host, x.n + ' con.')).join(''))
    + sec('abiertos', 'Archivos abiertos', !mt ? '…' : mt.open.length ? mt.open.length + ' en uso' : 'ninguno', '#E6B844', !mt ? row('leyendo…', '') : mt.open.length ? mt.open.map(x => row(x.file.replace(/\\/g, '/').split('/').pop(), x.who.map(w => w.name).join(', '))).join('') : row('nadie tiene abiertos sus archivos recientes', ''))
    + sec('mas', 'IA y enlaces', 'sesiones · referencias', '#8b95a3',
      row('sesiones IA', a ? a.sessions : 0) + (a && a.model ? row('modelo', a.model.replace('claude-', '')) : '') + (a && a.ctx ? row('contexto', fmtK(a.ctx) + ' tok') : '') + row('archivos en foco IA', [...c.ai.values()].filter(v => Date.now() - v.t < 600000).length)
      + row('procesos que la usan', lk ? lk.n : '…') + (lk && lk.n ? row('su RAM', fmtB(lk.ram)) + row('su E/S', fmtB(lk.rd + lk.wr) + '/s') + lk.list.slice(0, 3).map(p => row('· ' + (p.win || p.name), fmtB(p.ws))).join('') : '')
      + row('referencias internas', dp ? (dp.nodes || []).length + ' archivos' : '…') + row('eventos de disco', fmtN(c.evCount)) + (d.preset ? row('parece', d.preset.types.map(x => x[1]).slice(0, 2).join(' · ')) : ''));
  const full = html; if (full !== DOCK.html) { DOCK.html = full; el.innerHTML = full; }
}

