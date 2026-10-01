// Thin wrapper over the DOM HUD and overlay screens. Keeps Three.js code free of
// document lookups.
import { JUICE, juice } from './juice.js';

const $ = (id) => document.getElementById(id);
// Restart a CSS animation class on an element (remove, force a reflow, add).
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), cash: $('cash'), stars: $('stars'), heatStatus: $('heat-status'),
      heatMeter: $('heat-meter'), heatFill: $('heat-meter').firstElementChild,
      objectiveText: $('objective-text'), objectiveDist: $('objective-dist'), objective: $('objective'), arrow: $('objective-arrow'),
      cargo: $('cargo'), speed: $('speed'), toast: $('toast'), cashPop: $('cash-pop'), flash: $('flash'),
      bust: $('bust'), bustFill: $('bust').querySelector('.meter > div'),
      hint: $('hint'), hintText: $('hint-text'), mute: $('btn-mute'),
      gameover: $('gameover'), gameoverMsg: $('gameover-msg'), heat: $('heat'), siren: $('siren-flash'),
      finalCash: $('final-cash'), finalRuns: $('final-runs'), bestCash: $('best-cash'), newBest: $('new-best'),
    };
    this.onHintClose = () => {};
    $('hint-close').addEventListener('click', () => this.onHintClose());
    this._toastTimer = null;
    this._last = {};
    this._cashShown = 0;
    this._cashAnim = null;
    this._speedShown = 0;
    this._tier = 0;
    this._meter = 0;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  // 'bootleg' or 'dredge' (no heat, no bust bar).
  setMode(mode) { this.el.hud.classList.toggle('dredge', mode === 'dredge'); }
  hide() { this.el.hud.classList.add('hidden'); }

  _set(key, value, fn) {
    if (this._last[key] === value) return;
    this._last[key] = value;
    fn(value);
  }

  // Rolls up to the new total when `animate` is set, the counter swelling as it goes
  // (JUICE.ui.cashRoll, cashPop).
  setCash(v, animate = false) {
    cancelAnimationFrame(this._cashAnim);
    const render = (n) => { this.el.cash.textContent = `$${Math.round(n).toLocaleString()}`; };
    const roll = juice('ui', 'cashRoll');
    if (!animate || !roll) { this._cashShown = v; render(v); return; }
    if (juice('ui', 'cashPop')) {
      this.el.cash.style.setProperty('--pop', 1 + 0.35 * JUICE.ui.cashPop);
      this.el.cash.style.setProperty('--roll', `${roll}s`);
      replay(this.el.cash, 'pop');
    }
    const from = this._cashShown, t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / (roll * 1000));
      this._cashShown = from + (v - from) * (1 - (1 - k) ** 3);
      render(this._cashShown);
      if (k < 1) this._cashAnim = requestAnimationFrame(tick);
    };
    tick();
  }

  cashPop(text) {
    if (!juice('ui', 'floatText')) return;
    const p = this.el.cashPop;
    p.textContent = text;
    p.classList.remove('show');
    void p.offsetWidth;          // restart the animation
    p.classList.add('show');
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('hit');
    void f.offsetWidth;
    f.classList.add('hit');
  }

  setCargo(loaded, detail = '') {
    this.el.cargo.classList.toggle('hidden', !loaded);
    this.el.cargo.textContent = detail ? `CARGO: ${detail}` : 'CARGO: LOADED';
  }

  setClock(text) { this._set('clock', text, () => { $('clock').textContent = text; }); }

  // pill: null or [kind, text] where kind is disguised | speeding | safe
  setStatusPill(pill) {
    const key = pill ? pill.join('|') : '';
    this._set('pill', key, () => {
      const p = $('status-pill');
      p.classList.toggle('hidden', !pill);
      if (!pill) return;
      p.className = `pill ${pill[0]}`;
      p.textContent = pill[1];
    });
  }
  // The speedometer eases toward the real speed instead of snapping (JUICE.ui.speedEase).
  setSpeed(mph, dt = 0) {
    const k = juice('ui', 'speedEase');
    this._speedShown = k && dt ? this._speedShown + (mph - this._speedShown) * (1 - Math.exp(-k * dt)) : mph;
    const shown = Math.round(this._speedShown);
    this._set('speed', shown, () => { this.el.speed.textContent = shown; });
  }

  // The law has spotted you: red and blue flash round the screen edges.
  sirenFlash() {
    if (!juice('ui', 'spottedFlash')) return;
    this.el.siren.style.setProperty('--strength', JUICE.ui.spottedFlash);
    replay(this.el.siren, 'on');
  }
  setMuted(m) { this.el.mute.classList.toggle('muted', m); this.el.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); }

  // tier: whole stars. status: incoming | seen | closing | evading | ''.
  // meter: 0..1, shown red while heat builds and blue while you're shaking them.
  setHeat(tier, status, meter, mode) {
    this._set('tier', tier, () => {
      [...this.el.stars.children].forEach((s, k) => s.classList.toggle('on', k < tier));
      this.el.stars.parentElement.classList.toggle('hot', tier > 0);
      // A new star: the heat display jumps and shakes.
      if (tier > this._tier && juice('ui', 'heatPulse')) replay(this.el.heat, 'bump');
      this._tier = tier;
    });
    // The meter throbs while the heat builds.
    const rising = mode === 'building' && meter > this._meter + 1e-4 && juice('ui', 'heatPulse') > 0;
    this._meter = meter;
    this._set('rising', rising, (on) => this.el.heatMeter.classList.toggle('rising', on));
    const label = { incoming: 'COPS INCOMING', seen: 'THEY SEE YOU', closing: 'COPS CLOSING IN!', evading: 'LOSING THEM…' }[status] || '';
    this._set('heatStatus', label, () => {
      this.el.heatStatus.textContent = label;
      this.el.heatStatus.classList.toggle('alarm', status === 'closing');
    });
    this._set('heatMode', mode, () => {
      this.el.heatMeter.classList.toggle('building', mode === 'building');
      this.el.heatMeter.classList.toggle('idle', !mode);
    });
    this.el.heatFill.style.transform = `scaleX(${Math.max(0, Math.min(1, meter)).toFixed(3)})`;
  }

  setBust(v) {
    this._set('bustOn', v > 0.01, (on) => this.el.bust.classList.toggle('hidden', !on));
    this.el.bustFill.style.transform = `scaleX(${Math.min(1, v).toFixed(3)})`;
  }

  // bearing: radians from straight ahead (positive = to the right).
  setObjective(text, meters, kind, bearing = 0) {
    this.el.arrow.style.transform = `rotate(${Math.round((bearing * 180) / Math.PI)}deg)`;
    this._set('objective', text, () => {
      this.el.objectiveText.textContent = text;
      // A new objective slides in from above (JUICE.ui.bannerSlide).
      const t = juice('ui', 'bannerSlide');
      if (t) { this.el.objective.style.setProperty('--slide', `${t}s`); replay(this.el.objective, 'slide'); }
    });
    this._set('dist', meters, () => { this.el.objectiveDist.textContent = meters == null ? '' : `${meters} m`; });
    this._set('kind', kind, () => { this.el.objective.dataset.kind = kind; });
  }

  toast(text, tone = '', ms = 2200) {
    const t = this.el.toast;
    t.textContent = text;
    t.className = `show ${tone}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.className = ''; }, ms);
  }

  showHint(text) {
    this.el.hintText.textContent = text;
    this.el.hint.classList.remove('hidden');
  }

  hideHint() { this.el.hint.classList.add('hidden'); }

  fillGameOver({ cash, runs, best, isBest, msg }) {
    this.el.finalCash.textContent = `$${cash.toLocaleString()}`;
    this.el.finalRuns.textContent = runs;
    this.el.bestCash.textContent = `$${best.toLocaleString()}`;
    this.el.newBest.classList.toggle('hidden', !isBest);
    this.el.gameoverMsg.textContent = msg;
  }
}
