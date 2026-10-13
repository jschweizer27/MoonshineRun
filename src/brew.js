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

export function canBrew(recipe, have, level, learned = {}) {
  return level >= 1 && (!recipe.learn || !!learned[`learned:${recipe.id}`]) && missing(recipe, have).length === 0;
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

// A batch at the still, in three phases: the fire (the temperature, the drifting band, time
// spent in it), the cuts (the run coming off: heads, hearts, tails) and proofing (the bead
// swinging over the gauge). `recipe` sets its pattern; `level` (coils) its margins.
export function newBatch(level, recipe = RECIPES[0]) {
  const L = Math.max(1, Math.min(level || 1, B.maxLevel));
  const tol = recipe.tol * (1 + B.cuts.levelTol * (L - 1));
  return {
    recipe: recipe.id, phase: 'fire', t: 0, temp: 0.3, center: B.band.center, width: B.band.width[L - 1], inBand: 0, scorched: 0,
    heat: recipe.heat || 1, drift: recipe.drift || 1,
    cuts: { t: 0, pos: 0, marks: recipe.hearts, tol, at: [], poison: false },
    proof: { t: 0, pos: 0.5, line: recipe.proof, at: null },
    done: false,
  };
}

// Where the run is at `t` seconds into the cuts (0..1): slow at first, quickening.
const runAt = (t) => Math.min(1, (t / B.cuts.seconds) ** 1.25);
// Where the bead is at `t` seconds into proofing (0..1), swinging faster as it goes.
const beadAt = (t) => 0.5 + B.proof.swing * Math.sin(t * B.proof.speed * (1 + t * B.proof.speedUp));

// Advance a batch `dt` seconds. In the fire, `stoke` raises the temperature (or not); the
// cuts and proofing only run on (presses go through pressBatch).
export function stepBatch(b, dt, stoke) {
  if (b.done) return b;
  if (b.phase === 'fire') {
    dt = Math.min(dt, B.seconds - b.t);
    b.t += dt;
    b.temp = Math.max(0, Math.min(1, b.temp + (stoke ? B.heat.up * b.heat : -B.heat.down) * dt));
    // The band wanders: two slow waves, so it isn't a simple rhythm.
    const w = b.t * B.band.speed;
    b.center = B.band.center + B.band.drift * b.drift * (0.7 * Math.sin(w) + 0.3 * Math.sin(w * 2.3 + 1.1));
    if (Math.abs(b.temp - b.center) <= b.width / 2) b.inBand += dt;
    if (b.temp > B.scorch) b.scorched += dt;
    if (b.t >= B.seconds - 1e-9) b.phase = 'cuts';
  } else if (b.phase === 'cuts') {
    const c = b.cuts;
    c.t = Math.min(B.cuts.seconds, c.t + dt);
    c.pos = runAt(c.t);
    if (c.t >= B.cuts.seconds - 1e-9) b.phase = 'proof';
  } else if (b.phase === 'proof') {
    const p = b.proof;
    p.t = Math.min(B.proof.seconds, p.t + dt);
    p.pos = beadAt(p.t);
    if (p.t >= B.proof.seconds - 1e-9) b.done = true;
  }
  if (b.done) b.phase = 'done';
  return b;
}

// A press: in the cuts, a cut where the run is now (the first two count); in proofing, the
// proof read where the bead is (once, and that's the batch done). The first moments of a
// phase ignore presses, so a key still held from the fire doesn't cut. Returns whether it
// counted.
export function pressBatch(b) {
  if (b.phase === 'cuts') {
    const c = b.cuts;
    if (c.t < B.cuts.lead || c.at.length >= 2) return false;
    c.at.push(c.pos);
    return true;
  }
  if (b.phase === 'proof') {
    const p = b.proof;
    if (p.t < B.cuts.lead || p.at != null) return false;
    p.at = p.pos;
    b.done = true;
    b.phase = 'done';
    return true;
  }
  return false;
}

// 0..1 for the fire: the share of it spent in the band, less time scorching.
export function fireScore(b) {
  return Math.max(0, Math.min(1, (b.inBand - b.scorched) / B.seconds));
}

// 0..1 for the cuts, and whether heads got into the hearts (a bad batch). Early into the
// hearts is poison, late loses hearts; late out of them lets the weak tails in. No first
// cut at all is the whole run in one jar, heads and all; no second, tails to the end.
export function cutScore(b) {
  const c = b.cuts, [h1, h2] = c.marks, tol = c.tol;
  const c1 = c.at[0] ?? 0, c2 = c.at[1] ?? 1;
  const e1 = c.at.length ? c1 - h1 : -1, e2 = c2 - h2;
  const poison = e1 < -tol;
  const p1 = e1 < 0 ? (-e1 / tol) * 0.5 : (e1 / tol) * 0.25;
  const p2 = e2 > 0 ? (e2 / tol) * 0.35 : (-e2 / tol) * 0.2;
  return { score: poison ? 0 : Math.max(0, Math.min(1, 1 - p1 - p2)), poison };
}

export function proofScore(b) {
  const p = b.proof;
  return p.at == null ? 0 : Math.max(0, 1 - Math.abs(p.at - p.line) / (B.proof.tol * 2.5));
}

// 0..1: the three phases, weighted. Before the cuts start it's the fire alone.
export function quality(b) {
  if (b.phase === 'fire') return fireScore(b);
  const W = B.weights;
  return Math.max(0, Math.min(1, W.fire * fireScore(b) + W.cuts * cutScore(b).score + W.proof * proofScore(b)));
}

export const isBad = (b) => b.phase !== 'fire' && cutScore(b).poison;

// A grade from a quality (or 'C' for a bad batch).
export function gradeOf(q, bad = false) {
  if (bad) return 'C';
  for (const [g, least] of B.grades) if (q >= least) return g;
  return 'C';
}

// How many crates a batch of this quality yields.
export function yieldFor(q) {
  for (const [least, crates] of B.yields) if (q >= least) return crates;
  return 1;
}

// The blend: a recipe's crates on hand are one stock. A new batch mixes in by crate count
// (`onHand` crates already there); a bad one taints it until it's all gone. `blends` is the
// save's { [recipe]: { q, bad } }.
export function blend(blends, recipeId, onHandCount, crates, q, bad) {
  const was = onHandCount > 0 ? blends[recipeId] : null;
  const n = (was ? onHandCount : 0) + crates;
  blends[recipeId] = {
    q: n ? ((was ? was.q * onHandCount : 0) + q * crates) / n : q,
    bad: !!((was && was.bad) || bad),
  };
  return blends[recipeId];
}

export const blendGrade = (bl) => (bl ? gradeOf(bl.q, bl.bad) : 'B');

// ---------- The brewery: Highlandtown Lager in Gus's cellar (CONFIG.dredge.brew.lager) ----------
// A batch in three phases, a pure state machine like the still's: the mash (hold HEAT to keep
// the temperature on each rest in turn), the boil (press as each hop mark passes) and
// lagering (press to tap it inside the window, as the weeks run by faster and faster).
const LG = B.lager;

export function newLagerBatch() {
  return { phase: 'mash', temp: 0.25, mash: { t: 0, inBand: 0 }, boil: { t: 0, pos: 0, errs: LG.boil.hops.map(() => null), misses: 0 }, lager: { t: 0, pos: 0, at: null }, done: false };
}

// The mash's rest now (the first for half the time, then the second).
export const lagerRest = (b) => LG.mash.rests[b.mash.t < LG.mash.seconds / 2 ? 0 : 1];

export function stepLagerBatch(b, dt, heat = false) {
  if (b.done) return b;
  if (b.phase === 'mash') {
    const M = LG.mash;
    b.temp = Math.max(0, Math.min(1, b.temp + (heat ? M.up : -M.down) * dt));
    if (Math.abs(b.temp - lagerRest(b)) <= M.band) b.mash.inBand += dt;
    b.mash.t += dt;
    if (b.mash.t >= M.seconds) b.phase = 'boil';
  } else if (b.phase === 'boil') {
    b.boil.t += dt;
    b.boil.pos = Math.min(1, b.boil.t / LG.boil.seconds);
    if (b.boil.t >= LG.boil.seconds) b.phase = 'lager';
  } else {
    const L = LG.lager;
    b.lager.t += dt;
    b.lager.pos = Math.min(1, b.lager.pos + (L.speed + L.speedUp * b.lager.t) * dt);
    if (b.lager.pos >= 1) { b.lager.at = 1; b.done = true; }       // left too long: it's flat
  }
  return b;
}

// A press: in the boil, the hops in at the nearest mark not yet taken (too far from any is a
// miss); in lagering, it's tapped. Returns whether it counted.
export function pressLagerBatch(b) {
  if (b.done) return false;
  if (b.phase === 'boil') {
    const H = LG.boil.hops, pos = b.boil.pos;
    let best = -1;
    H.forEach((h, i) => { if (b.boil.errs[i] == null && (best < 0 || Math.abs(h - pos) < Math.abs(H[best] - pos))) best = i; });
    if (best < 0 || Math.abs(H[best] - pos) > LG.boil.tol * 3) { b.boil.misses++; return false; }
    b.boil.errs[best] = Math.abs(H[best] - pos);
    return true;
  }
  if (b.phase === 'lager') { b.lager.at = b.lager.pos; b.done = true; return true; }
  return false;
}

export function lagerScores(b) {
  const mash = b.mash.inBand / LG.mash.seconds;
  const hops = b.boil.errs.map((e) => (e == null ? 0 : Math.max(0, 1 - e / (LG.boil.tol * 3))));
  const boil = Math.max(0, hops.reduce((a, x) => a + x, 0) / hops.length - 0.1 * b.boil.misses);
  const [lo, hi] = LG.lager.window, at = b.lager.at;
  const lager = at == null ? 0 : at >= lo && at <= hi ? 1 : Math.max(0, 1 - Math.min(Math.abs(at - lo), Math.abs(at - hi)) / 0.25);
  return { mash, boil, lager };
}

export function lagerQuality(b) {
  const s = lagerScores(b), W = LG.weights;
  return Math.max(0, Math.min(1, W.mash * s.mash + W.boil * s.boil + W.lager * s.lager));
}

// Crates of Lager a batch of this quality makes (a brewery's, not a still's).
export function lagerYield(q) {
  for (const [least, crates] of LG.yields) if (q >= least) return crates;
  return LG.yields[LG.yields.length - 1][1];
}
