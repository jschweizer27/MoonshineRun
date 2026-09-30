// Procedural audio (no asset files): an engine drone whose pitch tracks speed and a
// wailing siren while the heat is on. Everything runs through one master gain so it can
// be faded out on the busted screen and when paused. Created after a user gesture so
// browsers allow it.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.active = false;
  }

  start() {
    if (this.ctx) { this.setActive(true); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;   // audio unavailable; the game plays silently
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engine.start();

    this.siren = ctx.createOscillator();
    this.siren.type = 'triangle';
    this.siren.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.master);
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.9;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    this.sirenLfo.connect(lfoDepth).connect(this.siren.frequency);
    this.siren.start();
    this.sirenLfo.start();

    this.enabled = true;
    this.setActive(true);
  }

  // speed01: 0..1 of top speed. siren01: 0..1 loudness (nearby pursuers).
  update(speed01, siren01) {
    if (!this.enabled || !this.active) return;
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(48 + speed01 * 120, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 1400, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.08);
    this.sirenGain.gain.setTargetAtTime(0.045 * siren01, t, 0.15);
  }

  // Fade the engine and siren to silence (busted screen, menus).
  setActive(on) {
    this.active = on;
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!on) {
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      this.sirenGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }
}
