import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past, screenshot } from './helpers.js';

// Stage 15c: it shows and sounds right. News that came under a screen comes again after it,
// winter looks and sounds like winter, Vail's sedans run dark, the clock wears Otto's nerves,
// and the notebook's sections are a button away.

test('news under a screen comes again when it closes (the latest first), and a cash pop with it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, clear } = eval(KIT);
    g.pause({ showMenu: false });
    g.openNotebook();
    g.hud.toast('First news, under the notebook', 'gold', 3000);
    g.hud.toast('Second news, under the notebook', 'red', 3000);
    g.hud.toast('A passing word', '', 1500);
    g.hud.cashPop('+$50');
    const held = g.hud._held.map((h) => h.text);
    clear();
    const t = document.getElementById('toast');
    return { held, shown: t.textContent, on: t.classList.contains('show'), queued: g.hud._queue.map((q) => q.text), pop: document.getElementById('cash-pop').textContent, left: g.hud._held.length };
  }, KIT);
  expect(r.held).toEqual(['First news, under the notebook', 'Second news, under the notebook']);
  expect(r).toMatchObject({ shown: 'Second news, under the notebook', on: true, pop: '+$50', left: 0 });
  expect(r.queued).toContain('First news, under the notebook');
  expect(problems).toEqual([]);
});

test('winter: snow falls in flecks without the rain’s hiss or crickets, the roads aren’t wet, the woods frost over; nothing compiles', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const before = await page.evaluate(() => { const g = window.shine.game; g.renderer.setAnimationLoop(null); return window.shine.renderInfo(); });
  await past(page, 5);
  const r = await page.evaluate((KIT) => {
    const { g, step, clear } = eval(KIT), w = g.world, e = g.env;
    step(); clear(); step(); clear();
    window.shine.teleport(-60, -560, 0);
    e.weather = 'rain'; e.wet = 1; e.hour = 23;
    window.shine.step(0.5);
    g.renderFrame();
    const d = e.drops, C = w.crownFrost;
    return {
      winter: e.winter, flake: +(d[4] - d[1]).toFixed(2), rain: g.audio.last.rain01, snow: g.audio.last.snow01, crickets: g.audio.last.crickets,
      joints: w.roadMaterial.normalScale.x, crowns: C.attr.array[0] === C.snow[0] && C.attr.array[0] !== C.base[0],
      info: window.shine.renderInfo(),
    };
  }, KIT);
  await screenshot(page, 'winter-snowfall');
  expect(r.winter).toBe(true);
  expect(r.flake).toBeLessThan(0.2);
  expect(r).toMatchObject({ rain: 0, snow: 1, crickets: false, joints: 1, crowns: true });
  expect(r.info.programs).toBe(before.programs);
  expect(r.info.geometries).toBe(before.geometries);
  expect(r.info.lights).toBe(12);
  expect(problems).toEqual([]);
});

test('the clock wears Otto’s nerves; Vail’s sedans run dark; the notebook’s sections are a button away', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, shine } = eval(KIT);
    clear();
    d.nerves = 0.2;
    window.shine.step(0.2);
    const out = { nerves: document.getElementById('clock').dataset.nerves };
    d.nerves = 1;
    g.player.place(0, -600, 0); shine(4); g.env.hour = 22; g.env.hoursPerSecond = 0.025; g._rivalRng = () => 0;
    g._rivals(1 / 60, true);
    window.shine.step(0.2);
    const a = g.police.lamps.instanceColor.array;
    out.dark = g.police.quiet && a[0] === 0 && a[1] === 0;
    return out;
  }, KIT);
  expect(r).toEqual({ nerves: 'frayed', dark: true });
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.police.reset(); g._hijackOn = false; g.openNotebook(); });
  const tabs = page.locator('#notebook-tabs button');
  await expect(tabs.first()).toHaveText('CHAPTER');
  await expect(page.locator('#notebook-tabs')).toContainText('RECIPES');
  await page.click('#notebook-tabs [data-jump="recipes"]');
  const nb = await page.evaluate(() => ({ scrolled: document.getElementById('notebook-body').scrollTop > 0, reach: window.shine.game.ui._focusables().some((b) => b.dataset.jump === 'recipes') }));
  expect(nb).toEqual({ scrolled: true, reach: true });
  expect(problems).toEqual([]);
});
