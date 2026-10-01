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

test('UI feedback: the cash pops, the heat bumps, the edges flash when spotted, the banner slides, the speedo eases', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  // A delivery: the counter swells as it rolls up, and the takings float up.
  await page.evaluate(() => {
    window.shine.loadShine(0);
    const m = window.shine.game.mission;
    window.shine.teleport(m.drop.position.x, m.drop.position.z);
    window.shine.step(0.1);
  });
  await expect(page.locator('#cash')).toHaveClass(/pop/);
  await expect(page.locator('#cash-pop')).toHaveClass(/show/);
  await expect(page.locator('#cash-pop')).toContainText('+$');
  const r = await page.evaluate(() => {
    const g = window.shine.game, h = g.hud, has = (id, c) => document.getElementById(id).classList.contains(c);
    h.setObjective('Deliver to the Owl Bar', 300, 'drop');
    const slide = has('objective', 'slide');
    h.setHeat(0, '', 0, '');
    h.setHeat(1, 'seen', 0.2, 'building');
    const bump = has('heat', 'bump');
    h.setHeat(1, 'seen', 0.3, 'building');
    const throb = has('heat-meter', 'rising');
    g._onEvents([{ type: 'spotted', reason: 'patrol' }], {});
    const flash = has('siren-flash', 'on');
    h._speedShown = 0;
    h.setSpeed(60, 1 / 60);
    const first = Number(document.getElementById('speed').textContent);
    for (let k = 0; k < 90; k++) h.setSpeed(60, 1 / 60);
    const settled = Number(document.getElementById('speed').textContent);
    return { slide, bump, throb, flash, first, settled };
  });
  expect(r.slide).toBe(true);
  expect(r.bump).toBe(true);
  expect(r.throb).toBe(true);
  expect(r.flash).toBe(true);
  expect(r.first).toBeLessThan(15);            // eases up...
  expect(r.settled).toBe(60);                  // ...and arrives
  await screenshot(page, '26-ui-feedback');

  // J: the numbers snap and nothing flashes or bumps.
  await page.keyboard.press('KeyJ');
  const off = await page.evaluate(() => {
    const g = window.shine.game, h = g.hud, el = (id) => document.getElementById(id);
    for (const [id, c] of [['siren-flash', 'on'], ['heat', 'bump'], ['objective', 'slide']]) el(id).classList.remove(c);
    h.setSpeed(80, 1 / 60);
    h.sirenFlash();
    h.setHeat(0, '', 0, ''); h.setHeat(2, 'seen', 0.1, 'building');
    h.setObjective('Load shine at the still', 500, 'still');
    return { speed: Number(el('speed').textContent), flash: el('siren-flash').classList.contains('on'), bump: el('heat').classList.contains('bump'), slide: el('objective').classList.contains('slide') };
  });
  expect(off).toEqual({ speed: 80, flash: false, bump: false, slide: false });
});

test('audio: the engine works under load, wind at speed, distant sirens muffled until close, the radio ducks, jazz by the speakeasies', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.enabled)).toBe(true);
  // Stop the game's own loop so only these settings drive the sound.
  await page.evaluate(() => window.shine.game.renderer.setAnimationLoop(null));
  const read = (s) => page.evaluate(async (s) => {
    const a = window.shine.game.audio;
    a.update({ speed01: 0, rpm01: 0, slip01: 0, siren01: 0, doppler: 1, hot: false, rain01: 0, ...s });
    await new Promise((r) => setTimeout(r, 1500));
    return { wind: a.windGain.gain.value, duck: a.duck.gain.value, filter: a.sirenFilter.frequency.value, engine: a.engineFilter.frequency.value, jazz: a.jazz.on, jazzGain: a.jazzGain.gain.value };
  }, s);
  const idle = await read({});
  const fast = await read({ speed01: 1, rpm01: 0.8, throttle01: 1 });
  expect(idle.wind).toBeLessThan(0.005);
  expect(fast.wind).toBeGreaterThan(0.04);
  expect(fast.engine).toBeGreaterThan(idle.engine + 1000);       // brighter under throttle
  const far = await read({ siren01: 0.25, near01: 0 });
  const near = await read({ siren01: 1, near01: 1 });
  expect(far.filter).toBeLessThan(1200);                          // muffled in the distance
  expect(near.filter).toBeGreaterThan(4000);
  expect(far.duck).toBeGreaterThan(0.95);
  expect(near.duck).toBeLessThan(0.5);                            // the radio ducks under them
  const club = await read({ jazz01: 1 });
  expect(club.jazz).toBe(true);
  expect(club.jazzGain).toBeGreaterThan(0.2);
  const level = await page.evaluate(() => { const g = window.shine.game, d = g.world.drops[0]; return [g._jazzLevel({ x: d.x, z: d.z }), g._jazzLevel({ x: d.x + 500, z: d.z })]; });
  expect(level[0]).toBeGreaterThan(0.9);
  expect(level[1]).toBe(0);
  // J: no wind, no ducking, no jazz.
  await page.keyboard.press('KeyJ');
  const off = await read({ speed01: 1, siren01: 1, near01: 1, jazz01: 1 });
  expect(off.wind).toBeLessThan(0.005);
  expect(off.duck).toBeGreaterThan(0.95);
  expect(off.jazz).toBe(false);
});

test('cinematic: slow-mo on big crashes and near-misses, the siren light sweeps, speed lines at top speed', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, out = {};
    // Flat out: the corners pulse and speed lines streak; slow, nothing.
    v.speed = v.t.maxSpeed; g.renderFrame();
    out.rush = g.post.grade.uniforms.uRush.value;
    v.speed = 10; g.renderFrame();
    out.calm = g.post.grade.uniforms.uRush.value;
    // A big crash: slow motion.
    g._impact(0.9, v.position.x, v.position.z);
    out.slow = g.timeScale;
    g.slowMo = 0;
    // A pursuer flashes past, a couple of metres off: a near-miss.
    const u = g.police.units[0];
    u.active = true; u.mode = 'chase';
    u.car.setVisible(true);
    u.car.place(v.position.x + 3.6, v.position.z, Math.PI);
    u.car.vx = 0; u.car.vz = 22;
    g._nearMisses({ touching: 0 });
    out.nearMiss = g.slowMo > 0;
    // Its beacon sweeps red light across the street.
    g._sirenSweep();
    out.sweep = g.world.fxLight.intensity;
    out.red = g.world.fxLight.color.r > 0.9 && g.world.fxLight.color.g < 0.2;
    let lights = 0;
    g.scene.traverse((o) => { if (o.isLight) lights++; });
    out.lights = lights;
    u.active = false; u.car.setVisible(false);   // park it again (or it would bust us)
    g.slowMo = 0; g.hitStop = 0;
    return out;
  });
  expect(r.rush).toBeGreaterThan(0.9);
  expect(r.calm).toBe(0);
  expect(r.slow).toBeLessThan(0.5);
  expect(r.nearMiss).toBe(true);
  expect(r.sweep).toBeGreaterThan(5);
  expect(r.red).toBe(true);
  expect(r.lights).toBe(13);                  // the shared effects light, moved; nothing added
  // The real-time loop runs slow, then returns to normal speed.
  // (Headless frames are slow and each is capped at 50 ms, so trim it to one frame's worth.)
  await page.evaluate(() => { const g = window.shine.game; g._impact(0.9, 0, 0); g.hitStop = 0; g.slowMo = 0.04; });
  await expect.poll(() => page.evaluate(() => window.shine.game.timeScale), { timeout: 30_000 }).toBe(1);
  // J: none of it.
  await page.keyboard.press('KeyJ');
  const off = await page.evaluate(() => {
    const g = window.shine.game, v = g.player;
    v.speed = v.t.maxSpeed; g.renderFrame();
    g.slowMo = 0; g._impact(0.9, 0, 0);
    g._sirenSweep();
    return { rush: g.post.grade.uniforms.uRush.value, slow: g.timeScale, sweep: g.world.fxLight.intensity };
  });
  expect(off).toEqual({ rush: 0, slow: 1, sweep: 0 });
});
