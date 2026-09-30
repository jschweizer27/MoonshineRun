import * as THREE from 'three';

// Green Spring Valley: farm roads north of Baltimore up York Road, with barns hiding the
// stills, Otto's hideout, woods to hide in and white steeplechase fences. North is -Z.
const NODES = {
  Y1: [0, -300], Y2: [15, -380], Y3: [0, -460], Y4: [-20, -560], Y5: [0, -660], Y6: [15, -760], Y7: [0, -860], Y8: [0, -985],
  V1: [-120, -455], V2: [-240, -470], V3: [-360, -440], V4: [120, -470], V5: [250, -450], V6: [370, -480],
  M1: [-140, -670], M2: [-280, -650], M3: [-390, -690], M4: [140, -650], M5: [290, -680], M6: [400, -650],
  K1: [-150, -870], K2: [-300, -900], K3: [150, -860], K4: [320, -890],
  W1: [-380, -560], W2: [-360, -800], E1: [390, -570], E2: [380, -770],
  N1: [-150, -985], N2: [150, -985],
  H0: [-45, -300], L1: [-245, -505], L2: [255, -490], L3: [-290, -615], L4: [292, -715], L5: [-330, -950], L6: [245, -915],
};
const LINKS = [
  ['CITY', 'Y1'], ['Y1', 'Y2'], ['Y2', 'Y3'], ['Y3', 'Y4'], ['Y4', 'Y5'], ['Y5', 'Y6'], ['Y6', 'Y7'], ['Y7', 'Y8'],
  ['Y3', 'V1'], ['V1', 'V2'], ['V2', 'V3'], ['Y3', 'V4'], ['V4', 'V5'], ['V5', 'V6'],
  ['Y5', 'M1'], ['M1', 'M2'], ['M2', 'M3'], ['Y5', 'M4'], ['M4', 'M5'], ['M5', 'M6'],
  ['Y7', 'K1'], ['K1', 'K2'], ['Y7', 'K3'], ['K3', 'K4'],
  ['V3', 'W1'], ['W1', 'M3'], ['M3', 'W2'], ['W2', 'K2'], ['V6', 'E1'], ['E1', 'M6'], ['M6', 'E2'], ['E2', 'K4'],
  ['K2', 'N1'], ['N1', 'Y8'], ['Y8', 'N2'], ['N2', 'K4'],
  ['Y1', 'H0'], ['V2', 'L1'], ['V5', 'L2'], ['M2', 'L3'], ['M5', 'L4'], ['K2', 'L5'], ['K4', 'L6'],
];
// Barns sit at the end of their farm lanes. [lane node, road node it branches from, name]
const BARNS = [
  ['L1', 'V2', 'Stone Hollow Farm'],
  ['L2', 'V5', 'Ridgewood Farm'],
  ['L3', 'M2', 'Old Mill Barn'],
  ['L4', 'M5', 'Harrow Stables'],
  ['L5', 'K2', 'Frog Hollow'],
  ['L6', 'K4', 'Monkton Grange'],
];
const FENCED = [['V1', 'V2'], ['V4', 'V5'], ['M1', 'M2'], ['M4', 'M5'], ['Y4', 'Y5'], ['K1', 'K2']];

export const COUNTY = { minX: -440, maxX: 440, minZ: -1040, maxZ: -247 };
const ROAD_W = 10;

export function buildCounty(world, rng) {
  const scene = world.scene;
  const ids = {};
  const cityNode = world.roads.nearest(0, -220);
  ids.CITY = cityNode.id;
  for (const [k, [x, z]] of Object.entries(NODES)) ids[k] = world.roads.addNode(x, z, k.startsWith('L') || k === 'H0' ? 'lane' : 'county');
  for (const [a, b] of LINKS) world.roads.link(ids[a], ids[b]);

  // Drivable area: the county, plus the York Road gap through the city wall.
  world.collision.addZone(COUNTY.minX, COUNTY.minZ, COUNTY.maxX, COUNTY.maxZ);
  world.collision.addZone(-7, -262, 7, -215);

  // Grass.
  const grass = new THREE.CanvasTexture(noiseCanvas(rng, 256, ['#23311c', '#2a3a20', '#1d2917', '#314224']));
  grass.colorSpace = THREE.SRGBColorSpace;
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(70, 60);
  const gw = COUNTY.maxX - COUNTY.minX + 60, gd = COUNTY.maxZ - COUNTY.minZ + 60;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.position.set(0, -0.01, (COUNTY.minZ + COUNTY.maxZ) / 2);
  scene.add(ground);

  // Dirt roads as one merged ribbon mesh with world-space texture coordinates.
  const edges = [];
  for (const n of world.roads.nodes) {
    for (const l of n.links) {
      const m = world.roads.nodes[l];
      if (l < n.id || (n.tag === 'city' && m.tag === 'city')) continue;
      // Start York Road where the cobbles end.
      const a = n.tag === 'city' ? { x: n.x, z: -242 } : n;
      const b = m.tag === 'city' ? { x: m.x, z: -242 } : m;
      edges.push([a, b, n.tag === 'lane' || m.tag === 'lane' ? 7 : ROAD_W]);
    }
  }
  world.countyEdges = edges;
  const dirt = new THREE.CanvasTexture(noiseCanvas(rng, 256, ['#5a4a36', '#65543d', '#4f412f', '#6f5d44']));
  dirt.colorSpace = THREE.SRGBColorSpace;
  dirt.wrapS = dirt.wrapT = THREE.RepeatWrapping;
  world.dirtMaterial = new THREE.MeshStandardMaterial({ map: dirt, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
  const roads = new THREE.Mesh(ribbonGeometry(edges, world.roads.nodes.filter((n) => n.tag !== 'city')), world.dirtMaterial);
  scene.add(roads);

  // Barns (instanced bodies and roofs) with a lantern by each door.
  const barnSpots = BARNS.map(([lane, from, name]) => barnAt(NODES[lane], NODES[from], name));
  const hideout = { ...barnAt(NODES.H0, NODES.Y1, 'Otto’s Hideout'), hideout: true };
  const all = [...barnSpots, hideout];
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }), all.length);
  const roof = new THREE.InstancedMesh(roofGeometry(), new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.8 }), all.length);
  const door = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 1 }), all.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  all.forEach((b, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
    body.setMatrixAt(i, m.compose(p.set(b.x, 0, b.z), q, s.set(14, 8, 20)));
    body.setColorAt(i, new THREE.Color(b.hideout ? 0x4a3a2c : 0x7a2a1e));
    roof.setMatrixAt(i, m.compose(p.set(b.x, 8, b.z), q, s.set(15.5, 5, 21)));
    door.setMatrixAt(i, m.compose(p.set(b.x + b.fx * 10.05, 2.8, b.z + b.fz * 10.05), q, s.set(6, 5.6, 0.2)));
    const half = b.rot === 0 ? [7, 10] : [10, 7];
    world.collision.addBox(b.x - half[0], b.z - half[1], b.x + half[0], b.z + half[1], { tag: 'barn' });
    world.buildings.push({ minX: b.x - half[0], minZ: b.z - half[1], maxX: b.x + half[0], maxZ: b.z + half[1], h: 8, barn: true });
    world.extraLights.push({ x: b.x + b.fx * 11.5 + b.fz * 4, z: b.z + b.fz * 11.5 - b.fx * 4, tx: b.fx, tz: b.fz, pole: false });
  });
  for (const im of [body, roof, door]) { im.instanceMatrix.needsUpdate = true; scene.add(im); }
  body.instanceColor.needsUpdate = true;

  // Woods: clusters plus scattered trees, kept off the roads and away from barns.
  const clear = (x, z, r) => {
    if (x < COUNTY.minX + 8 || x > COUNTY.maxX - 8 || z < COUNTY.minZ + 8 || z > COUNTY.maxZ - 14) return false;
    for (const [a, b, w] of edges) if (distToSegment(x, z, a, b) < w / 2 + r + 3) return false;
    for (const b of all) if (Math.hypot(x - b.x, z - b.z) < 26) return false;
    return true;
  };
  const trees = [];
  for (let c = 0; c < 26 && trees.length < 900; c++) {
    const cx = rng.range(COUNTY.minX, COUNTY.maxX), cz = rng.range(COUNTY.minZ, COUNTY.maxZ);
    const n = rng.int(18, 38), spread = rng.range(22, 48);
    for (let k = 0; k < n; k++) {
      const x = cx + rng.range(-spread, spread), z = cz + rng.range(-spread, spread);
      if (clear(x, z, 2)) trees.push([x, z, rng.range(0.8, 1.35)]);
    }
  }
  for (let k = 0; k < 400 && trees.length < 900; k++) {
    const x = rng.range(COUNTY.minX, COUNTY.maxX), z = rng.range(COUNTY.minZ, COUNTY.maxZ);
    if (clear(x, z, 2)) trees.push([x, z, rng.range(0.8, 1.3)]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 6).translate(0, 2, 0),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }), trees.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.2, 0).translate(0, 6.2, 0),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), trees.length);
  const greens = [0x24381f, 0x2c4424, 0x1f3019, 0x34502a, 0x2a3b1c];
  trees.forEach(([x, z, sc], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    trunk.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.set(sc, sc, sc)));
    crown.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.set(sc, sc * rng.range(0.9, 1.3), sc)));
    crown.setColorAt(i, new THREE.Color(rng.pick(greens)));
    // Trunks stop the truck; the leafy crowns block line of sight (hide in the woods).
    world.collision.addCircle(x, z, 0.6 * sc, { tag: 'tree', blocksSight: true, sightR: 2.6 * sc });
  });
  for (const im of [trunk, crown]) { im.instanceMatrix.needsUpdate = true; scene.add(im); }
  crown.instanceColor.needsUpdate = true;
  world.trees = trees;

  // White post-and-rail fences along the valley roads (steeplechase country).
  const posts = [], rails = [];
  for (const [ka, kb] of FENCED) {
    const [ax, az] = NODES[ka], [bx, bz] = NODES[kb];
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    for (const side of [-1, 1]) {
      const ox = -dz * 8.5 * side, oz = dx * 8.5 * side;
      const start = 16, end = len - 16;
      for (let t = start; t < end; t += 3.2) {
        posts.push([ax + dx * t + ox, az + dz * t + oz]);
        if (t + 3.2 < end) rails.push([ax + dx * (t + 1.6) + ox, az + dz * (t + 1.6) + oz, Math.atan2(dx, dz)]);
      }
      world.collision.addCapsule(ax + dx * start + ox, az + dz * start + oz, ax + dx * end + ox, az + dz * end + oz, 0.25, { tag: 'fence' });
    }
  }
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 });
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 1.4, 0.2).translate(0, 0.7, 0), white, posts.length);
  const railMesh = new THREE.InstancedMesh(railGeometry(), white, rails.length);
  posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, m.compose(p.set(x, 0, z), q.identity(), s.set(1, 1, 1))));
  rails.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    railMesh.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.set(1, 1, 1)));
  });
  for (const im of [postMesh, railMesh]) { im.instanceMatrix.needsUpdate = true; scene.add(im); }

  // Low fieldstone walls mark the edge of the county.
  const stone = new THREE.MeshStandardMaterial({ color: 0x5e5a52, roughness: 1 });
  const { minX, maxX, minZ, maxZ } = COUNTY;
  for (const [x0, z0, x1, z1] of [[minX, minZ, maxX, minZ], [minX, minZ, minX, maxZ], [maxX, minZ, maxX, maxZ], [minX, maxZ, -12, maxZ], [12, maxZ, maxX, maxZ]]) {
    const w = Math.max(1, Math.abs(x1 - x0)), d = Math.max(1, Math.abs(z1 - z0));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d).translate(0, 0.6, 0), stone);
    wall.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    scene.add(wall);
  }

  return { barns: barnSpots, hideout };
}

// A barn at the end of a lane, its door facing back down the lane.
function barnAt(lane, from, name) {
  const dx = lane[0] - from[0], dz = lane[1] - from[1];
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const alongX = Math.abs(ux) > Math.abs(uz);
  // Door faces the lane: -direction, snapped to an axis.
  const fx = alongX ? -Math.sign(ux) : 0, fz = alongX ? 0 : -Math.sign(uz);
  const x = lane[0] + ux * 22, z = lane[1] + uz * 22;
  return { name, x, z, fx, fz, rot: alongX ? Math.PI / 2 : 0, laneX: lane[0], laneZ: lane[1] };
}

function ribbonGeometry(edges, nodes) {
  const pos = [], uv = [], idx = [];
  // Wound counter-clockwise seen from above, so the faces point up at the sky.
  const quad = (pts) => {
    const base = pos.length / 3;
    for (const [x, z] of pts) { pos.push(x, 0.03, z); uv.push(x / 9, z / 9); }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const [a, b, w] of edges) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / len * (w / 2), nz = (b.x - a.x) / len * (w / 2);
    quad([[a.x + nx, a.z + nz], [a.x - nx, a.z - nz], [b.x - nx, b.z - nz], [b.x + nx, b.z + nz]]);
  }
  // Round the junctions.
  for (const n of nodes) {
    const base = pos.length / 3, r = ROAD_W / 2, seg = 12;
    pos.push(n.x, 0.03, n.z); uv.push(n.x / 9, n.z / 9);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, x = n.x + Math.cos(a) * r, z = n.z + Math.sin(a) * r;
      pos.push(x, 0.03, z); uv.push(x / 9, z / 9);
      if (k) idx.push(base, base + k + 1, base + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

function roofGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

function railGeometry() {
  const a = new THREE.BoxGeometry(0.08, 0.12, 3.2).translate(0, 0.55, 0);
  const b = new THREE.BoxGeometry(0.08, 0.12, 3.2).translate(0, 1.15, 0);
  const g = new THREE.BufferGeometry();
  const merge = [a, b].map((x) => x.toNonIndexed());
  g.setAttribute('position', new THREE.Float32BufferAttribute([...merge[0].attributes.position.array, ...merge[1].attributes.position.array], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...merge[0].attributes.normal.array, ...merge[1].attributes.normal.array], 3));
  return g;
}

function noiseCanvas(rng, size, palette) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = palette[0];
  g.fillRect(0, 0, size, size);
  for (let k = 0; k < size * size / 6; k++) {
    g.fillStyle = rng.pick(palette);
    g.fillRect(rng() * size, rng() * size, rng.range(1, 3), rng.range(1, 3));
  }
  return cv;
}

export function distToSegment(x, z, a, b) {
  const ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez;
  const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2)) : 0;
  return Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
}
