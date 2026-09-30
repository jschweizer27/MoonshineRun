import * as THREE from 'three';

// Procedural 1920s vehicles built from primitives. Static parts are merged into one
// vertex-coloured mesh per vehicle (1 draw call); wheels stay separate so they can spin
// and steer. All vehicles share the same few materials, so spawning never compiles new
// shaders. Models face -Z.

export const MATERIALS = {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
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

// Merge parts into a single geometry with per-vertex colours.
export function mergeParts(parts) {
  const prepared = [];
  let total = 0;
  for (const p of parts) {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.matrix);
    prepared.push([g, new THREE.Color(p.color)]);
    total += g.attributes.position.count;
    p.geo.dispose();
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const [g, c] of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const WHEEL_RADIUS = 0.55;

function buildWheel(tire = 0x161616, spoke = 0xb08850) {
  const parts = [part(cyl(WHEEL_RADIUS, 0.34, 16), tire, 0, 0, 0, 0, 0, Math.PI / 2)];
  // Wooden artillery spokes so you can see the wheels turn.
  for (let k = 0; k < 3; k++) parts.push(part(box(0.36, 0.1, WHEEL_RADIUS * 1.7), spoke, 0, 0, 0, (k * Math.PI) / 3, 0, 0));
  parts.push(part(cyl(0.14, 0.4, 10), 0x8a8a8a, 0, 0, 0, 0, 0, Math.PI / 2));
  return mergeParts(parts);
}

const STYLES = {
  // Otto's truck with its retrofitted steeplechase horse box.
  player: { body: 0x9c5a32, cab: 0x2f4a3a, trim: 0xd9c9a0, box: 0x7a5234, boxTrim: 0xc9a46a, siren: false },
  // Prohibition Bureau sedan.
  fed: { body: 0x1b1c20, cab: 0x1b1c20, trim: 0xe8e4da, box: null, siren: true },
  // Temperance Alliance pickup.
  zealot: { body: 0x6a1f1c, cab: 0x4a1714, trim: 0xd8cfb8, box: null, siren: false, torches: true },
};

export function buildVehicle(style = 'player') {
  const s = STYLES[style];
  const group = new THREE.Group();
  const parts = [
    part(box(2.1, 0.35, 5.8), 0x151515, 0, 0.72, 0),                      // chassis
    part(box(1.5, 0.95, 1.9), s.body, 0, 1.28, -1.95),                   // hood
    part(box(1.35, 0.85, 0.12), s.trim, 0, 1.28, -2.94),                 // radiator grille
    part(box(0.12, 0.3, 0.9), s.trim, 0, 1.9, -2.9),                     // radiator cap / mascot
    part(box(2.3, 0.1, 1.9), s.body, 0, 0.93, -1.95),                    // front fender line
    part(box(0.35, 0.08, 2.6), 0x2a2a2a, -1.15, 0.64, -0.3),             // running boards
    part(box(0.35, 0.08, 2.6), 0x2a2a2a, 1.15, 0.64, -0.3),
    part(box(2.1, 1.3, 1.6), s.cab, 0, 1.75, -0.35),                     // cab
    part(box(2.3, 0.12, 1.85), s.cab, 0, 2.46, -0.35),                   // roof
    part(box(1.85, 0.62, 0.06), 0x1c2430, 0, 2.02, -1.17),               // windshield
    part(box(0.06, 0.5, 1.0), 0x1c2430, -1.06, 2.02, -0.35),             // side windows
    part(box(0.06, 0.5, 1.0), 0x1c2430, 1.06, 2.02, -0.35),
    part(box(1.6, 0.12, 0.1), s.trim, 0, 0.78, -3.0),                    // bumper
    part(box(1.6, 0.12, 0.1), s.trim, 0, 0.78, 2.95),
  ];
  if (s.box) {
    // Horse box: planked sides, curved-roof hint and a little window for the horse.
    parts.push(part(box(2.3, 2.05, 3.2), s.box, 0, 2.0, 1.35));
    parts.push(part(box(2.4, 0.14, 3.3), s.boxTrim, 0, 3.08, 1.35));
    parts.push(part(box(1.9, 0.2, 3.0), s.box, 0, 3.22, 1.35));
    for (let k = 0; k < 4; k++) {
      parts.push(part(box(2.34, 0.05, 3.22), s.boxTrim, 0, 1.3 + k * 0.45, 1.35));
    }
    parts.push(part(box(2.34, 0.45, 0.8), 0x14161a, 0, 2.6, 0.6));
  } else {
    // Sedan / pickup rear.
    parts.push(part(box(2.1, 1.0, 2.3), s.body, 0, 1.4, 1.6));
    if (style === 'fed') parts.push(part(box(2.12, 1.25, 2.3), s.cab, 0, 1.75, 1.3));
    parts.push(part(box(0.9, 0.1, 5.0), s.trim, 0, 1.92, 0.1));
  }
  if (s.torches) {
    for (const x of [-0.8, 0.8]) parts.push(part(cyl(0.05, 1.6, 6), 0x3a2a1a, x, 2.4, 2.5));
  }
  const body = new THREE.Mesh(mergeParts(parts), MATERIALS.body);
  group.add(body);

  // Headlamps and tail lamps (emissive, no real lights).
  const lamps = [
    part(cyl(0.2, 0.15, 12), 0xfff2c8, -0.8, 1.45, -2.95, Math.PI / 2, 0, 0),
    part(cyl(0.2, 0.15, 12), 0xfff2c8, 0.8, 1.45, -2.95, Math.PI / 2, 0, 0),
    part(box(0.3, 0.2, 0.08), 0xff2a1a, -0.85, 1.05, 3.0),
    part(box(0.3, 0.2, 0.08), 0xff2a1a, 0.85, 1.05, 3.0),
  ];
  group.add(new THREE.Mesh(mergeParts(lamps), MATERIALS.glow));

  // Siren lamps flash red/blue (per-car material, same shader program).
  const sirens = [];
  if (s.siren) {
    for (const [x, c] of [[-0.45, 0xff2020], [0.45, 0x2060ff]]) {
      const mat = new THREE.MeshBasicMaterial({ color: c });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.4), mat);
      lamp.position.set(x, 2.66, -0.35);
      lamp.userData.base = new THREE.Color(c);
      group.add(lamp);
      sirens.push(lamp);
    }
  }
  const torches = [];
  if (s.torches) {
    for (const x of [-0.8, 0.8]) {
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), flameMat);
      flame.position.set(x, 3.45, 2.5);
      group.add(flame);
      torches.push(flame);
    }
  }

  // Wheels: a pivot (steer) holding the wheel (spin).
  const wheelGeo = buildWheel();
  const wheels = [];
  const front = [];
  for (const [x, z] of [[-1.05, -1.95], [1.05, -1.95], [-1.05, 1.95], [1.05, 1.95]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_RADIUS, z);
    const w = new THREE.Mesh(wheelGeo, MATERIALS.body);
    pivot.add(w);
    group.add(pivot);
    wheels.push(w);
    if (z < 0) front.push(pivot);
  }
  return { group, wheels, frontPivots: front, sirens, torches, wheelRadius: WHEEL_RADIUS };
}
