import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 17 (the bug hunt): chases. A bust the Sheriff waives at the checkpoint isn't searched
// again on the spot; shaking Vail's men brings the Bureau's lamps and roadblocks back; the
// places that would hide a load or pass the hours wait till the chase is lost; news that comes
// between two screens is held for after them.

test('the Sheriff waives a checkpoint bust once: the truck still standing in the checkpoint isn’t searched again', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 4);
  const r = await page.evaluate((KIT) => {
    const { g, d, shine, clear } = eval(KIT);
    clear();
    Object.assign(d.flags, { bribery: true });
    d.trust.sheriff = 8; d.cash = 3000;
    shine(6);
    g.env.hour = 22; d.market.clock = Math.floor(d.market.clock / 24) * 24 + 22;
    const C = g.police.checkpoint;
    window.shine.teleport(C.x, C.z - 40, 0); window.shine.step(0.3);
    window.shine.teleport(C.x, C.z - 3, 0); window.shine.step(0.3);
    const first = { bribes: d.stats.bribes || 0, card: g.ui.top?.id || null };
    clear();
    for (let k = 0; k < 4; k++) { window.shine.step(0.5); clear(); }
    return { first, bribes: d.stats.bribes || 0, shine: g._contraband(), cash: d.cash };
  }, KIT);
  expect(r.first.bribes).toBe(1);
  expect(r.bribes).toBe(1);
  expect(r.shine).toBe(6);
  expect(problems).toEqual([]);
});

test('Vail’s men shaken (or smoked off), the Bureau’s chases have their lamps and roadblocks again', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, clear } = eval(KIT);
    clear();
    const p = g.player.position, out = {};
    // Lost: out of every car's sight long enough.
    g.police.alert(p, 1, { hold: 0, quiet: true });
    out.quiet = g.police.quiet;
    for (const u of g.police.units) if (u.active) g.police._deactivate(u);
    for (let k = 0; k < 14 && g.police.tier; k++) window.shine.step(0.5);
    out.lost = { tier: g.police.tier, quiet: g.police.quiet };
    // Smoked off.
    g.police.alert(p, 1, { hold: 0, quiet: true });
    g.police.smoke(5, p);
    out.smoked = { tier: g.police.tier, quiet: g.police.quiet };
    return out;
  }, KIT);
  expect(r).toEqual({ quiet: true, lost: { tier: 0, quiet: false }, smoked: { tier: 0, quiet: false } });
  expect(problems).toEqual([]);
});

test('in a chase a market won’t open (lose them first), and opens once they’re lost; news under a pause waits for the road', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, clear, toast } = eval(KIT);
    clear();
    const t = g._nearestMarket().town, out = {};
    window.shine.teleport(t.x, t.z + 60, Math.PI); window.shine.step(0.2);
    g.police.alert(g.player.position, 2, { hold: 30 });
    window.shine.teleport(t.x, t.z, Math.PI); window.shine.step(0.5);
    out.chased = { open: g.ui.top?.id || null, toast: toast() };
    g.police.reset();
    window.shine.teleport(t.x, t.z + 60, Math.PI); window.shine.step(0.2);
    window.shine.teleport(t.x, t.z, Math.PI); window.shine.step(0.3);
    out.after = g.ui.top?.id || null;
    clear();
    // News while paused between screens: held, then shown on the road.
    g.pause({ showMenu: false });
    g.hud.toast('A held piece of news', 'gold', 4000);
    g.hud.toast('Something said over it', '', 1000);
    out.held = toast();
    g.resume();
    out.shown = toast();
    return out;
  }, KIT);
  expect(r.chased.open).toBe(null);
  expect(r.chased.toast).toContain('lose them first');
  expect(r.after).toBe('market');
  expect(r.held).toBe('Something said over it');
  expect(r.shown).toBe('A held piece of news');
  expect(problems).toEqual([]);
});
