// Pixel picture → cube grid. Gameplay is a 2D grid (columns × rows, depth = 1
// cube) rendered with ONE InstancedMesh. Row 0 is the TOP row of the picture.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './state.js';
import { getPicture } from './images.js';
import { easeOutBack } from './fx.js';

const L = CONFIG.layout;
const MAX_CELLS = 24 * 24;
const WOBBLE_TIME = 0.3;
const BUILD_DROP_TIME = 0.32;

const _col = new THREE.Color();

export class Grid {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, envMapIntensity: 0.75 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX_CELLS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _col.set(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    this.exists = new Uint8Array(MAX_CELLS);
    this.alive = new Uint8Array(MAX_CELLS);
    this.hp = new Float32Array(MAX_CELLS);
    this.base = new Float32Array(MAX_CELLS * 3); // linear RGB
    this.flash = new Float32Array(MAX_CELLS); // remaining flash time
    this.punchT = new Float32Array(MAX_CELLS).fill(-1);
    this.punchAmp = new Float32Array(MAX_CELLS);
    this.wobT = new Float32Array(MAX_CELLS).fill(-1);
    this.jx = new Float32Array(MAX_CELLS);
    this.jy = new Float32Array(MAX_CELLS);
    this.jr = new Float32Array(MAX_CELLS);
    this.loose = new Uint8Array(MAX_CELLS);
    this.buildDelay = new Float32Array(MAX_CELLS);
    this.isActive = new Uint8Array(MAX_CELLS);
    this.active = new Int32Array(MAX_CELLS);
    this.activeCount = 0;

    this.top = new Int16Array(32); // heightmap: row of topmost alive cube per column (-1 = empty)
    this.rowTicked = new Uint8Array(32);
    this.cols = 1;
    this.rows = 1;
    this.cell = 0.4;
    this.x0 = 0;
    this.y0 = L.floorY;
    this.maxHp = 1;
    this.totalCount = 0;
    this.aliveCount = 0;
    this.pictureIndex = 0;
    this.picture = null;
    this.building = false;
    this.buildT = 0;
    this.version = 0; // bumps whenever the picture changes
    this.lastBreaks = 0;
  }

  // ── Loading ────────────────────────────────────────────────────────────
  load(index, savedHp = null) {
    const pic = getPicture(index);
    this.picture = pic;
    this.pictureIndex = index;
    this.cols = pic.cols;
    this.rows = pic.rows;
    // The picture floats in the middle with open lanes around it.
    this.cell = Math.min(L.picMaxW / pic.cols, L.picMaxH / pic.rows, L.maxCell);
    this.x0 = L.picCenterX - (pic.cols * this.cell) / 2;
    this.y0 = L.picCenterY - (pic.rows * this.cell) / 2; // bottom edge
    this.maxHp = CONFIG.cubeBaseHP * Math.pow(CONFIG.cubeHPGrowth, index);

    const n = pic.cols * pic.rows;
    const useSave = Array.isArray(savedHp) && savedHp.length === n;
    this.totalCount = 0;
    this.aliveCount = 0;
    this.activeCount = 0;
    this.isActive.fill(0);
    for (let i = 0; i < n; i++) {
      const hex = pic.colors[i];
      this.exists[i] = hex ? 1 : 0;
      this.flash[i] = 0;
      this.punchT[i] = -1;
      this.wobT[i] = -1;
      this.jx[i] = this.jy[i] = this.jr[i] = 0;
      this.loose[i] = 0;
      if (!hex) {
        this.alive[i] = 0;
        this.hp[i] = 0;
        continue;
      }
      this.totalCount++;
      _col.set(hex);
      this.base[i * 3] = _col.r;
      this.base[i * 3 + 1] = _col.g;
      this.base[i * 3 + 2] = _col.b;
      let hp = this.maxHp;
      if (useSave) hp = Math.min(this.maxHp, Math.max(0, +savedHp[i] || 0));
      this.hp[i] = hp;
      this.alive[i] = hp > 0 ? 1 : 0;
      if (this.alive[i]) {
        this.aliveCount++;
        if (hp / this.maxHp < CONFIG.jitterBelow) this.loosen(i);
      }
    }
    if (useSave && this.aliveCount === 0) return this.load(index + 1);

    this.mesh.count = n;
    for (let c = 0; c < this.cols; c++) this.recomputeTop(c);
    for (let i = 0; i < n; i++) {
      if (this.alive[i]) this.writeMatrix(i, 0, 0, 0, 1);
      else this.hideMatrix(i);
      this.writeColor(i);
    }
    this.building = false;
    this.version++;
    this.flagDirty();
    return this;
  }

  // Cubes drop in row by row (bottom row first), with a sideways wave.
  buildIn() {
    const n = this.cols * this.rows;
    const spread = CONFIG.buildDuration - BUILD_DROP_TIME;
    this.building = true;
    this.buildT = 0;
    this.rowTicked.fill(0);
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue;
      const c = i % this.cols;
      const r = (i / this.cols) | 0;
      const fromBottom = (this.rows - 1 - r) / Math.max(1, this.rows - 1);
      this.buildDelay[i] = fromBottom * spread * 0.86 + (c / Math.max(1, this.cols - 1)) * spread * 0.14;
      this.hideMatrix(i);
      this.activate(i);
    }
    this.flagDirty();
  }

  // ── Geometry helpers ──────────────────────────────────────────────────
  colX(c) {
    return this.x0 + (c + 0.5) * this.cell;
  }
  rowY(r) {
    return this.y0 + (this.rows - 1 - r + 0.5) * this.cell;
  }
  // Column under x, or -1 outside the picture.
  colAt(x) {
    const c = Math.floor((x - this.x0) / this.cell);
    return c < 0 || c >= this.cols ? -1 : c;
  }
  // Y of the top face of the column's topmost cube, or null if nothing's there.
  columnTopY(c) {
    if (this.building || c < 0 || c >= this.cols || this.top[c] < 0) return null;
    return this.y0 + (this.rows - this.top[c]) * this.cell;
  }
  get progress() {
    return this.totalCount ? 1 - this.aliveCount / this.totalCount : 0;
  }

  recomputeTop(c) {
    this.top[c] = -1;
    for (let r = 0; r < this.rows; r++) {
      if (this.alive[r * this.cols + c]) {
        this.top[c] = r;
        return;
      }
    }
  }

  // ── Damage ───────────────────────────────────────────────────────────
  splashRule(value) {
    const t = CONFIG.splashTable;
    let rule = t[0];
    for (let i = 0; i < t.length; i++) if (value >= t[i].minValue) rule = t[i];
    return rule;
  }

  // A ball hit cube (c, r) on the face with outward normal (nx, ny).
  // Splash spreads ACROSS the hit face; "below" hits the cube behind it.
  // Returns damage actually applied (no overkill carry-over).
  hitCell(c, r, damage, value, nx, ny, px, py) {
    this.lastBreaks = 0;
    if (this.building) return 0;
    const rule = this.splashRule(value);
    const vertical = Math.abs(ny) >= Math.abs(nx); // top/bottom face → spread sideways
    let applied = this.damageCube(c, r, damage, CONFIG.punchMain, true, px, py, nx, ny);
    if (rule.below > 0) {
      const bc = vertical ? c : c - Math.sign(nx);
      const br = vertical ? r + (ny > 0 ? 1 : -1) : r; // rows count downwards
      applied += this.damageAt(bc, br, damage * rule.below);
    }
    for (let d = 1; d <= rule.width; d++) {
      const frac = rule.falloff ? rule.splash * (1 - (d - 1) / rule.width) : rule.splash;
      for (let s = -1; s <= 1; s += 2) {
        applied += vertical ? this.damageAt(c + s * d, r, damage * frac) : this.damageAt(c, r + s * d, damage * frac);
      }
    }
    if (this.aliveCount === 0) G.game.onPictureComplete();
    return applied;
  }

  damageAt(c, r, dmg) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 0;
    return this.damageCube(c, r, dmg, CONFIG.punchSplash, false, this.colX(c), this.rowY(r) + this.cell * 0.5, 0, 1);
  }

  damageCube(c, r, dmg, punch, isMain, px, py, nx, ny) {
    const i = r * this.cols + c;
    if (!this.alive[i] || dmg <= 0) return 0;
    const applied = Math.min(dmg, this.hp[i]);
    this.hp[i] -= dmg;
    const x = this.colX(c);
    const y = this.rowY(r);
    const z = this.cell * 0.5;
    if (this.hp[i] <= 1e-6) {
      this.hp[i] = 0;
      this.breakCube(i, c, r, x, y, z);
      return applied;
    }
    this.flash[i] = CONFIG.hitFlashTime;
    this.punchT[i] = 0;
    this.punchAmp[i] = punch;
    if (!this.loose[i] && this.hp[i] / this.maxHp < CONFIG.jitterBelow) this.loosen(i);
    this.activate(i);
    G.fx.cubeHit(px, py, z, this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2], this.cell, isMain, nx, ny);
    return applied;
  }

  // Knocked slightly loose: a small static offset + tilt.
  loosen(i) {
    this.loose[i] = 1;
    const k = this.cell * 0.07;
    this.jx[i] = (Math.random() * 2 - 1) * k;
    this.jy[i] = -Math.random() * k * 0.6;
    this.jr[i] = (Math.random() * 2 - 1) * 0.12;
  }

  breakCube(i, c, r, x, y, z) {
    this.alive[i] = 0;
    this.aliveCount--;
    this.lastBreaks++;
    this.punchT[i] = -1;
    this.wobT[i] = -1;
    this.flash[i] = 0;
    this.hideMatrix(i);
    if (this.top[c] === r) this.recomputeTop(c);
    this.flagDirty();
    // Neighbours wobble.
    this.wobble(c - 1, r);
    this.wobble(c + 1, r);
    this.wobble(c, r - 1);
    this.wobble(c, r + 1);
    G.game.onCubeBreak(x, y, z, this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2], this.cell);
  }

  wobble(c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    const i = r * this.cols + c;
    if (!this.alive[i]) return;
    this.wobT[i] = 0;
    this.activate(i);
  }

  // ── Per-frame animation (only cubes that are animating) ──────────────
  activate(i) {
    if (this.isActive[i]) return;
    this.isActive[i] = 1;
    this.active[this.activeCount++] = i;
  }

  update(dt) {
    if (this.building) this.buildT += dt;
    let buildDone = this.building;
    let k = 0;
    while (k < this.activeCount) {
      const i = this.active[k];
      let done = true;
      let dy = 0;
      let rot = 0;
      let s = 1;
      let visible = this.alive[i] === 1;

      if (this.building && visible) {
        const t = (this.buildT - this.buildDelay[i]) / BUILD_DROP_TIME;
        if (t < 0) {
          visible = false;
          done = false;
          buildDone = false;
        } else if (t < 1) {
          done = false;
          buildDone = false;
          if (t < 0.7) {
            const u = t / 0.7;
            dy = CONFIG.buildDropHeight * (1 - u * u);
          } else {
            const u = (t - 0.7) / 0.3;
            dy = Math.sin(u * Math.PI) * this.cell * 0.28; // tiny landing bounce
            const r = (i / this.cols) | 0;
            if (!this.rowTicked[r]) {
              this.rowTicked[r] = 1;
              G.audio.buildTick((this.rows - 1 - r) / Math.max(1, this.rows - 1));
            }
          }
        }
      }

      if (this.punchT[i] >= 0) {
        this.punchT[i] += dt;
        const p = this.punchT[i] / CONFIG.punchTime;
        if (p >= 1) this.punchT[i] = -1;
        else {
          s *= 1 + this.punchAmp[i] * (1 - easeOutBack(p));
          done = false;
        }
      }
      if (this.wobT[i] >= 0) {
        this.wobT[i] += dt;
        const p = this.wobT[i] / WOBBLE_TIME;
        if (p >= 1) this.wobT[i] = -1;
        else {
          rot += Math.sin(this.wobT[i] * 48) * 0.14 * (1 - p) * (1 - p);
          done = false;
        }
      }
      if (this.flash[i] > 0) {
        this.flash[i] = Math.max(0, this.flash[i] - dt);
        done = false;
      }

      if (visible) this.writeMatrix(i, 0, dy, rot, s);
      else this.hideMatrix(i);
      this.writeColor(i);

      if (done) {
        this.isActive[i] = 0;
        this.active[k] = this.active[--this.activeCount];
      } else k++;
    }
    if (this.building && buildDone) {
      this.building = false;
      this.version++;
    }
    if (this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      this.dirty = false;
    }
  }

  flagDirty() {
    this.dirty = true;
  }

  writeMatrix(i, dx, dy, rot, s) {
    const c = i % this.cols;
    const r = (i / this.cols) | 0;
    const size = this.cell * L.cubeGap * s;
    const a = this.mesh.instanceMatrix.array;
    const o = i * 16;
    const ang = rot + this.jr[i];
    const cs = Math.cos(ang) * size;
    const sn = Math.sin(ang) * size;
    a[o] = cs; a[o + 1] = sn; a[o + 2] = 0; a[o + 3] = 0;
    a[o + 4] = -sn; a[o + 5] = cs; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = size; a[o + 11] = 0;
    a[o + 12] = this.colX(c) + this.jx[i] + dx;
    a[o + 13] = this.rowY(r) + this.jy[i] + dy;
    a[o + 14] = this.cell * 0.5;
    a[o + 15] = 1;
    this.dirty = true;
  }

  hideMatrix(i) {
    const a = this.mesh.instanceMatrix.array;
    const o = i * 16;
    for (let k = 0; k < 15; k++) a[o + k] = 0;
    a[o + 15] = 1;
    this.dirty = true;
  }

  // Colour = base, darkened by damage, lerped to white while flashing.
  writeColor(i) {
    const a = this.mesh.instanceColor.array;
    const o = i * 3;
    let f = 1;
    if (this.maxHp > 1) {
      const t = Math.min(1, Math.max(0, (this.maxHp - this.hp[i]) / (this.maxHp - 1)));
      f = 1 - (1 - CONFIG.damageDarken) * t;
    }
    const fl = this.flash[i] > 0 ? this.flash[i] / CONFIG.hitFlashTime : 0;
    a[o] = this.base[o] * f * (1 - fl) + fl;
    a[o + 1] = this.base[o + 1] * f * (1 - fl) + fl;
    a[o + 2] = this.base[o + 2] * f * (1 - fl) + fl;
    this.dirty = true;
  }

  // Debug "skip picture": remove every cube silently.
  clearAll() {
    const n = this.cols * this.rows;
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue;
      this.alive[i] = 0;
      this.hideMatrix(i);
    }
    this.aliveCount = 0;
    for (let c = 0; c < this.cols; c++) this.top[c] = -1;
  }

  serialize() {
    const n = this.cols * this.rows;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.alive[i] ? Math.round(this.hp[i] * 100) / 100 : 0;
    return out;
  }
}
