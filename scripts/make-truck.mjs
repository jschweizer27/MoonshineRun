#!/usr/bin/env node
// Builds assets/dredge-truck.glb, Otto's truck: a 1920s olive flatbed with a
// wood-slat bed and a canvas cover, every part a bevelled, flat-shaded primitive (the
// game's low-poly look). Like the baked models from optimize-models.mjs it carries vertex
// colours and a _SURF attribute (roughness, metalness, clearcoat), so it uses the shared
// vehicle material: no textures, no new shaders. Faces -Z, wheels cut out as their own
// mesh (axle along X), wheel spots, headlights and roof height in the scene extras.
// Two bodies: `body` (stock) and `reinforced` (the trunk upgrade: iron-strapped rails, a
// taller stake fence and a darker, tarred canvas). The game shows one or the other.
//   node scripts/make-truck.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(root, 'assets/dredge-truck.glb');

// Colours from the dredge palette (sRGB; THREE.Color stores them linear, as glTF wants).
const OLIVE = 0x4a5240, OLIVE_DARK = 0x3a4132, BLACK = 0x18191a, CHASSIS = 0x202220, BRASS = 0xb8733a, CHROME = 0xb8bcc2;
const GLASS = 0x1a222c, WOOD = 0x6e4a30, WOOD_LIGHT = 0x8a603c, CANVAS = 0x8a846c, CANVAS_RIB = 0x5c5848, TIRE = 0x161616;
const FINISH = { paint: [0.5, 0.12, 0.6], metal: [0.3, 0.9, 0], glass: [0.06, 0, 1], rubber: [0.88, 0, 0], wood: [0.78, 0, 0.1], canvas: [0.92, 0, 0] };

const parts = { body: [], wheel: [], rails: [] };
const add = (mesh, geo, color, finish, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  geo.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
  parts[mesh].push({ geo, color, finish });
};
// A box with its edges bevelled (one chamfer step).
const bev = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg);
// Half a cylinder, arched on top, axis across the truck (a fender) or along it (the cover).
const arch = (r, len, seg = 8) => new THREE.CylinderGeometry(r, r, len, seg, 1, true, -Math.PI / 2, Math.PI);   // then rotateX(-PI/2)
const fender = (r, width, seg = 8) => new THREE.CylinderGeometry(r, r, width, seg, 1, true, 0, Math.PI);       // then rotateZ(PI/2)

// --- Body ---------------------------------------------------------------------------
const R = 0.45;                                   // wheel radius
const FRONT = -1.55, REAR = 1.45, TRACK = 0.8;    // axles and half track
add('body', bev(1.5, 0.22, 4.5, 0.04), CHASSIS, 'metal', 0, 0.62, 0);                                  // chassis
add('body', bev(1.06, 0.62, 1.32, 0.1), OLIVE, 'paint', 0, 1.1, -1.66);                                 // hood
add('body', bev(1.12, 0.08, 1.36, 0.03), OLIVE_DARK, 'paint', 0, 1.43, -1.66);                          // hood top seam
add('body', bev(1.1, 0.86, 0.12, 0.04), BRASS, 'metal', 0, 1.1, -2.36);                                 // radiator shell
add('body', box(0.86, 0.64, 0.06), BLACK, 'metal', 0, 1.1, -2.42);                                      // grille
add('body', cyl(0.06, 0.12, 8), BRASS, 'metal', 0, 1.58, -2.36);                                        // radiator cap
add('body', bev(1.68, 1.18, 1.26, 0.12), OLIVE, 'paint', 0, 1.7, -0.36);                                // cab
add('body', bev(1.82, 0.12, 1.5, 0.05), BLACK, 'rubber', 0, 2.34, -0.34);                               // roof (tarred canvas)
add('body', box(1.42, 0.5, 0.04), GLASS, 'glass', 0, 1.98, -1.0);                                       // windscreen
add('body', bev(1.5, 0.06, 0.08, 0.02), BLACK, 'metal', 0, 2.25, -1.0);
for (const s of [-1, 1]) {
  add('body', box(0.04, 0.4, 0.62), GLASS, 'glass', s * 0.85, 1.98, -0.36);                             // side windows
  add('body', cyl(0.15, 0.2, 10), CHROME, 'metal', s * 0.6, 1.24, -2.28, Math.PI / 2);                  // headlamp bowls
  add('body', fender(R + 0.1, 0.36), OLIVE_DARK, 'paint', s * TRACK, R, FRONT, 0, 0, Math.PI / 2);       // front fenders
  add('body', fender(R + 0.1, 0.36), OLIVE_DARK, 'paint', s * TRACK, R, REAR, 0, 0, Math.PI / 2);        // rear fenders
  add('body', bev(0.32, 0.06, 1.7, 0.02), BLACK, 'rubber', s * 0.84, 0.6, -0.08);                       // running boards
  add('body', bev(0.05, 0.04, 0.16, 0.01), CHROME, 'metal', s * 0.86, 1.62, -0.12);                     // door handles
}
add('body', bev(1.74, 0.1, 0.12, 0.03), CHROME, 'metal', 0, 0.64, -2.5);                                // bumper
add('body', box(0.42, 0.2, 0.03), 0xe8dcb0, 'paint', 0, 0.56, -2.57);                                   // number plate

// The bed: a slatted wooden box with stake posts and a tailgate.
const BED_Z = 1.34, BED_L = 2.1;
add('body', bev(1.78, 0.12, BED_L, 0.03), WOOD, 'wood', 0, 0.84, BED_Z);
for (let k = 0; k < 3; k++) {
  const tone = k % 2 ? WOOD_LIGHT : WOOD, y = 1.02 + k * 0.21;
  for (const s of [-1, 1]) add('body', bev(0.06, 0.15, BED_L, 0.02), tone, 'wood', s * 0.88, y, BED_Z);
  add('body', bev(1.76, 0.15, 0.06, 0.02), tone, 'wood', 0, y, BED_Z + BED_L / 2);
}
for (const s of [-1, 1]) for (const z of [BED_Z - 0.98, BED_Z, BED_Z + 0.98]) add('body', bev(0.08, 0.74, 0.08, 0.02), 0x3a2a1a, 'wood', s * 0.92, 1.2, z);
// The canvas cover over the bed, on three hoops.
add('body', arch(0.9, BED_L - 0.08, 9), CANVAS, 'canvas', 0, 1.5, BED_Z, -Math.PI / 2);
for (const z of [BED_Z - 0.95, BED_Z, BED_Z + 0.95]) add('body', arch(0.92, 0.06, 9), CANVAS_RIB, 'canvas', 0, 1.5, z, -Math.PI / 2);
// The cover's closed front (a half disc against the cab).
add('body', new THREE.CircleGeometry(0.9, 9, 0, Math.PI), CANVAS, 'canvas', 0, 1.5, BED_Z - BED_L / 2 + 0.05, 0, Math.PI);

// --- Reinforced: iron straps along the bed, taller stakes with a top rail -------------------
const IRON = 0x2a2c2e;
for (const s of [-1, 1]) {
  for (const y of [1.0, 1.42]) add('rails', bev(0.05, 0.07, BED_L + 0.06, 0.015), IRON, 'metal', s * 0.93, y, BED_Z);
  for (const z of [BED_Z - 0.98, BED_Z, BED_Z + 0.98]) add('rails', bev(0.1, 1.05, 0.1, 0.02), 0x2e2216, 'wood', s * 0.94, 1.36, z);
  add('rails', bev(0.09, 0.09, BED_L + 0.1, 0.02), WOOD_LIGHT, 'wood', s * 0.94, 1.9, BED_Z);
}
add('rails', bev(1.9, 0.07, 0.05, 0.015), IRON, 'metal', 0, 1.2, BED_Z + BED_L / 2 + 0.04);   // tailgate strap

// --- Wheel (centred, axle along X) ----------------------------------------------------
add('wheel', new THREE.TorusGeometry(R - 0.09, 0.1, 6, 16), TIRE, 'rubber', 0, 0, 0, 0, Math.PI / 2);
add('wheel', cyl(R - 0.17, 0.14, 12), OLIVE_DARK, 'paint', 0, 0, 0, 0, 0, Math.PI / 2);
add('wheel', cyl(R * 0.3, 0.22, 8), BRASS, 'metal', 0, 0, 0, 0, 0, Math.PI / 2);
for (let k = 0; k < 4; k++) add('wheel', bev(0.06, 0.05, (R - 0.18) * 2, 0.015), BLACK, 'metal', 0.075, 0, 0, (k * Math.PI) / 4);

// --- Flatten each mesh: non-indexed, flat normals, colour and finish per vertex ---------
function bake(list, recolor = {}) {
  const pos = [], nor = [], col = [], surf = [];
  const c = new THREE.Color();
  for (const { geo, color, finish } of list) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('normal');
    g.computeVertexNormals();                                   // non-indexed: flat facets
    c.setHex(recolor[color] ?? color);                          // linear
    const f = FINISH[finish];
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
      surf.push(...f);
    }
  }
  return { POSITION: pos, NORMAL: nor, COLOR_0: col, _SURF: surf };
}

// --- A minimal GLB writer: one buffer, float vec3 attributes, no indices ------------------
function writeGLB(meshes, extras) {
  const json = { asset: { version: '2.0', generator: 'SHINE make-truck.mjs' }, scenes: [{ nodes: [], extras }], scene: 0, nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [] };
  const chunks = [];
  let offset = 0;
  for (const [name, attrs] of Object.entries(meshes)) {
    const prim = { attributes: {}, mode: 4 };
    for (const [key, arr] of Object.entries(attrs)) {
      const data = Buffer.from(new Float32Array(arr).buffer);
      json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target: 34962 });
      const acc = { bufferView: json.bufferViews.length - 1, componentType: 5126, count: arr.length / 3, type: 'VEC3' };
      if (key === 'POSITION') {
        acc.min = [0, 1, 2].map((k) => Math.min(...arr.filter((_, i) => i % 3 === k)));
        acc.max = [0, 1, 2].map((k) => Math.max(...arr.filter((_, i) => i % 3 === k)));
      }
      json.accessors.push(acc);
      prim.attributes[key] = json.accessors.length - 1;
      chunks.push(data);
      offset += data.length;
    }
    json.meshes.push({ name, primitives: [prim] });
    json.nodes.push({ name, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  const bin = Buffer.concat(chunks);
  json.buffers.push({ byteLength: bin.length });
  const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20), binChunk = pad(bin, 0);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(binChunk.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonChunk, bh, binChunk]);
}

const body = bake(parts.body), wheel = bake(parts.wheel);
// The reinforced body: the same truck, the extra rails, and the canvas tarred darker.
const reinforced = bake([...parts.body, ...parts.rails], { [CANVAS]: 0x4e4a3c, [CANVAS_RIB]: 0x2e2c24 });
const xs = body.POSITION.filter((_, i) => i % 3 === 0), ys = body.POSITION.filter((_, i) => i % 3 === 1), zs = body.POSITION.filter((_, i) => i % 3 === 2);
const size = [Math.max(...xs) - Math.min(...xs), Math.max(...ys), Math.max(...zs) - Math.min(...zs)].map((v) => +v.toFixed(3));
const extras = {
  size,
  wheels: [[-TRACK, R, FRONT], [TRACK, R, FRONT], [-TRACK, R, REAR], [TRACK, R, REAR]],
  wheelRadius: R,
  headlights: [[-0.6, 1.24, -2.38], [0.6, 1.24, -2.38]],
  roof: +Math.max(...ys).toFixed(3),
};
fs.writeFileSync(OUT, writeGLB({ body, reinforced, wheel }, extras));
console.log(`wrote ${path.relative(root, OUT)}: ${body.POSITION.length / 9} + ${wheel.POSITION.length / 9} triangles, ${fs.statSync(OUT).size} bytes`, JSON.stringify(extras));
