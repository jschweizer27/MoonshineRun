import { CONFIG } from './config.js';
import { loadJSON, saveJSON, removeKey } from './save.js';
import { Trunk, KINDS } from './trunk.js';
import { CHAPTERS, ENDINGS } from './chapters.js';

// Otto's saved progress: cash, what's in the trunk, upgrade levels, the markets' memory
// (gluts and the in-game clock), stats and a ledger. There are three save slots; slot 1
// keeps the original key, so saves from before the slots carry straight over. (The key
// dates from when this run was built beside the bootlegging game; old bootlegging saves
// are simply ignored.)
export const SLOTS = 3;
const BASE = 'shine.dredge.v1';
const SLOT_KEY = 'shine.dredge.slot';     // the slot played last
const keyFor = (slot) => (slot === 1 ? BASE : `${BASE}.s${slot}`);
const DEFAULT = {
  version: 1,
  started: false,            // a run has been started in this slot
  cash: 0,
  trunk: null,               // Trunk.toJSON()
  upgrades: { trunk: 0, engine: 0, handling: 0, magnet: 0, spotter: 0, tyres: 0, lamps: 0, plating: 0, falsebottom: 0 },
  market: { sold: {}, clock: 21.5, blend: {} },   // clock: game hours from midnight of day 0 (a new game starts at 21:30)
  stash: {},                 // loot kept at Otto's barn: kind -> count
  wear: 0,                   // 0 (sound) .. 1 (worn out): costs top speed until repaired
  still: 0,                  // the still's level: copper coils installed (0 = can't brew yet)
  rep: 0,                    // reputation, from contracts, brews and rare finds
  rank: 0,                   // CONFIG.dredge.ranks index reached (it never drops)
  orders: [],                // the order book: offers from contracts.js taken, each plus `due` (game hours)
  trust: {},                 // contact (story.js CAST id) -> trust points (contracts.js trustLevel)
  delivered: {},             // contact -> orders delivered
  scenes: {},                // contact -> true once they've opened up at a handoff
  best: {},                  // recipe -> the best batch's quality
  chapter: 0,                // CHAPTERS index (chapters.js); past the last when they're all done
  steps: {},                 // chapter step id -> true once done
  opened: {},                // chapter id -> true once its opening card has played
  clues: {},                 // clue id -> true once found
  tools: {},                 // tool id -> true once earned
  ending: null,              // 'deed' or 'paper' once an ending is chosen (chapters.js ENDINGS)
  sites: {},                 // salvage site id -> the game day it was worked (it refills a day or two on)
  taken: {},                 // offer ids already taken (done, failed or dropped), so they don't come back
  stats: { earned: 0, sold: 0, playSeconds: 0, distance: 0, rares: 0, brews: 0, contracts: 0 },
  stepTimes: {},             // chapter step id -> stats.playSeconds when it was done (the ledger's minutes per chapter)
  story: {},                 // beat id -> true once its cards have played (story.js)
  flags: {},                 // milestones the story reads: valley (reached a valley town), ...
  ledger: [],                // newest first, capped
};

// Whether a slot's data has been played (saves from before `started` count by their stats).
const played = (d) => !!(d.started || d.stats?.playSeconds > 0 || d.stats?.earned > 0 || d.cash > 0);

export class DredgeCareer {
  constructor(slot = DredgeCareer.lastSlot()) {
    this.slot = slot;
    this.load();
  }

  static lastSlot() {
    const s = loadJSON(SLOT_KEY, { slot: 1 }).slot;
    return Number.isInteger(s) && s >= 1 && s <= SLOTS ? s : 1;
  }

  // A slot at a glance, for the saved-games screen, without switching to it.
  static summary(slot) {
    const d = loadJSON(keyFor(slot), structuredClone(DEFAULT)), st = { ...DEFAULT.stats, ...(d.stats || {}) };
    return { slot, started: played(d), cash: d.cash || 0, sold: st.sold, earned: st.earned, playSeconds: st.playSeconds };
  }

  // Play from another slot (it becomes the one loaded next visit too).
  useSlot(slot) {
    this.slot = slot;
    saveJSON(SLOT_KEY, { slot });
    this.load();
  }

  // Wipe a slot (the loaded one is left empty and ready for a new game).
  erase(slot = this.slot) {
    removeKey(keyFor(slot));
    if (slot === this.slot) this.load();
  }

  get started() { return played(this.data); }

  // A fresh copy of the defaults under whatever was saved (nothing shared between slots or
  // with DEFAULT), with anything a save from an older version (or a damaged one) has wrong
  // put right.
  load() {
    const d = loadJSON(keyFor(this.slot), structuredClone(DEFAULT));
    d.market = { ...DEFAULT.market, ...(d.market || {}) };
    d.market.sold = { ...(d.market.sold || {}) };
    d.market.blend = { ...(d.market.blend || {}) };
    d.stats = { ...DEFAULT.stats, ...(d.stats || {}) };
    d.upgrades = { ...DEFAULT.upgrades, ...(d.upgrades || {}) };
    d.ledger = Array.isArray(d.ledger) ? d.ledger : [];
    d.story = { ...(d.story || {}) };
    d.stash = { ...(d.stash || {}) };
    d.taken = { ...(d.taken || {}) };
    // The order book (saves from before it had one contract at a time). Orders from before
    // the contacts (no `who`) are dropped: nobody is waiting on them.
    d.orders = Array.isArray(d.orders) ? d.orders : [];
    if (d.contract) { d.orders.push(d.contract); delete d.contract; }
    d.orders = d.orders.filter((o) => o && o.who && o.wants && typeof o.x === 'number');
    for (const k of ['trust', 'delivered', 'scenes', 'best', 'steps', 'opened', 'clues', 'tools', 'sites', 'stepTimes']) d[k] = { ...(d[k] || {}) };
    d.chapter = Math.max(0, Math.min(CHAPTERS.length, Math.floor(Number(d.chapter) || 0)));
    d.rank = Math.max(0, Math.min(CONFIG.dredge.ranks.length - 1, Math.floor(Number(d.rank) || 0)));
    d.wear = Math.max(0, Math.min(1, Number(d.wear) || 0));
    d.flags = { ...(d.flags || {}) };
    d.ending = ENDINGS[d.ending] ? d.ending : null;
    if (!Number.isFinite(d.market.clock)) d.market.clock = DEFAULT.market.clock;
    // Bribery waits on chapter 4 now; a save whose Sheriff already took envelopes keeps it.
    if (d.flags.bribery == null && (d.trust.sheriff || 0) >= CONFIG.dredge.contracts.trustPer * 3) d.flags.bribery = true;
    this.data = d;
  }

  save() { saveJSON(keyFor(this.slot), this.data); }

  reset() {
    this.data = structuredClone(DEFAULT);
    this.save();
  }

  get cash() { return this.data.cash; }

  level(id) { return this.data.upgrades[id] || 0; }

  nextCost(id) {
    const costs = CONFIG.dredge.upgrades[id].costs, lvl = this.level(id);
    return lvl < costs.length ? costs[lvl] : null;
  }

  // The rank the next level of an upgrade waits for, or null if it's open (or maxed).
  lockedRank(id) {
    const u = CONFIG.dredge.upgrades[id], need = u.ranks?.[this.level(id)] || 0;
    return this.level(id) < u.costs.length && need > (this.data.rank || 0) ? need : null;
  }

  buy(id) {
    const cost = this.nextCost(id);
    if (cost == null || this.data.cash < cost || this.lockedRank(id) != null) return false;
    this.data.cash -= cost;
    this.data.upgrades[id] = this.level(id) + 1;
    this.data.ledger.unshift({ t: Date.now(), text: `${CONFIG.dredge.upgrades[id].name} (level ${this.data.upgrades[id]})`, amount: -cost });
    this.data.ledger.length = Math.min(this.data.ledger.length, 40);
    this.save();
    return true;
  }
  get market() { return this.data.market; }

  loadTrunk() {
    try { return this.data.trunk ? Trunk.fromJSON(this.data.trunk) : new Trunk(); } catch { return new Trunk(); }
  }

  saveTrunk(trunk) {
    this.data.trunk = trunk.toJSON();
    this.save();
  }

  // The stash at the barn, in trunk cells.
  stashCells() {
    let n = 0;
    for (const [kind, count] of Object.entries(this.data.stash)) n += (KINDS[kind]?.cells.length || 0) * count;
    return n;
  }

  // What a repair costs now (worn more, costs more).
  repairCost() { return Math.ceil(this.data.wear * CONFIG.dredge.wear.repairCost); }

  repair() {
    const cost = this.repairCost();
    if (!cost || this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.wear = 0;
    this.data.ledger.unshift({ t: Date.now(), text: 'Repairs at the barn', amount: -cost });
    this.data.ledger.length = Math.min(this.data.ledger.length, 40);
    this.save();
    return true;
  }

  // A sale at a market: cash, stats and a ledger line.
  sold({ total, count, town, trunk }) {
    this.data.cash += total;
    this.data.stats.earned += total;
    this.data.stats.sold += count;
    this.data.ledger.unshift({ t: Date.now(), text: `Sold ${count} piece${count === 1 ? '' : 's'} at ${town}`, amount: total });
    this.data.ledger.length = Math.min(this.data.ledger.length, 40);
    this.data.trunk = trunk.toJSON();
    this.save();
  }
}
