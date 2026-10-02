#!/usr/bin/env node
// Art-direction screenshots of the whole game (streets, skyline, county, the truck, loot,
// the trunk, the markets, both towns): `npm run shots -- dredge-s9 [--day] [--rain] [--plain]`
// (any label starting with "dredge" lands here from scripts/shoot.mjs). Starts the game
// headless, sets up each view, and saves artifacts/shots/<label>-*.png, a contact sheet
// artifacts/shots/<label>.png, and the render counts (draw calls, shadow calls, lights,
// shader programs, geometries) to artifacts/shots/<label>-counts.json. The painterly look is on, as
// players see it by default; --plain turns it off.
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
    try { await page.goto(`http://localhost:${port}/?test${flags.has('--plain') ? '' : '&painterly'}`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
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
      g.minimap.draw(g.player, g._mapMarkers());   // the stopped loop doesn't
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

  // Buildings: a street of shopfronts, one facade up close, the rooftops, a county barn,
  // and the same facade by day (the paint without the night).
  await page.evaluate(() => {
    const g = window.shine.game, L = g.loot;
    for (let i = 0; i < L.n; i++) { L.active[i] = 0; L.timer[i] = 1e9; }
    window.shine.teleport(-88, 70, 0);
    window.shine.step(0.4);
  });
  await shoot('street', 'a city street: shopfronts, awnings, lit windows');
  await count('street');
  const facade = () => page.evaluate(() => { const g = window.shine.game; g.camera.position.set(-84, 1.8, 44); g.camera.lookAt(-97, 4.5, 30); });
  await facade();
  await shoot('facade', 'a facade up close: brick, sash and shop windows');
  await page.evaluate(() => { const g = window.shine.game; g.camera.position.set(40, 50, 70); g.camera.lookAt(110, 16, 10); });
  await shoot('roofs', 'rooftops: tar paper, cornices, chimneys, tanks');
  await count('roofs');
  // The skyline down a street: cornices, parapets, chimneys and towers against the sky.
  const skyline = () => page.evaluate(() => { const g = window.shine.game; g.camera.position.set(-150, 2.5, -42); g.camera.lookAt(-60, 18, -44); });
  await skyline();
  await shoot('skyline', 'the skyline down a street: cornices, parapets, chimneys, towers');
  await count('skyline');
  // The bay window nearest the start, from across the street.
  await page.evaluate(() => {
    const g = window.shine.game, bays = g.world.bays || [];
    if (!bays.length) return;
    const [x, y, z, sx, sy, sz] = (bays.filter((b) => b[1] < 5).length ? bays.filter((b) => b[1] < 5) : bays).reduce((a, b) => (Math.hypot(b[0], b[2] - 100) < Math.hypot(a[0], a[2] - 100) ? b : a));
    const onX = sx < sz, c = onX ? x : z, road = Math.round(c / 44) * 44, out = Math.sign(road - c) || 1;
    if (onX) g.camera.position.set(road + out * 3, 2.2, z + 7); else g.camera.position.set(x + 7, 2.2, road + out * 3);
    g.camera.lookAt(x, y + sy * 0.4, z);
  });
  await shoot('bay', 'a bay window');
  await page.evaluate(() => {
    const g = window.shine.game, b = g.world.barns[0];
    window.shine.teleport(b.x + b.fx * 24, b.z + b.fz * 24, Math.atan2(-b.fx, b.fz));
    window.shine.step(0.2);
    g.camera.position.set(b.x + b.fx * 30 + b.fz * 14, 4.5, b.z + b.fz * 30 - b.fx * 14);
    g.camera.lookAt(b.x, 4, b.z);
  });
  await shoot('barn', 'a county barn: boards, tar paper, fieldstone');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 12; g.env.update(0, g.camera.position); });
  await facade();
  await shoot('facade-day', 'the same facade by day');
  await skyline();
  await shoot('skyline-day', 'the same skyline by day');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 21.5; g.env.update(0, g.camera.position); });

  // The truck itself, three-quarter front and rear, under a street lamp.
  await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.teleport(-88, 96, 0.5);
    window.shine.step(0.2);
    g.camera.position.set(-85, 2.4, 89); g.camera.lookAt(-88, 1.1, 96);
  });
  await shoot('truck', 'the truck, front three-quarter');
  await page.evaluate(() => { const g = window.shine.game; g.camera.position.set(-93, 2.6, 103); g.camera.lookAt(-88, 1.1, 96); });
  await shoot('truck-rear', 'the truck from behind: bed and canvas cover');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 12; g.env.update(0, g.camera.position); g.camera.position.set(-81.5, 2.6, 93); g.camera.lookAt(-88.3, 1.1, 96.5); });
  await shoot('truck-day', 'the truck by day');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 21.5; g.env.update(0, g.camera.position); });

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

  // Monkton, the valley village: driving in at night, from above, by day, and its store.
  await page.evaluate(() => { window.shine.teleport(0, -600, 0); window.shine.step(0.4); });
  await shoot('monkton', 'Monkton at night, up York Road');
  await count('monkton');
  await page.evaluate(() => { const g = window.shine.game; g.camera.position.set(60, 38, -600); g.camera.lookAt(0, 0, -665); });
  await shoot('monkton-above', 'Monkton from above: houses round the crossroads');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 12; g.env.update(0, g.camera.position); g.camera.position.set(-10, 4.5, -606); g.camera.lookAt(4, 2.5, -668); });
  await shoot('monkton-day', 'Monkton by day');
  await page.evaluate(() => {
    const g = window.shine.game;
    g.env.hour = 21.5; g.env.update(0, g.camera.position);
    g.trunk.clear(); g.trunk.place('keg', 0, 0); g.trunk.place('bottle-case', 2, 0); g.trunk.place('sack', 3, 1);
    g.openMarket(g._nearestMarket({ x: 0, z: -660 }).town);
  });
  await shoot('monkton-market', 'Monkton General Store: its own prices');
  await page.evaluate(() => { window.shine.game.ui.back(); });

  // Upgrades: the market's list with cash to spend, then the trunk upgraded twice (6x4)
  // and the reinforced truck.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.dredge.data.cash = 2600;
    g.openMarket();
    document.querySelector('#market-body [data-id="up-trunk"]')?.scrollIntoView();
  });
  await shoot('upgrades', 'the market: upgrades to buy');
  await page.evaluate(() => {
    const g = window.shine.game;
    g.dredge.buy('trunk'); g.dredge.buy('trunk'); g._applyPerks();
    g.ui.back();
    window.shine.teleport(0, 100, 0); window.shine.step(0.1);
    g.trunk.clear();
    for (const [k, x, y] of [['crate', 0, 0], ['long-crate', 2, 0], ['keg', 4, 1], ['coil', 0, 2], ['strongbox', 3, 3]]) g.trunk.place(k, x, y);
    g.openTrunk();
  });
  await shoot('trunk-6x4', 'the trunk after two upgrades (6x4)');
  await page.evaluate(() => {
    const g = window.shine.game;
    g.trunkScreen.close();
    window.shine.teleport(-88, 96, 0.5); window.shine.step(0.2);
    g.camera.position.set(-93, 2.6, 103); g.camera.lookAt(-88, 1.1, 96);
  });
  await shoot('truck-reinforced', 'the reinforced truck (trunk upgrade)');
  await count('reinforced');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 12; g.env.update(0, g.camera.position); g.camera.position.set(-81.5, 2.6, 93); g.camera.lookAt(-88.3, 1.1, 96.5); });
  await shoot('truck-reinforced-day', 'the reinforced truck by day');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 21.5; g.env.update(0, g.camera.position); });

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
