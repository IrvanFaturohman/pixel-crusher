// Ball entities: state machine (pipe → dropper → fall → hit → return → pipe),
// merge sequence, and visuals (glossy sphere + cached number sprite).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './state.js';
import * as pipe from './pipe.js';
import { easeOutElastic, easeInCubic, easeOutBack, popScale } from './fx.js';

export const BS = { PIPE: 0, FALL: 1, IMPACT: 2, RETURN: 3, ROLL_AIR: 4, ROLL: 5, SPAWN: 6, ZIP: 7 };

const L = CONFIG.layout;
const LIGHT_TIME = 0.14; // merge: both balls light up
const ZIP_TIME = 0.24; // merge: rear ball zips into the front one
const POP_TIME = 0.4; // new ball overshoot 0 → 1.3 → 1
const SPAWN_HOLD = 0.42; // add ball: time popped out of the inlet
const SPAWN_SLIDE = 0.13; // add ball: slide back into the inlet
const ENTER_TIME = 0.18; // squish recovery after entering the pipe
const BUMP_TIME = 0.13; // queue bump squash
const RECOVER_TIME = 0.42; // elastic recovery after the impact squash
const RAINBOW_LEVEL = Math.round(Math.log2(CONFIG.rainbowFrom));

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export function levelOf(v) {
  return Math.round(Math.log2(v));
}
export function radiusFor(level) {
  return CONFIG.ballBaseRadius * Math.min(1 + CONFIG.ballSizeGrowth * (level - 1), CONFIG.ballSizeCap);
}
function shortNum(v) {
  if (v < 10000) return String(v);
  const units = ['K', 'M', 'B', 'T'];
  let i = -1;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.floor(v)) + units[i];
}

function makeTagTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffcf2e';
  g.strokeStyle = '#9a4f07';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(5, 5, 118, 54, 27);
  g.fill();
  g.stroke();
  g.fillStyle = '#6a3300';
  g.font = '700 38px Fredoka, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('×' + CONFIG.aimBonus, 64, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Ball {
  constructor(sys) {
    this.sys = sys;
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(sys.sphereGeo, sys.material(1));
    this.mesh.castShadow = true;
    this.labelMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
    this.label = new THREE.Sprite(this.labelMat);
    this.label.renderOrder = 1;
    this.tag = new THREE.Sprite(sys.tagMat);
    this.tag.renderOrder = 1;
    this.tag.visible = false;
    this.group.add(this.mesh, this.label, this.tag);
    this.p0 = new THREE.Vector3();
    this.p1 = new THREE.Vector3();
    this.p2 = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.state = BS.PIPE;
    this.dist = 0;
    this.blocked = false;
    this.movedFree = 0;
    this.pipeVel = 0;
    this.vx = 0;
    this.vy = 0;
    this.t = 0;
    this.col = 0;
    this.bonus = 1;
    this.hitEmpty = false;
    this.incoming = 0;
    this.locked = false;
    this.consumed = false;
    this.lit = false;
    this.popT = -1;
    this.bumpT = -1;
    this.recoverT = -1;
    this.enterT = -1;
    this.mergeSquash = 0;
    this.stretch = 1;
    this.trailAcc = 0;
    this.spin = 0;
    this.hide = 1;
  }

  setValue(v) {
    this.value = v;
    this.level = levelOf(v);
    this.logicalLevel = this.level;
    this.radius = radiusFor(this.level);
    this.applyMaterial();
    this.labelMat.map = this.sys.labelTexture(v);
    this.labelMat.needsUpdate = true;
  }

  applyMaterial() {
    this.mesh.material = this.lit ? this.sys.litMaterial(this.level) : this.sys.material(this.level);
  }

  onBump() {
    this.bumpT = 0;
  }
}

export class Balls {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.pool = [];
    this.sphereGeo = new THREE.SphereGeometry(1, 32, 22);
    this.mats = [];
    this.litMats = [];
    this.labelTex = new Map();
    this.rainbow = this.makeMaterial('#ff0000', false);
    this.rainbowLit = this.makeMaterial('#ff0000', true);
    this.tagMat = new THREE.SpriteMaterial({ map: makeTagTexture(), transparent: true, depthWrite: false });
    this.dropTimer = 0;
    this.pendingMerges = 0;
    this.merges = [];
    this.counts = new Int16Array(64);
    this.colorTmp = new THREE.Color();
  }

  // ── Materials / textures (cached per value) ───────────────────────────
  makeMaterial(hex, lit, black = false) {
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: black ? 0.12 : 0.17,
      metalness: black ? 0.55 : 0.05,
      emissive: black ? '#7a5200' : hex,
      emissiveIntensity: lit ? 0.95 : black ? 0.28 : 0.13,
      envMapIntensity: black ? 1.7 : 1.15,
    });
  }
  material(level) {
    if (level >= RAINBOW_LEVEL) return this.rainbow;
    if (!this.mats[level]) {
      const v = 2 ** level;
      this.mats[level] = this.makeMaterial(CONFIG.ballColors[v] || '#888888', false, v === 1024);
    }
    return this.mats[level];
  }
  litMaterial(level) {
    if (level >= RAINBOW_LEVEL) return this.rainbowLit;
    if (!this.litMats[level]) {
      const v = 2 ** level;
      this.litMats[level] = this.makeMaterial(CONFIG.ballColors[v] || '#888888', true, v === 1024);
    }
    return this.litMats[level];
  }
  // Linear RGB used for FX (trails, pops). 1024's trail is gold.
  colorOf(level, out) {
    if (2 ** level === 1024) return out.set('#ffc83a');
    return out.copy(this.material(level).color);
  }

  labelTexture(v) {
    let t = this.labelTex.get(v);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const text = shortNum(v);
    const size = text.length <= 2 ? 70 : text.length === 3 ? 56 : text.length === 4 ? 45 : 40;
    g.font = `700 ${size}px Fredoka, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = size * 0.22;
    g.strokeStyle = 'rgba(12,14,34,0.62)';
    const y = 64 + size * 0.05;
    g.strokeText(text, 64, y);
    g.fillStyle = v === 1024 ? '#ffd24a' : '#ffffff';
    g.fillText(text, 64, y);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.labelTex.set(v, t);
    return t;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  obtain(value) {
    const b = this.pool.pop() || new Ball(this);
    b.reset();
    b.setValue(value);
    b.tag.visible = false;
    this.scene.add(b.group);
    this.list.push(b);
    return b;
  }

  releaseBall(b) {
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
    pipe.removeFromQueue(b);
    this.scene.remove(b.group);
    b.lit = false;
    this.pool.push(b);
  }

  // Place the saved/initial balls in the pipe, front ball first.
  spawnInitial(values) {
    const n = values.length;
    let d = Math.min(pipe.pathLength * 0.6, 0.6 + n * 0.72);
    for (let i = 0; i < n; i++) {
      const b = this.obtain(values[i]);
      b.state = BS.PIPE;
      b.dist = d;
      pipe.queue.push(b);
      d -= b.radius * 2 + 0.12;
    }
  }

  // Add Ball: a new ball pops out of the inlet, then gets sucked in.
  addBall(value = 2) {
    const b = this.obtain(value);
    b.state = BS.SPAWN;
    b.t = 0;
    b.popT = 0;
    const ip = pipe.inletPos;
    b.p0.set(ip.x + 0.7, ip.y + 0.32, ip.z + 0.3);
    b.group.position.copy(b.p0);
    G.fx.textPopup('+1', b.p0.x, b.p0.y + 0.55, b.p0.z, 'plus');
    return b;
  }

  get count() {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if (!this.list[i].consumed) n++;
    return n;
  }

  // ── Merging ───────────────────────────────────────────────────────────
  fillCounts() {
    const counts = this.counts;
    counts.fill(0);
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      if (!b.consumed) counts[b.logicalLevel]++;
    }
    return counts;
  }

  // Is there a pair left once every queued merge has happened?
  canMerge() {
    const counts = this.fillCounts();
    for (let m = 0; m < this.pendingMerges; m++) {
      let lvl = -1;
      for (let l = 1; l < 63; l++) if (counts[l] >= 2) { lvl = l; break; }
      if (lvl < 0) return false;
      counts[lvl] -= 2;
      counts[lvl + 1]++;
    }
    for (let l = 1; l < 63; l++) if (counts[l] >= 2) return true;
    return false;
  }

  requestMerge() {
    this.pendingMerges++;
  }

  // Lowest value with ≥2 balls; merge the closest pair of those that are in
  // the pipe. Returns false (and waits) if the pair isn't in the pipe yet.
  tryStartMerge() {
    const counts = this.fillCounts();
    let lvl = -1;
    for (let l = 1; l < 63; l++) if (counts[l] >= 2) { lvl = l; break; }
    if (lvl < 0) {
      this.pendingMerges = 0;
      return false;
    }
    const q = pipe.queue;
    let prev = null;
    let a = null;
    let b = null;
    let bestGap = Infinity;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c.level !== lvl || c.logicalLevel !== lvl || c.locked || c.consumed || c.state !== BS.PIPE) continue;
      if (prev) {
        // Closest pair wins; avoid the ball sitting in the dropper ring (the
        // ring would hide the pop) unless it's the only option.
        const gap = prev.dist - c.dist + (prev === q[0] ? 1.5 : 0);
        if (gap < bestGap) {
          bestGap = gap;
          a = prev;
          b = c;
        }
      }
      prev = c;
    }
    if (!a) return false;
    a.locked = true;
    a.logicalLevel = lvl + 1;
    b.locked = true;
    b.consumed = true;
    a.lit = b.lit = true;
    a.applyMaterial();
    b.applyMaterial();
    this.merges.push({ a, b, t: 0, zipping: false, from: 0 });
    G.audio.mergeCharge();
    return true;
  }

  updateMerge(m, idx, dt) {
    m.t += dt;
    const a = m.a;
    const b = m.b;
    if (!m.zipping && m.t >= LIGHT_TIME) {
      m.zipping = true;
      pipe.removeFromQueue(b);
      b.state = BS.ZIP;
      m.from = b.dist;
      G.audio.mergeWhoosh();
    }
    if (!m.zipping) return;
    const u = Math.min(1, (m.t - LIGHT_TIME) / ZIP_TIME);
    b.dist = m.from + (a.dist - m.from) * easeInCubic(u);
    pipe.pointAt(b.dist, b.group.position);
    b.group.position.z += Math.sin(u * Math.PI) * b.radius * 1.7; // pass in front of other balls
    const k = u > 0.7 ? (u - 0.7) / 0.3 : 0;
    a.mergeSquash = k;
    b.mergeSquash = k;
    if (u >= 1) this.finishMerge(m, idx);
  }

  finishMerge(m, idx) {
    this.merges.splice(idx, 1);
    const a = m.a;
    this.releaseBall(m.b);
    a.locked = false;
    a.lit = false;
    a.mergeSquash = 0;
    a.setValue(a.value * 2);
    a.popT = 0;
    const p = a.group.position;
    this.colorOf(a.level, this.colorTmp);
    G.fx.mergePop(p.x, p.y, p.z, this.colorTmp, a.radius);
    G.audio.mergeChime(a.value);
    if (a.value >= 128) G.scene.addTrauma(CONFIG.shake.merge128);
  }

  // Values that should be saved: pending merges are applied virtually.
  saveValues() {
    const counts = this.fillCounts();
    for (let m = 0; m < this.pendingMerges; m++) {
      let lvl = -1;
      for (let l = 1; l < 63; l++) if (counts[l] >= 2) { lvl = l; break; }
      if (lvl < 0) break;
      counts[lvl] -= 2;
      counts[lvl + 1]++;
    }
    const out = [];
    for (let l = 62; l >= 1; l--) for (let k = 0; k < counts[l]; k++) out.push(2 ** l);
    return out;
  }

  // ── Per-frame update ──────────────────────────────────────────────────
  update(dt) {
    const dropper = G.dropper;
    const hue = (G.time * CONFIG.rainbowSpeed) % 1;
    this.rainbow.color.setHSL(hue, 0.85, 0.55, THREE.SRGBColorSpace);
    this.rainbow.emissive.copy(this.rainbow.color);
    this.rainbowLit.color.copy(this.rainbow.color);
    this.rainbowLit.emissive.copy(this.rainbow.color);

    pipe.updateQueue(dt, dropper.headDist);

    // Dropper release.
    this.dropTimer = Math.min(this.dropTimer + dt, CONFIG.dropInterval);
    const head = pipe.queue[0];
    if (
      head &&
      !head.locked &&
      head.state === BS.PIPE &&
      this.dropTimer >= CONFIG.dropInterval &&
      head.dist >= dropper.headDist - 0.03 &&
      dropper.canRelease()
    ) {
      this.release(head);
      this.dropTimer = 0;
    }

    if (this.pendingMerges > 0 && this.tryStartMerge()) this.pendingMerges--;
    for (let i = this.merges.length - 1; i >= 0; i--) this.updateMerge(this.merges[i], i, dt);

    for (let i = 0; i < this.list.length; i++) this.updateBall(this.list[i], dt);
  }

  playZ(b) {
    return Math.max(G.grid.cell * 0.5, b.radius * 0.8);
  }
  frontZ(b) {
    return G.grid.cell + b.radius + 0.12;
  }

  release(b) {
    pipe.queue.shift();
    const grid = G.grid;
    b.state = BS.FALL;
    b.vy = CONFIG.fallStartSpeed;
    b.col = Math.min(grid.cols - 1, Math.max(0, G.dropper.targetCol));
    b.bonus = G.dropper.isManual() ? CONFIG.aimBonus : 1;
    b.incoming = b.value * b.bonus;
    grid.incoming[b.col] += b.incoming;
    b.trailAcc = 0;
    b.bumpT = -1;
    G.dropper.onRelease(b);
    G.audio.release();
  }

  impact(b) {
    const grid = G.grid;
    const p = b.group.position;
    b.state = BS.IMPACT;
    b.t = 0;
    grid.incoming[b.col] = Math.max(0, grid.incoming[b.col] - b.incoming);
    b.incoming = 0;
    b.hitEmpty = grid.isColumnEmpty(b.col);
    b.tag.visible = false;
    if (!b.hitEmpty) {
      G.game.hitValue = b.value;
      const applied = grid.hit(b.col, b.value * b.bonus, b.value);
      if (applied > 0) G.economy.earnFromHit(applied, p.x, p.y + b.radius, p.z);
      G.audio.hit(b.value);
      if (b.value >= 64) {
        G.scene.addTrauma(CONFIG.shake.impact64 + (b.level - 6) * CONFIG.shake.impactPerLevel);
      }
    } else {
      G.audio.floor();
      G.fx.floorPuff(p.x, L.floorY, p.z);
    }
  }

  startArc(b) {
    const p = b.group.position;
    b.p0.copy(p);
    b.p2.copy(pipe.inletPos);
    const dx = Math.abs(p.x - b.p2.x);
    b.p1.set(
      (p.x + b.p2.x) * 0.5 + (p.x - b.p2.x) * 0.14,
      Math.max(p.y, b.p2.y) + CONFIG.bounceHeight + dx * CONFIG.arcHeightPerDistance,
      this.frontZ(b) * 1.7,
    );
    b.t = 0;
    b.state = BS.RETURN;
    b.recoverT = 0;
  }

  startRollAir(b) {
    b.vx = -(1.3 + Math.random() * 0.9);
    b.vy = 3.4; // up
    b.state = BS.ROLL_AIR;
    b.recoverT = 0;
  }

  enterPipe(b) {
    pipe.enqueue(b);
    b.state = BS.PIPE;
    b.enterT = 0;
    b.bonus = 1;
    b.recoverT = -1;
    b.spin = 0;
    G.audio.inlet();
  }

  trail(b, dt) {
    if (b.value < CONFIG.trailMinValue) return;
    b.trailAcc += dt;
    if (b.trailAcc < CONFIG.trailInterval) return;
    b.trailAcc = 0;
    const p = b.group.position;
    this.colorOf(b.level, this.colorTmp);
    G.fx.trail(p.x, p.y, p.z - b.radius * 0.3, this.colorTmp, b.radius, b.value >= CONFIG.sparkleMinValue);
  }

  updateBall(b, dt) {
    const p = b.group.position;
    const grid = G.grid;
    switch (b.state) {
      case BS.PIPE: {
        pipe.pointAt(b.dist, p);
        b.hide = b.dist < 0 ? Math.max(0, 1 + b.dist / (b.radius * 2)) : 1;
        break;
      }
      case BS.FALL: {
        b.vy += CONFIG.fallGravity * dt;
        p.y -= b.vy * dt;
        const tx = grid.colX(b.col);
        p.x += (tx - p.x) * Math.min(1, dt * 24);
        p.z += (this.playZ(b) - p.z) * Math.min(1, dt * 16);
        b.stretch = 1 + Math.min(CONFIG.maxFallStretch, b.vy * CONFIG.fallStretchPerSpeed);
        const landY = grid.columnTopY(b.col) + b.radius * 0.92;
        if (p.y <= landY) {
          p.y = landY;
          p.x = tx;
          this.impact(b);
        } else this.trail(b, dt);
        break;
      }
      case BS.IMPACT: {
        b.t += dt;
        if (b.t >= CONFIG.impactSquash.time) {
          if (CONFIG.returnMode === 'roll') this.startRollAir(b);
          else this.startArc(b);
        }
        break;
      }
      case BS.RETURN: {
        b.t += dt;
        const u = Math.min(1, b.t / CONFIG.returnDuration);
        const iu = 1 - u;
        p.x = iu * iu * b.p0.x + 2 * iu * u * b.p1.x + u * u * b.p2.x;
        p.y = iu * iu * b.p0.y + 2 * iu * u * b.p1.y + u * u * b.p2.y;
        p.z = iu * iu * b.p0.z + 2 * iu * u * b.p1.z + u * u * b.p2.z;
        if (u >= 1) this.enterPipe(b);
        else this.trail(b, dt);
        break;
      }
      case BS.ROLL_AIR: {
        b.vy -= CONFIG.fallGravity * dt;
        p.x += b.vx * dt;
        p.y += b.vy * dt;
        p.z += (this.frontZ(b) - p.z) * Math.min(1, dt * 10);
        const floor = L.floorY + b.radius;
        if (p.y <= floor && b.vy < 0) {
          p.y = floor;
          b.vx = Math.min(b.vx, -2);
          b.state = BS.ROLL;
          b.bumpT = 0;
        }
        this.trail(b, dt);
        break;
      }
      case BS.ROLL: {
        b.vx = Math.max(b.vx - CONFIG.rollAccel * dt, -CONFIG.rollMaxSpeed);
        p.x += b.vx * dt;
        b.spin -= (b.vx * dt) / b.radius;
        const ip = pipe.inletPos;
        const k = Math.min(1, Math.max(0, 1 - (p.x - ip.x) / 1.3));
        p.y = L.floorY + b.radius + (ip.y - L.floorY - b.radius) * k;
        p.z = this.frontZ(b) + (ip.z - this.frontZ(b)) * k;
        if (p.x <= ip.x + 0.02) {
          p.copy(ip);
          this.enterPipe(b);
        } else this.trail(b, dt);
        break;
      }
      case BS.SPAWN: {
        b.t += dt;
        if (b.t > SPAWN_HOLD) {
          const u = Math.min(1, (b.t - SPAWN_HOLD) / SPAWN_SLIDE);
          p.lerpVectors(b.p0, pipe.inletPos, u * u);
          if (u >= 1) this.enterPipe(b);
        } else {
          p.copy(b.p0);
          p.y += Math.sin((b.t / SPAWN_HOLD) * Math.PI) * 0.12;
        }
        break;
      }
      case BS.ZIP:
        break; // positioned by updateMerge
    }
    this.updateVisual(b, dt);
  }

  updateVisual(b, dt) {
    const r = b.radius;
    let s = b.state === BS.PIPE ? b.hide : 1;
    let sx = 1;
    let sy = 1;
    let angle = 0;
    let squashLabel = false;

    if (b.popT >= 0) {
      b.popT += dt;
      const p = b.popT / POP_TIME;
      if (p >= 1) b.popT = -1;
      else s *= popScale(p);
    }
    if (b.enterT >= 0) {
      b.enterT += dt;
      const p = b.enterT / ENTER_TIME;
      if (p >= 1) b.enterT = -1;
      else s *= CONFIG.inletSquish + (1 - CONFIG.inletSquish) * easeOutBack(p);
    }
    if (b.lit) s *= 1 + 0.08 * Math.sin(G.time * 48);

    switch (b.state) {
      case BS.FALL:
        sy = b.stretch;
        sx = 1 / Math.sqrt(sy);
        squashLabel = true;
        break;
      case BS.IMPACT: {
        const I = CONFIG.impactSquash;
        const k = b.hitEmpty ? 0.5 : 1;
        sx = 1 + (I.x - 1) * k;
        sy = 1 + (I.y - 1) * k;
        squashLabel = true;
        break;
      }
      case BS.RETURN:
      case BS.ROLL_AIR:
      case BS.ROLL: {
        if (b.recoverT >= 0) {
          b.recoverT += dt;
          const p = b.recoverT / RECOVER_TIME;
          if (p >= 1) b.recoverT = -1;
          else {
            const I = CONFIG.impactSquash;
            const k = easeOutElastic(p);
            sx = I.x + (1 - I.x) * k;
            sy = I.y + (1 - I.y) * k;
            if (b.hitEmpty) {
              sx = 1 + (sx - 1) * 0.5;
              sy = 1 + (sy - 1) * 0.5;
            }
            squashLabel = true;
          }
        }
        if (b.state === BS.RETURN) {
          const u = b.t / CONFIG.returnDuration;
          if (u > 0.82) s *= 1 - (1 - CONFIG.inletSquish) * ((u - 0.82) / 0.18);
        }
        if (b.state === BS.ROLL && b.bumpT >= 0) {
          b.bumpT += dt;
          const p = b.bumpT / BUMP_TIME;
          if (p >= 1) b.bumpT = -1;
          else {
            const a = Math.sin(p * Math.PI) * 0.18;
            sx = 1 + a;
            sy = 1 - a;
            squashLabel = true;
          }
        }
        break;
      }
      case BS.PIPE:
      case BS.ZIP: {
        let along = 0;
        if (b.bumpT >= 0) {
          b.bumpT += dt;
          const p = b.bumpT / BUMP_TIME;
          if (p >= 1) b.bumpT = -1;
          else along = Math.sin(p * Math.PI) * 0.14;
        }
        along = Math.max(along, b.mergeSquash * 0.28);
        if (along > 0) {
          pipe.tangentAt(b.dist, _t);
          angle = Math.atan2(_t.y, _t.x) - Math.PI / 2;
          sy = 1 - along;
          sx = 1 + along * 0.7;
        }
        break;
      }
    }

    b.mesh.rotation.z = angle;
    b.mesh.scale.set(r * s * sx, r * s * sy, r * s * sx);

    const ls = r * CONFIG.labelScale * s;
    b.label.position.set(0, 0, r * 1.02 * s);
    if (squashLabel) b.label.scale.set(ls * sx, ls * sy, 1);
    else b.label.scale.set(ls, ls, 1);
    let rot = 0;
    if (b.state === BS.PIPE) rot = Math.sin(b.dist * 2.4) * 0.22; // rolling wobble
    else if (b.state === BS.ROLL) rot = b.spin;
    b.labelMat.rotation = rot;

    const showTag = b.bonus > 1 && (b.state === BS.FALL || b.state === BS.IMPACT);
    b.tag.visible = showTag;
    if (showTag) {
      b.tag.position.set(r + 0.3, r * 1.1, r + 0.08);
      b.tag.scale.set(0.8, 0.4, 1);
    }
  }
}
