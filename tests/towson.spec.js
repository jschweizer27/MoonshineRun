import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 10: Towson, the county seat (towson.js), and chapter 6, The County Seat.

test('Towson: the road in from Loch Raven, the courthouse green, the bank and the tavern, the place name and its own side of the wall; no new draw call, light or shader', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const before = await page.evaluate(() => { const g = window.shine.game; g.renderer.setAnimationLoop(null); return window.shine.renderInfo(); });
  const r = await page.evaluate(async () => {
    const g = window.shine.game, w = g.world, P = g.player;
    const { TOWSON_NODES, COURTHOUSE } = await import('/src/towson.js');
    // The radar's route from the barn: east through the wall, by Loch Raven, into the town.
    const h = w.home;
    g.minimap.clearRoute();
    g.minimap.updateRoute(1, { x: h.stopX, z: h.stopZ }, { x: TOWSON_NODES.T2[0], z: TOWSON_NODES.T2[1] });
    const route = g.minimap.route.map((n) => [Math.round(n.x), Math.round(n.z)]);
    // Down the road from Loch Raven through the gate, flat out.
    window.shine.teleport(589, -530, Math.PI);
    window.shine.step(3, { throttle: 1 });
    const gate = { x: P.position.x, z: P.position.z };
    // Into the courthouse: it stops the truck.
    window.shine.teleport(COURTHOUSE.x - 40, COURTHOUSE.z, Math.PI / 2);
    window.shine.step(3, { throttle: 1 });
    const wall = P.position.x;
    window.shine.teleport(TOWSON_NODES.T2[0], TOWSON_NODES.T2[1], 0);
    window.shine.step(0.5);
    g.env.hour = 21.5;
    g.renderFrame();
    return {
      route, gate, wall, courthouse: COURTHOUSE.x - COURTHOUSE.w / 2,
      place: g.place, flag: !!g.dredge.data.flags.towson, region: w.regionOf(600, -400), loch: w.regionOf(600, -600), main: w.regionOf(400, -400),
      side: w.nearestNode(600, -400).region, landmark: g._landmark(640, -380),
      buildings: w.buildings.filter((b) => b.minX >= 470 && b.maxZ > -500 && b.minZ < -270).length,
      labels: w.mapLabels.some((l) => l.text === 'TOWSON'),
      info: window.shine.renderInfo(),
    };
  });
  expect(r.route.at(-1)).toEqual([600, -410]);
  expect(r.route.some(([x, z]) => x > 440 && z < -515)).toBe(true);   // by Loch Raven's road
  expect(r.gate.z).toBeGreaterThan(-500);                               // through the gate into the town
  expect(r.wall).toBeLessThan(r.courthouse);
  expect(r).toMatchObject({ place: 'Towson', flag: true, region: 'towson', loch: 'loch', main: 'main', side: 'towson', landmark: 'Towson', labels: true });
  expect(r.buildings).toBeGreaterThanOrEqual(12);
  expect(r.info.calls).toBeLessThan(60);
  expect(r.info.calls).toBeLessThanOrEqual(before.calls + 8);           // drawn in the county's own meshes
  expect(r.info.programs).toBe(before.programs);
  expect(r.info.geometries).toBe(before.geometries);
  expect(r.info.lights).toBe(12);
  expect(problems).toEqual([]);
});

test('chapter 6, The County Seat: to Towson, Ruby Dalton’s orders and trust, the bank’s records room after dark, Ruby to the courthouse before the bank opens; then Rum Row', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 5);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, step, clear, visit, objective } = eval(KIT);
    const { townOpen } = await import('/src/market.js');
    const { CONFIG } = await import('/src/config.js');
    const towson = CONFIG.dredge.towns.find((t) => t.id === 'towson');
    step(); clear(); step();
    const out = { open: objective(), market: [townOpen(towson, 4), townOpen(towson, 5)] };
    window.shine.teleport(600, -440, Math.PI); step(); clear(); step();
    out.arrived = { flag: !!d.flags.towson, objective: objective() };
    // Ruby posts from chapter 6, and the step waiting on her puts her on the board.
    out.ruby = g._jobs().offers().some((o) => o.who === 'dalton');
    d.delivered.dalton = 1; d.trust.dalton = 4;
    step(); clear(); step(); clear(); step();
    out.trusted = { steps: [d.steps.ruby, d.steps['ruby-trust']], bank: g.salvage.story.bank };
    const bank = g.salvage.sites.find((s) => s.story === 'bank');
    out.bankSite = [g.salvage.status(bank, 0, 12), g.salvage.status(bank, 0, 22)];
    g.env.hour = 22;
    g.pause({ showMenu: false });
    g._storySalvaged(bank, 1);
    clear(); step(); clear(); step();
    out.clue = !!d.clues.mortgages;
    // Ruby, from her door to the courthouse steps, in the morning.
    const o = d.orders.find((x) => x.story === 'copy');
    out.order = { passenger: o.passenger, window: o.window, drop: o.drop.place };
    g.env.hour = 7;
    visit(o.pickup.x, o.pickup.z);
    out.aboard = o.aboard;
    visit(o.drop.x, o.drop.z);
    clear(); step(); clear(); step();
    out.done = { chapter: d.chapter, objective: objective() };
    return out;
  }, KIT);
  expect(r.open).toBe('The County Seat: Drive to Towson, east through the county wall');
  expect(r.market).toEqual([false, true]);
  expect(r.ruby).toBe(true);
  expect(r.arrived.flag).toBe(true);
  expect(r.arrived.objective).toContain('Ruby Dalton');
  expect(r.trusted.steps).toEqual([true, true]);
  expect(r.trusted.bank).toEqual({ night: true, window: null });
  expect(r.bankSite).toEqual(['day', 'ok']);
  expect(r.clue).toBe(true);
  expect(r.order).toEqual({ passenger: 'dalton', window: [6, 9], drop: 'the Towson courthouse' });
  expect(r.aboard).toBe(true);
  expect(r.done).toEqual({ chapter: 6, objective: 'Rum Row: Earn Mags O’Rourke’s full trust (★★★)' });
  expect(problems).toEqual([]);
});

test('a save that chose its ending before Act II came has finished the story', async ({ page }) => {
  const problems = await openGame(page);
  const r = await page.evaluate(async () => {
    const g = window.shine.game, d = g.dredge.data;
    d.started = true; d.chapter = 5; d.ending = 'deed';
    g.dredge.save();
    const { DredgeCareer } = await import('/src/dredgecareer.js');
    const { CHAPTERS } = await import('/src/chapters.js');
    return new DredgeCareer(g.dredge.slot).data.chapter === CHAPTERS.length;
  });
  expect(r).toBe(true);
  expect(problems).toEqual([]);
});
