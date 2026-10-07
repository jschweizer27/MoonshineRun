import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test('salvage sites: fixed spots off the roads, in the county and the city, some for night work; no loose loot in the streets', async ({ page }) => {
  const problems = await openGame(page);
  await page.click('#start-btn');                    // loot left on: there should be none anyway
  await expect(page.locator('#hud')).toBeVisible();
  const r = await page.evaluate(() => {
    const g = window.shine.game, w = g.world, S = g.salvage;
    const seg = (x, z, p, q) => { const dx = q.x - p.x, dz = q.z - p.z, t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - p.x - dx * t, z - p.z - dz * t); };
    const N = w.roads.nodes, roadDist = (x, z) => { let b = Infinity; for (const a of N) for (const id of a.links) b = Math.min(b, seg(x, z, a, N[id])); return b; };
    window.shine.step(5);
    return {
      n: S.sites.length, kinds: [...new Set(S.sites.map((s) => s.kind))].sort(),
      city: S.sites.filter((s) => !w.inCounty(s)).length, night: S.sites.filter((s) => s.night).length,
      offRoad: S.sites.every((s) => roadDist(s.x, s.z) > w.cfg.roadWidth / 2 + 1),
      reachable: S.sites.every((s) => !w.collision.resolveCircle(s.stopX, s.stopZ, 1.2).hit),
      apart: S.sites.every((s, i) => S.sites.every((t, j) => i === j || Math.hypot(s.x - t.x, s.z - t.z) > 60)),
      loose: g.loot.active.reduce((a, b) => a + b, 0),
      radar: g._mapMarkers().some((m) => m.kind === 'site'),
    };
  });
  expect(r.n).toBe(23);
  expect(r.kinds).toEqual(['cellar', 'farmhouse', 'siding', 'wreck']);
  expect(r.city).toBe(5);
  expect(r.night).toBeGreaterThan(3);
  expect(r.offRoad).toBe(true);
  expect(r.reachable).toBe(true);
  expect(r.apart).toBe(true);
  expect(r.loose).toBe(0);
  expect(r.radar).toBe(true);
  expect(problems).toEqual([]);
});

test('the mini-games: a clean pry or a good memory pays up to three pieces, slips and bad guesses pay less, and leaning toward the valuable ones', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const M = await import('/src/salvage.js');
    const { CONFIG } = await import('/src/config.js');
    const P = CONFIG.dredge.salvage;
    const seq = (seed) => { let a = seed; return () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; };
    // A perfect pry: press only when the needle is in a green arc.
    const perfect = M.newPry(() => 0.5);
    while (!perfect.done) { M.stepPry(perfect, 1 / 120); if (perfect.arcs.some((a) => !a.hit && Math.abs(Math.atan2(Math.sin(perfect.angle - a.a), Math.cos(perfect.angle - a.a))) < a.w / 4)) M.pressPry(perfect); }
    // A clumsy one: pressing anywhere.
    const clumsy = M.newPry(() => 0.5);
    clumsy.angle = clumsy.arcs[0].a + Math.PI;           // well away from the arcs
    for (let k = 0; k < 3; k++) M.pressPry(clumsy);
    // Search: during the glint nothing can be picked; then the right spots, or the wrong ones.
    const good = M.newSearch(seq(7)), bad = M.newSearch(seq(9));
    const early = M.pickSearch(good, good.spots.findIndex((s) => s.good));
    M.stepSearch(good, P.search.glint + 0.1); M.stepSearch(bad, P.search.glint + 0.1);
    good.spots.forEach((s, i) => { if (s.good) M.pickSearch(good, i); });
    bad.spots.forEach((s, i) => { if (!s.good) M.pickSearch(bad, i); });
    const timeout = M.newSearch(seq(11)); M.stepSearch(timeout, 60);
    const value = (ids) => ids.reduce((a, id) => a + CONFIG.dredge.loot.kinds.find((k) => k.id === id).value, 0) / Math.max(1, ids.length);
    let hi = 0, lo = 0;
    for (let k = 0; k < 4000; k++) { hi += value(M.payout('wreck', 1)); lo += value(M.payout('wreck', 0.4)); }
    return {
      perfect: [M.score(perfect), M.payout('wreck', M.score(perfect)).length, perfect.strikes],
      clumsy: [clumsy.done, M.score(clumsy), M.payout('wreck', M.score(clumsy)).length],
      early, good: [good.done, M.score(good)], bad: [bad.done, M.score(bad)], timeout: [timeout.done, M.score(timeout)],
      richer: hi / 4000 > lo / 4000 + 3,
    };
  });
  expect(r.perfect).toEqual([1, 3, 0]);
  expect(r.clumsy).toEqual([true, 0, 0]);
  expect(r.early).toBeNull();                         // no picking while it glints
  expect(r.good).toEqual([true, 1]);
  expect(r.bad).toEqual([true, 0]);
  expect(r.timeout).toEqual([true, 0]);
  expect(r.richer).toBe(true);
});

test('working a site: stop by it, play it, pack what it gives up; then it is picked clean until it refills, and nothing compiles', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const info0 = await page.evaluate(() => {
    const g = window.shine.game;
    g.renderer.setAnimationLoop(null);
    g.renderFrame();
    const s = g.salvage.sites.find((x) => x.kind === 'farmhouse');
    window.__site = s;
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.2);
    return window.shine.renderInfo();
  });
  await expect(page.locator('#salvage')).toBeVisible();
  await expect(page.locator('#salvage-title')).toHaveText('ABANDONED FARMHOUSE');
  // Play the search by hand: wait out the glint, then pick where the goods are.
  await page.evaluate(() => {
    const sc = window.shine.game.salvageScreen;
    sc.manual();
    sc.step(1.2);
    sc.game.spots.forEach((s, i) => { if (s.good && !sc.game.done) sc.pick(i); });
  });
  await expect(page.locator('#salvage-done')).toBeVisible();
  await page.click('#salvage-done');
  await expect(page.locator('#trunk')).toBeVisible();
  // Three pieces offered, one after another; pack each that fits (a big one may not, in the
  // starting trunk).
  const packed = await page.evaluate(() => {
    const g = window.shine.game, t = g.trunkScreen;
    let offered = 0, n = 0;
    for (let k = 0; k < 5 && t.isOpen; k++) {
      if (t.hand) offered++;
      const spot = t.hand && g.trunk.findSpot(t.hand.kind);
      if (spot) { t.cursor = { x: spot.x, y: spot.y }; t.hand.rot = spot.rot; t.confirm(); n++; }
      t.close();
    }
    return { offered, packed: g.trunk.count === n && n >= 2, state: g.state };
  });
  expect(packed).toEqual({ offered: 3, packed: true, state: 'playing' });
  // Picked clean: stopping again says so, and the heap has sunk; a few days on it's back.
  const after = await page.evaluate(async () => {
    const g = window.shine.game, s = window.__site, { dayOf } = await import('/src/market.js');
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.2);
    const toast = document.getElementById('toast').textContent, open = g.ui.isOpen('salvage');
    const now = g.salvage.status(s, dayOf(g.dredge.market), g.env.hour);
    const later = g.salvage.status(s, dayOf(g.dredge.market) + 3, g.env.hour);
    g.renderFrame();
    const info = window.shine.renderInfo();
    return { toast, open, now, later, saved: g.dredge.data.sites[s.id] === dayOf(g.dredge.market), info };
  });
  expect(after.toast).toContain('picked clean');
  expect(after.open).toBe(false);
  expect(after.now).toBe('empty');
  expect(after.later).toBe('ok');
  expect(after.saved).toBe(true);
  expect(after.info.programs).toBe(info0.programs);
  expect(after.info.geometries).toBe(info0.geometries);
  expect(after.info.calls).toBeLessThan(60);
  expect(problems).toEqual([]);
});

test('a night site turns you away by day', async ({ page }) => {
  await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, s = g.salvage.sites.find((x) => x.night);
    g.env.hour = 12;
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.2);
    return { open: g.ui.isOpen('salvage'), toast: document.getElementById('toast').textContent };
  });
  expect(r.open).toBe(false);
  expect(r.toast).toContain('after dark');
});
