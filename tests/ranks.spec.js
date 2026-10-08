import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

const rankAt = (page, rep) => page.evaluate((rep) => { const g = window.shine.game; g.dredge.data.rep = 0; g.dredge.data.rank = 0; g._addRep(rep); return { rank: g.dredge.data.rank, toast: document.getElementById('toast').textContent }; }, rep);

test('ranks: reputation lifts Otto through them, each unlocking recipes, upgrade levels and abilities', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  // Nothing at the start: no ability chips, applejack locked, level 4 of an upgrade locked.
  let s = await page.evaluate(() => ({ chips: document.querySelectorAll('#abilities .ability').length }));
  expect(s.chips).toBe(0);
  let r = await rankAt(page, 35);
  expect(r.rank).toBe(1);
  expect(r.toast).toContain('New rank: Scavenger');
  s = await page.evaluate(() => [...document.querySelectorAll('#abilities .ability')].map((b) => b.textContent));
  expect(s).toEqual(['1 · Jockey’s Tip · ready']);
  r = await rankAt(page, 500);
  expect(r.rank).toBe(5);
  s = await page.evaluate(() => [...document.querySelectorAll('#abilities .ability')].map((b) => b.dataset.id));
  expect(s).toEqual(['tip', 'leadfoot', 'sweet']);

  // Upgrade levels 4 and 5 wait on rank.
  const up = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    d.rank = 1; d.upgrades.engine = 3; d.cash = 100000;
    const locked = g.dredge.lockedRank('engine'), refused = g.dredge.buy('engine');
    d.rank = 2;
    const open = g.dredge.lockedRank('engine'), bought = g.dredge.buy('engine');
    const newOnes = ['tyres', 'lamps', 'plating'].map((id) => g.dredge.lockedRank(id));
    return { locked, refused, open, bought, level: d.upgrades.engine, newOnes };
  });
  expect(up).toEqual({ locked: 2, refused: false, open: null, bought: true, level: 4, newOnes: [null, null, null] });
  // The market shows a locked level by the rank it needs.
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.rank = 0; g.dredge.data.upgrades.engine = 3; window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market [data-id="up-engine"]')).toHaveText('AT RUNNER');
  await expect(page.locator('#market [data-id="up-engine"]')).toBeDisabled();
  expect(problems).toEqual([]);
});

test('abilities: the Jockey’s Tip shows every salvage site, Lead Foot opens the engine up for a while, Sweet Talk sweetens one sale', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    d.rank = 5; g._buildAbilities();
    const radar0 = g._mapMarkers().filter((m) => m.kind.startsWith('site')).length;
    g.useAbility('tip');
    const radar1 = g._mapMarkers().filter((m) => m.kind.startsWith('site')).length;
    const again = g.useAbility('tip');                 // cooling down
    const top0 = g.player.t.maxSpeed;
    g.useAbility('leadfoot');
    const top1 = g.player.t.maxSpeed;
    g.loot.active.fill(0); g.loot.timer.fill(1e9); g.loot.rareIn = 1e9;
    window.shine.step(7);
    const top2 = g.player.t.maxSpeed;
    const chip = document.querySelector('#abilities [data-id="leadfoot"]').textContent;
    return { radar0, radar1, again, top0, top1, top2, chip, active: g.loot.active.length };
  });
  expect(r.radar1).toBeGreaterThan(r.radar0);
  expect(r.radar1).toBe(23);
  expect(r.again).toBe(false);
  expect(r.top1).toBeCloseTo(r.top0 * 1.25, 5);
  expect(r.top2).toBeCloseTo(r.top0, 5);
  expect(r.chip).toMatch(/^2 · Lead Foot · \d+s$/);

  // Sweet Talk: the next sale pays 20% more, once.
  const s = await page.evaluate(async () => {
    const { quote } = await import('/src/market.js');
    const g = window.shine.game;
    g.trunk.place('keg', 0, 0);
    const plain = quote('baltimore', g.trunk, g.dredge.market).total;
    g.useAbility('sweet');
    return { plain, cash: g.dredge.cash };
  });
  await page.evaluate(() => { window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await page.click('#market-sell-all');
  const after = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, sweet: window.shine.game._sweet }));
  expect(after.cash - s.cash).toBe(s.plain + Math.round(s.plain * 0.2));
  expect(after.sweet).toBe(false);
  expect(problems).toEqual([]);
});

test('the ending: at the top rank, the Braun & Sons deed is for sale at Lexington Market, and buying it plays the last beat', async ({ page }) => {
  const problems = await openGame(page, '&story');
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.started = true; g.dredge.data.story = { prologue: true, valley: true, rare: true, temperance: true, still: true, contacts: true, quarry: true, sheriff: true, betrayal: true }; g.dredge.data.opened = { ashes: true }; });
  await page.click('#start-btn');
  // Not before the top rank.
  await page.evaluate(() => { window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market [data-id="deed"]')).toHaveCount(0);
  await page.click('#market-done');
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.rank = 5; g.dredge.data.cash = 25000; window.shine.teleport(-44, 120, 0); window.shine.step(0.2); window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market [data-id="deed"]')).toHaveText('BUY $20,000');
  await page.click('#market [data-id="deed"]');
  await page.click('#confirm-yes');
  const d = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, deed: window.shine.game.dredge.data.flags.deed }));
  expect(d).toEqual({ cash: 5000, deed: true });
  await expect(page.locator('#market [data-id="deed"]')).toHaveCount(0);
  await page.click('#market-done');
  await page.evaluate(() => window.shine.step(0.6));
  await expect(page.locator('#dialog')).toBeVisible();
  const seen = [];
  for (let k = 0; k < 12 && await page.locator('#dialog').isVisible(); k++) { seen.push(await page.locator('#dialog-text').textContent()); await page.click('#dialog-next'); }
  expect(seen.join(' ')).toContain('ACT II');
  await page.evaluate(() => window.shine.game.quitToTitle());
  await expect(page.locator('#intro-best')).toContainText('Braun & Sons is yours again');
  expect(problems).toEqual([]);
});
