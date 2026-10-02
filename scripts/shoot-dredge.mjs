#!/usr/bin/env node
// Dredge-run art-direction screenshots: `npm run shots -- dredge-s5 [--day] [--rain]` (any
// label starting with "dredge" lands here from scripts/shoot.mjs). Starts the dredge mode
// headless, sets up each view, and saves artifacts/shots/<label>-*.png, a contact sheet
// artifacts/shots/<label>.png, and the render counts (draw calls, shadow calls, lights,
// shader programs, geometries) to artifacts/shots/<label>-counts.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) || 'dredge';
const flags = new Set(args.filter((a) => a.startsWith('--')));
const port = 4240 + Math.floor(Math.random() * 50);
const out = 'artifacts/shots';
fs.mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: 'ignore' });
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const shots = [], counts = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  for (let i = 0; i < 50; i++) {
    try { await page.goto(`http://localhost:${port}/?test&mode=dredge`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  await page.waitForFunction(() => window.__shineReady === true, null, { timeout: 90_000 });
  await page.click('#start-btn');
  // Every frame is stepped and drawn by this script.
  await page.evaluate(() => window.shine.game.renderer.setAnimationLoop(null));
  await page.evaluate(({ day, rain }) => {
    const g = window.shine.game;
    if (day) g.env.hour = 12;
    if (rain) { g.env.setWeather('rain'); g.env.wet = 1; }
    g.env.update(0, g.camera.position);
  }, { day: flags.has('--day'), rain: flags.has('--rain') });

  const shoot = async (name, note = '') => {
    await page.evaluate(() => {
      const g = window.shine.game;
      g.loot._writeAll(g.time, g.player.position, g.camera.position);       // glows face this shot's camera
      g.renderFrame();
      g.minimap.draw(g.player, g._mapMarkers(), g._mapPolice(), g.time);   // the stopped loop doesn't
    });
    const path = `${out}/${label}-${name}.png`;
    const png = await page.screenshot({ path });
    shots.push({ name, note, png });
    console.log(`saved ${path}`);
  };
  const count = async (name) => {
    counts[name] = await page.evaluate(() => window.shine.renderInfo());
    const c = counts[name];
    console.log(`${name.padEnd(10)} ${c.calls} draw calls · ${c.shadowCalls} shadow · ${c.postCalls} post · ${c.lights} lights · ${c.programs} programs · ${c.geometries} geometries`);
  };

  // One of each loot kind, in a row across York Road ahead of the truck (out of reach).
  await page.evaluate(() => {
    const g = window.shine.game, L = g.loot, K = 10;
    for (let i = 0; i < L.n; i++) { L.active[i] = 0; L.timer[i] = 1e9; }
    // Two staggered rows so nothing hides behind anything: low and mid tiers in front, the
    // rest behind.
    for (let k = 0; k < K; k++) { const row = Math.floor(k / 5); L.kind[k] = k; L.active[k] = 1; L.x[k] = -9 + (k % 5) * 4.5 + row * 2.25; L.z[k] = 48 - row * 5; L.yaw[k] = 0.6; }
    window.shine.teleport(0, 100, 0);
    window.shine.step(0.3);
  });
  await shoot('chase', 'chase camera, York Road, loot ahead');
  await count('chase');

  // The lineup, close: the ten kinds and their tiers.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.camera.position.set(0, 2.4, 58);
    g.camera.lookAt(0, 0.4, 45);
  });
  await shoot('loot', 'the ten kinds: low olive, mid brick/cream, high copper, premium amber');
  await count('loot');

  // From a distance: does the glow make loot read at night?
  await page.evaluate(() => {
    const g = window.shine.game;
    g.camera.position.set(0, 3, 120);
    g.camera.lookAt(0, 0.6, 45);
  });
  await shoot('loot-far', 'loot 70 m away');

  // The trunk: a few pieces packed, a jug cluster in hand where it fits (amber), then where
  // it doesn't (red).
  await page.evaluate(() => {
    const g = window.shine.game, t = g.trunk;
    t.clear();
    // Small crate, bottle case, an S-shaped coil and the strongbox; the jug cluster's T goes
    // in the gap on the left.
    const ok = [t.place('small-crate', 0, 0), t.place('bottle-case', 1, 0), t.place('coil', 2, 1), t.place('strongbox', 0, 2)];
    if (ok.some((p) => !p)) throw new Error('trunk layout does not fit');
    window.shine.teleport(0, 100, 0);
    window.shine.step(0.1);
    g.openTrunk('jugs');
    const s = g.trunkScreen; s.hand.rot = 0; s.cursor = { x: 0, y: 1 }; s._clamp(); s._render();
  });
  await shoot('trunk', 'trunk: a jug cluster in hand, fits (amber)');
  await page.evaluate(() => { const s = window.shine.game.trunkScreen; s.hand.rot = 0; s.cursor = { x: 2, y: 0 }; s._clamp(); s._render(); });   // over the bottle case
  await shoot('trunk-bad', 'trunk: the same piece where it won\'t fit (red)');
  await page.evaluate(() => { const g = window.shine.game; g.trunkScreen.discard(); g.trunkScreen.close(); });

  // The market screen.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.trunk.place('sack', 1, 1);
    g._updateTrunkPill();
    g.openMarket();
  });
  await shoot('market', 'Lexington Market');
  await page.evaluate(() => { const g = window.shine.game; g.ui.back(); });

  // Driving with a loaded trunk: the HUD (cash, trunk pill, radar, objective card).
  await page.evaluate(() => {
    window.shine.teleport(60, 176, -Math.PI / 2);   // west along a street
    window.shine.step(1.2, { throttle: 0.8 });
  });
  await shoot('hud', 'HUD: cash, trunk pill, radar, "Deliver to Baltimore"');
  await count('hud');

  // Contact sheet.
  const sheet = await browser.newPage({ viewport: { width: 1640, height: 400 } });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await sheet.setContent(`<body style="margin:0;background:#1B2530;font:12px monospace;color:#EFE6D0;padding:8px">
    <div style="margin-bottom:6px">${esc(label)} · ${Object.entries(counts).map(([k, v]) => `${k}: ${v.calls} calls, ${v.lights} lights, ${v.programs} programs`).join(' · ')}</div>
    <div style="display:grid;grid-template-columns:repeat(4,400px);gap:8px">${
    shots.map((s) => `<div><img style="width:400px;display:block" src="data:image/png;base64,${s.png.toString('base64')}"><div><b>${esc(s.name)}</b> ${esc(s.note)}</div></div>`).join('')
  }</div></body>`);
  await sheet.screenshot({ path: `${out}/${label}.png`, fullPage: true });
  fs.writeFileSync(`${out}/${label}-counts.json`, JSON.stringify(counts, null, 2));
  console.log(`saved ${out}/${label}.png and ${out}/${label}-counts.json`);
} finally {
  await browser.close();
  server.kill();
}
