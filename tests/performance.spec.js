import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startRun(page);
});

test('the light count is fixed and no shaders compile when police spawn or the lamps change', async ({ page }) => {
  const before = await page.evaluate(() => window.shine.renderInfo());
  const after = await page.evaluate(() => {
    const g = window.shine.game;
    g.mission.heat = 3;
    g.police.setTarget(3, g.player, g.camera);
    window.shine.step(1);
    // Drive down the avenue: the lamp lights hop from lamp to lamp.
    window.shine.teleport(0, 200, 0);
    for (let i = 0; i < 6; i++) { window.shine.step(0.5, { throttle: 1 }); g.renderFrame(); }
    return window.shine.renderInfo();
  });
  expect(after.lights).toBe(before.lights);
  expect(after.lights).toBeLessThanOrEqual(13);    // sky, moon, headlight, fx + 8 lamps + 1 lamp spot
  expect(after.programs).toBe(before.programs);
});

test('real lamp light follows the view: the lit lamps are the ones nearby', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.shine.game, w = g.world;
    window.shine.teleport(-88, 150, 0);
    window.shine.step(0.2);
    g.renderFrame();
    const lit = w.lampLights.filter((l) => l.intensity > 1);
    const far = Math.max(...lit.map((l) => Math.hypot(l.position.x - g.camera.position.x, l.position.z - g.camera.position.z)));
    return { lit: lit.length, far, spot: w.lampSpot.intensity };
  });
  expect(r.lit).toBeGreaterThanOrEqual(4);
  expect(r.far).toBeLessThan(80);
  expect(r.spot).toBeGreaterThan(1);
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
