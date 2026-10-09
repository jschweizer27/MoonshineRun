import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

const objective = (page) => page.evaluate(() => { window.shine.step(0.6); return document.getElementById('objective-text').textContent; });

test('chapters 1 and 2: the ruins give Father’s coil, the cellar after dark the pledge card, Ma Pruitt teaches Applejack, the Harrow office the ledger and the farm tyres; nothing compiles', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const setup = await page.evaluate(() => {
    const g = window.shine.game, w = g.world;
    g.renderer.setAnimationLoop(null);
    g.renderFrame();
    const info = window.shine.renderInfo();
    const ruins = g.salvage.sites.find((s) => s.story === 'ruins'), office = g.salvage.sites.find((s) => s.story === 'office');
    const harrow = w.barns.find((b) => b.name === 'Harrow Stables');
    window.shine.step(0.6);
    return {
      info, ruins: !!ruins, office: !!office,
      ruinsInCity: !w.inCounty(ruins), nearSpeakeasy: Math.hypot(ruins.x - 176, ruins.z - 44) < 120,
      officeAtHarrow: Math.hypot(office.x - harrow.stopX, office.z - harrow.stopZ) < 20,
      reachable: [ruins, office].every((s) => !w.collision.resolveCircle(s.stopX, s.stopZ, 1.2).hit),
      status: [g.salvage.status(ruins, 0, 12), g.salvage.status(office, 0, 21.5)],
      radar: g._mapMarkers().filter((m) => m.kind === 'story').map((m) => [Math.round(m.x), Math.round(m.z)]),
      at: [Math.round(ruins.x), Math.round(ruins.z)],
    };
  });
  expect(setup.ruins && setup.office).toBe(true);
  expect(setup.ruinsInCity).toBe(true);
  expect(setup.nearSpeakeasy).toBe(true);
  expect(setup.officeAtHarrow).toBe(true);
  expect(setup.reachable).toBe(true);
  expect(setup.status).toEqual(['ok', 'hidden']);          // only the current step's site is open
  expect(setup.radar).toEqual([setup.at]);
  expect(await objective(page)).toBe('Ashes: Search the ruins of Braun & Sons in Highlandtown');

  // Stop at the ruins: the search opens. Worked well, Father's coil comes up in hand.
  const ruins = await page.evaluate(() => {
    const g = window.shine.game, s = g.salvage.sites.find((x) => x.story === 'ruins');
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.2);
    const opened = g.ui.isOpen('salvage'), title = document.getElementById('salvage-title').textContent;
    while (g.ui.anyOpen) g.ui.close();
    g._onSalvaged(s, 0.9);
    const hand = g.trunkScreen.hand?.kind;
    g.trunkScreen.confirm(); g.trunkScreen.close();
    return { opened, title, hand, coil: [...g.trunk.pieces.values()].some((p) => p.kind === 'coil') };
  });
  expect(ruins).toEqual({ opened: true, title: 'RUINS OF BRAUN & SONS', hand: 'coil', coil: true });
  expect(await objective(page)).toBe('Ashes: Fit the coil at the barn and run a batch');
  await page.evaluate(() => { const g = window.shine.game, d = g.dredge.data; d.still = 1; d.stats.brews = 1; g.trunk.clear(); });   // the coil went in
  expect(await objective(page)).toBe('Ashes: Deliver an order to Gus Kessler at the Highlandtown Speakeasy');
  await page.evaluate(() => { const d = window.shine.game.dredge.data; d.delivered.kessler = 1; });
  expect(await objective(page)).toBe('Ashes: Earn Gus Kessler’s trust (★★)');
  // Gus trusts him: the cellar, after dark.
  const cellar = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data, s = g.salvage.sites.find((x) => x.story === 'ruins');
    window.shine.teleport(0, 100, 0);              // away from the ruins (waiting there, it opens when dark comes)
    d.trust.kessler = 4;
    g.env.hour = 12;
    window.shine.step(0.6);
    const byDay = { objective: document.getElementById('objective-text').textContent, status: g.salvage.status(s, 0, g.env.hour) };
    g.env.hour = 21.5;
    window.shine.step(0.6);
    g._onSalvaged(s, 0);                      // a miss: try again
    const missed = { clue: !!d.clues.pledge, toast: document.getElementById('toast').textContent };
    g._onSalvaged(s, 0.8);
    window.shine.step(0.6);
    return { byDay, missed, clue: !!d.clues.pledge, chapter: d.chapter, tool: !!d.tools.coil, ruins: g.salvage.status(s, 0, 21.5), objective: document.getElementById('objective-text').textContent };
  });
  expect(cellar.byDay.objective).toBe('Ashes: Search the brewery cellar, after dark');
  expect(cellar.byDay.status).toBe('day');
  expect(cellar.missed.clue).toBe(false);
  expect(cellar.missed.toast).toContain('Try the ruins of braun & sons again');
  expect(cellar.clue).toBe(true);
  expect(cellar.chapter).toBe(1);
  expect(cellar.tool).toBe(true);
  expect(cellar.ruins).toBe('hidden');
  expect(cellar.objective).toBe('Green Spring: Deliver an order to Ma Pruitt at Old Mill Barn');

  // Chapter 2: Ma Pruitt teaches Applejack (till then the barn and the orders don't know it).
  const green = await page.evaluate(async () => {
    const g = window.shine.game, d = g.dredge.data, P = g.player;
    const { offersFor } = await import('/src/contracts.js');
    const asks = () => Array.from({ length: 40 }, (_, k) => offersFor(k + 1, g.contactList, { brewing: true, learned: d.flags })).flat().some((o) => o.wants.applejack);
    const before = { learned: !!d.flags['learned:applejack'], asks: asks() };
    d.delivered.pruitt = 1;
    window.shine.step(0.6);
    const after = { learned: !!d.flags['learned:applejack'], asks: asks() };
    d.best.applejack = 0.8;
    d.trust.jockey = 4;
    window.shine.step(0.6);
    const office = g.salvage.sites.find((x) => x.story === 'office');
    const open = g.salvage.status(office, 0, 21.5);
    const fieldBefore = g.perks.field;
    g._onSalvaged(office, 1);
    window.shine.step(0.6);
    g.renderFrame();
    return {
      before, after, open, fieldBefore, field: g.perks.field, ledger: !!d.clues.ledger, tyres: !!d.tools.tyres, chapter: d.chapter,
      objective: document.getElementById('objective-text').textContent, info: window.shine.renderInfo(), speed: P.t.maxSpeed > 0,
    };
  });
  expect(green.before).toEqual({ learned: false, asks: false });
  expect(green.after).toEqual({ learned: true, asks: true });
  expect(green.open).toBe('ok');
  expect(green.fieldBefore).toBeLessThan(1);
  expect(green.field).toBe(1);                              // farm tyres: no slowing in the fields
  expect(green.ledger).toBe(true);
  expect(green.tyres).toBe(true);
  expect(green.chapter).toBe(2);
  expect(green.objective).toBe('The Western Line: Earn Mags O’Rourke’s trust (★★)');   // chapter 3 opens
  expect(green.info.programs).toBe(setup.info.programs);
  expect(green.info.geometries).toBe(setup.info.geometries);
  expect(problems).toEqual([]);
});

test('the story in cards: the chapter opens, the clue is read out, and the notebook keeps the steps and the clue', async ({ page }) => {
  const problems = await openGame(page, '&story');
  await startRun(page, { loot: false });
  const skip = async () => { for (let k = 0; k < 6 && (await page.locator('#dialog').isVisible()); k++) await page.click('#dialog-skip'); };
  // Only window.shine.step moves the story on from here (the live loop would race the clicks).
  await page.evaluate(() => { const g = window.shine.game; g.renderer.setAnimationLoop(null); g.settings.reducedMotion = true; });
  await skip();                                            // the prologue
  await page.evaluate(() => window.shine.step(0.6));
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog-text')).toContainText('Chapter 1: Ashes');
  await skip();
  // Up to the cellar, then the clue.
  await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    Object.assign(d.flags, { ruinsSearched: true });
    d.still = 1; d.stats.brews = 1; d.delivered.kessler = 1; d.trust.kessler = 4;
    window.shine.step(0.6);
  });
  await expect(page.locator('#dialog')).toBeVisible();
  await skip();
  await page.evaluate(() => {
    const g = window.shine.game;
    g.env.hour = 21.5;
    g._onSalvaged(g.salvage.sites.find((x) => x.story === 'ruins'), 0.9);
    window.shine.step(0.6);
  });
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog-text')).toContainText('A clue for the notebook: A half-burned pledge card');
  await skip();
  await page.evaluate(() => { const g = window.shine.game; if (g.state === 'paused' && !g.ui.anyOpen) g.resume(); });
  await page.keyboard.press('b');
  await expect(page.locator('#notebook')).toBeVisible();
  for (const text of ['CHAPTER 2: GREEN SPRING', 'Deliver an order to Ma Pruitt at Old Mill Barn', 'A half-burned pledge card', 'Towson']) await expect(page.locator('#notebook-body')).toContainText(text);
  await page.click('#notebook-done');
  expect(problems).toEqual([]);
});


test('chapter 3, The Western Line: Mags’s trust (her offers come daily), the midnight freight loaded only while it stands at Glyndon, the guard’s van, and the false bottom', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 2);
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, step, visit, shine, objective, toast } = eval(KIT);
    const before = window.shine.renderInfo();
    step();
    const out = { open: objective(), mags: g._jobs().offers().filter((o) => o.who === 'orourke').length };
    d.trust.orourke = 4;
    d.flags['order:purdy'] = true;                 // Walt Purdy carried (passenger.spec)
    step();
    const o = d.orders.find((x) => x.story === 'freight');
    out.order = { x: o.x, z: o.z, window: o.window, due: o.due, objective: objective(), full: g._jobs().full() };
    out.dropped = (g.dropContract(o), d.orders.includes(o));
    // Before the freight is in: said once, and waiting at the siding hands it over at 23:00.
    shine(2);
    g.env.hour = 22.5;
    visit(o.x, o.z);
    out.early = { toast: toast(), kept: d.orders.includes(o) };
    g.env.hour = 23.4;
    step(0.3);
    out.loaded = { flag: !!d.flags['order:freight'], shine: g._contraband(), trustToast: /trusts you/.test(toast()) };
    clear(); step();
    const van = g.salvage.sites.find((s) => s.story === 'van');
    out.van = [g.salvage.status(van, 0, 12), g.salvage.status(van, 0, 23.5), Math.hypot(van.x - g.railway.train.position.x, 0) > 6];
    g._onSalvaged(van, 0.8); clear(); step();
    out.done = { chapter: d.chapter, manifest: !!d.clues.manifest, tool: !!d.tools.falsebottom, hidden: g.perks.hidden, objective: objective() };
    g.renderFrame();
    out.info = window.shine.renderInfo();
    out.before = before;
    return out;
  }, KIT);
  expect(r.open).toBe('The Western Line: Earn Mags O’Rourke’s trust (★★)');
  expect(r.mags).toBe(1);                                         // the step's contact posts every day
  expect(r.order).toEqual({ x: -414, z: -702, window: [23, 1.5], due: null, objective: 'Order: 2 corn shines for Walt Purdy · 23:00–01:30', full: false });
  expect(r.dropped).toBe(true);                                   // a story order can't be dropped
  expect(r.early.toast).toContain('The freight’s not in yet');
  expect(r.early.kept).toBe(true);
  expect(r.loaded).toEqual({ flag: true, shine: 0, trustToast: false });
  expect(r.van).toEqual(['closed', 'ok', true]);
  expect(r.done).toEqual({ chapter: 3, manifest: true, tool: true, hidden: 2, objective: 'Stone and Iron: Collect Moss Delaney’s consignment at the Cockeysville quarry' });
  expect(r.info.programs).toBe(r.before.programs);
  expect(r.info.geometries).toBe(r.before.geometries);
  expect(problems).toEqual([]);
});

test('chapter 4, Stone and Iron: Delaney’s crates past the York Road checkpoint in the false bottom, the Sheriff’s trust opens bribery, his report for a price, and the police-band radio', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 3);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear, step, visit, pack, objective, toast } = eval(KIT);
    g.police._patrols = () => {};
    step();
    const out = {};
    const quarry = g.salvage.sites.find((s) => s.story === 'quarry');
    out.store = Math.hypot(quarry.x - 400, quarry.z + 650) > 20;
    g.env.hour = 12;
    visit(quarry.stopX, quarry.stopZ);
    out.byDay = toast();
    g.env.hour = 21.5;
    g.trunk.clear();
    window.shine.teleport(quarry.stopX, quarry.stopZ + 40, 0); window.shine.step(0.3);
    window.shine.teleport(quarry.stopX, quarry.stopZ, 0); window.shine.step(0.3);
    out.handed = g.trunkScreen.isOpen;
    pack(); clear(); step();
    const run = d.orders.find((o) => o.story === 'run');
    out.run = { who: run.who, night: run.night, shine: g._contraband(), objective: objective() };
    // The York Road checkpoint: stopped and searched, the false bottom hides both crates.
    const C = g.police.checkpoint;
    clear(); g.player.place(C.x, C.z - 40, 0); window.shine.step(0.1); g.player.place(C.x, C.z, 0); window.shine.step(0.1);
    out.search = { state: g.state, toast: toast(), shine: g._contraband() };
    visit(run.x, run.z); clear(); step();
    out.delivered = !!d.flags['order:run'];
    // Sheriff Hale: his offer comes daily now (whatever the rank), and his trust opens bribery.
    out.sheriff = g._jobs().offers().some((o) => o.who === 'sheriff');
    d.cash = 1000;
    g.player.place(0, -600, 0);
    g._bust('The Bureau boxed you in.');
    out.noBribe = d.ledger[0].text;
    clear();
    d.trust.sheriff = 6; step(); clear(); step();      // ★★★
    out.bribery = !!d.flags.bribery;
    d.cash = 1000;
    g.player.place(0, -600, 0);
    g._bust('The Bureau boxed you in.');
    out.bribe = d.ledger[0].text;
    clear();
    // The report, after dark, for a price.
    const lock = g.salvage.sites.find((s) => s.story === 'lockup');
    out.lockup = Math.hypot(lock.x - g.world.lockup.x, lock.z - g.world.lockup.z) > 20;
    d.cash = 300;
    visit(lock.stopX, lock.stopZ);
    out.short = toast();
    d.cash = 900;
    clear(); window.shine.teleport(lock.stopX, lock.stopZ + 40, 0); window.shine.step(0.3); window.shine.teleport(lock.stopX, lock.stopZ, 0); window.shine.step(0.3);
    out.confirm = g.ui.isOpen('confirm');
    document.getElementById('confirm-yes').click();
    await new Promise((res) => setTimeout(res, 30));
    clear(); step();
    out.done = { cash: d.cash, report: !!d.clues.report, tool: !!d.tools.policeband, chapter: d.chapter, objective: objective() };
    // The police band: a Bureau car far off is on the radar, with the way it's looking; a
    // roadblock going up is called out.
    const u = g.police.units[0];
    g.police.reset(); g.police._patrols = () => {};
    u.active = true; u.mode = 'patrol'; u.goal = null; u.car.place(g.player.position.x + 300, g.player.position.z, 1.2);
    out.radar = g._mapMarkers().filter((m) => m.kind === 'agent').map((m) => [Math.round(m.x - g.player.position.x), m.look]);
    g._onPolice({ type: 'roadblock', x: 0, z: -560 });
    out.roadblock = toast();
    return out;
  }, KIT);
  expect(r.store).toBe(true);
  expect(r.byDay).toContain('after dark');
  expect(r.handed).toBe(true);
  expect(r.run).toEqual({ who: 'kessler', night: true, shine: 2, objective: 'Deliver to Gus Kessler at Highlandtown Speakeasy · fragile · tonight' });
  expect(r.search.state).toBe('playing');
  expect(r.search.toast).toContain('find nothing');
  expect(r.search.shine).toBe(2);
  expect(r.delivered).toBe(true);
  expect(r.sheriff).toBe(true);
  expect(r.noBribe).toMatch(/^Busted/);                           // no bribery before his trust
  expect(r.bribery).toBe(true);
  expect(r.bribe).toBe('Sheriff Hale made a bust go away');
  expect(r.lockup).toBe(true);
  expect(r.short).toContain('Sheriff Hale wants $500');
  expect(r.confirm).toBe(true);
  expect(r.done.report).toBe(true);
  expect(r.done.tool).toBe(true);
  expect(r.done.chapter).toBe(4);
  expect(r.done.cash).toBe(400);
  expect(r.done.objective).toBe('Drowned Warren: Brew Highlandtown Lager in Gus’s cellar (3 sacks of malt, a barrel)');
  expect(r.radar).toEqual([[300, 1.2]]);
  expect(r.roadblock).toContain('Police band: a roadblock going up near');
  expect(problems).toEqual([]);
});

test('chapter 5, Drowned Warren: out to Loch Raven, the drowned mill after dark, the Bureau’s trap, getting away, and the Jockey gone for good', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 4);
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, step, objective } = eval(KIT);
    g.police._patrols = () => {};
    d.best.lager = 0.8;                             // the brewery's done (brewery.spec)
    step();
    const out = { open: objective() };
    g._updateRoute(1);
    out.route = g.minimap.route.at(-1);
    window.shine.teleport(520, -740, Math.PI / 2);
    step(); clear(); step();
    out.arrived = { place: g.place, objective: objective() };
    // A Jockey order in the book: it goes when he's found out.
    d.orders.push({ id: 'jockey-test', contact: 'farm:3', who: 'jockey', name: 'The Jockey', place: 'Harrow Stables', kind: 'farm', x: 0, z: -600, wants: { crate: 1 }, grade: null, night: false, pay: 100, rep: 5, hours: 10, km: 0, line: '', due: 1e6 });
    const mill = g.salvage.sites.find((s) => s.story === 'mill');
    out.mill = [g.salvage.status(mill, 0, 12), g.salvage.status(mill, 0, 21.5)];
    // A patrol far off in the city plays no part in the trap: every car comes in close.
    const far = g.police.units[0];
    far.active = true; far.mode = 'patrol'; far.goal = null; far.car.place(0, 100, 0);
    g.env.hour = 21.5;
    g._onSalvaged(mill, 0.8); clear(); step();
    const P = g.police, me = g.player.position;
    out.trap = { letters: !!d.clues.letters, tier: P.tier, cars: P.units.filter((u) => u.active).map((u) => u.car.position.distanceTo(me)) };
    // Out of their sight long enough: away.
    P.hold = 0;
    for (let k = 0; k < 80 && !d.flags.escaped; k++) { for (const u of P.units) if (u.active) { u.car.place(me.x + 900, me.z + 900, 0); u.lastKnown.set(me.x + 900, 0, me.z + 900); u.mode = 'search'; } window.shine.step(0.5); }
    out.escaped = !!d.flags.escaped;
    clear(); step(); clear(); step();
    out.done = { chapter: d.chapter, betrayed: !!d.flags.betrayed, jockeyOrders: d.orders.filter((o) => o.who === 'jockey').length, objective: objective() };
    out.jockeyOffers = Array.from({ length: 20 }, (_, k) => { g.dredge.market.clock = 24 * (k + 2); return g._jobs().offers(); }).flat().filter((o) => o.who === 'jockey').length;
    return out;
  }, KIT);
  expect(r.open).toBe('Drowned Warren: Drive out to Loch Raven, east of Cockeysville');
  expect(r.route).toEqual({ x: 545, z: -735 });
  expect(r.arrived).toEqual({ place: 'Loch Raven', objective: 'Drowned Warren: Search the drowned mill at Warren' });
  expect(r.mill).toEqual(['day', 'ok']);
  expect(r.trap.letters).toBe(true);
  expect(r.trap.tier).toBe(3);
  expect(r.trap.cars.length).toBe(4);
  for (const d of r.trap.cars) { expect(d).toBeGreaterThan(40); expect(d).toBeLessThan(170); }
  expect(r.escaped).toBe(true);
  expect(r.done).toEqual({ chapter: 5, betrayed: true, jockeyOrders: 0, objective: 'The choice: buy back the deed at Lexington Market, or take the letters to the Sun' });
  expect(r.jockeyOffers).toBe(0);
  expect(problems).toEqual([]);
});

for (const ending of ['deed', 'paper']) {
  test(`the ending, ${ending === 'deed' ? 'the deed: Braun & Sons bought back at Lexington Market' : 'the paper: the letters to the Baltimore Sun'}, its cards and the ending screen, and the other way closed`, async ({ page }) => {
    const problems = await openGame(page, '&story');
    // The save is past every chapter before the drive starts (and only window.shine.step
    // moves the game on), so no chapter's card opens under the test.
    await page.evaluate(() => { const g = window.shine.game; g.dredge.data.started = true; g.dredge.data.story = { prologue: true, valley: true, rare: true, temperance: true, still: true, contacts: true, quarry: true, sheriff: true }; });
    await past(page, 5);
    await page.evaluate(() => { const g = window.shine.game, d = g.dredge.data; d.flags.betrayed = true; d.cash = 25000; g.settings.reducedMotion = true; });
    await page.click('#start-btn');
    const sun = await page.evaluate(() => { const g = window.shine.game; return g.salvage.sites.find((s) => s.story === 'sun'); });
    if (ending === 'deed') {
      await page.evaluate(() => { window.shine.step(0.6); window.shine.teleport(-44, 88, 0); window.shine.step(0.2); window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
      await expect(page.locator('#market [data-id="deed"]')).toHaveText('BUY $12,000');
      await page.click('#market [data-id="deed"]');
    } else {
      await page.evaluate((s) => { window.shine.step(0.6); window.shine.teleport(s.stopX + 40, s.stopZ, 0); window.shine.step(0.2); window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.3); }, sun);
    }
    await expect(page.locator('#confirm')).toBeVisible();
    await page.click('#confirm-yes');
    const seen = [];
    for (let k = 0; k < 12 && await page.locator('#dialog').isVisible(); k++) { seen.push(await page.locator('#dialog-text').textContent()); await page.click('#dialog-next'); }
    expect(seen.join(' ')).toContain(ending === 'deed' ? 'Braun & Sons. Mine again.' : 'TEMPERANCE CHIEF PAID FOR BREWERY FIRE');
    await expect(page.locator('#ending')).toBeVisible();
    await expect(page.locator('#ending-title')).toHaveText(ending === 'deed' ? 'THE DEED' : 'THE PAPER');
    await expect(page.locator('#ending-stats')).toContainText('Clues found5/5');
    const after = await page.evaluate(() => { const d = window.shine.game.dredge.data; return { ending: d.ending, cash: d.cash, deed: !!d.flags.deed }; });
    expect(after).toEqual(ending === 'deed' ? { ending: 'deed', cash: 13000, deed: true } : { ending: 'paper', cash: 25000, deed: false });
    if (ending === 'deed') {
      // Keep driving: the roads stay open, and the Sun has nothing more to say.
      await page.click('#ending-keep');
      const r = await page.evaluate(() => { const g = window.shine.game; window.shine.step(0.6); return { state: g.state, sun: g.salvage.status(g.salvage.sites.find((x) => x.story === 'sun'), 0, 12), objective: document.getElementById('objective-text').textContent }; });
      expect(r).toEqual({ state: 'playing', sun: 'hidden', objective: 'Find salvage: SALVAGE signs mark the sites' });
      await page.evaluate(() => window.shine.game.quitToTitle());
      await expect(page.locator('#intro-best')).toContainText('Braun & Sons is yours again');
    } else {
      await page.click('#ending-title-btn');
      await expect(page.locator('#intro')).toBeVisible();
      await expect(page.locator('#intro-best')).toContainText('The Alliance has fallen');
      // No deed for sale after the paper.
      const deed = await page.evaluate(() => window.shine.game._deed({ id: 'baltimore' }));
      expect(deed).toBe(null);
    }
    expect(problems).toEqual([]);
  });
}
