// SPDX-License-Identifier: Apache-2.0
//
// Assistant bridge: talks to Claude through the Claude Code CLI the user already has installed and logged in
// (standalone, or the copy Claude Desktop downloads for its Code tab). No API keys, no login screen.
//
// Isolation: Claude runs in restricted mode inside an empty workspace folder. It has no built-in tool that
// executes commands and its file tools only reach that workspace. The only way it sees the computer is the
// read-only MCP server of this application (mcp.js), so whatever it inspects also appears in the 3D space.
'use strict';
const fs = require('fs'), fsp = fs.promises, os = require('os'), path = require('path');
const { spawn, execFile } = require('child_process');

const WIN = process.platform === 'win32';
const EXE = WIN ? 'claude.exe' : 'claude';
const STATE_DIR = path.join(os.homedir(), '.prisma', 'assistant');
const WORKSPACE = path.join(STATE_DIR, 'workspace');
const SESSIONS_FILE = path.join(STATE_DIR, 'sessions.json');
const MCP_SERVER = path.join(__dirname, 'mcp.js');
const DETECT_TTL_MS = 30000;
const MAX_MESSAGE = 20000;

const SYSTEM_PROMPT = `You are the assistant inside a 3D observatory of the user's computer. The user sees a black space where folders are cubes and programs float above them, and everything you inspect lights up in front of them.

- You can only observe, never change the computer. Use the observatory tools (mcp__prisma__*): prisma_ls, prisma_cube, prisma_file, prisma_meta, prisma_system, prisma_tasks, prisma_pulse, prisma_observe.
- Arrange the view freely: prisma_space creates, switches, renames and closes spaces (a new space is a clean stage for what the user asked), prisma_layout reorders cubes.
- Show, do not just tell: when you talk about a folder, open it as a cube with prisma_open (expand=true to show its subfolders) and bring it into view with prisma_focus. Close cubes you no longer need with prisma_close.
- Paths are absolute. The user's home folder is ${os.homedir()}.
- Answer in the user's language, briefly, and say which cubes you opened.`;

const workPrompt = dir => `You are the assistant inside a 3D observatory of the user's computer, and the user has asked you to work on the folder ${dir}.

- You can read and edit files inside that folder only. You cannot run commands or programs.
- Before changing anything, read the project's own conventions (CLAUDE.md, CONTRIBUTING.md, README) and follow them.
- Make focused, consistent changes. The application reloads the interface when its files change and restarts its
  server when no turn is running, so the user sees each change within seconds.
- You can still observe the computer with the observatory tools (mcp__prisma__*).
- Answer in the user's language, briefly, and end with the list of files you changed.`;

/** A folder Claude may edit: absolute, existing, and never a drive root or the home folder itself. */
function checkWorkdir(dirIn) {
  const raw = String(dirIn || '');
  if (!raw || !path.isAbsolute(raw)) throw new Error('Indica una carpeta absoluta');
  const p = path.resolve(raw);
  let st;
  try { st = fs.statSync(p); } catch { throw new Error('Esa carpeta no existe'); }
  if (!st.isDirectory()) throw new Error('No es una carpeta');
  const lower = p.toLowerCase();
  if (path.parse(p).root.toLowerCase() === lower || lower === os.homedir().toLowerCase()) throw new Error('Por seguridad no se puede trabajar en la raíz de una unidad ni en la carpeta personal entera');
  return p;
}

// ---------- Detection ----------

const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

function versionOf(exe) {
  return new Promise(resolve => execFile(exe, ['--version'], { timeout: 15000, windowsHide: true },
    (error, stdout) => resolve(error ? null : String(stdout).trim().split(/\r?\n/)[0])));
}

/** Highest-versioned `claude` binary inside a folder of version subfolders (how Claude Desktop stores it). */
function newestIn(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return null; }
  const found = names.map(n => path.join(dir, n, EXE)).filter(exists);
  return found.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0] || null;
}

function candidates() {
  const home = os.homedir(), list = [];
  const add = (kind, p) => { if (p && exists(p) && !list.some(x => x.path.toLowerCase() === p.toLowerCase())) list.push({ kind, path: p }); };
  if (process.env.CLAUDE_PATH) add('cli', process.env.CLAUDE_PATH);
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) if (dir) add('cli', path.join(dir, EXE));
  add('cli', path.join(home, '.local', 'bin', EXE));
  add('cli', path.join(home, '.claude', 'local', EXE));
  if (WIN) {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    add('desktop', newestIn(path.join(appData, 'Claude', 'claude-code')));
    let packages = [];
    try { packages = fs.readdirSync(path.join(local, 'Packages')).filter(n => /^Claude_/i.test(n)); } catch {}
    for (const pkg of packages) add('desktop', newestIn(path.join(local, 'Packages', pkg, 'LocalCache', 'Roaming', 'Claude', 'claude-code')));
  } else if (process.platform === 'darwin') {
    add('desktop', newestIn(path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code')));
  }
  return list;
}

function desktopInstalled() {
  if (!WIN) return exists('/Applications/Claude.app');
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  try { if (fs.readdirSync(path.join(local, 'Packages')).some(n => /^Claude_/i.test(n))) return true; } catch {}
  return exists(path.join(local, 'AnthropicClaude'));
}

/**
 * Accounts are Claude Code configuration folders: ~/.claude (default) and any ~/.claude-* used with
 * CLAUDE_CONFIG_DIR. Only the display fields of the profile are read; credentials are never opened.
 */
function accounts() {
  const home = os.homedir(), out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(home, { withFileTypes: true }).filter(d => d.isDirectory() && /^\.claude(-[\w.-]+)?$/.test(d.name)).map(d => d.name); } catch {}
  for (const name of dirs.sort()) {
    const dir = path.join(home, name), isDefault = name === '.claude';
    const profile = readJson(isDefault ? path.join(home, '.claude.json') : path.join(dir, '.claude.json')) || {};
    const account = profile.oauthAccount || {};
    const loggedIn = exists(path.join(dir, '.credentials.json')) || !!account.emailAddress;
    out.push({
      id: isDefault ? 'default' : name.slice('.claude-'.length),
      configDir: isDefault ? null : dir,
      email: account.emailAddress || null,
      name: account.displayName || account.fullName || null,
      organization: account.organizationName || null,
      loggedIn,
    });
  }
  return out;
}

let detected = null;
async function detect(force = false) {
  if (!force && detected && Date.now() - detected.at < DETECT_TTL_MS) return detected;
  const installs = await Promise.all(candidates().map(async c => ({ ...c, version: await versionOf(c.path) })));
  const working = installs.filter(i => i.version);
  detected = { at: Date.now(), installs: working, desktop: desktopInstalled(), accounts: accounts() };
  return detected;
}

// ---------- Conversations ----------

const running = new Map(); // account id -> child process
const MAX_HISTORY = 300;
const history = new Map(); // account id -> compact transcript, replayed when a page (re)connects

function remember(ev) {
  const list = history.get(ev.account) || [];
  const last = list[list.length - 1];
  if (ev.type === 'text' && last && last.type === 'text') last.text += ev.text;
  else if (ev.type !== 'model') list.push({ ...ev });
  if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
  history.set(ev.account, list);
}
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch {}
const saveSessions = () => fsp.mkdir(STATE_DIR, { recursive: true }).then(() => fsp.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2))).catch(() => {});

/** Absolute path a file tool works on, so the client can light it up in the space. */
function absoluteInput(input = {}, dir) {
  const p = input.file_path || input.path;
  return p && dir ? path.resolve(dir, String(p)) : null;
}

function summarizeInput(input = {}) {
  return String(input.path || input.file_path || input.pattern || input.query || input.mode || [input.action, input.name].filter(Boolean).join(' ') || '').slice(0, 300);
}

/**
 * Sends one message to Claude and streams what happens through `emit` as `{ k: 'assistant', type, ... }` events:
 * start, text, tool, notice, end.
 */
// ---------- Permissions ----------
// Work mode uses Claude Code's own permission modes. In "ask", every prompt the CLI would show in a terminal is routed
// through --permission-prompt-tool to the prisma_permission MCP tool, which waits here for the user's answer.
const PERMISSION_MODES = { ask: 'default', accept: 'acceptEdits', plan: 'plan' };
const PERMISSION_TIMEOUT_MS = 15 * 60 * 1000;
const pending = new Map(); // permission id -> { account, resolve, timer }
let permissionSeq = 0;
let broadcast = () => {};

function previewOf(tool, input = {}) {
  const cut = (v, n = 6000) => String(v == null ? '' : v).slice(0, n);
  if (tool === 'Edit') return { path: input.file_path, before: cut(input.old_string), after: cut(input.new_string), all: !!input.replace_all };
  if (tool === 'Write') return { path: input.file_path, after: cut(input.content) };
  if (tool === 'NotebookEdit') return { path: input.notebook_path, after: cut(input.new_source) };
  return { detail: cut(JSON.stringify(input, null, 1), 2000) };
}

/** Called by the MCP permission tool; resolves with Claude Code's expected answer once the user decides. */
function requestPermission({ account, tool, input }) {
  const id = 'p' + (++permissionSeq);
  return new Promise(resolve => {
    const timer = setTimeout(() => decide(id, false, 'Sin respuesta del usuario'), PERMISSION_TIMEOUT_MS);
    pending.set(id, { account, resolve: answer => resolve(answer), timer, input });
    const ev = { k: 'assistant', account, type: 'permission', id, tool, preview: previewOf(tool, input) };
    remember(ev); broadcast(ev);
  });
}

function decide(id, allow, message) {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id); clearTimeout(p.timer);
  p.resolve(allow ? { behavior: 'allow', updatedInput: p.input } : { behavior: 'deny', message: message || 'El usuario lo ha denegado' });
  const ev = { k: 'assistant', account: p.account, type: 'decided', id, allow: !!allow };
  remember(ev); broadcast(ev);
  return true;
}

function denyPending(account) { for (const [id, p] of pending) if (p.account === account) decide(id, false, 'El turno terminó'); }

async function ask({ message, account: accountId = 'default', fresh = false, workdir = null, permission = 'ask', port }, send) {
  broadcast = send;
  const emit = ev => { remember(ev); send(ev); };
  const text = String(message || '').trim();
  if (!text) throw new Error('Mensaje vacío');
  if (text.length > MAX_MESSAGE) throw new Error('Mensaje demasiado largo');
  const info = await detect();
  const install = info.installs[0];
  if (!install) throw new Error(info.desktop ? 'Claude Desktop está instalado pero falta Claude Code: ábrelo una vez en la pestaña Code o instala Claude Code.' : 'No se encuentra Claude Code en este equipo.');
  const account = info.accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Esa cuenta de Claude no existe');
  if (!account.loggedIn) throw new Error('Esa cuenta no tiene sesión iniciada: ejecuta claude y usa /login.');
  if (running.has(account.id)) throw new Error('Claude ya está respondiendo con esta cuenta');

  const dir = workdir ? checkWorkdir(workdir) : null;
  const sessionKey = dir ? `${account.id}|${dir.toLowerCase()}` : account.id;
  await fsp.mkdir(WORKSPACE, { recursive: true });
  if (fresh) history.delete(account.id);
  const session = fresh ? null : sessions[sessionKey] || null;
  const mode = PERMISSION_MODES[permission] ? permission : 'ask';
  const mcp = { mcpServers: { prisma: { command: process.execPath, args: [MCP_SERVER], env: { PRISMA_PORT: String(port), PRISMA_NO_SPAWN: '1', PRISMA_ACCOUNT: account.id } } } };
  const args = ['-p', text, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--restricted', '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp),
    ...(dir ? ['--tools', 'Read,Write,Edit,Glob,Grep', '--permission-mode', PERMISSION_MODES[mode], ...(mode === 'ask' ? ['--permission-prompt-tool', 'mcp__prisma__prisma_permission'] : [])] : ['--tools', '']),
    '--allowedTools', 'mcp__prisma', '--append-system-prompt', dir ? workPrompt(dir) : SYSTEM_PROMPT];
  if (session) args.push('--resume', session);
  const env = { ...process.env };
  if (account.configDir) env.CLAUDE_CONFIG_DIR = account.configDir; else delete env.CLAUDE_CONFIG_DIR;

  const child = spawn(install.path, args, { cwd: dir || WORKSPACE, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  running.set(account.id, child);
  const base = { k: 'assistant', account: account.id };
  emit({ ...base, type: 'start', message: text, workdir: dir, permission: dir ? mode : null, install: install.kind, version: install.version });

  let buffer = '', stderr = '', result = null, sessionId = session;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (let n = buffer.indexOf('\n'); n >= 0; n = buffer.indexOf('\n')) {
      const line = buffer.slice(0, n).trim(); buffer = buffer.slice(n + 1);
      if (!line) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.session_id) sessionId = ev.session_id;
      if (ev.type === 'system' && ev.subtype === 'init') {
        for (const s of ev.mcp_servers || []) if (s.status !== 'connected') emit({ ...base, type: 'notice', text: `El observatorio no está disponible para Claude (${s.status})` });
        if (ev.model) emit({ ...base, type: 'model', model: ev.model });
      } else if (ev.type === 'stream_event' && ev.event && ev.event.type === 'content_block_delta' && ev.event.delta && ev.event.delta.type === 'text_delta') {
        emit({ ...base, type: 'text', text: ev.event.delta.text });
      } else if (ev.type === 'assistant') {
        for (const b of (ev.message && ev.message.content) || []) if (b.type === 'tool_use') emit({ ...base, type: 'tool', tool: String(b.name).replace(/^mcp__prisma__/, ''), detail: summarizeInput(b.input), path: absoluteInput(b.input, dir) });
      } else if (ev.type === 'result') result = ev;
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-3000); });
  child.on('error', e => { stderr += e.message; });
  child.on('close', code => {
    running.delete(account.id);
    denyPending(account.id);
    if (sessionId) { sessions[sessionKey] = sessionId; saveSessions(); }
    const failed = (result && result.is_error) || (!result && code !== 0);
    if (failed) emit({ ...base, type: 'notice', error: true, text: (result && result.result) || stderr.trim() || `Claude terminó con código ${code}` });
    emit({ ...base, type: 'end', ok: !failed });
  });
}

function cancel(accountId) {
  const child = running.get(accountId);
  if (child) child.kill();
  return !!child;
}

async function status() {
  const info = await detect();
  return {
    installs: info.installs.map(({ kind, path: p, version }) => ({ kind, path: p, version })),
    desktop: info.desktop,
    accounts: info.accounts.map(({ configDir, ...a }) => ({ ...a, busy: running.has(a.id), resumable: !!sessions[a.id], history: history.get(a.id) || [] })),
  };
}

const isBusy = () => running.size > 0;

/** Stops every running turn: called when the server exits so no Claude process outlives it. */
function stopAll() { for (const child of running.values()) { try { child.kill(); } catch {} } running.clear(); }

module.exports = { ask, cancel, status, detect, isBusy, stopAll, requestPermission, decide };
