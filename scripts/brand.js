#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Generates the Prisma mark: a triangular prism lying on its base in matte graphene, its faces split 3×3 like the cubes of
// the space, with a few cells lit in the gem palette (light refracted by the prism).
// Writes public/favicon.svg and docs/assets/logo.svg (the same icon: the mark carries no name). Usage: node scripts/brand.js

'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GEM = { ruby: '#C52235', sapphire: '#1768B5', emerald: '#269B65', gold: '#E6B844', silver: '#AEB9C5', onyx: '#252B35', pearl: '#F0EBDD' };
const FACE = { top: '#2b313c', right: '#1a1e26', line: '#090b0f' };

const add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const pts = list => list.map(p => p.map(n => +n.toFixed(2)).join(',')).join(' ');
const poly = (list, fill) => `<polygon points="${pts(list)}" fill="${fill}"/>`;
const seg = (a, b) => `<line x1="${+a[0].toFixed(2)}" y1="${+a[1].toFixed(2)}" x2="${+b[0].toFixed(2)}" y2="${+b[1].toFixed(2)}"/>`;

/** A side face: parallelogram from o along u (top edge) and v (down), split 3×3, with lit cells. */
function side(o, u, v, fill, lit = {}) {
  let s = poly([o, add(o, u), add(add(o, u), v), add(o, v)], fill);
  for (const [k, col] of Object.entries(lit)) {
    const [i, j] = k.split(',').map(Number), a = add(add(o, mul(u, i / 3)), mul(v, j / 3));
    s += poly([a, add(a, mul(u, 1 / 3)), add(add(a, mul(u, 1 / 3)), mul(v, 1 / 3)), add(a, mul(v, 1 / 3))], col);
  }
  for (const t of [1 / 3, 2 / 3]) s += seg(add(o, mul(u, t)), add(add(o, mul(u, t)), v)) + seg(add(o, mul(v, t)), add(add(o, mul(v, t)), u));
  return s;
}

/** The top face: a triangle split into nine smaller triangles by lines parallel to its edges. */
function top(a, b, c, fill, litFill) {
  const at = (p, q, t) => add(p, mul([q[0] - p[0], q[1] - p[1]], t));
  let s = poly([a, b, c], fill);
  s += poly([c, at(c, a, 1 / 3), at(c, b, 1 / 3)], litFill); // the front tip catches the light
  for (const t of [1 / 3, 2 / 3]) s += seg(at(a, b, t), at(a, c, t)) + seg(at(b, a, t), at(b, c, t)) + seg(at(c, a, t), at(c, b, t));
  return s;
}

function mark() {
  // A prism lying on its base: the triangular end faces the viewer and the body recedes up and to the right.
  const left = [6, 54], right = [42, 54], apex = [24, 17], depth = [16, -10];
  const body =
    side(apex, [right[0] - apex[0], right[1] - apex[1]], depth, FACE.right, { '0,2': GEM.sapphire, '1,1': GEM.emerald, '2,0': GEM.gold, '1,2': GEM.ruby })
    + top(left, right, apex, FACE.top, GEM.pearl);
  const outline = [left, right, add(right, depth), add(apex, depth), apex];
  return `<g stroke="${FACE.line}" stroke-width="1.3" stroke-linejoin="round">${body}<polygon points="${pts(outline)}" fill="none"/>${seg(apex, right)}</g>`
    + `<line x1="${apex[0] + .6}" y1="${apex[1] + 1.2}" x2="${right[0] - .8}" y2="${right[1] - 1}" stroke="${GEM.pearl}" stroke-opacity=".3" stroke-width=".8"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>Prisma</title>${mark()}</svg>\n`;
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), svg);
fs.mkdirSync(path.join(ROOT, 'docs', 'assets'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'assets', 'logo.svg'), svg);
console.log('public/favicon.svg, docs/assets/logo.svg');
