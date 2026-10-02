import { test, expect } from '@playwright/test';
import { openGame, startRun, snapshot } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startRun(page);
});

test('the light count is fixed and no shaders compile as loot, the markets and the lamps come and go', async ({ page }) => {
  const before = await page.evaluate(() => window.shine.renderInfo());
  const after = await page.evaluate(() => {
    const g = window.shine.game;
    g.perks.pickupRadius = 0;            // drive past the loot rather than stopping for it
    // Drive down the avenue: the lamp lights hop from lamp to lamp, loot comes and goes.
    window.shine.teleport(0, 200, 0);
    for (let i = 0; i < 6; i++) { window.shine.step(0.5, { throttle: 1 }); g.renderFrame(); }
    // Up to each market: its marker comes into view (the other one hides).
    for (const [x, z] of [[-44, 70], [0, -620]]) { window.shine.teleport(x, z, 0); window.shine.step(0.1); g.renderFrame(); }
    return window.shine.renderInfo();
  });
  expect(after.lights).toBe(before.lights);
  expect(after.lights).toBeLessThanOrEqual(12);    // sky, moon, headlight + 8 lamps + 1 lamp spot
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

test('the truck\'s wheels draw through one instanced mesh, spinning and steering', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.shine.game, out = { batches: 0 };
    const meshes = [];
    g.scene.traverse((o) => { if (o.isInstancedMesh && o.userData.wheels) meshes.push(o); });
    out.batches = meshes.length;
    const front = g.player.model.wheels[0], m = front.matrixWorld.clone();
    g.perks.pickupRadius = 0;
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
    out.count = meshes.reduce((n, b) => n + b.count, 0);
    return out;
  });
  expect(r.batches).toBe(1);
  expect(r.count).toBe(4);
  expect(r.spun).toBe(true);
  expect(r.found).toBe(true);
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

test('quitting and starting again reuses the world (GPU memory stays flat)', async ({ page }) => {
  // The old build leaked ~210 geometries per restart; nothing may grow from round to round.
  const counts = [];
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => {
      const g = window.shine.game;
      g.perks.pickupRadius = 0;
      window.shine.step(0.5, { throttle: 1 });
      g.quitToTitle();
    });
    await page.click('#start-btn');
    counts.push(await page.evaluate(() => { window.shine.game.renderFrame(); const i = window.shine.renderInfo(); return [i.geometries, i.textures, i.programs].join(','); }));
  }
  expect(new Set(counts).size).toBe(1);
  expect((await snapshot(page)).state).toBe('playing');
});
