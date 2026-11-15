# Security

## Model

vxtop is a local, read-only monitor. Its security rests on four rules:

- **Loopback only.** The HTTP server binds to `127.0.0.1` and rejects requests whose `Host` is not `127.0.0.1` or `localhost` (DNS-rebinding protection).
- **Session token.** Every `/api` call needs the random token embedded in the page (or read by the local MCP server from `~/.vxtop/token`, mode `0600`). POST requests also need the `X-Vxtop` header and a same-origin `Origin`, so other websites cannot trigger reads, scans or indexing even blindly.
- **Read-only.** No endpoint writes, renames, deletes or executes anything in observed folders, or acts on processes. Writes go only to `~/.vxtop` (indexes, scenes, token). Network paths (`\\server\share`) are blocked.
- **Least privilege.** It starts without administrator rights. Elevation happens only when the user clicks the read-only badge and confirms the Windows prompt, and only adds read access (DNS cache, per-process open files).

Window thumbnails (`PrintWindow`) are generated locally, are off until the user allows them, and are only served to the page through the token-protected API.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting (**Security → Report a vulnerability**) on the repository, with steps to reproduce. You will get an answer within a week.
