import { Music } from './music.js';

// Procedural audio (no asset files). Everything routes through master -> (music | sfx)
// buses so volume settings, mute and pause apply everywhere. Created after a user
// gesture so browsers allow it.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.active = false;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.9, muted: false };
    this.radio = true;
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
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.noise = this._noiseBuffer(2);

    // Engine: two saws an octave apart through a lowpass; an LFO on the gain gives the
    // old four-cylinder putter at idle.
    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine2 = ctx.createOscillator();
    this.engine2.type = 'square';
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const putter = ctx.createOscillator();
    putter.frequency.value = 11;
    this.putterDepth = ctx.createGain();
    this.putterDepth.gain.value = 0;
    putter.connect(this.putterDepth).connect(this.engineGain.gain);
    const sub = ctx.createGain();
    sub.gain.value = 0.5;
    this.engine.connect(this.engineFilter);
    this.engine2.connect(sub).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.sfx);
    for (const o of [this.engine, this.engine2, putter]) o.start();

    // Siren: a wailing mechanical siren; its pitch shifts with the Doppler effect.
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

    // Looping noise beds: tyre screech and rain.
    const loop = (freq, q, type = 'bandpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfx);
      src.start();
      return g;
    };
    this.screechGain = loop(2400, 7);
    this.rainGain = loop(1200, 0.4, 'highpass');
    this._cricketAt = 0;

    this.music = new Music(ctx, this.musicBus);
    this.music.on = this.radio;
    this.music.start();

    this.enabled = true;
    this.setVolumes(this.volumes);
    this.setActive(true);
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolumes(v) {
    this.volumes = { ...this.volumes, ...v };
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.03);
  }

  toggleRadio() {
    this.radio = !this.radio;
    if (this.enabled) this.music.setOn(this.radio);
    return this.radio;
  }

  // s: { speed01, gearRpm01, slip01, siren01, doppler, hot, rain01, crickets }
  update(s) {
    if (!this.enabled || !this.active) return;
    const t = this.ctx.currentTime;
    const rpm = s.rpm01 ?? s.speed01;
    this.engine.frequency.setTargetAtTime(38 + rpm * 95 + s.speed01 * 25, t, 0.06);
    this.engine2.frequency.setTargetAtTime((38 + rpm * 95 + s.speed01 * 25) / 2, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + rpm * 1500, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.045 + s.speed01 * 0.05, t, 0.08);
    this.putterDepth.gain.setTargetAtTime(0.03 * (1 - Math.min(1, s.speed01 * 4)), t, 0.1);
    this.sirenGain.gain.setTargetAtTime(0.045 * s.siren01, t, 0.15);
    this.siren.detune.setTargetAtTime(1200 * Math.log2(s.doppler || 1), t, 0.1);
    this.screechGain.gain.setTargetAtTime(0.09 * s.slip01, t, 0.05);
    this.rainGain.gain.setTargetAtTime(0.05 * (s.rain01 || 0), t, 0.5);
    this.music.hot = !!s.hot;
    if (s.crickets && t > this._cricketAt) {
      this._chirp(t);
      this._cricketAt = t + 0.6 + Math.random() * 2.2;
    }
  }

  // Fade the engine and siren to silence (busted screen, title).
  setActive(on) {
    this.active = on;
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
    if (!on) {
      const t = this.ctx.currentTime;
      for (const g of [this.engineGain, this.sirenGain, this.screechGain, this.rainGain]) g.gain.setTargetAtTime(0, t, 0.05);
      this.putterDepth.gain.setTargetAtTime(0, t, 0.05);
      this.music.hot = false;
    }
  }

  // Freeze all sound while the game is paused.
  setPaused(p) {
    this.paused = p;
    if (!this.enabled) return;
    if (p) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  _ok() { return this.enabled && !this.paused; }

  // Two-tone "ah-oo-gah" klaxon.
  horn() {
    if (!this._ok()) return;
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
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 + 0.5 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random(), 0.3);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.2);
    og.gain.setValueAtTime(0.4 * strength, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(og).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.3);
  }

  // Cash register: a bell and the drawer.
  cash() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [freq, delay, vol] of [[2093, 0, 0.18], [2637, 0.02, 0.12], [3136, 0.04, 0.08], [2093, 0.16, 0.12]]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0005, t + delay + 0.9);
      o.connect(g).connect(this.sfx);
      o.start(t + delay);
      o.stop(t + delay + 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t + 0.12, Math.random(), 0.2);
  }

  _chirp(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = 4300 + Math.random() * 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    for (let k = 0; k < 3; k++) {
      g.gain.setValueAtTime(0.012, t + k * 0.06);
      g.gain.setValueAtTime(0, t + k * 0.06 + 0.03);
    }
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.2);
  }
}
