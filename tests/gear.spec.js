import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT } from './helpers.js';

// Stage 9b, after DREDGE: gear that works only while it's packed, Lager that goes flat in a
// warm trunk (ice keeps it), damage that bites (a smashed headlamp, a cracked trunk cell)
// till the barn mends it, lore scraps among the salvage, and bounties for odd finds.

test('gear: bought at a county store, it works only while it rides in the trunk; spotlamps brighten (two at most), the toolbox eases wear, the crowbar forgives a slip, and nobody buys it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { newPry, pressPry } = await import('/src/salvage.js');
    const { buys } = await import('/src/market.js');
    const { CONFIG } = await import('/src/config.js');
    const monkton = CONFIG.dredge.towns.find((t) => t.id === 'monkton');
    g.trunk.clear(); g._updateTrunkPill(); d.cash = 1000;
    const out = { light0: g.perks.light, wear0: g.perks.wear };
    out.bought = [g.buySupply('spotlamp', monkton), g.buySupply('spotlamp', monkton), g.buySupply('spotlamp', monkton), g.buySupply('toolbox', monkton)];
    out.light = Math.round(g.perks.light * 100) / 100;
    out.wear = Math.round(g.perks.wear * 100) / 100;
    // Taken out of the trunk, it does nothing.
    for (const p of [...g.trunk.pieces.values()]) if (p.kind === 'toolbox') g.trunk.remove(p.id);
    g._updateTrunkPill();
    out.wearOut = g.perks.wear;
    // The crowbar: the first slip doesn't count.
    const pry = newPry(Math.random, { free: 1 });
    pry.angle = pry.arcs[0].a + Math.PI;                       // nowhere near an arc
    pressPry(pry); const afterFirst = pry.strikes; pressPry(pry);
    out.pry = [afterFirst, pry.strikes];
    out.sells = [buys('baltimore', 'spotlamp'), buys('drop:0', 'crowbar')];
    out.contraband = g._contraband();
    clear();
    return out;
  }, KIT);
  expect(r.bought).toEqual([true, true, true, true]);
  expect(r.light).toBeCloseTo(r.light0 + 0.4, 2);                 // two spotlamps count, not three
  expect(r.wear).toBeCloseTo(r.wear0 * 0.6, 2);
  expect(r.wearOut).toBeCloseTo(r.wear0, 5);
  expect(r.pry).toEqual([0, 1]);
  expect(r.sells).toEqual([false, false]);
  expect(r.contraband).toBe(0);
  expect(problems).toEqual([]);
});

test('Lager goes flat in a warm trunk by the trunk’s share, a block of ice keeps it till it melts, and the stash keeps it cool', async ({ page }) => {
  const problems = await openGame(page, '&time');
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, d } = eval(KIT);
    g.renderer.setAnimationLoop(null);
    g.env.hoursPerSecond *= 10;                                  // the clock ten times fast: 4 s is a game hour
    const put = (k) => { const s = g.trunk.findSpot(k); g.trunk.place(k, s.x, s.y, s.rot); };
    g.trunk.clear(); d.stash = { lager: 1 };
    put('lager');
    d.market.blend.lager = { q: 0.9, bad: false };
    window.shine.step(4);                                        // a game hour
    const out = { flat: Math.round((0.9 - d.market.blend.lager.q) * 10000) / 10000 };
    // With ice: no loss, until it melts.
    d.market.blend.lager.q = 0.9; d.iceLeft = undefined;
    put('ice');
    window.shine.step(4);
    out.iced = d.market.blend.lager.q;
    d.iceLeft = 0.01;
    window.shine.step(0.1);
    out.melted = { ice: g._gear('ice'), log: g.hud.log.join(' | ') };
    // In the stash only: no loss at all.
    g.trunk.clear(); d.stash = { lager: 2 }; d.market.blend.lager.q = 0.9;
    window.shine.step(4);
    out.stash = d.market.blend.lager.q;
    return out;
  }, KIT);
  expect(r.flat).toBeCloseTo(0.025 * 0.5, 3);                     // half the Lager rode in the trunk
  expect(r.iced).toBe(0.9);
  expect(r.melted.ice).toBe(0);
  expect(r.melted.log).toContain('The ice has melted');
  expect(r.stash).toBe(0.9);
  expect(problems).toEqual([]);
});

test('damage bites: a hard crash smashes a headlamp, the next cracks a trunk cell (what was there bounces out), it keeps through a reload, and the barn mends it all', async ({ page }) => {
  const problems = await openGame(page, '&damage');
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, d, clear } = eval(KIT);
    g._damageRng = () => 0;
    g.trunk.clear();
    g.trunk.place('small-crate', 0, 0, 0);
    const light = g.perks.light;
    g._lastRam = -10; g._crash(30, g.player.position.x, g.player.position.z);
    const out = { lamp: d.damage.lamp, dim: Math.round((g.perks.light / light) * 100) / 100 };
    g._lastRam = -10; g._crash(30, g.player.position.x, g.player.position.z);
    out.cracked = g.trunk.cracked.map((c) => c.join(','));
    out.gone = g.trunk.count;
    out.blocked = g.trunk.canPlace('small-crate', 0, 0, 0);
    out.json = JSON.stringify(g.dredge.data.trunk.cracked);
    // The barn's garage: wear, the lamp and the cell, mended together.
    d.cash = 1000; d.wear = 0;
    out.cost = g.dredge.repairCost(g.trunk.cracked.length);
    clear();
    return out;
  }, KIT);
  expect(r.lamp).toBe(true);
  expect(r.dim).toBe(0.55);
  expect(r.cracked).toEqual(['0,0']);
  expect(r.gone).toBe(0);
  expect(r.blocked).toBe(false);
  expect(r.json).toBe('[[0,0]]');
  expect(r.cost).toBe(120);
  // Through a reload, and then the barn.
  await page.reload();
  await page.waitForFunction(() => window.__shineReady === true);
  await page.click('#start-btn');
  const m = await page.evaluate((KIT) => {
    const { g, d } = eval(KIT);
    const out = { cracked: g.trunk.cracked.length, lamp: d.damage.lamp };
    const h = g.world.home;
    window.shine.teleport(h.stopX, h.stopZ + 40, 0); window.shine.step(0.2); window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.2);
    document.querySelector('#barn-body [data-id="repair"]').click();
    out.after = { cracked: g.trunk.cracked.length, lamp: d.damage.lamp, cash: d.cash, place: g.trunk.canPlace('small-crate', 0, 0, 0) };
    return out;
  }, KIT);
  expect(m).toEqual({ cracked: 1, lamp: true, after: { cracked: 0, lamp: false, cash: 880, place: true } });
  expect(problems).toEqual([]);
});

test('lore scraps turn up at sites worked well after dark, once each, and fill the notebook’s letters; bounties come once Otto knows odd finds', async ({ page }) => {
  const problems = await openGame(page, '&story');
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { offersFor } = await import('/src/contracts.js');
    const { KINDS } = await import('/src/trunk.js');
    clear();
    const site = g.salvage.sites.find((s) => s.id === 'site:0'), two = g.salvage.sites.find((s) => s.id === 'site:1');
    g.env.hour = 12; g._lore(site, 1);
    const out = { byDay: Object.keys(d.lore).length };
    g.env.hour = 22; g._lore(site, 0.3);
    out.poor = Object.keys(d.lore).length;
    g._lore(site, 1); g._lore(two, 1);
    out.found = Object.keys(d.lore);
    // Bounties: one more offer, last, for an odd kind at twice its value; the rest unchanged.
    const opts = { brewing: false, chapter: 0, trust: {}, home: { x: 0, z: 0 }, learned: {} };
    const plain = offersFor(5, g.contactList, opts), with_ = offersFor(5, g.contactList, { ...opts, bounty: true });
    const b = with_[with_.length - 1];
    out.bounty = { same: JSON.stringify(with_.slice(0, -1)) === JSON.stringify(plain), odd: !!KINDS[Object.keys(b.wants)[0]].odd, pay: b.pay === Math.round((KINDS[Object.keys(b.wants)[0]].value * 2) / 5) * 5, id: b.id };
    return out;
  }, KIT);
  expect(r.byDay).toBe(0);
  expect(r.poor).toBe(0);
  expect(r.found).toEqual(['diary-1919']);
  expect(r.bounty).toEqual({ same: true, odd: true, pay: true, id: '5-b' });
  await page.evaluate(() => window.shine.game.openNotebook());
  await expect(page.locator('#notebook-body')).toContainText('LETTERS · 1/12');
  await expect(page.locator('#notebook-body')).toContainText('Mr. V. says the note can wait');
  expect(problems).toEqual([]);
});
