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
    this._toastNow = null;
    this._queue = [];
    this._held = [];                 // gold/red news that came while a screen covered the HUD
    this.covered = () => false;      // (main: a screen is open)
    this.log = [];
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

  // It goes again after its animation (with reduced motion there's no animation to end it).
  cashPop(text) {
    if (!juice('ui', 'floatText')) return;
    if (this.covered()) this._heldPop = text;          // (and again once the screen closes)
    const p = this.el.cashPop;
    p.textContent = text;
    p.classList.remove('show');
    void p.offsetWidth;          // restart the animation
    p.classList.add('show');
    clearTimeout(this._popTimer);
    this._popTimer = setTimeout(() => p.classList.remove('show'), 1700);
  }

  // The trunk pill: how full the trunk is.
  setCargo(text) {
    this._set('cargo', text, () => { this.el.cargo.textContent = text; });
  }

  // The time, then the weather and nerves after a dot (a short landscape phone shows the
  // time alone: styles.css hides .clock-extra there; the clock's colour still has the nerves).
  setClock(text) {
    this._set('clock', text, () => {
      const el = $('clock'), i = text.indexOf(' · ');
      if (i < 0) { el.textContent = text; return; }
      el.textContent = text.slice(0, i);
      const x = document.createElement('span');
      x.className = 'clock-extra';
      x.textContent = text.slice(i);
      el.append(x);
    });
  }
  // The clock takes the colour of Otto's nerves ('' steady, or uneasy / rattled / frayed).
  setNerves(word) { this._set('nerves', word, () => { $('clock').dataset.nerves = word; }); }

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

  // A toast shows at once. One it cuts short that mattered (gold or red news) waits and
  // comes back after it, so nothing important is lost under the next; the same text is never
  // queued twice, and the queue keeps the latest few. `log` is the last toasts (tests).
  // News that comes while a screen covers the HUD (the trunk, a market, a card) is shown
  // again when it closes (`release`), so it's never missed.
  toast(text, tone = '', ms = 2200) {
    if ((tone === 'gold' || tone === 'red') && this.covered()) this._held = this._held.filter((h) => h.text !== text).concat({ text, tone, ms: Math.max(ms, 2500) }).slice(-4);
    const cur = this._toastNow, left = cur ? cur.until - performance.now() : 0;
    if (cur && cur.text !== text && (cur.tone === 'gold' || cur.tone === 'red') && left > 600) this._queue.unshift({ text: cur.text, tone: cur.tone, ms: Math.max(1500, left) });
    this._queue = this._queue.filter((q, i, all) => q.text !== text && all.findIndex((r) => r.text === q.text) === i).slice(0, 4);
    this._showToast({ text, tone, ms });
  }

  // The screens are closed: what came under them again, the latest first (the rest after
  // it), and a cash pop that played unseen.
  release() {
    const held = this._held;
    this._held = [];
    if (this._heldPop) { const p = this._heldPop; this._heldPop = null; this.cashPop(p); }
    if (!held.length) return;
    const latest = held.pop();
    this._queue = [...held, ...this._queue.filter((q) => !held.some((h) => h.text === q.text) && q.text !== latest.text)].slice(0, 4);
    this._showToast(latest, false);
  }

  _showToast(t, log = true) {
    const el = this.el.toast;
    el.textContent = t.text;
    el.className = `show ${t.tone}`;
    this._toastNow = { ...t, until: performance.now() + t.ms };
    if (log) this.log.push(t.text);
    if (this.log.length > 30) this.log.shift();
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.className = '';
      this._toastNow = null;
      const next = this._queue.shift();
      if (next) this._toastTimer = setTimeout(() => this._showToast(next), 180);
    }, t.ms);
  }
}
