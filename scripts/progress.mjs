#!/usr/bin/env node
// Project the long game from the tuning (CONFIG.dredge): when each rank and the Braun & Sons
// deed come, in hours of play with the clock on. `node scripts/progress.mjs [loot $/min]`,
// where loot $/min is what scripts/economy.mjs measures (selling loot at the markets).
// On top of that: the jobs (contracts.js offersFor, three a game day; a game day is 16 real
// minutes) pay their premium over the goods' market value and earn reputation; rare finds
// (one every `rare.every` seconds or so, sold where they pay best) and batches at the still
// add both. Two players: a busy one (every job, every rare find, three batches an hour) and
// an easy one (half of each). Prints the hour each rank comes, and when there's the cash for
// the deed alone and for the deed after every upgrade.
import { CONFIG } from '../src/config.js';
import { offersFor } from '../src/contracts.js';
import { KINDS } from '../src/trunk.js';

const D = CONFIG.dredge, lootPerMin = Number(process.argv[2] || 200);
const dayMinutes = 16;
// Stand-ins for the contacts (only who they are and where matters to an offer's pay).
const list = [
  ...['kessler', 'orourke', 'abernathy', 'romano', 'hummel', 'pryor', 'healy', 'banks', 'wexler', 'feld'].map((who, i) => ({ id: `drop:${i}`, who, kind: 'speakeasy', x: 0, z: 0 })),
  ...['carroll', 'ridgely', 'pruitt', 'jockey', 'tolley', 'gill'].map((who, i) => ({ id: `farm:${i}`, who, kind: 'farm', x: 0, z: 0 })),
  { id: 'lockup', who: 'sheriff', kind: 'speakeasy', rank: 3, x: 0, z: 0 },
];
const rares = D.loot.kinds.filter((k) => k.rare);
const rareCash = rares.reduce((s, k) => s + k.value * D.prices[k.paysAt][k.id], 0) / rares.length;
const rareEvery = (D.loot.rare.every + 120) / 60;   // minutes: the wait, then the drive out to it
const brewRep = 0.8 * D.repPerBrew;                  // a steady hand
const brewCash = 3 * KINDS['corn-shine'].value - KINDS.sack.value - KINDS.jugs.value;   // three crates, less what went in
const upgrades = Object.values(D.upgrades).reduce((s, u) => s + u.costs.reduce((a, b) => a + b, 0), 0);
const rankOf = (rep) => D.ranks.reduce((r, x, i) => (rep >= x.rep ? i : r), 0);

function play(share) {
  let rep = 0, cash = 0, rank = 0, day = -1;
  const at = { ranks: [0], deed: null, all: null };
  for (let min = 0; min < 12 * 60; min++) {
    if (Math.floor(min / dayMinutes) !== day) {
      // A new game day: its jobs, done over the day (all of them, or half).
      day = Math.floor(min / dayMinutes);
      const jobs = offersFor(day, list, { brewing: min > 30, rank }).slice(0, Math.round(D.contracts.perDay * share));
      for (const j of jobs) { rep += j.rep; cash += j.pay * (1 - 1 / D.contracts.payMult); }
    }
    cash += lootPerMin;
    if (min && min % Math.round(rareEvery / share) === 0) { rep += D.repPerFind; cash += rareCash; }
    if (min && min % Math.round(60 / (3 * share)) === 0) { rep += brewRep; cash += brewCash; }
    const r = rankOf(rep);
    while (rank < r) at.ranks[++rank] = min;
    if (rank >= D.deed.rank && at.deed == null && cash >= D.deed.cost) at.deed = min;
    if (rank >= D.deed.rank && at.all == null && cash >= D.deed.cost + upgrades) at.all = min;
  }
  return at;
}

const h = (m) => (m == null ? 'over 12 h' : `${(m / 60).toFixed(1)} h`);
console.log(`loot ${lootPerMin} $/min; jobs ${D.contracts.perDay} a game day (${dayMinutes} min); a rare find every ~${rareEvery.toFixed(0)} min ($${Math.round(rareCash)}); every upgrade $${upgrades.toLocaleString()}; the deed $${D.deed.cost.toLocaleString()} at ${D.ranks[D.deed.rank].name}`);
for (const [name, share] of [['busy', 1], ['easy', 0.5]]) {
  const at = play(share);
  console.log(`${name.padEnd(5)} ${D.ranks.map((r, i) => `${r.name} ${h(at.ranks[i])}`).join(' · ')}`);
  console.log(`      the deed ${h(at.deed)}; the deed after every upgrade ${h(at.all)}`);
}
