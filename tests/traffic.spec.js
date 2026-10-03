import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

const distToRoad = `(g, x, z) => {
  let best = Infinity;
  const N = g.world.roads.nodes;
  for (const a of N) for (const id of a.links) {
    const b = N[id], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}`;

test('traffic: cars, vans and carts drive the roads near the camera, one draw call for them all, nothing compiled', async ({ page }) => {
  const problems = await openGame(page, '&traffic');
  await startRun(page, { loot: false });
  const r = await page.evaluate((src) => {
    const g = window.shine.game, T = g.traffic, near = eval(src);
    g.renderer.setAnimationLoop(null);
    g.renderFrame();
    const before = window.shine.renderInfo();
    window.shine.step(1);                                // they turn up
    const out = T.cars.filter((c) => c.on);
    const at = out.map((c) => [c.position.x, c.position.z]);
    window.shine.step(3);
    const moved = out.filter((c, i) => Math.hypot(c.position.x - at[i][0], c.position.z - at[i][1]) > 3).length;
    const offRoad = out.filter((c) => near(g, c.position.x, c.position.z) > 4).length;
    const bodies = new Set(T.cars.filter((c) => c.on).map((c) => c.body)).size;
    g.renderFrame();
    const withCars = window.shine.renderInfo();
    // The same view with none out.
    T.clear();
    g.renderFrame();
    const bare = window.shine.renderInfo();
    return { out: out.length, moved, offRoad, bodies, before, withCars, bare, visible: T.mesh.count };
  }, distToRoad);
  expect(r.out).toBeGreaterThanOrEqual(6);
  expect(r.moved).toBeGreaterThanOrEqual(r.out - 1);    // they drive (one may be held up)
  expect(r.offRoad).toBe(0);                              // in their lane on a road
  expect(r.withCars.calls - r.bare.calls).toBeLessThanOrEqual(1);
  expect(r.withCars.calls).toBeLessThan(60);
  expect(r.withCars.lights).toBe(12);
  expect(r.withCars.programs).toBe(r.before.programs);
  expect(r.withCars.geometries).toBe(r.before.geometries);
  expect(problems).toEqual([]);
});

test('traffic: fewer in the valley and at night, none ahead of the truck pop in, and they come and go with the view', async ({ page }) => {
  await openGame(page, '&traffic');
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, T = g.traffic, P = g.player;
    const want = { city: T.want({ x: 0, z: 100 }, 21), county: T.want({ x: 0, z: -600 }, 21), late: T.want({ x: 0, z: 100 }, 2) };
    // Spawns: never squarely ahead of the truck, and never close.
    let ahead = 0, close = 0;
    for (let k = 0; k < 6; k++) {
      T.clear();
      window.shine.step(0.1);
      for (const c of T.cars.filter((x) => x.on)) {
        const dx = c.position.x - P.position.x, dz = c.position.z - P.position.z, d = Math.hypot(dx, dz);
        if (d < 85) close++;
        if ((dx * P.forwardX + dz * P.forwardZ) > d * 0.75 && d < 230) ahead++;
      }
    }
    // Far away, they're gone and new ones come out there.
    window.shine.teleport(0, -600, Math.PI); window.shine.step(0.5);
    const valley = T.cars.filter((c) => c.on).length;
    const far = T.cars.filter((c) => c.on && Math.hypot(c.position.x, c.position.z + 600) > 270).length;
    return { want, ahead, close, valley, far };
  });
  expect(r.want).toEqual({ city: 8, county: 3, late: 4 });
  expect(r.close).toBe(0);
  expect(r.ahead).toBe(0);
  expect(r.valley).toBeLessThanOrEqual(3);
  expect(r.far).toBe(0);
});

test('hitting traffic is a crash: the truck bounces, wears, and a hard hit throws a piece out onto the road', async ({ page }) => {
  const problems = await openGame(page, '&traffic');
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, T = g.traffic, P = g.player, L = g.loot;
    T.enabled = false;                                     // just the one car, placed by hand
    const c = T.cars[0], n = g.world.roads.nodes;
    const a = n.find((x) => x.tag === 'city' && x.links.length >= 2), b = n[a.links[0]];
    c.on = true; c.mesh.visible = true; c.body = 0; c.cruise = 0; c.speed = 0; c.stun = 0;
    T._setLeg(c, a.id, b.id, Math.min(20, Math.hypot(b.x - a.x, b.z - a.z) / 2));
    T._write();
    g.trunk.place('keg', 0, 0); g.trunk.place('crate', 2, 0);
    // The truck at 18 m/s straight into its side.
    const rx = Math.cos(c.heading), rz = Math.sin(c.heading);
    P.place(c.position.x - rx * 6, c.position.z - rz * 6, Math.atan2(rx, -rz));
    P.vx = rx * 18; P.vz = rz * 18; P.speed = 18;
    const wear0 = g.dredge.data.wear, before = g.trunk.count, active0 = L.active.reduce((s, v) => s + v, 0);
    let hit = null;
    for (let k = 0; k < 30 && !hit; k++) {
      const ev = T._collide(c, P);
      if (ev) { hit = ev; g._onTraffic(ev); }
      else { P.position.x += P.vx / 60; P.position.z += P.vz / 60; }
    }
    const gap = Math.hypot(P.position.x - c.position.x, P.position.z - c.position.z);
    return {
      hit: !!hit, impact: hit && hit.impact, gap, stun: c.stun > 0, wear: g.dredge.data.wear - wear0,
      lost: before - g.trunk.count, onRoad: L.active.reduce((s, v) => s + v, 0) - active0,
      toast: document.getElementById('toast').textContent, slower: Math.hypot(P.vx, P.vz) < 18,
    };
  });
  expect(r.hit).toBe(true);
  expect(r.impact).toBeGreaterThan(11);
  expect(r.gap).toBeGreaterThan(2);           // pushed apart
  expect(r.stun).toBe(true);
  expect(r.slower).toBe(true);
  expect(r.wear).toBeGreaterThan(0);
  expect(r.lost).toBe(1);
  expect(r.onRoad).toBe(1);                   // the piece lies on the road to pick up again
  expect(r.toast).toContain('bounced out of the trunk');
  expect(problems).toEqual([]);
});

test('no traffic under plain ?test, so the other tests drive empty roads', async ({ page }) => {
  await openGame(page);
  await startRun(page, { loot: false });
  const out = await page.evaluate(() => { window.shine.step(2); return window.shine.game.traffic.cars.filter((c) => c.on).length; });
  expect(out).toBe(0);
});
