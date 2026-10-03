// Generated 1920s music (no audio files, no licensing): four tunes for a piano's two hands
// and brushed drums, each a fixed song so it feels like a real one. Notes are scheduled
// slightly ahead on the audio clock, so pausing (suspending the audio context) freezes the
// music in place.
//   stride: the ragtime / stride-piano loop, for the city and the valley by day;
//   blues:  a slow twelve-bar shuffle, for the city late at night;
//   waltz:  a waltz in three, for the valley at night;
//   rag:    a fast rag, for Lead Foot.
// Each bar is [bass note, chord tones] as MIDI numbers; the melody is, for each bar, a
// chord-tone index per eighth note (null rests). `left` is how the left hand plays (stride:
// oom-pah, the bass on 1 and 3 and the chord on 2 and 4; waltz: oom-pah-pah; walk: a
// shuffle bass on every beat with chord stabs), `drums` the kit, `swing` how much longer
// the first eighth of each beat is than the second.
export const TUNES = {
  stride: {
    bpm: 104, beats: 4, swing: 1.08, left: 'stride', drums: 'kick-brush',
    bars: [
      [48, [60, 64, 67]],         // C
      [48, [60, 64, 67]],         // C
      [53, [60, 65, 69]],         // F
      [54, [60, 63, 66, 69]],     // F#dim7
      [55, [60, 64, 67]],         // C/G
      [57, [61, 64, 67, 69]],     // A7
      [50, [60, 62, 66, 69]],     // D7
      [55, [59, 62, 65, 67]],     // G7
    ],
    melody: [
      [2, null, 1, 2, null, 3, 2, 1],
      [0, 1, null, 2, 3, null, 2, null],
      [2, null, 3, 2, 1, null, 0, 1],
      [3, 2, null, 1, 2, null, 3, null],
      [2, 3, null, 2, 1, 0, null, 1],
      [3, null, 2, 3, null, 1, 2, null],
      [1, 2, 3, null, 2, null, 1, 0],
      [0, null, 2, 1, 0, null, null, null],
    ],
  },
  blues: {
    bpm: 66, beats: 4, swing: 1.33, left: 'walk', drums: 'shuffle', melodyVol: 0.13,
    bars: [
      [48, [60, 64, 67, 70]],     // C7
      [53, [60, 63, 65, 69]],     // F7
      [48, [60, 64, 67, 70]],     // C7
      [48, [60, 64, 67, 70]],     // C7
      [53, [60, 63, 65, 69]],     // F7
      [53, [60, 63, 65, 69]],     // F7
      [48, [60, 64, 67, 70]],     // C7
      [48, [60, 64, 67, 70]],     // C7
      [55, [59, 62, 65, 67]],     // G7
      [53, [60, 63, 65, 69]],     // F7
      [48, [60, 64, 67, 70]],     // C7
      [55, [59, 62, 65, 67]],     // G7
    ],
    melody: [
      [3, null, 2, null, 1, null, null, null],
      [null, 1, 2, null, 3, null, 2, null],
      [2, null, 3, 2, null, null, 1, null],
      [0, null, null, null, null, null, 3, 2],
      [1, null, 3, null, 2, null, 1, null],
      [0, null, 1, null, null, null, null, null],
      [2, 3, null, 2, 1, null, 0, null],
      [null, null, 3, null, 2, null, null, null],
      [3, null, 2, null, 1, null, 0, null],
      [3, null, null, 2, null, 1, null, null],
      [2, null, 1, null, 0, null, null, null],
      [null, null, 0, 1, 2, null, 3, null],
    ],
  },
  waltz: {
    bpm: 96, beats: 3, swing: 1, left: 'waltz', drums: 'brush', melodyVol: 0.14,
    bars: [
      [53, [60, 65, 69]],         // F
      [53, [60, 65, 69]],         // F
      [58, [62, 65, 70]],         // Bb
      [53, [60, 65, 69]],         // F
      [48, [60, 64, 67, 70]],     // C7
      [48, [60, 64, 67, 70]],     // C7
      [53, [60, 65, 69]],         // F
      [53, [60, 65, 69]],         // F
    ],
    melody: [
      [2, null, 1, null, 0, null],
      [1, null, null, null, 2, null],
      [2, null, 1, null, 0, null],
      [1, null, null, null, null, null],
      [3, null, 2, null, 1, null],
      [0, null, 1, null, 2, null],
      [2, null, 1, null, 0, 1],
      [1, null, null, null, null, null],
    ],
  },
  rag: {
    bpm: 144, beats: 4, swing: 1, left: 'stride', drums: 'rag', melodyVol: 0.15,
    bars: [
      [55, [62, 67, 71]],         // G
      [55, [62, 67, 71]],         // G
      [48, [60, 64, 67]],         // C
      [48, [60, 64, 67]],         // C
      [55, [62, 67, 71]],         // G
      [52, [59, 62, 64, 68]],     // E7
      [57, [61, 64, 67, 69]],     // A7
      [50, [60, 62, 66, 69]],     // D7
    ],
    melody: [
      [0, 1, 2, 1, 0, 1, 2, null],
      [2, 1, 0, 2, 1, null, 2, 1],
      [0, 1, 2, null, 2, 1, 0, 1],
      [2, null, 1, 2, null, 0, 1, 2],
      [1, 2, 0, 1, 2, 1, 0, null],
      [3, 2, 1, 0, 1, 2, 3, null],
      [3, 1, 2, 0, 3, 1, 2, null],
      [0, 1, 2, 3, 2, null, 1, null],
    ],
  },
};
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// One player: plays one tune at a time through its own gain (`level` when on).
export class Music {
  constructor(ctx, out, tune = 'stride', level = 0.5) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(out);
    this.level = level;
    this.on = true;
    this._timer = null;
    this._noise = this._makeNoise();
    this.setTune(tune);
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Start a tune from its first bar.
  setTune(id) {
    this.id = id;
    this.tune = TUNES[id];
    this._bar = 0;
    this._eighth = 0;
    this._next = this.ctx.currentTime + 0.05;
    this.playing = true;          // false once it has faded out (stopAfter)
    this._stopAt = 0;
  }

  start() {
    if (this._timer) return;
    this._next = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 30);
    this.setOn(this.on);
  }

  setOn(on) {
    this.on = on;
    this.out.gain.setTargetAtTime(on ? this.level : 0, this.ctx.currentTime, 0.3);
  }

  // Ease the volume to `to` (a share of the level) over about `seconds`.
  fade(to, seconds) {
    const g = this.out.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(this.on ? to * this.level : 0, t, Math.max(0.05, seconds / 3));
  }

  // Stop playing notes once `seconds` of the audio clock have passed (after a fade out).
  stopAfter(seconds) { this._stopAt = this.ctx.currentTime + seconds; }

  _schedule() {
    if (this.ctx.state !== 'running') return;
    if (this._stopAt && this.ctx.currentTime > this._stopAt) { this.playing = false; this._stopAt = 0; }
    if (!this.playing) return;
    const T = this.tune, step = 60 / T.bpm / 2, steps = T.beats * 2;
    // After a stall (a busy page, a background tab) skip the notes missed rather than play
    // them all at once: a burst of new nodes would only slow a struggling page further.
    if (this._next < this.ctx.currentTime) this._next = this.ctx.currentTime + 0.05;
    while (this._next < this.ctx.currentTime + 0.2) {
      this._play(this._bar, this._eighth, this._next, step);
      this._next += step * (this._eighth % 2 === 0 ? T.swing : 2 - T.swing);
      if (++this._eighth === steps) { this._eighth = 0; this._bar = (this._bar + 1) % T.bars.length; }
    }
  }

  _play(bar, e, t, step) {
    if (!this.on) return;
    const T = this.tune, [bass, chord] = T.bars[bar], beat = e % 2 === 0;
    // The left hand.
    if (T.left === 'stride') {
      // Oom (bass) on beats 1 and 3, pah (chord) on 2 and 4.
      if (e === 0) this._piano(midi(bass - 12), t, 0.5, 0.32);
      if (e === 4) this._piano(midi(bass - 5), t, 0.5, 0.26);
      if (e === 2 || e === 6) for (const n of chord) this._piano(midi(n - 12), t, 0.25, 0.09);
    } else if (T.left === 'waltz') {
      // Oom-pah-pah: the bass on one, the chord on two and three.
      if (e === 0) this._piano(midi(bass - 12), t, 0.6, 0.3);
      if (e === 2 || e === 4) for (const n of chord) this._piano(midi(n - 12), t, 0.3, 0.07);
    } else if (beat) {
      // A shuffle bass on every beat (root, fifth, sixth, fifth).
      this._piano(midi(bass - 12 + [0, 7, 9, 7][e / 2]), t, 0.45, 0.26);
    } else if (e === 3 || e === 7) {
      // And a chord stab after beats 2 and 4.
      for (const n of chord) this._piano(midi(n - 12), t, 0.18, 0.06);
    }
    // The right hand's melody, an octave up.
    const idx = T.melody[bar][e];
    if (idx != null) this._piano(midi(chord[idx % chord.length] + 12), t, step * 1.6, T.melodyVol ?? 0.16);
    // The drums.
    if (T.drums === 'kick-brush') {
      if (e === 0 || e === 4) this._kick(t);
      if (e === 2 || e === 6) this._brush(t, 0.12);
    } else if (T.drums === 'shuffle') {
      if (e === 0 || e === 4) this._kick(t, 0.18);
      this._brush(t, beat ? (e % 4 ? 0.1 : 0.06) : 0.03, beat ? 3200 : 4200);
    } else if (T.drums === 'brush') {
      if (e === 2 || e === 4) this._brush(t, 0.05, 2600);
    } else if (T.drums === 'rag') {
      if (e === 0 || e === 4) this._kick(t, 0.24);
      this._brush(t, beat ? 0.05 : 0.09, 3600);
    }
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

  _kick(t, vol = 0.28) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(vol, t);
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

// The radio: two players, so a new tune fades in over the old one (`play`). To the rest of
// the game it reads like one player (`on`, `setOn`, the bar it's on).
export class Radio {
  constructor(ctx, out) {
    this.decks = [new Music(ctx, out, 'stride'), new Music(ctx, out, 'stride')];
    this.decks[1].playing = false;
    this.cur = 0;
    this.on = true;
  }

  get tune() { return this.decks[this.cur].id; }
  get _bar() { return this.decks[this.cur]._bar; }
  get _eighth() { return this.decks[this.cur]._eighth; }

  start() {
    for (const d of this.decks) d.start();
    this.setOn(this.on);
  }

  setOn(on) {
    this.on = on;
    this.decks[this.cur].setOn(on);
    this.decks[1 - this.cur].on = on;
  }

  // Fade from the tune playing over to `id`, in about `seconds`.
  play(id, seconds = 3) {
    if (id === this.tune) return;
    const old = this.decks[this.cur], next = this.decks[1 - this.cur];
    this.cur = 1 - this.cur;
    next.setTune(id);
    next.on = this.on;
    next.out.gain.cancelScheduledValues(next.ctx.currentTime);
    next.out.gain.setValueAtTime(0, next.ctx.currentTime);
    next.fade(1, seconds);
    old.fade(0, seconds);
    old.stopAfter(seconds * 1.5);
  }
}
