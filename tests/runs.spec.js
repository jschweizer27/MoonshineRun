import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 7b's story runs: chapter 5's brewery in Gus's cellar (Highlandtown Lager, its own
// mini-game), chapter 3's passenger (Walt Purdy, from the docks to the freight) and chapter
// 4's fragile load (Delaney's crates break on any hard knock).

test('the brewery: chapter 5 opens in Gus’s cellar; short of the makings it says so; the mash, the boil and the lagering make up to six crates; then Lager is learned and brewed only there', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 4);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, visit, objective, toast } = eval(KIT);
    step();
    const site = g.salvage.sites.find((s) => s.story === 'brewery'), gus = g.contactList.find((c) => c.who === 'kessler');
    const out = { objective: objective(), open: Object.keys(g.salvage.story), apart: Math.hypot(site.x - gus.x, site.z - gus.z) > 20 };
    visit(site.stopX, site.stopZ);
    out.short = { toast: toast(), open: g.ui.isOpen('brewery') };
    d.stash.sack = 3; d.stash.barrel = 1;
    visit(site.stopX, site.stopZ);
    out.opened = g.ui.isOpen('brewery');
    out.used = { sack: d.stash.sack || 0, barrel: d.stash.barrel || 0 };
    return out;
  }, KIT);
  expect(r.objective).toBe('Drowned Warren: Brew Highlandtown Lager in Gus’s cellar (3 sacks of malt, a barrel)');
  expect(r.open).toEqual(['brewery']);
  expect(r.apart).toBe(true);
  expect(r.short).toEqual({ toast: expect.stringContaining('short of 3 burlap sacks, 1 barrel'), open: false });
  expect(r.opened).toBe(true);
  expect(r.used).toEqual({ sack: 0, barrel: 0 });
  await expect(page.locator('#brewery-steps li.on')).toHaveText('1 · THE MASH');
  // Brew it by hand: keep the mash on its rests, the hops in on their marks, tap it in the window.
  const q = await page.evaluate(async () => {
    const g = window.shine.game, B = g.breweryScreen, b = B.batch, { CONFIG } = await import('/src/config.js'), { lagerRest, lagerQuality } = await import('/src/brew.js');
    const L = CONFIG.dredge.brew.lager, dt = 1 / 30;
    B.manual();
    while (b.phase === 'mash') B.step(dt, b.temp < lagerRest(b));
    const phases = [b.phase];
    for (const h of L.boil.hops) { while (b.boil.pos < h && b.phase === 'boil') B.step(dt); B.press(); }
    while (b.phase === 'boil') B.step(dt);
    phases.push(b.phase);
    while (b.lager.pos < (L.lager.window[0] + L.lager.window[1]) / 2) B.step(dt);
    B.press();
    return { phases, q: lagerQuality(b), done: b.done };
  });
  expect(q.phases).toEqual(['boil', 'lager']);
  expect(q.done).toBe(true);
  expect(q.q).toBeGreaterThan(0.8);
  await expect(page.locator('#brewery-msg')).toContainText('6 crates of Highlandtown Lager');
  await page.click('#brewery-done');
  const after = await page.evaluate(async (KIT) => {
    const { g, d, step, objective, clear } = eval(KIT);
    clear(); step();
    const { offersFor } = await import('/src/contracts.js');
    const learned = Array.from({ length: 12 }, (_, k) => offersFor(k + 3, g.contactList, { brewing: true, learned: d.flags })).flat().some((o) => o.wants.lager);
    return {
      lager: d.stash.lager, grade: d.market.blend.lager && d.market.blend.lager.q > 0.8, learned: !!d.flags['learned:lager'], objective: objective(),
      stillOpen: Object.keys(g.salvage.story).includes('brewery'), ledger: d.ledger[0].text, offers: learned,
    };
  }, KIT);
  expect(after).toMatchObject({ lager: 6, grade: true, learned: true, objective: 'Drowned Warren: Drive out to Loch Raven, east of Cockeysville', stillOpen: true, offers: true });
  expect(after.ledger).toContain('Highlandtown Lager in Gus’s cellar');
  // At the barn, the still doesn't offer Lager (it's the brewery's).
  await page.evaluate(() => { const g = window.shine.game, h = g.world.home; window.shine.teleport(h.stopX, h.stopZ + 40, 0); window.shine.step(0.2); window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.2); });
  await expect(page.locator('#barn')).toBeVisible();
  expect(await page.locator('#barn-body [data-id="brew-lager"]').count()).toBe(0);
  expect(problems).toEqual([]);
});

test('Walt Purdy rides along: picked up at the docks, a hard knock costs Mags’s trust, a bust puts him off, and set down at the siding while the freight stands; then the crates', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 2);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, visit, clear, objective, toast } = eval(KIT);
    d.trust.orourke = 4;
    step();
    const o = d.orders.find((x) => x.story === 'purdy'), mags = g.contactList.find((c) => c.who === 'orourke');
    const out = { book: !!o, at: [Math.round(o.x), Math.round(o.z)], mags: [Math.round(mags.x), Math.round(mags.z)], objective: objective() };
    visit(mags.x, mags.z);
    out.aboard = { aboard: o.aboard, pill: document.getElementById('passenger').textContent, shown: !document.getElementById('passenger').classList.contains('hidden'), toast: toast(), objective: objective() };
    // A hard knock: he complains, and Mags hears of it.
    const trust = d.trust.orourke;
    g._crash(20, g.player.position.x, g.player.position.z);
    out.knock = { lost: trust - d.trust.orourke, toast: toast() };
    // Busted: he goes back to the docks.
    g.dredge.data.cash = 1000;
    g._bust('The Bureau boxed you in.');
    clear();
    out.bust = { aboard: o.aboard, at: [Math.round(o.x), Math.round(o.z)] };
    // Again, and to the siding in the freight's hours.
    visit(mags.x, mags.z);
    g.env.hour = 23.5;
    const before = d.trust.orourke;
    visit(o.x, o.z);
    out.delivered = { flag: !!d.flags['order:purdy'], trust: d.trust.orourke - before, ledger: d.ledger[0].text, dialog: g.ui.isOpen('dialog') };
    clear(); step();
    out.next = { freight: d.orders.some((x) => x.story === 'freight'), pill: document.getElementById('passenger').classList.contains('hidden') };
    return out;
  }, KIT);
  expect(r.book).toBe(true);
  expect(r.at).toEqual(r.mags);                     // it points at his pickup first
  expect(r.objective).toMatch(/^Pick up Walt Purdy at /);
  expect(r.aboard).toMatchObject({ aboard: true, pill: 'WALT PURDY ABOARD', shown: true, objective: 'Get Walt Purdy to the Glyndon siding · 23:00–01:30' });
  expect(r.aboard.toast).toContain('Walt Purdy climbs in');
  expect(r.knock.lost).toBe(1);
  expect(r.knock.toast).toContain('Mags O’Rourke’s trust slips');
  expect(r.bust).toEqual({ aboard: false, at: r.mags });
  expect(r.delivered).toMatchObject({ flag: true, trust: 1, dialog: true });
  expect(r.delivered.ledger).toBe('Carried Walt Purdy to the Glyndon siding');
  expect(r.next).toEqual({ freight: true, pill: true });
  expect(problems).toEqual([]);
});

test('Delaney’s crates are fragile: any hard knock breaks one for certain, the banner says so, and Otto’s own corn shine can make them up', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 3);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, shine, objective, toast } = eval(KIT);
    d.flags.consignment = true;
    step();
    const o = d.orders.find((x) => x.story === 'run');
    shine(2);
    g.env.hour = 12;
    window.shine.step(0.2);
    const out = { fragile: o.fragile, objective: objective() };
    g._breakRng = () => 0.99;                        // no chance breakage: only the fragile rule
    g._crash(10, 0, 0);                              // a bump, under the breakage line
    out.bump = g._contraband();
    g._lastRam = -10;
    g._crash(14, 0, 0);
    out.knock = { shine: g._contraband(), toast: toast() };
    return out;
  }, KIT);
  expect(r.fragile).toBe(true);
  expect(r.objective).toContain('fragile');
  expect(r.bump).toBe(2);
  expect(r.knock.shine).toBe(1);
  expect(r.knock.toast).toContain('Delaney’s crates jump');
  expect(problems).toEqual([]);
});
