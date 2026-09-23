// Fixed launcher at the end of the top pipe. Fully manual: press & hold
// anywhere on the board to shoot, drag to tilt the barrel towards the finger,
// release to stop. A dotted arc predicts the path up to the first hit.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './state.js';
import * as pipe from './pipe.js';
import { rampY, circleHitsGrid, WALL_LEFT, WALL_RIGHT, CEILING } from './physics.js';
import { easeOutElastic } from './fx.js';

const P = CONFIG.pipe;
const R = P.radius;
const PH = CONFIG.physics;
const X = P.rightX; // the launcher never moves
const Y = P.topY;
const RECOIL_TIME = 0.32;
const MAX_DOTS = 80;
const WHITE = new THREE.Color('#ffffff');
const GOLD = new THREE.Color('#ffd23f');
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

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

    // Ring at the end of the pipe (fixed) + a barrel that tilts.
    this.group = new THREE.Group();
    this.group.position.set(X, Y, pipe.pipeZ);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.13, 16, 44), gold);
    ring.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R + 0.12, 24, 16, 0, Math.PI), gold);
    cap.rotation.y = Math.PI / 2; // closes the pipe end behind the ring (right side)
    cap.scale.set(1, 1, 0.45);
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.56), gold);
    clamp.position.y = R + 0.19;
    this.barrel = new THREE.Group();
    const L = CONFIG.barrelLength;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, L, 28, 1, true), goldInside);
    tube.position.y = -R - L / 2 + 0.12;
    tube.castShadow = true;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.07, 10, 28), gold);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = -R - L + 0.12;
    this.barrel.add(tube, lip);
    this.group.add(ring, cap, clamp, this.barrel);
    scene.add(this.group);
    this.tipDist = R + L - 0.05; // ring centre → muzzle

    // Aim arc: instanced dots along the predicted path.
    this.dotMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.9 });
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), this.dotMat, MAX_DOTS);
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;
    this.dots.count = 0;
    scene.add(this.dots);

    this.markerMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.9 });
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.84, 40), this.markerMat);
    this.marker.add(new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), this.markerMat));
    this.marker.renderOrder = 3;
    scene.add(this.marker);

    this.x = X;
    this.angle = 0; // 0 = straight down, + = towards the right
    this.targetAngle = 0;
    this.holding = false;
    this.pointerId = -1;
    this.lastInput = 0; // real time of the last press (drives the hint)
    this.everHeld = false;
    this.paused = false;
    this.recoilT = -1;
    this.scroll = 0;
    this.pulse = 0;
    this.headDist = pipe.distForTopX(X);

    this.bindInput(canvas);
  }

  // ── Input: press & hold anywhere on the board, drag to aim ─────────────
  bindInput(canvas) {
    const aim = (e) => {
      const rect = canvas.getBoundingClientRect();
      if (G.scene.unproject(e.clientX - rect.left, e.clientY - rect.top, G.grid.cell * 0.5, _v)) this.aimAt(_v.x, _v.y);
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
      aim(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.holding || e.pointerId !== this.pointerId) return;
      this.lastInput = G.realTime;
      aim(e);
    });
    const up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.holding = false;
      this.lastInput = G.realTime;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  // Point the barrel at a world point (never upwards).
  aimAt(wx, wy) {
    const dx = wx - X;
    const dy = Math.min(wy - Y, -0.35);
    this.setAngle(Math.atan2(dx, -dy));
  }

  setAngle(a) {
    this.targetAngle = Math.max(-CONFIG.maxAimAngle, Math.min(CONFIG.maxAimAngle, a));
  }

  center() {
    this.angle = this.targetAngle = 0;
  }

  // Launch direction (unit) and muzzle position.
  dirX() {
    return Math.sin(this.angle);
  }
  dirY() {
    return -Math.cos(this.angle);
  }
  tipX() {
    return X + this.dirX() * this.tipDist;
  }
  tipY() {
    return Y + this.dirY() * this.tipDist;
  }

  canRelease() {
    return !this.paused && !G.grid.building && G.grid.aliveCount > 0;
  }

  onRelease() {
    this.recoilT = 0;
    G.fx.puff(this.tipX(), this.tipY(), pipe.pipeZ);
  }

  update(dt) {
    this.angle += (this.targetAngle - this.angle) * Math.min(1, dt * CONFIG.aimSmoothing);
    this.barrel.rotation.z = this.angle;

    // Recoil: the barrel squashes back along its axis, then springs out.
    let k = 0;
    if (this.recoilT >= 0) {
      this.recoilT += dt;
      const p = this.recoilT / RECOIL_TIME;
      if (p >= 1) this.recoilT = -1;
      else k = 1 - easeOutElastic(p);
    }
    this.barrel.scale.set(1 + 0.18 * k, 1 - 0.22 * k, 1 + 0.18 * k);

    const grid = G.grid;
    const show = !this.paused && !grid.building && grid.aliveCount > 0;
    this.dots.visible = show;
    this.marker.visible = show;
    if (show) this.updateAim(dt);
  }

  // Simulate the shot (gravity, ball radius) and lay dots along it.
  updateAim(dt) {
    const grid = G.grid;
    const col = this.holding ? GOLD : WHITE;
    this.dotMat.color.copy(col);
    this.markerMat.color.copy(col);
    const spacing = CONFIG.aimDotSpacing;
    this.scroll = (this.scroll + (dt * CONFIG.aimDotSpeed * (this.holding ? 2 : 1)) / spacing) % 1;

    const r = CONFIG.ballBaseRadius;
    const h = 1 / 60;
    let x = this.tipX();
    let y = this.tipY();
    let vx = this.dirX() * CONFIG.launchSpeed;
    let vy = this.dirY() * CONFIG.launchSpeed;
    let travelled = 0;
    let next = this.scroll * spacing;
    let n = 0;
    const size = CONFIG.aimDotSize * (this.holding ? 1.25 : 1);
    const zDots = grid.cell * 0.5 + 0.2;
    const steps = Math.round(CONFIG.aimMaxTime / h);
    for (let i = 0; i < steps; i++) {
      vy -= PH.gravity * h;
      const nx = x + vx * h;
      const ny = y + vy * h;
      const seg = Math.hypot(nx - x, ny - y);
      while (next <= travelled + seg && n < MAX_DOTS) {
        const t = (next - travelled) / seg;
        const s = size * Math.min(1, 0.45 + next * 0.35); // grows out of the muzzle
        _m.makeScale(s, s, 1);
        _m.setPosition(x + (nx - x) * t, y + (ny - y) * t, zDots);
        this.dots.setMatrixAt(n++, _m);
        next += spacing;
      }
      travelled += seg;
      x = nx;
      y = ny;
      if (
        circleHitsGrid(grid, x, y, r) ||
        x + r > WALL_RIGHT ||
        x - r < WALL_LEFT ||
        y - r < rampY(x) ||
        (x < X && y + r > CEILING && vy > 0)
      ) {
        break;
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;

    this.pulse += dt;
    const ms = grid.cell * (1.02 + Math.sin(this.pulse * 9) * 0.08) * (this.holding ? 1.15 : 1);
    this.marker.scale.set(ms, ms, 1);
    this.marker.position.set(x, y, grid.cell + 0.2);
  }
}
