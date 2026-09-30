import { test, expect } from '@playwright/test';
import { openGame, startRun, step, snapshot, screenshot } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startRun(page);
});

test('full run: pick an order at the still, deliver it to the buyer, get paid', async ({ page }) => {
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.pickup.position.x, m.pickup.position.z + 3); });
  await step(page, 0.2);
  await expect(page.locator('#orders')).toBeVisible();
  await expect(page.locator('#orders-body .order')).toHaveCount(3);
  await screenshot(page, '11-orders');
  await page.locator('#orders-body .order').first().click();
  const loaded = await snapshot(page);
  expect(loaded.carrying).toBe(true);
  expect(loaded.state).toBe('playing');
  await expect(page.locator('#cargo')).toContainText('JUGS');
  const pay = await page.evaluate(() => window.shine.game.mission.order.pay);
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.drop.position.x, m.drop.position.z); });
  const s = await step(page, 0.1);
  expect(s.carrying).toBe(false);
  expect(s.cash).toBe(pay);
  expect(s.runs).toBe(1);
  await expect(page.locator('#cash')).toHaveText(`$${pay.toLocaleString()}`);
  // A new still is waiting.
  expect(await page.evaluate(() => window.shine.game.mission.pickup.visible)).toBe(true);
});

test('stills never spawn near the player, and buyers are across town', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    let still = Infinity, drop = Infinity;
    for (let k = 0; k < 30; k++) {
      g.resetRun('loop');
      still = Math.min(still, g.mission.pickup.position.distanceTo(g.player.position));
      window.shine.loadShine(k % 2);
      drop = Math.min(drop, g.mission.drop.position.distanceTo(g.player.position));
    }
    return { still, drop };
  });
  expect(r.still).toBeGreaterThanOrEqual(150);
  expect(r.drop).toBeGreaterThanOrEqual(180);
});

test('hauling shine gets you tipped off, and staying out of sight sheds the heat', async ({ page }) => {
  await page.evaluate(() => window.shine.loadShine(0));
  // Wait (parked at the barn) only until informants tip off the law; wait longer and the
  // police arrive and pin the parked truck.
  let s = await page.evaluate(() => {
    let snap;
    for (let k = 0; k < 60; k++) { snap = window.shine.step(1); if (snap.tier >= 1) break; }
    return snap;
  });
  expect(s.state).toBe('playing');
  expect(s.carrying).toBe(true);
  expect(s.tier).toBeGreaterThanOrEqual(1);
  expect(s.pursuers).toBeGreaterThanOrEqual(1);
  const before = await page.evaluate(() => {
    const g = window.shine.game;
    // Just the evasion rule: no patrols or roadblocks wandering into view.
    g.police.patrolTarget = { city: 0, county: 0 };
    g.police.reset();
    g.police.roadblocks._timer = 1e9;
    g.mission.heat = 2;
    g.police.setTarget(2, g.player, g.camera);
    g.police.contact = true;
    window.shine.teleport(-176, -176, 0);
    g.police.active.forEach((u, k) => { u.car.place(176 - k * 10, 176, 0); u.lastKnown.set(176, 0, 176); u.mode = 'search'; });
    return g.mission.heat;
  });
  s = await step(page, 12);
  expect(s.state).toBe('playing');
  expect(s.carrying).toBe(true);
  expect(s.heat).toBeLessThan(before);
});

test('police drive the streets, catch a parked truck, and the busted screen is silent', async ({ page }) => {
  await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.loadShine(0);
    window.shine.teleport(0, 0, 0);
    g.mission.heat = 1;
    g.police.setTarget(1, g.player, g.camera);
  });
  // Wait for the pursuer to close in, then face it for the screenshot.
  await page.evaluate(() => {
    const g = window.shine.game;
    const u = g.police.active.find((x) => x.mode === 'chase' || x.mode === 'search');
    for (let k = 0; k < 60 * 20 && u.car.position.distanceTo(g.player.position) > 30; k++) window.shine.step(1 / 60);
    const c = u.car.position, p = g.player.position;
    window.shine.teleport(p.x, p.z, Math.atan2(c.x - p.x, -(c.z - p.z)) + 0.35);
    window.shine.step(0.05);
  });
  await screenshot(page, '03-chase');
  const s = await step(page, 30);
  expect(s.state).toBe('gameover');
  await expect(page.locator('#gameover')).toBeVisible();
  await expect(page.locator('#gameover-detail')).toContainText('seized');
  await page.waitForTimeout(500);
  const gains = await page.evaluate(() => { const a = window.shine.game.audio; return a.enabled ? [a.engineGain.gain.value, a.sirenGain.gain.value] : [0, 0]; });
  expect(gains[0]).toBeLessThan(0.002);
  expect(gains[1]).toBeLessThan(0.002);
  await screenshot(page, '04-busted');
});

test('the best streak is saved and shown on the busted screen', async ({ page }) => {
  await page.evaluate(() => { const g = window.shine.game; g.mission.streakEarned = 1700; g.mission.streakRuns = 2; g.bust(); });
  await expect(page.locator('#gameover')).toContainText('This streak: $1,700');
  await expect(page.locator('#gameover')).toContainText('Best streak: $1,700');
  await expect(page.locator('#new-best')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shine.career.v1')).stats.bestStreak)).toBe(1700);
});

test('restarting reuses the world (GPU memory stays flat)', async ({ page }) => {
  // The first round uploads the police cars (drawn for the first time); after that the
  // count must not grow. The old build leaked ~210 geometries per restart.
  const counts = [];
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => {
      const g = window.shine.game;
      g.mission.heat = 2;
      g.police.setTarget(2, g.player, g.camera);
      window.shine.step(0.5);
      g.bust();
    });
    await page.click('#restart-btn');
    counts.push((await page.evaluate(() => window.shine.renderInfo())).geometries);
  }
  expect(new Set(counts.slice(1)).size).toBe(1);
  expect((await snapshot(page)).state).toBe('playing');
});
