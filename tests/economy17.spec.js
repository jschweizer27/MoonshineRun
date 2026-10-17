import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 17 (the bug hunt): the economy. A kind's SELL keeps back what the story needs and a
// lost item's refill isn't a mint; gear isn't cargo; Braun's sells at the grade it was stocked
// and won't take a tainted blend; the hollow, the launch and a drop box take only what fits;
// Sweet Talk waits for a paying order; a drop box at the shallows needs the hook, and its
// finds go in the notebook; every kind of shine an order wants counts, and imported liquor
// is grade A; COURTING brings an order even while the chapter waits on another contact.

test('the Scotch the hotel wants can’t be sold out from under it, and the pier gives it back three times at most', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear } = eval(KIT);
    Object.assign(d.steps, { 'mags-row': true, launch: true });
    d.flags.launch = true;
    step(); clear(); step(); clear();
    g.trunk.clear();
    for (let k = 0; k < 2; k++) { const s = g.trunk.findSpot('scotch'); g.trunk.place('scotch', s.x, s.y, s.rot); }
    g.env.hour = 22;
    g.pause({ showMenu: false });
    g.openMarket({ id: 'drop:0', name: 'a speakeasy', town: 'a speakeasy' }, { upgrades: false });
    const b = document.querySelector('#market-body [data-id="scotch"]');
    const out = { button: b?.textContent, disabled: b?.disabled, all: document.getElementById('market-sell-all').disabled };
    clear();
    // Lost three times (a bust, a crash...): the pier gives two back each time, then no more.
    const pier = g.salvage.sites.find((s) => s.story === 'pier'), refills = [];
    for (let k = 0; k < 4; k++) {
      g.trunk.clear();
      const lost = g._lost();
      refills.push(lost?.site || null);
      if (lost) { g.pause({ showMenu: false }); g._storySalvaged(pier, 1); clear(); }
    }
    out.refills = refills;
    return out;
  }, KIT);
  expect(r.button).toBe('SPOKEN FOR');
  expect(r.disabled).toBe(true);
  expect(r.all).toBe(true);
  expect(r.refills).toEqual(['pier', 'pier', 'pier', null]);
  expect(problems).toEqual([]);
});

test('gear isn’t cargo: with only a crowbar aboard the banner follows the story, not a market', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, step, objective } = eval(KIT);
    g.trunk.clear(); g.trunk.place('crowbar', 0, 0);
    step();
    return { cargo: g._cargo(), banner: objective() };
  }, KIT);
  expect(r.cargo).toBe(0);
  expect(r.banner).toContain('Search the ruins');
  expect(problems).toEqual([]);
});

test('Braun’s won’t take a tainted blend, and sells what it took at the grade it was stocked at', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 8);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, shine, clear } = eval(KIT);
    const { priceOf } = await import('/src/market.js');
    const { CONFIG } = await import('/src/config.js');
    Object.assign(d.flags, { brauns: true, hollowStill: true });
    clear();
    shine(4);
    d.market.blend['corn-shine'] = { q: 0.9, bad: true };
    g.pause({ showMenu: false });
    await g._stockBrauns();
    const out = { tainted: d.brauns['corn-shine'] || 0 };
    clear();
    // A plain C batch stocked; then the blend on hand turns A: Braun's still sells it as C.
    shine(4);
    d.market.blend['corn-shine'] = { q: 0.45, bad: false };
    g.pause({ showMenu: false });
    const stocking = g._stockBrauns();
    await new Promise((res) => setTimeout(res, 30));
    document.getElementById('confirm-yes').click();
    await stocking;
    clear();
    out.stocked = d.brauns['corn-shine'];
    out.q = d.braunsQ['corn-shine'];
    d.market.blend['corn-shine'] = { q: 0.95, bad: false };
    const cash = d.cash;
    d.once.brauns = -1;
    g.pause({ showMenu: false });
    g._dawn();
    clear();
    const atC = { ...d.market, blend: { 'corn-shine': { q: 0.45, bad: false } } }, n = Math.min(4, CONFIG.dredge.operation.brauns.nightly);
    out.takings = d.cash - cash;
    out.expect = n * Math.round(priceOf('drop:0', 'corn-shine', atC) * CONFIG.dredge.operation.brauns.cut);
    return out;
  }, KIT);
  expect(r.tainted).toBe(0);
  expect(r.stocked).toBe(4);
  expect(r.q).toBeCloseTo(0.45, 5);
  expect(r.takings).toBe(r.expect);
  expect(problems).toEqual([]);
});

test('the hollow, the launch and a drop box take only what fits; Sweet Talk waits for an order that pays', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 8);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear, pack } = eval(KIT);
    clear();
    // Room for two crates only.
    const fill = (free) => { g.trunk.clear(); while (g.trunk.size - g.trunk.used > free) { const s = g.trunk.findSpot('small-crate'); if (!s) break; g.trunk.place('small-crate', s.x, s.y, s.rot); } };
    fill(4);
    d.flags.hollowStill = true; d.hollow = 8;
    g.pause({ showMenu: false });
    g._collectHollow();
    const out = { hollowLeft: d.hollow, pending: d.pending.length };
    pack(); clear();
    // The launch: no room, no sale.
    fill(0);
    d.tools.launch = true; d.cash = 1000; d.once.launch = -1; g.env.hour = 23.5;
    g.pause({ showMenu: false });
    await g._launchDeal();
    out.launch = { cash: d.cash, open: g.ui.top?.id || null };
    clear();
    // Sweet Talk isn't spent on a call.
    d.tools.sweet = true; g._sweet = true;
    const o = { id: 't-call', who: 'kessler', name: 'Gus Kessler', place: 'Highlandtown', wants: {}, pay: 0, call: true, x: 0, z: 0 };
    d.orders.push(o);
    g._deliver(o, { grade: 'B', tainted: false });
    out.sweet = g._sweet;
    return out;
  }, KIT);
  expect(r.hollowLeft).toBe(6);
  expect(r.pending).toBe(2);
  expect(r.launch).toEqual({ cash: 1000, open: null });
  expect(r.sweet).toBe(true);
  expect(problems).toEqual([]);
});

test('every kind of shine an order wants counts (lowest grade, tainted if any is); imported liquor is grade A; COURTING brings an order beside the chapter’s', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 1);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { progress, kindGrade } = await import('/src/contracts.js');
    clear();
    g.trunk.clear();
    for (const k of ['corn-shine', 'corn-shine', 'applejack', 'applejack']) { const s = g.trunk.findSpot(k); g.trunk.place(k, s.x, s.y, s.rot); }
    const o = { wants: { 'corn-shine': 2, applejack: 2 }, grade: 'B' };
    const mixed = progress(o, g.trunk, { 'corn-shine': { q: 0.95, bad: false }, applejack: { q: 0.45, bad: false } });
    const bad = progress(o, g.trunk, { 'corn-shine': { q: 0.95, bad: false }, applejack: { q: 0.9, bad: true } });
    const out = { mixed: [mixed.grade, mixed.gradeOk], tainted: bad.tainted, scotch: kindGrade('scotch'), corn: kindGrade('corn-shine', { 'corn-shine': { q: 0.95 } }) };
    // Chapter 2's first step waits on Ma Pruitt; courting Widow Carroll still brings her order.
    d.follow = 'note';
    out.offers = g._jobs().offers().filter((x) => /-[fc]\d+$/.test(x.id)).map((x) => [x.who, x.id.split('-')[1]]);
    return out;
  }, KIT);
  expect(r.mixed).toEqual(['C', false]);
  expect(r.tainted).toBe(true);
  expect(r.scotch).toBe('A');
  expect(r.corn).toBe('A');
  expect(r.offers).toEqual([['pruitt', 'f0'], ['carroll', 'c0']]);
  expect(problems).toEqual([]);
});
