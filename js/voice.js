// Talk-back: Mochi listens through the mic, detects when you stop speaking,
// then repeats you in a squeaky voice. Audio never leaves the device.
import { audio, masterOut, soundOn } from './sfx.js';

const PITCH = 1.6;          // playback rate; >1 = higher + faster (the classic "repeat" voice)
const PREROLL_S = 0.3;      // keep a little audio from before speech was detected
const SILENCE_END_S = 0.75; // stop recording after this much quiet
const MIN_VOICE_S = 0.25;
const MAX_LEN_S = 6;
const IDLE_TIMEOUT_S = 60;  // auto-stop listening after a minute of silence

const WORKLET_SRC = `
class MochiCapture extends AudioWorkletProcessor {
  constructor(){ super(); this.buf = new Float32Array(2048); this.i = 0; }
  process(inputs){
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let k = 0; k < ch.length; k++) {
      this.buf[this.i++] = ch[k];
      if (this.i === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.i = 0; }
    }
    return true;
  }
}
registerProcessor('mochi-capture', MochiCapture);`;

export const micSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !!(window.AudioContext || window.webkitAudioContext);

export class Talker {
  constructor({ onState = () => {}, onRepeat = () => {} } = {}) {
    this.onState = onState;
    this.onRepeat = onRepeat;
    this.state = 'off'; // off | listen | hear | speak | cool
    this.analyser = null;
    this.level = 0;
    this._tdata = null;
  }

  async start() {
    const ctx = audio();
    if (!ctx) throw new Error('Audio is not supported in this browser.');
    if (ctx.state === 'suspended') await ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.sr = ctx.sampleRate;
    this.src = ctx.createMediaStreamSource(this.stream);
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(ctx.destination);

    let usedWorklet = false;
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.node = new AudioWorkletNode(ctx, 'mochi-capture');
        this.node.port.onmessage = e => this._chunk(e.data);
        usedWorklet = true;
      } catch (e) { usedWorklet = false; }
    }
    if (!usedWorklet) {
      this.node = ctx.createScriptProcessor(2048, 1, 1);
      this.node.onaudioprocess = e => this._chunk(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    this.src.connect(this.node);
    this.node.connect(this.sink);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(masterOut());
    this._tdata = new Float32Array(this.analyser.fftSize);

    this.noise = 0.01;
    this.preroll = [];
    this.rec = [];
    this.idle = 0;
    this._set('listen');
  }

  stop() {
    try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ }
    try { this.src && this.src.disconnect(); } catch (e) { /* ignore */ }
    try { this.node && this.node.disconnect(); } catch (e) { /* ignore */ }
    try { this.player && this.player.stop(); } catch (e) { /* ignore */ }
    this.stream = this.src = this.node = null;
    this._set('off');
  }

  get on() { return this.state !== 'off'; }

  _set(s) { if (this.state !== s) { this.state = s; this.onState(s); } }

  _chunk(data) {
    if (this.state === 'off' || this.state === 'speak' || this.state === 'cool') return;
    const dur = data.length / this.sr;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const thr = Math.max(0.018, this.noise * 3.2);

    if (this.state === 'listen') {
      this.noise = this.noise * 0.95 + rms * 0.05;
      this.preroll.push(data);
      while (this.preroll.length * dur > PREROLL_S) this.preroll.shift();
      if (rms > thr) {
        this.rec = [...this.preroll, data];
        this.voiced = dur; this.silent = 0; this.total = dur;
        this.idle = 0;
        this._set('hear');
      } else {
        this.idle += dur;
        if (this.idle > IDLE_TIMEOUT_S) this.stop();
      }
      return;
    }

    // state === 'hear'
    this.rec.push(data);
    this.total += dur;
    if (rms > thr * 0.7) { this.voiced += dur; this.silent = 0; } else this.silent += dur;
    if (this.silent >= SILENCE_END_S || this.total >= MAX_LEN_S) {
      const chunks = this.rec;
      this.rec = []; this.preroll = [];
      if (this.voiced >= MIN_VOICE_S) this._play(chunks);
      else this._set('listen');
    }
  }

  _play(chunks) {
    const ctx = audio();
    // trim trailing silence (keep a short tail)
    const keepTail = Math.ceil((0.15 * this.sr) / 2048);
    const silentChunks = Math.floor((this.silent * this.sr) / 2048);
    if (silentChunks > keepTail) chunks = chunks.slice(0, chunks.length - (silentChunks - keepTail));
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const buf = ctx.createBuffer(1, len, this.sr);
    const out = buf.getChannelData(0);
    let o = 0, peak = 0.0001;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    const gain = Math.min(6, 0.85 / peak);
    for (let i = 0; i < len; i++) out[i] *= gain;
    // tiny fades so there are no clicks
    const fade = Math.min(400, len >> 3);
    for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[len - 1 - i] *= i / fade; }

    this._set('speak');
    const p = ctx.createBufferSource();
    p.buffer = buf;
    p.playbackRate.value = PITCH;
    p.connect(this.analyser);
    if (!soundOn()) this.analyser.disconnect(); // still animate the mouth when muted
    p.onended = () => {
      if (!soundOn()) { try { this.analyser.connect(masterOut()); } catch (e) { /* ignore */ } }
      this.player = null;
      if (this.state === 'off') return;
      this._set('cool');
      setTimeout(() => { if (this.state === 'cool') this._set('listen'); }, 450);
    };
    this.player = p;
    p.start();
    this.onRepeat(len / this.sr / PITCH);
  }

  // 0..1 loudness of what Mochi is saying right now (drives the mouth)
  mouthLevel() {
    if (this.state !== 'speak' || !this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this._tdata);
    let s = 0;
    for (let i = 0; i < this._tdata.length; i++) s += this._tdata[i] * this._tdata[i];
    return Math.min(1, Math.sqrt(s / this._tdata.length) * 5);
  }
}

// Typed speech fallback: the device's own text-to-speech, pitched up.
export const ttsSupported = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
export function speak(text, { onStart, onEnd } = {}) {
  if (!ttsSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 2;
    u.rate = 1.15;
    u.volume = soundOn() ? 1 : 0;
    u.onstart = () => onStart && onStart();
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
