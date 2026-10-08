import { CONFIG } from './config.js';
import { KINDS } from './trunk.js';
import { CAST } from './story.js';
import { blendGrade } from './brew.js';

// Orders from Otto's contacts: the speakeasies (the named city corners), the farms (the
// county barns) and the Sheriff. Pure logic: each in-game day posts a few, rolled from the
// day and the contact's trust, each wanting goods delivered to one contact by a deadline,
// for more than the markets pay (CONFIG.dredge.contracts). Shine orders want a recipe at a
// grade, handed over only after dark, by dawn. Trust is per contact (points; a level 0-5).
const C = CONFIG.dredge.contracts;
const GRADES = ['C', 'B', 'A'];

export const trustLevel = (points = 0) => Math.max(0, Math.min(5, Math.floor(points / C.trustPer)));
export const gradeAtLeast = (have, want) => GRADES.indexOf(have) >= GRADES.indexOf(want || 'C');

// The game clock (hours since day 0, midnight) of the next dawn at least `C.dawnMin` hours off.
export function nextDawn(clock) {
  let due = Math.floor(clock / 24) * 24 + 6;
  while (due - clock < C.dawnMin) due += 24;
  return due;
}

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

// The day's offers. Speakeasies (and the Sheriff) want bar goods, or once Otto brews, shine
// of a recipe his rank allows, at a grade their trust in him asks for; farms want goods for
// the house and the yard. Each comes with a line from its contact (`line`). `home` (the
// barn) sets the distance pay; `trust` is { who: points }.
export function offersFor(day, list, { brewing = false, rank = 0, trust = {}, home = null } = {}) {
  const shine = C.shine.filter((k) => (CONFIG.dredge.brew.recipes.find((r) => r.id === k)?.rank ?? 0) <= rank);
  const out = [];
  for (let i = 0; i < C.perDay; i++) {
    const r = (s) => roll(`${s}:${i}`, day);
    const farm = r('who') < C.farmShare;
    const pool = list.filter((c) => c.kind === (farm ? 'farm' : 'speakeasy') && (c.rank || 0) <= rank);
    const contact = pool[Math.floor(r('contact') * pool.length)];
    const asks = CAST[contact.who]?.asks || [];
    const level = trustLevel(trust[contact.who]);
    const night = !farm && brewing && shine.length > 0;
    const wants = {};
    let grade = null, worth;
    if (night) {
      const kind = shine[Math.floor(r('kind0') * shine.length)];
      wants[kind] = 1 + Math.floor(r('n0') * 2) + (level >= 3 ? 1 : 0);
      grade = level >= 4 && r('grade') < 0.5 ? 'A' : level >= 2 && r('grade') < 0.6 ? 'B' : 'C';
      worth = KINDS[kind].value * CONFIG.dredge.brew.gradePrice[grade] * wants[kind];
    } else {
      const goods = farm ? C.farmWants : C.barWants;
      const kinds = 1 + (r('kinds') < 0.4 ? 1 : 0);
      for (let k = 0; k < kinds; k++) {
        const kind = goods[Math.floor(r(`kind${k}`) * goods.length)];
        wants[kind] = (wants[kind] || 0) + 1 + Math.floor(r(`n${k}`) * 2);
      }
      worth = Object.entries(wants).reduce((s, [k, n]) => s + KINDS[k].value * n, 0);
    }
    const km = home ? Math.hypot(contact.x - home.x, contact.z - home.z) / 1000 : 0;
    const pay = Math.round((worth * (night ? C.nightPay : C.payMult) * (1 + C.distPay * km) * (1 + C.trustPay * level)) / 5) * 5;
    const hours = Math.round(C.hours[0] + r('hours') * (C.hours[1] - C.hours[0]));
    out.push({
      id: `${day}-${i}`, contact: contact.id, name: contact.name, place: contact.place, who: contact.who, line: asks[Math.floor(r('line') * asks.length)] || '',
      kind: contact.kind, x: contact.x, z: contact.z, wants, grade, night, pay, rep: Math.round(pay / C.repPer), hours, km: Math.round(km * 10) / 10,
    });
  }
  return out;
}

// Pieces of each wanted kind aboard, against what's wanted: { kind: [have, want] }, whether
// it's all there (`ready`), and for shine, the blend's grade against the order's (`gradeOk`,
// `grade`); `blends` is the market state's blend map.
export function progress(contract, trunk, blends = {}) {
  const have = {};
  for (const p of trunk.pieces.values()) have[p.kind] = (have[p.kind] || 0) + 1;
  const rows = Object.fromEntries(Object.entries(contract.wants).map(([k, n]) => [k, [Math.min(have[k] || 0, n), n]]));
  const shine = Object.keys(contract.wants).find((k) => KINDS[k].brewed);
  const grade = shine ? blendGrade(blends[shine]) : null;
  const gradeOk = !contract.grade || !shine || gradeAtLeast(grade, contract.grade);
  return { rows, ready: Object.values(rows).every(([h, n]) => h >= n), grade, gradeOk, tainted: !!(shine && blends[shine]?.bad) };
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
