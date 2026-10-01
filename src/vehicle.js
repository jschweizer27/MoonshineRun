import * as THREE from 'three';
import { CONFIG, MS_TO_MPH } from './config.js';
import { buildVehicle } from './models.js';

// Arcade car physics on the ground plane. Heading 0 faces north (-Z); positive steer
// turns right. The car keeps a velocity vector: grip bleeds off sideways slide (the
// handbrake lowers grip for drifts), and two collision circles along the body push it
// out of buildings with a bounce.
export class Vehicle {
  constructor(scene, collision, { style = 'player', tuning = CONFIG.player } = {}) {
    this.scene = scene;
    this.collision = collision;
    this.t = { ...tuning };
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;          // forward speed (negative when reversing)
    this.slip = 0;           // sideways speed, for screeches and dust
    this.impact = 0;         // speed lost to the last wall hit (0 if none this frame)
    this.steerVisual = 0;
    this.spin = 0;

    const model = buildVehicle(style);
    this.mesh = model.group;
    this.model = model;
    scene.add(this.mesh);
    // The horse trailer is towed: it swings behind the hitch through corners.
    if (model.trailer) {
      this.trailer = { ...model.trailer, x: 0, z: 0, heading: 0, spin: 0 };
      scene.add(model.trailer.group);
    }
  }

  // A second car the player can own (the garage's Rolls-Royce). Every body is built up
  // front so nothing is created mid-game; one is shown at a time, and only the truck tows
  // the horse box.
  addRide(name, style) {
    if (!this.rides) this.rides = { truck: { model: this.model, trailer: this.trailer } };
    const model = buildVehicle(style);
    model.group.visible = false;
    this.scene.add(model.group);
    this.rides[name] = { model, trailer: null };
  }

  setRide(name) {
    const r = this.rides?.[name] || this.rides?.truck;
    if (!r) return;
    const shown = this.mesh.visible;
    for (const x of Object.values(this.rides)) {
      x.model.group.visible = false;
      if (x.trailer) x.trailer.group.visible = false;
    }
    this.model = r.model;
    this.mesh = r.model.group;
    this.trailer = r.trailer;
    this.ride = this.rides[name] ? name : 'truck';
    this.setVisible(shown);
    this.place(this.position.x, this.position.z, this.heading);
  }

  place(x, z, heading = 0) {
    this.position.set(x, 0, z);
    this.heading = heading;
    this.vx = this.vz = this.speed = this.slip = this.impact = 0;
    if (this.trailer) {
      const t = this.trailer, hx = x - Math.sin(heading) * HITCH, hz = z + Math.cos(heading) * HITCH;
      t.heading = heading;
      t.x = hx - Math.sin(heading) * t.hitchLength;
      t.z = hz + Math.cos(heading) * t.hitchLength;
    }
    this._syncMesh(0, 0);
  }

  get forwardX() { return Math.sin(this.heading); }
  get forwardZ() { return -Math.cos(this.heading); }
  get speedMph() { return Math.round(Math.abs(this.speed) * MS_TO_MPH); }

  // input: { throttle: -1..1, steer: -1..1 (right +), handbrake: bool }
  update(dt, input) {
    const t = this.t;
    const thr = input.throttle || 0;
    const steer = input.steer || 0;
    const hb = !!input.handbrake;
    let h = this.heading;
    let fx = Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = Math.sin(h);
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    const maxF = t.maxSpeed * (this.speedFactor ?? 1);

    if (thr > 0) {
      if (vF < -0.5) vF = Math.min(0, vF + t.brake * thr * dt);
      else vF += t.accel * thr * dt * Math.max(0.12, 1 - Math.max(0, vF) / maxF);
    } else if (thr < 0) {
      if (vF > 0.5) vF = Math.max(0, vF + t.brake * thr * dt);
      else vF = Math.max(-t.reverseMax, vF + t.reverseAccel * thr * dt);
    } else {
      const d = t.rolling * dt;
      vF = Math.abs(vF) <= d ? 0 : vF - Math.sign(vF) * d;
    }
    if (hb) {
      const d = 9 * dt;
      vF = Math.abs(vF) <= d ? 0 : vF - Math.sign(vF) * d;
    }
    if (vF > maxF) vF = Math.max(maxF, vF - t.brake * dt);

    // Steering authority grows with speed, then eases off near top speed.
    const sp = Math.abs(vF);
    const steerScale = Math.min(1, sp / 4) * (1 - 0.4 * Math.min(1, sp / t.maxSpeed));
    h += steer * t.turnRate * steerScale * (hb ? 1.45 : 1) * (vF >= 0 ? 1 : -1) * dt;

    // Re-express velocity in the new heading, then let the tyres kill sideways slide.
    const vx = fx * vF + rx * vR, vz = fz * vF + rz * vR;
    fx = Math.sin(h); fz = -Math.cos(h); rx = Math.cos(h); rz = Math.sin(h);
    vF = vx * fx + vz * fz;
    vR = (vx * rx + vz * rz) * Math.exp(-(hb ? t.handbrakeGrip : t.grip) * dt);
    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.heading = h;
    this.speed = vF;
    this.slip = Math.abs(vR);

    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;
    this.impact = 0;
    if (this.collision) this._collide();
    this._syncMesh(dt, steer);
  }

  // Resolve the front and rear circles in turn, then bounce off the combined normal.
  _collide() {
    const { radius: r, circleOffset: off } = this.t;
    let px = 0, pz = 0;
    for (const s of [1, -1]) {
      const cx = this.position.x + this.forwardX * off * s;
      const cz = this.position.z + this.forwardZ * off * s;
      const res = this.collision.resolveCircle(cx, cz, r);
      if (res.hit) {
        const dx = res.x - cx, dz = res.z - cz;
        this.position.x += dx; this.position.z += dz;
        px += dx; pz += dz;
      }
    }
    const len = Math.hypot(px, pz);
    if (len < 1e-6) return;
    const nx = px / len, nz = pz / len;
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      this.vx -= 1.25 * vn * nx;
      this.vz -= 1.25 * vn * nz;
      this.vx *= 0.96; this.vz *= 0.96;
      this.speed = this.vx * this.forwardX + this.vz * this.forwardZ;
      this.impact = -vn;
    }
  }

  _syncMesh(dt, steer) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = -this.heading;
    this.steerVisual += (steer * 0.45 - this.steerVisual) * Math.min(1, dt * 10);
    this.spin += (this.speed * dt) / this.model.wheelRadius;
    for (const w of this.model.wheels) w.rotation.x = -this.spin;
    for (const p of this.model.frontPivots) p.rotation.y = -this.steerVisual;
    if (this.trailer) this._towTrailer();
  }

  // Kinematic trailer: the axle is dragged toward the hitch, keeping its length. The angle
  // to the truck is limited so it can't fold right back on itself.
  _towTrailer() {
    const t = this.trailer;
    const hx = this.position.x - this.forwardX * HITCH, hz = this.position.z - this.forwardZ * HITCH;
    let th = Math.atan2(hx - t.x, -(hz - t.z));
    const diff = Math.atan2(Math.sin(th - this.heading), Math.cos(th - this.heading));
    th = this.heading + Math.max(-1.3, Math.min(1.3, diff));
    const nx = hx - Math.sin(th) * t.hitchLength, nz = hz + Math.cos(th) * t.hitchLength;
    t.spin += (Math.hypot(nx - t.x, nz - t.z) * Math.sign(this.speed || 1)) / this.model.wheelRadius;
    t.x = nx; t.z = nz; t.heading = th;
    t.group.position.set(nx, 0, nz);
    t.group.rotation.y = -th;
    for (const w of t.wheels) w.rotation.x = -t.spin;
  }

  setVisible(v) {
    this.mesh.visible = v;
    if (this.trailer) this.trailer.group.visible = v;
  }
}

const HITCH = 2.65;   // hitch point behind the truck's center

// Push two cars apart (two circles each) and trade momentum. Returns the closing speed
// if they touched, else 0.
export function collideVehicles(a, b, massRatio = 0.5) {
  const ra = a.t.radius, rb = b.t.radius, oa = a.t.circleOffset, ob = b.t.circleOffset;
  let touched = 0;
  for (const sa of [1, -1]) {
    for (const sb of [1, -1]) {
      const ax = a.position.x + a.forwardX * oa * sa, az = a.position.z + a.forwardZ * oa * sa;
      const bx = b.position.x + b.forwardX * ob * sb, bz = b.position.z + b.forwardZ * ob * sb;
      const dx = bx - ax, dz = bz - az;
      const d = Math.hypot(dx, dz);
      const min = ra + rb;
      if (d >= min || d < 1e-5) continue;
      const nx = dx / d, nz = dz / d, pen = min - d;
      a.position.x -= nx * pen * massRatio; a.position.z -= nz * pen * massRatio;
      b.position.x += nx * pen * (1 - massRatio); b.position.z += nz * pen * (1 - massRatio);
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const j = -1.3 * rel;
        a.vx -= nx * j * massRatio; a.vz -= nz * j * massRatio;
        b.vx += nx * j * (1 - massRatio); b.vz += nz * j * (1 - massRatio);
        touched = Math.max(touched, -rel);
      } else {
        touched = Math.max(touched, 0.01);
      }
    }
  }
  if (touched) {
    a.speed = a.vx * a.forwardX + a.vz * a.forwardZ;
    b.speed = b.vx * b.forwardX + b.vz * b.forwardZ;
  }
  return touched;
}

// A car against the towed horse box: the box is kinematic (it follows the hitch), so only
// the car is pushed out and bounced. Two circles cover the box. Returns the closing speed.
export function collideTrailer(v, b) {
  const t = v.trailer;
  if (!t) return 0;
  const fx = Math.sin(t.heading), fz = -Math.cos(t.heading), r = 1.15, rb = b.t.radius, ob = b.t.circleOffset;
  let touched = 0;
  for (const s of [1.35, -0.65]) {             // the box sits just ahead of its axle
    const ax = t.x + fx * s, az = t.z + fz * s;
    for (const sb of [1, -1]) {
      const bx = b.position.x + b.forwardX * ob * sb, bz = b.position.z + b.forwardZ * ob * sb;
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), min = r + rb;
      if (d >= min || d < 1e-5) continue;
      const nx = dx / d, nz = dz / d, pen = min - d;
      b.position.x += nx * pen; b.position.z += nz * pen;
      const rel = b.vx * nx + b.vz * nz;
      if (rel < 0) {
        b.vx -= nx * rel * 1.3; b.vz -= nz * rel * 1.3;
        touched = Math.max(touched, -rel);
      } else {
        touched = Math.max(touched, 0.01);
      }
    }
  }
  if (touched) b.speed = b.vx * b.forwardX + b.vz * b.forwardZ;
  return touched;
}
