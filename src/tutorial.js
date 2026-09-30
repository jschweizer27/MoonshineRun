import { loadJSON, saveJSON } from './save.js';
import { keyLabel } from './settings.js';

// First-run tips. Each shows once, in words that match the device you're using, and
// dismisses itself as soon as you've done what it suggests.
const KEY = 'shine.hints.v1';

export class Tutorial {
  constructor(hud, input) {
    this.hud = hud;
    this.input = input;
    this.enabled = true;
    this.seen = new Set(loadJSON(KEY, { seen: [] }).seen);
    this.active = null;
    this._t = 0;
    this._driveTime = 0;
    hud.onHintClose = () => this._finish();
  }

  reset() {
    this.seen.clear();
    saveJSON(KEY, { seen: [] });
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.clearActive();
  }

  // Hide the current tip without marking it as learned (it can come back later).
  clearActive() {
    if (!this.active) return;
    this.active = null;
    this.hud.hideHint();
  }

  _text(id) {
    const dev = this.input.lastDevice;
    const k = (a) => keyLabel(this.input.bindings[a][0]);
    const t = {
      drive: {
        keyboard: `Hold ${k('throttle')} to drive and ${k('left')} / ${k('right')} to steer.`,
        gamepad: 'Hold RT to drive and steer with the left stick.',
        touch: 'Hold GAS to drive. Drag on the left side of the screen to steer.',
      },
      follow: 'Follow the gold arrow on the road (and the compass up top) to the amber still.',
      load: 'Drive into the amber ring to load the shine.',
      deliver: 'Loaded! Get it to the blue drop. Hauling shine draws attention.',
      heat: 'The law is on you! They need line of sight — duck around corners to lose them.',
      pinned: 'Keep moving! If they pin you down while you’re slow, you’re busted.',
      handbrake: {
        keyboard: `Tip: tap ${k('handbrake')} for a handbrake slide around tight corners.`,
        gamepad: 'Tip: press A for a handbrake slide around tight corners.',
        touch: 'Tip: hold DRIFT for a handbrake slide around tight corners.',
      },
      menu: {
        keyboard: `Tip: press ${k('pause')} to pause, and ${k('map')} for the map.`,
        gamepad: 'Tip: press Start to pause, and View/Back for the map.',
        touch: 'Tip: tap the pause button (top right) for the map and settings.',
      },
    }[id];
    return typeof t === 'string' ? t : t[dev] || t.keyboard;
  }

  // Which tip to show next, and when each one is done.
  static RULES = {
    drive: { when: (c) => c.time > 1.5, done: (c, self) => self._driveTime > 1.2, timeout: 20 },
    follow: { when: (c) => c.time > 4, done: (c) => c.distToTarget < 70, timeout: 12 },
    load: { when: (c) => !c.carrying && c.distToTarget < 45, done: (c) => c.carrying, timeout: 15 },
    deliver: { when: (c) => c.carrying, done: (c) => !c.carrying, timeout: 9 },
    heat: { when: (c) => c.tier > 0, done: (c) => c.tier === 0, timeout: 12 },
    pinned: { when: (c) => c.bust > 0.12, done: (c) => c.bust === 0, timeout: 8 },
    handbrake: { when: (c) => c.deliveries >= 1 && !c.carrying && c.tier === 0, done: () => false, timeout: 8 },
    menu: { when: (c) => c.deliveries >= 1 && c.time > 60 && c.tier === 0, done: () => false, timeout: 8 },
  };

  update(dt, ctx) {
    if (!this.enabled) return;
    if (ctx.speed > 6) this._driveTime += dt;
    if (this.active) {
      this._t += dt;
      const rule = Tutorial.RULES[this.active];
      if (rule.done(ctx, this) || this._t > rule.timeout) this._finish();
      return;
    }
    for (const [id, rule] of Object.entries(Tutorial.RULES)) {
      if (this.seen.has(id)) continue;
      if (rule.when(ctx)) {
        this.active = id;
        this._t = 0;
        this.hud.showHint(this._text(id));
        return;
      }
    }
  }

  _finish() {
    if (!this.active) return;
    this.seen.add(this.active);
    saveJSON(KEY, { seen: [...this.seen] });
    this.active = null;
    this.hud.hideHint();
  }
}
