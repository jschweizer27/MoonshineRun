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
  // Real frames drive the flyover; the software GPU is slow, so wait until it has moved.
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.shine.game.camera.position.toArray());
    return Math.hypot(a[0] - p[0], a[2] - p[2]);
  }, { timeout: 20_000 }).toBeGreaterThan(0.5);
  const b = await page.evaluate(() => window.shine.game.camera.position.toArray());
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

test('the road has cobble relief, glossy puddles, raised curbs, and lamp reflections that grow in the rain', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, w = g.world, m = w.roadMaterial;
    window.shine.teleport(0, 150, 0);
    window.shine.step(0.2);
    g.renderFrame();
    const clear = { streak: w.streakMaterial.opacity, rough: m.roughness };
    g.env.setWeather('rain');
    for (let k = 0; k < 40; k++) g.env.update(0.5, g.camera.position);
    g.renderFrame();
    return { normal: !!m.normalMap, roughMap: !!m.roughnessMap, env: !!m.envMap, curbs: w.curbCount, clear, rain: { streak: w.streakMaterial.opacity, rough: m.roughness }, calls: window.shine.renderInfo().calls };
  });
  expect(r.normal && r.roughMap && r.env).toBe(true);
  expect(r.curbs).toBeGreaterThan(400);
  expect(r.clear.streak).toBeGreaterThan(0);                 // damp on a clear night
  expect(r.rain.streak).toBeGreaterThan(r.clear.streak * 2);
  expect(r.rain.rough).toBeLessThan(r.clear.rough);
  expect(r.calls).toBeLessThan(60);
  await screenshot(page, '22-wet-street');
});

// The 3D models from assets/: Otto's truck, the Bureau sedans and the arc lamps.
test('the truck, the Bureau sedans and the street lamps are the 3D models, sharing geometry and shaders', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, m = g.player.model;
    window.shine.step(0.2);
    g.renderFrame();
    const programs = g.renderer.info.programs.length;
    g.mission.heat = 3;
    g.police.setTarget(3, g.player, g.camera);
    window.shine.step(2);
    g.renderFrame();
    const feds = g.police.units.filter((u) => u.kind === 'fed').map((u) => u.car.model.shell);
    let poles = null;
    g.scene.traverse((o) => { if (o.isInstancedMesh && o.material.vertexColors && o.count > 200) poles = poles || o; });
    return {
      truck: m.shell.userData.model, truckEnv: !!m.shell.material.envMap,
      feds: feds.map((s) => s.userData.model), shared: new Set(feds.map((s) => s.geometry)).size,
      fedCoat: feds[0].material.clearcoat > 0 && !!feds[0].geometry.attributes.surf,
      lampModel: !!poles, programsAfter: g.renderer.info.programs.length, programs,
      beam: m.beam.visible && m.beam.material.opacity, beamOnBody: m.beam.parent === m.body,
      lens: m.lamp,
    };
  });
  expect(r.truck).toBe('truck');
  expect(r.truckEnv).toBe(true);                       // the paint catches the street
  expect(r.feds.every((x) => x === 'fed')).toBe(true);
  expect(r.shared).toBe(1);                            // every sedan shares one geometry
  expect(r.fedCoat).toBe(true);                        // baked into the clearcoat material
  expect(r.lampModel).toBe(true);
  expect(r.programsAfter).toBe(r.programs);            // cops arriving compile nothing
  expect(r.beam).toBeGreaterThan(0.05);                // beams show at night
  expect(r.beamOnBody).toBe(true);                     // they dip with the nose
  await screenshot(page, '23-models');
});

test('with ?models=0 (or a model that won\'t load) the built-in truck, sedans and lamps stand in', async ({ page }) => {
  await openGame(page, '&models=0');
  await startRun(page);
  const r = await page.evaluate(async () => {
    const g = window.shine.game, m = g.player.model;
    window.shine.step(0.2);
    g.renderFrame();
    const surf = m.shell.geometry.attributes.surf.array;
    let metal = 0, gloss = 0;
    for (let i = 0; i < surf.length; i += 3) { if (surf[i + 1] > 0.9) metal++; if (surf[i + 2] > 0.9) gloss++; }
    const { loadModels, MODELS } = await import('/src/assets.js');
    await loadModels({ broken: 'assets/no-such-model.glb' });
    return { model: m.shell.userData.model || null, metal, gloss, broken: 'broken' in MODELS, clearcoat: m.shell.material.clearcoat };
  });
  expect(r.model).toBe(null);
  expect(r.clearcoat).toBeGreaterThan(0);
  expect(r.metal).toBeGreaterThan(100);        // chrome and brass trim
  expect(r.gloss).toBeGreaterThan(100);        // painted panels and glass
  expect(r.broken).toBe(false);                // a missing file is skipped, not fatal
  // By day the headlight beams all but vanish.
  const beams = await page.evaluate(() => {
    const g = window.shine.game, b = g.player.model.beam;
    const night = b.material.opacity;
    g.env.hour = 12; g.env.update(0, g.camera.position); g.renderFrame();
    return { night, day: b.material.opacity };
  });
  expect(beams.day).toBeLessThan(beams.night * 0.3);
});
