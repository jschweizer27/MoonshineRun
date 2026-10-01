import * as THREE from 'three';
import { createRng } from './rng.js';
import { juice } from './juice.js';

// Street clutter that cars knock flying: crates, barrels and sandwich-board signs on the
// sidewalks near the lamps. Visual only: nothing collides with them and they don't slow
// anyone down (JUICE.impacts.props). One InstancedMesh draws them all: the geometry holds
// all three shapes and each instance shows only its own (the `part` attribute).
const KINDS = [
  { name: 'crate', half: [0.4, 0.4], weight: 0.45 },     // half-height upright / lying
  { name: 'barrel', half: [0.45, 0.3], weight: 0.35 },
  { name: 'sign', half: [0.45, 0.06], weight: 0.2 },
];

function propGeometry() {
  const parts = [];
  const add = (geo, kind, color, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    geo = geo.toNonIndexed();
    geo.rotateX(rx); geo.rotateZ(rz); geo.translate(x, y, z);
    const n = geo.attributes.position.count, c = new THREE.Color(color);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
    geo.setAttribute('part', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    geo.deleteAttribute('uv');
    parts.push(geo);
  };
  // Crate: planked box with darker battens.
  add(new THREE.BoxGeometry(0.8, 0.8, 0.8), 0, 0xb48a52);
  for (const y of [-0.28, 0.28]) add(new THREE.BoxGeometry(0.84, 0.08, 0.84), 0, 0x6e4c2a, 0, y, 0);
  // Barrel: a squat wooden barrel with iron hoops.
  add(new THREE.CylinderGeometry(0.28, 0.25, 0.9, 12), 1, 0x8a5a32);
  for (const y of [-0.3, 0.3]) add(new THREE.CylinderGeometry(0.295, 0.295, 0.06, 12), 1, 0x3a3a3a, 0, y, 0);
  // Sandwich-board sign: two boards leaning together.
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.6, 0.85, 0.04), 2, 0xf0e4c4, 0, 0, s * 0.13, s * 0.3, 0);
  // Merge.
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

export class Props {
  constructor(scene, world, seed = 1) {
    const rng = createRng(seed ^ 0x9a0b);
    const spots = [];
    for (const sp of world.lampSpots) {
      if (sp.pole === false || world.inCounty(sp) || !rng.chance(0.6)) continue;
      // Along the sidewalk from the lamp, near the shopfronts (away from the road).
      const along = rng.range(3, 6) * (rng.chance(0.5) ? 1 : -1), back = rng.range(0.6, 1.1);
      const x = sp.x - sp.tz * along - sp.tx * back, z = sp.z + sp.tx * along - sp.tz * back;
      let r = rng(), kind = 0;
      while (kind < KINDS.length - 1 && r > KINDS[kind].weight) { r -= KINDS[kind].weight; kind++; }
      spots.push({ x, z, kind, yaw: rng() * Math.PI * 2 });
    }
    const n = this.n = spots.length;
    this.kind = new Uint8Array(n);
    this.home = new Float32Array(n * 4);          // x, z, yaw, -
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.rot = new Float32Array(n * 3);           // pitch, yaw, roll
    this.spin = new Float32Array(n * 3);
    this.moving = new Uint8Array(n);
    this.cool = new Float32Array(n);
    spots.forEach((p, i) => { this.kind[i] = p.kind; this.home.set([p.x, p.z, p.yaw, 0], i * 4); });

    const geo = propGeometry();
    const kinds = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    for (let i = 0; i < n; i++) kinds.setX(i, this.kind[i]);
    geo.setAttribute('aKind', kinds);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float part;\nattribute float aKind;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(part - aKind) > 0.5) transformed = vec3(0.0);');
    };
    mat.customProgramCacheKey = () => 'shine-props';
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.name = 'props';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this._o = new THREE.Object3D();
    this._e = new THREE.Euler();
    scene.add(this.mesh);
    this.reset();
  }

  // Everything back where it was (a new run).
  reset() {
    for (let i = 0; i < this.n; i++) {
      const h = i * 4, k = i * 3;
      this.pos.set([this.home[h], KINDS[this.kind[i]].half[0], this.home[h + 1]], k);
      this.rot.set([0, this.home[h + 2], 0], k);
      this.vel.fill(0, k, k + 3);
      this.spin.fill(0, k, k + 3);
      this.moving[i] = 0;
      this._write(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Vehicles (the player and the police) knock props flying; flying props tumble and land.
  update(dt, cars) {
    if (!dt || !this.n) return;
    const kick = juice('impacts', 'props');
    let dirty = false;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      if (this.cool[i] > 0) this.cool[i] -= dt;
      if (kick > 0 && this.cool[i] <= 0) {
        for (let c = 0; c < cars.length; c++) {
          const v = cars[c];
          if (!v || !v.mesh.visible || Math.abs(v.speed) < 1.5) continue;
          // Distance to the car's centre line (2.2 m either side of its middle).
          const fx = v.forwardX, fz = v.forwardZ, dx = this.pos[k] - v.position.x, dz = this.pos[k + 2] - v.position.z;
          const t = clamp(dx * fx + dz * fz, -2.2, 2.2), ex = dx - fx * t, ez = dz - fz * t;
          if (ex * ex + ez * ez > 1.7 * 1.7) continue;
          const len = Math.hypot(ex, ez) || 1, sp = Math.abs(v.speed);
          const out = (1.5 + sp * 0.18) * kick;
          this.vel[k] = (v.vx * (0.8 + Math.random() * 0.4)) * kick + (ex / len) * out;
          this.vel[k + 1] = (2 + sp * 0.16 + Math.random() * 2) * kick;
          this.vel[k + 2] = (v.vz * (0.8 + Math.random() * 0.4)) * kick + (ez / len) * out;
          for (let a = 0; a < 3; a++) this.spin[k + a] = (Math.random() - 0.5) * (4 + sp * 0.5) * kick;
          this.moving[i] = 1;
          this.cool[i] = 0.4;
          this.hits = (this.hits || 0) + 1;
          break;
        }
      }
      if (!this.moving[i]) continue;
      dirty = true;
      this.vel[k + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) { this.pos[k + a] += this.vel[k + a] * dt; this.rot[k + a] += this.spin[k + a] * dt; }
      const rest = KINDS[this.kind[i]].half[1];
      if (this.pos[k + 1] < rest) {               // hit the ground: bounce and scrape
        this.pos[k + 1] = rest;
        this.vel[k + 1] *= -0.3;
        this.vel[k] *= 0.62; this.vel[k + 2] *= 0.62;
        for (let a = 0; a < 3; a++) this.spin[k + a] *= 0.55;
        if (Math.abs(this.vel[k + 1]) < 0.6 && Math.hypot(this.vel[k], this.vel[k + 2]) < 0.4) this._settle(i);
      }
      this._write(i);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Come to rest on a flat side (crates on any face; barrels and signs upright or on their side).
  _settle(i) {
    const k = i * 3, q = Math.PI / 2, snap = (a) => Math.round(a / q) * q;
    let pitch = snap(this.rot[k]), roll = snap(this.rot[k + 2]);
    if (this.kind[i] !== 0 && Math.round(pitch / q) % 2 && Math.round(roll / q) % 2) roll = 0;
    this.rot[k] = pitch; this.rot[k + 2] = roll;
    const lying = Math.abs(Math.round(pitch / q)) % 2 === 1 || Math.abs(Math.round(roll / q)) % 2 === 1;
    this.pos[k + 1] = KINDS[this.kind[i]].half[this.kind[i] === 0 || !lying ? 0 : 1];
    this.vel.fill(0, k, k + 3);
    this.spin.fill(0, k, k + 3);
    this.moving[i] = 0;
  }

  _write(i) {
    const k = i * 3, o = this._o;
    o.position.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
    o.rotation.copy(this._e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2], 'YXZ'));
    o.updateMatrix();
    this.mesh.setMatrixAt(i, o.matrix);
  }

  get flying() { let n = 0; for (let i = 0; i < this.n; i++) n += this.moving[i]; return n; }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
