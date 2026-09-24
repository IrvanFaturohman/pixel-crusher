// Lightweight 2D ball physics (no engine): circles vs. the cube grid, side
// walls, the ceiling under the top pipe and a sloped floor that rolls every
// ball into the inlet. Runs in fixed small substeps (see CONFIG.maxSubstep).
import { CONFIG } from './config.js';

const PH = CONFIG.physics;
const P = CONFIG.pipe;
const L = CONFIG.layout;

export const WALL_LEFT = P.leftX + P.radius; // inner edge of the vertical pipe
export const WALL_RIGHT = L.boardWidth / 2;
export const CEILING = P.topY - P.radius; // underside of the top pipe
const BOARD_TOP = L.boardHeight / 2;
// Right of the launcher there's no pipe overhead, just the board frame.
function ceilingY(x) {
  return x < P.rightX + P.radius ? CEILING : BOARD_TOP;
}
export const MOUTH_X = P.inletX; // floor ends at the inlet mouth
const INLET_TOP = L.floorY + P.radius * 2; // top of the inlet mouth

const RAMP_LEN = Math.hypot(1, L.rampSlope);
const RAMP_NX = -L.rampSlope / RAMP_LEN; // floor normal (points up, slightly left)
const RAMP_NY = 1 / RAMP_LEN;

// Floor height at x (lowest at the inlet mouth).
export function rampY(x) {
  return L.floorY + Math.max(0, x - MOUTH_X) * L.rampSlope;
}

const rand = (a, b) => a + Math.random() * (b - a);

// Reflect velocity off a surface with normal (nx, ny). A real impact springs
// back at least `minOut` fast (arcade bounce). Returns the impact speed.
function bounce(b, nx, ny, e, jitter, minOut = 0) {
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  let out = -vn * e;
  if (minOut > 0 && -vn > PH.minImpactSpeed && out < minOut) out = minOut;
  b.vx += (out - vn) * nx;
  b.vy += (out - vn) * ny;
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  // Friction only on real impacts, so rolling contact doesn't brake the ball.
  let dv = -vt * PH.friction * Math.min(1, -vn / 3);
  if (jitter) dv += rand(-1, 1) * jitter * Math.min(1, -vn / 6);
  b.vx += tx * dv;
  b.vy += ty * dv;
  return -vn;
}

// Integrate one ball. `onCube(b, col, row, nx, ny, speed)` is called for every
// damaging cube hit and returns true if the cube broke. Returns 'inlet' when
// the ball reaches the inlet mouth.
export function stepBall(b, grid, dt, onCube, onBounce) {
  const p = b.group.position;
  const r = b.radius;
  b.vy -= PH.gravity * dt;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > PH.maxSpeed) {
    b.vx *= PH.maxSpeed / sp;
    b.vy *= PH.maxSpeed / sp;
  }
  p.x += b.vx * dt;
  p.y += b.vy * dt;
  if (b.hitCd > 0) b.hitCd -= dt;

  // Cubes: resolve the deepest contact first (avoids ghost bumps on seams).
  if (!grid.building && grid.aliveCount > 0 && !(b.ghost > 0)) {
    for (let iter = 0; iter < 3; iter++) {
      const cell = grid.cell;
      const c0 = Math.max(0, Math.floor((p.x - r - grid.x0) / cell));
      const c1 = Math.min(grid.cols - 1, Math.floor((p.x + r - grid.x0) / cell));
      const k0 = Math.max(0, Math.floor((p.y - r - grid.y0) / cell));
      const k1 = Math.min(grid.rows - 1, Math.floor((p.y + r - grid.y0) / cell));
      let best = -1;
      let bestPen = 0;
      let bnx = 0;
      let bny = 0;
      let bc = 0;
      let brow = 0;
      // Cubes collide as slightly rounded boxes: the seams between cubes
      // become small bumps that knock balls sideways, like pegs.
      const kr = cell * PH.cubeRound;
      const rr = r + kr;
      const inner = cell - 2 * kr;
      for (let c = c0; c <= c1; c++) {
        for (let k = k0; k <= k1; k++) {
          const row = grid.rows - 1 - k;
          const i = row * grid.cols + c;
          if (!grid.alive[i]) continue;
          const bx = grid.x0 + c * cell + kr;
          const by = grid.y0 + k * cell + kr;
          const qx = p.x < bx ? bx : p.x > bx + inner ? bx + inner : p.x;
          const qy = p.y < by ? by : p.y > by + inner ? by + inner : p.y;
          const dx = p.x - qx;
          const dy = p.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          let nx;
          let ny;
          let pen;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            pen = rr - d;
          } else {
            // Centre inside the cube: push out through the nearest face.
            const dl = p.x - bx;
            const dr = bx + inner - p.x;
            const dd = p.y - by;
            const du = by + inner - p.y;
            const m = Math.min(dl, dr, dd, du);
            nx = m === dl ? -1 : m === dr ? 1 : 0;
            ny = m === du ? 1 : m === dd ? -1 : 0;
            pen = rr + m;
          }
          if (pen > bestPen) {
            bestPen = pen;
            best = i;
            bnx = nx;
            bny = ny;
            bc = c;
            brow = row;
          }
        }
      }
      if (best < 0) break;
      p.x += bnx * bestPen;
      p.y += bny * bestPen;
      const vn = -(b.vx * bnx + b.vy * bny);
      let broke = false;
      if (vn > PH.minImpactSpeed && b.hitCd <= 0) {
        b.hitCd = PH.hitCooldown;
        broke = onCube(b, bc, brow, bnx, bny, vn);
      }
      const speed = bounce(b, bnx, bny, broke ? PH.breakRestitution : PH.cubeRestitution, PH.bounceJitter, PH.minBounce);
      if (speed > 0) onBounce(b, bnx, bny, speed, 0);
    }
  }

  // Side walls (the left wall is the pipe; below it the inlet swallows balls).
  if (p.x + r > WALL_RIGHT) {
    p.x = WALL_RIGHT - r;
    onBounce(b, -1, 0, bounce(b, -1, 0, PH.wallRestitution, 0), 2);
  }
  if (p.y > INLET_TOP + 0.3 && p.x - r < WALL_LEFT) {
    p.x = WALL_LEFT + r;
    onBounce(b, 1, 0, bounce(b, 1, 0, PH.wallRestitution, 0), 2);
  }
  // Ceiling (only once the ball has left the launcher).
  const ceil = ceilingY(p.x);
  if (p.y < ceil - r - 0.05) b.belowCeiling = true;
  if (b.belowCeiling && p.y + r > ceil) {
    p.y = ceil - r;
    onBounce(b, 0, -1, bounce(b, 0, -1, PH.wallRestitution, 0), 2);
  }

  // Inlet mouth: anything that reaches the bottom-left corner gets swallowed.
  if (p.x < MOUTH_X + 0.35 && p.y < INLET_TOP + 0.25) return 'inlet';
  if (p.y < L.floorY - 1) return 'inlet'; // failsafe

  // Sloped floor.
  b.onFloor = false;
  if (p.x > MOUTH_X) {
    const dist = (p.x - MOUTH_X) * RAMP_NX + (p.y - L.floorY) * RAMP_NY;
    if (dist < r) {
      p.x += RAMP_NX * (r - dist);
      p.y += RAMP_NY * (r - dist);
      const speed = bounce(b, RAMP_NX, RAMP_NY, PH.floorRestitution, 0);
      if (speed > 1.5) onBounce(b, RAMP_NX, RAMP_NY, speed, 1);
      b.onFloor = true;
    }
  }
  return null;
}

// Does a circle at (x, y) touch any alive cube? (used by the aim prediction)
export function circleHitsGrid(grid, x, y, r) {
  if (grid.building || grid.aliveCount === 0) return false;
  const cell = grid.cell;
  const kr = cell * PH.cubeRound;
  const rr = r + kr;
  const inner = cell - 2 * kr;
  const c0 = Math.max(0, Math.floor((x - r - grid.x0) / cell));
  const c1 = Math.min(grid.cols - 1, Math.floor((x + r - grid.x0) / cell));
  const k0 = Math.max(0, Math.floor((y - r - grid.y0) / cell));
  const k1 = Math.min(grid.rows - 1, Math.floor((y + r - grid.y0) / cell));
  for (let c = c0; c <= c1; c++) {
    for (let k = k0; k <= k1; k++) {
      if (!grid.alive[(grid.rows - 1 - k) * grid.cols + c]) continue;
      const bx = grid.x0 + c * cell + kr;
      const by = grid.y0 + k * cell + kr;
      const dx = x - (x < bx ? bx : x > bx + inner ? bx + inner : x);
      const dy = y - (y < by ? by : y > by + inner ? by + inner : y);
      if (dx * dx + dy * dy < rr * rr) return true;
    }
  }
  return false;
}

// Ball-vs-ball collisions (mass ∝ r²).
export function collideBalls(list, n) {
  const e = PH.ballRestitution;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    const pa = a.group.position;
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      const pb = b.group.position;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-10) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const ma = a.radius * a.radius;
      const mb = b.radius * b.radius;
      const overlap = rr - d;
      const ka = mb / (ma + mb);
      const kb = ma / (ma + mb);
      pa.x -= nx * overlap * ka;
      pa.y -= ny * overlap * ka;
      pb.x += nx * overlap * kb;
      pb.y += ny * overlap * kb;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const jImp = (-(1 + e) * vn) / (1 / ma + 1 / mb);
      a.vx -= (jImp / ma) * nx;
      a.vy -= (jImp / ma) * ny;
      b.vx += (jImp / mb) * nx;
      b.vy += (jImp / mb) * ny;
    }
  }
}
