// Debug panel — toggle with the D key or a three-finger tap.
import { G, state, resetSave } from './state.js';
import { formatMoney } from './economy.js';
import * as pipe from './pipe.js';

const VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

export class Debug {
  constructor(el) {
    this.el = el;
    this.visible = false;
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.statTimer = 0;
    el.innerHTML = `
      <h3>Debug</h3>
      <div class="stats"></div>
      <div class="grp"><button data-a="k">+1K</button><button data-a="m">+1M</button></div>
      <div class="grp"><button data-speed="1">×1</button><button data-speed="3">×3</button><button data-speed="10">×10</button></div>
      <div class="grp"><button data-a="skip">Skip picture</button></div>
      <div class="grp"><select>${VALUES.map((v) => `<option value="${v}">${v}</option>`).join('')}</select><button data-a="add">Add ball</button></div>
      <div class="grp"><button data-a="reset" class="danger">Reset save</button></div>`;
    this.stats = el.querySelector('.stats');
    this.select = el.querySelector('select');
    this.speedBtns = [...el.querySelectorAll('[data-speed]')];
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => this.onClick(e));
    this.syncSpeed();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') this.toggle();
    });
    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length >= 3) this.toggle();
      },
      { passive: true },
    );
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.speed) {
      G.speed = +b.dataset.speed;
      this.syncSpeed();
      return;
    }
    switch (b.dataset.a) {
      case 'k':
        G.economy.earn(1e3);
        break;
      case 'm':
        G.economy.earn(1e6);
        break;
      case 'skip':
        G.game.skipPicture();
        break;
      case 'add':
        G.balls.addBall(+this.select.value);
        break;
      case 'reset':
        resetSave();
        break;
    }
  }

  syncSpeed() {
    for (const b of this.speedBtns) b.classList.toggle('on', +b.dataset.speed === G.speed);
  }

  update(dt) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
    }
    if (!this.visible) return;
    this.statTimer -= dt;
    if (this.statTimer > 0) return;
    this.statTimer = 0.25;
    const b = G.balls;
    this.stats.textContent =
      `FPS        ${this.fps.toFixed(0)}\n` +
      `balls      ${b.count} (pipe ${pipe.queue.length})\n` +
      `merges     ${b.merges.length} active, ${b.pendingMerges} queued\n` +
      `particles  ${G.fx.particleCount}\n` +
      `picture    #${G.grid.pictureIndex + 1} ${G.grid.aliveCount}/${G.grid.totalCount}\n` +
      `cube HP    ${formatMoney(G.grid.maxHp)}\n` +
      `income/s   ${formatMoney(G.economy.incomePerSecond)}\n` +
      `income ×   ${state.incomeMultiplier.toFixed(2)}`;
  }
}
