import { test, expect } from '@playwright/test';
import { openGame, startRun, step, snapshot, screenshot } from './helpers.js';

// The dredge run (?mode=dredge): free-roam driving, loot, a trunk to pack, towns to sell in.
// Built beside the bootlegging loop; these tests cover it stage by stage.

test('dredge mode boots into free roam: the truck without its horse box, no police, no heat', async ({ page }) => {
  const problems = await openGame(page, '&mode=dredge');
  await expect(page.locator('#start-btn')).toHaveText('START DRIVING');
  await startRun(page);
  const s = await snapshot(page);
  expect(s.game).toBe('dredge');
  expect(s.state).toBe('playing');
  const setup = await page.evaluate(() => {
    const g = window.shine.game, m = g.mission;
    return {
      ride: g.player.ride, trailer: !!g.player.trailer,
      markers: [m.pickup, m.drop, m.hideoutMarker, m.goal].some((x) => x.visible),
      heatShown: getComputedStyle(document.getElementById('heat')).display !== 'none',
      objective: document.getElementById('objective-text').textContent,
    };
  });
  expect(setup).toEqual({ ride: 'runner', trailer: false, markers: false, heatShown: false, objective: 'Free roam' });

  // Drive up York Road into the county: no one comes after you, nothing happens to the heat.
  const before = await page.evaluate(() => { const g = window.shine.game; g.renderFrame(); return window.shine.renderInfo(); });
  const drove = await step(page, 20, { throttle: 1 });
  expect(drove.z).toBeLessThan(-150);
  expect(drove.pursuers).toBe(0);
  expect(drove.heat).toBe(0);
  expect(await page.evaluate(() => window.shine.game.police.active.length)).toBe(0);
  const after = await page.evaluate(() => window.shine.renderInfo());
  expect(after.lights).toBe(13);
  expect(after.calls).toBeLessThan(60);
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  await screenshot(page, 'dredge-01-free-roam');
  expect(problems).toEqual([]);
});

test('the bootlegging game is unchanged without ?mode=dredge', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const s = await page.evaluate(() => ({ game: window.shine.game.mode, ride: window.shine.game.player.ride, trailer: !!window.shine.game.player.trailer, hud: document.getElementById('hud').classList.contains('dredge') }));
  expect(s).toEqual({ game: 'bootleg', ride: 'truck', trailer: true, hud: false });
});

test('dredge handling is arcade: turns sharply when slow, holds a fast corner without spinning, glances off walls', async ({ page }) => {
  await openGame(page, '&mode=dredge');
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, base = { ...v.t };
    const truck = { ...base };
    for (const k of ['steerRamp', 'steerFalloff', 'bounce', 'wallKeep']) delete truck[k];
    Object.assign(truck, { maxSpeed: 38, accel: 18, brake: 42, turnRate: 2.1, grip: 12, handbrakeGrip: 1.8 });
    const open = () => v.place(160, -560, 0);                 // open pasture, nothing to hit
    const run = (t) => {
      v.t = { ...t };
      g.gripBase = t.grip;
      const out = {};
      // Turn-in from a crawl: half a second of full lock at 2.5 m/s.
      open(); v.vz = -2.5; v.speed = 2.5;
      for (let k = 0; k < 30; k++) g.step(1 / 60, { throttle: 0, steer: 1 });
      out.crawlTurn = Math.abs(v.heading);
      // A fast corner: flat out, then a full-lock turn for 1.5 s.
      open();
      for (let k = 0; k < 240; k++) g.step(1 / 60, { throttle: 1, steer: 0 });
      let slip = 0;
      const h0 = v.heading;
      for (let k = 0; k < 90; k++) { g.step(1 / 60, { throttle: 1, steer: 1 }); slip = Math.max(slip, v.slip); }
      out.fastTurn = v.heading - h0;
      out.slip = slip;
      out.speedAfter = v.speed;
      return out;
    };
    const res = { truck: run(truck), arcade: run(base) };
    v.t = base; g.gripBase = base.grip;
    return res;
  });
  expect(r.arcade.crawlTurn).toBeGreaterThan(r.truck.crawlTurn * 1.5);   // much sharper when slow
  expect(r.arcade.fastTurn).toBeGreaterThan(r.truck.fastTurn);           // keeps turning at speed
  expect(r.arcade.slip).toBeLessThan(r.truck.slip);                       // stays planted
  expect(r.arcade.slip).toBeLessThan(4);
  expect(r.arcade.speedAfter).toBeGreaterThan(15);                        // and keeps its pace

  // Into a wall at a shallow angle: the arcade car glances off and keeps more of its speed
  // than the bootleg truck does.
  const wall = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, base = { ...v.t };
    const run = (t) => {
      v.t = { ...t };
      g.gripBase = t.grip;
      v.place(120, 0, Math.PI / 2 + 0.3);                     // east along a street, angled into the buildings
      let hit = 0, before = 0;
      for (let k = 0; k < 600 && !hit; k++) { before = Math.hypot(v.vx, v.vz); g.step(1 / 60, { throttle: 1 }); if (v.impact > 2) hit = v.impact; }
      return { hit, before, after: Math.hypot(v.vx, v.vz) };
    };
    const truck = { ...base, bounce: 1.25, wallKeep: 0.96 };
    const out = { truck: run(truck), arcade: run(base) };
    v.t = base; g.gripBase = base.grip;
    return out;
  });
  expect(wall.arcade.hit).toBeGreaterThan(2);
  expect(wall.arcade.before).toBeGreaterThan(10);
  expect(wall.arcade.after / wall.arcade.before).toBeGreaterThan(wall.truck.after / wall.truck.before);
});
