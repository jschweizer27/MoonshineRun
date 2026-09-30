// Thin wrapper over the DOM HUD and overlay screens. Keeps Three.js code free of
// document lookups.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), cash: $('cash'), stars: $('stars'), heatStatus: $('heat-status'),
      evade: $('evade-meter'), evadeFill: $('evade-meter').firstElementChild,
      objectiveText: $('objective-text'), objectiveDist: $('objective-dist'), objective: $('objective'), arrow: $('objective-arrow'),
      cargo: $('cargo'), speed: $('speed'), toast: $('toast'),
      intro: $('intro'), gameover: $('gameover'), gameoverMsg: $('gameover-msg'),
      finalCash: $('final-cash'), finalRuns: $('final-runs'), bestCash: $('best-cash'), newBest: $('new-best'),
    };
    this._toastTimer = null;
    this._last = {};
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  _set(key, value, fn) {
    if (this._last[key] === value) return;
    this._last[key] = value;
    fn(value);
  }

  setCash(v) { this._set('cash', v, () => { this.el.cash.textContent = `$${v.toLocaleString()}`; }); }
  setCargo(loaded) { this._set('cargo', loaded, () => this.el.cargo.classList.toggle('hidden', !loaded)); }
  setSpeed(mph) { this._set('speed', mph, () => { this.el.speed.textContent = mph; }); }

  // tier: whole stars; status: 'incoming' | 'seen' | 'evading' | ''; evade: 0..1
  setHeat(tier, status, evade) {
    this._set('tier', tier, () => {
      [...this.el.stars.children].forEach((s, k) => s.classList.toggle('on', k < tier));
      this.el.stars.parentElement.classList.toggle('hot', tier > 0);
    });
    const label = { incoming: 'COPS INCOMING', seen: 'THEY SEE YOU', evading: 'LOSING THEM…' }[status] || '';
    this._set('heatStatus', label, () => { this.el.heatStatus.textContent = label; });
    this.el.evade.classList.toggle('hidden', status !== 'evading');
    this.el.evadeFill.style.transform = `scaleX(${Math.min(1, evade).toFixed(3)})`;
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

  showGameOver({ cash, runs, best, isBest, msg }) {
    this.el.finalCash.textContent = `$${cash.toLocaleString()}`;
    this.el.finalRuns.textContent = runs;
    this.el.bestCash.textContent = `$${best.toLocaleString()}`;
    this.el.newBest.classList.toggle('hidden', !isBest);
    this.el.gameoverMsg.textContent = msg;
    this.el.gameover.classList.remove('hidden');
  }

  hideGameOver() { this.el.gameover.classList.add('hidden'); }
  showIntro() { this.el.intro.classList.remove('hidden'); }
  hideIntro() { this.el.intro.classList.add('hidden'); }
}
