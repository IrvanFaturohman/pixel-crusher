// Web Audio synth SFX: oscillators + filtered noise with fast envelopes into a
// master gain → compressor. Voice limiting, per-sound cooldowns and ducking
// keep floods of hits from turning into noise or clipping.
import { CONFIG } from './config.js';
import { state } from './state.js';

const V = CONFIG.sfx;
const rand = (a, b) => a + Math.random() * (b - a);

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.voices = 0;
    this.last = Object.create(null);
    this.muted = state.muted;
    this.density = 0; // recent-hit density used for ducking
    this.densityT = 0;
  }

  // Must be called from a user gesture (first tap / key press).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 18;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : V.master;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : V.master, this.ctx.currentTime, 0.02);
  }

  // Cooldown + voice budget gate. Priority sounds get a few extra voices.
  ready(name, cooldown, priority = false) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return false;
    const now = ctx.currentTime;
    if (now - (this.last[name] ?? -9) < cooldown) return false;
    if (this.voices >= V.maxVoices + (priority ? 4 : 0)) return false;
    this.last[name] = now;
    return true;
  }

  // Volume factor that drops as hits pile up.
  duck() {
    const now = this.ctx.currentTime;
    this.density = this.density * Math.exp(-(now - this.densityT) / 0.3) + 1;
    this.densityT = now;
    return 1 / (1 + V.duckPerHit * (this.density - 1));
  }

  track(src, gainNode) {
    this.voices++;
    src.onended = () => {
      this.voices--;
      gainNode.disconnect();
    };
  }

  tone(type, f0, f1, dur, gain, delay = 0, attack = 0.004, filterType = null, filterFreq = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (filterType) {
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = filterFreq;
      osc.connect(f);
      f.connect(g);
    } else osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    this.track(osc, g);
  }

  noise(dur, gain, filterType, f0, f1 = f0, q = 1, delay = 0, attack = 0.003) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.03);
    this.track(src, g);
  }

  // ── Game sounds ───────────────────────────────────────────────────────
  release() {
    if (!this.ready('release', 0.05)) return;
    this.tone('sine', 640, 230, 0.07, V.release);
  }

  // Woody "tok": higher value → lower, heavier thump (±5% pitch).
  hit(value) {
    if (!this.ready('hit', 0.028)) return;
    const d = this.duck();
    const level = Math.log2(value);
    const f = Math.max(70, 440 * Math.pow(0.885, level - 1)) * rand(0.95, 1.05);
    this.tone('triangle', f, f * 0.55, 0.1 + level * 0.008, V.hit * d);
    this.noise(0.018, V.hit * 0.35 * d, 'highpass', 2600);
    if (level >= 6) this.tone('sine', f * 0.5, f * 0.28, 0.18, V.hit * 0.9 * d);
  }

  // Crunchy "crack": rises one semitone per combo step (capped at +12).
  break(combo) {
    if (!this.ready('break', 0.03)) return;
    const d = this.duck();
    const k = Math.pow(2, Math.min(Math.max(combo - 1, 0), 12) / 12);
    this.noise(0.11, V.break * d, 'bandpass', 1700 * k, 650 * k, 1.1);
    this.tone('triangle', 720 * k, 470 * k, 0.07, V.break * 0.55 * d);
  }

  coin() {
    if (!this.ready('coin', 0.125)) return;
    this.tone('sine', 1568, 1568, 0.2, V.coin);
    this.tone('sine', 2637, 2637, 0.24, V.coin * 0.6, 0.035);
  }

  inlet() {
    if (!this.ready('inlet', 0.09)) return;
    this.tone('sine', 165, 85, 0.09, V.inlet);
  }

  floor() {
    if (!this.ready('floor', 0.08)) return;
    this.tone('sine', 230, 120, 0.07, V.inlet * 0.8);
    this.noise(0.04, V.inlet * 0.5, 'lowpass', 700);
  }

  addBall() {
    if (!this.ready('add', 0.04, true)) return;
    this.tone('sine', 280, 820, 0.16, V.add, 0, 0.01);
    this.tone('sine', 430, 1320, 0.14, V.add * 0.8, 0.075, 0.01);
  }

  mergeCharge() {
    if (!this.ready('charge', 0.05, true)) return;
    this.tone('sine', 480, 900, 0.12, V.merge * 0.45);
  }

  mergeWhoosh() {
    if (!this.ready('whoosh', 0.05, true)) return;
    this.noise(0.26, V.merge * 0.9, 'bandpass', 380, 3400, 2.2, 0, 0.12);
  }

  // Bright two-note chime; pitch climbs with the new value.
  mergeChime(value) {
    if (!this.ready('chime', 0.05, true)) return;
    const level = Math.min(Math.log2(value), 16);
    const base = 523.25 * Math.pow(2, ((level - 2) * 2) / 12);
    this.tone('sine', base, base, 0.3, V.merge);
    this.tone('sine', base * 1.5, base * 1.5, 0.42, V.merge, 0.075);
    this.tone('triangle', base * 2, base * 2, 0.26, V.merge * 0.3, 0.075);
  }

  purchase() {
    if (!this.ready('purchase', 0.05, true)) return;
    const notes = [1046.5, 1318.5, 1568];
    for (let i = 0; i < 3; i++) this.tone('square', notes[i], notes[i], 0.12, V.purchase, i * 0.055, 0.004, 'lowpass', 3200);
    this.noise(0.14, V.purchase * 0.35, 'highpass', 6500, 6500, 0.7, 0.12);
  }

  denied() {
    if (!this.ready('denied', 0.12, true)) return;
    this.tone('square', 132, 104, 0.17, V.denied, 0, 0.004, 'lowpass', 480);
  }

  comboMilestone() {
    if (!this.ready('milestone', 0.2, true)) return;
    const notes = [1046.5, 1318.5, 1568, 2093, 2637];
    for (let i = 0; i < notes.length; i++) this.tone('sine', notes[i], notes[i], 0.16, V.combo, i * 0.045);
    this.noise(0.3, V.combo * 0.3, 'highpass', 7000, 7000, 0.7, 0.05, 0.05);
  }

  complete() {
    if (!this.ready('complete', 0.5, true)) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) this.tone('triangle', notes[i], notes[i], 0.2, V.complete, i * 0.09);
    for (const f of [1046.5, 1318.5, 1568]) this.tone('triangle', f, f, 0.8, V.complete * 0.55, 0.38, 0.01);
    this.noise(0.9, V.complete * 0.3, 'highpass', 5000, 9000, 0.7, 0.3, 0.2);
  }

  // Soft ticks while a new picture builds in; frac 0 (bottom row) → 1 (top).
  buildTick(frac) {
    if (!this.ready('build', 0.035)) return;
    const f = 520 * Math.pow(2, frac);
    this.tone('sine', f, f * 1.02, 0.05, V.build);
  }
}
