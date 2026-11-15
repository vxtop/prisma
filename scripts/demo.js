#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Demo: builds a fictional studio (projects, photos, docs, data) in the temp folder and opens it,
// so vxtop can be tried or shown without exposing your own files.
// Usage: node scripts/demo.js [--shot docs/assets/hero.png]   (--shot: save a screenshot and exit)

'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { startServer, findChrome, freePort } = require('../test/helpers');

const HOUR = 3600e3, DAY = 24 * HOUR;
const shotArg = process.argv.indexOf('--shot'), SHOT = shotArg > 0 ? path.resolve(process.argv[shotArg + 1]) : null;

// name → { kind of files, how many, size range in KB, how old }
const STUDIO = {
  'web-app':      { sub: ['src/components', 'src/pages', 'src/lib', 'public/img', 'tests', 'node_modules/react/cjs', 'node_modules/three/build'], ext: ['ts', 'tsx', 'css', 'json', 'png', 'js'], n: 140, kb: [1, 400], age: [0, 2 * HOUR] },
  'api-server':   { sub: ['src/routes', 'src/db', 'migrations', 'logs'], ext: ['go', 'sql', 'yaml', 'log'], n: 70, kb: [1, 900], age: [0, 20 * HOUR] },
  'ml-research':  { sub: ['notebooks', 'datasets/raw', 'datasets/clean', 'models'], ext: ['ipynb', 'csv', 'parquet', 'pt', 'py'], n: 60, kb: [50, 6000], age: [HOUR, 40 * DAY] },
  'photos-2026':  { sub: ['january', 'march', 'summer/beach', 'summer/mountains'], ext: ['jpg', 'jpg', 'png', 'mp4'], n: 90, kb: [200, 4000], age: [10 * DAY, 200 * DAY] },
  'brand-design': { sub: ['logos', 'mockups', 'fonts'], ext: ['svg', 'png', 'psd', 'ttf'], n: 45, kb: [5, 3000], age: [2 * DAY, 60 * DAY] },
  'docs':         { sub: ['handbook', 'specs', 'meetings'], ext: ['md', 'pdf', 'docx', 'txt'], n: 70, kb: [1, 800], age: [0, 90 * DAY] },
  'game-proto':   { sub: ['Assets/Models', 'Assets/Textures', 'Scripts', 'Build'], ext: ['glb', 'png', 'cs', 'exe', 'dll'], n: 80, kb: [10, 5000], age: [3 * HOUR, 15 * DAY] },
  'finance':      { sub: ['2025', '2026/q1', '2026/q2'], ext: ['xlsx', 'csv', 'pdf'], n: 40, kb: [5, 500], age: [5 * DAY, 300 * DAY] },
  'music':        { sub: ['stems', 'mixes', 'samples'], ext: ['wav', 'mp3', 'flac'], n: 50, kb: [300, 8000], age: [20 * DAY, 400 * DAY] },
  'dotfiles':     { sub: ['.config/nvim', '.config/git', 'scripts'], ext: ['lua', 'sh', 'toml', 'ps1'], n: 30, kb: [1, 20], age: [HOUR, 100 * DAY] },
};

function build(root) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
  for (const [name, p] of Object.entries(STUDIO)) {
    const base = path.join(root, name), dirs = ['', ...p.sub];
    for (const d of dirs) fs.mkdirSync(path.join(base, d), { recursive: true });
    fs.writeFileSync(path.join(base, 'README.md'), `# ${name}\n\nPart of the vxtop demo studio.\n`);
    for (let i = 0; i < p.n; i++) {
      const dir = path.join(base, pick(dirs)), ext = pick(p.ext), kb = p.kb[0] + Math.pow(rnd(), 3) * (p.kb[1] - p.kb[0]);
      const f = path.join(dir, `${name.split('-')[0]}-${String(i).padStart(3, '0')}.${ext}`);
      fs.writeFileSync(f, Buffer.alloc(Math.round(kb * 128), i % 251)); // an eighth of the nominal size keeps the demo around 60 MB
      const t = new Date(Date.now() - (p.age[0] + rnd() * (p.age[1] - p.age[0]))); fs.utimesSync(f, t, t);
    }
  }
}

(async () => {
  const root = path.join(os.homedir(), '.vxtop', 'demo', 'studio'), home = path.join(os.homedir(), '.vxtop', 'demo', 'home'); // inside vxtop's own folder (not Temp, which would make every cube a «cache»)
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(home, { recursive: true });
  build(root);
  const dirs = Object.keys(STUDIO).map(n => path.join(root, n));
  const srv = await startServer({ dirs, home, extra: ['--demo'] });
  console.log(`Demo studio in ${root}\nvxtop → ${srv.url}`);
  if (!SHOT) { const open = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', srv.url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [srv.url]]; spawn(open[0], open[1], { stdio: 'ignore', detached: true }).unref(); return; }

  // --shot: headless Chrome, dismiss the welcome, frame everything, select the busiest project, save
  const chrome = findChrome(); if (!chrome) throw new Error('Chrome not found (set CHROME_PATH)');
  const dbg = await freePort(), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vxtop-demo-chrome-'));
  const ch = spawn(chrome, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, '--window-size=1600,900', '--use-angle=d3d11', '--enable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let target; for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find(x => x.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const wait = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = x => cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }).then(r => r.result.result?.value);
  const key = async (k, code) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
  await cdp('Page.navigate', { url: srv.url }); await sleep(6000);
  await ev(`localStorage.setItem('vxtop.welcome', '1'); document.querySelector('#modal [data-r]') && document.querySelector('#modal [data-r]').click(); 1`);
  await key('h', 'KeyH'); await sleep(2500);
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(SHOT), { recursive: true }); fs.writeFileSync(SHOT, Buffer.from(r.result.data, 'base64')); console.log('saved ' + SHOT);
  ws.close(); ch.kill(); srv.stop(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {} }, 1500);
})().catch(e => { console.error(e.message); process.exit(1); });
