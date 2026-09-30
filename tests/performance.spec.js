import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startRun(page);
});

test('the light count is fixed and no shaders compile when police spawn', async ({ page }) => {
  const before = await page.evaluate(() => window.shine.renderInfo());
  const after = await page.evaluate(() => {
    const g = window.shine.game;
    g.mission.heat = 3;
    g.police.setTarget(3, g.player, g.camera);
    window.shine.step(1);
    return window.shine.renderInfo();
  });
  expect(after.lights).toBe(before.lights);
  expect(after.lights).toBeLessThanOrEqual(4);
  expect(after.programs).toBe(before.programs);
});

test('the whole city draws in a small number of draw calls', async ({ page }) => {
  const info = await page.evaluate(() => window.shine.renderInfo());
  expect(info.calls).toBeLessThan(60);
});

test('no building sits on a road or sidewalk', async ({ page }) => {
  const overlaps = await page.evaluate(() => {
    const g = window.shine.game, B = g.world.cfg.blockSize, R = g.world.cfg.gridRadius;
    const half = g.world.cfg.roadWidth / 2 + g.world.cfg.sidewalk;
    const edge = R * B + half - 1;
    let n = 0;
    for (const b of g.world.buildings) {
      if ([b.minX, b.maxX, b.minZ, b.maxZ].some((v) => Math.abs(v) > edge)) continue; // boundary warehouses
      for (let r = -R; r <= R; r++) {
        const c = r * B;
        if (b.minX < c + half && b.maxX > c - half) n++;
        if (b.minZ < c + half && b.maxZ > c - half) n++;
      }
    }
    return n;
  });
  expect(overlaps).toBe(0);
});

test('reports frame rate (informational)', async ({ page }, testInfo) => {
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const s = performance.now();
    (function f() { n++; if (performance.now() - s < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - s) / 1000)); })();
  }));
  testInfo.annotations.push({ type: 'fps (software renderer)', description: fps.toFixed(1) });
  expect(fps).toBeGreaterThan(0.5);
});
