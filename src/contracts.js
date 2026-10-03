import { CONFIG } from './config.js';
import { KINDS } from './trunk.js';
import { CAST } from './story.js';

// Contracts from Otto's contacts: the speakeasies (the named city corners) and the farms
// (the county barns). Pure logic: each in-game day posts a few jobs, rolled from the day
// (the same for every player), each wanting a few pieces delivered to one contact by a
// deadline, for more than the markets pay (CONFIG.dredge.contracts).
const C = CONFIG.dredge.contracts;

// Everyone who posts jobs: { id, name, place, who, x, z, kind: 'speakeasy' | 'farm', rank? }.
// `name` is the contact (a character from story.js CAST, `who`), `place` where they are.
// Sheriff Hale wants what the speakeasies want, delivered to the county lockup, and only
// posts once Otto's rank reaches his (`rank`).
export function contacts(world) {
  const person = (who, place) => ({ who, name: CAST[who]?.name ?? place, place });
  return [
    ...world.drops.map((d, i) => ({ id: `drop:${i}`, ...person(d.who, d.name), x: d.x, z: d.z, kind: 'speakeasy' })),
    ...world.barns.map((b, i) => ({ id: `farm:${i}`, ...person(b.who, b.name), x: b.stopX, z: b.stopZ, kind: 'farm' })),
    ...(world.lockup ? [{ id: 'lockup', ...person(world.lockup.who, world.lockup.name), x: world.lockup.x, z: world.lockup.z, kind: 'speakeasy', rank: 3 }] : []),
  ];
}

// A repeatable 0..1 for a salt and a day (FNV-1a and a murmur finish, like the market's).
function roll(salt, day) {
  let h = 2166136261;
  for (const c of `job:${salt}:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// The day's offers. Speakeasies want bar goods, or shine once Otto brews (the recipes his
// rank allows); farms want goods for the house and the yard. Each comes with a line from
// its contact (`line`).
export function offersFor(day, list, { brewing = false, rank = 0 } = {}) {
  const shine = C.shine.filter((k) => (CONFIG.dredge.brew.recipes.find((r) => r.id === k)?.rank ?? 0) <= rank);
  const out = [];
  for (let i = 0; i < C.perDay; i++) {
    const r = (s) => roll(`${s}:${i}`, day);
    const farm = r('who') < C.farmShare;
    const pool = list.filter((c) => c.kind === (farm ? 'farm' : 'speakeasy') && (c.rank || 0) <= rank);
    const contact = pool[Math.floor(r('contact') * pool.length)];
    const asks = CAST[contact.who]?.asks || [];
    const goods = farm ? C.farmWants : brewing && shine.length ? shine : C.barWants;
    const wants = {};
    const kinds = 1 + (r('kinds') < 0.4 ? 1 : 0);
    for (let k = 0; k < kinds; k++) {
      const kind = goods[Math.floor(r(`kind${k}`) * goods.length)];
      wants[kind] = (wants[kind] || 0) + 1 + Math.floor(r(`n${k}`) * 2);
    }
    const worth = Object.entries(wants).reduce((s, [k, n]) => s + KINDS[k].value * n, 0);
    const pay = Math.round((worth * C.payMult) / 5) * 5;
    const hours = Math.round(C.hours[0] + r('hours') * (C.hours[1] - C.hours[0]));
    out.push({
      id: `${day}-${i}`, contact: contact.id, name: contact.name, place: contact.place, who: contact.who, line: asks[Math.floor(r('line') * asks.length)] || '',
      kind: contact.kind, x: contact.x, z: contact.z, wants, pay, rep: Math.round(pay / C.repPer), hours,
    });
  }
  return out;
}

// Pieces of each wanted kind aboard, against what's wanted: { kind: [have, want] } and
// whether it's all there.
export function progress(contract, trunk) {
  const have = {};
  for (const p of trunk.pieces.values()) have[p.kind] = (have[p.kind] || 0) + 1;
  const rows = Object.fromEntries(Object.entries(contract.wants).map(([k, n]) => [k, [Math.min(have[k] || 0, n), n]]));
  return { rows, ready: Object.values(rows).every(([h, n]) => h >= n) };
}

// Hand the goods over: take the wanted pieces out of the trunk.
export function handOver(contract, trunk) {
  for (const [kind, n] of Object.entries(contract.wants)) {
    let left = n;
    for (const p of [...trunk.pieces.values()]) {
      if (!left) break;
      if (p.kind === kind) { trunk.remove(p.id); left--; }
    }
  }
}

// "2 kegs, 1 crate"
export function wantsText(wants) {
  return Object.entries(wants).map(([k, n]) => `${n} ${KINDS[k].name.toLowerCase()}${n > 1 && !/s$/.test(KINDS[k].name) ? 's' : ''}`).join(', ');
}
