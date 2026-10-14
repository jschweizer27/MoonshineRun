import { createRng } from './rng.js';

// Towson, the county seat (chapter 6 on, docs/EXPANSION.md Act II): a small town south of
// Loch Raven, east of the county wall, reached by the road out of Loch Raven's R4 (so no new
// road crosses the county's land and nothing seeded there moves). Main Street runs north and
// south past the courthouse green, with two cross streets; the Towson National Bank stands
// across from the green, Ruby Dalton's Courthouse Tavern and the market house on the corners.
// county.js builds it in the county's own instanced meshes (its buildings with the barns and
// villages, its trees with the woods, its walls with the county's), so it costs no draw call
// of its own. The layout is fixed numbers plus its own random stream (shop sizes, colours),
// so nothing else moves.
export const TOWSON = { minX: 470, maxX: 760, minZ: -500, maxZ: -270 };
// Road nodes, tagged 'county' and marked `region: 'towson'` (salvage sites and road events
// keep to the county's own roads). R4 is Loch Raven's: the road comes in from there.
export const TOWSON_NODES = {
  T1: [600, -480], T2: [600, -410], T3: [600, -340], T4: [600, -290],
  W1: [510, -410], W2: [710, -410], C1: [520, -340], C2: [700, -340],
};
export const TOWSON_LINKS = [
  ['R4', 'T1'], ['T1', 'T2'], ['T2', 'T3'], ['T3', 'T4'], ['W1', 'T2'], ['T2', 'W2'], ['C1', 'T3'], ['T3', 'C2'], ['W1', 'C1'], ['W2', 'C2'],
];
// The places: the courthouse on its green (its steps on Main Street, where the copy is
// filed), the bank across the street (its records room round the back, chapter 6's story
// site), Ruby Dalton's tavern (her door, where her orders go) and the market house.
export const COURTHOUSE = { x: 655, z: -375, w: 34, d: 22, h: 14 };
export const BANK = { x: 560, z: -375, w: 26, d: 20, h: 12 };
export const TAVERN = { x: 632, z: -446, w: 14, d: 12, h: 7 };
export const MARKET_HOUSE = { x: 662, z: -317, w: 24, d: 14, h: 8 };
export const PLACES = {
  courthouse: { x: 608, z: -375, place: 'the Towson courthouse' },
  tavern: { x: 608, z: -446, name: 'Courthouse Tavern', who: 'dalton' },
  records: { x: 532, z: -380 },
  bankfront: { x: 593, z: -375, place: 'the Towson National Bank' },
};
const ROAD_W = 10;
// Where the road in crosses Loch Raven's south wall (z = -515) and the town's north wall.
const GATE_X = 591;

// The fixed buildings and what the town's own random stream sizes: shops along Main Street,
// facing it, clear of the crossings, the green and the big buildings. Each is a county.js
// building ({ x, z, w, h, d, rot, fx, fz, color, house }); `deco` pieces (the courthouse's
// cupola) stand on another (`y`) and have no collider. Plus the green's trees and the lamps.
export function towsonLayout(seed = 0, roads = []) {
  const rng = createRng((seed ^ 0x70750e) >>> 0);
  const out = [];
  // A building fronting Main Street (x = 600; turned, so `w` runs along z and `d` along x)
  // or, `toward` 'z', the cross street north of it.
  const face = (x, z, w, d, h, color, toward = 'x') => {
    const fx = toward === 'x' ? Math.sign(600 - x) : 0, fz = toward === 'z' ? -1 : 0;
    out.push({ x, z, w, d, h, rot: toward === 'x' ? Math.PI / 2 : 0, fx, fz, color, house: true });
  };
  face(COURTHOUSE.x, COURTHOUSE.z, COURTHOUSE.d, COURTHOUSE.w, COURTHOUSE.h, 0xd8d2c4);
  out.push({ x: COURTHOUSE.x, z: COURTHOUSE.z, y: COURTHOUSE.h, w: 6, d: 6, h: 7, rot: 0, fx: 0, fz: 0, color: 0xe8e2d4, house: true, deco: true });
  face(BANK.x, BANK.z, BANK.d, BANK.w, BANK.h, 0x8a8a84);
  face(TAVERN.x, TAVERN.z, TAVERN.d, TAVERN.w, TAVERN.h, 0x8a3b2e);
  face(MARKET_HOUSE.x, MARKET_HOUSE.z, MARKET_HOUSE.w, MARKET_HOUSE.d, MARKET_HOUSE.h, 0xc9bfa6, 'z');
  const COLORS = [0xd8d2c4, 0xc9bfa6, 0x8a3b2e, 0x5f6a72, 0x6b6e52, 0xb8a684, 0x7a4a3a];
  const taken = (x, z, r) => out.some((b) => !b.deco && Math.hypot(x - b.x, z - b.z) < r + Math.hypot(b.w, b.d) / 2)
    || roads.some(([a, b, w]) => segDist(x, z, a.x, a.z, b.x, b.z) < r + w / 2 + 1);
  for (let z = -470; z <= -295; z += 17) {
    for (const side of [-1, 1]) {
      // `w` along the street, `d` deep, set back behind the pavement.
      const w = 9 + rng() * 4, d = 10 + rng() * 4, h = 5 + rng() * 4, color = COLORS[Math.floor(rng() * COLORS.length)];
      const x = 600 + side * (ROAD_W / 2 + 4 + d / 2);
      if (rng() < 0.15 || taken(x, z, Math.hypot(w, d) / 2)) continue;
      face(x, z, w, d, h, color);
    }
  }
  // The courthouse green's trees, round the building.
  const trees = [];
  for (const [dx, dz] of [[-22, -18], [-22, 18], [24, -18], [24, 18], [0, -26], [0, 26], [-12, 24], [12, -24]]) {
    trees.push([COURTHOUSE.x + dx, COURTHOUSE.z + dz, 0.85 + rng() * 0.35, rng() * Math.PI * 2, 0.95 + rng() * 0.3, Math.floor(rng() * 5)]);
  }
  // Lamps on the corners of Main Street (spots for the lamp pool) and at the tavern door.
  const lamps = [[607, -403, 1, 0], [593, -347, -1, 0], [607, -333, 1, 0], [593, -473, -1, 0], [607, -452, 1, 0], [517, -405, 1, 0], [693, -347, -1, 0]];
  return { buildings: out, trees, lamps: lamps.map(([x, z, tx, tz]) => ({ x, z, tx, tz, pole: true })) };
}

// The road edges the town adds (after the county's and Loch Raven's), for the ribbon and the
// fields, and the town's nodes in the road graph.
export function addTowsonRoads(world, ids) {
  const nodes = world.roads.nodes;
  for (const [k, [x, z]] of Object.entries(TOWSON_NODES)) {
    ids[k] = world.roads.addNode(x, z, 'county');
    nodes[ids[k]].region = 'towson';
  }
  return TOWSON_LINKS.map(([a, b]) => {
    world.roads.link(ids[a], ids[b]);
    return [nodes[ids[a]], nodes[ids[b]], ROAD_W];
  });
}

// The town's low fieldstone walls (with the gate where the road comes in from Loch Raven),
// for the county's wall mesh, and Loch Raven's south wall's gap.
export function towsonWalls() {
  const { minX, maxX, minZ, maxZ } = TOWSON;
  return [[minX, minZ, GATE_X - 8, minZ], [GATE_X + 8, minZ, maxX, minZ], [minX, minZ, minX, maxZ], [maxX, minZ, maxX, maxZ], [minX, maxZ, maxX, maxZ]];
}
export const LOCH_GATE = { x: GATE_X, w: 8 };

// Drivable: the town, and a strip from Loch Raven's south edge through the gate.
export function addTowsonZones(world) {
  world.collision.addZone(TOWSON.minX + 6, TOWSON.minZ, TOWSON.maxX, TOWSON.maxZ);
  world.collision.addZone(GATE_X - 22, -535, GATE_X + 22, -480);
  world.towson = { ...TOWSON, ...PLACES, bank: BANK };
}

function segDist(x, z, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l)) : 0;
  return Math.hypot(x - ax - ex * t, z - az - ez * t);
}
