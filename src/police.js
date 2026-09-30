import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Vehicle, collideVehicles } from './vehicle.js';

const TUNING = { ...CONFIG.player, maxSpeed: CONFIG.police.maxSpeed, accel: CONFIG.police.accel };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Prohibition Bureau sedans and Temperance Alliance pickups. A fixed pool of cars is built
// up front and recycled, so nothing is created mid-chase. Pursuers drive the road graph,
// need clear line of sight to see you, head for your last known position when they lose
// you, and drive off out of view when the heat dies down.
export class Police {
  constructor(scene, world) {
    this.world = world;
    this.units = [];
    for (let k = 0; k < CONFIG.police.maxUnits; k++) {
      const kind = k % 2 === 0 ? 'fed' : 'zealot';
      const car = new Vehicle(scene, world.collision, { style: kind, tuning: TUNING });
      this.units.push({ id: k, car, kind, active: false, mode: 'idle', path: [], pathTimer: 0,
        lastKnown: new THREE.Vector3(), searchGoal: null, leaveGoal: null, sees: false, stuck: 0, reverse: 0, age: 0 });
    }
    this.contact = false;   // has any pursuer actually seen the player since dispatch?
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._sphere = new THREE.Sphere(new THREE.Vector3(), 5);
    this.reset();
  }

  reset() {
    for (const u of this.units) this._deactivate(u);
    this.contact = false;
  }

  get active() { return this.units.filter((u) => u.active); }
  get pursuing() { return this.units.filter((u) => u.active && u.mode !== 'leave').length; }

  // Keep `count` pursuers on the player; extras drive away.
  setTarget(count, player, camera) {
    if (count === 0) this.contact = false;
    const chasing = this.units.filter((u) => u.active && u.mode !== 'leave');
    while (chasing.length < count) {
      const back = this.units.find((u) => u.active && u.mode === 'leave');
      if (back) { back.mode = 'chase'; back.lastKnown.copy(player.position); chasing.push(back); continue; }
      const free = this.units.find((u) => !u.active);
      if (!free) break;
      this._spawn(free, player, camera);
      chasing.push(free);
    }
    if (chasing.length > count) {
      const p = player.position;
      chasing.sort((a, b) => b.car.position.distanceTo(p) - a.car.position.distanceTo(p));
      for (let k = 0; k < chasing.length - count; k++) this._leave(chasing[k], p);
    }
  }

  _deactivate(u) {
    u.active = false;
    u.mode = 'idle';
    u.car.setVisible(false);
    u.car.place(-5000 - u.id * 50, -5000, 0);
  }

  _spawn(u, player, camera) {
    const { spawnMin, spawnMax } = CONFIG.police;
    const p = player.position;
    this._updateFrustum(camera);
    const candidates = [];
    let fallback = null, fallbackD = -1;
    for (const n of this.world.roads.nodes) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      const hidden = !this._visible(n.x, n.z);
      if (hidden && d >= spawnMin && d <= spawnMax) candidates.push(n);
      if (hidden && d > fallbackD) { fallbackD = d; fallback = n; }
    }
    const n = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : fallback || this.world.roads.nodes[0];
    u.car.place(n.x, n.z, Math.atan2(p.x - n.x, -(p.z - n.z)));
    u.car.setVisible(true);
    Object.assign(u, { active: true, mode: 'chase', path: [], pathTimer: 0, searchGoal: null, sees: false, stuck: 0, reverse: 0, age: 0 });
    u.lastKnown.copy(p);
  }

  _leave(u, p) {
    u.mode = 'leave';
    u.age = 0;
    u.path = [];
    const far = this.world.roads.nodes.filter((n) => Math.hypot(n.x - p.x, n.z - p.z) > 200);
    const n = far.length ? far[Math.floor(Math.random() * far.length)] : this.world.roads.nodes[0];
    u.leaveGoal = { x: n.x, z: n.z };
  }

  _updateFrustum(camera) {
    camera.updateMatrixWorld();
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m);
  }

  _visible(x, z) {
    this._sphere.center.set(x, 1.5, z);
    return this._frustum.intersectsSphere(this._sphere);
  }

  // Returns { seen, touching, nearest, contact } for the heat system.
  update(dt, player, camera, time) {
    this._updateFrustum(camera);
    const cfg = CONFIG.police;
    const p = player.position;
    let seen = false, touching = 0, nearest = Infinity;

    for (const u of this.units) {
      if (!u.active) continue;
      u.age += dt;
      const car = u.car;
      const d = Math.hypot(p.x - car.position.x, p.z - car.position.z);
      if (u.mode !== 'leave') nearest = Math.min(nearest, d);

      u.sees = u.mode !== 'leave' && d < cfg.sightRange && this.world.lineOfSight(car.position, p);
      if (u.sees) {
        seen = true;
        this.contact = true;
        u.lastKnown.copy(p);
        if (u.mode === 'search') u.mode = 'chase';
      }

      let input;
      if (u.mode === 'leave') {
        input = this._drive(u, u.leaveGoal.x, u.leaveGoal.z, dt, 0.8);
        if ((d > cfg.despawnDistance && !this._visible(car.position.x, car.position.z)) || u.age > 45) {
          this._deactivate(u);
          continue;
        }
      } else if (u.sees || d < 20) {
        // Direct pursuit: Feds aim ahead of you to cut you off, zealots just ram.
        let tx = p.x, tz = p.z;
        if (u.kind === 'fed') {
          const lead = Math.min(1.2, d / 40);
          tx += player.vx * lead;
          tz += player.vz * lead;
        }
        input = this._steerTo(car, tx, tz, cfg.maxSpeed);
      } else {
        // Before first contact dispatch radios your live position; afterwards they only
        // know where they last saw you, then search the streets around it.
        const goal = this.contact ? u.lastKnown : p;
        if (u.mode === 'chase' && this.contact && Math.hypot(goal.x - car.position.x, goal.z - car.position.z) < 14) {
          u.mode = 'search';
          u.searchGoal = null;
        }
        if (u.mode === 'search') {
          if (!u.searchGoal || Math.hypot(u.searchGoal.x - car.position.x, u.searchGoal.z - car.position.z) < 14) {
            const n = this.world.roads.nearest(u.lastKnown.x + (Math.random() - 0.5) * 180, u.lastKnown.z + (Math.random() - 0.5) * 180);
            u.searchGoal = { x: n.x, z: n.z };
          }
          input = this._drive(u, u.searchGoal.x, u.searchGoal.z, dt, 0.7);
        } else {
          input = this._drive(u, goal.x, goal.z, dt, 1);
        }
      }
      this._unstick(u, input, dt);
      car.update(dt, input);
      this._animate(u, time);
    }

    // Car-to-car contact (the truck is heavier than a sedan).
    const act = this.active;
    for (const u of act) {
      const hit = collideVehicles(player, u.car, 0.35);
      if (hit && u.mode !== 'leave') touching = Math.max(touching, hit);
    }
    for (let i = 0; i < act.length; i++) {
      for (let j = i + 1; j < act.length; j++) collideVehicles(act[i].car, act[j].car, 0.5);
    }
    player.mesh.position.copy(player.position);
    for (const u of act) u.car.mesh.position.copy(u.car.position);

    return { seen, touching, nearest, contact: this.contact };
  }

  // Follow the road graph toward a goal, slowing for sharp turns at intersections.
  _drive(u, gx, gz, dt, speedScale) {
    const car = u.car;
    const roads = this.world.roads;
    const pos = car.position;
    u.pathTimer -= dt;
    if (u.pathTimer <= 0 || !u.path.length) {
      const from = roads.nearest(pos.x, pos.z);
      const to = roads.nearest(gx, gz);
      u.path = roads.path(from.id, to.id) || [];
      if (u.path.length > 1) {
        const a = roads.nodes[u.path[0]], b = roads.nodes[u.path[1]];
        if (Math.hypot(b.x - pos.x, b.z - pos.z) < Math.hypot(b.x - a.x, b.z - a.z)) u.path.shift();
      }
      u.pathTimer = 0.8 + Math.random() * 0.4;
    }
    let tx = gx, tz = gz;
    while (u.path.length) {
      const n = roads.nodes[u.path[0]];
      if (Math.hypot(n.x - pos.x, n.z - pos.z) < 7) u.path.shift();
      else { tx = n.x; tz = n.z; break; }
    }
    let target = CONFIG.police.maxSpeed * speedScale;
    if (u.path.length > 1) {
      const a = roads.nodes[u.path[0]], b = roads.nodes[u.path[1]];
      const inH = Math.atan2(a.x - pos.x, -(a.z - pos.z));
      const outH = Math.atan2(b.x - a.x, -(b.z - a.z));
      if (Math.abs(wrap(outH - inH)) > 0.6 && Math.hypot(a.x - pos.x, a.z - pos.z) < 26) target = Math.min(target, 11);
    }
    return this._steerTo(car, tx, tz, target);
  }

  _steerTo(car, tx, tz, targetSpeed) {
    const desired = Math.atan2(tx - car.position.x, -(tz - car.position.z));
    const diff = wrap(desired - car.heading);
    const steer = clamp(diff * 2.2, -1, 1);
    let target = targetSpeed;
    if (Math.abs(diff) > 1.2) target = Math.min(target, 9);
    const throttle = car.speed < target - 1 ? 1 : car.speed > target + 2 ? -0.7 : 0.25;
    return { throttle, steer, handbrake: false };
  }

  // Back up and turn if wedged against something.
  _unstick(u, input, dt) {
    if (u.reverse > 0) {
      u.reverse -= dt;
      input.throttle = -1;
      input.steer = input.steer > 0 ? -1 : 1;
      return;
    }
    if (input.throttle > 0.5 && Math.abs(u.car.speed) < 1.5) {
      u.stuck += dt;
      if (u.stuck > 1.0) { u.reverse = 0.9; u.stuck = 0; }
    } else {
      u.stuck = Math.max(0, u.stuck - dt);
    }
  }

  _animate(u, time) {
    const m = u.car.model;
    const on = u.mode !== 'leave';
    const phase = Math.floor(time * 5 + u.id) % 2;
    m.sirens.forEach((lamp, k) => {
      const lit = on && phase === k;
      lamp.material.color.copy(lamp.userData.base).multiplyScalar(lit ? 1 : 0.12);
    });
    m.torches.forEach((f, k) => {
      f.scale.y = 0.8 + 0.35 * Math.abs(Math.sin(time * 17 + k * 2.1));
    });
  }
}
