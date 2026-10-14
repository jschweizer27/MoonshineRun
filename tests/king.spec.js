import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 13: chapter 9, King of York Road, Vail's rivals (hijackers, cleared sites, the Black
// Car on the barest nerves) and the third ending, the crown.

test('chapter 9, King of York Road: Ruby’s tip, a load past Vail’s men, Vail at the bank by day; then the choice, and the rivals are gone', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 8);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear, visit, objective, shine } = eval(KIT);
    step(); clear(); step();
    const out = { rivals: g._rivalsOn() };
    g.env.hour = 22;
    let o = d.orders.find((x) => x.story === 'ruby-tip');
    visit(o.x, o.z); clear(); step(); clear(); step();
    out.tip = !!d.flags['order:ruby-tip'];
    shine(4);
    o = d.orders.find((x) => x.story === 'convoy');
    visit(o.x, o.z); clear(); step(); clear(); step();
    out.convoy = !!d.flags['order:convoy'];
    o = d.orders.find((x) => x.story === 'vail');
    out.vail = { name: o.name, place: o.place, window: o.window };
    g.env.hour = 12;
    visit(o.x, o.z); clear(); step(); clear(); step();
    out.done = { chapter: d.chapter, rivals: g._rivalsOn(), clue: !!d.clues.auction, objective: objective() };
    return out;
  }, KIT);
  expect(r.rivals).toBe(true);
  expect(r.tip).toBe(true);
  expect(r.convoy).toBe(true);
  expect(r.vail).toEqual({ name: 'Cyrus Vail', place: 'the Towson National Bank', window: [10, 15] });
  expect(r.done).toEqual({ chapter: 9, rivals: false, clue: true, objective: 'The choice: buy back the deed at Lexington Market, or take the letters to the Sun' });
  expect(problems).toEqual([]);
});

test('Vail’s men: by night in the county with a load aboard they come without sirens; boxed in, they take half the shine and no fine; lost, they’re gone; at dawn his trucks clear two sites', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, shine } = eval(KIT);
    clear();
    g.player.place(0, -600, 0);
    shine(4); d.cash = 1000;
    g.env.hour = 22; g.env.hoursPerSecond = 0.025; g._rivalRng = () => 0;
    g._rivals(1 / 60, true);
    const out = { on: !!g._hijackOn, tier: g.police.tier };
    // Boxed in: half the load goes, no fine, no waking at the barn.
    g._onPolice({ type: 'bust' }); clear();
    out.hijack = { aboard: g._contraband(), cash: d.cash, at: Math.round(g.player.position.z), on: !!g._hijackOn, tier: g.police.tier };
    // Again, and this time lost: the load stays.
    shine(4);
    g._rivals(1 / 60, true);
    g._onPolice({ type: 'clear' }); clear();
    out.lost = { aboard: g._contraband(), on: !!g._hijackOn, log: g.hud.log.join(' | ') };
    // Not in the city, not with a small load, not before chapter 6.
    g._hijackOn = false; g.police.reset();
    g.player.place(0, 0, 0); g._rivals(1 / 60, true); out.city = !!g._hijackOn;
    // At dawn, two open sites picked clean by his trucks.
    g.police.reset();
    const before = g.salvage.sites.filter((s) => !s.story && g.salvage.status(s, Math.floor(d.market.clock / 24), 12) === 'ok').length;
    g.pause({ showMenu: false }); g._dawn(); clear();
    const day = Math.floor(d.market.clock / 24);
    out.cleared = before - g.salvage.sites.filter((s) => !s.story && g.salvage.status(s, day, 12) === 'ok').length;
    return out;
  }, KIT);
  expect(r.on).toBe(true);
  expect(r.tier).toBe(2);
  expect(r.hijack).toEqual({ aboard: 2, cash: 1000, at: -600, on: false, tier: 0 });
  expect(r.lost.aboard).toBe(4);
  expect(r.lost.on).toBe(false);
  expect(r.lost.log).toContain('You shook Vail’s men');
  expect(r.city).toBe(false);
  expect(r.cleared).toBe(2);
  expect(problems).toEqual([]);
});

test('the crown: with the operation running and half the city at ★★★, the courthouse steps at Towson open as a third ending', async ({ page }) => {
  const problems = await openGame(page, '&story');
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.started = true; g.dredge.data.story = { prologue: true, valley: true, rare: true, temperance: true, still: true, contacts: true, quarry: true, sheriff: true }; });
  await past(page, 9);
  const without = await page.evaluate(async () => {
    const { openSites, crownReady } = await import('/src/chapters.js');
    const d = window.shine.game.dredge.data;
    return { ready: crownReady(d), crown: !!openSites(d).crown };
  });
  expect(without).toEqual({ ready: false, crown: false });
  await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    Object.assign(d.flags, { betrayed: true, hollowStill: true, brauns: true });
    for (const w of ['kessler', 'orourke', 'abernathy', 'romano', 'hummel']) d.trust[w] = 6;
    for (const id of ['key', 'pad', 'labels', 'note', 'wedding', 'band']) d.arcs[id] = { open: true, done: true };   // (their stories told)
    g.settings.reducedMotion = true;
  });
  await page.click('#start-btn');
  const crown = await page.evaluate(() => { const g = window.shine.game; window.shine.step(0.6); return { site: g.salvage.sites.find((s) => s.story === 'crown'), objective: document.getElementById('objective-text').textContent }; });
  expect(crown.objective).toBe('The choice: buy back the deed at Lexington Market, or take the letters to the Sun, or take the crown at Towson');
  await page.evaluate((s) => { window.shine.teleport(s.stopX + 30, s.stopZ, 0); window.shine.step(0.2); window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.3); }, crown.site);
  await expect(page.locator('#confirm')).toBeVisible();
  await expect(page.locator('#confirm-text')).toContainText('Vail’s routes');
  await page.click('#confirm-yes');
  for (let k = 0; k < 12 && await page.locator('#dialog').isVisible(); k++) await page.click('#dialog-next');
  await expect(page.locator('#ending')).toBeVisible();
  await expect(page.locator('#ending-title')).toHaveText('THE CROWN');
  await expect(page.locator('#ending-stats')).toContainText('Clues found9/9');
  expect(await page.evaluate(() => window.shine.game.dredge.data.ending)).toBe('crown');
  expect(problems).toEqual([]);
});
