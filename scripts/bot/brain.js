/* global document */
// The robot's planner (scripts/playthrough.mjs). It reads what a player can see (the
// chapter's step, the side stories' steps, the order book, the clock, the trunk and the
// stash) and picks the next errand: deliver what's ready, then the story's step, then the
// side stories', then getting ready (shine, cash) or sleeping till the hour comes. At a
// screen it says what to do there (sell, buy, take an order, brew, sleep). Runs in the page.
import { CONFIG } from '../../src/config.js';
import { KINDS } from '../../src/trunk.js';
import { current, choiceOpen, crownReady, CITY } from '../../src/chapters.js';
import { activeArcs, ARCS, arcReady } from '../../src/arcs.js';
import { RECIPES } from '../../src/brew.js';
import { progress, trustLevel } from '../../src/contracts.js';
import { dayOf, townOpen } from '../../src/market.js';
import { inWindow } from '../../src/railway.js';
import { duskHour } from '../../src/hours.js';

const SUPPLIES = new Set([...CONFIG.dredge.supplies.kinds, ...CONFIG.dredge.supplies.gear]);
const UPGRADES = ['trunk', 'engine', 'handling', 'padding', 'spotter', 'tyres', 'lamps', 'plating', 'falsebottom'].filter((id) => CONFIG.dredge.upgrades[id]);
const $ = (sel) => document.querySelector(sel);
const live = (sel) => { const b = $(sel); return b && !b.disabled && b.offsetParent !== null ? b : null; };
const away = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Brain {
  constructor(bot) {
    this.bot = bot;
    this.g = bot.g;
    this.reset();
    this.failed = new Map();      // place key -> game clock it may be tried again
    this.courted = new Set();
  }

  reset() {
    this.toTake = []; this.toDrop = []; this.toBuy = {}; this.brewList = []; this.takeList = {};
    this.sleepId = null; this.courtId = null; this.wantLaunch = false; this.need = {}; this.payFor = null;
  }

  get d() { return this.g.dredge.data; }
  get hour() { return this.g.env.hour; }
  get clock() { return this.g.dredge.market.clock; }
  count(kind) { let n = 0; for (const p of this.g.trunk.pieces.values()) if (p.kind === kind) n++; return n; }
  stash(kind) { return this.d.stash[kind] || 0; }
  have(kind) { return this.count(kind) + this.stash(kind); }
  ownShine() { let n = 0; for (const p of this.g.trunk.pieces.values()) if (KINDS[p.kind].brewed && !KINDS[p.kind].imported) n++; return n; }
  night(h = this.hour) { return this.g._night(h); }
  timeOk(o) { return !(o.window && !inWindow(this.hour, o.window)) && !this.g._waitsDark(o); }
  ready(o) {
    if (o.call) return true;
    if (o.passenger) return !!o.aboard;
    const pr = progress(o, this.g.trunk, this.g.dredge.market.blend);
    return pr.ready && pr.gradeOk;
  }
  near(list) { const p = this.g.player.position; return list.reduce((a, b) => (away(b, p) < away(a, p) ? b : a)); }
  get barn() { const h = this.g.world.home; return { x: h.stopX, z: h.stopZ, near: 3, key: 'barn' }; }
  markets(supplies = false) { return CONFIG.dredge.towns.filter((t) => townOpen(t, this.d.chapter || 0) && (!supplies || t.supplies)).map((t) => ({ x: t.x, z: t.z, near: 6, key: t.id, town: t })); }
  free() { return this.g.trunk.size - this.g.trunk.used; }
  // Breakables aboard (jugs, bottles, shine: CONFIG.dredge.breakage): drive gently.
  fragile() { const B = CONFIG.dredge.breakage?.kinds || []; for (const p of this.g.trunk.pieces.values()) if (KINDS[p.kind].brewed || B.includes(p.kind)) return true; return false; }
  fits(list) {
    // (a trial packing of a copy: each piece where the trunk would put it)
    const T = this.g.trunk, placed = [];
    let ok = true;
    for (const [k, n] of Object.entries(list)) for (let i = 0; i < n && ok; i++) { const sp = T.findSpot(k), p = sp && T.place(k, sp.x, sp.y, sp.rot); if (p) placed.push(p.id); else ok = false; }
    for (const id of placed) T.remove(id);
    return ok;
  }
  cells(kind, n = 1) { return KINDS[kind].cells.length * n; }
  // The city wall has one gap, York Road's, and the checkpoint stands in it at night: with
  // more shine aboard than the false bottom hides, the bot crosses by day (as a player must).
  side(p) { return p.z > -255 ? 'city' : 'county'; }
  crosses(t) { return this.side(this.g.player.position) !== this.side(t); }
  risky() { const C = this.g.police.checkpoint; return (this.d.chapter || 0) >= (C.chapter ?? 0) && this.g._contraband() > (this.g.perks.hidden || 0); }
  tried(key) { return (this.failed.get(key) ?? -1) > this.clock; }
  fail(key, hours = 2) { this.failed.set(key, this.clock + hours); }

  // What to keep aboard: the orders' wants, the step's needs (what it takes, what's being
  // gathered) and the makings for a brew on the way.
  wanted() {
    const w = { ...this.need };
    for (const o of this.d.orders) for (const [k, n] of Object.entries(o.wants || {})) w[k] = (w[k] || 0) + n;
    const lost = this.g._lost();
    if (lost) for (const k of lost.gives || []) w[k] = (w[k] || 0) + 1;
    if ((this.d.still || 0) < 1) w.coil = Math.max(w.coil || 0, 1);
    // (a batch's makings for shine that's wanted and short: bought for one plan, not sold by
    // the next while it waits for dark)
    for (const r of RECIPES) if ((w[r.id] || 0) > this.have(r.id)) for (const [k, n] of Object.entries(r.needs)) w[k] = Math.max(w[k] || 0, n);
    return w;
  }

  // ---------- Deciding ----------
  // Returns { go, near, why } (an errand somewhere) or { why, wait } (nothing to do here yet).
  choose() {
    this.reset();
    const d = this.d;
    // What's ready goes first: hand it over.
    const due = d.orders.filter((o) => this.ready(o) && this.timeOk(o));
    if (due.length) {
      const ok = due.filter((o) => !(this.night() && this.crosses(o) && this.risky()));
      if (ok.length) { const o = this.near(ok); return { go: o, near: 4, why: `deliver to ${o.name}` }; }
    }
    // A worn truck is a slow one: to the barn's garage.
    if ((d.wear || 0) > 0.45 && d.cash >= this.g.dredge.repairCost(this.g.trunk.cracked.length) + 60) { const r = this.guard({ go: this.barn, near: 3, why: `repairs (the truck at ${Math.round((1 - d.wear) * 100)}%)`, screen: 'barn' }); if (r.go) return r; }
    if (choiceOpen(d)) return this.guard(this.endgame());
    // The chapter's step, then each side story's.
    const plans = [], { step } = current(d);
    if (step) plans.push({ step, arc: null });
    for (const a of activeArcs(d)) plans.push(a);
    const waits = [];
    for (const { step: s, arc } of plans) {
      const r = this.guard(this.planStep(s, arc));
      if (r.go) return r;
      if (r.wait) waits.push(r);
    }
    return this.guard(this.idle(waits));
  }

  // Not through the checkpoint at night with too much shine: wait for day on this side (in
  // the county, asleep in the barn).
  guard(r) {
    if (!r.go || !this.night() || !this.crosses(r.go) || !this.risky()) return r;
    if (this.side(this.g.player.position) === 'county' && this.g._sleeps().some((o) => o.id === 'morning')) {
      this.sleepId = 'morning';
      return { go: this.barn, near: 3, why: `sleep till morning: the checkpoint's up and the shine won't hide (${r.why})`, screen: 'barn' };
    }
    return { wait: 'day', why: `wait for day to get past the checkpoint (${r.why})` };
  }

  planStep(step, arc) {
    const g = this.g, d = this.d;
    const lost = !arc && g._lost();
    if (lost) { const s = g.salvage.sites.find((x) => x.story === lost.site); return this.workSite(s, step, `get back what was lost (${s?.name})`); }
    if (step.id === 'still') return this.planStill();
    if (step.id === 'applejack') return this.brew('applejack', 1, 'Applejack for Ma Pruitt');
    if (step.order) {
      const o = d.orders.find((x) => x.story === step.id);
      return o ? this.planOrder(o) : { wait: 'order', why: `no order in the book for “${step.text}”` };
    }
    if (step.who) return this.planTrust(step.who, step.text);
    if (step.site) return this.workSite(g.salvage.sites.find((x) => x.story === step.site), step, step.text);
    if (step.at) {
      if (step.night && !this.night()) return { wait: 'night', why: step.text };
      const goal = g._stepGoal(step);
      return goal ? { go: { x: goal.x ?? goal.stopX, z: goal.z ?? goal.stopZ }, near: step.at === 'barn' ? 3 : 12, why: step.text } : { wait: 'event', why: step.text };
    }
    return { wait: 'event', why: step.text };
  }

  // Chapter 1's still: a coil fitted (the ruins' coil), then any batch.
  planStill() {
    const d = this.d;
    if ((d.still || 0) < 1) {
      if (!this.have('coil')) return this.salvageFor('coil', 'a copper coil for the still');
      return { go: this.barn, near: 3, why: 'fit the coil to the still', screen: 'barn' };
    }
    return this.brew('corn-shine', 1, 'the first batch');
  }

  // A story site: worked when it's open (and Otto has what it takes); else it waits.
  workSite(site, step, why) {
    const g = this.g, d = this.d;
    if (!site) { this.bot.find('DEADEND', `No site for “${why}”`); return { wait: 'event', why }; }
    const st = g.salvage.status(site, dayOf(g.dredge.market), this.hour), K = CONFIG.dredge.salvage.kinds[site.kind];
    if (st === 'hidden') { this.bot.find('DEADEND', `“${why}”: its site (${site.story || site.id}) is hidden while the step is current`, { site: site.story || site.id }); return { wait: 'event', why }; }
    if (st === 'day') return { wait: 'night', why, at: site };
    if (st === 'closed') return { wait: 'window', window: site.window || step.window, why, at: site };
    for (const [k, n] of Object.entries(step.takes || {})) {
      if (k === 'shine') {
        this.need['corn-shine'] = Math.max(this.need['corn-shine'] || 0, n);
        if (this.ownShine() < n) return this.gather('corn-shine', n - this.ownShine() + this.count('corn-shine'), why);
      } else {
        this.need[k] = Math.max(this.need[k] || 0, n);
        if (this.count(k) < n) return this.gather(k, n, why);
      }
    }
    if (K.game === 'lager') {
      const L = RECIPES.find((r) => r.id === 'lager');
      for (const [k, n] of Object.entries(L.needs)) this.need[k] = Math.max(this.need[k] || 0, n);
      for (const [k, n] of Object.entries(L.needs)) if (this.have(k) < n) return this.acquire(k, n - this.have(k), why);
    }
    if (K.game === 'pay') {
      const price = step.price ?? CONFIG.dredge.story.report;
      if (d.cash < price) return this.earn(price + 50, why);
      this.payFor = site.story;
    }
    if (K.gear && !g._gear(K.gear)) return this.buy(K.gear, 1, why);
    if (site.story === 'pier' && step.id !== 'launch' && !this.g._lost()) this.wantLaunch = true;
    return { go: { x: site.stopX, z: site.stopZ }, near: 3, why, key: `site:${site.story || site.id}` };
  }

  // An order in the book: the passenger first, then what it wants aboard, then the hour.
  planOrder(o) {
    if (o.passenger && !o.aboard) return { go: o.pickup, near: 4, why: `pick up ${o.passenger} for ${o.name}` };
    if (!o.call && !o.passenger) {
      for (const [k, n] of Object.entries(o.wants)) this.need[k] = Math.max(this.need[k] || 0, n);
      for (const [k, n] of Object.entries(o.wants)) if (this.count(k) < n) return this.gather(k, n, `the order for ${o.name}`);
      const pr = progress(o, this.g.trunk, this.g.dredge.market.blend);
      if (!pr.gradeOk) return this.brew(Object.keys(o.wants)[0], 3, `a better blend for ${o.name} (grade ${o.grade})`);
    }
    if (!this.timeOk(o)) {
      // Shine for the city after dark: through the checkpoint by day, then wait at the door.
      if (o.night && !this.night() && this.crosses(o) && this.side(o) === 'city' && duskHour(this.g.env.winter) - this.hour < 4) return { go: o, near: 6, why: `wait for dark at ${o.name}` };
      return { wait: o.window ? 'window' : 'night', window: o.window, why: `${o.name}, ${o.window ? `${o.window[0]}–${o.window[1]}` : 'after dark'}`, at: o };
    }
    return { go: o, near: 4, why: `deliver to ${o.name}` };
  }

  // A contact's trust (or a first delivery): an order of theirs in the book, else theirs from
  // a board (the focus offer the game posts for the step's contact).
  planTrust(who, why) {
    const d = this.d, g = this.g;
    for (const o of d.orders.filter((x) => x.who === who && !x.story)) {
      const r = this.planOrder(o);
      if (r.go || r.wait) return r;
    }
    const offers = g._jobs().offers().filter((o) => o.who === who && !o.bounty);
    if (!offers.length) return { wait: 'offer', why: `${why}: no order from them on the boards today` };
    const full = d.orders.filter((o) => !o.story).length >= CONFIG.dredge.contracts.book;
    if (full) { const drop = d.orders.filter((o) => !o.story && o.who !== who).sort((a, b) => a.pay - b.pay)[0]; if (drop) this.toDrop = [drop.id]; }
    const focus = offers.find((o) => /-[fc]\d+$/.test(o.id)) || offers[0];
    this.toTake = [focus.id];
    return { go: this.near([...this.markets(), this.barn]), near: 6, why: `${why}: take ${focus.name}’s order` };
  }

  // Get `n` of `kind` into the trunk.
  gather(kind, n, why) {
    const short = n - this.count(kind);
    if (short <= 0) return { wait: 'event', why };
    this.need[kind] = Math.max(this.need[kind] || 0, n);
    if (this.stash(kind) > 0 && this.blocked === 'room') { this.blocked = null; return this.makeRoom(this.cells(kind, Math.min(short, this.stash(kind))), why); }
    if (this.stash(kind) > 0) { this.takeList[kind] = Math.min(n, this.count(kind) + this.stash(kind)); return { go: this.barn, near: 3, why: `take ${KINDS[kind].name} from the stash (${why})` }; }
    return this.acquire(kind, short, why);
  }

  // Make, buy or find `n` more of `kind` (not counting the stash).
  acquire(kind, n, why) {
    if (RECIPES.some((r) => r.id === kind)) return this.brew(kind, n, why);
    if (SUPPLIES.has(kind)) return this.buy(kind, n, why);
    if (kind === 'scotch' || kind === 'rum') {
      if (!this.d.tools.launch) return { wait: 'event', why: `${why}: no launch yet` };
      const pier = this.g.salvage.sites.find((x) => x.story === 'pier'), W = CONFIG.dredge.rumrow.window;
      this.wantLaunch = true;
      if (!inWindow(this.hour, W)) return { wait: 'window', window: W, why: `${why}: the launch` };
      return { go: { x: pier.stopX, z: pier.stopZ }, near: 3, why: `${why}: the launch` };
    }
    return this.salvageFor(kind, why);
  }

  brew(id, n, why) {
    const d = this.d, r = RECIPES.find((x) => x.id === id);
    if (!r) return { wait: 'event', why };
    if (r.learn && !d.flags[`learned:${id}`]) return { wait: 'learn', why: `${why}: ${r.name} isn't learned yet` };
    if (r.brewery) {
      const site = this.g.salvage.sites.find((x) => x.story === 'brewery');
      return this.workSite(site, { takes: {}, text: why }, `brew ${r.name} in Gus’s cellar (${why})`);
    }
    if ((d.still || 0) < 1) return this.planStill();
    for (const [k, m] of Object.entries(r.needs)) this.need[k] = Math.max(this.need[k] || 0, m);
    const short = Object.entries(r.needs).filter(([k, m]) => this.have(k) < m).map(([k, m]) => [k, m - this.have(k)]);
    const shop = short.filter(([k]) => SUPPLIES.has(k));
    if (shop.length) return this.buyAll(Object.fromEntries(shop), `makings for ${r.name}`);
    if (short.length) return this.acquire(short[0][0], short[0][1], `makings for ${r.name}`);
    this.brewList = [id];
    return { go: this.barn, near: 3, why: `brew ${r.name} (${why})`, screen: 'barn' };
  }

  buy(kind, n, why) { return this.buyAll({ [kind]: n }, why); }

  // Everything on the list in one trip to a county store (room in the trunk and cash first).
  buyAll(list, why) {
    let price = 0, cells = 0;
    for (const [k, n] of Object.entries(list)) { price += Math.round(KINDS[k].value * CONFIG.dredge.supplies.markup) * n; cells += this.cells(k, n); }
    if (this.free() < cells || !this.fits(list) || this.blocked === 'room') { this.blocked = null; return this.makeRoom(cells, why); }
    if (this.d.cash < price || this.blocked === 'cash') { this.blocked = null; return this.earn(price + 20, `${why}: $${price} of supplies`); }
    for (const [k, n] of Object.entries(list)) this.toBuy[k] = this.count(k) + n;
    return { go: this.near(this.markets(true)), near: 6, why: `buy ${Object.entries(list).map(([k, n]) => `${n} ${KINDS[k].name}`).join(', ')} (${why})` };
  }

  // Room in the trunk: sell what isn't wanted (a market), or put shine in the stash (the barn).
  makeRoom(cells, why) {
    const want = this.wanted(), left = {};
    let sell = 0, store = 0;
    for (const p of this.g.trunk.pieces.values()) {
      left[p.kind] = (left[p.kind] ?? (want[p.kind] || 0)) - 1;
      if (left[p.kind] >= 0 || KINDS[p.kind].gear) continue;
      if (KINDS[p.kind].brewed) store += this.cells(p.kind); else sell += this.cells(p.kind);
    }
    if (sell && (sell >= cells - this.free() || !store)) return { go: this.near(this.markets()), near: 6, why: `make room: sell what isn't needed (${why})` };
    if (store) return { go: this.barn, near: 3, why: `make room: stash the shine (${why})`, screen: 'barn' };
    return { wait: 'room', why: `${why}: no room in the trunk for it` };
  }

  // The nearest regular site, open now, that gives `kind` up.
  salvageFor(kind, why) {
    const g = this.g, day = dayOf(g.dredge.market), p = g.player.position, K = CONFIG.dredge.salvage.kinds;
    if (this.free() < 4) return this.makeRoom(4, `room for salvage (${why})`);
    const sites = g.salvage.sites.filter((s) => !s.story && (!kind || K[s.kind].yields[kind]) && (!K[s.kind].gear || g._gear(K[s.kind].gear))
      && g.salvage.status(s, day, this.hour) === 'ok' && !this.tried(s.id));
    if (!sites.length) return { wait: 'salvage', why: `${why}: no site open that gives ${kind ? KINDS[kind].name : 'anything'}` };
    const s = sites.reduce((a, b) => (away({ x: b.stopX, z: b.stopZ }, p) < away({ x: a.stopX, z: a.stopZ }, p) ? b : a));
    return { go: { x: s.stopX, z: s.stopZ }, near: 3, why: `work the ${s.name.toLowerCase()}${kind ? ` for ${KINDS[kind].name}` : ''} (${why})`, key: s.id };
  }

  // Cash: sell what's aboard if it's worth it, else salvage.
  earn(target, why) {
    const T = this.g.trunk, want = this.wanted();
    let spare = 0;
    for (const p of T.pieces.values()) if (!(want[p.kind] > 0) && !KINDS[p.kind].gear && !KINDS[p.kind].brewed) spare += KINDS[p.kind].value;
    if (spare > 0 && (spare + this.d.cash >= target || T.used >= T.size * 0.6)) return { go: this.near(this.markets()), near: 6, why: `sell for cash (${why})`, sell: true };
    if (this.night() && this.surplusShine() > 0) return { go: this.near(this.g.world.drops), near: 4, why: `sell shine at a speakeasy (${why})` };
    return this.salvageFor(null, `cash: ${why}`);
  }

  surplusShine() { const w = this.wanted(); let n = 0; for (const r of RECIPES) n += Math.max(0, this.count(r.id) - (w[r.id] || 0)); return n; }

  // Nothing to do this minute: keep some shine on hand, court a side story, sleep till the
  // hour, or earn.
  idle(waits) {
    const d = this.d, g = this.g;
    const corn = this.have('corn-shine');
    if ((d.still || 0) >= 1 && corn < 6 && d.cash >= 250) { const r = this.brew('corn-shine', 1, 'shine on hand'); if (r.go) return r; }
    // A side story whose contact's trust falls short: court it from the notebook.
    if (!current(d).step?.who && !d.follow) {
      const arc = ARCS.find((a) => !d.arcs?.[a.id]?.open && (d.chapter || 0) >= (a.chapter || 0) && !arcReady(d, a) && !this.courted.has(a.id));
      if (arc) { this.courtId = arc.id; this.courted.add(arc.id); return { go: null, why: `court ${arc.title}`, screen: 'notebook' }; }
    }
    // Waiting on the hour: sleep at the barn (a player's way), or work a site meanwhile.
    const wait = waits.find((w) => w.wait === 'night' || w.wait === 'window');
    if (wait) {
      const id = this.sleepFor(wait);
      if (id && d.cash >= 150) { this.sleepId = id; return { go: this.barn, near: 3, why: `sleep till ${id} (${wait.why})`, screen: 'barn' }; }
    }
    if (d.cash < 600 || g.trunk.count) return this.earn(600, waits[0]?.why || 'nothing else to do');
    const w = waits[0];
    if (w?.at && w.wait !== 'event') return { go: { x: w.at.stopX ?? w.at.x, z: w.at.stopZ ?? w.at.z }, near: 6, why: `wait for ${w.why}` };
    return this.salvageFor(null, w?.why || 'nothing else to do');
  }

  // Which nap gets to the hour a wait wants (the barn's options, main._sleeps).
  sleepFor(w) {
    const opts = this.g._sleeps().map((o) => o.id), dusk = duskHour(this.g.env.winter);
    if (w.wait === 'night' && w.at && this.crosses(w.at) && this.side(w.at) === 'city') return null;
    if (w.wait === 'night' && opts.includes('dusk') && dusk - this.hour > 1) return 'dusk';
    if (w.wait === 'window' && opts.includes('window')) return 'window';
    if (w.wait === 'window' && w.window && !this.night(w.window[0]) && opts.includes('morning')) return 'morning';
    return null;
  }

  // ---------- The choice ----------
  endgame() {
    const g = this.g, d = this.d, e = this.bot.ending;
    if (!e) return { wait: 'choice', why: 'the choice' };
    const site = (id) => g.salvage.sites.find((x) => x.story === id);
    if (e === 'paper') { const s = site('sun'); return { go: { x: s.stopX, z: s.stopZ }, near: 3, why: 'the paper: the Sun' }; }
    if (e === 'deed') {
      if (d.cash < CONFIG.dredge.deed.cost) return this.earnBig(CONFIG.dredge.deed.cost, 'the deed');
      const t = CONFIG.dredge.towns.find((x) => x.id === CONFIG.dredge.deed.town);
      return { go: { x: t.x, z: t.z }, near: 6, why: 'the deed: Lexington Market' };
    }
    if (e === 'crown') {
      if (!crownReady(d)) return this.crownTrust();
      const s = site('crown');
      return { go: { x: s.stopX, z: s.stopZ }, near: 3, why: 'the crown: the courthouse steps' };
    }
    return { wait: 'choice', why: e };
  }

  // Big money: shine to the speakeasies at night (brewed by day), salvage between.
  earnBig(target, why) {
    const corn = this.have('corn-shine');
    if (corn < 6 && this.d.cash > 150) { const r = this.brew('corn-shine', 1, why); if (r.go) return r; }
    if (this.night()) {
      if (this.count('corn-shine') < 3 && this.stash('corn-shine')) return this.gather('corn-shine', Math.min(8, this.have('corn-shine')), why);
      if (this.surplusShine() > 0) return { go: this.near(this.g.world.drops), near: 4, why: `sell shine (${why})` };
    }
    return this.earn(target, why);
  }

  // The crown wants five city contacts at ★★★: take their orders whenever the boards have one.
  crownTrust() {
    const d = this.d, g = this.g;
    const short = CITY.filter((w) => trustLevel(d.trust[w]) < 3);
    for (const o of d.orders.filter((x) => short.includes(x.who))) { const r = this.planOrder(o); if (r.go) return r; }
    const offers = g._jobs().offers().filter((o) => short.includes(o.who) && !o.bounty);
    if (offers.length && d.orders.filter((o) => !o.story).length < CONFIG.dredge.contracts.book) {
      this.toTake = offers.slice(0, CONFIG.dredge.contracts.book - d.orders.filter((o) => !o.story).length).map((o) => o.id);
      return { go: this.near([...this.markets(), this.barn]), near: 6, why: 'the crown: orders from the city’s speakeasies' };
    }
    return this.earnBig(1e9, 'the crown: waiting on the city’s orders');
  }

  // ---------- At a screen ----------
  // Each returns a note when it did something (the hands call again), or null when done.
  atMarket() {
    const g = this.g, T = g.trunk, want = this.wanted();
    this.visit ??= { sold: new Set(), upgraded: false };
    // Sell what isn't wanted, a kind at a time.
    for (const k of new Set([...T.pieces.values()].map((p) => p.kind))) {
      if ((want[k] || 0) > 0 || this.visit.sold.has(k)) continue;
      this.visit.sold.add(k);
      const b = live(`#market-body [data-id="${k}"]`);
      if (b) { b.click(); this.bot.count('sales'); return `sold ${k}`; }
    }
    if (this.bot.ending === 'deed' && live('#market-body [data-id="deed"]')) { $('#market-body [data-id="deed"]').click(); return 'the deed'; }
    for (const id of this.toDrop.splice(0)) { const b = live(`#market-body [data-id="job-drop-${id}"]`); if (b) { b.click(); return `dropped ${id}`; } }
    for (const id of this.toTake.splice(0)) { const b = live(`#market-body [data-id="job-${id}"]`); if (b) { b.click(); this.bot.count('orders'); return `took ${id}`; } }
    for (const [k, n] of Object.entries(this.toBuy)) {
      if (this.count(k) >= n) { delete this.toBuy[k]; continue; }
      const b = live(`#market-body [data-id="supply-${k}"]`);
      if (b) { b.click(); return `bought ${k}`; }
      // (not this time: no room for it, or not the cash; the next plan sees to that)
      this.blocked = $(`#market-body [data-id="supply-${k}"]`)?.textContent === 'NO ROOM' ? 'room' : 'cash';
      delete this.toBuy[k];
      return `couldn't buy ${k} (${this.blocked})`;
    }
    // An upgrade, with cash to spare (one a visit).
    if (!this.visit.upgraded) {
      this.visit.upgraded = true;
      const reserve = 700 + (this.bot.ending === 'deed' ? CONFIG.dredge.deed.cost : 0);
      for (const id of UPGRADES) {
        const b = live(`#market-body [data-id="up-${id}"]`), cost = g.dredge.nextCost(id);
        if (b && cost != null && g.dredge.cash - cost >= reserve) { b.click(); this.bot.count('upgrades'); return `upgrade ${id}`; }
      }
    }
    return null;
  }

  atBarn() {
    const d = this.d, want = this.wanted();
    this.visit ??= { brewed: 0, stored: false };
    if ((d.still || 0) < 1 && live('#barn-body [data-id="install-coil"]')) { $('#barn-body [data-id="install-coil"]').click(); return 'fitted the coil'; }
    if (!this.visit.repaired && (d.wear || 0) > 0.12 && d.cash >= this.g.dredge.repairCost(this.g.trunk.cracked.length) + 60 && live('#barn-body [data-id="repair"]')) { this.visit.repaired = true; $('#barn-body [data-id="repair"]').click(); this.bot.count('repairs'); return 'repaired the truck'; }
    for (const id of this.brewList) {
      const b = live(`#barn-body [data-id="brew-${id}"]`);
      this.brewList = this.brewList.filter((x) => x !== id);
      if (b && this.visit.brewed < 3) { this.visit.brewed++; b.click(); return `brewing ${id}`; }
    }
    // Store shine that isn't wanted aboard (the stash keeps it), so the trunk has room.
    // (a piece a call, until none is left over)
    if (!this.visit.stored) {
      for (const p of [...this.g.trunk.pieces.values()]) {
        if ((want[p.kind] || 0) >= this.count(p.kind) || KINDS[p.kind].gear) continue;
        const b = live(`#barn-body [data-id="store-${p.kind}"]`);
        if (b && KINDS[p.kind].brewed) { b.click(); return `stored ${p.kind}`; }
      }
      this.visit.stored = true;
    }
    for (const [k, n] of Object.entries(this.takeList)) {
      if (this.count(k) >= n) { delete this.takeList[k]; continue; }
      const b = live(`#barn-body [data-id="take-${k}"]`);
      if (b) { b.click(); return `took ${k} from the stash`; }
      // (no room for it: store what isn't wanted here, else the next plan makes room)
      for (const p of [...this.g.trunk.pieces.values()]) {
        if ((want[p.kind] || 0) >= this.count(p.kind) || KINDS[p.kind].gear) continue;
        const s = live(`#barn-body [data-id="store-${p.kind}"]`);
        if (s) { s.click(); return `stored ${p.kind} (room for ${k})`; }
      }
      if (this.stash(k) > 0) this.blocked = 'room';
      delete this.takeList[k];
    }
    for (const id of this.toDrop.splice(0)) { const b = live(`#barn-body [data-id="job-drop-${id}"]`); if (b) { b.click(); return `dropped ${id}`; } }
    for (const id of this.toTake.splice(0)) { const b = live(`#barn-body [data-id="job-${id}"]`); if (b) { b.click(); this.bot.count('orders'); return `took ${id}`; } }
    if (this.sleepId) {
      const b = live(`#barn-body [data-id="sleep-${this.sleepId}"]`);
      const id = this.sleepId;
      this.sleepId = null;
      if (b) { b.click(); this.bot.count('sleeps'); return `slept (${id})`; }
    }
    return null;
  }

  atNotebook() {
    if (this.courtId) {
      const b = live(`[data-court="${this.courtId}"]`);
      this.bot.note(b ? `courting ${this.courtId}` : `couldn't court ${this.courtId}`);
      this.courtId = null;
      if (b) { b.click(); return 'courted'; }
    }
    return null;
  }

  confirm(title, text) {
    const yes = $('#confirm-yes').textContent, e = this.bot.ending;
    if (title === 'THE CROWN?') return e === 'crown';
    if (title === 'THE PAPER?') return e === 'paper';
    if (title === 'BUY THE DEED?') return e === 'deed';
    if (title === 'THE LAUNCH?') return this.wantLaunch;
    if (title === 'SLEEP?' || title === 'STOCK BRAUN’S?') return true;
    if (title === 'LEAVE A DROP BOX?' || title === 'THE DROP BOX' || title === 'QUIT?') return false;
    if (/^PAY \$/.test(yes)) return true;      // a story deal: only ever gone to on purpose
    this.bot.find('CONFIRM', `An unexpected question: “${title}” (${text.slice(0, 80)})`);
    return false;
  }
}
