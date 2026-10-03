import { CONFIG } from './config.js';
import { KINDS } from './trunk.js';

// Town markets: what a piece fetches, and selling out of the trunk.
// Pure logic. `state` is the saved market state: { sold: { 'town:kind': pieces }, clock }
// where `clock` counts in-game hours. A price is the kind's base value x the town's rate
// x a daily drift x a glut factor (selling lots of one kind in one town drives it down).
const M = CONFIG.dredge.market;

// A repeatable -1..1 for a town, kind and day.
function wobble(town, kind, day) {
  let h = 2166136261;
  for (const c of `${town}:${kind}:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

// A well-mixed 0..1 for a salt and day (FNV-1a, then a murmur3 finaliser: neighbouring
// days must land far apart, which plain FNV's high bits don't).
function roll(salt, day) {
  let h = 2166136261;
  for (const c of `event:${salt}:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function townById(id) { return CONFIG.dredge.towns.find((t) => t.id === id); }

// The in-game day a market state is on (the clock counts hours from the start).
export const dayOf = (state) => Math.floor((state.clock || 0) / 24);

// The day's market event: from day 1 on, one town pays a multiple for one kind of loot (a
// demand posted for the day). Rolled from the day number, so it's repeatable; day 0 (a new
// game) has none. Returns { town, townName, kind, kindName, mult } or null.
export function eventFor(day) {
  if (day < 1) return null;
  const towns = CONFIG.dredge.towns, kinds = CONFIG.dredge.loot.kinds.filter((k) => !k.rare);
  const pick = (list, salt) => list[Math.floor(roll(salt, day) * list.length)];
  const town = pick(towns, 'town'), kind = pick(kinds, 'kind');
  return { town: town.id, townName: town.town, kind: kind.id, kindName: kind.name, mult: M.event.multiplier };
}

// How the day's event reads, e.g. "Monkton pays double for every aged keg today".
export function eventText(ev) {
  if (!ev) return '';
  const times = ev.mult === 2 ? 'double' : `${ev.mult}×`;
  return `${ev.townName} pays ${times} for every ${ev.kindName.toLowerCase()} today`;
}

export function priceOf(town, kind, state, extraSold = 0) {
  const base = KINDS[kind].value * (CONFIG.dredge.prices[town]?.[kind] ?? 1);
  const day = dayOf(state);
  const drift = 1 + M.drift * wobble(town, kind, day);
  const ev = eventFor(day), event = ev && ev.town === town && ev.kind === kind ? ev.mult : 1;
  const sold = (state.sold[`${town}:${kind}`] || 0) + extraSold;
  const glut = Math.max(M.glutFloor, 1 - M.glut * sold);
  return Math.max(1, Math.round(base * drift * glut * event));
}

// What selling every piece of `kind` (or everything when null) would fetch, piece by piece
// as the price drops. Doesn't change anything.
export function quote(town, trunk, state, kind = null) {
  const extra = {};
  let total = 0, count = 0;
  for (const p of trunk.pieces.values()) {
    if (kind && p.kind !== kind) continue;
    total += priceOf(town, p.kind, state, extra[p.kind] || 0);
    extra[p.kind] = (extra[p.kind] || 0) + 1;
    count++;
  }
  return { total, count };
}

// Sell (removes the pieces from the trunk and records the glut). Returns { total, count }.
export function sell(town, trunk, state, kind = null) {
  const q = quote(town, trunk, state, kind);
  for (const p of [...trunk.pieces.values()]) {
    if (kind && p.kind !== kind) continue;
    trunk.remove(p.id);
    const key = `${town}:${p.kind}`;
    state.sold[key] = (state.sold[key] || 0) + 1;
  }
  return q;
}

// Time passes (in-game hours): the day can turn, and gluts ease.
export function passTime(state, hours) {
  if (!hours) return;
  state.clock = (state.clock || 0) + hours;
  const ease = (hours * M.recoverPerHour) / M.glut;
  for (const k of Object.keys(state.sold)) {
    state.sold[k] = Math.max(0, state.sold[k] - ease);
    if (!state.sold[k]) delete state.sold[k];
  }
}
