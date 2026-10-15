import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, reloadGame } from './helpers.js';

// Stage 16b: a tool for each kind of site (the storm lantern for a search, the grappling hook
// for the shallows' sunk wrecks) and drop boxes left at sites to fill over the days.

test('the shallows: four sunk wrecks off Loch Raven and the docks; no grappling hook, no salvage; with one they pry open, and the ship’s bell is theirs alone', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear, toast } = eval(KIT);
    const { inLake } = await import('/src/loch.js');
    const { setOf, whereFound } = await import('/src/codex.js');
    const { eventFor } = await import('/src/market.js');
    const { CONFIG } = await import('/src/config.js');
    const c = g.world.collision, deep = g.salvage.sites.filter((s) => s.deep);
    const out = {
      n: deep.length, kinds: [...new Set(deep.map((s) => s.kind))], ids: deep.map((s) => s.id),
      loch: deep.filter((s) => s.x > 500).length, docks: deep.filter((s) => s.z > 200).length,
      stops: deep.every((s) => !c.resolveCircle(s.stopX, s.stopZ, 1.8).hit && !inLake(s.stopX, s.stopZ)),
      apart: deep.every((s) => g.salvage.sites.every((o) => o === s || Math.hypot(o.x - s.x, o.z - s.z) > 24)),
    };
    // (from the north: the docks' water is south of their stops)
    const go = (s) => { clear(); window.shine.teleport(s.stopX, s.stopZ - 40, 0); window.shine.step(0.2); window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.3); };
    const site = deep[0];
    g.env.hour = 12; g.trunk.clear(); g._updateTrunkPill(); d.cash = 1000;
    go(site);
    out.without = { open: g.ui.top?.id || null, toast: toast() };
    g.buySupply('grapple', CONFIG.dredge.towns.find((t) => t.id === 'monkton'));
    go(site);
    out.with = { open: g.ui.top?.id || null, game: g.salvageScreen?.game.game };
    clear();
    g.pause({ showMenu: false });
    g._onSalvaged(site, 1);
    out.piece = g.trunkScreen.hand?.kind;
    clear();
    // The codex: the bell is found only here, so the set waits for it.
    d.codex = {}; delete d.flags['set:shallows'];
    out.set = setOf('shallows');
    out.where = whereFound('bell');
    g._finds(['keg', 'coil', 'barrel', 'bottle-case']);
    out.before = !!d.flags['set:shallows'];
    g._finds(['bell']);
    out.after = !!d.flags['set:shallows'];
    // Never a market day's pick.
    out.event = Array.from({ length: 400 }, (_, k) => eventFor(k + 1)?.kind).includes('bell');
    return out;
  }, KIT);
  expect(r.n).toBe(4);
  expect(r.kinds).toEqual(['shallows']);
  expect(r.ids).toEqual(['deep:0', 'deep:1', 'deep:2', 'deep:3']);
  expect(r).toMatchObject({ loch: 2, docks: 2, stops: true, apart: true });
  expect(r.without.open).toBe(null);
  expect(r.without.toast).toContain('you need a grappling hook');
  expect(r.with).toEqual({ open: 'salvage', game: 'pry' });
  expect(r.set).toContain(r.piece);
  expect(r.set).toContain('bell');
  expect(r.where).toEqual(['shallows']);
  expect([r.before, r.after]).toEqual([false, true]);
  expect(r.event).toBe(false);
  expect(problems).toEqual([]);
});

test('the storm lantern: in the trunk, a search’s goods glint longer and its lamp lasts longer; a pry is the same', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { CONFIG } = await import('/src/config.js');
    const { newSearch, searchGlint, stepSearch } = await import('/src/salvage.js');
    const S = CONFIG.dredge.salvage.search, L = CONFIG.dredge.gear.lantern;
    const farm = g.salvage.sites.find((s) => s.kind === 'farmhouse'), wreck = g.salvage.sites.find((s) => s.kind === 'wreck');
    const look = (s) => { g.pause({ showMenu: false }); g.openSalvage(s); const x = g.salvageScreen.game; const o = { glint: x.glint, seconds: x.seconds, game: x.game }; clear(); return o; };
    g.trunk.clear(); d.cash = 1000;
    const out = { base: look(farm) };
    g.buySupply('lantern', CONFIG.dredge.towns.find((t) => t.id === 'monkton'));
    out.lit = look(farm);
    out.pry = look(wreck).glint;
    // The longer glint and lamp, played out.
    const s = newSearch(Math.random, L);
    stepSearch(s, S.glint + 0.3);
    out.glinting = searchGlint(s);
    stepSearch(s, S.seconds + 0.6);
    out.burning = !s.done;
    stepSearch(s, 2);
    out.out = s.done;
    out.S = S; out.L = L;
    return out;
  }, KIT);
  expect(r.base).toEqual({ glint: r.S.glint, seconds: r.S.seconds, game: 'search' });
  expect(r.lit.glint).toBeCloseTo(r.S.glint + r.L.glint, 5);
  expect(r.lit.seconds).toBeCloseTo(r.S.seconds + r.L.seconds, 5);
  expect(r.pry).toBe(undefined);
  expect([r.glinting, r.burning, r.out]).toEqual([true, true, true]);
  expect(problems).toEqual([]);
});

test('drop boxes: left at a site (asked once a day there), a piece a day up to four, emptied into the trunk or taken back; three at most; kept through a reload; drawn with nothing compiled', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  // Answer the confirm that's up (yes or no), then let the game run on.
  const answer = (yes) => page.evaluate(async (yes) => {
    const text = document.getElementById('confirm-text').textContent, up = window.shine.game.ui.top?.id === 'confirm';
    document.getElementById(yes ? 'confirm-yes' : 'confirm-no').click();
    await new Promise((r) => setTimeout(r, 0));
    return up ? text : null;
  }, yes);
  await page.evaluate(async (KIT) => {
    const { g, d } = eval(KIT);
    const { CONFIG } = await import('/src/config.js');
    g.renderer.setAnimationLoop(null);
    g.renderFrame();
    window.__info0 = window.shine.renderInfo();
    window.__sites = g.salvage.sites.filter((s) => !s.story && !s.deep && !s.night).slice(0, 4);
    g.env.hour = 12; g.trunk.clear(); d.cash = 2000;
    const monkton = CONFIG.dredge.towns.find((t) => t.id === 'monkton');
    for (let k = 0; k < 3; k++) g.buySupply('dropbox', monkton);
    window.__day = Math.floor(d.market.clock / 24);
  }, KIT);
  const at = (i) => page.evaluate(({ KIT, i }) => { const { visit } = eval(KIT), s = window.__sites[i]; visit(s.stopX, s.stopZ); return window.shine.game.ui.top?.id || null; }, { KIT, i });
  // Three left, one at each of three sites.
  const placed = [];
  for (let i = 0; i < 3; i++) {
    const up = await at(i);
    placed.push([up, await answer(true)]);
  }
  expect(placed.map((p) => p[0])).toEqual(['confirm', 'confirm', 'confirm']);
  expect(placed[0][1]).toContain('Leave the drop box at the');
  const left = await page.evaluate((KIT) => {
    const { g, d, step, clear } = eval(KIT);
    step(0.3);                                     // still stopped there: the site opens next
    const out = { boxes: d.boxes.map((b) => b.site), aboard: [...g.trunk.pieces.values()].filter((p) => p.kind === 'dropbox').length, site: g.ui.top?.id || null };
    clear();
    out.radar = g._mapMarkers().filter((m) => m.kind === 'box').length;
    out.drawn = g.salvage.mesh.count - g.salvage.sites.length;
    const a = g.salvage.mesh.instanceMatrix.array;
    out.shown = [0, 1, 2].map((b) => { const o = (g.salvage.sites.length + b) * 16; return Math.hypot(a[o], a[o + 1], a[o + 2]) > 0; });
    return out;
  }, KIT);
  expect(left.boxes).toEqual(await page.evaluate(() => window.__sites.slice(0, 3).map((s) => s.id)));
  expect(left).toMatchObject({ aboard: 0, site: 'salvage', radar: 3, drawn: 3, shown: [true, true, true] });
  // A fourth box aboard: no room for it (three at most), so the site just opens.
  await page.evaluate(async (KIT) => {
    const { g, clear } = eval(KIT);
    const { CONFIG } = await import('/src/config.js');
    clear();
    g.buySupply('dropbox', CONFIG.dredge.towns.find((t) => t.id === 'monkton'));
  }, KIT);
  expect(await at(3)).toBe('salvage');
  // Back at the first the same day: nothing in it yet, and no asking again.
  expect(await at(0)).toBe('salvage');
  // Two days on: two pieces of the site's goods; left to gather more, they go in the trunk.
  const fill = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { boxFill } = await import('/src/salvage.js');
    clear();
    g.trunk.clear(); g._updateTrunkPill();
    const b = d.boxes[0], day = window.__day;
    return [1, 3, 9].map((k) => boxFill(b, day + k)).concat(boxFill(b, day));
  }, KIT);
  expect(fill).toEqual([1, 3, 4, 0]);
  await page.evaluate(() => { const d = window.shine.game.dredge.data; d.market.clock += 48; });
  expect(await at(0)).toBe('confirm');
  const held = await answer(false);
  expect(held).toContain('held');
  const got = await page.evaluate(async (KIT) => {
    const { g, d, pack, step, clear } = eval(KIT);
    const { setOf } = await import('/src/codex.js');
    const hand = g.trunkScreen.hand?.kind;
    pack();
    const kinds = [...g.trunk.pieces.values()].map((p) => p.kind);
    const out = { hand, n: kinds.length, ok: kinds.every((k) => setOf(window.__sites[0].kind).includes(k)), since: d.boxes[0].since - window.__day, boxed: d.stats.boxed, boxes: d.boxes.length };
    step(0.3);
    out.next = g.ui.top?.id || null;                // then the site itself
    clear();
    return out;
  }, KIT);
  expect(got).toMatchObject({ n: 2, ok: true, since: 2, boxed: 2, boxes: 3, next: 'salvage' });
  // Kept through a reload, and drawn again.
  await reloadGame(page);
  await startRun(page, { loot: false });
  const kept = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    return { boxes: d.boxes.length, same: g.salvage.boxes === d.boxes, radar: g._mapMarkers().filter((m) => m.kind === 'box').length };
  });
  expect(kept).toEqual({ boxes: 3, same: true, radar: 3 });
  // A day on: taken back, it rides in the trunk again with what it held.
  await page.evaluate(() => { const g = window.shine.game, d = g.dredge.data; g.trunk.clear(); g.env.hour = 12; d.market.clock += 24; });
  expect(await at(1)).toBe('confirm');
  await answer(true);
  const back = await page.evaluate((KIT) => {
    const { g, d, pack, clear } = eval(KIT);
    pack();
    const out = { boxes: d.boxes.map((b) => b.site), box: [...g.trunk.pieces.values()].some((p) => p.kind === 'dropbox') };
    clear();
    g.renderFrame();
    const info = window.shine.renderInfo(), i0 = window.__info0;
    out.flat = { programs: info.programs - i0.programs, geometries: info.geometries - i0.geometries, lights: info.lights };
    return out;
  }, KIT);
  expect(back.boxes).toEqual(await page.evaluate(() => [window.__sites[0].id, window.__sites[2].id]));
  expect(back.box).toBe(true);
  expect(back.flat.lights).toBe(12);
  expect(problems).toEqual([]);
});
