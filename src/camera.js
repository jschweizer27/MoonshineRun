import * as THREE from 'three';
import { CONFIG } from './config.js';
import { JUICE } from './juice.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Third-person chase camera. It rides a spring behind the truck (lagging, swaying and
// catching up), pulls back and drops lower as speed builds, looks further up the road, and
// widens its view at speed and under hard acceleration. The road rumbles it at speed and
// crashes shake it. The camera pulls in instead of clipping into buildings. All of the
// feel comes from JUICE.camera; with juice off it is rigidly attached. Shake and FOV kick
// are off with Reduce motion. Hold look-back to see what's chasing you.
export class ChaseCamera {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.heading = 0;
    this.distanceScale = 1;
    this.rideScale = 1;          // closer in for a car without the tall horse box (CONFIG.camera.noTrailer)
    this.reducedMotion = false;
    this._trauma = 0;
    this._t = 0;
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();     // spring state (before shake)
    this._vel = new THREE.Vector3();
    this._acc = new THREE.Vector3();
    this._tv = new THREE.Vector3();
    this._prevTarget = new THREE.Vector3();
  }

  _desired(v, heading, speed01 = 0) {
    const c = CONFIG.camera, J = JUICE.enabled ? JUICE.camera : null;
    const fx = Math.sin(heading), fz = -Math.cos(heading);
    let dist = c.distance * this.distanceScale * this.rideScale * (1 + (J ? J.pullBack * speed01 ** 1.3 : 0));
    for (const k of [1, 0.7, 0.45, 0.25]) {
      const d = dist * k;
      if (!this.collision || !this.collision.segmentBlocked(v.position.x, v.position.z, v.position.x - fx * d, v.position.z - fz * d)) { dist = d; break; }
      if (k === 0.25) dist = d;
    }
    const height = c.height * (0.6 + 0.4 * this.distanceScale) * this.rideScale * (1 - (J ? J.dropAtSpeed * speed01 : 0));
    const ahead = 6 + (J ? J.lookAhead * speed01 : 0);
    this._target.set(v.position.x - fx * dist, height, v.position.z - fz * dist);
    this._look.set(v.position.x + fx * ahead, 1.6, v.position.z + fz * ahead);
  }

  snap(vehicle) {
    this.heading = vehicle.heading;
    this._trauma = 0;
    this._desired(vehicle, this.heading);
    this._pos.copy(this._target);
    this._vel.set(0, 0, 0);
    this.camera.position.copy(this._target);
    this.camera.fov = CONFIG.camera.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this._look);
  }

  // 0..1; stacks and decays.
  shake(amount) {
    if (this.reducedMotion || !JUICE.enabled) return;
    this._trauma = Math.min(1, this._trauma + amount * JUICE.camera.hitShake);
  }

  // accel01: how hard the truck is accelerating (0..1), for the FOV boost.
  update(dt, vehicle, lookBack = false, accel01 = 0) {
    this._t += dt;
    const J = JUICE.enabled ? JUICE.camera : null;
    const speed01 = Math.min(1, Math.abs(vehicle.speed) / vehicle.t.maxSpeed);
    this.heading = J ? this.heading + wrap(vehicle.heading - this.heading) * (1 - Math.exp(-4 * dt)) : vehicle.heading;
    if (lookBack) {
      // Snap to a view from in front of the truck, looking back at what's chasing you.
      this._desired(vehicle, this.heading + Math.PI);
      this.camera.position.copy(this._target);
      this.camera.lookAt(this._look);
      this._wasLookingBack = true;
      return;
    }
    this._prevTarget.copy(this._target);
    this._desired(vehicle, this.heading, speed01);
    if (this._wasLookingBack || !J || !dt) {
      this._pos.copy(this._target);
      this._vel.set(0, 0, 0);
      this._wasLookingBack = false;
    } else {
      // Damped spring toward the ideal spot. Damping acts on the velocity relative to the
      // target, so at a steady speed the camera sits in place; it lags when the truck
      // speeds up, overshoots when it brakes and sways through turns.
      this._tv.subVectors(this._target, this._prevTarget).divideScalar(dt);
      this._acc.subVectors(this._target, this._pos).multiplyScalar(J.stiffness)
        .addScaledVector(this._tv.sub(this._vel), J.damping);
      this._vel.addScaledVector(this._acc, dt);
      this._pos.addScaledVector(this._vel, dt);
    }
    this.camera.position.copy(this._pos);

    // Speed (and a kick of hard acceleration) widens the view.
    const kick = J && !this.reducedMotion ? J.fovKick * speed01 ** 1.5 + J.fovBoost * accel01 : 0;
    const fov = CONFIG.camera.fov + kick;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-3 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this._look);

    // Road rumble at speed, plus the trauma of a crash.
    if (J && !this.reducedMotion) {
      const rumble = J.speedShake * speed01 * speed01, t = this._t;
      this.camera.position.x += (Math.sin(t * 31) + Math.sin(t * 17.3)) * 0.5 * rumble;
      this.camera.position.y += (Math.sin(t * 27.7 + 1) + Math.sin(t * 13.1)) * 0.5 * rumble;
    }
    if (this._trauma > 0) {
      const s = this._trauma * this._trauma * 0.7, t = this._t * 40;
      this.camera.position.x += Math.sin(t * 1.1) * s;
      this.camera.position.y += Math.sin(t * 1.7 + 1) * s * 0.6;
      this.camera.rotation.z += Math.sin(t * 1.3 + 2) * s * 0.06;
      this._trauma = Math.max(0, this._trauma - dt * 1.6);
    }
  }

  // Title screen: a slow circle over the rooftops.
  flyover(dt) {
    this._fly = (this._fly || 0) + dt * 0.045;
    const a = this._fly;
    this.camera.position.set(Math.cos(a) * 175, 62 + Math.sin(a * 0.7) * 10, Math.sin(a) * 175 - 30);
    this.camera.lookAt(0, 12, -40);
  }
}
