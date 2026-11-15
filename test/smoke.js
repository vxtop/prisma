// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Smoke test, no browser needed: the server starts, serves a client that parses,
// guards every API call with its token and stays read-only on the observed folders.

'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { makeFixture, startServer, reporter } = require('./helpers');

(async () => {
  const t = reporter('smoke'), fx = makeFixture();
  const before = snapshot(fx.work);
  const srv = await startServer({ dirs: fx.dirs.slice(0, 3), home: fx.home });
  try {
    const page = await (await fetch(srv.url)).text();
    t.ok('page is served with a session token', !!srv.token && page.includes('/app.js'));

    const app = await (await fetch(srv.url + 'app.js')).text(), tmp = path.join(os.tmpdir(), `vxtop-app-${process.pid}.mjs`);
    fs.writeFileSync(tmp, app); let parses = true; try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch { parses = false; } fs.rmSync(tmp, { force: true });
    t.ok('client bundle parses', parses, Math.round(app.length / 1024) + ' KB');
    const map = await (await fetch(srv.url + 'app.js.map')).json();
    t.ok('source map lists every client file', map.sources.length === fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).length, map.sources.length + ' files');
    t.ok('stylesheet is served', (await fetch(srv.url + 'app.css')).ok);

    t.ok('API refuses calls without the token', (await fetch(srv.url + 'api/roots')).status === 403);
    t.ok('API answers with the token', (await fetch(srv.url + 'api/roots?t=' + srv.token)).ok);
    const post = await fetch(srv.url + 'api/close', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    t.ok('POST without the header is refused', post.status === 403);
    const cross = await fetch(srv.url + 'api/close', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-Vxtop': srv.token, Origin: 'https://example.com' } });
    t.ok('POST from another origin is refused', cross.status === 403);

    const cube = await (await fetch(srv.url + 'api/cube?t=' + srv.token + '&path=' + encodeURIComponent(fx.dirs[0]))).json();
    t.ok('a folder is read as a 27-cell cube', Array.isArray(cube.cells) && cube.cells.length === 27, (cube.totals && cube.totals.files) + ' files');
    const net = await fetch(srv.url + 'api/cube?t=' + srv.token + '&path=' + encodeURIComponent('\\\\server\\share'));
    t.ok('network paths are blocked', !net.ok);

    await new Promise(r => setTimeout(r, 1500));
    t.ok('observed folders are left untouched', JSON.stringify(snapshot(fx.work)) === JSON.stringify(before));
  } catch (e) { t.ok('no exception', false, e.message); }
  finally { srv.stop(); setTimeout(() => fx.cleanup(), 500); t.done(); }
})();

/** name, size and mtime of every file under dir: if any of these changes, something wrote to disk. */
function snapshot(dir) {
  const out = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const s = fs.statSync(p); out.push([path.relative(dir, p), s.size, s.mtimeMs]); } } })(dir);
  return out.sort();
}
