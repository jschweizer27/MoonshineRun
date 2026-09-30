import { test, expect } from '@playwright/test';
import { openGame, startRun, step, snapshot, screenshot, luminance } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startRun(page);
});

test('the night city is bright enough to read', async ({ page }) => {
  await page.evaluate(() => window.shine.teleport(0, 0, 0));
  await step(page, 1.5, { throttle: 1 });
  expect(await luminance(page)).toBeGreaterThan(0.1);
  await screenshot(page, '02-driving');
});

test('steering right turns the truck right, and right is on the right of the screen', async ({ page }) => {
  await page.evaluate(() => window.shine.teleport(0, 0, 0)); // facing north (-Z)
  const s = await step(page, 2, { throttle: 1, steer: 1 });
  expect(s.heading).toBeGreaterThan(0.3);   // clockwise = right turn
  expect(s.x).toBeGreaterThan(1);           // moved east
  const ndcX = await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.teleport(0, 0, 0);
    g.camera.updateMatrixWorld();
    return g.player.position.clone().set(6, 1, -10).project(g.camera).x;
  });
  expect(ndcX).toBeGreaterThan(0);          // east appears to the right when facing north
});

test('cannot drive through a building', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    const b = g.world.buildings.find((q) => q.minX > 20 && q.minZ > 20 && q.maxX < 200);
    window.shine.teleport((b.minX + b.maxX) / 2, b.maxZ + 30, 0); // south of it, facing it
    let inside = false;
    for (let k = 0; k < 180; k++) {
      window.shine.step(1 / 60, { throttle: 1 });
      const p = g.player.position;
      if (p.x > b.minX + 0.3 && p.x < b.maxX - 0.3 && p.z > b.minZ + 0.3 && p.z < b.maxZ - 0.3) inside = true;
    }
    return { inside, z: g.player.position.z, face: b.maxZ };
  });
  expect(r.inside).toBe(false);
  expect(r.z).toBeGreaterThanOrEqual(r.face);
});

test('cannot leave the city', async ({ page }) => {
  await page.evaluate(() => window.shine.teleport(0, 200, Math.PI)); // facing south
  const s = await step(page, 6, { throttle: 1 });
  expect(s.z).toBeLessThan(229);
});

test('handbrake lets the truck slide', async ({ page }) => {
  await page.evaluate(() => window.shine.teleport(0, 150, 0));
  await step(page, 2.5, { throttle: 1 });
  const slip = await page.evaluate(() => {
    let max = 0;
    for (let k = 0; k < 30; k++) { window.shine.step(1 / 60, { throttle: 1, steer: 1, handbrake: true }); max = Math.max(max, window.shine.game.player.slip); }
    return max;
  });
  expect(slip).toBeGreaterThan(2);
  expect((await snapshot(page)).state).toBe('playing');
});
