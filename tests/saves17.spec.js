import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, reloadGame, past } from './helpers.js';

// Stage 17 (the bug hunt): saves. A save made on an older build loads with what its finished
// chapters and old rank give now, with steps added since filled in behind it, and chapter 8's
// raid put right; old key bindings don't give one key two actions; pieces still to pack come
// back after a reload; a story order taken on an older build has its step's terms now; a page
// closed on a chase costs what quitting on it would; a page closed on a story card plays it
// again; erasing the game in use leaves no winter on the title.

test('an older save: its closed chapters give their tools and recipes now, its old rank its abilities, added steps are filled in, the raid is put right', async ({ page }) => {
  const problems = await openGame(page);
  const r = await page.evaluate(async () => {
    const { DredgeCareer } = await import('/src/dredgecareer.js');
    const load = (data) => { localStorage.setItem('shine.dredge.v1.s3', JSON.stringify(data)); return new DredgeCareer(3).data; };
    // A v4 Brewer (rank 3) who'd closed chapter 6 before chapters 5 and 6 had their tools.
    const a = load({ version: 1, started: true, chapter: 6, rank: 3, steps: {}, flags: {}, tools: { coil: true } });
    // Mid-chapter 3 with the freight done but not Walt Purdy (added ahead of it since).
    const b = load({ version: 1, started: true, chapter: 2, steps: { 'mags-trust': true, freight: true }, flags: {}, tools: {} });
    // Chapter 8 reloaded under the raid's cards on an older build.
    const c = load({ version: 1, started: true, chapter: 7, steps: { warn: true, hollow: true, brauns: true, raid: true }, flags: { raidHome: true }, tools: {} });
    localStorage.removeItem('shine.dredge.v1.s3');
    return {
      tools: ['wind', 'smoke', 'leadfoot', 'sweet', 'falsebottom', 'policeband'].map((t) => !!a.tools[t]),
      learned: ['lager', 'rye', 'applejack'].map((k) => !!a.flags[`learned:${k}`]), gifts: !!a.flags['gift:orourke'] && !!a.flags['gift:abernathy'],
      purdy: !!b.steps.purdy, waybills: !!b.steps.waybills,
      raid: [!!c.flags['ambush:raid'], !!c.flags['escaped:raid']],
    };
  });
  expect(r).toEqual({ tools: [true, true, true, true, true, true], learned: [true, true, true], gifts: true, purdy: true, waybills: false, raid: [true, true] });
  expect(problems).toEqual([]);
});

test('old key bindings: a dropped action goes, and a new action’s key is left off when the player gave it to something else', async ({ page }) => {
  const problems = await openGame(page);
  const r = await page.evaluate(async () => {
    const { loadSettings } = await import('/src/settings.js');
    const key = 'shine.settings.v1', had = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify({ bindings: { ability1: ['Digit1'], horn: ['Digit4'] } }));
    const s = loadSettings();
    if (had != null) localStorage.setItem(key, had); else localStorage.removeItem(key);
    return { ability1: s.bindings.ability1 ?? null, horn: s.bindings.horn, ability4: s.bindings.ability4, ability5: s.bindings.ability5 };
  });
  expect(r).toEqual({ ability1: null, horn: ['Digit4'], ability4: [], ability5: ['Digit5'] });
  expect(problems).toEqual([]);
});

test('pieces still to pack come back after a reload (nothing paid for or collected is lost)', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await page.evaluate((KIT) => {
    const { g, clear } = eval(KIT);
    clear();
    g.trunk.clear(); g.dredge.saveTrunk(g.trunk);
    g._give(['keg', 'barrel', 'coil']);
  }, KIT);
  await expect(page.locator('#trunk')).toBeVisible();
  // Pack the keg, then leave before the rest.
  await page.evaluate(() => { const g = window.shine.game, s = g.trunkScreen, sp = g.trunk.findSpot(s.hand.kind); s.cursor = { x: sp.x, y: sp.y }; s.hand.rot = sp.rot; s.confirm(); s.close(); });
  expect(await page.evaluate(() => window.shine.game.dredge.data.pending)).toEqual(['barrel', 'coil']);
  await reloadGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => { const g = window.shine.game; return { open: g.ui.top?.id, hand: g.trunkScreen.hand?.kind, pending: g.dredge.data.pending, keg: [...g.trunk.pieces.values()].some((p) => p.kind === 'keg') }; });
  expect(r).toEqual({ open: 'trunk', hand: 'barrel', pending: ['barrel', 'coil'], keg: true });
  // Packed (or left), the queue empties.
  const done = await page.evaluate((KIT) => { const { pack } = eval(KIT); pack(); return window.shine.game.dredge.data.pending; }, KIT);
  expect(done).toEqual([]);
  expect(problems).toEqual([]);
});

test('a story order taken on an older build has the step’s terms as they stand now', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 3);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { CONFIG } = await import('/src/config.js');
    clear();
    Object.assign(d.steps, { consignment: true }); d.flags.consignment = true;
    g._storyOrders();
    const o = d.orders.find((x) => x.story === 'run');
    delete o.fragile; o.pay = 1; o.night = false;           // (as an older build wrote it)
    g._storyOrders();
    return { fragile: o.fragile, pay: o.pay, night: o.night, want: CONFIG.dredge.story.run.pay };
  }, KIT);
  expect({ fragile: r.fragile, night: r.night }).toEqual({ fragile: true, night: true });
  expect(r.pay).toBe(r.want);
  expect(problems).toEqual([]);
});

test('a page closed on a chase is a bust, as quitting on it is; a chase paused and taken up again isn’t', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const before = await page.evaluate((KIT) => {
    const { g, d, shine, clear } = eval(KIT);
    clear();
    d.cash = 1000; shine(3);
    g.dredge.saveTrunk(g.trunk);
    g.police.alert(g.player.position, 1, { hold: 30 });
    g.pause({ showMenu: false });
    const paused = !!d.chase;
    g.resume();
    const resumed = d.chase;
    g.pause();                                        // (and the page is closed)
    return { paused, resumed, busts: d.stats.busts || 0 };
  }, KIT);
  expect(before).toEqual({ paused: true, resumed: null, busts: 0 });
  await reloadGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    return { busts: d.stats.busts || 0, shine: g._contraband(), fined: d.cash < 1000, chase: d.chase, tier: g.police.tier };
  });
  expect(r).toEqual({ busts: 1, shine: 0, fined: true, chase: null, tier: 0 });
  expect(problems).toEqual([]);
});

test('a page closed on a story card plays it again (it’s marked played once it has shown)', async ({ page }) => {
  const problems = await openGame(page, '&story');
  await page.click('#start-btn');
  await expect(page.locator('#dialog')).toBeVisible();
  expect(await page.evaluate(() => !!window.shine.game.dredge.data.story.prologue)).toBe(false);
  await reloadGame(page);
  await page.click('#start-btn');
  await expect(page.locator('#dialog')).toBeVisible();
  await page.click('#dialog-skip');
  expect(await page.evaluate(() => !!window.shine.game.dredge.data.story.prologue)).toBe(true);
  expect(problems).toEqual([]);
});

test('erasing the game in use from the title puts the title back to a new game’s (no winter left behind)', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 5);
  await page.evaluate(() => { const g = window.shine.game; g._applyWinter(); g.dredge.save(); g.quitToTitle(); });
  expect(await page.evaluate(() => window.shine.game.env.winter)).toBe(true);
  const slot = await page.evaluate(() => window.shine.game.dredge.slot);
  await page.click('#intro-saves');
  await page.click(`#slots [data-id="slot-erase-${slot}"]`);
  await page.click('#confirm-yes');
  expect(await page.evaluate(() => window.shine.game.env.winter)).toBe(false);
  expect(problems).toEqual([]);
});
