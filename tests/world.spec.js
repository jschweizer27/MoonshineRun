import { test, expect } from '@playwright/test';
import { openGame, startRun, step, screenshot } from './helpers.js';

// The world: the city and the county joined by York Road, day and night, weather, and
// seeded city layouts.

test('York Road links the city to the county, through the gap in the wall', async ({ page }) => {
  await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, roads = g.world.roads;
    const from = roads.nearest(0, 0).id;
    return g.world.barns.map((b) => (roads.path(from, roads.nearest(b.laneX, b.laneZ).id) || []).length);
  });
  expect(r.every((n) => n > 3)).toBe(true);
  await page.evaluate(() => window.shine.teleport(0, -190, 0));
  const s = await step(page, 6, { throttle: 1 });
  expect(s.z).toBeLessThan(-262);           // drove out of the city into the county
  await screenshot(page, '12-york-road');
});

test('no trees, barns or fences sit on the county roads', async ({ page }) => {
  await openGame(page);
  const bad = await page.evaluate(() => {
    const g = window.shine.game;
    const d = (x, z, a, b) => { const ex = b.x - a.x, ez = b.z - a.z, l = ex * ex + ez * ez; const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l)); return Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t)); };
    let n = 0;
    for (const [x, z] of g.world.trees) for (const [a, b, w] of g.world.countyEdges) if (d(x, z, a, b) < w / 2 + 1) n++;
    for (const b of g.world.buildings.filter((q) => q.barn)) {
      for (const [a, c, w] of g.world.countyEdges) {
        for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ], [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]]) {
          if (d(x, z, a, c) < w / 2) n++;
        }
      }
    }
    return n;
  });
  expect(bad).toBe(0);
});

test('county nights are lifted a little so the roads read; city nights are unchanged', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, w = g.world;
    const at = (z) => { g.camera.position.set(0, 8, z); for (let k = 0; k < 20; k++) g.env.update(0.1, g.camera.position); return { hemi: w.hemi.intensity, moon: w.moon.intensity }; };
    const city = at(100), county = at(-600);
    g.env.hour = 12;
    const dayCounty = at(-600), dayCity = at(100);
    return { city, county, dayCounty, dayCity };
  });
  expect(r.county.hemi).toBeGreaterThan(r.city.hemi * 1.3);
  expect(r.county.moon).toBeGreaterThan(r.city.moon * 1.2);
  expect(r.dayCounty.hemi).toBeCloseTo(r.dayCity.hemi, 3);
});

test('day follows night, and rain makes the roads slick', async ({ page }) => {
  await openGame(page, '&time');
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, e = g.env;
    const night = { hour: e.hour, day: e.daylight, rough: g.world.roadMaterial.roughness };
    e.hour = 12;
    e.setWeather('rain');
    for (let k = 0; k < 40; k++) e.update(0.5, g.camera.position);
    return { night, day: e.daylight, rough: g.world.roadMaterial.roughness, grip: e.effects.grip, clock: e.clock };
  });
  expect(r.night.day).toBe(0);
  expect(r.day).toBeGreaterThan(0.9);
  expect(r.rough).toBeLessThan(r.night.rough - 0.3);
  expect(r.grip).toBeLessThan(1);
  await screenshot(page, '18-day-rain');
});

test('city layouts are seeded: same seed, same city; new seed, new city', async ({ browser }) => {
  test.setTimeout(420_000);   // three full boots, each up to a minute on software-rendered CI
  const layout = async (q) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await openGame(page, q);
    const b = await page.evaluate(() => window.shine.game.world.buildings.slice(0, 40).map((x) => [x.minX, x.minZ, x.h].map((v) => v.toFixed(1)).join(',')).join('|'));
    await ctx.close();
    return b;
  };
  const a = await layout('&seed=5'), b = await layout('&seed=5'), c = await layout('&seed=6');
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});
