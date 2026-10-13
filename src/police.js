import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Vehicle, collideVehicles } from './vehicle.js';
import { RoadGraph } from './roadgraph.js';
import { createRng } from './rng.js';

// Revenue agents: Prohibition Bureau sedans (CONFIG.dredge.police). A fixed pool of cars,
// physics only (vehicle.js with no model), drawn as one instanced sedan mesh with its roof
// lamps and the patrols' sight cones as two more; the roadblock and the York Road
// checkpoint borrow extra instances. Built at boot; nothing is made while driving.
//  - Patrols cruise the roads near the truck (more at night) and see ahead in a cone,
//    needing a clear line of sight. One already after you sees all round.
//  - Seen with shine aboard is heat (0-3): spotted is 1 and the spotter follows; seen
//    longer builds to 2 (a second car, a roadblock ahead on your route) and 3 (every car).
//    Out of every agent's sight long enough drops a tier.
//  - Pinned (an agent right on you while you're nearly stopped) fills the bust meter.
//  - At night the checkpoint at the York Road gap stops traffic: stop and be searched, or
//    run it with shine aboard and it's heat 2.
// update() returns events for main.js: spotted, tier, clear, bust, search, ran.
const P = CONFIG.dredge.police;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TUNING = { ...CONFIG.player, maxSpeed: P.maxSpeed, accel: P.accel };
const EXTRA = 4;                     // instances for the roadblock (2) and checkpoint (2) cars

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, w) => new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2);

// Merged, vertex-coloured parts: [geometry, colour, x, y, z].
function merge(parts) {
  const geos = parts.map(([g, color, x, y, z]) => {
    g = g.index ? g.toNonIndexed() : g;
    g.translate(x, y, z);
    g.deleteAttribute('uv');
    const c = new THREE.Color(color), n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    return g;
  });
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const all = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].array.length, 0));
    geos.reduce((o, g) => { all.set(g.attributes[name].array, o); return o + g.attributes[name].array.length; }, 0);
    out.setAttribute(name, new THREE.BufferAttribute(all, 3));
  }
  for (const g of geos) g.dispose();
  out.computeBoundingSphere();
  return out;
}

// A Bureau sedan: long and black, a cream stripe, chrome grille, spoked wheels.
const sedan = () => merge([
  [box(1.8, 0.6, 4.4), 0x15171a, 0, 0.75, 0],
  [box(1.7, 0.9, 2.2), 0x15171a, 0, 1.45, 0.35],
  [box(1.6, 0.48, 2.15), 0x8fa4ad, 0, 1.5, 0.35],
  [box(1.76, 0.12, 2.24), 0x23262a, 0, 1.95, 0.35],
  [box(1.84, 0.1, 4.0), 0xd8cfb8, 0, 0.98, 0],                    // the stripe
  [box(1.1, 0.55, 0.15), 0xc8c0a8, 0, 0.9, -2.25],                // grille
  ...[[-1.0, 0], [1.0, 0]].map(([x]) => [box(0.25, 0.08, 3.4), 0x23262a, x, 0.42, 0]),
  ...[[-0.9, -1.45], [0.9, -1.45], [-0.9, 1.45], [0.9, 1.45]].map(([x, z]) => [cyl(0.4, 0.24), 0x111111, x, 0.4, z]),
]);

// A sawhorse barrier, white and red.
const sawhorse = () => merge([
  [box(3.2, 0.35, 0.18), 0xe8e0d0, 0, 1.0, 0],
  [box(0.9, 0.36, 0.2), 0xb02a20, 0, 1.0, 0],
  [box(0.12, 1.1, 0.6), 0xe8e0d0, -1.3, 0.55, 0],
  [box(0.12, 1.1, 0.6), 0xe8e0d0, 1.3, 0.55, 0],
]);

export class Police {
  constructor(scene, world, seed = 1) {
    this.world = world;
    this.roads = world.roads;
    this.rng = createRng((seed ^ 0x9a7201) >>> 0);
    this.enabled = true;
    this.units = Array.from({ length: P.pool }, (_, id) => ({
      id, car: new Vehicle(scene, world.collision, { tuning: TUNING, model: false }),
      active: false, mode: 'idle', path: [], pathTimer: 0, lastKnown: new THREE.Vector3(),
      goal: null, sees: false, stuck: 0, reverse: 0, age: 0,
    }));
    const n = P.pool + EXTRA;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.25, emissive: new THREE.Color(0x1a1c20) });
    this.bodies = new THREE.InstancedMesh(sedan(), this.material, n);
    this.bodies.name = 'agents';
    this.bodies.castShadow = this.bodies.receiveShadow = true;
    // Roof lamps: unlit, bright, flashing red while chasing (instance colours).
    this.lamps = new THREE.InstancedMesh(box(0.34, 0.22, 0.34).translate(0, 2.12, 0.35), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    this.lamps.name = 'agent-lamps';
    this.lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    // Sight cones on the road ahead of a patrol: a faint additive amber fan.
    const fan = new THREE.CircleGeometry(1, 20, Math.PI / 2 - P.cone, P.cone * 2).rotateX(-Math.PI / 2).translate(0, 0.08, 0);
    this.cones = new THREE.InstancedMesh(fan, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), P.pool);
    this.cones.name = 'agent-cones';
    this.cones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(P.pool * 3), 3);
    this.cones.renderOrder = 2;
    this.barriers = new THREE.InstancedMesh(sawhorse(), this.material, 4);
    this.barriers.name = 'barriers';
    for (const m of [this.bodies, this.lamps, this.cones, this.barriers]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._sphere = new THREE.Sphere(new THREE.Vector3(), 5);
    this.blocked = new Set();        // the roadblock's edge, for the agents' own routes
    this.roadblock = { active: false, collider: null, edge: null, x: 0, z: 0, heading: 0, age: 0 };
    const C = P.checkpoint;
    this.checkpoint = { ...C, on: false, handled: false };
    this.reset();
  }

  // A new run, or after a bust: no one about, no heat.
  reset() {
    for (const u of this.units) this._deactivate(u);
    this._removeRoadblock();
    this.heat = 0;
    this.evade = 0;
    this.bust = 0;
    this.contact = false;
    this.checkpoint.handled = false;
    this._rbTimer = 4;
    this.hold = 0;
    this._write(0);
  }

  // A story's ambush (chapters.js, chapter 5 at Warren): the heat straight to `tier`, every
  // car it calls for brought in on the roads `range` metres off (out of view where it can
  // be), a roadblock going up on the route, and the heat held `hold` seconds so it can't
  // cool before they get there. Returns the events, for main._onPolice.
  alert(p, tier, { hold = 10, range = [70, 150] } = {}) {
    const events = [];
    this.hold = hold;
    // Cars too far off to be part of it (a patrol across the county) go home; the trap's
    // cars all come in close.
    for (const u of this.units) if (u.active && u.car.position.distanceTo(p) > range[1] * 1.5 && !this._visible(u.car.position.x, u.car.position.z)) this._deactivate(u);
    this._raise(tier, events, p, this._roadPoints(p, range));
    this._rbTimer = 0;
    return events;
  }

  // Points along the roads `range` metres from `p`, at least 25 m apart, the ones out of
  // view first: where an ambush comes from.
  _roadPoints(p, [r0, r1]) {
    const pts = [], N = this.roads.nodes;
    for (const a of N) for (const id of a.links) {
      const b = N[id];
      if (id < a.id || a.tag === 'lane' || b.tag === 'lane') continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0; t <= len; t += 10) {
        const x = a.x + ((b.x - a.x) * t) / len, z = a.z + ((b.z - a.z) * t) / len, d = Math.hypot(x - p.x, z - p.z);
        if (d >= r0 && d <= r1) pts.push({ x, z, hidden: this._visible(x, z) ? 0 : 1 });
      }
    }
    pts.sort((q, w) => w.hidden - q.hidden);
    const out = [];
    for (const q of pts) if (out.every((o) => Math.hypot(o.x - q.x, o.z - q.z) > 25)) out.push(q);
    return out;
  }

  // How far the nearest car after the truck is (Infinity if none): for the siren.
  chaseDistance() { return this._nearest ?? Infinity; }

  get tier() { return Math.min(P.max, Math.floor(this.heat + 1e-6)); }
  get active() { return this.units.filter((u) => u.active); }
  get chasing() { return this.units.filter((u) => u.active && (u.mode === 'chase' || u.mode === 'search')).length; }

  // ---------- the pool ----------
  _deactivate(u) {
    Object.assign(u, { active: false, mode: 'idle', path: [], goal: null, sees: false });
    u.car.place(-5000 - u.id * 50, -5000, 0);
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

  // Bring a car in on a road node out of view, `range` metres off, facing the truck.
  _spawn(u, p, mode, range = P.spawn) {
    const ok = (n) => n.tag !== 'lane' && !this._visible(n.x, n.z);
    let best = null, tries = 0;
    while (!best && tries++ < 40) {
      const n = this.roads.nodes[Math.floor(this.rng() * this.roads.nodes.length)];
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (ok(n) && d >= range[0] && d <= range[1]) best = n;
    }
    if (!best) return false;
    this._bringIn(u, best.x, best.z, p, mode);
    return true;
  }

  // A car at (x, z), facing the truck at `p`.
  _bringIn(u, x, z, p, mode) {
    u.car.place(x, z, Math.atan2(p.x - x, -(p.z - z)));
    Object.assign(u, { active: true, mode, path: [], pathTimer: 0, goal: null, sees: false, stuck: 0, reverse: 0, age: 0 });
    u.lastKnown.copy(p);
  }

  _leave(u, p) {
    u.mode = 'leave';
    u.age = 0;
    u.path = [];
    const n = this.roads.random(this.rng, (m) => m.tag !== 'lane' && Math.hypot(m.x - p.x, m.z - p.z) > 250);
    u.goal = n ? { x: n.x, z: n.z } : null;
  }

  // Keep the patrols near the truck that the hour calls for; send the far ones home.
  _patrols(p, night) {
    const want = P.patrols[night ? 'night' : 'day'][this.world.inCounty(p) ? 'county' : 'city'];
    let have = 0;
    for (const u of this.units) {
      if (!u.active || u.mode !== 'patrol') continue;
      if (Math.hypot(u.car.position.x - p.x, u.car.position.z - p.z) > P.despawn && !this._visible(u.car.position.x, u.car.position.z)) this._deactivate(u);
      else if (++have > want) this._leave(u, p);
    }
    if (this.tier === 0 && have < want) {
      const free = this.units.find((u) => !u.active);
      if (free) this._spawn(free, p, 'patrol');
    }
  }

  // Heat changed: the right number of cars after the truck (patrols nearby join first).
  _setPursuers(p, spots = null) {
    const want = [0, 1, 2, P.pool][this.tier];
    const after = this.units.filter((u) => u.active && (u.mode === 'chase' || u.mode === 'search'));
    while (after.length < want) {
      const near = this.units.filter((u) => u.active && (u.mode === 'patrol' || u.mode === 'leave'))
        .sort((a, b) => a.car.position.distanceTo(p) - b.car.position.distanceTo(p))[0];
      if (near) { near.mode = 'chase'; near.path = []; near.lastKnown.copy(p); after.push(near); continue; }
      const free = this.units.find((u) => !u.active);
      if (!free) break;
      if (spots?.length) { const q = spots.shift(); this._bringIn(free, q.x, q.z, p, 'chase'); }
      else if (!this._spawn(free, p, 'chase')) break;
      after.push(free);
    }
    if (after.length > want) {
      after.sort((a, b) => b.car.position.distanceTo(p) - a.car.position.distanceTo(p));
      for (let k = 0; k < after.length - want; k++) this._leave(after[k], p);
    }
  }

  _raise(to, events, p, spots = null) {
    const was = this.tier;
    this.heat = Math.max(this.heat, to);
    this.evade = 0;
    if (this.tier !== was) { events.push({ type: 'tier', tier: this.tier, up: true }); this._setPursuers(p, spots); }
  }

  // ---------- the step ----------
  // ctx: { contraband (shine aboard), night, lightsOff, route (the radar's nodes),
  // checkpoint (false: the York Road checkpoint isn't up yet) }.
  // Returns { events, seen, nearest }.
  update(dt, player, camera, time, ctx = {}) {
    const events = [];
    const p = player.position;
    if (!this.enabled) { this._write(time); return { events, seen: false, nearest: Infinity }; }
    this._updateFrustum(camera);
    this._patrols(p, ctx.night);
    const range = P.sight * (ctx.night ? (ctx.lightsOff ? P.darkSight : P.nightSight) : 1);
    const boost = this.tier >= 3 ? P.boost : 1;
    let seen = false, nearest = Infinity;
    for (const u of this.units) {
      if (!u.active) continue;
      u.age += dt;
      const car = u.car, dx = p.x - car.position.x, dz = p.z - car.position.z, d = Math.hypot(dx, dz);
      const after = u.mode === 'chase' || u.mode === 'search';
      if (after) nearest = Math.min(nearest, d);
      car.t.maxSpeed = P.maxSpeed * (after ? boost : 0.75);
      car.t.accel = P.accel * (after ? boost : 1);
      // A patrol looks ahead in its cone (close up it notices anyway); one after you sees all round.
      const ahead = Math.abs(wrap(Math.atan2(dx, -dz) - car.heading)) <= P.cone || d < P.closeSight;
      const sees = u.mode !== 'leave' && d < range && (after || ahead) && this.world.lineOfSight(car.position, p);
      u.sees = false;
      if (sees && (ctx.contraband || this.tier > 0)) {
        u.sees = true;
        seen = true;
        u.lastKnown.copy(p);
        if (u.mode === 'patrol' || u.mode === 'search') {
          if (this.tier === 0) { events.push({ type: 'spotted' }); this.contact = true; }
          u.mode = 'chase';
          if (this.tier === 0) this._raise(1, events, p);
        }
      }
      let input;
      if (u.mode === 'leave') {
        input = u.goal ? this._drive(u, u.goal.x, u.goal.z, dt, 0.8) : { throttle: 0, steer: 0 };
        if ((d > P.despawn * 0.5 && !this._visible(car.position.x, car.position.z)) || u.age > 40) { this._deactivate(u); continue; }
      } else if (u.mode === 'patrol') {
        if (!u.goal || Math.hypot(u.goal.x - car.position.x, u.goal.z - car.position.z) < 14) {
          const n = this.roads.random(this.rng, (m) => m.tag !== 'lane' && Math.hypot(m.x - p.x, m.z - p.z) < 300);
          u.goal = n ? { x: n.x, z: n.z } : { x: p.x, z: p.z };
        }
        input = this._drive(u, u.goal.x, u.goal.z, dt, 0.45);
      } else if ((u.sees || d < 18) && !this.world.crossesWater(car.position, p)) {
        // In sight: aim a little ahead of the truck to cut it off, and up close get alongside
        // (across Loch Raven's water they keep to the roads).
        const lead = d < 16 ? 0.9 : Math.min(1.2, d / 40);
        input = this._steerTo(car, p.x + player.vx * lead, p.z + player.vz * lead, P.maxSpeed * boost);
      } else if (u.sees) {
        input = this._drive(u, p.x, p.z, dt, boost);
      } else {
        // Out of sight: to where they last saw you, then search the roads around it.
        if (u.mode === 'chase' && Math.hypot(u.lastKnown.x - car.position.x, u.lastKnown.z - car.position.z) < 14) { u.mode = 'search'; u.goal = null; }
        if (u.mode === 'search') {
          if (!u.goal || Math.hypot(u.goal.x - car.position.x, u.goal.z - car.position.z) < 14) {
            const n = this.world.nearestNode(u.lastKnown.x + (this.rng() - 0.5) * 180, u.lastKnown.z + (this.rng() - 0.5) * 180, (m) => m.tag !== 'lane');
            u.goal = { x: n.x, z: n.z };
          }
          input = this._drive(u, u.goal.x, u.goal.z, dt, 0.7);
        } else {
          input = this._drive(u, u.lastKnown.x, u.lastKnown.z, dt, boost);
        }
      }
      this._unstick(u, input, dt);
      car.update(dt, input);
    }

    // The checkpoint and the roadblock watch the road too.
    this._checkpoint(dt, player, ctx, events);
    const rb = this.roadblock;
    if (rb.active && Math.hypot(rb.x - p.x, rb.z - p.z) < 60 && this.world.lineOfSight(rb, p) && this.tier > 0) seen = true;

    // Heat: seen builds it, out of sight long enough sheds a tier.
    if (this.heat > 0) {
      const tier = this.tier;
      if (this.hold > 0) { this.hold -= dt; this.evade = 0; }   // an ambush: they're coming
      else if (seen) {
        this.evade = 0;
        if (ctx.contraband) this._raise(Math.min(P.max, this.heat + P.buildRate * dt), events, p);
      } else {
        this.evade += dt / P.evadeTime[tier];
        if (this.evade >= 1) {
          this.heat = tier - 1;
          this.evade = 0;
          events.push(this.heat > 0 ? { type: 'tier', tier: this.tier, up: false } : { type: 'clear' });
          this._setPursuers(p);
          if (!this.heat) this.contact = false;
        }
      }
    }
    this._roadblock(dt, player, ctx, events);

    // Bumping: the truck is heavier than a sedan.
    const act = this.active;
    let touching = 0;
    for (const u of act) {
      const hit = collideVehicles(player, u.car, 0.35);
      if (hit && u.mode !== 'patrol' && u.mode !== 'leave') touching = Math.max(touching, hit);
    }
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) collideVehicles(act[i].car, act[j].car, 0.5);

    // The bust meter: an agent right on you while you're nearly stopped.
    const pinned = this.tier > 0 && nearest < P.pinRadius && Math.abs(player.speed) < P.pinSpeed;
    this.bust = clamp(this.bust + (pinned ? dt / P.bustTime : -dt * P.bustRecover), 0, 1);
    if (this.bust >= 1) { this.bust = 0; events.push({ type: 'bust' }); }
    this._nearest = nearest;
    this._write(time);
    return { events, seen, nearest, touching };
  }

  // The York Road checkpoint, at night once the story has it up (ctx.checkpoint): stop in it
  // to be searched; drive through with shine aboard and you've run it.
  _checkpoint(dt, player, ctx, events) {
    const C = this.checkpoint, p = player.position;
    C.on = !!ctx.night && ctx.checkpoint !== false;
    const d = Math.hypot(C.x - p.x, C.z - p.z), inside = C.on && d <= C.radius;
    if (inside && !C.handled && Math.abs(player.speed) <= C.stopSpeed) { C.handled = true; events.push({ type: 'search' }); }
    if (!inside && this._inside && !C.handled && ctx.contraband) { C.handled = true; this._raise(2, events, p); events.push({ type: 'ran' }); }
    if (!C.on || d > C.radius * 2.5) C.handled = false;
    this._inside = inside;
  }

  // At heat 2+, one roadblock goes up across a road on your route ahead, out of sight.
  _roadblock(dt, player, ctx, events = []) {
    const rb = this.roadblock, p = player.position;
    if (rb.active) {
      rb.age += dt;
      const gone = !this._visible(rb.x, rb.z);
      if ((this.tier < 2 || Math.hypot(rb.x - p.x, rb.z - p.z) > 320 || rb.age > 70) && gone) this._removeRoadblock();
      return;
    }
    this._rbTimer -= dt;
    if (this.tier < 2 || this._rbTimer > 0 || !ctx.route || ctx.route.length < 4) return;
    const placed = this._placeRoadblock(p, ctx.route);
    this._rbTimer = placed ? P.roadblockEvery : 3;
    if (placed) events.push({ type: 'roadblock', x: this.roadblock.x, z: this.roadblock.z });
  }

  _placeRoadblock(p, route) {
    const rb = this.roadblock;
    for (let i = 2; i < route.length - 1; i++) {
      const a = route[i - 1], b = route[i];
      if (a.id == null || b.id == null || a.tag === 'lane' || b.tag === 'lane') continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 90 || d > 240) continue;
      if (this._visible(b.x, b.z) && d < 180 && this.world.lineOfSight(p, b)) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 30) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      const cx = b.x - ux * 16, cz = b.z - uz * 16, px = -uz, pz = ux;
      rb.collider = this.world.collision.addCapsule(cx - px * 6.5, cz - pz * 6.5, cx + px * 6.5, cz + pz * 6.5, 1.3, { tag: 'roadblock' });
      Object.assign(rb, { active: true, edge: RoadGraph.edgeKey(a.id, b.id), x: cx, z: cz, ux, uz, age: 0 });
      this.blocked.add(rb.edge);
      return true;
    }
    return false;
  }

  _removeRoadblock() {
    const rb = this.roadblock;
    if (rb.collider) this.world.collision.remove(rb.collider);
    if (rb.edge) this.blocked.delete(rb.edge);
    Object.assign(rb, { active: false, collider: null, edge: null });
  }

  // ---------- driving ----------
  _drive(u, gx, gz, dt, speedScale) {
    const car = u.car, pos = car.position;
    u.pathTimer -= dt;
    if (u.pathTimer <= 0 || !u.path.length) {
      const from = this.world.nearestNode(pos.x, pos.z), to = this.world.nearestNode(gx, gz);
      u.path = this.roads.path(from.id, to.id, this.blocked) || this.roads.path(from.id, to.id) || [];
      if (u.path.length > 1) {
        const a = this.roads.nodes[u.path[0]], b = this.roads.nodes[u.path[1]];
        if (Math.hypot(b.x - pos.x, b.z - pos.z) < Math.hypot(b.x - a.x, b.z - a.z)) u.path.shift();
      }
      u.pathTimer = 0.8 + this.rng() * 0.4;
    }
    let tx = gx, tz = gz;
    while (u.path.length) {
      const n = this.roads.nodes[u.path[0]];
      if (Math.hypot(n.x - pos.x, n.z - pos.z) < 7) u.path.shift();
      else { tx = n.x; tz = n.z; break; }
    }
    let target = P.maxSpeed * speedScale;
    if (u.path.length > 1) {
      const a = this.roads.nodes[u.path[0]], b = this.roads.nodes[u.path[1]];
      const inH = Math.atan2(a.x - pos.x, -(a.z - pos.z)), outH = Math.atan2(b.x - a.x, -(b.z - a.z));
      if (Math.abs(wrap(outH - inH)) > 0.6 && Math.hypot(a.x - pos.x, a.z - pos.z) < 26) target = Math.min(target, 11);
    }
    return this._steerTo(car, tx, tz, target);
  }

  _steerTo(car, tx, tz, targetSpeed) {
    const diff = wrap(Math.atan2(tx - car.position.x, -(tz - car.position.z)) - car.heading);
    let target = targetSpeed;
    if (Math.abs(diff) > 1.2) target = Math.min(target, 9);
    const throttle = car.speed < target - 1 ? 1 : car.speed > target + 2 ? -0.7 : 0.25;
    return { throttle, steer: clamp(diff * 2.2, -1, 1), handbrake: false };
  }

  // Back up and turn if wedged against something.
  _unstick(u, input, dt) {
    if (u.reverse > 0) { u.reverse -= dt; input.throttle = -1; input.steer = input.steer > 0 ? -1 : 1; return; }
    if (input.throttle > 0.5 && Math.abs(u.car.speed) < 1.5) {
      u.stuck += dt;
      if (u.stuck > 1.0) { u.reverse = 0.9; u.stuck = 0; }
    } else u.stuck = Math.max(0, u.stuck - dt);
  }

  // ---------- drawing ----------
  _write(time) {
    const o = this._o, c = this._c;
    let k = 0, shown = 0;
    const put = (x, z, heading, lamp) => {
      o.position.set(x, 0, z); o.rotation.set(0, -heading, 0); o.scale.set(1, 1, 1); o.updateMatrix();
      this.bodies.setMatrixAt(k, o.matrix);
      this.lamps.setMatrixAt(k, o.matrix);
      this.lamps.setColorAt(k, c.setRGB(lamp, lamp * 0.12, lamp * 0.08));
      k++; shown++;
    };
    const flash = (seed) => 0.15 + 0.85 * Math.abs(Math.sin(time * 6.5 + seed)) ** 4;
    for (const u of this.units) {
      const i = u.id;
      if (u.active) {
        const after = u.mode === 'chase' || u.mode === 'search';
        put(u.car.position.x, u.car.position.z, u.car.heading, after ? flash(i) * 3 : 0.25);
        // The cone: ahead of a patrol, red once it's after you; none for a car leaving.
        const r = u.mode === 'patrol' ? P.sight : 0;      // one after you sees all round: no cone
        o.position.set(u.car.position.x, 0, u.car.position.z); o.rotation.set(0, -u.car.heading, 0); o.scale.set(r, 1, r); o.updateMatrix();
        this.cones.setMatrixAt(i, o.matrix);
        this.cones.setColorAt(i, after ? c.setRGB(1, 0.25, 0.15) : c.setRGB(1, 0.75, 0.35));
      } else {
        o.scale.set(0, 0, 0); o.updateMatrix();
        this.bodies.setMatrixAt(k, o.matrix); this.lamps.setMatrixAt(k, o.matrix); this.cones.setMatrixAt(i, o.matrix);
        k++;
      }
    }
    // The roadblock: two sedans across the road, two sawhorses between.
    const rb = this.roadblock, C = this.checkpoint;
    const parked = (on, x, z, ux, uz, spread, slot) => {
      for (const s of [-spread, spread]) {
        if (on) put(x - uz * s, z + ux * s, Math.atan2(-uz, -ux), flash(s + slot) * 3);
        else { o.scale.set(0, 0, 0); o.updateMatrix(); this.bodies.setMatrixAt(k, o.matrix); this.lamps.setMatrixAt(k, o.matrix); k++; }
      }
    };
    parked(rb.active, rb.x, rb.z, rb.ux || 0, rb.uz || 1, 3.2, 0);
    // The checkpoint: two sedans on the verges of York Road, facing the road.
    parked(C.on, C.x, C.z, 0, 1, this.world.cfg.roadWidth / 2 + 3, 7);
    let b = 0;
    const bar = (on, x, z, heading) => {
      if (on) { o.position.set(x, 0, z); o.rotation.set(0, -heading, 0); o.scale.set(1, 1, 1); } else o.scale.set(0, 0, 0);
      o.updateMatrix();
      this.barriers.setMatrixAt(b++, o.matrix);
    };
    for (const s of [-1, 1]) bar(rb.active, rb.x + (rb.ux || 0) * s * 3.4, rb.z + (rb.uz || 0) * s * 3.4, Math.atan2(-(rb.uz || 0), -(rb.ux || 0)) + Math.PI / 2);
    for (const s of [-1, 1]) bar(C.on, C.x + s * (this.world.cfg.roadWidth / 2 - 0.6), C.z + 4, 0);
    for (const m of [this.bodies, this.lamps, this.cones, this.barriers]) m.instanceMatrix.needsUpdate = true;
    this.lamps.instanceColor.needsUpdate = true;
    this.cones.instanceColor.needsUpdate = true;
    this.bodies.visible = this.lamps.visible = shown > 0;
    this.cones.visible = this.units.some((u) => u.active && u.mode === 'patrol');
    this.barriers.visible = rb.active || C.on;
  }

  // Agents for the radar: within `range` of the truck (red when after you), and with `look`
  // (the police-band radio) the way each is facing.
  near(p, range = P.mapRange, { look = false } = {}) {
    const out = [];
    for (const u of this.units) {
      if (!u.active || Math.hypot(u.car.position.x - p.x, u.car.position.z - p.z) > range) continue;
      const m = { kind: u.mode === 'chase' || u.mode === 'search' ? 'agent-chase' : 'agent', x: u.car.position.x, z: u.car.position.z };
      if (look) m.look = u.car.heading;
      out.push(m);
    }
    if (this.roadblock.active) out.push({ kind: 'roadblock', x: this.roadblock.x, z: this.roadblock.z });
    if (this.checkpoint.on) out.push({ kind: 'roadblock', x: this.checkpoint.x, z: this.checkpoint.z });
    return out;
  }
}
