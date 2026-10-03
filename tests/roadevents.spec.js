import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test('road events: rolled from the clock (the same for everyone), a washout only in the rain', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const { RoadEvents } = await import('/src/roadevents.js');
    const dry = Array.from({ length: 200 }, (_, s) => RoadEvents.pick(s, false));
    const wet = Array.from({ length: 200 }, (_, s) => RoadEvents.pick(s, true));
    return {
      same: JSON.stringify(dry) === JSON.stringify(Array.from({ length: 200 }, (_, s) => RoadEvents.pick(s, false))),
      none0: RoadEvents.pick(0, true),
      share: dry.filter(Boolean).length / 200,
      dryKinds: [...new Set(dry.filter(Boolean))].sort(),
      wetKinds: [...new Set(wet.filter(Boolean))].sort(),
      edges: window.shine.game.roadEvents.edges.length,
    };
  });
  expect(r.same).toBe(true);
  expect(r.none0).toBeNull();                       // never on the first slot of a game
  expect(r.share).toBeGreaterThan(0.4);
  expect(r.share).toBeLessThan(0.8);
  expect(r.dryKinds).toEqual(['breakdown', 'fog', 'marketday']);
  expect(r.wetKinds).toEqual(['breakdown', 'fog', 'marketday', 'washout']);
  expect(r.edges).toBeGreaterThan(20);
});

test('a broken-down cart: parked across a valley road, a barrier under it, the route goes around, and it all clears after', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, E = g.roadEvents, R = g.world.roads, c = g.world.collision;
    g.renderer.setAnimationLoop(null);
    g.renderFrame();
    const info0 = window.shine.renderInfo();
    // Find a slot that rolls a breakdown and start it there.
    const ev = E.start('breakdown', 3, 99, g.env, g.dredge.market);
    const [a, b] = ev.edge.split('-').map(Number);
    const car = ev.car;
    const blockedHere = c.resolveCircle(ev.x, ev.z, 1.2).hit;
    // The route from one end of that road to the other goes around it.
    const path = R.path(a, b, E.blocked);
    const direct = R.path(a, b);
    window.shine.step(0.2);
    const toastRadar = g._mapMarkers().some((m) => m.kind === 'roadblock' && m.x === ev.x);
    g.renderFrame();
    const info1 = window.shine.renderInfo();
    E.end(g.dredge.market);
    const after = { blocked: E.blocked.size, hit: c.resolveCircle(ev.x, ev.z, 1.2).hit, carOn: car.on, radar: g._mapMarkers().some((m) => m.kind === 'roadblock') };
    return {
      parked: car.parked === false && after.carOn === false, carAt: Math.hypot(car.position.x - ev.x, car.position.z - ev.z),
      blockedHere, around: path && path.length > 2, direct: direct.length, toastRadar, text: ev.text, after,
      calls: info1.calls, programs: info1.programs - info0.programs, geometries: info1.geometries - info0.geometries,
    };
  });
  expect(r.carAt).toBeLessThan(1);
  expect(r.blockedHere).toBe(true);
  expect(r.direct).toBe(2);
  expect(r.around).toBe(true);
  expect(r.toastRadar).toBe(true);
  expect(r.text).toMatch(/broken down across the road near .+\. Go around/);
  expect(r.after).toEqual({ blocked: 0, hit: false, carOn: false, radar: false });
  expect(r.parked).toBe(true);
  expect(r.calls).toBeLessThan(60);
  expect(r.programs).toBe(0);
  expect(r.geometries).toBe(0);
  expect(problems).toEqual([]);
});

test('road events run on the clock: they start in their slot with word of it, end on time, and fog and market day do what they say', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const g = window.shine.game, E = g.roadEvents, M = g.dredge.market;
    const { RoadEvents } = await import('/src/roadevents.js');
    const { CONFIG } = await import('/src/config.js');
    const { priceOf } = await import('/src/market.js');
    const H = CONFIG.dredge.roadEvents.hours, O = CONFIG.dredge.roadEvents.offset;
    // The first slot (from 1) whose roll is a market day, and one that's fog.
    let mday = 1; while (RoadEvents.pick(mday, false) !== 'marketday') mday++;
    let fog = 1; while (RoadEvents.pick(fog, false) !== 'fog') fog++;
    // Market day: on the clock, with the toast; the town pays 15% more, and only it.
    E.reset(M);
    M.clock = mday * H + O + 0.1;
    const town = (() => { E.update(M.clock, g.env, M); return E.active?.town; })();
    E.reset(M);
    M.clock = mday * H + O + 0.1;
    const other = CONFIG.dredge.towns.find((t) => t.id !== town).id;
    const before = { here: priceOf(town, 'keg', { ...M, marketDay: undefined }), there: priceOf(other, 'keg', M) };
    g._eventDay = Math.floor(M.clock / 24);              // the clock jumped days: that day's demand was announced already
    window.shine.step(1 / 60);
    const toast = document.getElementById('toast').textContent;
    const during = { here: priceOf(town, 'keg', M), there: priceOf(other, 'keg', M), active: E.active?.type };
    // Past its share of the slot: over, with word of that too.
    M.clock = (mday + CONFIG.dredge.roadEvents.lasts) * H + O + 0.05;
    window.shine.step(1 / 60);
    const ended = { active: E.active, toast: document.getElementById('toast').textContent, price: priceOf(town, 'keg', M) < during.here };
    // A reload late in a slot whose time is up starts nothing.
    E.reset(M);
    window.shine.step(1 / 60);
    const late = E.active;
    // Fog: the weather turns.
    E.reset(M);
    M.clock = fog * H + O + 0.1;
    g.env.setWeather('clear');
    window.shine.step(1 / 60);
    return { town, toast, before, during, ended, late, fog: { active: E.active?.type, weather: g.env.weather } };
  });
  expect(r.toast).toContain('Market day in');
  expect(r.during.active).toBe('marketday');
  expect(r.during.here).toBe(Math.round(r.before.here * 1.15));
  expect(r.during.there).toBe(r.before.there);
  expect(r.ended.active).toBeNull();
  expect(r.ended.toast).toContain('Market day is over');
  expect(r.ended.price).toBe(true);
  expect(r.late).toBeNull();
  expect(r.fog).toEqual({ active: 'fog', weather: 'fog' });
  expect(problems).toEqual([]);
});

test('traffic keeps off a closed road: nothing turns onto it, and cars on it turn back', async ({ page }) => {
  await openGame(page, '&traffic');
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, T = g.traffic, E = g.roadEvents;
    window.shine.teleport(0, -600, Math.PI);
    const ev = E.start('washout', 5, 999, g.env, g.dredge.market);
    const [a, b] = ev.edge.split('-').map(Number);
    let onIt = 0;
    for (let k = 0; k < 40; k++) {
      window.shine.step(0.25);
      for (const c of T.cars) if (c.on && !c.parked && ((c.from === a && c.to === b) || (c.from === b && c.to === a))) onIt++;
    }
    return { onIt, text: ev.text };
  });
  expect(r.onIt).toBe(0);
  expect(r.text).toContain('washed out');
});
