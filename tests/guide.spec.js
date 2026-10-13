import { test, expect } from '@playwright/test';
import { openGame, waitForBoot } from './helpers.js';

const guide = (page) => page.evaluate(() => ({
  shown: !document.getElementById('guide').classList.contains('hidden'),
  text: document.getElementById('guide-text').textContent,
}));

test('the first run: tips walk through finding salvage, packing and the sale, then end for good', async ({ page }) => {
  const problems = await openGame(page, '&hints');
  await page.click('#start-btn');
  // The story's first step points at the ruins: the tip says how to work a site.
  await page.evaluate(() => { const L = window.shine.game.loot; L.active.fill(0); L.timer.fill(1e9); L.rareIn = 1e9; window.shine.step(0.6); });
  let g = await guide(page);
  expect(g.shown).toBe(true);
  expect(g.text).toContain('stop beside its sign');
  // Past the steps that point somewhere (the coil found, the still running): find salvage.
  await page.evaluate(() => { const d = window.shine.game.dredge.data; d.flags.ruinsSearched = true; d.still = 1; d.stats.brews = 1; window.shine.step(0.6); });
  g = await guide(page);
  expect(g.text).toContain('Find salvage');

  // A crate aboard (a piece spilled on the road): the trunk opens with a packing tip.
  await page.evaluate(() => {
    const g = window.shine.game, L = g.loot, p = g.player.position;
    L.kind[0] = L.kindIndex('crate'); L.x[0] = p.x; L.z[0] = p.z - 2; L.active[0] = 1;
    window.shine.step(0.2);
  });
  await expect(page.locator('#trunk')).toBeVisible();
  await expect(page.locator('#trunk-guide')).toBeVisible();
  await expect(page.locator('#trunk-guide')).toContainText('turn it with R');

  // Packed: now the tip says where to sell.
  await page.evaluate(() => {
    const g = window.shine.game, s = g.trunkScreen, spot = g.trunk.findSpot(s.hand.kind);
    s.cursor = { x: spot.x, y: spot.y }; s.hand.rot = spot.rot; s.confirm(); s.close();
    window.shine.step(0.6);
  });
  g = await guide(page);
  expect(g.text).toContain('stop inside its ring to sell');

  // The market: a tip on selling; the first sale ends the tips.
  await page.evaluate(() => { window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-guide')).toContainText('SELL EVERYTHING');
  await page.click('#market-sell-all');
  await page.click('#market-done');
  await page.evaluate(() => window.shine.step(0.6));
  g = await guide(page);
  expect(g.shown).toBe(false);
  await expect(page.locator('#toast')).toContainText('The roads are yours');

  // For good: a new visit shows none.
  await page.reload();
  await waitForBoot(page);
  await page.click('#start-btn');
  await page.evaluate(() => window.shine.step(0.6));
  expect((await guide(page)).shown).toBe(false);
  expect(problems).toEqual([]);
});

test('the tips can be skipped from the card or the pause menu, and ?test shows none unless asked', async ({ page }) => {
  const problems = await openGame(page, '&hints');
  await page.click('#start-btn');
  await page.evaluate(() => window.shine.step(0.6));
  expect((await guide(page)).shown).toBe(true);
  // From the pause menu (keyboard and controller players).
  await page.evaluate(() => window.shine.game.pause());
  await expect(page.locator('#pause-skip-tips')).toBeVisible();
  await page.click('#pause-skip-tips');
  await expect(page.locator('#pause-skip-tips')).toBeHidden();
  await page.click('#pause-resume');
  await page.evaluate(() => window.shine.step(0.6));
  expect((await guide(page)).shown).toBe(false);
  expect(await page.evaluate(() => window.shine.game.dredge.data.guide)).toBe(false);

  // From the card, in a fresh slot.
  await page.evaluate(() => window.shine.game.quitToTitle());
  await page.click('#intro-saves');
  await page.click('#slots [data-id="slot-play-2"]');
  await page.evaluate(() => window.shine.step(0.6));
  expect((await guide(page)).shown).toBe(true);
  await page.click('#guide-skip');
  expect((await guide(page)).shown).toBe(false);

  // Plain ?test: no tips.
  await page.goto('/?test');
  await waitForBoot(page);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await waitForBoot(page);
  await page.click('#start-btn');
  await page.evaluate(() => window.shine.step(0.6));
  expect((await guide(page)).shown).toBe(false);
  expect(problems).toEqual([]);
});
