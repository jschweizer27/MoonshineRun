import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { radialTexture } from './world.js';
import { kindColors } from './trunk.js';

// Loot lying along the roads for the dredge run (CONFIG.dredge.loot.kinds). Each kind is a
// small flat-shaded primitive coloured by its value tier (CONFIG.dredge.lootTiers, from the
// palette), drawn by its own InstancedMesh with a fixed pool. Every frame each kind draws
// only its pieces near the truck (`count`) and its bounds are refitted, so it's culled when
// they're off screen: a kind with nothing nearby costs no draw call. All kinds share one
// material. A faint amber glow sprite behind each piece (one more instanced mesh) makes loot
// read from a distance at night; premium pieces glow brighter.
const L = CONFIG.dredge.loot;
const P = CONFIG.dredge.palette;


// Shape builders: a few primitives per kind, coloured from the palette. y = 0 is the ground.
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const MODELS = {
  // Small crate: a pine box with two dark battens.
  'small-crate': (add, c) => {
    add(box(0.6, 0.6, 0.6), c.main, 0, 0.3, 0);
    for (const y of [0.12, 0.48]) add(box(0.63, 0.07, 0.63), c.accent, 0, y, 0);
  },
  // Bottle case: a low crate with six bottle necks showing.
  'bottle-case': (add, c) => {
    add(box(1.0, 0.36, 0.52), c.main, 0, 0.18, 0);
    for (let i = 0; i < 6; i++) add(cyl(0.05, 0.07, 0.2, 6), c.accent, -0.33 + (i % 3) * 0.33, 0.46, i < 3 ? -0.12 : 0.12);
  },
  // Burlap sack: two slumped sacks, one tied with twine.
  sack: (add, c) => {
    add(new THREE.DodecahedronGeometry(0.42).scale(1.1, 0.7, 0.9), c.main, -0.22, 0.3, 0);
    add(new THREE.DodecahedronGeometry(0.34).scale(1, 0.75, 0.9), c.main, 0.34, 0.26, 0.18);
    add(cyl(0.08, 0.12, 0.22, 6), c.accent, -0.22, 0.66, 0);
  },
  // Barrel: an upright barrel with iron hoops.
  barrel: (add, c) => {
    add(cyl(0.38, 0.34, 1.0, 10), c.main, 0, 0.5, 0);
    for (const y of [0.2, 0.8]) add(cyl(0.39, 0.39, 0.06, 10), c.accent, 0, y, 0);
  },
  // Jug cluster: four stoneware jugs, corked.
  jugs: (add, c) => {
    for (const [x, z] of [[-0.32, -0.16], [0, -0.16], [0.32, -0.16], [0, 0.18]]) {
      add(cyl(0.12, 0.16, 0.4, 8), c.main, x, 0.2, z);
      add(cyl(0.05, 0.08, 0.12, 6), c.accent, x, 0.46, z);
    }
  },
  // Wooden crate: a big slatted crate.
  crate: (add, c) => {
    add(box(1.1, 0.85, 1.1), c.main, 0, 0.425, 0);
    for (const y of [0.15, 0.7]) add(box(1.14, 0.09, 1.14), c.accent, 0, y, 0);
  },
  // Long crate: a rifle-length box with a stencilled band.
  'long-crate': (add, c) => {
    add(box(1.6, 0.42, 0.5), c.main, 0, 0.21, 0);
    add(box(0.34, 0.44, 0.52), c.accent, 0, 0.22, 0);
  },
  // Copper coil: a still's worm, three turns on a stand.
  coil: (add, c) => {
    for (let k = 0; k < 3; k++) add(new THREE.TorusGeometry(0.32, 0.06, 5, 10).rotateX(Math.PI / 2), c.main, 0, 0.2 + k * 0.18, 0);
    add(cyl(0.04, 0.04, 0.75, 6), c.accent, 0.32, 0.38, 0);
  },
  // Aged keg: a fat cask on its side, on two chocks.
  keg: (add, c) => {
    add(cyl(0.5, 0.5, 1.2, 10).rotateZ(Math.PI / 2), c.main, 0, 0.6, 0);
    for (const x of [-0.42, 0.42]) add(cyl(0.52, 0.52, 0.08, 10).rotateZ(Math.PI / 2), c.accent, x, 0.6, 0);
    for (const x of [-0.35, 0.35]) add(box(0.16, 0.18, 0.9), P.slate, x, 0.09, 0);
  },
  // Strongbox: a brass-bound box with a strap and an iron lock plate (premium: it glows).
  strongbox: (add, c) => {
    add(box(0.62, 0.42, 0.44), c.main, 0, 0.21, 0);
    add(box(0.64, 0.1, 0.46), c.accent, 0, 0.3, 0);
    add(box(0.14, 0.16, 0.04), P.slate, 0, 0.22, 0.23);
  },
};

function kindGeometry(kind) {
  const parts = [];
  const add = (geo, color, x = 0, y = 0, z = 0) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    geo.translate(x, y, z);
    const n = geo.attributes.position.count, c = new THREE.Color(color);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    geo.deleteAttribute('uv');
    parts.push(geo);
  };
  const build = MODELS[kind.id];
  if (!build) throw new Error(`No loot model for "${kind.id}"`);
  build(add, kindColors(kind));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const size = parts[0].attributes[name].itemSize;
    const all = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].array.length, 0));
    parts.reduce((o, g) => { all.set(g.attributes[name].array, o); return o + g.attributes[name].array.length; }, 0);
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
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
    this.on = false;
    // Where pieces can lie: along every road link (city streets and county lanes).
    const nodes = world.roads.nodes;
    this.links = [];
    for (const a of nodes) for (const b of a.links) if (b > a.id) this.links.push([a, nodes[b], Math.hypot(nodes[b].x - a.x, nodes[b].z - a.z)]);
    this.totalLength = this.links.reduce((s, l) => s + l[2], 0);

    // One flat-shaded material for every kind (one shader), with a faint neutral emissive so
    // the dark tiers still show at night without tinting them.
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.05,
      emissive: new THREE.Color(P.cream).multiplyScalar(L.emissive),
    });
    this.meshes = L.kinds.map((k) => {
      const mesh = new THREE.InstancedMesh(kindGeometry(k), this.material, n);
      mesh.name = `loot-${k.id}`;
      mesh.count = 0;
      mesh.visible = false;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    });
    // The pickup glow: an upright sprite behind each nearby piece, facing the camera, tinted
    // by the piece's tier (per-instance colour).
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]),
      transparent: true, opacity: L.glow.opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.glowMaterial, n);
    this._tint = L.kinds.map((k) => { const g = kindColors(k).glow; return new THREE.Color(g.color).multiplyScalar(g.strength); });
    for (let i = 0; i < n; i++) this.glow.setColorAt(i, this._tint[0]);   // the colour buffer exists from boot
    this.glow.name = 'loot-glow';
    this.glow.count = 0;
    this.glow.visible = false;
    this.glow.renderOrder = 1;
    scene.add(this.glow);
    this._counts = new Uint16Array(L.kinds.length);
    this._o = new THREE.Object3D();
  }

  // Scatter a fresh set of pieces (a new run). Off unless the dredge run is on.
  reset(on, player = null) {
    this.on = on;
    this.timer.fill(0);
    for (let i = 0; i < this.n; i++) {
      this.active[i] = on ? 1 : 0;
      if (on) this._place(i, player, 30);
    }
    this._writeAll(0, player);
  }

  // Pick a weighted kind and a free spot on a road, at least `away` metres from the player.
  _place(i, player, away) {
    const rng = this.rng, c = this.world.collision;
    let r = rng() * L.kinds.reduce((s, k) => s + k.weight, 0), kind = 0;
    while (kind < L.kinds.length - 1 && r > L.kinds[kind].weight) { r -= L.kinds[kind].weight; kind++; }
    for (let tries = 0; tries < 40; tries++) {
      let d = rng() * this.totalLength, l = this.links[0];
      for (const link of this.links) { if (d < link[2]) { l = link; break; } d -= link[2]; }
      const [a, b, len] = l, t = d / len;
      const side = (rng() - 0.5) * 5, nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
      const x = a.x + (b.x - a.x) * t + nx * side, z = a.z + (b.z - a.z) * t + nz * side;
      if (player && Math.hypot(x - player.x, z - player.z) < away) continue;
      if (c.resolveCircle(x, z, 0.9).hit) continue;
      this.kind[i] = kind; this.x[i] = x; this.z[i] = z; this.yaw[i] = rng() * Math.PI * 2;
      return true;
    }
    return false;
  }

  // Write each kind's nearby pieces into its mesh (they bob and turn) and their glow sprites
  // (turned to face the camera, just behind the piece), then refit the bounds so the
  // renderer can cull what's off screen.
  _writeAll(time, center, camera = center) {
    const o = this._o, counts = this._counts, range2 = L.drawRange * L.drawRange, G = L.glow;
    counts.fill(0);
    let glows = 0;
    if (this.on) {
      for (let i = 0; i < this.n; i++) {
        if (!this.active[i]) continue;
        if (center) { const dx = this.x[i] - center.x, dz = this.z[i] - center.z; if (dx * dx + dz * dz > range2) continue; }
        const k = this.kind[i], kind = L.kinds[k];
        o.position.set(this.x[i], 0.05 + 0.12 * (1 + Math.sin(time * 2.2 + i)), this.z[i]);
        o.rotation.set(0, this.yaw[i] + time * 0.6, 0);
        o.scale.setScalar(L.scale);
        o.updateMatrix();
        this.meshes[k].setMatrixAt(counts[k]++, o.matrix);
        // Glow: faces the camera, set back from the piece so it haloes rather than covers it,
        // and grows with distance so it still reads far away.
        let fx = 0, fz = 1, d = G.near;
        if (camera) { fx = camera.x - this.x[i]; fz = camera.z - this.z[i]; d = Math.hypot(fx, fz) || 1; fx /= d; fz /= d; }
        const grow = Math.min(G.maxScale, Math.max(1, d / G.near));
        o.position.set(this.x[i] - fx * 0.7, G.height, this.z[i] - fz * 0.7);
        o.rotation.set(0, Math.atan2(fx, fz), 0);
        o.scale.setScalar(G.size * kindColors(kind).glow.size * grow * (0.9 + 0.1 * Math.sin(time * 3 + i)));
        o.updateMatrix();
        this.glow.setColorAt(glows, this._tint[k]);
        this.glow.setMatrixAt(glows++, o.matrix);
      }
    }
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      m.visible = counts[k] > 0;
      m.instanceMatrix.needsUpdate = true;
      if (counts[k]) m.computeBoundingSphere();
    });
    this.glow.count = glows;
    this.glow.visible = glows > 0;
    this.glow.instanceMatrix.needsUpdate = true;
    this.glow.instanceColor.needsUpdate = true;
    if (glows) this.glow.computeBoundingSphere();
  }

  // Pieces bob and turn; the truck picks up anything within reach; picked-up pieces come
  // back elsewhere after a while. Returns events: { type: 'loot', kind, index, x, z }.
  update(dt, time, player, { radius = L.pickupRadius, canTake = () => true, camera = null } = {}) {
    const events = [];
    if (!this.on) return events;
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
    this._writeAll(time, p, camera || p);
    // A slow warm glint so pieces show up at night.
    this.material.emissiveIntensity = 0.8 + 0.4 * Math.sin(time * 3);
    return events;
  }

  // Pieces within `range` metres, for the radar (premium ones stand out).
  near(p, range) {
    const out = [];
    for (let i = 0; i < this.n; i++) {
      if (this.active[i] && Math.hypot(this.x[i] - p.x, this.z[i] - p.z) < range) {
        out.push({ kind: L.kinds[this.kind[i]].tier === 'premium' ? 'loot-premium' : 'loot', x: this.x[i], z: this.z[i] });
      }
    }
    return out;
  }
}
