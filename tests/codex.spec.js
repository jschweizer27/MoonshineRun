import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT } from './helpers.js';

// Stage 9a, after DREDGE: the notebook's finds (codex.js), the odd variants (?test&odd),
// the collectors' rewards, and upgrades that take salvaged parts.

test('odd variants: a night site worked well gives them up in place of the usual piece, they go in the notebook, and each kind’s best price is kept', async ({ page }) => {
  const problems = await openGame(page, '&odd');
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { oddify, ODD } = await import('/src/codex.js');
    const out = {
      night: oddify(['coil', 'crate', 'keg'], { night: true }, 0.9, { rng: () => 0.1 }),
      day: oddify(['coil', 'crate', 'keg'], { night: false }, 0.9, { rng: () => 0.1 }),
      eye: oddify(['coil'], { night: false }, 0.9, { rng: () => 0.05, eye: true }),
    };
    // At a site: every piece that has a variant turns odd (a certain roll).
    g._oddRng = () => 0;
    const siding = g.salvage.sites.find((s) => s.kind === 'siding');
    g.pause({ showMenu: false });
    g._onSalvaged(siding, 0.95);
    const got = [g.trunkScreen.hand?.kind, ...(g._pending || [])];
    out.site = { got, plain: got.filter((k) => ODD[k]).length };
    for (let k = 0; k < 6 && g.trunkScreen.isOpen; k++) g.trunkScreen.close();
    clear();
    out.log = g.hud.log.join(' | ');
    // Sold: its best price kept.
    g.trunk.clear();
    const s = g.trunk.findSpot('odd-coil'); g.trunk.place('odd-coil', s.x, s.y, s.rot);
    g._finds(['odd-coil']);
    g.openMarket(window.shine.game._nearestMarket().town);
    document.getElementById('market-sell-all').click();
    out.best = d.codex['odd-coil'].best;
    clear();
    return out;
  }, KIT);
  expect(r.night).toEqual(['odd-coil', 'crate', 'odd-keg']);
  expect(r.day).toEqual(['coil', 'crate', 'keg']);
  expect(r.eye).toEqual(['odd-coil']);
  expect(r.site.plain).toBe(0);
  expect(r.best).toBeGreaterThan(100);
  await page.evaluate(() => window.shine.game.openNotebook());
  await expect(page.locator('#notebook-body')).toContainText('FINDS');
  await expect(page.locator('#notebook-body')).toContainText('Braun & Sons coil');
  await expect(page.locator('#notebook-body')).toContainText('? (an odd sewing machine)');   // a siding never gives one up
  expect(problems).toEqual([]);
});

test('the collectors: every kind a site kind gives up pays once, and every odd variant earns the collector’s eye', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d } = eval(KIT);
    const { setOf, ODDS } = await import('/src/codex.js');
    d.cash = 0;
    g._finds(setOf('cellar'));
    const out = { cash: d.cash, flag: !!d.flags['set:cellar'], ledger: d.ledger[0].text };
    g._finds(setOf('cellar'));
    out.again = d.cash;
    g._finds(ODDS);
    out.eye = !!d.tools.eye;
    out.log = g.hud.log.join(' | ');
    return out;
  }, KIT);
  expect(r).toMatchObject({ cash: 250, flag: true, again: 250, eye: true });
  expect(r.ledger).toContain('back-alley cellar');
  expect(r.log).toContain('the collector’s eye');
  expect(problems).toEqual([]);
});

test('the later upgrade levels take parts: the market says what’s needed, the button waits for them, and buying takes them from the barn’s stash first', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const open = () => page.evaluate((KIT) => {
    const { g, clear } = eval(KIT);
    clear();
    g.openMarket(g._nearestMarket().town);
  }, KIT);
  await page.evaluate(() => { const d = window.shine.game.dredge.data; d.cash = 5000; d.upgrades.engine = 2; d.stash = {}; window.shine.game.trunk.clear(); });
  await open();
  const row = page.locator('[data-id="up-engine"]');
  await expect(row).toBeDisabled();
  await expect(page.locator('.upgrade', { has: row })).toContainText('Needs 1 copper coil: short of 1 copper coil');
  await page.evaluate(() => { const g = window.shine.game, d = g.dredge.data; d.stash.coil = 1; const s = g.trunk.findSpot('coil'); g.trunk.place('coil', s.x, s.y, s.rot); });
  await open();
  await expect(page.locator('.upgrade', { has: row })).toContainText('on hand');
  await row.click();
  const r = await page.evaluate(() => { const g = window.shine.game, d = g.dredge.data; return { level: d.upgrades.engine, stash: d.stash.coil || 0, trunk: [...g.trunk.pieces.values()].filter((p) => p.kind === 'coil').length, cash: d.cash }; });
  expect(r).toEqual({ level: 3, stash: 0, trunk: 1, cash: 5000 - 1900 });
  expect(problems).toEqual([]);
});
