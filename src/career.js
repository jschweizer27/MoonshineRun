import { loadJSON, saveJSON } from './save.js';
import { CONFIG } from './config.js';

// Otto's saved progress: money, upgrades, story, bribes, stats and the ledger.
const KEY = 'shine.career.v1';

// Garage upgrades, framed as the Treatment's "County Specialists".
export const UPGRADES = {
  engine: {
    name: 'Mechanic', what: 'Souped-up engine', desc: 'Higher top speed and quicker acceleration.',
    costs: [900, 2200, 4500],
  },
  handling: {
    name: 'Wheelman', what: 'Driving lessons', desc: 'Better grip and sharper steering.',
    costs: [600, 1500, 3200],
  },
  cargo: {
    name: 'Still-master', what: 'Bigger batches', desc: 'More jugs per run. Level 1 unlocks big orders.',
    costs: [1000, 2400, 5000],
  },
  armor: {
    name: 'Enforcer', what: 'Armored horse box', desc: 'Takes longer to pin down, and shrugs off rams.',
    costs: [700, 1800, 3800],
  },
};
export const BRIBE_COST = 4000;

const DEFAULT = {
  version: 1,
  started: false,
  cash: 0,
  upgrades: { engine: 0, handling: 0, cargo: 0, armor: 0 },
  cars: { rolls: false },    // motor cars bought at the garage
  ride: 'truck',             // what Otto drives: 'truck' (with the horse box) or 'rolls'
  story: {},                 // beat id -> true once seen
  bribes: { county: false },
  stats: { earned: 0, deliveries: 0, busts: 0, fines: 0, jugs: 0, bestStreak: 0, bestStreakRuns: 0, playSeconds: 0 },
  ledger: [],                // newest first, capped
};

export class Career {
  constructor() { this.load(); }

  load() {
    const d = loadJSON(KEY, DEFAULT);
    this.data = {
      ...structuredClone(DEFAULT), ...d,
      upgrades: { ...DEFAULT.upgrades, ...(d.upgrades || {}) },
      cars: { ...DEFAULT.cars, ...(d.cars || {}) },
      stats: { ...DEFAULT.stats, ...(d.stats || {}) },
      bribes: { ...DEFAULT.bribes, ...(d.bribes || {}) },
      story: { ...(d.story || {}) },
      ledger: Array.isArray(d.ledger) ? d.ledger : [],
    };
  }

  save() { saveJSON(KEY, this.data); }

  reset() {
    this.data = structuredClone(DEFAULT);
    this.save();
  }

  get cash() { return this.data.cash; }
  get started() { return this.data.started; }
  level(id) { return this.data.upgrades[id] || 0; }
  seen(beat) { return !!this.data.story[beat]; }
  markSeen(beat) { this.data.story[beat] = true; this.save(); }

  nextCost(id) {
    const lvl = this.level(id);
    return lvl < UPGRADES[id].costs.length ? UPGRADES[id].costs[lvl] : null;
  }

  buy(id) {
    const cost = this.nextCost(id);
    if (cost == null || this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.upgrades[id] += 1;
    this.save();
    return true;
  }

  get ride() { return this.data.ride === 'rolls' && this.data.cars.rolls ? 'rolls' : 'truck'; }

  // The Rolls-Royce: bought once, then Otto can switch between it and the truck.
  buyRolls() {
    if (this.data.cars.rolls || this.data.cash < CONFIG.rolls.cost) return false;
    this.data.cash -= CONFIG.rolls.cost;
    this.data.cars.rolls = true;
    this.data.ride = 'rolls';
    this.save();
    return true;
  }

  setRide(ride) {
    if (ride === 'rolls' && !this.data.cars.rolls) return false;
    this.data.ride = ride === 'rolls' ? 'rolls' : 'truck';
    this.save();
    return true;
  }

  bribeCounty() {
    if (this.data.bribes.county || this.data.cash < BRIBE_COST) return false;
    this.data.cash -= BRIBE_COST;
    this.data.bribes.county = true;
    this.save();
    return true;
  }

  addEntry(entry) {
    this.data.ledger.unshift({ ...entry, at: Date.now() });
    this.data.ledger.length = Math.min(this.data.ledger.length, 40);
  }

  // A delivery was paid.
  deliver({ pay, jugs, route, seconds, maxHeat, streak, streakRuns }) {
    const s = this.data.stats;
    this.data.cash += pay;
    s.earned += pay;
    s.deliveries += 1;
    s.jugs += jugs;
    if (streak > s.bestStreak) { s.bestStreak = streak; s.bestStreakRuns = streakRuns; }
    this.addEntry({ result: 'delivered', pay, jugs, route, seconds: Math.round(seconds), maxHeat });
    this.save();
  }

  // Busted: lose the cargo, pay a fine, end the streak. Returns what it cost.
  bust({ jugs, value, route, seconds, maxHeat, streak = 0, streakRuns = 0 }) {
    const s = this.data.stats;
    const fine = Math.min(this.data.cash, Math.max(100, Math.round(this.data.cash * 0.1)));
    this.data.cash -= fine;
    s.busts += 1;
    s.fines += fine;
    if (streak > s.bestStreak) { s.bestStreak = streak; s.bestStreakRuns = streakRuns; }
    this.addEntry({ result: 'busted', pay: -fine, jugs, route, seconds: Math.round(seconds), maxHeat, lost: value });
    this.save();
    return { fine };
  }

  // Player-facing multipliers from upgrades.
  // In the Rolls there's no horse box: no disguise, no armoured box, and a smaller load.
  get perks() {
    const u = this.data.upgrades, rolls = this.ride === 'rolls', R = CONFIG.rolls;
    return {
      speed: (1 + 0.08 * u.engine) * (rolls ? R.speed : 1),
      accel: (1 + 0.12 * u.engine) * (rolls ? R.accel : 1),
      grip: 1 + 0.15 * u.handling,
      turn: 1 + 0.08 * u.handling,
      jugs: 1 + 0.25 * u.cargo,
      maxJugs: rolls ? R.trunkJugs : Infinity,
      bigOrders: u.cargo >= 1 && !rolls,
      bustTime: rolls ? 0 : 0.6 * u.armor,
      ramResist: rolls ? 1 : 1 - 0.18 * u.armor,
      suspicion: rolls ? R.suspicion : 1,
      trailer: !rolls,
      ride: rolls ? 'rolls' : 'truck',
    };
  }
}
