import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test('lamp posts give way: the truck knocks one over without stopping dead, it goes dark, and it stands again at dawn', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, w = g.world, P = g.player;
    g.renderer.setAnimationLoop(null);
    g.renderFrame();
    const info0 = window.shine.renderInfo();
    // A city lamp post on the sidewalk, and the truck lined up at it from the road.
    const k = w.lampSpots.findIndex((sp) => sp.pole && Math.abs(sp.px) < 120 && Math.abs(sp.pz) < 120 && sp.tz === 0 && Math.abs(sp.tx) === 1);
    const sp = w.lampSpots[k];
    const hx = sp.tx;                                // the road is that way: drive from it at the pole
    P.place(sp.px + hx * 9, sp.pz, Math.atan2(-hx, 0));
    P.vx = -hx * 14; P.vz = 0; P.speed = 14;
    const pole0 = w.lampMeshes.poles.instanceMatrix.array.slice(k * 16, k * 16 + 16);
    let hitAt = -1, speedAfter = 0;
    for (let i = 0; i < 60 && hitAt < 0; i++) {
      window.shine.step(1 / 60, { throttle: 1 });
      if (sp.down) { hitAt = i; speedAfter = Math.abs(P.speed); }
    }
    window.shine.step(0.8);                         // it falls
    const pole1 = w.lampMeshes.poles.instanceMatrix.array.slice(k * 16, k * 16 + 16);
    const tipped = pole1[5] < pole0[5] * 0.5;       // its up axis no longer points up
    g.renderFrame();
    const lit = [...w.lampLights, w.lampSpot].some((l) => l.intensity > 0.01 && Math.hypot(l.position.x - sp.x, l.position.z - sp.z) < 3);
    const halo = w.halos.geometry.attributes.position.getY(k);
    const info1 = window.shine.renderInfo();
    w.standLamps();
    const pole2 = w.lampMeshes.poles.instanceMatrix.array.slice(k * 16, k * 16 + 16);
    return {
      down: hitAt >= 0, speedAfter, tipped, lit, halo, back: !sp.down && pole2.every((v, i) => v === pole0[i]),
      programs: info1.programs - info0.programs, geometries: info1.geometries - info0.geometries, lights: info1.lights,
    };
  });
  expect(r.down).toBe(true);
  expect(r.speedAfter).toBeGreaterThan(8);         // knocked aside, not a dead stop
  expect(r.tipped).toBe(true);
  expect(r.lit).toBe(false);                       // a fallen lamp is dark
  expect(r.halo).toBeLessThan(-50);
  expect(r.back).toBe(true);
  expect(r.programs).toBe(0);
  expect(r.geometries).toBe(0);
  expect(r.lights).toBe(12);
  expect(problems).toEqual([]);
});
