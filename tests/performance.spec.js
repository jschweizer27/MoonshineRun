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
  expect(info.shadowCalls).toBeLessThan(60);        // moon + nearest-lamp shadow maps
  expect(info.postCalls).toBeLessThan(20);          // bloom mips, tone mapping, grade
});

test('every wheel in the city draws through two instanced meshes, spinning and steering', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.shine.game, out = { batches: 0 };
    const meshes = [];
    g.scene.traverse((o) => { if (o.isInstancedMesh && o.userData.wheels) meshes.push(o); });
    out.batches = meshes.length;
    const front = g.player.model.wheels[0], m = front.matrixWorld.clone();
    window.shine.teleport(0, 205, 0);
    window.shine.step(0.3, { throttle: 1 });
    g.renderFrame();
    const before = front.matrixWorld.clone();
    window.shine.step(0.2, { throttle: 1, steer: 1 });
    g.renderFrame();
    out.spun = !front.matrixWorld.equals(before);
    // The instance for that wheel carries its current world matrix.
    let found = false;
    for (const b of meshes) for (let i = 0; i < b.count; i++) { b.getMatrixAt(i, m); if (m.elements.every((e, k) => Math.abs(e - front.matrixWorld.elements[k]) < 1e-3)) found = true; }
    out.found = found;
    // A full chase: each pursuer costs its body, lamps and sirens; its wheels cost nothing.
    const calls0 = window.shine.renderInfo().calls;
    g.mission.heat = 3;
    g.police.setTarget(3, g.player, g.camera);
    window.shine.step(1);
    out.cops = g.police.units.filter((u) => u.active).length;
    out.added = window.shine.renderInfo().calls - calls0;
    return out;
  });
  expect(r.batches).toBe(2);
  expect(r.spun).toBe(true);
  expect(r.cops).toBeGreaterThan(1);
  expect(r.found).toBe(true);
  expect(r.added).toBeLessThanOrEqual(r.cops * 4);
});

test('post-processing: bloom and grade on High, skipped on Low, no new shaders mid-game', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    const high = { on: g.post.enabled, bloom: g.post.bloom.enabled, grade: g.post.grade.enabled };
    g.renderFrame();
    const programs = g.renderer.info.programs.length;
    window.shine.step(2, { throttle: 1 });
    g.renderFrame();
    const after = g.renderer.info.programs.length;
    g.settings.quality = 'low';
    g.applySettings();
    return { high, programs, after, low: g.post.enabled };
  });
  expect(r.high).toEqual({ on: true, bloom: true, grade: true });
  expect(r.after).toBe(r.programs);
  expect(r.low).toBe(false);
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
  expect(fps).toBeGreaterThan(0.2);   // only checks it isn't stuck (software GPU)
});
