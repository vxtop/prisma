// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Visual bench: the same scene, the same moments, at full resolution, every time — so a visual change can be judged
// against the previous run instead of from memory. Nothing is asserted; it produces pictures and a contact sheet.
//   node test/look.js [--label nombre] [--scale 1|2] [--quick]   (--quick: only the first shots of the static space)
// - A throwaway tree with one example of every kind of thing (folder, code, data, text, image, video, audio, PDF,
//   3D model, web page, font, archive, executable), on an isolated server (the live space watches this machine).
// - Shots: the static space (overview, a folder selected, its ring, a file selected, each viewer) and «En vivo»
//   (overview, the core, a selection with its floating card).
// - Output: test/artifacts/look/<run>/NN-name.png and test/artifacts/look/index.html with this run beside the last one.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { ROOT, makeFixture, startServer, findChrome, freePort } = require('./helpers');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SCALE = +arg('--scale', 1), W = 1920, H = 1080, LABEL = arg('--label', ''), QUICK = process.argv.includes('--quick');
const OUT = path.join(__dirname, 'artifacts', 'look'), RUN = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15) + (LABEL ? '-' + LABEL.replace(/[^\w-]+/g, '') : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** One example of every kind of file, small and generated (or copied from the repo). */
function samples(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const w = (n, d) => fs.writeFileSync(path.join(dir, n), d);
  w('README.md', '# Muestras\n\nUn ejemplo de cada tipo de cosa para ver cómo se muestra en Prisma.\n\n- código: `app.js`\n- datos: `datos.json`, `tabla.csv`\n');
  w('app.js', "import { datos } from './datos.json';\n// lee los datos y los pinta\nexport function main() {\n  const n = datos.length;\n  for (let i = 0; i < n; i++) console.log(i, datos[i]);\n  return n;\n}\n");
  w('datos.json', JSON.stringify({ nombre: 'muestra', version: 3, activo: true, partes: ['a', 'b', 'c'], medidas: { ancho: 12, alto: 7 } }, null, 2));
  w('tabla.csv', 'mes,ventas,coste\nenero,120,80\nfebrero,135,82\nmarzo,160,90\nabril,150,95\n');
  w('index.html', '<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><title>Muestra</title><link rel="stylesheet" href="estilo.css"></head>\n<body><h1>Página de muestra</h1><p>Una web pequeña.</p><script src="app.js"></script></body></html>\n');
  w('estilo.css', 'body { font: 16px system-ui; background: #0b0d11; color: #f0ebdd; }\nh1 { color: #47d4ff; }\n');
  for (const n of ['hero.png', 'demo.mp4', 'logo.svg']) { const s = path.join(ROOT, 'docs', 'assets', n); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(dir, n)); }
  { const sr = 22050, n = sr * 2, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) { const t = i / sr, env = Math.sin(Math.PI * t / 2); b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 330 * t) * Math.sin(2 * Math.PI * 1.5 * t) * env * 22000), 44 + i * 2); } w('tono.wav', b); }
  { const txt = 'BT /F1 28 Tf 72 720 Td (Documento de muestra) Tj ET', objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${txt.length} >>\nstream\n${txt}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let pdf = '%PDF-1.4\n'; const off = []; objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = pdf.length; pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`; w('documento.pdf', pdf); }
  { let v = '', f = ''; const P = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 2.2, 0]]; P.forEach(p => { v += `v ${p.join(' ')}\n`; });
    [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [4, 3, 7, 8], [1, 4, 8, 5]].forEach(q => { f += `f ${q.join(' ')}\n`; }); [[4, 3, 9], [3, 7, 9], [7, 8, 9], [8, 4, 9]].forEach(q => { f += `f ${q.join(' ')}\n`; }); w('casa.obj', v + f); }
  { const font = ['C:/Windows/Fonts/segoeui.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].find(p => fs.existsSync(p)); if (font) fs.copyFileSync(font, path.join(dir, 'fuente.ttf')); }
  w('archivo.zip', Buffer.from('504b0506000000000000000000000000000000000000', 'hex')); // an empty zip
  { const b = Buffer.alloc(4096); b.write('MZ', 0); b.writeUInt32LE(0x80, 0x3c); b.write('PE\0\0', 0x80, 'binary'); w('herramienta.exe', b); }
  return fs.readdirSync(dir).map(n => path.join(dir, n));
}

(async () => {
  const chrome = findChrome(); if (!chrome) { console.log('look: Chrome not found (set CHROME_PATH)'); return; }
  const fx = makeFixture(), mdir = path.join(fx.work, 'muestras'), files = samples(mdir), dirOut = path.join(OUT, RUN); fs.mkdirSync(dirOut, { recursive: true });
  const srv = await startServer({ home: fx.home, live: true });
  const api = (p, d) => fetch(srv.url.replace(/\/$/, '') + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Prisma': srv.token }, body: JSON.stringify(d) }).then(r => r.json());
  const dbg = await freePort(), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-look-'));
  const GL = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : ['--enable-gpu'];
  const ch = spawn(chrome, ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, `--force-device-scale-factor=${SCALE}`, '--hide-scrollbars', ...GL, 'about:blank'], { stdio: 'ignore' });
  const shots = [];
  const end = code => { try { ch.kill(); } catch {} srv.stop(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {} fx.cleanup(); process.exit(code); }, 800); };
  try {
    let tab; for (let i = 0; i < 40 && !tab; i++) { await sleep(250); try { tab = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find(x => x.type === 'page'); } catch {} }
    const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
    let id = 0; const pend = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') console.log('  ! página: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | ')); });
    const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async x => { const r = await cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) console.log('  ! ' + (r.result.exceptionDetails.exception || {}).description); return r.result.result?.value; };
    const key = async (k, code) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
    const settle = async (min = 600) => { await sleep(min); let last = ''; for (let i = 0; i < 50; i++) { const p = await ev('window.__prisma ? window.__prisma.camera.position.toArray().map(v => v.toFixed(2)).join() : ""'); if (p === last) return; last = p; await sleep(160); } };
    const shot = async (name, note) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); const n = String(shots.length + 1).padStart(2, '0') + '-' + name + '.png'; fs.writeFileSync(path.join(dirOut, n), Buffer.from(r.result.data, 'base64')); shots.push([n, note]); console.log('  · ' + n); };
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('prisma.welcome','1');" }); // skip the first-run welcome
    await cdp('Page.navigate', { url: srv.url });
    for (let i = 0; i < 80; i++) { await sleep(250); if (await ev('!!(window.__prisma && window.__prisma.selectObjR)')) break; }
    console.log('\nlook · ' + RUN + '\n');

    // ---- the static space: one folder of examples, the fixture project beside it ----
    await api('/api/space', { action: 'new', name: 'Muestrario' });
    for (const p of [mdir, path.join(fx.work, 'app'), path.join(fx.work, 'docs')]) await api('/api/open', { path: p, here: true, root: true, quiet: true });
    for (let i = 0; i < 40; i++) { await sleep(250); if (await ev('[...window.__prisma.cubes.values()].filter(c => c.data).length >= 3')) break; }
    await ev(`(async () => { for (const f of ${JSON.stringify(files.filter(f => !/estilo\.css$/.test(f)))}) { await window.__prisma.openObject(f, false); await new Promise(r => setTimeout(r, 120)); } window.__prisma.OB.sel = null; })()`);
    await sleep(1500); await key('Escape', 'Escape'); await key('h', 'KeyH'); await settle(1200);
    await shot('estatico-vista-general', 'Espacio estático: carpetas y archivos como cubos de grafeno');
    await ev(`window.__prisma.selectCubeR([...window.__prisma.cubes.values()].find(c => /muestras$/i.test(c.path)))`); await settle(900);
    await shot('carpeta-menu', 'Carpeta seleccionada con su menú contextual');
    await key('Escape', 'Escape'); await sleep(300);
    { const xy = await ev(`(() => { const S = window.__prisma, c = [...S.cubes.values()].find(c => /muestras$/i.test(c.path)), v = c.pos.clone().project(S.camera); return [(v.x * .5 + .5) * innerWidth, (-v.y * .5 + .5) * innerHeight]; })()`);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: xy[0] + 3, y: xy[1] + 3 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: xy[0], y: xy[1] }); await sleep(900);
      await shot('carpeta-desplegada', 'El cursor sobre un cubo de 27 despliega sus celdas'); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 400 }); await sleep(300); }
    const sel = async (ext, name, note, view) => { await ev(`window.__prisma.selectObjR(window.__prisma.OB.list.find(o => o.info.ext === '${ext}'))`); await settle(900);
      if (!view) { await ev(`document.getElementById('ctx').style.display = 'none'`); await shot(name, note); return; }
      await key('Escape', 'Escape'); await key('Enter', 'Enter'); await settle(1200); await shot(name, note); await key('Escape', 'Escape'); await settle(700); };
    await sel('png', 'archivo-imagen-seleccionado', 'Archivo seleccionado: su contenido flota sobre el cubo');
    if (!QUICK) {
    for (const [ext, n] of [['md', 'texto'], ['js', 'codigo'], ['json', 'datos'], ['csv', 'tabla'], ['png', 'imagen'], ['mp4', 'video'], ['wav', 'audio'], ['pdf', 'pdf'], ['obj', 'modelo-3d'], ['html', 'web'], ['ttf', 'fuente'], ['exe', 'ejecutable']])
      if (await ev(`!!window.__prisma.OB.list.find(o => o.info.ext === '${ext}')`)) await sel(ext, 'visor-' + n, 'Visor: ' + n, true);

    // ---- inside a folder ----
    await key('Escape', 'Escape'); await ev(`window.__prisma.selectCubeR([...window.__prisma.cubes.values()].find(c => /muestras$/i.test(c.path)))`); await sleep(500); await key('Escape', 'Escape'); await key('Enter', 'Enter'); await settle(2200);
    await shot('dentro-carpeta', 'Dentro de una carpeta: sus archivos como cubos');
    await key('Escape', 'Escape'); await settle(900);

    // ---- the other views ----
    await key('a', 'KeyA'); await sleep(1200); await ev(`window.__prisma.trOpen(${JSON.stringify(fx.work)})`); await settle(3000); await shot('vista-arbol', 'Vista Árbol');
    await key('v', 'KeyV'); await settle(5000); await shot('vista-sistema', 'Vista Sistema');
    await key('t', 'KeyT'); await settle(5000); await shot('vista-tareas', 'Vista Tareas');
    await ev(`window.__prisma.setView('espacio')`); await settle(1200);

    // ---- «En vivo» ----
    await key('Escape', 'Escape'); await api('/api/space', { action: 'switch', id: 'vivo' }); await sleep(5000); await key('h', 'KeyH'); await settle(1500);
    await shot('vivo-vista-general', '«En vivo»: mesa, núcleo, programas y carpetas activas');
    await ev(`(() => { const S = window.__prisma; S.controls.target.set(0, 4.8, 0); S.camera.position.set(0, 9, 11); S.controls.update(); })()`); await sleep(1200);
    await shot('vivo-nucleo', 'El núcleo: CPU, RAM, GPU y disco');
    await key('h', 'KeyH'); await settle(1200); await ev(`(() => { const S = window.__prisma, c = [...S.cubes.values()].find(c => c.vis !== false && c.data); if (c) { S.selectCubeR(c); document.getElementById('ctx').style.display = 'none'; } })()`); await settle(1200);
    await shot('vivo-seleccion', 'Selección en «En vivo» con su ficha flotante');

    }
    // ---- contact sheet: this run beside the previous one ----
    fs.writeFileSync(path.join(dirOut, 'shots.json'), JSON.stringify(shots));
    const runs = fs.readdirSync(OUT).filter(n => fs.existsSync(path.join(OUT, n, 'shots.json'))).sort(), prev = runs[runs.length - 2];
    const prevShots = prev ? JSON.parse(fs.readFileSync(path.join(OUT, prev, 'shots.json'), 'utf8')) : [];
    const find = n => prevShots.find(([m]) => m.replace(/^\d+-/, '') === n.replace(/^\d+-/, ''));
    const html = `<!doctype html><meta charset="utf-8"><title>Banco visual · ${RUN}</title><style>body{margin:0;background:#0b0d11;color:#f0ebdd;font:14px system-ui}h1{font-size:18px;margin:16px}
section{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px 22px}h2{grid-column:1/-1;font-size:14px;margin:8px 0 0;color:#47d4ff}figure{margin:0}img{width:100%;border:1px solid #2a3040;border-radius:6px}figcaption{color:#8a93a0;font-size:12px;margin-top:4px}</style>
<h1>Banco visual — ${RUN}${prev ? ' · comparado con ' + prev : ''}</h1>` + shots.map(([n, note]) => { const p = find(n);
      return `<section><h2>${n.replace(/\.png$/, '')} — ${note}</h2><figure><img src="${RUN}/${n}"><figcaption>ahora · ${RUN}</figcaption></figure>${p ? `<figure><img src="${prev}/${p[0]}"><figcaption>antes · ${prev}</figcaption></figure>` : '<figure><figcaption>sin captura anterior</figcaption></figure>'}</section>`; }).join('');
    fs.writeFileSync(path.join(OUT, 'index.html'), html);
    console.log(`\n  ${shots.length} capturas · ${path.join(OUT, 'index.html')}\n`); end(0);
  } catch (e) { console.log('look failed:', e.stack || e); end(1); }
})();
