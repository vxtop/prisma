#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Development runner with hot reload.
//   node scripts/dev.js [--port 4828] [server flags...]
// - Client files (public/): the server itself pushes a reload event; styles are swapped without reloading the page.
// - Server files: the server is restarted, but only once no assistant turn is running, so a change Claude makes
//   from the prompt bar never cuts its own answer short. The page reconnects and reloads by itself.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { fork } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER_FILES = ['server.js', 'assistant.js', 'mcp.js', 'indexer.js', 'pshost.ps1'];
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const PORT = portIndex >= 0 ? +args[portIndex + 1] : 4828;
const serverArgs = [...(portIndex >= 0 ? [] : ['--port', String(PORT)]), ...args, '--dev', '--no-open'];

let child = null, pending = false, restarting = false, retryDelay = 1000;

function start() {
  child = fork(path.join(ROOT, 'server.js'), serverArgs, { cwd: ROOT, stdio: 'inherit' });
  child.on('exit', code => {
    if (restarting) return;
    child = null;
    retryDelay = Math.min(retryDelay * 2, 30000);
    console.log(`[dev] el servidor terminó (código ${code}); se relanza en ${retryDelay / 1000} s`);
    setTimeout(() => { if (!child && !restarting) start(); }, retryDelay);
  });
  setTimeout(() => { if (child) retryDelay = 1000; }, 10000).unref(); // running for 10 s: back to a short delay
}

function token() {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.prisma', 'token'), 'utf8')).ports[PORT] || ''; } catch { return ''; }
}

async function assistantBusy() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/assistant/busy?t=${token()}`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? (await r.json()).busy === true : false;
  } catch { return false; }
}

/** A server that does not parse would take the prompt bar down with it: keep the running one instead. */
function syntaxErrors() {
  const { spawnSync } = require('child_process');
  return SERVER_FILES.filter(n => n.endsWith('.js') && fs.existsSync(path.join(ROOT, n)))
    .map(n => ({ n, r: spawnSync(process.execPath, ['--check', path.join(ROOT, n)], { encoding: 'utf8' }) }))
    .filter(x => x.r.status !== 0).map(x => `${x.n}: ${(x.r.stderr || '').trim().split('\n').slice(0, 4).join(' ')}`);
}

async function restart() {
  if (restarting || !pending) return;
  if (child && await assistantBusy()) return; // try again on the next tick
  pending = false;
  const errors = syntaxErrors();
  if (errors.length && child) { console.log('[dev] no se reinicia: hay errores de sintaxis\n  ' + errors.join('\n  ')); return; }
  restarting = true;
  console.log('[dev] reiniciando el servidor…');
  if (child) {
    const old = child;
    await new Promise(resolve => {
      old.once('exit', resolve);
      try { old.send('shutdown'); } catch { old.kill(); }
      setTimeout(() => old.kill(), 5000).unref();
    });
  }
  restarting = false;
  start();
}

// watch the folder, not each file: editors (and Claude) save by replacing the file, which silences a per-file watcher
fs.watch(ROOT, (_event, name) => { if (name && SERVER_FILES.includes(String(name))) pending = true; });
setInterval(restart, 1000);
process.on('SIGINT', () => { if (child) { restarting = true; try { child.send('shutdown'); } catch {} } setTimeout(() => process.exit(0), 500); });

console.log(`[dev] http://127.0.0.1:${PORT}/  ·  recarga en caliente activa`);
start();
