#!/usr/bin/env node
// The story's pacing, modelled from the tuning: `node scripts/progress.mjs`. Three players
// play the chapters (chapters.js, the real `advance` over a save) with the real offers
// (contracts.js offersFor, a fresh one from the step's contact after each delivery), the
// night, the midnight freight's hours, the still's makings (salvaged, or bought at a county
// store) and the order pay. Time is real minutes: driving moves the game clock (a game day
// is 16 minutes), the screens (mini-games, the still, cards) don't. Salvage pays what
// scripts/economy.mjs measures (SALVAGE below, from its clean and fair runs, scaled for a
// person at the wheel). Prints each chapter's minutes, the hours to the ending's choice, and
// the cash then (against the deed's price) for:
//  - rusher: plays well and goes straight for the story, sleeping through the days;
//  - steady: plays well, salvages by day, runs two more orders a night, buys upgrades;
//  - casual: plays fairly, drives slower, one more order a night, upgrades, and through
//    the days sleeps half the time and salvages the rest.
// Places are the default layout's (seed 1922), measured; road distance is about 1.3x
// straight. Targets (docs/GAME_DESIGN.md): chapter 1 in 45-60 minutes, 5-7 hours in all.
import { CONFIG } from '../src/config.js';
import { CHAPTERS, advance, current, choiceOpen } from '../src/chapters.js';
import { offersFor } from '../src/contracts.js';
import { KINDS } from '../src/trunk.js';
import { gradeOf, yieldFor } from '../src/brew.js';

const D = CONFIG.dredge, HPM = 24 / 16;                 // game hours a real minute
const [N0, N1] = D.police.checkpoint.hours, W = D.story.freight.window;
const PLACES = {
  spawn: [0, 100], barn: [-52, -300], baltimore: [-44, 44], monkton: [0, -660], glyndon: [-390, -690], cockeysville: [400, -650],
  kessler: [176, 44], orourke: [132, 176], abernathy: [0, -132], romano: [44, 132], hummel: [-176, -132], pryor: [220, 132], healy: [-88, 176],
  banks: [88, -176], wexler: [-88, -88], feld: [-132, 44], carroll: [-246, -512], ridgely: [256, -497], pruitt: [-292, -608], jockey: [292, -722],
  tolley: [-334, -956], gill: [238, -917], sheriff: [396, -614], ruins: [148, 48], office: [295, -722], van: [-408, -668], quarry: [422, -674],
  lockup: [412, -628], mill: [551, -740], load: [-414, -702], loch: [545, -735],
};
const FARMS = ['carroll', 'ridgely', 'pruitt', 'jockey', 'tolley', 'gill'];
const BARS = ['kessler', 'orourke', 'abernathy', 'romano', 'hummel', 'pryor', 'healy', 'banks', 'wexler', 'feld'];
const LIST = [
  ...BARS.map((who, i) => ({ id: `drop:${i}`, who, name: who, place: who, kind: 'speakeasy', x: PLACES[who][0], z: PLACES[who][1] })),
  ...FARMS.map((who, i) => ({ id: `farm:${i}`, who, name: who, place: who, kind: 'farm', x: PLACES[who][0], z: PLACES[who][1] })),
  { id: 'lockup', who: 'sheriff', name: 'sheriff', place: 'lockup', kind: 'speakeasy', rank: 3, x: PLACES.sheriff[0], z: PLACES.sheriff[1] },
];
const HOME = { x: PLACES.barn[0], z: PLACES.barn[1] };
// Salvage, per real minute at the wheel (scripts/economy.mjs: a clean job 157 $/min with
// jugs 23, small crates 7.8, sacks 3.9 an hour; a fair job 80 $/min, jugs 12.5, small crates
// 4.2 an hour), times how much of a bot's pace a person keeps. `kinds`: pieces an hour of
// anything a farm wants, when going for it (the right kind of site).
const SALVAGE = {
  skilled: { perMin: 157 * 0.7, makings: { jugs: 23.4, 'small-crate': 7.8, sack: 3.9 }, kinds: 7 },
  casual: { perMin: 80 * 0.6, makings: { jugs: 12.5 * 0.6, 'small-crate': 4.2 * 0.6, sack: 1 }, kinds: 3.5 },
};
const PLAYERS = {
  rusher: { speed: 0.95, q: 0.85, salvage: SALVAGE.skilled, sleeps: true, side: 0, upgrades: 0, slack: 1.1 },
  steady: { speed: 0.85, q: 0.85, salvage: SALVAGE.skilled, sleeps: false, side: 2, upgrades: 0.5, slack: 1.25 },
  casual: { speed: 0.65, q: 0.6, salvage: SALVAGE.casual, sleeps: 0.5, side: 1, upgrades: 0.5, slack: 1.5 },
};
const SUPPLY = (k) => Math.round(KINDS[k].value * (D.supplies?.markup || 1));
const SUPPLIES = D.supplies?.kinds || [];          // (none before the stores sold them)
const RECIPE = Object.fromEntries(D.brew.recipes.map((r) => [r.id, r]));
const night = (h) => { h = ((h % 24) + 24) % 24; return h >= N0 || h < N1; };
const inWin = (h, [a, b]) => { h = ((h % 24) + 24) % 24; return a <= b ? h >= a && h < b : h >= a || h < b; };
// Game hours from `clock` until the hour `to` comes round.
const until = (clock, to) => (((to - clock) % 24) + 24) % 24;

function play(P) {
  const d = { still: 0, stats: { brews: 0, contracts: 0 }, flags: {}, steps: {}, opened: {}, clues: {}, tools: {}, trust: {}, delivered: {}, best: {}, chapter: 0, rank: 0, rep: 0 };
  const s = { t: 0, clock: 21.5, cash: 0, at: 'spawn', stock: {}, spent: 0, orders: 0, nightDone: -1, chapters: [], spend: { drive: 0, screens: 0, salvage: 0, sleep: 0 } };
  const where = (p) => PLACES[p] || p;
  const drive = (to) => {
    const [ax, az] = where(s.at), [bx, bz] = where(to), km = (1.3 * Math.hypot(bx - ax, bz - az)) / 1000;
    const min = (km / P.speed) * P.slack + 0.1;
    s.t += min; s.clock += min * HPM; s.at = to; s.spend.drive += min;
  };
  const screen = (min) => { s.t += min * P.slack; s.spend.screens += min * P.slack; };
  const rank = () => { let r = 0; D.ranks.forEach((x, i) => { if (d.rep >= x.rep) r = i; }); d.rank = Math.max(d.rank, r); };
  // Salvage for `min` real minutes (by day, or waiting): cash for what's sold, the makings kept.
  const salvage = (min) => {
    s.t += min; s.clock += min * HPM * 0.7;           // ~30% of it at the screens (the clock stands)
    s.cash += P.salvage.perMin * min; s.spend.salvage += min;
    for (const [k, n] of Object.entries(P.salvage.makings)) s.stock[k] = (s.stock[k] || 0) + (n * min) / 60;
  };
  // Till the night (or a window) comes: sleep at the barn, or salvage.
  const wait = (ok, to) => {
    if (ok(s.clock)) return;
    const hours = until(s.clock, to), min = hours / HPM;
    // (a player who sleeps only now and then: every other long wait)
    if (P.sleeps && min > 2 && (P.sleeps === true || (s.naps = (s.naps || 0) + P.sleeps) % 1 === 0)) { drive('barn'); screen(0.2); s.spend.sleep++; s.clock += until(s.clock, to); return; }
    salvage(min / 0.7);
  };
  const waitNight = () => wait(night, N0);
  // Have `n` of `kind` on hand: brew shine; buy what a store sells; salvage the rest.
  const need = (kind, n) => {
    if (KINDS[kind].brewed) { while ((s.stock[kind] || 0) < n) brew(kind); return; }
    const short = n - Math.floor(s.stock[kind] || 0);
    if (short <= 0) return;
    if (SUPPLIES.includes(kind)) {
      if (s.cash < SUPPLY(kind) * short) salvage((SUPPLY(kind) * short - s.cash) / P.salvage.perMin + 1);   // the money for it first
      drive(nearestStore()); screen(0.3); s.cash -= SUPPLY(kind) * short; s.stock[kind] = (s.stock[kind] || 0) + short; return;
    }
    const min = (short / P.salvage.kinds) * 60;
    salvage(min);
    s.stock[kind] = (s.stock[kind] || 0) + short;
  };
  const nearestStore = () => ['monkton', 'glyndon', ...(d.rank >= 2 ? ['cockeysville'] : [])].reduce((a, b) => (Math.hypot(...where(s.at).map((v, i) => v - where(a)[i])) < Math.hypot(...where(s.at).map((v, i) => v - where(b)[i])) ? a : b));
  // A batch at the barn: the makings first, then the still.
  function brew(id) {
    const r = RECIPE[id];
    for (const [k, n] of Object.entries(r.needs)) need(k, n);
    drive('barn');
    screen(1.0);
    for (const [k, n] of Object.entries(r.needs)) s.stock[k] -= n;
    const crates = yieldFor(P.q);
    s.stock[id] = (s.stock[id] || 0) + crates;
    d.stats.brews++;
    d.best[id] = Math.max(d.best[id] || 0, P.q);
    d.rep += Math.round(P.q * D.repPerBrew); rank();
  }
  // An order handed over: what it wants (brewed or found), after dark if it's a night one.
  const deliver = (o, to = o.who) => {
    for (const [k, n] of Object.entries(o.wants)) need(k, n);
    if (o.night) waitNight();
    drive(to);
    if (o.night && !night(s.clock)) waitNight();
    screen(0.5);
    for (const [k, n] of Object.entries(o.wants)) s.stock[k] -= n;
    s.cash += o.pay; d.rep += o.rep; rank();
    d.stats.contracts++; s.orders++;
    if (o.who) { d.delivered[o.who] = (d.delivered[o.who] || 0) + 1; d.trust[o.who] = (d.trust[o.who] || 0) + 1 + (o.grade && gradeOf(P.q) === 'A' ? 1 : 0); }
    upgrade();
  };
  const day = () => Math.floor(s.clock / 24);
  const taken = new Set();
  const offers = (focus) => offersFor(day(), LIST, { brewing: d.still > 0, rank: d.rank, trust: d.trust, home: HOME, learned: d.flags, focus, focusN: d.delivered[focus] || 0, exclude: d.flags.betrayed ? ['jockey'] : [] })
    .filter((o) => !taken.has(o.id));
  // Till the next game day (its new offers): sleep or salvage.
  const nextDay = () => {
    const hours = (day() + 1) * 24 + 0.05 - s.clock;
    if (P.sleeps === true) { s.spend.sleep++; s.clock += hours; s.t += 0.3; return; }
    salvage(hours / HPM / 0.7);
  };
  // An offer from the step's contact (the day's, or the fresh one after each delivery),
  // delivered; with none on the board, the next day's.
  const focusOrder = (who) => {
    for (let k = 0; k < 30; k++) {
      const o = offers(who).find((x) => x.who === who);
      if (o) { taken.add(o.id); deliver(o); return; }
      nextDay();
    }
  };
  // Once a night: the side orders (shine for the speakeasies nearest the barn).
  const side = () => {
    if (!P.side || !d.still || !night(s.clock) || s.nightDone === day()) return;
    s.nightDone = day();
    const list = offers(null).filter((o) => o.night).sort((a, b) => a.km - b.km).slice(0, P.side);
    for (const o of list) { taken.add(o.id); deliver({ ...o, who: null }, o.who); }
  };
  // Spare cash into upgrades: the cheapest level open, while it's under the player's share.
  const upgrade = () => {
    if (!P.upgrades) return;
    for (;;) {
      let best = null;
      for (const [id, u] of Object.entries(D.upgrades)) {
        const lv = (s.levels ??= {})[id] || 0;
        if (lv >= u.costs.length || (u.ranks?.[lv] || 0) > d.rank) continue;
        if (!best || u.costs[lv] < best.cost) best = { id, cost: u.costs[lv] };
      }
      if (!best || best.cost > (s.cash - D.deed.cost * 0.15) * P.upgrades) return;
      s.cash -= best.cost; s.spent += best.cost; s.levels[best.id] = (s.levels[best.id] || 0) + 1;
    }
  };
  const site = (name, { night: dark = false, window = null } = {}) => {
    if (window) wait((h) => inWin(h, window), window[0]);
    else if (dark) waitNight();
    drive(name);
    if (window && !inWin(s.clock, window)) wait((h) => inWin(h, window), window[0]);
    if (dark && !night(s.clock)) waitNight();
    screen(0.5);
  };
  // Each step, as a player would go about it.
  const STEP = {
    ruins: () => { site('ruins'); d.flags.ruinsSearched = true; },
    still: () => { drive('barn'); screen(0.3); d.still = 1; brew('corn-shine'); },
    gus: () => focusOrder('kessler'),
    'gus-trust': () => focusOrder('kessler'),
    cellar: () => { site('ruins', { night: true }); d.clues.pledge = true; },
    pruitt: () => focusOrder('pruitt'),
    applejack: () => brew('applejack'),
    'jockey-trust': () => focusOrder('jockey'),
    office: () => { site('office', { night: true }); d.clues.ledger = true; },
    'mags-trust': () => focusOrder('orourke'),
    freight: () => { const F = D.story.freight; need(F.kind, F.count); site('load', { window: F.window }); s.stock[F.kind] -= F.count; s.cash += F.pay; d.flags['order:freight'] = true; },
    waybills: () => { site('van', { window: W }); d.clues.manifest = true; },
    consignment: () => { site('quarry', { night: true }); s.stock[D.story.consignment.kind] = (s.stock[D.story.consignment.kind] || 0) + D.story.consignment.count; d.flags.consignment = true; },
    run: () => { const R = D.story.run; deliver({ wants: { [R.kind]: R.count }, night: true, pay: R.pay, rep: R.rep }, 'kessler'); d.flags['order:run'] = true; },
    'hale-trust': () => focusOrder('sheriff'),
    report: () => { site('lockup', { night: true }); s.cash -= D.story.report; d.clues.report = true; },
    loch: () => { drive('loch'); d.flags.loch = true; },
    mill: () => { site('mill', { night: true }); d.clues.letters = true; d.flags.ambush = true; },
    escape: () => { s.t += 2.5; drive('barn'); d.flags.escaped = true; },
  };
  let chapter = 0, from = 0;
  advance(d);
  for (let guard = 0; guard < 400 && !choiceOpen(d) && s.t < 24 * 60; guard++) {
    const { step } = current(d);
    if (!step) { advance(d); continue; }
    side();
    STEP[step.id]();
    advance(d);
    if (d.chapter !== chapter) { s.chapters.push(s.t - from); from = s.t; chapter = d.chapter; }
  }
  return { ...s, days: day() };
}

const m = (x) => `${Math.round(x)}`.padStart(4);
console.log(`chapters: ${CHAPTERS.map((c, i) => `${i + 1} ${c.title}`).join(' · ')}; the deed $${D.deed.cost.toLocaleString()}`);
for (const [name, P] of Object.entries(PLAYERS)) {
  const r = play(P);
  console.log(`${name.padEnd(7)} minutes ${r.chapters.map(m).join(' ')}  total ${(r.t / 60).toFixed(1)} h, ${r.days} game days, ${r.orders} orders; cash at the choice $${Math.round(r.cash).toLocaleString()} (${Math.round((r.cash / D.deed.cost) * 100)}% of the deed), upgrades $${r.spent.toLocaleString()}`);
  console.log(`        driving ${m(r.spend.drive)} min, screens ${m(r.spend.screens)}, salvaging ${m(r.spend.salvage)}, slept ${r.spend.sleep} times`);
}
