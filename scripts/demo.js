#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Demo: builds a fictional studio (projects, photos, docs, data) in the temp folder and opens it,
// so vxtop can be tried or shown without exposing your own files.
// Usage: node scripts/demo.js                      open the demo in your browser
//        node scripts/demo.js --shot <file.png>    save one screenshot and exit
//        node scripts/demo.js --media <dir>        screenshots of every view and a short video (needs ffmpeg)

'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { startServer, findChrome, freePort } = require('../test/helpers');

const cdpFrames = { on: null }; // screencast frame handler while recording
const HOUR = 3600e3, DAY = 24 * HOUR;
const argOf = f => { const i = process.argv.indexOf(f); return i > 0 ? path.resolve(process.argv[i + 1]) : null; };
const SHOT = argOf('--shot'), MEDIA = argOf('--media');

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
  // a path without your user name, so screenshots can be shared (and not under Temp, which would make every cube a «cache»)
  const base = process.platform === 'win32' && process.env.PUBLIC ? path.join(process.env.PUBLIC, 'vxtop-demo') : path.join(os.tmpdir(), 'vxtop-demo'), root = path.join(base, 'studio'), home = path.join(base, 'home');
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(home, { recursive: true });
  build(root);
  const dirs = Object.keys(STUDIO).map(n => path.join(root, n));
  const srv = await startServer({ dirs, home, extra: ['--demo'] });
  console.log(`Demo studio in ${root}\nvxtop → ${srv.url}`);
  if (!SHOT && !MEDIA) { const open = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', srv.url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [srv.url]]; spawn(open[0], open[1], { stdio: 'ignore', detached: true }).unref(); return; }

  // --shot / --media: headless Chrome, dismiss the welcome, frame everything, capture
  const chrome = findChrome(); if (!chrome) throw new Error('Chrome not found (set CHROME_PATH)');
  const dbg = await freePort(), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vxtop-demo-chrome-'));
  const ch = spawn(chrome, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, '--window-size=1600,900', '--use-angle=d3d11', '--enable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let target; for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find(x => x.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const wait = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Page.screencastFrame' && cdpFrames.on) cdpFrames.on(m.params); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = x => cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }).then(r => r.result.result?.value);
  const key = async (k, code) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
  await cdp('Page.navigate', { url: srv.url }); await sleep(6000);
  await ev(`localStorage.setItem('vxtop.welcome', '1'); document.querySelector('#modal [data-r]') && document.querySelector('#modal [data-r]').click(); 1`);
  await key('h', 'KeyH'); await sleep(2500);
  const png = async file => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('saved ' + file); };
  if (SHOT) await png(SHOT);
  if (MEDIA) await media({ cdp, ev, key, sleep, png, root });
  ws.close(); ch.kill(); srv.stop(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {} }, 1500);
})().catch(e => { console.error(e.message); process.exit(1); });

/** Screenshots of the main views and a ~12 s clip (mp4 + gif) with live activity in the demo studio. */
async function media({ cdp, ev, key, sleep, png, root }) {
  const { execFileSync } = require('child_process'), J = async x => JSON.parse(await ev(`JSON.stringify(${x})`));
  const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); };
  const scr = name => `(() => { const S = window.__vxtop, c = [...S.cubes.values()].find(c => c.name === ${JSON.stringify(name)}); const v = c.pos.clone().project(S.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; })()`;
  const touch = (n = 6) => { for (let i = 0; i < n; i++) { const d = path.join(root, i % 2 ? 'web-app' : 'docs'); fs.writeFileSync(path.join(d, `live-${i}.${i % 2 ? 'ts' : 'md'}`), 'edit ' + Date.now()); } };
  await png(path.join(MEDIA, 'overview.png'));
  // video: frames from the screencast while things happen
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxtop-frames-')); let n = 0; const t0 = Date.now();
  cdpFrames.on = async p => { fs.writeFileSync(path.join(dir, `f${String(n++).padStart(4, '0')}.jpg`), Buffer.from(p.data, 'base64')); cdp('Page.screencastFrameAck', { sessionId: p.sessionId }); };
  await cdp('Page.startScreencast', { format: 'jpeg', quality: 82, everyNthFrame: 1 });
  touch(); await sleep(1500);
  for (let i = 0; i < 40; i++) { const x = 900 + i * 6; if (i === 0) { await mouse('mouseMoved', 900, 450); await mouse('mousePressed', 900, 450, { button: 'left', clickCount: 1 }); } await mouse('mouseMoved', x, 450, { buttons: 1 }); await sleep(30); }
  await mouse('mouseReleased', 1140, 450, { button: 'left', clickCount: 1 }); touch(); await sleep(1200);
  const a = await J(scr('web-app')); await click(a[0], a[1]); touch(); await sleep(3200);
  await png(path.join(MEDIA, 'selected.png')); touch(); await sleep(1500);
  await key('Escape', 'Escape'); await key('h', 'KeyH'); await sleep(2200);
  await cdp('Page.stopScreencast'); cdpFrames.on = null;
  const secs = (Date.now() - t0) / 1000, fps = Math.max(5, Math.round(n / secs));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.jpg'), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(MEDIA, 'demo.mp4')]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.jpg'), '-vf', 'fps=12,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', path.join(MEDIA, 'demo.gif')]);
  console.log(`saved demo.mp4 and demo.gif (${n} frames, ${secs.toFixed(1)} s)`); fs.rmSync(dir, { recursive: true, force: true });
  // the other views
  await key('a', 'KeyA'); await sleep(800); await ev(`window.__vxtop.trOpen(${JSON.stringify(root)})`); await sleep(4000); await png(path.join(MEDIA, 'tree.png'));
}
