import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

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
  expect(green.objective).toBe('Find salvage: SALVAGE signs mark the sites');
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
