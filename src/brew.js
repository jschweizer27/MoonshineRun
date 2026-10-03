import { CONFIG } from './config.js';
import { KINDS } from './trunk.js';

// Brewing at Otto's still. Pure logic (no DOM): recipes, what's on hand, taking the
// ingredients, and a batch at the still (CONFIG.dredge.brew).
const B = CONFIG.dredge.brew;

export const RECIPES = B.recipes.map((r) => ({ ...r, name: KINDS[r.id].name }));

// Loot on hand, counted by kind, from the trunk and the stash together.
export function onHand(trunk, stash) {
  const n = { ...stash };
  for (const p of trunk.pieces.values()) n[p.kind] = (n[p.kind] || 0) + 1;
  return n;
}

// What a recipe still lacks: [[kind, how many more], ...].
export function missing(recipe, have) {
  return Object.entries(recipe.needs).filter(([k, n]) => (have[k] || 0) < n).map(([k, n]) => [k, n - (have[k] || 0)]);
}

export function canBrew(recipe, have, level, rank = 0) {
  return level >= 1 && rank >= recipe.rank && missing(recipe, have).length === 0;
}

// Take a recipe's ingredients, from the stash first and then the trunk.
export function consume(recipe, trunk, stash) {
  for (const [kind, need] of Object.entries(recipe.needs)) {
    let left = need;
    const fromStash = Math.min(left, stash[kind] || 0);
    if (fromStash) { stash[kind] -= fromStash; if (!stash[kind]) delete stash[kind]; left -= fromStash; }
    for (const p of [...trunk.pieces.values()]) {
      if (!left) break;
      if (p.kind === kind) { trunk.remove(p.id); left--; }
    }
  }
}

// A batch at the still: the temperature, the drifting band, time spent in it.
export function newBatch(level) {
  return { t: 0, temp: 0.3, center: B.band.center, width: B.band.width[Math.max(0, Math.min(level, B.maxLevel) - 1)], inBand: 0, scorched: 0, done: false };
}

// Advance a batch `dt` seconds, stoking (raising the temperature) or not.
export function stepBatch(b, dt, stoke) {
  if (b.done) return b;
  dt = Math.min(dt, B.seconds - b.t);
  b.t += dt;
  b.temp = Math.max(0, Math.min(1, b.temp + (stoke ? B.heat.up : -B.heat.down) * dt));
  // The band wanders: two slow waves, so it isn't a simple rhythm.
  const w = b.t * B.band.speed;
  b.center = B.band.center + B.band.drift * (0.7 * Math.sin(w) + 0.3 * Math.sin(w * 2.3 + 1.1));
  if (Math.abs(b.temp - b.center) <= b.width / 2) b.inBand += dt;
  if (b.temp > B.scorch) b.scorched += dt;
  b.done = b.t >= B.seconds - 1e-9;
  return b;
}

// 0..1: the share of the batch spent in the band, less time scorching.
export function quality(b) {
  return Math.max(0, Math.min(1, (b.inBand - b.scorched) / B.seconds));
}

// How many crates a batch of this quality yields.
export function yieldFor(q) {
  for (const [least, crates] of B.yields) if (q >= least) return crates;
  return 1;
}
