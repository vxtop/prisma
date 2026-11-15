// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Test helpers: a throwaway fixture tree, an isolated server process and a free port.
// Everything lives under the OS temp folder, so tests never read or write the user's data.

'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

/** Returns a TCP port that is free right now. */
function freePort() {
  return new Promise((ok, ko) => { const s = net.createServer(); s.unref(); s.on('error', ko); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
}

/** Builds a small project-like tree: ten folders with code, docs, data and images. */
function makeFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vxtop-test-')), home = path.join(base, 'home'), work = path.join(base, 'work');
  fs.mkdirSync(home); fs.mkdirSync(work);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360f8cfc0f01f0005fe02fea7d6a3d40000000049454e44ae426082', 'hex');
  const names = ['app', 'docs', 'assets', 'scripts', 'data', 'tests', 'config', 'notes', 'media', 'tools'];
  names.forEach((n, i) => {
    const d = path.join(work, n); fs.mkdirSync(path.join(d, 'sub', 'deep'), { recursive: true });
    for (let k = 0; k < 6 + i; k++) fs.writeFileSync(path.join(d, `file${k}.js`), `// fixture ${n} ${k}\nexport const v = ${k};\n`);
    fs.writeFileSync(path.join(d, 'README.md'), `# ${n}\n\nFixture folder.\n`);
    fs.writeFileSync(path.join(d, 'sub', 'data.json'), JSON.stringify({ n, i }));
    fs.writeFileSync(path.join(d, 'sub', 'deep', 'pixel.png'), png);
  });
  return { base, home, work, dirs: names.map(n => path.join(work, n)), cleanup: () => { try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {} } };
}

/** Starts the server on its own port with an isolated home folder. Resolves once it answers. */
async function startServer({ dirs = [], home, live = false, extra = [] }) {
  const port = await freePort();
  const args = [path.join(ROOT, 'server.js'), ...dirs, '--no-open', '--port', String(port), ...(live ? [] : ['--no-live']), ...extra];
  const env = { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming') }; // keep every per-user cache inside the throwaway home
  const proc = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = ''; proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) { const html = await r.text(), token = (/name="vxtop" content="([^"]+)"/.exec(html) || [])[1]; return { proc, port, url, token, log: () => log, stop: () => proc.kill() }; } } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill(); throw new Error('server did not start:\n' + log);
}

/** Finds a Chrome/Chromium binary (CHROME_PATH wins). */
function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => p && fs.existsSync(p)) || null;
}

/** Minimal assertion log with a non-zero exit code on failure. */
function reporter(title) {
  let pass = 0, fail = 0; console.log('\n' + title + '\n');
  return {
    ok(name, cond, info = '') { cond ? pass++ : fail++; console.log(`  ${cond ? '✓' : '✗'} ${name}${info ? `  · ${info}` : ''}`); },
    done() { console.log(`\n  ${pass} passed · ${fail} failed\n`); process.exitCode = fail ? 1 : 0; return fail; },
  };
}

module.exports = { ROOT, freePort, makeFixture, startServer, findChrome, reporter };
