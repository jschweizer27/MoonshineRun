import { CONFIG } from './config.js';
import { KINDS } from './trunk.js';

// The finds (after DREDGE's encyclopedia): every kind of salvage Otto has turned up, where
// it's found, the best price it's fetched, and its odd variant (a kind with `odd`, worth far
// more, mostly at night sites worked well). Each site kind's goods found in full pays
// (`CONFIG.dredge.codex.set`, once); every odd variant found earns the collector's eye (the
// tool `eye`: odd variants more often). The save keeps `codex`: { [kind]: { n, best } } and
// `flags['set:<site kind>']`. Pure logic; main.js plays what `record` returns.
const S = CONFIG.dredge.salvage;

// The regular site kinds (the story sites' goods are the story's), and each one's goods.
export const SITE_KINDS = ['wreck', 'farmhouse', 'siding', 'cellar', 'shallows'];
export const setOf = (site) => Object.keys(S.kinds[site].yields);

// A kind's odd variant (base id -> odd id), and the odd ones in order.
export const ODD = Object.fromEntries(CONFIG.dredge.loot.kinds.filter((k) => k.odd).map((k) => [k.odd, k.id]));
export const ODDS = Object.values(ODD);

// The site kinds a kind turns up at.
export const whereFound = (kind) => SITE_KINDS.filter((s) => S.kinds[s].yields[KINDS[kind]?.odd || kind]);

// A worked site's pieces, a few of them odd: at a night site worked at `odd.score` or
// better the chance is `odd.night`, otherwise `odd.day` (x `odd.eye` with the collector's
// eye). `rng` draws once per piece that has a variant.
export function oddify(pieces, site, sc, { rng = Math.random, eye = false } = {}) {
  const O = S.odd, p = (site.night && sc >= O.score ? O.night : O.day) * (eye ? O.eye : 1);
  return pieces.map((k) => (ODD[k] && rng() < p ? ODD[k] : k));
}

// Found: count each kind, and say what's new. Returns, in order: { type: 'odd', kind } (an
// odd variant's first find), { type: 'set', site, pay } (a site kind's goods all found:
// the save's cash goes up by `pay`), { type: 'eye' } (every odd variant found: the tool).
export function record(d, kinds) {
  const out = [];
  d.codex ??= {};
  for (const k of kinds) {
    const e = (d.codex[k] ??= { n: 0, best: 0 });
    if (!e.n && KINDS[k].odd) out.push({ type: 'odd', kind: k });
    e.n++;
  }
  for (const site of SITE_KINDS) {
    if (d.flags[`set:${site}`] || !setOf(site).every((k) => d.codex[k]?.n)) continue;
    d.flags[`set:${site}`] = true;
    d.cash += CONFIG.dredge.codex.set;
    out.push({ type: 'set', site, pay: CONFIG.dredge.codex.set });
  }
  if (!d.tools.eye && ODDS.every((k) => d.codex[k]?.n)) { d.tools.eye = true; out.push({ type: 'eye' }); }
  return out;
}

// A sale: the best price each kind has fetched. `prices`: { kind: price of one }.
export function priced(d, prices) {
  d.codex ??= {};
  for (const [k, v] of Object.entries(prices)) {
    const e = (d.codex[k] ??= { n: 0, best: 0 });
    e.best = Math.max(e.best, v);
  }
}
