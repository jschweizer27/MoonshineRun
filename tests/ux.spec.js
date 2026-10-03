import { test, expect } from '@playwright/test';
import { mainThread, openGame, waitForBoot, startRun, clearLoot, screenshot } from './helpers.js';

const state = (page) => page.evaluate(() => window.shine.game.state);

test('Enter starts the game; quitting goes back to the title, and Enter starts again', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page)).toBe('playing');
  await page.keyboard.press('Escape');
  await page.click('#pause-quit');
  await page.click('#confirm-yes');
  await expect(page.locator('#intro')).toBeVisible();
  expect(await state(page)).toBe('intro');
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page)).toBe('playing');
});

test('Esc pauses and freezes the game; Esc again resumes', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  expect(await state(page)).toBe('paused');
  const before = await page.evaluate(() => window.shine.game.time);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.shine.game.time)).toBe(before);
  await screenshot(page, '07-pause');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeHidden();
  expect(await state(page)).toBe('playing');
});

test('switching away from the tab pauses automatically', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await state(page)).toBe('paused');
  await expect(page.locator('#pause')).toBeVisible();
});

test('arrow keys move through menu buttons and Enter activates', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-resume')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#pause-map')).toBeFocused();
  for (let k = 0; k < 8 && !(await page.locator('#pause-settings').evaluate((b) => b === document.activeElement)); k++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(page.locator('#pause-settings')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#pause')).toBeVisible();
});

test('a gamepad drives the truck and navigates menus', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { connected: true, index: 0, id: 'Test pad', mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
  });
  await openGame(page);
  const press = async (i, down) => page.evaluate(([i, d]) => { window.__pad.buttons[i] = { pressed: d, value: d ? 1 : 0 }; }, [i, down]);
  // Buttons are read once per frame, and a software-rendered frame on a CI runner can take
  // longer than any fixed tap, so each button is held until the game reacts.
  await press(0, true);                       // A on the title screen = START
  await expect.poll(() => state(page)).toBe('playing');
  await press(0, false);
  await clearLoot(page);                      // nothing to pick up on the way
  await press(7, true);                       // RT = throttle
  await expect.poll(() => page.evaluate(() => window.shine.game.player.speed)).toBeGreaterThan(3);
  await press(7, false);
  await press(9, true);                       // Start = pause
  await expect.poll(() => state(page)).toBe('paused');
  await press(9, false);
  await press(13, true);                      // d-pad down
  await expect(page.locator('#pause-map')).toBeFocused({ timeout: 20_000 });
  await press(13, false);
  await press(1, true);                       // B = back, which resumes
  await expect.poll(() => state(page)).toBe('playing');
  await press(1, false);
});

test('touch controls appear on phones and the GAS pedal drives', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await openGame(page);
  await page.tap('#start-btn');
  await expect(page.locator('#touch')).toBeVisible();
  await clearLoot(page);
  await page.dispatchEvent('#touch-gas', 'pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await expect.poll(() => page.evaluate(() => window.shine.game.player.speed)).toBeGreaterThan(3);
  await page.dispatchEvent('#touch-gas', 'pointerup', { pointerId: 7, pointerType: 'touch' });
  await screenshot(page, '08-touch');
  await page.tap('#btn-pause');
  await expect(page.locator('#touch')).toBeHidden();
  await ctx.close();
});

test('settings are remembered between visits', async ({ page }) => {
  await openGame(page);
  await page.click('#intro-settings');
  await page.getByRole('group', { name: 'Camera distance' }).getByText('Far').click();
  await page.getByLabel('Large text').check();
  await screenshot(page, '10-settings');
  await page.click('#settings-done');
  await page.reload();
  await waitForBoot(page);
  expect(await page.evaluate(() => window.shine.game.chase.distanceScale)).toBeGreaterThan(1);
  expect(await page.evaluate(() => document.documentElement.classList.contains('large-text'))).toBe(true);
});

test('keys can be remapped', async ({ page }) => {
  await openGame(page);
  await page.click('#intro-settings');
  await page.getByRole('button', { name: 'Change key for Throttle' }).click();
  await page.keyboard.press('KeyI');
  await expect(page.locator('#settings-body')).toContainText('I');
  await page.click('#settings-done');
  await startRun(page, { loot: false });
  await page.keyboard.down('KeyI');
  // The new key reads as throttle, and that throttle drives the truck. (Stepped here rather
  // than waiting on real frames, which crawl on software-rendered CI machines.)
  await expect.poll(() => page.evaluate(() => window.shine.game.input.read().throttle)).toBeGreaterThan(0.5);
  const speed = await page.evaluate(() => { const g = window.shine.game; for (let k = 0; k < 60; k++) window.shine.step(1 / 60, g.input.read()); return g.player.speed; });
  expect(speed).toBeGreaterThan(3);
  await page.keyboard.up('KeyI');
});

test('with loot aboard, the minimap and full map draw the route to the nearest market', async ({ page }) => {
  test.setTimeout(300_000);
  await openGame(page);
  await startRun(page);
  // An empty trunk: free roam, no route.
  expect(await page.evaluate(() => { const g = window.shine.game; g._updateRoute(1); return g.minimap.route.length; })).toBe(0);
  await page.evaluate(() => window.shine.game.trunk.place('crate', 0, 0));
  // The minimap draws once per rendered frame. Draw it here rather than waiting on real
  // frames, which can crawl on software-rendered CI machines: there the page was too busy
  // drawing the 3D view to answer for 15 s at a time. So the real-time loop stops for the
  // check (one slow answer, once) and starts again after. Each check reports what it saw,
  // so a failure says why (a page that didn't answer, an error, or a blank radar).
  // The music is suspended too, so its scheduler can't hold the page either.
  await page.evaluate(() => { const g = window.shine.game; g.renderer.setAnimationLoop(null); g.audio.ctx?.suspend(); });
  const checks = [];
  const look = () => page.evaluate(() => {
    const t0 = performance.now();
    try {
      const g = window.shine.game;
      g._updateRoute(1);
      g.minimap.draw(g.player, g._mapMarkers());
      const cv = document.getElementById('minimap');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
      return { lit, size: cv.width, shown: !!cv.offsetParent, state: g.state, route: g.minimap.route.length, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { lit: -1, error: String(e && e.stack || e), ms: Math.round(performance.now() - t0) };
    }
  });
  // A starved CI runner (two software-GL pages at once) can take most of a minute to
  // answer. A slow check is waited on, not fired again on top of itself: after 45 s the
  // main thread is sampled for the report, and the same answer is awaited a while longer.
  let lit = -1;
  const deadline = Date.now() + 150_000;
  while (lit <= 200 && Date.now() < deadline) {
    const t0 = Date.now(), answer = look();
    let r = await Promise.race([answer, new Promise((res) => setTimeout(() => res(null), 45_000))]);
    if (!r) {
      const where = await mainThread(page);
      r = (await Promise.race([answer, new Promise((res) => setTimeout(() => res(null), 60_000))])) || { lit: -1, error: 'no answer within 105 s', where };
    }
    checks.push({ ...r, waited: Date.now() - t0 });
    lit = r.lit;
    if (lit <= 200) await page.waitForTimeout(250);
  }
  expect(lit, `the radar never drew; checks: ${JSON.stringify(checks.slice(-4))}`).toBeGreaterThan(200);
  const route = await page.evaluate(() => { const r = window.shine.game.minimap.route; return { n: r.length, end: r[r.length - 1] }; });
  expect(route.n).toBeGreaterThan(1);
  expect(route.end).toEqual({ x: -44, z: 44 });          // Lexington Market, the nearest
  await page.evaluate(() => { const g = window.shine.game; g.renderer.setAnimationLoop(() => g._loop()); g.audio.ctx?.resume(); });
  await page.keyboard.press('Tab');
  await expect(page.locator('#map')).toBeVisible();
  expect(await state(page)).toBe('paused');
  await screenshot(page, '09-map');
  await page.keyboard.press('Tab');
  await expect(page.locator('#map')).toBeHidden();
  expect(await state(page)).toBe('playing');
});

test('sale feedback: cash pop-up and count-up', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => { const g = window.shine.game; g.trunk.place('crate', 0, 0); g.openMarket(); });
  const pay = Number(await page.locator('#market-sell-all').getAttribute('data-total'));
  expect(pay).toBeGreaterThan(0);
  await page.locator('#market-sell-all').click();
  await expect(page.locator('#cash-pop')).toHaveText(`+$${pay.toLocaleString()}`);
  await expect(page.locator('#cash')).toHaveText(`$${pay.toLocaleString()}`);
});

test('markets are told apart by shape and label, not just colour', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const m = window.shine.game.marketMarkers[0];
    const ring = m.children.find((c) => c.geometry?.type === 'TorusGeometry').geometry.parameters.tubularSegments;
    return { ring, label: m.children.some((c) => c.isSprite) };
  });
  expect(r.ring).toBe(6);          // a hexagon, like its radar icon
  expect(r.label).toBe(true);
});

test('the pause menu: resume, map, ledger, settings, help and quit; the ledger keeps the books', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.keyboard.press('Escape');
  const buttons = await page.locator('#pause button:visible').allTextContents();
  expect(buttons).toEqual(['RESUME', 'MAP', 'LEDGER', 'SETTINGS', 'HOW TO PLAY', 'QUIT TO TITLE']);
  await page.click('#pause-ledger');
  await expect(page.locator('#ledger-runs')).toContainText('Nothing sold yet');
  await page.click('#ledger-done');
  await page.keyboard.press('Escape');
  // A sale and an upgrade, then the books.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.dredge.data.cash = 300;                  // enough for one upgrade
    g.trunk.place('keg', 0, 0);
    g.openMarket();
  });
  await page.locator('#market-sell-all').click();
  const earned = await page.evaluate(() => window.shine.game.dredge.data.stats.earned);
  await page.click('#market-body [data-id="up-magnet"]');
  await page.click('#market-done');
  await page.keyboard.press('Escape');
  await page.click('#pause-ledger');
  await expect(page.locator('#ledger-totals')).toContainText(`Earned, all time$${earned.toLocaleString()}`);
  await expect(page.locator('#ledger-totals')).toContainText('Pieces sold1');
  await expect(page.locator('#ledger-totals')).toContainText('Upgrades bought1');
  const rows = await page.locator('#ledger-runs tr').allTextContents();
  expect(rows[1]).toContain('Long arm (level 1)');
  expect(rows[1]).toContain('−$250');
  expect(rows[2]).toContain('Sold 1 piece at Lexington Market');
  await screenshot(page, '11-ledger');
});

test('erasing saved progress empties the cash, the upgrades and the trunk', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const g = window.shine.game;
    g.dredge.data.cash = 5000;
    g.dredge.buy('trunk');
    g._applyPerks();
    g.trunk.place('keg', 0, 0);
    g.dredge.saveTrunk(g.trunk);
  });
  expect(await page.evaluate(() => window.shine.game.player.look)).toBe('reinforced');
  await page.keyboard.press('Escape');
  await page.click('#pause-settings');
  await page.getByRole('button', { name: 'Erase saved progress' }).click();
  await page.click('#confirm-yes');
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    return { cash: g.dredge.cash, levels: Object.values(g.dredge.data.upgrades), size: [g.trunk.cols, g.trunk.rows], count: g.trunk.count, look: g.player.look, hud: document.getElementById('cash').textContent };
  });
  expect(r).toEqual({ cash: 0, levels: [0, 0, 0, 0, 0], size: [5, 3], count: 0, look: 'stock', hud: '$0' });
});

test('installable app: manifest, icons and offline play', async ({ page, context }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.short_name).toBe('SHINE');
  for (const icon of manifest.icons) expect((await page.request.get(`/${icon.src}`)).ok()).toBe(true);

  await page.goto('/?sw');
  await waitForBoot(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                                  // now controlled by the service worker
  await waitForBoot(page);
  await context.setOffline(true);
  await page.reload();
  await waitForBoot(page);
  await expect(page.locator('#intro')).toBeVisible();
  await context.setOffline(false);
});
