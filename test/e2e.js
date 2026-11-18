// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// End-to-end interaction test in headless Chrome (DevTools protocol, no dependencies):
// loading, one-click select + centre, habitual double click, empty click, rapid clicks,
// wheel zoom, fast view switching, tree expand/collapse, search and a clean reload.
// Usage: node test/e2e.js [--live]   (--live also checks a program cube in the live space)
// Screenshots go to test/artifacts/.

'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { makeFixture, startServer, findChrome, freePort, reporter } = require('./helpers');

const LIVE = process.argv.includes('--live'), ART = path.join(__dirname, 'artifacts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// WebGL in headless Chrome: the GPU locally; on CI runners (no GPU) the SwiftShader software renderer
// clicks that race the camera animation are only reliable at full frame rate, so CI (software rendering) skips them
const TIMING = !process.env.CI;
const GL = process.env.CI ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : ['--enable-gpu'];

(async () => {
  const chrome = findChrome(); if (!chrome) { console.log('e2e skipped: Chrome not found (set CHROME_PATH)'); return; }
  fs.mkdirSync(ART, { recursive: true });
  const t = reporter('e2e' + (LIVE ? ' (live)' : '')), fx = makeFixture();
  const srv = await startServer({ dirs: fx.dirs, home: fx.home, live: LIVE });
  const dbg = await freePort(), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-chrome-'));
  const ch = spawn(chrome, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, '--window-size=1600,950', ...GL, 'about:blank'], { stdio: 'ignore' });
  const end = () => { try { ch.kill(); } catch {} srv.stop(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {} fx.cleanup(); }, 1500); }; // Chrome may hold its profile for a moment after exit
  try {
    let target; for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find(x => x.type === 'page'); } catch {} }
    const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    let id = 0; const wait = new Map(), errs = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
    const cdp = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async x => { const r = await cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.result.result?.value; };
    const J = async x => JSON.parse(await ev(`JSON.stringify(${x})`));
    const shot = async n => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(ART, n + '.png'), Buffer.from(r.result.data, 'base64')); };
    const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); };
    const key = async (k, code) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
    const wheel = async (dy, n) => { for (let i = 0; i < n; i++) { await mouse('mouseWheel', 950, 480, { deltaX: 0, deltaY: dy }); await sleep(40); } };
    // in-page helpers: screen position of a point, distance from the centre of the free area between panels
    const H = `window.__h = { S: window.__prisma,
      scr(p) { const v = p.clone().project(this.S.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z < 1]; },
      free() { const L = document.querySelector('#left').offsetWidth + 10, R = document.querySelector('#right').style.display === 'flex' ? document.querySelector('#right').offsetWidth + 10 : 0; return [L + (innerWidth - L - R) / 2, innerHeight / 2]; },
      dev(p) { const a = this.scr(p), c = this.free(); return Math.round(Math.hypot(a[0] - c[0], a[1] - c[1])); },
      visibleCube(i) { const L = [...this.S.cubes.values()].filter(c => c.vis !== false && c.s > .3 && c.data).map(c => [c, this.scr(c.pos)]).filter(([, a]) => a[2] && a[0] > 340 && a[0] < 1250 && a[1] > 140 && a[1] < 780); const e = L[i % Math.max(1, L.length)]; return e ? { name: e[0].name, key: e[0].key, x: e[1][0], y: e[1][1] } : null; } }; 1`;
    const settle = async (min = 300) => { await sleep(min); let last = ''; for (let i = 0; i < 60; i++) { const p = await ev(`(() => { const S = window.__prisma; return S ? S.camera.position.toArray().concat(S.controls.target.toArray()).map(v => v.toFixed(2)).join() : ''; })()`); if (p && p === last) return; last = p; await sleep(250); } };
    const selState = () => J(`{ sel: window.__prisma.sel && window.__prisma.sel.key, panel: document.querySelector('#right').style.display, dev: window.__prisma.sel ? window.__h.dev(window.__prisma.sel.pos) : -1 }`);

    // ---- load ----
    const t0 = Date.now(); await cdp('Runtime.enable'); await cdp('Page.navigate', { url: srv.url });
    let first = null, all = null;
    for (let i = 0; i < (process.env.CI ? 360 : 60) && all == null; i++) { await sleep(250); const n = await ev(`window.__prisma ? [...window.__prisma.cubes.values()].filter(c => c.data).length : -1`); if (n > 0 && first == null) first = Date.now() - t0; if (n >= 8) all = Date.now() - t0; }
    t.ok('load: first cube with data', first != null && first < (process.env.CI ? 60000 : 6000), first + ' ms'); t.ok('load: eight cubes with data', all != null && all < (process.env.CI ? 90000 : 10000), all + ' ms');
    const wel = await ev("document.querySelector('#modal').style.display === 'flex' && !!document.querySelector('#wel-scr')"); t.ok('first run: welcome is shown', wel); await shot('00-welcome');
    await ev("document.querySelector('#modal [data-r]') && document.querySelector('#modal [data-r]').click()"); await sleep(300);
    t.ok('first run: live window images stay off unless allowed', await ev(`localStorage.getItem('prisma.welcome') === '1' && JSON.parse(localStorage.getItem('prisma.set')).screens === 0`) === true);
    await sleep(LIVE ? 6000 : 2000); await ev(H); await key('h', 'KeyH'); await settle(800); await shot('01-space');

    if (TIMING) { // ---- one click: select, centre, open the panel; a habitual double click changes nothing ----
    const c = await J('window.__h.visibleCube(0)'); t.ok('a cube is visible', !!c, c && c.name);
    if (c) { await click(c.x, c.y); await sleep(250); await click(c.x, c.y); await settle(1200); const r = await selState();
      t.ok('click: cube selected', r.sel === c.key, r.sel); t.ok('click: panel open', r.panel === 'flex'); t.ok('click: cube centred', r.dev >= 0 && r.dev < 60, r.dev + ' px off'); await shot('02-selected'); }

    // ---- levels: a double click goes inside a cube, Esc climbs back and stops at the top ----
    const dbl = async (x, y) => { await click(x, y); await mouse('mousePressed', x, y, { button: 'left', clickCount: 2 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 2 }); };
    await key('Escape', 'Escape'); await key('h', 'KeyH'); await settle(800);
    const lc = await J('window.__h.visibleCube(0)');
    if (lc) { const single = await ev('[...window.__prisma.cubes.values()].filter(c => c.vis !== false && c.depth > 0).length');
      t.ok('levels: only top-level cubes are shown', single === 0, single + ' children visible');
      await dbl(lc.x, lc.y); await sleep(2500); const inn = await J(`{ enter: window.__prisma.enter, kids: [...window.__prisma.cubes.values()].filter(c => c.vis !== false && c.key !== window.__prisma.enter).length, files: window.__prisma.IN.files.length, shell: window.__prisma.IN.dims.x, groups: window.__prisma.IN.groups.length }`);
      t.ok('levels: double click enters the cube', inn.enter === lc.key && inn.kids > 0, inn.kids + ' subfolders'); t.ok('levels: its files are cubes inside its case', inn.files > 0 && inn.shell > 1, inn.files + ' files · ' + inn.groups + ' clusters · case ' + (inn.shell || 0).toFixed(1)); await settle(800); await shot('02b-level');
      { const dir = await ev('window.__prisma.IN.path'); fs.writeFileSync(path.join(dir, 'nuevo.js'), '// nuevo\n'); fs.unlinkSync(path.join(dir, 'file0.js')); await sleep(3500);
        const live = await J(`{ born: window.__prisma.IN.files.some(f => /nuevo\\.js$/.test(f.path)), gone: !window.__prisma.IN.files.some(f => /file0\\.js$/.test(f.path) && !f.dead), traces: (window.__prisma.TRACES.get(window.__prisma.IN.path.toLowerCase()) || []).length }`);
        t.ok('levels: a new file is born inside and a deleted one leaves a trace', live.born && live.gone && live.traces === 1, JSON.stringify(live)); await shot('02c-live-changes'); }
      await key('Escape', 'Escape'); await sleep(600); const up = await ev('window.__prisma.enter'); await key('Escape', 'Escape'); await sleep(400); const up2 = await ev('window.__prisma.enter');
      t.ok('levels: Esc climbs back and stops at the top', up == null && up2 == null); }

    // ---- click on empty space deselects ----
    const em = await J(`(() => { for (let y = 760; y > 150; y -= 37) for (let x = 1180; x > 360; x -= 41) if (!window.__prisma.pickAt(x, y)) return [x, y]; return [1150, 760]; })()`);
    await click(em[0], em[1]); await sleep(800); const r3 = await selState(); t.ok('empty click: deselects and closes the panel', !r3.sel && r3.panel !== 'flex');

    // ---- race: four quick clicks on different cubes; the last one wins ----
    await key('h', 'KeyH'); await settle(800); const seq = [];
    for (let i = 0; i < 4; i++) { const q = await J(`window.__h.visibleCube(${i * 2 + 1})`); if (!q) continue; q.under = await ev(`window.__prisma.pickAt(${q.x}, ${q.y})`); seq.push(q); await click(q.x, q.y); await sleep(520); }
    await settle(1500); const r4 = await selState(), last = [...seq].reverse().find(q => q.under && q.under !== 'lp' && q.under !== 'obj');
    t.ok('rapid clicks: the last cube clicked stays selected', seq.length && (!last || r4.sel === last.under), seq.map(s => s.name).join(' → '));
    t.ok('rapid clicks: the camera ends centred on it', r4.dev >= 0 && r4.dev < 60, r4.dev + ' px off');
 } else console.log("  · skipped on CI: timing-sensitive clicks need a GPU");
    // ---- wheel zoom (towards the centre) ----
    const dist = () => ev('window.__prisma.camera.position.distanceTo(window.__prisma.controls.target)');
    const d0 = await dist(); await wheel(-120, 6); await sleep(900); const d1 = await dist(); await wheel(120, 12); await sleep(900); const d2 = await dist();
    t.ok('wheel: zooms in', d1 < d0 * .8, d0.toFixed(1) + ' → ' + d1.toFixed(1)); t.ok('wheel: zooms out', d2 > d1 * 1.5, d1.toFixed(1) + ' → ' + d2.toFixed(1));

    // ---- live space: a program cube is selectable ----
    if (LIVE) { await key('Escape', 'Escape'); await ev("fetch('/api/space', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Prisma': document.querySelector('meta[name=prisma]').content }, body: JSON.stringify({ action: 'switch', id: 'vivo' }) }).then(r => r.ok)"); await sleep(2500); await key('h', 'KeyH'); await sleep(3500); await shot('04-live'); // programs live in «En vivo», which is no longer the space the app opens on
      const p = await J(`(() => { const S = window.__prisma, C = S.camera.position.constructor; for (const o of S.LP.values()) { if (o.dead) continue; const a = window.__h.scr(new C(o.base.x, 3.2 + o.h / 2, o.base.z)); if (a[2] && a[0] > 340 && a[0] < 1250 && a[1] > 140 && a[1] < 780) return { id: o.id, x: a[0], y: a[1] }; } return null; })()`);
      if (p) { await click(p.x, p.y); await sleep(2200); const r5 = await J(`{ mode: window.__prisma.mode, lp: window.__prisma.lpSel && window.__prisma.lpSel.id }`); t.ok('live: program cube selected', r5.mode === 'lp' && r5.lp === p.id, JSON.stringify(r5) + ' · under ' + await ev('window.__prisma.pickAt(' + p.x + ',' + p.y + ')')); await shot('04-live'); } else t.ok('live: a program is visible', false); }

    // ---- fast view switching (V, T, A toggle with the space) ----
    for (const k of ['v', 't', 'a', 'v', 'a', 't', 'v']) { await key(k, 'Key' + k.toUpperCase()); await sleep(120); } await sleep(3000);
    const v1 = await ev(`document.querySelector('#view .on').dataset.v`); t.ok('fast view switching settles on the right view', v1 === 'espacio', v1);
    await key('v', 'KeyV'); await sleep(2000); t.ok('V opens the system view', await ev(`document.querySelector('#view .on').dataset.v`) === 'sistema'); await shot('05-system'); await key('v', 'KeyV'); await sleep(1500);
    await key('t', 'KeyT'); await sleep(5000); t.ok('T opens the tasks view', await ev(`document.querySelector('#view .on').dataset.v`) === 'tareas'); await shot('06-tasks'); await key('t', 'KeyT'); await sleep(1500);

    if (TIMING) { // ---- tree: one click expands or collapses and keeps the folder centred ----
    await key('a', 'KeyA'); await sleep(1200); await ev(`window.__prisma.trOpen(${JSON.stringify(fx.work)})`); await settle(3000); await ev(H);
    const tn = await J(`(() => { const S = window.__prisma, n = S.TR.list.find(n => n.depth === 1 && n.k); if (!n) return null; const a = window.__h.scr(n.pos); return { key: n.key, name: n.name, open: n.open, x: a[0], y: a[1] }; })()`);
    if (tn) { await click(tn.x, tn.y); await settle(1500); const a1 = await J(`(() => { const n = window.__prisma.TR.nodes.get(${JSON.stringify(tn.key)}); return { open: n.open, dev: window.__h.dev(n.tgt) }; })()`);
      t.ok('tree: one click toggles the folder', a1.open !== tn.open, tn.name); t.ok('tree: folder stays centred', a1.dev < 60, a1.dev + ' px off'); await shot('03-tree');
      for (let k = 0; k < 2; k++) { const b = await J(`(() => { const a = window.__h.scr(window.__prisma.TR.nodes.get(${JSON.stringify(tn.key)}).pos); return { x: a[0], y: a[1] }; })()`); await click(b.x, b.y); await sleep(600); }
      await sleep(3000); t.ok('tree: two quick clicks leave it as it was', (await J(`{ open: window.__prisma.TR.nodes.get(${JSON.stringify(tn.key)}).open }`)).open === a1.open); }
    else t.ok('tree: a folder is visible', false);
 } else console.log("  · skipped on CI: timing-sensitive clicks need a GPU");
    // ---- search box completes a path ----
    await key('a', 'KeyA'); await sleep(1500); const box = await J(`(() => { const r = document.querySelector('#path').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; })()`);
    await click(box[0], box[1]); await sleep(200); await cdp('Input.insertText', { text: fx.work + path.sep }); await sleep(1500);
    const nres = await ev(`document.querySelectorAll('#srch [data-i]').length`); t.ok('search: suggests folders', nres > 0, nres + ' results'); await key('Escape', 'Escape');

    // ---- assistant: a permission request shows its diff and is answered from the page ----
    const permCard = await ev(`(() => { try { const A = window.__prisma.asst; A.state.account = 'default'; A.on({ k: 'assistant', account: 'default', type: 'permission', id: 'e2e', tool: 'Edit', preview: { path: 'C:/x/a.js', before: 'uno\\ndos\\ntres', after: 'uno\\nDOS\\ntres' } });
      const el = document.querySelector('#asst .al.perm'); const r = { del: el.querySelectorAll('.del').length, add: el.querySelectorAll('.add').length, buttons: el.querySelectorAll('.pa button').length };
      A.on({ k: 'assistant', account: 'default', type: 'decided', id: 'e2e', allow: false }); r.done = el.classList.contains('denied'); return r; } catch (er) { return String(er); } })()`);
    t.ok('assistant: permission card shows the diff and its answer', permCard && permCard.del === 1 && permCard.add === 1 && permCard.buttons === 2 && permCard.done, JSON.stringify(permCard));

    // ---- reload without errors ----
    await cdp('Page.reload'); await sleep(6000); t.ok('reload without script errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    ws.close();
  } catch (e) { t.ok('no exception', false, e.stack); }
  finally { end(); t.done(); }
})();
