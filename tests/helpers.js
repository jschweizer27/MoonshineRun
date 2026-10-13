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
    throw new Error(`The game did not finish loading within ${timeout / 1000}s. Main thread:\n${await mainThread(page)}`, { cause: err });
  }
}

// Reload the game and wait for it to boot again. The title screen's flyover keeps the page
// busy, and on a slow CI runner the browser's own load event can then take minutes: stop
// the drawing first, wait only for the navigation to start, then for the game's own flag.
export async function reloadGame(page, timeout = 120_000) {
  await page.evaluate(() => window.shine?.game?.renderer?.setAnimationLoop(null)).catch(() => {});
  await page.reload({ waitUntil: 'commit', timeout });
  await waitForBoot(page, timeout);
}

// Where the page's main thread is right now: pause it in the debugger and read the stack.
// For failures where the page stops answering.
export async function mainThread(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Debugger.enable');
    const paused = new Promise((res) => cdp.once('Debugger.paused', res));
    await cdp.send('Debugger.pause');
    const e = await Promise.race([paused, new Promise((r) => setTimeout(() => r(null), 10_000))]);
    await cdp.send('Debugger.resume').catch(() => {});
    if (!e) return 'debugger could not pause the page (renderer or GPU process unresponsive)';
    return e.callFrames.slice(0, 12).map((f) => `  at ${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.location.lineNumber + 1}`).join('\n');
  } catch (e2) {
    return `diagnostics failed: ${e2.message}`;
  }
}

// START DRIVING. With `loot: false` the roads are cleared first (clearLoot). With `scatter`
// the old street loot is switched back on (v4 turned it off; spills still use the pool).
export async function startRun(page, { loot = true, scatter = false } = {}) {
  await page.click('#start-btn');
  await expect(page.locator('#hud')).toBeVisible();
  if (scatter) {
    await page.evaluate(async () => {
      const { CONFIG } = await import('/src/config.js');
      const g = window.shine.game;
      CONFIG.dredge.loot.scatter = true;
      g.loot.reset(g.player);
    });
  }
  if (!loot) await clearLoot(page);
}

// Take every piece of loot off the roads (and stop it coming back), for tests that drive
// about and mustn't have a pickup open the trunk mid-drive.
export function clearLoot(page) {
  return page.evaluate(() => { const L = window.shine.game.loot; L.active.fill(0); L.timer.fill(1e9); L.rareIn = 1e9; L._writeAll(0, null); });
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
  await page.evaluate(() => window.shine && window.shine.game.renderFrame());
  await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 120_000 });
}

// Average luminance (0..1) of the rendered 3D view.
export function luminance(page) {
  return page.evaluate(() => {
    const g = window.shine.game;
    g.renderFrame();
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

// A save that's done the chapters before `n` (0-based), and helpers for the page: step,
// close whatever's open and drive on, stop at (x, z) coming in from 40 m off, pack what's
// in hand.
export const PAST = `(g, n) => {
  const { CHAPTERS } = window.__chapters;
  const d = g.dredge.data;
  CHAPTERS.slice(0, n).forEach((c) => { d.opened[c.id] = true; for (const st of c.steps) d.steps[st.id] = true; d.clues[c.clue.id] = true; if (c.tool) d.tools[c.tool.id] = true; });
  d.chapter = n; d.still = 1; d.stats.brews = Math.max(1, d.stats.brews);
  g.renderer.setAnimationLoop(null);
  g._applyPerks();
}`;
export const KIT = `(() => {
  const g = window.shine.game;
  const clear = () => { while (g.ui.anyOpen) g.ui.close(); g.resume(); };
  const step = (s = 0.6) => window.shine.step(s);
  const visit = (x, z) => { clear(); window.shine.teleport(x, z + 40, 0); window.shine.step(0.2); window.shine.teleport(x, z, 0); window.shine.step(0.3); };
  const pack = () => { for (let k = 0; k < 6 && g.trunkScreen.isOpen; k++) { const s = g.trunkScreen, sp = s.hand && g.trunk.findSpot(s.hand.kind); if (sp) { s.cursor = { x: sp.x, y: sp.y }; s.hand.rot = sp.rot; s.confirm(); } s.close(); } };
  const shine = (n) => { g.trunk.clear(); for (let k = 0; k < n; k++) { const s = g.trunk.findSpot('corn-shine'); g.trunk.place('corn-shine', s.x, s.y, s.rot); } g.dredge.data.market.blend['corn-shine'] = { q: 0.6, bad: false }; };
  const objective = () => document.getElementById('objective-text').textContent;
  const toast = () => document.getElementById('toast').textContent;
  return { g, d: g.dredge.data, clear, step, visit, pack, shine, objective, toast };
})()`;

export async function past(page, n) {
  await page.evaluate(async ({ PAST, n }) => { window.__chapters = await import('/src/chapters.js'); eval(PAST)(window.shine.game, n); }, { PAST, n });
}
