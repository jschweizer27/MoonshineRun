import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test('Loch Raven: two roads through the east wall to the lake, drowned Warren in the water, the place name; the wall and the shore stop the truck even flat out', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const before = await page.evaluate(() => { const g = window.shine.game; g.renderer.setAnimationLoop(null); return window.shine.renderInfo(); });
  const r = await page.evaluate(async () => {
    const g = window.shine.game, w = g.world, P = g.player;
    const { inLake, LOCH_NODES } = await import('/src/loch.js');
    // The way there: the radar's route from the barn to the Warren landing goes through the wall.
    const h = w.home;
    g.minimap.clearRoute();
    g.minimap.updateRoute(1, { x: h.stopX, z: h.stopZ }, { x: LOCH_NODES.R2[0], z: LOCH_NODES.R2[1] });
    const route = g.minimap.route.map((n) => [Math.round(n.x), Math.round(n.z)]);
    // Drive at it flat out for a few seconds from (x, z) heading `h`; where does the truck end up?
    const run = (x, z, heading, s = 3) => { window.shine.teleport(x, z, heading); window.shine.step(s, { throttle: 1 }); return { x: P.position.x, z: P.position.z, wet: inLake(P.position.x, P.position.z) }; };
    const wall = run(400, -690, Math.PI / 2);
    const gap = run(410, -770, Math.PI / 2);
    const shore = run(530, -700, Math.PI / 2, 4);
    window.shine.teleport(520, -740, Math.PI / 2);
    window.shine.step(0.5);
    g.env.hour = 21.5;
    g.renderFrame();
    return {
      route, place: g.place, wall, gap, shore,
      warren: w.buildings.filter((b) => b.drowned).length, steeple: w.buildings.some((b) => b.drowned && b.h > 10),
      sideLoch: w.nearestNode(446, -660).region, sideCounty: w.nearestNode(436, -760).region ?? 'county',
      labels: w.mapLabels.map((l) => l.text).filter((t) => /LOCH|WARREN/.test(t)),
      info: window.shine.renderInfo(), shown: w.lochGroup.visible,
    };
  });
  expect(r.route.at(-1)).toEqual([545, -735]);
  expect(r.route.some(([x]) => x > 440)).toBe(true);
  expect(r.place).toBe('Loch Raven');
  expect(r.wall.x).toBeLessThan(441);                          // no way through the wall but the gaps
  expect(r.gap.x).toBeGreaterThan(450);                        // the road through it
  expect(r.shore.wet).toBe(false);                             // the truck stops at the water's edge
  expect(r.shore.x).toBeGreaterThan(545);
  expect(r.warren).toBeGreaterThanOrEqual(8);
  expect(r.steeple).toBe(true);
  expect(r.sideLoch).toBe('loch');                             // the nearest road on its own side of the wall
  expect(r.sideCounty).toBe('county');
  expect(r.labels).toEqual(['LOCH RAVEN', 'WARREN']);
  expect(r.shown).toBe(true);
  expect(r.info.calls).toBeLessThan(60);
  expect(r.info.programs).toBe(before.programs);
  expect(r.info.geometries).toBe(before.geometries);
  expect(r.info.lights).toBe(12);
  // From the city it's hidden (the fog has it anyway): no draw calls there.
  const city = await page.evaluate(() => { const g = window.shine.game; window.shine.teleport(0, 100, 0); window.shine.step(0.2); g.renderFrame(); return g.world.lochGroup.visible; });
  expect(city).toBe(false);
  expect(problems).toEqual([]);
});

test('the railway: the midnight freight stands at the Glyndon siding only in its hours, whistles as it pulls in, and the truck can’t drive through it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, R = g.railway, w = g.world;
    g.renderer.setAnimationLoop(null);
    let whistles = 0;
    g.audio.whistle = () => whistles++;
    const at = (hour) => { g.env.hour = hour; window.shine.step(0.1); g.renderFrame(); return { standing: R.standing, shown: R.train.visible, blocked: w.collision.resolveCircle(-424, -700, 1).hit }; };
    window.shine.teleport(-400, -640, Math.PI);
    const day = at(12), night = at(23.6), late = at(1), gone = at(2.5);
    const info = (at(23.6), window.shine.renderInfo());
    return { day, night, late, gone, whistles, track: R.track.visible, info };
  });
  expect(r.day).toEqual({ standing: false, shown: false, blocked: false });
  expect(r.night).toEqual({ standing: true, shown: true, blocked: true });
  expect(r.late.standing).toBe(true);
  expect(r.gone).toEqual({ standing: false, shown: false, blocked: false });
  expect(r.whistles).toBe(2);                                   // it pulled in twice
  expect(r.track).toBe(true);
  expect(r.info.calls).toBeLessThan(60);
  expect(problems).toEqual([]);
});
