import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

// An order for a named contact (story.js CAST id), made by hand.
const ORDER = `(g, who, extra = {}) => {
  const c = g.contactList.find((x) => x.who === who);
  return { id: 'test-' + who + '-' + Math.random().toString(36).slice(2), contact: c.id, name: c.name, place: c.place, who, kind: c.kind, x: c.x, z: c.z,
    wants: { jugs: 1 }, grade: null, night: false, pay: 100, rep: 5, hours: 10, km: 1, line: '', ...extra };
}`;
// Stop at the order's door (from out of its ring), and say what the toast said.
const VISIT = `(g, o) => {
  while (g.ui.anyOpen) g.ui.close();
  g.resume();
  window.shine.teleport(o.x + 40, o.z, 0); window.shine.step(0.2);
  window.shine.teleport(o.x, o.z, 0); window.shine.step(0.3);
  return document.getElementById('toast').textContent;
}`;

test('the order book: up to three at once, each marked on the radar; a fourth waits; dropping one costs a little trust', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await page.evaluate(() => { window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market')).toBeVisible();
  const offers = await page.evaluate(() => window.shine.game._jobs().offers());
  for (const o of offers.slice(0, 3)) await page.click(`#market [data-id="job-${o.id}"]`);
  await expect(page.locator('#market-body')).toContainText('ORDERS · 3/3 IN THE BOOK');
  await expect(page.locator(`#market [data-id="job-${offers[3].id}"]`)).toBeDisabled();
  await expect(page.locator(`#market [data-id="job-${offers[3].id}"]`)).toHaveText('BOOK FULL');
  const r = await page.evaluate((id) => {
    const g = window.shine.game, d = g.dredge.data;
    const fourth = g.takeContract(g._jobs().offers().find((o) => o.id === id));
    const marks = g._mapMarkers().filter((m) => m.kind === 'job').length;
    const o = d.orders[1];
    d.trust[o.who] = 3;
    g.dropContract(o);
    return { fourth, marks, left: d.orders.length, trust: d.trust[o.who] };
  }, offers[3].id);
  expect(r.fourth).toBe(false);
  expect(r.marks).toBe(3);
  expect(r.left).toBe(2);
  expect(r.trust).toBe(2);
  expect(problems).toEqual([]);
});

test('a shine order: handed over only after dark, due at dawn, at the grade asked; grade A earns more trust; tainted shine blinds someone and costs most of it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(({ ORDER, VISIT }) => {
    const g = window.shine.game, d = g.dredge.data, order = eval(ORDER), visit = eval(VISIT);
    g.renderer.setAnimationLoop(null);
    const out = {};
    const o = order(g, 'kessler', { wants: { 'corn-shine': 1 }, grade: 'B', night: true, pay: 300, rep: 15 });
    g.dredge.market.clock = 10;                  // ten in the morning, day 0
    g.takeContract(o);
    out.due = d.orders[0].due;
    out.objective = (window.shine.step(0.1), document.getElementById('objective-text').textContent);
    const s = g.trunk.findSpot('corn-shine'); g.trunk.place('corn-shine', s.x, s.y, s.rot);
    // By day: not yet.
    g.env.hour = 12;
    d.market.blend['corn-shine'] = { q: 0.9, bad: false };
    out.day = visit(g, o);
    out.dayKept = d.orders.length;
    // After dark, but the blend's only grade C.
    g.env.hour = 21.5;
    d.market.blend['corn-shine'] = { q: 0.3, bad: false };
    out.low = visit(g, o);
    // Grade A: handed over.
    d.market.blend['corn-shine'] = { q: 0.9, bad: false };
    const cash = d.cash;
    out.good = visit(g, o);
    out.paid = d.cash - cash;
    out.left = d.orders.length;
    out.trust = d.trust.kessler;
    out.dialog = g.ui.isOpen('dialog');
    // Tainted shine: paid, but someone goes blind, and the trust is mostly gone.
    const t = order(g, 'kessler', { wants: { 'corn-shine': 1 }, grade: 'C', night: true, pay: 200, rep: 10 });
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    g.takeContract(t);
    const s2 = g.trunk.findSpot('corn-shine'); g.trunk.place('corn-shine', s2.x, s2.y, s2.rot);
    d.market.blend['corn-shine'] = { q: 0.9, bad: true };
    visit(g, t);
    out.tainted = { trust: d.trust.kessler, blinded: d.stats.blinded, ledger: d.ledger.some((l) => /blinded/.test(l.text)) };
    return out;
  }, { ORDER, VISIT });
  expect(r.due).toBe(30);                                   // the next dawn: 06:00 on day 1
  expect(r.objective).toMatch(/^Order: 1 corn shine \(grade B\+\) for Gus Kessler/);
  expect(r.day).toContain('after dark');
  expect(r.dayKept).toBe(1);
  expect(r.low).toContain('wants grade B or better');
  expect(r.good).toContain('Delivered to Gus Kessler');
  expect(r.paid).toBe(300);
  expect(r.left).toBe(0);
  expect(r.trust).toBe(2);                                  // one for the order, one for grade A
  expect(r.dialog).toBe(true);
  expect(r.tainted.trust).toBe(0);
  expect(r.tainted.blinded).toBe(1);
  expect(r.tainted.ledger).toBe(true);
  expect(problems).toEqual([]);
});

test('trust: a contact who comes to trust Otto opens up at the handoff, and the notebook (B) keeps what they said', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async ({ ORDER, VISIT }) => {
    const g = window.shine.game, d = g.dredge.data, order = eval(ORDER), visit = eval(VISIT);
    const { TRUSTED } = await import('/src/story.js');
    g.renderer.setAnimationLoop(null);
    g.settings.reducedMotion = true;                         // each line whole, to read them
    d.trust.carroll = 5;                                     // level 2; one more order makes 3
    const o = order(g, 'carroll');
    g.takeContract(o);
    const s = g.trunk.findSpot('jugs'); g.trunk.place('jugs', s.x, s.y, s.rot);
    g.env.hour = 12;
    visit(g, o);
    return { trust: d.trust.carroll, scene: d.scenes.carroll, line: TRUSTED.carroll, toast: document.getElementById('toast').textContent };
  }, { ORDER, VISIT });
  expect(r.trust).toBe(6);
  expect(r.scene).toBe(true);
  // The handoff card: her thanks, then what she's never told him.
  const texts = [];
  for (let k = 0; k < 12 && (await page.locator('#dialog').isVisible()); k++) {
    texts.push(await page.locator('#dialog-text').textContent());
    await page.click('#dialog-next');
  }
  expect(texts.join(' ')).toContain(r.line.slice(0, 30));
  // The notebook: from the road with B, and back to the road.
  await page.keyboard.press('b');
  await expect(page.locator('#notebook')).toBeVisible();
  for (const text of ['ORDERS · 0/3', 'CONTACTS', 'Widow Carroll', '★★★☆☆', r.line.slice(0, 30), 'RECIPES', 'Corn Shine', 'CLUES']) await expect(page.locator('#notebook-body')).toContainText(text);
  await page.click('#notebook-done');
  await expect(page.locator('#notebook')).toBeHidden();
  expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');
  // ...and from the pause menu.
  await page.keyboard.press('Escape');
  await page.click('#pause-notebook');
  await expect(page.locator('#notebook')).toBeVisible();
  await page.click('#notebook-done');
  await expect(page.locator('#pause')).toBeVisible();
  expect(problems).toEqual([]);
});

test('Sheriff Hale: once he trusts Otto, a bust out in the county goes away for a price; in the city the Bureau answers to no sheriff', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    g.renderer.setAnimationLoop(null);
    const load = () => { g.trunk.clear(); const s = g.trunk.findSpot('corn-shine'); g.trunk.place('corn-shine', s.x, s.y, s.rot); };
    d.trust.sheriff = 6;
    d.cash = 1000;
    load();
    g.player.place(0, -600, 0);
    g._bust('The Bureau boxed you in.');
    const county = { cash: d.cash, shine: g._contraband(), at: g.player.position.z, who: document.getElementById('dialog-name').textContent, ledger: d.ledger[0].text };
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    load();
    d.cash = 1000;
    g.player.place(0, 60, 0);
    g._bust('The Bureau boxed you in.');
    return { county, city: { cash: d.cash, shine: g._contraband() } };
  });
  expect(r.county.cash).toBe(625);                         // 1.5 x the fine
  expect(r.county.shine).toBe(1);                          // the shine stays aboard
  expect(r.county.at).toBe(-600);                          // no waking at the barn
  expect(r.county.who).toBe('Sheriff Hale');
  expect(r.county.ledger).toContain('Sheriff Hale');
  expect(r.city).toEqual({ cash: 750, shine: 0 });
  expect(problems).toEqual([]);
});
