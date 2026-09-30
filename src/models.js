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

function buildWheel(r, tire = 0x161616, spoke = 0xb08850) {
  const parts = [part(cyl(r, 0.28, 16), tire, 0, 0, 0, 0, 0, Math.PI / 2)];
  // Wooden artillery spokes so you can see the wheels turn.
  for (let k = 0; k < 3; k++) parts.push(part(box(0.3, 0.09, r * 1.7), spoke, 0, 0, 0, (k * Math.PI) / 3, 0, 0));
  parts.push(part(cyl(r * 0.25, 0.34, 10), 0x8a8a8a, 0, 0, 0, 0, 0, Math.PI / 2));
  return mergeParts(parts);
}

const BRASS = 0xc9a24a, BLACK = 0x121212, GLASS = 0x1a222c, WOOD = 0x7a5234, PLANK = 0xc9a46a;

function headlamps(z, y, x = 0.62) {
  return [
    part(cyl(0.2, 0.14, 12), 0xfff2c8, -x, y, z, Math.PI / 2, 0, 0),
    part(cyl(0.2, 0.14, 12), 0xfff2c8, x, y, z, Math.PI / 2, 0, 0),
  ];
}
function lampHousings(z, y, x = 0.62) {
  return [
    part(cyl(0.24, 0.3, 12), BLACK, -x, y, z + 0.14, Math.PI / 2, 0, 0),
    part(cyl(0.24, 0.3, 12), BLACK, x, y, z + 0.14, Math.PI / 2, 0, 0),
    part(box(0.06, 0.4, 0.06), BLACK, -x, y - 0.3, z + 0.2),
    part(box(0.06, 0.4, 0.06), BLACK, x, y - 0.3, z + 0.2),
  ];
}
function frontEnd(body, trim, hoodLen = 1.6, z = -1.8) {
  return [
    part(box(1.15, 0.85, hoodLen), body, 0, 1.3, z),                           // hood
    part(box(1.3, 1.05, 0.16), trim, 0, 1.33, z - hoodLen / 2 - 0.06),          // radiator shell
    part(box(1.05, 0.8, 0.05), 0x2a2a2a, 0, 1.3, z - hoodLen / 2 - 0.15),      // grille
    part(box(0.1, 0.22, 0.1), trim, 0, 1.86, z - hoodLen / 2 - 0.05),          // radiator cap
  ];
}
function fendersAndBoards(body, zf, zr, r) {
  return [
    part(fender(r + 0.12, 0.42), body, -0.95, r, zf), part(fender(r + 0.12, 0.42), body, 0.95, r, zf),
    part(fender(r + 0.12, 0.42), body, -0.95, r, zr), part(fender(r + 0.12, 0.42), body, 0.95, r, zr),
    part(box(0.36, 0.06, zr - zf - 1.1), 0x2a2a2a, -0.97, 0.58, (zf + zr) / 2),  // running boards
    part(box(0.36, 0.06, zr - zf - 1.1), 0x2a2a2a, 0.97, 0.58, (zf + zr) / 2),
  ];
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
    const body = 0x2f4a3a, cab = 0x2a3f33;
    r = 0.5;
    parts.push(
      part(box(1.8, 0.28, 4.9), BLACK, 0, 0.72, 0),                             // chassis
      ...frontEnd(body, BRASS, 1.6, -1.75),
      ...fendersAndBoards(body, -1.75, 1.55, r),
      part(box(1.7, 1.25, 1.25), cab, 0, 1.78, -0.35),                           // cab
      part(box(1.86, 0.1, 1.55), cab, 0, 2.46, -0.3),                            // roof
      part(box(1.55, 0.55, 0.05), GLASS, 0, 2.05, -0.99),                        // windshield
      part(box(0.05, 0.45, 0.7), GLASS, -0.86, 2.02, -0.35), part(box(0.05, 0.45, 0.7), GLASS, 0.86, 2.02, -0.35),
      part(box(1.8, 0.35, 1.5), WOOD, 0, 1.05, 1.35),                            // flatbed
      part(box(1.84, 0.08, 1.5), PLANK, 0, 1.24, 1.35),
      part(box(1.4, 0.1, 0.1), BRASS, 0, 0.78, -2.72),                           // bumper
      part(cyl(0.08, 0.5, 8), 0x333333, 0, 0.72, 2.4, Math.PI / 2, 0, 0),         // hitch bar
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
    for (const [x, c] of [[-0.35, 0xff2020], [0.35, 0x2060ff]]) {
      const mat = new THREE.MeshBasicMaterial({ color: c });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.36), mat);
      lamp.position.set(x, 2.66, -0.4);
      lamp.userData.base = new THREE.Color(c);
      group.add(lamp);
      sirens.push(lamp);
    }
    wheelSpots = [[-0.93, -1.75, true], [0.93, -1.75, true], [-0.93, 1.45], [0.93, 1.45]];
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
  const lampMesh = new THREE.Mesh(mergeParts(lamps), MATERIALS.glow);
  sprung.add(new THREE.Mesh(mergeParts(parts), MATERIALS.body), lampMesh);
  group.add(body);

  // Wheels: a pivot (steer) holding the wheel (spin).
  const wheelGeo = buildWheel(r);
  const wheels = [];
  const front = [];
  for (const [x, z, isFront] of wheelSpots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const w = new THREE.Mesh(wheelGeo, MATERIALS.body);
    pivot.add(w);
    group.add(pivot);
    wheels.push(w);
    if (isFront) front.push(pivot);
  }
  const out = { group, body: sprung, bodyPivot: body, lampMesh, wheels, frontPivots: front, sirens, torches, wheelRadius: r, wheelSpots };
  if (style === 'player') out.trailer = buildHorseTrailer(wheelGeo, r);
  return out;
}

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
    const w = new THREE.Mesh(wheelGeo, MATERIALS.body);
    w.position.set(x, r, 0);
    group.add(w);
    wheels.push(w);
  }
  return { group, bodyPivot: body, wheels, hitchLength: 3.6 };
}
