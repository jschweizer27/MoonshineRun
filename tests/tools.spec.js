import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

// Ranks became trust and tools: what Otto earns comes from the people who trust him, and the
// truck's better upgrades from how far the story has gone.

test('trust and tools: Gus Kessler teaches Barrel Rye, Mags O’Rourke gives Lead Foot and Mr. Abernathy Sweet Talk, each once, at three stars; upgrade levels 4 and 5 and the later upgrades come with the chapters', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data, chips = () => [...document.querySelectorAll('#abilities .ability')].map((b) => b.dataset.id);
    const out = { start: { chips: chips(), rye: !!d.flags['learned:rye'], refused: g.useAbility('leadfoot') } };
    d.trust.kessler = 4; d.trust.orourke = 4;           // two stars: nothing yet
    out.two = g._trustGifts();
    d.trust.kessler = 6; d.trust.orourke = 6; d.trust.abernathy = 6;
    out.three = g._trustGifts();
    out.again = g._trustGifts();
    out.after = { chips: chips(), rye: !!d.flags['learned:rye'], tools: Object.keys(d.tools).sort() };
    return out;
  });
  expect(r.start).toEqual({ chips: [], rye: false, refused: false });
  expect(r.two).toEqual([]);
  expect(r.three).toEqual(['Gus Kessler taught you Barrel Rye.', 'Mags O’Rourke gave you Lead Foot (2, or the chip by the speedometer).', 'Mr. Abernathy gave you Sweet Talk (3, or the chip by the speedometer).']);
  expect(r.again).toEqual([]);
  expect(r.after).toEqual({ chips: ['leadfoot', 'sweet'], rye: true, tools: ['leadfoot', 'sweet'] });
  // Upgrade levels 4 and 5 wait on chapters 3 and 5; the later upgrades on 2 and 3.
  const up = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    d.chapter = 1; d.upgrades.engine = 3; d.cash = 100000;
    const locked = g.dredge.lockedChapter('engine'), refused = g.dredge.buy('engine');
    d.chapter = 2;
    const open = g.dredge.lockedChapter('engine'), bought = g.dredge.buy('engine');
    const later = ['tyres', 'lamps', 'plating'].map((id) => g.dredge.lockedChapter(id));
    return { locked, refused, open, bought, level: d.upgrades.engine, later };
  });
  expect(up).toEqual({ locked: 2, refused: false, open: null, bought: true, level: 4, later: [null, null, null] });
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.chapter = 0; g.dredge.data.upgrades.engine = 3; window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market [data-id="up-engine"]')).toHaveText('IN CHAPTER 3');
  await expect(page.locator('#market [data-id="up-engine"]')).toBeDisabled();
  expect(problems).toEqual([]);
});

test('the tools: Lead Foot opens the engine up for a while, Sweet Talk sweetens one sale, and the Spotter’s top level shows every salvage site', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    d.tools.leadfoot = d.tools.sweet = true; g._buildAbilities();
    const sites = () => g._mapMarkers().filter((m) => m.kind.startsWith('site')).length;
    const radar0 = sites();
    d.upgrades.spotter = 5; g._applyPerks();
    const radar1 = sites();
    const top0 = g.player.t.maxSpeed;
    g.useAbility('leadfoot');
    const top1 = g.player.t.maxSpeed, again = g.useAbility('leadfoot');      // cooling down
    g.loot.active.fill(0); g.loot.timer.fill(1e9); g.loot.rareIn = 1e9;
    window.shine.step(7);
    const top2 = g.player.t.maxSpeed;
    const chip = document.querySelector('#abilities [data-id="leadfoot"]').textContent;
    return { radar0, radar1, all: g.salvage.sites.filter((s) => !s.story).length, again, top0, top1, top2, chip };
  });
  expect(r.radar1).toBeGreaterThan(r.radar0);
  expect(r.radar1).toBe(r.all);
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
