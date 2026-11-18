#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// prisma: a 3D observatory of directories, one OLAP cube (27 cells, 6 faces) per directory.
// Strictly read-only: it never creates, modifies or deletes anything it observes (readdir/stat/watch, partial reads,
// `git --no-optional-locks`). Workspace state lives in memory only. No dependencies; listens on 127.0.0.1 only.
'use strict';
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16'; // more parallel disk I/O for the indexer
const http = require('http'), fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os');
const { execFile, spawn } = require('child_process');
const assistant = require('./assistant');

// --- CLI ---
const flags = { port: +process.env.PRISMA_PORT || 4828 }, cliDirs = [];
for (let a = process.argv.slice(2), i = 0; i < a.length; i++) {
  if (a[i] === '--port') flags.port = +a[++i];
  else if (a[i] === '--no-open') flags.noOpen = true;
  else if (a[i] === '--expand') flags.expand = true;
  else if (a[i] === '--no-live') flags.noLive = true;
  else if (a[i] === '--idle-exit' || a[i] === '--with-window') flags.idleExit = true;
  else if (a[i] === '--takeover') flags.takeover = true;
  else if (a[i] === '--dev') flags.dev = true; // development: reload the page when public/ changes (scripts/dev.js restarts the server)
  else if (a[i] === '--demo') flags.demo = true; // screenshots and demos: never show the real foreground window or cursor
  else if (a[i] === '-h' || a[i] === '--help') flags.help = true;
  else cliDirs.push(a[i]);
}
if (flags.help) {
  console.log('Uso: prisma [directorio ...] [--expand] [--port 4828] [--no-open] [--no-live] [--with-window]\n  --expand   despliega también los subdirectorios como cubos\n  --no-live  sin el espacio «En vivo» (no vigila las unidades)\n  --with-window  vive mientras la ventana de Prisma esté abierta: al cerrarla se cierra todo (lo usa prisma.vbs)\n  Sin directorio se abre el actual. Solo lectura: nunca modifica lo observado.');
  process.exit(0);
}
const PORT = flags.port, WIN = process.platform === 'win32';
const MAX_ENTRIES = 40000, BUDGET_MS = 4000, MAX_CUBES = 256, LIVE_MAX = 64; // 256 per space; the Live space opens on its own and is capped at 64 to stay readable
const key = p => WIN ? p.toLowerCase() : p;
const inside = (file, root) => { const f = key(file), r = key(root); return f === r || f.startsWith(r.endsWith(path.sep) ? r : r + path.sep); };

const CODE = new Set('js mjs cjs ts jsx tsx py rs go c cc cpp h hpp cs java kt swift rb php html htm css scss vue svelte sh ps1 bat cmd sql lua dart r m asm glsl wgsl gd'.split(' '));
const DATA = new Set('json jsonl csv tsv xml yaml yml toml parquet db sqlite bin dat npy npz pt pth onnx safetensors pkl h5 lock log ini env cfg conf gguf arrow idx pack'.split(' '));
const extOf = f => path.extname(f).slice(1).toLowerCase();

const run = (cmd, args, opts = {}) => new Promise(res => {
  execFile(cmd, args, { timeout: 4000, windowsHide: true, maxBuffer: 64 << 20, ...opts }, (e, out) => res(e ? '' : String(out)));
});

// --- Layer 1: hardware ---
let prevCpu = os.cpus(), cpuLoad = prevCpu.map(() => 0);
setInterval(() => {
  const c = os.cpus();
  cpuLoad = c.map((k, i) => {
    const p = (prevCpu[i] || k).times, t = k.times, idle = t.idle - p.idle;
    const tot = (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + idle;
    return tot > 0 ? 1 - idle / tot : 0;
  });
  prevCpu = c;
}, 1000).unref();

let gpu = null, gpuOff = false;
function pollGpu() {
  if (gpuOff) return;
  execFile('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,fan.speed,utilization.memory', '--format=csv,noheader,nounits'],
    { timeout: 2500, windowsHide: true }, (e, out) => {
      if (e) { gpu = null; if (e.code === 'ENOENT') gpuOff = true; return; }
      const p = String(out).trim().split('\n')[0].split(',').map(s => s.trim());
      const n = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
      gpu = { name: p[0], util: n(p[1]), memUsed: n(p[2]) * 1048576, memTotal: n(p[3]) * 1048576, temp: n(p[4]), power: n(p[5]), fan: n(p[6]), memUtil: n(p[7]) };
    });
}
pollGpu(); setInterval(pollGpu, 2500).unref();
const diskOf = p => { try { const s = fs.statfsSync(p); return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { return null; } };

// --- Layer 2: processes ---
let procCache = { t: 0, list: [], prev: new Map(), inflight: null };
const gpuProc = { t: 0, m: {}, busy: false };
function refreshGpu() { if (!WIN || gpuProc.busy || Date.now() - gpuProc.t < 5000) return; gpuProc.busy = true; ps('gpu', {}, 12000).then(m => { gpuProc.m = m || {}; }, () => {}).finally(() => { gpuProc.t = Date.now(); gpuProc.busy = false; }); }
async function allProcs() {
  if (Date.now() - procCache.t < 5000) return procCache.list;
  if (procCache.inflight) return procCache.inflight;
  procCache.inflight = (async () => {
    const now = Date.now(), prev = procCache.prev, next = new Map(); let list = [];
    if (WIN) {
      const out = await run('powershell', ['-NoProfile', '-Command',
        '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $p = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,SessionId,Name,ExecutablePath,WorkingSetSize,KernelModeTime,UserModeTime,ReadTransferCount,WriteTransferCount,OtherTransferCount,CommandLine; ' +
        '$w = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object Id,MainWindowTitle; @{ p = $p; w = @($w) } | ConvertTo-Json -Compress -Depth 3'], { timeout: 15000 });
      let arr = [], wins = []; try { const j = JSON.parse(out); arr = Array.isArray(j.p) ? j.p : [j.p]; wins = j.w || []; } catch {}
      const title = new Map(wins.map(w => [w.Id, w.MainWindowTitle]));
      list = arr.map(p => {
        const cpuT = (+p.KernelModeTime || 0) + (+p.UserModeTime || 0), rdT = +p.ReadTransferCount || 0, wrT = +p.WriteTransferCount || 0, otT = +p.OtherTransferCount || 0;
        const o = prev.get(p.ProcessId), dt = o ? (now - o.t) / 1000 : 0;
        next.set(p.ProcessId, { cpuT, rdT, wrT, otT, t: now });
        return { pid: p.ProcessId, ppid: p.ParentProcessId, sess: p.SessionId, name: p.Name, exe: p.ExecutablePath || null, ws: +p.WorkingSetSize || 0, cmd: String(p.CommandLine || ''), win: title.get(p.ProcessId) || null,
          cpu: dt > 0 ? Math.max(0, (cpuT - o.cpuT) / (dt * 1e7)) * 100 : 0,       // % of one core
          rd: dt > 0 ? Math.max(0, (rdT - o.rdT) / dt) : 0, wr: dt > 0 ? Math.max(0, (wrT - o.wrT) / dt) : 0, ot: dt > 0 ? Math.max(0, (otT - o.otT) / dt) : 0 }; // bytes/s
      });
    } else {
      // two passes: `comm` gives the real name/path (spaces included), `args` the command line
      const [o1, o2] = await Promise.all([run('ps', ['-axo', 'pid=,ppid=,rss=,pcpu=,comm=']), run('ps', ['-axo', 'pid=,args='])]);
      const args = new Map(); for (const l of o2.split('\n')) { const m = /^\s*(\d+)\s+(.*)$/.exec(l); if (m) args.set(+m[1], m[2]); }
      list = o1.split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(l)).filter(Boolean).map(m => { const pid = +m[1], comm = m[5].trim();
        return { pid, ppid: +m[2], name: path.basename(comm), exe: comm.startsWith('/') ? comm : null, ws: +m[3] * 1024, cpu: +m[4], rd: 0, wr: 0, ot: 0, cmd: args.get(pid) || comm, win: null }; });
      if (process.platform === 'linux') for (const p of list) { // current CPU from /proc (ps reports the lifetime average)
        try { const f = (await fsp.readFile('/proc/' + p.pid + '/stat', 'utf8')).split(') ').pop().split(' '), t = +f[11] + +f[12], o = prev.get(p.pid);
          next.set(p.pid, { cpuT: t, t: now }); p.cpu = o ? Math.max(0, (t - o.cpuT) / 100 / ((now - o.t) / 1000)) * 100 : 0;
          const io = await fsp.readFile('/proc/' + p.pid + '/io', 'utf8').catch(() => ''), rb = +(/read_bytes:\s+(\d+)/.exec(io) || [])[1] || 0, wb = +(/write_bytes:\s+(\d+)/.exec(io) || [])[1] || 0;
          if (o && o.rb != null) { const dt = (now - o.t) / 1000; p.rd = Math.max(0, (rb - o.rb) / dt); p.wr = Math.max(0, (wb - o.wb) / dt); } next.get(p.pid).rb = rb; next.get(p.pid).wb = wb; } catch {} }
    }
    if (procCache.t) { const old = procCache.list, was = new Set(old.map(p => p.pid)), byPid = new Map(list.map(p => [p.pid, p])), ev = [];
      for (const p of list) if (!was.has(p.pid) && p.pid !== process.pid) ev.push({ k: 'proc', type: 'inicia', pid: p.pid, name: p.name, win: p.win, parent: (byPid.get(p.ppid) || old.find(o => o.pid === p.ppid) || {}).name || null });
      const now2 = new Set(list.map(p => p.pid)); for (const p of old) if (!now2.has(p.pid)) ev.push({ k: 'proc', type: 'termina', pid: p.pid, name: p.name });
      if (!flags.demo && ev.length && ev.length < 60) for (const e of ev.slice(0, 12)) send(e); } // --demo: no real process start/stop in the feed
    refreshGpu(); for (const p of list) p.gpu = +(gpuProc.m[p.pid] || 0);
    procCache = { t: now, list, prev: next, inflight: null };
    return list;
  })().catch(() => { procCache.inflight = null; return procCache.list; });
  return procCache.inflight;
}

// --- Layer 3: files (scan -> 27 cells) ---
function cellOf(rel, mtime, now) {
  const e = extOf(rel), t = CODE.has(e) ? 0 : DATA.has(e) ? 1 : 2;
  const depth = rel.split(/[\\/]/).length - 1, d = depth === 0 ? 0 : depth <= 2 ? 1 : 2;
  const age = now - mtime, a = age < 36e5 ? 0 : age < 864e5 ? 1 : 2;
  return t + 3 * d + 9 * a;
}
const scans = new Map(); // key -> { t, data, all, inflight }
async function scan(root, maxAge = 3000, fast = false) {
  const k = key(root), c = scans.get(k);
  if (c && c.inflight) return c.inflight;
  if (c && c.data && (Date.now() - c.t < maxAge || (c.ev === (evCount.get(k) || 0) && Date.now() - c.t < 60000))) return c.data;
  const job = doScan(root, ixFind(root) ? 700 : fast ? 1200 : BUDGET_MS).then(({ data, all }) => { applyIndex(root, data); scans.set(k, { t: Date.now(), data, all, ev: evCount.get(k) || 0 }); return data; }, e => { scans.delete(k); throw e; });
  scans.set(k, { ...(c || {}), inflight: job });
  return job;
}
async function doScan(root, budget = BUDGET_MS) {
  const t0 = Date.now(), now = t0;
  const cells = Array.from({ length: 27 }, () => ({ files: 0, bytes: 0, top: [] }));
  let files = 0, dirs = 0, bytes = 0, truncated = false, largest = null, oldest = null, newest = null;
  const exts = {}, all = [], subdirs = [], q = [[root, 0]];
  outer: for (let qi = 0; qi < q.length; qi++) {
    const d = q[qi][0], depth = q[qi][1];
    let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
    const fe = [];
    for (const e of ents) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (files + dirs >= MAX_ENTRIES) { truncated = true; break outer; } dirs++; const full = path.join(d, e.name); if (depth === 0) subdirs.push({ name: e.name, path: full }); q.push([full, depth + 1]); }
      else if (e.isFile()) fe.push(e);
    }
    for (let bi = 0; bi < fe.length; bi += 64) {
      if (files + dirs >= MAX_ENTRIES || Date.now() - t0 > budget) { truncated = true; break outer; }
      const batch = fe.slice(bi, bi + 64), sts = await Promise.all(batch.map(e => fsp.stat(path.join(d, e.name)).catch(() => null)));
      for (let bj = 0; bj < batch.length; bj++) { const e = batch[bj], st = sts[bj]; if (!st) continue; const full = path.join(d, e.name);
        const rel = path.relative(root, full), cell = cellOf(rel, st.mtimeMs, now);
        files++; bytes += st.size; cells[cell].files++; cells[cell].bytes += st.size;
        const x = extOf(e.name) || '(sin ext)'; exts[x] = exts[x] || [0, 0]; exts[x][0]++; exts[x][1] += st.size;
        if (!largest || st.size > largest.size) largest = { rel, size: st.size };
        if (oldest === null || st.mtimeMs < oldest) oldest = st.mtimeMs;
        if (newest === null || st.mtimeMs > newest) newest = st.mtimeMs;
        all.push({ rel, size: st.size, mtime: st.mtimeMs, cell });
      }
    }
  }
  all.sort((a, b) => b.mtime - a.mtime);
  for (const f of all) if (cells[f.cell].top.length < 16) cells[f.cell].top.push({ rel: f.rel, size: f.size, mtime: f.mtime });
  let st = null; try { st = await fsp.stat(root); } catch {}

  // Layer 4: versions (git without optional locks: never refreshes the index)
  let git = null;
  if (fs.existsSync(path.join(root, '.git'))) {
    // side-effect-free git: no fsmonitor (it could run a repo-defined command or create files), no untracked cache, no locks
    const g = (...a) => run('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.preloadIndex=false', '-C', root, ...a], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } });
    const [branch, count, last, status] = await Promise.all([g('rev-parse', '--abbrev-ref', 'HEAD'), g('rev-list', '--count', 'HEAD'), g('log', '-1', '--format=%ct|%s'), g('status', '--porcelain')]);
    const [ct, ...msg] = last.trim().split('|');
    git = { branch: branch.trim() || '?', commits: +count.trim() || 0, lastTime: ct ? +ct * 1000 : null, lastMsg: msg.join('|'), dirty: status.split('\n').filter(Boolean).length };
  }
  const markers = ['.claude', 'CLAUDE.md', 'AGENTS.md', '.cursor', '.github', '.vscode', '.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].filter(m => fs.existsSync(path.join(root, m)));
  const ag = await agentInfo(root);
  const mediaN = Object.entries(exts).reduce((s, [e, v]) => s + (['image', 'video', 'audio'].includes(KMAP.get(e)) ? v[0] : 0), 0);
  const data = {
    path: root, name: path.basename(root) || root, totals: { files, dirs, bytes }, cells, recent: all.slice(0, 16),
    exts: Object.entries(exts).sort((a, b) => b[1][1] - a[1][1]).slice(0, 7).map(([e, v]) => ({ ext: e, n: v[0], bytes: v[1] })), extCount: Object.keys(exts).length,
    subdirs: subdirs.slice(0, 60), largest, oldest, newest, created: st && st.birthtimeMs, modified: st && st.mtimeMs,
    git, markers, agents: { sessions: ag.sessions, bytes: ag.bytes, last: ag.last, memories: ag.memories }, disk: diskOf(root), truncated, scanMs: Date.now() - t0,
  };
  data.preset = presetOf(root, data, mediaN);
  return { data, all };
}

// with an index the cube uses its complete figures; without one, if the scan was cut short, index in the background
function applyIndex(root, data) {
  const hit = ixFind(root);
  if (hit && Date.now() - hit.ix.at > 12 * 3600e3 && ![...indexes.values()].some(x => x.state === 'running' && key(x.root) === key(hit.ix.root))) startIndex(hit.ix.root, 'auto');
  if (hit) { const v = ixSummary(hit.ix, hit.i); data.cells.forEach((c, i) => { c.files = v.cells[i].files; c.bytes = v.cells[i].bytes; });
    data.indexed = { root: hit.ix.root, at: hit.ix.at, liveTruncated: data.truncated }; data.totals = { files: v.files, dirs: v.dirs, bytes: v.bytes }; data.truncated = false; if (v.newest > (data.newest || 0)) data.newest = v.newest; }
  else if (data.truncated && !(indexes.get(key(root)) && indexes.get(key(root)).state === 'error' && Date.now() - indexes.get(key(root)).failedAt < 600000)) { const e = [...indexes.values()].find(x => x.state === 'running' && inside(root, x.root)); data.indexing = e ? e.root : startIndex(root, 'auto').root; }
}
// template based on folder contents: type labels and key files to open as objects
const KEYFILES = ['README.md', 'readme.md', 'README.txt', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'Dockerfile', 'docker-compose.yml', 'index.html', 'main.py', 'server.js', 'index.js', 'main.js', 'app.py', 'Makefile'];
function presetOf(root, d, mediaN) {
  const m = new Set(d.markers), has = f => fs.existsSync(path.join(root, f)), t = [];
  if (/^[A-Za-z]:\\?$/.test(root) || root === '/') t.push(['unidad', 'Unidad']);
  if (m.has('package.json')) t.push(['node', 'Proyecto Node']); if (m.has('pyproject.toml') || has('requirements.txt')) t.push(['python', 'Proyecto Python']);
  if (m.has('Cargo.toml')) t.push(['rust', 'Proyecto Rust']); if (m.has('go.mod')) t.push(['go', 'Proyecto Go']); if (m.has('.git')) t.push(['git', 'Repositorio git']);
  if (m.has('.claude') || m.has('CLAUDE.md') || m.has('AGENTS.md') || (d.agents && d.agents.sessions)) t.push(['ia', 'Trabajado con IA']);
  if (d.totals.files > 3 && mediaN / d.totals.files > .5) t.push(['medios', 'Carpeta de medios']);
  if (!t.length) t.push(['carpeta', 'Carpeta']);
  const seen = new Set(); return { types: t, keyFiles: KEYFILES.filter(f => has(f) && !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase())).slice(0, 8), media: mediaN };
}
// actual references between files (imports and literals naming other files in the cube)
const depCache = new Map();
async function deps(root) {
  const k = key(root), c = depCache.get(k);
  if (c && Date.now() - c.t < 30000) return c.v;
  await scan(root, 30000);
  const all = (scans.get(k) || {}).all || [];
  const TXT = new Set(['md', 'json', 'toml', 'yaml', 'yml']);
  const cand = all.filter(f => (CODE.has(extOf(f.rel)) || TXT.has(extOf(f.rel))) && f.size > 0 && f.size <= 512 * 1024).slice(0, 500);
  const byBase = new Map(), byStem = new Map(), push = (m, kk, i) => { (m.get(kk) || m.set(kk, []).get(kk)).push(i); };
  cand.forEach((f, i) => { const b = path.basename(f.rel).toLowerCase(); push(byBase, b, i); push(byStem, b.replace(/\.[^.]+$/, ''), i); });
  const pick = (hit, i) => hit.find(j => path.dirname(cand[j].rel) === path.dirname(cand[i].rel)) ?? hit[0];
  const out = cand.map(() => new Set()), t0 = Date.now(); let analyzed = 0, total = 0;
  for (let i = 0; i < cand.length && Date.now() - t0 < 3000; i++) {
    let txt;
    try { selfRead(path.join(root, cand[i].rel)); const fh = await fsp.open(path.join(root, cand[i].rel), 'r'); try { const buf = Buffer.alloc(Math.min(cand[i].size, 131072)); await fh.read(buf, 0, buf.length, 0); txt = buf.toString('utf8'); } finally { await fh.close(); } } catch { continue; }
    analyzed++; let m;
    const reLit = /['"`]([^'"`\n]{2,160})['"`]/g;
    while ((m = reLit.exec(txt))) {
      const lit = m[1]; if (/\s/.test(lit)) continue;
      const seg = lit.split(/[\\/]/).pop().split(/[?#]/)[0].toLowerCase(); if (!seg) continue;
      let hit = byBase.get(seg);
      if (!hit && (lit[0] === '.' || lit.includes('/'))) hit = byStem.get(seg.replace(/\.[^.]+$/, ''));
      if (hit) out[i].add(pick(hit, i));
    }
    const reMod = /^\s*(?:from|import|use|mod|require|include)\s+([\w.:]+)/gm;
    while ((m = reMod.exec(txt))) { const seg = m[1].split(/[.:]+/).filter(Boolean).pop(); if (seg && seg.length > 2) { const hit = byStem.get(seg.toLowerCase()); if (hit) out[i].add(pick(hit, i)); } }
    out[i].delete(i); total += out[i].size;
  }
  const deg = cand.map((_, i) => out[i].size); out.forEach(s => s.forEach(j => deg[j]++));
  const top = cand.map((_, i) => i).filter(i => deg[i] > 0).sort((a, b) => deg[b] - deg[a]).slice(0, 16);
  const links = {}; out.forEach((st, i) => { if (st.size) links[cand[i].rel] = [...st].map(j => cand[j].rel); });
  const v = { links, nodes: top.map(i => cand[i].rel), m: top.map(i => top.map(j => out[i].has(j) ? 1 : 0)), deg: top.map(i => deg[i]), edges: total, analyzed };
  depCache.set(k, { t: Date.now(), v }); return v;
}

// --- Persistent index for huge trees (a whole C:\) ---
// A worker walks the tree; per-folder totals are kept here so cubes and sizes are computed instantly.
// The index is stored in ~/.prisma/index (outside anything observed) and kept current from disk events.
const { Worker } = require('worker_threads'), zlib = require('zlib');
const SIMDIR = path.join(os.homedir(), '.prisma'), IXDIR = path.join(SIMDIR, 'index'), indexes = new Map();
// earlier versions (named SIMULA) kept their data in ~/.simula: move it once
try { const old = path.join(os.homedir(), '.simula'); if (fs.existsSync(old)) { fs.mkdirSync(SIMDIR, { recursive: true }); for (const n of fs.readdirSync(old)) if (!fs.existsSync(path.join(SIMDIR, n))) fs.renameSync(path.join(old, n), path.join(SIMDIR, n)); if (!fs.readdirSync(old).length) fs.rmdirSync(old); } } catch {}
const ixPublic = ix => ({ root: ix.root, state: ix.state, dirs: ix.dirs, files: ix.files, bytes: ix.bytes, errors: ix.errors, at: ix.at, ms: ix.ms, cur: ix.cur, err: ix.err });
function startIndex(rootIn, by = 'usuario') {
  const root = path.resolve(rootIn), k = key(root), ex = indexes.get(k); if (ex && ex.state === 'running') return ex;
  const ix = { root, state: 'running', dirs: 0, files: 0, bytes: 0, errors: 0, prev: ex && ex.state === 'done' ? ex : ex && ex.prev };
  const w = new Worker(path.join(__dirname, 'indexer.js'), { workerData: { root, now: Date.now(), code: [...CODE], data: [...DATA] } });
  w.on('message', m => {
    if (m.k === 'progress') { Object.assign(ix, { dirs: m.dirs, files: m.files, bytes: m.bytes, errors: m.errors, cur: m.cur, ms: m.ms }); send({ k: 'index', ...ixPublic(ix) }); }
    else if (m.k === 'done') { buildIndex(ix, m); send({ k: 'index', ...ixPublic(ix) }); log(by, `indexa ${fmtCount(ix.files)} archivos`, root); invalidate(root); saveIndex(ix).catch(() => {}); w.terminate(); }
  });
  w.on('error', e => { ix.state = 'error'; ix.err = e.message; ix.failedAt = Date.now(); send({ k: 'index', ...ixPublic(ix) }); });
  w.on('exit', code => { if (ix.state === 'running') { ix.state = 'error'; ix.err = 'el indexador terminó (' + code + ')'; ix.failedAt = Date.now(); send({ k: 'index', ...ixPublic(ix) }); } });
  indexes.set(k, ix); log(by, 'indexando', root); send({ k: 'index', ...ixPublic(ix) }); return ix;
}
const fmtCount = n => n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n);
function buildIndex(ix, m) {
  const n = m.names.length, tot = new Float64Array(n * 3), kstart = new Int32Array(n + 1), par = m.parent;
  for (let i = 0; i < n; i++) { let f = 0, b = 0; for (let j = 0; j < 9; j++) { f += m.stats[i * 18 + j * 2]; b += m.stats[i * 18 + j * 2 + 1]; } tot[i * 3] = f; tot[i * 3 + 1] = b; }
  for (let i = n - 1; i > 0; i--) { const p = par[i]; tot[p * 3] += tot[i * 3]; tot[p * 3 + 1] += tot[i * 3 + 1]; tot[p * 3 + 2] += tot[i * 3 + 2] + 1; }
  for (let i = 1; i < n; i++) kstart[par[i] + 1]++; for (let i = 0; i < n; i++) kstart[i + 1] += kstart[i];
  const kids = new Int32Array(Math.max(0, n - 1)), pos = kstart.slice(0, n); for (let i = 1; i < n; i++) kids[pos[par[i]]++] = i;
  Object.assign(ix, { state: 'done', at: m.at, names: m.names, parent: par, stats: m.stats, newest: m.newest, tot, kstart, kids, files: m.files, bytes: m.bytes, errors: m.errors, ms: m.ms, dirs: n, prev: null, dirty: new Set(), ver: 1, sum: new Map(), changed: false, cur: null });
}
function ixLookup(ix, p) {
  const rel = path.relative(ix.root, path.resolve(p)); if (rel.startsWith('..') || path.isAbsolute(rel)) return null; if (!rel) return 0;
  let i = 0; for (const seg of rel.split(/[\\/]+/)) { const sk = key(seg); let f = -1; for (let k = ix.kstart[i]; k < ix.kstart[i + 1]; k++) { const j = ix.kids[k]; if (ix.names[j] === seg || key(ix.names[j]) === sk) { f = j; break; } } if (f < 0) return null; i = f; }
  return i;
}
const ixPath = (ix, i) => { const parts = []; for (let k = i; k > 0; k = ix.parent[k]) parts.push(ix.names[k]); return path.join(ix.root, ...parts.reverse()); };
function ixFind(p) {
  let best = null;
  for (const e of indexes.values()) { const ix = e.state === 'done' ? e : e.prev; if (!ix || ix.state !== 'done' || (best && ix.root.length <= best.ix.root.length)) continue; const i = ixLookup(ix, p); if (i != null && (!best || ix.root.length > best.ix.root.length)) best = { ix, i }; }
  return best;
}
function ixSummary(ix, i) {
  const c = ix.sum.get(i); if (c && c.ver === ix.ver) return c.v;
  const cells = Array.from({ length: 27 }, () => ({ files: 0, bytes: 0 })); let newest = 0; const st = [i, 0];
  while (st.length) { const r = st.pop(), d = st.pop(), dc = r === 0 ? 0 : r <= 2 ? 1 : 2;
    for (let b = 0; b < 9; b++) { const f = ix.stats[d * 18 + b * 2]; if (!f) continue; const cc = (b % 3) + 3 * dc + 9 * (b / 3 | 0); cells[cc].files += f; cells[cc].bytes += ix.stats[d * 18 + b * 2 + 1]; }
    if (ix.newest[d] > newest) newest = ix.newest[d];
    for (let k = ix.kstart[d]; k < ix.kstart[d + 1]; k++) st.push(ix.kids[k], r + 1); }
  const v = { cells, files: ix.tot[i * 3], bytes: ix.tot[i * 3 + 1], dirs: ix.tot[i * 3 + 2], newest };
  if (ix.sum.size > 400) ix.sum.clear(); ix.sum.set(i, { ver: ix.ver, v }); return v;
}
const ixChildren = (ix, i) => { const out = []; for (let k = ix.kstart[i]; k < ix.kstart[i + 1]; k++) { const j = ix.kids[k]; out.push({ name: ix.names[j], path: ixPath(ix, j), files: ix.tot[j * 3], bytes: ix.tot[j * 3 + 1], dirs: ix.tot[j * 3 + 2] }); } return out.sort((a, b) => b.bytes - a.bytes); };
function invalidate(root) { for (const k of [...scans.keys()]) { const s = scans.get(k); if (s && s.data && inside(s.data.path, root)) scans.delete(k); } }
// disk changes: re-read only the affected folder and propagate the total corrections upward
function ixTouch(abs) { for (const e of indexes.values()) { const ix = e.state === 'done' ? e : null; if (!ix || !inside(abs, ix.root)) continue; const i = ixLookup(ix, path.dirname(abs)); if (i != null) ix.dirty.add(i); } }
setInterval(async () => {
  for (const ix of indexes.values()) {
    if (ix.state !== 'done' || !ix.dirty.size) continue; const list = [...ix.dirty]; ix.dirty.clear();
    for (const i of list) {
      const p = ixPath(ix, i), st = new Float64Array(18); let nw = 0, ents = [];
      try { ents = await fsp.readdir(p, { withFileTypes: true }); } catch {}
      for (const e of ents) { if (!e.isFile()) continue; try { const s = await fsp.stat(path.join(p, e.name)); const ex = extOf(e.name), t = CODE.has(ex) ? 0 : DATA.has(ex) ? 1 : 2, age = Date.now() - s.mtimeMs, a = age < 36e5 ? 0 : age < 864e5 ? 1 : 2, o = (t + 3 * a) * 2; st[o]++; st[o + 1] += s.size; if (s.mtimeMs > nw) nw = s.mtimeMs; } catch {} }
      let df = 0, db = 0; for (let j = 0; j < 9; j++) { df += st[j * 2] - ix.stats[i * 18 + j * 2]; db += st[j * 2 + 1] - ix.stats[i * 18 + j * 2 + 1]; }
      ix.stats.set(st, i * 18); ix.newest[i] = Math.max(ix.newest[i], nw);
      for (let k = i; k >= 0; k = k ? ix.parent[k] : -1) { ix.tot[k * 3] += df; ix.tot[k * 3 + 1] += db; if (!k) break; }
      ix.files += df; ix.bytes += db;
    }
    ix.ver++; ix.changed = true; send({ k: 'index', ...ixPublic(ix) });
  }
}, 6000).unref();
async function saveIndex(ix) {
  await fsp.mkdir(IXDIR, { recursive: true });
  const o = { v: 2, root: ix.root, at: ix.at, ms: ix.ms, errors: ix.errors, names: ix.names, parent: Buffer.from(ix.parent.buffer, ix.parent.byteOffset, ix.parent.byteLength).toString('base64'),
    stats: Buffer.from(ix.stats.buffer, ix.stats.byteOffset, ix.stats.byteLength).toString('base64'), newest: Buffer.from(ix.newest.buffer, ix.newest.byteOffset, ix.newest.byteLength).toString('base64') };
  const buf = await new Promise((ok, ko) => zlib.gzip(JSON.stringify(o), (e, b) => e ? ko(e) : ok(b)));
  await fsp.writeFile(path.join(IXDIR, ix.root.replace(/[^a-zA-Z0-9]/g, '-') + '.json.gz'), buf); ix.changed = false;
}
async function loadIndexes() {
  let ents = []; try { ents = await fsp.readdir(IXDIR); } catch { return; }
  for (const f of ents.filter(f => f.endsWith('.json.gz'))) {
    try {
      const o = JSON.parse(zlib.gunzipSync(await fsp.readFile(path.join(IXDIR, f))).toString('utf8')); if (Date.now() - o.at > 14 * 864e5 || !fs.existsSync(o.root)) continue;
      const b64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
      const stats = b64(o.stats, Float64Array); let files = 0, bytes = 0; for (let i = 0; i < stats.length; i += 2) { files += stats[i]; bytes += stats[i + 1]; }
      const ix = { root: o.root }; buildIndex(ix, { root: o.root, at: o.at, ms: o.ms, errors: o.errors, names: o.names, parent: b64(o.parent, Int32Array), stats, newest: b64(o.newest, Float64Array), files, bytes });
      indexes.set(key(o.root), ix); invalidate(o.root); if (o.v !== 2) setTimeout(() => startIndex(o.root, 'sistema'), 20000); // new time axis: rebuilt while still in use
    } catch {}
  }
}
setInterval(() => { for (const ix of indexes.values()) if (ix.state === 'done' && ix.changed) saveIndex(ix).catch(() => {}); }, 120000).unref();

// --- Layer 5: agents (AI sessions and their actual tool traces) ---
let homes = null;
async function claudeHomes() {
  if (homes && Date.now() - homes.t < 60000) return homes.l;
  const l = [];
  try { for (const h of await fsp.readdir(os.homedir(), { withFileTypes: true })) if (h.isDirectory() && h.name.startsWith('.claude')) l.push(path.join(os.homedir(), h.name, 'projects')); } catch {}
  homes = { t: Date.now(), l }; return l;
}
const OPS = { Read: 'lee', Grep: 'busca', Glob: 'busca', Edit: 'escribe', Write: 'escribe', NotebookEdit: 'escribe', Bash: 'ejecuta', PowerShell: 'ejecuta', WebFetch: 'red', WebSearch: 'red', Agent: 'delega' };
const agentCache = new Map();
async function agentInfo(root) {
  const k = key(root), c = agentCache.get(k);
  if (c && Date.now() - c.t < 5000) return c.v;
  const v = { sessions: 0, bytes: 0, last: null, active: false, memories: 0, model: null, ctx: null, sessionRoot: null, trace: [] };
  let p = root; const files = [];
  for (let i = 0; i < 8; i++) {
    const slug = p.replace(/[^a-zA-Z0-9]/g, '-');
    for (const base of await claudeHomes()) {
      const pd = path.join(base, slug); let ents; try { ents = await fsp.readdir(pd, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        if (e.isFile() && e.name.endsWith('.jsonl')) { try { const s = await fsp.stat(path.join(pd, e.name)); files.push({ f: path.join(pd, e.name), size: s.size, m: s.mtimeMs }); } catch {} }
        else if (e.isDirectory() && e.name === 'memory') { try { v.memories += (await fsp.readdir(path.join(pd, e.name))).filter(n => n.endsWith('.md') && n !== 'MEMORY.md').length; } catch {} }
      }
    }
    if (files.length) { v.sessionRoot = p; break; }
    const up = path.dirname(p); if (up === p) break; p = up;
  }
  if (files.length) {
    files.sort((a, b) => b.m - a.m);
    v.sessions = files.length; v.bytes = files.reduce((s, f) => s + f.size, 0); v.last = files[0].m; v.active = Date.now() - files[0].m < 120000;
    try {
      const { f, size } = files[0], len = Math.min(size, 1 << 20), buf = Buffer.alloc(len);
      const fh = await fsp.open(f, 'r'); await fh.read(buf, 0, len, size - len); await fh.close();
      const lines = buf.toString('utf8').split('\n'); if (len < size) lines.shift();
      const tr = [];
      for (const ln of lines) {
        if (ln.length < 20) continue; let o; try { o = JSON.parse(ln); } catch { continue; }
        const msg = o.message; if (o.type !== 'assistant' || !msg) continue;
        if (msg.model) v.model = msg.model;
        const u = msg.usage; if (u) v.ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        const ts = Date.parse(o.timestamp) || null;
        for (const b of Array.isArray(msg.content) ? msg.content : []) if (b && b.type === 'tool_use') {
          const inp = b.input || {}, fp = inp.file_path || inp.path || inp.notebook_path;
          tr.push({ t: ts, tool: b.name, op: OPS[b.name] || 'usa', fp: typeof fp === 'string' ? fp : null,
            target: String(fp || inp.pattern || inp.command || inp.url || inp.description || inp.query || '').replace(/\s+/g, ' ').slice(0, 120) });
        }
      }
      const now = Date.now();
      for (const e of tr.slice(-40)) {
        let file = null, cell = null, abs = null;
        if (e.fp && path.isAbsolute(e.fp)) {
          abs = path.resolve(e.fp);
          if (inside(abs, root) && key(abs) !== key(root)) { file = path.relative(root, abs); try { const s = await fsp.stat(abs); if (s.isFile()) cell = cellOf(file, s.mtimeMs, now); } catch {} }
        }
        if (!file && key(v.sessionRoot) !== key(root)) continue; // a child cube only inherits what happens inside it
        v.trace.push({ t: e.t, tool: e.tool, op: e.op, target: e.target, file, cell, abs, label: abs ? path.basename(abs) : null });
      }
    } catch {}
  }
  agentCache.set(k, { t: Date.now(), v }); return v;
}

// pulse: what every AI session on this machine is doing right now (all .claude* accounts)
let pulseCache = { t: 0, v: null }, pulseList = { t: 0, all: [] }; const pulseFiles = new Map();
async function pulse() {
  if (Date.now() - pulseCache.t < 1000 && pulseCache.v) return pulseCache.v;
  const now = Date.now(), found = [];
  if (now - pulseList.t > 15000) { const all = [];
    for (const base of await claudeHomes()) {
      let projs = []; try { projs = await fsp.readdir(base, { withFileTypes: true }); } catch { continue; }
      for (const pd of projs) { if (!pd.isDirectory()) continue; const dir = path.join(base, pd.name); let ents = [];
        try { ents = await fsp.readdir(dir); } catch { continue; }
        for (const e of ents) if (e.endsWith('.jsonl')) { try { const st = await fsp.stat(path.join(dir, e)); if (now - st.mtimeMs < 6 * 3600e3) all.push({ f: path.join(dir, e), m: st.mtimeMs, account: path.basename(path.dirname(base)), project: pd.name }); } catch {} } }
    }
    pulseList = { t: now, all }; }
  for (const x of pulseList.all) { if (now - x.m > 30 * 60000) continue; try { const st = await fsp.stat(x.f); x.m = st.mtimeMs; if (now - st.mtimeMs < 20 * 60000) found.push({ ...x, size: st.size }); } catch {} }
  found.sort((a, b) => b.m - a.m);
  const sessions = [];
  for (const s of found.slice(0, 4)) {
    const pc = pulseFiles.get(s.f); // unchanged session file: skip re-reading it
    if (pc && pc.size === s.size) { sessions.push({ ...pc.v, last: s.m, active: now - s.m < 120000 }); continue; }
    const v = { id: path.basename(s.f, '.jsonl').slice(0, 8), account: s.account.replace(/^\.claude-?/, '') || 'principal', project: s.project, last: s.m, active: now - s.m < 120000, model: null, ctx: null, trace: [] };
    try {
      const len = Math.min(s.size, 768 << 10), buf = Buffer.alloc(len), fh = await fsp.open(s.f, 'r'); await fh.read(buf, 0, len, s.size - len); await fh.close();
      const lines = buf.toString('utf8').split(String.fromCharCode(10)); if (len < s.size) lines.shift();
      for (const ln of lines) {
        if (ln.length < 20 || !ln.includes('"assistant"')) continue; let o; try { o = JSON.parse(ln); } catch { continue; }
        const msg = o.message; if (o.type !== 'assistant' || !msg) continue;
        if (msg.model) v.model = msg.model; const u = msg.usage; if (u) v.ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        const ts = Date.parse(o.timestamp) || null;
        for (const b of Array.isArray(msg.content) ? msg.content : []) if (b && b.type === 'tool_use') {
          const inp = b.input || {}, fp = [inp.file_path, inp.path, inp.notebook_path].find(x => typeof x === 'string' && path.isAbsolute(x));
          v.trace.push({ t: ts, tool: b.name, op: OPS[b.name] || 'usa', abs: fp ? path.resolve(fp) : null, target: String(fp || inp.pattern || inp.command || inp.url || inp.description || inp.query || '').replace(/\s+/g, ' ').slice(0, 120) });
        }
      }
      v.trace = v.trace.slice(-40);
      for (const e of v.trace) if (/^(WebFetch|WebSearch)$/.test(e.tool) && /^https?:/.test(e.target)) learnHost(e.target);
      for (const e of v.trace) if (e.abs) { try { const st = await fsp.stat(e.abs); e.dir = st.isDirectory(); e.mtime = st.mtimeMs; e.size = st.size; } catch { e.gone = true; } }
    } catch {}
    pulseFiles.set(s.f, { size: s.size, v }); if (pulseFiles.size > 64) pulseFiles.clear();
    sessions.push(v);
  }
  pulseCache = { t: Date.now(), v: { t: now, sessions } }; return pulseCache.v;
}

// --- Workspace (in memory) and events ---
// spaces: Live (automatic) plus those the user creates with «+». ws is always the current space.
const spaces = new Map(); let ws = null, curSpace = 'vivo', spaceN = 0;
function newSpace(name, auto) { const id = auto ? 'vivo' : 's' + (++spaceN); const sp = { id, name: String(name || 'Espacio ' + spaceN).slice(0, 40), auto: !!auto, cubes: new Map(), layout: 'cluster', focus: null, focusRev: 0 }; spaces.set(id, sp); return sp; }
function useSpace(id) { const sp = spaces.get(id); if (!sp) throw new Error('No existe ese espacio'); ws = sp; curSpace = id; syncWatchers(); send(state()); return sp; }
ws = newSpace('En vivo', true);
const clients = new Set(), watchers = new Map(), evCount = new Map();
const send = obj => { const line = `data: ${JSON.stringify(obj)}\n\n`; for (const c of clients) c.write(line); };
if (flags.dev) { // hot reload of the client: styles are swapped in place, anything else reloads the page
  let pending = null, cssOnly = true;
  fs.watch(path.join(__dirname, 'public'), { recursive: true }, (_e, name) => {
    if (!name) return; cssOnly = cssOnly && /\.css$/i.test(name); clearTimeout(pending);
    pending = setTimeout(() => { send({ k: 'reload', css: cssOnly }); cssOnly = true; }, 150);
  });
}
const selfReads = new Map(); const selfRead = p => { selfReads.set(key(p), Date.now()); if (selfReads.size > 5000) for (const [k, t] of selfReads) if (Date.now() - t > 15000) selfReads.delete(k); };
const srcHash = () => { try { return require('crypto').createHash('sha1').update(fs.readFileSync(path.join(__dirname, 'server.js'))).update(fs.readFileSync(path.join(__dirname, 'pshost.ps1'))).digest('hex').slice(0, 10); } catch { return ''; } }, SRC = srcHash();
const BOOT = require('crypto').randomBytes(6).toString('hex'); // identifies this run: if it changes, the page reloads (new token)
let ADMIN = false; if (WIN) setTimeout(() => ps('admin', {}, 15000).then(r => { ADMIN = !!r; }, () => {}), 1500);
const state = () => ({ k: 'state', fg: LIVE.fg, boot: BOOT, admin: ADMIN, space: curSpace, spaces: [...spaces.values()].map(s => ({ id: s.id, name: s.name, auto: s.auto, n: s.cubes.size })), live: LIVE.on, procs: curSpace === 'vivo' ? LIVE.procs : null, mem: curSpace === 'vivo' ? LIVE.mem : null, cubes: [...ws.cubes.values()], layout: ws.layout, focus: ws.focus, focusRev: ws.focusRev, max: MAX_CUBES });
const log = (by, action, target) => send({ k: 'log', by, action, target, t: Date.now() });

async function checkDir(p) {
  p = String(p || '').trim().replace(/^"|"$/g, '');
  if (/^[\\/]{2}/.test(p)) throw new Error('Rutas de red no permitidas');
  if (!p || !path.isAbsolute(p)) throw new Error('Indica una ruta absoluta');
  p = path.resolve(p);
  let st; try { st = await fsp.stat(p); } catch { throw new Error('No existe: ' + p); }
  if (!st.isDirectory()) throw new Error('No es un directorio: ' + p);
  return p;
}
function addCube(p, parent, by) {
  const k = key(p);
  if (ws.cubes.has(k)) { const c = ws.cubes.get(k); if (c.by === 'vivo' && by !== 'vivo') c.by = by; return false; } // what the user pins in Live is never retired automatically
  if (ws.cubes.size >= MAX_CUBES) throw new Error(`Límite de ${MAX_CUBES} cubos`);
  ws.cubes.set(k, { path: p, name: path.basename(p) || p, parent: parent || null, by: by || 'usuario' });
  syncWatchers(); return true;
}
const SKIP = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information', 'Windows', 'WinSxS', '__pycache__', 'dist', 'build', 'target', '.git']);
async function openCube(pIn, { expand = false, depth, by = 'usuario', here = false, quiet = false, root = false } = {}) {
  const p = await checkDir(pIn);
  if (ws.auto && !here) useSpace(newSpace(path.basename(p) || p).id); // opening something specific from Live creates its own space
  else if (!ws.auto && !ws.cubes.size && /^Espacio \d+$/.test(ws.name)) ws.name = (path.basename(p) || p).slice(0, 40); // the first cube names the space
  let parent = null; // if an ancestor is already open, attach to the nearest one (unless requested as a standalone cube)
  if (!root) for (const c of ws.cubes.values()) if (inside(p, c.path) && key(p) !== key(c.path) && (!parent || c.path.length > parent.length)) parent = c.path;
  addCube(p, parent, by);
  // recursive breadth-first opening down to the requested depth or the cube cap
  const D = Math.max(0, Math.min(6, depth != null ? +depth : expand ? 1 : 0)); let added = 0;
  let level = [p];
  outer: for (let d = 0; d < D && level.length; d++) {
    const next = [];
    for (const dir of level) {
      // with an index: heaviest folders first, empty ones skipped; without one: alphabetical
      const hit = ixFind(dir); let subs;
      if (hit) subs = ixChildren(hit.ix, hit.i).filter(x => x.bytes > 0 && !x.name.startsWith('.') && !x.name.startsWith('$') && !SKIP.has(x.name)).slice(0, d ? 12 : 20).map(x => x.name);
      else { let ents = []; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; } subs = ents.filter(e => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.') && !e.name.startsWith('$') && !SKIP.has(e.name)).slice(0, 26).map(e => e.name); }
      for (const name of subs) {
        const c = path.join(dir, name); try { if (addCube(c, dir, by)) added++; next.push(c); } catch { break outer; }
      }
    }
    level = next;
  }
  if (!quiet) { ws.focus = p; ws.focusRev++; } log(by, D ? `despliega ${D} nivel${D > 1 ? 'es' : ''} (+${added})` : 'abre', p); send(state());
  return p;
}
function closeCube(p, by = 'usuario') {
  const k = key(path.resolve(String(p))); if (ws.auto) LIVE.hidden.set(k, Date.now() + 600000); // does not reappear in Live for 10 min
  for (const [kk, c] of [...ws.cubes]) if (kk === k || inside(c.path, path.resolve(String(p)))) ws.cubes.delete(kk);
  syncWatchers(); log(by, 'cierra', p); send(state());
}
// one watcher per root (cube with no open ancestor); each event fans out to every cube containing the file
function syncWatchers() {
  // Windows and macOS watch recursively from the roots; on Linux (inotify) each cube watches its own folder
  const RECUR = WIN || process.platform === 'darwin';
  const roots = RECUR ? [...ws.cubes.values()].filter(c => ![...ws.cubes.values()].some(o => o !== c && inside(c.path, o.path))) : [...ws.cubes.values()];
  const want = new Set(roots.map(c => key(c.path)));
  for (const [k, w] of [...watchers]) if (!want.has(k)) { try { w.close(); } catch {} watchers.delete(k); }
  for (const c of roots) {
    const k = key(c.path); if (watchers.has(k)) continue;
    const last = new Map(), bucket = { s: 0, n: 0 };
    try {
      const w = fs.watch(c.path, { recursive: WIN || process.platform === 'darwin' }, (type, fn) => {
        if (!fn) return; fn = String(fn); if (inside(path.join(c.path, fn), SIMDIR)) return;
        const now = Date.now(); if (now - (last.get(fn) || 0) < 400) return;
        last.set(fn, now); if (last.size > 3000) last.clear();
        const abs = path.join(c.path, fn); ixTouch(abs);
        // cap of 25 events/s per root so a whole drive (C:\) floods neither the server nor the view
        const sec = now / 1000 | 0; if (bucket.s !== sec) { bucket.s = sec; bucket.n = 0; }
        if (++bucket.n > 25) { for (const cu of ws.cubes.values()) if (inside(abs, cu.path)) evCount.set(key(cu.path), (evCount.get(key(cu.path)) || 0) + 1); return; }
        fs.stat(abs, (e, st) => {
          if (st && st.isDirectory()) { if (type === 'rename') ixNewDir(abs); return; }
          const pre = e ? 'borrado' : type === 'rename' ? 'creado' : now - st.mtimeMs > 3000 ? 'acceso' : 'escrito';
          (pre === 'escrito' || pre === 'creado' ? authorOf(abs) : Promise.resolve(null)).catch(() => null).then(who => {
          for (const cu of ws.cubes.values()) {
            if (!inside(abs, cu.path)) continue;
            const rel = path.relative(cu.path, abs); evCount.set(key(cu.path), (evCount.get(key(cu.path)) || 0) + 1);
            // content unchanged (old mtime) means a mere access: Windows updates the last-access time on read
            const kind = e ? 'borrado' : type === 'rename' ? 'creado' : now - st.mtimeMs > 3000 ? 'acceso' : 'escrito', mine = kind === 'acceso' && now - (selfReads.get(key(abs)) || 0) < 15000;
            send({ k: 'fs', root: cu.path, file: rel, type: kind, by: mine ? 'prisma' : null, who, cell: e ? null : cellOf(rel, st.mtimeMs, now), size: e ? 0 : st.size, t: now });
          }
          });
        });
      });
      w.on('error', () => watchers.delete(k)); watchers.set(k, w);
    } catch {}
  }
}

// compact view for an AI: everything Prisma is observing
async function observe() {
  const cubes = [];
  for (const c of ws.cubes.values()) {
    let d; try { d = await scan(c.path, 15000); } catch { continue; }
    const ag = await agentInfo(c.path);
    cubes.push({ path: c.path, parent: c.parent, totals: d.totals, truncated: d.truncated, git: d.git, markers: d.markers,
      cells: d.cells.map((x, i) => ({ i, files: x.files, bytes: x.bytes })).filter(x => x.files),
      recent: d.recent.slice(0, 8).map(f => ({ file: f.rel, bytes: f.size, mtime: new Date(f.mtime).toISOString() })),
      fsEvents: evCount.get(key(c.path)) || 0,
      agent: { sessions: ag.sessions, active: ag.active, model: ag.model, contextTokens: ag.ctx, lastTools: ag.trace.slice(-6).map(t => `${t.tool} ${t.file || t.target}`) } });
  }
  const mem = { total: os.totalmem(), free: os.freemem() };
  return { readOnly: true, axes: { x: ['código', 'datos', 'docs·media'], y: ['raíz', 'nivel 1-2', 'nivel 3+'], z: ['<1 h (ahora)', '<24 h (hoy)', 'antes'], cellIndex: 'x + 3*y + 9*z' },
    layout: ws.layout, focus: ws.focus, system: { cpu: +(cpuLoad.reduce((a, b) => a + b, 0) / (cpuLoad.length || 1)).toFixed(3), cores: cpuLoad.length, mem, gpu }, cubes };
}

// --- Explorer and objects (read-only) ---
// Prisma is a monitor: no route acts on processes, files or the system.
const TOKEN = require('crypto').randomBytes(18).toString('hex'); // handed to the page on load; guards file reads
const KIND = { image: 'png jpg jpeg gif webp bmp ico svg avif tif tiff', video: 'mp4 webm mov mkv avi m4v ogv', audio: 'mp3 wav ogg flac m4a aac opus weba',
  doc: 'md txt pdf rtf doc docx odt log', archive: 'zip rar 7z tar gz tgz bz2 xz', exe: 'exe dll msi sys com so dylib app apk bin', font: 'ttf otf woff woff2', model3d: 'glb gltf obj fbx stl blend ai psd' };
const KMAP = new Map(); for (const [k, v] of Object.entries(KIND)) for (const e of v.split(' ')) KMAP.set(e, k);
const kindOf = (name, dir) => { if (dir) return 'dir'; const e = extOf(name); return KMAP.get(e) || (CODE.has(e) ? 'code' : DATA.has(e) ? 'data' : 'other'); };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', ogv: 'video/ogg', mkv: 'video/x-matroska', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', weba: 'audio/webm',
  pdf: 'application/pdf', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
async function roots() {
  const out = [];
  if (WIN) for (const L of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { const p = L + ':\\'; try { await fsp.access(p); const d = diskOf(p); out.push({ name: p, path: p, kind: 'drive', size: d ? d.total : null, free: d ? d.free : null }); } catch {} }
  else out.push({ name: '/', path: '/', kind: 'drive' });
  const home = os.homedir(); out.push({ name: 'Inicio', path: home, kind: 'dir' });
  for (const n of ['Desktop', 'Escritorio', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music']) if (fs.existsSync(path.join(home, n))) out.push({ name: n, path: path.join(home, n), kind: 'dir' });
  return out;
}
async function ls(p) {
  p = await checkDir(p); let ents = []; try { ents = await fsp.readdir(p, { withFileTypes: true }); } catch (e) { throw new Error('Sin permiso de lectura'); }
  const out = [];
  for (const e of ents.slice(0, 3000)) {
    const full = path.join(p, e.name), dir = e.isDirectory(); let size = null, mtime = null;
    if (!dir && ents.length < 1500) { try { const st = await fsp.stat(full); size = st.size; mtime = st.mtimeMs; } catch {} }
    out.push({ name: e.name, path: full, dir, kind: e.isSymbolicLink() ? 'link' : kindOf(e.name, dir), size, mtime, ext: dir ? '' : extOf(e.name), hidden: e.name.startsWith('.') || e.name.startsWith('$') });
  }
  out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }));
  const hit = ixFind(p), kidIx = new Map(); if (hit) for (let k = hit.ix.kstart[hit.i]; k < hit.ix.kstart[hit.i + 1]; k++) kidIx.set(key(hit.ix.names[hit.ix.kids[k]]), hit.ix.kids[k]);
  if (hit) for (const en of out) if (en.dir) { const j = kidIx.get(key(en.name)); if (j != null) { en.size = hit.ix.tot[j * 3 + 1]; en.files = hit.ix.tot[j * 3]; } }
  const up = path.dirname(p); return { path: p, parent: up !== p ? up : null, entries: out, truncated: ents.length > 3000, indexed: hit ? { root: hit.ix.root, at: hit.ix.at, bytes: hit.ix.tot[hit.i * 3 + 1], files: hit.ix.tot[hit.i * 3] } : null };
}
const MAGIC = [[[0x4d, 0x5a], 'ejecutable PE (Windows)'], [[0x7f, 0x45, 0x4c, 0x46], 'ejecutable ELF'], [[0x50, 0x4b, 3, 4], 'ZIP / contenedor Office'], [[0x25, 0x50, 0x44, 0x46], 'PDF'],
  [[0x89, 0x50, 0x4e, 0x47], 'PNG'], [[0xff, 0xd8, 0xff], 'JPEG'], [[0x47, 0x49, 0x46], 'GIF'], [[0x52, 0x49, 0x46, 0x46], 'RIFF (WAV/AVI/WebP)'], [[0x1a, 0x45, 0xdf, 0xa3], 'Matroska/WebM'], [[0x53, 0x51, 0x4c, 0x69], 'SQLite'], [[0x67, 0x6c, 0x54, 0x46], 'glTF binario']];
async function fileInfo(pIn) {
  const p = safePath(pIn); let st; try { st = await fsp.stat(p); } catch { throw new Error('No existe: ' + p); }
  if (st.isDirectory()) throw new Error('Es un directorio: ábrelo como cubo');
  const name = path.basename(p), ext = extOf(name), kind = kindOf(name, false), n = Math.min(st.size, 256 * 1024), buf = Buffer.alloc(n);
  if (n) { selfRead(p); const fh = await fsp.open(p, 'r'); try { await fh.read(buf, 0, n, 0); } finally { await fh.close(); } }
  const head = buf.subarray(0, 512), magic = (MAGIC.find(([m]) => m.every((b, i) => head[i] === b)) || [, null])[1];
  let bin = 0; for (let i = 0; i < Math.min(n, 8192); i++) { const b = buf[i]; if (b === 0 || (b < 7 && b !== 0)) bin++; }
  const text = !['image', 'video', 'audio', 'exe', 'archive', 'font'].includes(kind) && bin === 0 && kind !== 'model3d' ? buf.toString('utf8') : null;
  const o = { path: p, name, ext, kind, mime: MIME[ext] || null, size: st.size, mtime: st.mtimeMs, birth: st.birthtimeMs, atime: st.atimeMs, magic, partial: st.size > n };
  if (text != null) {
    const lines = text.split(/\r?\n/); o.lines = lines.length + (o.partial ? '+' : ''); o.text = lines.slice(0, 400).join('\n').slice(0, 64000);
    if (ext === 'csv' || ext === 'tsv') { const sep = ext === 'tsv' ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ','); o.table = lines.filter(Boolean).slice(0, 60).map(l => l.split(sep).slice(0, 14).map(c => c.replace(/^"|"$/g, '').slice(0, 40))); }
    if (ext === 'json' && !o.partial) { try { const j = JSON.parse(text), shape = (v, d) => Array.isArray(v) ? `[${v.length}] ${v.length && d < 2 ? shape(v[0], d + 1) : ''}` : v && typeof v === 'object' ? (d > 2 ? '{…}' : '{ ' + Object.keys(v).slice(0, 12).map(k => k + ': ' + shape(v[k], d + 1)).join(', ') + ' }') : v === null ? 'null' : typeof v === 'string' ? JSON.stringify(v.length > 80 ? v.slice(0, 80) + '…' : v) : String(v); // the values, not just the type
      o.json = Object.keys(j && typeof j === 'object' ? j : {}).slice(0, 40).map(k => [k, shape(j[k], 1).slice(0, 160)]); } catch (e) { o.jsonError = e.message.slice(0, 120); } }
  } else o.hex = [...head.subarray(0, 384)].map(b => b.toString(16).padStart(2, '0')).join('');
  // relations: if inside an open cube, who names it and whom it names
  let cube = null; for (const c of ws.cubes.values()) if (inside(p, c.path) && (!cube || c.path.length > cube.length)) cube = c.path;
  if (cube) { const dc = depCache.get(key(cube)); o.cube = cube; if (dc) { const rel = path.relative(cube, p); o.refsOut = dc.v.links[rel] || []; o.refsIn = Object.entries(dc.v.links).filter(([, l]) => l.includes(rel)).map(([k]) => k).slice(0, 30); } }
  return o;
}
// streams a file so that neither a read error nor a client dropping the connection can crash the process or leak descriptors
const { pipeline } = require('stream');
const streamFile = (res, p, opts) => pipeline(fs.createReadStream(p, opts), res, () => {});
function sendRaw(req, res, pIn) {
  const p = safePath(pIn); let st; try { st = fs.statSync(p); } catch { res.writeHead(404); return res.end(); } if (!st.isFile()) { res.writeHead(400); return res.end(); }
  const ext = extOf(p), type = MIME[ext] || 'application/octet-stream', m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (ext !== 'pdf') h['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"; // Chrome's PDF viewer needs to be able to load it
  if (m && (m[1] || m[2])) {
    let a, b; if (!m[1]) { a = Math.max(0, st.size - +m[2]); b = st.size - 1; } else { a = +m[1]; b = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1; } // `bytes=-N` = last N bytes
    if (a >= st.size || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...h, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 }); selfRead(p); return streamFile(res, p, { start: a, end: b });
  }
  selfRead(p); res.writeHead(200, { ...h, 'Content-Length': st.size }); streamFile(res, p);
}
function thumb(res, pIn) {
  const p = safePath(pIn); selfRead(p);
  const ff = spawn('ffmpeg', ['-v', 'quiet', '-i', p, '-frames:v', '1', '-vf', 'thumbnail=60,scale=640:-1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], { windowsHide: true }); const chunks = [];
  ff.stdout.on('data', d => chunks.push(d)); ff.on('error', () => { if (!res.headersSent) { res.writeHead(404); res.end(); } });
  ff.on('close', () => { if (res.headersSent) return; const b = Buffer.concat(chunks); if (!b.length) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=600' }); res.end(b); });
  setTimeout(() => ff.kill(), 15000).unref();
}
// every image, video and audio file under a folder, for the cube's media gallery (names and stats only, never the contents)
const MEDIA_K = new Set(['image', 'video', 'audio']), mediaCache = new Map();
async function mediaList(pIn) {
  const root = await checkDir(pIn), k = key(root), hit = mediaCache.get(k); if (hit && Date.now() - hit.t < 8000) return hit.v;
  const t0 = Date.now(), MAX = 50000, items = [], dirs = {}; let truncated = false, nd = 0; const queue = [''];
  while (queue.length && !truncated) {
    const rel = queue.shift(); let ents; try { ents = await fsp.readdir(path.join(root, rel), { withFileTypes: true }); } catch { continue; } nd++;
    const files = [];
    for (const e of ents) { if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('$')) queue.push(rel ? path.join(rel, e.name) : e.name); continue; }
      if (!e.isFile()) continue; const kd = KMAP.get(extOf(e.name)); if (MEDIA_K.has(kd)) files.push([e.name, kd]); }
    for (let i = 0; i < files.length; i += 64) await Promise.all(files.slice(i, i + 64).map(async ([n, kd]) => { const r = rel ? path.join(rel, n) : n;
      try { const st = await fsp.stat(path.join(root, r)); items.push({ r, s: st.size, m: Math.round(st.mtimeMs), k: kd }); const d = rel || '.'; dirs[d] = (dirs[d] || 0) + 1; } catch {} }));
    if (items.length >= MAX || Date.now() - t0 > 8000) truncated = true;
  }
  const v = { root, sep: path.sep, items: items.slice(0, MAX), dirs, folders: nd, truncated, ms: Date.now() - t0 };
  if (mediaCache.size > 20) mediaCache.clear(); mediaCache.set(k, { t: Date.now(), v }); return v;
}
// network paths (\\server\share) are blocked: opening one would make Windows authenticate against another machine
function safePath(pIn) { const s = String(pIn || '').trim(); if (/^[\\/]{2}/.test(s)) throw new Error('Rutas de red no permitidas'); if (!s || !path.isAbsolute(s)) throw new Error('Indica una ruta absoluta'); return path.resolve(s); } // without a path, never fall back to the server's own folder
// real system icons (the one Windows shows for that executable or file type), batched and cached
const icons = new Map(), iconWait = new Map(); let iconT = null;
// protected process without a path (Windows withholds it): look the executable up by name in the system and Defender folders
const ipCache = new Map();
function iconPath(p) { if (!p || /[\\/]/.test(p) || !WIN) return p; if (ipCache.has(p)) return ipCache.get(p); const n = path.basename(p), sr = process.env.SystemRoot || 'C:\\Windows';
  const cand = [path.join(sr, 'System32', n), path.join(sr, 'SysWOW64', n), path.join(sr, n)];
  try { const d = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows Defender', 'Platform'); for (const v of fs.readdirSync(d).sort().reverse()) cand.push(path.join(d, v, n)); } catch {}
  for (const d of String(process.env.PATH || '').split(';').filter(x => x && path.isAbsolute(x)).slice(0, 60)) cand.push(path.join(d, n)); // node.exe, powershell.exe…: wherever the system itself finds them
  const r = cand.find(c => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null; if (ipCache.size > 500) ipCache.clear(); ipCache.set(p, r); return r; }
function icon(p) {
  if (!WIN || !p) return Promise.resolve(null); const k = key(p);
  if (icons.has(k)) return Promise.resolve(icons.get(k));
  return new Promise(ok => { (iconWait.get(k) || iconWait.set(k, { p, cbs: [] }).get(k)).cbs.push(ok); clearTimeout(iconT); iconT = setTimeout(flushIcons, 40); });
}
const nativeOp = (...a) => ps(...a); // alias: inside flushIcons `ps` is a different variable
function flushIcons() {
  const batch = [...iconWait.values()].slice(0, 60); batch.forEach(b => iconWait.delete(key(b.p))); if (!batch.length) return;
  if (WIN) { nativeOp('icons', { files: batch.map(b => b.p) }, 15000).then(j => j || {}, () => ({})).then(j => { for (const b of batch) { const v = j[b.p] ? Buffer.from(j[b.p], 'base64') : null; icons.set(key(b.p), v); b.cbs.forEach(f => f(v)); } if (iconWait.size) flushIcons(); }); return; }
  const ps = spawn('powershell', ['-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::InputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; $l = [Console]::In.ReadToEnd() | ConvertFrom-Json; $o = @{}; foreach ($p in $l) { try { $i = [System.Drawing.Icon]::ExtractAssociatedIcon($p); $b = $i.ToBitmap(); $m = New-Object IO.MemoryStream; $b.Save($m, [System.Drawing.Imaging.ImageFormat]::Png); $o[$p] = [Convert]::ToBase64String($m.ToArray()) } catch {} }; $o | ConvertTo-Json -Compress'], { windowsHide: true });
  let out = ''; ps.stdout.on('data', d => out += d);
  const done = () => { let j = {}; try { j = JSON.parse(out || '{}'); } catch {} for (const b of batch) { const v = j[b.p] ? Buffer.from(j[b.p], 'base64') : null; icons.set(key(b.p), v); b.cbs.forEach(f => f(v)); } if (iconWait.size) flushIcons(); };
  ps.on('close', done); ps.on('error', done); ps.stdin.end(JSON.stringify(batch.map(b => b.p)));
}
// network: TCP connections per process (netstat), with cached reverse DNS
const rdns = new Map();
function reverse(ip) {
  if (rdns.has(ip)) return rdns.get(ip); rdns.set(ip, null);
  if (/^(127\.|0\.|::1|::$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) { rdns.set(ip, 'local'); return 'local'; }
  require('dns').promises.reverse(ip).then(n => rdns.set(ip, n[0] || ''), () => rdns.set(ip, '')); return null;
}
// remote host name: system DNS cache (if permitted), domains the AI looks up (resolved here) or reverse DNS
const ipHost = new Map(), learned = new Set();
const hostOf = ip => ipHost.get(ip) || reverse(ip);
function learnHost(url) { let h; try { h = new URL(url).hostname; } catch { return; } if (!h || learned.has(h)) return; learned.add(h); if (learned.size > 2000) learned.clear();
  require('dns').promises.lookup(h, { all: true }).then(l => l.forEach(a => ipHost.set(a.address, h)), () => {}); }
setInterval(() => { if (WIN) ps('dns').then(r => (r || []).forEach(x => x.ip && ipHost.set(x.ip, x.n)), () => {}); if (ipHost.size > 20000) ipHost.clear(); }, 30000).unref();
let netCache = { t: 0, v: [] };
async function netConns() {
  if (Date.now() - netCache.t < 4000) return netCache.v;
  const v = [], split = a => { const i = a.lastIndexOf(':'); return [a.slice(0, i).replace(/^\[|\]$/g, ''), +a.slice(i + 1)]; };
  if (!WIN) { // Linux: ss; macOS (or no ss): lsof
    let out = await run('ss', ['-tanpH']);
    if (out) for (const l of out.split('\n')) { const p = l.trim().split(/\s+/); if (p.length < 5) continue; const [lip, lport] = split(p[3]), [rip, rport] = split(p[4]), pid = +((/pid=(\d+)/.exec(l) || [])[1] || 0);
      if (p[0] === 'LISTEN') v.push({ pid, state: 'escucha', lport, lip }); else if (p[0] === 'ESTAB') v.push({ pid, state: 'establecida', lport, rip, rport, host: hostOf(rip) }); }
    else { out = await run('lsof', ['-nP', '-iTCP']);
      for (const l of out.split('\n').slice(1)) { const m = /^\S+\s+(\d+)\s.*TCP\s+(\S+?)(?:->(\S+))?\s+\((\w+)\)/.exec(l); if (!m) continue; const pid = +m[1], [lip, lport] = split(m[2]);
        if (m[4] === 'LISTEN') v.push({ pid, state: 'escucha', lport, lip }); else if (m[4] === 'ESTABLISHED' && m[3]) { const [rip, rport] = split(m[3]); v.push({ pid, state: 'establecida', lport, rip, rport, host: hostOf(rip) }); } } }
    netCache = { t: Date.now(), v }; return v;
  }
  const out = await run('netstat', ['-ano', '-p', 'TCP']);
  for (const l of out.split('\n')) { const p = l.trim().split(/\s+/); if (p[0] !== 'TCP') continue;
    const [loc, rem, st, pid] = [p[1], p[2], p[3], +p[4]];
    const [lip, lport] = split(loc), [rip, rport] = split(rem);
    const listen = /^(LISTEN|ABH|ESCUCH|[ÉE]COUTE|IN ASCOLTO|NASŁUCH)/i.test(st || '') || (/^(0\.0\.0\.0|::|\*|\[::\])$/.test(rip) && !rport), estab = /^(ESTAB|HERGEST|[ÉE]TABL|STABIL|USTANOW)/i.test(st || '');
    if (listen) v.push({ pid, state: 'escucha', lport, lip });
    else if (estab) v.push({ pid, state: 'establecida', lport, rip, rport, host: hostOf(rip) });
  }
  netCache = { t: Date.now(), v }; return v;
}
const mask = s => String(s || '').replace(/((?:token|key|secret|password|passwd|pwd|auth|bearer)[\w-]*["']?\s*[=: ]\s*["']?)([^\s"']{4,})/gi, '$1***').slice(0, 400);
const SHELLS = /^(cmd|powershell|pwsh|bash|sh|zsh|fish|wsl|nu)(\.exe)?$/i, TERMS = /^(WindowsTerminal|OpenConsole|conhost|wezterm-gui|alacritty|kitty|Hyper|Tabby|Termius|iTerm2|Terminal)(\.exe)?$/i;
const APPS = /^(claude|Code|Cursor|Windsurf|Claude|chrome|msedge|firefox|Discord|Spotify|Slack|Teams|ms-teams|explorer|node|python|java|docker|Docker Desktop|blender|Photoshop|Illustrator)(\.exe)?$/i;
// --- Task manager (read-only): processes by section, network, open files, services, startup, users ---
const SYSNAMES = /^(System|Idle|Registry|Memory Compression|Secure System|smss|csrss|wininit|winlogon|services|lsass|LsaIso|svchost|fontdrvhost|dwm|sihost|taskhostw|ctfmon|spoolsv|WmiPrvSE|SearchIndexer|SearchProtocolHost|SearchFilterHost|MsMpEng|NisSrv|SecurityHealthService|SecurityHealthSystray|MpDefenderCoreService|audiodg|WUDFHost|dasHost|conhost|RuntimeBroker|dllhost|SgrmBroker|unsecapp|smartscreen|TextInputHost|ShellExperienceHost|StartMenuExperienceHost|SearchHost|LockApp|explorer|winlogon|AggregatorHost|wlanext|WmiApSrv)(\.exe)?$/i;
const taskX = { t: 0, v: null, busy: null }; let taskCache = { t: 0, v: null };
async function taskExtras() { // services, startup programs and sessions rarely change: read every 30 s
  if (taskX.v && Date.now() - taskX.t < 30000) return taskX.v; if (taskX.busy) return taskX.busy;
  taskX.busy = (async () => {
    let v = { svc: [], start: [], users: [], sched: [], fails: [] };
    if (WIN) v = await ps('tasks', {}, 25000).catch(() => v) || v;
    else if (process.platform === 'linux') { const out = await run('systemctl', ['list-units', '--type=service', '--all', '--no-legend', '--plain', '--no-pager']).catch(() => '');
      v.svc = String(out).split('\n').map(l => l.trim().split(/\s+/)).filter(p => p.length >= 4).map(p => ({ n: p[0].replace(/\.service$/, ''), d: p.slice(4).join(' '), s: p[3] === 'running' ? 'Running' : 'Stopped', m: p[2] })); }
    taskX.v = { svc: [].concat(v.svc || []), start: [].concat(v.start || []), users: [].concat(v.users || []), sched: [].concat(v.sched || []), fails: [].concat(v.fails || []) }; taskX.t = Date.now(); taskX.busy = null; return taskX.v; })();
  return taskX.busy;
}
async function tasks() {
  if (taskCache.v && Date.now() - taskCache.t < 4000) return taskCache.v;
  const [all, net, x] = await Promise.all([allProcs(), netConns(), taskExtras()]), sysRoot = key(process.env.SystemRoot || 'C:\\Windows') + path.sep;
  const conns = new Map(); for (const c of net) conns.set(c.pid, (conns.get(c.pid) || 0) + 1);
  const appN = new Set(all.filter(p => p.win).map(p => p.name));
  const sect = p => appN.has(p.name) ? 'apps' : (p.pid <= 4 || SYSNAMES.test(p.name) || (p.exe && key(p.exe).startsWith(sysRoot)) || (WIN && !p.exe) || (!WIN && (p.ppid === 2 || p.pid <= 2))) ? 'windows' : 'bg';
  const groups = new Map();
  for (const p of all) { if (WIN && p.pid === 0) continue; const sc = sect(p), k = sc + '|' + p.name; let g = groups.get(k);
    if (!g) groups.set(k, g = { s: sc, name: p.name, exe: p.exe, n: 0, pids: [], ws: 0, cpu: 0, io: 0, gpu: 0, net: 0, win: null });
    g.n++; if (g.pids.length < 40) g.pids.push(p.pid); g.ws += p.ws; g.cpu += p.cpu; g.gpu = Math.min(100, g.gpu + (p.gpu || 0)); g.io += p.rd + p.wr + p.ot; g.net += conns.get(p.pid) || 0; if (p.win && !g.win) g.win = p.win; if (!g.exe && p.exe) g.exe = p.exe; }
  const list = sc => [...groups.values()].filter(g => g.s === sc).sort((a, b) => b.ws - a.ws).slice(0, 160).map(({ s: _, ...g }) => ({ ...g, cpu: +g.cpu.toFixed(1), io: Math.round(g.io) }));
  const byPid = new Map(all.map(p => [p.pid, p])), hosts = new Map(); let est = 0, listen = 0;
  for (const c of net) { if (c.state === 'escucha') { listen++; continue; } est++; if (!c.rip || /^(127\.|::1$|0\.0\.0\.0)/.test(c.rip)) continue;
    const h = ipHost.get(c.rip) || (rdns.get(c.rip) || '') || c.rip; let e = hosts.get(h); if (!e) hosts.set(h, e = { host: h, ip: c.rip, n: 0, procs: [] }); e.n++; const p = byPid.get(c.pid); if (p && !e.procs.includes(p.name)) e.procs.push(p.name); }
  const seen = new Set(), files = []; for (let i = LIVE.ring.length - 1; i >= 0 && files.length < 24; i--) { const f = LIVE.ring[i], full = path.join(f.dir, f.file), k = key(full); if (seen.has(k)) continue; seen.add(k); files.push({ path: full, t: f.t, src: f.src }); }
  const sess = new Map(); for (const p of all) if (p.sess != null) { const e = sess.get(p.sess) || sess.set(p.sess, { id: p.sess, n: 0, ws: 0 }).get(p.sess); e.n++; e.ws += p.ws; }
  const uname = new Map((x.users || []).map(u => [u.id, u.u]));
  const users = [...sess.values()].map(e => ({ ...e, user: uname.get(e.id) || (e.id === 0 ? 'Servicios del sistema' : 'sesión ' + e.id) }));
  if (!users.length) users.push({ id: 0, n: all.length, ws: all.reduce((s, p) => s + p.ws, 0), user: os.userInfo().username });
  const io = all.reduce((a, p) => (a.rd += p.rd, a.wr += p.wr, a), { rd: 0, wr: 0 });
  taskCache = { t: Date.now(), v: { t: Date.now(), cores: os.cpus().length, procs: all.length, io, apps: list('apps'), bg: list('bg'), windows: list('windows'),
    net: { est, listen, hosts: [...hosts.values()].sort((a, b) => b.n - a.n).slice(0, 30) }, files, services: x.svc.slice(0, 400), startup: x.start.slice(0, 40), users, sched: x.sched.slice(0, 300), fails: x.fails.slice(0, 40), admin: ADMIN } };
  return taskCache.v;
}
const gitRun = (root, ...a) => run('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.preloadIndex=false', '-C', root, ...a], { env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } });
const metaCache = new Map();
async function cubeMeta(root) { // all read-only
  const k = key(root), mc = metaCache.get(k); if (mc && Date.now() - mc.t < 8000) return mc.v;
  const out = { deps: null, commits: [], net: [], open: [], procs: [] }, rd = f => fsp.readFile(path.join(root, f), 'utf8'), pair = l => { const m = /^([\w.@\/\-\[\]]+)\s*(.*)$/.exec(l.trim()); return m ? [m[1], m[2]] : [l.trim(), '']; };
  try { const pj = JSON.parse(await rd('package.json')); out.deps = { kind: 'npm', list: Object.entries(pj.dependencies || {}).map(([n, v]) => [n, String(v)]).slice(0, 40), dev: Object.keys(pj.devDependencies || {}).length }; } catch {}
  if (!out.deps) try { const t = await rd('requirements.txt'); out.deps = { kind: 'pip', list: t.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#')).slice(0, 40).map(pair) }; } catch {}
  if (!out.deps) try { const t = await rd('pyproject.toml'), m = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(t); if (m) out.deps = { kind: 'pyproject', list: [...m[1].matchAll(/"([^"]+)"/g)].slice(0, 40).map(x => pair(x[1])) }; } catch {}
  if (!out.deps) try { const t = await rd('Cargo.toml'), m = /\[dependencies\]([\s\S]*?)(\n\[|$)/.exec(t); if (m) out.deps = { kind: 'cargo', list: m[1].split('\n').map(l => /^\s*([\w-]+)\s*=\s*(.+)$/.exec(l)).filter(Boolean).slice(0, 40).map(x => [x[1], x[2].replace(/["{}]/g, '').slice(0, 40)]) }; } catch {}
  if (!out.deps) try { const t = await rd('go.mod'); out.deps = { kind: 'go', list: [...t.matchAll(/^\s*([\w.\-\/]+)\s+(v[\w.\-+]+)/gm)].slice(0, 40).map(x => [x[1], x[2]]) }; } catch {}
  if (fs.existsSync(path.join(root, '.git'))) { const log = await gitRun(root, 'log', '-8', '--format=%h|%ct|%an|%s'); out.commits = log.split('\n').filter(Boolean).map(l => { const [h, ct, an, ...m] = l.split('|'); return { h, t: +ct * 1000, a: an, s: m.join('|').slice(0, 90) }; }); }
  const [all, net] = await Promise.all([allProcs(), netConns()]), linked = all.filter(p => p.pid !== process.pid && (key(p.cmd).includes(k) || (p.exe && inside(p.exe, root))));
  out.procs = linked.sort((a, b) => b.ws - a.ws).slice(0, 10).map(p => ({ pid: p.pid, name: p.name, win: p.win, ws: p.ws, cpu: +p.cpu.toFixed(1) }));
  const pids = new Set(linked.map(p => p.pid)), hosts = new Map();
  for (const c of net) if (pids.has(c.pid)) { if (c.state === 'escucha') { if (out.net.length < 6) out.net.push({ listen: true, port: c.lport, pid: c.pid }); continue; } const h = ipHost.get(c.rip) || rdns.get(c.rip) || c.rip; const e = hosts.get(h) || hosts.set(h, { host: h, n: 0 }).get(h); e.n++; }
  out.net.push(...[...hosts.values()].sort((a, b) => b.n - a.n).slice(0, 8));
  const sc = scans.get(k), recent = sc && sc.data ? (sc.data.recent || []).slice(0, 12).map(f => path.join(root, f.rel)) : [];
  if (WIN && recent.length) { const r = await ps('who', { files: recent }, 8000).catch(() => []); for (const x of [].concat(r || [])) { const who = String(x.p || '').split('\n').filter(Boolean).map(l => { const [pid, ...nm] = l.split('|'); return { pid: +pid, name: nm.join('|') }; }).filter(w => w.pid !== process.pid); if (who.length) out.open.push({ file: path.relative(root, x.f), who }); } }
  metaCache.set(k, { t: Date.now(), v: out }); if (metaCache.size > 200) metaCache.delete(metaCache.keys().next().value); return out;
}
async function system(openG = new Set()) {
  const [all, net] = await Promise.all([allProcs(), netConns()]), by = new Map(all.map(p => [p.pid, p])), kids = new Map();
  for (const p of all) if (by.has(p.ppid) && p.ppid !== p.pid) (kids.get(p.ppid) || kids.set(p.ppid, []).get(p.ppid)).push(p.pid);
  const conns = new Map(); for (const c of net) (conns.get(c.pid) || conns.set(c.pid, []).get(c.pid)).push(c);
  const kindP = p => /^claude(\.exe)?$/.test(p.name) && !/WindowsApps/i.test(p.exe || '') ? 'claude' : /^Claude(\.exe)?$/.test(p.name) ? 'claude-app' : /^(Code|Cursor|Windsurf)(\.exe)?$/i.test(p.name) ? 'editor'
    : TERMS.test(p.name) ? 'terminal' : SHELLS.test(p.name) ? 'shell' : /^node(\.exe)?$/i.test(p.name) ? 'node' : p.win ? 'app' : 'proc';
  // roots: windows, terminals, Claude sessions and editors whose parent isn't the same program
  const NOISE = /^(conhost|TextInputHost|ShellExperienceHost|SearchHost|StartMenuExperienceHost|LockApp|SystemSettingsBroker|dllhost|RuntimeBroker|backgroundTaskHost)(.exe)?$/i;
  const isRoot = p => { if (NOISE.test(p.name)) return false; const k = kindP(p), par = by.get(p.ppid); if (!['app', 'terminal', 'claude', 'claude-app', 'editor'].includes(k) && !(p.win) && !(!WIN && (p.ppid <= 1 || !par) && p.ws > 30e6)) return false; return !par || par.name !== p.name || k === 'claude'; };
  const rootsL = all.filter(p => p.pid > 4 && isRoot(p) && !(kindP(p) === 'claude' && by.get(p.ppid) && kindP(by.get(p.ppid)) === 'claude'));
  const used = new Set(), out = [];
  const node = (p, depth) => {
    used.add(p.pid); const n = { pid: p.pid, ppid: p.ppid, name: p.name, exe: p.exe, kind: kindP(p), win: p.win, cmd: mask(p.cmd), ws: p.ws, cpu: +p.cpu.toFixed(1), io: Math.round(p.rd + p.wr + p.ot), net: conns.get(p.pid) || [], kids: [] };
    if (n.kind === 'claude') { const desc = [], st = [p.pid]; while (st.length && desc.length < 60) for (const i of kids.get(st.pop()) || []) { desc.push(by.get(i).cmd); st.push(i); }
      const m = /\.claude(-[\w]+)?[\\/](shell-snapshots|projects)/.exec(desc.join(' ') + ' ' + p.cmd); n.account = m ? (m[1] ? m[1].slice(1) : 'principal') : null;
      if (!n.account) { for (let a = by.get(p.ppid), k = 0; a && k < 5; a = by.get(a.ppid), k++) { const b = /claude-cuentas\.bat"?\s+(\S+)|CLAUDE_CONFIG_DIR=\S*\.claude-([\w]+)/i.exec(a.cmd); if (b) { const acc = b[2] || b[1]; n.account = fs.existsSync(path.join(os.homedir(), '.claude-' + acc)) ? acc : 'principal'; break; } } } }
    if (depth >= 5) return n;
    const ch = (kids.get(p.pid) || []).map(i => by.get(i)).filter(c => c && !used.has(c.pid) && !/^conhost(.exe)?$/i.test(c.name) && !(isRoot(c) && kindP(c) !== 'shell' && kindP(c) !== 'claude' && c.win));
    const groups = new Map(); for (const c of ch) (groups.get(c.name) || groups.set(c.name, []).get(c.name)).push(c);
    for (const [nm, g] of groups) {
      if (g.length > 2 && !SHELLS.test(nm) && !/^claude/i.test(nm) && !openG.has('g' + p.pid + nm)) { g.forEach(c => used.add(c.pid)); const sum = f => g.reduce((s, c) => s + c[f], 0);
        n.kids.push({ pid: 'g' + p.pid + nm, name: nm, exe: g[0].exe, kind: 'group', count: g.length, ws: sum('ws'), cpu: +sum('cpu').toFixed(1), io: Math.round(sum('rd') + sum('wr') + sum('ot')), net: g.flatMap(c => conns.get(c.pid) || []), kids: [], cmd: mask(g[0].cmd) }); }
      else for (const c of g.slice(0, openG.has('g' + p.pid + nm) ? 40 : 16)) { const k = node(c, depth + 1); if (openG.has('g' + p.pid + nm)) k.group = 'g' + p.pid + nm; n.kids.push(k); }
    }
    return n;
  };
  for (const r of rootsL.sort((a, b) => b.ws - a.ws)) if (!used.has(r.pid)) out.push(node(r, 0));
  // listening servers that hang from no root
  const srv = [...new Set(net.filter(c => c.state === 'escucha' && !used.has(c.pid) && c.pid > 4).map(c => c.pid))].map(i => by.get(i)).filter(Boolean).slice(0, 24).map(p => node(p, 4));
  if (srv.length) out.push({ pid: 'servicios', name: 'Servicios en escucha', kind: 'group-root', ws: srv.reduce((s, x) => s + x.ws, 0), cpu: 0, io: 0, net: [], kids: srv, cmd: '' });
  for (const c of net) if (c.rip && rdns.get(c.rip)) c.host = rdns.get(c.rip);
  return { t: Date.now(), procs: all.length, conns: net.length, roots: out.slice(0, 48) };
}

// --- Client bundle ---
// The client is one ES module split into ordered files (public/js/NN-*.js) that share a single scope.
// They are concatenated on request, with a line-level source map so devtools shows the original files. No build step.
let bundle = null;
function clientBundle() {
  const dir = path.join(__dirname, 'public', 'js'), files = fs.readdirSync(dir).filter(n => /^\d\d-.*\.js$/.test(n)).sort();
  const stamp = files.map(n => n + ':' + fs.statSync(path.join(dir, n)).mtimeMs).join('|');
  if (bundle && bundle.stamp === stamp) return bundle;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const vlq = n => { let v = n < 0 ? (-n << 1) | 1 : n << 1, o = ''; do { let d = v & 31; v >>>= 5; if (v) d |= 32; o += B64[d]; } while (v); return o; };
  const code = [], maps = [], contents = []; let ps = 0, pl = 0;
  files.forEach((n, si) => { const txt = fs.readFileSync(path.join(dir, n), 'utf8').replace(/\n$/, ''); contents.push(txt);
    txt.split('\n').forEach((line, li) => { code.push(line); maps.push('A' + vlq(si - ps) + vlq(li - pl) + 'A'); ps = si; pl = li; }); });
  const map = JSON.stringify({ version: 3, file: 'app.js', sources: files.map(n => 'js/' + n), sourcesContent: contents, names: [], mappings: maps.join(';') });
  return bundle = { stamp, code: code.join('\n') + '\n//# sourceMappingURL=/app.js.map\n', map };
}

// --- Native layer: persistent Windows helper (pshost.ps1) ---
let psh = null, pshId = 0; const pshWait = new Map();
function psHost() {
  if (!WIN) return null; if (psh) return psh;
  // loaded from the file (UTF-8): passed inline it would exceed Windows' 32,767-character command-line limit
  const boot = "& ([scriptblock]::Create([IO.File]::ReadAllText('" + path.join(__dirname, 'pshost.ps1').replace(/'/g, "''") + "', [Text.Encoding]::UTF8)))", enc = Buffer.from(boot, 'utf16le').toString('base64');
  const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { windowsHide: true }); let buf = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); let j; try { j = JSON.parse(l); } catch { continue; }
    const w = pshWait.get(j.id); if (w) { pshWait.delete(j.id); clearTimeout(w.t); j.e ? w.ko(new Error(j.e)) : w.ok(j.r); } } });
  p.stderr.on('data', () => {}); p.on('error', () => { psh = null; });
  p.on('exit', () => { psh = null; for (const w of pshWait.values()) w.ko(new Error('ayudante nativo cerrado')); pshWait.clear(); });
  return psh = p;
}
function ps(op, args = {}, timeout = 10000) {
  const p = psHost(); if (!p) return Promise.reject(new Error('solo en Windows'));
  return new Promise((ok, ko) => { const id = ++pshId, t = setTimeout(() => { pshWait.delete(id); ko(new Error('sin respuesta del ayudante nativo')); }, timeout); t.unref(); pshWait.set(id, { ok, ko, t }); p.stdin.write(JSON.stringify({ id, op, ...args }) + '\n'); });
}
// who has a file open right now (Windows: Restart Manager, no admin needed; macOS/Linux: lsof)
const SHOTS = new Map(), INUSE = new Map(); // per-program thumbnails and per-folder open files (short-lived caches)
async function lockers(pIn) {
  const p = safePath(pIn);
  if (WIN) { const r = await ps('who', { files: [p] }); return String((r && r[0] && r[0].p) || '').split('\n').filter(Boolean).map(l => { const [pid, ...nm] = l.split('|'); return { pid: +pid, name: nm.join('|') }; }); }
  const out = await run('lsof', ['-Fpc', '--', p]), r = []; let cur = null;
  for (const l of out.split('\n')) { if (l[0] === 'p') r.push(cur = { pid: +l.slice(1) }); else if (l[0] === 'c' && cur) cur.name = l.slice(1); } return r;
}
// likely author of a write: whoever has the file open, otherwise whoever writes and names that path (max 4 lookups/s)
const authB = { s: 0, n: 0 };
async function authorOf(abs) {
  const sec = Date.now() / 1000 | 0; if (authB.s !== sec) { authB.s = sec; authB.n = 0; } if (++authB.n > 4) return null;
  try { const l = (await lockers(abs)).filter(x => x.pid !== process.pid); if (l.length) return l.map(x => x.name + ' #' + x.pid).join(', '); } catch {}
  let best = null; for (const p of procCache.list) if (p.wr > 0 && p.pid !== process.pid) { for (const c of ws.cubes.values()) if (inside(abs, c.path) && key(p.cmd).includes(key(c.path)) && (!best || p.wr > best.wr)) best = p; }
  return best ? 'probable: ' + best.name + ' #' + best.pid : null;
}
// process detail: memory, threads, loaded modules (what it holds in RAM) and, outside Windows, open files
async function procDetail(pidIn) {
  const pid = +pidIn; if (!Number.isInteger(pid) || pid <= 0) throw new Error('PID no válido'); // "abc" would parse as 0: the System Idle Process
  const net = (await netConns()).filter(c => c.pid === pid); let d = {};
  if (WIN) { try { d = await ps('proc', { pid }); } catch (e) { d = { err: e.message }; } }
  else if (process.platform === 'linux') { try { const st = await fsp.readFile('/proc/' + pid + '/status', 'utf8'); d.threads = +(/Threads:\s+(\d+)/.exec(st) || [])[1]; d.priv = (+(/RssAnon:\s+(\d+)/.exec(st) || [])[1] || 0) * 1024;
    const maps = await fsp.readFile('/proc/' + pid + '/maps', 'utf8'), seen = new Map();
    for (const l of maps.split('\n')) { const m = /^([0-9a-f]+)-([0-9a-f]+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(\/.+)$/.exec(l); if (m) seen.set(m[3], (seen.get(m[3]) || 0) + parseInt(m[2], 16) - parseInt(m[1], 16)); }
    d.modules = [...seen].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([f, sz]) => ({ n: path.basename(f), f, s: sz })); } catch (e) { d.err = e.message; } }
  if (!WIN) { const out = await run('lsof', ['-Fn', '-p', String(pid)]); d.files = [...new Set(out.split('\n').filter(l => l[0] === 'n' && l[1] === '/').map(l => l.slice(1)))].slice(0, 80); }
  return { pid, ...d, net };
}
// follow a process: snapshot of its tree, connections, modules (Windows) or open files (macOS/Linux). Read-only.
const followMods = new Map();
async function follow(pidIn) {
  const pid = +pidIn, all = await allProcs(), root = all.find(p => p.pid === pid); if (!root) return { pid, gone: true };
  const kids = new Map(); for (const p of all) if (p.pid !== p.ppid) (kids.get(p.ppid) || kids.set(p.ppid, []).get(p.ppid)).push(p);
  const tree = [], st = [root]; while (st.length && tree.length < 200) { const p = st.pop(); tree.push(p); for (const c of kids.get(p.pid) || []) st.push(c); }
  const pids = new Set(tree.map(p => p.pid)), net = (await netConns()).filter(c => pids.has(c.pid));
  let modules = null; if (WIN) { const c = followMods.get(pid); if (c && Date.now() - c.t < 10000) modules = c.v; else { try { modules = ((await ps('proc', { pid })).modules || []).map(m => m.n); followMods.set(pid, { t: Date.now(), v: modules }); if (followMods.size > 50) followMods.clear(); } catch {} } }
  let files = null; if (!WIN) { const out = await run('lsof', ['-Fn', '-p', [...pids].slice(0, 40).join(',')]); files = [...new Set(out.split('\n').filter(l => l[0] === 'n' && l[1] === '/').map(l => l.slice(1)))].slice(0, 300); }
  return { pid, t: Date.now(), procs: tree.map(p => ({ pid: p.pid, ppid: p.ppid, name: p.name, cmd: mask(p.cmd).slice(0, 200), ws: p.ws, cpu: +p.cpu.toFixed(1), io: Math.round(p.rd + p.wr + p.ot) })), net, modules, files };
}
// scenes: what's open (cubes, objects, camera, space) saved by name in ~/.prisma/escenas.json
const SCENES = path.join(SIMDIR, 'escenas.json');
async function scenes() { try { return JSON.parse(await fsp.readFile(SCENES, 'utf8')); } catch { return {}; } }
async function sceneOp(b, by) {
  const all = await scenes(), name = String(b.name || '').trim().slice(0, 60); if (!name && b.action !== 'list') throw new Error('Falta el nombre');
  if (b.action === 'save') { all[name] = { cubes: ws.cubes.size ? [...ws.cubes.values()].map(c => c.path) : [], layout: ws.layout, focus: ws.focus, ...(b.data || {}), at: Date.now() };
    await fsp.mkdir(SIMDIR, { recursive: true }); await fsp.writeFile(SCENES, JSON.stringify(all, null, 1)); log(by, 'guarda escena', name); return all; }
  if (b.action === 'delete') { delete all[name]; await fsp.writeFile(SCENES, JSON.stringify(all, null, 1)); return all; }
  if (b.action === 'apply') { const sc = all[name]; if (!sc) throw new Error('No existe la escena ' + name); useSpace(newSpace(name).id);
    for (const c of (sc.cubes || []).slice().sort((x, y) => x.length - y.length)) { try { const p = await checkDir(c); let parent = null;
      for (const o of ws.cubes.values()) if (inside(p, o.path) && key(p) !== key(o.path) && (!parent || o.path.length > parent.length)) parent = o.path; addCube(p, parent, by); } catch {} }
    if (sc.layout) ws.layout = sc.layout; ws.focus = sc.focus && ws.cubes.has(key(sc.focus)) ? sc.focus : null; ws.focusRev++; syncWatchers(); log(by, 'carga escena', name); send(state()); return sc; }
  return all;
}
// index: folders created after indexing trigger a background reindex (small trees after 20 s; huge ones at most every 15 min)
const reixT = new Map();
function ixNewDir(abs) {
  for (const e of indexes.values()) { if (e.state !== 'done' || !inside(abs, e.root) || ixLookup(e, abs) != null || reixT.has(key(e.root))) continue;
    const wait = Math.max(5000, (e.dirs > 300000 ? 15 * 60000 : 20000) - (Date.now() - (e.lastRe || e.at)));
    const t = setTimeout(() => { reixT.delete(key(e.root)); e.lastRe = Date.now(); startIndex(e.root, 'auto'); }, wait); t.unref(); reixT.set(key(e.root), t); }
}

// --- Live engine: what is being touched on this machine right now (read-only) ---
// Sources: disk activity on every drive, what AIs touch, open programs (and paths in their command lines),
// downloads and Windows recent items. Grouped by project root and turned into cubes.
const LIVE = { fg: null, allMap: new Map(), mem: [], ring: [], dirs: new Map(), procs: [], drives: new Map(), stale: new Map(), hidden: new Map(), budget: { s: 0, n: 0 }, aiSeen: new Set(), on: !flags.noLive };
const LIVE_IGNORE = /[\\/](\$recycle\.bin|system volume information|config\.msi|windows[\\/](winsxs|servicing|prefetch|temp|logs|softwaredistribution|system32[\\/](winevt|logfiles|wdi|sru|tasks))|programdata[\\/](microsoft[\\/](windows[\\/](wer|caches)|diagnosis|search)|nvidia)|appdata[\\/]local[\\/](temp|packages|microsoft[\\/]windows[\\/](inetcache|explorer|webcache|notifications)|crashdumps|d3dscache)|[^\\/]*cache[^\\/]*|\.git[\\/](objects|logs)|node_modules[\\/]\.(cache|vite)|\.prisma|microsoft[\\/]windows[\\/]recent|windows[\\/]microsoft\.net|sentry|crashpad|logs?|user data[\\/][^\\/]+[\\/](network|sessions|session storage|local storage|indexeddb|service worker|shared proto db|segmentation platform|feature engagement tracker|sync data|extension state|blob_storage))([\\/]|$)/i;
const HALF = 20000; // live: activity loses half its weight every 20 s (what is happening now, not what happened)
function liveTouch(dir, src, file, w = 1) {
  if (!dir || LIVE_IGNORE.test(dir + path.sep)) return; const k = key(dir), now = Date.now(); let d = LIVE.dirs.get(k);
  if (!d) { if (LIVE.dirs.size > 6000) liveGc(); LIVE.dirs.set(k, d = { path: dir, score: 0, t: now, src: {}, files: [] }); }
  d.score = d.score * Math.exp(-(now - d.t) / HALF) + w; d.t = now; d.src[src] = now;
  if (file && d.files[0] !== file) d.files = [file, ...d.files.filter(f => f !== file)].slice(0, 6);
  if (file) { LIVE.ring.push({ t: now, dir, file, src }); if (LIVE.ring.length > 120) LIVE.ring.splice(0, 40); }
}
function liveGc() { const now = Date.now(); for (const [k, d] of LIVE.dirs) if (d.score * Math.exp(-(now - d.t) / HALF) < .05) LIVE.dirs.delete(k); }
async function liveWatch() { // one recursive watcher per drive (Windows/macOS); on Linux, the home folder
  const list = WIN ? (await roots()).filter(r => r.kind === 'drive').map(r => r.path) : [os.homedir()];
  for (const r of list) { if (LIVE.drives.has(key(r))) continue;
    try { const w = fs.watch(r, { recursive: WIN || process.platform === 'darwin' }, (type, fn) => {
        if (!fn) return; const sec = Date.now() / 1000 | 0, b = LIVE.budget; if (b.s !== sec) { b.s = sec; b.n = 0; } if (++b.n > 600) return;
        const abs = path.join(r, String(fn)); liveTouch(path.dirname(abs), 'disco', path.basename(abs), type === 'rename' ? 1.5 : 1); });
      w.on('error', () => LIVE.drives.delete(key(r))); LIVE.drives.set(key(r), w); } catch {} }
}
async function liveCollect() {
  const all = await allProcs(), now = Date.now();
  for (const p of all) {
    if (p.win && p.exe) liveTouch(path.dirname(p.exe), 'programa', path.basename(p.exe), .6);
    const m = (p.cmd || '').match(/[A-Za-z]:\\[^"*?<>|\r\n]+?(?=["\s]|$)/g); // paths in command lines: scripts and working folders
    if (m) for (const x of m.slice(0, 3)) { const dir = /\.[a-z0-9]{1,5}$/i.test(x) ? path.dirname(x) : x; if (!/\\(Windows|Program Files( \(x86\))?|ProgramData)\\/i.test(dir + '\\')) liveTouch(dir, 'programa', path.basename(x), .4); }
  }
  const dl = path.join(os.homedir(), 'Downloads');
  try { for (const n of (await fsp.readdir(dl)).slice(0, 400)) { try { const st = await fsp.stat(path.join(dl, n)); if (now - st.mtimeMs < 120000) liveTouch(dl, 'descarga', n, .5); /* downloading now */ } catch {} } } catch {}
  // (Windows recent items are days-old history: kept out of Live)
  try { for (const s of (await pulse()).sessions) for (const e of s.trace) if (e.abs && e.t && !LIVE.aiSeen.has(e.t + e.abs)) { LIVE.aiSeen.add(e.t + e.abs); const age = now - e.t; if (age < 60000) liveTouch(e.dir ? e.abs : path.dirname(e.abs), 'ia', path.basename(e.abs), 3 * Math.exp(-age / HALF)); } } catch {}
  if (LIVE.aiSeen.size > 5000) LIVE.aiSeen.clear();
  // the visual task manager: the most active processes (CPU + I/O)
  LIVE.allMap = new Map(all.map(p => [p.pid, p]));
  LIVE.procs = all.filter(p => p.pid > 4 && !/^(System|Idle|Registry|Memory Compression|Secure System)$/i.test(p.name)).map(p => ({ p, act: p.cpu + (p.rd + p.wr + p.ot) / 2e5 + (p.win ? 2 : 0) }))
    .sort((a, b) => (LIVE.fg && b.p.pid === LIVE.fg.pid) - (LIVE.fg && a.p.pid === LIVE.fg.pid) || !!b.p.win - !!a.p.win || b.act - a.act).filter((x, i) => x.p.win || i < 18).slice(0, 40).map(({ p }) => ({ /* every program with an open window is in the room; of the rest, the most active */ fg: !!(LIVE.fg && p.pid === LIVE.fg.pid), /* the foreground one is always included */ pid: p.pid, name: p.name, exe: p.exe, win: p.win, cpu: +p.cpu.toFixed(1), ws: p.ws, gpu: p.gpu || 0, io: Math.round(p.rd + p.wr + p.ot), claude: /^claude(\.exe)?$/i.test(p.name), cmd: mask(p.cmd).slice(0, 160), links: [] }));
}
const projMark = new Map(), PROJ = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', '.claude', 'CLAUDE.md'];
function isProject(dir) { const k = key(dir); if (projMark.has(k)) return projMark.get(k); const v = PROJ.some(m => fs.existsSync(path.join(dir, m))); if (projMark.size > 20000) projMark.clear(); projMark.set(k, v); return v; }
function anchorOf(dir) { // the home folder and a drive root are never a "project": they would swallow everything
  { const kd = key(dir); if (kd === key(os.homedir()) || kd === key(path.parse(dir).root)) return null; }
  return anchorOf0(dir); }
function anchorOf0(dir) { // project root containing the folder; failing that, the program's folder (AppData, Program Files) or the folder itself
  const app = /^(.*?[\/](?:appdata[\/](?:local|roaming|locallow)(?:[\/]programs)?|program files(?: (x86))?|programdata)[\/][^\/]+)/i.exec(dir); if (app && !isProject(dir)) { let q = dir; for (let i = 0; i < 6 && q.length > app[1].length; i++) { if (isProject(q)) return q; q = path.dirname(q); } return app[1]; }
  let p = dir; const home = key(os.homedir());
  for (let i = 0; i < 8; i++) { if (isProject(p)) return p; const up = path.dirname(p); if (up === p || key(up) === home || key(up) === key(path.parse(p).root)) break; p = up; }
  return dir;
}
function liveBuild() {
  const sp = spaces.get('vivo'), now = Date.now(), act = [];
  for (const d of LIVE.dirs.values()) { const s = d.score * Math.exp(-(now - d.t) / HALF); if (s > .3 && now - d.t < 8000) act.push([d, s]); } /* live: only what was touched in the last 8 s */
  act.sort((a, b) => b[1] - a[1]); const groups = new Map();
  for (const [d, s] of act.slice(0, 120)) {
    if (!fs.existsSync(d.path)) continue; const a = anchorOf(d.path); if (!a) continue; const k = key(a); let g = groups.get(k);
    if (!g) groups.set(k, g = { path: a, score: 0, src: {}, files: [], kids: new Map() });
    g.score += s; for (const [x, t] of Object.entries(d.src)) g.src[x] = Math.max(g.src[x] || 0, t);
    g.files.push(...d.files.slice(0, 3).map(f => path.relative(a, path.join(d.path, f))));
    if (key(d.path) !== k) { const first = path.join(a, path.relative(a, d.path).split(path.sep)[0]), kk = key(first), o = g.kids.get(kk); g.kids.set(kk, { path: first, score: (o ? o.score : 0) + s, src: { ...(o ? o.src : {}), ...d.src } }); }
  }
  const want = new Map(); let fresh = 0;
  for (const g of [...groups.values()].sort((a, b) => b.score - a.score).slice(0, 24)) { /* up to 24 activity hotspots at once */
    if ((LIVE.hidden.get(key(g.path)) || 0) > now) continue;
    if (!sp.cubes.has(key(g.path)) && (g.score < 1.5 || ++fresh > 3)) continue; // entering takes more activity than staying (hysteresis), and at most 3 newcomers per cycle
    want.set(key(g.path), { path: g.path, live: { score: +g.score.toFixed(1), src: g.src, last: Math.max(0, ...Object.values(g.src)), files: [...new Set(g.files)].slice(0, 6) } });
    for (const c of [...g.kids.values()].sort((a, b) => b.score - a.score).slice(0, 4)) if (fs.existsSync(c.path) && (sp.cubes.has(key(c.path)) || c.score > .8)) want.set(key(c.path), { path: c.path, live: { score: +c.score.toFixed(1), src: c.src, last: Math.max(0, ...Object.values(c.src)), files: [] } });
  }
  let changed = false;
  for (const [k, w] of want) { const c = sp.cubes.get(k); LIVE.stale.delete(k); w.live.since = (c && c.live && c.live.since) || now; LIVE.mem = LIVE.mem.filter(m => key(m.path) !== k);
    if (!c) { if (sp.cubes.size >= LIVE_MAX) break; sp.cubes.set(k, { path: w.path, name: path.basename(w.path) || w.path, parent: null, by: 'vivo', live: w.live }); changed = true; } else c.live = w.live; }
  for (const [k, c] of sp.cubes) if (!want.has(k) && c.by === 'vivo' && !(LIVE.hold === k && now - LIVE.holdT < 600000)) { const t = LIVE.stale.get(k) || now; /* the current selection never fades out */ LIVE.stale.set(k, t); if (now - t > 8000) { sp.cubes.delete(k); LIVE.stale.delete(k); changed = true; if (!c.parent) { LIVE.mem = [{ path: c.path, name: c.name, t: now, last: (c.live && c.live.last) || t, since: c.live && c.live.since }, ...LIVE.mem.filter(m => key(m.path) !== k)].slice(0, 18); } } else if (c.live) { c.live.fading = true; c.live.leaveAt = t + 8000; } }
  for (const c of sp.cubes.values()) { let par = null; for (const o of sp.cubes.values()) if (o !== c && inside(c.path, o.path) && key(c.path) !== key(o.path) && (!par || o.path.length > par.length)) par = o.path; c.parent = par; }
  for (const p of LIVE.procs) p.links = [...sp.cubes.values()].filter(c => !c.parent && ((p.cmd && key(p.cmd).includes(key(c.path))) || (p.exe && inside(p.exe, c.path)) || (p.claude && c.live && c.live.src.ia && now - c.live.src.ia < 180000))).map(c => c.path).slice(0, 4);
  if (curSpace === 'vivo') { if (changed) syncWatchers(); send({ ...state(), quiet: true }); }
}
// foreground: which program is in front and its window title (Chrome tab, Discord channel, terminal…)
async function pollFg() { if (!WIN || flags.demo || !clients.size) return; let r; try { r = await ps('fg', {}, 3000); } catch { return; } if (!r) return;
  const q = String(r).split('\u001f'), pid = +q[0], cx = +q[2], cy = +q[3], cpid = +q[4], ctitle = (q[5] || '').replace(/^[\u2580-\u27BF\u2800-\u28FF*·•\s]+/, ''), title = (q[1] || '').replace(/^[▀-➿⠀-⣿*·•\s]+/, ''); /* strip the terminals' animated spinner (◐ ◑ ✳ ⠋), which would otherwise change every tenth of a second */ const cp = LIVE.allMap.get(cpid) || {}, cur = { x: cx, y: cy, pid: cpid, title: ctitle, name: cp.name || '' };
  if (LIVE.fg && LIVE.fg.pid === pid && LIVE.fg.title === title && LIVE.fg.cur && LIVE.fg.cur.pid === cpid && LIVE.fg.cur.title === ctitle && Math.hypot(LIVE.fg.cur.x - cx, LIVE.fg.cur.y - cy) < 4) return;
  const p = LIVE.allMap.get(pid) || {}; const same = LIVE.fg && LIVE.fg.pid === pid && LIVE.fg.title === title; LIVE.fg = { pid, title, name: p.name || '', exe: p.exe || '', t: same ? LIVE.fg.t : Date.now(), cur }; send({ k: 'fg', ...LIVE.fg }); }
if (WIN) setInterval(() => pollFg().catch(() => {}), 450).unref();
if (LIVE.on) { setTimeout(() => { liveWatch().catch(() => {}); liveCollect().then(liveBuild, () => {}); }, 300); setInterval(() => liveCollect().catch(() => {}), 3000).unref(); setInterval(liveBuild, 1000).unref(); } // processes and sources every 3 s, the room every 1 s

function spaceOp(b, by) {
  if (b.action === 'new') { const sp = newSpace(b.name); if (b.snapshot) for (const c of spaces.get('vivo').cubes.values()) sp.cubes.set(key(c.path), { path: c.path, name: c.name, parent: c.parent, by: 'usuario' }); useSpace(sp.id); log(by, 'nuevo espacio', sp.name); return state(); }
  if (b.action === 'switch') { useSpace(String(b.id)); return state(); }
  if (b.action === 'close') { if (b.id === 'vivo') throw new Error('«En vivo» no se puede cerrar'); spaces.delete(String(b.id)); if (curSpace === b.id) useSpace('vivo'); else send(state()); return state(); }
  if (b.action === 'rename') { const sp = spaces.get(String(b.id)); if (!sp || sp.auto) throw new Error('No se puede renombrar'); sp.name = String(b.name || sp.name).slice(0, 40); send(state()); return state(); }
  throw new Error('acción: new | switch | close | rename');
}

// several folders at once: a new (or the current) space; cubes arrive one by one and the layout places them
let manyBusy = false;
async function openMany(b, by) {
  const list = [...new Set((Array.isArray(b.paths) ? b.paths : []).map(x => String(x || '').trim().replace(/^"|"$/g, '')).filter(Boolean))].slice(0, MAX_CUBES);
  if (!list.length) throw new Error('No hay carpetas');
  const ok = []; for (const p of list) { try { ok.push(await checkDir(p)); } catch (e) { log(by, 'no se puede abrir', p); } }
  if (!ok.length) throw new Error('Ninguna de esas rutas es una carpeta accesible');
  if (b.space === 'new' || ws.auto) useSpace(newSpace(ok.length === 1 ? path.basename(ok[0]) || ok[0] : (b.name || ok.length + ' carpetas')).id);
  manyBusy = true; const sp = ws;
  (async () => { try { for (const p of ok) { if (ws !== sp) break; try { await openCube(p, { here: true, quiet: true, by }); } catch (e) { log(by, e.message, p); break; } await new Promise(r => setTimeout(r, Math.min(260, 8000 / ok.length))); }
    if (ws === sp) send({ k: 'fit' }); } finally { manyBusy = false; } })();
  return { n: ok.length, space: sp.id };
}
// Recursive tree (like `tree`, but each folder is a lightweight cube): folders only, level by level, with a node cap.
// With an index it is instant with complete sizes; without one the disk is read under a time limit and sizes are partial.
// Node: { n, b, f, d, own, k, t, skip, part, c? } (no c = not loaded; heavy folders like node_modules don't auto-expand)
async function tree(pIn, depthIn, maxIn) {
  const root = await checkDir(pIn), D = Math.max(1, Math.min(12, +depthIn || 3)), MAX = Math.max(50, Math.min(20000, +maxIn || 4000)), t0 = Date.now(); let count = 1, trunc = false;
  const heavy = name => SKIP.has(name) || name.startsWith('$');
  const hit = ixFind(root);
  if (hit) { const { ix } = hit;
    const mk = (j, name) => ({ n: name, b: ix.tot[j * 3 + 1], f: ix.tot[j * 3], d: ix.tot[j * 3 + 2], own: [0, 1, 2, 3, 4, 5, 6, 7, 8].reduce((a, q) => a + ix.stats[j * 18 + q * 2], 0), k: ix.kstart[j + 1] - ix.kstart[j], t: ix.newest[j] || 0, skip: heavy(name) });
    const top = mk(hit.i, path.basename(root) || root); top.skip = false;
    let level = [[top, hit.i]];
    for (let d = 0; d < D && level.length; d++) { const next = [];
      for (const [nd, j] of level) { if (nd.skip) continue; const room = MAX - count; if (room <= 0) { trunc = true; continue; }
        let ks = []; for (let q = ix.kstart[j]; q < ix.kstart[j + 1]; q++) ks.push(ix.kids[q]); ks.sort((a, b) => ix.tot[b * 3 + 1] - ix.tot[a * 3 + 1]); if (ks.length > room) { ks = ks.slice(0, room); nd.more = nd.k - room; trunc = true; } // heaviest first
        nd.c = ks.map(q => { const ch = mk(q, ix.names[q]); next.push([ch, q]); return ch; }); count += ks.length; }
      level = next; }
    // the index is a snapshot: expanded folders are checked against disk (deleted entries dropped, new ones added without size)
    if (count <= 3000) { const fix = async (nd, p) => { if (!nd.c) return; let ents; try { ents = await fsp.readdir(p, { withFileTypes: true }); } catch { return; }
        const real = new Map(ents.filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => [key(e.name), e.name])), had = new Set(nd.c.map(c => key(c.n)));
        nd.c = nd.c.filter(c => real.has(key(c.n))); for (const [k, n] of real) if (!had.has(k)) nd.c.push({ n, b: null, f: null, d: null, own: 0, k: 0, t: 0, skip: heavy(n), part: true }); nd.k = nd.c.length;
        await Promise.all(nd.c.map(c => fix(c, path.join(p, c.n)))); };
      await fix(top, root); }
    return { root, src: 'indice', node: top, count, truncated: trunc, ms: Date.now() - t0 };
  }
  const BUDGET = 3500, top = { n: path.basename(root) || root, b: 0, f: 0, d: 0, own: 0, k: 0, t: 0, skip: false, part: false };
  const read = async (p, nd, want) => { let ents; try { ents = await fsp.readdir(p, { withFileTypes: true }); } catch { nd.part = true; return []; }
    const files = ents.filter(e => e.isFile()), dirs = ents.filter(e => e.isDirectory() && !e.isSymbolicLink()); nd.own = files.length; nd.k = dirs.length;
    if (Date.now() - t0 < BUDGET * .6 && files.length < 4000) await Promise.all(files.map(e => fsp.stat(path.join(p, e.name)).then(st => { nd.b += st.size; if (st.mtimeMs > nd.t) nd.t = st.mtimeMs; }, () => {})));
    else if (files.length) nd.part = true;
    return want ? dirs.map(e => e.name) : []; };
  let level = [[top, root]];
  for (let d = 0; d <= D && level.length; d++) { const next = [];
    for (let i = 0; i < level.length; i += 16) { const chunk = level.slice(i, i + 16);
      await Promise.all(chunk.map(async ([nd, p]) => {
        if (Date.now() - t0 > BUDGET) { nd.part = true; trunc = true; return; }
        const subs = await read(p, nd, d < D && !nd.skip);
        if (!subs.length) return; const room = MAX - count; if (room <= 0) { trunc = true; nd.part = true; return; } if (subs.length > room) { nd.more = subs.length - room; subs.length = room; trunc = true; nd.part = true; }
        subs.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        nd.c = subs.map(name => { const ch = { n: name, b: 0, f: 0, d: 0, own: 0, k: 0, t: 0, skip: heavy(name), part: false }; next.push([ch, path.join(p, name)]); return ch; }); count += subs.length; })); }
    level = next; }
  // totals of the subtree read (partial if something was left unread)
  (function sum(nd) { nd.f = nd.own; if (!nd.c) { if (nd.k) nd.part = true; return; } for (const ch of nd.c) { sum(ch); nd.b += ch.b; nd.f += ch.f; nd.d += ch.d + 1; if (ch.part) nd.part = true; }
    nd.c.sort((a, b) => b.b - a.b); })(top);
  return { root, src: 'disco', node: top, count, truncated: trunc, ms: Date.now() - t0 };
}
// search: "sonid" -> folders whose name contains it (from the indexes, ranked by match and size); "C:\Us" -> path completion
function ixLower(ix) { if (!ix.lc || ix.lc.at !== ix.at) ix.lc = { at: ix.at, a: ix.names.map(n => String(n).toLowerCase()) }; return ix.lc.a; }
async function search(qIn) {
  const q = String(qIn || '').trim(); if (!q) return []; const out = [], seen = new Set(), push = (p, extra) => { const k = key(p); if (seen.has(k)) return; seen.add(k); out.push({ name: path.basename(p) || p, path: p, ...extra }); };
  if (/^[a-z]:|^[\\/]/i.test(q)) { if (/^[\\/]{2}/.test(q)) return []; // path: entries in its folder that start with the typed text
    const dir = /[\\/]$/.test(q) ? q : path.dirname(q), pre = /[\\/]$/.test(q) ? '' : path.basename(q).toLowerCase(); let ents = [];
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch {}
    for (const e of ents) if (e.isDirectory() && e.name.toLowerCase().startsWith(pre)) { push(path.join(dir, e.name), { kind: 'ruta' }); if (out.length >= 20) break; }
    return out; }
  const ql = q.toLowerCase(), hits = [];
  for (const e of indexes.values()) { const ix = e.state === 'done' ? e : e.prev; if (!ix || ix.state !== 'done') continue; const lc = ixLower(ix);
    for (let i = 1; i < lc.length && hits.length < 600; i++) { const j = lc[i].indexOf(ql); if (j < 0) continue; hits.push({ ix, i, sc: lc[i] === ql ? 0 : j === 0 ? 1 : 2 }); } }
  hits.sort((a, b) => a.sc - b.sc || b.ix.tot[b.i * 3 + 1] - a.ix.tot[a.i * 3 + 1]);
  for (const h of hits) { push(ixPath(h.ix, h.i), { bytes: h.ix.tot[h.i * 3 + 1], files: h.ix.tot[h.i * 3] }); if (out.length >= 20) break; }
  return out;
}
// Drag from Explorer: the browser only hands over names (and the names of their contents), never the path.
// Each item is located by searching: first the selection in open Explorer windows, then the folders they show,
// common folders, drives, what is open in Prisma, recent items and the indexes. Read-only.
// lowercase name -> index folders with that name; built once per index version
function ixNameIds(ix, k) { if (!ix.byName || ix.byName.at !== ix.at) { const m = new Map(); for (let i = 1; i < ix.names.length; i++) { const kk = key(ix.names[i]); const a = m.get(kk); if (a) { if (a.length < 40) a.push(i); } else m.set(kk, [i]); } ix.byName = { at: ix.at, m }; } return ix.byName.m.get(k) || []; }
async function resolveDrop(items) {
  items = (Array.isArray(items) ? items : []).slice(0, 64).map(x => ({ name: String(x.name || ''), dir: !!x.dir, kids: (Array.isArray(x.kids) ? x.kids : []).slice(0, 60).map(String), size: +x.size || 0, mtime: +x.mtime || 0 })).filter(x => x.name && !/[\\/:*?"<>|]/.test(x.name));
  if (!items.length) return [];
  const net = d => /^[\\/]{2}/.test(String(d)), sel = [], bases = new Set(), addB = d => { if (d && !net(d)) bases.add(path.resolve(d)); };
  if (WIN) { try { for (const w of (await ps('explorer', {}, 6000)) || []) { if (w.f && path.isAbsolute(w.f)) addB(w.f); for (const p of [].concat(w.s || [])) if (p && path.isAbsolute(p) && !net(p)) sel.push(p); } } catch {}
    try { for (const r of (await ps('recent', {}, 6000)) || []) if (r && r.t) { addB(path.dirname(r.t)); addB(r.t); } } catch {} }
  const H = os.homedir(); for (const d of ['Desktop', 'Escritorio', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'OneDrive', 'OneDrive/Desktop', 'OneDrive/Escritorio', 'OneDrive/Documents', '']) addB(path.join(H, d));
  if (WIN) for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { const r = l + ':\\'; if (fs.existsSync(r)) addB(r); }
  for (const sp of spaces.values()) for (const c of sp.cubes.values()) { addB(c.path); addB(path.dirname(c.path)); }
  const out = [];
  for (const it of items) {
    const cand = new Map(), add = (p, w) => { const k = key(p), o = cand.get(k); if (!o || w > o.w) cand.set(k, { p, w }); };
    for (const p of sel) if (key(path.basename(p)) === key(it.name)) add(p, 3);
    for (const b of bases) add(path.join(b, it.name), 0);
    // indexes are searched only when there is content to compare: a bare name ("src", "n0") matches anything
    if (it.dir && it.kids.length) for (const e of indexes.values()) { const ix = e.state === 'done' ? e : e.prev; if (!ix || ix.state !== 'done') continue; let n = 0;
      for (const i of ixNameIds(ix, key(it.name))) { add(ixPath(ix, i), -1); if (++n >= 40) break; } }
    let best = null;
    for (const { p, w } of cand.values()) { let st; try { st = await fsp.stat(p); } catch { continue; }
      if (st.isDirectory() !== it.dir) continue; let sc = w + 1;
      if (it.dir && it.kids.length) { let names; try { names = new Set((await fsp.readdir(p)).map(key)); } catch { names = new Set(); } const fr = it.kids.filter(x => names.has(key(x))).length / it.kids.length;
        if ((w < 0 || w === 0) && fr < .5) continue; sc += 2 * fr; } // outside the index and the common folders the contents must resemble it; index-only hits must really match
      if (!it.dir) { const sz = st.size === it.size, mt = it.mtime && Math.abs(st.mtimeMs - it.mtime) < 2000; if (!sz && !mt && w < 3) continue; sc += (sz ? 1 : 0) + (mt ? 1 : 0); } // a file with the same name is not enough
      if (!best || sc > best.sc || (sc === best.sc && st.mtimeMs > best.t)) best = { p, sc, t: st.mtimeMs }; }
    out.push({ name: it.name, dir: it.dir, path: best ? best.p : null });
  }
  return out;
}
// native Windows picker (folders, several at once); returns paths only
let picking = null;
function pickDirs() {
  if (!WIN) return Promise.reject(new Error('El selector de carpetas solo está en Windows; escribe las rutas separadas por «;»'));
  if (picking) return picking;
  const enc = Buffer.from(fs.readFileSync(path.join(__dirname, 'pickdirs.ps1'), 'utf8'), 'utf16le').toString('base64');
  return picking = new Promise((ok, ko) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', enc], { windowsHide: true }); let out = '', err = '';
    p.stdout.setEncoding('utf8'); p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    const t = setTimeout(() => { try { p.kill(); } catch {} }, 15 * 60000); t.unref();
    p.on('error', e => { clearTimeout(t); picking = null; ko(e); });
    p.on('exit', code => { clearTimeout(t); picking = null; if (code && !out.trim()) return ko(new Error('El selector de carpetas falló' + (err ? ': ' + err.trim().split('\n').pop() : ''))); try { const j = JSON.parse(out.trim() || '[]'); ok(Array.isArray(j) ? j : [j]); } catch { ko(new Error('El selector de carpetas falló' + (err ? ': ' + err.trim().split('\n')[0] : ''))); } });
  });
}

// --- HTTP ---
const json = (res, code, obj) => { if (res.headersSent) { try { res.end(); } catch {} return; } res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, ko) => { let s = ''; req.on('data', d => { s += d; if (s.length > 262144) { ko(new Error('demasiado grande')); req.destroy(); } }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { ko(new Error('JSON inválido')); } }); });

let lastReq = Date.now();
const server = http.createServer(async (req, res) => {
  lastReq = Date.now();
  const host = (req.headers.host || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') { res.writeHead(403); return res.end(); }
  const u = new URL(req.url, 'http://x'), q = n => u.searchParams.get(n);
  try {
    if (req.method === 'POST') {
      const o = req.headers.origin;
      if (o && o !== `http://127.0.0.1:${PORT}` && o !== `http://localhost:${PORT}`) { res.writeHead(403); return res.end(); }
      if (req.headers['x-prisma'] !== TOKEN) { res.writeHead(403); return res.end(); }
      const b = await body(req), by = b.by === 'ia' ? 'ia' : 'usuario';
      if (u.pathname === '/api/space') return json(res, 200, spaceOp(b, by));
      if (u.pathname === '/api/assistant/ask') { await assistant.ask({ message: b.message, account: b.account, fresh: !!b.fresh, workdir: b.workdir || null, permission: b.permission, port: PORT }, send); return json(res, 202, { ok: true }); }
      if (u.pathname === '/api/assistant/permission') return json(res, 200, await assistant.requestPermission({ account: String(b.account || 'default'), tool: String(b.tool || ''), input: b.input || {} })); // long wait: answered when the user decides
      if (u.pathname === '/api/assistant/decide') return json(res, 200, { ok: assistant.decide(String(b.id), !!b.allow, b.message) });
      if (u.pathname === '/api/assistant/cancel') return json(res, 200, { cancelled: assistant.cancel(String(b.account || 'default')) });
      if (u.pathname === '/api/elevate') { // relaunch this same server with administrator rights (Windows asks for consent); still read-only
      if (!WIN || ADMIN) return json(res, 400, { error: 'ya tiene permisos de administrador' });
      const q1 = s => "'" + String(s).replace(/'/g, "''") + "'", log = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'prisma', 'servidor.log');
      const inner = `/c cd /d "${__dirname}" && "${process.execPath}" "${path.join(__dirname, 'server.js')}" --no-open --takeover --port ${PORT}${flags.idleExit ? ' --with-window' : ''}${flags.noLive ? ' --no-live' : ''} > "${log}" 2>&1`;
      const ok = await new Promise(r => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath cmd.exe -ArgumentList ${q1(inner)} -Verb RunAs -WindowStyle Hidden`], { windowsHide: true, timeout: 120000 }, e => r(!e)));
      if (!ok) return json(res, 409, { error: 'permiso denegado' });
      json(res, 200, { ok: true }); return setTimeout(() => shutdown('Relanzado con administrador'), 300); }
    if (u.pathname === '/api/hold') { LIVE.hold = b.path ? key(String(b.path)) : null; LIVE.holdT = Date.now(); return json(res, 200, { ok: true }); } // Live: the selected cube stays while you look at it (10 min at most)
      if (u.pathname === '/api/openmany') return json(res, 200, await openMany(b, by));
      if (u.pathname === '/api/resolve') return json(res, 200, await resolveDrop(b.items));
      if (u.pathname === '/api/pick') return json(res, 200, { paths: await pickDirs() });
      if (u.pathname === '/api/open') { await openCube(b.path, { expand: !!b.expand, depth: b.depth, by, here: !!b.here, root: !!b.root, quiet: !!b.quiet }); return json(res, 200, state()); }
      if (u.pathname === '/api/close') { closeCube(b.path, by); return json(res, 200, state()); }
      if (u.pathname === '/api/scene') return json(res, 200, await sceneOp(b, by));
      if (u.pathname === '/api/index') { const p = await checkDir(b.path); return json(res, 200, ixPublic(startIndex(p, by))); }
      if (u.pathname === '/api/layout') { if (!['cluster', 'stack', 'grid', 'orbit'].includes(b.mode)) throw new Error('mode: cluster | stack | grid | orbit'); ws.layout = b.mode; log(by, 'organiza', b.mode); send(state()); return json(res, 200, state()); }
      if (u.pathname === '/api/focus') { const p = await checkDir(b.path); if (!ws.cubes.has(key(p))) throw new Error('Ese cubo no está abierto'); ws.focus = p; ws.focusRev++; log(by, 'enfoca', p); send(state()); return json(res, 200, state()); }
      res.writeHead(404); return res.end();
    }
    if (u.pathname === '/api/version') return json(res, 200, { running: SRC, disk: srcHash() });
    if (u.pathname === '/api/assistant') return json(res, 200, await assistant.status());
    if (u.pathname === '/api/assistant/busy') return json(res, 200, { busy: assistant.isBusy() });
    if (u.pathname === '/app.js' || u.pathname === '/app.js.map') { const b = clientBundle(); const map = u.pathname.endsWith('.map'); res.writeHead(200, { 'Content-Type': map ? 'application/json' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(map ? b.map : b.code); }
    if (u.pathname === '/favicon.svg') { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'favicon.svg'))); }
    if (u.pathname === '/app.css') { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'))); }
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replace('__PRISMA_TOKEN__', TOKEN)); }
    // every /api request requires the token handed to the page itself (or to the local MCP via ~/.prisma/token),
    // so no external website can trigger reads, scans or indexing even though it can't see the response
    if (u.pathname.startsWith('/api/') && !['/api/state', '/api/events'].includes(u.pathname) && q('t') !== TOKEN && req.headers['x-prisma'] !== TOKEN) { res.writeHead(403); return res.end(); }
    if (u.pathname === '/api/roots') return json(res, 200, await roots());
    if (u.pathname === '/api/ls') return json(res, 200, await ls(q('path')));
    if (u.pathname === '/api/file') return json(res, 200, await fileInfo(q('path')));
    if (u.pathname === '/api/raw') return sendRaw(req, res, q('path'));
    if (u.pathname === '/api/system') return json(res, 200, await system(new Set(String(q('open') || '').split(',').filter(Boolean))));
    if (u.pathname === '/api/tasks') return json(res, 200, await tasks());
    if (u.pathname === '/api/fgshot') { if (!WIN) { res.writeHead(404); return res.end(); } // what's in the window in front of you (local thumbnail, never leaves the machine)
      if (!LIVE.shot || Date.now() - LIVE.shot.t > 900) { let b64 = ''; try { b64 = await ps('shot', { w: 480 }, 4000); } catch {} LIVE.shot = { t: Date.now(), buf: b64 ? Buffer.from(b64, 'base64') : null }; }
      if (!LIVE.shot.buf) { res.writeHead(204); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); return res.end(LIVE.shot.buf); }
    if (u.pathname === '/api/winshot') { if (!WIN) { res.writeHead(404); return res.end(); } // thumbnail of a program's window (hover preview; local)
      const pids = String(q('pids') || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 4).slice(0, 12), k = pids.join(','); if (!pids.length) { res.writeHead(400); return res.end(); }
      const hit = SHOTS.get(k); let buf = hit && Date.now() - hit.t < 1200 ? hit.buf : undefined;
      if (buf === undefined) { let b64 = ''; try { b64 = await ps('shotpid', { pids: k, w: 360 }, 4000); } catch {} buf = b64 ? Buffer.from(b64, 'base64') : null; SHOTS.set(k, { t: Date.now(), buf }); if (SHOTS.size > 40) SHOTS.delete(SHOTS.keys().next().value); }
      if (!buf) { res.writeHead(204); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); return res.end(buf); }
    if (u.pathname === '/api/inuse') { const d = await checkDir(q('path')), kk = key(d), hit = INUSE.get(kk); // files in the folder that some program has open right now (read-only)
      if (hit && Date.now() - hit.t < 4000) return json(res, 200, hit.v); const m = await cubeMeta(d).catch(() => ({ open: [] })), v = { open: m.open || [] }; INUSE.set(kk, { t: Date.now(), v }); return json(res, 200, v); }
    if (u.pathname === '/api/search') return json(res, 200, await search(q('q')));
    if (u.pathname === '/api/tree') return json(res, 200, await tree(q('path'), q('depth'), q('max')));
    if (u.pathname === '/api/meta') return json(res, 200, await cubeMeta(await checkDir(q('path'))));
    if (u.pathname === '/api/icon') { const b = await icon(iconPath(q('exe') || q('path'))); if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' }); return res.end(b); }
    if (u.pathname === '/api/state') return json(res, 200, { ...state(), host: os.hostname(), platform: process.platform, cwd: process.cwd() });
    if (u.pathname === '/api/cube') { const p = await checkDir(q('path')); return json(res, 200, { ...(await scan(p, 3000, q('fast') === '1')), events: evCount.get(key(p)) || 0 }); }
    if (u.pathname === '/api/deps') return json(res, 200, await deps(await checkDir(q('path'))));
    if (u.pathname === '/api/agent') return json(res, 200, await agentInfo(await checkDir(q('path'))));
    if (u.pathname === '/api/pulse') return json(res, 200, await pulse());
    if (u.pathname === '/api/lockers') return json(res, 200, await lockers(q('path')));
    if (u.pathname === '/api/proc') return json(res, 200, await procDetail(q('pid')));
    if (u.pathname === '/api/follow') return json(res, 200, await follow(q('pid')));
    if (u.pathname === '/api/scenes') return json(res, 200, await scenes());
    if (u.pathname === '/api/thumb') return thumb(res, q('path'));
    if (u.pathname === '/api/media') return json(res, 200, await mediaList(q('path')));
    if (u.pathname === '/api/index') return json(res, 200, [...indexes.values()].map(ixPublic));
    if (u.pathname.startsWith('/vendor/')) {
      const f = path.join(__dirname, 'public', path.normalize(decodeURIComponent(u.pathname)).replace(/^[\\/]+/, ''));
      let isFile = false; try { isFile = fs.statSync(f).isFile(); } catch {}
      if (!f.startsWith(path.join(__dirname, 'public', 'vendor') + path.sep) || !isFile) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': /\.m?js$/.test(f) ? 'text/javascript; charset=utf-8' : f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', 'Cache-Control': 'max-age=86400' }); return streamFile(res, f);
    }
    if (u.pathname === '/api/observe') return json(res, 200, await observe());
    if (u.pathname === '/api/sys') return json(res, 200, { cpu: cpuLoad, cpuModel: (os.cpus()[0] || {}).model, mem: { total: os.totalmem(), free: os.freemem() }, gpu, disk: diskOf(WIN ? (process.env.SystemDrive || 'C:') + '\\' : '/'), srvRss: process.memoryUsage().rss, uptime: os.uptime(), t: Date.now() });
    if (u.pathname === '/api/procs') {
      const all = await allProcs(), strip = ({ cmd, ...r }) => r, sum = (l, f) => l.reduce((s, x) => s + x[f], 0);
      const out = { count: all.length, rd: sum(all, 'rd'), wr: sum(all, 'wr'), top: all.filter(x => x.pid && x.pid !== 4).sort((a, b) => b.cpu - a.cpu).slice(0, 8).map(strip), linked: null };
      if (q('path')) { const p = key(await checkDir(q('path'))), l = all.filter(x => key(x.cmd).includes(p)).sort((a, b) => b.ws - a.ws);
        out.linked = { n: l.length, ram: sum(l, 'ws'), cpu: sum(l, 'cpu'), rd: sum(l, 'rd'), wr: sum(l, 'wr'), list: l.slice(0, 8).map(strip) }; }
      return json(res, 200, out);
    }
    if (u.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(state())}\n\n`); clients.add(res); req.on('close', () => { clients.delete(res); lastReq = Date.now(); }); return;
    }
    res.writeHead(404); res.end();
  } catch (e) { json(res, 400, { error: String(e.message || e) }); }
});

server.listen(PORT, '127.0.0.1', async () => {
  try { const tf = path.join(os.homedir(), '.prisma', 'token'); fs.mkdirSync(path.dirname(tf), { recursive: true }); let o = {}; try { o = JSON.parse(fs.readFileSync(tf, 'utf8')); } catch {} const ports = { ...(o.ports || {}), [PORT]: TOKEN }; // one token per port so several instances don't clobber each other
    fs.writeFileSync(tf, JSON.stringify({ port: PORT, token: PORT === 4828 ? TOKEN : (ports[4828] || TOKEN), ports }), { mode: 0o600 }); } catch {}
  await loadIndexes();
  const url = `http://127.0.0.1:${PORT}/`;
  if (cliDirs.length) { useSpace(newSpace(path.basename(path.resolve(cliDirs[0]))).id); for (const d of cliDirs) { try { await openCube(path.resolve(d), { expand: !!flags.expand, here: true }); } catch (e) { console.error('  ! ' + e.message); } } }
  else if (!LIVE.on) { useSpace(newSpace(path.basename(process.cwd())).id); try { await openCube(process.cwd(), { here: true }); } catch {} }
  else useSpace(newSpace().id); // start on an empty space; «En vivo» stays one tab away
  console.log(`prisma  →  ${url}   (solo lectura · ${ws.cubes.size} cubos)`);
  if (!flags.noOpen) { try { (WIN ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }) : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' })).unref(); } catch {} }
});
setInterval(() => {
  const open = new Set([...ws.cubes.keys()]), old = Date.now() - 120000;
  for (const [k, v] of scans) if (!open.has(k) && !v.inflight && v.t < old) scans.delete(k);
  for (const m of [agentCache, depCache]) for (const [k, v] of m) if (!open.has(k) && v.t < old) m.delete(k);
  for (const k of evCount.keys()) if (!open.has(k)) evCount.delete(k);
  if (rdns.size > 5000) rdns.clear(); if (icons.size > 3000) icons.clear(); if (pulseFiles.size > 64) pulseFiles.clear();
}, 60000).unref();
// started by prisma.vbs (--with-window): lives with its window; once it closes (8 s grace for reloads) it exits along with its helpers
let hadClient = false;
function shutdown(why) { console.log(why + ': Prisma se cierra.'); assistant.stopAll(); try { if (psh) psh.kill(); } catch {} for (const w of watchers.values()) { try { w.close(); } catch {} } process.exit(0); }
if (flags.idleExit) setInterval(() => { if (clients.size) { hadClient = true; return; } if (picking || manyBusy) return;
  const idle = Date.now() - lastReq; if (hadClient ? idle > 8000 : idle > 120000) shutdown(hadClient ? 'Ventana cerrada' : 'Sin uso en 2 min'); }, 2000).unref();
// scripts/dev.js asks for a clean stop over IPC before restarting, so helpers never outlive the server
if (process.send) {
  process.on('message', m => { if (m === 'shutdown') shutdown('Reinicio de desarrollo'); });
  process.on('disconnect', () => shutdown('El proceso de desarrollo se cerró')); // the runner died: do not stay behind as an orphan
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => shutdown('Señal ' + sig));
// a monitor must not crash on a one-off failure: log it and keep observing
process.on('uncaughtException', e => console.error('  ! error:', e && e.message));
process.on('unhandledRejection', e => console.error('  ! promesa rechazada:', e && e.message));
let bindTries = 0;
server.on('error', e => { if (e.code === 'EADDRINUSE' && flags.takeover && ++bindTries < 60) return setTimeout(() => server.listen(PORT, '127.0.0.1'), 500); // relaunched with admin: wait for the previous server to leave
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${PORT} ya está en uso (¿Prisma ya está abierto?). Usa --port.` : e.message); process.exit(1); });
