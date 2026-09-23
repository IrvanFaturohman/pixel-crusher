// Bootstrap + game loop.
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G, state, loadSave, writeSave, isResetting } from './state.js';
import { createScene } from './scene.js';
import { createBoard } from './board.js';
import { Grid } from './grid.js';
import { Balls } from './balls.js';
import { Dropper } from './dropper.js';
import { FX } from './fx.js';
import { Economy, formatMoney } from './economy.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Debug } from './debug.js';
import { loadPngPictures } from './images.js';

const app = document.getElementById('app');
const canvas = document.getElementById('game');

async function boot() {
  try {
    await Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 32px Fredoka')]);
  } catch {
    /* fall back to system font */
  }
  await loadPngPictures();
  loadSave();

  G.scene = createScene(canvas);
  G.board = createBoard(G.scene.scene);
  G.audio = new Audio();
  G.fx = new FX(G.scene.scene, document.getElementById('fx-layer'));
  G.economy = new Economy();
  G.game = { onCubeBreak, onPictureComplete, skipPicture, hitValue: 2 };
  G.hitStop = 0;
  G.grid = new Grid(G.scene.scene).load(state.pictureIndex, state.gridHp);
  G.balls = new Balls(G.scene.scene);
  G.dropper = new Dropper(G.scene.scene, canvas);
  G.ui = new UI(app);
  G.debug = new Debug(document.getElementById('debug'));
  G.board.onBgChange.push((c) => G.ui.setBackground(c));
  G.board.setBackground(G.grid.picture.bg);
  G.dropper.snapToTarget();
  G.balls.spawnInitial(state.ballValues);

  // The AudioContext can only start from a user gesture.
  const unlock = () => G.audio.unlock();
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, true);

  resize();
  new ResizeObserver(resize).observe(app);
  window.addEventListener('resize', resize);

  // Autosave every few seconds and whenever the page is hidden.
  setInterval(save, CONFIG.saveInterval * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);

  window.G = G; // handy for poking at things from the console
  G.config = CONFIG;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Step the simulation manually (for testing when rAF is throttled).
  G.advance = (seconds, fps = 60) => {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) {
      G.realTime += 1 / fps;
      step(1 / fps);
      G.scene.update(1 / fps);
      G.ui.update(1 / fps);
      G.fx.updateOverlay(1 / fps);
    }
    G.scene.render();
  };

  document.getElementById('loading').classList.add('done');
  last = performance.now();
  requestAnimationFrame(frame);
}

function save() {
  if (!isResetting()) writeSave();
}

function resize() {
  const ins = G.ui.insets();
  G.scene.resize(app.clientWidth, app.clientHeight, ins.top, ins.bottom);
}

// ─── Break → combo, coins, sound ────────────────────────────────────────
const combo = { count: 0, timer: 0 };
let breakCount = 0;
let lastVibrate = 0;
const lastBreak = { x: 0, y: 0, z: 0, cell: 0.4, color: new THREE.Color() };

function onCubeBreak(x, y, z, r, g, b, cell) {
  G.fx.cubeBreak(x, y, z, r, g, b, cell);
  lastBreak.x = x;
  lastBreak.y = y;
  lastBreak.z = z;
  lastBreak.cell = cell;
  lastBreak.color.setRGB(r, g, b);

  combo.count = combo.timer > 0 ? combo.count + 1 : 1;
  combo.timer = CONFIG.comboWindow;
  G.audio.break(combo.count);
  if (combo.count >= CONFIG.comboShowFrom) G.fx.combo(combo.count);
  if (CONFIG.comboMilestones.includes(combo.count)) G.audio.comboMilestone();

  breakCount++;
  if (breakCount % CONFIG.coinEveryBreaks === 0 || G.game.hitValue >= CONFIG.coinBigBreakValue) {
    G.fx.coinFromWorld(x, y, z);
  }
  if (state.vibrate && navigator.vibrate && G.realTime - lastVibrate > 0.12) {
    lastVibrate = G.realTime;
    navigator.vibrate(10);
  }
}

function updateCombo(dt) {
  if (combo.timer <= 0) return;
  combo.timer -= dt;
  if (combo.timer <= 0) {
    combo.count = 0;
    G.fx.comboEnd();
  }
}

// ─── Picture complete: hit-stop → shatter → confetti → banner + bonus →
//     background crossfade → next picture builds in ─────────────────────────
let transitioning = false;
function onPictureComplete() {
  if (transitioning) return;
  transitioning = true;
  G.dropper.paused = true;
  G.hitStop = CONFIG.hitStop;
  const fx = G.fx;
  fx.after(0.001, () => {
    fx.bigShatter(lastBreak.x, lastBreak.y, lastBreak.z, lastBreak.cell, lastBreak.color);
    fx.confetti(110);
    G.scene.addTrauma(CONFIG.shake.complete);
    G.audio.complete();
    if (state.vibrate && navigator.vibrate) navigator.vibrate([30, 40, 90]);
  });
  fx.after(0.3, () => {
    const bonus = G.economy.completeBonus();
    G.economy.earn(bonus);
    fx.banner('+$' + formatMoney(bonus) + ' BONUS');
    const w = G.scene.view.width;
    const h = G.scene.view.height;
    fx.coinShower(CONFIG.completeCoins, w / 2, h * 0.42);
  });
  fx.after(1.7, () => {
    G.grid.load(G.grid.pictureIndex + 1);
    G.grid.buildIn();
    G.board.setBackground(G.grid.picture.bg, 0.7);
    G.dropper.paused = false; // releases wait until the build-in finishes
    transitioning = false;
    save();
  });
}

function skipPicture() {
  if (transitioning || G.grid.building) return;
  const grid = G.grid;
  lastBreak.x = grid.x0 + grid.cols * grid.cell * 0.5;
  lastBreak.y = grid.y0 + grid.rows * grid.cell * 0.5;
  lastBreak.z = grid.cell * 0.5;
  lastBreak.cell = grid.cell;
  lastBreak.color.set(0xffffff);
  grid.clearAll();
  onPictureComplete();
}

function step(dt) {
  G.time += dt;
  updateCombo(dt);
  G.dropper.update(dt);
  G.balls.update(dt);
  G.grid.update(dt);
  G.fx.update(dt);
  G.board.update(dt);
  G.economy.update(dt);
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(Math.max(0, (now - last) / 1000), CONFIG.maxDelta);
  last = now;
  G.realTime += realDt;
  let simDt = realDt * G.speed;
  if (G.hitStop > 0) {
    G.hitStop -= realDt;
    simDt = 0;
  }
  const steps = Math.max(1, Math.ceil(simDt / CONFIG.maxSubstep - 1e-6));
  if (simDt > 0) for (let i = 0; i < steps; i++) step(simDt / steps);
  G.scene.update(realDt);
  G.ui.update(realDt);
  G.fx.updateOverlay(realDt);
  G.debug.update(realDt);
  G.scene.render();
}

boot();
