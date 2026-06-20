import * as THREE from 'three';
import { Vehicle } from './vehicle.js';

// Pursuers: Prohibition cops and Temperance Alliance zealots that spawn when the
// heat is on and chase Otto. Count tracks the wanted level. Contact = busted.
export class Pursuers {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.catchRadius = 4.2;
  }

  // Make the active pursuer count match the wanted level, spawning new cars away
  // from the player and despawning extras when the heat cools.
  setCount(target, playerPos) {
    while (this.cars.length < target) this._spawn(playerPos);
    while (this.cars.length > target) this.cars.pop().dispose();
  }

  _spawn(playerPos) {
    // Alternate cop (black) and zealot (dark red) liveries.
    const isZealot = this.cars.length % 2 === 1;
    const car = new Vehicle(this.scene, {
      color: isZealot ? 0x5a1f1f : 0x141414,
      cab: isZealot ? 0x320f0f : 0x0a0a0a,
    });
    car.maxSpeed = 88;     // a touch slower than the player so escape is possible
    const spawn = this.world.randomRoadPoint(playerPos, 120);
    car.position.copy(spawn);
    car.heading = Math.random() * Math.PI * 2;
    this.cars.push(car);
  }

  // Steer each pursuer toward the player; return true if any car catches Otto.
  update(dt, playerPos) {
    let caught = false;
    for (const car of this.cars) {
      const dx = playerPos.x - car.position.x;
      const dz = playerPos.z - car.position.z;
      const dist = Math.hypot(dx, dz);

      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      // Wrap to [-PI, PI] for shortest turn.
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);

      // Ease off the throttle once basically on top of the player.
      const throttle = dist > 6 ? 1 : 0.3;
      car.update(dt, { throttle, steer });

      if (dist < this.catchRadius) caught = true;
    }
    return caught;
  }

  clear() {
    for (const car of this.cars) car.dispose();
    this.cars = [];
  }
}
