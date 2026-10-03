import { test, expect } from '@playwright/test';
import { openGame, startRun, waitForBoot } from './helpers.js';

test('Otto’s barn: stop in the yard to open it; the stash keeps loot between runs and has a limit', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const where = await page.evaluate(() => {
    const g = window.shine.game, h = g.world.home, n = g.world.roads.nearest(h.stopX, h.stopZ);
    return {
      inCounty: g.world.inCounty({ x: h.stopX, z: h.stopZ }), blocked: g.world.collision.resolveCircle(h.stopX, h.stopZ, 2).hit,
      road: Math.hypot(n.x - h.stopX, n.z - h.stopZ), onRadar: g._mapMarkers().some((m) => m.kind === 'barn'),
    };
  });
  expect(where.inCounty).toBe(true);
  expect(where.blocked).toBe(false);
  expect(where.road).toBeLessThan(12);
  expect(where.onRadar).toBe(true);

  // Drive in with a crate and a keg aboard.
  const before = await page.evaluate(() => {
    const g = window.shine.game, h = g.world.home;
    g.trunk.place('crate', 0, 0); g.trunk.place('keg', 2, 0);
    const info = { programs: g.renderer.info.programs.length, geometries: g.renderer.info.memory.geometries };
    window.shine.teleport(h.stopX + 30, h.stopZ, -Math.PI / 2); window.shine.step(0.2);
    window.shine.teleport(h.stopX + 2, h.stopZ, -Math.PI / 2); window.shine.step(0.3);
    return info;
  });
  await expect(page.locator('#barn')).toBeVisible();
  expect(await page.evaluate(() => window.shine.game.state)).toBe('paused');
  // Its marker is the one that shows here.
  const shown = await page.evaluate(() => { const g = window.shine.game; g.renderFrame(); return { barn: g.barnMarker.visible, markets: g.marketMarkers.filter((m) => m.visible).length, calls: window.shine.renderInfo().calls }; });
  expect(shown).toMatchObject({ barn: true, markets: 0 });
  expect(shown.calls).toBeLessThan(60);

  // Store the crate, then everything; take the keg back.
  await page.click('#barn [data-id="store-crate"]');
  let s = await page.evaluate(() => ({ stash: { ...window.shine.game.dredge.data.stash }, trunk: window.shine.game.trunk.count }));
  expect(s).toEqual({ stash: { crate: 1 }, trunk: 1 });
  await page.click('#barn-store-all');
  await page.click('#barn [data-id="take-keg"]');
  s = await page.evaluate(() => ({ stash: { ...window.shine.game.dredge.data.stash }, trunk: [...window.shine.game.trunk.pieces.values()].map((p) => p.kind), cells: window.shine.game.dredge.stashCells() }));
  expect(s).toEqual({ stash: { crate: 1 }, trunk: ['keg'], cells: 4 });

  // The stash has a limit: a full stash takes nothing more.
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.stash = { crate: 10 }; g._barnRender(); });
  await expect(page.locator('#barn [data-id="store-keg"]')).toBeDisabled();
  await expect(page.locator('#barn-store-all')).toBeDisabled();
  await expect(page.locator('#barn-body')).toContainText('40/40 CELLS');

  // Kept between visits.
  await page.click('#barn-done');
  await page.reload();
  await waitForBoot(page);
  expect(await page.evaluate(() => window.shine.game.dredge.data.stash)).toEqual({ crate: 10 });
  const after = await page.evaluate(() => ({ programs: window.shine.game.renderer.info.programs.length, geometries: window.shine.game.renderer.info.memory.geometries }));
  expect(after).toEqual(before);
  expect(problems).toEqual([]);
});

test('wear: hard knocks slow the truck, the HUD shows it, and the barn’s garage mends it for cash', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, top = g.player.t.maxSpeed;
    g._wear(4);                       // a bump: no wear
    const bump = g.dredge.data.wear;
    for (let k = 0; k < 4; k++) g._wear(14);
    return { top, bump, wear: g.dredge.data.wear, slower: g.player.t.maxSpeed, pill: document.getElementById('wear').textContent, shown: !document.getElementById('wear').classList.contains('hidden'), toast: document.getElementById('toast').textContent };
  });
  expect(r.bump).toBe(0);
  expect(r.wear).toBeCloseTo(0.64, 5);
  expect(r.slower).toBeLessThan(r.top * 0.9);
  expect(r.shown).toBe(true);
  expect(r.pill).toBe('TRUCK 36%');
  expect(r.toast).toContain('Get it to the barn');

  // The garage: a repair costs by how worn it is.
  await page.evaluate(() => { const g = window.shine.game, h = g.world.home; g.dredge.data.cash = 1000; window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.3); });
  await expect(page.locator('#barn [data-id="repair"]')).toHaveText('REPAIR $224');
  await page.click('#barn [data-id="repair"]');
  const fixed = await page.evaluate(() => { const g = window.shine.game; return { wear: g.dredge.data.wear, cash: g.dredge.cash, top: g.player.t.maxSpeed, pill: document.getElementById('wear').classList.contains('hidden') }; });
  expect(fixed).toEqual({ wear: 0, cash: 776, top: r.top, pill: true });
  await expect(page.locator('#barn [data-id="repair"]')).toBeDisabled();
  expect(problems).toEqual([]);
});
