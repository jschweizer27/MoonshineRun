import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 12: chapter 8, The Crackdown, and the operation it leaves Otto with: the hidden still,
// Braun's, and Barrel Rye ageing in the stash.

test('chapter 8, The Crackdown: warn Gus, a hidden still in the hollow, Braun’s in the old cellar, the raid at the barn and away; then the choice', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 7);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear, visit, objective } = eval(KIT);
    const put = (k, n = 1) => { for (let i = 0; i < n; i++) { const s = g.trunk.findSpot(k); g.trunk.place(k, s.x, s.y, s.rot); } };
    step(); clear(); step();
    const out = { open: objective() };
    g.env.hour = 22;
    const gus = g.contactList.find((c) => c.who === 'kessler');
    visit(gus.x, gus.z);
    clear(); step(); clear(); step();
    out.warned = !!d.flags['order:warn'];
    // The hollow: short of the makings, it says so; with them, the still goes up.
    const hollow = g.salvage.sites.find((s) => s.story === 'hollow');
    g.trunk.clear();
    g.pause({ showMenu: false }); g._storySalvaged(hollow, 1); clear();
    out.short = g.hud.log.at(-1);
    put('coil'); put('barrel');
    g.pause({ showMenu: false }); g._storySalvaged(hollow, 1); clear(); step(); clear(); step();
    out.hollow = { flag: !!d.flags.hollowStill, left: g.trunk.count };
    // Braun's: four crates of Otto's own shine go into its cellar.
    const brauns = g.salvage.sites.find((s) => s.story === 'brauns');
    put('corn-shine', 3); put('applejack', 1);
    g.pause({ showMenu: false }); g._storySalvaged(brauns, 1); clear(); step(); clear(); step();
    out.brauns = { flag: !!d.flags.brauns, stock: { ...d.brauns }, trunk: g.trunk.count };
    // The raid: home to the barn after dark.
    const h = g.world.home;
    window.shine.teleport(h.stopX, h.stopZ + 40, 0); step(0.2); window.shine.teleport(h.stopX, h.stopZ, 0); step(0.3);
    out.barnOpen = g.ui.isOpen('barn');
    clear(); step(); clear(); step(); clear(); step();
    out.done = { raid: !!d.flags.raidHome, away: !!d.flags['escaped:raid'], tool: !!d.tools.hollow, clue: !!d.clues.warrant, chapter: d.chapter, objective: objective() };
    return out;
  }, KIT);
  expect(r.open).toBe('Call on Gus Kessler at Highlandtown Speakeasy · tonight');
  expect(r.warned).toBe(true);
  expect(r.short).toBe('Bring 1 copper coil and 1 barrel.');
  expect(r.hollow).toEqual({ flag: true, left: 0 });
  expect(r.brauns).toEqual({ flag: true, stock: { 'corn-shine': 3, applejack: 1 }, trunk: 0 });
  expect(r.barnOpen).toBe(false);                              // the Bureau, not the barn
  expect(r.done).toEqual({ raid: true, away: true, tool: true, clue: true, chapter: 8, objective: 'The choice: buy back the deed at Lexington Market, or take the letters to the Sun' });
  expect(problems).toEqual([]);
});

test('the raid springs a trap with the agents on: every car comes, and losing them is getting away', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 7);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear } = eval(KIT);
    Object.assign(d.flags, { 'order:warn': true, hollowStill: true, brauns: true });
    step(); clear(); step();
    g.env.hour = 22;
    const h = g.world.home;
    window.shine.teleport(h.stopX, h.stopZ + 40, 0); step(0.2); window.shine.teleport(h.stopX, h.stopZ, 0); step(0.3);
    clear(); step(); clear();
    const P = g.police, me = g.player.position;
    const out = { tier: P.tier, on: !!g._ambushOn, cars: P.units.filter((u) => u.active).length };
    P.hold = 0;
    for (let k = 0; k < 80 && !d.flags['escaped:raid']; k++) { for (const u of P.units) if (u.active) { u.car.place(me.x + 900, me.z + 900, 0); u.lastKnown.set(me.x + 900, 0, me.z + 900); u.mode = 'search'; } window.shine.step(0.5); }
    out.away = !!d.flags['escaped:raid'];
    out.warren = !!d.flags.escaped;                             // chapter 5's trap untouched
    return out;
  }, KIT);
  expect(r.tier).toBeGreaterThan(0);
  expect(r.on).toBe(true);
  expect(r.cars).toBe(4);
  expect(r.away).toBe(true);
  expect(r.warren).toBe(false);
  expect(problems).toEqual([]);
});

test('the operation at dawn: the hollow brews two crates (collected there), Braun’s sells three of its stock, and Barrel Rye ages in the stash, once a day', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, pack } = eval(KIT);
    Object.assign(d.flags, { hollowStill: true, brauns: true });
    d.brauns = { 'corn-shine': 5 }; d.stash = { rye: 2 }; d.market.blend.rye = { q: 0.7, bad: false }; d.market.blend['corn-shine'] = { q: 0.8, bad: false };
    d.cash = 0; g.trunk.clear();
    g.pause({ showMenu: false }); g._dawn(); clear();
    const out = { hollow: d.hollow, stock: d.brauns['corn-shine'], cash: d.cash > 0, rye: Math.round(d.market.blend.rye.q * 100) / 100 };
    g.pause({ showMenu: false }); g._dawn(); clear();
    out.again = { hollow: d.hollow, stock: d.brauns['corn-shine'] };
    // Collected at the hollow, into the trunk.
    g.salvage.story = g._openSites();
    out.sites = [!!g.salvage.story.hollow, !!g.salvage.story.brauns];
    g.pause({ showMenu: false }); g._collectHollow(); pack(); clear();
    out.collected = { trunk: g.trunk.count, left: d.hollow };
    // Stocked at Braun's from the trunk.
    g.pause({ showMenu: false }); g._stockBrauns(); clear();
    out.restocked = { stock: d.brauns['corn-shine'], trunk: g.trunk.count };
    return out;
  }, KIT);
  expect(r).toEqual({
    hollow: 2, stock: 2, cash: true, rye: 0.73,
    again: { hollow: 2, stock: 2 }, sites: [true, true],
    collected: { trunk: 2, left: 0 }, restocked: { stock: 4, trunk: 0 },
  });
  expect(problems).toEqual([]);
});
