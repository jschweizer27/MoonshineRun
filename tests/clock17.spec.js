import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 17 (the bug hunt): the clock. A sleep from the small hours brings its dawn; a sleep
// past a by-dawn order warns first; the dawn guard is the save's; winter coming in the night
// moves the night's orders to winter's dawn; a night site counts by the night; the big map
// doesn't run the game's clock; a short nap steadies the nerves by its share; the freight stands
// for all of its hours.

test('sleeping till morning from the small hours brings that dawn, once (summer and winter); a short nap steadies the nerves by its share', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const nap = (KIT) => page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    let dawns = 0;
    const was = g._dawn.bind(g);
    g._dawn = () => { dawns++; was(); };
    const out = [];
    for (const h of [2.3, 4.1, 0.7]) {
      const day = Math.floor(d.market.clock / 24) + 1;
      g.env.hour = h; d.market.clock = day * 24 + h;
      await g.sleep('morning');
      clear();
      window.shine.step(0.2);
      out.push({ dawns, hour: g.env.hour });
      dawns = 0;
    }
    g._dawn = was;
    return out;
  }, KIT);
  const summer = await nap(KIT);
  expect(summer).toEqual([{ dawns: 1, hour: 6 }, { dawns: 1, hour: 6 }, { dawns: 1, hour: 6 }]);
  // A nap: 1.5 hours steadies a frayed Otto by a quarter (6 hours is a whole night's).
  const short = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    g.env.hour = 4.5; d.market.clock = Math.floor(d.market.clock / 24) * 24 + 4.5; d.nerves = 0.2;
    await g.sleep('morning');
    clear();
    return Math.round(d.nerves * 100) / 100;
  }, KIT);
  expect(short).toBe(0.45);
  await past(page, 5);
  await page.evaluate(() => window.shine.game._applyWinter());
  const winter = await nap(KIT);
  expect(winter).toEqual([{ dawns: 1, hour: 7 }, { dawns: 1, hour: 7 }, { dawns: 1, hour: 7 }]);
  expect(problems).toEqual([]);
});

test('sleeping past a "by dawn" order asks first; the dawn guard is the save’s (a new game gets its own first dawn)', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await page.evaluate(async (KIT) => {
    const { g, d } = eval(KIT);
    const { nextDawn } = await import('/src/contracts.js');
    const o = g._jobs().offers()[0];
    g.env.hour = 21.5; d.market.clock = 21.5;
    g.takeContract({ ...o, night: true });
    d.orders[0].due = nextDawn(d.market.clock);
    g.pause({ showMenu: false });
    window.__slept = g.sleep('morning');
  }, KIT);
  await expect(page.locator('#confirm-text')).toContainText('late');
  await page.click('#confirm-no');
  expect(await page.evaluate(async () => { const slept = await window.__slept; return { slept, orders: window.shine.game.dredge.data.orders.length }; })).toEqual({ slept: false, orders: 1 });
  // One dawn a day for this save; a fresh save's day 1 has its own.
  const r = await page.evaluate((KIT) => {
    const { g, d, clear } = eval(KIT);
    clear();
    let dawns = 0;
    const was = g._dawn.bind(g);
    g._dawn = () => { dawns++; was(); };
    d.market.clock = 30; g._dawnOnce(); g._dawnOnce();
    const first = dawns;
    g.dredge.data.once = {};                    // (what a new game's save starts with)
    g._dawnOnce();
    g._dawn = was;
    return { first, fresh: dawns, saved: g.dredge.data.once.dawn };
  }, KIT);
  expect(r).toEqual({ first: 1, fresh: 2, saved: 1 });
  expect(problems).toEqual([]);
});

test('winter coming in the night moves the night’s orders to winter’s dawn; a night site worked before midnight isn’t back at midnight; the big map stops the clock', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 4);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    clear();
    const { nextDawn } = await import('/src/contracts.js');
    const day = Math.floor(d.market.clock / 24) + 1;
    g.env.hour = 22; d.market.clock = day * 24 + 22;
    const o = g._jobs().offers()[0];
    g.takeContract({ ...o, night: true });
    d.orders[0].due = nextDawn(d.market.clock);
    const before = d.orders[0].due % 24;
    d.chapter = 5; g._applyWinter();
    const out = { before, after: d.orders[0].due % 24 };
    // A night site worked at 23:30: still picked clean at 00:30 (the same night).
    const site = g.salvage.sites.find((s) => s.night && !s.story);
    g.salvage.worked(site, day, 23.5);
    out.midnight = g.salvage.status(site, day + 1, 0.5);
    out.later = [g.salvage.status(site, day + 3, 22), g.salvage.status(site, day + 3, 2)];
    return out;
  }, KIT);
  expect(r).toEqual({ before: 6, after: 7, midnight: 'empty', later: ['ok', 'ok'] });
  // The big map: the game's clock (abilities, phantoms) stands still under it.
  const map = await page.evaluate(async () => {
    const g = window.shine.game;
    g.renderer.setAnimationLoop(() => g._loop());
    const t0 = g.time;
    g.openMap();
    await new Promise((res) => setTimeout(res, 600));
    const t1 = g.time;
    g.ui.close('map');
    return { open: t1 - t0 };
  });
  expect(map.open).toBe(0);
  expect(problems).toEqual([]);
});

test('the midnight freight stands at the siding for all of its hours (it rolls in before them and out after)', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const { CONFIG } = await import('/src/config.js');
    const g = window.shine.game, R = g.railway, [a, b] = CONFIG.dredge.story.freight.window;
    g.renderer.setAnimationLoop(null);
    const at = (hour) => { g.env.hour = hour; window.shine.step(0.1); return R.here; };
    return { opens: at(a + 0.02), closes: at(b - 0.02), after: at(b + 0.5) };
  });
  expect(r).toEqual({ opens: true, closes: true, after: false });
  expect(problems).toEqual([]);
});
