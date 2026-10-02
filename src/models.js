import * as THREE from 'three';
import { MODELS } from './assets.js';

// Otto's truck. The game drives the bevelled flatbed from assets/ (scripts/make-truck.mjs);
// the procedural 1920s truck here, built from primitives, stands in when that model isn't
// loaded (or with ?models=0). Static parts are merged into one vertex-coloured mesh (one
// draw call); wheels stay separate so they can spin and steer. Models face -Z.
//
// One clearcoat material covers every surface: each vertex carries its own roughness,
// metalness and clearcoat (the `surf` attribute), so glossy paint, brass, chrome, glass,
// rubber and wood all come out of a single draw call.
const body = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 });
body.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat = vSurf.z;');
};
body.customProgramCacheKey = () => 'shine-vehicle';

// Headlight beams: additive cones that show the light in the night air. Bright at the lamp,
// fading along the beam and at the cone's silhouette edges so it never looks like a solid.
const beam = new THREE.MeshBasicMaterial({
  color: 0xffe2b0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
  depthWrite: false, side: THREE.DoubleSide, fog: false,
});
beam.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vFacing, vAlong, vHeadOn;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec3 toEye = normalize(-mvPosition.xyz);
      vFacing = abs(dot(normalize(normalMatrix * normal), toEye));
      vHeadOn = max(0.0, dot(normalize(normalMatrix * vec3(0.0, 0.0, -1.0)), toEye));
      vAlong = uv.y;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFacing, vAlong, vHeadOn;')
    // Looking down the beam (into the lamps) the layers stack up: fade it out there.
    .replace('#include <opaque_fragment>', 'diffuseColor.a *= pow(vAlong, 1.4) * smoothstep(0.1, 0.8, vFacing) * (1.0 - smoothstep(0.45, 0.9, vHeadOn));\n#include <opaque_fragment>');
};
beam.customProgramCacheKey = () => 'shine-beam';

export const MATERIALS = {
  body,
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  beam,
};

// Two light cones from the headlamps at (±x, y, z), aimed a little down the road.
function headlightBeams(z, y, x) {
  const len = 18, geos = [];
  for (const sx of [-1, 1]) {
    // Narrow end (uv.y = 1) at the lamp, wide end down the road.
    const g = new THREE.CylinderGeometry(0.17, 3.4, len, 18, 1, true).translate(0, -len / 2, 0);
    g.rotateX(-Math.PI / 2 + 0.07);   // point along -Z, dipped toward the road
    g.translate(sx * x, y, z - 0.05);
    geos.push(g);
  }
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = geos[0].attributes[name].itemSize;
    const arrays = geos.map((g) => g.attributes[name].array);
    const all = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    arrays.reduce((o, a) => (all.set(a, o), o + a.length), 0);
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  const off = geos[0].attributes.position.count, i0 = geos[0].index.array, i1 = geos[1].index.array;
  out.setIndex([...i0, ...Array.from(i1, (i) => i + off)]);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(out, beam);
  mesh.renderOrder = 3;
  return mesh;
}

// Surface finish by part colour: [roughness, metalness, clearcoat].
const SURFACES = {
  paint: [0.42, 0.15, 1],
  metal: [0.28, 0.95, 0],
  glass: [0.06, 0, 1],
  rubber: [0.85, 0, 0],
  wood: [0.75, 0, 0.15],
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

function part(geo, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
  return { geo, color, matrix: tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(1, 1, 1)).clone() };
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg);
// Half a cylinder lying across the car (axis along X), arched on top: a wheel fender.
const fender = (r, width) => new THREE.CylinderGeometry(r, r, width, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);

// Merge parts into a single geometry with per-vertex colours.
export function mergeParts(parts) {
  const prepared = [];
  let total = 0;
  for (const p of parts) {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.matrix);
    prepared.push([g, new THREE.Color(p.color), SURFACES[p.surf || surfaceFor(p.color)]]);
    total += g.attributes.position.count;
    p.geo.dispose();
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), srf = new Float32Array(total * 3);
  let o = 0;
  for (const [g, c, s] of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], (o + i) * 3); srf.set(s, (o + i) * 3); }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('surf', new THREE.BufferAttribute(srf, 3));
  out.computeBoundingSphere();
  return out;
}

// Every wheel in the city is drawn by one InstancedMesh per wheel shape (a draw call or
// two for all of them). Vehicles keep an invisible Object3D per wheel that spins and steers as
// usual; WHEELS.update() copies their world matrices into the instances each frame.
export const WHEELS = {
  batches: new Map(),       // geometry -> { slots: Object3D[], material, mesh }
  slot(geo, material = MATERIALS.body) {
    let b = this.batches.get(geo);
    if (!b) this.batches.set(geo, (b = { slots: [], material, mesh: null }));
    if (b.mesh) throw new Error('WHEELS: every vehicle must be built before WHEELS.attach()');
    const o = new THREE.Object3D();
    b.slots.push(o);
    return o;
  },
  // Once every vehicle exists: one mesh per shape.
  attach(scene) {
    for (const [geo, b] of this.batches) {
      if (b.mesh) continue;
      b.mesh = new THREE.InstancedMesh(geo, b.material, b.slots.length);
      b.mesh.frustumCulled = false;     // instances spread over the whole city
      b.mesh.castShadow = b.mesh.receiveShadow = true;
      b.mesh.userData.wheels = true;
      scene.add(b.mesh);
    }
    this.update();
  },
  update() {
    for (const b of this.batches.values()) {
      if (!b.mesh) continue;
      let n = 0;
      for (const o of b.slots) if (shown(o)) { o.updateWorldMatrix(true, false); b.mesh.setMatrixAt(n++, o.matrixWorld); }
      b.mesh.count = n;
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  },
};
// Visible all the way up (a hidden car hides its whole group).
function shown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return !!o.parent;
}

// A wooden artillery wheel: a rounded tyre, a steel rim, twelve spokes and a chrome hub.
// One geometry per radius, shared by every vehicle that size.
const wheelCache = new Map();
function buildWheel(r) {
  if (!wheelCache.has(r)) wheelCache.set(r, makeWheel(r));
  return wheelCache.get(r);
}
function makeWheel(r, tire = TIRE, spoke = 0xb08850) {
  const parts = [
    part(new THREE.TorusGeometry(r - 0.09, 0.1, 8, 24), tire, 0, 0, 0, 0, Math.PI / 2, 0),
    part(new THREE.TorusGeometry(r - 0.2, 0.03, 6, 24), 0x333333, 0, 0, 0, 0, Math.PI / 2, 0),
  ];
  for (let k = 0; k < 6; k++) parts.push(part(box(0.07, 0.055, (r - 0.2) * 2), spoke, 0, 0, 0, (k * Math.PI) / 6, 0, 0));
  parts.push(part(cyl(r * 0.26, 0.2, 12), spoke, 0, 0, 0, 0, 0, Math.PI / 2));
  parts.push(part(new THREE.SphereGeometry(r * 0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), CHROME, 0.13, 0, 0, 0, 0, -Math.PI / 2));
  parts.push(part(new THREE.SphereGeometry(r * 0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), CHROME, -0.13, 0, 0, 0, 0, Math.PI / 2));
  return mergeParts(parts);
}

const BRASS = 0xc9a24a, CHROME = 0xb8bcc2, BLACK = 0x121212, GLASS = 0x1a222c, WOOD = 0x7a5234, PLANK = 0xc9a46a, TIRE = 0x161616;
const METALS = new Set([BRASS, CHROME, 0x333333]);
const RUBBERS = new Set([BLACK, TIRE, 0x2a2a2a]);
const WOODS = new Set([WOOD, PLANK, 0xe8dcb0, 0xb08850]);
function surfaceFor(color) {
  if (METALS.has(color)) return 'metal';
  if (color === GLASS) return 'glass';
  if (RUBBERS.has(color)) return 'rubber';
  if (WOODS.has(color)) return 'wood';
  return 'paint';
}

// Glowing headlamp lenses (the emissive part, in the glow mesh).
function headlamps(z, y, x = 0.62, radius = 0.19) {
  return [
    part(cyl(radius, 0.04, 16), 0xfff2c8, -x, y, z - 0.02, Math.PI / 2, 0, 0),
    part(cyl(radius, 0.04, 16), 0xfff2c8, x, y, z - 0.02, Math.PI / 2, 0, 0),
  ];
}
// Round chrome bowls behind the lenses, a brass rim, and the stalks down to the fenders.
function lampHousings(z, y, x = 0.62) {
  const bowl = () => new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  return [
    part(bowl(), CHROME, -x, y, z + 0.02, Math.PI / 2, 0, 0),
    part(bowl(), CHROME, x, y, z + 0.02, Math.PI / 2, 0, 0),
    part(new THREE.TorusGeometry(0.21, 0.03, 6, 18), BRASS, -x, y, z, 0, 0, 0),
    part(new THREE.TorusGeometry(0.21, 0.03, 6, 18), BRASS, x, y, z, 0, 0, 0),
    part(box(0.06, 0.45, 0.06), BLACK, -x, y - 0.32, z + 0.2),
    part(box(0.06, 0.45, 0.06), BLACK, x, y - 0.32, z + 0.2),
    part(box(x * 2, 0.05, 0.05), BLACK, 0, y - 0.22, z + 0.2),       // lamp bar
  ];
}
function frontEnd(body, trim, hoodLen = 1.6, z = -1.8) {
  const front = z - hoodLen / 2;
  const out = [
    part(box(1.15, 0.85, hoodLen), body, 0, 1.3, z),                           // hood
    part(box(1.2, 0.06, hoodLen), body, 0, 1.73, z),                           // hood ridge
    part(box(1.3, 1.05, 0.16), trim, 0, 1.33, front - 0.06),                   // radiator shell
    part(box(1.05, 0.8, 0.05), 0x2a2a2a, 0, 1.3, front - 0.15),                // grille
    part(cyl(0.07, 0.14, 10), trim, 0, 1.92, front - 0.05),                    // radiator cap
    part(new THREE.SphereGeometry(0.06, 8, 6), trim, 0, 2.02, front - 0.05),   // mascot
  ];
  for (let k = -4; k <= 4; k++) out.push(part(box(0.035, 0.76, 0.04), 0x333333, k * 0.11, 1.3, front - 0.19));   // grille slats
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) out.push(part(box(0.02, 0.32, 0.08), 0x2a2a2a, sx * 0.58, 1.3, z - hoodLen * 0.3 + k * 0.16));   // louvres
  return out;
}
function fendersAndBoards(body, zf, zr, r) {
  return [
    part(fender(r + 0.12, 0.42), body, -0.95, r, zf), part(fender(r + 0.12, 0.42), body, 0.95, r, zf),
    part(fender(r + 0.12, 0.42), body, -0.95, r, zr), part(fender(r + 0.12, 0.42), body, 0.95, r, zr),
    part(box(0.36, 0.06, zr - zf - 1.1), 0x2a2a2a, -0.97, 0.58, (zf + zr) / 2),  // running boards
    part(box(0.36, 0.06, zr - zf - 1.1), 0x2a2a2a, 0.97, 0.58, (zf + zr) / 2),
  ];
}

// Returns { group, body, bodyPivot, shell, looks, lampMesh, wheels, frontPivots, wheelRadius,
// wheelSpots, lamp, beam }
export function buildVehicle() {
  const group = new THREE.Group();
  // The built-in Model TT-style truck: green hood and cab, short flatbed.
  const paint = 0x255c42, cab = 0x21523b;
  let r = 0.5;
  const parts = [
    part(box(1.8, 0.28, 4.9), BLACK, 0, 0.72, 0),                             // chassis
    ...frontEnd(paint, BRASS, 1.6, -1.75),
    ...fendersAndBoards(paint, -1.75, 1.55, r),
    part(box(1.7, 1.25, 1.25), cab, 0, 1.78, -0.35),                           // cab
    part(box(1.86, 0.1, 1.55), cab, 0, 2.46, -0.3),                            // roof
    part(box(1.9, 0.04, 1.6), BLACK, 0, 2.52, -0.3),                           // roof canvas
    part(box(1.55, 0.55, 0.05), GLASS, 0, 2.05, -0.99),                        // windshield
    part(box(1.66, 0.06, 0.08), BLACK, 0, 2.35, -0.99), part(box(1.66, 0.06, 0.08), BLACK, 0, 1.76, -0.99),   // windshield frame
    part(box(0.06, 0.62, 0.08), BLACK, -0.8, 2.05, -0.99), part(box(0.06, 0.62, 0.08), BLACK, 0.8, 2.05, -0.99),
    part(box(0.05, 0.45, 0.7), GLASS, -0.86, 2.02, -0.35), part(box(0.05, 0.45, 0.7), GLASS, 0.86, 2.02, -0.35),
    part(box(0.07, 0.52, 0.06), BLACK, -0.87, 2.02, -0.72), part(box(0.07, 0.52, 0.06), BLACK, 0.87, 2.02, -0.72),   // door pillars
    part(box(0.02, 0.9, 0.02), BLACK, -0.86, 1.55, 0.05), part(box(0.02, 0.9, 0.02), BLACK, 0.86, 1.55, 0.05),     // door seams
    part(box(0.05, 0.04, 0.16), CHROME, -0.87, 1.6, -0.1), part(box(0.05, 0.04, 0.16), CHROME, 0.87, 1.6, -0.1),   // door handles
    part(new THREE.TorusGeometry(0.17, 0.02, 6, 16), BLACK, -0.35, 1.95, -0.78, -0.9, 0, 0),                        // steering wheel
    part(box(1.8, 0.35, 1.5), WOOD, 0, 1.05, 1.35),                            // flatbed
    part(box(1.84, 0.08, 1.5), PLANK, 0, 1.24, 1.35),
    part(box(1.5, 0.08, 0.1), CHROME, 0, 0.8, -2.72),                          // bumper
    part(box(0.08, 0.2, 0.08), BLACK, -0.55, 0.72, -2.64), part(box(0.08, 0.2, 0.08), BLACK, 0.55, 0.72, -2.64),
    part(box(0.44, 0.22, 0.03), 0xe8dcb0, 0, 0.62, -2.74),                     // number plate
    // Spare wheel on the driver's side, behind the front fender.
    part(new THREE.TorusGeometry(0.4, 0.09, 8, 20), TIRE, -1.02, 1.05, -0.95, 0, Math.PI / 2, 0),
    part(cyl(0.12, 0.1, 10), CHROME, -1.02, 1.05, -0.95, 0, 0, Math.PI / 2),
    ...lampHousings(-2.2, 1.6),
  ];
  const lamps = [...headlamps(-2.2, 1.6), part(box(0.22, 0.16, 0.06), 0xff2a1a, -0.8, 1.0, 2.12), part(box(0.22, 0.16, 0.06), 0xff2a1a, 0.8, 1.0, 2.12)];
  let wheelSpots = [[-0.95, -1.75, true], [0.95, -1.75, true], [-0.95, 1.55], [0.95, 1.55]];

  // The body sits on its springs: a sub-group that can roll, pitch and bounce about axle
  // height while the wheels stay on the road. The lights ride on the body too.
  const PIVOT = 0.65;
  const body = new THREE.Group(), sprung = new THREE.Group();
  body.position.y = PIVOT;
  body.userData.pivot = PIVOT;
  sprung.position.y = -PIVOT;
  body.add(sprung);
  // The model from assets/ replaces the built-in body, lamps and wheels.
  const custom = MODELS.truck;
  let shell, wheelGeo, wheelMat = MATERIALS.body, wheelY = r;
  let lens = [-2.2, 1.6, 0.62];    // the built-in truck's headlamps: [z, y, x]
  if (custom) {
    for (const p of parts) p.geo.dispose();
    const x = custom.extras, [w, , len] = x.size;
    shell = new THREE.Mesh(custom.body, custom.material || MATERIALS.body);
    shell.userData.model = 'truck';
    // Headlamp lenses at the model's lamps (or near the front corners), tail lights at the back.
    const hl = x.headlights?.length ? x.headlights : [[-w * 0.25, x.roof * 0.5, -len / 2 + 0.3], [w * 0.25, x.roof * 0.5, -len / 2 + 0.3]];
    lens = [hl[0][2] - 0.04, hl[0][1], Math.abs(hl[0][0])];
    lamps.length = 0;
    lamps.push(...headlamps(lens[0], lens[1], lens[2], 0.13),
      part(box(0.2, 0.14, 0.05), 0xff2a1a, -w * 0.36, 0.95, len / 2 + 0.01), part(box(0.2, 0.14, 0.05), 0xff2a1a, w * 0.36, 0.95, len / 2 + 0.01));
    if (custom.wheel && x.wheels) {
      wheelGeo = custom.wheel;
      wheelMat = custom.material || MATERIALS.body;
      r = x.wheelRadius;
      wheelY = x.wheels[0][1];
      wheelSpots = x.wheels.map(([wx, , wz]) => (wz < 0 ? [wx, wz, true] : [wx, wz]));
    }
  } else {
    shell = new THREE.Mesh(mergeParts(parts), MATERIALS.body);
  }
  const lampMesh = new THREE.Mesh(mergeParts(lamps), MATERIALS.glow);
  sprung.add(shell, lampMesh);
  // The model carries a second, upgraded body (the reinforced look): built now, hidden, and
  // swapped in by toggling (setLook), so the look never costs a draw call.
  const looks = { stock: shell };
  if (custom?.reinforced) {
    looks.reinforced = new THREE.Mesh(custom.reinforced, custom.material || MATERIALS.body);
    looks.reinforced.visible = false;
    sprung.add(looks.reinforced);
  }
  group.add(body);

  // Wheels: a pivot (steer) holding the wheel (spin).
  wheelGeo = wheelGeo || buildWheel(r);
  const wheels = [];
  const front = [];
  for (const [x, z, isFront] of wheelSpots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, wheelY, z);
    const w = WHEELS.slot(wheelGeo, wheelMat);
    pivot.add(w);
    group.add(pivot);
    wheels.push(w);
    if (isFront) front.push(pivot);
  }
  // lamp: where the headlights are [z, y, x], for the real headlight and its beams.
  const beam = headlightBeams(lens[0], lens[1], lens[2]);
  sprung.add(beam);
  return { group, body: sprung, bodyPivot: body, shell, looks, lampMesh, wheels, frontPivots: front, wheelRadius: r, wheelSpots, lamp: lens, beam };
}
