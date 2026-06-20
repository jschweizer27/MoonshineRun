// Thin wrapper over the DOM HUD + overlay screens. Keeps Three.js code free of
// document lookups.
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      cash: document.getElementById('cash'),
      wantedBadges: document.getElementById('wanted-badges'),
      objective: document.getElementById('objective'),
      cargo: document.getElementById('cargo'),
      speedo: document.getElementById('speedo'),
      intro: document.getElementById('intro'),
      gameover: document.getElementById('gameover'),
      gameoverMsg: document.getElementById('gameover-msg'),
      finalCash: document.getElementById('final-cash'),
      finalRuns: document.getElementById('final-runs'),
    };
    this._objectiveTimer = null;
    this._baseObjective = 'Drive to the still';
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setCash(v) { this.el.cash.textContent = `$${v.toLocaleString()}`; }

  setWanted(level) {
    this.el.wantedBadges.textContent = '★'.repeat(level);
  }

  setCargo(loaded) {
    this.el.cargo.classList.toggle('hidden', !loaded);
  }

  setSpeed(mph) { this.el.speedo.textContent = `${mph} mph`; }

  setObjective(text) {
    this._baseObjective = text;
    if (!this._objectiveTimer) this.el.objective.textContent = text;
  }

  // Briefly show a message, then revert to the standing objective.
  flashObjective(text, ms = 2200) {
    this.el.objective.textContent = text;
    if (this._objectiveTimer) clearTimeout(this._objectiveTimer);
    this._objectiveTimer = setTimeout(() => {
      this.el.objective.textContent = this._baseObjective;
      this._objectiveTimer = null;
    }, ms);
  }

  showGameOver(cash, runs, msg) {
    this.el.finalCash.textContent = `$${cash.toLocaleString()}`;
    this.el.finalRuns.textContent = runs;
    if (msg) this.el.gameoverMsg.textContent = msg;
    this.el.gameover.classList.remove('hidden');
  }

  hideGameOver() { this.el.gameover.classList.add('hidden'); }
  hideIntro() { this.el.intro.classList.add('hidden'); }
}
