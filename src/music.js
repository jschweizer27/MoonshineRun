// A generated ragtime / stride-piano loop (no audio files, no licensing). An 8-bar
// progression with an oom-pah left hand, a syncopated right-hand melody and brushed
// drums. When the law is on you it switches to "hot" mode: faster, busier, with a hi-hat.
// Notes are scheduled slightly ahead on the audio clock, so pausing (suspending the
// audio context) freezes the music in place.
const PROGRESSION = [
  // [bass note, chord tones] as MIDI numbers
  [48, [60, 64, 67]],         // C
  [48, [60, 64, 67]],         // C
  [53, [60, 65, 69]],         // F
  [54, [60, 63, 66, 69]],     // F#dim7
  [55, [60, 64, 67]],         // C/G
  [57, [61, 64, 67, 69]],     // A7
  [50, [60, 62, 66, 69]],     // D7
  [55, [59, 62, 65, 67]],     // G7
];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// A fixed tune: for each bar, eighth-note melody steps as chord-tone indexes (or null for
// a rest), with a few syncopated ties. Deterministic so it feels like a real song.
const MELODY = [
  [2, null, 1, 2, null, 3, 2, 1],
  [0, 1, null, 2, 3, null, 2, null],
  [2, null, 3, 2, 1, null, 0, 1],
  [3, 2, null, 1, 2, null, 3, null],
  [2, 3, null, 2, 1, 0, null, 1],
  [3, null, 2, 3, null, 1, 2, null],
  [1, 2, 3, null, 2, null, 1, 0],
  [0, null, 2, 1, 0, null, null, null],
];

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(out);
    this.on = true;
    this.hot = false;
    this._bar = 0;
    this._eighth = 0;
    this._next = 0;
    this._timer = null;
    this._noise = this._makeNoise();
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  start() {
    if (this._timer) return;
    this._next = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 30);
    this.setOn(this.on);
  }

  setOn(on) {
    this.on = on;
    this.out.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.3);
  }

  _schedule() {
    if (this.ctx.state !== 'running') return;
    const bpm = this.hot ? 138 : 104;
    const step = 60 / bpm / 2;                     // eighth notes
    while (this._next < this.ctx.currentTime + 0.2) {
      this._play(this._bar, this._eighth, this._next, step);
      this._next += step * (this._eighth % 2 === 0 ? 1.08 : 0.92);   // a little swing
      if (++this._eighth === 8) { this._eighth = 0; this._bar = (this._bar + 1) % PROGRESSION.length; }
    }
  }

  _play(bar, e, t, step) {
    if (!this.on) return;
    const [bass, chord] = PROGRESSION[bar];
    // Left hand: oom (bass) on beats 1 and 3, pah (chord) on 2 and 4.
    if (e === 0) this._piano(midi(bass - 12), t, 0.5, 0.32);
    if (e === 4) this._piano(midi(bass - 5), t, 0.5, 0.26);
    if (e === 2 || e === 6) for (const n of chord) this._piano(midi(n - 12), t, 0.25, 0.09);
    // Right hand melody, an octave up; busier when hot.
    const idx = MELODY[bar][e];
    if (idx != null) this._piano(midi(chord[idx % chord.length] + 12), t, step * 1.6, 0.16);
    else if (this.hot && e % 2) this._piano(midi(chord[(bar + e) % chord.length] + 24), t, step, 0.08);
    // Drums: soft kick on 1 and 3, brush on 2 and 4, hi-hat eighths when hot.
    if (e === 0 || e === 4) this._kick(t);
    if (e === 2 || e === 6) this._brush(t, 0.12);
    if (this.hot) this._brush(t, 0.04, 7000);
  }

  _piano(freq, t, len, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vol * 0.3, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.min(6000, freq * 6);
    // Two slightly detuned strings: the honky-tonk sound.
    for (const [type, detune] of [['triangle', -7], ['sine', 7]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.4);
    }
    f.connect(g).connect(this.out);
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.22);
  }

  _brush(t, vol, freq = 3200) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.4, 0.1);
  }
}
