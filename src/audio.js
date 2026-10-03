import { Music, Radio } from './music.js';
import { juice } from './juice.js';

// Procedural audio (no asset files). Everything routes through master -> (music | sfx)
// buses so volume settings, mute and pause apply everywhere. Created after a user
// gesture so browsers allow it. The radio fades between four tunes (music.js, picked by
// main); the towns have their own sounds (`update`); and the markets, jobs, ranks, rare
// finds and the deed have theirs (bell, chime, fanfare).
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
    this.windGain = loop(520, 0.6);
    this.crowdGain = loop(700, 0.5);       // the city's streets by day
    this._ambAt = 0;
    this._ambPlace = null;

    // Distant jazz from the speakeasies: the band again, quiet and muffled through a wall.
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 650;
    this.jazzGain = ctx.createGain();
    this.jazzGain.gain.value = 0;
    muffle.connect(this.jazzGain).connect(this.sfx);
    this.jazz = new Music(ctx, muffle);
    this.jazz.on = false;
    this.jazz.start();
    this._cricketAt = 0;

    this.music = new Radio(ctx, this.musicBus);
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
    this.musicBus.gain.setTargetAtTime(this.volumes.music * (this.hushed ? 0.6 : 1), t, 0.03);
  }

  toggleRadio() {
    this.radio = !this.radio;
    if (this.enabled) this.music.setOn(this.radio);
    return this.radio;
  }

  // Fade the radio over to another tune (music.js TUNES).
  setTune(id, seconds = 3) {
    if (this.enabled && this.music.tune !== id) this.music.play(id, seconds);
  }

  // s: { speed01, rpm01, throttle01, slip01, rain01, crickets, jazz01, place, night, harbor01 }
  update(s) {
    if (!this.enabled || !this.active || this.hushed) return;
    const t = this.ctx.currentTime;
    const rpm = s.rpm01 ?? s.speed01, load = (s.throttle01 || 0) * juice('audio', 'engineLoad');
    this.engine.frequency.setTargetAtTime(38 + rpm * 95 + s.speed01 * 25, t, 0.06);
    this.engine2.frequency.setTargetAtTime((38 + rpm * 95 + s.speed01 * 25) / 2, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(320 + rpm * 1500 + load * 900, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.045 + s.speed01 * 0.05 + load * 0.035, t, 0.08);
    this.putterDepth.gain.setTargetAtTime(0.03 * (1 - Math.min(1, s.speed01 * 4)), t, 0.1);
    this.screechGain.gain.setTargetAtTime(0.09 * s.slip01 * (juice('audio', 'squeal') || 1), t, 0.05);
    this.rainGain.gain.setTargetAtTime(0.05 * (s.rain01 || 0), t, 0.5);
    this.windGain.gain.setTargetAtTime(0.07 * s.speed01 * s.speed01 * juice('audio', 'wind'), t, 0.3);
    // Jazz from a club down the street (only plays while you're near one).
    const jazz = (s.jazz01 || 0) * juice('audio', 'nightBed');
    if (jazz > 0.02 !== this.jazz.on) this.jazz.setOn(jazz > 0.02);
    this.jazzGain.gain.setTargetAtTime(0.5 * jazz, t, 0.4);
    if (s.crickets && t > this._cricketAt && juice('audio', 'nightBed')) {
      this._chirp(t);
      this._cricketAt = t + 0.6 + Math.random() * 2.2;
    }
    this._ambience(s, t);
  }

  // The towns' sounds: the crowd in the city's streets by day and a ship's horn near the
  // harbour; cattle and the church bell at Monkton; the train at Glyndon; the quarry's
  // blasts at Cockeysville (by day). One now and then, the first soon after arriving.
  _ambience(s, t) {
    const on = juice('audio', 'ambience') || 0;
    this.crowdGain.gain.setTargetAtTime(s.place === 'Baltimore' && !s.night ? 0.022 * on : 0, t, 1);
    if (s.place !== this._ambPlace) { this._ambPlace = s.place; this._ambAt = t + 2 + Math.random() * 4; }
    if (!on || t < this._ambAt) return;
    this._ambAt = t + 14 + Math.random() * 20;
    if (s.place === 'Monkton') { if (Math.random() < 0.6) this.moo(); else this.churchBell(); }
    else if (s.place === 'Glyndon') this.whistle();
    else if (s.place === 'Cockeysville' && !s.night) this.blast();
    else if (s.place === 'Baltimore' && (s.harbor01 || 0) > 0.3) this.shipHorn();
  }

  // Fade the engine and the road to silence (the title screen).
  setActive(on) {
    this.active = on;
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
    if (!on) this._quietRoad();
  }

  _quietRoad() {
    const t = this.ctx.currentTime;
    for (const g of [this.engineGain, this.screechGain, this.rainGain, this.windGain, this.jazzGain, this.crowdGain]) g.gain.setTargetAtTime(0, t, 0.05);
    this.putterDepth.gain.setTargetAtTime(0, t, 0.05);
  }

  // Paused (the pause menu): every sound freezes. Hushed (`'hush'`: a market, the barn, the
  // trunk, a story card over the road): the engine and the road go quiet and the radio plays
  // on softer, so the screen's own sounds (the bell, the till) are heard.
  setPaused(p) {
    this.paused = p === true;
    this.hushed = p === 'hush';
    if (!this.enabled) return;
    if (this.paused) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
    if (this.hushed) this._quietRoad();
    this.setVolumes({});
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
    strength *= juice('audio', 'crunch') || 1;
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

  // A piece of loot thrown aboard: a quick wooden knock and a bright two-note ping.
  pickup() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [freq, delay, vol] of [[1568, 0, 0.1], [2349, 0.07, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0005, t + delay + 0.35);
      o.connect(g).connect(this.sfx);
      o.start(t + delay);
      o.stop(t + delay + 0.4);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random(), 0.15);
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

  // A shop's door bell, on stopping at a market: two rings of a small bell.
  bell() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._bell(1850, t, 0.09, 0.9);
    this._bell(1850, t + 0.14, 0.06, 0.8);
  }

  // A knock on a speakeasy's door: shave and a haircut.
  knock() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const at of [0, 0.22, 0.33, 0.44, 0.66]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 380;
      f.Q.value = 2.5;
      const g = this._env(t + at, 0.5, 0.002, 0.01, 0.07);
      src.connect(f).connect(g).connect(this.sfx);
      src.start(t + at, Math.random(), 0.1);
    }
  }

  // A job done: three rising notes on a bell.
  chime() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    [1047, 1319, 1568].forEach((f, i) => this._bell(f, t + i * 0.12, 0.08, 1.4));
  }

  // Fanfares: `rank` (a new rank: a brass call), `rare` (word of a rare find: a sparkle)
  // and `deed` (the deed bought back: the long one, ending on a chord).
  fanfare(kind = 'rank') {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    if (kind === 'rare') {
      [1319, 1568, 1976, 2637, 3136].forEach((f, i) => this._bell(f, t + i * 0.07, 0.05, 1.2));
      return;
    }
    const notes = kind === 'deed'
      ? [[523, 0, 0.16], [523, 0.18, 0.16], [523, 0.36, 0.16], [784, 0.54, 0.5], [659, 1.1, 0.2], [784, 1.32, 0.2], [1047, 1.54, 1.4]]
      : [[392, 0, 0.14], [523, 0.16, 0.14], [659, 0.32, 0.14], [784, 0.48, 0.6]];
    for (const [f, at, len] of notes) this._brass(f, t + at, len, 0.1);
    if (kind === 'deed') for (const f of [262, 330, 392]) this._brass(f, t + 1.54, 1.4, 0.05);
  }

  // Town sounds, from a way off.
  moo() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime, len = 1.2;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(118, t);
    o.frequency.linearRampToValueAtTime(128, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(92, t + len);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(520, t);
    f.frequency.linearRampToValueAtTime(330, t + len);
    const g = this._env(t, 0.05, 0.25, len, 0.3);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + len + 0.4);
  }

  churchBell() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    for (let k = 0; k < 3; k++) { this._bell(392, t + k * 2.2, 0.05, 3.5); this._bell(196, t + k * 2.2, 0.03, 4); }
  }

  // A steam whistle's chord: a long blast and a short one.
  whistle() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [at, len] of [[0, 1.4], [1.7, 0.5]]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 0.9;
      const g = this._env(t + at, 0.035, 0.08, len, 0.15);
      for (const hz of [466, 554, 698]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(hz * 0.97, t + at);
        o.frequency.linearRampToValueAtTime(hz, t + at + 0.12);
        o.connect(f);
        o.start(t + at);
        o.stop(t + at + len + 0.2);
      }
      f.connect(g).connect(this.sfx);
    }
  }

  // A quarry blast: a boom, and its rumble coming back off the hills.
  blast() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [at, vol] of [[0, 0.3], [0.38, 0.12]]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = this._env(t + at, vol, 0.01, 0.1, 1.6);
      src.connect(f).connect(g).connect(this.sfx);
      src.start(t + at, Math.random(), 2);
    }
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    const g = this._env(t, 0.25, 0.01, 0.05, 0.9);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 1.2);
  }

  // A ship's horn out on the harbour.
  shipHorn() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime, len = 2.2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    const g = this._env(t, 0.06, 0.2, len, 0.5);
    for (const hz of [87, 110]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.6);
    }
    f.connect(g).connect(this.sfx);
  }

  // A gain envelope: up to `vol` in `attack`, held to `hold`, gone `release` later.
  _env(t, vol, attack, hold, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, hold) + release);
    return g;
  }

  // A struck bell: a few inharmonic partials, each dying away faster than the one below.
  _bell(freq, t, vol, decay) {
    const ctx = this.ctx;
    [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.25, 0.4], [8.93, 0.12, 0.25]].forEach(([mult, amp, life]) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * life);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + decay * life + 0.05);
    });
  }

  // A brass note: two detuned saws through a filter that opens as it's blown.
  _brass(freq, t, len, vol) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(2200, t + 0.06);
    f.frequency.setTargetAtTime(1400, t + 0.06, 0.2);
    const g = this._env(t, vol, 0.03, len, 0.12);
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.2);
    }
    f.connect(g).connect(this.sfx);
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
