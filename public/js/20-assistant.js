// SPDX-License-Identifier: Apache-2.0
//
// Assistant: a prompt bar in the space that talks to Claude through the user's own Claude Code login.
// Server side in assistant.js; events arrive on the shared stream as { k: 'assistant', type, ... }.

const ASST = { status: null, account: null, busy: false, fresh: false, current: null, open: false, workdir: null, permission: 'ask', perms: new Map() };
const ASST_TOOLS = {
  prisma_open: 'abre', prisma_close: 'cierra', prisma_focus: 'enfoca', prisma_ls: 'lista', prisma_cube: 'mira el cubo',
  prisma_file: 'lee la ficha', prisma_meta: 'mira la carpeta', prisma_system: 'mira el sistema', prisma_tasks: 'mira las tareas',
  prisma_pulse: 'mira las sesiones de IA', prisma_observe: 'observa', prisma_references: 'mira las referencias', prisma_index: 'indexa', prisma_layout: 'organiza', prisma_space: 'espacio',
  Read: 'lee', Write: 'escribe', Edit: 'edita', Glob: 'busca ficheros', Grep: 'busca en el código',
};
const asstKey = 'prisma.assistant.account';
const asstPermKey = 'prisma.assistant.permission';
const ASST_PERMS = { ask: 'Preguntar', accept: 'Aceptar ediciones', plan: 'Planificar' };
const ASST_PERM_NOTES = { ask: 'cada edición espera tu visto bueno', accept: 'edita sin preguntar', plan: 'solo lee y propone un plan' };
const asstDraftKey = 'prisma.assistant.draft'; // what the user was typing survives reloads (hot reload included)
const asstDraft = { save: v => { try { v ? localStorage.setItem(asstDraftKey, v) : localStorage.removeItem(asstDraftKey); } catch {} }, load: () => { try { return localStorage.getItem(asstDraftKey) || ''; } catch { return ''; } } };

function asstLine(cls, text) {
  const el = document.createElement('div');
  el.className = 'al ' + cls;
  el.textContent = text;
  $('#asst-log').appendChild(el);
  asstShow(true);
  el.scrollIntoView({ block: 'end' });
  return el;
}

/** Small, safe Markdown subset for Claude's answers: everything is escaped first, then bold, code, lists and tables. */
function asstMarkdown(raw) {
  const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const out = [], lines = String(raw).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) {
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i]));
      i--;
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${(head || []).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (/^\s*[-*] /.test(line)) {
      const items = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^\s*[-*] /, ''))}</li>`);
      i--;
      out.push(`<ul>${items.join('')}</ul>`);
    } else if (/^#{1,6} /.test(line)) out.push(`<p><b>${inline(line.replace(/^#+ /, ''))}</b></p>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  return out.join('');
}

function asstShow(open) { ASST.open = open; $('#asst').classList.toggle('open', open && $('#asst-log').childElementCount > 0); }

function asstSetBusy(busy) {
  ASST.busy = busy;
  $('#asst').classList.toggle('busy', busy);
  $('#asst-go').textContent = busy ? 'Parar' : 'Enviar';
  $('#asst-go').type = busy ? 'button' : 'submit';
}

function asstAccountLabel(a) { return a ? (a.email || a.name || a.id) : 'sin cuenta'; }

function asstRenderAccount() {
  const s = ASST.status, btn = $('#asst-acc');
  const usable = s ? s.accounts.filter(a => a.loggedIn) : [];
  const a = usable.find(x => x.id === ASST.account) || usable[0] || null;
  ASST.account = a ? a.id : null;
  btn.textContent = asstAccountLabel(a);
  btn.disabled = usable.length < 2;
  const ready = !!(s && s.installs.length && a);
  $('#asst-in').disabled = !ready;
  $('#asst-go').disabled = !ready;
  if (s && !s.installs.length) $('#asst-in').placeholder = s.desktop ? 'Claude Desktop sin Claude Code: ábrelo una vez en la pestaña Code' : 'Instala Claude Code para hablar con Claude';
  else if (s && !a) $('#asst-in').placeholder = 'Inicia sesión en Claude Code (claude → /login) para hablar con Claude';
}

async function asstLoad() {
  try { ASST.status = await api('/api/assistant'); } catch { ASST.status = null; }
  try { ASST.account = localStorage.getItem(asstKey); } catch {}
  asstRenderAccount();
  asstReplay();
}

function asstReplay() {
  const a = ASST.status && ASST.status.accounts.find(x => x.id === ASST.account);
  $('#asst-log').replaceChildren();
  ASST.perms.clear();
  for (const ev of (a && a.history) || []) onAssistant({ ...ev, account: a.id });
  asstSetBusy(!!(a && a.busy));
  asstShow(false);
}

function onAssistant(m) {
  if (m.account !== ASST.account) return;
  if (m.type === 'start') {
    asstSetBusy(true);
    asstLine('me', m.message);
    if (m.workdir) asstLine('note', `Trabajando en ${m.workdir}` + (m.permission ? ` · ${ASST_PERMS[m.permission] || m.permission}` : ''));
    ASST.current = null;
  } else if (m.type === 'text') {
    ASST.current = ASST.current || asstLine('ai', '');
    ASST.current.dataset.raw = (ASST.current.dataset.raw || '') + m.text;
    ASST.current.innerHTML = asstMarkdown(ASST.current.dataset.raw);
    ASST.current.scrollIntoView({ block: 'end' });
  } else if (m.type === 'tool') {
    ASST.current = null;
    const verb = ASST_TOOLS[m.tool] || m.tool;
    asstLine('tool', `${verb} ${m.detail || ''}`.trim());
    feed('IA', '#D97757', `Claude ${verb} ${base(m.detail || '')}`.trim());
  } else if (m.type === 'permission') {
    ASST.current = null;
    asstPermission(m);
  } else if (m.type === 'decided') {
    asstDecided(m.id, m.allow);
  } else if (m.type === 'notice') {
    asstLine(m.error ? 'err' : 'note', m.text);
  } else if (m.type === 'end') {
    asstSetBusy(false);
    ASST.current = null;
  }
}

/** Line diff good enough for an edit preview: common head and tail kept as context, the middle shown as − / +. */
const NL = String.fromCharCode(10);
function asstDiff(before, after) {
  const a = String(before || '').split(NL), b = String(after || '').split(NL);
  let h = 0; while (h < a.length && h < b.length && a[h] === b[h]) h++;
  let t = 0; while (t < a.length - h && t < b.length - h && a[a.length - 1 - t] === b[b.length - 1 - t]) t++;
  const ctx = l => `<span>  ${esc(l)}</span>`;
  return [...a.slice(Math.max(0, h - 2), h).map(ctx),
    ...a.slice(h, a.length - t).map(l => `<span class="del">− ${esc(l)}</span>`),
    ...b.slice(h, b.length - t).map(l => `<span class="add">+ ${esc(l)}</span>`),
    ...a.slice(a.length - t, a.length - t + 2).map(ctx)].join(NL);
}

/** Claude Code asks before a tool that needs permission (work mode, «Preguntar»): show the change and wait. */
function asstPermission(m) {
  const p = m.preview || {}, verb = ASST_TOOLS[m.tool] || m.tool;
  const el = asstLine('perm', '');
  const where = p.path ? ` <code>${esc(p.path)}</code>` : '';
  let body = '';
  if (p.before != null || p.after != null) body = `<pre>${p.before != null ? asstDiff(p.before, p.after) : esc(p.after).split(NL).map(l => `<span class="add">+ ${l}</span>`).join(NL)}</pre>`;
  else if (p.detail) body = `<pre>${esc(p.detail)}</pre>`;
  el.innerHTML = `<div class="ph">Claude quiere <b>${esc(verb)}</b>${where}${p.all ? ' (todas las apariciones)' : ''}</div>${body}<div class="pa"><button type="button" class="yes">Permitir</button><button type="button" class="no">Denegar</button><span class="pr">Esperando tu respuesta · Intro permite, Esc deniega</span></div>`;
  const answer = allow => { el.querySelectorAll('.pa button').forEach(x => { x.disabled = true; }); post('/api/assistant/decide', { id: m.id, allow }).catch(e => asstLine('err', String(e.message || e))); };
  el.querySelector('.yes').addEventListener('click', () => answer(true));
  el.querySelector('.no').addEventListener('click', () => answer(false));
  ASST.perms.set(m.id, el);
  if (p.path) feed('IA', '#D97757', `Claude pide permiso para ${verb} ${base(p.path)}`);
  el.scrollIntoView({ block: 'end' });
}

function asstDecided(id, allow) {
  const el = ASST.perms.get(id);
  if (!el) return;
  ASST.perms.delete(id);
  el.classList.add('done', allow ? 'allowed' : 'denied');
  el.querySelector('.pr').textContent = allow ? 'Permitido' : 'Denegado';
}

/** The oldest permission still waiting, so Enter / Escape can answer it from the prompt bar. */
const asstWaiting = () => ASST.perms.values().next().value || null;

async function asstSend() {
  const input = $('#asst-in'), text = input.value.trim();
  if (!text || ASST.busy || !ASST.account) return;
  input.value = '';
  asstDraft.save('');
  try {
    await post('/api/assistant/ask', { message: text, account: ASST.account, fresh: ASST.fresh, workdir: ASST.workdir, permission: ASST.permission });
    ASST.fresh = false;
  } catch (e) { asstLine('err', String(e.message || e)); }
}

/** Observe (read-only) or work on the selected cube's folder (Claude may edit files there, never run programs). */
function asstSetWorkdir(dir) {
  ASST.workdir = dir;
  const btn = $('#asst-mode');
  btn.classList.toggle('work', !!dir);
  btn.textContent = dir ? '✎ ' + base(dir) : 'Observar';
  $('#asst-perm').hidden = !dir;
  $('#asst-in').placeholder = dir ? `Pide un cambio en ${base(dir)}: Claude puede editar sus ficheros` : 'Pídele algo a Claude: «enséñame qué ocupa más en Descargas»…';
}

$('#asst-mode').addEventListener('click', () => {
  if (ASST.busy) return;
  if (ASST.workdir) return asstSetWorkdir(null);
  if (!S.sel || !S.sel.path) { asstLine('note', 'Selecciona primero el cubo de la carpeta en la que quieres que trabaje Claude.'); return; }
  asstSetWorkdir(S.sel.path);
  ASST.fresh = true;
  asstLine('note', `Modo trabajo: Claude podrá editar ficheros dentro de ${S.sel.path}. No puede ejecutar programas.`);
});

function asstSetPermission(mode) {
  ASST.permission = ASST_PERMS[mode] ? mode : 'ask';
  const btn = $('#asst-perm');
  btn.textContent = ASST_PERMS[ASST.permission];
  btn.className = ASST.permission === 'ask' ? '' : ASST.permission;
  try { localStorage.setItem(asstPermKey, ASST.permission); } catch {}
}
$('#asst-perm').addEventListener('click', () => {
  if (ASST.busy) return;
  const modes = Object.keys(ASST_PERMS);
  asstSetPermission(modes[(modes.indexOf(ASST.permission) + 1) % modes.length]);
  asstLine('note', `Permisos: ${ASST_PERMS[ASST.permission]} (Claude ${ASST_PERM_NOTES[ASST.permission]}).`);
});
{ let saved = null; try { saved = localStorage.getItem(asstPermKey); } catch {} asstSetPermission(saved); }

$('#asst-bar').addEventListener('submit', e => { e.preventDefault(); asstSend(); });
$('#asst-go').addEventListener('click', () => { if (ASST.busy) post('/api/assistant/cancel', { account: ASST.account }).catch(() => {}); });
$('#asst-new').addEventListener('click', () => {
  ASST.fresh = true;
  $('#asst-log').replaceChildren();
  asstLine('note', 'Conversación nueva.');
});
$('#asst-acc').addEventListener('click', () => {
  const usable = (ASST.status ? ASST.status.accounts : []).filter(a => a.loggedIn);
  if (usable.length < 2 || ASST.busy) return;
  const i = usable.findIndex(a => a.id === ASST.account);
  ASST.account = usable[(i + 1) % usable.length].id;
  try { localStorage.setItem(asstKey, ASST.account); } catch {}
  asstLoad();
});
$('#asst-in').addEventListener('focus', () => asstShow(true));
$('#asst-in').addEventListener('keydown', e => {
  const waiting = asstWaiting();
  if (waiting && !e.target.value.trim() && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); waiting.querySelector(e.key === 'Enter' ? '.yes' : '.no').click(); return; }
  if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); asstShow(false); } });
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#asst-in').focus(); } });

$('#asst-in').addEventListener('input', e => asstDraft.save(e.target.value));
{ const draft = asstDraft.load(); if (draft) { const input = $('#asst-in'); input.value = draft; input.focus(); input.setSelectionRange(draft.length, draft.length); } }
asstLoad();
S.asst = { state: ASST, on: onAssistant }; // test hook
