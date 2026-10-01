import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Vehicle, collideVehicles } from './vehicle.js';
import { buildVehicle } from './models.js';
import { RoadGraph } from './roadgraph.js';

const TUNING = { ...CONFIG.player, maxSpeed: CONFIG.police.maxSpeed, accel: CONFIG.police.accel };
const KINDS = ['fed', 'zealot', 'fed', 'zealot', 'fed', 'fed'];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Prohibition Bureau sedans and Temperance Alliance pickups. A fixed pool of cars is built
// up front and recycled, so nothing is created mid-chase.
//  - Patrols wander the roads and can spot you while you're hauling.
//  - Pursuers drive the road graph, need line of sight, search your last known position,
//    and drive off out of view when the heat dies down. Zealots ram; Feds cut you off.
//  - At 2+ stars roadblocks go up ahead on your route; at 3 stars pursuers get faster.
export class Police {
  constructor(scene, world) {
    this.world = world;
    this.units = KINDS.map((kind, k) => ({
      id: k, car: new Vehicle(scene, world.collision, { style: kind, tuning: TUNING }), kind,
      active: false, mode: 'idle', path: [], pathTimer: 0, lastKnown: new THREE.Vector3(),
      searchGoal: null, leaveGoal: null, sees: false, stuck: 0, reverse: 0, age: 0,
    }));
    this.roadblocks = new Roadblocks(scene, world);
    this.contact = false;   // has any pursuer actually seen the player since dispatch?
    this.tier = 0;
    this.patrolTarget = { city: 2, county: 1 };
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._sphere = new THREE.Sphere(new THREE.Vector3(), 5);
    this.reset();
  }

  reset() {
    for (const u of this.units) this._deactivate(u);
    this.roadblocks.reset();
    this.contact = false;
    this.tier = 0;
  }

  get active() { return this.units.filter((u) => u.active); }
  get pursuing() { return this.units.filter((u) => u.active && (u.mode === 'chase' || u.mode === 'search')).length; }
  get blocked() { return this.roadblocks.blocked; }

  // Keep `count` pursuers on the player; extras drive away. Patrols nearby join first.
  setTarget(count, player, camera, kinds = null) {
    this.tier = count;
    if (count === 0) this.contact = false;
    const chasing = this.units.filter((u) => u.active && (u.mode === 'chase' || u.mode === 'search'));
    const p = player.position;
    while (chasing.length < count) {
      const pool = this.units.filter((u) => u.active && (u.mode === 'leave' || u.mode === 'patrol'))
        .sort((a, b) => a.car.position.distanceTo(p) - b.car.position.distanceTo(p));
      const back = pool.find((u) => u.car.position.distanceTo(p) < 260);
      if (back) { back.mode = 'chase'; back.lastKnown.copy(p); back.path = []; chasing.push(back); continue; }
      const free = this.units.find((u) => !u.active && (!kinds || kinds.includes(u.kind)))
        || this.units.find((u) => !u.active);
      if (!free) break;
      this._spawn(free, p, camera, 'chase');
      chasing.push(free);
    }
    if (chasing.length > count) {
      chasing.sort((a, b) => b.car.position.distanceTo(p) - a.car.position.distanceTo(p));
      for (let k = 0; k < chasing.length - count; k++) this._leave(chasing[k], p);
    }
  }

  // Keep a couple of patrols cruising near the player (none in a bribed county).
  _maintainPatrols(player, camera, ctx) {
    const p = player.position;
    const inCounty = this.world.inCounty(p);
    for (const u of this.units) {
      if (u.active && u.mode === 'patrol' && u.car.position.distanceTo(p) > 480 && !this._visible(u.car.position.x, u.car.position.z)) this._deactivate(u);
    }
    if (ctx.tier > 0) return;
    const patrols = this.units.filter((u) => u.active && u.mode === 'patrol');
    const want = inCounty ? (ctx.bribed ? 0 : this.patrolTarget.county) : this.patrolTarget.city;
    if (patrols.length < want) {
      const free = this.units.find((u) => !u.active && u.kind === 'fed');
      if (free) this._spawn(free, p, camera, 'patrol', { min: 160, max: 380 });
    }
  }

  _deactivate(u) {
    u.active = false;
    u.mode = 'idle';
    u.car.setVisible(false);
    u.car.place(-5000 - u.id * 50, -5000, 0);
  }

  _spawn(u, p, camera, mode, range = { min: CONFIG.police.spawnMin, max: CONFIG.police.spawnMax }) {
    this._updateFrustum(camera);
    const candidates = [];
    let fallback = null, fallbackD = -1;
    for (const n of this.world.roads.nodes) {
      if (n.tag === 'lane') continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      const hidden = !this._visible(n.x, n.z);
      if (hidden && d >= range.min && d <= range.max) candidates.push(n);
      if (hidden && d > fallbackD && d < 700) { fallbackD = d; fallback = n; }
    }
    const n = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : fallback || this.world.roads.nodes[0];
    u.car.place(n.x, n.z, Math.atan2(p.x - n.x, -(p.z - n.z)));
    u.car.setVisible(true);
    Object.assign(u, { active: true, mode, path: [], pathTimer: 0, searchGoal: null, sees: false, stuck: 0, reverse: 0, age: 0 });
    u.lastKnown.copy(p);
  }

  _leave(u, p) {
    u.mode = 'leave';
    u.age = 0;
    u.path = [];
    const far = this.world.roads.nodes.filter((n) => n.tag !== 'lane' && Math.hypot(n.x - p.x, n.z - p.z) > 200);
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

  // ctx: { carrying, disguised, sight (range multiplier), safeZone, bribed, tier, route, ramResist }
  // Returns { seen, spotted, touching, nearest, contact } for the heat system.
  update(dt, player, camera, time, ctx = {}) {
    this._updateFrustum(camera);
    const cfg = CONFIG.police;
    const p = player.position;
    const sight = cfg.sightRange * (ctx.sight ?? 1);
    const boost = ctx.tier >= 3 ? 1.18 : 1;
    let seen = false, spotted = false, touching = 0, nearest = Infinity;
    this._maintainPatrols(player, camera, ctx);

    for (const u of this.units) {
      if (!u.active) continue;
      u.age += dt;
      const car = u.car;
      const d = Math.hypot(p.x - car.position.x, p.z - car.position.z);
      const chasing = u.mode === 'chase' || u.mode === 'search';
      car.t.maxSpeed = cfg.maxSpeed * (chasing ? boost : 1);
      car.t.accel = cfg.accel * (chasing ? boost : 1) * (u.kind === 'zealot' ? 1.1 : 1);
      if (chasing) nearest = Math.min(nearest, d);

      const los = d < sight && this.world.lineOfSight(car.position, p);
      u.sees = los && !ctx.safeZone && u.mode !== 'leave';
      if (u.mode === 'patrol') {
        // Patrols only react to a truck that looks wrong: hauling, and either speeding
        // (no disguise) or close enough to see the jugs. When you're already wanted, any
        // patrol that sees you joins in.
        const suspicious = ctx.carrying && (!ctx.disguised || d < cfg.closeRange);
        if (u.sees && (suspicious || ctx.tier > 0)) {
          u.mode = 'chase';
          u.lastKnown.copy(p);
          spotted = spotted || ctx.tier === 0;
        } else {
          u.sees = false;
        }
      }
      if (u.sees) {
        seen = true;
        this.contact = true;
        u.lastKnown.copy(p);
        if (u.mode === 'search') u.mode = 'chase';
      }

      let input;
      if (u.mode === 'leave') {
        input = this._drive(u, u.leaveGoal.x, u.leaveGoal.z, dt, 0.8);
        if ((d > cfg.despawnDistance && !this._visible(car.position.x, car.position.z)) || u.age > 45) { this._deactivate(u); continue; }
      } else if (u.mode === 'patrol') {
        if (!u.searchGoal || Math.hypot(u.searchGoal.x - car.position.x, u.searchGoal.z - car.position.z) < 14) {
          const n = this.world.roads.random(Math.random, (m) => m.tag !== 'lane' && Math.hypot(m.x - p.x, m.z - p.z) < 350);
          u.searchGoal = n ? { x: n.x, z: n.z } : { x: p.x, z: p.z };
        }
        input = this._drive(u, u.searchGoal.x, u.searchGoal.z, dt, 0.4);
      } else if (u.sees || (d < 20 && !ctx.safeZone)) {
        // Direct pursuit. Zealots ram you head-on; Feds aim ahead to cut you off, and up
        // close they try to get in front of you and box you in.
        let tx = p.x, tz = p.z;
        if (u.kind === 'fed') {
          const lead = d < 16 ? 0.9 : Math.min(1.2, d / 40);
          tx += player.vx * lead;
          tz += player.vz * lead;
        }
        input = this._steerTo(car, tx, tz, cfg.maxSpeed * boost);
      } else {
        // Before first contact dispatch radios your live position; afterwards they only
        // know where they last saw you, then search the roads around it.
        const goal = this.contact ? u.lastKnown : p;
        if (u.mode === 'chase' && this.contact && Math.hypot(goal.x - car.position.x, goal.z - car.position.z) < 14) {
          u.mode = 'search';
          u.searchGoal = null;
        }
        if (u.mode === 'search') {
          if (!u.searchGoal || Math.hypot(u.searchGoal.x - car.position.x, u.searchGoal.z - car.position.z) < 14) {
            const n = this.world.roads.nearest(u.lastKnown.x + (Math.random() - 0.5) * 180, u.lastKnown.z + (Math.random() - 0.5) * 180, (m) => m.tag !== 'lane');
            u.searchGoal = { x: n.x, z: n.z };
          }
          input = this._drive(u, u.searchGoal.x, u.searchGoal.z, dt, 0.7);
        } else {
          input = this._drive(u, goal.x, goal.z, dt, boost);
        }
      }
      this._unstick(u, input, dt);
      car.update(dt, input);
      this._animate(u, time);
    }

    // Roadblock officers watch the road too.
    const rb = this.roadblocks.update(dt, player, camera, this, ctx);
    if (rb.seen) { seen = true; this.contact = true; }

    // Car-to-car contact. The truck is heavier than a sedan; zealots hit harder; the
    // Enforcer's armor softens it.
    const act = this.active;
    const resist = ctx.ramResist ?? 1;
    for (const u of act) {
      const ratio = (u.kind === 'zealot' ? 0.5 : 0.35) * resist;
      const hit = collideVehicles(player, u.car, ratio);
      if (hit && u.mode !== 'leave' && u.mode !== 'patrol') touching = Math.max(touching, hit);
    }
    for (let i = 0; i < act.length; i++) {
      for (let j = i + 1; j < act.length; j++) collideVehicles(act[i].car, act[j].car, 0.5);
    }
    player.mesh.position.copy(player.position);
    for (const u of act) u.car.mesh.position.copy(u.car.position);
    nearest = Math.min(nearest, rb.nearest);

    return { seen, spotted, touching, nearest, contact: this.contact };
  }

  // Follow the road graph toward a goal (around roadblocks), slowing for sharp turns.
  _drive(u, gx, gz, dt, speedScale) {
    const car = u.car;
    const roads = this.world.roads;
    const pos = car.position;
    u.pathTimer -= dt;
    if (u.pathTimer <= 0 || !u.path.length) {
      const from = roads.nearest(pos.x, pos.z);
      const to = roads.nearest(gx, gz);
      u.path = roads.path(from.id, to.id, this.roadblocks.blocked) || roads.path(from.id, to.id) || [];
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
    const on = u.mode === 'chase' || u.mode === 'search';
    flashSirens(m.sirens, on, time + u.id);
    m.torches.forEach((f, k) => {
      f.scale.y = 0.8 + 0.35 * Math.abs(Math.sin(time * 17 + k * 2.1));
    });
  }
}

function flashSirens(sirens, on, time) {
  // A rotating beacon: a bright sweep about twice a second, never fully dark.
  const sweep = Math.pow(Math.abs(Math.sin(time * 6.5)), 4);
  sirens.forEach((lamp) => {
    lamp.material.color.copy(lamp.userData.base).multiplyScalar(on ? 0.15 + 0.85 * sweep : 0.1);
  });
}

// Up to two roadblocks: parked Bureau sedans and sawhorses across a road ahead of you.
class Roadblocks {
  constructor(scene, world) {
    this.world = world;
    this.pool = [0, 1].map(() => {
      const group = new THREE.Group();
      const cars = [0, 1].map(() => { const v = buildVehicle('fed'); group.add(v.group); return v; });
      const barrierMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 });
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xb02a20, roughness: 0.7 });
      const barriers = [0, 1].map(() => {
        const b = new THREE.Group();
        b.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 0.18).translate(0, 1.0, 0), barrierMat));
        b.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.2).translate(0, 1.0, 0), stripeMat));
        for (const x of [-1.3, 1.3]) b.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.6).translate(x, 0.55, 0), barrierMat));
        group.add(b);
        return b;
      });
      group.visible = false;
      scene.add(group);
      return { group, cars, barriers, active: false, colliders: [], edge: null, x: 0, z: 0, age: 0 };
    });
    this.blocked = new Set();
    this._timer = 0;
  }

  reset() {
    for (const r of this.pool) this._remove(r);
    this._timer = 8;
  }

  get active() { return this.pool.filter((r) => r.active); }

  _remove(r) {
    for (const c of r.colliders) this.world.collision.remove(c);
    r.colliders = [];
    r.active = false;
    r.group.visible = false;
    if (r.edge) this.blocked.delete(r.edge);
    r.edge = null;
  }

  // Place a roadblock across the road leading into a route node well ahead of you.
  _place(r, player, police, route) {
    const p = player.position;
    for (let i = 2; i < route.length - 1; i++) {
      const a = route[i - 1], b = route[i];
      if (a.id == null || b.id == null || a.tag === 'lane' || b.tag === 'lane') continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 90 || d > 240) continue;
      // Don't pop one up in plain view: it must be off-screen, behind buildings, or far.
      if (police._visible(b.x, b.z) && d < 180 && this.world.lineOfSight(p, b)) continue;
      const key = RoadGraph.edgeKey(a.id, b.id);
      if (this.blocked.has(key)) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 30) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      const cx = b.x - ux * 16, cz = b.z - uz * 16;       // just before the junction
      const px = -uz, pz = ux;                            // across the road
      const heading = Math.atan2(px, -pz);
      r.cars.forEach((car, k) => {
        const s = k ? 3.2 : -3.2;
        car.group.position.set(cx + px * s, 0, cz + pz * s);
        car.group.rotation.y = -heading;
      });
      r.barriers.forEach((bar, k) => {
        const s = k ? 1.4 : -1.4;
        bar.position.set(cx + ux * (s * 2.4) + px * 0.2, 0, cz + uz * (s * 2.4));
        bar.rotation.y = -heading + Math.PI / 2;
      });
      // Block the whole road width.
      r.colliders.push(this.world.collision.addCapsule(cx - px * 6.5, cz - pz * 6.5, cx + px * 6.5, cz + pz * 6.5, 1.3, { tag: 'roadblock' }));
      Object.assign(r, { active: true, edge: key, x: cx, z: cz, age: 0 });
      r.group.visible = true;
      this.blocked.add(key);
      return true;
    }
    return false;
  }

  update(dt, player, camera, police, ctx) {
    const p = player.position;
    let seen = false, nearest = Infinity;
    const wanted = ctx.tier >= 2 ? ctx.tier - 1 : 0;
    for (const r of this.pool) {
      if (!r.active) continue;
      r.age += dt;
      const d = Math.hypot(r.x - p.x, r.z - p.z);
      const gone = !police._visible(r.x, r.z);
      if ((wanted === 0 || d > 320 || r.age > 70) && gone) { this._remove(r); continue; }
      if (!ctx.safeZone && d < 60 && this.world.lineOfSight({ x: r.x, z: r.z }, p)) seen = true;
      nearest = Math.min(nearest, d);
      for (const c of r.cars) flashSirens(c.sirens, true, (performance.now() / 1000) + c.group.position.x);
    }
    this._timer -= dt;
    if (wanted > this.active.length && this._timer <= 0 && ctx.route && ctx.route.length > 3) {
      const free = this.pool.find((r) => !r.active);
      if (free && this._place(free, player, police, ctx.route)) this._timer = ctx.tier >= 3 ? 14 : 20;
      else this._timer = 3;
    }
    return { seen, nearest };
  }
}
