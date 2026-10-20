/* global window */
// The robot's driving (scripts/playthrough.mjs): the radar's own router (roadgraph.js, the
// road graph's shortest path around closed roads) and pure pursuit, as in
// scripts/economy.mjs. It drives the real truck with the real inputs: no teleporting, except
// when it's stalled on the same goal three times (a finding, so one bug doesn't hide the
// rest). Runs in the page.
import { RoadGraph } from '../../src/roadgraph.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const LANE = 1.4;                       // metres right of the road's middle (traffic keeps 2.2: config traffic.lane)
const PASS = 2;                         // metres out to the side when passing (right of the line: +): a cart on the shoulder clears by 4, a narrow county road's wall too

export class Pilot {
  constructor(g, report) {
    this.g = g;
    this.report = report;         // (kind, text, data) -> a finding
    this.way = [];
    this.goal = null;
    this.stuckT = 0;
    this.revT = 0;
    this.stalls = 0;
    this.stats = { metres: 0, seconds: 0, stalls: 0, unstuck: 0 };
  }

  // Head for `t` ({ x, z }) and pull up within `near` metres. `avoid`: points to route
  // round (the York Road checkpoint at night with shine aboard).
  go(t, { near = 5, avoid = [], why = '' } = {}) {
    if (this.goal && Math.hypot(this.goal.x - t.x, this.goal.z - t.z) < 1 && this.way.length) { this.goal.near = near; return; }
    const g = this.g, R = g.world.roads, p = g.player.position;
    const a = g.world.nearestNode(p.x, p.z).id, b = g.world.nearestNode(t.x, t.z).id;
    const blocked = new Set(g.roadEvents.blocked);
    for (const q of avoid) {
      for (const n of R.nodes) {
        if (Math.hypot(n.x - q.x, n.z - q.z) > (q.r || 30)) continue;
        for (const l of n.links) blocked.add(RoadGraph.edgeKey(n.id, l));
      }
    }
    const ids = R.path(a, b, blocked) || R.path(a, b, g.roadEvents.blocked) || R.path(a, b) || [];
    this.way = [...ids.map((i) => R.nodes[i]), { x: t.x, z: t.z }];
    if (!this.goal || Math.hypot(this.goal.x - t.x, this.goal.z - t.z) > 1) this.stalls = 0;
    this.goal = { x: t.x, z: t.z, near, why };
  }

  stop() { this.way = []; this.goal = null; }

  get dist() { const p = this.g.player.position; return this.goal ? Math.hypot(this.goal.x - p.x, this.goal.z - p.z) : Infinity; }

  // Pulled up at the goal: inside `near`, nearly stopped (the game's stops want under 3 m/s).
  get arrived() { return !!this.goal && this.dist <= this.goal.near && Math.abs(this.g.player.speed) < 0.6; }

  // One step's input toward the goal (none: brake and wait). A careful driver: a cruising
  // speed (lower with fragile cargo aboard), slowing for the turn ahead and the stop.
  input(dt, cruise = 16) {
    const g = this.g, v = g.player, p = v.position, speed = Math.abs(v.speed);
    if (!this.goal) return { throttle: speed > 0.3 ? -Math.sign(v.speed) : 0, steer: 0 };
    while (this.way.length > 1 && Math.hypot(this.way[0].x - p.x, this.way[0].z - p.z) < 7) this.way.shift();
    const wp = this.way[0] || this.goal, d = this.dist, dWp = Math.hypot(wp.x - p.x, wp.z - p.z);
    // Traffic ahead (scanned before the line is picked): ease off behind a moving car, steer
    // round a slow, stopped or parked one (no ramming).
    const fx = Math.sin(v.heading), fz = -Math.cos(v.heading);
    let block = null;
    for (const c of g.traffic.cars) {
      if (!c.on) continue;
      const dx = c.position.x - p.x, dz = c.position.z - p.z, ahead = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (!c.parked && Math.cos(c.heading - v.heading) < -0.5 && Math.abs(side) > 1.2) continue;   // (oncoming, in its own lane)
      const wide = c.parked ? 2.6 : 3.2;
      if (ahead > 0 && ahead < 10 + speed && Math.abs(side) < wide && (!block || ahead < block.ahead)) block = { ahead, side, speed: c.parked ? 0 : Math.abs(c.speed) };
    }
    if (block && block.speed < 4) { this.passT = 2; this.passSide = block.side > 0 ? 1 : -1; }
    // The Bureau's cars (and Vail's): swerved round, not slowed for (a head-on with one is the
    // crash that splits the trunk's floor).
    for (const u of g.police.active) {
      const dx = u.car.position.x - p.x, dz = u.car.position.z - p.z, ahead = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (ahead > 0 && ahead < 18 + speed && Math.abs(side) < 4) { this.passT = Math.max(this.passT || 0, 1.2); this.passSide = side > 0 ? 1 : -1; }
    }
    // The line: the right-hand lane, as the traffic keeps (on the crown, oncoming carts stop
    // for the truck); passing, out to the side away from the slow one; the last stretch to the
    // goal straight in.
    let aim = wp;
    const lateral = this.passT > 0 ? this.passSide * PASS : this.way.length > 1 && d > 25 ? LANE : 0;
    if (lateral) {
      const h = Math.atan2(wp.x - p.x, -(wp.z - p.z));
      aim = { x: wp.x + Math.cos(h) * lateral, z: wp.z + Math.sin(h) * lateral };
    }
    const want = Math.atan2(aim.x - p.x, -(aim.z - p.z)), err = wrap(want - v.heading);
    let target = cruise;
    if (this.way.length > 1) {
      const b = this.way[1], turn = Math.abs(wrap(Math.atan2(b.x - wp.x, -(b.z - wp.z)) - want));
      if (turn > 0.45 && dWp < 35) target = Math.min(target, turn > 1.2 ? 5 : 8);
    }
    if (Math.abs(err) > 0.5) target = Math.min(target, 5);
    if (block) target = Math.min(target, this.passT > 0 ? 5 : Math.max(0, block.speed - 1, block.ahead > 7 ? 3 : 0));
    this.passT = Math.max(0, (this.passT || 0) - dt);
    if (this.way.length <= 1 && d < 40) target = Math.min(target, Math.max(2.5, d / 4));
    let thr = speed < target ? 1 : speed > target + 1.5 ? -0.7 : 0.15;
    if (d <= this.goal.near) thr = speed > 0.4 ? -Math.sign(v.speed) : 0;
    // Stalled (a wall, a parked car, the lake): back off, then try again; three times on the
    // same goal and it's carried past the snag.
    if (speed < 1 && d > this.goal.near + 2) this.stuckT += block ? dt / 4 : dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 2.5) {
      this.stuckT = 0; this.revT = 1.1; this.stats.stalls++;
      if (++this.stalls >= 3) {
        const next = this.way.find((n) => Math.hypot(n.x - p.x, n.z - p.z) > 12) || this.goal;
        // (what was in the way: the nearest vehicle, and how far off the line Otto was)
        const car = g.traffic.cars.filter((c) => c.on).map((c) => ({ m: Math.round(Math.hypot(c.position.x - p.x, c.position.z - p.z)), parked: !!c.parked, speed: +Math.abs(c.speed).toFixed(1) })).sort((a, b) => a.m - b.m)[0] || null;
        this.report('STALL', `Stalled three times on the way to ${this.goal.why || 'a goal'}; carried on to the next road node`, { at: [Math.round(p.x), Math.round(p.z)], goal: [Math.round(this.goal.x), Math.round(this.goal.z)], car, err: +err.toFixed(2), block: !!block });
        window.shine.teleport(next.x, next.z, want);
        this.stats.unstuck++;
        this.stalls = 0;
      } else this.go({ x: this.goal.x, z: this.goal.z }, { near: this.goal.near, why: this.goal.why });
    }
    if (this.revT > 0) { this.revT -= dt; return { throttle: -1, steer: -Math.max(-1, Math.min(1, err * 2)) }; }
    return { throttle: thr, steer: Math.max(-1, Math.min(1, err * 2.2)) };
  }

  // A chase: head for the road node, 150-450 m off, farthest from every car after Otto
  // (re-picked every few seconds by the brain).
  flee() {
    const g = this.g, p = g.player.position, cars = g.police.active.filter((u) => u.mode === 'chase' || u.mode === 'search').map((u) => u.car.position);
    let best = null, score = -Infinity;
    for (const n of g.world.roads.nodes) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < 150 || d > 450 || n.tag === 'lane') continue;
      const s = cars.length ? Math.min(...cars.map((c) => Math.hypot(n.x - c.x, n.z - c.z))) : d;
      if (s > score) { score = s; best = n; }
    }
    if (best) this.go(best, { near: 8, why: 'getting away' });
  }

  // Track distance driven (for the report's minutes per chapter).
  tick(dt) {
    const v = this.g.player;
    this.stats.seconds += dt;
    this.stats.metres += Math.abs(v.speed) * dt;
  }
}
