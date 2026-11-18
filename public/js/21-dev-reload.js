// SPDX-License-Identifier: Apache-2.0
//
// Hot reload in development (server started with --dev, usually through scripts/dev.js):
// style changes are swapped in place; any other client change reloads the page.

function devReload(m) {
  if (m.css) {
    const link = document.querySelector('link[rel="stylesheet"][href^="/app.css"]');
    if (link) { link.href = '/app.css?v=' + Date.now(); return; }
  }
  location.reload();
}
