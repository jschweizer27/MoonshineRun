import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { RoadGraph } from './roadgraph.js';

// Traffic: a fixed pool of 1920s vehicles (a motor car, a delivery van, a horse cart) that
// drive the road graph near the camera, in the right-hand lane, turning at junctions,
// keeping their distance and slowing for the truck ahead. They're kinematic (no physics of
// their own) and live only near the view: each turns up out of sight ahead and goes again
// once far behind. All of them are one draw call: the three bodies share one geometry,
// each vertex tagged with its body (aKind), and each instance shows its own (iKind), the
// same trick as the loot. Built at boot; nothing is allocated while driving. A road event
// can `park` one across a road (a stuck cart): it stays put, still in the way, and the rest
// keep off the edges in `blocked` (shared with the road events).
const T = CONFIG.dredge.traffic;
export const BODIES = ['car', 'van', 'cart'];

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, w, seg = 10) => new THREE.CylinderGeometry(r, r, w, seg).rotateZ(Math.PI / 2);
const MODELS = {
  // A black motor car: long bonnet, upright cabin, running boards, spoked wheels.
  car: (add) => {
    add(box(1.7, 0.55, 4.0), 0x1d2024, 0, 0.75, 0);
    add(box(1.6, 0.85, 1.9), 0x1d2024, 0, 1.4, 0.45);
    add(box(1.5, 0.45, 1.85), 0x8fa4ad, 0, 1.45, 0.45);            // windows
    add(box(1.66, 0.12, 1.92), 0x2a2d31, 0, 1.88, 0.45);           // roof
    add(box(1.0, 0.5, 0.15), 0xb8a684, 0, 0.85, -2.05);            // radiator
    for (const x of [-0.95, 0.95]) add(box(0.25, 0.08, 3.2), 0x2a2d31, x, 0.42, 0);
    for (const [x, z] of [[-0.85, -1.35], [0.85, -1.35], [-0.85, 1.35], [0.85, 1.35]]) add(cyl(0.38, 0.22), 0x141414, x, 0.38, z);
  },
  // A delivery van: a tall box body in a trade colour, a short cab.
  van: (add) => {
    add(box(1.9, 1.7, 3.2), 0x6b3a2a, 0, 1.35, 0.55);
    add(box(1.8, 0.7, 1.5), 0x23272b, 0, 1.0, -1.65);
    add(box(1.7, 0.45, 0.6), 0x8fa4ad, 0, 1.45, -1.2);
    add(box(1.94, 0.14, 3.24), 0xd8d2c4, 0, 2.25, 0.55);           // painted sign band
    for (const [x, z] of [[-0.9, -1.7], [0.9, -1.7], [-0.9, 1.45], [0.9, 1.45]]) add(cyl(0.4, 0.24), 0x141414, x, 0.4, z);
  },
  // A farm cart and its horse: a slatted bed on two big wheels, the horse ahead in shafts.
  cart: (add) => {
    add(box(1.6, 0.5, 2.4), 0x7a5a36, 0, 1.0, 0.7);
    for (const x of [-0.85, 0.85]) add(cyl(0.65, 0.12, 12), 0x3a2a1a, x, 0.65, 0.7);
    for (const x of [-0.45, 0.45]) add(box(0.08, 0.08, 2.0), 0x5a4026, x, 0.95, -1.2);
    add(box(0.55, 0.75, 1.7), 0x5a3a22, 0, 1.45, -1.9);            // the horse's body
    add(box(0.32, 0.7, 0.45), 0x5a3a22, 0, 1.95, -2.85);           // neck and head
    for (const [x, z] of [[-0.18, -1.3], [0.18, -1.3], [-0.18, -2.5], [0.18, -2.5]]) add(box(0.14, 1.1, 0.14), 0x4a2e1a, x, 0.55, z);
  },
};

function bodyGeometry() {
  const parts = [], tags = [];
  BODIES.forEach((name, k) => {
    MODELS[name]((geo, color, x, y, z) => {
      geo = geo.index ? geo.toNonIndexed() : geo;
      geo.translate(x, y, z);
      const c = new THREE.Color(color), n = geo.attributes.position.count;
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
      geo.deleteAttribute('uv');
      parts.push(geo);
      tags.push([k, n]);
    });
  });
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const all = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].array.length, 0));
    parts.reduce((o, g) => { all.set(g.attributes[name].array, o); return o + g.attributes[name].array.length; }, 0);
    out.setAttribute(name, new THREE.BufferAttribute(all, parts[0].attributes[name].itemSize));
  }
  const tag = new Float32Array(out.attributes.position.count);
  let o = 0;
  for (const [k, n] of tags) { tag.fill(k, o, o + n); o += n; }
  out.setAttribute('aKind', new THREE.BufferAttribute(tag, 1));
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

export class Traffic {
  constructor(scene, world, seed = 1) {
    this.world = world;
    this.roads = world.roads;
    this.rng = createRng(seed ^ 0x7aff1c);
    const n = this.n = T.count;
    this.cars = Array.from({ length: n }, (_, i) => ({
      i, on: false, parked: false, body: 0, from: 0, to: 0, t: 0, len: 1, speed: 0, cruise: 0, stun: 0,
      position: new THREE.Vector3(), heading: 0, vx: 0, vz: 0,
      get forwardX() { return Math.sin(this.heading); },
      get forwardZ() { return -Math.cos(this.heading); },
      mesh: { visible: false },          // what props.update reads to see whether it's out
    }));
    // A faint lift so the dark bodies still read at night.
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.15, emissive: new THREE.Color(0x2a2620) });
    this.material.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aKind;\nattribute float iKind;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(aKind - iKind) > 0.5) transformed = vec3(0.0);');
    };
    this.material.customProgramCacheKey = () => 'traffic-bodies';
    const geo = bodyGeometry();
    this.iKind = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.iKind.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iKind', this.iKind);
    this.mesh = new THREE.InstancedMesh(geo, this.material, n);
    this.mesh.name = 'traffic';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this._o = new THREE.Object3D();
    this.enabled = true;
    this.blocked = new Set();          // road edges (RoadGraph.edgeKey) closed by a road event
    this._cam = { x: 0, z: 0 };
  }

  // Off the roads (a new run). Parked vehicles are the road events' to let go of.
  clear() {
    for (const c of this.cars) if (!c.parked) { c.on = false; c.mesh.visible = false; }
    this._write();
  }

  _closed(a, b) { return this.blocked.size > 0 && this.blocked.has(RoadGraph.edgeKey(a, b)); }

  // Stop a vehicle across the middle of the road from node `from` to `to`, slewed at an
  // angle (a cart stuck in a washout, or broken down): a free slot, or else the one furthest
  // from the view. Anything driving that stretch turns back. Returns the car.
  park(from, to, body = 'cart') {
    let c = this.cars.find((x) => !x.on), far = -1;
    if (!c) {
      for (const x of this.cars) {
        if (x.parked) continue;
        const d = Math.hypot(x.position.x - this._cam.x, x.position.z - this._cam.z);
        if (d > far) { far = d; c = x; }
      }
    }
    if (!c) return null;
    const a = this.roads.nodes[from], b = this.roads.nodes[to];
    c.on = true; c.parked = true; c.mesh.visible = true;
    c.body = Math.max(0, BODIES.indexOf(body));
    c.speed = c.cruise = c.stun = 0;
    this._setLeg(c, from, to, 0);
    c.t = c.len / 2;
    c.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    c.heading = Math.atan2(b.x - a.x, -(b.z - a.z)) + 1.2;
    c.vx = c.vz = 0;
    for (const x of this.cars) {
      const same = (x.from === from && x.to === to) || (x.from === to && x.to === from);
      if (x !== c && x.on && !x.parked && same) { [x.from, x.to] = [x.to, x.from]; x.t = x.len - x.t; this._place(x); }
    }
    this._write();
    return c;
  }

  unpark(c) {
    if (!c || !c.parked) return;
    c.parked = false; c.on = false; c.mesh.visible = false;
    this._write();
  }

  // How many should be out around `p`: fewer in the valley and late at night.
  want(p, hour = 21) {
    const county = this.world.inCounty(p);
    const night = hour < 5 || hour >= 23 ? T.night : 1;
    return Math.round((county ? T.county : T.count) * night);
  }

  // One step: drive, keep distance, respawn near the camera. Returns collisions with the
  // truck as events: { type: 'traffic', car, impact, x, z }.
  update(dt, player, camera, hour) {
    const events = [];
    if (!this.enabled) return events;
    const p = player.position, cam = camera || p, want = this.want(p, hour);
    this._cam.x = cam.x; this._cam.z = cam.z;
    let out = 0;
    for (const c of this.cars) {
      if (c.parked) continue;
      if (c.on && Math.hypot(c.position.x - cam.x, c.position.z - cam.z) > T.despawn) { c.on = false; c.mesh.visible = false; }
      if (c.on) out++;
    }
    for (const c of this.cars) {
      if (!c.on && out < want && this._spawn(c, cam, player)) out++;
      if (!c.on) continue;
      if (!c.parked) this._drive(c, dt, player);
      const hit = this._collide(c, player);
      if (hit) events.push(hit);
    }
    this._write();
    return events;
  }

  // Turn up out of sight: a road segment between `near` and `far` from the camera, not
  // in front of the truck (behind it, or off to the side), not on top of another car.
  _spawn(c, cam, player) {
    const nodes = this.roads.nodes, rng = this.rng;
    for (let tries = 0; tries < 12; tries++) {
      const a = nodes[Math.floor(rng() * nodes.length)];
      if (!a.links.length) continue;
      const d = Math.hypot(a.x - cam.x, a.z - cam.z);
      if (d < T.spawn[0] || d > T.spawn[1]) continue;
      const ahead = (a.x - player.position.x) * player.forwardX + (a.z - player.position.z) * player.forwardZ;
      if (ahead > 0 && ahead > d * 0.7) continue;                     // squarely ahead: you'd see it pop in
      const b = nodes[a.links[Math.floor(rng() * a.links.length)]];
      if (this._closed(a.id, b.id)) continue;
      if (this.cars.some((o) => o.on && Math.hypot(o.position.x - a.x, o.position.z - a.z) < 12)) continue;
      const r = rng();
      c.body = r < T.mix[0] ? 0 : r < T.mix[0] + T.mix[1] ? 1 : 2;
      c.cruise = T.speeds[c.body] * (0.85 + rng() * 0.3);
      c.speed = c.cruise * 0.6;
      c.stun = 0;
      this._setLeg(c, a.id, b.id, 0);
      c.on = true;
      c.mesh.visible = true;
      return true;
    }
    return false;
  }

  _setLeg(c, from, to, t) {
    const a = this.roads.nodes[from], b = this.roads.nodes[to];
    c.from = from; c.to = to; c.t = t;
    c.len = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
    this._place(c);
  }

  // On its leg, offset into the right-hand lane.
  _place(c) {
    const a = this.roads.nodes[c.from], b = this.roads.nodes[c.to];
    const dx = (b.x - a.x) / c.len, dz = (b.z - a.z) / c.len, f = c.t / c.len;
    c.heading = Math.atan2(dx, -dz);
    const rx = Math.cos(c.heading), rz = Math.sin(c.heading);
    c.position.set(a.x + (b.x - a.x) * f + rx * T.lane, 0, a.z + (b.z - a.z) * f + rz * T.lane);
  }

  _drive(c, dt, player) {
    if (c.stun > 0) { c.stun -= dt; c.speed = Math.max(0, c.speed - 12 * dt); }
    else {
      // Keep a gap to whatever is ahead in the lane: another car, or the truck.
      let gap = Infinity;
      const fx = c.forwardX, fz = c.forwardZ;
      const ahead = (x, z) => {
        const dx = x - c.position.x, dz = z - c.position.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (along > 0 && side < 2.6) gap = Math.min(gap, along);
      };
      for (const o of this.cars) if (o !== c && o.on) ahead(o.position.x, o.position.z);
      ahead(player.position.x, player.position.z);
      const target = gap < T.gap ? 0 : gap < T.gap * 2.5 ? c.cruise * (gap - T.gap) / (T.gap * 1.5) : c.cruise;
      c.speed += Math.max(-10 * dt, Math.min(4 * dt, target - c.speed));
    }
    c.t += c.speed * dt;
    // At the end of a leg: on to a next one, not straight back (unless it's a dead end).
    while (c.t >= c.len) {
      const node = this.roads.nodes[c.to], over = c.t - c.len;
      const next = node.links.filter((id) => id !== c.from && !this._closed(node.id, id));
      const pick = next.length ? next[Math.floor(this.rng() * next.length)] : c.from;
      this._setLeg(c, c.to, pick, over);
    }
    this._place(c);
    c.vx = c.forwardX * c.speed;
    c.vz = c.forwardZ * c.speed;
  }

  // The truck against a car: two circles each way. Pushes the truck out and returns the
  // closing speed, which main treats like a wall hit (sparks, shake, wear).
  _collide(c, player) {
    const r = T.radius + player.t.radius, p = player.position;
    let best = null;
    for (const s of [1, -1]) {
      const cx = c.position.x + c.forwardX * T.offset * s, cz = c.position.z + c.forwardZ * T.offset * s;
      for (const u of [1, -1]) {
        const px = p.x + player.forwardX * player.t.circleOffset * u, pz = p.z + player.forwardZ * player.t.circleOffset * u;
        const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
        if (d < r && (!best || d < best.d)) best = { d, nx: dx / (d || 1), nz: dz / (d || 1) };
      }
    }
    if (!best) return null;
    const push = r - best.d;
    p.x += best.nx * push; p.z += best.nz * push;
    // Closing speed along the normal (the truck's velocity against the car's).
    const vn = (player.vx - c.vx) * best.nx + (player.vz - c.vz) * best.nz;
    if (vn >= 0) return null;
    player.vx -= 1.5 * vn * best.nx; player.vz -= 1.5 * vn * best.nz;
    player.vx *= 0.7; player.vz *= 0.7;
    player.speed = player.vx * player.forwardX + player.vz * player.forwardZ;
    const impact = -vn;
    player.impact = Math.max(player.impact || 0, impact);
    c.stun = T.stun;
    c.speed *= 0.3;
    return { type: 'traffic', car: c, impact, x: (c.position.x + p.x) / 2, z: (c.position.z + p.z) / 2 };
  }

  _write() {
    const o = this._o;
    let n = 0;
    for (const c of this.cars) {
      if (!c.on) continue;
      o.position.copy(c.position);
      o.rotation.set(0, -c.heading, 0);
      o.updateMatrix();
      this.mesh.setMatrixAt(n, o.matrix);
      this.iKind.array[n] = c.body;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iKind.needsUpdate = true;
    if (n) this.mesh.computeBoundingSphere();
  }
}
