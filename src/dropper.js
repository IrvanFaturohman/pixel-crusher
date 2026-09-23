// Dropper ring on the top pipe, dotted aim line and landing marker.
// Fully manual: press & hold anywhere on the board to drop balls, drag to aim,
// release to stop. The ring follows the finger with a spring.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './state.js';
import * as pipe from './pipe.js';
import { rampY } from './physics.js';
import { easeOutElastic } from './fx.js';

const P = CONFIG.pipe;
const R = P.radius;
const SQUASH_TIME = 0.38;
const LINE_TOP = P.topY - R - 0.42; // just under the funnel
const WHITE = new THREE.Color('#ffffff');
const GOLD = new THREE.Color('#ffd23f');
const _v = new THREE.Vector3();

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 20);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 20, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Dropper {
  constructor(scene, canvas) {
    const gold = new THREE.MeshStandardMaterial({
      color: '#ffb629',
      metalness: 0.35,
      roughness: 0.24,
      emissive: '#6b3a00',
      emissiveIntensity: 0.25,
      envMapIntensity: 1.3,
    });
    const goldInside = gold.clone();
    goldInside.side = THREE.DoubleSide;

    this.group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.13, 16, 44), gold);
    ring.castShadow = true;
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.27, 0.32, 28, 1, true), goldInside);
    funnel.position.y = -R - 0.18;
    funnel.castShadow = true;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 10, 28), gold);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = -R - 0.34;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.56), gold);
    clamp.position.y = R + 0.19;
    this.group.add(ring, funnel, lip, clamp);
    this.group.position.set(0, P.topY, pipe.pipeZ);
    scene.add(this.group);

    // Dotted aim line: a plane whose top is at its origin; the dot texture
    // repeats along it and scrolls downwards.
    this.dotTex = makeDotTexture();
    this.lineMat = new THREE.MeshBasicMaterial({
      map: this.dotTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    this.line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0), this.lineMat);
    this.line.renderOrder = 3;
    scene.add(this.line);

    this.markerMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.9 });
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.84, 40), this.markerMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), this.markerMat);
    this.marker.add(dot);
    this.marker.renderOrder = 3;
    scene.add(this.marker);

    this.x = 0;
    this.v = 0;
    this.targetX = 0;
    this.holding = false;
    this.pointerId = -1;
    this.lastInput = 0; // real time of the last press (drives the hint)
    this.everHeld = false;
    this.paused = false;
    this.squashT = -1;
    this.scroll = 0;
    this.pulse = 0;

    this.bindInput(canvas);
  }

  get headDist() {
    return pipe.distForTopX(this.x);
  }

  clampX(x) {
    return Math.min(P.rightX - 0.05, Math.max(pipe.topRunMinX + 0.3, x));
  }

  // ── Input: press & hold anywhere on the board ─────────────────────────
  bindInput(canvas) {
    const toWorldX = (e) => {
      const rect = canvas.getBoundingClientRect();
      const hit = G.scene.unproject(e.clientX - rect.left, e.clientY - rect.top, G.grid.cell * 0.5, _v);
      return hit ? _v.x : null;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      this.holding = true;
      this.everHeld = true;
      this.pointerId = e.pointerId;
      this.lastInput = G.realTime;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* not supported */
      }
      const x = toWorldX(e);
      if (x !== null) this.aimAt(x);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.holding || e.pointerId !== this.pointerId) return;
      this.lastInput = G.realTime;
      const x = toWorldX(e);
      if (x !== null) this.aimAt(x);
    });
    const up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.holding = false;
      this.lastInput = G.realTime;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  aimAt(worldX) {
    this.targetX = this.clampX(worldX);
  }

  // Start above the middle of the picture.
  center() {
    const grid = G.grid;
    this.targetX = this.x = this.clampX(grid.x0 + grid.cols * grid.cell * 0.5);
    this.v = 0;
  }

  canRelease() {
    return !this.paused && !G.grid.building && G.grid.aliveCount > 0;
  }

  onRelease() {
    this.squashT = 0;
    G.fx.puff(this.x, LINE_TOP + 0.05, pipe.pipeZ);
  }

  update(dt) {
    // Spring towards the finger (never teleports).
    const a = CONFIG.dropperStiffness * (this.targetX - this.x) - CONFIG.dropperDamping * this.v;
    this.v += a * dt;
    this.x += this.v * dt;

    // Ring squash on release.
    let sx = 1;
    let sy = 1;
    if (this.squashT >= 0) {
      this.squashT += dt;
      const p = this.squashT / SQUASH_TIME;
      if (p >= 1) this.squashT = -1;
      else {
        const k = 1 - easeOutElastic(p);
        sy = 1 - 0.24 * k;
        sx = 1 + 0.16 * k;
      }
    }
    this.group.position.x = this.x;
    this.group.scale.set(sx, sy, 1);

    // Aim line + landing marker: first thing straight below the ring.
    const grid = G.grid;
    const show = !this.paused && !grid.building && grid.aliveCount > 0;
    this.line.visible = show;
    this.marker.visible = show;
    if (!show) return;
    const col = grid.colAt(this.x);
    const top = col >= 0 ? grid.columnTopY(col) : null;
    const landY = top !== null ? top : rampY(this.x);
    const len = Math.max(0.05, LINE_TOP - landY);
    const zLine = grid.cell * 0.5;
    this.line.position.set(this.x, LINE_TOP, zLine);
    this.line.scale.set(this.holding ? 0.18 : 0.14, len, 1);
    const rep = len / CONFIG.aimDotSpacing;
    this.scroll = (this.scroll + (dt * CONFIG.aimDotSpeed * (this.holding ? 2 : 1)) / CONFIG.aimDotSpacing) % 1;
    this.dotTex.repeat.set(1, rep);
    this.dotTex.offset.set(0, this.scroll - rep);
    this.lineMat.color.copy(this.holding ? GOLD : WHITE);
    this.lineMat.opacity = this.holding ? 1 : 0.7;

    this.pulse += dt;
    const cell = grid.cell;
    const ms = cell * (1.02 + Math.sin(this.pulse * 9) * 0.08) * (this.holding ? 1.15 : 1);
    this.marker.scale.set(ms, ms, 1);
    this.markerMat.color.copy(this.holding ? GOLD : WHITE);
    if (top !== null) this.marker.position.set(grid.colX(col), top - cell * 0.5, cell + 0.03);
    else this.marker.position.set(this.x, landY + cell * 0.5, CONFIG.layout.rampDepth * 0.5);
  }
}
