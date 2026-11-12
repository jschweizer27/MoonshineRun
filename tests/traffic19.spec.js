import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

// Stage 19c: traffic coming the other way doesn't stop dead for a truck on the crown of the
// road. It eases over to the verge and passes slowly; it still waits for a truck that's
// square in its own lane.

const meet = (page, over) => page.evaluate((over) => {
  const g = window.shine.game, T = g.traffic, N = g.world.roads.nodes;
  g.renderer.setAnimationLoop(null);
  // York Road's last straight in the county: a cart drives it south to north, the truck
  // stands halfway, facing it, `over` metres into the cart's side of the road.
  const a = N.find((n) => n.x === 0 && n.z === -985), b = N.find((n) => n.x === 0 && n.z === -860);
  T.clear();
  T.want = () => 0;                                  // (no one else turns up)
  const c = T.cars.find((x) => !x.parked);
  Object.assign(c, { body: 2, cruise: 6, speed: 6, stun: 0, on: true });
  c.mesh.visible = true;
  T._setLeg(c, a.id, b.id, 0);
  const rx = Math.cos(c.heading), rz = Math.sin(c.heading);            // the cart's right
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  window.shine.teleport(mid.x + rx * over, mid.z + rz * over, c.heading + Math.PI);
  const p = g.player.position, wear = g.dredge.data.wear;
  let slowest = Infinity, passed = false, hits = 0;
  const was = T._collide.bind(T);
  T._collide = (...args) => { const h = was(...args); if (h) hits++; return h; };
  for (let k = 0; k < 400 && !passed; k++) {
    window.shine.step(0.05);
    if (k > 20) slowest = Math.min(slowest, c.speed);
    passed = (c.position.x - p.x) * c.forwardX + (c.position.z - p.z) * c.forwardZ > 6 || c.from !== a.id;
  }
  T._collide = was;
  return { passed, slowest: Math.round(slowest * 10) / 10, hits, worn: g.dredge.data.wear > wear, moved: Math.round(Math.hypot(p.x - mid.x - rx * over, p.z - mid.z - rz * over) * 10) / 10 };
}, over);

test('a cart coming the other way passes a truck standing on the crown of the road without stopping or touching it', async ({ page }) => {
  const problems = await openGame(page, '&traffic');
  await startRun(page, { loot: false });
  const r = await meet(page, 0);
  expect(r, JSON.stringify(r)).toMatchObject({ passed: true, hits: 0, worn: false, moved: 0 });
  expect(r.slowest).toBeGreaterThan(1.5);
  expect(problems).toEqual([]);
});

test('a truck square in the cart’s own lane is still waited for', async ({ page }) => {
  const problems = await openGame(page, '&traffic');
  await startRun(page, { loot: false });
  const r = await meet(page, 2.2);
  expect(r, JSON.stringify(r)).toMatchObject({ passed: false, hits: 0, moved: 0 });
  expect(r.slowest).toBeLessThan(0.5);
  expect(problems).toEqual([]);
});
