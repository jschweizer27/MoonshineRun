import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';

// Loot lying along the roads for the dredge run: cases of rye, casks, crates, sacks and
// radios. A fixed pool drawn by one InstancedMesh: the geometry holds every shape and each
// instance shows only its own (the `part` attribute, as in props.js). Pieces bob and turn
// so they catch the eye; drive over one to pick it up, and it turns up again elsewhere.
const L = CONFIG.dredge.loot;

function lootGeometry() {
  const parts = [];
  const add = (geo, kind, color, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    geo.rotateX(rx); geo.rotateZ(rz); geo.translate(x, y, z);
    const n = geo.attributes.position.count, c = new THREE.Color(color);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    geo.setAttribute('part', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    geo.deleteAttribute('uv');
    parts.push(geo);
  };
  const k = Object.fromEntries(L.kinds.map((x, i) => [x.id, i]));
  // Case of rye: a small stencilled box.
  add(new THREE.BoxGeometry(0.7, 0.45, 0.5), k.case, 0xc89a5a, 0, 0.225, 0);
  add(new THREE.BoxGeometry(0.72, 0.08, 0.52), k.case, 0x7a5430, 0, 0.42, 0);
  // Cask: a barrel on its end with iron hoops.
  add(new THREE.CylinderGeometry(0.42, 0.38, 1.15, 14), k.barrel, 0x8a5a32, 0, 0.575, 0);
  for (const y of [0.22, 0.93]) add(new THREE.CylinderGeometry(0.43, 0.43, 0.07, 14), k.barrel, 0x3a3a3a, 0, y, 0);
  // Crate of oysters: a big slatted crate.
  add(new THREE.BoxGeometry(1.2, 0.9, 1.2), k.crate, 0xb48a52, 0, 0.45, 0);
  for (const y of [0.15, 0.75]) add(new THREE.BoxGeometry(1.24, 0.1, 1.24), k.crate, 0x6e4c2a, 0, y, 0);
  // Sack of coffee: a slumped burlap sack, tied at the neck.
  add(new THREE.SphereGeometry(0.5, 12, 8).scale(1, 0.75, 0.85), k.sack, 0xb7a274, 0, 0.36, 0);
  add(new THREE.CylinderGeometry(0.1, 0.18, 0.3, 8), k.sack, 0x8a7650, 0, 0.8, 0);
  // Cathedral radio: a wooden cabinet with a rounded top and a bright grille.
  add(new THREE.BoxGeometry(0.75, 0.6, 0.45), k.radio, 0x5a3420, 0, 0.3, 0);
  add(new THREE.CylinderGeometry(0.375, 0.375, 0.45, 16, 1, false, 0, Math.PI), k.radio, 0x5a3420, 0, 0.6, 0, Math.PI / 2, Math.PI / 2);
  add(new THREE.BoxGeometry(0.45, 0.4, 0.02), k.radio, 0xe8c070, 0, 0.45, 0.235);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'part']) {
    const size = parts[0].attributes[name].itemSize;
    const all = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].array.length, 0));
    parts.reduce((o, g) => { all.set(g.attributes[name].array, o); return o + g.attributes[name].array.length; }, 0);
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  for (const g of parts) g.dispose();
  return out;
}

export class Loot {
  constructor(scene, world, seed = 1) {
    this.world = world;
    this.rng = createRng(seed ^ 0x10075);
    const n = this.n = L.count;
    this.kind = new Uint8Array(n);
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.active = new Uint8Array(n);
    this.timer = new Float32Array(n);       // seconds until a picked-up piece returns
    // Where pieces can lie: along every road link (city streets and county lanes).
    const nodes = world.roads.nodes;
    this.links = [];
    for (const a of nodes) for (const b of a.links) if (b > a.id) this.links.push([a, nodes[b], Math.hypot(nodes[b].x - a.x, nodes[b].z - a.z)]);
    this.totalLength = this.links.reduce((s, l) => s + l[2], 0);

    const geo = lootGeometry();
    this.kindAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aKind', this.kindAttr);
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: 0x3a2408 });
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float part;\nattribute float aKind;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(part - aKind) > 0.5) transformed = vec3(0.0);');
    };
    this.material.customProgramCacheKey = () => 'shine-loot';
    this.mesh = new THREE.InstancedMesh(geo, this.material, n);
    this.mesh.name = 'loot';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this._o = new THREE.Object3D();
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // Scatter a fresh set of pieces (a new run). Off unless the dredge run is on.
  reset(on, player = null) {
    this.mesh.visible = on;
    this.timer.fill(0);
    for (let i = 0; i < this.n; i++) {
      this.active[i] = on ? 1 : 0;
      if (on) this._place(i, player, 30);
    }
    this._writeAll(0);
  }

  // Pick a weighted kind and a free spot on a road, at least `away` metres from the player.
  _place(i, player, away) {
    const rng = this.rng, c = this.world.collision;
    let r = rng(), kind = 0;
    while (kind < L.kinds.length - 1 && r > L.kinds[kind].weight) { r -= L.kinds[kind].weight; kind++; }
    for (let tries = 0; tries < 40; tries++) {
      let d = rng() * this.totalLength, l = this.links[0];
      for (const link of this.links) { if (d < link[2]) { l = link; break; } d -= link[2]; }
      const [a, b, len] = l, t = d / len;
      const side = (rng() - 0.5) * 5, nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
      const x = a.x + (b.x - a.x) * t + nx * side, z = a.z + (b.z - a.z) * t + nz * side;
      if (player && Math.hypot(x - player.x, z - player.z) < away) continue;
      const res = c.resolveCircle(x, z, 0.9);
      if (res.hit) continue;
      this.kind[i] = kind; this.x[i] = x; this.z[i] = z; this.yaw[i] = rng() * Math.PI * 2;
      this.kindAttr.setX(i, kind);
      this.kindAttr.needsUpdate = true;
      return true;
    }
    return false;
  }

  _write(i, time) {
    const o = this._o;
    if (!this.active[i]) { o.position.set(0, -50, 0); o.scale.setScalar(0.001); }
    else {
      o.position.set(this.x[i], 0.05 + 0.12 * (1 + Math.sin(time * 2.2 + i)), this.z[i]);
      o.rotation.set(0, this.yaw[i] + time * 0.6, 0);
      o.scale.setScalar(1.25);                    // a touch larger than life, to read at a distance
    }
    o.updateMatrix();
    this.mesh.setMatrixAt(i, o.matrix);
  }

  _writeAll(time) {
    for (let i = 0; i < this.n; i++) this._write(i, time);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Pieces bob and turn; the truck picks up anything within reach; picked-up pieces come
  // back elsewhere after a while. Returns events: { type: 'loot', kind, index }.
  update(dt, time, player, { radius = L.pickupRadius, canTake = () => true } = {}) {
    const events = [];
    if (!this.mesh.visible) return events;
    const p = player.position;
    for (let i = 0; i < this.n; i++) {
      if (!this.active[i]) {
        this.timer[i] -= dt;
        if (this.timer[i] <= 0 && this._place(i, p, L.respawnMin)) this.active[i] = 1;
        continue;
      }
      const dx = this.x[i] - p.x, dz = this.z[i] - p.z;
      if (dx * dx + dz * dz < radius * radius && canTake(L.kinds[this.kind[i]], i)) {
        this.active[i] = 0;
        this.timer[i] = L.respawn;
        events.push({ type: 'loot', kind: L.kinds[this.kind[i]], index: i, x: this.x[i], z: this.z[i] });
      }
    }
    this._writeAll(time);
    // A slow warm glint so pieces show up at night.
    this.material.emissiveIntensity = 0.8 + 0.5 * Math.sin(time * 3);
    return events;
  }

  // Pieces within `range` metres, for the radar.
  near(p, range) {
    const out = [];
    for (let i = 0; i < this.n; i++) {
      if (this.active[i] && Math.hypot(this.x[i] - p.x, this.z[i] - p.z) < range) out.push({ kind: 'loot', x: this.x[i], z: this.z[i] });
    }
    return out;
  }
}
