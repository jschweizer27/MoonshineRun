import { CONFIG } from './config.js';
import { RoadGraph } from './roadgraph.js';

// Road events: now and then something happens on the roads for a few game hours, rolled
// from the in-game clock in slots of `hours`, starting `offset` hours after midnight (the
// same for everyone, like the market events). Each lasts the first `lasts` share of its slot.
//   - washout: heavy rain washes out a valley road (only when it's raining);
//   - breakdown: a farm cart breaks down across a valley road;
//   - fog: a fog bank rolls over the valley;
//   - marketday: a town's market day, when it pays `marketDay` x for everything (kept in
//     the saved market state, so prices and the market screen see it).
// A blocked road is closed three ways: to the radar's route and the traffic (`blocked`,
// edge keys), by a capsule collider across it, and by a stuck cart (a traffic vehicle
// parked across it), which is its look. Nothing is built; main.js shows the toasts and
// the radar mark.
const E = CONFIG.dredge.roadEvents;

function roll(salt, n) {
  let h = 2166136261;
  for (const c of `road:${salt}:${n}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class RoadEvents {
  constructor(world, traffic) {
    this.world = world;
    this.traffic = traffic;
    this.active = null;             // { type, slot, until, text, x, z, edge?, town?, car?, wall? }
    this.blocked = traffic.blocked; // edge keys closed to the route and the traffic
    this._slot = -1;
    // The valley roads an event can block: links between two county nodes that both join
    // other roads (not the farm lanes, which are dead ends, nor the city's streets).
    const N = world.roads.nodes;
    this.edges = [];
    for (const a of N) for (const id of a.links) {
      const b = N[id];
      if (id > a.id && a.tag !== 'city' && b.tag !== 'city' && a.links.length > 1 && b.links.length > 1 && world.inCounty(a) && world.inCounty(b)) this.edges.push([a, b]);
    }
  }

  // The event in a time slot, or null: a roll for whether anything happens, then which.
  static pick(slot, raining) {
    if (slot < 1 || roll('any', slot) > E.chance) return null;
    const types = raining ? ['washout', 'breakdown', 'fog', 'marketday'] : ['breakdown', 'fog', 'marketday'];
    return types[Math.floor(roll('type', slot) * types.length)];
  }

  // Each step: end the event that's run its course; at a new slot, start its event (if
  // its time hasn't already passed, e.g. a reload late in the slot). Returns
  // { what: 'start' | 'end', ev } for main to announce, or null.
  update(clock, env, market) {
    if (this.active && clock >= this.active.until) { const ev = this.active; this.end(market); return { what: 'end', ev }; }
    const slot = Math.floor((clock - E.offset) / E.hours);
    if (slot === this._slot) return null;
    this._slot = slot;
    if (this.active) return null;
    const type = RoadEvents.pick(slot, env.weather === 'rain');
    const until = (slot + E.lasts) * E.hours + E.offset;
    if (!type || clock >= until) return null;
    return { what: 'start', ev: this.start(type, slot, until, env, market) };
  }

  start(type, slot, until, env, market) {
    this.end(market);
    const ev = { type, slot, until };
    if (type === 'washout' || type === 'breakdown') {
      const [a, b] = this.edges[Math.floor(roll('edge', slot) * this.edges.length)];
      ev.edge = RoadGraph.edgeKey(a.id, b.id);
      ev.x = (a.x + b.x) / 2; ev.z = (a.z + b.z) / 2;
      this.blocked.add(ev.edge);
      // A barrier across the road (wider than it), under the cart.
      const len = Math.hypot(b.x - a.x, b.z - a.z), px = -(b.z - a.z) / len, pz = (b.x - a.x) / len, half = E.span / 2;
      ev.wall = this.world.collision.addCapsule(ev.x - px * half, ev.z - pz * half, ev.x + px * half, ev.z + pz * half, 0.8, { tag: 'roadblock' });
      ev.car = this.traffic.park(a.id, b.id, 'cart');
      const near = this._landmark(ev.x, ev.z);
      ev.text = type === 'washout'
        ? `The rain has washed out the road near ${near}, and a cart's stuck in it. Go around`
        : `A farm cart's broken down across the road near ${near}. Go around`;
    } else if (type === 'fog') {
      env.setWeather('fog');
      ev.text = 'A fog bank is rolling over the valley. Mind the road out there';
    } else {
      const towns = CONFIG.dredge.towns, t = towns[Math.floor(roll('town', slot) * towns.length)];
      ev.town = t.id; ev.x = t.x; ev.z = t.z;
      if (market) market.marketDay = { town: t.id, until, mult: E.marketDay };
      ev.text = `Market day in ${t.town}: everything sells for ${Math.round((E.marketDay - 1) * 100)}% more there`;
    }
    this.active = ev;
    return ev;
  }

  end(market) {
    const ev = this.active;
    if (!ev) return;
    if (ev.edge) this.blocked.delete(ev.edge);
    if (ev.wall) this.world.collision.remove(ev.wall);
    if (ev.car) this.traffic.unpark(ev.car);
    if (ev.type === 'marketday' && market?.marketDay?.town === ev.town) delete market.marketDay;
    this.active = null;
  }

  // A new run: let go of the event; the next update starts it again if its time's not up.
  reset(market) {
    this.end(market);
    this._slot = -1;
  }

  // What closes when an event ends, for the toast.
  static endText(ev) {
    if (ev.type === 'fog') return 'The fog is lifting.';
    if (ev.type === 'marketday') return 'Market day is over.';
    return 'The road is clear again.';
  }

  _landmark(x, z) {
    let best = 'the valley', bd = Infinity;
    for (const p of [...this.world.barns, ...(this.world.villages || [])]) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p.name; }
    }
    return best;
  }
}
