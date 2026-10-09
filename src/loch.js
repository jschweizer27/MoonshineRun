import * as THREE from 'three';
import { createRng } from './rng.js';

// Loch Raven, chapter 5's region (chapters.js "Drowned Warren"): east of the county through
// two gaps in its east wall, where Baltimore has dammed the Gunpowder valley for its water.
// The mill town of Warren went under the lake: its roofs and church steeple stand out of the
// water off the landing. county.js builds it: the roads join the county's ribbon, and the
// rest is its own meshes (sharing the county's materials and shapes) in `world.lochGroup`,
// which hides when the camera is far away (world.updateFar). The layout is fixed numbers
// plus its own random stream (tree spots, house sizes), so nothing in the county or the
// city moves.
export const LOCH = { minX: 440, maxX: 790, minZ: -910, maxZ: -515 };
// Road nodes, tagged 'county' (traffic and patrols use them) and marked `region: 'loch'`
// (salvage sites and road events keep to the county's own roads). E1 and E2 are county.js
// nodes: the two roads come through the wall beside them.
export const LOCH_NODES = { R1: [480, -770], R2: [545, -735], R3: [485, -575], R4: [585, -538] };
export const LOCH_LINKS = [['E2', 'R1'], ['R1', 'R2'], ['R1', 'R3'], ['E1', 'R3'], ['R3', 'R4']];
// The lake's shore, round from the dam's west end.
export const LAKE = [
  [600, -560], [690, -552], [745, -600], [768, -700], [752, -800], [705, -880],
  [635, -893], [592, -848], [578, -768], [568, -705], [582, -620],
];
// The dam across the lake's south end, and the old mill on the shore by the Warren landing
// (R2), where chapter 5's story site stands.
export const DAM = { ax: 592, az: -553, bx: 698, bz: -544, w: 7, h: 4.2 };
export const MILL = { x: 556, z: -744 };
export const WARREN = { x: 622, z: -748 };
const ROAD_W = 10;

// Is (x, z) in the lake, and how far is it from the shore?
export function inLake(x, z) {
  let inside = false;
  for (let i = 0, j = LAKE.length - 1; i < LAKE.length; j = i++) {
    const [xi, zi] = LAKE[i], [xj, zj] = LAKE[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function shoreDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < LAKE.length; i++) {
    const [ax, az] = LAKE[i], [bx, bz] = LAKE[(i + 1) % LAKE.length];
    best = Math.min(best, segDist(x, z, ax, az, bx, bz));
  }
  return best;
}

// Does the straight line from a to b cross the water? (Bureau cars chasing in sight steer
// straight at the truck; across the lake they keep to the roads instead.)
export function crossesLake(ax, az, bx, bz) {
  if (Math.max(ax, bx) < 560 || Math.min(az, bz) > -540) return false;
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    if (inLake(ax + (bx - ax) * t, az + (bz - az) * t)) return true;
  }
  return false;
}

// The fixed part of the region and what its own random stream places: Warren's drowned
// houses (sizes) and the woods round the water.
export function lochLayout(seed = 0, roads = []) {
  const rng = createRng((seed ^ 0x10c4a7e) >>> 0);
  // Warren: two rows of houses along a drowned street running out from the landing, sunk so
  // only their eaves and roofs show, and the church's steeple. `above` is what stands out.
  const houses = [];
  for (let k = 0; k < 6; k++) {
    for (const side of [-1, 1]) {
      if (rng() < 0.2) continue;
      const w = 6 + rng() * 3, d = 6 + rng() * 2.5, h = 6 + rng() * 1.5, above = 1.2 + rng() * 1.6;
      houses.push({ x: 596 + k * 13 + rng() * 3, z: WARREN.z + side * 13, w, d, h, y: above - h, rot: Math.PI / 2, color: [0xc9bfa6, 0x8a3b2e, 0x6b6e52, 0x5f6a72][Math.floor(rng() * 4)] });
    }
  }
  houses.push({ x: WARREN.x + 18, z: WARREN.z - 30, w: 4.2, d: 4.2, h: 18, y: -5, rot: 0, color: 0xd8d2c4, roofH: 7, steeple: true });
  // The woods: clusters and single trees on the land, clear of the water, the roads, the
  // landing, the mill and the dam.
  const clear = (x, z, r) => x > LOCH.minX + 10 && x < LOCH.maxX - 8 && z > LOCH.minZ + 8 && z < LOCH.maxZ - 8
    && !inLake(x, z) && shoreDistance(x, z) > r + 6
    && roads.every(([a, b]) => segDist(x, z, a.x, a.z, b.x, b.z) > ROAD_W / 2 + r + 4)
    && Math.hypot(x - MILL.x, z - MILL.z) > 16 && Math.hypot(x - LOCH_NODES.R2[0], z - LOCH_NODES.R2[1]) > 14
    && segDist(x, z, DAM.ax, DAM.az, DAM.bx, DAM.bz) > 14;
  const trees = [];
  const tree = (x, z) => trees.push({ x, z, sc: 0.8 + rng() * 0.55, rot: rng() * Math.PI * 2, tall: 0.9 + rng() * 0.4, green: Math.floor(rng() * 5) });
  for (let c = 0; c < 12; c++) {
    const cx = LOCH.minX + rng() * (LOCH.maxX - LOCH.minX), cz = LOCH.minZ + rng() * (LOCH.maxZ - LOCH.minZ);
    const n = 8 + Math.floor(rng() * 12), spread = 16 + rng() * 22;
    for (let k = 0; k < n; k++) {
      const x = cx + (rng() * 2 - 1) * spread, z = cz + (rng() * 2 - 1) * spread;
      if (clear(x, z, 2)) tree(x, z);
    }
  }
  for (let k = 0; k < 160; k++) {
    const x = LOCH.minX + rng() * (LOCH.maxX - LOCH.minX), z = LOCH.minZ + rng() * (LOCH.maxZ - LOCH.minZ);
    if (clear(x, z, 2)) tree(x, z);
  }
  return { houses, trees };
}

// Build it: the drowned houses and the steeple, the woods, the dam and the region's low
// walls, the shore (colliders the truck can't cross), the drivable zones and the landing's
// lamp. `kit` holds the county's shared shapes and materials, so nothing new compiles.
export function buildLoch(world, layout, kit) {
  const group = new THREE.Group();
  group.name = 'loch';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // Drowned Warren: bodies and roofs from the barns' kit (no doors: they're under water).
  const { houses } = layout;
  const body = new THREE.InstancedMesh(kit.box, kit.body, houses.length);
  const roof = new THREE.InstancedMesh(kit.roofShape, kit.roof, houses.length);
  houses.forEach((b, i) => {
    q.setFromAxisAngle(up, b.rot);
    body.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d)));
    body.setColorAt(i, new THREE.Color(b.color));
    roof.setMatrixAt(i, m.compose(p.set(b.x, b.y + b.h, b.z), q, s.set(b.w + (b.steeple ? 0.6 : 1.5), b.roofH ?? b.h * 0.5, b.d + (b.steeple ? 0.6 : 1))));
    const half = b.rot ? [b.d / 2, b.w / 2] : [b.w / 2, b.d / 2];
    world.buildings.push({ minX: b.x - half[0], minZ: b.z - half[1], maxX: b.x + half[0], maxZ: b.z + half[1], h: b.y + b.h, barn: true, drowned: true });
  });
  // The woods round the water (trunks stop the truck; crowns block the camera's view).
  const { trees } = layout, greens = [0x24381f, 0x2c4424, 0x1f3019, 0x34502a, 0x2a3b1c];
  const trunk = new THREE.InstancedMesh(kit.trunkShape, kit.trunk, trees.length);
  const crown = new THREE.InstancedMesh(kit.crownShape, kit.crown, trees.length);
  trees.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rot);
    trunk.setMatrixAt(i, m.compose(p.set(t.x, 0, t.z), q, s.set(t.sc, t.sc, t.sc)));
    crown.setMatrixAt(i, m.compose(p.set(t.x, 0, t.z), q, s.set(t.sc, t.sc * t.tall, t.sc)));
    crown.setColorAt(i, new THREE.Color(greens[t.green]));
    world.collision.addCircle(t.x, t.z, 0.6 * t.sc, { tag: 'tree', blocksSight: true, sightR: 2.6 * t.sc });
    world.trees.push([t.x, t.z, t.sc]);
  });
  // Fieldstone: the dam (tall, across the lake's south end) and the low walls round the
  // region's other three sides.
  const { minX, maxX, minZ, maxZ } = LOCH;
  const walls = [[minX, minZ, maxX, minZ, 1, 1], [maxX, minZ, maxX, maxZ, 1, 1], [minX, maxZ, maxX, maxZ, 1, 1]];
  const stone = new THREE.InstancedMesh(kit.wallShape, kit.stone, walls.length + 1);
  walls.forEach(([x0, z0, x1, z1], i) => {
    stone.setMatrixAt(i, m.compose(p.set((x0 + x1) / 2, 0, (z0 + z1) / 2), q.identity(), s.set(Math.max(1, Math.abs(x1 - x0)), 1, Math.max(1, Math.abs(z1 - z0)))));
  });
  const dl = Math.hypot(DAM.bx - DAM.ax, DAM.bz - DAM.az), da = Math.atan2(DAM.bz - DAM.az, DAM.bx - DAM.ax);
  q.setFromAxisAngle(up, -da);
  stone.setMatrixAt(walls.length, m.compose(p.set((DAM.ax + DAM.bx) / 2, 0, (DAM.az + DAM.bz) / 2), q, s.set(dl, DAM.h / 1.2, DAM.w)));
  world.collision.addCapsule(DAM.ax, DAM.az, DAM.bx, DAM.bz, DAM.w / 2, { tag: 'dam', blocksSight: true });
  // The shore: the truck stops at the water's edge (wide enough that nothing tunnels through
  // at speed).
  for (let i = 0; i < LAKE.length; i++) {
    const [ax, az] = LAKE[i], [bx, bz] = LAKE[(i + 1) % LAKE.length];
    world.collision.addCapsule(ax, az, bx, bz, 3, { tag: 'shore' });
  }
  for (const im of [body, roof, trunk, crown, stone]) { im.instanceMatrix.needsUpdate = true; group.add(im); }
  body.instanceColor.needsUpdate = true;
  crown.instanceColor.needsUpdate = true;
  // Drivable: the region, and a strip through each gap overlapping the county's zone and the
  // region's, which starts a few metres east of the wall so nothing skips from one to the
  // other in a single step.
  world.collision.addZone(minX + 6, minZ, maxX, maxZ);
  for (const z of world.lochGaps) world.collision.addZone(minX - 15, z - 8, minX + 30, z + 8);
  // A lamp at the Warren landing (one of the lamp pool's spots; the real lights hop to it).
  world.extraLights.push({ x: LOCH_NODES.R2[0] + 6, z: LOCH_NODES.R2[1] - 7, tx: -1, tz: 0, pole: true });
  world.scene.add(group);
  world.lochGroup = group;
  world.loch = { ...LOCH, lake: LAKE, dam: DAM, mill: MILL, warren: WARREN };
  return group;
}

// The road edges the region adds (after the county's own), for the ribbon and the fields,
// and where they cross the east wall (`world.lochGaps`: z at x = LOCH.minX).
export function addLochRoads(world, ids) {
  const nodes = world.roads.nodes;
  for (const [k, [x, z]] of Object.entries(LOCH_NODES)) {
    ids[k] = world.roads.addNode(x, z, 'county');
    nodes[ids[k]].region = 'loch';
  }
  const edges = LOCH_LINKS.map(([a, b]) => {
    world.roads.link(ids[a], ids[b]);
    return [nodes[ids[a]], nodes[ids[b]], ROAD_W];
  });
  world.lochGaps = edges.filter(([a, b]) => (a.x - LOCH.minX) * (b.x - LOCH.minX) < 0)
    .map(([a, b]) => a.z + ((b.z - a.z) * (LOCH.minX - a.x)) / (b.x - a.x));
  return edges;
}

function segDist(x, z, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l)) : 0;
  return Math.hypot(x - ax - ex * t, z - az - ez * t);
}
