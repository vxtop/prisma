// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 virtuanista
//
// Core: three.js imports, shared state and small utilities. First chunk of the client bundle.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// === Utilities ===
// settings saved by earlier versions (named SIMULA) under simula.* keys
try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('simula.') && localStorage.getItem('prisma.' + k.slice(7)) == null) localStorage.setItem('prisma.' + k.slice(7), localStorage.getItem(k)); } } catch {}
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtB = n => { if (n == null || !isFinite(n)) return '—'; const u = ['B','KB','MB','GB','TB']; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return (i && n < 100 ? n.toFixed(1) : Math.round(n)) + ' ' + u[i]; };
const fmtN = n => n == null ? '—' : Number(n).toLocaleString('es');
const fmtK = n => n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(n >= 1e5 ? 0 : 1) + 'k' : String(n);
const ago = t => { if (!t) return '—'; const s = (Date.now() - t) / 1000; if (s < 5) return 'ahora'; if (s < 60) return (s|0) + ' s'; if (s < 3600) return (s/60|0) + ' min'; if (s < 86400) return (s/3600|0) + ' h'; if (s < 86400*365) return (s/86400|0) + ' d'; return (s/86400/365).toFixed(1) + ' a'; };
const pct = v => v == null || !isFinite(v) ? '—' : Math.round(v * 100) + ' %';
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`; };
const base = p => String(p).split(/[\\/]/).filter(Boolean).pop() || p;
let CI = true; // Windows and macOS paths are case-insensitive, Linux is not (updated once the platform is known)
const K = p => CI ? String(p).toLowerCase() : String(p);
const trimSep = p => String(p).replace(/[\\/]+$/, '');
const under = (a, base) => { const b = trimSep(base); return a.length > b.length && a.startsWith(b) && /[\\/]/.test(a[b.length]); };
const relTo = (abs, base) => String(abs).slice(trimSep(base).length + 1);
const slug = p => String(p).replace(/[^a-zA-Z0-9]/g, '-');
const TK = () => (document.querySelector('meta[name=prisma]') || {}).content || '';
const api = async p => { const r = await fetch(p + (p.includes('?') ? '&' : '?') + 't=' + TK()); if (r.status === 403) { setTimeout(() => location.reload(), 300); throw new Error('Prisma se reinició: recargando'); } const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {} if (!r.ok) throw new Error((j && j.error) || 'HTTP ' + r.status); return j; };
const post = async (p, d) => { const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Prisma': TK() }, body: JSON.stringify(d) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };

const TYPES = ['Código', 'Datos', 'Docs·Media'], DEPTHS = ['Raíz', 'Nivel 1–2', 'Nivel 3+'], AGES = ['Ahora <1 h', 'Hoy <24 h', 'Antes'];
const AX = [TYPES, DEPTHS, AGES], AXN = ['X · tipo', 'Y · profundidad', 'Z · tiempo'];
const TYPE_HEX = ['#1768B5', '#269B65', '#E6B844'], TYPE_GLOW_HEX = ['#5aa2ea', '#4fd39a', '#f3d77e'], TYPE_COL = TYPE_GLOW_HEX.map(h => new THREE.Color(h)); // accents glow in lighter gem tints
// Gem of a whole cube (one colour per cube): sapphire code, emerald data, gold documents and media, silver folders, ruby executables.
// Each gem is [body, glow]: the body tints the matte metal, the glow lights windows, activity and the shimmer.
const GEM_HEX = { code: ['#1768B5', '#5aa2ea'], data: ['#269B65', '#4fd39a'], docs: ['#E6B844', '#f3d77e'], folder: ['#AEB9C5', '#dfe6ee'], exe: ['#C52235', '#f0707e'] };
const GEM = Object.fromEntries(Object.entries(GEM_HEX).map(([k, [a, b]]) => [k, [new THREE.Color(a), new THREE.Color(b)]]));
const GEM_TXT = { code: 'Código', data: 'Datos', docs: 'Documentos y medios', folder: 'Carpetas', exe: 'Ejecutables' };
const AI_HEX = ['#D97757', '#b9d3df', '#d6c08f', '#9fb8a0'];
const CODE = new Set('js mjs cjs ts jsx tsx py rs go c cc cpp h hpp cs java kt swift rb php html htm css scss vue svelte sh ps1 bat cmd sql lua dart r m asm glsl wgsl gd'.split(' '));
const DATA = new Set('json jsonl csv tsv xml yaml yml toml parquet db sqlite bin dat npy npz pt pth onnx safetensors pkl h5 lock log ini env cfg conf gguf arrow idx pack'.split(' '));
const cellOf = (rel, mtime) => { const e = (rel.match(/\.([^.\\/]+)$/) || [])[1]?.toLowerCase() || '', t = CODE.has(e) ? 0 : DATA.has(e) ? 1 : 2;
  const dp = rel.split(/[\\/]/).length - 1, d = dp === 0 ? 0 : dp <= 2 ? 1 : 2, age = Date.now() - mtime, a = age < 36e5 ? 0 : age < 864e5 ? 1 : 2; return t + 3 * d + 9 * a; };
const coord = i => [i % 3, (i / 3 | 0) % 3, i / 9 | 0];
const cellName = i => `${TYPES[i%3]} · ${DEPTHS[(i/3|0)%3]} · ${AGES[i/9|0]}`;
const BASE = Array.from({ length: 27 }, (_, i) => { const [x, y, z] = coord(i); return [x - 1, 1 - y, 1 - z]; });

const S = { cubes: new Map(), order: [], cores: [], sel: null, layout: 'cluster', exploded: false, slice: null, tab: 'ficha', sys: null, procs: null, hover: null,
  feed: [], cpuHist: [], autoFit: true, autoN: 0, focusRev: -1, follow: false, sessions: new Map(), geoDirty: true };

