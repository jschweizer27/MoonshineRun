// Thin wrapper over the DOM HUD and overlay screens. Keeps Three.js code free of
// document lookups.
import { JUICE, juice } from './juice.js';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
// Restart a CSS animation class on an element (remove, force a reflow, add).
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), cash: $('cash'),
      objectiveText: $('objective-text'), objectiveDist: $('objective-dist'), objective: $('objective'), arrow: $('objective-arrow'),
      cargo: $('cargo'), speed: $('speed'), toast: $('toast'), cashPop: $('cash-pop'), mute: $('btn-mute'),
    };
    this._toastTimer = null;
    this._last = {};
    this._cashShown = 0;
    this._cashAnim = null;
    this._speedShown = 0;
    // The palette (CONFIG.dredge.palette) on every screen, as --d-* CSS variables (e.g.
    // --d-shadow-teal); styles.css themes everything under html.dredge.
    const root = document.documentElement;
    root.classList.add('dredge');
    this.el.hud.classList.add('dredge');
    for (const [k, v] of Object.entries(CONFIG.dredge.palette)) root.style.setProperty(`--d-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v);
  }

  show() { this.el.hud.classList.remove('hidden'); }
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

  // The trunk pill: how full the trunk is.
  setCargo(text) {
    this._set('cargo', text, () => { this.el.cargo.textContent = text; });
  }

  setClock(text) { this._set('clock', text, () => { $('clock').textContent = text; }); }

  // The speedometer eases toward the real speed instead of snapping (JUICE.ui.speedEase).
  setSpeed(mph, dt = 0) {
    const k = juice('ui', 'speedEase');
    this._speedShown = k && dt ? this._speedShown + (mph - this._speedShown) * (1 - Math.exp(-k * dt)) : mph;
    const shown = Math.round(this._speedShown);
    this._set('speed', shown, () => { this.el.speed.textContent = shown; });
  }

  setMuted(m) { this.el.mute.classList.toggle('muted', m); this.el.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); }

  // bearing: radians from straight ahead (positive = to the right).
  setObjective(text, meters, kind, bearing = 0) {
    this.el.arrow.style.transform = `rotate(${Math.round((bearing * 180) / Math.PI)}deg)`;
    this._set('objective', text, () => {
      this.el.objectiveText.textContent = text;
      // A new objective slides in from above (JUICE.ui.bannerSlide).
      const t = juice('ui', 'bannerSlide');
      if (t) { this.el.objective.style.setProperty('--slide', `${t}s`); replay(this.el.objective, 'slide'); }
    });
    this._set('dist', meters, () => { this.el.objectiveDist.textContent = meters == null ? '' : typeof meters === 'string' ? meters : `${meters} m`; });
    this._set('kind', kind, () => { this.el.objective.dataset.kind = kind; });
  }

  toast(text, tone = '', ms = 2200) {
    const t = this.el.toast;
    t.textContent = text;
    t.className = `show ${tone}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.className = ''; }, ms);
  }
}
