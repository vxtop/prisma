#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Generates the (temporary) vxtop mark: an isometric 3×3×3 voxel cube with one amber cell lit,
// as public/favicon.svg and docs/assets/logo.svg (mark + wordmark). Usage: node scripts/brand.js

'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const C = { top: '#7fd6cf', left: '#1d3a3e', right: '#2b5a5e', line: '#081013', amber: '#e8a33d', lit: '#4fb3ad' };

const P = (x, y) => [x, y], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const poly = (pts, fill) => `<polygon points="${pts.map(p => p.map(n => +n.toFixed(2)).join(',')).join(' ')}" fill="${fill}"/>`;
const line = (a, b) => `<line x1="${+a[0].toFixed(2)}" y1="${+a[1].toFixed(2)}" x2="${+b[0].toFixed(2)}" y2="${+b[1].toFixed(2)}"/>`;

/** One face: parallelogram from origin o along u and v, split 3×3, with some cells coloured. */
function face(o, u, v, fill, cells = {}) {
  let s = poly([o, add(o, u), add(add(o, u), v), add(o, v)], fill);
  for (const [k, col] of Object.entries(cells)) { const [i, j] = k.split(',').map(Number), a = add(add(o, mul(u, i / 3)), mul(v, j / 3)); s += poly([a, add(a, mul(u, 1 / 3)), add(add(a, mul(u, 1 / 3)), mul(v, 1 / 3)), add(a, mul(v, 1 / 3))], col); }
  let g = ''; for (const t of [1 / 3, 2 / 3]) { g += line(add(o, mul(u, t)), add(add(o, mul(u, t)), v)) + line(add(o, mul(v, t)), add(add(o, mul(v, t)), u)); }
  return s + g;
}

function mark(x = 0, y = 0, k = 1) {
  const o = (px, py) => P(x + px * k, y + py * k), d = (px, py) => P(px * k, py * k);
  const body =
    face(o(8, 18), d(24, -14), d(24, 14), C.top, { '2,2': C.lit }) +
    face(o(8, 18), d(24, 14), d(0, 28), C.left, { '0,2': C.lit }) +
    face(o(32, 32), d(24, -14), d(0, 28), C.right, { '1,1': C.amber });
  const edge = [o(32, 4), o(56, 18), o(56, 46), o(32, 60), o(8, 46), o(8, 18)];
  return `<g stroke="${C.line}" stroke-width="${1.4 * k}" stroke-linejoin="round">${body}<polygon points="${edge.map(p => p.join(',')).join(' ')}" fill="none"/>${line(o(8, 18), o(32, 32))}${line(o(32, 32), o(56, 18))}${line(o(32, 32), o(32, 60))}</g>`;
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>vxtop</title>${mark()}</svg>\n`;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 64" width="236" height="64"><title>vxtop</title>${mark()}`
  + `<text x="76" y="44" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="6" fill="#7fd6cf">VX<tspan fill="#e8a33d">TOP</tspan></text></svg>\n`;

fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), icon);
fs.mkdirSync(path.join(ROOT, 'docs', 'assets'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'assets', 'logo.svg'), logo);
console.log('public/favicon.svg, docs/assets/logo.svg');
