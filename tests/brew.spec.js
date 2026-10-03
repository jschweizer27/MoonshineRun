import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test('brewing logic: steady hands make three crates, neglect makes one, scorching ruins it; ingredients come from the stash first', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const { newBatch, stepBatch, quality, yieldFor, consume, missing, RECIPES } = await import('/src/brew.js');
    const { Trunk } = await import('/src/trunk.js');
    const run = (level, policy) => { const b = newBatch(level); while (!b.done) stepBatch(b, 1 / 60, policy(b)); return quality(b); };
    const steady = run(1, (b) => b.temp < b.center);
    const cold = run(1, () => false);
    const scorched = run(1, () => true);
    const wide = run(3, (b) => b.temp < b.center - 0.08);
    const narrow = run(1, (b) => b.temp < b.center - 0.08);
    const corn = RECIPES.find((x) => x.id === 'corn-shine');
    const t = new Trunk(); t.place('sack', 0, 0); t.place('jugs', 2, 0);
    const stash = { jugs: 1 };
    const before = missing(corn, { sack: 1 });
    consume(corn, t, stash);
    return { steady, cold, scorched, wide, narrow, crates: [yieldFor(steady), yieldFor(cold), yieldFor(scorched)], before, stash, left: [...t.pieces.values()].map((p) => p.kind) };
  });
  expect(r.steady).toBeGreaterThan(0.8);
  expect(r.cold).toBeLessThan(0.3);
  expect(r.scorched).toBe(0);
  expect(r.crates).toEqual([3, 1, 1]);
  expect(r.wide).toBeGreaterThan(r.narrow);          // a better still forgives more
  expect(r.before).toEqual([['jugs', 1]]);
  expect(r.stash).toEqual({});                         // the stash's jugs went first...
  expect(r.left).toEqual(['jugs']);                    // ...so the trunk keeps its own
});

test('the still: a copper coil sets it up, a batch at the barn makes crates of shine, and only the speakeasies buy them', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const info0 = await page.evaluate(() => {
    const g = window.shine.game, h = g.world.home;
    g.dredge.data.stash = { coil: 1, sack: 1, jugs: 1 };
    window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.3);
    return { programs: g.renderer.info.programs.length, geometries: g.renderer.info.memory.geometries };
  });
  await expect(page.locator('#barn')).toBeVisible();
  await expect(page.locator('#barn [data-id="brew-corn-shine"]')).toBeDisabled();     // no coil in yet
  await expect(page.locator('#barn [data-id="brew-applejack"]')).toHaveText('LOCKED');
  await page.click('#barn [data-id="install-coil"]');
  expect(await page.evaluate(() => window.shine.game.dredge.data.still)).toBe(1);
  await page.click('#barn [data-id="brew-corn-shine"]');
  await expect(page.locator('#still')).toBeVisible();
  // Run the batch by hand with a steady touch.
  const q = await page.evaluate(() => {
    const s = window.shine.game.stillScreen;
    s.manual();
    while (!s.batch.done) s.step(1 / 60, s.batch.temp < s.batch.center);
    return s.batch;
  });
  expect(q.done).toBe(true);
  await expect(page.locator('#still-msg')).toContainText('3 crates of Corn Shine');
  await page.click('#still-done');
  await expect(page.locator('#still')).toBeHidden();
  const d = await page.evaluate(() => { const d = window.shine.game.dredge.data; return { stash: d.stash, brews: d.stats.brews, ledger: d.ledger[0].text }; });
  expect(d.stash).toEqual({ 'corn-shine': 3 });
  expect(d.brews).toBe(1);
  expect(d.ledger).toMatch(/^Brewed 3 crates of Corn Shine \(\d+%\)$/);

  // Load two crates and head for a speakeasy: the route and the radar point there.
  await page.click('#barn [data-id="take-corn-shine"]');
  await page.click('#barn [data-id="take-corn-shine"]');
  await page.click('#barn-done');
  const dest = await page.evaluate(() => { const g = window.shine.game; window.shine.step(0.6); return { obj: document.getElementById('objective-text').textContent, drops: g._mapMarkers().filter((m) => m.kind === 'drop').length, kind: g._destination().kind }; });
  expect(dest.kind).toBe('drop');
  expect(dest.obj).toMatch(/^Deliver to /);
  expect(dest.drops).toBe(10);

  // A market won't touch it.
  await page.evaluate(() => { window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-note')).toContainText('Nothing in the trunk to sell');
  await expect(page.locator('#market-sell-all')).toBeDisabled();
  await page.click('#market-done');

  // A speakeasy buys it, and sells no upgrades.
  const cash0 = await page.evaluate(() => { const g = window.shine.game, s = g.world.drops[0]; window.shine.teleport(s.x + 30, s.z, -Math.PI / 2); window.shine.step(0.2); window.shine.teleport(s.x, s.z, -Math.PI / 2); window.shine.step(0.3); return g.dredge.cash; });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-title')).toHaveText('HIGHLANDTOWN SPEAKEASY');
  await expect(page.locator('#market-body')).not.toContainText('UPGRADES');
  await page.click('#market-sell-all');
  const sold = await page.evaluate(() => { const g = window.shine.game; return { cash: g.dredge.cash, trunk: g.trunk.count }; });
  expect(sold.trunk).toBe(0);
  expect(sold.cash - cash0).toBeGreaterThan(100);
  await page.click('#market-done');
  const info1 = await page.evaluate(() => ({ programs: window.shine.game.renderer.info.programs.length, geometries: window.shine.game.renderer.info.memory.geometries }));
  expect(info1).toEqual(info0);
  expect(problems).toEqual([]);
});
