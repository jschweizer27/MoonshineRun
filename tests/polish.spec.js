import { test, expect } from '@playwright/test';
import { openGame, startRun, step, screenshot } from './helpers.js';

// Batch E: soundtrack and effects, the 1920s rig, particles, camera and the title screen.

test('the soundtrack plays, and R switches the radio off and on', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.enabled)).toBe(true);
  const bar0 = await page.evaluate(() => window.shine.game.audio.music._bar * 8 + window.shine.game.audio.music._eighth);
  await page.waitForTimeout(1200);
  const bar1 = await page.evaluate(() => window.shine.game.audio.music._bar * 8 + window.shine.game.audio.music._eighth);
  expect(bar1).not.toBe(bar0);                                // notes are being scheduled
  await page.keyboard.press('KeyR');
  expect(await page.evaluate(() => window.shine.game.audio.music.on)).toBe(false);
  await expect(page.locator('#toast')).toContainText('Radio off');
  await page.keyboard.press('KeyR');
  expect(await page.evaluate(() => window.shine.game.audio.music.on)).toBe(true);
  // Chases switch the band to hot jazz.
  await page.evaluate(() => { const g = window.shine.game; g.mission.heat = 1; window.shine.step(0.1); });
  expect(await page.evaluate(() => window.shine.game.audio.music.hot)).toBe(true);
});

test('the horse trailer swings behind the truck through a corner', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, t = v.trailer;
    window.shine.teleport(-44, 150, 0);
    window.shine.step(2, { throttle: 0.8 });
    window.shine.step(0.8, { throttle: 0.6, steer: 1 });
    const hx = v.position.x - v.forwardX * 2.65, hz = v.position.z - v.forwardZ * 2.65;
    return { lag: Math.abs(Math.atan2(Math.sin(v.heading - t.heading), Math.cos(v.heading - t.heading))), bar: Math.hypot(hx - t.x, hz - t.z) };
  });
  expect(r.lag).toBeGreaterThan(0.1);                         // articulated, not rigid
  expect(r.bar).toBeCloseTo(3.6, 1);                          // stays hitched
});

test('exhaust and dust while driving, sparks on a crash, a shake on impact', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const alive = () => page.evaluate(() => {
    const p = window.shine.game.particles;
    return { smoke: p.smoke.life.filter((l) => l > 0).length, glow: p.glow.life.filter((l) => l > 0).length };
  });
  await page.evaluate(() => { window.shine.teleport(-44, 150, 0); });
  await step(page, 1, { throttle: 1 });
  expect((await alive()).smoke).toBeGreaterThan(5);
  await page.evaluate(() => {
    const g = window.shine.game;
    const b = g.world.buildings.find((q) => !q.barn && q.minX > 20 && q.minZ > 20 && q.maxX < 200);
    window.shine.teleport((b.minX + b.maxX) / 2, b.maxZ + 25, 0);
  });
  const hit = await page.evaluate(() => {
    for (let k = 0; k < 120; k++) { window.shine.step(1 / 60, { throttle: 1 }); if (window.shine.game.particles.glow.life.some((l) => l > 0)) return window.shine.game.chase._trauma; }
    return -1;
  });
  expect(hit).toBeGreaterThan(0);
  expect((await alive()).glow).toBeGreaterThan(0);
});

test('speed widens the view, unless Reduce motion is on', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const fov = () => page.evaluate(() => window.shine.game.camera.fov);
  await page.evaluate(() => window.shine.teleport(-44, 200, 0));
  await step(page, 4, { throttle: 1 });
  expect(await fov()).toBeGreaterThan(64);
  await page.evaluate(() => {
    const g = window.shine.game;
    g.settings.reducedMotion = true;
    g.applySettings();
    window.shine.teleport(-44, 200, 0);
  });
  await step(page, 4, { throttle: 1 });
  expect(await fov()).toBeCloseTo(62, 0);
});

test('the title screen flies over the city', async ({ page }) => {
  await openGame(page);
  const a = await page.evaluate(() => window.shine.game.camera.position.toArray());
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => window.shine.game.camera.position.toArray());
  expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.5);
  expect(b[1]).toBeGreaterThan(40);                           // up over the rooftops
});

test('the city is dressed: neon signs, water towers, a sign for every buyer', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    let signs = 0, towers = 0;
    g.scene.traverse((o) => {
      if (o.material === g.world.signMaterial) signs = o.geometry.index.count / 12;   // 2 quads per sign
      if (o.isInstancedMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 2) towers = o.count;
    });
    return { signs, towers, drops: g.world.drops.length };
  });
  expect(r.signs).toBeGreaterThan(r.drops + 10);
  expect(r.towers).toBeGreaterThan(5);
  await page.evaluate(() => { window.shine.teleport(-44, 44, 0); window.shine.step(0.5, { throttle: 0.3 }); });
  await screenshot(page, '19-neon');
});

test('buildings have brick and stone facades, cornices, awnings and shop signs', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const w = window.shine.game.world;
    const info = window.shine.renderInfo();
    return {
      atlas: w.facadeTextures.length, width: w.facadeTextures[0].image.width,
      cornices: w.cornices.count, awnings: w.awnings.count, calls: info.calls,
    };
  });
  expect(r.atlas).toBe(2);                     // colour + glass mask
  expect(r.width).toBe(1024);                  // 4 facade styles
  expect(r.cornices).toBeGreaterThan(300);
  expect(r.awnings).toBeGreaterThan(20);
  expect(r.calls).toBeLessThan(60);
  await page.evaluate(() => window.shine.teleport(-88, 60, Math.PI / 2));
  await screenshot(page, '21-facades');
});
