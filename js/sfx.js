// All sound is synthesized with the Web Audio API, so the game ships with zero audio files.
import { rand } from './util.js';

let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;

export function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  return ctx;
}
export const masterOut = () => (audio(), master);

// Browsers only allow sound after a user gesture; call this from tap handlers.
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
export function setSound(on) { enabled = !!on; }
export const soundOn = () => enabled;

function tone({ f = 440, f2 = null, type = 'sine', dur = 0.12, vol = 0.25, attack = 0.006, delay = 0 }) {
  if (!enabled || !audio()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise({ dur = 0.15, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0, sweep = null }) {
  if (!enabled || !audio()) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(freq, t);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl).connect(g).connect(master);
  src.start(t, rand(0, 0.5));
  src.stop(t + dur + 0.05);
}

export const sfx = {
  tap() { tone({ f: 620, f2: 900, type: 'triangle', dur: 0.07, vol: 0.12 }); },
  boop() { tone({ f: 520, f2: 1150, type: 'triangle', dur: 0.14, vol: 0.22 }); },
  pop() { tone({ f: 380, f2: 1200, dur: 0.08, vol: 0.2 }); },
  giggle() {
    for (let i = 0; i < 5; i++) tone({ f: rand(950, 1250), f2: rand(1300, 1700), type: 'triangle', dur: 0.07, vol: 0.16, delay: i * 0.075 });
  },
  purr() {
    for (let i = 0; i < 3; i++) noise({ dur: 0.18, vol: 0.12, freq: 180, q: 3, type: 'lowpass', delay: i * 0.2 });
  },
  munch() {
    noise({ dur: 0.07, vol: 0.32, freq: 1400, q: 0.7, delay: 0 });
    noise({ dur: 0.07, vol: 0.28, freq: 1100, q: 0.7, delay: 0.14 });
    noise({ dur: 0.07, vol: 0.24, freq: 1300, q: 0.7, delay: 0.28 });
  },
  gulp() { tone({ f: 300, f2: 120, dur: 0.16, vol: 0.25 }); },
  yum() { tone({ f: 700, f2: 900, type: 'triangle', dur: 0.1, vol: 0.16 }); tone({ f: 900, f2: 1300, type: 'triangle', dur: 0.14, vol: 0.16, delay: 0.1 }); },
  nope() { tone({ f: 420, f2: 300, type: 'square', dur: 0.12, vol: 0.08 }); tone({ f: 380, f2: 260, type: 'square', dur: 0.14, vol: 0.08, delay: 0.13 }); },
  coin() { tone({ f: 988, type: 'square', dur: 0.07, vol: 0.09 }); tone({ f: 1319, type: 'square', dur: 0.16, vol: 0.09, delay: 0.07 }); },
  levelup() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.2, vol: 0.2, delay: i * 0.09 })); },
  fanfare() { [784, 988, 1175, 1568].forEach((f, i) => tone({ f, type: 'square', dur: 0.15, vol: 0.07, delay: i * 0.08 })); },
  splash() { noise({ dur: 0.5, vol: 0.22, freq: 3000, q: 0.4, type: 'highpass' }); },
  scrub() { noise({ dur: 0.09, vol: 0.08, freq: 2200, q: 2 }); },
  bubble() { tone({ f: rand(600, 900), f2: rand(1400, 2000), dur: 0.06, vol: 0.08 }); },
  whoosh() { noise({ dur: 0.3, vol: 0.15, freq: 400, q: 1, sweep: 2400 }); },
  hurt() { tone({ f: 500, f2: 180, type: 'sawtooth', dur: 0.25, vol: 0.1 }); },
  hop() { tone({ f: 340, f2: 720, type: 'triangle', dur: 0.12, vol: 0.14 }); },
  snore() { noise({ dur: 0.9, vol: 0.06, freq: 220, q: 6, type: 'bandpass' }); },
  click() { tone({ f: 1800, type: 'square', dur: 0.03, vol: 0.05 }); },
  spicy() { noise({ dur: 0.6, vol: 0.18, freq: 800, q: 0.6, sweep: 4000 }); tone({ f: 900, f2: 1600, type: 'sawtooth', dur: 0.4, vol: 0.06 }); },
  chest() { [660, 880, 1100, 1320, 1760].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.12, vol: 0.14, delay: i * 0.06 })); },
  // Mochi's own little voice: random squeaky syllables.
  babble(n = 4) {
    for (let i = 0; i < n; i++) {
      const base = rand(520, 880);
      tone({ f: base, f2: base * rand(0.8, 1.35), type: 'triangle', dur: rand(0.07, 0.12), vol: 0.14, delay: i * 0.11 });
    }
    return n * 0.11 + 0.1;
  },
};

// Simple 4-bar dance loop. Returns a stop function.
export function playDanceTune(seconds = 6) {
  if (!enabled || !audio()) return () => {};
  const bpm = 128, beat = 60 / bpm;
  const melody = [659, 784, 880, 784, 659, 587, 523, 587, 659, 784, 988, 880, 784, 659, 587, 659];
  const steps = Math.floor(seconds / (beat / 2));
  for (let i = 0; i < steps; i++) {
    const d = i * beat / 2;
    if (i % 2 === 0) noise({ dur: 0.08, vol: 0.18, freq: 120, q: 1, type: 'lowpass', delay: d });
    if (i % 4 === 2) noise({ dur: 0.06, vol: 0.08, freq: 6000, q: 1, type: 'highpass', delay: d });
    tone({ f: melody[i % melody.length], type: 'square', dur: beat / 2 * 0.8, vol: 0.05, delay: d });
  }
  return () => {};
}
