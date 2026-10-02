#!/usr/bin/env node
// Scripted playtest: `node scripts/playtest.mjs <label>`. Plays one run from the title
// screen (drive out, pick up loot, pack the trunk, sell at Lexington Market, buy an
// upgrade, drive up York Road to Monkton and sell there, the map and the ledger, rain and
// daylight) through window.shine at fixed 60 Hz steps, with a simple autopilot that steers
// for the next piece of loot or the nearest market. At each beat it saves a screenshot and
// a line of stats (state, toast, draw calls, render time, console errors) and tiles them
// into artifacts/shots/playtest-<label>.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const label = process.argv[2] || 'run';
const port = 4500 + Math.floor(Math.random() * 50);
const out = 'artifacts/shots';
fs.mkdirSync(`${out}/playtest-${label}`, { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: 'ignore' });
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const beats = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  for (let i = 0; i < 50; i++) {
    try { await page.goto(`http://localhost:${port}/?test&painterly`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  await page.waitForFunction(() => window.__shineReady === true, null, { timeout: 120_000 });
  await page.evaluate(() => window.shine.game.eraseProgress());

  const beat = async (name, note = '') => {
    const stats = await page.evaluate(() => {
      const g = window.shine.game, t0 = performance.now();
      if (g.state === 'playing' || g.state === 'intro') g.renderFrame();
      g.minimap.draw(g.player, g._mapMarkers());
      const ms = performance.now() - t0, info = window.shine.renderInfo();
      return {
        state: g.state, cash: g.dredge.cash, trunk: `${g.trunk.used}/${g.trunk.size}`, mph: g.player.speedMph,
        toast: document.getElementById('toast').className.includes('show') ? document.getElementById('toast').textContent : '',
        open: g.ui.stack.map((s) => s.id).join(','), calls: info.calls, ms: Math.round(ms),
      };
    });
    const png = await page.screenshot();
    fs.writeFileSync(`${out}/playtest-${label}/${String(beats.length).padStart(2, '0')}-${name}.png`, png);
    beats.push({ name, note, stats, png, errors: errors.splice(0) });
    console.log(name.padEnd(16), JSON.stringify(stats), note);
  };
  // Autopilot for `seconds`: steer for the nearest piece of loot, or for the nearest market
  // with `sell` set (or a full trunk). Stops when the game pauses: a pickup opens the trunk,
  // a stop in a market opens it.
  const drive = (seconds, { sell = false, throttle = 0.85, cap = 0 } = {}) => page.evaluate(({ seconds, sell, throttle, cap }) => {
    const g = window.shine.game, L = g.loot;
    const target = () => {
      const p = g.player.position;
      if (sell || g.trunk.used >= g.trunk.size) return g._nearestMarket().town;
      let best = null, bd = Infinity;
      for (let i = 0; i < L.n; i++) {
        if (!L.active[i]) continue;
        const d = Math.hypot(L.x[i] - p.x, L.z[i] - p.z);
        if (d < bd) { bd = d; best = { x: L.x[i], z: L.z[i] }; }
      }
      return best;
    };
    for (let k = 0; k < seconds * 60 && g.state === 'playing'; k++) {
      const v = g.player, t = target();
      const want = Math.atan2(t.x - v.position.x, -(t.z - v.position.z));
      const err = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
      // Brake to a stop in a market's ring so it opens.
      const near = sell && Math.hypot(t.x - v.position.x, t.z - v.position.z) < 9;
      const thr = near ? (Math.abs(v.speed) > 1 ? -1 : 0) : cap && Math.abs(v.speed) > cap ? 0 : throttle;
      window.shine.step(1 / 60, { throttle: Math.abs(err) > 2.4 ? -0.6 : thr, steer: Math.max(-1, Math.min(1, err * 2.2)) * (Math.abs(err) > 2.4 ? -1 : 1) });
    }
  }, { seconds, sell, throttle, cap });
  // Put the piece in hand down wherever it fits, and close the trunk.
  const pack = () => page.evaluate(() => {
    const g = window.shine.game, s = g.trunkScreen;
    const spot = s.hand && g.trunk.findSpot(s.hand.kind);
    if (spot) { s.cursor = { x: spot.x, y: spot.y }; s.hand.rot = spot.rot; s.confirm(); }
    s.close();
  });
  const trunkOpen = () => page.evaluate(() => window.shine.game.trunkScreen.isOpen);

  await page.evaluate(() => window.shine.game.renderer.setAnimationLoop(null));
  await beat('title');
  await page.click('#start-btn');
  await page.waitForTimeout(300);
  await beat('york-road', 'the start, just inside the city');
  // Loot: the autopilot goes for the nearest piece; the trunk opens with it in hand.
  await drive(25, { cap: 16 });
  await beat('trunk', 'picked up a piece');
  if (await trunkOpen()) await pack();
  for (let n = 0; n < 2; n++) {
    await drive(25, { cap: 16 });
    if (await trunkOpen()) await pack();
  }
  await beat('loaded', 'a few pieces packed');
  // Sell in the city: teleport near Lexington Market, then roll in and stop.
  await page.evaluate(() => { window.shine.teleport(-44, 80, 0); window.shine.step(0.1); });
  await drive(8, { sell: true, cap: 10 });
  await beat('market', 'Lexington Market');
  if (await page.locator('#market').isVisible()) {
    if (await page.locator('#market-sell-all').isEnabled()) await page.click('#market-sell-all');
    await page.evaluate(() => { const g = window.shine.game; g.dredge.data.cash += 600; g._marketRender?.(); });
    const buy = page.locator('#market-body [data-id="up-trunk"]');
    if (await buy.isEnabled()) await buy.click();
    await beat('upgraded', 'sold, then a bigger bed');
    await page.click('#market-done');
  }
  // Up York Road to Monkton: its name shows on arrival.
  await page.evaluate(() => { window.shine.teleport(0, -560, Math.PI); window.shine.step(0.3); window.shine.teleport(0, -600, Math.PI); window.shine.step(0.5); });
  await beat('monkton', 'arriving in the valley');
  await page.evaluate(() => { const g = window.shine.game; g.trunk.place('keg', 0, 0); g.dredge.saveTrunk(g.trunk); g._updateTrunkPill(); window.shine.teleport(0, -630, Math.PI); });
  await drive(8, { sell: true, cap: 10 });
  await beat('monkton-market', 'the general store');
  if (await page.locator('#market').isVisible()) {
    if (await page.locator('#market-sell-all').isEnabled()) await page.click('#market-sell-all');
    await page.click('#market-done');
  }
  // The map and the books.
  await page.evaluate(() => window.shine.game.openMap());
  await page.waitForTimeout(200);
  await beat('map');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); g.pause(); });
  await page.click('#pause-ledger');
  await beat('ledger');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  // Rain, then daylight: straight up York Road in the city, past the loot.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.perks.pickupRadius = 0;
    window.shine.teleport(0, 200, 0);
    g.env.setWeather('rain'); g.env.wet = 1; g.env.update(0, g.camera.position);
    window.shine.step(2.5, { throttle: 0.8 });
  });
  await beat('rain');
  await page.evaluate(() => {
    const g = window.shine.game;
    g.env.setWeather('clear'); g.env.wet = 0; g.env.hour = 12; g.env.update(0, g.camera.position);
    window.shine.teleport(0, 200, 0);
    window.shine.step(2.5, { throttle: 0.8 });
  });
  await beat('daylight');

  // Contact sheet.
  const sheet = await browser.newPage({ viewport: { width: 1640, height: 400 } });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await sheet.setContent(`<body style="margin:0;background:#111;font:12px monospace;color:#ddd;display:grid;grid-template-columns:repeat(4,400px);gap:8px;padding:8px">${
    beats.map((b) => `<div><img style="width:400px;display:block" src="data:image/png;base64,${b.png.toString('base64')}"><div><b>${esc(b.name)}</b> ${esc(b.note)} · ${b.stats.state} · $${b.stats.cash} · trunk ${b.stats.trunk} · ${b.stats.calls} calls · ${b.stats.ms} ms${b.stats.toast ? ` · “${esc(b.stats.toast)}”` : ''}${b.errors.length ? `<div style="color:#f77">${b.errors.map(esc).join('<br>')}</div>` : ''}</div></div>`).join('')
  }</body>`);
  await sheet.screenshot({ path: `${out}/playtest-${label}.png`, fullPage: true });
  console.log(`saved ${out}/playtest-${label}.png`);
  const all = beats.flatMap((b) => b.errors);
  if (all.length) console.log('errors/warnings:\n' + all.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
