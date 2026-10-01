import * as THREE from 'three';
import { MODELS } from './assets.js';

// Procedural 1920s vehicles built from primitives. Static parts are merged into one
// vertex-coloured mesh per vehicle (1 draw call); wheels stay separate so they can spin
// and steer. All vehicles share the same few materials, so spawning never compiles new
// shaders. Models face -Z.
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
// Half a cylinder along the car (axis along Z), arched on top: a curved roof.
const arch = (r, len) => new THREE.CylinderGeometry(r, r, len, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);

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
  // Once every vehicle exists (the police pool is built up front): one mesh per shape.
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
// Visible all the way up (pooled cars and roadblocks hide their whole group).
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
const METALS = new Set([BRASS, CHROME, 0x8a8a8a, 0x7a7a7a, 0x333333]);
const RUBBERS = new Set([BLACK, TIRE, 0x2a2a2a, 0x161616, 0x14161a, 0x2a2420]);
const WOODS = new Set([WOOD, PLANK, 0xb49a6e, 0x8a603c, 0x5a3a24, 0xe8dcb0, 0xf2eee4, 0xb08850, 0x3a2a1a]);
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

// The Bureau's roof beacon: a red glass dome on a dark base, shared by every sedan. The
// base is near-black in the vertex colours so only the dome lights up when it flashes.
const BEACON = 0xff0804;
let beaconGeo = null;
function beaconGeometry() {
  if (!beaconGeo) {
    beaconGeo = mergeParts([
      part(cyl(0.2, 0.07, 16), 0x161616, 0, 0.035, 0),
      part(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, 0, 0.07, 0),
      part(new THREE.TorusGeometry(0.17, 0.015, 6, 20), 0x333333, 0, 0.075, 0, Math.PI / 2, 0, 0),
    ]);
  }
  return beaconGeo;
}

let bannerTex = null;
function temperanceBanner() {
  if (!bannerTex) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#e8e0cc'; g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#7a1f1c'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 58);
    g.fillStyle = '#7a1f1c'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TEMPERANCE', 128, 34);
    bannerTex = new THREE.CanvasTexture(cv);
    bannerTex.colorSpace = THREE.SRGBColorSpace;
  }
  return bannerTex;
}
const bannerMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });

// Returns { group, wheels, frontPivots, sirens, torches, wheelRadius, trailer? }
export function buildVehicle(style = 'player') {
  const group = new THREE.Group();
  const parts = [];
  const lamps = [];
  const sirens = [];
  const torches = [];
  let wheelSpots, r;

  if (style === 'player') {
    // Model TT-style truck: green hood and cab, short flatbed, towing the horse box.
    const body = 0x255c42, cab = 0x21523b;
    r = 0.5;
    parts.push(
      part(box(1.8, 0.28, 4.9), BLACK, 0, 0.72, 0),                             // chassis
      ...frontEnd(body, BRASS, 1.6, -1.75),
      ...fendersAndBoards(body, -1.75, 1.55, r),
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
      part(cyl(0.08, 0.5, 8), 0x333333, 0, 0.72, 2.4, Math.PI / 2, 0, 0),         // hitch bar
      // Spare wheel on the driver's side, behind the front fender.
      part(new THREE.TorusGeometry(0.4, 0.09, 8, 20), TIRE, -1.02, 1.05, -0.95, 0, Math.PI / 2, 0),
      part(cyl(0.12, 0.1, 10), CHROME, -1.02, 1.05, -0.95, 0, 0, Math.PI / 2),
      ...lampHousings(-2.2, 1.6),
    );
    lamps.push(...headlamps(-2.2, 1.6), part(box(0.22, 0.16, 0.06), 0xff2a1a, -0.8, 1.0, 2.12), part(box(0.22, 0.16, 0.06), 0xff2a1a, 0.8, 1.0, 2.12));
    wheelSpots = [[-0.95, -1.75, true], [0.95, -1.75, true], [-0.95, 1.55], [0.95, 1.55]];
  } else if (style === 'fed') {
    // Prohibition Bureau sedan: tall Tudor body, black with white door panels.
    const body = 0x18191c;
    r = 0.48;
    parts.push(
      part(box(1.75, 0.28, 4.6), BLACK, 0, 0.7, 0),
      ...frontEnd(body, 0x8a8a8a, 1.3, -1.75),
      ...fendersAndBoards(body, -1.75, 1.45, r),
      part(box(1.72, 1.35, 2.5), body, 0, 1.75, 0.35),                           // cabin
      part(box(1.86, 0.1, 2.7), body, 0, 2.47, 0.35),                            // roof
      part(box(1.5, 0.55, 0.05), GLASS, 0, 2.0, -0.92),
      part(box(0.05, 0.5, 1.9), GLASS, -0.87, 2.0, 0.35), part(box(0.05, 0.5, 1.9), GLASS, 0.87, 2.0, 0.35),
      part(box(0.04, 0.5, 1.1), 0xe8e4da, -0.87, 1.4, 0.2), part(box(0.04, 0.5, 1.1), 0xe8e4da, 0.87, 1.4, 0.2),  // doors
      part(cyl(0.46, 0.2, 14), 0x161616, 0, 1.45, 1.72, Math.PI / 2, 0, 0),       // spare tyre
      part(box(1.3, 0.1, 0.1), 0x8a8a8a, 0, 0.76, -2.55),
      ...lampHousings(-2.15, 1.55, 0.6),
    );
    lamps.push(...headlamps(-2.15, 1.55, 0.6), part(box(0.2, 0.15, 0.06), 0xff2a1a, -0.7, 1.0, 1.66), part(box(0.2, 0.15, 0.06), 0xff2a1a, 0.7, 1.0, 1.66));
    // A single red dome beacon on the roof; it pulses in a chase (police.js).
    const beacon = new THREE.Mesh(beaconGeometry(), new THREE.MeshBasicMaterial({ color: BEACON, vertexColors: true }));
    beacon.position.set(0, 2.52, -0.1);
    beacon.userData.base = new THREE.Color(BEACON);
    group.add(beacon);
    sirens.push(beacon);
    wheelSpots = [[-0.93, -1.75, true], [0.93, -1.75, true], [-0.93, 1.45], [0.93, 1.45]];
  } else if (style === 'rolls') {
    // The garage's Rolls-Royce (stand-in when its model isn't loaded): a long black coupe.
    const body = 0x101114;
    r = 0.47;
    parts.push(
      part(box(1.75, 0.28, 5.0), BLACK, 0, 0.68, 0),
      ...frontEnd(body, CHROME, 2.0, -1.4),
      ...fendersAndBoards(body, -1.85, 1.6, r),
      part(box(1.7, 1.05, 2.1), body, 0, 1.55, 0.75),                            // cabin
      part(arch(0.86, 2.2), body, 0, 2.05, 0.75),                                // rounded roof
      part(box(1.5, 0.45, 0.05), GLASS, 0, 1.85, -0.31),
      part(box(0.05, 0.4, 1.4), GLASS, -0.86, 1.85, 0.7), part(box(0.05, 0.4, 1.4), GLASS, 0.86, 1.85, 0.7),
      part(box(1.4, 0.08, 0.1), CHROME, 0, 0.76, -2.55),
      ...lampHousings(-2.3, 1.45, 0.6),
    );
    lamps.push(...headlamps(-2.3, 1.45, 0.6), part(box(0.2, 0.15, 0.06), 0xff2a1a, -0.7, 0.95, 2.52), part(box(0.2, 0.15, 0.06), 0xff2a1a, 0.7, 0.95, 2.52));
    wheelSpots = [[-0.93, -1.85, true], [0.93, -1.85, true], [-0.93, 1.6], [0.93, 1.6]];
  } else {
    // Temperance Alliance roadster pickup: oxblood, soft top, torches in the bed.
    const body = 0x5e1c19;
    r = 0.48;
    parts.push(
      part(box(1.75, 0.28, 4.5), BLACK, 0, 0.7, 0),
      ...frontEnd(body, 0x7a7a7a, 1.4, -1.7),
      ...fendersAndBoards(body, -1.7, 1.45, r),
      part(box(1.7, 0.9, 1.2), body, 0, 1.45, -0.35),                            // low cab
      part(arch(0.85, 1.25), 0x2a2420, 0, 1.9, -0.35),                           // soft top
      part(box(1.72, 0.55, 1.9), body, 0, 1.15, 1.25),                           // bed
      part(box(1.3, 0.1, 0.1), 0x7a7a7a, 0, 0.76, -2.5),
      part(cyl(0.05, 1.6, 6), 0x3a2a1a, -0.7, 2.2, 1.6), part(cyl(0.05, 1.6, 6), 0x3a2a1a, 0.7, 2.2, 1.6),     // torch poles
      ...lampHousings(-2.05, 1.5, 0.58),
    );
    lamps.push(...headlamps(-2.05, 1.5, 0.58), part(box(0.2, 0.15, 0.06), 0xff2a1a, -0.7, 1.0, 2.2), part(box(0.2, 0.15, 0.06), 0xff2a1a, 0.7, 1.0, 2.2));
    for (const x of [-0.7, 0.7]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
      flame.position.set(x, 3.25, 1.6);
      group.add(flame);
      torches.push(flame);
    }
    bannerMat.map = temperanceBanner();
    for (const x of [-0.88, 0.88]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), bannerMat);
      banner.position.set(x, 1.18, 1.25);
      banner.rotation.y = Math.PI / 2;
      group.add(banner);
    }
    wheelSpots = [[-0.93, -1.7, true], [0.93, -1.7, true], [-0.93, 1.45], [0.93, 1.45]];
  }

  // The body sits on its springs: a sub-group that can roll, pitch and bounce about axle
  // height while the wheels stay on the road. Lights and banners ride on the body too.
  const PIVOT = 0.65;
  const body = new THREE.Group(), sprung = new THREE.Group();
  body.position.y = PIVOT;
  body.userData.pivot = PIVOT;
  sprung.position.y = -PIVOT;
  body.add(sprung);
  for (const child of [...group.children]) sprung.add(child);   // sirens, torches, banners
  // A model from assets/ replaces the built-in body, lamps and wheels (all cars of a kind
  // share its geometry). Sirens move up to its roof.
  const custom = MODELS[MODEL_FOR[style]];
  let shell, wheelGeo, wheelMat = MATERIALS.body, wheelY = r;
  let lens = DEFAULT_LENS[style] || DEFAULT_LENS.player;
  if (custom) {
    for (const p of parts) p.geo.dispose();
    const x = custom.extras, [w, , len] = x.size;
    shell = new THREE.Mesh(custom.body, custom.material || MATERIALS.body);
    shell.userData.model = MODEL_FOR[style];
    // Headlamp lenses at the model's lamps (or near the front corners), tail lights at the back.
    const hl = x.headlights?.length ? x.headlights : [[-w * 0.25, x.roof * 0.5, -len / 2 + 0.3], [w * 0.25, x.roof * 0.5, -len / 2 + 0.3]];
    lens = [hl[0][2] - 0.04, hl[0][1], Math.abs(hl[0][0])];
    lamps.length = 0;
    lamps.push(...headlamps(lens[0], lens[1], lens[2], 0.13),
      part(box(0.2, 0.14, 0.05), 0xff2a1a, -w * 0.36, 0.95, len / 2 + 0.01), part(box(0.2, 0.14, 0.05), 0xff2a1a, w * 0.36, 0.95, len / 2 + 0.01));
    for (const siren of sirens) siren.position.y = x.roof - 0.03;   // sits on the roof
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
  const out = { group, body: sprung, bodyPivot: body, shell, lampMesh, wheels, frontPivots: front, sirens, torches, wheelRadius: r, wheelSpots, lamp: lens };
  if (style === 'player') out.trailer = buildHorseTrailer(buildWheel(0.5), 0.5);
  if (style === 'player' || style === 'rolls') {
    out.beam = headlightBeams(lens[0], lens[1], lens[2]);
    sprung.add(out.beam);
  }
  return out;
}

// Which assets/ model stands in for each kind of vehicle.
const MODEL_FOR = { player: 'truck', fed: 'fed', rolls: 'rolls' };
// The built-in vehicles' headlamps: [z, y, x].
const DEFAULT_LENS = { player: [-2.2, 1.6, 0.62], fed: [-2.15, 1.55, 0.6], zealot: [-2.05, 1.5, 0.58], rolls: [-2.3, 1.45, 0.6] };

// Otto's retrofitted steeplechase horse box: planked sides, curved roof, a ramp door, and
// a thoroughbred looking out of the window (the best disguise in the county).
function buildHorseTrailer(wheelGeo, r) {
  const group = new THREE.Group();          // origin at the axle, facing -Z
  const parts = [
    part(box(0.12, 0.12, 2.4), 0x333333, 0, 0.72, -2.4),                         // A-frame drawbar
    part(box(2.0, 0.22, 3.9), BLACK, 0, 0.78, -0.35),                            // floor
    part(box(2.0, 1.9, 3.9), WOOD, 0, 1.84, -0.35),                              // box
    part(arch(1.02, 4.0), 0xb49a6e, 0, 2.78, -0.35),                             // curved roof
    part(fender(r + 0.12, 0.4), 0x2a2a2a, -1.02, r, 0), part(fender(r + 0.12, 0.4), 0x2a2a2a, 1.02, r, 0),
    part(box(1.9, 1.7, 0.08), 0x8a603c, 0, 1.75, 1.64),                          // rear ramp door
    part(box(1.92, 0.05, 0.1), PLANK, 0, 1.3, 1.68), part(box(1.92, 0.05, 0.1), PLANK, 0, 1.75, 1.68), part(box(1.92, 0.05, 0.1), PLANK, 0, 2.2, 1.68),
    part(box(0.08, 1.7, 0.1), 0x2a2a2a, -0.9, 1.75, 1.69), part(box(0.08, 1.7, 0.1), 0x2a2a2a, 0.9, 1.75, 1.69),   // hinges
    part(box(0.5, 0.26, 0.04), 0xe8dcb0, 0, 0.98, 1.7),                          // number plate
    part(box(2.04, 0.5, 0.9), 0x14161a, 0, 2.3, -1.6),                           // window
    part(box(0.36, 0.42, 0.62), 0x5a3a24, -0.95, 2.35, -1.75, 0, 0, -0.35),      // the horse, peeking out
    part(box(0.02, 0.2, 0.16), 0xf2eee4, -1.14, 2.36, -1.95, 0, 0, -0.35),       // white blaze
  ];
  for (let k = 0; k < 4; k++) parts.push(part(box(2.04, 0.05, 3.94), PLANK, 0, 1.1 + k * 0.42, -0.35));
  // The box rides on springs over the axle (it sways through corners); wheels stay put.
  const PIVOT = 0.7;
  const body = new THREE.Group(), sprung = new THREE.Group();
  body.position.y = PIVOT;
  body.userData.pivot = PIVOT;
  sprung.position.y = -PIVOT;
  body.add(sprung);
  sprung.add(new THREE.Mesh(mergeParts(parts), MATERIALS.body));
  sprung.add(new THREE.Mesh(mergeParts([
    part(box(0.22, 0.16, 0.06), 0xff2a1a, -0.8, 1.0, 1.7), part(box(0.22, 0.16, 0.06), 0xff2a1a, 0.8, 1.0, 1.7),
  ]), MATERIALS.glow));
  group.add(body);
  const wheels = [];
  for (const x of [-1.02, 1.02]) {
    const w = WHEELS.slot(wheelGeo);
    w.position.set(x, r, 0);
    group.add(w);
    wheels.push(w);
  }
  return { group, bodyPivot: body, wheels, hitchLength: 3.6 };
}
