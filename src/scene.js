// Three.js renderer, camera (fit to the free area between HUD and buttons),
// lights, environment reflections and trauma-based screen shake.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from './config.js';

const L = CONFIG.layout;
const _v = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = CONFIG.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();

  // Soft studio reflections so glossy balls/cubes read as 3D toys.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(L.cameraFov, 1, 0.5, 200);

  // Key light from the top-left, slightly in front of the board.
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-5.5, 8, 13);
  key.target.position.set(0, 0, 0);
  key.castShadow = CONFIG.shadows;
  key.shadow.mapSize.set(CONFIG.shadowMapSize, CONFIG.shadowMapSize);
  key.shadow.radius = CONFIG.shadowRadius;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  const sc = key.shadow.camera;
  sc.left = -7.5;
  sc.right = 7.5;
  sc.top = 8.5;
  sc.bottom = -8.5;
  sc.near = 2;
  sc.far = 35;
  scene.add(key, key.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa6c8, 1.25);
  scene.add(hemi);

  // Camera framing: computed in resize(), shake is applied on top each frame.
  const base = { x: 0, y: 0, z: 30, ty: 0 };
  const view = { width: 1, height: 1 };
  const shake = { trauma: 0, time: 0 };

  function resize(width, height, topInset, bottomInset) {
    view.width = width;
    view.height = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    const bw = L.boardWidth + L.frameWidth * 2 + L.fitMargin * 2;
    const bh = L.boardHeight + L.frameWidth * 2 + L.fitMargin * 2;
    const availH = Math.max(50, height - topInset - bottomInset);
    const pxPerUnit = Math.min(width / bw, availH / bh);
    const visibleH = height / pxPerUnit;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(L.cameraFov) / 2);
    const dist = visibleH / (2 * tanHalf);
    // Put the board centre in the middle of the free area.
    const centerPx = topInset + availH / 2;
    const offsetY = (centerPx - height / 2) / pxPerUnit;

    base.ty = offsetY;
    base.x = 0;
    base.y = offsetY + Math.sin(L.cameraTilt) * dist;
    base.z = Math.cos(L.cameraTilt) * dist;
    camera.near = Math.max(0.5, dist - 20);
    camera.far = dist + 20;
    camera.updateProjectionMatrix();
    applyCamera(0, 0, 0);
  }

  function applyCamera(ox, oy, roll) {
    camera.position.set(base.x + ox, base.y + oy, base.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(base.x + ox, base.ty + oy, 0);
    if (roll) camera.rotateZ(roll);
    camera.updateMatrixWorld();
  }

  function addTrauma(t) {
    shake.trauma = Math.min(1, shake.trauma + t);
  }

  // Trauma-based shake: offset ∝ trauma², smooth pseudo-noise, decays fast.
  function update(realDt) {
    const S = CONFIG.shake;
    shake.time += realDt;
    if (shake.trauma > 0) {
      shake.trauma = Math.max(0, shake.trauma - S.decay * realDt);
      const k = shake.trauma * shake.trauma;
      const t = shake.time * S.frequency;
      const nx = Math.sin(t * 1.0) * 0.6 + Math.sin(t * 2.31 + 1.7) * 0.4;
      const ny = Math.sin(t * 1.17 + 3.1) * 0.6 + Math.sin(t * 2.73 + 0.4) * 0.4;
      const nr = Math.sin(t * 0.93 + 5.2);
      applyCamera(nx * S.maxOffset * k, ny * S.maxOffset * k, nr * S.maxRoll * k);
    } else {
      applyCamera(0, 0, 0);
    }
  }

  // World → overlay pixel coordinates (relative to the game container).
  function project(x, y, z, out) {
    _v.set(x, y, z).project(camera);
    out.x = (_v.x * 0.5 + 0.5) * view.width;
    out.y = (-_v.y * 0.5 + 0.5) * view.height;
    return out;
  }

  // Overlay pixel → world point on the plane z = planeZ. Returns null if parallel.
  function unproject(px, py, planeZ, out) {
    _ndc.set((px / view.width) * 2 - 1, -(py / view.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    _plane.constant = -planeZ;
    return _ray.ray.intersectPlane(_plane, out);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, key, resize, update, render, project, unproject, addTrauma, shake, view };
}
