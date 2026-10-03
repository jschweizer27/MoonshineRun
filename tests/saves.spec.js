import { test, expect } from '@playwright/test';
import { openGame, waitForBoot } from './helpers.js';

const toTitle = (page) => page.evaluate(() => window.shine.game.quitToTitle());
const slotRow = (page, n) => page.locator('#slots-body .slot').nth(n - 1);

test('save slots: CONTINUE once played, three slots to play, start over or erase, and the last one played loads next visit', async ({ page }) => {
  const problems = await openGame(page);
  await expect(page.locator('#start-btn')).toHaveText('START DRIVING');
  await page.click('#start-btn');
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.cash = 500; g.dredge.save(); });
  await toTitle(page);
  await expect(page.locator('#start-btn')).toHaveText('CONTINUE');
  await expect(page.locator('#intro-best')).toContainText('Slot 1');

  // The saved games: slot 1 holds the $500, the others are empty.
  await page.click('#intro-saves');
  await expect(page.locator('#slots')).toBeVisible();
  await expect(page.locator('#slots-body .slot')).toHaveCount(3);
  await expect(slotRow(page, 1)).toContainText('$500');
  await expect(slotRow(page, 1)).toContainText('current');
  await expect(slotRow(page, 2)).toContainText('Empty');
  // Keyboard reaches the slot buttons.
  await expect(page.locator('#slots [data-id="slot-play-1"]')).toBeFocused();

  // Start in slot 2: a separate save, from nothing.
  await page.click('#slots [data-id="slot-play-2"]');
  let r = await page.evaluate(() => { const g = window.shine.game; return { state: g.state, slot: g.dredge.slot, cash: g.dredge.cash }; });
  expect(r).toEqual({ state: 'playing', slot: 2, cash: 0 });
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.cash = 70; g.dredge.save(); });

  // A new visit opens the slot played last.
  await page.reload();
  await waitForBoot(page);
  r = await page.evaluate(() => { const g = window.shine.game; return { slot: g.dredge.slot, cash: g.dredge.cash, label: document.getElementById('start-btn').textContent }; });
  expect(r).toEqual({ slot: 2, cash: 70, label: 'CONTINUE' });

  // Back to slot 1: its cash, untouched.
  await page.click('#intro-saves');
  await page.click('#slots [data-id="slot-play-1"]');
  expect(await page.evaluate(() => [window.shine.game.dredge.slot, window.shine.game.dredge.cash])).toEqual([1, 500]);
  await toTitle(page);

  // Erase slot 2 (with a confirmation): it shows empty.
  await page.click('#intro-saves');
  await page.click('#slots [data-id="slot-erase-2"]');
  await page.click('#confirm-yes');
  await expect(slotRow(page, 2)).toContainText('Empty');
  expect(await page.evaluate(() => localStorage.getItem('shine.dredge.v1.s2'))).toBeNull();

  // Start over in slot 1: a clean slate, played straight away.
  await page.click('#slots [data-id="slot-new-1"]');
  await page.click('#confirm-yes');
  r = await page.evaluate(() => { const g = window.shine.game; return { state: g.state, slot: g.dredge.slot, cash: g.dredge.cash, started: g.dredge.started }; });
  expect(r).toEqual({ state: 'playing', slot: 1, cash: 0, started: true });
  expect(problems).toEqual([]);
});

test('a save from before the slots carries over as slot 1, and the ledger keeps lifetime stats', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('shine.dredge.v1')) {
      localStorage.setItem('shine.dredge.v1', JSON.stringify({ version: 1, cash: 123, stats: { earned: 400, sold: 6, playSeconds: 3900 } }));
    }
  });
  const problems = await openGame(page);
  await expect(page.locator('#start-btn')).toHaveText('CONTINUE');
  await expect(page.locator('#intro-best')).toContainText('$123');
  await page.click('#start-btn');
  // Driving adds distance; a rare find is counted.
  await page.evaluate(() => {
    const g = window.shine.game, L = g.loot;
    L.active.fill(0); L.timer.fill(1e9); L.rareIn = 1e9;
    window.shine.teleport(0, 200, 0);
    window.shine.step(3, { throttle: 1 });
    g._onLoot({ kind: { id: 'pocket-watch', name: 'Gold pocket watch', paysAt: 'monkton' }, rare: true, x: 0, z: 0 });
    g.trunkScreen.close();
  });
  const stats = await page.evaluate(() => window.shine.game.dredge.data.stats);
  expect(stats.distance).toBeGreaterThan(20);
  expect(stats.rares).toBe(1);
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); g.pause(); });
  await page.click('#pause-ledger');
  await expect(page.locator('#ledger-totals')).toContainText('Rare finds1');
  await expect(page.locator('#ledger-totals')).toContainText('Miles driven');
  await expect(page.locator('#ledger-totals')).toContainText('Time on the road1 h 05 min');
  expect(problems).toEqual([]);
});
