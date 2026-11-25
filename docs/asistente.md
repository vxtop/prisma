# Asistente

**Español** · [English](assistant.md)

La barra de la parte inferior del espacio habla con Claude. Todo lo que Claude inspecciona se abre en forma de cubos y
se lleva a la vista, así que ves cómo se construye la respuesta.

## Requisitos

Cualquier equipo en el que funcione Claude Code:

| Instalación | Cómo se encuentra |
|---|---|
| Claude Code CLI | `CLAUDE_PATH`; después, `claude` en el `PATH`, `~/.local/bin` y `~/.claude/local` |
| Claude Desktop | La copia de Claude Code que la aplicación descarga para su pestaña *Code* (`%APPDATA%\Claude\claude-code\<version>` y la caché del paquete MSIX en Windows, `~/Library/Application Support/Claude/claude-code` en macOS) |

Si Claude Desktop está instalado pero nunca ha descargado Claude Code, la barra lo avisa en lugar de fallar.

## Cuentas

Cada carpeta de configuración de Claude Code de tu carpeta personal es una cuenta: `~/.claude` (por defecto) y cualquier
`~/.claude-<nombre>` que se use con `CLAUDE_CONFIG_DIR`. La barra muestra el correo de la cuenta y permite cambiar entre
las que tienen la sesión iniciada. Del perfil solo se leen los campos que se muestran; los archivos de credenciales nunca
se abren. Cada cuenta conserva su propia conversación, que se puede retomar (`~/.prisma/assistant/sessions.json`).

## Aislamiento

Claude Code se inicia con:

- `--restricted`: ninguna herramienta integrada puede ejecutar comandos, se ignoran los ajustes del proyecto y del
  usuario, y las herramientas de archivos solo alcanzan el directorio de trabajo, que es una carpeta vacía
  (`~/.prisma/assistant/workspace`).
- `--tools ""`: sin ninguna herramienta integrada.
- `--strict-mcp-config` con un único servidor MCP, el `mcp.js` de esta aplicación, conectado al puerto de este servidor.
  Todas las herramientas que ofrece son de solo lectura: Claude puede observar el equipo y ordenar la vista, pero no
  puede cambiar nada.

## API

| Petición | Para qué |
|---|---|
| `GET /api/assistant` | Instalaciones y cuentas (con su estado de ocupación y la conversación que se vuelve a mostrar) |
| `POST /api/assistant/ask` `{ message, account, fresh, workdir, permission }` | Inicia un turno (en modo trabajo si se indica `workdir`); responde 202 y el turno llega como eventos |
| `GET /api/assistant/busy` | Si hay algún turno en marcha (lo usa el modo de desarrollo) |
| `POST /api/assistant/cancel` `{ account }` | Detiene el turno en marcha |
| `POST /api/assistant/decide` `{ id, allow }` | Responde a una petición de permiso pendiente |

Los turnos se transmiten por el canal de eventos común (`/api/events`) como `{ k: 'assistant', account, type, … }`, donde
`type` es `start`, `model`, `text`, `tool`, `permission`, `decided`, `notice` o `end`. Las peticiones POST pasan las mismas
comprobaciones de token, cabecera y origen que el resto de la API.

## Trabajar en una carpeta

El botón de modo, junto al campo de texto, cambia entre **Observar** (el modo por defecto descrito arriba) y **Trabajar**.
El modo trabajo actúa sobre la carpeta del cubo seleccionado: Claude recibe `Read`, `Write`, `Edit`, `Glob` y `Grep`
limitados a esa carpeta (modo restringido) y sigue sin ninguna herramienta que ejecute comandos o programas. Se rechazan
las raíces de las unidades y la propia carpeta personal. Cada carpeta conserva su propia conversación por cuenta.

En el modo trabajo, un segundo botón elige el modo de permisos de Claude Code:

| Modo | Claude Code | Comportamiento |
|---|---|---|
| **Preguntar** (por defecto) | `default` + `--permission-prompt-tool` | Cada edición aparece en el registro con su diff y espera a **Permitir** / **Denegar** (Intro / Esc con el campo vacío). Las peticiones sin respuesta se deniegan a los 15 minutos o al terminar el turno. |
| **Aceptar ediciones** | `acceptEdits` | Las ediciones dentro de la carpeta se aplican sin preguntar. |
| **Planificar** | `plan` | Claude solo lee y propone un plan. |

Las preguntas viajan por la herramienta MCP `prisma_permission`, que espera en `POST /api/assistant/permission` hasta que
la página responde con `POST /api/assistant/decide`.

## Recarga en caliente

`npm run dev` arranca `scripts/dev.js`, que ejecuta el servidor con `--dev`:

- Los cambios en `public/` llegan a las páginas abiertas: las hojas de estilo se sustituyen al momento y cualquier otra
  cosa recarga la página.
- Los cambios en los archivos del servidor lo reinician, pero solo cuando no hay ningún turno del asistente en marcha y
  todos los archivos del servidor se pueden interpretar (si uno está roto, sigue vivo el servidor anterior y la barra
  continúa funcionando). Las páginas se recargan solas cuando el servidor vuelve.

Junto con el modo trabajo, esto permite pedir un cambio en esta misma aplicación desde su propia barra y verlo aplicado
segundos después.
