import * as THREE from 'three';
import { CONFIG, MS_TO_MPH } from './config.js';
import { buildVehicle } from './models.js';

// Arcade car physics on the ground plane. Heading 0 faces north (-Z); positive steer
// turns right. The car keeps a velocity vector: grip bleeds off sideways slide (the
// handbrake lowers grip for drifts), and two collision circles along the body push it
// out of buildings with a bounce.
export class Vehicle {
  constructor(scene, collision, { tuning = CONFIG.player, model = true } = {}) {
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

    // `model: false`: physics only, drawn by someone else (the agents' instanced sedans).
    const m = model ? buildVehicle() : { group: new THREE.Object3D(), wheels: [], frontPivots: [], wheelRadius: 0.4 };
    this.mesh = m.group;
    this.model = m;
    if (model) scene.add(this.mesh);
  }

  // The body's look ('stock', or 'reinforced' once the bed is upgraded); one mesh shows at
  // a time, and both are built up front.
  setLook(name) {
    const looks = this.model.looks || {};
    if (!looks[name]) name = 'stock';
    for (const [k, m] of Object.entries(looks)) m.visible = k === name;
    this.look = name;
  }

  place(x, z, heading = 0) {
    this.position.set(x, 0, z);
    this.heading = heading;
    this.vx = this.vz = this.speed = this.slip = this.impact = 0;
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
    const steerScale = Math.min(1, sp / t.steerRamp) * (1 - t.steerFalloff * Math.min(1, sp / t.maxSpeed));
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
      this.vx -= this.t.bounce * vn * nx;
      this.vz -= this.t.bounce * vn * nz;
      this.vx *= this.t.wallKeep; this.vz *= this.t.wallKeep;
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
  }
}

// Two cars pushing apart (each two circles along its body), with a bounce; `massRatio` is
// the share of the push the first takes. Returns the closing speed (0 if not touching).
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
