// All player input in one place: remappable keyboard, gamepads (standard mapping) and
// on-screen touch controls. Driving input is read every frame with read(); one-shot
// actions (pause, map, horn, menu navigation) are delivered through onAction(name, device).
const DEADZONE = 0.18;
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class Input {
  constructor(bindings) {
    this.bindings = bindings;
    this.down = new Set();
    this.lastDevice = 'keyboard';
    this.playing = false;          // when true, bound keys don't scroll/tab the page
    this.onAction = () => {};
    this.onDevice = () => {};
    this._capture = null;
    this._padPrev = {};
    this._padAxisPrev = { x: 0, y: 0 };
    this.pad = { throttle: 0, brake: 0, steer: 0, handbrake: false, lookBack: false, connected: false };
    this.touch = new TouchControls(this);

    window.addEventListener('keydown', (e) => this._keydown(e));
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('gamepadconnected', () => { this.pad.connected = true; });
  }

  setBindings(b) { this.bindings = b; }

  // Next key press is returned instead of acted on (for remapping). Esc cancels.
  captureKey(cb) { this._capture = cb; }

  _setDevice(d) {
    if (this.lastDevice !== d) { this.lastDevice = d; this.onDevice(d); }
  }

  _actionsFor(code) {
    return Object.keys(this.bindings).filter((a) => this.bindings[a].includes(code));
  }

  _keydown(e) {
    if (this._capture) {
      e.preventDefault();
      const cb = this._capture;
      this._capture = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    this._setDevice('keyboard');
    const actions = this._actionsFor(e.code);
    if (this.playing && (actions.length || ['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code))) e.preventDefault();
    if (e.repeat) { this.down.add(e.code); return; }
    this.down.add(e.code);
    for (const a of actions) if (['pause', 'map', 'mute', 'fullscreen', 'horn', 'radio', 'juice', 'trunk', 'lights', 'ability1', 'ability2', 'ability3'].includes(a)) this.onAction(a, 'keyboard');
  }

  isDown(action) { return (this.bindings[action] || []).some((c) => this.down.has(c)); }

  // Poll gamepads once per frame; emits edge-triggered actions.
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) { this.pad.connected = false; Object.assign(this.pad, { throttle: 0, brake: 0, steer: 0, handbrake: false, lookBack: false }); return; }
    this.pad.connected = true;
    const b = (i) => gp.buttons[i] || { pressed: false, value: 0 };
    const x = Math.abs(gp.axes[0] || 0) > DEADZONE ? gp.axes[0] : 0;
    const y = Math.abs(gp.axes[1] || 0) > 0.5 ? gp.axes[1] : 0;
    this.pad.throttle = b(PAD.RT).value || (b(PAD.RT).pressed ? 1 : 0);
    this.pad.brake = b(PAD.LT).value || (b(PAD.LT).pressed ? 1 : 0);
    this.pad.steer = x;
    this.pad.handbrake = b(PAD.A).pressed;
    this.pad.lookBack = b(PAD.Y).pressed;

    // Fire each button's actions once, on the frame it goes down. (B means "back" in
    // menus and "horn" while driving; the game decides which applies.)
    const edge = (i, ...actions) => {
      const now = b(i).pressed;
      if (now && !this._padPrev[i]) {
        this._setDevice('gamepad');
        for (const a of actions) this.onAction(a, 'gamepad');
      }
      this._padPrev[i] = now;
    };
    edge(PAD.START, 'pause');
    edge(PAD.BACK, 'map');
    edge(PAD.B, 'back', 'horn');
    edge(PAD.A, 'confirm');
    // The trunk: X opens it while driving (and leaves a piece behind inside it);
    // the shoulder buttons turn a piece.
    edge(PAD.X, 'trunk');
    edge(PAD.LB, 'rotate');
    edge(PAD.RB, 'rotate');
    // The d-pad moves through menus; while driving, left / up / right are the abilities and
    // down the headlamps
    // (the stick's menu moves don't count, so steering never fires one).
    edge(PAD.UP, 'up', 'ability2');
    edge(PAD.DOWN, 'down', 'lights');
    edge(PAD.LEFT, 'left', 'ability1');
    edge(PAD.RIGHT, 'right', 'ability3');
    // Left stick flicks also navigate menus.
    const ny = y > 0 ? 1 : y < 0 ? -1 : 0;
    const nx = Math.abs(gp.axes[0] || 0) > 0.6 ? Math.sign(gp.axes[0]) : 0;
    if (ny && ny !== this._padAxisPrev.y) this.onAction(ny > 0 ? 'down' : 'up', 'gamepad');
    if (nx && nx !== this._padAxisPrev.x) this.onAction(nx > 0 ? 'right' : 'left', 'gamepad');
    this._padAxisPrev = { x: nx, y: ny };
    if (this.pad.throttle > 0.2 || x) this._setDevice('gamepad');
  }

  read() {
    const t = this.touch;
    const kbThrottle = this.isDown('throttle') ? 1 : 0;
    const kbBrake = this.isDown('brake') ? 1 : 0;
    const kbSteer = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const throttle = Math.max(kbThrottle, this.pad.throttle, t.gas ? 1 : 0) - Math.max(kbBrake, this.pad.brake, t.brake ? 1 : 0);
    const steer = Math.max(-1, Math.min(1, kbSteer + this.pad.steer + t.steer));
    return {
      throttle,
      steer,
      handbrake: this.isDown('handbrake') || this.pad.handbrake || t.handbrake,
      lookBack: this.isDown('lookBack') || this.pad.lookBack,
    };
  }
}

// On-screen pedals and a floating steering stick (drag anywhere on the left side).
class TouchControls {
  constructor(input) {
    this.input = input;
    this.gas = false;
    this.brake = false;
    this.handbrake = false;
    this.steer = 0;
    this.enabled = false;
    this.root = document.getElementById('touch');
    this.base = document.getElementById('stick-base');
    this.knob = document.getElementById('stick-knob');
    this._stickId = null;
    this._origin = 0;

    window.addEventListener('touchstart', () => input._setDevice('touch'), { passive: true });

    const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } };
    const zone = document.getElementById('touch-steer');
    zone.addEventListener('pointerdown', (e) => {
      if (this._stickId !== null) return;
      this._stickId = e.pointerId;
      capture(zone, e.pointerId);
      this._origin = e.clientX;
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY - zone.getBoundingClientRect().top}px`;
      this.base.classList.add('on');
      this._move(e.clientX);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this._stickId) this._move(e.clientX); });
    const end = (e) => {
      if (e.pointerId !== this._stickId) return;
      this._stickId = null;
      this.steer = 0;
      this.base.classList.remove('on');
      this.knob.style.transform = '';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const hold = (id, key, onPress) => {
      const el = document.getElementById(id);
      const set = (v) => { this[key] = v; el.classList.toggle('pressed', v); };
      el.addEventListener('pointerdown', (e) => { capture(el, e.pointerId); if (key) set(true); if (onPress) onPress(); e.preventDefault(); });
      el.addEventListener('pointerup', () => key && set(false));
      el.addEventListener('pointercancel', () => key && set(false));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold('touch-gas', 'gas');
    hold('touch-brake', 'brake');
    hold('touch-handbrake', 'handbrake');
    hold('touch-horn', null, () => input.onAction('horn', 'touch'));
  }

  _move(x) {
    const dx = Math.max(-55, Math.min(55, x - this._origin));
    this.steer = dx / 55;
    this.knob.style.transform = `translateX(${dx}px)`;
  }

  setVisible(v) {
    this.enabled = v;
    this.root.classList.toggle('hidden', !v);
    document.body.classList.toggle('touch-mode', v);
    if (!v) { this.gas = this.brake = this.handbrake = false; this.steer = 0; }
  }
}

export function isTouchDevice() {
  try { return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch { return false; }
}
