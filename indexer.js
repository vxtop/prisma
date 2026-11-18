// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Prisma background indexer (worker_threads); read-only: readdir + stat. Walks a whole tree (e.g. C:\) and stores, per folder,
// its direct files in 9 groups (type x age): 18 numbers per folder. Subtree totals and the 27 cells of any cube are derived from these later.
'use strict';
const { workerData, parentPort } = require('worker_threads');
const fsp = require('fs').promises, path = require('path');
const { root, now, code, data } = workerData;
const CODE = new Set(code), DATA = new Set(data);
const bucket = (name, mtime) => { const e = path.extname(name).slice(1).toLowerCase(), t = CODE.has(e) ? 0 : DATA.has(e) ? 1 : 2, age = now - mtime, a = age < 36e5 ? 0 : age < 864e5 ? 1 : 2; /* now (<1 h) · today (<24 h) · older */ return t + 3 * a; };

const names = [root], parent = [-1]; let stats = new Float64Array(18 * 4096), newest = new Float64Array(4096);
let files = 0, bytes = 0, errors = 0, cur = root, next = 0, active = 0;
const grow = n => { if (n * 18 <= stats.length) return; const s = new Float64Array(stats.length * 2); s.set(stats); stats = s; const w = new Float64Array(newest.length * 2); w.set(newest); newest = w; };
const full = [root]; // full path per index (released when done)

async function dir(i) {
  const p = full[i]; cur = p; let ents;
  try { ents = await fsp.readdir(p, { withFileTypes: true }); } catch { errors++; return; }
  const fl = [];
  for (const e of ents) {
    if (e.isSymbolicLink()) continue; // junctions too: avoids cycles and duplicates
    if (e.isDirectory()) { const j = names.length; names.push(e.name); parent.push(i); full.push(path.join(p, e.name)); grow(j + 1); }
    else if (e.isFile()) fl.push(e.name);
  }
  for (let k = 0; k < fl.length; k += 64) {
    const sts = await Promise.all(fl.slice(k, k + 64).map(n => fsp.stat(path.join(p, n)).then(s => [n, s], () => null)));
    for (const r of sts) { if (!r) continue; const [n, s] = r, b = bucket(n, s.mtimeMs), o = i * 18 + b * 2;
      stats[o]++; stats[o + 1] += s.size; files++; bytes += s.size; if (s.mtimeMs > newest[i]) newest[i] = s.mtimeMs; }
  }
}
const t0 = Date.now();
const tick = setInterval(() => parentPort.postMessage({ k: 'progress', dirs: names.length, done: next, files, bytes, errors, cur, ms: Date.now() - t0 }), 500);
(async () => {
  // breadth-first queue, 24 folders in parallel: uses the I/O pool without saturating the disk
  await new Promise(done => {
    const pump = () => {
      while (active < 24 && next < names.length) { const i = next++; active++; dir(i).finally(() => { active--; if (next >= names.length && !active) done(); else pump(); }); }
      if (next >= names.length && !active) done();
    };
    pump();
  });
  clearInterval(tick);
  const n = names.length, par = Int32Array.from(parent), st = stats.slice(0, n * 18), nw = newest.slice(0, n);
  parentPort.postMessage({ k: 'done', root, at: now, names, parent: par, stats: st, newest: nw, files, bytes, errors, ms: Date.now() - t0 }, [par.buffer, st.buffer, nw.buffer]);
})();
