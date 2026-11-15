# Contributing to vxtop

Thanks for your interest. vxtop is small on purpose: plain Node.js, no npm dependencies, no build step. Please keep it that way.

## Ground rules

1. **Read-only, always.** vxtop observes; it never creates, modifies or deletes anything it looks at, and never acts on processes or the system. The only folder it may write to is its own (`~/.vxtop`). Pull requests that break this are not accepted.
2. **Local and private.** The server listens on `127.0.0.1` only, every API call carries the session token, and nothing is sent to external services.
3. **No new dependencies.** Third-party code goes to `public/vendor/` with its license, and only when there is no reasonable alternative.

## Getting started

```bash
git clone https://github.com/vxtop/vxtop.git
cd vxtop
node server.js --port 4899      # a second instance next to your everyday one
```

Edits to `public/` show up on reload; edits to `server.js` need a restart.

## Code style

- Code, identifiers and comments in **English**; user-facing text (UI, CLI messages) in **Spanish**.
- Comments explain *why*, not *what*. Keep them short.
- Every source file starts with the SPDX header:
  ```js
  // SPDX-License-Identifier: Apache-2.0
  // Copyright 2026 virtuanista
  ```
- The client is one ES module split into ordered files (`public/js/NN-name.js`) that share a single scope. Put new code in the file of its area; add a new numbered file only for a new area. See [docs/architecture.md](docs/architecture.md).
- Visual rules: everything is drawn as 27-cell cubes (folders, programs), told apart by colour, size and emblem; nothing moves without a reason; one click does everything.

## Tests

```bash
npm run check        # syntax
npm test             # smoke test, no browser: token, read-only, bundle
npm run test:e2e     # headless Chrome: clicks, focus, races, zoom, views, tree, search
npm run test:live    # same, plus the live space with real programs
```

Tests use a throwaway fixture and home folder under the OS temp directory; they never touch your data. Screenshots go to `test/artifacts/`.

## Pull requests

- One topic per pull request, with a short description of the *why*.
- `npm run check`, `npm test` and `npm run test:e2e` pass.
- UI changes: attach a before/after screenshot.

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE).
