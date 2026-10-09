import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

test('order offers: rolled from the day, from farms and speakeasies, paid over the odds and for the distance; shine only once Otto brews, after dark and graded', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const { offersFor, contacts, progress, handOver } = await import('/src/contracts.js');
    const { CONFIG } = await import('/src/config.js');
    const { KINDS, Trunk } = await import('/src/trunk.js');
    const list = contacts(window.shine.game.world);
    const days = Array.from({ length: 20 }, (_, d) => offersFor(d, list));
    const brewing = Array.from({ length: 20 }, (_, d) => offersFor(d, list, { brewing: true }));
    const home = { x: window.shine.game.world.home.stopX, z: window.shine.game.world.home.stopZ };
    const far = offersFor(3, list, { home });
    const all = days.flat(), allB = brewing.flat();
    const worth = (o) => Object.entries(o.wants).reduce((s, [k, n]) => s + KINDS[k].value * n, 0);
    const t = new Trunk(8, 4); t.place('keg', 0, 0); t.place('crate', 2, 0);
    const job = { wants: { keg: 1, crate: 2 } };
    const before = progress(job, t);
    const spot = t.findSpot('crate'); t.place('crate', spot.x, spot.y, spot.rot);
    const after = progress(job, t);
    handOver(job, t);
    return {
      contacts: { n: list.length, farms: list.filter((c) => c.kind === 'farm').length },
      same: JSON.stringify(offersFor(5, list)) === JSON.stringify(offersFor(5, list)),
      perDay: days.every((d) => d.length === CONFIG.dredge.contracts.perDay),
      kinds: new Set(all.map((o) => o.kind)).size,
      varied: new Set(all.map((o) => o.contact)).size,
      shineBefore: all.some((o) => Object.keys(o.wants).some((k) => KINDS[k].brewed)),
      shineAfter: allB.filter((o) => o.kind === 'speakeasy').every((o) => Object.keys(o.wants).every((k) => k === 'corn-shine') && o.night && o.grade === 'C'),
      farmsAnyTime: allB.filter((o) => o.kind === 'farm' && o.who !== 'jockey').every((o) => !o.night && !o.grade),
      jockey: allB.filter((o) => o.who === 'jockey').every((o) => o.night),   // he wants shine for the estates' parties
      pruitt: all.filter((o) => o.who === 'pruitt').every((o) => Object.keys(o.wants).every((k) => ['sack', 'jugs', 'small-crate', 'barrel'].includes(k))),
      pay: all.every((o) => o.pay === Math.round((worth(o) * 1.7) / 5) * 5 && o.pay > worth(o)),
      distance: far.every((o, i) => o.km > 0 && o.pay === Math.round((worth(o) * 1.7 * (1 + CONFIG.dredge.contracts.distPay * Math.hypot(o.x - home.x, o.z - home.z) / 1000)) / 5) * 5 && o.pay >= days[3][i].pay),
      hours: all.every((o) => o.hours >= 8 && o.hours <= 16),
      before: before.ready, after: after.ready, left: t.count,
    };
  });
  expect(r.contacts).toEqual({ n: 17, farms: 6 });           // ten speakeasies, six farms and the Sheriff's lockup
  expect(r.same).toBe(true);
  expect(r.perDay).toBe(true);
  expect(r.kinds).toBe(2);
  expect(r.varied).toBeGreaterThan(8);
  expect(r.shineBefore).toBe(false);
  expect(r.shineAfter).toBe(true);           // a new brewer is only asked for Corn Shine, at grade C, after dark
  expect(r.farmsAnyTime).toBe(true);
  expect(r.jockey).toBe(true);
  expect(r.pruitt).toBe(true);           // Ma Pruitt wants the still's makings
  expect(r.pay).toBe(true);
  expect(r.distance).toBe(true);             // the far ones pay for the drive
  expect(r.hours).toBe(true);
  expect([r.before, r.after, r.left]).toEqual([false, true, 0]);
});

test('an order: taken at a market into the book, marked on the road and the radar, delivered for pay, standing and trust; a late one is lost', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const info0 = await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.teleport(-44, 48, 0); window.shine.step(0.3);
    return { programs: g.renderer.info.programs.length, geometries: g.renderer.info.memory.geometries };
  });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-body')).toContainText('ORDERS · 0/3 IN THE BOOK');
  const offers = await page.evaluate(() => window.shine.game._jobs().offers());
  expect(offers.length).toBe(4);
  const job = offers[0];
  await page.click(`#market [data-id="job-${job.id}"]`);
  await expect(page.locator('#market-body')).toContainText('ORDERS · 1/3 IN THE BOOK');
  await expect(page.locator(`#market [data-id="job-${offers[1].id}"]`)).toBeEnabled();    // room for more
  await expect(page.locator('#market-body')).toContainText('due in');
  await page.click('#market-done');

  // Marked: the objective, the radar and the delivery marker at the contact.
  let s = await page.evaluate(() => {
    const g = window.shine.game, c = g.dredge.data.orders[0];
    window.shine.step(0.2);
    const m = g.jobMarkers[c.kind];
    return { obj: document.getElementById('objective-text').textContent, radar: g._mapMarkers().some((x) => x.kind === 'job' && x.x === c.x), marker: [m.position.x, m.position.z], at: [c.x, c.z], off: m.userData.off, again: g._jobs().offers().some((o) => o.id === c.id) };
  });
  expect(s.obj).toMatch(/^Order: .* for /);
  expect(s.radar).toBe(true);
  expect(s.marker).toEqual(s.at);
  expect(s.off).toBe(false);
  expect(s.again).toBe(false);

  // Turning up empty-handed: they wait. With the goods aboard: paid.
  s = await page.evaluate((job) => {
    const g = window.shine.game, c = g.dredge.data.orders[0];
    window.shine.teleport(c.x + 40, c.z, 0); window.shine.step(0.2);
    window.shine.teleport(c.x, c.z, 0); window.shine.step(0.3);
    const waiting = document.getElementById('toast').textContent;
    for (const [kind, n] of Object.entries(job.wants)) for (let k = 0; k < n; k++) { const spot = g.trunk.findSpot(kind); g.trunk.place(kind, spot.x, spot.y, spot.rot); }
    const cash = g.dredge.cash;
    window.shine.teleport(c.x + 40, c.z, 0); window.shine.step(0.2);
    g.renderFrame();
    const visible = g.jobMarkers[c.kind].visible, calls = window.shine.renderInfo().calls;
    window.shine.teleport(c.x, c.z, 0); window.shine.step(0.3);
    const d = g.dredge.data;
    return { waiting, paid: g.dredge.cash - cash, contracts: d.stats.contracts, active: d.orders.length, trunk: g.trunk.count, ledger: d.ledger[0].text, visible, calls, trust: d.trust[c.who], delivered: d.delivered[c.who] };
  }, job);
  expect(s.waiting).toContain('is waiting on');
  expect(s.visible).toBe(true);
  expect(s.calls).toBeLessThan(60);
  expect(s.paid).toBe(job.pay);
  expect(s.contracts).toBe(1);
  expect(s.active).toBe(0);
  expect(s.trunk).toBe(0);
  expect(s.ledger).toContain(job.name);
  expect(s.trust).toBe(1);
  expect(s.delivered).toBe(1);

  // The handoff: the contact's own line on a card, then what was handed over and the pay.
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog-name')).toHaveText(job.name);
  const text = page.locator('#dialog-text');
  for (let k = 0; k < 6 && !(await text.textContent()).includes('Handed over'); k++) { await page.click('#dialog-next'); await page.waitForTimeout(300); }
  await expect(text).toContainText(`$${job.pay}`);
  for (let k = 0; k < 4 && (await page.locator('#dialog').isVisible()); k++) { await page.click('#dialog-next'); await page.waitForTimeout(300); }
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');

  // A late job is lost, and costs standing.
  s = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data, o = g._jobs().offers()[0];
    d.trust[o.who] = 4;
    g.takeContract(o);
    g.dredge.market.clock = d.orders[0].due + 0.5;
    window.shine.step(0.1);
    return { active: d.orders.length, trust: d.trust[o.who], toast: document.getElementById('toast').textContent, off: Object.values(g.jobMarkers).every((m) => m.userData.off) };
  });
  expect(s.active).toBe(0);
  expect(s.trust).toBe(2);                           // late costs two points of trust
  expect(s.toast).toContain('Too late');
  expect(s.off).toBe(true);
  const info1 = await page.evaluate(() => ({ programs: window.shine.game.renderer.info.programs.length, geometries: window.shine.game.renderer.info.memory.geometries }));
  expect(info1).toEqual(info0);
  expect(problems).toEqual([]);
});
