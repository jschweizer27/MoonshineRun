import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past, screenshot } from './helpers.js';

// Stage 14: Act II's winter (snow for rain, the county frosted, icy nights) and courting a
// contact for a side story from the notebook.

test('winter: from chapter 6 the rain comes down as snow, the county frosts over and the roads ice at night; nothing compiles and no light is added', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  // Grip on a dry road by day and at night, then in the rain at night.
  const GRIP = `(g) => {
    const at = (hour, wet) => { g.env.hour = hour; g.env.wet = wet; window.shine.step(0.05); g.env.wet = wet; return +g.env.effects.grip.toFixed(3); };
    return { day: at(12, 0), night: at(1, 0), rain: at(1, 1) };
  }`;
  const before = await page.evaluate(({ KIT, GRIP }) => {
    const { g } = eval(KIT), w = g.world;
    g.renderer.setAnimationLoop(null);
    g.env.weather = 'rain';
    return {
      winter: g.env.winter, grip: eval(GRIP)(g), clock: document.getElementById('clock').textContent,
      roof: w.frost[0].m.color.getHex(), field: w.snowField.tex.image === w.snowField.grass, info: window.shine.renderInfo(),
    };
  }, { KIT, GRIP });
  expect(before.winter).toBe(false);
  expect(before.grip).toEqual({ day: 1, night: 1, rain: 0.8 });
  expect(before.clock).toContain('· Rain');
  expect(before.field).toBe(true);

  await past(page, 5);
  const r = await page.evaluate(({ KIT, GRIP }) => {
    const { g, d, step, clear } = eval(KIT), w = g.world;
    step(); clear(); step();
    g.env.weather = 'rain';
    const grip = eval(GRIP)(g);
    // Out in the county, after dark, in the snow.
    window.shine.teleport(-60, -560, 0);
    g.env.hour = 22; g.env.wet = 1;
    window.shine.step(0.5);
    g.renderFrame();
    return {
      chapter: d.chapter, winter: g.env.winter, grip, clock: document.getElementById('clock').textContent,
      roof: w.frost[0].m.color.getHex(), snow: w.frost[0].snow.getHex(), field: w.snowField.tex.image === w.snowField.snow,
      flakes: g.env.rain.visible, info: window.shine.renderInfo(),
    };
  }, { KIT, GRIP });
  await screenshot(page, 'winter-county');
  expect(r.chapter).toBe(5);
  expect(r.winter).toBe(true);
  // Ice at night (none by day), and snow is less slippery than rain.
  expect(r.grip.day).toBe(1);
  expect(r.grip.night).toBeCloseTo(1 - 0.12, 2);
  expect(r.grip.rain).toBeGreaterThan(before.grip.rain - 0.12);
  expect(r.grip.rain).toBeLessThan(r.grip.night);
  expect(r.clock).toContain('· Snow');
  expect(r.roof).toBe(r.snow);
  expect(r.roof).not.toBe(before.roof);
  expect(r.field).toBe(true);
  expect(r.flakes).toBe(true);
  expect(r.info.programs).toBe(before.info.programs);
  expect(r.info.geometries).toBe(before.info.geometries);
  expect(r.info.lights).toBe(12);
  expect(r.info.calls).toBeLessThan(60);

  // A save from before Act II (a new game in another slot) thaws it all again.
  const thaw = await page.evaluate((KIT) => {
    const { g, d } = eval(KIT), w = g.world;
    d.chapter = 2;
    g._applyWinter();
    return { winter: g.env.winter, roof: w.frost[0].m.color.getHex(), field: w.snowField.tex.image === w.snowField.grass };
  }, KIT);
  expect(thaw).toEqual({ winter: false, roof: before.roof, field: true });
  expect(problems).toEqual([]);
});

test('COURT a side story in the notebook: its contact posts an order at your pace before their trust opens it, then the banner follows it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 4);                             // chapter 5's steps want no contact of their own
  await page.evaluate((KIT) => { const { step, clear } = eval(KIT); step(); clear(); step(); clear(); }, KIT);
  await page.evaluate(() => window.shine.game.openNotebook());
  await expect(page.locator('#notebook-body')).toContainText('Widow Carroll has something on their mind');
  await page.click('[data-court="note"]');
  await expect(page.locator('[data-court="note"]')).toHaveText('COURTING');
  const r = await page.evaluate((KIT) => {
    const { g, d, clear } = eval(KIT);
    clear();
    const jobs = g._jobs(), mine = () => jobs.offers().filter((o) => o.who === 'carroll' && /-c\d+$/.test(o.id)).map((o) => o.id.split('-')[1]);
    const out = { follow: d.follow, courted: g._courted(), first: mine() };
    d.delivered.carroll = 1;                       // one delivered: a fresh one
    out.next = mine();
    return out;
  }, KIT);
  expect(r).toEqual({ follow: 'note', courted: 'carroll', first: ['c0'], next: ['c1'] });
  // Her trust comes: the story opens, and it's the one the banner follows.
  const f = await page.evaluate((KIT) => {
    const { g, d, step, clear, objective } = eval(KIT);
    d.trust.carroll = 2;
    step(); clear(); step();
    return { open: !!d.arcs.note?.open, follow: d.follow, courted: g._courted(), title: g._followed().title, objective: objective() };
  }, KIT);
  expect(f).toMatchObject({ open: true, follow: 'note', courted: null, title: 'The Widow’s Note' });
  expect(f.objective).toContain('Widow Carroll');
  expect(problems).toEqual([]);
});
