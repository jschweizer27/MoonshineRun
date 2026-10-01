import { test, expect } from '@playwright/test';
import { openGame, startRun, step, snapshot, screenshot } from './helpers.js';

// The dredge run (?mode=dredge): free-roam driving, loot, a trunk to pack, towns to sell in.
// Built beside the bootlegging loop; these tests cover it stage by stage.

test('dredge mode boots into free roam: the truck without its horse box, no police, no heat', async ({ page }) => {
  const problems = await openGame(page, '&mode=dredge');
  await expect(page.locator('#start-btn')).toHaveText('START DRIVING');
  await startRun(page);
  const s = await snapshot(page);
  expect(s.game).toBe('dredge');
  expect(s.state).toBe('playing');
  const setup = await page.evaluate(() => {
    const g = window.shine.game, m = g.mission;
    return {
      ride: g.player.ride, trailer: !!g.player.trailer,
      markers: [m.pickup, m.drop, m.hideoutMarker, m.goal].some((x) => x.visible),
      heatShown: getComputedStyle(document.getElementById('heat')).display !== 'none',
      objective: document.getElementById('objective-text').textContent,
    };
  });
  expect(setup).toEqual({ ride: 'runner', trailer: false, markers: false, heatShown: false, objective: 'Free roam' });

  // Drive up York Road into the county: no one comes after you, nothing happens to the heat.
  const before = await page.evaluate(() => { const g = window.shine.game; g.renderFrame(); return window.shine.renderInfo(); });
  const drove = await step(page, 20, { throttle: 1 });
  expect(drove.z).toBeLessThan(-150);
  expect(drove.pursuers).toBe(0);
  expect(drove.heat).toBe(0);
  expect(await page.evaluate(() => window.shine.game.police.active.length)).toBe(0);
  const after = await page.evaluate(() => window.shine.renderInfo());
  expect(after.lights).toBe(13);
  expect(after.calls).toBeLessThan(60);
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  await screenshot(page, 'dredge-01-free-roam');
  expect(problems).toEqual([]);
});

test('the bootlegging game is unchanged without ?mode=dredge', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const s = await page.evaluate(() => ({ game: window.shine.game.mode, ride: window.shine.game.player.ride, trailer: !!window.shine.game.player.trailer, hud: document.getElementById('hud').classList.contains('dredge') }));
  expect(s).toEqual({ game: 'bootleg', ride: 'truck', trailer: true, hud: false });
});
