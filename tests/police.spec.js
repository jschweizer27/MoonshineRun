import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

// Revenue agents run only with &police under ?test. These set things up by hand: a patrol
// placed on York Road in the city, the truck ahead of it, shine in the trunk or not.
const SETUP = `(g, { shine = 1, hour = 21.5 } = {}) => {
  g.renderer.setAnimationLoop(null);
  g.env.hour = hour;
  g.police.reset();
  g.police._patrols = () => {};                 // no others turning up mid-test
  g.trunk.clear();
  for (let k = 0; k < shine; k++) { const s = g.trunk.findSpot('corn-shine'); g.trunk.place('corn-shine', s.x, s.y, s.rot); }
  const u = g.police.units[0];
  return u;
}`;

test('patrols: one about the city by day, more at night; they keep to the roads near the truck', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, P = g.police;
    g.renderer.setAnimationLoop(null);
    const count = (hour) => { P.reset(); g.env.hour = hour; for (let k = 0; k < 30; k++) window.shine.step(0.1); return P.units.filter((u) => u.active && u.mode === 'patrol').length; };
    const day = count(12), night = count(21.5);
    const onRoads = P.units.filter((u) => u.active).every((u) => { const n = g.world.roads.nearest(u.car.position.x, u.car.position.z); return Math.hypot(n.x - u.car.position.x, n.z - u.car.position.z) < 60; });
    return { day, night, onRoads, radar: g._mapMarkers().some((m) => m.kind === 'agent') || P.units.every((u) => !u.active || Math.hypot(u.car.position.x - g.player.position.x, u.car.position.z - g.player.position.z) > 160) };
  });
  expect(r.day).toBe(1);
  expect(r.night).toBe(2);
  expect(r.onRoads).toBe(true);
  expect(r.radar).toBe(true);
  expect(problems).toEqual([]);
});

test('spotting: a patrol sees ahead, not behind; shine aboard is heat, an empty truck is nothing; lights off at night shortens their eyes', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate((SETUP) => {
    const g = window.shine.game, P = g.police, setup = eval(SETUP);
    // The patrol at z 100 facing north, the truck `gap` metres further north (ahead) or south (behind).
    const look = (opts, gap, { lightsOff = false } = {}) => {
      const u = setup(g, opts);
      u.active = true; u.mode = 'patrol'; u.goal = { x: 0, z: 100 - 400 };
      u.car.place(0, 100, 0);
      g.player.place(0, 100 - gap, 0);
      g.lightsOff = lightsOff;
      window.shine.step(1 / 60);
      const out = { tier: P.tier, mode: u.mode, toast: document.getElementById('toast').textContent };
      g.lightsOff = false;
      return out;
    };
    return {
      ahead: look({}, 30), empty: look({ shine: 0 }, 30), behind: look({}, -30), close: look({}, -8),
      nightOn: look({}, 45), nightOff: look({}, 45, { lightsOff: true }), dayFar: look({ hour: 12 }, 62),
    };
  }, SETUP);
  expect(r.ahead.tier).toBe(1);
  expect(r.ahead.mode).toBe('chase');
  expect(r.ahead.toast).toContain('Spotted');
  expect(r.empty.tier).toBe(0);                         // nothing to see
  expect(r.behind.tier).toBe(0);                        // out of its cone...
  expect(r.close.tier).toBe(1);                         // ...unless right on it
  expect(r.nightOn.tier).toBe(1);
  expect(r.nightOff.tier).toBe(0);                      // dark, and closer than they'd see it
  expect(r.dayFar.tier).toBe(1);                        // daylight carries further
  expect(problems).toEqual([]);
});

test('heat: seen longer builds to a second car and a roadblock on the route; out of sight long enough, it cools to nothing', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (SETUP) => {
    const g = window.shine.game, P = g.police, setup = eval(SETUP);
    const { CONFIG } = await import('/src/config.js');
    const u = setup(g, { shine: 2 });
    // Seen with shine aboard: heat climbs.
    u.active = true; u.mode = 'chase';
    u.car.place(0, 80, 0);
    g.player.place(0, 60, 0);
    const events = [];
    const spy = g._onPolice.bind(g);
    g._onPolice = (e) => { events.push(e.type + (e.tier ?? '')); return spy(e); };
    P.heat = 1;
    for (let k = 0; k < 600 && P.tier < 2; k++) { u.car.place(0, 80, 0); g.player.place(0, 60, 0); window.shine.step(1 / 60); }
    const two = { tier: P.tier, chasing: P.chasing, objective: document.getElementById('objective-text').textContent, pill: document.getElementById('heat').textContent };
    // A roadblock goes up on the route ahead (toward a speakeasy, with shine aboard): from
    // out in the county, heading for the city.
    for (const x of P.units) if (x.active) { x.car.place(900, 900, 0); x.lastKnown.set(900, 0, 900); x.mode = 'search'; x.goal = { x: 900, z: 900 }; }
    g.player.place(0, -700, Math.PI);
    P._rbTimer = 0;
    for (let k = 0; k < 200 && !P.roadblock.active; k++) { window.shine.step(0.05); P.heat = Math.max(P.heat, 2); }
    const rb = { active: P.roadblock.active, edge: P.blocked.size, radar: g._mapMarkers().some((m) => m.kind === 'roadblock') };
    // Out of everyone's sight: down a tier at a time, then clear.
    P.heat = 2; P.evade = 0;
    for (const x of P.units) if (x.active) { x.car.place(900, 900, 0); x.lastKnown.set(900, 0, 900); x.mode = 'search'; x.goal = { x: 900, z: 900 }; }
    let t = 0;
    while (P.heat > 0 && t < 60) { window.shine.step(0.25); t += 0.25; for (const x of P.units) if (x.active) x.car.place(900, 900, 0); }
    return { two, rb, cooled: P.heat, t, events, expect: CONFIG.dredge.police.evadeTime[1] + CONFIG.dredge.police.evadeTime[2], toast: document.getElementById('toast').textContent };
  }, SETUP);
  expect(r.two.tier).toBe(2);
  expect(r.two.chasing).toBe(2);
  expect(r.two.objective).toContain('get out of sight');
  expect(r.two.pill).toContain('★★☆');
  expect(r.rb).toEqual({ active: true, edge: 1, radar: true });
  expect(r.cooled).toBe(0);
  expect(r.t).toBeGreaterThanOrEqual(r.expect - 1);
  expect(r.events).toContain('tier2');
  expect(r.events).toContain('clear');
  expect(r.toast).toContain('You lost them');
  expect(problems).toEqual([]);
});

test('a bust: pinned by an agent, the shine is taken, a fine paid, and Otto wakes at the barn with the heat off', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate((SETUP) => {
    const g = window.shine.game, P = g.police, setup = eval(SETUP), d = g.dredge.data;
    const u = setup(g, { shine: 2 });
    { const s = g.trunk.findSpot('crate'); g.trunk.place('crate', s.x, s.y, s.rot); }
    d.cash = 1000;
    u.active = true; u.mode = 'chase';
    P.heat = 1;
    g.player.place(0, 60, 0);
    u.car.place(0, 66, 0);
    for (let k = 0; k < 400 && g.state === 'playing'; k++) { u.car.place(0, 66, 0); u.car.vx = u.car.vz = 0; window.shine.step(1 / 60, { handbrake: true }); }
    const h = g.world.home;
    return {
      state: g.state, dialog: g.ui.isOpen('dialog'), text: document.getElementById('dialog-text').textContent,
      trunk: [...g.trunk.pieces.values()].map((p) => p.kind), cash: d.cash, busts: d.stats.busts, heat: P.heat,
      home: Math.hypot(g.player.position.x - h.stopX, g.player.position.z - h.stopZ) < 30, ledger: d.ledger[0],
    };
  }, SETUP);
  expect(r.state).toBe('paused');
  expect(r.dialog).toBe(true);
  expect(r.trunk).toEqual(['crate']);                   // the shine's gone; the rest stays
  expect(r.cash).toBe(750);                             // a quarter of the cash
  expect(r.busts).toBe(1);
  expect(r.heat).toBe(0);
  expect(r.home).toBe(true);
  expect(r.ledger.amount).toBe(-250);
  await page.click('#dialog-skip');
  expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');
  expect(problems).toEqual([]);
});

test('the York Road checkpoint at night: stopped and searched is a bust unless the false bottom hides it all; running it is heat 2; by day there is none', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate((SETUP) => {
    const g = window.shine.game, P = g.police, setup = eval(SETUP), C = P.checkpoint, d = g.dredge.data;
    d.chapter = 2;                                    // it stands from chapter 3
    const stop = (opts) => { setup(g, opts); g.player.place(C.x, C.z - 40, 0); window.shine.step(0.1); g.player.place(C.x, C.z, 0); window.shine.step(0.1); return { state: g.state, toast: document.getElementById('toast').textContent, shine: g._contraband() }; };
    const empty = stop({ shine: 0 });
    d.upgrades.falsebottom = 1; g._applyPerks();
    const hidden = stop({ shine: 2 });
    d.upgrades.falsebottom = 0; g._applyPerks();
    d.cash = 400;
    const caught = stop({ shine: 1 });
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    // Run it: through at speed.
    setup(g, { shine: 1 });
    g.player.place(C.x, C.z + 30, 0);
    g.player.vz = -20; g.player.speed = 20;
    for (let k = 0; k < 120; k++) window.shine.step(1 / 60, { throttle: 1 });
    const ran = { tier: P.tier, toast: document.getElementById('toast').textContent };
    // By day the road is open.
    const day = stop({ shine: 1, hour: 12 });
    return { empty, hidden, caught, ran, day, on: P.checkpoint.on };
  }, SETUP);
  expect(r.empty.state).toBe('playing');
  expect(r.empty.toast).toContain('Drive on');
  expect(r.hidden.state).toBe('playing');
  expect(r.hidden.toast).toContain('find nothing');
  expect(r.hidden.shine).toBe(2);
  expect(r.caught.state).toBe('paused');                // a bust
  expect(r.caught.shine).toBe(0);
  expect(r.ran.tier).toBe(2);
  expect(r.ran.toast).toContain('ran the checkpoint');
  expect(r.day.state).toBe('playing');
  expect(r.day.shine).toBe(1);
  expect(r.on).toBe(false);
  expect(problems).toEqual([]);
});

test('lights off: the headlamp and beams go dark, the HUD says so, and nothing compiles; agents and roadblocks draw within budget', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate((SETUP) => {
    const g = window.shine.game, P = g.police, setup = eval(SETUP);
    setup(g, { shine: 1 });
    g.renderFrame();
    const info0 = window.shine.renderInfo();
    const lamp0 = g.feel.headlightBase;
    g.toggleLights();
    window.shine.step(0.1);
    g.renderFrame();
    const off = { lamp: g.feel.headlightBase, beam: g.player.model.beam ? g.player.model.beam.material.opacity : 0, pill: !document.getElementById('lights').classList.contains('hidden') };
    g.toggleLights();
    // Everything out at once: every car chasing, a roadblock and the checkpoint, near the camera.
    P.units.forEach((u, i) => { u.active = true; u.mode = 'chase'; u.car.place(-8 + i * 5, 40, 0); });
    Object.assign(P.roadblock, { active: true, x: 0, z: 20, ux: 0, uz: 1 });
    g.player.place(0, 60, 0);
    P._write(1);
    g.chase.snap(g.player);
    g.renderFrame();
    const info1 = window.shine.renderInfo();
    return { lamp0, off, on: g.feel.headlightBase, info0, info1 };
  }, SETUP);
  expect(r.lamp0).toBeGreaterThan(0);
  expect(r.off.lamp).toBe(0);
  expect(r.off.beam).toBe(0);
  expect(r.off.pill).toBe(true);
  expect(r.on).toBe(r.lamp0);
  expect(r.info1.programs).toBe(r.info0.programs);
  expect(r.info1.geometries).toBe(r.info0.geometries);
  expect(r.info1.calls).toBeLessThan(60);
  expect(r.info1.lights).toBe(12);
  expect(problems).toEqual([]);
});
