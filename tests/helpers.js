import fs from 'node:fs';
import { expect } from '@playwright/test';

export const SHOTS = 'artifacts/screenshots';

// Open the game in test mode, with every console error and off-site request recorded.
// Everything the game needs is served locally, so any external request is a bug.
export async function openGame(page, query = '') {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.route(/^https?:\/\/(?!localhost)/, (route) => { problems.push(`external request: ${route.request().url()}`); route.abort(); });
  await page.goto(`/?test${query}`);
  await waitForBoot(page);
  return problems;
}

// Wait for the game to finish loading. If it doesn't, pause the page in the debugger and
// report exactly where it's stuck, so a slow or hung boot explains itself in CI logs.
export async function waitForBoot(page, timeout = 60_000) {
  try {
    await page.waitForFunction(() => window.__shineReady === true, null, { timeout });
  } catch (err) {
    let where;
    try {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Debugger.enable');
      const paused = new Promise((res) => cdp.once('Debugger.paused', res));
      await cdp.send('Debugger.pause');
      const e = await Promise.race([paused, new Promise((r) => setTimeout(() => r(null), 10_000))]);
      if (e) where = e.callFrames.slice(0, 12).map((f) => `  at ${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.location.lineNumber + 1}`).join('\n');
      else where = 'debugger could not pause the page (renderer or GPU process unresponsive)';
      await cdp.send('Debugger.resume').catch(() => {});
    } catch (e2) {
      where = `diagnostics failed: ${e2.message}`;
    }
    throw new Error(`The game did not finish loading within ${timeout / 1000}s. Main thread:\n${where}`, { cause: err });
  }
}

export async function startRun(page) {
  await page.click('#start-btn');
  await expect(page.locator('#hud')).toBeVisible();
}

// Run the simulation deterministically for `seconds` with a fixed input.
export function step(page, seconds, input = {}) {
  return page.evaluate(([s, i]) => window.shine.step(s, i), [seconds, input]);
}

export function snapshot(page) {
  return page.evaluate(() => window.shine.snapshot());
}

export async function screenshot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => window.shine && window.shine.game.renderer.render(window.shine.game.scene, window.shine.game.camera));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 120_000 });
}

// Average luminance (0..1) of the rendered 3D view.
export function luminance(page) {
  return page.evaluate(() => {
    const g = window.shine.game;
    g.renderer.render(g.scene, g.camera);
    const off = document.createElement('canvas');
    off.width = 160; off.height = 90;
    const x = off.getContext('2d');
    x.drawImage(g.renderer.domElement, 0, 0, 160, 90);
    const d = x.getImageData(0, 0, 160, 90).data;
    let s = 0;
    for (let k = 0; k < d.length; k += 4) s += (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255;
    return s / (d.length / 4);
  });
}
