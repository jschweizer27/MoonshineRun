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

// A one-triangle glTF (embedded buffer) standing in for a model the player supplies.
function tinyGltf() {
  const pos = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 2]).buffer);
  return 'data:model/gltf+json;base64,' + Buffer.from(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: pos.length, uri: 'data:application/octet-stream;base64,' + pos.toString('base64') }],
    bufferViews: [{ buffer: 0, byteLength: pos.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 2] }],
  })).toString('base64');
}

test('the truck: glossy clearcoat paint and chrome, headlight beams, and an optional glTF model', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, m = g.player.model;
    window.shine.step(0.2);
    g.renderFrame();
    const surf = m.shell.geometry.attributes.surf.array;
    let metal = 0, gloss = 0;
    for (let i = 0; i < surf.length; i += 3) { if (surf[i + 1] > 0.9) metal++; if (surf[i + 2] > 0.9) gloss++; }
    return {
      clearcoat: m.shell.material.isMeshPhysicalMaterial && m.shell.material.clearcoat > 0,
      env: !!m.shell.material.envMap, metal, gloss,
      beam: m.beam.visible && m.beam.material.opacity, beamOnBody: m.beam.parent === m.body,
    };
  });
  expect(r.clearcoat).toBe(true);
  expect(r.env).toBe(true);                    // the paint reflects the street
  expect(r.metal).toBeGreaterThan(100);        // chrome and brass trim
  expect(r.gloss).toBeGreaterThan(100);        // painted panels and glass
  expect(r.beam).toBeGreaterThan(0.05);        // beams show at night
  expect(r.beamOnBody).toBe(true);             // they dip with the nose
  // By day the beams all but vanish.
  const day = await page.evaluate(() => {
    const g = window.shine.game;
    g.env.hour = 12; g.env.update(0, g.camera.position); g.renderFrame();
    return g.player.model.beam.material.opacity;
  });
  expect(day).toBeLessThan(r.beam * 0.3);
  // A supplied model replaces the built-in body, set on the ground and scaled to length.
  const url = tinyGltf();
  const custom = await page.evaluate(async (u) => {
    const g = window.shine.game, m = g.player.model;
    const { attachTruckModel } = await import('/src/models.js');
    const holder = await attachTruckModel(m, { url: u, length: 4.9 });
    holder.updateMatrixWorld(true);
    const b = { min: Infinity, max: -Infinity, y: Infinity };
    holder.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position, v = o.position.clone();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        const lv = m.body.worldToLocal(v.clone());
        b.min = Math.min(b.min, lv.z); b.max = Math.max(b.max, lv.z); b.y = Math.min(b.y, lv.y);
      }
    });
    return { shell: m.shell.visible, length: b.max - b.min, y: b.y };
  }, url);
  expect(custom.shell).toBe(false);
  expect(custom.length).toBeCloseTo(4.9, 1);
  expect(custom.y).toBeCloseTo(0, 1);
});
