// Game state + save/load (localStorage).
import { CONFIG } from './config.js';

// Registry of live systems (scene, grid, balls, fx …). Modules read each other
// through this at runtime, which keeps imports acyclic.
export const G = {
  time: 0, // simulation time (s), affected by game speed & hit-stop
  realTime: 0, // wall-clock time (s)
  speed: 1, // debug game speed multiplier
};

const SAVE_KEY = 'pixel-crusher-save-v2'; // v2: physics gameplay (old saves don't carry over)

// Everything that persists between sessions.
export const state = {
  money: CONFIG.startMoney,
  ballValues: CONFIG.startBalls.slice(),
  upgrades: { add: 0, merge: 0, income: 0 },
  incomeMultiplier: 1,
  pictureIndex: 0,
  gridHp: null, // remaining HP per cell of the current picture (null = fresh)
  muted: false,
  vibrate: CONFIG.vibrateDefault,
  totalEarned: 0,
};

export function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    if (typeof s.money === 'number' && isFinite(s.money)) state.money = s.money;
    if (Array.isArray(s.ballValues) && s.ballValues.length) {
      state.ballValues = s.ballValues
        .filter((v) => Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0)
        .slice(0, CONFIG.pipeCapacity);
      if (!state.ballValues.length) state.ballValues = CONFIG.startBalls.slice();
    }
    if (s.upgrades) {
      for (const k of ['add', 'merge', 'income']) {
        if (Number.isInteger(s.upgrades[k])) state.upgrades[k] = s.upgrades[k];
      }
    }
    if (typeof s.incomeMultiplier === 'number') state.incomeMultiplier = s.incomeMultiplier;
    if (Number.isInteger(s.pictureIndex)) state.pictureIndex = s.pictureIndex;
    if (Array.isArray(s.gridHp)) state.gridHp = s.gridHp;
    if (typeof s.muted === 'boolean') state.muted = s.muted;
    if (typeof s.vibrate === 'boolean') state.vibrate = s.vibrate;
    if (typeof s.totalEarned === 'number') state.totalEarned = s.totalEarned;
    return true;
  } catch {
    return false;
  }
}

// Pull live data from the systems into `state`, then write it.
export function writeSave() {
  if (G.balls) state.ballValues = G.balls.saveValues();
  if (G.grid) {
    if (G.grid.aliveCount === 0) {
      // Mid picture-complete transition: resume on the next picture.
      state.pictureIndex = G.grid.pictureIndex + 1;
      state.gridHp = null;
    } else {
      state.pictureIndex = G.grid.pictureIndex;
      state.gridHp = G.grid.serialize();
    }
  }
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        money: state.money,
        ballValues: state.ballValues,
        upgrades: state.upgrades,
        incomeMultiplier: state.incomeMultiplier,
        pictureIndex: state.pictureIndex,
        gridHp: state.gridHp,
        muted: state.muted,
        vibrate: state.vibrate,
        totalEarned: state.totalEarned,
      }),
    );
  } catch {
    /* storage full or blocked — the game still runs */
  }
}

let resetting = false;
export function resetSave() {
  resetting = true;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  location.reload();
}

export function isResetting() {
  return resetting;
}
