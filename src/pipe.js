// Pipe path (inlet → up the left side → along the top) and the ball queue.
// The path is an exact chain of lines and arcs, so "distance along the pipe"
// maps to a position with no lookup tables and no allocations.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const P = CONFIG.pipe;

// Segments: { kind: 'line', x0, y0, dx, dy, len, d0 } | { kind: 'arc', cx, cy, r, a0, da, len, d0 }
const segs = [];
let totalLength = 0;
let topStartDist = 0; // distance where the straight top run begins
let topStartX = 0;

function addLine(x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  segs.push({ kind: 'line', x0, y0, dx: (x1 - x0) / len, dy: (y1 - y0) / len, len, d0: totalLength });
  totalLength += len;
}
function addArc(cx, cy, r, a0, a1) {
  const len = Math.abs(a1 - a0) * r;
  segs.push({ kind: 'arc', cx, cy, r, a0, da: a1 - a0, len, d0: totalLength });
  totalLength += len;
}

(function build() {
  const R = P.radius;
  const y0 = CONFIG.layout.floorY + R; // inlet run rests on the floor ledge
  const b = P.inletBend;
  const c = P.cornerRadius;
  addLine(P.inletX, y0, P.leftX + b, y0); // inlet mouth, heading left
  addArc(P.leftX + b, y0 + b, b, -Math.PI / 2, -Math.PI); // bend upwards
  addLine(P.leftX, y0 + b, P.leftX, P.topY - c); // up the left side
  addArc(P.leftX + c, P.topY - c, c, Math.PI, Math.PI / 2); // top-left corner
  topStartDist = totalLength;
  topStartX = P.leftX + c;
  addLine(topStartX, P.topY, P.rightX, P.topY); // along the top
})();

export const pipeZ = P.radius; // tube centre sits on the board surface
export const pathLength = totalLength;
export const inletPos = new THREE.Vector3(P.inletX, CONFIG.layout.floorY + P.radius, pipeZ);
export const topRunMinX = topStartX;

function segAt(d) {
  for (let i = 0; i < segs.length - 1; i++) {
    if (d < segs[i].d0 + segs[i].len) return segs[i];
  }
  return segs[segs.length - 1];
}

// Position at distance d along the path (clamped). Writes into out (Vector3-like).
export function pointAt(d, out) {
  if (d < 0) d = 0;
  else if (d > totalLength) d = totalLength;
  const s = segAt(d);
  const u = d - s.d0;
  if (s.kind === 'line') {
    out.x = s.x0 + s.dx * u;
    out.y = s.y0 + s.dy * u;
  } else {
    const a = s.a0 + (s.da * u) / s.len;
    out.x = s.cx + Math.cos(a) * s.r;
    out.y = s.cy + Math.sin(a) * s.r;
  }
  out.z = pipeZ;
  return out;
}

// Unit tangent (direction of travel) at distance d.
export function tangentAt(d, out) {
  if (d < 0) d = 0;
  else if (d > totalLength) d = totalLength;
  const s = segAt(d);
  if (s.kind === 'line') {
    out.x = s.dx;
    out.y = s.dy;
  } else {
    const a = s.a0 + (s.da * (d - s.d0)) / s.len;
    const sign = s.da > 0 ? 1 : -1;
    out.x = -Math.sin(a) * sign;
    out.y = Math.cos(a) * sign;
  }
  out.z = 0;
  return out;
}

// Distance along the path of a point on the top run with the given x.
export function distForTopX(x) {
  return topStartDist + Math.max(0, Math.min(P.rightX, x) - topStartX);
}

// THREE.Curve wrapper so TubeGeometry can sweep the exact same path.
export class PipeCurve extends THREE.Curve {
  constructor(from = 0, to = totalLength) {
    super();
    this.from = from;
    this.to = to;
  }
  getPoint(t, target = new THREE.Vector3()) {
    return pointAt(this.from + (this.to - this.from) * t, target);
  }
}

// ─── Ball queue ─────────────────────────────────────────────────────────────
// queue[0] is the front ball (closest to the dropper). Balls are beads: each
// one moves at pipeSpeed but can never get closer than the sum of radii (+gap)
// to the ball ahead. The front ball stops at `headDist` (the dropper).

export const queue = [];

export function spacingBetween(a, b) {
  return a.radius + b.radius + CONFIG.ballSpacing;
}

export function updateQueue(dt, headDist) {
  const step = CONFIG.pipeSpeed * dt;
  let limit = headDist;
  for (let i = 0; i < queue.length; i++) {
    const b = queue[i];
    if (i > 0) limit = queue[i - 1].dist - spacingBetween(queue[i - 1], b);
    let nd = b.dist + step;
    const blocked = nd >= limit;
    if (nd > limit) nd = limit; // also pushes balls back when the dropper moves left
    b.pipeVel = dt > 0 ? (nd - b.dist) / dt : 0;
    // Bump: the ball was moving freely and just ran into the one ahead.
    if (blocked && !b.blocked && b.pipeVel < CONFIG.pipeSpeed * 0.9 && b.movedFree > 0.15) b.onBump();
    if (blocked) b.movedFree = 0;
    else b.movedFree += step;
    b.blocked = blocked;
    b.dist = nd;
  }
}

// Append a ball at the back of the queue, entering at the inlet.
export function enqueue(ball) {
  let d = 0;
  const last = queue[queue.length - 1];
  if (last) d = Math.min(0, last.dist - spacingBetween(last, ball));
  ball.dist = d;
  ball.blocked = false;
  ball.movedFree = 0;
  queue.push(ball);
}

export function removeFromQueue(ball) {
  const i = queue.indexOf(ball);
  if (i >= 0) queue.splice(i, 1);
}
