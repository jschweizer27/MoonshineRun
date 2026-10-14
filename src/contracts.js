import { CONFIG } from './config.js';
import { KINDS } from './trunk.js';
import { CAST } from './story.js';
import { blendGrade } from './brew.js';
import { ODDS } from './codex.js';

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

// Everyone who posts jobs: { id, name, place, who, x, z, kind: 'speakeasy' | 'farm', chapter? }.
// `name` is the contact (a character from story.js CAST, `who`), `place` where they are.
// Sheriff Hale wants what the speakeasies want, delivered to the county lockup, and only
// posts from chapter 4 on (`chapter`, a CHAPTERS index).
export function contacts(world) {
  const person = (who, place) => ({ who, name: CAST[who]?.name ?? place, place });
  return [
    ...world.drops.map((d, i) => ({ id: `drop:${i}`, ...person(d.who, d.name), x: d.x, z: d.z, kind: 'speakeasy' })),
    ...world.barns.map((b, i) => ({ id: `farm:${i}`, ...person(b.who, b.name), x: b.stopX, z: b.stopZ, kind: 'farm' })),
    ...(world.lockup ? [{ id: 'lockup', ...person(world.lockup.who, world.lockup.name), x: world.lockup.x, z: world.lockup.z, kind: 'speakeasy', chapter: 3 }] : []),
    // Towson's Courthouse Tavern (chapter 6 on, towson.js): last, so no offer before it moves.
    ...(world.towson ? [{ id: 'tavern', ...person(world.towson.tavern.who, world.towson.tavern.name), x: world.towson.tavern.x, z: world.towson.tavern.z, kind: 'speakeasy', chapter: 5 }] : []),
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
// of a recipe he's learned, at a grade their trust in him asks for; farms want goods for
// the house and the yard. Each comes with a line from its contact (`line`). `home` (the
// barn) sets the distance pay; `trust` is { who: points }; `learned` the save's flags.
// `focus`: the contact a chapter step waits on (chapters.js `who`): one more offer is
// theirs, whatever the chapter, a fresh one after each order delivered to them (`focusN`, the
// count so far: id `<day>-f<focusN>`), so a trust step moves at the player's pace, not a
// day's. `tag`: the focus offer's id letter ('f'; 'c' for a contact Otto courts for a side
// story, main._courted, so the two never share an id). `exclude`: contacts who post nothing (the Jockey, once he's sold Otto out); a slot
// that lands on one goes to someone else. Without either, the offers are as they always were.
export function offersFor(day, list, { brewing = false, chapter = 0, trust = {}, home = null, learned = {}, focus = null, focusN = 0, tag = 'f', exclude = [], bounty = false } = {}) {
  // Recipes he can brew: the plain one, and those he's been taught.
  const shine = C.shine.filter((k) => {
    const r = CONFIG.dredge.brew.recipes.find((x) => x.id === k);
    return !r?.learn || learned[`learned:${k}`];
  });
  const offer = (i, contact) => {
    const r = (s) => roll(`${s}:${i}`, day);
    const farm = contact.kind === 'farm', cast = CAST[contact.who] || {};
    const asks = cast.asks || [];
    const level = trustLevel(trust[contact.who]);
    const night = (!farm || cast.shine) && brewing && shine.length > 0;
    const wants = {};
    let grade = null, worth;
    if (night) {
      const kind = shine[Math.floor(r('kind0') * shine.length)];
      wants[kind] = 1 + Math.floor(r('n0') * 2) + (level >= 3 ? 1 : 0);
      grade = level >= 4 && r('grade') < 0.5 ? 'A' : level >= 2 && r('grade') < 0.6 ? 'B' : 'C';
      worth = KINDS[kind].value * CONFIG.dredge.brew.gradePrice[grade] * wants[kind];
    } else {
      const goods = cast.wants || (farm ? C.farmWants : C.barWants);
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
    return {
      id: `${day}-${i}`, contact: contact.id, name: contact.name, place: contact.place, who: contact.who, line: asks[Math.floor(r('line') * asks.length)] || '',
      kind: contact.kind, x: contact.x, z: contact.z, wants, grade, night, pay, hours, km: Math.round(km * 10) / 10,
    };
  };
  const out = [];
  for (let i = 0; i < C.perDay; i++) {
    const r = (s) => roll(`${s}:${i}`, day);
    const farm = r('who') < C.farmShare;
    const pool = list.filter((c) => c.kind === (farm ? 'farm' : 'speakeasy') && (c.chapter || 0) <= chapter);
    let contact = pool[Math.floor(r('contact') * pool.length)];
    if (exclude.includes(contact.who)) {
      const rest = pool.filter((c) => !exclude.includes(c.who));
      contact = rest[Math.floor(r('instead') * rest.length)];
    }
    out.push(offer(i, contact));
  }
  const wanted = focus && !exclude.includes(focus) && list.find((c) => c.who === focus);
  if (wanted) out.push(offer(`${tag}${focusN}`, wanted));
  // A bounty (once Otto knows odd finds): someone wants a particular odd one, by a day or so,
  // at a collector's price. Last, so the day's other offers stay as they were.
  if (bounty) {
    const r = (s) => roll(`${s}:b`, day), B = CONFIG.dredge.bounty;
    const pool = list.filter((c) => (c.chapter || 0) <= chapter && !exclude.includes(c.who) && CAST[c.who]?.asks);
    const contact = pool[Math.floor(r('contact') * pool.length)], kind = ODDS[Math.floor(r('kind') * ODDS.length)];
    if (contact) {
      out.push({
        id: `${day}-b`, contact: contact.id, name: contact.name, place: contact.place, who: contact.who, kind: contact.kind, x: contact.x, z: contact.z,
        line: `I’m told there’s such a thing as a ${KINDS[kind].name.toLowerCase()}. Find me one and I’ll pay what it’s worth to me.`,
        wants: { [kind]: 1 }, grade: null, night: false, pay: Math.round((KINDS[kind].value * B.pay) / 5) * 5, hours: B.hours, km: 0, bounty: true,
      });
    }
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
