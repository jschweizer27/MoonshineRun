import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT } from './helpers.js';

// Stage 9a, after DREDGE: Otto's nerves wear down on the night roads and play tricks when
// frayed; a sleep at the barn sets him right. Working a site takes game time. Both run with
// the clock (?test&time).

test('nerves: the night wears them down (less with spotlamps), the clock says so, frayed nerves bring phantom cars, a siren and a wobble, and sleep or dawn set Otto right', async ({ page }) => {
  const problems = await openGame(page, '&time');
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, d, clear } = eval(KIT);
    g.renderer.setAnimationLoop(null);
    const night = (n) => { d.nerves = n; g.env.hour = 22; d.market.clock = 22; };
    const out = {};
    // A game hour and a half of night on the road (the clock run ten times fast, to spare
    // the frames).
    const hps = g.env.hoursPerSecond;
    g.env.hoursPerSecond = hps * 10;
    night(1); window.shine.step(6);
    out.drained = Math.round((1 - d.nerves) * 1000) / 1000;
    night(1); d.upgrades.lamps = 3; window.shine.step(6); d.upgrades.lamps = 0;
    out.lamps = Math.round((1 - d.nerves) * 1000) / 1000;
    // Past a mark: a word from Otto, and on the clock.
    night(0.705); window.shine.step(0.5);
    g.env.hoursPerSecond = hps;
    out.uneasy = { log: g.hud.log.join(' | '), clock: g._clockText() };
    // Rattled: phantom Bureau cars on the radar.
    night(0.45); g._phantomAt = 0; window.shine.step(0.1);
    out.phantoms = g._mapMarkers().filter((m) => m.phantom).length;
    // Frayed: a siren that isn't there, and the wheel won't sit still.
    night(0.2); g._sirenAt = 0; window.shine.step(0.1);
    out.siren = g._sirenUntil > g.time;
    const h0 = g.player.heading;
    g.player.place(g.player.position.x, g.player.position.z, 0);
    for (let k = 0; k < 90; k++) window.shine.step(1 / 60, { throttle: 0.6, steer: 0 });
    out.wobble = !!g._wobbleIn && Math.abs(g.player.heading) > 0.001;
    out.h0 = h0;
    // Dawn gives some back; a sleep at the barn all of it.
    d.nerves = 0.3; g.pause({ showMenu: false }); g._dawn(); clear();
    out.dawn = Math.round(d.nerves * 100) / 100;
    d.nerves = 0.2; g.env.hour = 10; d.market.clock = 34;
    return g.sleep('dusk').then((slept) => { out.slept = { slept, nerves: d.nerves }; return out; });
  }, KIT);
  expect(r.drained).toBeCloseTo(1.5 * 0.08, 2);
  expect(r.lamps).toBeCloseTo(1.5 * 0.08 * 0.55, 2);
  expect(r.uneasy.log).toContain('Otto’s uneasy');
  expect(r.uneasy.clock).toContain('Uneasy');
  expect(r.phantoms).toBe(1);
  expect(r.siren).toBe(true);
  expect(r.wobble).toBe(true);
  expect(r.dawn).toBe(0.55);
  expect(r.slept).toEqual({ slept: true, nerves: 1 });
  expect(problems).toEqual([]);
});

test('work takes time: a pry passes half an hour, a search three quarters, and dawn comes if the work runs into it', async ({ page }) => {
  const problems = await openGame(page, '&time');
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, d, clear } = eval(KIT);
    g.renderer.setAnimationLoop(null);
    const wreck = g.salvage.sites.find((s) => s.kind === 'wreck'), cellar = g.salvage.sites.find((s) => s.kind === 'cellar');
    const work = (site, hour) => {
      d.market.clock = 24 + hour; g.env.hour = hour;
      g.pause({ showMenu: false });
      g._onSalvaged(site, 0.6);
      const t = { clock: d.market.clock - 24, hour: g.env.hour };
      for (let k = 0; k < 6 && g.trunkScreen.isOpen; k++) g.trunkScreen.close();
      clear();
      return t;
    };
    const out = { pry: work(wreck, 22), search: work(cellar, 22) };
    out.dawn = work(cellar, 5.5);
    out.log = g.hud.log.join(' | ');
    return out;
  }, KIT);
  expect(r.pry).toEqual({ clock: 22.5, hour: 22.5 });
  expect(r.search).toEqual({ clock: 22.75, hour: 22.75 });
  expect(r.dawn).toEqual({ clock: 6.25, hour: 6.25 });
  expect(r.log).toContain('Dawn.');
  expect(problems).toEqual([]);
});
