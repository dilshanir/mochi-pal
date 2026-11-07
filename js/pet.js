// Mochi's body, face, sprout and accessories, drawn as one SVG and animated with springs.
//
// This module only knows how Mochi LOOKS and MOVES. It never reads or writes game state:
// main.js decides what Mochi feels (setMood / react) and this file turns that into motion.
//
// Animation model (see the gamedev "game-feel" skill):
//   - Squash & stretch: two springs (sx, sy) that always pull back to 1, so every poke
//     overshoots, wobbles and settles. Juice is transient; Mochi always returns to rest.
//   - Secondary motion: the sprout on Mochi's head lags behind the body (its own spring).
//   - Expressions: a base mood (from needs) plus short "reactions" that override it.
import { FURS, STAGES } from './data.js';
import { clamp, damp, rand } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const INK = '#2E1F47';      // sticker outline colour (matches --ink in style.css)
const CX = 150;             // horizontal centre of the 300×300 viewBox
const BASE_Y = 272;         // where Mochi's bottom rests on the floor
const W = 212, H = 166;     // body size at full growth (stage scale multiplies this)
const TOP_Y = BASE_Y - H;   // top of the head before scaling
const EYE_Y = 180, EYE_DX = 40, MOUTH_Y = 210;

// ---------- tiny SVG helpers ----------
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
// Only touch the DOM when a value really changed (keeps 60 fps cheap on old phones).
function setAttr(node, k, v) {
  if (node['_' + k] !== v) { node['_' + k] = v; node.setAttribute(k, v); }
}
const f1 = n => Math.round(n * 10) / 10;

// Damped spring. k = stiffness, d = damping. Semi-implicit Euler is stable at 60 fps.
class Spring {
  constructor(v, k = 220, d = 14) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.d = d; }
  step(dt) {
    const a = this.k * (this.t - this.v) - this.d * this.vel;
    this.vel += a * dt;
    this.v += this.vel * dt;
    return this.v;
  }
  kick(dv) { this.vel += dv; }
}

// The mochi silhouette: a round dome on top and a softer, flatter bottom (two superellipse
// halves), smoothed with Catmull-Rom → cubic Bézier so the outline has no corners.
function blobPath() {
  const a = W / 2, cy = BASE_Y - H * 0.45, bTop = H * 0.55, bBot = H * 0.45;
  const pts = [];
  const N = 48;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const nx = s < 0 ? 2.05 : 3.6; // exponent: 2 = ellipse, higher = squarer (flat bottom)
    const ny = s < 0 ? 2.0 : 3.8;
    const x = CX + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / nx);
    const y = cy + (s < 0 ? bTop : bBot) * Math.sign(s) * Math.pow(Math.abs(s), 2 / ny);
    pts.push([x, y]);
  }
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + 'Z';
}

// Half-width of the head at a given depth below its top (ellipse maths, used to fit hats).
export function headHalfWidth(depth) {
  const a = W / 2, b = H * 0.55;
  const k = clamp(1 - depth / b, -1, 1);
  return a * Math.sqrt(1 - k * k);
}

// ---------- expressions ----------
// eyes: open | happy (^ ^) | closed (sleep) | x (> <) | tired (half lids) | big
// brows: '' | worried | angry | flat     mouth: w = half width, curve = smile (+) / frown (-), open 0..1
const EXPR = {
  content:   { eyes: 'open',   brows: '',        mouth: { w: 13, curve: 8,  open: 0 },    blush: 0.55 },
  happy:     { eyes: 'happy',  brows: '',        mouth: { w: 16, curve: 12, open: 0.45 }, blush: 0.95 },
  love:      { eyes: 'happy',  brows: '',        mouth: { w: 12, curve: 10, open: 0.15 }, blush: 1 },
  giggle:    { eyes: 'x',      brows: '',        mouth: { w: 17, curve: 14, open: 0.75 }, blush: 1 },
  boop:      { eyes: 'x',      brows: '',        mouth: { w: 8,  curve: 2,  open: 0.35 }, blush: 0.8 },
  hungry:    { eyes: 'open',   brows: 'worried', mouth: { w: 10, curve: -3, open: 0.18 }, blush: 0.3 },
  tired:     { eyes: 'tired',  brows: '',        mouth: { w: 9,  curve: 0,  open: 0 },    blush: 0.25 },
  bored:     { eyes: 'tired',  brows: 'flat',    mouth: { w: 10, curve: -2, open: 0 },    blush: 0.2 },
  sad:       { eyes: 'open',   brows: 'worried', mouth: { w: 12, curve: -8, open: 0 },    blush: 0.2 },
  dirty:     { eyes: 'open',   brows: 'worried', mouth: { w: 11, curve: -5, open: 0 },    blush: 0.25 },
  annoyed:   { eyes: 'open',   brows: 'angry',   mouth: { w: 12, curve: -7, open: 0 },    blush: 0.4 },
  surprised: { eyes: 'big',    brows: '',        mouth: { w: 9,  curve: 0,  open: 0.8 },  blush: 0.6 },
  eat:       { eyes: 'happy',  brows: '',        mouth: { w: 15, curve: 6,  open: 0 },    blush: 0.8 },
  nope:      { eyes: 'x',      brows: '',        mouth: { w: 10, curve: -5, open: 0 },    blush: 0.4 },
  spicy:     { eyes: 'x',      brows: '',        mouth: { w: 19, curve: 4,  open: 0.95 }, blush: 1 },
  sleep:     { eyes: 'closed', brows: '',        mouth: { w: 7,  curve: 2,  open: 0.12 }, blush: 0.45 },
  talk:      { eyes: 'open',   brows: '',        mouth: { w: 13, curve: 6,  open: 0 },    blush: 0.6 },
  listen:    { eyes: 'big',    brows: '',        mouth: { w: 9,  curve: 5,  open: 0 },    blush: 0.6 },
  wake:      { eyes: 'tired',  brows: 'angry',   mouth: { w: 10, curve: -4, open: 0.1 },  blush: 0.3 },
};

// How far the sprout must rise so it pokes out of the top of each hat.
const HAT_LIFT = { '': 0, party: 0, bow: 0, crown: 0, beanie: 42, cap: 36, chef: 66 };

export class Pet {
  constructor(host) {
    this.host = host;
    this.svg = el('svg', { viewBox: '0 0 300 300', class: 'pet-svg', 'aria-hidden': 'true' });
    host.appendChild(this.svg);
    this._build();

    // springs: squash/stretch, tilt (degrees), sprout sway, face look offset
    this.sx = new Spring(1, 260, 13);
    this.sy = new Spring(1, 260, 13);
    this.tilt = new Spring(0, 120, 11);
    this.sway = new Spring(0, 90, 6);
    this.lookX = 0; this.lookY = 0; this.lookTX = 0; this.lookTY = 0;
    // vertical hop physics (SVG units, up = positive)
    this.y = 0; this.vy = 0;

    this.stageScale = 1;
    this.base = 'content';         // mood from needs
    this.react_ = null;            // { name, until }
    this.chompUntil = 0;
    this.danceUntil = 0;
    this.talkLevel = null;         // () => 0..1 while the talk-back voice plays
    this.blinkAt = performance.now() + 2000;
    this.blinkT = 0;
    this.t = 0;
    this.mouthOpen = 0;
    this.dirt = 0;
    this.spicyUntil = 0;
    this.sleeping = false;
    this.reduced = false;
    this.look = { fur: 'peach', stage: 0, hat: '', face: '' };
    this.setLook(this.look);
  }

  // ---------- one-time SVG construction ----------
  _build() {
    const s = this.svg;
    // Each Pet gets unique ids: the naming card shows a second Mochi, and duplicate
    // ids would make both SVGs share one gradient.
    const uid = (Pet.count = (Pet.count || 0) + 1);
    const defs = el('defs', {}, s);
    const g = el('radialGradient', { id: `furGrad${uid}`, cx: '38%', cy: '30%', r: '78%' }, defs);
    this.stops = [el('stop', { offset: '0' }, g), el('stop', { offset: '0.58' }, g), el('stop', { offset: '1' }, g)];
    const clip = el('clipPath', { id: `mouthClip${uid}` }, defs);
    this.mouthClipPath = el('path', {}, clip);
    this.uid = uid;

    this.shadow = el('ellipse', { cx: CX, cy: BASE_Y + 3, rx: 96, ry: 11, fill: INK, opacity: 0.16 }, s);
    this.rig = el('g', {}, s);
    this.tiltG = el('g', {}, this.rig);

    this.bodyPath = el('path', {
      d: blobPath(), fill: `url(#furGrad${uid})`, stroke: INK, 'stroke-width': 5, 'stroke-linejoin': 'round',
    }, this.tiltG);
    // glossy highlight + a few "rice flour" specks — what makes it read as mochi
    el('ellipse', { cx: 102, cy: 140, rx: 26, ry: 14, fill: '#fff', opacity: 0.55, transform: 'rotate(-28 102 140)' }, this.tiltG);
    el('ellipse', { cx: 128, cy: 124, rx: 6, ry: 4, fill: '#fff', opacity: 0.6 }, this.tiltG);
    this.dust = el('g', { fill: '#fff', opacity: 0.5 }, this.tiltG);
    [[200, 150, 2.4], [214, 172, 1.8], [86, 220, 2.2], [214, 232, 2], [70, 190, 1.6]].forEach(([x, y, r]) => el('circle', { cx: x, cy: y, r }, this.dust));

    // mud spots, faded in by setDirt()
    this.dirtG = el('g', { opacity: 0 }, this.tiltG);
    [[96, 238, 14, 8], [205, 214, 11, 7], [182, 250, 9, 5], [70, 205, 8, 6], [228, 182, 7, 5]].forEach(([x, y, rx, ry]) =>
      el('ellipse', { cx: x, cy: y, rx, ry, fill: '#8C6A4F', opacity: 0.7 }, this.dirtG));

    this.blushG = el('g', {}, this.tiltG);
    this.cheeks = [-1, 1].map(sgn => el('ellipse', { cx: CX + sgn * 64, cy: 204, rx: 15, ry: 9, fill: '#FF7FA6', opacity: 0.5 }, this.blushG));

    this.sproutG = el('g', {}, this.tiltG);
    this.hatG = el('g', {}, this.tiltG);

    this.face = el('g', {}, this.tiltG);
    this.eyes = [-1, 1].map(sgn => this._buildEye(sgn));
    this.brows = [-1, 1].map(() => el('path', { fill: 'none', stroke: INK, 'stroke-width': 4.5, 'stroke-linecap': 'round' }, this.face));
    this.mouthG = el('g', { transform: `translate(${CX} ${MOUTH_Y})` }, this.face);
    this.mouth = el('path', { stroke: INK, 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.mouthG);
    this.tongue = el('ellipse', { fill: '#FF8FAB', 'clip-path': `url(#mouthClip${this.uid})` }, this.mouthG);
    this.faceAccG = el('g', {}, this.face);

    // red "too spicy" flush and steam puffs
    this.flush = el('path', { d: blobPath(), fill: '#FF3D3D', opacity: 0, 'pointer-events': 'none' }, this.tiltG);
    this.steamG = el('g', { opacity: 0, fill: '#fff', stroke: INK, 'stroke-width': 2.5 }, this.tiltG);
    [[-60, 0], [60, 0], [0, -14]].forEach(([x, y]) => el('circle', { cx: CX + x, cy: TOP_Y + y, r: 9 }, this.steamG));

    // stink lines when dirty
    this.stinkG = el('g', { opacity: 0, fill: 'none', stroke: '#7DB55A', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, this.tiltG);
    [-70, 70].forEach(x => el('path', { d: `M${CX + x} ${TOP_Y + 20} q -8 -10 0 -20 q 8 -10 0 -20` }, this.stinkG));

    this.foamG = el('g', {}, this.tiltG);
    this.zzzG = el('g', { 'font-family': 'Mochiy Pop One, system-ui, sans-serif', fill: INK }, this.svg);
    this.zzz = [0, 1, 2].map(i => el('text', { 'font-size': 18 + i * 6, opacity: 0 }, this.zzzG));
    this.zzz.forEach(z => { z.textContent = 'z'; });
  }

  _buildEye(sgn) {
    const g = el('g', { transform: `translate(${CX + sgn * EYE_DX} ${EYE_Y})` }, this.face);
    const open = el('g', {}, g);
    el('ellipse', { cx: 0, cy: 0, rx: 12.5, ry: 16.5, fill: INK }, open);
    el('circle', { cx: -4, cy: -6, r: 5, fill: '#fff' }, open);
    el('circle', { cx: 4.5, cy: 6, r: 2.2, fill: '#fff' }, open);
    const lid = el('path', { d: 'M -15 -3 L 15 -3', stroke: INK, 'stroke-width': 4.5, 'stroke-linecap': 'round', opacity: 0 }, g);
    const stroke = { fill: 'none', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const happy = el('path', { d: 'M -13 5 Q 0 -13 13 5', ...stroke }, g);
    const closed = el('path', { d: 'M -13 -1 Q 0 9 13 -1', ...stroke }, g);
    const x = el('path', { d: sgn < 0 ? 'M -9 -9 L 9 0 L -9 9' : 'M 9 -9 L -9 0 L 9 9', ...stroke }, g);
    return { g, open, lid, happy, closed, x, sgn };
  }

  // ---------- appearance ----------
  setLook({ fur, stage, hat, face }) {
    this.look = { fur, stage, hat, face };
    const c = FURS[fur] || FURS.peach;
    setAttr(this.stops[0], 'stop-color', c.light);
    setAttr(this.stops[1], 'stop-color', c.base);
    setAttr(this.stops[2], 'stop-color', c.dark);
    this.stageScale = (STAGES[stage] || STAGES[0]).scale;
    this._drawSprout(stage, HAT_LIFT[hat] || 0);
    this._drawHat(hat);
    this._drawFaceAcc(face);
  }

  // The sprout grows with each life stage: seed leaves → leaves → bud → flower → star flower.
  _drawSprout(stage, lift) {
    const g = this.sproutG;
    g.innerHTML = '';
    const baseY = TOP_Y + 6 - lift;
    this.sproutBase = baseY;
    const L = [16, 26, 34, 40, 44, 48][stage] || 16;
    const leaf = (x, y, s, rot) => el('path', {
      d: 'M0 0 C 6 -11, 22 -13, 29 -4 C 21 5, 7 5, 0 0 Z',
      transform: `translate(${x} ${y}) rotate(${rot}) scale(${s})`,
      fill: '#6CCB5F', stroke: INK, 'stroke-width': 3.5 / s, 'stroke-linejoin': 'round',
    }, g);
    el('path', { d: `M${CX} ${baseY} q -4 ${-L / 2} 2 ${-L}`, fill: 'none', stroke: INK, 'stroke-width': 7, 'stroke-linecap': 'round' }, g);
    el('path', { d: `M${CX} ${baseY} q -4 ${-L / 2} 2 ${-L}`, fill: 'none', stroke: '#6CCB5F', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
    const tipX = CX + 2, tipY = baseY - L;
    const ls = [0.55, 0.75, 0.85, 0.85, 0.9, 0.95][stage];
    leaf(tipX, tipY + 2, ls, -20);
    leaf(tipX, tipY + 2, ls, 200);
    if (stage >= 2) leaf(CX - 1, baseY - L * 0.45, ls * 0.7, -150);
    if (stage === 3) {
      el('path', { d: `M${tipX} ${tipY + 2} c -10 -6 -8 -22 0 -26 c 8 4 10 20 0 26 z`, fill: '#FF8FC3', stroke: INK, 'stroke-width': 3.5 }, g);
    }
    if (stage >= 4) {
      const petal = stage === 5 ? '#FFC23D' : '#FF5D8F';
      const fg = el('g', { transform: `translate(${tipX} ${tipY - 8})` }, g);
      const n = stage === 5 ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        el('ellipse', { cx: f1(Math.cos(a) * 10), cy: f1(Math.sin(a) * 10), rx: 8, ry: 8, fill: petal, stroke: INK, 'stroke-width': 3 }, fg);
      }
      el('circle', { cx: 0, cy: 0, r: 6.5, fill: stage === 5 ? '#FFF6C9' : '#FFC23D', stroke: INK, 'stroke-width': 3 }, fg);
      if (stage === 5) this.sparkle = el('path', { d: 'M 22 -22 l 3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z', fill: '#FFF6C9', stroke: INK, 'stroke-width': 2 }, fg);
    }
    if (stage < 5) this.sparkle = null;
  }

  // Hats are drawn relative to the top-centre of the head (0,0); y grows downward.
  _drawHat(id) {
    const g = this.hatG;
    g.innerHTML = '';
    if (!id) return;
    const sw = { stroke: INK, 'stroke-width': 4.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    const h = el('g', { transform: `translate(${CX} ${TOP_Y})` }, g);
    if (id === 'party') {
      const p = el('g', { transform: 'translate(-44 10) rotate(-22)' }, h);
      el('path', { d: 'M -24 0 L 24 0 L 0 -62 Z', fill: '#FF5D8F', ...sw }, p);
      el('path', { d: 'M -15 -22 L 14 -14 M -8 -42 L 7 -37', fill: 'none', stroke: '#FFC23D', 'stroke-width': 5, 'stroke-linecap': 'round' }, p);
      el('circle', { cx: 0, cy: -66, r: 9, fill: '#FFC23D', ...sw }, p);
    } else if (id === 'bow') {
      const b = el('g', { transform: 'translate(50 12) rotate(18)' }, h);
      el('path', { d: 'M 0 0 C -10 -26, -40 -22, -34 -2 C -30 14, -10 8, 0 0 Z', fill: '#FF5D8F', ...sw }, b);
      el('path', { d: 'M 0 0 C 10 -26, 40 -22, 34 -2 C 30 14, 10 8, 0 0 Z', fill: '#FF5D8F', ...sw }, b);
      el('circle', { cx: 0, cy: 0, r: 8, fill: '#FF8FC3', ...sw }, b);
    } else if (id === 'beanie') {
      const hw = headHalfWidth(24) + 4;
      el('path', { d: `M ${-hw} 22 C ${-hw - 2} -26, -38 -44, 0 -44 C 38 -44, ${hw + 2} -26, ${hw} 22 Z`, fill: '#2FB7B0', ...sw }, h);
      [-36, -12, 12, 36].forEach(x => el('path', { d: `M ${x} -36 Q ${x * 1.2} -8 ${x * 1.25} 10`, fill: 'none', stroke: '#1E8F8A', 'stroke-width': 3 }, h));
      el('rect', { x: -hw - 6, y: 6, width: (hw + 6) * 2, height: 22, rx: 11, fill: '#7FE0D8', ...sw }, h);
    } else if (id === 'cap') {
      const hw = headHalfWidth(22) + 2;
      el('path', { d: 'M 26 14 Q 98 4 112 22 Q 70 32 18 26 Z', fill: '#FF9B3D', ...sw }, h);
      el('path', { d: `M ${-hw} 20 C ${-hw - 2} -24, -34 -38, 0 -38 C 34 -38, ${hw + 2} -24, ${hw} 20 Z`, fill: '#FFC23D', ...sw }, h);
      el('path', { d: 'M -24 -30 Q 0 -14 24 -30', fill: 'none', stroke: '#E0A11F', 'stroke-width': 3 }, h);
    } else if (id === 'chef') {
      el('rect', { x: -50, y: -8, width: 100, height: 28, rx: 8, fill: '#fff', ...sw }, h);
      [[-34, -30, 27], [34, -30, 27], [0, -46, 32]].forEach(([x, y, r]) => el('circle', { cx: x, cy: y, r, fill: '#fff', ...sw }, h));
      el('rect', { x: -46, y: -16, width: 92, height: 16, fill: '#fff' }, h); // hides inner outlines where puffs meet the band
      el('path', { d: 'M -20 2 L -20 16 M 0 2 L 0 16 M 20 2 L 20 16', stroke: '#D9D2E6', 'stroke-width': 3, 'stroke-linecap': 'round' }, h);
    } else if (id === 'crown') {
      el('path', { d: 'M -42 14 L -46 -24 L -24 -6 L 0 -32 L 24 -6 L 46 -24 L 42 14 Z', fill: '#FFC23D', ...sw }, h);
      el('circle', { cx: 0, cy: 2, r: 6, fill: '#FF5D8F', stroke: INK, 'stroke-width': 3 }, h);
      el('circle', { cx: -26, cy: 6, r: 4, fill: '#2FB7B0', stroke: INK, 'stroke-width': 2.5 }, h);
      el('circle', { cx: 26, cy: 6, r: 4, fill: '#2FB7B0', stroke: INK, 'stroke-width': 2.5 }, h);
    }
  }

  _drawFaceAcc(id) {
    const g = this.faceAccG;
    g.innerHTML = '';
    if (!id) return;
    const sw = { stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    const L = CX - EYE_DX, R = CX + EYE_DX;
    if (id === 'specs') {
      [L, R].forEach(x => el('circle', { cx: x, cy: EYE_Y, r: 23, fill: 'rgba(255,255,255,.22)', ...sw }, g));
      el('path', { d: `M ${L + 23} ${EYE_Y - 2} Q ${CX} ${EYE_Y - 12} ${R - 23} ${EYE_Y - 2}`, fill: 'none', ...sw }, g);
    } else if (id === 'shades') {
      [L, R].forEach(x => {
        el('rect', { x: x - 27, y: EYE_Y - 16, width: 54, height: 32, rx: 12, fill: INK, ...sw }, g);
        el('path', { d: `M ${x - 16} ${EYE_Y - 7} L ${x - 6} ${EYE_Y - 7}`, stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.7 }, g);
      });
      el('path', { d: `M ${L + 27} ${EYE_Y - 4} Q ${CX} ${EYE_Y - 12} ${R - 27} ${EYE_Y - 4}`, fill: 'none', ...sw }, g);
    } else if (id === 'hearts') {
      [L, R].forEach(x => el('path', {
        d: `M ${x} ${EYE_Y + 16} C ${x - 34} ${EYE_Y - 6}, ${x - 16} ${EYE_Y - 30}, ${x} ${EYE_Y - 12} C ${x + 16} ${EYE_Y - 30}, ${x + 34} ${EYE_Y - 6}, ${x} ${EYE_Y + 16} Z`,
        fill: '#FF5D8F', 'fill-opacity': 0.88, ...sw,
      }, g));
      el('path', { d: `M ${L + 22} ${EYE_Y - 6} Q ${CX} ${EYE_Y - 14} ${R - 22} ${EYE_Y - 6}`, fill: 'none', ...sw }, g);
    }
  }

  // ---------- mood & reactions (called by main.js) ----------
  setMood(name) { this.base = EXPR[name] ? name : 'content'; }
  setSleeping(on) { this.sleeping = !!on; if (on) this.react_ = null; }
  setDirt(v) { this.dirt = clamp(v, 0, 1); }
  setReducedMotion(on) { this.reduced = !!on; }
  setTalkLevel(fn) { this.talkLevel = fn; }

  // Show an expression for `ms`, with a matching body impulse.
  react(name, ms = 900) {
    const now = performance.now();
    this.react_ = { name, until: now + ms };
    const k = this.reduced ? 0.4 : 1;
    switch (name) {
      case 'boop': this.squash(0.22 * k); break;
      case 'giggle': this.squash(0.12 * k); this.tilt.kick(rand(-120, 120) * k); break;
      case 'happy': case 'love': this.hop(380 * k); break;
      case 'surprised': this.stretch(0.16 * k); break;
      case 'nope': this.shakeHead(); break;
      case 'annoyed': this.squash(0.1 * k); this.tilt.kick(-160 * k); break;
      case 'spicy': this.spicyUntil = now + 1800; this.hop(520 * k); break;
      case 'eat': this.chompUntil = now + ms; break;
      case 'wake': this.stretch(0.12 * k); break;
      default: break;
    }
  }

  // Squash = wider + shorter (volume is roughly conserved), then the springs wobble back.
  squash(a) { this.sx.v += a * 0.8; this.sy.v -= a; this.sway.kick(a * 260); }
  stretch(a) { this.sx.v -= a * 0.7; this.sy.v += a; this.sway.kick(-a * 200); }
  hop(v = 400) {
    if (this.y > 1) return;
    this.stretch(0.12);
    this.vy = v;
  }
  shakeHead() {
    let n = 0;
    const id = setInterval(() => { this.tilt.kick(n % 2 ? 260 : -260); if (++n >= 4) clearInterval(id); }, 90);
  }
  dance(seconds) { this.danceUntil = performance.now() + seconds * 1000; }

  // Eyes (and the whole face) follow the pointer a little, which sells "it is looking at me".
  lookAtClient(x, y) {
    const r = this.svg.getBoundingClientRect();
    const dx = (x - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (y - (r.top + r.height * 0.6)) / (r.height / 2);
    this.lookTX = clamp(dx, -1, 1) * 9;
    this.lookTY = clamp(dy, -1, 1) * 6;
  }
  lookAt(nx, ny) { this.lookTX = clamp(nx, -1, 1) * 9; this.lookTY = clamp(ny, -1, 1) * 6; }

  // ---------- foam (bath) ----------
  addFoam(svgX, svgY) {
    if (this.foamG.childNodes.length > 46) return false;
    const r = rand(7, 15);
    el('circle', { cx: f1(svgX + rand(-8, 8)), cy: f1(svgY + rand(-8, 8)), r: f1(r), fill: '#fff', stroke: '#BFD9F2', 'stroke-width': 2 }, this.foamG);
    return true;
  }
  foamCount() { return this.foamG.childNodes.length; }
  clearFoam() { this.foamG.innerHTML = ''; }

  // ---------- geometry helpers for input ----------
  toSvg(clientX, clientY) {
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  // Which part of Mochi is under the pointer: head, face, belly — or null if it missed.
  regionAt(clientX, clientY) {
    const { x, y } = this.toSvg(clientX, clientY);
    const s = this.stageScale;
    const h = H * s, w = W * s;
    const top = BASE_Y - h - this.y;
    const cy = BASE_Y - h * 0.45 - this.y;
    const nx = (x - CX) / (w / 2 + 8);
    const ny = (y - cy) / ((y < cy ? h * 0.55 : h * 0.45) + 8);
    if (nx * nx + ny * ny > 1.05 && !(y < top && y > top - 50 * s && Math.abs(x - CX) < 22)) return null;
    const rel = (y - top) / h;
    if (rel < 0.3) return 'head';
    if (rel < 0.66) return 'face';
    return 'belly';
  }
  mouthClientPoint() {
    const r = this.mouthG.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  headClientPoint() {
    const r = this.svg.getBoundingClientRect();
    const s = this.stageScale;
    return { x: r.left + r.width / 2, y: r.top + ((BASE_Y - H * s - this.y) / 300) * r.height };
  }
  // Top of the sprout (or hat), in client pixels. The speech bubble sits just above it.
  crownClientY() {
    const r = this.svg.getBoundingClientRect();
    const s = this.stageScale;
    const top = BASE_Y - (H + 46 + (HAT_LIFT[this.look.hat] || 0)) * s;
    return r.top + (top / 300) * r.height;
  }

  // ---------- per-frame update ----------
  update(dt, nowMs) {
    // Substep so the springs stay stable even when a frame takes long.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    this.t += dt;
    const t = this.t;
    const dancing = nowMs < this.danceUntil;

    // Breathing: a slow, gentle stretch. Slower and deeper while asleep.
    const breath = this.sleeping ? Math.sin(t * 1.6) * 0.03 : Math.sin(t * 2.4) * 0.016;
    this.sy.t = 1 + breath - (this.sleeping ? 0.04 : 0);
    this.sx.t = 1 - breath * 0.6 + (this.sleeping ? 0.03 : 0);

    // Dancing: bounce on the beat and lean side to side.
    if (dancing) {
      const beat = (t * 128 / 60) % 1;
      if (beat < h * 2.2 + 0.02 && this.y <= 0.5) this.hop(this.reduced ? 120 : 260);
      this.tilt.t = Math.sin(t * Math.PI * 128 / 60) * (this.reduced ? 4 : 11);
    } else {
      this.tilt.t = 0;
    }

    for (let i = 0; i < steps; i++) {
      this.sx.step(h); this.sy.step(h); this.tilt.step(h);
      // Hop physics: gravity pulls down; landing converts speed into a squash.
      if (this.y > 0 || this.vy > 0) {
        this.vy -= 2600 * h;
        this.y += this.vy * h;
        if (this.y <= 0) {
          const impact = Math.min(0.25, -this.vy / 2400);
          this.y = 0; this.vy = 0;
          this.squash(this.reduced ? impact * 0.4 : impact);
        }
      }
      // The sprout is pushed by the body's motion (secondary motion), then springs back.
      this.sway.t = Math.sin(t * 1.3) * 4 + this.tilt.v * 0.6;
      this.sway.kick((this.sy.vel * -40 + this.tilt.vel * 0.3) * h);
      this.sway.step(h);
    }
    this.sway.v = clamp(this.sway.v, -38, 38);

    this.lookX = damp(this.lookX, this.lookTX, 8, dt);
    this.lookY = damp(this.lookY, this.lookTY, 8, dt);

    // --- transforms ---
    const s = this.stageScale;
    const sx = clamp(this.sx.v, 0.6, 1.5) * s, sy = clamp(this.sy.v, 0.6, 1.5) * s;
    setAttr(this.rig, 'transform', `translate(${CX} ${f1(BASE_Y - this.y)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-CX} ${-BASE_Y})`);
    setAttr(this.tiltG, 'transform', `rotate(${f1(this.tilt.v)} ${CX} 220)`);
    setAttr(this.sproutG, 'transform', `rotate(${f1(this.sway.v)} ${CX} ${f1(this.sproutBase)})`);
    setAttr(this.face, 'transform', `translate(${f1(this.lookX)} ${f1(this.lookY)})`);
    const shadowK = clamp(1 - this.y / 260, 0.45, 1);
    setAttr(this.shadow, 'rx', f1(96 * s * shadowK * (sx / s)));
    setAttr(this.shadow, 'opacity', (0.16 * shadowK).toFixed(3));
    if (this.sparkle) setAttr(this.sparkle, 'opacity', (0.5 + 0.5 * Math.sin(t * 4)).toFixed(2));

    // --- expression ---
    let name = this.sleeping ? 'sleep' : this.base;
    if (this.react_ && nowMs < this.react_.until) name = this.react_.name;
    else this.react_ = null;
    if (this.talkLevel && !this.sleeping) name = 'talk';
    if (dancing && !this.react_) name = 'happy';
    const ex = EXPR[name] || EXPR.content;

    // Blink every few seconds (only when the eyes are open).
    if (nowMs > this.blinkAt) { this.blinkT = 0.14; this.blinkAt = nowMs + rand(2200, 5200); }
    this.blinkT = Math.max(0, this.blinkT - dt);
    const blink = this.blinkT > 0 ? Math.sin((this.blinkT / 0.14) * Math.PI) : 0;

    for (const e of this.eyes) {
      const kind = ex.eyes;
      const openish = kind === 'open' || kind === 'big' || kind === 'tired';
      setAttr(e.open, 'display', openish ? 'inline' : 'none');
      setAttr(e.happy, 'display', kind === 'happy' ? 'inline' : 'none');
      setAttr(e.closed, 'display', kind === 'closed' ? 'inline' : 'none');
      setAttr(e.x, 'display', kind === 'x' ? 'inline' : 'none');
      let scY = 1 - blink * 0.92, scX = 1;
      if (kind === 'big') { scY *= 1.15; scX = 1.12; }
      if (kind === 'tired') scY *= 0.5;
      setAttr(e.open, 'transform', `translate(0 ${kind === 'tired' ? 4 : 0}) scale(${scX.toFixed(2)} ${scY.toFixed(2)})`);
      setAttr(e.lid, 'opacity', kind === 'tired' ? 1 : 0);
    }
    const b = ex.brows;
    this.brows.forEach((br, i) => {
      const sgn = i === 0 ? -1 : 1, x = CX + sgn * EYE_DX, y = EYE_Y - 27;
      let d = '';
      if (b === 'worried') d = `M ${x - sgn * 12} ${y + 2} L ${x + sgn * 10} ${y - 6}`;
      else if (b === 'angry') d = `M ${x - sgn * 12} ${y - 6} L ${x + sgn * 10} ${y + 3}`;
      else if (b === 'flat') d = `M ${x - 11} ${y} L ${x + 11} ${y}`;
      setAttr(br, 'd', d || 'M0 0');
      setAttr(br, 'opacity', d ? 1 : 0);
    });

    // Mouth: chomping, talking (driven by the voice loudness) or the expression's shape.
    let open = ex.mouth.open;
    if (nowMs < this.chompUntil) open = Math.abs(Math.sin(t * 16)) * 0.85;
    if (name === 'talk' && this.talkLevel) open = clamp(this.talkLevel() * 1.3, 0, 1);
    if (this.sleeping) open = 0.1 + Math.max(0, Math.sin(t * 1.6)) * 0.1;
    this.mouthOpen = damp(this.mouthOpen, open, 22, dt);
    const { w, curve } = ex.mouth;
    const o = this.mouthOpen;
    let md;
    if (o < 0.06) {
      md = `M ${-w} 0 Q 0 ${curve} ${w} 0`;
      setAttr(this.mouth, 'fill', 'none');
      setAttr(this.tongue, 'opacity', 0);
    } else {
      const lip = curve * 0.55, low = lip + 6 + o * 30;
      md = `M ${-w} 0 Q 0 ${f1(lip)} ${w} 0 Q ${f1(w * 0.9)} ${f1(low * 0.7)} 0 ${f1(low)} Q ${f1(-w * 0.9)} ${f1(low * 0.7)} ${-w} 0 Z`;
      setAttr(this.mouth, 'fill', '#6B1E3A');
      setAttr(this.tongue, 'opacity', o > 0.25 ? 1 : 0);
      setAttr(this.tongue, 'cx', 0);
      setAttr(this.tongue, 'cy', f1(low - 2));
      setAttr(this.tongue, 'rx', f1(w * 0.62));
      setAttr(this.tongue, 'ry', f1(5 + o * 7));
    }
    setAttr(this.mouth, 'd', md);
    setAttr(this.mouthClipPath, 'd', md);

    const blush = ex.blush;
    this.cheeks.forEach(c => setAttr(c, 'opacity', (0.15 + blush * 0.5).toFixed(2)));

    // Spicy: red flush + steam for a moment.
    const spicy = nowMs < this.spicyUntil ? (this.spicyUntil - nowMs) / 1800 : 0;
    setAttr(this.flush, 'opacity', (spicy * 0.35).toFixed(2));
    setAttr(this.steamG, 'opacity', spicy > 0 ? (0.4 + 0.6 * Math.abs(Math.sin(t * 9))).toFixed(2) : 0);
    setAttr(this.steamG, 'transform', `translate(0 ${f1(-((t * 60) % 20))})`);

    // Dirt shows as mud spots, then stink lines when it gets bad.
    setAttr(this.dirtG, 'opacity', (this.dirt * 0.95).toFixed(2));
    setAttr(this.stinkG, 'opacity', this.dirt > 0.6 ? ((this.dirt - 0.6) * 2.5 * (0.6 + 0.4 * Math.sin(t * 3))).toFixed(2) : 0);
    setAttr(this.stinkG, 'transform', `translate(0 ${f1(-((t * 14) % 10))})`);

    // Zzz drift up and fade while sleeping.
    this.zzz.forEach((z, i) => {
      if (!this.sleeping) { setAttr(z, 'opacity', 0); return; }
      const p = ((t * 0.35) + i / 3) % 1;
      setAttr(z, 'x', f1(CX + 70 + p * 40 + i * 4));
      setAttr(z, 'y', f1(TOP_Y + 40 - p * 90 * s));
      setAttr(z, 'opacity', (Math.sin(p * Math.PI) * 0.9).toFixed(2));
    });
  }
}
