import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { KINDS } from './trunk.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RAILWAY, inWindow } from './railway.js';
import { MILL } from './loch.js';

// Salvage sites: where Otto finds things now (CONFIG.dredge.salvage). Wrecks in the ditch,
// abandoned farmhouses and rail sidings out in the county, back-alley cellars in the city,
// each worked with a short mini-game whose score sets what it gives up. Sites are fixed for
// a layout (their own random stream, so nothing else moves), drawn as one instanced heap,
// and refill a day or two after they're worked. The mini-games are pure state machines
// (new / step / press / score) that the salvage screen drives.
const S = CONFIG.dredge.salvage;
const TAU = Math.PI * 2;

// Where the sites go: beside the county roads (both ends real roads, not farm lanes) and on
// city sidewalks, clear of everything, apart from each other. The stop point is the road
// side of the heap. Rail sidings sit out west, near Glyndon's depot.
export function placeSites(world, seed = 1) {
  const rng = createRng((seed ^ 0x5a17a6e) >>> 0), c = world.collision, N = world.roads.nodes, out = [];
  const far = (x, z, d) => out.every((s) => Math.hypot(s.x - x, s.z - z) > d);
  const edges = [], all = [];
  for (const a of N) for (const id of a.links) {
    const b = N[id];
    if (id > a.id) all.push([a, b]);
    if (id > a.id && a.tag === 'county' && b.tag === 'county' && !a.region && !b.region) edges.push([a, b]);   // not Loch Raven's (loch.js)
  }
  // Clear of every road (the heap, not just its stop point, stays off the roadway).
  const offRoad = (x, z, d) => all.every(([a, b]) => {
    const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a.x - dx * t, z - a.z - dz * t) > d;
  });
  const cityClear = world.cfg.roadWidth / 2 + 1;     // on the sidewalk, off the roadway
  for (let tries = 0; out.length < S.count && tries < 4000; tries++) {
    const [a, b] = rng.pick(edges), t = rng.range(0.2, 0.8), side = rng() < 0.5 ? -1 : 1;
    const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    const off = rng.range(13, 17), x = a.x + (b.x - a.x) * t - uz * off * side, z = a.z + (b.z - a.z) * t + ux * off * side;
    if (!world.inCounty({ x, z }) || c.resolveCircle(x, z, 4).hit || !far(x, z, 70) || !offRoad(x, z, 9)) continue;
    // The way in from the road to the stop point is open (no fence or tree across it).
    const stopX = x + uz * 7 * side, stopZ = z - ux * 7 * side, rx = x + uz * off * side, rz = z - ux * off * side;
    if (![0.25, 0.5, 0.75, 1].every((f) => !c.resolveCircle(rx + (stopX - rx) * f, rz + (stopZ - rz) * f, 1.6).hit)) continue;
    const kind = x < -300 && rng() < 0.6 ? 'siding' : rng() < 0.55 ? 'farmhouse' : 'wreck';
    out.push({ kind, x, z, stopX, stopZ });
  }
  const lamps = world.lampSpots.filter((sp) => sp.pole && !world.inCounty(sp) && Math.abs(sp.x) < 230 && Math.abs(sp.z) < 230);
  for (let tries = 0; out.length < S.count + S.city && tries < 2000; tries++) {
    const sp = rng.pick(lamps), along = rng() < 0.5 ? -6 : 6;
    const x = sp.x + sp.tz * along, z = sp.z - sp.tx * along;   // along the sidewalk from the lamp
    const stopX = x + sp.tx * 4, stopZ = z + sp.tz * 4;
    if (c.resolveCircle(x, z, 1.2).hit || c.resolveCircle(stopX, stopZ, 1.6).hit || !far(x, z, 120) || !offRoad(x, z, cityClear)) continue;
    out.push({ kind: 'cellar', x, z, stopX, stopZ });
  }
  // A share of them can only be worked at night: the better ones, in the far county.
  const byDistance = [...out].sort((p, q) => Math.hypot(q.x, q.z) - Math.hypot(p.x, p.z));
  byDistance.slice(0, Math.round(out.length * S.nightShare)).forEach((s) => { s.night = true; });
  out.forEach((s, i) => { s.id = `site:${i}`; s.name = S.kinds[s.kind].name; });
  return out;
}

// The story sites (chapters.js), placed on their own (no random draws, so nothing else moves):
// the ruins of Braun & Sons on a sidewalk near the Highlandtown Speakeasy, the Harrow
// Stables office beside that barn, the guard's van at the Glyndon siding (railway.js), Moss
// Delaney's consignment by the Cockeysville quarry yard, Sheriff Hale's lockup, the drowned
// mill at Warren (loch.js), the Baltimore Sun downtown and Gus Kessler's cellar (the
// brewery). Each is the nearest clear spot to its anchor; the newer ones also keep clear of
// the regular sites (`regular`) and each other.
export function placeStory(world, regular = []) {
  const c = world.collision, out = [];
  const clear = (x, z, r) => !c.resolveCircle(x, z, r).hit;
  const apart = (x, z, d = 20) => [...regular, ...out].every((s) => Math.hypot(s.x - x, s.z - z) > d);
  // A sidewalk spot by a lamp (like the cellars): the nearest to (ax, az) at least `from`
  // metres off it (off the corner itself).
  const sidewalk = (story, kind, ax, az, from, check = () => true) => {
    const near = world.lampSpots.filter((sp) => sp.pole && !world.inCounty(sp))
      .map((sp) => ({ sp, d: Math.hypot(sp.x - ax, sp.z - az) })).filter((e) => e.d > from).sort((a, b) => a.d - b.d);
    for (const { sp } of near) {
      const along = 6, x = sp.x + sp.tz * along, z = sp.z - sp.tx * along, stopX = x + sp.tx * 4, stopZ = z + sp.tz * 4;
      if (clear(x, z, 1.2) && clear(stopX, stopZ, 1.6) && check(x, z)) { out.push({ kind, story, x, z, stopX, stopZ }); return; }
    }
  };
  // Out in the county: the nearest clear spot to (ax, az), its stop `toward` (dx, dz) 6 m
  // off, with a clear way between.
  const field = (story, kind, ax, az, [dx, dz], check = () => true) => {
    for (let r = 0; r <= 24; r += 3) {
      for (let k = 0; k < (r ? 16 : 1); k++) {
        const a = (k / 16) * Math.PI * 2, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r, stopX = x + dx * 6, stopZ = z + dz * 6;
        if (clear(x, z, 2.2) && clear(stopX, stopZ, 1.8) && clear((x + stopX) / 2, (z + stopZ) / 2, 1.6) && apart(x, z) && check(x, z)) { out.push({ kind, story, x, z, stopX, stopZ }); return; }
      }
    }
  };
  // The ruins: near (176, 44), not on the corner, and clear of the city's cellars.
  sidewalk('ruins', 'ruins', 176, 44, 18, (x, z) => apart(x, z));
  // The office: beside the Harrow Stables barn, its stop in the yard.
  const harrow = world.barns.find((b) => b.name === 'Harrow Stables');
  if (harrow) {
    found: for (const r of [9, 12, 15]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, x = harrow.stopX + Math.cos(a) * r, z = harrow.stopZ + Math.sin(a) * r;
        const stopX = harrow.stopX + Math.cos(a) * (r - 6), stopZ = harrow.stopZ + Math.sin(a) * (r - 6);
        if (clear(x, z, 2) && clear(stopX, stopZ, 1.6) && apart(x, z)) { out.push({ kind: 'office', story: 'office', x, z, stopX, stopZ }); break found; }
      }
    }
  }
  // Chapter 3: the guard's van, at the freight's south end (the stop away from the train).
  field('van', 'waybills', RAILWAY.van.x, RAILWAY.van.z, [1, 0], (x) => x > RAILWAY.siding.x + 6);
  // Chapter 4: Delaney's consignment on the quarry yard's north side, clear of the store's
  // ring; the Sheriff's report round the back of his lockup, clear of where his orders go.
  const town = (x, z) => Math.hypot(x - 400, z + 650) > 26;
  field('quarry', 'consignment', 428, -674, [-1, 0], town);
  if (world.lockup) field('lockup', 'report', 418, -628, [-1, 0], (x, z) => town(x, z) && Math.hypot(x - world.lockup.x, z - world.lockup.z) > 20);
  // Chapter 5: the mill by the Warren landing on Loch Raven.
  field('mill', 'mill', MILL.x, MILL.z, [-0.77, 0.63]);
  // The paper: the Sun's office on Charles Street by the harbour, away from the speakeasies.
  sidewalk('sun', 'sun', 0, 205, 10, (x, z) => apart(x, z) && world.drops.every((d) => Math.hypot(d.x - x, d.z - z) > 40));
  // Chapter 5 on: Gus's cellar, the brewery, along the street from his speakeasy.
  const B = CONFIG.dredge.story.brewery;
  sidewalk('brewery', 'brewery', B.x, B.z, 25, (x, z) => apart(x, z) && world.drops.every((d) => Math.hypot(d.x - x, d.z - z) > 20));
  out.forEach((s) => { s.id = `story:${s.story}`; s.name = S.kinds[s.kind].name; });
  return out;
}

export const isNight = (hour) => hour >= S.night[0] || hour < S.night[1];
export { inWindow };

// ---------- Pry: a needle sweeps the ring; press while it's in a green arc. ----------
export function newPry(rng = Math.random) {
  const P = S.pry, arcs = [];
  for (let k = 0; k < P.arcs; k++) arcs.push({ a: (k / P.arcs) * TAU + 0.9 + rng() * (TAU / P.arcs - 1.2), w: P.arcWidth, hit: false });
  return { game: 'pry', arcs, angle: 0, dir: 1, speed: P.speed, t: 0, strikes: 0, done: false };
}

export function stepPry(g, dt) {
  if (g.done) return g;
  g.t += dt;
  g.angle = (((g.angle + g.dir * g.speed * dt) % TAU) + TAU) % TAU;
  if (g.t >= S.pry.seconds) g.done = true;
  return g;
}

const inArc = (angle, arc) => Math.abs(Math.atan2(Math.sin(angle - arc.a), Math.cos(angle - arc.a))) <= arc.w / 2;

// A press: a hit marks the arc, turns the needle back and speeds it up; a miss is a strike.
export function pressPry(g) {
  if (g.done) return false;
  const arc = g.arcs.find((a) => !a.hit && inArc(g.angle, a));
  if (arc) { arc.hit = true; g.dir = -g.dir; g.speed += S.pry.speedUp; }
  else g.strikes++;
  if (g.arcs.every((a) => a.hit) || g.strikes >= S.pry.strikes) g.done = true;
  return !!arc;
}

export const pryScore = (g) => Math.max(0, g.arcs.filter((a) => a.hit).length / g.arcs.length - 0.15 * g.strikes);

// ---------- Search: remember where the goods glinted, then pick before the lamp dies. ----------
export function newSearch(rng = Math.random) {
  const P = S.search, spots = Array.from({ length: P.spots }, () => ({ good: false, picked: false }));
  for (let k = 0; k < P.goods;) { const s = spots[Math.floor(rng() * P.spots)]; if (!s.good) { s.good = true; k++; } }
  return { game: 'search', spots, t: 0, picks: 0, found: 0, done: false };
}

// Glinting first (no picking yet), then the lamp burns down.
export const searchGlint = (g) => g.t < S.search.glint;

export function stepSearch(g, dt) {
  if (g.done) return g;
  g.t += dt;
  if (g.t >= S.search.glint + S.search.seconds) g.done = true;
  return g;
}

export function pickSearch(g, i) {
  const s = g.spots[i];
  if (g.done || searchGlint(g) || !s || s.picked) return null;
  s.picked = true;
  g.picks++;
  if (s.good) g.found++;
  if (g.picks >= S.search.picks) g.done = true;
  return s.good;
}

export const searchScore = (g) => g.found / S.search.picks;

export const score = (g) => (g.game === 'pry' ? pryScore(g) : searchScore(g));

// What a worked site gives up: 1-3 pieces by the score, drawn from the site kind's goods,
// leaning toward the valuable ones the better you did.
export function payout(kind, sc, rng = Math.random) {
  const n = sc >= 0.85 ? 3 : sc >= 0.5 ? 2 : sc > 0.01 ? 1 : 0;
  const yields = Object.entries(S.kinds[kind].yields);
  const top = Math.max(...yields.map(([id]) => KINDS[id].value));
  const out = [];
  for (let k = 0; k < n; k++) {
    const weights = yields.map(([id, w]) => w * (1 + sc * 6 * (KINDS[id].value / top) ** 2));
    let r = rng() * weights.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= weights[i]) > 0 && i < weights.length - 1) i++;
    out.push(yields[i][0]);
  }
  return out;
}

// A rare find at a night site worked well (CONFIG.dredge.salvage.rare): the pocket watch or
// the bonds, or null. Rolled from the site and the day, so it's the same for everyone.
export function rareFind(site, day, sc) {
  if (!site.night || site.story || sc < S.rare.score) return null;
  let h = 2166136261;
  for (const c of `rare:${site.id}:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  const r = (h >>> 0) / 4294967296;
  if (r >= S.rare.chance) return null;
  const rares = CONFIG.dredge.loot.kinds.filter((k) => k.rare);
  return rares[Math.floor((r / S.rare.chance) * rares.length)].id;
}

// The sites in the world: one instanced heap each (crates, a barrel, a plank), tinted by
// kind, sunk low once worked; a collider at the heap (a story site's only while it's open,
// so a hidden one blocks nothing). `state` is the save's { [id]: day worked } (dredgecareer
// `data.sites`).
export class Salvage {
  constructor(scene, world, seed = 1) {
    const regular = placeSites(world, seed);
    this.sites = [...regular, ...placeStory(world, regular)];
    this.world = world;
    this.state = {};
    this.story = {};        // the story sites open now: { [story]: { night, window } } (chapters.js openSites)
    this._colliders = new Map();
    for (const s of regular) world.collision.addCircle(s.x, s.z, 1.8, { tag: 'salvage' });
    const parts = [
      new THREE.BoxGeometry(1.4, 1.1, 1.2).translate(-0.6, 0.55, 0.2),
      new THREE.BoxGeometry(1.0, 0.8, 1.0).rotateY(0.5).translate(0.7, 0.4, -0.4),
      new THREE.BoxGeometry(0.8, 0.6, 0.8).rotateY(0.2).translate(-0.4, 1.4, 0.1),
      new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10).translate(0.9, 0.55, 0.7),
      new THREE.BoxGeometry(2.6, 0.1, 0.3).rotateZ(0.5).translate(0.1, 0.9, -0.9),
    ];
    const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    this.material = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.sites.length);
    this.mesh.name = 'salvage';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this._colors = this.sites.map((s) => new THREE.Color(S.kinds[s.kind].color));
    this.sites.forEach((s, i) => this.mesh.setColorAt(i, this._colors[i]));
    scene.add(this.mesh);
    this.refresh(0);
  }

  // When a worked site is back: 1-2 days on, the same for everyone (rolled from its id).
  refillDay(site) {
    const d = this.state[site.id];
    if (d == null) return -Infinity;
    let h = 0;
    for (const ch of site.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return d + S.refillDays[0] + (h % (S.refillDays[1] - S.refillDays[0] + 1));
  }

  // 'ok' to work, 'empty' (worked, not back yet) or 'day' (a night-only site, by day); a
  // story site is 'hidden' until its step opens it, and 'closed' outside its hours.
  status(site, day, hour) {
    if (site.story) {
      const open = this.story[site.story];
      if (!open) return 'hidden';
      if (open.window && !inWindow(hour, open.window)) return 'closed';
      return open.night && !isNight(hour) ? 'day' : 'ok';
    }
    if (day < this.refillDay(site)) return 'empty';
    if (site.night && !isNight(hour)) return 'day';
    return 'ok';
  }

  worked(site, day) { this.state[site.id] = day; }

  // The site whose stop point the truck is inside, or null: an open story site first, if
  // one's stop overlaps a regular site's.
  at(p) {
    const inside = (s) => Math.hypot(s.stopX - p.x, s.stopZ - p.z) < S.radius;
    return this.sites.find((s) => s.story && this.story[s.story] && inside(s)) || this.sites.find((s) => !s.story && inside(s)) || null;
  }

  // The nearest site (to `p`) that can be worked now, within `range`.
  nearest(p, day, hour, range = Infinity) {
    let best = null, bd = range;
    for (const s of this.sites) {
      if (this.status(s, day, hour) !== 'ok') continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // Heaps of worked sites sink low and darken until they refill; a story site shows (and
  // blocks the way) only while open.
  refresh(day) {
    const o = new THREE.Object3D(), dim = new THREE.Color(), c = this.world.collision;
    this.sites.forEach((s, i) => {
      const empty = !s.story && day < this.refillDay(s), hidden = s.story && !this.story[s.story];
      if (s.story && hidden && this._colliders.has(s.id)) { c.remove(this._colliders.get(s.id)); this._colliders.delete(s.id); }
      if (s.story && !hidden && !this._colliders.has(s.id)) this._colliders.set(s.id, c.addCircle(s.x, s.z, 1.8, { tag: 'salvage' }));
      o.position.set(s.x, empty ? -0.6 : 0, s.z);
      o.rotation.set(0, (i * 2.399) % TAU, 0);
      o.scale.set(hidden ? 0 : 1, hidden ? 0 : empty ? 0.5 : 1, hidden ? 0 : 1);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
      this.mesh.setColorAt(i, empty ? dim.copy(this._colors[i]).multiplyScalar(0.45) : this._colors[i]);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
