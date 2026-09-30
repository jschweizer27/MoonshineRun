import * as THREE from 'three';
import { CONFIG } from './config.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Third-person chase camera. Smoothing is frame-rate independent, and the camera pulls
// in closer instead of clipping into a building when you back up against a wall.
export class ChaseCamera {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.heading = 0;
    this.distanceScale = 1;
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
    this._look.set(v.position.x + fx * 3, 1.6, v.position.z + fz * 3);
  }

  snap(vehicle) {
    this.heading = vehicle.heading;
    this._desired(vehicle, this.heading);
    this.camera.position.copy(this._target);
    this.camera.lookAt(this._look);
  }

  update(dt, vehicle, lookBack = false) {
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
    this.camera.lookAt(this._look);
  }
}
