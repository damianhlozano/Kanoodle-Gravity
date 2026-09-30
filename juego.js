/* Kanoodle Gravity - versión web (celular, tablet y PC).
 *
 * Todo se dibuja en un canvas en coordenadas "lógicas" (1100x760 apaisado o 540xN vertical) que
 * se escalan a la resolución física de la pantalla, así se ve nítido en cualquier dispositivo.
 */
'use strict';
(() => {

// ---------------------------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------------------------
const COLS = 6, ROWS = 5;
const HINT_COST = 100;
const STORAGE_KEY = 'kanoodle-gravity-v1';

const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
const BG_TOP = [50, 56, 66], BG_BOTTOM = [24, 26, 31];
const CARD = [46, 51, 60], CARD2 = [60, 66, 77];
const PANEL = [48, 165, 186], PANEL_DARK = [26, 118, 136];
const SLOT_TOP = [246, 248, 251], SLOT_BOTTOM = [220, 226, 234];
const TEXT = [236, 239, 244], MUTED = [152, 161, 175];
const YELLOW = [250, 201, 52], GREEN_OK = [120, 222, 110], RED_BAD = [255, 92, 92];
const HINT_COLOR = [214, 156, 24], UNDO_COLOR = PANEL, RESET_COLOR = [206, 72, 84], GO_COLOR = [80, 180, 70];

const rgb = a => a.map(v => Math.round(v * 255));
const PIECE_COLORS = {
  //        exterior                    brillo                     principal                 conector
  pink:   [rgb([.682, .151, .399]), rgb([.879, .413, .63]), rgb([.831, .184, .486]), rgb([.624, .138, .365])],
  green:  [rgb([.28, .704, .187]), rgb([.526, .898, .444]), rgb([.341, .859, .227]), rgb([.256, .644, .171])],
  blue:   [rgb([.09, .46, .624]), rgb([.359, .684, .828]), rgb([.11, .561, .761]), rgb([.082, .421, .571])],
  purple: [rgb([.344, .238, .64]), rgb([.582, .489, .842]), rgb([.42, .29, .78]), rgb([.315, .218, .585])],
  orange: [rgb([.788, .441, .1]), rgb([.972, .667, .368]), rgb([.961, .537, .122]), rgb([.72, .40, .09])],
  mint:   [rgb([.457, .73, .679]), rgb([.681, .921, .876]), rgb([.557, .89, .827]), rgb([.418, .668, .621])],
  red:    [rgb([.73, .122, .151]), rgb([.921, .387, .413]), rgb([.89, .149, .184]), rgb([.668, .112, .138])],
  yellow: [rgb([.82, .669, .138]), rgb([1, .867, .401]), rgb([1, .816, .169]), rgb([.75, .612, .126])],
};
const TIER_COLORS = {
  'Inicial': [86, 196, 72], 'Junior': [38, 150, 205], 'Experto': [124, 92, 214],
  'Maestro': [240, 140, 40], 'Genio': [226, 56, 66], 'Jefe final': [212, 52, 128],
};
const TIERS = Object.keys(TIER_COLORS);
const TIER_PIECES = { 'Inicial': 3, 'Junior': 4, 'Experto': 5, 'Maestro': 6, 'Genio': 7, 'Jefe final': 8 };
// estrellas que da cada nivel la primera vez que se completa
const TIER_STARS = { 'Inicial': 10, 'Junior': 12, 'Experto': 14, 'Maestro': 16, 'Genio': 18, 'Jefe final': 20 };
const levelStars = n => TIER_STARS[NIVELES[n - 1].tier];

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const mix = (c, o, t) => c.map((v, i) => Math.round(v + (o[i] - v) * t));
const colorStr = c => c.length === 4 ? `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` : `rgb(${c[0]},${c[1]},${c[2]})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

// ---------------------------------------------------------------------------------------------
// Formas
// ---------------------------------------------------------------------------------------------
function normalize(cells) {
  const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const rotateCw = cells => normalize(cells.map(([x, y]) => [-y, x]));
const rotateCcw = cells => normalize(cells.map(([x, y]) => [y, -x]));
const flipShape = cells => normalize(cells.map(([x, y]) => [-x, y]));
const sizeOf = cells => [Math.max(...cells.map(c => c[0])) + 1, Math.max(...cells.map(c => c[1])) + 1];
const sameShape = (a, b) => a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1]);
const key = (x, y) => x + ',' + y;

/** Fila (arriba de la forma) donde queda la pieza tirada en la columna ox, o null si no entra. */
function dropRow(grid, shape, ox) {
  const [w, h] = sizeOf(shape);
  if (ox < 0 || ox + w > COLS) return null;
  let oy = -h;
  for (;;) {
    const ny = oy + 1;
    if (shape.some(([x, y]) => y + ny >= ROWS || (y + ny >= 0 && grid[y + ny][x + ox] !== null))) break;
    oy = ny;
  }
  return oy >= 0 ? oy : null;
}

// ---------------------------------------------------------------------------------------------
// Nivel
// ---------------------------------------------------------------------------------------------
class Level {
  constructor(data) {
    this.n = data.n;
    this.tier = data.tier;
    this.pieces = data.pieces;
    this.todo = this.pieces.map((p, i) => p.placed ? -1 : i).filter(i => i >= 0);
    this.solOrder = Object.keys(data.solution).map(Number);   // orden de colocación de la solución
    this.solCells = {};
    this.solMap = new Map();                                   // celda -> nombre en la solución
    this.pieces.forEach(p => { if (p.placed) p.cells.forEach(([x, y]) => this.solMap.set(key(x, y), p.name)); });
    for (const i of this.solOrder) {
      this.solCells[i] = data.solution[i].map(c => [c[0], c[1]]);
      this.solCells[i].forEach(([x, y]) => this.solMap.set(key(x, y), this.pieces[i].name));
    }
    this.reset();
  }
  reset() {
    this.placed = new Map();
    this.pieces.forEach((p, i) => { if (p.placed) this.placed.set(i, p.cells.map(c => [c[0], c[1]])); });
    this.history = [];
  }
  grid() {
    const g = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (const [i, cells] of this.placed) for (const [x, y] of cells) g[y][x] = i;
    return g;
  }
  complete() { let n = 0; for (const c of this.placed.values()) n += c.length; return n === COLS * ROWS; }
  available() { return this.todo.filter(i => !this.placed.has(i)); }
  wrongPieces() {
    return this.history.filter(i => this.placed.get(i).some(([x, y]) => this.solMap.get(key(x, y)) !== this.pieces[i].name));
  }
  hasBuriedHole(g = this.grid()) {
    for (let x = 0; x < COLS; x++) {
      let filled = false;
      for (let y = 0; y < ROWS; y++) {
        if (g[y][x] !== null) filled = true; else if (filled) return true;
      }
    }
    return false;
  }
  /** {i, cells} de una pieza que ya se puede tirar a su lugar, o {why:'wrong'|'stuck', wrong:[...]} */
  hint() {
    const wrong = this.wrongPieces();
    if (wrong.length) return { why: 'wrong', wrong };
    const g = this.grid();
    const used = new Set();
    this.history.forEach(i => this.placed.get(i).forEach(([x, y]) => used.add(key(x, y))));
    // los naranjas son intercambiables
    const orangeTargets = this.solOrder.filter(i => this.pieces[i].name === 'orange'
      && !this.solCells[i].some(([x, y]) => used.has(key(x, y)))).map(i => this.solCells[i]);
    for (const i of this.solOrder) {
      if (this.placed.has(i)) continue;
      const targets = this.pieces[i].name === 'orange' ? orangeTargets : [this.solCells[i]];
      for (const cells of targets) {
        const shape = normalize(cells);
        const ox = Math.min(...cells.map(c => c[0])), oy = Math.min(...cells.map(c => c[1]));
        if (dropRow(g, shape, ox) !== oy) continue;
        cells.forEach(([x, y]) => { g[y][x] = i; });
        const buried = this.hasBuriedHole(g);
        cells.forEach(([x, y]) => { g[y][x] = null; });
        if (!buried) return { i, cells };
      }
    }
    return { why: 'stuck', wrong: [] };
  }
}

// ---------------------------------------------------------------------------------------------
// Progreso (localStorage)
// ---------------------------------------------------------------------------------------------
function loadProgress() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (d) return {
      done: new Set(d.completados || []), last: d.ultimo || 1,
      sound: d.sonido !== false, stars: Number.isFinite(d.estrellas) ? d.estrellas : 0,
    };
  } catch (e) { /* sin almacenamiento: arrancar de cero */ }
  return { done: new Set(), last: 1, sound: true, stars: 0 };
}
function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completados: [...p.done].sort((a, b) => a - b), ultimo: p.last, sonido: p.sound, estrellas: p.stars,
    }));
  } catch (e) { /* ignorar */ }
}

// ---------------------------------------------------------------------------------------------
// Sonido (Web Audio: se habilita con el primer toque)
// ---------------------------------------------------------------------------------------------
class Sounds {
  constructor(on) {
    this.on = on;
    this.ctx = null;
    this.buf = {};
    this.vol = { agarrar: .55, girar: .45, voltear: .6, caer: .85, error: .55, alerta: .55, deshacer: .6,
      reiniciar: .6, pista: .4, ganar: .75, entrar: .4, click: .35 };
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ogg = new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
    for (const name of Object.keys(this.vol)) {
      fetch(`sonidos/${name}.${ogg ? 'ogg' : 'mp3'}`)
        .then(r => r.arrayBuffer())
        .then(b => new Promise((ok, err) => this.ctx.decodeAudioData(b, ok, err)))
        .then(d => { this.buf[name] = d; })
        .catch(() => {});
    }
  }
  play(name) {
    if (!this.on || !this.ctx || !this.buf[name]) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = this.vol[name];
    src.buffer = this.buf[name];
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }
}

// ---------------------------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------------------------
let canvas, ctx;                 // ctx cambia temporalmente al dibujar en capas
let DPR = 1, S = 1, OX = 0, OY = 0; // escala lógica->CSS y desplazamiento (px CSS)
let L = null;                    // layout actual
const cache = new Map();
const K = () => S * DPR;          // px físicos por unidad lógica

function roundRectPath(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function gradient(c, x, y, w, h, top, bottom, horizontal) {
  const g = horizontal ? c.createLinearGradient(x, y, x + w, y) : c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, colorStr(top));
  g.addColorStop(1, colorStr(bottom || top));
  return g;
}

function setShadow(blur, alpha, dy) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur * K();
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = dy * K();
}

/** Rectángulo redondeado. o: {alpha, shadow:[blur, alpha, dy], stroke, lw, horizontal} */
function rr(x, y, w, h, r, top, bottom, o = {}) {
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  roundRectPath(ctx, x, y, w, h, r);
  if (top) {
    if (o.shadow) setShadow(...o.shadow);
    ctx.fillStyle = bottom ? gradient(ctx, x, y, w, h, top, bottom, o.horizontal) : colorStr(top);
    ctx.fill();
  }
  if (o.stroke) {
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = o.lw || 1;
    ctx.strokeStyle = colorStr(o.stroke);
    roundRectPath(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth,
      r - ctx.lineWidth / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function circle(cx, cy, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = colorStr(color);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function font(size, weight) { return `${weight || 400} ${size}px ${FONT}`; }

/** Texto con la y en el centro vertical. Devuelve el ancho. */
function txt(s, x, y, size, color, o = {}) {
  ctx.save();
  ctx.font = font(size, o.weight);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'middle';
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (o.shadow) {
    ctx.fillStyle = colorStr(o.shadow);
    ctx.fillText(s, x, y + size * .06);
  }
  ctx.fillStyle = colorStr(color);
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}
function txtW(s, size, weight) { ctx.save(); ctx.font = font(size, weight); const w = ctx.measureText(s).width; ctx.restore(); return w; }

function wrapLines(s, size, weight, maxW) {
  const words = s.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && txtW(t, size, weight) > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
function cached(k, make) {
  let v = cache.get(k);
  if (!v) { if (cache.size > 3000) cache.clear(); v = make(); cache.set(k, v); }
  return v;
}

/** Capa aparte (para dibujar semitransparente sin que se sumen las superposiciones). */
const scratch = { c: null };
function layer(x, y, w, h, alpha, fn) {
  const X = Math.floor((OX + x * S) * DPR), Y = Math.floor((OY + y * S) * DPR);
  const W = Math.ceil(w * K()) + 2, H = Math.ceil(h * K()) + 2;
  if (!scratch.c || scratch.c.width < W || scratch.c.height < H) scratch.c = makeCanvas(Math.max(W, 64), Math.max(H, 64));
  const sc = scratch.c.getContext('2d');
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, W, H);
  sc.setTransform(K(), 0, 0, K(), OX * DPR - X, OY * DPR - Y);
  const old = ctx;
  ctx = sc;
  try { fn(); } finally { ctx = old; }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(scratch.c, 0, 0, W, H, X, Y, W, H);
  ctx.restore();
}

// --- sprites de piezas
function cellSprite(name, pitch) {
  const P = Math.max(2, Math.round(pitch * K()));
  return cached(`cell|${name}|${P}`, () => {
    const [outer, hi, main] = PIECE_COLORS[name];
    const c = makeCanvas(P, P), x = c.getContext('2d');
    const m = P * .06, bs = P - 2 * m;
    roundRectPath(x, m, m, bs, bs, bs * .26);
    x.fillStyle = gradient(x, m, m, bs, bs, mix(hi, main, .25), mix(outer, BLACK, .18));
    x.fill();
    const ins = bs * .13, fs = bs - 2 * ins, fx = m + ins, fy = m + ins * .75;
    roundRectPath(x, fx, fy, fs, fs, fs * .24);
    x.fillStyle = gradient(x, fx, fy, fs, fs, mix(main, WHITE, .22), mix(main, outer, .35));
    x.fill();
    const gw = fs * .74, gh = fs * .34, gx = fx + (fs - gw) / 2, gy = fy + fs * .06;
    roundRectPath(x, gx, gy, gw, gh, gh / 2);
    x.fillStyle = gradient(x, gx, gy, gw, gh, [255, 255, 255, 165], [255, 255, 255, 0]);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.75)';
    x.beginPath();
    x.arc(m + bs * .24, m + bs * .22, bs * .045, 0, Math.PI * 2);
    x.fill();
    return c;
  });
}
function connSprite(name, pitch, vertical) {
  const Lp = Math.max(2, Math.round(pitch * .5 * K())), T = Math.max(2, Math.round(pitch * .3 * K()));
  return cached(`conn|${name}|${Lp}|${T}|${vertical}`, () => {
    const col = PIECE_COLORS[name][3];
    const c = vertical ? makeCanvas(T, Lp) : makeCanvas(Lp, T), x = c.getContext('2d');
    roundRectPath(x, 0, 0, c.width, c.height, T * .35);
    x.fillStyle = gradient(x, 0, 0, c.width, c.height, mix(col, WHITE, .25), mix(col, BLACK, .2), vertical);
    x.fill();
    return c;
  });
}
/** Sombra difusa pre-renderizada (truco: se dibuja la figura fuera del canvas y sólo queda la sombra). */
function shadowSprite(w, h, r, blur, alpha) {
  const k = K(), W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k)), B = Math.max(1, Math.round(blur * k));
  return cached(`sh|${W}|${H}|${B}|${Math.round(r * k)}|${alpha}`, () => {
    const c = makeCanvas(W + 4 * B, H + 4 * B), x = c.getContext('2d');
    const off = c.width + 20;
    x.shadowColor = `rgba(0,0,0,${alpha})`;
    x.shadowBlur = B;
    x.shadowOffsetX = off;
    roundRectPath(x, 2 * B - off, 2 * B, W, H, r * k);
    x.fillStyle = '#000';
    x.fill();
    c.pad = 2 * B / k;
    return c;
  });
}
function softShadow(x, y, w, h, r, blur, alpha, dy) {
  const s = shadowSprite(w, h, r, blur, alpha);
  ctx.drawImage(s, x - s.pad, y - s.pad + dy, s.width / K(), s.height / K());
}

/** cells en grilla; (ox, oy) = esquina lógica de la celda (0,0). o: {alpha, shadow:[blur, alpha, dy]} */
function drawPiece(cells, ox, oy, pitch, name, o = {}) {
  if (o.alpha !== undefined && o.alpha < 1) {
    const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
    const [w, h] = sizeOf(normalize(cells));
    const pad = pitch * .6;
    layer(ox + mx * pitch - pad, oy + my * pitch - pad, w * pitch + 2 * pad, h * pitch + 2 * pad, o.alpha,
      () => drawPiece(cells, ox, oy, pitch, name, { shadow: o.shadow }));
    return;
  }
  const set = new Set(cells.map(([x, y]) => key(x, y)));
  if (o.shadow) {
    const [blur, a, dy] = o.shadow;
    for (const [x, y] of cells) softShadow(ox + (x + .08) * pitch, oy + (y + .08) * pitch, pitch * .84, pitch * .84, pitch * .22, blur, a, dy);
  }
  const hs = connSprite(name, pitch, false), vs = connSprite(name, pitch, true);
  for (const [x, y] of cells) {
    if (set.has(key(x + 1, y))) ctx.drawImage(hs, ox + (x + .75) * pitch, oy + (y + .35) * pitch, pitch * .5, pitch * .3);
    if (set.has(key(x, y + 1))) ctx.drawImage(vs, ox + (x + .35) * pitch, oy + (y + .75) * pitch, pitch * .3, pitch * .5);
  }
  const spr = cellSprite(name, pitch);
  for (const [x, y] of cells) ctx.drawImage(spr, ox + x * pitch, oy + y * pitch, pitch, pitch);
}

// --- íconos (coordenadas lógicas)
function lineStyle(color, size) {
  ctx.strokeStyle = colorStr(color);
  ctx.fillStyle = colorStr(color);
  ctx.lineWidth = Math.max(1.5, size * .11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
function arrowHead(x, y, dx, dy, s) {
  const nx = -dy, ny = dx;
  ctx.beginPath();
  ctx.moveTo(x + dx * s * .55, y + dy * s * .55);
  ctx.lineTo(x + nx * s * .45 - dx * s * .25, y + ny * s * .45 - dy * s * .25);
  ctx.lineTo(x - nx * s * .45 - dx * s * .25, y - ny * s * .45 - dy * s * .25);
  ctx.closePath();
  ctx.fill();
}
const ICONS = {
  rotate(cx, cy, s, color, ccw) {
    ctx.save();
    ctx.translate(cx, cy);
    if (ccw) ctx.scale(-1, 1);
    lineStyle(color, s);
    const r = s * .36, a0 = Math.PI * 1.05, a1 = Math.PI * 2.62;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.stroke();
    const ex = Math.cos(a1) * r, ey = Math.sin(a1) * r;
    arrowHead(ex, ey, -Math.sin(a1), Math.cos(a1), s * .34);
    roundRectPath(ctx, -s * .13, -s * .13, s * .26, s * .26, s * .06);
    ctx.fill();
    ctx.restore();
  },
  flip(cx, cy, s, color) {
    ctx.save();
    lineStyle(color, s);
    ctx.setLineDash([s * .08, s * .09]);
    ctx.beginPath(); ctx.moveTo(cx, cy - s * .42); ctx.lineTo(cx, cy + s * .42); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx - s * .1, cy - s * .28); ctx.lineTo(cx - s * .1, cy + s * .28); ctx.lineTo(cx - s * .44, cy + s * .28);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * .1, cy - s * .28); ctx.lineTo(cx + s * .1, cy + s * .28); ctx.lineTo(cx + s * .44, cy + s * .28);
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  },
  drop(cx, cy, s, color) {
    ctx.save();
    lineStyle(color, s);
    ctx.beginPath(); ctx.moveTo(cx, cy - s * .4); ctx.lineTo(cx, cy + s * .1); ctx.stroke();
    arrowHead(cx, cy + s * .12, 0, 1, s * .42);
    ctx.beginPath(); ctx.moveTo(cx - s * .36, cy + s * .4); ctx.lineTo(cx + s * .36, cy + s * .4); ctx.stroke();
    ctx.restore();
  },
  undo(cx, cy, s, color) {
    ctx.save();
    lineStyle(color, s);
    const r = s * .3;
    ctx.beginPath();
    ctx.arc(cx + s * .05, cy + s * .08, r, Math.PI * 1.02, Math.PI * .5 + Math.PI * 2, false);
    ctx.stroke();
    arrowHead(cx + s * .05 - r, cy + s * .02, 0, 1, s * .36);
    ctx.restore();
  },
  reset(cx, cy, s, color) {
    ctx.save();
    lineStyle(color, s);
    const r = s * .34, a0 = -Math.PI * .35, a1 = Math.PI * 1.35;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
    arrowHead(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, Math.sin(a0), -Math.cos(a0), s * .34);
    ctx.restore();
  },
  levels(cx, cy, s, color) {
    ctx.save();
    ctx.fillStyle = colorStr(color);
    const q = s * .3, g = s * .1;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      roundRectPath(ctx, cx + (dx < 0 ? -q - g / 2 : g / 2), cy + (dy < 0 ? -q - g / 2 : g / 2), q, q, q * .25);
      ctx.fill();
    }
    ctx.restore();
  },
  speaker(cx, cy, s, color, on) {
    ctx.save();
    lineStyle(color, s);
    const x0 = cx - s * .5, y0 = cy - s * .5;
    ctx.beginPath();
    [[.08, .36], [.3, .36], [.55, .14], [.55, .86], [.3, .64], [.08, .64]].forEach(([a, b], i) =>
      i ? ctx.lineTo(x0 + a * s, y0 + b * s) : ctx.moveTo(x0 + a * s, y0 + b * s));
    ctx.closePath();
    ctx.fill();
    if (on) {
      for (const r of [.2, .34]) { ctx.beginPath(); ctx.arc(x0 + .5 * s, cy, r * s, -.9, .9); ctx.stroke(); }
    } else {
      ctx.beginPath();
      ctx.moveTo(x0 + .66 * s, y0 + .34 * s); ctx.lineTo(x0 + .94 * s, y0 + .66 * s);
      ctx.moveTo(x0 + .66 * s, y0 + .66 * s); ctx.lineTo(x0 + .94 * s, y0 + .34 * s);
      ctx.stroke();
    }
    ctx.restore();
  },
  star(cx, cy, s, color = YELLOW) {
    ctx.save();
    const pts = [];
    for (let j = 0; j < 10; j++) {
      const a = -Math.PI / 2 + j * Math.PI / 5, r = s * (j % 2 === 0 ? .5 : .21);
      pts.push([cx + r * Math.cos(a), cy + s * .03 + r * Math.sin(a)]);
    }
    const poly = (ps) => { ctx.beginPath(); ps.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
    ctx.fillStyle = colorStr(mix(color, BLACK, .22));
    ctx.lineJoin = 'round';
    poly(pts);
    ctx.fillStyle = colorStr(color);
    poly(pts.map(([x, y]) => [cx + (x - cx) * .8, cy + s * .03 + (y - cy - s * .03) * .8]));
    circle(cx - s * .08, cy - s * .1, s * .07, mix(color, WHITE, .6));
    ctx.restore();
  },
  check(cx, cy, s, color) {
    ctx.save();
    lineStyle(color, s * 1.4);
    ctx.beginPath();
    ctx.moveTo(cx - s * .4, cy + s * .02);
    ctx.lineTo(cx - s * .1, cy + s * .3);
    ctx.lineTo(cx + s * .4, cy - s * .3);
    ctx.stroke();
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------------------------
class Button {
  constructor(label, color, icon = null, sub = null) {
    this.label = label; this.color = color; this.icon = icon; this.sub = sub;
    this.x = this.y = this.w = this.h = 0;
    this.enabled = true; this.visible = true; this.hover = 0; this.pressT = 0;
  }
  set(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; return this; }
  hit(p) { return this.visible && this.enabled && inRect(p, this); }
  draw(app, size = 17) {
    if (!this.visible) return;
    const over = app.pointerIsMouse && this.enabled && inRect(app.mouse, this);
    this.hover += ((over ? 1 : 0) - this.hover) * Math.min(1, app.dt * 14);
    const pressed = app.t - this.pressT < .12;
    const lift = this.hover * 2 - (pressed ? 1.5 : 0);
    let col = this.enabled ? this.color : mix(this.color, CARD, .65);
    col = mix(col, WHITE, .12 * this.hover);
    if (pressed) col = mix(col, BLACK, .15);
    const r = Math.min(12, this.h / 2), y = this.y - lift;
    rr(this.x, y, this.w, this.h, r, mix(col, WHITE, .14), mix(col, BLACK, .14),
      { shadow: [7 + 4 * this.hover, this.enabled ? .35 : .15, 3 + 2 * this.hover] });
    rr(this.x + 2, y + 1, this.w - 4, this.h * .45, r - 2, [255, 255, 255, 40], [255, 255, 255, 0]);
    const tc = this.enabled ? WHITE : mix(WHITE, CARD, .55);
    const cx = this.x + this.w / 2, cy = y + this.h / 2;
    if (this.icon && this.sub) {            // ícono con texto chico abajo (celular)
      this.icon(cx, cy - this.h * .13, Math.min(this.h * .42, this.w * .5), tc);
      txt(this.sub, cx, y + this.h * .78, 11.5, tc, { align: 'center', weight: 600 });
    } else if (this.icon && this.label) {  // ícono + texto al lado
      const s = this.h * .46, w = s + 8 + txtW(this.label, size, 600), x0 = cx - w / 2;
      this.icon(x0 + s / 2, cy, s, tc);
      txt(this.label, x0 + s + 8, cy, size, tc, { weight: 600 });
    } else if (this.icon) {
      this.icon(cx, cy, Math.min(this.h, this.w) * .52, tc);
    } else {
      txt(this.label, cx, cy, size, tc, { align: 'center', weight: 600 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Confeti
// ---------------------------------------------------------------------------------------------
class Confetti {
  constructor(W, H) {
    this.W = W; this.H = H;
    const cols = Object.values(PIECE_COLORS).map(c => c[2]).concat([YELLOW, WHITE]);
    this.parts = Array.from({ length: 170 }, () => ({
      x: rand(0, W), y: rand(-H * .9, -10), vx: rand(-40, 40), vy: rand(110, 260),
      c: colorStr(cols[Math.floor(Math.random() * cols.length)]), a: rand(0, 6.28), spin: rand(-4, 4),
      f: rand(0, 6.28), fs: rand(4, 9), size: [8, 10, 12][Math.floor(Math.random() * 3)], sway: rand(0, 6.28),
    }));
  }
  update(dt) {
    for (const p of this.parts) {
      p.sway += dt * 2.2;
      p.x += (p.vx + Math.sin(p.sway) * 35) * dt;
      p.y += p.vy * dt;
      p.a += p.spin * dt;
      p.f += p.fs * dt;
      if (p.y > this.H + 20) { p.y = rand(-60, -10); p.x = rand(0, this.W); }
    }
  }
  draw() {
    for (const p of this.parts) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.scale(Math.max(.05, Math.abs(Math.cos(p.f))), 1);
      ctx.fillStyle = p.c;
      roundRectPath(ctx, -p.size / 2, -p.size * .275, p.size, p.size * .55, p.size * .12);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Layouts (apaisado tipo PC y vertical tipo celular)
// ---------------------------------------------------------------------------------------------
function makeLayout(vw, vh) {
  const portrait = vh > vw * 1.05;
  if (!portrait) {
    const cell = 64, boardX = 84, boardTop = 336;
    return {
      portrait, W: 1100, H: 760, cell, boardX, boardTop, boardW: COLS * cell, boardH: ROWS * cell,
      tray: { x: 596, y: 104, w: 464, h: 590 }, trayPitch: 40,
      trayArea: { x: 624, y: 174, w: 408, h: 370 },
    };
  }
  const W = 540, H = clamp(W * vh / vw, 1000, 1250);
  const cell = 60, boardX = (W - COLS * cell) / 2, boardTop = 340;
  const tray = { x: 12, y: 782, w: W - 24, h: H - 782 - 12 };
  return {
    portrait, W, H, cell, boardX, boardTop, boardW: COLS * cell, boardH: ROWS * cell,
    tray, trayPitch: 46, trayArea: { x: tray.x + 14, y: tray.y + 42, w: tray.w - 28, h: tray.h - 54 },
  };
}

/** En pantallas altas, baja el contenido del menú para centrarlo. */
const menuDy = () => (L.portrait ? Math.max(0, (L.H - 990) / 3) : 0);

/** Acomoda las piezas en la bandeja; achica si no entran. */
function layoutTray(level) {
  const items = level.todo.map(i => [i, ...sizeOf(level.pieces[i].cells)]);
  const area = L.trayArea;
  for (let pitch = L.trayPitch; pitch >= 16; pitch -= 2) {
    const gx = pitch * .8, gy = pitch * .7;
    const rows = [];
    let row = [], rw = 0;
    for (const it of items) {
      const pw = it[1] * pitch;
      if (row.length && rw + gx + pw > area.w) { rows.push([row, rw]); row = []; rw = 0; }
      rw += (row.length ? gx : 0) + pw;
      row.push(it);
    }
    if (row.length) rows.push([row, rw]);
    const total = rows.reduce((s, [r]) => s + Math.max(...r.map(it => it[2])) * pitch, 0) + gy * (rows.length - 1);
    if (total > area.h && pitch > 16) continue;
    const pos = new Map();
    let y = area.y + Math.max(0, (area.h - total) / (L.portrait ? 2 : 3));
    for (const [r, w] of rows) {
      let x = area.x + (area.w - w) / 2;
      const rh = Math.max(...r.map(it => it[2])) * pitch;
      for (const [i, cw, ch] of r) {
        pos.set(i, { x, y: y + (rh - ch * pitch) / 2, w: cw * pitch, h: ch * pitch });
        x += cw * pitch + gx;
      }
      y += rh + gy;
    }
    level.trayPos = pos;
    level.trayPitch = pitch;
    return;
  }
}

// ---------------------------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------------------------
class App {
  constructor() {
    canvas = document.getElementById('juego');
    ctx = canvas.getContext('2d');
    const p = loadProgress();
    this.done = p.done; this.last = p.last; this.stars = p.stars; this.starsShown = p.stars;
    this.sounds = new Sounds(p.sound);
    this.mode = 'menu';
    this.level = null;
    this.help = false;
    this.t = 0; this.dt = 1 / 60;
    this.mouse = { x: -999, y: -999 };
    this.pointerIsMouse = !matchMedia('(pointer: coarse)').matches;
    this.tileHover = new Map();
    this.drag = null;
    this.wheelT = 0;
    this.winStars = 0;

    const I = ICONS;
    this.btn = {
      sound: new Button('', CARD2, (cx, cy, s, c) => I.speaker(cx, cy, s * .95, c, this.sounds.on)),
      levels: new Button('Niveles', CARD2),
      levelsIcon: new Button('', CARD2, I.levels),
      hint: new Button('', HINT_COLOR, (cx, cy, s, c) => this.drawHintLabel(cx, cy, c)),
      undo: new Button('Deshacer', UNDO_COLOR),
      reset: new Button('Reiniciar', RESET_COLOR),
      prev: new Button('‹', CARD2),
      next: new Button('›', CARD2),
      ccw: new Button('Girar', CARD2, (cx, cy, s, c) => I.rotate(cx, cy, s, c, true)),
      cw: new Button('Girar', CARD2, (cx, cy, s, c) => I.rotate(cx, cy, s, c, false)),
      flip: new Button('Espejo', CARD2, I.flip),
      drop: new Button('Soltar', GO_COLOR, I.drop),
      // versión celular: ícono + texto chico
      mCcw: new Button('', CARD2, (cx, cy, s, c) => I.rotate(cx, cy, s, c, true), 'Girar'),
      mCw: new Button('', CARD2, (cx, cy, s, c) => I.rotate(cx, cy, s, c, false), 'Girar'),
      mFlip: new Button('', CARD2, I.flip, 'Espejo'),
      mDrop: new Button('', GO_COLOR, I.drop, 'Soltar'),
      mHint: new Button('', HINT_COLOR, (cx, cy, s, c) => I.star(cx, cy, s * 1.1, YELLOW), `Pista ${HINT_COST}`),
      mUndo: new Button('', UNDO_COLOR, I.undo, 'Deshacer'),
      mReset: new Button('', RESET_COLOR, I.reset, 'Reiniciar'),
      winNext: new Button('Siguiente', GO_COLOR),
      winMenu: new Button('Niveles', PANEL),
      help: new Button('Cómo jugar', PANEL),
      menuSound: new Button('', CARD2, (cx, cy, s, c) => I.speaker(cx, cy, s * .95, c, this.sounds.on)),
      cont: new Button('', GO_COLOR),
    };

    this.resize();
    addEventListener('resize', () => this.resize());
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    canvas.addEventListener('pointermove', e => this.onMove(e));
    canvas.addEventListener('pointerup', e => this.onUp(e));
    canvas.addEventListener('pointercancel', () => { this.drag = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    addEventListener('keydown', e => this.onKey(e));
    addEventListener('popstate', () => this.onBack());
    history.replaceState({ kg: 'menu' }, '');
    requestAnimationFrame(ts => { this.lastTs = ts; this.loop(ts); });
  }

  // ------------------------------------------------------------------ tamaño y layout
  resize() {
    const vw = innerWidth, vh = innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(vw * DPR);
    canvas.height = Math.round(vh * DPR);
    const cs = getComputedStyle(document.getElementById('areasegura'));
    const inset = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
      b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    const aw = vw - inset.l - inset.r, ah = vh - inset.t - inset.b;
    L = makeLayout(aw, ah);
    S = Math.min(aw / L.W, ah / L.H);
    OX = inset.l + (aw - L.W * S) / 2;
    OY = inset.t + (ah - L.H * S) / 2;
    cache.clear();
    this.placeButtons();
    if (this.level) layoutTray(this.level);
  }

  placeButtons() {
    const b = this.btn, W = L.W;
    Object.values(b).forEach(x => { x.visible = false; });
    const show = (btn, x, y, w, h) => { btn.set(x, y, w, h); btn.visible = true; };
    // menú
    if (L.portrait) {
      show(b.menuSound, 12, 14, 48, 44);
      show(b.help, W - 12 - 132, 14, 132, 44);
      show(b.cont, W / 2 - 130, 236 + menuDy(), 260, 50);
    } else {
      show(b.cont, 30, 24, 196, 44);
      show(b.menuSound, W - 236, 24, 48, 44);
      show(b.help, W - 176, 24, 146, 44);
    }
    // juego
    if (L.portrait) {
      show(b.levelsIcon, 12, 14, 48, 44);
      show(b.sound, W - 60, 70, 48, 40);
      show(b.prev, 250, 74, 34, 32);
      show(b.next, 290, 74, 34, 32);
      const n = 7, gap = 6, bw = (W - 24 - gap * (n - 1)) / n, y = 706, h = 64;
      [b.mCcw, b.mCw, b.mFlip, b.mDrop, b.mHint, b.mUndo, b.mReset].forEach((btn, i) => show(btn, 12 + i * (bw + gap), y, bw, h));
    } else {
      show(b.sound, 500, 24, 48, 44);
      show(b.levels, 558, 24, 100, 44);
      show(b.hint, 668, 24, 150, 44);
      show(b.undo, 828, 24, 108, 44);
      show(b.reset, 946, 24, 114, 44);
      show(b.prev, L.boardX + 256, 73, 34, 30);
      show(b.next, L.boardX + 296, 73, 34, 30);
      const t = L.tray, gap = 10, bw = (t.w - 56 - gap * 3) / 4, y = t.y + t.h - 128;
      [b.ccw, b.cw, b.flip, b.drop].forEach((btn, i) => show(btn, t.x + 28 + i * (bw + gap), y, bw, 48));
    }
    const cw = Math.min(470, W - 40);
    show(b.winNext, W / 2 - cw / 2 + 30, 0, cw / 2 - 40, 54);
    show(b.winMenu, W / 2 + 10, 0, cw / 2 - 40, 54);
    // menú: fichas de niveles
    this.tiles = [];
    let x0, y0, tw, th, gx, gy;
    if (L.portrait) { gx = 6; gy = 8; tw = (W - 24 - 9 * gx) / 10; th = 42; x0 = 12; y0 = 312 + menuDy(); }
    else { gx = 10; gy = 10; tw = 80; th = 40; x0 = (W - (10 * tw + 9 * gx)) / 2; y0 = 214; }
    NIVELES.forEach((lv, idx) => {
      const r = Math.floor(idx / 10), c = idx % 10;
      this.tiles.push({ x: x0 + c * (tw + gx), y: y0 + r * (th + gy), w: tw, h: th, lv });
    });
  }

  gameButtons() {
    const b = this.btn;
    return L.portrait
      ? [b.levelsIcon, b.sound, b.prev, b.next, b.mCcw, b.mCw, b.mFlip, b.mDrop, b.mHint, b.mUndo, b.mReset]
      : [b.sound, b.levels, b.hint, b.undo, b.reset, b.prev, b.next, b.ccw, b.cw, b.flip, b.drop];
  }

  // ------------------------------------------------------------------ progreso
  save() { saveProgress({ done: this.done, last: this.last, sound: this.sounds.on, stars: this.stars }); }
  toggleSound() { this.sounds.on = !this.sounds.on; this.sounds.play('click'); this.save(); }

  // ------------------------------------------------------------------ nivel
  openLevel(n, pushHistory = true) {
    n = clamp(n, 1, 100);
    this.level = new Level(NIVELES[n - 1]);
    layoutTray(this.level);
    this.last = n;
    this.save();
    if (pushHistory && this.mode !== 'game') history.pushState({ kg: 'game' }, '');
    this.mode = 'game';
    this.held = null; this.heldX = 0; this.rotAnim = null; this.anim = null;
    this.message = ''; this.msgTime = 0; this.msgColor = TEXT;
    this.hintShow = null; this.flash = []; this.flashTime = 0;
    this.won = false; this.winT = 0; this.confetti = null; this.shake = 0;
    this.bounce = new Map(); this.dust = []; this.trayHover = new Map(); this.drag = null;
    this.sounds.play('entrar');
  }
  goMenu() {
    if (this.mode === 'game' && history.state && history.state.kg === 'game') { history.back(); return; }
    this.mode = 'menu';
  }
  onBack() {
    if (this.help) { this.help = false; history.pushState({ kg: this.mode }, ''); return; }
    if (this.mode === 'game') { this.mode = 'menu'; this.sounds.play('click'); }
  }
  say(text, color = TEXT, secs = 2.5) { this.message = text; this.msgColor = color; this.msgTime = secs; }

  take(i) {
    const shape = normalize(this.level.pieces[i].cells);
    const [w] = sizeOf(shape);
    this.held = { i, shape, ox: clamp(Math.floor((COLS - w) / 2), 0, COLS - w), fx: null };
    this.heldX = this.held.ox;
    this.rotAnim = null;
    this.sounds.play('agarrar');
  }
  /** Columna según la posición x (el centro de la pieza sigue al puntero). */
  colFor(x) {
    const [w] = sizeOf(this.held.shape);
    const fx = clamp((x - L.boardX) / L.cell - w / 2, 0, COLS - w);
    return { fx, ox: clamp(Math.round(fx), 0, COLS - w) };
  }
  inBoardZone(p) {
    return p.x >= L.boardX - L.cell && p.x <= L.boardX + L.boardW + L.cell
      && p.y >= (L.portrait ? 120 : 100) && p.y <= L.boardTop + L.boardH + 40;
  }
  heldRect() {
    const [w, h] = sizeOf(this.held.shape);
    return { x: L.boardX + this.heldX * L.cell, y: L.boardTop - (h + .45) * L.cell, w: w * L.cell, h: h * L.cell };
  }
  transformHeld(kind) {
    if (!this.held || this.anim) return;
    const fn = { cw: rotateCw, ccw: rotateCcw, flip: flipShape }[kind];
    const [w0] = sizeOf(this.held.shape);
    const center = this.held.ox + w0 / 2;
    this.held.shape = fn(this.held.shape);
    const [w] = sizeOf(this.held.shape);
    this.held.ox = clamp(Math.round(center - w / 2), 0, COLS - w);
    this.held.fx = null;
    this.heldX = this.held.ox;
    this.rotAnim = { kind, t: 0 };
    this.sounds.play(kind === 'flip' ? 'voltear' : 'girar');
  }
  dropHeld() {
    if (!this.held || this.anim) return;
    const { i, shape, ox } = this.held;
    const oy = dropRow(this.level.grid(), shape, ox);
    if (oy === null) {
      this.say('¡No entra ahí! Probá otra columna o girala.', [255, 150, 150]);
      this.shake = .35;
      this.sounds.play('error');
      return;
    }
    const h = sizeOf(shape)[1];
    this.anim = { i, shape, ox, x: this.heldX, y: -h - .45, target: oy, v: 3 };
    this.held = null;
  }
  land() {
    const a = this.anim, lv = this.level;
    this.anim = null;
    const cells = a.shape.map(([x, y]) => [x + a.ox, y + a.target]);
    lv.placed.set(a.i, cells);
    lv.history.push(a.i);
    // la pista comprada queda hasta que se coloca esa pieza (o se ocupa su lugar)
    if (this.hintShow && (this.hintShow.i === a.i
        || this.hintShow.cells.some(([x, y]) => cells.some(c => c[0] === x && c[1] === y)))) this.hintShow = null;
    this.bounce.set(a.i, 0);
    this.sounds.play('caer');
    const set = new Set(cells.map(([x, y]) => key(x, y)));
    for (const [x, y] of cells) {
      if (set.has(key(x, y + 1))) continue;
      for (let k = 0; k < 3; k++) {
        this.dust.push({ x: L.boardX + (x + rand(.15, .85)) * L.cell, y: L.boardTop + (y + .95) * L.cell,
          vx: rand(-40, 40), vy: rand(-40, -10), life: 0, r: rand(3, 6) });
      }
    }
    if (lv.complete()) {
      this.won = true; this.winT = 0;
      this.confetti = new Confetti(L.W, L.H);
      this.winStars = this.done.has(lv.n) ? 0 : levelStars(lv.n);
      this.stars += this.winStars;
      this.done.add(lv.n);
      this.save();
      this.sounds.play('ganar');
    } else if (lv.hasBuriedHole()) {
      this.say('Quedó un hueco tapado: así no se puede completar. Deshacé.', [255, 180, 130], 4);
      this.sounds.play('alerta');
    }
  }
  undo() {
    const lv = this.level;
    if (this.anim || !lv.history.length) return;
    this.held = null;
    lv.placed.delete(lv.history.pop());
    this.won = false; this.confetti = null;
    this.sounds.play('deshacer');
  }
  reset() {
    this.level.reset();
    this.held = null; this.anim = null; this.won = false; this.confetti = null; this.hintShow = null;
    this.sounds.play('reiniciar');
  }
  hint() {
    if (this.anim || this.won) return;
    const r = this.level.hint();
    if (r.why) {
      if (r.why === 'wrong') {
        this.flash = r.wrong; this.flashTime = 2.5;
        this.say('Hay una pieza que no va ahí (marcada en rojo). Deshacé.', [255, 150, 150], 3.5);
      } else this.say('Así no se puede terminar. Deshacé alguna pieza.', [255, 150, 150], 3.5);
      this.sounds.play('alerta');
      return;
    }
    if (this.hintShow) { this.say('La pista ya está marcada en el tablero.', YELLOW, 2.5); return; }
    if (this.stars < HINT_COST) {
      this.say(`Una pista cuesta ${HINT_COST} estrellas y tenés ${this.stars}. ¡Completá niveles!`, [255, 190, 140], 3.5);
      this.sounds.play('error');
      return;
    }
    this.stars -= HINT_COST;
    this.save();
    this.hintShow = { i: r.i, cells: r.cells };
    this.say(`Pista (−${HINT_COST} estrellas): esa pieza va en el lugar marcado.`, YELLOW, 4);
    this.sounds.play('pista');
  }

  // ------------------------------------------------------------------ entrada
  toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - OX) / S, y: (e.clientY - r.top - OY) / S };
  }
  onDown(e) {
    this.sounds.unlock();
    this.pointerIsMouse = e.pointerType === 'mouse';
    const p = this.toLogical(e);
    this.mouse = p;
    canvas.focus();
    if (this.help) { this.help = false; return; }
    if (this.mode === 'menu') return this.menuDown(p);
    const lv = this.level, b = this.btn;
    if (this.won) {
      if (b.winNext.hit(p) && lv.n < 100) this.openLevel(lv.n + 1);
      else if (b.winMenu.hit(p)) { this.sounds.play('click'); this.goMenu(); }
      return;
    }
    for (const btn of this.gameButtons()) {
      if (!btn.hit(p)) continue;
      btn.pressT = this.t;
      this.buttonAction(btn);
      return;
    }
    if (this.anim) return;
    const mouse = this.pointerIsMouse;
    for (const [i, r] of lv.trayPos) {
      if (lv.placed.has(i) || !inRect(p, inflate(r, 10))) continue;
      if (this.held && this.held.i === i && mouse) { this.held = null; this.sounds.play('deshacer'); return; }
      if (!this.held || this.held.i !== i) this.take(i);
      if (!mouse) this.drag = { id: e.pointerId, kind: 'tray', x0: p.x, y0: p.y, moved: false };
      return;
    }
    if (mouse) {
      if (e.button === 2) this.transformHeld('cw');
      else if (e.button === 1) { e.preventDefault(); this.transformHeld('flip'); }
      else if (e.button === 0 && this.held && this.inBoardZone(p)) {
        Object.assign(this.held, this.colFor(p.x)); this.held.fx = null; this.dropHeld();
      }
      return;
    }
    // táctil
    if (!this.held) return;
    if (inRect(p, inflate(this.heldRect(), 12))) {
      this.drag = { id: e.pointerId, kind: 'held', x0: p.x, y0: p.y, moved: false, dx: p.x - this.heldRect().x };
    } else if (this.inBoardZone(p)) {
      this.drag = { id: e.pointerId, kind: 'board', x0: p.x, y0: p.y, moved: false };
      Object.assign(this.held, this.colFor(p.x));
    }
  }
  onMove(e) {
    const p = this.toLogical(e);
    this.mouse = p;
    if (e.pointerType === 'mouse') {
      this.pointerIsMouse = true;
      if (this.mode === 'game' && this.held && !this.drag && this.inBoardZone(p)) {
        const c = this.colFor(p.x);
        this.held.ox = c.ox; this.held.fx = null;
      }
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId || !this.held) return;
    if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) > 10) d.moved = true;
    if (!d.moved) return;
    if (d.kind === 'tray' && this.overTray(p)) return;   // todavía dentro de la bandeja
    const x = d.kind === 'held' ? p.x - d.dx + sizeOf(this.held.shape)[0] * L.cell / 2 : p.x;
    Object.assign(this.held, this.colFor(x));
  }
  onUp(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (!this.held) return;
    const p = this.toLogical(e);
    this.held.fx = null;
    if (d.kind === 'held' && !d.moved) { this.transformHeld('cw'); return; }
    if (!d.moved) return;
    if (this.overTray(p)) {
      if (d.kind !== 'tray') { this.held = null; this.sounds.play('deshacer'); }
      return;
    }
    this.dropHeld();
  }
  overTray(p) { return inRect(p, L.tray); }
  onWheel(e) {
    e.preventDefault();
    if (this.mode !== 'game' || !this.held || this.t - this.wheelT < .09 || Math.abs(e.deltaY) < 1) return;
    this.wheelT = this.t;
    this.transformHeld(e.deltaY < 0 ? 'cw' : 'ccw');   // rueda arriba: horario · abajo: antihorario
  }
  onKey(e) {
    this.sounds.unlock();
    const k = e.key;
    if (this.help) { this.help = false; e.preventDefault(); return; }
    if (this.mode === 'menu') {
      if (k === 'Enter' || k === ' ') this.openLevel(this.last);
      else if (k === 'm' || k === 'M') this.toggleSound();
      else return;
      e.preventDefault();
      return;
    }
    const lv = this.level;
    if (this.won) {
      if ((k === 'Enter' || k === ' ') && lv.n < 100) this.openLevel(lv.n + 1);
      else if (k === 'Escape') this.goMenu();
      else if (k === 'z' || k === 'Z') this.undo();
      e.preventDefault();
      return;
    }
    const held = this.held;
    switch (k) {
      case 'r': case 'R': case 'ArrowUp': this.transformHeld('cw'); break;
      case 'q': case 'Q': case 'e': case 'E': this.transformHeld('ccw'); break;
      case 'f': case 'F': case 'ArrowDown': this.transformHeld('flip'); break;
      case 'ArrowLeft': if (held) { held.ox = Math.max(0, held.ox - 1); held.fx = null; } break;
      case 'ArrowRight': if (held) { held.ox = Math.min(COLS - sizeOf(held.shape)[0], held.ox + 1); held.fx = null; } break;
      case ' ': case 'Enter': this.dropHeld(); break;
      case 'Escape': if (held) { this.held = null; this.sounds.play('deshacer'); } else this.goMenu(); break;
      case 'z': case 'Z': this.undo(); break;
      case 'h': case 'H': this.hint(); break;
      case 'm': case 'M': this.toggleSound(); break;
      case 'Backspace': this.reset(); break;
      case 'PageDown': this.openLevel(lv.n + 1, false); break;
      case 'PageUp': this.openLevel(lv.n - 1, false); break;
      default:
        if (k >= '1' && k <= '9') {
          const av = lv.available(), idx = Number(k) - 1;
          if (idx < av.length) this.take(av[idx]);
          break;
        }
        return;
    }
    e.preventDefault();
  }
  buttonAction(btn) {
    const b = this.btn, lv = this.level;
    if (btn === b.sound) this.toggleSound();
    else if (btn === b.levels || btn === b.levelsIcon) { this.sounds.play('click'); this.goMenu(); }
    else if (btn === b.hint || btn === b.mHint) this.hint();
    else if (btn === b.undo || btn === b.mUndo) this.undo();
    else if (btn === b.reset || btn === b.mReset) this.reset();
    else if (btn === b.prev) this.openLevel(lv.n - 1, false);
    else if (btn === b.next) this.openLevel(lv.n + 1, false);
    else if (btn === b.ccw || btn === b.mCcw) this.heldOrSay(() => this.transformHeld('ccw'));
    else if (btn === b.cw || btn === b.mCw) this.heldOrSay(() => this.transformHeld('cw'));
    else if (btn === b.flip || btn === b.mFlip) this.heldOrSay(() => this.transformHeld('flip'));
    else if (btn === b.drop || btn === b.mDrop) this.heldOrSay(() => this.dropHeld());
  }
  heldOrSay(fn) {
    if (this.held) fn();
    else this.say('Primero tocá una pieza de la bandeja.', TEXT, 2);
  }
  menuDown(p) {
    const b = this.btn;
    if (b.help.hit(p)) { b.help.pressT = this.t; this.sounds.play('click'); this.help = true; return; }
    if (b.menuSound.hit(p)) { b.menuSound.pressT = this.t; this.toggleSound(); return; }
    if (b.cont.hit(p)) { this.openLevel(this.last); return; }
    for (const tile of this.tiles) if (inRect(p, tile)) { this.openLevel(tile.lv.n); return; }
  }

  // ------------------------------------------------------------------ actualización
  update(dt) {
    this.dt = dt;
    if (this.starsShown < this.stars && !(this.mode === 'game' && this.won && this.winT < .9)) {
      this.starsShown = Math.min(this.stars, this.starsShown + Math.max(12, (this.stars - this.starsShown) * 3) * dt);
    } else if (this.starsShown > this.stars) {
      this.starsShown = Math.max(this.stars, this.starsShown - Math.max(60, (this.starsShown - this.stars) * 4) * dt);
    }
    if (this.mode !== 'game') return;
    if (this.held) {
      const target = this.held.fx !== null ? this.held.fx : this.held.ox;
      this.heldX += (target - this.heldX) * Math.min(1, dt * (this.held.fx !== null ? 30 : 18));
    }
    if (this.rotAnim && (this.rotAnim.t += dt) > .14) this.rotAnim = null;
    if (this.anim) {
      const a = this.anim;
      a.x += (a.ox - a.x) * Math.min(1, dt * 25);
      a.v += 80 * dt;
      a.y += a.v * dt;
      if (a.y >= a.target) { a.y = a.target; this.land(); }
    }
    for (const [i, t] of this.bounce) { if (t + dt > .25) this.bounce.delete(i); else this.bounce.set(i, t + dt); }
    for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 60 * dt; d.life += dt; }
    this.dust = this.dust.filter(d => d.life < .45);
    if (this.msgTime > 0) this.msgTime -= dt;
    if (this.flashTime > 0 && (this.flashTime -= dt) <= 0) this.flash = [];
    if (this.shake > 0) this.shake -= dt;
    if (this.won) this.winT += dt;
    if (this.confetti) this.confetti.update(dt);
  }

  loop(ts) {
    const dt = Math.min(.05, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.t += dt;
    this.update(dt);
    this.draw();
    requestAnimationFrame(t => this.loop(t));
  }

  // ------------------------------------------------------------------ dibujo
  draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = canvas.width, h = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, colorStr(BG_TOP));
    bg.addColorStop(1, colorStr(BG_BOTTOM));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h * .1, 0, w / 2, h * .1, Math.max(w, h) * .6);
    glow.addColorStop(0, 'rgba(90,140,170,.22)');
    glow.addColorStop(1, 'rgba(90,140,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(K(), 0, 0, K(), OX * DPR, OY * DPR);
    if (this.mode === 'menu') this.drawMenu(); else this.drawGame();
    if (this.help) this.drawHelp();
  }

  dim(alpha) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(12,14,18,${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  starPill(x, y, h, alignRight = false) {
    const s = String(Math.round(this.starsShown));
    const w = txtW(s, 18, 700) + h + 18;
    if (alignRight) x -= w;
    rr(x, y, w, h, h / 2, CARD2, CARD, { shadow: [6, .3, 3], stroke: mix(YELLOW, CARD, .45), lw: 1.5 });
    ICONS.star(x + h / 2 + 2, y + h / 2, h * .66);
    txt(s, x + h + 4, y + h / 2, 18, YELLOW, { weight: 700 });
    return w;
  }

  drawHintLabel(cx, cy, color) {
    const w = txtW('Pista', 17, 600) + 10 + 20 + 4 + txtW(String(HINT_COST), 15, 600);
    let x = cx - w / 2;
    x += txt('Pista', x, cy, 17, color, { weight: 600 }) + 10;
    ICONS.star(x + 10, cy, 20);
    txt(String(HINT_COST), x + 24, cy + 1, 15, color, { weight: 600 });
  }

  // --- menú
  drawMenu() {
    const W = L.W, H = L.H, P = L.portrait, b = this.btn;
    const my = menuDy(), ty = P ? 112 + my : 70;
    txt('KANOODLE', W / 2, ty, P ? 62 : 72, YELLOW, { align: 'center', weight: 900, shadow: [20, 22, 26] });
    const py = P ? 150 + my : 118;
    rr(W / 2 - 100, py, 200, 44, 22, mix(PANEL, WHITE, .15), PANEL_DARK, { shadow: [8, .35, 4] });
    txt('GRAVITY', W / 2, py + 22, 22, WHITE, { align: 'center', weight: 700 });
    txt(`100 niveles · completados: ${this.done.size}/100`, W / 2, P ? 214 + my : 184, P ? 15 : 16, MUTED, { align: 'center' });
    for (const tile of this.tiles) {
      const n = tile.lv.n, tc = TIER_COLORS[tile.lv.tier], done = this.done.has(n);
      let hv = this.tileHover.get(n) || 0;
      hv += ((this.pointerIsMouse && inRect(this.mouse, tile) ? 1 : 0) - hv) * Math.min(1, this.dt * 14);
      this.tileHover.set(n, hv);
      const x = tile.x, y = tile.y - 2.5 * hv, w = tile.w, h = tile.h, r = P ? 8 : 10;
      if (done) rr(x, y, w, h, r, mix(tc, WHITE, .2 + .1 * hv), mix(tc, BLACK, .15), { shadow: [5 + 4 * hv, .35, 3 + 2 * hv] });
      else {
        rr(x, y, w, h, r, mix(CARD2, WHITE, .06 + .08 * hv), mix(CARD, BLACK, .1),
          { shadow: [5 + 4 * hv, .35, 3 + 2 * hv], stroke: mix(tc, CARD, .25), lw: 1.5 });
      }
      rr(x + 2, y + 1, w - 4, h * .45, r - 2, [255, 255, 255, 40], [255, 255, 255, 0]);
      const fs = P ? 15 : 17;
      if (done) {
        const tw = txtW(String(n), fs, 700);
        const cs = P ? 10 : 14;
        txt(String(n), x + w / 2 - cs / 2 - 1, y + h / 2, fs, WHITE, { align: 'center', weight: 700 });
        ICONS.check(x + w / 2 - cs / 2 - 1 + tw / 2 + cs / 2 + 3, y + h / 2 + 1, cs, WHITE);
      } else txt(String(n), x + w / 2, y + h / 2, fs, WHITE, { align: 'center', weight: 600 });
    }
    // leyenda
    const items = TIERS.map(t => [t, `${t} (${TIER_PIECES[t]} piezas)`]);
    if (P) {
      items.forEach(([t, s], i) => {
        const cx = i % 2 === 0 ? 40 : W / 2 + 20, cy = 842 + my + Math.floor(i / 2) * 28;
        circle(cx, cy, 6, TIER_COLORS[t]);
        txt(s, cx + 14, cy, 14, TEXT);
      });
      txt(`Cada nivel da de 10 a 20 estrellas · una pista cuesta ${HINT_COST}`, W / 2, 942 + my, 13, MUTED, { align: 'center' });
    } else {
      const widths = items.map(([, s]) => txtW(s, 14));
      let x = (W - (widths.reduce((a, c) => a + c, 0) + items.length * 20 + (items.length - 1) * 26)) / 2;
      items.forEach(([t, s], i) => {
        circle(x + 6, H - 30, 6, TIER_COLORS[t]);
        txt(s, x + 18, H - 30, 14, TEXT);
        x += widths[i] + 46;
      });
    }
    b.cont.label = `Continuar: nivel ${this.last}`;
    b.cont.draw(this, P ? 18 : 16);
    if (P) this.starPill(70, 17, 38);
    b.menuSound.draw(this);
    b.help.draw(this, 16);
    if (!P) this.starPill(238, 24, 44);
  }

  // --- juego
  drawGame() {
    const lv = this.level, P = L.portrait, b = this.btn, W = L.W;
    // encabezado
    if (P) {
      txt(`Nivel ${lv.n}`, 72, 30, 30, WHITE, { weight: 700, shadow: [18, 20, 24] });
      const rem = lv.available().length;
      txt(`${lv.tier} · faltan ${rem} pieza${rem === 1 ? '' : 's'}`, 72, 56, 14, MUTED);
      this.starPill(W - 12, 16, 38, true);
      const ti = TIERS.indexOf(lv.tier);
      for (let k = 0; k < 6; k++) circle(80 + k * 15, 90, 4.5, k <= ti ? YELLOW : [84, 90, 102]);
      if (this.done.has(lv.n)) {
        ICONS.check(180, 90, 13, GREEN_OK);
        txt('hecho', 191, 90, 14, GREEN_OK, { weight: 600 });
      }
    } else {
      const tw = txt(`Nivel ${lv.n}`, L.boardX - 12, 40, 38, WHITE, { weight: 700, shadow: [18, 20, 24] });
      const rem = lv.available().length;
      txt(`${lv.tier} · faltan ${rem} pieza${rem === 1 ? '' : 's'}`, L.boardX - 12 + tw + 14, 46, 16, MUTED);
      const ti = TIERS.indexOf(lv.tier);
      for (let k = 0; k < 6; k++) circle(L.boardX - 4 + k * 16, 88, 5, k <= ti ? YELLOW : [84, 90, 102]);
      if (this.done.has(lv.n)) {
        ICONS.check(L.boardX + 104, 88, 16, GREEN_OK);
        txt('completado', L.boardX + 116, 88, 15, GREEN_OK, { weight: 600 });
      }
      this.starPill(L.boardX + 346, 70, 36);
    }
    b.prev.enabled = lv.n > 1;
    b.next.enabled = lv.n < 100;
    const noAnim = !this.anim;
    b.undo.enabled = b.mUndo.enabled = lv.history.length > 0 && noAnim;
    b.hint.enabled = b.mHint.enabled = !this.won;
    for (const btn of [b.ccw, b.cw, b.flip, b.drop, b.mCcw, b.mCw, b.mFlip, b.mDrop]) btn.enabled = !!this.held && noAnim;
    this.drawBoard();
    this.drawTray();
    for (const btn of this.gameButtons()) btn.draw(this, btn === b.prev || btn === b.next ? 22 : 17);
    if (this.msgTime > 0 && this.message) {
      const a = Math.min(1, this.msgTime * 3), size = P ? 14 : 15;
      const maxW = P ? W - 40 : 560;
      const lines = wrapLines(this.message, size, 600, maxW - 36);
      const w = Math.min(maxW, Math.max(...lines.map(s => txtW(s, size, 600))) + 36), h = 14 + lines.length * (size + 6);
      const cx = P ? W / 2 : L.boardX + L.boardW / 2;
      const y = P ? L.boardTop + L.boardH + 50 - h / 2 - 22 : L.H - 26 - h / 2;
      rr(cx - w / 2, y, w, h, Math.min(17, h / 2), CARD2, CARD, { alpha: a, shadow: [8, .35, 3] });
      lines.forEach((s, i) => txt(s, cx, y + 7 + (size + 6) * (i + .5), size, this.msgColor, { align: 'center', weight: 600, alpha: a }));
    }
    if (this.won) this.drawWin();
  }

  drawBoard() {
    const lv = this.level, C = L.cell, X = L.boardX, T = L.boardTop, BW = L.boardW, BH = L.boardH, t = this.t;
    // base y marco
    rr(X - 50, T + BH - 10, BW + 100, 58, 26, mix(PANEL, WHITE, .18), PANEL_DARK, { shadow: [16, .4, 10] });
    rr(X - 44, T + BH - 7, BW + 88, 16, 10, [255, 255, 255, 60], [255, 255, 255, 0]);
    rr(X - 12, T - 22, BW + 24, BH + 34, 16, [70, 74, 84], [22, 23, 27], { shadow: [14, .45, 6] });
    for (let c = 0; c < COLS; c++) {
      const x = X + c * C + 3;
      rr(x, T - 6, C - 6, BH + 6, 12, SLOT_TOP, SLOT_BOTTOM);
      rr(x, T - 6, C - 6, 26, 12, [0, 0, 0, 55], [0, 0, 0, 0]);
      rr(x + 10, T - 17, C - 26, 4, 2, [110, 116, 128], [80, 84, 94]);
    }
    const grid = lv.grid();
    // columnas iluminadas bajo la pieza en la mano
    if (this.held) {
      const { i, shape, ox } = this.held;
      const main = PIECE_COLORS[lv.pieces[i].name][2];
      const oy = dropRow(grid, shape, ox);
      if (oy !== null) {
        for (let x = ox; x < ox + sizeOf(shape)[0]; x++) {
          const topY = Math.min(...shape.filter(c => c[0] === x - ox).map(c => c[1])) + oy;
          rr(X + x * C + 3, T - 6, C - 6, topY * C + 6, 12, [...main, 10], [...main, 60]);
        }
      }
    }
    // piezas colocadas
    for (const [i, cells] of lv.placed) {
      let dy = 0;
      if (this.bounce.has(i)) { const p = this.bounce.get(i) / .25; dy = -Math.sin(p * Math.PI) * 5 * (1 - p); }
      drawPiece(cells, X, T + dy, C, lv.pieces[i].name, { shadow: [4, .24, 3] });
    }
    for (const d of this.dust) circle(d.x, d.y, d.r * (1 + d.life * 2), WHITE, .43 * (1 - d.life / .45));
    // piezas mal puestas
    if (this.flash.length && Math.floor(t * 6) % 2 === 0) {
      for (const i of this.flash) for (const [x, y] of (lv.placed.get(i) || [])) {
        rr(X + (x + .04) * C, T + (y + .04) * C, C * .92, C * .92, 16, null, null, { stroke: RED_BAD, lw: 3.5 });
      }
    }
    // pista comprada
    if (this.hintShow) {
      const { i, cells } = this.hintShow;
      drawPiece(cells, X, T, C, lv.pieces[i].name, { alpha: (120 + 70 * Math.sin(t * 6)) / 255 });
      for (const [x, y] of cells) rr(X + (x + .03) * C, T + (y + .03) * C, C * .94, C * .94, 16, null, null, { stroke: YELLOW, lw: 3 });
    }
    // pieza en la mano
    if (this.held) {
      const { i, shape, ox } = this.held, name = lv.pieces[i].name;
      const [w, h] = sizeOf(shape);
      const oy = dropRow(grid, shape, ox);
      if (oy !== null) drawPiece(shape.map(([x, y]) => [x + ox, y + oy]), X, T, C, name, { alpha: .53 });
      const dx = this.shake > 0 ? Math.sin(this.shake * 60) * 8 : 0;
      const px = X + this.heldX * C + dx, py = T - (h + .45) * C + Math.sin(t * 3) * 2.5;
      const sh = { shadow: [10, .27, 12] };
      if (this.rotAnim) {
        const p = this.rotAnim.t / .14, k = this.rotAnim.kind;
        ctx.save();
        ctx.translate(px + w * C / 2, py + h * C / 2);
        if (k === 'flip') ctx.scale(Math.max(.02, Math.abs(Math.cos((1 - p) * Math.PI / 2))), 1);
        else ctx.rotate((k === 'cw' ? -1 : 1) * Math.PI / 2 * (1 - p) ** 2);
        drawPiece(shape, -w * C / 2, -h * C / 2, C, name, sh);
        ctx.restore();
      } else drawPiece(shape, px, py, C, name, sh);
      if (oy === null) {
        for (const [x, y] of shape) rr(px + (x + .04) * C, py + (y + .04) * C, C * .92, C * .92, 16, null, null, { stroke: RED_BAD, lw: 3 });
      }
    }
    if (this.anim) {
      const a = this.anim;
      drawPiece(a.shape, X + a.x * C, T + a.y * C, C, lv.pieces[a.i].name, { shadow: [6, .24, 6] });
    }
  }

  drawTray() {
    const lv = this.level, r = L.tray, P = L.portrait, pitch = lv.trayPitch;
    rr(r.x, r.y, r.w, r.h, P ? 20 : 24, mix(PANEL, WHITE, .1), PANEL_DARK, { shadow: [16, .43, 8] });
    rr(r.x + 3, r.y + 2, r.w - 6, 60, 22, [255, 255, 255, 38], [255, 255, 255, 0]);
    txt('PIEZAS PARA COLOCAR', r.x + (P ? 18 : 28), r.y + (P ? 22 : 34), P ? 13 : 15, WHITE, { weight: 700 });
    const av = lv.available();
    for (const i of av) {
      const pr = lv.trayPos.get(i);
      if (this.anim && this.anim.i === i) continue;
      if (this.held && this.held.i === i) {
        rr(pr.x - 8, pr.y - 8, pr.w + 16, pr.h + 16, 14, [255, 255, 255, 30], null, { stroke: [255, 255, 255, 170], lw: 2 });
        continue;
      }
      const over = this.pointerIsMouse && inRect(this.mouse, inflate(pr, 7)) && !this.anim;
      let hv = this.trayHover.get(i) || 0;
      hv += ((over ? 1 : 0) - hv) * Math.min(1, this.dt * 14);
      this.trayHover.set(i, hv);
      if (this.hintShow && this.hintShow.i === i) {
        rr(pr.x - 9, pr.y - 9, pr.w + 18, pr.h + 18, 14, [255, 255, 255, 25], null, { stroke: YELLOW, lw: 3 });
      }
      drawPiece(lv.pieces[i].cells, pr.x, pr.y - 4 * hv, pitch, lv.pieces[i].name, { shadow: [4 + 5 * hv, .27, 3 + 5 * hv] });
    }
    if (!av.length && !this.anim) txt('¡No quedan piezas!', r.x + (P ? 18 : 28), r.y + (P ? 60 : 80), 16, WHITE);
    if (!P) {
      const c = mix(WHITE, PANEL, .2);
      txt('Mouse: mover · click soltar · rueda o click der. girar', r.x + 28, r.y + r.h - 56, 13, c);
      txt('Teclado: ← → · R/Q girar · F espejo · Espacio · Z · H', r.x + 28, r.y + r.h - 34, 13, c);
    }
  }

  drawWin() {
    const W = L.W, p = Math.min(1, this.winT / .45), lv = this.level, b = this.btn;
    this.dim(.62 * p);
    if (this.confetti) this.confetti.draw();
    const k = easeOutBack(p), bw = Math.min(470, W - 40), bh = 310;
    const x = W / 2 - bw / 2, y = (L.portrait ? L.H * .42 : 400) - bh / 2 + (1 - k) * 80;
    rr(x, y, bw, bh, 26, CARD2, CARD, { alpha: p, shadow: [20, .55, 12], stroke: YELLOW, lw: 2.5 });
    txt('¡Nivel completado!', W / 2, y + 62, bw < 440 ? 30 : 36, YELLOW, { align: 'center', weight: 700, alpha: p });
    txt(`Nivel ${lv.n} · ${lv.tier}   (${this.done.size}/100)`, W / 2, y + 112, 16, TEXT, { align: 'center', alpha: p });
    if (this.winStars) {
      const shown = Math.floor(clamp((this.winT - .35) / .6, 0, 1) * this.winStars);
      const s = `+${shown}`, w = txtW(s, 30, 700) + 44;
      ICONS.star(W / 2 - w / 2 + 17, y + 162, 34);
      txt(s, W / 2 - w / 2 + 42, y + 162, 30, YELLOW, { weight: 700, alpha: p });
    } else {
      txt('Las estrellas de este nivel ya las habías ganado.', W / 2, y + 162, 14, MUTED, { align: 'center', alpha: p });
    }
    b.winNext.y = b.winMenu.y = y + 214;
    b.winNext.enabled = lv.n < 100;
    b.winNext.draw(this, 20);
    b.winMenu.draw(this, 20);
  }

  drawHelp() {
    const W = L.W, H = L.H, P = L.portrait;
    this.dim(.78);
    const bw = Math.min(780, W - 24), x = W / 2 - bw / 2;
    const size = P ? 14.5 : 16, lh = P ? 22 : 28, maxW = bw - 64;
    const paras = [
      ['t', 'Cada nivel muestra las piezas que ya están colocadas. Completá el tablero tirando desde arriba las piezas que faltan: caen derecho hasta chocar con algo. Se pueden girar y dar vuelta, pero no deslizar de costado. Cada nivel tiene una sola solución.'],
      ['t', `Cada nivel ganado da de 10 a 20 estrellas (más cuanto más difícil). Una pista cuesta ${HINT_COST} estrellas y marca dónde va una pieza.`],
      ['h', 'Con el dedo'],
      ['t', 'Tocá una pieza de la bandeja y arrastrala hasta la columna: al soltarla, cae. Tocá la pieza para girarla, o usá los botones de girar, espejo y soltar.'],
      ['h', 'Con mouse y teclado'],
      ['t', 'Click en una pieza para agarrarla; el mouse elige la columna y el click la suelta. Rueda arriba o R: gira horario · rueda abajo o Q: antihorario · F: espejo · Espacio: soltar · Esc: devolver · Z: deshacer · H: pista · M: sonido.'],
    ];
    const lines = [];
    for (const [kind, s] of paras) {
      if (kind === 'h') lines.push(['h', s]);
      else wrapLines(s, size, 400, maxW).forEach(l => lines.push(['t', l]));
      lines.push(['gap']);
    }
    const bh = Math.min(H - 40, 120 + lines.reduce((a, l) => a + (l[0] === 'gap' ? 8 : lh), 0));
    const y = H / 2 - bh / 2;
    rr(x, y, bw, bh, 24, CARD2, CARD, { shadow: [20, .6, 10], stroke: PANEL, lw: 2 });
    txt('Cómo se juega', x + 32, y + 44, P ? 28 : 34, YELLOW, { weight: 700 });
    let yy = y + 90;
    for (const l of lines) {
      if (l[0] === 'gap') { yy += 8; continue; }
      txt(l[1], x + 32, yy, l[0] === 'h' ? size + 1 : size, l[0] === 'h' ? WHITE : TEXT, { weight: l[0] === 'h' ? 700 : 400 });
      yy += lh;
    }
    txt('Tocá en cualquier lado para cerrar', W / 2, y + bh - 22, 13, MUTED, { align: 'center' });
  }
}

window.KG = new App();
})();
