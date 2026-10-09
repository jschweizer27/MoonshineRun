import { test, expect } from '@playwright/test';
import { openGame, startRun, reloadGame, KIT, past } from './helpers.js';

// Stage 7's fixes to the flow of play: one clock, sleeping at the barn, a lost coil, the
// speakeasies' hours, what SELL EVERYTHING keeps back, toasts that wait their turn, the
// handoff card, the fresh offers a trust step needs, the county stores' supplies, rare finds
// at night sites, damaged saves, a gamepad's press, quitting under heat and the checkpoint.

test('one clock: a new game starts at 21:30 on the save’s clock, a reload keeps the hour in step with it, and the night’s rules start at 19:30 with the dark', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const a = await page.evaluate(async () => {
    const g = window.shine.game, { nextDawn } = await import('/src/contracts.js');
    return { clock: g.dredge.market.clock, hour: g.env.hour, dawn: nextDawn(g.dredge.market.clock) % 24 };
  });
  expect(a).toEqual({ clock: 21.5, hour: 21.5, dawn: 6 });          // "by dawn" is 06:00 on the clock face too
  await page.evaluate(() => { const g = window.shine.game; g.dredge.market.clock = 37; g.dredge.save(); });   // 13:00, day 1
  await reloadGame(page);
  await page.click('#start-btn');
  const b = await page.evaluate(async () => {
    const g = window.shine.game, { isNight } = await import('/src/salvage.js');
    window.shine.step(0.1);
    const out = { hour: g.env.hour, face: document.getElementById('clock').textContent, night: g._night() };
    out.dusk = [g._night(19.4), g._night(19.6), isNight(19.4), isNight(19.6)];
    g.env.hour = 19.5;
    out.dark = g.env.daylight;
    return out;
  });
  expect(b.hour).toBe(13);
  expect(b.face).toContain('1:00 PM');
  expect(b.night).toBe(false);
  expect(b.dusk).toEqual([false, true, false, true]);
  expect(b.dark).toBe(0);
  expect(problems).toEqual([]);
});

test('sleeping at the barn: by day till dusk (warning of orders that will go late), in the freight’s steps till it comes in; the clock and the hour move together', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const barn = () => page.evaluate(() => {
    const g = window.shine.game, h = g.world.home;
    while (g.ui.anyOpen) g.ui.close();
    if (g.state === 'paused') g.resume();
    window.shine.teleport(h.stopX, h.stopZ + 40, 0); window.shine.step(0.2);
    window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.2);
    return { open: g.ui.isOpen('barn'), naps: [...document.querySelectorAll('#barn-body [data-id^="sleep-"]')].map((b) => b.dataset.id) };
  });
  await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data, c = g.contactList.find((x) => x.who === 'carroll');
    g.dredge.market.clock = 36; g.env.hour = 12;
    d.orders.push({ id: 'test-1', contact: c.id, who: c.who, name: c.name, place: c.place, kind: 'farm', x: c.x, z: c.z, wants: { sack: 1 }, pay: 100, rep: 5, due: 40 });
  });
  expect(await barn(page)).toEqual({ open: true, naps: ['sleep-dusk'] });
  await page.click('#barn-body [data-id="sleep-dusk"]');
  await expect(page.locator('#confirm-text')).toContainText('late');
  await page.click('#confirm-yes');
  const slept = await page.evaluate(() => {
    const g = window.shine.game;
    const out = { hour: g.env.hour, clock: g.dredge.market.clock, naps: document.querySelectorAll('#barn-body [data-id^="sleep-"]').length };
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    window.shine.step(0.2);
    out.orders = g.dredge.data.orders.length;
    return out;
  });
  expect(slept).toEqual({ hour: 19.5, clock: 43.5, naps: 0, orders: 0 });     // the order went late
  // The freight's steps: till 23:00.
  await past(page, 2);
  await page.evaluate(() => { const g = window.shine.game, d = g.dredge.data; d.trust.orourke = 4; g.env.hour = 12; g.dredge.market.clock = 60; window.shine.step(0.3); });
  expect((await barn(page)).naps).toEqual(['sleep-dusk', 'sleep-freight']);
  await page.click('#barn-body [data-id="sleep-freight"]');
  expect(await page.evaluate(() => { const g = window.shine.game; return [g.env.hour, g.dredge.market.clock]; })).toEqual([23, 71]);
  expect(problems).toEqual([]);
});

test('Father’s coil sold or left behind before it’s fitted: the ruins open again with the spare; SELL EVERYTHING keeps the coil back, and the tips point to the site, not a market', async ({ page }) => {
  const problems = await openGame(page, '&hints');
  await startRun(page, { loot: false });
  const r = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data, s = g.salvage.sites.find((x) => x.story === 'ruins'), c = g.world.collision;
    const out = { guide: document.getElementById('guide-text').textContent, blocked: c.resolveCircle(s.x, s.z, 0.5).hit };
    d.flags.ruinsSearched = true;                  // searched, but the coil never came home
    window.shine.step(0.6);
    out.lost = { open: Object.keys(g.salvage.story), objective: document.getElementById('objective-text').textContent };
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.2);
    out.opened = g.ui.isOpen('salvage');
    while (g.ui.anyOpen) g.ui.close();
    g._onSalvaged(s, 0.9);
    out.hand = g.trunkScreen.hand?.kind;
    g.trunkScreen.confirm(); g.trunkScreen.close();
    window.shine.step(0.6);
    out.back = { open: Object.keys(g.salvage.story), objective: document.getElementById('objective-text').textContent, blocked: c.resolveCircle(s.x, s.z, 0.5).hit };
    return out;
  });
  expect(r.guide).toContain('stop beside its sign');
  expect(r.blocked).toBe(true);                     // the open site's heap is solid
  expect(r.lost.open).toEqual(['ruins']);
  expect(r.lost.objective).toContain('Search the ruins for the spare');
  expect(r.opened).toBe(true);
  expect(r.hand).toBe('coil');
  expect(r.back).toEqual({ open: [], objective: 'Ashes: Fit the coil at the barn and run a batch', blocked: false });
  // At Lexington Market with a crate as well: SELL EVERYTHING sells the crate and keeps the coil.
  await page.evaluate(() => {
    const g = window.shine.game, s = g.trunk.findSpot('crate');
    g.trunk.place('crate', s.x, s.y, s.rot);
    window.shine.teleport(-44, 90, 0); window.shine.step(0.2);
    window.shine.teleport(-44, 44, 0); window.shine.step(0.2);
  });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-note')).toContainText('keeps back');
  await page.click('#market-sell-all');
  expect(await page.evaluate(() => [...window.shine.game.trunk.pieces.values()].map((p) => p.kind))).toEqual(['coil']);
  expect(problems).toEqual([]);
});

test('the speakeasies deal only after dark (waiting at the door opens it), and SELL EVERYTHING keeps back what the orders in the book want', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, d, visit, shine, toast } = eval(KIT);
    const drop = g.world.drops[0], other = g.contactList.find((c) => c.kind === 'speakeasy' && c.who !== drop.who);
    shine(3);
    d.orders.push({ id: 'test-2', contact: other.id, who: other.who, name: other.name, place: other.place, kind: 'speakeasy', x: other.x, z: other.z, wants: { 'corn-shine': 2 }, night: true, pay: 300, rep: 10, due: 1000 });
    g.env.hour = 12;
    visit(drop.x, drop.z);
    const day = { open: g.ui.isOpen('market'), toast: toast() };
    g.env.hour = 21;
    window.shine.step(0.3);
    return { day, night: g.ui.isOpen('market') };
  }, KIT);
  expect(r.day.open).toBe(false);
  expect(r.day.toast).toContain('Not in daylight');
  expect(r.night).toBe(true);
  await page.click('#market-sell-all');
  expect(await page.evaluate(() => window.shine.game._contraband())).toBe(2);
  expect(problems).toEqual([]);
});

test('toasts wait their turn: news cut short comes back after the toast that cut it, a passing one doesn’t, and the same text isn’t queued twice', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await page.evaluate(() => {
    const h = window.shine.game.hud;
    h.toast('Gus Kessler trusts you more', 'gold', 4000);
    h.toast('Lights on', '', 300);
    h.toast('Delivered to Gus Kessler: $120', 'gold', 900);
    h.toast('Delivered to Gus Kessler: $120', 'gold', 900);
  });
  await expect(page.locator('#toast')).toHaveText('Delivered to Gus Kessler: $120');
  expect(await page.evaluate(() => window.shine.game.hud._queue.map((q) => q.text))).toEqual(['Gus Kessler trusts you more']);
  await expect(page.locator('#toast')).toHaveText('Gus Kessler trusts you more', { timeout: 5000 });
  expect(problems).toEqual([]);
});

test('a handoff of two orders at once: one card lists both, with the trust news; the step’s contact posts a fresh order after each delivery', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const offers = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    d.flags.ruinsSearched = true; d.still = 1; d.stats.brews = 1;
    window.shine.step(0.6);
    const ids = () => g._jobs().offers().filter((o) => o.who === 'kessler').map((o) => o.id.split('-')[1]);
    const before = ids();
    d.delivered.kessler = 1;
    return { before, after: ids() };
  });
  expect(offers.before).toContain('f0');
  expect(offers.after).toContain('f1');
  expect(offers.after).not.toContain('f0');
  await page.evaluate((KIT) => {
    const { g, d, visit, shine } = eval(KIT);
    const c = g.contactList.find((x) => x.who === 'kessler');
    g.settings.reducedMotion = true;                 // whole lines, no typing
    d.delivered.kessler = 0;
    shine(2);
    for (const id of ['a', 'b']) d.orders.push({ id: `test-${id}`, contact: c.id, who: c.who, name: c.name, place: c.place, kind: 'speakeasy', x: c.x, z: c.z, wants: { 'corn-shine': 1 }, grade: null, night: true, pay: 150, rep: 5, due: 1000 });
    g.env.hour = 22;
    visit(c.x, c.z);
  }, KIT);
  await expect(page.locator('#dialog')).toBeVisible();
  await page.click('#dialog-next');                  // Gus's thanks, then the card
  await expect(page.locator('#dialog-text')).toContainText('Handed over');
  const text = await page.locator('#dialog-text').textContent();
  expect(text.match(/Gus Kessler/g).length).toBeGreaterThanOrEqual(3);   // both orders, and the trust news
  expect(text).toContain('trusts you more');
  expect(problems).toEqual([]);
});

test('the county stores sell the still’s makings into the trunk; Lexington Market doesn’t', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await page.evaluate(() => { const g = window.shine.game; g.dredge.data.cash = 500; g.hud.setCash(500); window.shine.teleport(0, -620, Math.PI); window.shine.step(0.2); window.shine.teleport(0, -660, Math.PI); window.shine.step(0.2); });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-body')).toContainText('SUPPLIES');
  await page.click('#market-body [data-id="supply-sack"]');
  const r = await page.evaluate(async () => {
    const g = window.shine.game, { supplyPrice } = await import('/src/screens.js');
    return { cash: g.dredge.cash, price: supplyPrice('sack'), trunk: [...g.trunk.pieces.values()].map((p) => p.kind), ledger: g.dredge.data.ledger[0].text };
  });
  expect(r.price).toBe(39);
  expect(r).toMatchObject({ cash: 500 - 39, trunk: ['sack'] });
  expect(r.ledger).toContain('Bought burlap sack');
  await page.click('#market-done');
  await page.evaluate(() => { window.shine.teleport(-44, 90, 0); window.shine.step(0.2); window.shine.teleport(-44, 44, 0); window.shine.step(0.2); });
  await expect(page.locator('#market')).toBeVisible();
  expect(await page.locator('#market-body [data-id^="supply-"]').count()).toBe(0);
  expect(problems).toEqual([]);
});

test('a rare find: a clean job at a night site turns one up now and then (the same for everyone), first up to pack; never at a day site or from a fair job', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const g = window.shine.game, { rareFind } = await import('/src/salvage.js');
    const nightSite = g.salvage.sites.find((s) => s.night && !s.story), daySite = g.salvage.sites.find((s) => !s.night && !s.story);
    const days = Array.from({ length: 60 }, (_, k) => k);
    const lucky = days.find((k) => rareFind(nightSite, k, 1));
    const out = {
      share: days.filter((k) => rareFind(nightSite, k, 1)).length / days.length,
      day: days.some((k) => rareFind(daySite, k, 1)), fair: days.some((k) => rareFind(nightSite, k, 0.5)),
      same: rareFind(nightSite, lucky, 1) === rareFind(nightSite, lucky, 0.9),
    };
    g.dredge.market.clock = lucky * 24 + 22; g.env.hour = 22;
    g.pause({ showMenu: false });
    g._onSalvaged(nightSite, 1);
    out.hand = g.trunkScreen.hand?.kind; out.rares = g.dredge.data.stats.rares; out.ledger = g.dredge.data.ledger[0].text;
    out.toast = document.getElementById('toast').textContent;
    return out;
  });
  expect(r.share).toBeGreaterThan(0.15);
  expect(r.share).toBeLessThan(0.6);
  expect(r).toMatchObject({ day: false, fair: false, same: true, rares: 1 });
  expect(['pocket-watch', 'bonds']).toContain(r.hand);
  expect(r.ledger).toContain('A rare find');
  expect(r.toast).toMatch(/It pays best in (Monkton|Baltimore)/);
  expect(problems).toEqual([]);
});

test('saves: a damaged save boots and loads with its bad values put right, a fresh slot shares nothing, and erasing mid-run goes back to the title clean', async ({ page }) => {
  const problems = await openGame(page);
  // A damaged save in slot 2, the slot played last (so it loads at boot).
  await page.evaluate(() => {
    localStorage.setItem('shine.dredge.v1.s2', JSON.stringify({
      started: true, cash: 40, ending: 'bogus', rank: 99, chapter: 'x', market: { clock: null }, upgrades: { magnet: 2 },
      orders: [{ x: 1 }, { id: 'old', who: 'carroll', wants: { sack: 1 }, x: 1, z: 2, due: 50 }],
    }));
    localStorage.setItem('shine.dredge.slot', JSON.stringify({ slot: 2 }));
  });
  await reloadGame(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    g._loadSlot(2);
    const d = g.dredge.data;
    const out = { ending: d.ending, rank: d.rank, chapter: d.chapter, clock: d.market.clock, orders: d.orders.map((o) => o.id), padding: d.upgrades.padding, magnet: 'magnet' in d.upgrades, title: document.getElementById('intro-best').textContent.includes('Slot 2') };
    // A fresh slot: nothing it does shows up in another one.
    g.dredge.erase(3); g._loadSlot(3);
    g.dredge.data.ledger.push({ text: 'x' }); g.dredge.data.sites['site:0'] = 4;
    g.dredge.erase(1); g._loadSlot(1);
    out.fresh = { ledger: g.dredge.data.ledger.length, sites: Object.keys(g.dredge.data.sites).length };
    return out;
  });
  expect(r).toEqual({ ending: null, rank: undefined, chapter: 0, clock: 21.5, orders: ['old'], padding: 2, magnet: false, title: true, fresh: { ledger: 0, sites: 0 } });
  await startRun(page, { loot: false });
  const erased = await page.evaluate(() => {
    const g = window.shine.game;
    g.dredge.data.cash = 999; g.trunk.place('crate', 0, 0);
    g.pause();
    g.eraseProgress();
    return { state: g.state, cash: g.dredge.cash, trunk: g.trunk.count, title: !document.getElementById('intro').classList.contains('hidden') };
  });
  expect(erased).toEqual({ state: 'intro', cash: 0, trunk: 0, title: true });
  expect(problems).toEqual([]);
});

test('a gamepad’s A pries once a press (not twice), and quitting with the Bureau on your tail is a bust', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const presses = await page.evaluate(async () => {
    const g = window.shine.game;
    let a = false;
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 && a, value: i === 0 && a ? 1 : 0 })) }];
    g.input.poll();
    g.openSalvage(g.salvage.sites.find((s) => s.kind === 'wreck'));
    const pry = g.salvageScreen.game;
    a = true;
    g.input.poll();                                   // A goes down: one 'confirm'
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    a = false;
    g.input.poll();
    const n = pry.strikes + pry.arcs.filter((x) => x.hit).length;
    g.salvageScreen.finish();
    while (g.ui.anyOpen) g.ui.close();
    if (g.state === 'paused') g.resume();
    return n;
  });
  expect(presses).toBe(1);
  await page.evaluate((KIT) => { const { g, shine } = eval(KIT); shine(2); g.dredge.data.cash = 1000; g.police.heat = 2; g.pause(); }, KIT);
  await page.click('#pause-quit');
  await expect(page.locator('#confirm-text')).toContainText('counts as a bust');
  await page.click('#confirm-yes');
  const after = await page.evaluate(() => { const g = window.shine.game; return { state: g.state, busts: g.dredge.data.stats.busts, shine: g._contraband(), cash: g.dredge.cash }; });
  expect(after).toEqual({ state: 'intro', busts: 1, shine: 0, cash: 750 });
  expect(problems).toEqual([]);
});

test('the York Road checkpoint stands from chapter 3, and its first night brings a warning card', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const early = await page.evaluate(() => { const g = window.shine.game; g.env.hour = 22; window.shine.step(0.2); return { on: g.police.checkpoint.on, flag: !!g.dredge.data.flags.checkpoint }; });
  expect(early).toEqual({ on: false, flag: false });
  await past(page, 2);
  const later = await page.evaluate(async () => {
    const g = window.shine.game, { BEATS } = await import('/src/story.js');
    window.shine.step(0.2);
    return { on: g.police.checkpoint.on, flag: !!g.dredge.data.flags.checkpoint, beat: BEATS.checkpoint.when(g.dredge.data), text: BEATS.checkpoint.lines[0][1] };
  });
  expect(later).toMatchObject({ on: true, flag: true, beat: true });
  expect(later.text).toContain('checkpoint');
  expect(problems).toEqual([]);
});
