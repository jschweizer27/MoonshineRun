import * as THREE from 'three';

// Game feel ("juice"). Every effect's strength lives here; set a value to 0 to switch that
// one effect off. Press J in-game to switch all of it off at once and compare. With ?debug,
// sliders for every value appear in the corner. Visual only: nothing here changes the
// physics, the rules or the balance.
export const JUICE = {
  enabled: true,

  camera: {
    stiffness: 26,        // chase spring: higher = tighter follow
    damping: 8.5,         // chase spring: lower = more overshoot and sway
    pullBack: 0.14,       // extra distance at top speed (x the base distance)
    dropAtSpeed: 0.16,    // the camera sinks toward the road at top speed (x its height)
    lookAhead: 12,        // metres further up the road the camera looks at top speed
    fovKick: 12,          // degrees wider at top speed
    fovBoost: 7,          // extra degrees while accelerating hard
    speedShake: 0.06,     // road rumble at top speed (metres)
    hitShake: 1.5,        // x the shake from a crash
  },

  body: {
    roll: 0.07,           // radians of lean per g of cornering (the body leans out of turns)
    trailerSway: 1.3,     // the tall horse box leans this much more, and a beat later
    pitch: 0.05,          // radians per g: nose dives under braking, squats under throttle
    stiffness: 60,        // suspension spring
    damping: 6,           // suspension damping (lower = bouncier)
    cobbleRumble: 0.018,  // vertical buzz on cobbles at speed (metres)
    dirtRumble: 0.045,    // ...on dirt roads (double that on grass)
    hitBounce: 0.35,      // suspension kick from a crash
  },

  wheels: {
    tireSmoke: 1,         // smoke when sliding or braking hard
    skidMarks: 1,         // skid mark darkness
    skidLife: 18,         // seconds a skid mark stays on the road
    spray: 1,             // spray kicked up on wet roads
    dust: 1,              // dust on dirt roads
    exhaust: 1,           // exhaust puffs (they grow with throttle)
  },

  lights: {
    headlightFlicker: 1,  // headlights stutter after a hard hit
  },
};

// The current value of one effect (0 when juice is switched off).
export const juice = (group, key) => (JUICE.enabled ? JUICE[group][key] : 0);

const G = 9.81;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// A damped spring toward a moving target.
class Spring {
  constructor() { this.x = 0; this.v = 0; }
  step(target, k, c, dt) {
    this.v += (k * (target - this.x) - c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
  reset() { this.x = this.v = 0; }
}

// Everything that makes the truck feel heavy: the body rolls and pitches on its springs and
// buzzes over cobbles, the tyres smoke and leave skid marks, wheels throw spray and dust,
// and the headlights stutter after a hit.
export class VehicleFeel {
  constructor(scene, vehicle, particles, headlight) {
    this.v = vehicle;
    this.particles = particles;
    this.headlight = headlight;
    this.headlightBase = headlight ? headlight.intensity : 0;
    // The player's lamp lenses (on each car Otto owns) get their own material so they can
    // flicker alone.
    for (const { model } of vehicle.rides ? Object.values(vehicle.rides) : [vehicle]) {
      const lens = model.lampMesh;
      if (!lens) continue;
      lens.material = lens.material.clone();
      lens.userData.base = lens.material.color.clone();
    }
    this.skids = new SkidMarks(scene);
    this.roll = new Spring();
    this.pitch = new Spring();
    this.heave = new Spring();
    this.trailerRoll = new Spring();
    this.trailerHeave = new Spring();
    this._rumble = 0;
    this._rumbleT = 0;
    this._wheelSpots = [];
    this.reset();
  }

  reset() {
    this._prevHeading = this.v.heading;
    this._prevSpeed = this.v.speed;
    this._prevTrailer = this.v.trailer ? this.v.trailer.heading : 0;
    this._aLat = this._aLong = this._tLat = 0;
    this.trailerRoll.reset(); this.trailerHeave.reset();
    this.accel01 = 0;
    this.flicker = 0;
    this.lightLevel = 1;
    this.roll.reset(); this.pitch.reset(); this.heave.reset();
    this.skids.clear();
    this._apply();
  }

  // A crash: kick the suspension and make the headlights stutter (strength 0..1).
  hit(strength) {
    const s = clamp(strength, 0, 1);
    this.heave.v += juice('body', 'hitBounce') * (1.5 + 3 * s);
    this.roll.v += (Math.random() - 0.5) * juice('body', 'hitBounce') * 2 * s;
    this.flicker = Math.max(this.flicker, (0.35 + 0.6 * s) * juice('lights', 'headlightFlicker'));
  }

  // ctx: { throttle, brake (0..1), handbrake, ground: 'cobble' | 'dirt' | 'grass' | 'smooth', wet (0..1), dt }
  update(dt, ctx) {
    if (!dt) return;
    const v = this.v, B = JUICE.body;
    const speed = Math.abs(v.speed), speed01 = Math.min(1, speed / v.t.maxSpeed);

    // Accelerations felt by the body, smoothed so collisions don't jolt it sideways.
    const yawRate = wrap(v.heading - this._prevHeading) / dt;
    const k = 1 - Math.exp(-9 * dt);
    this._aLat += (v.speed * yawRate - this._aLat) * k;
    this._aLong += ((v.speed - this._prevSpeed) / dt - this._aLong) * k;
    this._prevHeading = v.heading;
    this._prevSpeed = v.speed;
    this.accel01 = clamp(this._aLong / 14, 0, 1);
    if (v.trailer) {
      const tRate = wrap(v.trailer.heading - this._prevTrailer) / dt;
      this._tLat += (v.speed * tRate - this._tLat) * k;
      this._prevTrailer = v.trailer.heading;
    }

    // Body on its springs: leans out of turns, dives under braking, buzzes over the road.
    const on = JUICE.enabled;
    const rollTarget = on ? clamp((B.roll * this._aLat) / G, -0.14, 0.14) : 0;
    const pitchTarget = on ? clamp((B.pitch * this._aLong) / G, -0.09, 0.09) : 0;
    this._rumbleT -= dt;
    if (this._rumbleT <= 0) {
      this._rumbleT = 0.045 + Math.random() * 0.04;
      const amp = ({ cobble: B.cobbleRumble, dirt: B.dirtRumble, grass: B.dirtRumble * 2 }[ctx.ground] || 0) * (on ? 1 : 0);
      this._rumble = (Math.random() - 0.5) * 2 * amp * Math.min(1, speed / 10);
    }
    const kk = B.stiffness, c = B.damping;
    this.roll.step(rollTarget, kk, c, dt);
    this.pitch.step(pitchTarget, kk, c, dt);
    this.heave.step(this._rumble, kk * 2.2, c * 1.3, dt);
    // The horse box: softer springs, so it sways and settles after the truck does.
    const swayTarget = on ? clamp((B.roll * B.trailerSway * this._tLat) / G, -0.18, 0.18) : 0;
    this.trailerRoll.step(swayTarget, kk * 0.6, c * 0.6, dt);
    this.trailerHeave.step(this.heave.x * 0.8, kk * 1.4, c, dt);
    if (!on) { this.roll.reset(); this.pitch.reset(); this.heave.reset(); this.trailerRoll.reset(); this.trailerHeave.reset(); }
    this._apply();

    this._wheels(dt, ctx, speed, speed01);
    this._lights(dt);
  }

  _apply() {
    const body = this.v.model.bodyPivot;
    if (!body) return;
    body.rotation.z = this.roll.x;
    body.rotation.x = this.pitch.x;
    body.position.y = body.userData.pivot + clamp(this.heave.x, -0.25, 0.25);
    const box = this.v.trailer?.bodyPivot;
    if (box) {
      box.rotation.z = this.trailerRoll.x;
      box.rotation.x = -this.pitch.x * 0.4;        // the drawbar tips it the other way
      box.position.y = box.userData.pivot + clamp(this.trailerHeave.x, -0.25, 0.25);
    }
  }

  // Tyre smoke and skid marks when sliding or braking hard, spray on wet roads.
  _wheels(dt, ctx, speed, speed01) {
    const v = this.v, W = JUICE.wheels;
    const slide = speed > 4 ? clamp((v.slip - 2.5) / 6, 0, 1) : 0;
    const braking = ctx.brake > 0.4 && v.speed > 8 ? clamp((v.speed - 8) / 20, 0.3, 1) : 0;
    const handbrake = ctx.handbrake && speed > 3 ? clamp(speed / 15, 0.4, 1) : 0;
    const rear = Math.max(slide, braking, handbrake);
    const front = Math.max(slide * 0.5, braking);
    const on = JUICE.enabled;
    const f = [v.forwardX, v.forwardZ], r = [Math.cos(v.heading), Math.sin(v.heading)];
    // The truck's wheels, then the horse box's (it slides with the rig, and it's what the
    // chase camera sees).
    const wheels = this._wheelSpots;
    wheels.length = 0;
    for (const [lx, lz, isFront] of v.model.wheelSpots) wheels.push([v.position.x + r[0] * lx - f[0] * lz, v.position.z + r[1] * lx - f[1] * lz, isFront ? front : rear, !isFront]);
    const t = v.trailer;
    if (t) {
      const cx = Math.cos(t.heading), cz = Math.sin(t.heading);
      for (const lx of [-1.02, 1.02]) wheels.push([t.x + cx * lx, t.z + cz * lx, Math.max(slide, handbrake * 0.7, braking * 0.8), true]);
    }
    for (let i = 0; i < wheels.length; i++) {
      const [x, z, amount, smokes] = wheels[i];
      const isFront = !smokes;
      this.skids.track(i, x, z, on ? amount * W.skidMarks : 0, v.heading, this._time);
      if (on && amount > 0 && !isFront && W.tireSmoke > 0 && this.particles.detail) {
        for (let n = this.particles._rate(`tyre${i}`, 48 * amount * W.tireSmoke, dt); n > 0; n--) {
          this.particles.smoke.emit(x + (Math.random() - 0.5) * 0.5, 0.4, z + (Math.random() - 0.5) * 0.5,
            v.vx * 0.15 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.9, v.vz * 0.15 + (Math.random() - 0.5) * 1.5,
            { life: 1.6 + Math.random(), size: 1.8, grow: 4.6, color: [0.84, 0.84, 0.86], alpha: Math.min(0.65, 0.6 * amount + 0.1) });
        }
      }
      // Wet roads: a fan of spray behind each wheel.
      const wet = ctx.wet * W.spray;
      if (on && wet > 0.1 && speed > 6 && this.particles.detail) {
        for (let n = this.particles._rate(`spray${i}`, (speed * 1.1 + v.slip * 4) * wet, dt); n > 0; n--) {
          const up = 1.5 + Math.random() * 2.5;
          this.particles.smoke.emit(x - f[0] * 0.4, 0.3, z - f[1] * 0.4,
            v.vx * 0.35 - f[0] * 2 + (Math.random() - 0.5) * 3, up, v.vz * 0.35 - f[1] * 2 + (Math.random() - 0.5) * 3,
            { life: 0.45 + Math.random() * 0.35, size: 0.45, grow: 2.6, color: [0.42, 0.47, 0.52], alpha: 0.11 * wet * (0.5 + speed01), gravity: 9 });
        }
      }
    }
    this._time = (this._time || 0) + dt;
    this.skids.update(this._time);
  }

  // After a hit the headlights stutter (a loose wire in a 1920s truck).
  _lights(dt) {
    let level = 1;
    if (this.flicker > 0) {
      this.flicker -= dt;
      level = Math.random() < 0.45 ? 0.08 + Math.random() * 0.2 : 1;
    }
    this.lightLevel = level;
    if (this.headlight) this.headlight.intensity = this.headlightBase * level;
    const lens = this.v.model.lampMesh;
    if (lens?.userData.base) lens.material.color.copy(lens.userData.base).multiplyScalar(0.25 + 0.75 * level);
  }
}

// Skid marks: pooled quads laid on the road, one draw call. Each wheel draws a strip while
// it slides; marks fade out over JUICE.wheels.skidLife seconds.
class SkidMarks {
  constructor(scene, n = 900) {
    this.n = n;
    this.cursor = 0;
    this.pos = new Float32Array(n * 12);
    this.col = new Float32Array(n * 16);
    this.born = new Float32Array(n).fill(-1e9);
    this.strength = new Float32Array(n);
    const idx = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    scene.add(this.mesh);
    this.last = [];          // per wheel: [x, z] where its current strip ended, or null
    this._fadeT = 0;
  }

  clear() {
    this.born.fill(-1e9);
    this.col.fill(0);
    this.last = [];
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  // Wheel `i` is at (x, z) sliding with `amount` (0 = rolling normally).
  track(i, x, z, amount, heading, time) {
    const last = this.last[i];
    if (amount <= 0.02) { this.last[i] = null; return; }
    if (!last) { this.last[i] = [x, z]; return; }
    const dx = x - last[0], dz = z - last[1], d = Math.hypot(dx, dz);
    if (d < 0.35) return;
    if (d > 4) { this.last[i] = [x, z]; return; }   // teleported: start a new strip
    const w = 0.2, px = (-dz / d) * w, pz = (dx / d) * w, y = 0.025;
    const k = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos.set([last[0] - px, y, last[1] - pz, last[0] + px, y, last[1] + pz, x + px, y, z + pz, x - px, y, z - pz], k * 12);
    this.born[k] = time;
    this.strength[k] = Math.min(1, amount);
    this._paint(k, time);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.last[i] = [x, z];
  }

  _paint(k, time) {
    const life = Math.max(0.1, JUICE.wheels.skidLife);
    const a = this.strength[k] * 0.9 * Math.max(0, 1 - (time - this.born[k]) / life);
    for (let v = 0; v < 4; v++) this.col.set([0.012, 0.011, 0.01, a], k * 16 + v * 4);
  }

  // Fade the marks a few times a second (they fade slowly; no need to every frame).
  update(time) {
    if (time - this._fadeT < 0.25) return;
    this._fadeT = time;
    for (let k = 0; k < this.n; k++) if (this.col[k * 16 + 3] > 0) this._paint(k, time);
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
