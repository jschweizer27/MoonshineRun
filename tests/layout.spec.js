import { test, expect } from '@playwright/test';
import { openGame } from './helpers.js';

// Seeded layouts stay put. These were measured on the game before Loch Raven and the railway
// were added (stage 6): the city's random stream read once after boot (it pins how many
// numbers everything drew), the salvage sites, the county's trees and houses, the city's
// awnings and water towers, the lamps, the road nodes and the roads a road event can close.
// Trees cleared for the railway (west of x -415), the roads out to Loch Raven and Loch
// Raven itself (east of the wall) are left out: they changed on purpose.
const BEFORE = {
  1922: { rng: 0.2304920325987041, sites: '8d1b421', trees: 'eda4fe0d', nTrees: 861, houses: '845008a7', awnings: 'feee3491', towers: '6035257e', lamps: 'aa3b9834', nodes: 'cda7cfbb', events: 'bfe19a9a' },
  7: { rng: 0.6786332677584141, sites: '3b7f7b6c', trees: 'f362885a', nTrees: 870, houses: '7a1a3fb', awnings: 'd9cdfa63', towers: 'd043af8b', lamps: '14a2ff43', nodes: 'cda7cfbb', events: 'bfe19a9a' },
  4242: { rng: 0.8101190247107297, sites: '42a20754', trees: '259d2f07', nTrees: 853, houses: 'fd76d2d7', awnings: 'c053ac25', towers: '4072ebcf', lamps: '675e3a8c', nodes: 'cda7cfbb', events: 'bfe19a9a' },
};

const fingerprint = () => {
  const g = window.shine.game, w = g.world;
  g.renderer.setAnimationLoop(null);
  const hash = (nums) => { let h = 2166136261; for (const n of nums) for (const c of String(Math.round(n * 1000))) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16); };
  const cleared = (x, z) => x < -415 || x >= 440 || (x > 370 && x < 450 && (Math.abs(z + 571) < 12 || Math.abs(z + 770) < 12));
  const trees = w.trees.filter(([x, z]) => !cleared(x, z));
  const sites = g.salvage.sites.filter((s) => !s.story);
  return {
    rng: w.rng(),
    sites: hash(sites.flatMap((s) => [s.x, s.z, s.stopX, s.stopZ, s.night ? 1 : 0, ['wreck', 'farmhouse', 'siding', 'cellar'].indexOf(s.kind)])),
    trees: hash(trees.flatMap(([x, z, sc]) => [x, z, sc])), nTrees: trees.length,
    houses: hash(w.buildings.filter((b) => b.barn && b.minX < 440).flatMap((b) => [b.minX, b.minZ, b.maxX, b.maxZ, b.h])),
    awnings: hash(w.awnings.instanceMatrix.array), towers: hash(w.waterTowers.instanceMatrix.array),
    lamps: hash(w.lampSpots.filter((s) => s.x < 440).flatMap((s) => [s.x, s.z])),
    nodes: hash(w.roads.nodes.slice(0, 158).flatMap((n) => [n.x, n.z])),
    events: hash(g.roadEvents.edges.flatMap(([a, b]) => [a.id, b.id])),
  };
};

for (const seed of Object.keys(BEFORE)) {
  test(`seed ${seed}: the city, the county and the salvage sites are where they were before Loch Raven and the railway`, async ({ page }) => {
    const problems = await openGame(page, `&seed=${seed}`);
    expect(await page.evaluate(fingerprint)).toEqual(BEFORE[seed]);
    expect(problems).toEqual([]);
  });
}
