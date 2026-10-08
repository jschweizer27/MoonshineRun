import { test, expect } from '@playwright/test';
import { openGame, waitForBoot } from './helpers.js';

const dialogOpen = (page) => page.evaluate(() => !document.getElementById('dialog').classList.contains('hidden'));

// Click through every card (the first click on a card finishes its typing).
async function readAll(page) {
  const seen = [];
  for (let k = 0; k < 40 && await dialogOpen(page); k++) {
    seen.push(await page.locator('#dialog-name').textContent());
    await page.click('#dialog-next');
  }
  return seen;
}

test('story: a new game opens with the prologue, beats play once per save at their moments, and the drive waits under them', async ({ page }) => {
  const problems = await openGame(page, '&story');
  await page.click('#start-btn');
  // The prologue: narration, then Otto. The drive is paused under it.
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog')).toHaveClass(/narration/);
  expect(await page.evaluate(() => window.shine.game.state)).toBe('paused');
  const speakers = await readAll(page);
  expect(speakers.length).toBeGreaterThanOrEqual(4);
  expect(speakers).toContain('Otto Braun');
  // Then Chapter 1 opens (chapters.js): its card, and the drive goes on.
  await page.waitForFunction(() => window.shine.game.dredge.data.opened.ashes === true, null, { timeout: 20_000 });
  await readAll(page);
  expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');

  // Systems not reached yet (brewing, contracts, ranks) don't play early.
  await page.evaluate(() => { const L = window.shine.game.loot; L.active.fill(0); L.timer.fill(1e9); L.rareIn = 1e9; window.shine.step(1); });
  expect(await dialogOpen(page)).toBe(false);

  // Reaching a valley town: the Jockey.
  await page.evaluate(() => {
    window.shine.teleport(0, -560, Math.PI); window.shine.step(0.2);
    window.shine.teleport(0, -600, Math.PI); window.shine.step(1.2);
  });
  await expect(page.locator('#dialog')).toBeVisible();
  expect(await readAll(page)).toContain('The Jockey');
  expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');

  // A rare find: his warning.
  await page.evaluate(() => { window.shine.game.dredge.data.stats.rares = 1; window.shine.step(1); });
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog-face')).toHaveText('J');
  await page.click('#dialog-skip');

  // Seen once: a reload and CONTINUE plays nothing again.
  await page.reload();
  await waitForBoot(page);
  await page.click('#start-btn');
  await page.evaluate(() => window.shine.step(1.5));
  expect(await dialogOpen(page)).toBe(false);
  const seen = await page.evaluate(() => window.shine.game.dredge.data.story);
  expect(seen).toEqual({ prologue: true, valley: true, rare: true });
  expect(problems).toEqual([]);
});

test('story cards: reduced motion shows each line whole, and Esc skips', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shine.settings.v1', JSON.stringify({ reducedMotion: true })));
  const problems = await openGame(page, '&story');
  await page.click('#start-btn');
  await expect(page.locator('#dialog-text')).toHaveText(/^Baltimore, 1922\. The Volstead Act/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');
  expect(problems).toEqual([]);
});
