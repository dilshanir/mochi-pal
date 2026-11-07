// Visual "juice": particles (hearts, bubbles, coins, confetti, sparkles), floating text,
// and screen shake. Drawn on one full-stage canvas so hundreds of particles stay cheap.
//
// Feedback is tiered (game-feel skill): small = a few particles, medium = burst + text,
// large = confetti + shake. Shake uses a decaying "trauma" value and smooth sine motion
// (never random jitter), and it moves only the visual layer, never game logic.
import { rand, clamp } from './util.js';

const INK = '#2E1F47';
let canvas, ctx, layer, shakeEl;
let dpr = 1;
const parts = [];
let trauma = 0, shakeT = 0, reduced = false;

export function initFx({ canvasEl, textLayer, shakeTarget }) {
  canvas = canvasEl; ctx = canvas.getContext('2d'); layer = textLayer; shakeEl = shakeTarget;
  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  };
  fit();
  window.addEventListener('resize', fit);
}
export const setReducedFx = on => { reduced = !!on; };

// Particles are positioned in CLIENT coordinates so any module can spawn them from a
// pointer event or an element's getBoundingClientRect() without converting.
function toLocal(x, y) {
  const r = canvas.getBoundingClientRect();
  return { x: x - r.left, y: y - r.top };
}

const KINDS = {
  heart:  { life: 1.1, g: -40,  size: [12, 20] },
  bubble: { life: 1.4, g: -70,  size: [6, 16] },
  coin:   { life: 0.9, g: 900,  size: [9, 12] },
  confetti: { life: 2.2, g: 380, size: [6, 10] },
  sparkle: { life: 0.7, g: 0,   size: [6, 12] },
  crumb:  { life: 0.6, g: 700,  size: [3, 6] },
  drop:   { life: 0.9, g: 900,  size: [4, 7] },
  note:   { life: 1.4, g: -50,  size: [14, 20] },
};
const CONFETTI = ['#FF5D8F', '#FFC23D', '#2FB7B0', '#6CCB5F', '#9C7BFF', '#fff'];

export function burst(kind, x, y, n = 6, opts = {}) {
  if (!ctx) return;
  if (reduced) n = Math.ceil(n / 3);
  const k = KINDS[kind] || KINDS.sparkle;
  const p0 = toLocal(x, y);
  for (let i = 0; i < n; i++) {
    const a = opts.angle != null ? opts.angle + rand(-opts.spread || -0.6, opts.spread || 0.6) : rand(0, Math.PI * 2);
    const sp = rand(opts.speed?.[0] ?? 60, opts.speed?.[1] ?? 200);
    parts.push({
      kind, x: p0.x + rand(-6, 6), y: p0.y + rand(-6, 6),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'heart' || kind === 'note' ? 60 : 0),
      life: k.life * rand(0.8, 1.2), age: 0, g: k.g,
      size: rand(k.size[0], k.size[1]), rot: rand(0, 6.28), vr: rand(-6, 6),
      color: opts.color || (kind === 'confetti' ? CONFETTI[i % CONFETTI.length] : null),
    });
  }
  if (parts.length > 400) parts.splice(0, parts.length - 400);
}

// Rain confetti across the whole stage from the top edge (level ups, streaks).
export function confettiRain(n = 80) {
  if (!ctx) return;
  const r = canvas.getBoundingClientRect();
  for (let i = 0; i < (reduced ? 20 : n); i++) {
    burst('confetti', r.left + rand(0, r.width), r.top - 10, 1, { angle: Math.PI / 2, spread: 0.5, speed: [40, 220] });
  }
}

// Floating text like "+12 🪙" that rises and fades. Uses DOM so text stays crisp.
export function floatText(text, x, y, cls = '') {
  if (!layer) return;
  const r = layer.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'float-text ' + cls;
  d.textContent = text;
  d.style.left = (x - r.left) + 'px';
  d.style.top = (y - r.top) + 'px';
  layer.appendChild(d);
  d.addEventListener('animationend', () => d.remove());
}

export function shake(amount) { if (!reduced) trauma = clamp(trauma + amount, 0, 1); }

// Called every frame by main.js.
export function updateFx(dt) {
  if (!ctx) return;
  // --- screen shake (trauma², smooth sines, decays to rest) ---
  if (shakeEl) {
    if (trauma > 0) {
      trauma = Math.max(0, trauma - dt * 1.6);
      shakeT += dt * 32;
      const s = trauma * trauma;
      shakeEl.style.transform = `translate(${(Math.sin(shakeT * 1.7) * 10 * s).toFixed(2)}px, ${(Math.sin(shakeT * 2.3) * 7 * s).toFixed(2)}px) rotate(${(Math.sin(shakeT * 1.1) * 1.4 * s).toFixed(2)}deg)`;
    } else if (shakeEl.style.transform) shakeEl.style.transform = '';
  }

  // --- particles ---
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age >= p.life) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt;
    p.vx *= p.kind === 'confetti' ? 0.985 : 0.97;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const t = p.age / p.life;
    const alpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
    ctx.globalAlpha = clamp(alpha, 0, 1);
    draw(p, t);
  }
  ctx.globalAlpha = 1;
}

function draw(p, t) {
  const s = p.size;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  switch (p.kind) {
    case 'heart': {
      const k = s / 16 * (1 + Math.sin(t * 12) * 0.06);
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-16, -4, -8, -16, 0, -7);
      ctx.bezierCurveTo(8, -16, 16, -4, 0, 6);
      ctx.fillStyle = p.color || '#FF5D8F'; ctx.fill(); ctx.lineWidth = 2.5 / k; ctx.stroke();
      break;
    }
    case 'bubble':
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
      ctx.strokeStyle = '#8CC8F2'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.35, s * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      break;
    case 'coin':
      ctx.scale(Math.abs(Math.cos(p.rot)) * 0.8 + 0.2, 1);
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fillStyle = '#FFC23D'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#E0A11F'; ctx.lineWidth = 2; ctx.stroke();
      break;
    case 'confetti':
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.sin(p.rot * 1.5)) * 0.8 + 0.2);
      ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 3, s, s * 0.66);
      break;
    case 'sparkle': {
      ctx.rotate(p.rot * 0.3);
      const k = s * (1 - t * 0.5);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? k * 0.35 : k;
        const a = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = p.color || '#FFF2A8'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      break;
    }
    case 'crumb':
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#E9B872'; ctx.fill();
      break;
    case 'drop':
      ctx.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.quadraticCurveTo(s, 0, 0, s); ctx.quadraticCurveTo(-s, 0, 0, -s * 1.6);
      ctx.fillStyle = '#7CC6FF'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
      break;
    case 'note':
      ctx.rotate(Math.sin(t * 6) * 0.3);
      ctx.font = `${s}px "Mochiy Pop One", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color || INK; ctx.fillText(p.size > 17 ? '♫' : '♪', 0, 0);
      break;
    default: break;
  }
  ctx.restore();
}
