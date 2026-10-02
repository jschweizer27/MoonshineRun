import { test, expect } from '@playwright/test';
import { openGame, waitForBoot, startRun, step, snapshot, screenshot } from './helpers.js';

const state = (page) => page.evaluate(() => window.shine.game.state);

test('Enter starts the game and restarts after being busted', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page)).toBe('playing');
  await page.evaluate(() => window.shine.game.bust());
  await expect(page.locator('#gameover')).toBeVisible();
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
  await press(7, true);                       // RT = throttle
  await expect.poll(() => page.evaluate(() => window.shine.game.player.speed)).toBeGreaterThan(3);
  await press(7, false);
  await press(9, true);                       // Start = pause
  await expect.poll(() => state(page)).toBe('paused');
  await press(9, false);
  await press(13, true);                      // d-pad down
  await expect(page.locator('#pause-map')).toBeFocused({ timeout: 5000 });
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
  await startRun(page);
  await page.keyboard.down('KeyI');
  // The new key reads as throttle, and that throttle drives the truck. (Stepped here rather
  // than waiting on real frames, which crawl on software-rendered CI machines.)
  await expect.poll(() => page.evaluate(() => window.shine.game.input.read().throttle)).toBeGreaterThan(0.5);
  const speed = await page.evaluate(() => { const g = window.shine.game; for (let k = 0; k < 60; k++) window.shine.step(1 / 60, g.input.read()); return g.player.speed; });
  expect(speed).toBeGreaterThan(3);
  await page.keyboard.up('KeyI');
});

test('the minimap and full map draw the route to the objective', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  // The minimap draws once per rendered frame. Draw it here rather than waiting on real
  // frames, which can crawl on software-rendered CI machines. Each check reports what it
  // saw, so a failure says why (a page that didn't answer, an error, or a blank radar).
  const checks = [];
  const look = () => page.evaluate(() => {
    const t0 = performance.now();
    try {
      const g = window.shine.game;
      g.minimap.updateRoute(1, g.player.position, g.mission.target, g.police.blocked);
      g.minimap.draw(g.player, g._mapMarkers(), g._mapPolice(), g.time);
      const cv = document.getElementById('minimap');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
      return { lit, size: cv.width, shown: !!cv.offsetParent, state: g.state, route: g.minimap.route.length, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { lit: -1, error: String(e && e.stack || e), ms: Math.round(performance.now() - t0) };
    }
  });
  let lit = -1;
  const deadline = Date.now() + 45_000;
  while (lit <= 200 && Date.now() < deadline) {
    const t0 = Date.now();
    const r = await Promise.race([look(), new Promise((res) => setTimeout(() => res({ lit: -1, error: 'no answer within 15 s' }), 15_000))]);
    checks.push({ ...r, waited: Date.now() - t0 });
    lit = r.lit;
    if (lit <= 200) await page.waitForTimeout(250);
  }
  expect(lit, `the radar never drew; checks: ${JSON.stringify(checks.slice(-4))}`).toBeGreaterThan(200);
  expect(await page.evaluate(() => window.shine.game.minimap.route.length)).toBeGreaterThan(1);
  await page.keyboard.press('Tab');
  await expect(page.locator('#map')).toBeVisible();
  expect(await state(page)).toBe('paused');
  await screenshot(page, '09-map');
  await page.keyboard.press('Tab');
  await expect(page.locator('#map')).toBeHidden();
  expect(await state(page)).toBe('playing');
});

test('the bust bar fills while pinned and drains when you break free', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.teleport(0, 0, 0);
    g.mission.heat = 1;
    g.police.setTarget(1, g.player, g.camera);
    g.police.active[0].car.place(0, 6, 0);    // right behind you
    g.police.active[0].mode = 'search';
  });
  await step(page, 1);
  const pinned = await page.evaluate(() => window.shine.game.bustMeter);
  expect(pinned).toBeGreaterThan(0.2);
  await expect(page.locator('#bust')).toBeVisible();
  await page.evaluate(() => window.shine.game.police.reset());
  await step(page, 2, { throttle: 1 });
  expect(await page.evaluate(() => window.shine.game.bustMeter)).toBeLessThan(pinned);
  expect((await snapshot(page)).state).toBe('playing');
});

test('delivery feedback: cash pop-up and count-up', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const pay = await page.evaluate(() => { window.shine.loadShine(0); return window.shine.game.mission.order.pay; });
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.drop.position.x, m.drop.position.z); });
  await step(page, 0.1);
  await expect(page.locator('#cash-pop')).toHaveText(`+$${pay.toLocaleString()}`);
  await expect(page.locator('#cash')).toHaveText(`$${pay.toLocaleString()}`);
});

test('first-run tips appear and go away once you drive', async ({ page }) => {
  await openGame(page, '&hints');
  await page.evaluate(() => localStorage.removeItem('shine.hints.v1'));
  await startRun(page);
  await step(page, 2);
  await expect(page.locator('#hint')).toBeVisible();
  await expect(page.locator('#hint-text')).toContainText('to drive');
  await step(page, 3, { throttle: 1 });
  await expect(page.locator('#hint-text')).not.toContainText('to drive');
});

test('stills and drops are told apart by shape and label, not just colour', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const m = window.shine.game.mission;
    const ring = (g) => g.children.find((c) => c.geometry?.type === 'TorusGeometry').geometry.parameters.tubularSegments;
    const label = (g) => g.children.some((c) => c.isSprite);
    return { still: ring(m.pickup), drop: ring(m.drop), labels: label(m.pickup) && label(m.drop) };
  });
  expect(r.drop).toBe(4);          // diamond
  expect(r.still).toBeGreaterThan(20);
  expect(r.labels).toBe(true);
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
