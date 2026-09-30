import { test, expect } from '@playwright/test';
import { openGame, startRun, screenshot } from './helpers.js';

test('boots with no errors and no external requests, then shows the intro', async ({ page }) => {
  const problems = await openGame(page);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#intro')).toBeVisible();
  await screenshot(page, '01-title');
  await startRun(page);
  expect(problems).toEqual([]);
});

test('explains the problem instead of a dead screen when a game file fails to load', async ({ page }) => {
  await page.route('**/vendor/three/**', (r) => r.abort());
  await page.goto('/?test');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toContainText('couldn’t start');
  await expect(page.locator('#error button')).toBeVisible();
});

for (const [w, h] of [[375, 667], [844, 390], [320, 568]]) {
  test(`START is reachable and tappable on a ${w}x${h} phone`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openGame(page);
    await page.locator('#start-btn').scrollIntoViewIfNeeded();
    const box = await page.locator('#start-btn').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(h);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    await page.tap('#start-btn');
    await expect.poll(() => page.evaluate(() => window.shine.game.state)).toBe('playing');
    if (w === 375) await screenshot(page, '06-phone');
    await ctx.close();
  });
}
