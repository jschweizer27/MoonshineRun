import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

const seg = `(x, z, p, q) => { const dx = q.x - p.x, dz = q.z - p.z, t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - p.x - dx * t, z - p.z - dz * t); }`;

test('Cockeysville: a fourth town at the eastern crossroads, in pale stone with a quarry yard, on the road from the city; copper pays best there', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (segSrc) => {
    const g = window.shine.game, w = g.world, near = eval(segSrc);
    const { CONFIG } = await import('/src/config.js');
    const { priceOf } = await import('/src/market.js');
    const towns = CONFIG.dredge.towns, cv = towns.find((t) => t.id === 'cockeysville'), city = towns[0];
    const a = w.roads.nearest(city.x, city.z), b = w.roads.nearest(cv.x, cv.z);
    const path = w.roads.path(a.id, b.id) || [];
    const centre = (h) => [(h.minX + h.maxX) / 2, (h.minZ + h.maxZ) / 2];
    const clearOf = (h) => !w.countyEdges.some(([p, q, rw]) => near(...centre(h), p, q) < rw / 2 + Math.min(h.maxX - h.minX, h.maxZ - h.minZ) / 2);
    const houses = w.buildings.filter((h) => h.barn && Math.hypot(centre(h)[0] - cv.x, centre(h)[1] - cv.z) < 90);
    const quarry = w.buildings.filter((h) => h.quarry);
    const solid = quarry.filter((h) => w.collision.resolveCircle(...centre(h), 1).hit).length;
    const state = g.dredge.market;
    const best = (k) => Math.max(...towns.filter((t) => t.id !== 'cockeysville').map((t) => priceOf(t.id, k, state)));
    g.renderer.setAnimationLoop(null);
    g.renderFrame();
    const info0 = window.shine.renderInfo();
    // Up the road from the south into town, and a look east over the quarry yard.
    window.shine.teleport(392, -580, 0);
    window.shine.step(0.2);
    window.shine.teleport(396, -625, 0);
    window.shine.step(0.3);
    const toast = document.getElementById('toast').textContent;
    window.shine.teleport(396, -650, Math.PI / 2);
    window.shine.step(0.2);
    g.renderFrame();
    const info1 = window.shine.renderInfo();
    return {
      villages: w.villages.map((v) => v.name), path: path.length, roadB: Math.hypot(b.x - cv.x, b.z - cv.z),
      houses: houses.length, housesOnRoad: houses.filter((h) => !clearOf(h)).length,
      quarry: quarry.length, quarryOnRoad: quarry.filter((h) => !clearOf(h)).length, solid,
      quarryOnHouse: quarry.filter((q) => houses.some((h) => Math.abs(centre(q)[0] - centre(h)[0]) < (q.maxX - q.minX + h.maxX - h.minX) / 2 + 2
        && Math.abs(centre(q)[1] - centre(h)[1]) < (q.maxZ - q.minZ + h.maxZ - h.minZ) / 2 + 2)).length,
      inCounty: quarry.every((h) => h.maxX < 432),
      label: w.mapLabels.some((l) => l.text === 'COCKEYSVILLE'),
      coil: [priceOf('cockeysville', 'coil', state), best('coil')], radio: [priceOf('cockeysville', 'radio', state), best('radio')],
      toast, calls: info1.calls, lights: info1.lights, programs: info1.programs - info0.programs, geometries: info1.geometries - info0.geometries,
    };
  }, seg);
  expect(r.villages).toEqual(['Monkton', 'Glyndon', 'Cockeysville']);
  expect(r.roadB).toBeLessThan(1);
  expect(r.path).toBeGreaterThan(2);
  expect(r.houses).toBeGreaterThan(6);
  expect(r.housesOnRoad).toBe(0);
  expect(r.quarry).toBe(12);
  expect(r.quarryOnRoad).toBe(0);
  expect(r.quarryOnHouse).toBe(0);                  // clear of the houses, with room to pass
  expect(r.solid).toBe(12);                         // the stacks stop the truck
  expect(r.inCounty).toBe(true);
  expect(r.label).toBe(true);
  expect(r.coil[0]).toBeGreaterThan(r.coil[1]);     // the quarry pays best for copper
  expect(r.radio[0]).toBeLessThan(r.radio[1]);      // and least for the parlour
  expect(r.toast).toContain('Cockeysville');
  expect(r.calls).toBeLessThan(60);
  expect(r.lights).toBe(12);
  expect(r.programs).toBe(0);
  expect(r.geometries).toBe(0);
  expect(problems).toEqual([]);
});

test('the quarry store deals only with a Runner: before that no marker or route, a barred mark on the radar and word of when; then it opens with Moss Delaney’s welcome', async ({ page }) => {
  const problems = await openGame(page, '&story');
  // The earlier beats are behind this save.
  await page.evaluate(() => { const d = window.shine.game.dredge.data; d.started = true; d.story = { prologue: true, valley: true, rare: true, temperance: true, still: true, contacts: true }; });
  await startRun(page, { loot: false });
  const before = await page.evaluate(() => {
    const g = window.shine.game;
    g.trunk.place('coil', 0, 0);
    window.shine.teleport(392, -580, 0); window.shine.step(0.2);
    window.shine.teleport(400, -646, 0); window.shine.step(0.3);
    g.renderFrame();
    const i = 3;
    return {
      market: g.ui.isOpen('market'), toast: document.getElementById('toast').textContent,
      marker: { off: g.marketMarkers[i].userData.off, visible: g.marketMarkers[i].visible },
      radar: g._mapMarkers().find((m) => m.x === 400 && m.z === -650)?.kind,
      goTo: g._destination().place.id, dialog: !document.getElementById('dialog').classList.contains('hidden'),
    };
  });
  expect(before.market).toBe(false);
  expect(before.toast).toContain('Come back when you’re a Runner');
  expect(before.marker).toEqual({ off: true, visible: false });
  expect(before.radar).toBe('market-closed');
  expect(before.goTo).not.toBe('cockeysville');    // the route goes to a market that will deal
  expect(before.dialog).toBe(false);

  // Runner (back out on the road): the rank's word names the store, and Moss Delaney has a
  // word too.
  await page.evaluate(() => { const g = window.shine.game; window.shine.teleport(392, -580, 0); window.shine.step(0.2); g._addRep(90); });
  await expect(page.locator('#toast')).toContainText('Cockeysville Quarry Store');
  await page.evaluate(() => window.shine.step(0.6));
  await expect(page.locator('#dialog')).toBeVisible();
  const speakers = new Set();
  for (let k = 0; k < 40 && await page.locator('#dialog').isVisible(); k++) {
    speakers.add(await page.locator('#dialog-name').textContent());
    await page.click('#dialog-next');
  }
  expect([...speakers]).toContain('Moss Delaney');

  const after = await page.evaluate(() => {
    const g = window.shine.game;
    const goTo = g._destination().place.id;
    window.shine.teleport(400, -646, 0); window.shine.step(0.3);
    g.renderFrame();
    return {
      goTo, market: g.ui.isOpen('market'), title: document.getElementById('market-title').textContent,
      marker: { off: g.marketMarkers[3].userData.off }, radar: g._mapMarkers().find((m) => m.x === 400 && m.z === -650)?.kind,
      sell: document.querySelector('#market [data-id="coil"]')?.textContent,
    };
  });
  expect(after.goTo).toBe('cockeysville');
  expect(after.market).toBe(true);
  expect(after.title).toBe('COCKEYSVILLE QUARRY STORE');
  expect(after.marker).toEqual({ off: false });
  expect(after.radar).toBe('market');
  expect(after.sell).toMatch(/^SELL \$\d+/);
  expect(problems).toEqual([]);
});

test('contacts are people: each speakeasy and farm has its character, the board says who wants what and in their words, and Sheriff Hale posts from the lockup from Brewer on', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const g = window.shine.game, w = g.world;
    const { contacts, offersFor } = await import('/src/contracts.js');
    const { CAST } = await import('/src/story.js');
    const list = contacts(w);
    const days = (rank) => Array.from({ length: 60 }, (_, d) => offersFor(d + 1, list, { rank })).flat();
    const low = days(2), high = days(3);
    const lockup = list.find((c) => c.id === 'lockup');
    return {
      people: list.every((c) => CAST[c.who] && CAST[c.who].name === c.name && CAST[c.who].asks.length >= 2 && c.place),
      unique: new Set(list.map((c) => c.who)).size === list.length,
      jockey: list.find((c) => c.who === 'jockey')?.place, pruitt: list.find((c) => c.who === 'pruitt')?.place,
      lockup: { rank: lockup.rank, name: lockup.name, town: Math.hypot(lockup.x - 400, lockup.z + 650), road: Math.hypot(w.roads.nearest(lockup.x, lockup.z).x - lockup.x, w.roads.nearest(lockup.x, lockup.z).z - lockup.z) },
      sheriffLow: low.some((o) => o.contact === 'lockup'), sheriffHigh: high.filter((o) => o.contact === 'lockup').length,
      lines: high.every((o) => CAST[o.who].asks.includes(o.line)),
      sameBelow: JSON.stringify(offersFor(9, list, { rank: 0 }).map((o) => o.contact)) === JSON.stringify(offersFor(9, list.filter((c) => c.id !== 'lockup'), { rank: 0 }).map((o) => o.contact)),
    };
  });
  expect(r.people).toBe(true);
  expect(r.unique).toBe(true);
  expect(r.jockey).toBe('Harrow Stables');
  expect(r.pruitt).toBe('Old Mill Barn');
  expect(r.lockup.rank).toBe(3);
  expect(r.lockup.name).toBe('Sheriff Hale');
  expect(r.lockup.town).toBeLessThan(60);
  expect(r.lockup.road).toBeLessThan(40);
  expect(r.sheriffLow).toBe(false);
  expect(r.sheriffHigh).toBeGreaterThan(2);
  expect(r.lines).toBe(true);
  expect(r.sameBelow).toBe(true);                   // below Brewer, the day's jobs are as they were

  // The board at Lexington Market: a face, a name and place, and their words for each job.
  await page.evaluate(() => { window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market')).toBeVisible();
  const offers = await page.evaluate(() => window.shine.game._jobs().offers());
  await expect(page.locator('#market-body .job .face')).toHaveCount(offers.length);
  await expect(page.locator('#market-body .job .says')).toHaveCount(offers.length);
  await expect(page.locator('#market-body')).toContainText(`${offers[0].name}: `);
  await expect(page.locator('#market-body')).toContainText(offers[0].place);
  await expect(page.locator('#market-body .job .says').first()).toContainText(offers[0].line);
  await page.click('#market-done');

  // A job for the Sheriff, delivered to the lockup in Cockeysville.
  const s = await page.evaluate(async () => {
    const g = window.shine.game, d = g.dredge.data;
    const { offersFor } = await import('/src/contracts.js');
    d.rank = 3;
    let job = null;
    for (let day = 1; !job; day++) job = offersFor(day, g.contactList, { rank: 3 }).find((o) => o.contact === 'lockup');
    g.takeContract(job);
    const taken = document.getElementById('toast').textContent;
    for (const [kind, n] of Object.entries(job.wants)) for (let k = 0; k < n; k++) { const spot = g.trunk.findSpot(kind); g.trunk.place(kind, spot.x, spot.y, spot.rot); }
    const cash = g.dredge.cash;
    window.shine.teleport(job.x + 40, job.z, 0); window.shine.step(0.2);
    window.shine.teleport(job.x, job.z, 0); window.shine.step(0.3);
    return { taken, paid: g.dredge.cash - cash, pay: job.pay, toast: document.getElementById('toast').textContent, ledger: d.ledger[0].text, market: g.ui.isOpen('market') };
  });
  expect(s.taken).toContain('for Sheriff Hale, Cockeysville Lockup');
  expect(s.paid).toBe(s.pay);
  expect(s.toast).toContain('Delivered to Sheriff Hale');
  expect(s.ledger).toContain('Sheriff Hale');
  expect(s.market).toBe(false);
  expect(problems).toEqual([]);
});
