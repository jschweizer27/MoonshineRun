import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 8's side stories (arcs.js): a contact's own arc, opened at ★★★ from its chapter, run
// on the chapters' machinery (story orders, story sites, deals, passengers), followed from
// the notebook, and ending in a reward the main story doesn't give.

test('side stories open at their contact’s trust from their chapter: the order goes in the book, the notebook lists them, and FOLLOW points the banner at one', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 1);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear } = eval(KIT);
    d.trust.feld = 4; d.trust.pryor = 6;            // ★★ and ★★★; Nell Pryor's waits for chapter 3
    step(); clear(); step();
    return { arcs: JSON.parse(JSON.stringify(d.arcs)), book: d.orders.filter((o) => o.story).map((o) => o.story), log: g.hud.log.join(' | ') };
  }, KIT);
  expect(r.arcs).toEqual({ key: { open: true, done: false } });
  expect(r.book).toContain('key-trade');
  expect(r.log).toContain('A side story: The Brass Key, for Izzy Feld');
  await page.evaluate(() => window.shine.game.openNotebook());
  await expect(page.locator('#notebook-body')).toContainText('SIDE STORIES · 0/6');
  await expect(page.locator('#notebook-body')).toContainText('The Brass Key · Izzy Feld');
  await expect(page.locator('#notebook-body')).toContainText('Bring Izzy Feld a radio set for the key');
  await page.click('[data-arc="key"]');
  await expect(page.locator('[data-arc="key"]')).toHaveText('FOLLOWING');
  const f = await page.evaluate((KIT) => {
    const { g, d, clear, step, objective } = eval(KIT);
    clear(); step();
    return { follow: d.follow, title: g._followed().title, focus: g._focusOrder()?.story, objective: objective() };
  }, KIT);
  expect(f).toMatchObject({ follow: 'key', title: 'The Brass Key', focus: 'key-trade' });
  expect(f.objective).toContain('Izzy Feld');
  await page.evaluate(() => window.shine.game.openNotebook());
  await page.click('[data-arc="key"]');
  await expect(page.locator('[data-arc="key"]')).toHaveText('FOLLOW');
  expect(await page.evaluate(() => window.shine.game.dredge.data.follow)).toBe(null);
  expect(problems).toEqual([]);
});

test('The Brass Key: the trade at Izzy Feld’s, Father’s vault under the ruins after dark, and Braun’s Kümmel learned at the still', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 1);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear, visit, toast } = eval(KIT);
    d.trust.feld = 6;
    step(); clear(); step();
    { const s = g.trunk.findSpot('radio'); g.trunk.place('radio', s.x, s.y, s.rot); }
    const feld = g.contactList.find((c) => c.who === 'feld');
    visit(feld.x, feld.z);
    const out = { traded: !!d.flags['order:key-trade'] };
    clear(); step(); clear(); step();
    out.open = g.salvage.story.ruins;
    const ruins = g.salvage.sites.find((s) => s.story === 'ruins');
    g.env.hour = 12;
    out.byDay = g.salvage.status(ruins, 0, 12);
    g.env.hour = 23;
    g.pause({ showMenu: false });
    g._storySalvaged(ruins, 1);
    out.found = { vault: !!d.flags.vault, toast: toast() };
    clear(); step(); clear(); step();
    out.done = { learned: !!d.flags['learned:kummel'], arc: d.arcs.key, hidden: !g.salvage.story.ruins };
    return out;
  }, KIT);
  expect(r.traded).toBe(true);
  expect(r.open).toEqual({ night: true, window: null });
  expect(r.byDay).toBe('day');
  expect(r.found).toEqual({ vault: true, toast: 'Father’s vault: his ledgers, a strongbox, and his recipe book.' });
  expect(r.done).toEqual({ learned: true, arc: { open: true, done: true }, hidden: true });
  // At the barn, the still offers Kümmel now.
  await page.evaluate(() => { const g = window.shine.game, h = g.world.home; window.shine.teleport(h.stopX, h.stopZ + 40, 0); window.shine.step(0.2); window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.2); });
  await expect(page.locator('#barn')).toBeVisible();
  await expect(page.locator('#barn-body [data-id="brew-kummel"]')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('The Prescription Pad: Doc Wexler’s order by day, the State Board’s price at its own site, and then his dispensary deals in daylight', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 1);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, step, clear, visit, shine, toast } = eval(KIT);
    d.trust.wexler = 6;
    step(); clear(); step();
    const doc = g.contactList.find((c) => c.who === 'wexler');
    shine(3);
    g.env.hour = 12;
    visit(doc.x, doc.z);
    const out = { filled: !!d.flags['order:pad-fill'], dialog: g.ui.isOpen('dialog') };
    clear(); step(); clear(); step();
    out.open = g.salvage.story.board;
    const board = g.salvage.sites.find((s) => s.story === 'board');
    d.cash = 100;
    visit(board.stopX, board.stopZ);
    out.short = toast();
    d.cash = 1000;
    visit(board.stopX, board.stopZ);
    out.confirm = { open: g.ui.isOpen('confirm'), text: document.getElementById('confirm-text').textContent };
    document.getElementById('confirm-yes').click();
    await new Promise((res) => setTimeout(res, 30));
    clear(); step(); clear(); step();
    out.done = { cash: d.cash, licence: !!d.flags.licence, tool: !!d.tools.prescriptions, ledger: d.ledger.find((x) => x.amount === -400)?.text };
    // By day: Doc Wexler's door deals, Lulu Banks's doesn't.
    out.waits = [g._waitsDark({ night: true, who: 'wexler' }), g._waitsDark({ night: true, who: 'banks' })];
    shine(1);
    g.env.hour = 12;
    visit(doc.x, doc.z);
    out.market = g.ui.isOpen('market');
    return out;
  }, KIT);
  expect(r.filled).toBe(true);
  expect(r.open).toEqual({ night: false, window: null });
  expect(r.short).toBe('The State Board wants $400 for the licence, in cash. Come back with it.');
  expect(r.confirm.open).toBe(true);
  expect(r.confirm.text).toContain('dispensing licence');
  expect(r.done).toEqual({ cash: 600, licence: true, tool: true, ledger: 'Doc Wexler’s dispensing licence' });
  expect(r.waits).toEqual([false, true]);
  expect(r.market).toBe(true);
  expect(problems).toEqual([]);
});

test('the rewards at work: the cannery labels once a night, Widow Carroll’s crate at dawn, Romano’s lawyer once a day, and Saturday at the Belvedere', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 2);
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, visit, shine, toast } = eval(KIT);
    Object.assign(d.tools, { labels: true, farmstill: true, family: true, belvedere: true });
    const out = {};
    // The labels: the first search tonight reads "tomatoes"; the second finds the shine (out
    // in the county, where Romano's lawyer can't help).
    g.player.place(0, -600, 0);
    shine(4); g.perks.hidden = 0; d.cash = 1000;
    out.labels = [g._searched(), toast()];
    clear();
    shine(4); g.player.place(0, -600, 0);
    const busts = d.stats.busts || 0;
    out.labels.push(g._searched(), (d.stats.busts || 0) - busts);
    clear();
    // Dawn: a crate of Corn Shine from Stone Hollow, once a day.
    const corn = d.stash['corn-shine'] || 0;
    g._dawn(); clear(); g._dawn(); clear();
    out.farm = (d.stash['corn-shine'] || 0) - corn;
    // In the city, a bust goes away once a day.
    g.player.place(0, 0, 0);
    shine(2); d.cash = 1000;
    g._bust('The Bureau boxed you in.'); clear();
    out.family = { favour: !!g.lastBust.family, cash: d.cash, aboard: g._contraband() };
    g._bust('The Bureau boxed you in.'); clear();
    out.family.second = g.lastBust.taken;
    // Saturday night (a new game starts on a Thursday): the Belvedere pays double.
    const M = d.market;
    M.clock = 2 * 24 + 22; g.env.hour = 22;
    out.sat = [g._belvedere('banks'), g._belvedere('romano')];
    M.clock = 3 * 24 + 2; g.env.hour = 2;
    out.sat.push(g._belvedere('banks'));            // still Saturday night after midnight
    M.clock = 3 * 24 + 22; g.env.hour = 22;
    out.sat.push(g._belvedere('banks'));            // Sunday
    M.clock = 2 * 24 + 22; g.env.hour = 22;
    g.hud.setClock(g._clockText());
    out.clock = document.getElementById('clock').textContent;
    const banks = g.contactList.find((c) => c.who === 'banks');
    d.orders.push({ id: 't:banks', who: 'banks', name: 'Lulu Banks', place: banks.place, contact: banks.id, kind: 'speakeasy', x: banks.x, z: banks.z, wants: { 'corn-shine': 1 }, grade: null, night: true, window: null, pay: 100, due: null });
    shine(1);
    visit(banks.x, banks.z);
    out.paid = d.ledger[0].amount;
    return out;
  }, KIT);
  expect(r.labels[0]).toBe(false);
  expect(r.labels[1]).toContain('Pryor’s Canton tomatoes');
  expect(r.labels.slice(2)).toEqual([true, 1]);
  expect(r.farm).toBe(1);
  expect(r.family).toEqual({ favour: true, cash: 1000, aboard: 2, second: 2 });
  expect(r.sat).toEqual([true, false, true, false]);
  expect(r.clock).toContain('Sat');
  expect(r.paid).toBe(200);
  expect(problems).toEqual([]);
});

test('two passengers at once: Uncle Vito and the band climb in at their pickups, wait for their hours, and a bust puts them off', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 4);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear, visit, toast } = eval(KIT);
    Object.assign(d.flags, { 'learned:lager': true, 'order:wedding-wine': true, 'order:band-bar': true, 'order:band-lager': true });
    d.trust.romano = 6; d.trust.banks = 6;
    step(); clear(); step(); clear(); step();
    const vito = d.orders.find((o) => o.story === 'wedding-vito'), band = d.orders.find((o) => o.story === 'band-ride');
    const at = (who) => g.contactList.find((c) => c.who === who);
    const out = { both: !!vito && !!band, steps: [d.steps['wedding-wine'], d.steps['band-lager']] };
    g.env.hour = 18;
    visit(at('kessler').x, at('kessler').z);
    out.vito = toast();
    visit(at('healy').x, at('healy').z);
    out.pill = document.getElementById('passenger').textContent;
    // Too early at Romano's door: Vito waits for the party.
    visit(at('romano').x, at('romano').z);
    out.early = { toast: toast(), aboard: vito.aboard };
    // The band's set: delivered at the Belvedere in its hours.
    g.env.hour = 20;
    visit(at('banks').x, at('banks').z);
    out.band = { flag: !!d.flags['order:band-ride'], ledger: d.ledger[0].text };
    clear();
    out.pill2 = document.getElementById('passenger').textContent;
    // Busted out in the county (no lawyer there): Vito goes back to Gus Kessler's.
    g.player.place(0, -600, 0);
    d.cash = 1000;
    g._bust('The Bureau boxed you in.'); clear();
    out.bust = { aboard: vito.aboard, back: Math.hypot(vito.x - at('kessler').x, vito.z - at('kessler').z) < 1, log: g.hud.log.join(' | ') };
    return out;
  }, KIT);
  expect(r.both).toBe(true);
  expect(r.steps).toEqual([true, true]);
  expect(r.vito).toContain('Uncle Vito climbs in');
  expect(r.vito).toContain('And not after 23:00');
  expect(r.pill).toContain('UNCLE VITO');
  expect(r.pill).toContain('THE MOONLIGHT SERENADERS');
  expect(r.early).toEqual({ toast: 'Uncle Vito: “Not now, Otto. 19:30–23:00.”', aboard: true });
  expect(r.band.flag).toBe(true);
  expect(r.band.ledger).toContain('Carried The Moonlight Serenaders to');
  expect(r.pill2).toBe('UNCLE VITO ABOARD');
  expect(r.bust.aboard).toBe(false);
  expect(r.bust.back).toBe(true);
  expect(r.bust.log).toContain('Uncle Vito has had enough, and has gone back to');
  expect(problems).toEqual([]);
});

test('The Widow’s Note: pay it at Stone Hollow, bring the feed, drive her to the county clerk before noon, and her still is Otto’s', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 1);
  const r = await page.evaluate(async (KIT) => {
    const { g, d, step, clear, visit } = eval(KIT);
    d.trust.carroll = 6;
    step(); clear(); step();
    const note = g.salvage.sites.find((s) => s.story === 'note'), farm = g.contactList.find((c) => c.who === 'carroll');
    const out = { open: g.salvage.story.note, apart: Math.hypot(note.stopX - farm.x, note.stopZ - farm.z) > 6 };
    d.cash = 1000;
    visit(note.stopX, note.stopZ);
    document.getElementById('confirm-yes').click();
    await new Promise((res) => setTimeout(res, 30));
    clear(); step(); clear(); step();
    out.paid = { cash: d.cash, flag: !!d.flags.notePaid };
    for (const k of ['sack', 'sack', 'barrel']) { const s = g.trunk.findSpot(k); g.trunk.place(k, s.x, s.y, s.rot); }
    visit(farm.x, farm.z);
    clear(); step(); clear(); step();
    out.fed = !!d.flags['order:note-feed'];
    const o = d.orders.find((x) => x.story === 'note-clerk');
    g.env.hour = 9;
    visit(farm.x, farm.z);
    out.aboard = o.aboard;
    visit(g.world.lockup.x, g.world.lockup.z);
    clear(); step(); clear(); step();
    out.done = { flag: !!d.flags['order:note-clerk'], tool: !!d.tools.farmstill, arc: d.arcs.note };
    return out;
  }, KIT);
  expect(r.open).toEqual({ night: false, window: null });
  expect(r.apart).toBe(true);
  expect(r.paid).toEqual({ cash: 400, flag: true });
  expect(r.fed).toBe(true);
  expect(r.aboard).toBe(true);
  expect(r.done).toEqual({ flag: true, tool: true, arc: { open: true, done: true } });
  expect(problems).toEqual([]);
});
