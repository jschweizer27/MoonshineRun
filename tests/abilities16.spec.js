import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, PAST, past, reloadGame } from './helpers.js';

// Stage 16c: the charged abilities (Smoke Screen, chapter 6's tool; Second Wind, chapter
// 5's), filled by what Otto does rather than a timer, and Act II's own story beats.

test('Smoke Screen fills with night miles driven with shine aboard (not by day, not empty), keeps through a reload, and waits for a chase', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, shine, toast } = eval(KIT);
    g._buildAbilities();
    const out = { chips: [...document.querySelectorAll('#abilities .ability')].map((b) => b.dataset.id) };
    const drive = (hour, n) => {
      if (n) shine(n); else g.trunk.clear();
      d.charge.smoke = 0;
      window.shine.teleport(0, -300, 0);
      g.env.hour = hour;
      let m = 0;
      for (let k = 0; k < 120; k++) { window.shine.step(1 / 60, { throttle: 1 }); m += Math.abs(g.player.speed) / 60; }
      return { charge: d.charge.smoke, m };
    };
    out.day = drive(12, 4).charge;
    out.empty = drive(22, 0).charge;
    const night = drive(22, 4);
    out.night = night.charge;
    out.expect = night.m / 4000;
    g._updateAbilities();
    out.chip = document.querySelector('#abilities [data-id="smoke"]').textContent;
    out.early = g.useAbility('smoke');
    out.earlyToast = toast();
    // Nearly full: a few more metres fill it, and it says so.
    d.charge.smoke = 0.9999;
    for (let k = 0; k < 30; k++) window.shine.step(1 / 60, { throttle: 1 });
    out.full = d.charge.smoke;
    out.ready = toast();
    out.chipFull = document.querySelector('#abilities [data-id="smoke"]').textContent;
    // Full, but nobody's after Otto: it keeps.
    out.calm = g.useAbility('smoke');
    out.calmToast = toast();
    out.kept = d.charge.smoke;
    g.dredge.save();
    return out;
  }, KIT);
  expect(r.chips).toEqual(['smoke', 'wind']);             // (Lead Foot and Sweet Talk are trust's gifts)
  expect(r.day).toBe(0);
  expect(r.empty).toBe(0);
  expect(r.night).toBeGreaterThan(0);
  expect(r.night).toBeCloseTo(r.expect, 3);
  expect(r.chip).toMatch(/^4 · Smoke Screen · \d+%$/);
  expect(r.early).toBe(false);
  expect(r.earlyToast).toContain('% charged');
  expect(r.full).toBe(1);
  expect(r.ready).toContain('Smoke Screen is ready');
  expect(r.chipFull).toBe('4 · Smoke Screen · ready');
  expect([r.calm, r.kept]).toEqual([false, 1]);
  expect(r.calmToast).toContain('save it for a chase');
  await reloadGame(page);
  await startRun(page, { loot: false });
  expect(await page.evaluate(() => window.shine.game.dredge.data.charge.smoke)).toBe(1);
  expect(problems).toEqual([]);
});

test('Smoke Screen in a chase: the heat drops a star, the cars behind lose sight for its seconds, smoke pours out; 4 and the d-pad’s left fire it; nothing compiles and no light is added', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 6);
  const chase = `(g) => {
    g.police.reset();
    g.player.place(0, -600, 0);
    g.env.hour = 22;
    for (const e of g.police.alert(g.player.position, 2, { hold: 0 })) g._onPolice(e);
    for (let k = 0; k < 60; k++) window.shine.step(1 / 60, {});
    g.dredge.data.charge.smoke = 1;
  }`;
  const r = await page.evaluate(({ KIT, chase }) => {
    const { g, d, shine, toast } = eval(KIT);
    g._buildAbilities();
    shine(4);
    g.renderFrame();
    const info0 = window.shine.renderInfo();
    eval(chase)(g);
    const out = { tier0: g.police.tier, cars: g.police.chasing };
    const cursor0 = g.particles.smoke.cursor;
    out.used = g.useAbility('smoke');
    out.toast = toast();
    out.tier = g.police.tier;
    out.blind = g.police.blind;
    out.charge = d.charge.smoke;
    out.puffs = (g.particles.smoke.cursor - cursor0 + g.particles.smoke.n) % g.particles.smoke.n;
    // For its seconds nobody sees the truck, and the smoke keeps pouring.
    let saw = false;
    for (let k = 0; k < 4 * 60; k++) { window.shine.step(1 / 60, {}); if (g.police.units.some((u) => u.active && u.sees)) saw = true; }
    out.saw = saw;
    out.chip = document.querySelector('#abilities [data-id="smoke"]').textContent;
    window.shine.step(1.5, {});
    out.after = g.police.blind;
    g.renderFrame();
    const info = window.shine.renderInfo();
    out.flat = { programs: info.programs - info0.programs, geometries: info.geometries - info0.geometries, lights: info.lights, calls: info.calls };
    // The key: 4.
    eval(chase)(g);
    out.tierKey0 = g.police.tier;
    return out;
  }, { KIT, chase });
  expect(r.tier0).toBe(2);
  expect(r.cars).toBeGreaterThan(0);
  expect(r.used).toBe(true);
  expect(r.toast).toContain('Smoke Screen');
  expect(r.tier).toBe(1);
  expect(r.blind).toBeGreaterThan(4.9);
  expect(r.charge).toBe(0);
  expect(r.puffs).toBeGreaterThan(0);
  expect(r.saw).toBe(false);
  expect(r.chip).toMatch(/^4 · Smoke Screen · (on|0%)$/);
  expect(r.after).toBe(0);
  expect(r.flat).toMatchObject({ programs: 0, geometries: 0, lights: 12 });
  expect(r.flat.calls).toBeLessThan(60);
  await page.keyboard.press('Digit4');
  expect(await page.evaluate(() => ({ tier: window.shine.game.police.tier, charge: window.shine.game.dredge.data.charge.smoke }))).toEqual({ tier: r.tierKey0 - 1, charge: 0 });
  // The pad: the d-pad's left.
  const pad = await page.evaluate(({ KIT, chase }) => {
    const { g } = eval(KIT);
    eval(chase)(g);
    const before = g.police.tier;
    let left = false;
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 14 && left, value: i === 14 && left ? 1 : 0 })) }];
    g.input.poll();
    left = true; g.input.poll(); left = false; g.input.poll();
    return { before, after: g.police.tier, charge: g.dredge.data.charge.smoke };
  }, { KIT, chase });
  expect(pad).toEqual({ before: 2, after: 1, charge: 0 });
  expect(problems).toEqual([]);
});

test('Second Wind fills a third with each delivery and steadies frayed nerves when full (not steady ones); 5 and the right stick’s click fire it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 5);
  const r = await page.evaluate((KIT) => {
    const { g, d, toast } = eval(KIT);
    g._buildAbilities();
    d.charge.wind = 0;
    const deliver = () => {
      const o = { id: `t-${Math.random()}`, who: 'kessler', name: 'Gus Kessler', place: 'Highlandtown', wants: {}, pay: 10, call: true, x: 0, z: 0 };
      d.orders.push(o);
      g._deliver(o, { grade: 'B', tainted: false });
      return +d.charge.wind.toFixed(3);
    };
    const out = { fills: [deliver(), deliver(), deliver()], toast: toast() };
    g._updateAbilities();
    out.chip = document.querySelector('#abilities [data-id="wind"]').textContent;
    d.nerves = 0.95;
    out.steady = g.useAbility('wind');
    out.steadyToast = toast();
    d.nerves = 0.2;
    out.used = g.useAbility('wind');
    out.nerves = d.nerves;
    out.charge = d.charge.wind;
    out.empty = g.useAbility('wind');
    // Charged again for the key and the pad.
    d.charge.wind = 1; d.nerves = 0.2;
    return out;
  }, KIT);
  expect(r.fills).toEqual([0.333, 0.667, 1]);
  expect(r.toast).toContain('Second Wind is ready');
  expect(r.chip).toBe('5 · Second Wind · ready');
  expect(r.steady).toBe(false);
  expect(r.steadyToast).toContain('Otto’s steady');
  expect([r.used, r.nerves, r.charge, r.empty]).toEqual([true, 1, 0, false]);
  await page.keyboard.press('Digit5');
  expect(await page.evaluate(() => ({ nerves: window.shine.game.dredge.data.nerves, charge: window.shine.game.dredge.data.charge.wind }))).toEqual({ nerves: 1, charge: 0 });
  const pad = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    d.charge.wind = 1; d.nerves = 0.2;
    let rs = false;
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 11 && rs, value: i === 11 && rs ? 1 : 0 })) }];
    g.input.poll();
    rs = true; g.input.poll(); rs = false; g.input.poll();
    return { nerves: d.nerves, charge: d.charge.wind };
  });
  expect(pad).toEqual({ nerves: 1, charge: 0 });
  // The controls list names both.
  const keys = await page.evaluate(async () => {
    const { ACTIONS, DEFAULT_BINDINGS } = await import('/src/settings.js');
    return { names: ACTIONS.filter(([a]) => a === 'ability4' || a === 'ability5').map(([, n]) => n), keys: [DEFAULT_BINDINGS.ability4, DEFAULT_BINDINGS.ability5] };
  });
  expect(keys).toEqual({ names: ['Smoke Screen', 'Second Wind'], keys: [['Digit4'], ['Digit5']] });
  expect(problems).toEqual([]);
});

test('Act II’s beats: each plays on its own trigger only, none on a fresh save or a whole story’s save, once, and never in a chase', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (PAST) => {
    const { BEATS } = await import('/src/story.js');
    window.__chapters = await import('/src/chapters.js');
    const g = window.shine.game, d = g.dredge.data;
    const ACT2 = ['sedans', 'mrv', 'launch', 'scotch', 'hollow', 'brauns', 'frayed'];
    const fired = () => ACT2.filter((id) => BEATS[id].when(d));
    const out = { fresh: fired() };
    eval(PAST)(g, 9);
    out.past = fired();
    const t = {};
    const each = (id, set, unset) => { set(); t[id] = fired(); unset(); };
    each('sedans', () => { d.once.rivals = 4; }, () => { delete d.once.rivals; });
    d.lore['diary-1919'] = true; d.stepTimes.records = 100; d.stats.playSeconds = 130;
    out.mrvSoon = fired();
    each('mrv', () => { d.stats.playSeconds = 170; }, () => { delete d.lore['diary-1919']; });
    each('launch', () => { d.once.launch = 7; }, () => { delete d.once.launch; });
    each('scotch', () => { d.codex.rum = { n: 1, best: 120 }; }, () => { delete d.codex.rum; });
    d.flags.hollowStill = true; d.flags.brauns = true;
    out.opNoDawn = fired();
    each('hollow', () => { d.once.hollow = 8; }, () => { delete d.once.hollow; });
    each('brauns', () => { d.once.brauns = 8; }, () => { delete d.once.brauns; });
    each('frayed', () => { d.nerves = 0.2; }, () => { d.nerves = 1; });
    d.chapter = 4; d.nerves = 0.2;
    out.frayedAct1 = fired();
    out.t = t;
    out.order = Object.keys(BEATS).slice(-7);
    return out;
  }, PAST);
  expect(r.fresh).toEqual([]);
  expect(r.past).toEqual([]);
  expect(r.mrvSoon).toEqual([]);
  expect(r.opNoDawn).toEqual([]);
  expect(r.frayedAct1).toEqual([]);
  for (const id of ['sedans', 'mrv', 'launch', 'scotch', 'hollow', 'brauns', 'frayed']) expect(r.t[id]).toEqual([id]);
  expect(r.order).toEqual(['sedans', 'mrv', 'launch', 'scotch', 'hollow', 'brauns', 'frayed']);
  expect(problems).toEqual([]);
});

test('with the story on, a beat waits out a chase: Abernathy’s word on the Scotch plays once the heat’s off, once', async ({ page }) => {
  const problems = await openGame(page, '&story&police');
  await page.click('#start-btn');
  const skip = async () => { for (let k = 0; k < 6; k++) { if (!(await page.evaluate(() => !document.getElementById('dialog').classList.contains('hidden')))) { await page.evaluate(() => window.shine.step(0.6)); continue; } await page.click('#dialog-skip'); } };
  await skip();
  const chase = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data, dialog = () => !document.getElementById('dialog').classList.contains('hidden');
    g.renderer.setAnimationLoop(null);
    const L = g.loot; L.active.fill(0); L.timer.fill(1e9); L.rareIn = 1e9;
    for (const e of g.police.alert(g.player.position, 2, { hold: 30 })) g._onPolice(e);
    d.codex.scotch = { n: 1, best: 160 };
    window.shine.step(1.2, {});
    const out = { inChase: dialog(), seen: !!d.story.scotch };
    g.police.reset();
    window.shine.step(1.2, {});
    out.after = dialog();
    out.face = document.getElementById('dialog-face').textContent;
    return out;
  });
  expect(chase).toEqual({ inChase: false, seen: false, after: true, face: 'MA' });
  await page.click('#dialog-skip');
  expect(await page.evaluate(() => { window.shine.step(1.2, {}); return { seen: !!window.shine.game.dredge.data.story.scotch, again: !document.getElementById('dialog').classList.contains('hidden') }; })).toEqual({ seen: true, again: false });
  expect(problems).toEqual([]);
});
