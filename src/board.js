// Board panel, frame, floor ledge, background pattern and the pipe meshes.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PipeCurve, pathLength, inletPos, pipeZ } from './pipe.js';
import { rampY, MOUTH_X } from './physics.js';

const L = CONFIG.layout;
const P = CONFIG.pipe;

function roundedRectShape(x, y, w, h, r, shape = new THREE.Shape()) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - r);
  shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + h);
  shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

// Subtle repeating pattern (white base, faint darker motifs). Multiplied by
// the per-picture background colour on the panel material.
function makePatternTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,0.075)';
  const plus = (x, y, s, t) => {
    g.beginPath();
    g.roundRect(x - s, y - t, s * 2, t * 2, t);
    g.roundRect(x - t, y - s, t * 2, s * 2, t);
    g.fill();
  };
  plus(32, 32, 11, 3.5);
  plus(96, 96, 11, 3.5);
  g.beginPath();
  g.arc(96, 32, 5, 0, Math.PI * 2);
  g.arc(32, 96, 5, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / L.patternTile, 1 / L.patternTile);
  tex.anisotropy = 4;
  return tex;
}

export function createBoard(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const W = L.boardWidth;
  const H = L.boardHeight;

  // ── Panel (front face at z = 0) ──
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x8fd3ff,
    map: makePatternTexture(),
    roughness: 0.85,
    metalness: 0,
    envMapIntensity: 0.25,
  });
  const panelGeo = new THREE.ExtrudeGeometry(roundedRectShape(-W / 2, -H / 2, W, H, L.boardRadius), {
    depth: 0.4,
    bevelEnabled: false,
    curveSegments: 10,
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.z = -0.4;
  panel.receiveShadow = true;
  group.add(panel);

  // ── Frame (raised rounded border) ──
  const fw = L.frameWidth;
  const frameShape = roundedRectShape(-W / 2 - fw, -H / 2 - fw, W + fw * 2, H + fw * 2, L.boardRadius + fw);
  frameShape.holes.push(roundedRectShape(-W / 2, -H / 2, W, H, L.boardRadius, new THREE.Path()));
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: L.frameDepth,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 3,
    curveSegments: 10,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, envMapIntensity: 0.6 });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // ── Sloped floor: lowest at the inlet mouth, so balls roll into it ──
  const rad = L.boardRadius;
  const rampShape = new THREE.Shape();
  rampShape.moveTo(-W / 2, L.floorY);
  rampShape.lineTo(-W / 2, -H / 2 + rad);
  rampShape.absarc(-W / 2 + rad, -H / 2 + rad, rad, Math.PI, Math.PI * 1.5, false);
  rampShape.lineTo(W / 2 - rad, -H / 2);
  rampShape.absarc(W / 2 - rad, -H / 2 + rad, rad, Math.PI * 1.5, Math.PI * 2, false);
  rampShape.lineTo(W / 2, rampY(W / 2));
  rampShape.lineTo(MOUTH_X, L.floorY);
  rampShape.closePath();
  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x6fb6e6, roughness: 0.6, envMapIntensity: 0.35 });
  const ledge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rampShape, {
      depth: L.rampDepth - 0.08,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 10,
    }),
    ledgeMat,
  );
  ledge.position.z = 0.04;
  ledge.receiveShadow = true;
  group.add(ledge);

  // ── Pipe: opaque inner channel (back half) + glass shell (front half) ──
  const tubeGeo = new THREE.TubeGeometry(new PipeCurve(0, pathLength), 260, P.radius, 28, false);
  const pipeInnerMat = new THREE.MeshStandardMaterial({
    color: 0x5fa0cc,
    roughness: 0.45,
    side: THREE.BackSide,
    envMapIntensity: 0.4,
  });
  const pipeInner = new THREE.Mesh(tubeGeo, pipeInnerMat);
  pipeInner.receiveShadow = true;
  group.add(pipeInner);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    envMapIntensity: 1.8,
  });
  const glass = new THREE.Mesh(tubeGeo, glassMat);
  glass.renderOrder = 2;
  group.add(glass);

  // Inlet mouth: flared orange funnel facing +X, with a rim.
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xff9d1c,
    roughness: 0.28,
    metalness: 0.1,
    side: THREE.DoubleSide,
    envMapIntensity: 0.9,
  });
  const R = P.radius;
  const flarePts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    flarePts.push(new THREE.Vector2(R + 0.02 + 0.3 * u * u, u * 0.42));
  }
  const inlet = new THREE.Mesh(new THREE.LatheGeometry(flarePts, 32), accentMat);
  inlet.rotation.z = -Math.PI / 2; // lathe axis (+Y) → +X
  inlet.position.copy(inletPos);
  inlet.castShadow = true;
  group.add(inlet);
  const inletRim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.33, 0.075, 10, 36), accentMat);
  inletRim.rotation.y = Math.PI / 2;
  inletRim.position.set(inletPos.x + 0.42, inletPos.y, inletPos.z);
  group.add(inletRim);
  const inletBand = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.09, 10, 32), accentMat);
  inletBand.rotation.y = Math.PI / 2;
  inletBand.position.copy(inletPos);
  group.add(inletBand);

  // Closed cap at the right end of the top run.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R + 0.02, 24, 16), accentMat);
  cap.scale.set(0.55, 1, 1);
  cap.position.set(P.rightX, P.topY, pipeZ);
  cap.castShadow = true;
  group.add(cap);

  // ── Background colour crossfade ──
  const cur = new THREE.Color(0x8fd3ff);
  const from = new THREE.Color();
  const to = new THREE.Color();
  let fadeT = 1;
  let fadeDur = 0.6;
  const tmp = new THREE.Color();
  const onBgChange = []; // listeners (UI tints the page background)

  function applyColors(c) {
    panelMat.color.copy(c);
    ledgeMat.color.copy(c).multiplyScalar(0.62);
    pipeInnerMat.color.copy(c).multiplyScalar(0.72);
    for (const fn of onBgChange) fn(c);
  }

  function setBackground(hex, duration = 0) {
    to.set(hex);
    if (duration <= 0) {
      cur.copy(to);
      fadeT = 1;
      applyColors(cur);
      return;
    }
    from.copy(cur);
    fadeDur = duration;
    fadeT = 0;
  }

  function update(dt) {
    if (fadeT >= 1) return;
    fadeT = Math.min(1, fadeT + dt / fadeDur);
    const e = fadeT * fadeT * (3 - 2 * fadeT);
    tmp.copy(from).lerp(to, e);
    cur.copy(tmp);
    applyColors(cur);
  }

  return { group, setBackground, update, onBgChange, accentMat, color: cur };
}
