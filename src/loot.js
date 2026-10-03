import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { radialTexture } from './world.js';
import { kindColors } from './trunk.js';

// Loot lying along the roads (CONFIG.dredge.loot.kinds). Each kind is a
// small flat-shaded primitive coloured by its value tier (CONFIG.dredge.lootTiers, from the
// palette). Every kind's model sits in one shared geometry, each vertex tagged with its kind
// (`aKind`), and one InstancedMesh draws every piece: each instance carries its kind
// (`iKind`) and the vertex shader collapses the other kinds' vertices to nothing. So all the
// loot on screen is one draw call, however many kinds. Every frame it draws only the pieces
// near the truck (`count`) and its bounds are refitted, so it's culled when they're off
// screen. A faint amber glow sprite behind each piece (one more instanced mesh) makes loot
// read from a distance at night; premium pieces glow brighter. The last pool slot is kept
// for a rare find (L.rare): one at a time, far out in the county, shown on the radar at any
// range, gone if left too long.
const L = CONFIG.dredge.loot;
const R = L.rare;
const P = CONFIG.dredge.palette;


// Shape builders: a few primitives per kind, coloured from the palette. y = 0 is the ground.
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
// A crate of mason jars, the still's output.
function shineCrate(add, c) {
  add(box(1.0, 0.34, 0.5), c.accent, 0, 0.17, 0);
  for (let k = 0; k < 6; k++) add(cyl(0.09, 0.09, 0.26, 8), c.main, -0.33 + (k % 3) * 0.33, 0.47, k < 3 ? -0.11 : 0.11);
}

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
  // Bicycle: two spoked wheels (dark), a frame, saddle and handlebars.
  bicycle: (add, c) => {
    for (const x of [-0.48, 0.48]) add(new THREE.TorusGeometry(0.3, 0.04, 4, 12), c.accent, x, 0.32, 0);
    add(box(0.9, 0.06, 0.06), c.main, 0, 0.62, 0);
    add(box(0.06, 0.52, 0.06).rotateZ(0.55), c.main, -0.12, 0.44, 0);
    add(box(0.05, 0.42, 0.05), c.main, 0.47, 0.52, 0);
    add(box(0.24, 0.06, 0.12), c.accent, -0.3, 0.72, 0);
    add(cyl(0.025, 0.025, 0.42, 5).rotateX(Math.PI / 2), c.accent, 0.45, 0.76, 0);
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
  // Radio set: a cathedral cabinet with a round top, a cloth grille and two knobs.
  radio: (add, c) => {
    add(box(0.6, 0.62, 0.36), c.main, 0, 0.31, 0);
    add(cyl(0.3, 0.3, 0.36, 12).rotateX(Math.PI / 2), c.main, 0, 0.62, 0);
    add(box(0.36, 0.34, 0.03), c.accent, 0, 0.5, 0.18);
    for (const x of [-0.15, 0.15]) add(cyl(0.045, 0.045, 0.05, 6).rotateX(Math.PI / 2), c.accent, x, 0.16, 0.19);
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
  // Sewing machine: the machine's arm and head on a treadle table with iron legs.
  'sewing-machine': (add, c) => {
    add(box(0.9, 0.06, 0.5), c.accent, 0, 0.62, 0);
    for (const x of [-0.38, 0.38]) add(box(0.06, 0.6, 0.42), P.slate, x, 0.3, 0);
    add(box(0.56, 0.1, 0.24), c.main, 0, 0.7, 0);
    add(box(0.13, 0.3, 0.16), c.main, 0.2, 0.9, 0);
    add(box(0.52, 0.11, 0.15), c.main, 0, 1.0, 0);
    add(box(0.11, 0.2, 0.15), c.main, -0.22, 0.88, 0);
    add(cyl(0.1, 0.1, 0.04, 8).rotateX(Math.PI / 2), c.accent, 0.3, 0.95, 0.1);
  },
  // Strongbox: a brass-bound box with a strap and an iron lock plate (premium: it glows).
  strongbox: (add, c) => {
    add(box(0.62, 0.42, 0.44), c.main, 0, 0.21, 0);
    add(box(0.64, 0.1, 0.46), c.accent, 0, 0.3, 0);
    add(box(0.14, 0.16, 0.04), P.slate, 0, 0.22, 0.23);
  },
  // Gold pocket watch (rare): a fat gold case on its chain, open, on a velvet pad.
  'pocket-watch': (add, c) => {
    add(box(0.6, 0.06, 0.6), P.brick, 0, 0.03, 0);
    add(cyl(0.22, 0.22, 0.08, 14), c.main, 0, 0.1, 0);
    add(cyl(0.18, 0.18, 0.02, 14), P.cream, 0, 0.15, 0);
    add(cyl(0.21, 0.21, 0.03, 14).rotateX(-1.2), c.main, 0, 0.26, -0.24);
    add(cyl(0.04, 0.04, 0.08, 6), c.accent, 0, 0.1, 0.25);
    add(new THREE.TorusGeometry(0.16, 0.02, 4, 10).rotateX(Math.PI / 2), c.accent, 0.18, 0.08, 0.32);
  },
  // Brewed at the still: a slatted crate of mason jars (the lager: a keg in its cradle).
  'corn-shine': (add, c) => shineCrate(add, c),
  applejack: (add, c) => shineCrate(add, c),
  rye: (add, c) => { shineCrate(add, c); add(box(0.5, 0.5, 0.5), c.main, -0.25, 0.25, 0.5); },
  lager: (add, c) => {
    add(cyl(0.42, 0.42, 1.0, 10).rotateZ(Math.PI / 2), c.main, 0, 0.5, 0);
    for (const x of [-0.36, 0.36]) add(cyl(0.44, 0.44, 0.07, 10).rotateZ(Math.PI / 2), c.accent, x, 0.5, 0);
    for (const x of [-0.3, 0.3]) add(box(0.14, 0.16, 0.8), P.slate, x, 0.08, 0);
  },
  // Case of bonds (rare): a leather document case, strapped, with certificates showing.
  bonds: (add, c) => {
    add(box(0.5, 0.36, 1.0), c.accent, 0, 0.18, 0);
    add(box(0.42, 0.06, 0.92), P.cream, 0, 0.39, 0);
    for (const z of [-0.3, 0.3]) add(box(0.54, 0.4, 0.07), c.main, 0, 0.2, z);
    add(box(0.12, 0.08, 0.2), c.main, 0, 0.46, 0);
  },
};

// Every kind's model in one geometry, each vertex tagged with its kind's index.
function allKindsGeometry() {
  const geos = L.kinds.map((k) => kindGeometry(k));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const size = geos[0].attributes[name].itemSize;
    const all = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].array.length, 0));
    geos.reduce((o, g) => { all.set(g.attributes[name].array, o); return o + g.attributes[name].array.length; }, 0);
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  const tag = new Float32Array(out.attributes.position.count);
  let o = 0;
  geos.forEach((g, k) => { tag.fill(k, o, o + g.attributes.position.count); o += g.attributes.position.count; g.dispose(); });
  out.setAttribute('aKind', new THREE.BufferAttribute(tag, 1));
  out.computeBoundingSphere();
  return out;
}

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
    const n = this.n = L.count + 1;
    this.rareSlot = L.count;
    this._pool = L.kinds.map((k, i) => i).filter((i) => !L.kinds[i].rare && L.kinds[i].weight > 0);
    this._rareKinds = L.kinds.map((k, i) => i).filter((i) => L.kinds[i].rare);
    this.rareIn = R.first;                 // seconds until the next rare find turns up
    this.rareLeft = 0;                     // seconds before the one out there is gone
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

    // One flat-shaded material for every kind (one shader), with a faint neutral emissive so
    // the dark tiers still show at night without tinting them.
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.05,
      emissive: new THREE.Color(P.cream).multiplyScalar(L.emissive),
    });
    // Each instance shows only its own kind's vertices.
    this.material.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aKind;\nattribute float iKind;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(aKind - iKind) > 0.5) transformed = vec3(0.0);');
    };
    this.material.customProgramCacheKey = () => 'loot-kinds';
    const geo = allKindsGeometry();
    this.iKind = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.iKind.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iKind', this.iKind);
    this.mesh = new THREE.InstancedMesh(geo, this.material, n);
    this.mesh.name = 'loot';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.drawn = new Uint16Array(L.kinds.length);   // pieces of each kind drawn this frame
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
    this._o = new THREE.Object3D();
  }

  // A kind's index (its `kind` value), by id.
  kindIndex(id) { return L.kinds.findIndex((k) => k.id === id); }

  // Scatter a fresh set of pieces (a new run), none within 30 m of the truck.
  reset(player = null) {
    this.timer.fill(0);
    for (let i = 0; i < this.n; i++) {
      this.active[i] = i !== this.rareSlot;
      if (this.active[i]) this._place(i, player, 30);
    }
    this.rareIn = R.first;
    this.rareLeft = 0;
    this._writeAll(0, player);
  }

  // Pick a weighted kind (unless given one) and a free spot on a road, at least `away` metres
  // from the player (and where `ok(x, z)` allows).
  _place(i, player, away, kind = -1, ok = null) {
    const rng = this.rng, c = this.world.collision, pool = this._pool;
    if (kind < 0) {
      let r = rng() * pool.reduce((s, k) => s + L.kinds[k].weight, 0), j = 0;
      while (j < pool.length - 1 && r > L.kinds[pool[j]].weight) { r -= L.kinds[pool[j]].weight; j++; }
      kind = pool[j];
    }
    for (let tries = 0; tries < 40; tries++) {
      let d = rng() * this.totalLength, l = this.links[0];
      for (const link of this.links) { if (d < link[2]) { l = link; break; } d -= link[2]; }
      const [a, b, len] = l, t = d / len;
      const side = (rng() - 0.5) * 5, nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
      const x = a.x + (b.x - a.x) * t + nx * side, z = a.z + (b.z - a.z) * t + nz * side;
      if (player && Math.hypot(x - player.x, z - player.z) < away) continue;
      if (c.resolveCircle(x, z, 0.9).hit) continue;
      if (ok && !ok(x, z)) continue;
      this.kind[i] = kind; this.x[i] = x; this.z[i] = z; this.yaw[i] = rng() * Math.PI * 2;
      return true;
    }
    return false;
  }

  // Write each kind's nearby pieces into its mesh (they bob and turn) and their glow sprites
  // (turned to face the camera, just behind the piece), then refit the bounds so the
  // renderer can cull what's off screen.
  _writeAll(time, center, camera = center) {
    const o = this._o, drawn = this.drawn, range2 = L.drawRange * L.drawRange, G = L.glow;
    drawn.fill(0);
    let count = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.active[i]) continue;
      if (center) { const dx = this.x[i] - center.x, dz = this.z[i] - center.z; if (dx * dx + dz * dz > range2) continue; }
      const k = this.kind[i], kind = L.kinds[k];
      o.position.set(this.x[i], 0.05 + 0.12 * (1 + Math.sin(time * 2.2 + i)), this.z[i]);
      o.rotation.set(0, this.yaw[i] + time * 0.6, 0);
      o.scale.setScalar(L.scale);
      o.updateMatrix();
      this.mesh.setMatrixAt(count, o.matrix);
      this.iKind.array[count] = k;
      drawn[k]++;
      // Glow: faces the camera, set back from the piece so it haloes rather than covers it,
      // and grows with distance so it still reads far away.
      let fx = 0, fz = 1, d = G.near;
      if (camera) { fx = camera.x - this.x[i]; fz = camera.z - this.z[i]; d = Math.hypot(fx, fz) || 1; fx /= d; fz /= d; }
      const grow = Math.min(G.maxScale, Math.max(1, d / G.near));
      o.position.set(this.x[i] - fx * 0.7, G.height, this.z[i] - fz * 0.7);
      o.rotation.set(0, Math.atan2(fx, fz), 0);
      o.scale.setScalar(G.size * kindColors(kind).glow.size * grow * (0.9 + 0.1 * Math.sin(time * 3 + i)) * (i === this.rareSlot ? R.glow : 1));
      o.updateMatrix();
      this.glow.setColorAt(count, this._tint[k]);
      this.glow.setMatrixAt(count, o.matrix);
      count++;
    }
    for (const m of [this.mesh, this.glow]) {
      m.count = count;
      m.visible = count > 0;
      m.instanceMatrix.needsUpdate = true;
      if (count) m.computeBoundingSphere();
    }
    this.iKind.needsUpdate = true;
    this.glow.instanceColor.needsUpdate = true;
  }


  // Pieces bob and turn; the truck picks up anything within reach; picked-up pieces come
  // back elsewhere after a while; a rare find turns up now and then, and goes if left.
  // Returns events: { type: 'loot' | 'rare' | 'rare-gone', kind, index, x, z }.
  update(dt, time, player, { radius = L.pickupRadius, canTake = () => true, camera = null } = {}) {
    const events = [];
    const p = player.position;
    for (let i = 0; i < this.n; i++) {
      if (!this.active[i]) {
        if (i === this.rareSlot) continue;
        this.timer[i] -= dt;
        if (this.timer[i] <= 0 && this._place(i, p, L.respawnMin)) this.active[i] = 1;
        continue;
      }
      const dx = this.x[i] - p.x, dz = this.z[i] - p.z;
      if (dx * dx + dz * dz < radius * radius && canTake(L.kinds[this.kind[i]], i)) {
        this.active[i] = 0;
        this.timer[i] = L.respawn;
        if (i === this.rareSlot) this.rareIn = R.every;
        events.push({ type: 'loot', kind: L.kinds[this.kind[i]], index: i, x: this.x[i], z: this.z[i], rare: i === this.rareSlot });
      }
    }
    const s = this.rareSlot;
    if (this.active[s]) {
      this.rareLeft -= dt;
      if (this.rareLeft <= 0) {
        this.active[s] = 0;
        this.rareIn = R.every;
        events.push({ type: 'rare-gone', kind: L.kinds[this.kind[s]], index: s, x: this.x[s], z: this.z[s] });
      }
    } else if ((this.rareIn -= dt) <= 0) {
      this.spawnRare(p, events);
    }
    this._writeAll(time, p, camera || p);
    // A slow warm glint so pieces show up at night.
    this.material.emissiveIntensity = 0.8 + 0.4 * Math.sin(time * 3);
    return events;
  }

  // A rare find: a rare kind, out in the county, far from the truck. Pushes a 'rare' event.
  spawnRare(p, events = []) {
    const s = this.rareSlot, kind = this._rareKinds[Math.floor(this.rng() * this._rareKinds.length)];
    if (!this._place(s, p, R.minDistance, kind, (x, z) => this.world.inCounty({ x, z }))) { this.rareIn = 5; return events; }
    this.active[s] = 1;
    this.rareLeft = R.lasts;
    events.push({ type: 'rare', kind: L.kinds[kind], index: s, x: this.x[s], z: this.z[s] });
    return events;
  }

  // The rare find out there, if any: { kind, x, z, left } (seconds left).
  rare() {
    const s = this.rareSlot;
    return this.active[s] ? { kind: L.kinds[this.kind[s]], x: this.x[s], z: this.z[s], left: this.rareLeft } : null;
  }

  // Pieces within `range` metres, for the radar (premium ones stand out); the rare find shows
  // at any range.
  near(p, range) {
    const out = [];
    const s = this.rareSlot;
    for (let i = 0; i < this.n; i++) {
      if (i !== s && this.active[i] && Math.hypot(this.x[i] - p.x, this.z[i] - p.z) < range) {
        out.push({ kind: L.kinds[this.kind[i]].tier === 'premium' ? 'loot-premium' : 'loot', x: this.x[i], z: this.z[i] });
      }
    }
    if (this.active[s]) out.push({ kind: 'loot-rare', x: this.x[s], z: this.z[s] });
    return out;
  }
}
