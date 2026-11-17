# vxtop guide

> [README](../../README.en.md) · [Guía en español](../guia.md) · [Architecture](../architecture.md)

A 3D observatory of folders and of the system. Each folder is a 27-cell OLAP cube (type × depth × age) with 6 metric faces. Around it you can see the files, the processes, the network and what AI sessions are doing.

**Read-only**: it is a monitor. It never creates, modifies or deletes anything it observes, and it does not act on processes or on the system. It only writes to its own folder `~/.vxtop` (indexes, scenes and the MCP token).

Side effects caused by the operating system itself when reading: Windows updates the last-access time of files that are read, and downloads OneDrive files that were cloud-only.

It works offline and with no npm dependencies: all libraries are bundled in `public/vendor`.

## Requirements
- Node.js 18.15 or later.
- Windows (full support), Linux (tested on Ubuntu/WSL) or macOS (untested).
- Optional: an NVIDIA GPU (telemetry via `nvidia-smi`) and `ffmpeg` (frames from videos the browser can't play).

## Starting on Windows (recommended)
Double-click **vxtop.vbs**. It starts the server **without any console window** and without asking for administrator rights, logging to `%LOCALAPPDATA%\vxtop\servidor.log`, and opens vxtop in its own Chrome window, with no toolbars and a separate profile (`%LOCALAPPDATA%\vxtop\chrome`). On first run, a welcome screen explains the basics and asks whether you want to see live images of your windows (off unless you say yes; you can change it in **Ajustes** (settings)).

**More data with administrator rights**: one click on the «SOLO LECTURA» (read-only) badge restarts the server with administrator rights (Windows asks for confirmation) so it can also see the DNS cache and the files each process has open. It is still read-only; the badge changes to «SOLO LECTURA · ADMIN».

Closing the vxtop window shuts everything down within about 10 s: the server, its PowerShell helper and the Chrome instance using its profile (`--with-window`; the grace period lets you reload the page). If the code changes while it is open, the page tells you to close and reopen it. To debug with a console: run `node server.js` in the project folder.

## Several cubes at once
- **+ → Varios cubos…** (several cubes): the Windows folder picker with multiple selection (Ctrl/Shift). It creates a new space; the cubes arrive one by one and take their places in the ring, and when it finishes everything is framed.
- **Search box** (top bar): type a name to list the folders that contain it (from the indexes, instantly), or start typing a path to autocomplete it. Use the arrows to choose, Enter opens it as a cube, Shift+Enter opens it with subfolders; in the Tree view it opens that root. Several paths separated by `;` open at once.
- **Drag and drop** from File Explorer onto the Space: folders → cubes (in the current space; from «En vivo» (live), in a new one), files → objects. The browser does not hand over paths, so vxtop looks up each item by its name and content: what is selected in open Explorer windows, the folders they show, common folders, drives, what is already open, recent items and the indexes. If it can't find something, it says so in the ticker.

## Cube types
Each cube carries an emblem on its lid and a line in its type's color on its label: ◉ drive · ✦ worked on with AI · `</>` code project · ▶ media · ⚙ system · ▣ program data · ◷ temporary or cache · ↓ downloads · ★ home folder. No cube ever overlaps another, not even an exploded one: the lighter one moves aside and, once there is room, everything returns to its place.

## Tree view (like `tree`)
**Árbol** (tree) button (key **A**), right-click a cube or a folder in the explorer → «Ver en árbol» (view as tree), or type a path while the Tree view is open. Every folder and all its subfolders, each with its own lightweight cube: size by weight and color by age (teal = changed today, blue = this month, gray = earlier, amber = heavy folders such as `node_modules` or `.git`, which don't expand on their own).
- **One click** (or Enter, or the triangle in the list) selects, expands or collapses, and centers; right-click: expand everything below (3 or 6 levels), collapse everything below, view as root, go up, open as cube, index.
- Top bar: **Niveles 1–6** (levels; like `tree -L N`), **Todo** (all), **Contraer** (collapse), **Subir** (up), **Plano / Radial** (flat / radial), **Encuadrar** (frame). The list on the left is the tree as text (`├─ └─`).
- Up to 8000 folders at once without losing smoothness (a single draw call for all of them, with no file cells or per-cube scanning). With an index the data is instant and complete; without one it is read from disk with a time limit and sizes are partial (marked with «+»).
- Full cubes in the Space are capped at 256 per space («En vivo» stays at 64 to remain readable; with 250 cubes it holds ~150-180 fps): each has 27 cells, up to 432 file windows, its own scan, its live watch and its label.

## Usage
```
node server.js [directorio ...] [--expand] [--port 4827] [--no-open]
```
- With no folder it opens the current one. `--expand` also unfolds its subfolders as cubes.
- To install it as a command: `npm install -g .` inside this folder, then `vxtop C:\ruta\proyecto --expand`.
- It only listens on `127.0.0.1`. Every request requires a token that only the page itself receives. Network paths (`\\servidor\...`) are blocked.

## For an AI (MCP)
```
claude mcp add vxtop -- node "<ruta>/mcp.js"
```
Tools: `vxtop_open`, `vxtop_close`, `vxtop_observe`, `vxtop_cube`, `vxtop_references`, `vxtop_pulse`, `vxtop_ls`, `vxtop_file`, `vxtop_system`, `vxtop_tasks`, `vxtop_meta`, `vxtop_index`, `vxtop_layout` and `vxtop_focus`. The MCP reads the token from `~/.vxtop/token` and starts vxtop if it is not running.

## Spaces
- **En vivo** (live; the default when vxtop opens): only what is being used **right now** on the computer, not what happened before. A folder appears when something touches it (disk activity on all drives, what AIs touch, the paths of open programs, downloads from the last 2 min) and fades out after 8 s without activity, with the countdown «se apaga · N s» (turning off · N s). Items are grouped by project root or by program (up to 24 focal points; the user folder and a drive root don't count as projects). Whatever you have selected doesn't fade while you're looking at it.
  - **programs**: they float in a layer above, each as a 27-cell cube: its size is its memory, the lit cells (bottom to top) its CPU, and its real icon sits on top. Amber halo: the program in front of you, with its live screen above it; teal halo: the one under your cursor.
  - **«ahora» bar** (now; at the top): the foreground program, its window title and what is under the cursor.
  - No floor: folders and programs float. The camera never moves on its own except to follow what you have selected.
- **+**: creates a space of your own, empty or with a snapshot of «En vivo». Opening a specific folder from «En vivo» creates its own space.
- **Levels**: only the main cubes are shown. One click selects, centers and opens (its subfolders appear); a second click on the same cube picks the cell. `Esc` goes up a level and clicking empty space deselects. As you get closer, the cube opens into its 27 cells and, in «En vivo», unfolds its active subfolders around it.
- **Layouts** (`1–4`): room or cluster, stack (subfolders in towers above their cube, heaviest at the bottom), grid and orbit.

## What you see
- **Windows**: each recent file is a window on the surface of its cell; its brightness shows how recent it is.
- **AI probes** (amber): they travel over the files the AI reads, searches or writes, based on the Claude Code sessions from every `~/.claude*` account.
- **FOCO IA** (AI focus): an attention matrix (row-wise softmax) over the cube's files. It propagates through references and folders and floats next to the cube, with threads to the files.
- **Particles**: each one is a file being touched at that moment. It leaves the program that touched it (or drops from above if unknown) and travels to the file. Color by who: amber Claude, teal you (the program in front of you or under the mouse), bluish gray another program. A write is three dots; a read, one faint dot.
- **Lines**: "this program uses this folder". Only those for the program in front of you, the one you point at and the selected one are drawn.
- **Hover preview**: over a folder cube you see, in miniature, the live windows of the programs using it, the images, videos and texts being touched, and the files some program has open right now. Over a program cube, its live window and the last things it touched. Move the cursor away and it disappears. Window thumbnails are made locally (PrintWindow, read-only) and never leave the computer.
- **Focus**: when you select something, whatever is unrelated to it dims and loses its label.
- **Templates**: each folder is recognized by its contents (Node, Python, Rust or Go project, git repository, worked on with AI, media, drive). Depending on the type, you can open its key files or a media gallery.
- **Media gallery** (**G** with a cube selected, "Open gallery" on the card or the context menu): every image, video and audio file in the folder and its subfolders. On the left, the folder tree with totals; on top, filter by name (`/`), type, sort order, sections per folder (`G`), square crop (`C`) and thumbnail size (`+`/`−`). Arrows to move, Enter to open.
  - **Viewer**: wheel zooms toward the cursor, drag pans, double click toggles fit and zoom, `1` actual size, `0` fit, `R` rotate (view only), `B` background (dark, light, checkerboard), `I` details, `P` slideshow, `F` full screen, `←`/`→` previous and next. Large images show a navigator to jump anywhere; above 250 % pixels are shown as they are.
  - Thumbnails are made in the browser and kept in its local cache; files are only read.
- **Scenes**: save what is open (cubes, objects, camera and space) under a name, so you can come back to it.

## Selected cube
The 27 cells separate and each shows its file count and size; whatever is unrelated dims. On the right, the **Ficha** (details) tab with collapsible sections (empty ones are hidden): contents, activity, size, status (git, index), declared dependencies (npm, pip, pyproject, Cargo, go), git history (latest commits), network of the processes using it, files open right now and who has them, and AI and links (sessions, internal references).

## Explorer, objects and system
- **Explorer**: drives, folders and files with the system icon and the real size of folders (if indexed). Right-click a folder: open it as a cube, with 1–4 levels of subfolders, or view it as a tree.
- **Objects**: each file is shown according to its type:
  - code, with syntax highlighting;
  - image, video and audio (with waveform);
  - PDF (first page via pdf.js);
  - 3D models (`.glb`, `.gltf`, `.obj`, `.stl`, `.fbx`), which rotate in space;
  - CSV, JSON, fonts and binaries (with their signature).

  Its properties show which process has it open at that moment.
- **System view** (key V):
  - applications with their real icon, terminals and processes in layers;
  - Claude Code sessions with their account, model and web requests;
  - TCP connections with the domain when known.

  For each process you see its memory, threads and loaded modules (on Linux, open files too).
- **Tasks view** (key T): the task manager in 3D, read-only. Eleven sections, including scheduled tasks and failures from the last 7 days, plus: apps, background and Windows processes (grouped by program, with their icon), per-core performance, network by remote host, files in use, services, startup programs and users.
- **Live ticker**: distinguishes written, created, deleted and **access** (read). It attributes each change to the **AI**, to **vxtop** (its own reads) or to the process that had the file open.
- **Index**: for huge trees such as all of `C:\` (about 6 M files in about 3.5 min). It is stored in `~/.vxtop/index`, updated with every change and rebuilt in the background when new folders appear or 12 h have passed.

## Controls
- **Mouse** (standard 3D): left-drag orbits, right-drag pans, and the wheel zooms in and out toward the center (in **Ajustes** (settings) you can make it zoom toward the cursor). A single click does everything: selects, centers and opens or expands (there is no double-click; a habitual one doesn't undo anything). Ctrl + click compares several cubes and right-click opens the menu. Hovering over a cube shows what is being used in it.
- **Keyboard**: `H` frame everything (fills the free space between panels) · `F` frame the selected cube · arrows pan (Shift: faster) · `+`/`−` zoom in and out · `V` space ↔ system · `T` tasks · `A` tree · `Tab` next cube · `E` explode · `X/Y/Z` slices · `1–4` layout · `Espacio` (Space) follow · `Esc` exit · `?` help.
- **Viewer**: a file opens inside the space. The camera moves up to it and everything else dims. It has pages (PDF), lines (code and tables), playback (video and audio) and free orbit (3D models). `Esc` returns to the space.
- **Follow**: with the AI, the camera goes to the exact spot (the slot of the file it is touching) or frames all active sessions; the folder containing what it is editing opens as its own cube and closes by itself after 20 s unused. A panel shows what it is doing now, its latest actions and what is open, so you can follow along. It tracks the AI or the selected process live and records on a timeline what it launches, loads, opens and connects to. It only observes.

## Known limitations
- **Content of network requests**: not visible, because it is encrypted. Seeing it would require a TLS-decrypting proxy, and vxtop does not install one.
- **On Windows without administrator rights**:
  - the DNS cache and the list of files opened by a process are not accessible;
  - it is still possible to tell which process has a specific file open.
- **Author of a disk change made by another program**: this is an estimate. It is based on who had the file open or who was writing to that folder. Exact attribution requires system event tracing, with administrator rights.
- **macOS**: the code supports it (ps, lsof, signals), but it has not been tested. There are no system icons there.
