import { test, expect } from '@playwright/test';
import { openGame, startRun, step, snapshot, screenshot } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startRun(page);
});

test('full run: load at the still, deliver to the drop, get paid', async ({ page }) => {
  // Start 14 m short of the still (every still sits on a north-south street) and drive in.
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.pickup.position.x, m.pickup.position.z + 14, 0); });
  let s = await step(page, 2, { throttle: 0.6 });
  expect(s.carrying).toBe(true);
  await expect(page.locator('#cargo')).toBeVisible();
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.drop.position.x, m.drop.position.z, 0); });
  s = await step(page, 0.1);
  expect(s.carrying).toBe(false);
  expect(s.cash).toBe(850);
  expect(s.runs).toBe(1);
  await expect(page.locator('#cash')).toHaveText('$850');
});

test('stills and drops never spawn near the player', async ({ page }) => {
  const min = await page.evaluate(() => {
    const g = window.shine.game;
    let m = Infinity;
    for (let k = 0; k < 40; k++) {
      g.resetRun();
      m = Math.min(m, g.mission.pickup.position.distanceTo(g.player.position));
      window.shine.teleport(g.mission.pickup.position.x, g.mission.pickup.position.z);
      window.shine.step(1 / 60);
      m = Math.min(m, g.mission.drop.position.distanceTo(g.player.position) - 30);
    }
    return m;
  });
  expect(min).toBeGreaterThanOrEqual(150);
});

test('hauling shine gets you tipped off, and staying out of sight sheds the heat', async ({ page }) => {
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.pickup.position.x, m.pickup.position.z); });
  let s = await step(page, 14);            // informants tip off the law
  expect(s.carrying).toBe(true);
  expect(s.tier).toBeGreaterThanOrEqual(1);
  expect(s.pursuers).toBeGreaterThanOrEqual(1);
  const before = await page.evaluate(() => {
    const g = window.shine.game;
    g.mission.heat = 2;
    g.police.setTarget(2, g.player, g.camera);
    g.police.contact = true;
    window.shine.teleport(-176, -176, 0);
    g.police.active.forEach((u, k) => { u.car.place(176 - k * 10, 176, 0); u.lastKnown.set(176, 0, 176); u.mode = 'search'; });
    return g.mission.heat;
  });
  s = await step(page, 12);
  expect(s.carrying).toBe(true);
  expect(s.heat).toBeLessThan(before);
});

test('police drive the streets, catch a parked truck, and the busted screen is silent', async ({ page }) => {
  await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.teleport(0, 0, 0);
    g.mission.carrying = true;
    g.mission.pickup.visible = false;
    g.mission.drop.position.set(176, 0, -176);
    g.mission.drop.visible = true;
    g.hud.setCargo(true);
    g.mission.heat = 1;
    g.police.setTarget(1, g.player, g.camera);
  });
  const start = await page.evaluate(() => window.shine.game.police.active[0].car.position.distanceTo(window.shine.game.player.position));
  expect(start).toBeGreaterThan(100);
  // Wait for the pursuer to close in, then face it for the screenshot.
  await page.evaluate(() => {
    const g = window.shine.game, u = g.police.active[0];
    for (let k = 0; k < 60 * 20 && u.car.position.distanceTo(g.player.position) > 30; k++) window.shine.step(1 / 60);
    const c = u.car.position, p = g.player.position;
    window.shine.teleport(p.x, p.z, Math.atan2(c.x - p.x, -(c.z - p.z)) + 0.35);
    window.shine.step(0.05);
  });
  await screenshot(page, '03-chase');
  const s = await step(page, 30);
  expect(s.state).toBe('gameover');
  await expect(page.locator('#gameover')).toBeVisible();
  await page.waitForTimeout(500);
  const gains = await page.evaluate(() => { const a = window.shine.game.audio; return a.enabled ? [a.engineGain.gain.value, a.sirenGain.gain.value] : [0, 0]; });
  expect(gains[0]).toBeLessThan(0.002);
  expect(gains[1]).toBeLessThan(0.002);
  await screenshot(page, '04-busted');
});

test('the best haul is saved and shown on the busted screen', async ({ page }) => {
  await page.evaluate(() => { localStorage.clear(); const g = window.shine.game; g.mission.cash = 1700; g.mission.runs = 2; g.bust(); });
  await expect(page.locator('#gameover')).toContainText('This run: $1,700');
  await expect(page.locator('#gameover')).toContainText('Best haul: $1,700');
  await expect(page.locator('#new-best')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shine.records.v1')).bestHaul)).toBe(1700);
});

test('restarting reuses the city (GPU memory stays flat)', async ({ page }) => {
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
