// Lightweight procedural audio (no asset files): an engine drone whose pitch
// tracks speed, plus a wavering siren when the heat is on. Created lazily after a
// user gesture so browsers allow it.
export class Audio {
  constructor() {
    this.ctx = null;
    this.engine = null;
    this.engineGain = null;
    this.siren = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.enabled = false;
  }

  start() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return; // audio simply unavailable
    }

    // Engine: sawtooth drone.
    this.engine = this.ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 60;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.04;
    this.engine.connect(this.engineGain).connect(this.ctx.destination);
    this.engine.start();

    // Siren: square wave modulated by a slow LFO, muted until heat rises.
    this.siren = this.ctx.createOscillator();
    this.siren.type = 'square';
    this.siren.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.ctx.destination);

    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.frequency.value = 4;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 120;
    this.sirenLfo.connect(lfoGain).connect(this.siren.frequency);
    this.siren.start();
    this.sirenLfo.start();

    this.enabled = true;
  }

  // speed01: 0..1 of max speed. wanted: 0..3.
  update(speed01, wanted) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.03 + speed01 * 0.05, t, 0.1);
    this.sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.025 : 0, t, 0.2);
  }

  stop() {
    if (this.sirenGain) this.sirenGain.gain.value = 0;
  }
}
