#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Prisma MCP server (stdio): lets an AI open directories as cubes and observe what prisma monitors.
// Read-only on the directories. No dependencies.
//   claude mcp add prisma -- node /path/to/mcp.js
'use strict';
const path = require('path'), { spawn } = require('child_process');
const BASE = `http://127.0.0.1:${+process.env.PRISMA_PORT || 4828}`, os = require('os'), fs = require('fs');
const tok = () => { try { const o = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.prisma', 'token'), 'utf8')), p = +process.env.PRISMA_PORT || 4828; return (o.ports && o.ports[p]) || o.token; } catch { return ''; } };
const T = u => u + (u.includes('?') ? '&' : '?') + 't=' + tok();

const P = (props, required = []) => ({ type: 'object', properties: props, required });
const dir = { type: 'string', description: 'Ruta absoluta del directorio' };
const TOOLS = [
  { name: 'prisma_open', description: 'Abre un directorio como cubo en Prisma (solo lectura). Con expand=true despliega también sus subdirectorios como cubos hijos.', inputSchema: P({ path: dir, expand: { type: 'boolean' } }, ['path']), call: a => api('POST', '/api/open', { path: a.path, expand: !!a.expand, by: 'ia' }) },
  { name: 'prisma_close', description: 'Cierra un cubo y sus descendientes. No toca el directorio.', inputSchema: P({ path: dir }, ['path']), call: a => api('POST', '/api/close', { path: a.path, by: 'ia' }) },
  { name: 'prisma_observe', description: 'Resumen de todo lo observado: sistema (CPU/RAM/GPU), cubos abiertos, sus 27 celdas (tipo × profundidad × tiempo), git, archivos recientes y actividad de agentes.', inputSchema: P({}), call: () => api('GET', '/api/observe') },
  { name: 'prisma_cube', description: 'Detalle completo de un directorio: celdas, extensiones, archivos recientes, git, sesiones de agente.', inputSchema: P({ path: dir }, ['path']), call: a => api('GET', '/api/cube?path=' + encodeURIComponent(a.path)) },
  { name: 'prisma_references', description: 'Matriz de referencias entre archivos del directorio (imports y literales que nombran otros archivos).', inputSchema: P({ path: dir }, ['path']), call: a => api('GET', '/api/deps?path=' + encodeURIComponent(a.path)) },
  { name: 'prisma_pulse', description: 'Qué están haciendo ahora las sesiones de IA del equipo (todas las cuentas): modelo, contexto y últimas herramientas con su archivo. Es lo que dibuja el foco ámbar en prisma.', inputSchema: P({}), call: () => api('GET', '/api/pulse') },
  { name: 'prisma_ls', description: 'Lista una carpeta (o las unidades si no se indica ruta): nombre, tipo, tamaño (de carpetas incluido si hay índice) y fecha.', inputSchema: P({ path: { type: 'string', description: 'Ruta absoluta; vacía para las unidades' } }), call: a => api('GET', T(a.path ? '/api/ls?path=' + encodeURIComponent(a.path) : '/api/roots')) },
  { name: 'prisma_file', description: 'Ficha de un archivo: tipo, firma, tamaño, fechas, primeras líneas si es texto, tabla si es CSV, estructura si es JSON, cabecera hex si es binario, y referencias con otros archivos del cubo.', inputSchema: P({ path: { type: 'string' } }, ['path']), call: a => api('GET', T('/api/file?path=' + encodeURIComponent(a.path))) },
  { name: 'prisma_system', description: 'Árbol de aplicaciones, terminales, sesiones de Claude Code y procesos con RAM, CPU, E/S y conexiones TCP.', inputSchema: P({}), call: () => api('GET', T('/api/system')) },
  { name: 'prisma_tasks', description: 'Administrador de tareas (solo lectura): aplicaciones, segundo plano y procesos de Windows agrupados, red por equipo remoto, archivos en uso, servicios, programas de inicio y usuarios.', inputSchema: P({}), call: () => api('GET', T('/api/tasks')) },
  { name: 'prisma_meta', description: 'Ficha ampliada de una carpeta (solo lectura): dependencias declaradas, últimos commits, procesos que la usan y su red, y archivos recientes abiertos ahora con quién los tiene.', inputSchema: P({ path: { type: 'string', description: 'Carpeta' } }, ['path']), call: a => api('GET', T('/api/meta?path=' + encodeURIComponent(a.path))) },
  { name: 'prisma_index', description: 'Sin ruta: estado de los índices. Con ruta: indexa ese árbol en segundo plano (p. ej. C:\\) para tener cubos y tamaños completos al instante.', inputSchema: P({ path: { type: 'string' } }), call: a => a.path ? api('POST', '/api/index', { path: a.path, by: 'ia' }) : api('GET', '/api/index') },
  { name: 'prisma_layout', description: 'Reorganiza los cubos en el espacio: cluster, stack, grid u orbit.', inputSchema: P({ mode: { type: 'string', enum: ['cluster', 'stack', 'grid', 'orbit'] } }, ['mode']), call: a => api('POST', '/api/layout', { mode: a.mode, by: 'ia' }) },
  { name: 'prisma_space', description: 'Espacios de la vista (no tocan el disco). action=list los enumera; new crea uno (name, y snapshot=true para copiar lo que hay ahora en «En vivo») y pasa a él; switch cambia al espacio id; rename cambia el nombre de id; close cierra id («En vivo» no se cierra).',
    inputSchema: P({ action: { type: 'string', enum: ['list', 'new', 'switch', 'rename', 'close'] }, id: { type: 'string' }, name: { type: 'string' }, snapshot: { type: 'boolean' } }, ['action']),
    call: async a => { const st = a.action === 'list' ? await api('GET', '/api/state') : await api('POST', '/api/space', { action: a.action, id: a.id, name: a.name, snapshot: !!a.snapshot, by: 'ia' });
      return { current: st.space, spaces: st.spaces, cubes: (st.cubes || []).length }; } },
  { name: 'prisma_permission', description: 'Uso interno de Prisma: Claude Code pregunta aquí antes de usar una herramienta que necesita permiso, y el usuario responde desde la interfaz.',
    inputSchema: P({ tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, ['tool_name']),
    call: a => waitPost('/api/assistant/permission', { account: process.env.PRISMA_ACCOUNT || 'default', tool: a.tool_name, input: a.input || {} }) },
  { name: 'prisma_focus', description: 'Selecciona y enfoca un cubo abierto en la vista.', inputSchema: P({ path: dir }, ['path']), call: a => api('POST', '/api/focus', { path: a.path, by: 'ia' }) },
];

async function api(method, url, data, retry = true) {
  let r;
  try { r = await fetch(BASE + (method === 'GET' && !url.includes('t=') ? T(url) : url), { method, headers: { 'X-Prisma': tok(), ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined }); }
  catch (e) { // start prisma only if nobody is listening (no window, no extra cube)
    if (!retry || process.env.PRISMA_NO_SPAWN === '1') throw new Error('Prisma no responde en ' + BASE); // launched by the app itself: never start a second server
    spawn(process.execPath, [path.join(__dirname, 'server.js'), '--no-open'], { detached: true, stdio: 'ignore', windowsHide: true, cwd: os.homedir() }).unref();
    await new Promise(ok => setTimeout(ok, 1500));
    return api(method, url.replace(/[?&]t=[^&]*/, ''), data, false);
  }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
  if (!r.ok) throw new Error((j && j.error) || `HTTP ${r.status}${r.status === 403 ? ' (token: ¿Prisma se reinició? vuelve a intentarlo)' : ''}`);
  return j;
}

/** POST that may wait as long as the user takes to answer: fetch gives up on response headers after 5 minutes. */
function waitPost(url, data) {
  const payload = JSON.stringify(data);
  return new Promise((ok, ko) => {
    const req = require('http').request(BASE + url, { method: 'POST', headers: { 'X-Prisma': tok(), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
      let txt = ''; res.setEncoding('utf8'); res.on('data', d => { txt += d; });
      res.on('end', () => { let j = null; try { j = JSON.parse(txt); } catch {} res.statusCode < 300 ? ok(j) : ko(new Error((j && j.error) || 'HTTP ' + res.statusCode)); });
    });
    req.on('error', () => ko(new Error('Prisma no responde en ' + BASE)));
    req.end(payload);
  });
}

const out = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(m) {
  if (!m || typeof m !== 'object' || m.id === undefined) return; // notifications or invalid messages
  const ok = result => out({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') return ok({ protocolVersion: (m.params && m.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'prisma', version: '0.4.0' } });
  if (m.method === 'ping') return ok({});
  if (m.method === 'tools/list') return ok({ tools: TOOLS.map(({ call, ...t }) => t) });
  if (m.method === 'tools/call') {
    const t = TOOLS.find(x => x.name === (m.params || {}).name);
    if (!t) return ok({ isError: true, content: [{ type: 'text', text: 'Herramienta desconocida' }] });
    try { return ok({ content: [{ type: 'text', text: JSON.stringify(await t.call(m.params.arguments || {}), null, 1) }] }); }
    catch (e) { return ok({ isError: true, content: [{ type: 'text', text: String(e.message || e) }] }); }
  }
  out({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Método no soportado' } });
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { try { Promise.resolve(handle(JSON.parse(line))).catch(() => {}); } catch {} } } });
