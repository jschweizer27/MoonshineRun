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

// Drive the player into the first prop well inside the city (from 11 m away); returns its track.
const hitProp = (page, skip = 0) => page.evaluate((skip) => {
  const g = window.shine.game, pr = g.props;
  let i = 0;
  for (; i < pr.n; i++) if (Math.abs(pr.home[i * 4 + 1]) < 150 && Math.abs(pr.home[i * 4]) < 180 && skip-- <= 0) break;
  const x = pr.home[i * 4], z = pr.home[i * 4 + 1];
  window.shine.teleport(x - 7, z + 9, Math.atan2(7, 9));
  let top = 0;
  for (let k = 0; k < 100; k++) { window.shine.step(1 / 60, { throttle: 0.9 }); top = Math.max(top, pr.pos[i * 3 + 1]); }
  return { i, moved: Math.hypot(pr.pos[i * 3] - x, pr.pos[i * 3 + 2] - z), top };
}, skip);

test('impacts: a hard crash holds a beat, rattles the body and throws debris; props get knocked flying', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const before = await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.step(0.1); g.renderFrame();
    return { programs: g.renderer.info.programs.length, geometries: g.renderer.info.memory.geometries };
  });
  const crash = await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.teleport(140, 132, Math.PI / 2);          // flat out into the warehouses
    let impact = 0;
    for (let k = 0; k < 400 && !impact; k++) { window.shine.step(1 / 60, { throttle: 1 }); if (g.player.impact > 6) impact = g.player.impact; }
    const at = { hitStop: g.hitStop, debris: g.debris.alive, rattle: g.feel.rattle };
    window.shine.step(0.05);
    return { impact, ...at, dent: g.feel.dent.x };
  });
  expect(crash.impact).toBeGreaterThan(9);
  expect(crash.hitStop).toBeGreaterThan(0.03);          // ~50 ms hold, run by the main loop
  expect(crash.debris).toBeGreaterThan(10);
  expect(crash.rattle).toBeGreaterThan(0.03);
  expect(crash.dent).toBeLessThan(-0.01);              // squashed, springing back
  // The real-time loop holds the action for the hit-stop, then carries on.
  // (Headless frames are slow, so poll rather than sleep a fixed time.)
  await page.evaluate(() => { const g = window.shine.game; g._impact(1, g.player.position.x, g.player.position.z); window.__t0 = g.time; });
  expect(await page.evaluate(() => window.shine.game.hitStop)).toBeGreaterThan(0.03);
  await expect.poll(() => page.evaluate(() => window.shine.game.hitStop <= 0 && window.shine.game.time > window.__t0), { timeout: 10_000 }).toBe(true);

  const prop = await hitProp(page);
  expect(prop.moved).toBeGreaterThan(1.5);
  expect(prop.top).toBeGreaterThan(0.6);               // it flew
  const settled = await page.evaluate((i) => { window.shine.step(4); const pr = window.shine.game.props; return { moving: pr.moving[i], y: pr.pos[i * 3 + 1] }; }, prop.i);
  expect(settled.moving).toBe(0);
  expect(settled.y).toBeGreaterThan(0.05);             // resting on the road, not under it
  const after = await page.evaluate(() => ({ programs: window.shine.game.renderer.info.programs.length, geometries: window.shine.game.renderer.info.memory.geometries }));
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);

  // J: no hit-stop, no debris, props stay put.
  await page.keyboard.press('KeyJ');
  const off = await page.evaluate(() => {
    const g = window.shine.game;
    g.props.reset(); g.debris.clear(); g.hitStop = 0;
    g._impact(1, 0, 0);
    return { hitStop: g.hitStop, debris: g.debris.alive };
  });
  expect(off.hitStop).toBe(0);
  expect(off.debris || 0).toBe(0);
  const still = await hitProp(page);
  expect(still.moved).toBeLessThan(0.01);
});
