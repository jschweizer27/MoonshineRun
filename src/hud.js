// Thin wrapper over the DOM HUD and overlay screens. Keeps Three.js code free of
// document lookups.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), cash: $('cash'), stars: $('stars'), heatStatus: $('heat-status'),
      heatMeter: $('heat-meter'), heatFill: $('heat-meter').firstElementChild,
      objectiveText: $('objective-text'), objectiveDist: $('objective-dist'), objective: $('objective'), arrow: $('objective-arrow'),
      cargo: $('cargo'), speed: $('speed'), toast: $('toast'), cashPop: $('cash-pop'), flash: $('flash'),
      bust: $('bust'), bustFill: $('bust').querySelector('.meter > div'),
      hint: $('hint'), hintText: $('hint-text'), mute: $('btn-mute'),
      gameover: $('gameover'), gameoverMsg: $('gameover-msg'),
      finalCash: $('final-cash'), finalRuns: $('final-runs'), bestCash: $('best-cash'), newBest: $('new-best'),
    };
    this.onHintClose = () => {};
    $('hint-close').addEventListener('click', () => this.onHintClose());
    this._toastTimer = null;
    this._last = {};
    this._cashShown = 0;
    this._cashAnim = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  _set(key, value, fn) {
    if (this._last[key] === value) return;
    this._last[key] = value;
    fn(value);
  }

  // Counts up to the new total when `animate` is set.
  setCash(v, animate = false) {
    cancelAnimationFrame(this._cashAnim);
    const render = (n) => { this.el.cash.textContent = `$${Math.round(n).toLocaleString()}`; };
    if (!animate) { this._cashShown = v; render(v); return; }
    const from = this._cashShown, t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 900);
      this._cashShown = from + (v - from) * (1 - (1 - k) ** 3);
      render(this._cashShown);
      if (k < 1) this._cashAnim = requestAnimationFrame(tick);
    };
    tick();
  }

  cashPop(text) {
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
  setSpeed(mph) { this._set('speed', mph, () => { this.el.speed.textContent = mph; }); }
  setMuted(m) { this.el.mute.classList.toggle('muted', m); this.el.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); }

  // tier: whole stars. status: incoming | seen | closing | evading | ''.
  // meter: 0..1, shown red while heat builds and blue while you're shaking them.
  setHeat(tier, status, meter, mode) {
    this._set('tier', tier, () => {
      [...this.el.stars.children].forEach((s, k) => s.classList.toggle('on', k < tier));
      this.el.stars.parentElement.classList.toggle('hot', tier > 0);
    });
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
    this._set('objective', text, () => { this.el.objectiveText.textContent = text; });
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
