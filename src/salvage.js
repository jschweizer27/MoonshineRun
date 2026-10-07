import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { KINDS } from './trunk.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';

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
    if (id > a.id && a.tag === 'county' && b.tag === 'county') edges.push([a, b]);
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

export const isNight = (hour) => hour >= S.night[0] || hour < S.night[1];

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

// The sites in the world: one instanced heap each (crates, a barrel, a plank), tinted by
// kind, sunk low once worked; a collider at the heap. `state` is the save's
// { [id]: day worked } (dredgecareer `data.sites`).
export class Salvage {
  constructor(scene, world, seed = 1) {
    this.sites = placeSites(world, seed);
    this.state = {};
    for (const s of this.sites) world.collision.addCircle(s.x, s.z, 1.8, { tag: 'salvage' });
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

  // 'ok' to work, 'empty' (worked, not back yet) or 'day' (a night-only site, by day).
  status(site, day, hour) {
    if (day < this.refillDay(site)) return 'empty';
    if (site.night && !isNight(hour)) return 'day';
    return 'ok';
  }

  worked(site, day) { this.state[site.id] = day; }

  // The site whose stop point the truck is inside, or null.
  at(p) {
    return this.sites.find((s) => Math.hypot(s.stopX - p.x, s.stopZ - p.z) < S.radius) || null;
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

  // Heaps of worked sites sink low and darken until they refill.
  refresh(day) {
    const o = new THREE.Object3D(), dim = new THREE.Color();
    this.sites.forEach((s, i) => {
      const empty = day < this.refillDay(s);
      o.position.set(s.x, empty ? -0.6 : 0, s.z);
      o.rotation.set(0, (i * 2.399) % TAU, 0);
      o.scale.set(1, empty ? 0.5 : 1, 1);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
      this.mesh.setColorAt(i, empty ? dim.copy(this._colors[i]).multiplyScalar(0.45) : this._colors[i]);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
