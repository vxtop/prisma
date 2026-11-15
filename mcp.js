#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// vxtop MCP server (stdio): lets an AI open directories as cubes and observe what vxtop monitors.
// Read-only on the directories. No dependencies.
//   claude mcp add vxtop -- node /path/to/mcp.js
'use strict';
const path = require('path'), { spawn } = require('child_process');
const BASE = `http://127.0.0.1:${+process.env.VXTOP_PORT || 4827}`, os = require('os'), fs = require('fs');
const tok = () => { try { const o = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.vxtop', 'token'), 'utf8')), p = +process.env.VXTOP_PORT || 4827; return (o.ports && o.ports[p]) || o.token; } catch { return ''; } };
const T = u => u + (u.includes('?') ? '&' : '?') + 't=' + tok();

const P = (props, required = []) => ({ type: 'object', properties: props, required });
const dir = { type: 'string', description: 'Ruta absoluta del directorio' };
const TOOLS = [
  { name: 'vxtop_open', description: 'Abre un directorio como cubo en vxtop (solo lectura). Con expand=true despliega también sus subdirectorios como cubos hijos.', inputSchema: P({ path: dir, expand: { type: 'boolean' } }, ['path']), call: a => api('POST', '/api/open', { path: a.path, expand: !!a.expand, by: 'ia' }) },
  { name: 'vxtop_close', description: 'Cierra un cubo y sus descendientes. No toca el directorio.', inputSchema: P({ path: dir }, ['path']), call: a => api('POST', '/api/close', { path: a.path, by: 'ia' }) },
  { name: 'vxtop_observe', description: 'Resumen de todo lo observado: sistema (CPU/RAM/GPU), cubos abiertos, sus 27 celdas (tipo × profundidad × tiempo), git, archivos recientes y actividad de agentes.', inputSchema: P({}), call: () => api('GET', '/api/observe') },
  { name: 'vxtop_cube', description: 'Detalle completo de un directorio: celdas, extensiones, archivos recientes, git, sesiones de agente.', inputSchema: P({ path: dir }, ['path']), call: a => api('GET', '/api/cube?path=' + encodeURIComponent(a.path)) },
  { name: 'vxtop_references', description: 'Matriz de referencias entre archivos del directorio (imports y literales que nombran otros archivos).', inputSchema: P({ path: dir }, ['path']), call: a => api('GET', '/api/deps?path=' + encodeURIComponent(a.path)) },
  { name: 'vxtop_pulse', description: 'Qué están haciendo ahora las sesiones de IA del equipo (todas las cuentas): modelo, contexto y últimas herramientas con su archivo. Es lo que dibuja el foco ámbar en vxtop.', inputSchema: P({}), call: () => api('GET', '/api/pulse') },
  { name: 'vxtop_ls', description: 'Lista una carpeta (o las unidades si no se indica ruta): nombre, tipo, tamaño (de carpetas incluido si hay índice) y fecha.', inputSchema: P({ path: { type: 'string', description: 'Ruta absoluta; vacía para las unidades' } }), call: a => api('GET', T(a.path ? '/api/ls?path=' + encodeURIComponent(a.path) : '/api/roots')) },
  { name: 'vxtop_file', description: 'Ficha de un archivo: tipo, firma, tamaño, fechas, primeras líneas si es texto, tabla si es CSV, estructura si es JSON, cabecera hex si es binario, y referencias con otros archivos del cubo.', inputSchema: P({ path: { type: 'string' } }, ['path']), call: a => api('GET', T('/api/file?path=' + encodeURIComponent(a.path))) },
  { name: 'vxtop_system', description: 'Árbol de aplicaciones, terminales, sesiones de Claude Code y procesos con RAM, CPU, E/S y conexiones TCP.', inputSchema: P({}), call: () => api('GET', T('/api/system')) },
  { name: 'vxtop_tasks', description: 'Administrador de tareas (solo lectura): aplicaciones, segundo plano y procesos de Windows agrupados, red por equipo remoto, archivos en uso, servicios, programas de inicio y usuarios.', inputSchema: P({}), call: () => api('GET', T('/api/tasks')) },
  { name: 'vxtop_meta', description: 'Ficha ampliada de una carpeta (solo lectura): dependencias declaradas, últimos commits, procesos que la usan y su red, y archivos recientes abiertos ahora con quién los tiene.', inputSchema: P({ path: { type: 'string', description: 'Carpeta' } }, ['path']), call: a => api('GET', T('/api/meta?path=' + encodeURIComponent(a.path))) },
  { name: 'vxtop_index', description: 'Sin ruta: estado de los índices. Con ruta: indexa ese árbol en segundo plano (p. ej. C:\\) para tener cubos y tamaños completos al instante.', inputSchema: P({ path: { type: 'string' } }), call: a => a.path ? api('POST', '/api/index', { path: a.path, by: 'ia' }) : api('GET', '/api/index') },
  { name: 'vxtop_layout', description: 'Reorganiza los cubos en el espacio: cluster, stack, grid u orbit.', inputSchema: P({ mode: { type: 'string', enum: ['cluster', 'stack', 'grid', 'orbit'] } }, ['mode']), call: a => api('POST', '/api/layout', { mode: a.mode, by: 'ia' }) },
  { name: 'vxtop_focus', description: 'Selecciona y enfoca un cubo abierto en la vista.', inputSchema: P({ path: dir }, ['path']), call: a => api('POST', '/api/focus', { path: a.path, by: 'ia' }) },
];

async function api(method, url, data, retry = true) {
  let r;
  try { r = await fetch(BASE + (method === 'GET' && !url.includes('t=') ? T(url) : url), { method, headers: { 'X-Vxtop': tok(), ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined }); }
  catch (e) { // start vxtop only if nobody is listening (no window, no extra cube)
    if (!retry) throw new Error('vxtop no responde en ' + BASE);
    spawn(process.execPath, [path.join(__dirname, 'server.js'), '--no-open'], { detached: true, stdio: 'ignore', windowsHide: true, cwd: os.homedir() }).unref();
    await new Promise(ok => setTimeout(ok, 1500));
    return api(method, url.replace(/[?&]t=[^&]*/, ''), data, false);
  }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
  if (!r.ok) throw new Error((j && j.error) || `HTTP ${r.status}${r.status === 403 ? ' (token: ¿vxtop se reinició? vuelve a intentarlo)' : ''}`);
  return j;
}

const out = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(m) {
  if (!m || typeof m !== 'object' || m.id === undefined) return; // notifications or invalid messages
  const ok = result => out({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') return ok({ protocolVersion: (m.params && m.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'vxtop', version: '0.4.0' } });
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
