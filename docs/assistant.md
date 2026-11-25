# Assistant

[Español](asistente.md) · **English**

The prompt bar at the bottom of the space talks to Claude. Whatever Claude inspects is opened as cubes and brought
into view, so the user watches the answer being built.

## Requirements

Any machine where Claude Code works:

| Installation | How it is found |
|---|---|
| Claude Code CLI | `CLAUDE_PATH`, then `claude` on the `PATH`, `~/.local/bin`, `~/.claude/local` |
| Claude Desktop | The Claude Code copy that the desktop app downloads for its *Code* tab (`%APPDATA%\Claude\claude-code\<version>`, the MSIX package cache on Windows, `~/Library/Application Support/Claude/claude-code` on macOS) |

If Claude Desktop is installed but has never downloaded Claude Code, the bar says so instead of failing.

## Accounts

Every Claude Code configuration folder in the home directory is an account: `~/.claude` (default) and any
`~/.claude-<name>` used through `CLAUDE_CONFIG_DIR`. The bar shows the account's e-mail and lets the user switch
between logged-in accounts. Only display fields of the profile are read; credential files are never opened. Each
account keeps its own resumable conversation (`~/.prisma/assistant/sessions.json`).

## Isolation

Claude Code is started with:

- `--restricted`: no built-in tool can execute commands, project and user settings are ignored, file tools only reach
  the working directory, which is an empty folder (`~/.prisma/assistant/workspace`).
- `--tools ""`: no built-in tools at all.
- `--strict-mcp-config` with a single MCP server, this application's own `mcp.js`, pointed at this server's port.
  Every tool it exposes is read-only, so Claude can observe the computer and arrange the view, but cannot change
  anything.

## API

| Request | Purpose |
|---|---|
| `GET /api/assistant` | Installations, accounts (with busy state and the transcript to replay) |
| `POST /api/assistant/ask` `{ message, account, fresh, workdir, permission }` | Starts a turn (work mode when `workdir` is set); answered with 202, the turn streams as events |
| `GET /api/assistant/busy` | Whether any turn is running (used by the development runner) |
| `POST /api/assistant/cancel` `{ account }` | Stops the running turn |
| `POST /api/assistant/decide` `{ id, allow }` | Answers a pending permission request |

Turns stream on the shared event stream (`/api/events`) as `{ k: 'assistant', account, type, … }` with `type` one of
`start`, `model`, `text`, `tool`, `permission`, `decided`, `notice`, `end`. POST requests carry the same token, header and origin checks as the
rest of the API.

## Working on a folder

The mode button next to the input switches between **Observe** (the default described above) and **Work**. Work
mode targets the folder of the selected cube: Claude gets `Read`, `Write`, `Edit`, `Glob` and `Grep` confined to
that folder (restricted mode) and still no tool that runs commands or programs. Drive roots and the home folder
itself are refused. Each folder keeps its own conversation per account.

In work mode a second button picks Claude Code's permission mode:

| Mode | Claude Code | Behaviour |
|---|---|---|
| **Preguntar** (default) | `default` + `--permission-prompt-tool` | Every edit appears in the log with its diff and waits for **Permitir** / **Denegar** (Enter / Esc with an empty input). Unanswered requests are denied after 15 minutes or when the turn ends. |
| **Aceptar ediciones** | `acceptEdits` | Edits inside the folder are applied without asking. |
| **Planificar** | `plan` | Claude only reads and proposes a plan. |

The prompts travel through the `prisma_permission` MCP tool, which waits on `POST /api/assistant/permission` until the
page answers with `POST /api/assistant/decide`.

## Hot reload

`npm run dev` starts `scripts/dev.js`, which runs the server with `--dev`:

- Changes under `public/` are pushed to open pages: stylesheets are swapped in place, anything else reloads the page.
- Changes to the server files restart the server, but only once no assistant turn is running, and only if every
  server file still parses (a broken file keeps the previous server alive so the prompt bar keeps working). Pages
  reload by themselves when the server comes back.

Together with work mode this lets you ask for a change to this application from its own prompt bar and see it
applied seconds later.
