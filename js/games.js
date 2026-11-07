// Mini-games: Snack Catch and Vine Hop. Both run on one full-screen canvas.
//
// Each game is a tiny object with reset / update(dt) / draw / input handlers.
// The runner owns the loop, pausing, the start + end cards, and hands the final
// score back to main.js (which pays out coins and XP). Games never touch save data.
import { $, clamp, rand, randi, pick, vibrate } from './util.js';
import { sfx } from './sfx.js';
import { FURS, FOODS } from './data.js';
import { h } from './ui.js';

const INK = '#2E1F47';
let cv, ctx, W = 0, H = 0, dpr = 1;
let run = null; // the active game session

// ---------- canvas Mochi (a simplified twin of the SVG pet) ----------
export function drawMochi(c, x, y, r, furKey, { sx = 1, sy = 1, eyes = 'open', tilt = 0 } = {}) {
  const f = FURS[furKey] || FURS.peach;
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(sx, sy);
  // body: dome top + flatter bottom, origin at the feet.
  // For a symmetric cubic the peak sits at 0.25*start + 0.75*control, so control -1.85r
  // gives a top at about -1.49r: the same height/width ratio as the SVG pet (~0.78).
  const top = -r * 1.49;
  c.beginPath();
  c.moveTo(-r, -r * 0.42);
  c.bezierCurveTo(-r, -r * 1.85, r, -r * 1.85, r, -r * 0.42);
  c.bezierCurveTo(r, -r * 0.05, r * 0.86, 0, 0, 0);
  c.bezierCurveTo(-r * 0.86, 0, -r, -r * 0.05, -r, -r * 0.42);
  const g = c.createRadialGradient(-r * 0.35, -r * 1.05, r * 0.1, 0, -r * 0.6, r * 1.4);
  g.addColorStop(0, f.light); g.addColorStop(0.55, f.base); g.addColorStop(1, f.dark);
  c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(2.5, r * 0.07); c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  // sprout
  c.lineWidth = Math.max(2, r * 0.06); c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, top + r * 0.04); c.quadraticCurveTo(-r * 0.04, top - r * 0.12, r * 0.02, top - r * 0.26); c.stroke();
  c.fillStyle = '#6CCB5F';
  [[1, -0.3], [-1, 0.3]].forEach(([s, rot]) => {
    c.save(); c.translate(r * 0.02, top - r * 0.24); c.rotate(rot); c.scale(s, 1);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(r * 0.08, -r * 0.16, r * 0.3, -r * 0.18, r * 0.38, -r * 0.05);
    c.bezierCurveTo(r * 0.28, r * 0.06, r * 0.1, r * 0.06, 0, 0); c.fill(); c.lineWidth = Math.max(1.5, r * 0.045); c.stroke();
    c.restore();
  });
  // face
  const ey = -r * 0.72, ex = r * 0.36;
  c.fillStyle = INK;
  if (eyes === 'x') {
    c.lineWidth = Math.max(2, r * 0.07);
    [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * ex - s * r * 0.1, ey - r * 0.1); c.lineTo(s * ex + s * r * 0.08, ey); c.lineTo(s * ex - s * r * 0.1, ey + r * 0.1); c.stroke(); });
  } else if (eyes === 'happy') {
    c.lineWidth = Math.max(2, r * 0.07);
    [-1, 1].forEach(s => { c.beginPath(); c.arc(s * ex, ey + r * 0.05, r * 0.11, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); });
  } else {
    [-1, 1].forEach(s => {
      c.beginPath(); c.ellipse(s * ex, ey, r * 0.11, r * 0.145, 0, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
      c.beginPath(); c.arc(s * ex - r * 0.035, ey - r * 0.05, r * 0.045, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    });
  }
  c.fillStyle = 'rgba(255,127,166,.55)';
  [-1, 1].forEach(s => { c.beginPath(); c.ellipse(s * r * 0.6, -r * 0.5, r * 0.14, r * 0.08, 0, 0, Math.PI * 2); c.fill(); });
  c.beginPath(); c.lineWidth = Math.max(2, r * 0.05); c.strokeStyle = INK;
  c.moveTo(-r * 0.12, -r * 0.48); c.quadraticCurveTo(0, -r * 0.4, r * 0.12, -r * 0.48); c.stroke();
  c.restore();
}

// Small floating "+1" labels drawn on the canvas.
const pops = [];
function pop(text, x, y, color = '#fff') { pops.push({ text, x, y, t: 0, color }); }
function drawPops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt;
    if (p.t > 0.8) { pops.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - p.t / 0.8;
    ctx.font = '22px "Mochiy Pop One", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(p.text, p.x, p.y - p.t * 60);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y - p.t * 60);
  }
  ctx.globalAlpha = 1;
}

// Decaying-trauma shake for the canvas camera (same model as fx.js).
let trauma = 0, shakeT = 0;
const shake = a => { trauma = clamp(trauma + a, 0, 1); };

// ======================================================================
// Snack Catch
// ======================================================================
function makeCatch(fur, level) {
  const foods = Object.values(FOODS).filter(f => f.level <= Math.max(3, level)).map(f => f.emoji);
  const g = {
    score: 0, lives: 3, t: 0, items: [], spawnIn: 0.6,
    x: W / 2, tx: W / 2, sx: 1, sy: 1, svx: 0, svy: 0, combo: 0, hurtT: 0,
    keys: { l: false, r: false },
  };
  const R = () => Math.min(W, H) * 0.11;            // Mochi's size (half-width)
  const groundY = () => H - Math.max(70, H * 0.12);

  g.update = dt => {
    g.t += dt;
    const speed = 1 + Math.min(1.6, g.t / 40);       // difficulty ramps over ~40 s
    // move: follow the pointer, or arrow keys
    if (g.keys.l) g.tx -= 520 * dt;
    if (g.keys.r) g.tx += 520 * dt;
    g.tx = clamp(g.tx, R(), W - R());
    const prev = g.x;
    g.x += (g.tx - g.x) * (1 - Math.exp(-14 * dt));
    const lean = clamp((g.x - prev) / dt / 1600, -0.25, 0.25);
    g.tilt = (g.tilt || 0) + (lean - (g.tilt || 0)) * (1 - Math.exp(-10 * dt));
    // squash spring back to 1
    g.svx += (1 - g.sx) * 300 * dt - g.svx * 14 * dt; g.sx += g.svx * dt;
    g.svy += (1 - g.sy) * 300 * dt - g.svy * 14 * dt; g.sy += g.svy * dt;
    g.hurtT = Math.max(0, g.hurtT - dt);

    g.spawnIn -= dt;
    if (g.spawnIn <= 0) {
      g.spawnIn = rand(0.45, 0.85) / speed;
      const roll = Math.random();
      const kind = roll < 0.16 + Math.min(0.14, g.t / 300) ? 'urchin' : roll > 0.975 ? 'star' : roll > 0.955 && g.lives < 3 ? 'heart' : 'food';
      g.items.push({ kind, em: kind === 'food' ? pick(foods) : '', x: rand(30, W - 30), y: -30, vy: rand(140, 220) * speed, rot: rand(-1, 1), vr: rand(-2, 2), r: Math.min(W, H) * 0.045 });
    }
    const mouthY = groundY() - R() * 1.1;
    for (let i = g.items.length - 1; i >= 0; i--) {
      const it = g.items[i];
      it.y += it.vy * dt; it.rot += it.vr * dt;
      const dx = it.x - g.x, dy = it.y - mouthY;
      if (Math.abs(dx) < R() * 1.05 + it.r * 0.5 && Math.abs(dy) < R() * 0.6 + it.r) {
        g.items.splice(i, 1);
        if (it.kind === 'urchin') {
          g.lives--; g.combo = 0; g.hurtT = 0.5;
          sfx.hurt(); shake(0.55); vibrate(60);
          g.sx = 1.25; g.sy = 0.75;
          if (g.lives <= 0) return 'over';
        } else {
          const pts = it.kind === 'star' ? 5 : 1;
          if (it.kind === 'heart') { g.lives = Math.min(3, g.lives + 1); pop('+♥', it.x, it.y, '#FF5D8F'); sfx.yum(); }
          else { g.score += pts; g.combo++; pop('+' + pts, it.x, it.y, it.kind === 'star' ? '#FFC23D' : '#fff'); }
          // pitch rises with the combo: a tiny reward for not missing
          if (it.kind !== 'heart') (g.combo % 5 === 0 ? sfx.coin : sfx.pop)();
          g.sx = 1.14; g.sy = 0.86;
          if (it.kind === 'star') shake(0.25);
        }
        continue;
      }
      if (it.y > H + 40) g.items.splice(i, 1);
    }
    return null;
  };

  g.draw = dt => {
    const gy = groundY();
    // sky + hills
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#9CDCFF'); sky.addColorStop(1, '#E4F7FF');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = '#B7E7A8';
    ctx.beginPath(); ctx.moveTo(-20, gy); ctx.quadraticCurveTo(W * 0.25, gy - 70, W * 0.5, gy - 10); ctx.quadraticCurveTo(W * 0.8, gy - 80, W + 20, gy); ctx.lineTo(W + 20, H + 20); ctx.lineTo(-20, H + 20); ctx.fill();
    ctx.fillStyle = '#6CCB5F'; ctx.fillRect(-20, gy, W + 40, H - gy + 20);
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-20, gy); ctx.lineTo(W + 20, gy); ctx.stroke();
    // falling things
    for (const it of g.items) {
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
      if (it.kind === 'urchin') drawUrchin(it.r);
      else {
        ctx.font = `${it.r * 2}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.kind === 'star' ? '⭐' : it.kind === 'heart' ? '💗' : it.em, 0, 0);
      }
      ctx.restore();
    }
    const blink = g.hurtT > 0 && Math.floor(g.hurtT * 20) % 2 === 0;
    if (!blink) drawMochi(ctx, g.x, gy + 4, R(), fur, { sx: g.sx, sy: g.sy, tilt: g.tilt || 0, eyes: g.hurtT > 0 ? 'x' : 'open' });
    drawPops(dt);
  };

  g.pointer = (x) => { g.tx = x; };
  g.key = (k, down) => {
    if (k === 'ArrowLeft' || k === 'a') g.keys.l = down;
    if (k === 'ArrowRight' || k === 'd') g.keys.r = down;
  };
  g.hint = 'Slide to move. Catch snacks, dodge the spiky urchins.';
  return g;
}

function drawUrchin(r) {
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = i % 2 ? r * 0.7 : r * 1.15;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#7B4FD6'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.1, r * 0.14, 0, Math.PI * 2); ctx.arc(r * 0.25, -r * 0.1, r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.08, r * 0.07, 0, Math.PI * 2); ctx.arc(r * 0.25, -r * 0.08, r * 0.07, 0, Math.PI * 2); ctx.fill();
}

// ======================================================================
// Vine Hop (one-button hopper)
// ======================================================================
function makeHop(fur) {
  const g = { score: 0, lives: 1, t: 0, y: H * 0.45, vy: 0, pipes: [], spawnX: 0, started: false, sx: 1, sy: 1, dead: false, deadT: 0, scroll: 0 };
  const R = () => Math.min(W, H) * 0.065;
  const x = () => W * 0.3;
  const groundY = () => H - Math.max(60, H * 0.1);
  const gap = () => clamp(H * (0.34 - Math.min(0.08, g.score * 0.004)), 150, 300);
  const speed = () => Math.min(W, 520) * (0.42 + Math.min(0.35, g.score * 0.012));
  const pipeW = () => Math.max(56, W * 0.14);

  g.hopNow = () => {
    if (g.dead) return;
    g.started = true;
    g.vy = -Math.max(420, H * 0.62);
    g.sx = 0.82; g.sy = 1.2;
    sfx.hop();
  };

  g.update = dt => {
    g.t += dt;
    g.sx += (1 - g.sx) * (1 - Math.exp(-10 * dt));
    g.sy += (1 - g.sy) * (1 - Math.exp(-10 * dt));
    if (!g.started) { g.y = H * 0.45 + Math.sin(g.t * 3) * 10; return null; }
    if (g.dead) { g.deadT += dt; g.vy += H * 2.2 * dt; g.y = Math.min(groundY() - 4, g.y + g.vy * dt); return g.deadT > 0.9 ? 'over' : null; }
    g.vy += H * 1.9 * dt;
    g.y += g.vy * dt;
    const sp = speed();
    g.scroll += sp * dt;
    // spawn bamboo pairs at a fixed spacing
    g.spawnX -= sp * dt;
    if (g.spawnX <= 0) {
      g.spawnX = Math.max(230, W * 0.55);
      const gp = gap();
      const top = rand(H * 0.14, groundY() - gp - H * 0.08);
      g.pipes.push({ x: W + pipeW(), top, gap: gp, passed: false });
    }
    const r = R();
    for (let i = g.pipes.length - 1; i >= 0; i--) {
      const p = g.pipes[i];
      p.x -= sp * dt;
      if (!p.passed && p.x + pipeW() / 2 < x()) {
        p.passed = true; g.score++;
        sfx.coin(); pop('+1', x(), g.y - r * 1.4);
      }
      // circle-vs-rect collision (slightly forgiving radius)
      const hx = clamp(x(), p.x - pipeW() / 2, p.x + pipeW() / 2);
      const inGap = g.y - r * 0.9 > p.top && g.y + r * 0.1 < p.top + p.gap;
      if (Math.abs(hx - x()) < r * 0.8 && !inGap) return crash();
      if (p.x < -pipeW()) g.pipes.splice(i, 1);
    }
    if (g.y >= groundY() - 2 || g.y < -r * 2) return crash();
    return null;
  };
  function crash() {
    g.dead = true; g.vy = -H * 0.3;
    sfx.hurt(); shake(0.6); vibrate(80);
    return null;
  }

  g.draw = dt => {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#FFC9A8'); sky.addColorStop(1, '#FFF1C9');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
    // parallax hills
    ctx.fillStyle = '#F5B7A0';
    const off = -(g.scroll * 0.2) % 240;
    for (let hx = off - 240; hx < W + 240; hx += 240) { ctx.beginPath(); ctx.arc(hx + 120, groundY() + 40, 140, Math.PI, 0); ctx.fill(); }
    // bamboo
    for (const p of g.pipes) {
      drawBamboo(p.x - pipeW() / 2, -10, pipeW(), p.top + 10, true);
      drawBamboo(p.x - pipeW() / 2, p.top + p.gap, pipeW(), groundY() - p.top - p.gap, false);
    }
    const gy = groundY();
    ctx.fillStyle = '#E7A867'; ctx.fillRect(-20, gy, W + 40, H - gy + 20);
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-20, gy); ctx.lineTo(W + 20, gy); ctx.stroke();
    ctx.strokeStyle = '#CF8F4F'; ctx.lineWidth = 3;
    const go = -(g.scroll % 40);
    for (let gx = go; gx < W + 40; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, gy + 14); ctx.lineTo(gx + 18, gy + 14); ctx.stroke(); }
    const r = R();
    const tilt = g.dead ? 0.6 : clamp(g.vy / (H * 2), -0.4, 0.5);
    drawMochi(ctx, x(), g.y + r * 0.55, r, fur, { sx: g.sx, sy: g.sy, tilt, eyes: g.dead ? 'x' : g.vy < 0 ? 'happy' : 'open' });
    drawPops(dt);
  };
  g.pointer = null;
  g.tap = () => g.hopNow();
  g.key = (k, down) => { if (down && (k === ' ' || k === 'ArrowUp' || k === 'w')) g.hopNow(); };
  g.hint = 'Tap (or press Space) to hop. Fly through the gaps.';
  return g;
}

function drawBamboo(x, y, w, hgt, top) {
  if (hgt <= 0) return;
  ctx.fillStyle = '#8FD46B'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, hgt, 10) : ctx.rect(x, y, w, hgt); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + w * 0.18, y + 6, w * 0.14, hgt - 12);
  ctx.strokeStyle = '#4E9A3C'; ctx.lineWidth = 3;
  for (let yy = y + 50; yy < y + hgt - 10; yy += 54) { ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.lineTo(x + w - 4, yy); ctx.stroke(); }
  // the cap at the open end
  ctx.fillStyle = '#6CCB5F'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
  const cy = top ? y + hgt - 18 : y;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 6, cy, w + 12, 18, 7) : ctx.rect(x - 6, cy, w + 12, 18); ctx.fill(); ctx.stroke();
}

// ======================================================================
// Runner: owns the canvas, loop, input, pause and the start/end cards.
// ======================================================================
function fit() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}

/**
 * Start a game. Resolves when the player leaves the game screen.
 * @param {'catch'|'hop'} kind
 * @param {{ fur: string, level: number, best: number, onRound: (score:number) => {coins:number,xp:number,best:boolean} }} opts
 *        onRound is called once per finished round and returns the payout to show.
 */
export function playGame(kind, opts) {
  return new Promise(resolve => {
    const screen = $('#game');
    cv = $('#gameCanvas'); ctx = cv.getContext('2d');
    screen.hidden = false;
    fit();
    const scoreEl = $('#gameScore'), livesEl = $('#gameLives'), msg = $('#gameMsg');
    let g, state = 'ready', last = performance.now(), raf = 0, rounds = 0;

    const newRound = () => {
      g = kind === 'catch' ? makeCatch(opts.fur, opts.level) : makeHop(opts.fur);
      state = 'ready';
      pops.length = 0; trauma = 0;
      scoreEl.textContent = '0';
      livesEl.textContent = kind === 'catch' ? '💗💗💗' : '';
      msg.innerHTML = '';
      msg.append(h('div.card', {},
        h('h2', {}, kind === 'catch' ? 'Snack Catch' : 'Vine Hop'),
        h('p', {}, g.hint),
        h('p', { style: { fontSize: '13px', opacity: '.7' } }, `Your best: ${opts.best}`),
        h('button.btn.btn-wide', { onclick: begin, autofocus: true }, 'Start')));
      msg.querySelector('button').focus();
    };
    const begin = e => {
      if (e) e.stopPropagation();
      sfx.tap();
      msg.innerHTML = '';
      state = 'play';
      last = performance.now();
      if (kind === 'hop') g.hopNow();
    };

    const end = () => {
      state = 'over';
      rounds++;
      const pay = opts.onRound(g.score);
      sfx.chest();
      msg.innerHTML = '';
      msg.append(h('div.card', {},
        h('h2', {}, pay.best ? 'New best!' : 'Nice run!'),
        h('span.hero-em', {}, g.score),
        h('div.loot', {}, h('span', {}, `+${pay.coins} coins`), pay.xp ? h('span', {}, `+${pay.xp} XP`) : null),
        pay.note ? h('p', { style: { fontSize: '13px' } }, pay.note) : null,
        h('div.actions-row', {},
          pay.canReplay ? h('button.btn', { onclick: e => { e.stopPropagation(); newRound(); }, autofocus: true }, 'Play again') : null,
          h('button.btn.btn-ghost', { onclick: e => { e.stopPropagation(); quit(); } }, 'Back to Mochi'))));
      (msg.querySelector('[autofocus]') || msg.querySelector('button')).focus();
    };

    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (state === 'play') {
        const r = g.update(dt);
        scoreEl.textContent = g.score;
        if (kind === 'catch') livesEl.textContent = '💗'.repeat(Math.max(0, g.lives)) + '🤍'.repeat(Math.max(0, 3 - g.lives));
        if (r === 'over') end();
      } else if (state === 'ready' && kind === 'hop') g.update(dt);
      // camera shake
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (trauma > 0) {
        trauma = Math.max(0, trauma - dt * 1.8); shakeT += dt * 30;
        const s = trauma * trauma;
        ctx.translate(Math.sin(shakeT * 1.7) * 12 * s, Math.sin(shakeT * 2.3) * 9 * s);
      }
      g.draw(dt);
    };

    // ---- input ----
    const ptr = e => {
      if (state !== 'play') return;
      const r = cv.getBoundingClientRect();
      if (g.pointer) g.pointer(e.clientX - r.left);
    };
    const down = e => {
      if (state !== 'play') return;
      ptr(e);
      if (g.tap) g.tap();
    };
    const key = d => e => {
      if (e.key === 'Escape') { if (d) quit(); return; }
      if (state === 'play' && g.key) { g.key(e.key, d); if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault(); }
    };
    const kd = key(true), ku = key(false);
    // Pause automatically when the tab is hidden, so a phone call doesn't end the run.
    const vis = () => { if (document.hidden && state === 'play') { state = 'paused'; showPause(); } };
    const showPause = () => {
      msg.innerHTML = '';
      msg.append(h('div.card', {}, h('h2', {}, 'Paused'),
        h('button.btn.btn-wide', { onclick: e => { e.stopPropagation(); msg.innerHTML = ''; state = 'play'; last = performance.now(); } }, 'Keep playing')));
    };
    const quit = () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointermove', ptr);
      cv.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', fit);
      document.removeEventListener('visibilitychange', vis);
      $('#gameQuit').onclick = null;
      screen.hidden = true;
      msg.innerHTML = '';
      // Quitting mid-round still pays for what was scored.
      if (state === 'play' || state === 'paused') opts.onRound(g.score);
      resolve({ rounds });
    };
    cv.addEventListener('pointermove', ptr);
    cv.addEventListener('pointerdown', down);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('resize', fit);
    document.addEventListener('visibilitychange', vis);
    $('#gameQuit').onclick = () => { sfx.tap(); quit(); };

    newRound();
    raf = requestAnimationFrame(frame);
  });
}
