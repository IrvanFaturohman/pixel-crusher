// HTML overlay: money counter, picture label, progress bar, upgrade buttons,
// mute + settings (reset progress). DOM is only touched when values change.
import { G, state, resetSave } from './state.js';
import { formatMoney } from './economy.js';

const KINDS = ['add', 'merge', 'income'];
const REASON = { full: 'FULL — MERGE!', nopair: 'NO PAIR' };
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(app) {
    this.app = app;
    this.hud = $('hud');
    this.bar = $('bar');
    this.moneyEl = $('money');
    this.moneyPill = $('money-pill');
    this.moneyCoin = $('money-coin');
    this.picNum = $('pic-num');
    this.picName = $('pic-name');
    this.progress = $('progress');
    this.progressFill = $('progress-fill');
    this.progressText = $('progress-text');
    this.incomeMult = $('income-mult');
    this.muteBtn = $('btn-mute');

    this.buttons = {};
    for (const kind of KINDS) {
      const el = $('upg-' + kind);
      this.buttons[kind] = {
        el,
        lvl: el.querySelector('.upg-lvl b'),
        cost: el.querySelector('.upg-cost b'),
        costBox: el.querySelector('.upg-cost'),
        reason: el.querySelector('.upg-reason'),
        cls: '',
        lvlNum: -1,
        reasonText: '',
      };
    }

    this.displayMoney = state.money;
    this.moneyText = '';
    this.displayProgress = 0;
    this.shownProgress = -1;
    this.lastQuarter = 0;
    this.progressText_ = '';
    this.gridVersion = -1;
    this.pictureIndex = -1;
    this.multNum = -1;
    this.bumpAnim = null;
    this.coinTarget = { x: 40, y: 40 };

    this.bindButtons();
    this.bindSettings();
    this.syncMute();
  }

  // Pixel insets used to fit the camera between HUD and buttons.
  insets() {
    const a = this.app.getBoundingClientRect();
    const h = this.hud.getBoundingClientRect();
    const b = this.bar.getBoundingClientRect();
    const c = this.moneyCoin.getBoundingClientRect();
    this.coinTarget.x = c.left + c.width / 2 - a.left;
    this.coinTarget.y = c.top + c.height / 2 - a.top;
    return { top: h.bottom - a.top + 4, bottom: a.bottom - b.top + 2 };
  }

  // ── Buttons ────────────────────────────────────────────────────────────
  bindButtons() {
    for (const kind of KINDS) {
      const { el } = this.buttons[kind];
      el.addEventListener('pointerdown', () => {
        el.classList.add('pressed');
        G.audio.unlock();
      });
      const release = () => {
        if (!el.classList.contains('pressed')) return;
        el.classList.remove('pressed');
        el.animate(
          [{ transform: 'scale(0.92)' }, { transform: 'scale(1.05)', offset: 0.55 }, { transform: 'scale(1)' }],
          { duration: 240, easing: 'ease-out' },
        );
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('click', () => this.onBuy(kind));
    }
  }

  onBuy(kind) {
    const b = this.buttons[kind];
    const result = G.economy.buy(kind);
    if (result === 'ok') {
      b.el.animate([{ filter: 'brightness(1.75)' }, { filter: 'brightness(1)' }], { duration: 280, easing: 'ease-out' });
      b.costBox.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], {
        duration: 320,
        easing: 'cubic-bezier(.2,1.7,.4,1)',
      });
      G.fx.buttonSparkles(b.el);
      this.refreshButtons();
    } else {
      b.el.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-9px)' },
          { transform: 'translateX(8px)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 320, easing: 'ease-out' },
      );
      G.audio.denied();
    }
  }

  refreshButtons() {
    for (const kind of KINDS) {
      const b = this.buttons[kind];
      const st = G.economy.status(kind);
      const cls = st === 'ok' ? 'ok' : st === 'poor' ? 'poor' : 'disabled';
      if (cls !== b.cls) {
        if (b.cls) b.el.classList.remove(b.cls);
        b.el.classList.add(cls);
        b.cls = cls;
      }
      const reason = REASON[st] || '';
      if (reason !== b.reasonText) {
        b.reason.textContent = reason;
        b.reasonText = reason;
      }
      // Cost / level text only change with the purchase count.
      const lvl = state.upgrades[kind];
      if (lvl !== b.lvlNum) {
        b.lvlNum = lvl;
        b.lvl.textContent = String(lvl);
        b.cost.textContent = formatMoney(G.economy.cost(kind));
      }
    }
    if (state.incomeMultiplier !== this.multNum) {
      this.multNum = state.incomeMultiplier;
      this.incomeMult.textContent = '×' + state.incomeMultiplier.toFixed(2).replace(/\.00$/, '');
    }
  }

  // Money counter bump when a coin lands.
  bumpMoney() {
    if (this.bumpAnim) this.bumpAnim.cancel();
    this.bumpAnim = this.moneyPill.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], {
      duration: 180,
      easing: 'ease-out',
    });
  }

  // ── Settings / mute ────────────────────────────────────────────────────
  bindSettings() {
    const modal = $('modal');
    const viewSettings = $('view-settings');
    const viewConfirm = $('view-confirm');
    const optSound = $('opt-sound');
    const optVibrate = $('opt-vibrate');
    const open = () => {
      optSound.checked = !state.muted;
      optVibrate.checked = state.vibrate;
      viewSettings.classList.remove('hidden');
      viewConfirm.classList.add('hidden');
      modal.classList.remove('hidden');
    };
    const close = () => modal.classList.add('hidden');
    $('btn-settings').addEventListener('click', () => {
      G.audio.unlock();
      open();
    });
    $('btn-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    optSound.addEventListener('change', () => this.setMuted(!optSound.checked));
    optVibrate.addEventListener('change', () => {
      state.vibrate = optVibrate.checked;
    });
    $('btn-reset').addEventListener('click', () => {
      viewSettings.classList.add('hidden');
      viewConfirm.classList.remove('hidden');
    });
    $('btn-reset-no').addEventListener('click', () => {
      viewConfirm.classList.add('hidden');
      viewSettings.classList.remove('hidden');
    });
    $('btn-reset-yes').addEventListener('click', () => resetSave());
    this.muteBtn.addEventListener('click', () => {
      G.audio.unlock();
      this.setMuted(!state.muted);
    });
  }

  setMuted(m) {
    state.muted = m;
    G.audio.setMuted(m);
    this.syncMute();
  }

  syncMute() {
    this.muteBtn.classList.toggle('muted', state.muted);
  }

  // Page background follows the board colour (linear THREE.Color in).
  setBackground(color) {
    const hex = '#' + color.getHexString();
    if (hex !== this.bgHex) {
      this.bgHex = hex;
      this.app.style.setProperty('--bg', hex);
    }
  }

  // ── Per frame ─────────────────────────────────────────────────────────
  update(dt) {
    // Rolling money counter.
    const diff = state.money - this.displayMoney;
    if (diff !== 0 || !this.moneyText) {
      if (Math.abs(diff) < 0.5) this.displayMoney = state.money;
      else this.displayMoney += diff * (1 - Math.exp(-dt * 9));
      const txt = formatMoney(this.displayMoney);
      if (txt !== this.moneyText) {
        this.moneyEl.textContent = txt;
        this.moneyText = txt;
      }
    }

    // Picture label.
    const grid = G.grid;
    if (grid.pictureIndex !== this.pictureIndex) {
      this.pictureIndex = grid.pictureIndex;
      this.picNum.textContent = '#' + (grid.pictureIndex + 1);
      this.picName.textContent = grid.picture.name;
      this.displayProgress = grid.progress;
      this.lastQuarter = Math.floor(this.displayProgress * 4);
    }

    // Eased progress bar with pulses at 25 / 50 / 75 %.
    const p = grid.progress;
    if (p < this.displayProgress) this.displayProgress = p;
    else this.displayProgress += (p - this.displayProgress) * (1 - Math.exp(-dt * 7));
    if (Math.abs(this.displayProgress - this.shownProgress) > 0.0005) {
      this.shownProgress = this.displayProgress;
      this.progressFill.style.width = `calc((100% - 1.8cqw) * ${this.displayProgress.toFixed(4)})`;
    }
    const q = Math.floor(this.displayProgress * 4 + 1e-4);
    if (q > this.lastQuarter && q >= 1 && q <= 3) {
      this.progress.classList.remove('pulse');
      void this.progress.offsetWidth; // restart the animation
      this.progress.classList.add('pulse');
      this.progress.animate([{ transform: 'scaleY(1.35)' }, { transform: 'scaleY(1)' }], {
        duration: 380,
        easing: 'cubic-bezier(.2,1.6,.4,1)',
      });
    }
    this.lastQuarter = q;
    const pt = Math.floor(p * 100) + '%';
    if (pt !== this.progressText_) {
      this.progressText.textContent = pt;
      this.progressText_ = pt;
    }

    this.refreshButtons();
  }
}
