import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 11: chapter 7, Rum Row. The launch at the Canton pier, imported Scotch and rum, Vail's
// warehouse, the harbour patrol, the schooner at anchor, and Mags's launch after it.

test('chapter 7, Rum Row: Mags O’Rourke’s full trust, the launch at the Canton pier after eleven, Scotch for Abernathy, the manifests in Vail’s warehouse; then the choice', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear, objective, pack } = eval(KIT);
    const visit = (x, z) => { clear(); window.shine.teleport(x, z - 40, Math.PI); window.shine.step(0.2); window.shine.teleport(x, z, Math.PI); window.shine.step(0.3); };
    step(); clear(); step();
    const out = { open: objective() };
    d.trust.orourke = 6;
    step(); clear(); step();
    const pier = g.salvage.sites.find((s) => s.story === 'pier');
    out.pier = { open: g.salvage.story.pier, noon: g.salvage.status(pier, 0, 12), late: g.salvage.status(pier, 0, 23.5) };
    g.trunk.clear();
    g.env.hour = 23.5;
    g.pause({ showMenu: false });
    g._storySalvaged(pier, 1);
    pack();
    clear(); step(); clear(); step();
    out.crates = { scotch: [...g.trunk.pieces.values()].filter((p) => p.kind === 'scotch').length, rum: [...g.trunk.pieces.values()].filter((p) => p.kind === 'rum').length, contraband: g._contraband() };
    // The hotel order: two cases of Scotch to Mr. Abernathy, after dark.
    const o = d.orders.find((x) => x.story === 'hotel');
    out.order = { wants: o.wants, night: o.night };
    visit(o.x, o.z);
    clear(); step(); clear(); step();
    out.hotel = !!d.flags['order:hotel'];
    g.trunk.clear();                                  // (the rum sold: nothing aboard to point the banner at a buyer)
    const wh = g.salvage.sites.find((s) => s.story === 'warehouse');
    g.env.hour = 22;
    g.pause({ showMenu: false });
    g._storySalvaged(wh, 1);
    clear(); step(); clear(); step();
    out.done = { clue: !!d.clues.manifests, tool: !!d.tools.launch, chapter: d.chapter, objective: objective() };
    return out;
  }, KIT);
  expect(r.open).toBe('Rum Row: Earn Mags O’Rourke’s full trust (★★★)');
  expect(r.pier).toEqual({ open: { night: false, window: [23, 3] }, noon: 'closed', late: 'ok' });
  expect(r.crates).toEqual({ scotch: 2, rum: 1, contraband: 3 });
  expect(r.order).toEqual({ wants: { scotch: 2 }, night: true });
  expect(r.hotel).toBe(true);
  expect(r.done).toEqual({ clue: true, tool: true, chapter: 7, objective: 'The choice: buy back the deed at Lexington Market, or take the letters to the Sun' });
  expect(problems).toEqual([]);
});

test('Mags’s launch: once a night after eleven at the pier, Scotch and rum for cash; imported liquor sells as the genuine article; the harbour patrol and the schooner', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear, pack } = eval(KIT);
    const { priceOf } = await import('/src/market.js');
    // (by the harbour, south is off the edge of the city: come at the pier from the north)
    const visit = (x, z) => { clear(); window.shine.teleport(x, z - 40, Math.PI); window.shine.step(0.2); window.shine.teleport(x, z, Math.PI); window.shine.step(0.3); };
    d.tools.launch = true; d.cash = 1000; g.trunk.clear();
    g.env.hour = 23.5; g.dredge.market.clock = 23.5;
    window.shine.step(0.6); clear();
    const pier = g.salvage.sites.find((s) => s.story === 'pier');
    const out = { open: g.salvage.story.pier };
    visit(pier.stopX, pier.stopZ);
    out.confirm = g.ui.isOpen('confirm');
    document.getElementById('confirm-yes').click();
    await new Promise((res) => setTimeout(res, 30));
    pack(); clear();
    out.bought = { cash: d.cash, aboard: g._contraband() };
    visit(pier.stopX, pier.stopZ);
    out.again = { confirm: g.ui.isOpen('confirm'), log: g.hud.log.join(' | ') };
    clear();
    // Imported: grade A at any blend, at a speakeasy.
    d.market.blend.scotch = { q: 0.1, bad: false };
    out.price = priceOf('drop:0', 'scotch', d.market) >= Math.round(160 * 1.4 * 0.8);
    // The harbour patrol: one more car by night on the waterfront, from chapter 7.
    const P = g.police, want = (harbour, x, z) => { P._harbour = harbour; for (const u of P.units) u.active = false; for (let k = 0; k < 6; k++) P._patrols({ x, z }, true); return P.units.filter((u) => u.active && u.mode === 'patrol').length; };
    out.patrol = [want(false, 150, 200), want(true, 150, 200), want(true, -150, -150)];
    // The schooner, at anchor off Canton, drawn when you're near.
    window.shine.teleport(pier.stopX, pier.stopZ, 0); window.shine.step(0.2); g.renderFrame();
    out.schooner = g.world.schooner.visible;
    window.shine.teleport(0, -600, 0); window.shine.step(0.2); g.renderFrame();
    out.far = g.world.schooner.visible;
    return out;
  }, KIT);
  expect(r.open).toEqual({ night: false, window: [23, 3] });
  expect(r.confirm).toBe(true);
  expect(r.bought).toEqual({ cash: 700, aboard: 3 });
  expect(r.again.confirm).toBe(false);
  expect(r.again.log).toContain('The launch has gone back out');
  expect(r.price).toBe(true);
  expect(r.patrol).toEqual([2, 3, 2]);
  expect(r.schooner).toBe(true);
  expect(r.far).toBe(false);
  expect(problems).toEqual([]);
});
