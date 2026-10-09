import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

// Watch the audio's sound calls (and still play them).
const SPY = `(a) => {
  const calls = [];
  for (const k of ['bell', 'knock', 'chime', 'cash', 'fanfare', 'moo', 'churchBell', 'whistle', 'blast', 'shipHorn']) {
    const f = a[k].bind(a);
    a[k] = (...args) => { calls.push([k, ...args].join(':')); return f(...args); };
  }
  return calls;
}`;

test('four tunes, each a well-formed song, and the radio fades from one to the next', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.enabled)).toBe(true);
  const r = await page.evaluate(async () => {
    const { TUNES } = await import('/src/music.js');
    const shape = Object.fromEntries(Object.entries(TUNES).map(([id, T]) => [id, {
      bars: T.bars.length === T.melody.length,
      steps: T.melody.every((m) => m.length === T.beats * 2),
      notes: T.melody.every((m) => m.every((n) => n == null || (Number.isInteger(n) && n >= 0 && n < 4))),   // chord tones (wrapping round a triad)
    }]));
    const a = window.shine.game.audio, R = a.music;
    const old = R.decks[R.cur];
    a.setTune('waltz', 0.3);
    const tune = R.tune, fresh = R.decks[R.cur] !== old;
    const at = R._bar * 6 + R._eighth;
    await new Promise((res) => setTimeout(res, 1500));
    return { ids: Object.keys(TUNES), shape, tune, fresh, moved: R._bar * 6 + R._eighth !== at, oldStopped: !old.playing, ctx: a.ctx.state };
  });
  expect(r.ids).toEqual(['stride', 'blues', 'waltz', 'rag']);
  for (const s of Object.values(r.shape)) expect(s).toEqual({ bars: true, steps: true, notes: true });
  expect(r.tune).toBe('waltz');
  expect(r.fresh).toBe(true);                 // the other player took it up
  expect(r.moved).toBe(true);                 // and it's playing
  expect(r.oldStopped).toBe(true);            // the old one stopped once faded out
  // R still turns the radio off and on.
  await page.keyboard.press('KeyR');
  expect(await page.evaluate(() => window.shine.game.audio.music.on)).toBe(false);
  await page.keyboard.press('KeyR');
  expect(await page.evaluate(() => window.shine.game.audio.music.on)).toBe(true);
  expect(problems).toEqual([]);
});

test('the tune follows the road: stride by day, the blues in the city at night, a waltz in the valley at night, a rag under Lead Foot', async ({ page }) => {
  await openGame(page);
  await startRun(page, { loot: false });
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.enabled)).toBe(true);
  const r = await page.evaluate(() => {
    const g = window.shine.game, out = {};
    const at = (hour, x, z, label) => {
      g.env.hour = hour; g.env.update(0, g.camera.position);
      window.shine.teleport(x, z, 0);
      window.shine.step(2.5);
      out[label] = [g._tuneFor(), g.audio.music.tune];
    };
    at(12, 0, 100, 'cityDay');
    at(23, 0, 100, 'cityNight');
    at(23, 0, -600, 'valleyNight');
    at(12, 0, -600, 'valleyDay');
    g.dredge.data.tools.leadfoot = true;
    g.useAbility('leadfoot');
    window.shine.step(0.2);
    out.leadFoot = [g._tuneFor(), g.audio.music.tune];
    window.shine.step(8);
    out.after = [g._tuneFor(), g.audio.music.tune];
    return out;
  });
  expect(r.cityDay).toEqual(['stride', 'stride']);
  expect(r.cityNight).toEqual(['blues', 'blues']);
  expect(r.valleyNight).toEqual(['waltz', 'waltz']);
  expect(r.valleyDay).toEqual(['stride', 'stride']);
  expect(r.leadFoot).toEqual(['rag', 'rag']);   // at once
  expect(r.after).toEqual(['stride', 'stride']);
});

test('a market rings its bell and the till is heard: a shop hushes the road instead of freezing the sound; the pause menu still freezes it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.enabled)).toBe(true);
  await page.evaluate((spy) => {
    const g = window.shine.game;
    window.__calls = eval(spy)(g.audio);
    g.trunk.place('crate', 0, 0);
    window.shine.teleport(0, 160, 0);
    window.shine.step(1, { throttle: 1 });              // the engine's going
    window.shine.teleport(-44, 48, 0); window.shine.step(0.3);
  }, SPY);
  await expect(page.locator('#market')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.ctx.state)).toBe('running');
  await page.click('#market-sell-all');
  const shop = await page.evaluate(async () => {
    const a = window.shine.game.audio;
    await new Promise((res) => setTimeout(res, 600));
    return { hushed: a.hushed, paused: a.paused, engine: a.engineGain.gain.value, calls: window.__calls.slice() };
  });
  expect(shop.hushed).toBe(true);
  expect(shop.paused).toBe(false);
  expect(shop.engine).toBeLessThan(0.005);              // the road's gone quiet
  expect(shop.calls).toEqual(['bell', 'cash']);         // the door, then the till
  await page.click('#market-done');
  expect(await page.evaluate(() => window.shine.game.audio.hushed)).toBe(false);
  // The pause menu: everything stops.
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.ctx.state)).toBe('suspended');
  expect(await page.evaluate(() => window.shine.game.audio.paused)).toBe(true);
  expect(problems).toEqual([]);
});

test('fanfares for a contact’s gift, a rare find and the deed, a chime for a job done, a knock at a speakeasy, and each town its own sounds', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await expect.poll(() => page.evaluate(() => window.shine.game.audio.enabled)).toBe(true);
  const r = await page.evaluate(async (spy) => {
    const { CONFIG } = await import('/src/config.js');
    const g = window.shine.game, a = g.audio, calls = eval(spy)(a);
    const n0 = calls.length;
    // A gift from a contact's trust (Mags O'Rourke's: Lead Foot), and word of a rare find.
    g.dredge.data.trust.orourke = 6;
    g._trustGifts();
    g._onRare({ type: 'rare', kind: CONFIG.dredge.loot.kinds.find((k) => k.rare), x: 0, z: -700 });
    const story = calls.slice(n0);
    // A knock at a speakeasy door.
    g.openMarket({ id: 'drop:0', name: 'Highlandtown Speakeasy', town: 'Highlandtown Speakeasy' }, { upgrades: false });
    g.ui.close('market'); g.resume();
    // Every sound plays without a fault.
    a.fanfare('deed'); a.chime(); a.moo(); a.churchBell(); a.whistle(); a.blast(); a.shipHorn();
    // Each town's sounds: the next one due, by place (and the quarry only by day).
    const town = (place, night = false) => {
      const k = calls.length;
      a._ambPlace = place; a._ambAt = 0;
      a.update({ speed01: 0, rpm01: 0, slip01: 0, rain01: 0, place, night, harbor01: 1 });
      return calls.slice(k).join(',');
    };
    return {
      story, knock: calls.includes('knock'),
      towns: { glyndon: town('Glyndon'), quarry: town('Cockeysville'), quarryNight: town('Cockeysville', true), harbour: town('Baltimore'), monkton: town('Monkton'), valley: town('Green Spring Valley') },
    };
  }, SPY);
  expect(r.story).toEqual(['fanfare:rank', 'fanfare:rare']);
  expect(r.knock).toBe(true);
  expect(r.towns.glyndon).toBe('whistle');
  expect(r.towns.quarry).toBe('blast');
  expect(r.towns.quarryNight).toBe('');
  expect(r.towns.harbour).toBe('shipHorn');
  expect(['moo', 'churchBell']).toContain(r.towns.monkton);
  expect(r.towns.valley).toBe('');
  expect(problems).toEqual([]);
});
