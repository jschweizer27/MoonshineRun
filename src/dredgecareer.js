import { CONFIG } from './config.js';
import { loadJSON, saveJSON } from './save.js';
import { Trunk } from './trunk.js';

// The dredge run's saved progress, kept apart from the bootlegging career: cash, what's in
// the trunk, upgrade levels, the markets' memory (gluts and the in-game clock), stats and a
// ledger.
const KEY = 'shine.dredge.v1';
const DEFAULT = {
  version: 1,
  cash: 0,
  trunk: null,               // Trunk.toJSON()
  upgrades: { trunk: 0, engine: 0, handling: 0, magnet: 0, spotter: 0 },
  market: { sold: {}, clock: 0 },
  stats: { earned: 0, sold: 0, playSeconds: 0 },
  ledger: [],                // newest first, capped
};

export class DredgeCareer {
  constructor() { this.load(); }

  load() {
    const d = loadJSON(KEY, DEFAULT);
    d.market = { ...DEFAULT.market, ...(d.market || {}) };
    d.market.sold = { ...(d.market.sold || {}) };
    d.stats = { ...DEFAULT.stats, ...(d.stats || {}) };
    d.upgrades = { ...DEFAULT.upgrades, ...(d.upgrades || {}) };
    d.ledger = Array.isArray(d.ledger) ? d.ledger : [];
    this.data = d;
  }

  save() { saveJSON(KEY, this.data); }

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

  buy(id) {
    const cost = this.nextCost(id);
    if (cost == null || this.data.cash < cost) return false;
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
