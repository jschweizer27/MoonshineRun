import { test, expect } from '@playwright/test';
import { openGame, startRun } from './helpers.js';

// Plays a batch through `step(dt, stoke)` and `press()`: a steady fire, then cuts at the
// recipe's marks (each shifted by `cut`), then the proof read at the line (shifted by
// `proof`). `cut: [null, ...]` skips a press.
const PLAY = `(b, step, press, { cut = [0, 0], proof = 0, fire = 'steady' } = {}) => {
  const stoke = { steady: () => b.temp < b.center, cold: () => false, hot: () => true }[fire];
  while (b.phase === 'fire') step(1 / 60, stoke());
  let k = 0;
  while (b.phase === 'cuts') {
    step(1 / 120);
    const want = cut[k] == null ? null : b.cuts.marks[k] + cut[k];
    if (k < 2 && (want == null ? b.cuts.pos > b.cuts.marks[k] : b.cuts.pos >= want)) { if (want != null) press(); k++; }
  }
  let prev = b.proof.pos;
  while (b.phase === 'proof') {
    step(1 / 240);
    const at = b.proof.line + proof, now = b.proof.pos;
    if (b.proof.t > 0.5 && (prev - at) * (now - at) <= 0) press();
    prev = now;
  }
  return b;
}`;

test('brewing logic: three phases make the grade; an early cut is poison; recipes and coils change the margins; blends mix by crates', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async (PLAY) => {
    const M = await import('/src/brew.js');
    const { CONFIG } = await import('/src/config.js');
    const { Trunk } = await import('/src/trunk.js');
    const { priceOf } = await import('/src/market.js');
    const play = eval(PLAY);
    const R = (id) => M.RECIPES.find((x) => x.id === id);
    const run = (id, opts, level = 1) => { const b = M.newBatch(level, R(id)); play(b, (dt, s) => M.stepBatch(b, dt, s), () => M.pressBatch(b), opts); return b; };
    const out = (b) => ({ q: +M.quality(b).toFixed(3), grade: M.gradeOf(M.quality(b), M.isBad(b)), bad: M.isBad(b), crates: M.yieldFor(M.quality(b)) });
    const fireOnly = (fire, level = 1) => { const b = M.newBatch(level, R('corn-shine')); while (b.phase === 'fire') M.stepBatch(b, 1 / 60, { steady: b.temp < b.center, cold: false, hot: true }[fire]); return M.fireScore(b); };
    const fireWide = (() => { const b = M.newBatch(3, R('corn-shine')); while (b.phase === 'fire') M.stepBatch(b, 1 / 60, b.temp < b.center - 0.08); return M.fireScore(b); })();
    const fireNarrow = (() => { const b = M.newBatch(1, R('corn-shine')); while (b.phase === 'fire') M.stepBatch(b, 1 / 60, b.temp < b.center - 0.08); return M.fireScore(b); })();
    // Applejack burns hot: a second of stoking climbs further.
    const climb = (id) => { const b = M.newBatch(1, R(id)); const t0 = b.temp; M.stepBatch(b, 1, true); return b.temp - t0; };
    // A held key at the start of the cuts doesn't count.
    const lead = M.newBatch(1, R('corn-shine')); while (lead.phase === 'fire') M.stepBatch(lead, 1 / 60, false);
    const leadPress = M.pressBatch(lead);
    // Blends: 2 crates at 0.9 on hand, 2 more at 0.5: 0.7; a bad one taints it; none on hand starts afresh.
    const blends = {};
    M.blend(blends, 'corn-shine', 0, 2, 0.9, false);
    const mixed = M.blend(blends, 'corn-shine', 2, 2, 0.5, false).q;
    const tainted = M.blend(blends, 'corn-shine', 4, 1, 0.95, true).bad;
    const fresh = M.blend(blends, 'corn-shine', 0, 3, 0.85, false);
    const price = (g) => priceOf('drop:0', 'corn-shine', { sold: {}, clock: 0, blend: { 'corn-shine': g } });
    // Ingredients come from the stash first.
    const corn = R('corn-shine');
    const t = new Trunk(); t.place('sack', 0, 0); t.place('jugs', 2, 0);
    const stash = { jugs: 1 };
    const before = M.missing(corn, { sack: 1 });
    M.consume(corn, t, stash);
    return {
      steady: fireOnly('steady'), cold: fireOnly('cold'), hot: fireOnly('hot'), fireWide, fireNarrow,
      perfect: out(run('corn-shine', {})), early: out(run('corn-shine', { cut: [-0.12, 0] })), late: out(run('corn-shine', { cut: [0, 0.1] })),
      none: out(run('corn-shine', { cut: [null, null] })), offProof: out(run('corn-shine', { proof: 0.2 })),
      cornSlip: out(run('corn-shine', { cut: [-0.045, 0] })), ryeSlip: out(run('rye', { cut: [-0.045, 0] })), ryeSlip3: out(run('rye', { cut: [-0.045, 0] }, 3)),
      climb: [climb('corn-shine'), climb('applejack')], leadPress,
      mixed, tainted, fresh, prices: [price({ q: 0.9 }), price({ q: 0.6 }), price({ q: 0.3 }), price({ q: 0.9, bad: true })],
      weights: CONFIG.dredge.brew.weights,
      before, stash, left: [...t.pieces.values()].map((p) => p.kind),
    };
  }, PLAY);
  expect(r.steady).toBeGreaterThan(0.8);
  expect(r.cold).toBeLessThan(0.3);
  expect(r.hot).toBe(0);
  expect(r.fireWide).toBeGreaterThan(r.fireNarrow);   // a better still forgives more
  expect(r.perfect).toMatchObject({ grade: 'A', bad: false, crates: 3 });
  expect(r.early).toMatchObject({ grade: 'C', bad: true });           // heads in the hearts
  expect(r.late.bad).toBe(false);
  expect(r.late.q).toBeLessThan(r.perfect.q);                         // tails in: weaker
  expect(r.none).toMatchObject({ grade: 'C', bad: true });
  expect(r.offProof.q).toBeLessThan(r.perfect.q);
  expect(r.cornSlip.bad).toBe(false);                                 // corn forgives a slip...
  expect(r.ryeSlip.bad).toBe(true);                                   // ...rye doesn't...
  expect(r.ryeSlip3.bad).toBe(false);                                 // ...unless the still is better
  expect(r.climb[1]).toBeGreaterThan(r.climb[0] * 1.2);               // applejack burns hot
  expect(r.leadPress).toBe(false);
  expect(r.mixed).toBeCloseTo(0.7, 5);
  expect(r.tainted).toBe(true);
  expect(r.fresh).toEqual({ q: 0.85, bad: false });
  expect(r.prices[0]).toBeGreaterThan(r.prices[1]);
  expect(r.prices[1]).toBeGreaterThan(r.prices[2]);
  expect(r.prices[3]).toBe(r.prices[2]);                              // tainted sells as C
  expect(r.before).toEqual([['jugs', 1]]);
  expect(r.stash).toEqual({});                         // the stash's jugs went first...
  expect(r.left).toEqual(['jugs']);                    // ...so the trunk keeps its own
});

test('the still: a copper coil sets it up, a batch in three steps makes graded crates of shine, and only the speakeasies buy them', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const info0 = await page.evaluate(() => {
    const g = window.shine.game, h = g.world.home;
    g.dredge.data.stash = { coil: 1, sack: 1, jugs: 1 };
    window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.3);
    return { programs: g.renderer.info.programs.length, geometries: g.renderer.info.memory.geometries };
  });
  await expect(page.locator('#barn')).toBeVisible();
  await expect(page.locator('#barn [data-id="brew-corn-shine"]')).toBeDisabled();     // no coil in yet
  await expect(page.locator('#barn [data-id="brew-applejack"]')).toHaveText('LOCKED');
  await page.click('#barn [data-id="install-coil"]');
  expect(await page.evaluate(() => window.shine.game.dredge.data.still)).toBe(1);
  await page.click('#barn [data-id="brew-corn-shine"]');
  await expect(page.locator('#still')).toBeVisible();
  // Run the batch by hand: a steady fire, clean cuts, the proof on the line.
  await expect(page.locator('#still-steps li.on')).toHaveText('1 · THE FIRE');
  const q = await page.evaluate((PLAY) => {
    const s = window.shine.game.stillScreen;
    s.manual();
    const phases = [];
    eval(PLAY)(s.batch, (dt, st) => { s.step(dt, st); if (phases.at(-1) !== s.batch.phase) phases.push(s.batch.phase); }, () => s.press());
    return { done: s.batch.done, phases, steps: document.querySelector('#still-steps li.on').textContent };
  }, PLAY);
  expect(q.done).toBe(true);
  expect(q.phases).toEqual(['fire', 'cuts', 'proof']);
  await expect(page.locator('#still-msg')).toContainText('Grade A');
  await expect(page.locator('#still-msg')).toContainText('3 crates of Corn Shine');
  await expect(page.locator('#still-pour')).toBeHidden();
  await page.click('#still-done');
  await expect(page.locator('#still')).toBeHidden();
  const d = await page.evaluate(() => { const d = window.shine.game.dredge.data; return { stash: d.stash, brews: d.stats.brews, ledger: d.ledger[0].text, blend: d.market.blend['corn-shine'] }; });
  expect(d.stash).toEqual({ 'corn-shine': 3 });
  expect(d.brews).toBe(1);
  expect(d.ledger).toMatch(/^Brewed 3 crates of Corn Shine \(grade A, \d+%\)$/);
  expect(d.blend.bad).toBe(false);
  expect(d.blend.q).toBeGreaterThan(0.78);
  await expect(page.locator('#barn-body')).toContainText('Corn Shine · grade A');

  // Load two crates and head for a speakeasy: the route and the radar point there.
  await page.click('#barn [data-id="take-corn-shine"]');
  await page.click('#barn [data-id="take-corn-shine"]');
  await page.click('#barn-done');
  const dest = await page.evaluate(() => { const g = window.shine.game; window.shine.step(0.6); return { obj: document.getElementById('objective-text').textContent, drops: g._mapMarkers().filter((m) => m.kind === 'drop').length, kind: g._destination().kind }; });
  expect(dest.kind).toBe('drop');
  expect(dest.obj).toMatch(/^Deliver to /);
  expect(dest.drops).toBe(10);

  // A market won't touch it.
  await page.evaluate(() => { window.shine.teleport(-44, 48, 0); window.shine.step(0.3); });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-note')).toContainText('Nothing in the trunk to sell');
  await expect(page.locator('#market-sell-all')).toBeDisabled();
  await page.click('#market-done');

  // A speakeasy buys it, and sells no upgrades.
  const cash0 = await page.evaluate(() => { const g = window.shine.game, s = g.world.drops[0]; window.shine.teleport(s.x + 30, s.z, -Math.PI / 2); window.shine.step(0.2); window.shine.teleport(s.x, s.z, -Math.PI / 2); window.shine.step(0.3); return g.dredge.cash; });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-title')).toHaveText('HIGHLANDTOWN SPEAKEASY');
  await expect(page.locator('#market-body')).not.toContainText('UPGRADES');
  await page.click('#market-sell-all');
  const sold = await page.evaluate(() => { const g = window.shine.game; return { cash: g.dredge.cash, trunk: g.trunk.count }; });
  expect(sold.trunk).toBe(0);
  expect(sold.cash - cash0).toBeGreaterThan(100);
  await page.click('#market-done');
  const info1 = await page.evaluate(() => ({ programs: window.shine.game.renderer.info.programs.length, geometries: window.shine.game.renderer.info.memory.geometries }));
  expect(info1).toEqual(info0);
  expect(problems).toEqual([]);
});

test('a bad batch: pour it out and lose it, or keep it and taint the blend; sold, it blinds someone and costs Otto his name', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const brew = async (how) => {
    await page.evaluate(() => {
      const g = window.shine.game, h = g.world.home, d = g.dredge.data;
      d.still = 1; d.stash.sack = (d.stash.sack || 0) + 1; d.stash.jugs = (d.stash.jugs || 0) + 1;
      while (g.ui.anyOpen) g.ui.close();
      g.resume();
      window.shine.teleport(h.stopX, h.stopZ + 40, 0); window.shine.step(0.2);
      window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.3);
    });
    await page.click('#barn [data-id="brew-corn-shine"]');
    await page.evaluate((PLAY) => { const s = window.shine.game.stillScreen; s.manual(); eval(PLAY)(s.batch, (dt, st) => s.step(dt, st), () => s.press(), { cut: [-0.15, 0] }); }, PLAY);
    await expect(page.locator('#still-msg')).toContainText('poison');
    await expect(page.locator('#still-pour')).toBeVisible();
    await expect(page.locator('#still-done')).toHaveText('KEEP IT');
    await page.click(how === 'pour' ? '#still-pour' : '#still-done');
    return page.evaluate(() => { const d = window.shine.game.dredge.data; return { stash: d.stash['corn-shine'] || 0, blend: d.market.blend['corn-shine'] || null, ledger: d.ledger[0].text }; });
  };
  const poured = await brew('pour');
  expect(poured.stash).toBe(0);
  expect(poured.blend).toBeNull();
  expect(poured.ledger).toBe('Poured out a bad batch of Corn Shine');
  const kept = await brew('keep');
  expect(kept.stash).toBeGreaterThan(0);
  expect(kept.blend.bad).toBe(true);
  await expect(page.locator('#barn-body')).toContainText('Corn Shine · grade C, tainted');
  // Sold at a speakeasy: it fetches a C price, and someone goes blind.
  const r = await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    for (let k = 0; k < d.stash['corn-shine']; k++) { const spot = g.trunk.findSpot('corn-shine'); g.trunk.place('corn-shine', spot.x, spot.y, spot.rot); }
    d.stash = {};
    const s = g.world.drops[0];
    d.trust[s.who] = 6;
    window.shine.teleport(s.x + 30, s.z, -Math.PI / 2); window.shine.step(0.2);
    window.shine.teleport(s.x, s.z, -Math.PI / 2); window.shine.step(0.3);
    return { trust: d.trust[s.who], who: s.who };
  });
  await expect(page.locator('#market')).toBeVisible();
  await expect(page.locator('#market-body')).toContainText('grade C, tainted');
  await page.click('#market-sell-all');
  const after = await page.evaluate((who) => { const d = window.shine.game.dredge.data; return { trust: d.trust[who], blinded: d.stats.blinded, flag: d.flags.blinded, ledger: d.ledger[0].text, toast: document.getElementById('toast').textContent }; }, r.who);
  expect(r.trust - after.trust).toBe(3);                  // the speakeasy that sold it trusts Otto less
  expect(after.blinded).toBe(1);
  expect(after.flag).toBe(true);
  expect(after.toast).toContain('blinded by bad corn shine');
  expect(after.ledger).toContain('Temperance Alliance');
  expect(problems).toEqual([]);
});

test('breakage: a hard crash can smash jars, bottles and shine aboard; a soft knock breaks nothing; sturdy loot never breaks', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const g = window.shine.game, { CONFIG } = await import('/src/config.js');
    const load = () => { g.trunk.clear(); for (const k of ['corn-shine', 'jugs', 'crate', 'bottle-case']) { const s = g.trunk.findSpot(k); g.trunk.place(k, s.x, s.y, s.rot); } };
    load();
    g._lastRam = -10;
    g._crash(CONFIG.dredge.breakage.from - 1, 0, 0);
    const soft = g.trunk.count;
    const max = CONFIG.dredge.breakage.max;
    CONFIG.dredge.breakage.max = 1;
    g._lastRam = -10;
    g._crash(60, 0, 0);
    CONFIG.dredge.breakage.max = max;
    const kinds = [...g.trunk.pieces.values()].map((p) => p.kind);
    return { soft, kinds, toast: document.getElementById('toast').textContent, broken: g.dredge.data.stats.broken, pill: document.getElementById('cargo').textContent, used: g.trunk.used };
  });
  expect(r.soft).toBe(4);
  expect(r.kinds).toEqual(['crate']);
  expect(r.toast).toContain('smashed in the crash');
  expect(r.broken).toBe(3);
  expect(r.pill).toMatch(new RegExp(`^TRUNK ${r.used}/`));
  expect(problems).toEqual([]);
});
