// Money, upgrade costs & purchases, income-per-second tracking.
import { CONFIG } from './config.js';
import { G, state } from './state.js';

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

// 999 · 1.2K · 45.6K · 123K · 3.4M · 1.2B …
export function formatMoney(n) {
  n = Math.floor(Math.max(0, n));
  if (n < 1000) return String(n);
  let i = 0;
  let v = n;
  while (v >= 1000 && i < SUFFIX.length - 1) {
    v /= 1000;
    i++;
  }
  const s = v < 100 ? (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(v));
  return s + SUFFIX[i];
}

export class Economy {
  constructor() {
    this.window = new Float64Array(CONFIG.incomeWindow); // money earned per 1s bucket
    this.windowIdx = 0;
    this.windowFilled = 0;
    this.windowTime = 0;
    this.bucket = 0;
  }

  cost(kind) {
    const u = CONFIG.upgrades[kind];
    return Math.ceil(u.baseCost * Math.pow(u.growth, state.upgrades[kind]));
  }

  earn(amount) {
    state.money += amount;
    state.totalEarned += amount;
    this.bucket += amount;
  }

  // Money per hit = damage actually applied × income multiplier.
  earnFromHit(applied, x, y, z) {
    const m = applied * state.incomeMultiplier;
    this.earn(m);
    G.fx.moneyPopup(m, x, y, z);
  }

  get incomePerSecond() {
    if (!this.windowFilled) return this.bucket / Math.max(0.5, this.windowTime);
    let sum = 0;
    for (let i = 0; i < this.windowFilled; i++) sum += this.window[i];
    return sum / this.windowFilled;
  }

  update(dt) {
    this.windowTime += dt;
    while (this.windowTime >= 1) {
      this.windowTime -= 1;
      this.window[this.windowIdx] = this.bucket;
      this.bucket = 0;
      this.windowIdx = (this.windowIdx + 1) % this.window.length;
      this.windowFilled = Math.min(this.window.length, this.windowFilled + 1);
    }
  }

  // 'ok' (affordable) | 'poor' (can't afford) | 'full' | 'nopair' (disabled)
  status(kind) {
    if (kind === 'add' && G.balls.count >= CONFIG.pipeCapacity) return 'full';
    if (kind === 'merge' && !G.balls.canMerge()) return 'nopair';
    return state.money >= this.cost(kind) ? 'ok' : 'poor';
  }

  buy(kind) {
    const st = this.status(kind);
    if (st !== 'ok') return st;
    state.money -= this.cost(kind);
    state.upgrades[kind]++;
    if (kind === 'add') {
      G.balls.addBall(2);
      G.audio.addBall();
    } else if (kind === 'merge') {
      G.balls.requestMerge();
    } else if (kind === 'income') {
      state.incomeMultiplier = 1 + CONFIG.incomeStep * state.upgrades.income;
    }
    G.audio.purchase();
    return 'ok';
  }

  // Picture bonus = completeBonus × current income per second (with a floor).
  completeBonus() {
    return Math.max(
      CONFIG.completeBonus * this.incomePerSecond,
      CONFIG.completeBonusMin * state.incomeMultiplier * (1 + G.grid.pictureIndex),
    );
  }
}
