import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past, reloadGame } from './helpers.js';

// Stage 15a: nothing in the story can get stuck, and the systems that meet (hijacks, traps,
// busts, Braun's, passengers) leave the game in a sane state.

test('chapter 7: the Scotch lost before the hotel, the Canton pier gives two cases back (not the launch deal)', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear, pack, objective } = eval(KIT);
    Object.assign(d.steps, { 'mags-row': true, launch: true });
    d.flags.launch = true;
    g.trunk.clear();
    step(); clear(); step(); clear();
    const out = { lost: g._lost()?.site, open: !!g.salvage.story.pier, banner: objective() };
    const pier = g.salvage.sites.find((s) => s.story === 'pier');
    g.env.hour = 12;
    g.pause({ showMenu: false });
    g.openSalvage(pier);
    pack();
    clear(); step();
    out.scotch = [...g.trunk.pieces.values()].filter((p) => p.kind === 'scotch').length;
    out.after = { lost: g._lost(), cash: d.cash, log: g.hud.log.join(' | ') };
    return out;
  }, KIT);
  expect(r.lost).toBe('pier');
  expect(r.open).toBe(true);
  expect(r.banner).toContain('The Scotch is gone');
  expect(r.scotch).toBe(2);
  expect(r.after.lost).toBe(null);
  expect(r.after.log).toContain('Mags’s dockers kept two cases of Scotch back');
  expect(r.after.log).not.toContain('The launch wants');
  expect(problems).toEqual([]);
});

test('chapter 8: a reload while the raid’s cards are up still counts Otto away, and the chapter finishes', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 7);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear } = eval(KIT);
    Object.assign(d.steps, { warn: true, hollow: true, brauns: true });
    Object.assign(d.flags, { 'order:warn': true, hollowStill: true, brauns: true });
    step(); clear(); step(); clear();
    g.env.hour = 22;
    const h = g.world.home;
    window.shine.teleport(h.stopX, h.stopZ + 40, 0); step(0.2); window.shine.teleport(h.stopX, h.stopZ, 0); step(0.3);
    step(0.6);                                     // the story check: the raid's cards come up
    return { home: !!d.flags.raidHome, trap: !!d.flags['ambush:raid'], away: !!d.flags['escaped:raid'], cards: g.ui.anyOpen };
  }, KIT);
  expect(r).toMatchObject({ home: true, trap: true, away: false });
  await reloadGame(page);
  await startRun(page, { loot: false });
  const after = await page.evaluate((KIT) => {
    const { d, step, clear } = eval(KIT);
    step(); clear(); step(); clear(); step();
    return { away: !!d.flags['escaped:raid'], chapter: d.chapter };
  }, KIT);
  expect(after).toEqual({ away: true, chapter: 8 });
  expect(problems).toEqual([]);
});

test('Vail’s men: no roadblock or Bureau radio; a checkpoint bust mid-hijack ends it; the Bureau’s trap takes over from them; quitting is a hijack, not a fine', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, shine } = eval(KIT);
    clear();
    const hijack = () => { g.player.place(0, -600, 0); shine(4); g.env.hour = 22; g.env.hoursPerSecond = 0.025; g._rivalRng = () => 0; g._rivals(1 / 60, true); };
    d.cash = 1000;
    hijack();
    const out = { on: g._hijackOn, quiet: g.police.quiet, radio: g.hud.log.some((t) => t.includes('radioed ahead')) };
    for (let i = 0; i < 120; i++) window.shine.step(1 / 60, { throttle: 1 });
    out.roadblock = g.police.roadblock.active;
    g._bust('The checkpoint searched the truck and found the shine.'); clear();
    out.afterBust = { on: g._hijackOn, quiet: g.police.quiet };
    // Vail's men again, then the Bureau's raid on the barn: the trap is the Bureau's.
    g.police.reset();
    hijack();
    g._ambush('raid');
    out.trap = { hijack: g._hijackOn, ambush: g._ambushOn, quiet: g.police.quiet };
    return out;
  }, KIT);
  expect(r).toEqual({ on: true, quiet: true, radio: false, roadblock: false, afterBust: { on: false, quiet: false }, trap: { hijack: false, ambush: true, quiet: false } });
  // Quitting with Vail's men behind: they take their share, no fine.
  await page.evaluate((KIT) => { const { g, d, clear, shine } = eval(KIT); clear(); g._ambushOn = false; g.police.reset(); d.cash = 1000; g.player.place(0, -600, 0); shine(4); g.env.hour = 22; g.env.hoursPerSecond = 0.025; g._rivalRng = () => 0; g._rivals(1 / 60, true); g.pause(); }, KIT);
  await page.click('#pause-quit');
  await expect(page.locator('#confirm-text')).toContainText('Vail’s men');
  await page.click('#confirm-yes');
  const q = await page.evaluate(() => { const g = window.shine.game; return { hijack: !!g.lastBust?.hijack, cash: g.dredge.data.cash }; });
  expect(q).toEqual({ hijack: true, cash: 1000 });
  expect(problems).toEqual([]);
});

test('Braun’s asks before it takes the shine, and leaves what the orders need aboard', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 8);
  await page.evaluate((KIT) => {
    const { g, d, step, clear, shine } = eval(KIT);
    Object.assign(d.flags, { hollowStill: true, brauns: true, 'order:ruby-tip': true });
    d.steps['ruby-tip'] = true;
    step(); clear(); step(); clear();
    shine(6);
    g.pause({ showMenu: false });
    window.__stock = g._stockBrauns();
  }, KIT);
  await expect(page.locator('#confirm-text')).toContainText('2 crates');
  await expect(page.locator('#confirm-text')).toContainText('4 more stay aboard');
  await page.click('#confirm-yes');
  const r = await page.evaluate(async () => {
    await window.__stock;
    const g = window.shine.game, d = g.dredge.data;
    return { convoy: !!d.orders.find((o) => o.story === 'convoy'), stock: d.brauns['corn-shine'] || 0, aboard: g._contraband() };
  });
  expect(r).toEqual({ convoy: true, stock: 2, aboard: 4 });
  expect(problems).toEqual([]);
});

test('Ruby Dalton rides on her own trust; a call in person reads as one (no $0, no handoff card)', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 5);
  const ruby = await page.evaluate((KIT) => {
    const { d, step, clear } = eval(KIT);
    Object.assign(d.steps, { towson: true, ruby: true, 'ruby-trust': true, records: true });
    Object.assign(d.flags, { towson: true });
    d.clues.mortgages = true;
    step(); clear(); step(); clear();
    const o = d.orders.find((x) => x.story === 'copy');
    return { vouch: o?.vouch, passenger: o?.passenger };
  }, KIT);
  expect(ruby).toEqual({ vouch: 'dalton', passenger: 'dalton' });
  await past(page, 7);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear, visit, objective } = eval(KIT);
    step(); clear(); step(); clear();
    const o = d.orders.find((x) => x.story === 'warn'), ledger = d.ledger.length;
    const out = { call: o.call, banner: objective() };
    g.env.hour = 22;
    visit(o.x, o.z);
    clear(); step();
    out.done = { flag: !!d.flags['order:warn'], log: g.hud.log.join(' | '), ledger: d.ledger.length - ledger };
    return out;
  }, KIT);
  expect(r.call).toBe(true);
  expect(r.banner).toContain('Call on Gus Kessler');
  expect(r.done.flag).toBe(true);
  expect(r.done.log).toContain('Called on Gus Kessler.');
  expect(r.done.log).not.toContain('$0');
  expect(r.done.ledger).toBe(0);
  expect(problems).toEqual([]);
});
