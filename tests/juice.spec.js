import { test, expect } from '@playwright/test';
import { openGame, startRun, step, screenshot } from './helpers.js';

// Game feel (src/juice.js): visual only, and switchable with J.

const feel = (page) => page.evaluate(() => {
  const g = window.shine.game, f = g.feel, k = f.skids;
  let skids = 0, smoke = 0;
  for (let i = 0; i < k.n; i++) if (k.col[i * 16 + 3] > 0.01) skids++;
  for (let i = 0; i < g.particles.smoke.n; i++) if (g.particles.smoke.life[i] > 0) smoke++;
  return { roll: f.roll.x, pitch: f.pitch.x, sway: f.trailerRoll.x, fov: g.camera.fov, skids, smoke };
});

test('a handbrake drift leans the rig, smokes the tyres and lays skid marks; braking dives the nose', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => window.shine.teleport(0, 205, 0));
  await step(page, 2.2, { throttle: 1 });
  const fast = await feel(page);
  expect(fast.fov).toBeGreaterThan(68);                    // the view widens at speed
  await step(page, 0.3, { throttle: -1 });
  expect((await feel(page)).pitch).toBeLessThan(-0.03);    // nose down under hard braking
  await step(page, 0.8, { throttle: 1 });
  await step(page, 0.45, { throttle: 1, steer: 1, handbrake: true });
  const drift = await feel(page);
  expect(Math.abs(drift.roll)).toBeGreaterThan(0.05);      // ~3° or more of lean
  expect(Math.abs(drift.sway)).toBeGreaterThan(0.03);      // the horse box sways too
  expect(drift.skids).toBeGreaterThan(20);
  expect(drift.smoke).toBeGreaterThan(40);
  await screenshot(page, '20-drift');
});

test('J switches every game-feel effect off, and back on', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#toast')).toContainText('Juice OFF');
  await page.evaluate(() => window.shine.teleport(0, 205, 0));
  await step(page, 2.2, { throttle: 1 });
  await step(page, 0.45, { throttle: 1, steer: 1, handbrake: true });
  const off = await feel(page);
  expect(off.fov).toBeCloseTo(62, 0);                      // no FOV kick
  expect(off.roll).toBe(0);
  expect(off.skids).toBe(0);
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#toast')).toContainText('Juice ON');
});

test('the moonlight casts shadows, and the light count stays fixed', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    let lights = 0;
    g.scene.traverse((o) => { if (o.isLight) lights++; });
    return { shadows: g.world.moon.castShadow, map: g.world.moon.shadow.mapSize.x, fog: g.scene.fog.isFogExp2, lights };
  });
  expect(r.shadows).toBe(true);
  expect(r.map).toBe(2048);
  expect(r.fog).toBe(true);
  expect(r.lights).toBe(13);
});
