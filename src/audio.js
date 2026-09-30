// Procedural audio (no asset files). Everything routes through master -> (music | sfx)
// buses so volume settings, mute and pause apply everywhere. Created after a user
// gesture so browsers allow it.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.active = false;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.9, muted: false };
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
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);

    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.sfx);
    this.engine.start();

    this.siren = ctx.createOscillator();
    this.siren.type = 'triangle';
    this.siren.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.sfx);
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.frequency.value = 0.9;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    this.sirenLfo.connect(lfoDepth).connect(this.siren.frequency);
    this.siren.start();
    this.sirenLfo.start();

    this.enabled = true;
    this.setVolumes(this.volumes);
    this.setActive(true);
  }

  setVolumes(v) {
    this.volumes = { ...this.volumes, ...v };
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.03);
    this.music.gain.setTargetAtTime(this.volumes.music, t, 0.03);
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

  // Fade the engine and siren to silence (busted screen, title).
  setActive(on) {
    this.active = on;
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
    if (!on) {
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      this.sirenGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  // Freeze all sound while the game is paused.
  setPaused(p) {
    this.paused = p;
    if (!this.enabled) return;
    if (p) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  // Two-tone "ah-oo-gah" klaxon.
  horn() {
    if (!this.enabled || this.paused) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.linearRampToValueAtTime(420, t + 0.18);
    o.frequency.setValueAtTime(420, t + 0.4);
    o.frequency.linearRampToValueAtTime(300, t + 0.62);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.03);
    g.gain.setValueAtTime(0.35, t + 0.58);
    g.gain.linearRampToValueAtTime(0, t + 0.68);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.7);
  }

  // Short noisy thud for collisions; strength 0..1.
  crash(strength = 0.5) {
    if (!this.enabled || this.paused) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.25 + 0.5 * strength;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
  }
}
