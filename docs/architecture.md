# Architecture
n> [README (EN)](../README.en.md) · [Guide](en/guide.md) · [Arquitectura (ES)](arquitectura.md)

vxtop is a local web app: a Node.js server that **reads** the machine and a three.js client that draws it. No npm dependencies, no build step.

```
┌──────────── browser (127.0.0.1) ────────────┐        ┌──────────────── server.js ────────────────┐
│ public/index.html   markup                  │  GET   │ HTTP + SSE on 127.0.0.1, token-guarded     │
│ public/css/app.css  styles                  │ ─────► │ /app.js   concatenated client + source map │
│ /app.js  ← public/js/00-…18-*.js            │  SSE   │ /api/*    cubes, files, tree, procs, tasks │
│   one ES module, one shared scope           │ ◄───── │ /api/events  live stream (fs, procs, AI)   │
│ three.js from public/vendor (import map)    │        │                                            │
└─────────────────────────────────────────────┘        │  indexer.js   worker: whole-drive indexes  │
                                                       │  pshost.ps1   persistent Windows helper    │
            mcp.js (stdio) ── HTTP + token ──────────► │               (Win32 via C#, JSON lines)   │
                                                       └────────────────────────────────────────────┘
```

## Server (`server.js`)

| Area | What it does |
|---|---|
| CLI and HTTP | flags, loopback-only server, token and origin checks, static files, the client bundle |
| Scanning | a folder becomes a cube: 27 cells = file kind (code · data · docs) × depth (root · 1–2 · 3+) × age (< 1 h · < 24 h · older), with a time and entry budget |
| Indexes | `indexer.js` runs in a worker thread and writes gzip JSON indexes to `~/.vxtop/index`; watchers keep them current |
| Live | drive watchers, AI sessions (`~/.claude*`), open programs and their paths are grouped into the *En vivo* space; folders fade 8 s after their last event |
| System | processes, network connections, GPU (`nvidia-smi`), tasks, services, startup items — all read-only |
| Native helper | `pshost.ps1` stays running and answers JSON lines: who has a file open (Restart Manager), foreground window and cursor, window thumbnails (`PrintWindow`), icons, GPU and task data |

Events reach the client through Server-Sent Events (`/api/events`); everything else is plain `GET`/`POST` JSON.

## Client (`public/js`)

The client is **one ES module** split into ordered files that share a single scope. The server concatenates them on request (`/app.js`) and emits a line-level source map (`/app.js.map`) so the browser's devtools show the original files.

| File | Area |
|---|---|
| `00-core` | imports, state `S`, small helpers, API calls |
| `01-scene` | renderer, camera, controls, post-processing |
| `02-cubes` | cube geometry (instanced cells), layouts |
| `03-data` | applying server data, live events, AI probes |
| `04-ui` | left panel and top bar |
| `05-input` | picking, one-click selection, hover |
| `06-loop` | the frame loop: camera framing, tracking, animation |
| `07-io-views-explorer` | menus, settings, view switching, explorer |
| `08-objects` | files as objects in the space |
| `09-system-view` | the System view (processes and network) |
| `10-panel` | right panel, help, tooltips, scenes |
| `11-viewer-follow` | file viewer and follow mode |
| `12-spaces-live` | spaces and the live view: programs as cubes, foreground window |
| `13-hud` | labels and on-screen data layer |
| `14-tasks-card` | the Tasks view and the cube card |
| `15-history-boot` | browser history and start-up |
| `16-tree` | the Tree view |
| `17-peek` | hover preview |
| `18-welcome` | first-run welcome and the admin relaunch |

Rendering relies on `InstancedMesh`: all cells of all cubes are a few draw calls, which keeps 256 cubes (6 900 cells) above 150 fps on a mid-range GPU.

## Data on disk

Only `~/.vxtop`: `index/` (drive indexes), `scenes/`, `token` (port → token, mode `0600`). On Windows the launcher also uses `%LOCALAPPDATA%\vxtop` for its log and a separate Chrome profile.

## Tests

`test/smoke.js` starts the server on a free port with a temporary home and fixture tree and checks the token, the read-only guarantee and the bundle. `test/e2e.js` drives headless Chrome through the DevTools protocol (no Puppeteer) and checks interaction: one click, focus, races, zoom, views, tree, search and reload.
