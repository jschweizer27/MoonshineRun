import * as THREE from 'three';
import { CONFIG } from './config.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Third-person chase camera. Smoothing is frame-rate independent, the camera pulls in
// instead of clipping into buildings, the view widens with speed, and hard hits shake it
// (both off with Reduce motion). Hold look-back to see what's chasing you.
export class ChaseCamera {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.heading = 0;
    this.distanceScale = 1;
    this.reducedMotion = false;
    this._trauma = 0;
    this._t = 0;
    this._target = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  _desired(v, heading) {
    const c = CONFIG.camera;
    const fx = Math.sin(heading), fz = -Math.cos(heading);
    let dist = c.distance * this.distanceScale;
    for (const k of [1, 0.7, 0.45, 0.25]) {
      const d = dist * k;
      if (!this.collision || !this.collision.segmentBlocked(v.position.x, v.position.z, v.position.x - fx * d, v.position.z - fz * d)) { dist = d; break; }
      if (k === 0.25) dist = d;
    }
    this._target.set(v.position.x - fx * dist, c.height * (0.6 + 0.4 * this.distanceScale), v.position.z - fz * dist);
    this._look.set(v.position.x + fx * 6, 1.6, v.position.z + fz * 6);
  }

  snap(vehicle) {
    this.heading = vehicle.heading;
    this._trauma = 0;
    this._desired(vehicle, this.heading);
    this.camera.position.copy(this._target);
    this.camera.fov = CONFIG.camera.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this._look);
  }

  // 0..1; stacks and decays.
  shake(amount) { if (!this.reducedMotion) this._trauma = Math.min(1, this._trauma + amount); }

  update(dt, vehicle, lookBack = false) {
    this._t += dt;
    this.heading += wrap(vehicle.heading - this.heading) * (1 - Math.exp(-4 * dt));
    if (lookBack) {
      // Snap to a view from in front of the truck, looking back at what's chasing you.
      this._desired(vehicle, this.heading + Math.PI);
      this.camera.position.copy(this._target);
      this.camera.lookAt(this._look);
      this._wasLookingBack = true;
      return;
    }
    this._desired(vehicle, this.heading);
    if (this._wasLookingBack) { this.camera.position.copy(this._target); this._wasLookingBack = false; }
    this.camera.position.lerp(this._target, 1 - Math.exp(-CONFIG.camera.follow * dt));

    // Speed widens the view a little.
    const speed01 = Math.min(1, Math.abs(vehicle.speed) / vehicle.t.maxSpeed);
    const fov = CONFIG.camera.fov + (this.reducedMotion ? 0 : CONFIG.camera.fovKick * speed01 ** 1.5);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-3 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this._look);

    if (this._trauma > 0) {
      const s = this._trauma * this._trauma * 0.6, t = this._t * 40;
      this.camera.position.x += Math.sin(t * 1.1) * s;
      this.camera.position.y += Math.sin(t * 1.7 + 1) * s * 0.6;
      this.camera.rotation.z += Math.sin(t * 1.3 + 2) * s * 0.05;
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
