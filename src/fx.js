// Juice: easing helpers, pooled particle systems (instanced debris + glow
// sprites), HTML popups / flying coins / combo / banner, and a sim-time
// scheduler. Everything is pooled — nothing is allocated per frame.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './state.js';
import { formatMoney } from './economy.js';
import { rampY } from './physics.js';

// ─── Easing ──────────────────────────────────────────────────────────────
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export function easeOutBack(t, s = 1.70158) {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}
export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}
// 0 → 1.3 → 1.0 overshoot used for "pop in" moments.
export function popScale(t) {
  if (t < 0.4) return 1.3 * easeOutQuad(t / 0.4);
  return 1.3 - 0.3 * easeOutElastic((t - 0.4) / 0.6);
}

const rand = (a, b) => a + Math.random() * (b - a);
const CONFETTI = ['#ff3d6e', '#ffd23f', '#2f8bff', '#2fc350', '#a257ff', '#ff9412', '#ffffff', '#0fb5a4'].map(
  (h) => new THREE.Color(h),
);
const _c = new THREE.Color();
const _p = { x: 0, y: 0 };

// Write T·R(xyz euler)·S into a matrix array at offset o (column-major).
function composeEuler(a, o, x, y, z, rx, ry, rz, sx, sy, sz) {
  const ca = Math.cos(rx), sa = Math.sin(rx);
  const cb = Math.cos(ry), sb = Math.sin(ry);
  const cc = Math.cos(rz), sc = Math.sin(rz);
  const ae = ca * cc, af = ca * sc, be = sa * cc, bf = sa * sc;
  a[o] = cb * cc * sx;
  a[o + 1] = (af + be * sb) * sx;
  a[o + 2] = (bf - ae * sb) * sx;
  a[o + 3] = 0;
  a[o + 4] = -cb * sc * sy;
  a[o + 5] = (ae - bf * sb) * sy;
  a[o + 6] = (be + af * sb) * sy;
  a[o + 7] = 0;
  a[o + 8] = sb * sz;
  a[o + 9] = -sa * cb * sz;
  a[o + 10] = ca * cb * sz;
  a[o + 11] = 0;
  a[o + 12] = x;
  a[o + 13] = y;
  a[o + 14] = z;
  a[o + 15] = 1;
}

// ─── Lit debris: chips, break debris, confetti (one InstancedMesh) ─────────
const DF = 22; // floats per debris particle
class Debris {
  constructor(scene, max) {
    this.max = max;
    this.count = 0;
    this.d = new Float32Array(max * DF);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, envMapIntensity: 0.6 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  // Fields: 0-2 pos, 3-5 vel, 6-8 rot, 9-11 spin, 12-14 size, 15 life, 16 maxLife,
  // 17 floor, 18 bounced, 19 gravity, 20 drag, 21 flutter
  spawn(x, y, z, vx, vy, vz, sx, sy, sz, color, life, floor, grav, drag, flutter) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const d = this.d;
    const o = i * DF;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = rand(0, 6.28); d[o + 7] = rand(0, 6.28); d[o + 8] = rand(0, 6.28);
    d[o + 9] = rand(-14, 14); d[o + 10] = rand(-14, 14); d[o + 11] = rand(-14, 14);
    d[o + 12] = sx; d[o + 13] = sy; d[o + 14] = sz;
    d[o + 15] = life; d[o + 16] = life;
    d[o + 17] = floor; d[o + 18] = 0;
    d[o + 19] = grav; d[o + 20] = drag; d[o + 21] = flutter;
    const c = this.mesh.instanceColor.array;
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }

  update(dt) {
    const d = this.d;
    const m = this.mesh.instanceMatrix.array;
    const col = this.mesh.instanceColor.array;
    let i = 0;
    while (i < this.count) {
      const o = i * DF;
      d[o + 15] -= dt;
      if (d[o + 15] <= 0) {
        const j = --this.count;
        if (i !== j) {
          d.copyWithin(o, j * DF, j * DF + DF);
          col[i * 3] = col[j * 3];
          col[i * 3 + 1] = col[j * 3 + 1];
          col[i * 3 + 2] = col[j * 3 + 2];
        }
        continue;
      }
      const drag = Math.max(0, 1 - d[o + 20] * dt);
      d[o + 3] *= drag;
      d[o + 5] *= drag;
      d[o + 4] = d[o + 4] * drag - d[o + 19] * dt;
      if (d[o + 21] > 0) d[o + 3] += Math.sin(d[o + 15] * 7 + i) * d[o + 21] * dt;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      const half = d[o + 13] * 0.5;
      if (d[o + 1] - half < d[o + 17]) {
        d[o + 1] = d[o + 17] + half;
        if (d[o + 18] < 1 && d[o + 4] < -1) {
          d[o + 4] = -d[o + 4] * 0.38; // bounce once
          d[o + 3] *= 0.7;
          d[o + 18] = 1;
        } else {
          d[o + 4] = 0;
          d[o + 3] *= 0.9;
          d[o + 9] *= 0.9;
          d[o + 10] *= 0.9;
          d[o + 11] *= 0.9;
        }
      }
      d[o + 6] += d[o + 9] * dt;
      d[o + 7] += d[o + 10] * dt;
      d[o + 8] += d[o + 11] * dt;
      const k = Math.min(1, d[o + 15] / (d[o + 16] * 0.5)); // shrink over the last half
      composeEuler(m, i * 16, d[o], d[o + 1], d[o + 2], d[o + 6], d[o + 7], d[o + 8], d[o + 12] * k, d[o + 13] * k, d[o + 14] * k);
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// ─── Glow sprites: trails, sparkles, rings, flashes (custom shader) ───────
function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  // 0: soft dot
  let gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  // 1: ring
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  g.shadowColor = '#fff';
  g.shadowBlur = 5;
  g.beginPath();
  g.arc(96, 32, 25, 0, Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
  // 2: four-point sparkle
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(160, 3);
  g.quadraticCurveTo(164, 28, 189, 32);
  g.quadraticCurveTo(164, 36, 160, 61);
  g.quadraticCurveTo(156, 36, 131, 32);
  g.quadraticCurveTo(156, 28, 160, 3);
  g.fill();
  // 3: hard disc
  g.beginPath();
  g.arc(224, 32, 29, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

const GLOW_VS = /* glsl */ `
attribute vec4 aColor;
attribute float aFrame;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vColor = aColor;
  vUv = vec2((uv.x + aFrame) * 0.25, uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const GLOW_FS = /* glsl */ `
uniform sampler2D map;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

const GF = 21; // floats per glow particle
class Glow {
  constructor(scene, max) {
    this.max = max;
    this.count = 0;
    this.d = new Float32Array(max * GF);
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aFrame', this.aFrame);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeAtlas() } },
      vertexShader: GLOW_VS,
      fragmentShader: GLOW_FS,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  // Fields: 0-2 pos, 3-5 vel, 6 size0, 7 size1, 8 rot, 9 spin, 10-12 rgb,
  // 13 alpha0, 14 alpha1, 15 life, 16 maxLife, 17 frame, 18 gravity, 19 drag, 20 grow ease
  spawn(x, y, z, vx, vy, vz, s0, s1, color, a0, a1, life, frame, grav = 0, drag = 0, spin = 0) {
    if (this.count >= this.max) return;
    const d = this.d;
    const o = this.count++ * GF;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = s0; d[o + 7] = s1;
    d[o + 8] = rand(0, 6.28); d[o + 9] = spin;
    d[o + 10] = color.r; d[o + 11] = color.g; d[o + 12] = color.b;
    d[o + 13] = a0; d[o + 14] = a1;
    d[o + 15] = life; d[o + 16] = life;
    d[o + 17] = frame; d[o + 18] = grav; d[o + 19] = drag;
  }

  update(dt) {
    const d = this.d;
    const m = this.mesh.instanceMatrix.array;
    const ac = this.aColor.array;
    const af = this.aFrame.array;
    let i = 0;
    while (i < this.count) {
      const o = i * GF;
      d[o + 15] -= dt;
      if (d[o + 15] <= 0) {
        const j = --this.count;
        if (i !== j) d.copyWithin(o, j * GF, j * GF + GF);
        continue;
      }
      const drag = Math.max(0, 1 - d[o + 19] * dt);
      d[o + 3] *= drag;
      d[o + 4] = d[o + 4] * drag - d[o + 18] * dt;
      d[o + 5] *= drag;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      d[o + 8] += d[o + 9] * dt;
      const t = 1 - d[o + 15] / d[o + 16];
      const s = d[o + 6] + (d[o + 7] - d[o + 6]) * easeOutQuad(t);
      const cs = Math.cos(d[o + 8]) * s;
      const sn = Math.sin(d[o + 8]) * s;
      const mo = i * 16;
      m[mo] = cs; m[mo + 1] = sn; m[mo + 2] = 0; m[mo + 3] = 0;
      m[mo + 4] = -sn; m[mo + 5] = cs; m[mo + 6] = 0; m[mo + 7] = 0;
      m[mo + 8] = 0; m[mo + 9] = 0; m[mo + 10] = 1; m[mo + 11] = 0;
      m[mo + 12] = d[o]; m[mo + 13] = d[o + 1]; m[mo + 14] = d[o + 2]; m[mo + 15] = 1;
      ac[i * 4] = d[o + 10];
      ac[i * 4 + 1] = d[o + 11];
      ac[i * 4 + 2] = d[o + 12];
      ac[i * 4 + 3] = d[o + 13] + (d[o + 14] - d[o + 13]) * t;
      af[i] = d[o + 17];
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aFrame.needsUpdate = true;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const SPARK = new THREE.Color('#fff4b0');
const DUST = new THREE.Color('#ffffff');

// ─── FX facade ────────────────────────────────────────────────────────────
export class FX {
  constructor(scene, layer) {
    this.debris = new Debris(scene, CONFIG.maxDebris);
    this.glow = new Glow(scene, CONFIG.maxGlow);
    this.layer = layer;
    this.timers = []; // { t, fn } — sim-time scheduler (rare events only)
    this.color = new THREE.Color();

    // Popups
    this.popups = [];
    for (let i = 0; i < CONFIG.maxPopups; i++) {
      const el = document.createElement('div');
      el.className = 'popup';
      layer.appendChild(el);
      this.popups.push({ el, active: false, x: 0, y: 0, amount: 0, born: 0, anim: null, text: '' });
    }
    // Flying coins
    this.coins = [];
    for (let i = 0; i < CONFIG.maxCoins; i++) {
      const el = document.createElement('i');
      el.className = 'fly-coin coin-icon';
      layer.appendChild(el);
      this.coins.push({ el, active: false, t: 0, delay: 0, dur: 0, x0: 0, y0: 0, cx: 0, cy: 0, visible: false });
    }
    // Button sparkles
    this.sparks = [];
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('i');
      el.className = 'spark';
      layer.appendChild(el);
      this.sparks.push(el);
    }
    this.sparkIdx = 0;
    this.comboEl = document.getElementById('combo');
    this.comboAnim = null;
    this.comboShown = false;
    this.bannerEl = document.getElementById('banner');
    this.bannerSub = document.getElementById('banner-sub');
  }

  get particleCount() {
    return this.debris.count + this.glow.count;
  }

  // ── Scheduler ────────────────────────────────────────────────────────
  after(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    this.debris.update(dt);
    this.glow.update(dt);
  }

  // ── 3D effects ───────────────────────────────────────────────────────
  // Chips spray out of the hit face (along its normal) in a cone.
  cubeHit(x, y, z, r, g, b, cell, isMain, nx = 0, ny = 1) {
    const c = this.color.setRGB(r, g, b);
    const n = isMain ? 4 + ((Math.random() * 3) | 0) : 2;
    const tx = -ny;
    const ty = nx;
    for (let i = 0; i < n; i++) {
      const s = cell * rand(0.12, 0.2);
      const out = rand(2.6, 5.2);
      const side = rand(-1.8, 1.8);
      this.debris.spawn(
        x + tx * rand(-0.3, 0.3) * cell, y + ty * rand(-0.3, 0.3) * cell, z + cell * 0.6,
        nx * out + tx * side, ny * out + ty * side + 1, rand(0.3, 2.2),
        s, s, s, c, rand(0.32, 0.5), rampY(x), 24, 0.5, 0,
      );
    }
  }

  cubeBreak(x, y, z, r, g, b, cell) {
    const c = this.color.setRGB(r, g, b);
    const n = 6 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const s = cell * rand(0.2, 0.36);
      this.debris.spawn(
        x + rand(-0.3, 0.3) * cell, y + rand(-0.3, 0.3) * cell, z + rand(-0.2, 0.3) * cell,
        rand(-3.2, 3.2), rand(1.2, 6), rand(0.6, 3.6),
        s, s, s, c, CONFIG.debrisLife * rand(0.8, 1.25), rampY(x), 20, 0.4, 0,
      );
    }
    this.glow.spawn(x, y, z + cell * 0.6, 0, 0, 0, cell * 0.5, cell * 2.8, WHITE, 0.95, 0, 0.3, 1);
    this.glow.spawn(x, y, z + cell * 0.6, 0, 0, 0, cell * 1.4, cell * 2.2, WHITE, 0.6, 0, 0.12, 0);
  }

  bigShatter(x, y, z, cell, color) {
    for (let i = 0; i < 28; i++) {
      const s = cell * rand(0.25, 0.45);
      this.debris.spawn(
        x, y, z,
        rand(-6, 6), rand(3, 10), rand(1, 5),
        s, s, s, color, rand(0.8, 1.2), rampY(x), 20, 0.3, 0,
      );
    }
    this.glow.spawn(x, y, z + 0.6, 0, 0, 0, 0.4, 7, WHITE, 1, 0, 0.55, 1);
    this.glow.spawn(x, y, z + 0.6, 0, 0, 0, 0.3, 4.5, SPARK, 0.9, 0, 0.4, 1);
    this.glow.spawn(x, y, z + 0.6, 0, 0, 0, 2, 3.5, WHITE, 0.85, 0, 0.18, 0);
    for (let i = 0; i < 14; i++) {
      const a = rand(0, 6.28);
      const sp = rand(3, 7);
      this.glow.spawn(x, y, z + 0.7, Math.cos(a) * sp, Math.sin(a) * sp, 0, 0.45, 0, SPARK, 1, 0.6, rand(0.4, 0.7), 2, 0, 2.5, rand(-6, 6));
    }
  }

  confetti(n) {
    for (let i = 0; i < n; i++) {
      const c = CONFETTI[(Math.random() * CONFETTI.length) | 0];
      const fromTop = i % 2 === 0;
      this.debris.spawn(
        fromTop ? rand(-4.8, 4.8) : rand(-1.5, 3),
        fromTop ? rand(7, 9.5) : rand(-2, 1),
        rand(1.4, 2.4),
        rand(-2, 2),
        fromTop ? rand(-2, 0) : rand(7, 12),
        rand(-0.5, 0.5),
        0.26, 0.14, 0.02, c, rand(2.2, 3.4), -1e9, fromTop ? 3.5 : 9, 1.6, 6,
      );
    }
  }

  // Dropper release puff.
  puff(x, y, z) {
    for (let i = 0; i < 5; i++) {
      this.glow.spawn(x + rand(-0.15, 0.15), y, z + 0.4, rand(-1.4, 1.4), rand(-1.8, -0.4), 0, 0.22, rand(0.5, 0.7), WHITE, 0.55, 0, rand(0.22, 0.32), 0, 0, 3);
    }
  }

  floorPuff(x, y, z) {
    for (let i = 0; i < 4; i++) {
      this.glow.spawn(x + rand(-0.2, 0.2), y + 0.1, z + 0.3, rand(-1.6, 1.6), rand(0.2, 1), 0, 0.2, 0.55, DUST, 0.5, 0, 0.3, 0, 0, 3);
    }
  }

  trail(x, y, z, color, radius, strong) {
    if (strong) {
      this.glow.spawn(x, y, z, 0, 0, 0, radius * 2.2, radius * 0.5, color, 0.7, 0, 0.36, 0);
      if (Math.random() < 0.4) {
        this.glow.spawn(
          x + rand(-radius, radius), y + rand(-radius, radius), z + radius,
          rand(-0.8, 0.8), rand(-0.3, 0.8), 0, 0.3, 0, SPARK, 1, 0.7, rand(0.3, 0.5), 2, 1.5, 0, rand(-5, 5),
        );
      }
    } else {
      this.glow.spawn(x, y, z, 0, 0, 0, radius * 1.7, radius * 0.4, color, 0.5, 0, 0.22, 0);
    }
  }

  mergePop(x, y, z, color, radius) {
    const zf = z + radius + 0.1;
    this.glow.spawn(x, y, zf, 0, 0, 0, radius * 1.6, radius * 6.5, WHITE, 1, 0, 0.36, 1);
    this.glow.spawn(x, y, zf, 0, 0, 0, radius * 1.2, radius * 4.5, color, 1, 0, 0.3, 1);
    this.glow.spawn(x, y, zf, 0, 0, 0, radius * 3.2, radius * 4, WHITE, 0.9, 0, 0.13, 3);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rand(-0.2, 0.2);
      const sp = rand(3, 6);
      const star = i % 3 === 0;
      this.glow.spawn(
        x, y, zf, Math.cos(a) * sp, Math.sin(a) * sp, 0,
        star ? 0.36 : 0.22, 0, star ? SPARK : color, 1, 0.5, rand(0.3, 0.45), star ? 2 : 3, 2, 5, rand(-6, 6),
      );
    }
  }

  // ── HTML overlay effects ─────────────────────────────────────────────
  project(x, y, z) {
    return G.scene.project(x, y, z, _p);
  }

  showPopup(p, text, x, y, cls, scale) {
    p.el.className = 'popup ' + cls;
    if (p.text !== text) {
      p.el.textContent = text;
      p.text = text;
    }
    if (p.anim) p.anim.cancel();
    const w = G.scene.view.width;
    const d1 = w * 0.02;
    const d2 = w * 0.035;
    const d3 = w * 0.13;
    p.anim = p.el.animate(
      [
        { transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(${0.3 * scale})`, opacity: 0 },
        { transform: `translate(${x}px,${y - d1}px) translate(-50%,-50%) scale(${1.28 * scale})`, opacity: 1, offset: 0.14 },
        { transform: `translate(${x}px,${y - d2}px) translate(-50%,-50%) scale(${scale})`, opacity: 1, offset: 0.34 },
        { transform: `translate(${x}px,${y - d3}px) translate(-50%,-50%) scale(${0.9 * scale})`, opacity: 0 },
      ],
      { duration: 950, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    p.anim.onfinish = () => {
      p.active = false;
      p.anim = null;
    };
  }

  takePopup() {
    let oldest = null;
    for (const p of this.popups) {
      if (!p.active) return p;
      if (!oldest || p.born < oldest.born) oldest = p;
    }
    return oldest;
  }

  // "+$X" — hits close in space and time merge into one bigger popup.
  moneyPopup(amount, x, y, z) {
    const s = this.project(x, y, z);
    const now = G.realTime;
    const bd = CONFIG.popupBatchDist * (G.scene.view.width / 400);
    for (const p of this.popups) {
      if (!p.active || p.kind !== 'money') continue;
      if (now - p.born < CONFIG.popupBatchTime && Math.abs(p.x - s.x) < bd && Math.abs(p.y - s.y) < bd) {
        p.amount += amount;
        this.showPopup(p, '+$' + formatMoney(p.amount), p.x, p.y, 'money', this.popupScale(p.amount));
        return;
      }
    }
    const p = this.takePopup();
    p.active = true;
    p.kind = 'money';
    p.amount = amount;
    p.born = now;
    p.x = s.x;
    p.y = s.y;
    this.showPopup(p, '+$' + formatMoney(amount), s.x, s.y, 'money', this.popupScale(amount));
  }

  popupScale(amount) {
    const rate = Math.max(1, G.economy.incomePerSecond);
    return 0.85 + Math.min(0.8, Math.max(0, Math.log10(1 + amount / rate * 10) * 0.28));
  }

  textPopup(text, x, y, z, cls = '') {
    const s = this.project(x, y, z);
    const p = this.takePopup();
    p.active = true;
    p.kind = 'text';
    p.born = G.realTime;
    p.x = s.x;
    p.y = s.y;
    this.showPopup(p, text, s.x, s.y, cls, 1);
  }

  bigPopup(text, px, py) {
    const p = this.takePopup();
    p.active = true;
    p.kind = 'text';
    p.born = G.realTime;
    this.showPopup(p, text, px, py, 'big', 1);
  }

  // Coin from a world point to the money counter.
  coinFromWorld(x, y, z) {
    const s = this.project(x, y, z);
    this.flyCoin(s.x, s.y, 0);
  }

  flyCoin(x, y, delay) {
    let c = null;
    for (const k of this.coins) {
      if (!k.active) {
        c = k;
        break;
      }
    }
    if (!c) return;
    const tgt = G.ui.coinTarget;
    c.active = true;
    c.t = 0;
    c.delay = delay;
    c.dur = rand(0.55, 0.8);
    c.x0 = x;
    c.y0 = y;
    const w = G.scene.view.width;
    c.cx = x + rand(-0.25, 0.25) * w;
    c.cy = Math.min(y, tgt.y) - rand(0.02, 0.18) * w + (y - tgt.y) * 0.25;
    c.visible = false;
  }

  coinShower(n, x, y) {
    const w = G.scene.view.width;
    for (let i = 0; i < n; i++) this.flyCoin(x + rand(-0.12, 0.12) * w, y + rand(-0.06, 0.06) * w, i * 0.045);
  }

  // Button purchase sparkles (screen space).
  buttonSparkles(btn) {
    const a = G.ui.app.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2 - a.left;
    const cy = r.top + r.height * 0.4 - a.top;
    for (let i = 0; i < 9; i++) {
      const el = this.sparks[this.sparkIdx];
      this.sparkIdx = (this.sparkIdx + 1) % this.sparks.length;
      const ang = rand(-Math.PI, 0) + rand(-0.3, 0.3);
      const dist = rand(0.35, 0.7) * r.width;
      const tx = cx + Math.cos(ang) * dist;
      const ty = cy + Math.sin(ang) * dist;
      const s = rand(0.7, 1.4);
      el.animate(
        [
          { transform: `translate(${cx}px,${cy}px) scale(0.2) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${tx}px,${ty}px) scale(${s}) rotate(90deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${tx}px,${ty + 10}px) scale(0) rotate(160deg)`, opacity: 0 },
        ],
        { duration: rand(450, 650), easing: 'cubic-bezier(.2,.8,.3,1)' },
      );
    }
  }

  // Combo counter near the top of the picture: pops + shakes on each step.
  combo(n) {
    const grid = G.grid;
    let top = 0;
    for (let c = 0; c < grid.cols; c++) if (grid.top[c] >= 0) top = Math.max(top, grid.rows - grid.top[c]);
    const wy = grid.y0 + Math.max(top, 2) * grid.cell + 0.9;
    const s = this.project(grid.x0 + grid.cols * grid.cell * 0.78, wy, 1, _p);
    const el = this.comboEl;
    el.innerHTML = `x${n}<small>COMBO</small>`;
    if (this.comboAnim) this.comboAnim.cancel();
    const big = 1 + Math.min(0.6, n / 60);
    const rot = rand(-10, 10);
    const tf = (sc, dx = 0, r = rot) => `translate(${s.x + dx}px,${s.y}px) translate(-50%,-50%) rotate(${r}deg) scale(${sc * big})`;
    this.comboAnim = el.animate(
      [
        { transform: tf(0.5), opacity: 1 },
        { transform: tf(1.35, -6, rot - 6), opacity: 1, offset: 0.2 },
        { transform: tf(1.05, 6, rot + 5), opacity: 1, offset: 0.4 },
        { transform: tf(1, -3), opacity: 1, offset: 0.6 },
        { transform: tf(1), opacity: 1 },
      ],
      { duration: 360, easing: 'ease-out', fill: 'forwards' },
    );
    this.comboShown = true;
    this.comboPos = s.x + ',' + s.y;
    this.comboBig = big;
    this.comboRot = rot;
    this.comboX = s.x;
    this.comboY = s.y;
  }

  comboEnd() {
    if (!this.comboShown) return;
    this.comboShown = false;
    if (this.comboAnim) this.comboAnim.cancel();
    const tf = (sc, dy) =>
      `translate(${this.comboX}px,${this.comboY + dy}px) translate(-50%,-50%) rotate(${this.comboRot}deg) scale(${sc * this.comboBig})`;
    this.comboAnim = this.comboEl.animate(
      [
        { transform: tf(1, 0), opacity: 1 },
        { transform: tf(0.7, -20), opacity: 0 },
      ],
      { duration: 380, easing: 'ease-in', fill: 'forwards' },
    );
  }

  banner(sub) {
    this.bannerSub.textContent = sub;
    this.bannerEl.getAnimations().forEach((a) => a.cancel());
    this.bannerEl.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0) rotate(-8deg)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scale(1.22) rotate(3deg)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%,-50%) scale(0.94) rotate(-1deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-50%) scale(1.02) rotate(0deg)', opacity: 1, offset: 0.27 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%,-60%) scale(0.7) rotate(0deg)', opacity: 0 },
      ],
      { duration: 1700, easing: 'ease-out', fill: 'forwards' },
    );
  }

  // Real-time overlay animation (coins).
  updateOverlay(dt) {
    const tgt = G.ui.coinTarget;
    for (const c of this.coins) {
      if (!c.active) continue;
      c.t += dt;
      if (c.t < c.delay) continue;
      if (!c.visible) {
        c.el.style.display = 'block';
        c.visible = true;
      }
      const u = Math.min(1, (c.t - c.delay) / c.dur);
      const e = easeInOutQuad(u);
      const iu = 1 - e;
      const x = iu * iu * c.x0 + 2 * iu * e * c.cx + e * e * tgt.x;
      const y = iu * iu * c.y0 + 2 * iu * e * c.cy + e * e * tgt.y;
      const s = u < 0.15 ? 0.4 + (u / 0.15) * 0.9 : 1.3 - (u - 0.15) * 0.5;
      c.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
      if (u >= 1) {
        c.active = false;
        c.visible = false;
        c.el.style.display = 'none';
        G.ui.bumpMoney();
        G.audio.coin();
      }
    }
  }
}
