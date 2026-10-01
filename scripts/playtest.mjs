#!/usr/bin/env node
// Scripted playtest: `node scripts/playtest.mjs <label>`. Plays one career from the title
// screen with the story on (prologue, the Act I escape, the valley, a still, a chase with
// a roadblock, a bust, the garage, the Rolls-Royce, a delivery, rain and daylight) through
// window.shine at fixed 60 Hz steps, with a simple autopilot that steers for the objective.
// At each beat it saves a screenshot and a line of stats (state, toast, draw calls, render
// time, console errors) and tiles them into artifacts/shots/playtest-<label>.png.
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
    try { await page.goto(`http://localhost:${port}/?test&story`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  await page.waitForFunction(() => window.__shineReady === true, null, { timeout: 120_000 });

  const beat = async (name, note = '') => {
    const stats = await page.evaluate(() => {
      const g = window.shine.game, t0 = performance.now();
      if (g.state === 'playing' || g.state === 'intro') g.renderFrame();
      g.minimap.draw(g.player, g._mapMarkers(), g._mapPolice(), g.time);
      const ms = performance.now() - t0, info = window.shine.renderInfo();
      return {
        state: g.state, mode: g.mission.mode, tier: g.mission.tier, cash: g.career.cash, mph: g.player.speedMph,
        toast: document.getElementById('toast').className.includes('show') ? document.getElementById('toast').textContent : '',
        open: g.ui.stack.map((s) => s.id).join(','), calls: info.calls, ms: Math.round(ms), ride: g.player.ride,
      };
    });
    const png = await page.screenshot();
    fs.writeFileSync(`${out}/playtest-${label}/${String(beats.length).padStart(2, '0')}-${name}.png`, png);
    beats.push({ name, note, stats, png, errors: errors.splice(0) });
    console.log(name.padEnd(16), JSON.stringify(stats), note);
  };
  // Drive toward the objective for `seconds`, steering for the target (autopilot).
  const skipDialog = async () => { if (await page.locator('#dialog').isVisible()) await page.click('#dialog-skip'); };
  const drive = async (seconds, opts = {}) => { await skipDialog(); await driveRaw(seconds, opts); };
  const driveRaw = (seconds, { throttle = 0.85, cap = 0 } = {}) => page.evaluate(({ seconds, throttle, cap }) => {
    const g = window.shine.game;
    for (let k = 0; k < seconds * 60 && g.state === 'playing'; k++) {
      const v = g.player, t = g.mission.target;
      const want = Math.atan2(t.x - v.position.x, -(t.z - v.position.z));
      const err = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
      const thr = cap && Math.abs(v.speed) > cap ? 0 : throttle;
      window.shine.step(1 / 60, { throttle: Math.abs(err) > 2.4 ? -0.6 : thr, steer: Math.max(-1, Math.min(1, err * 2.2)) * (Math.abs(err) > 2.4 ? -1 : 1) });
    }
  }, { seconds, throttle, cap });

  await page.evaluate(() => window.shine.game.renderer.setAnimationLoop(null));
  await beat('title');
  await page.click('#start-btn');
  await page.waitForTimeout(400);
  await beat('prologue', 'story dialog');
  await page.click('#dialog-skip');
  await drive(2.5);
  await beat('escape-chase', 'Act I: two pursuers, fire');
  await page.evaluate(() => { window.shine.teleport(0, -285, 0); window.shine.step(0.2); });
  await page.waitForTimeout(300);
  await beat('valley', 'reach the county');
  if (await page.locator('#dialog').isVisible()) await page.click('#dialog-skip');
  // The still: drive there, then pick the small order.
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.pickup.position.x + 30, m.pickup.position.z + 30, 0); });
  await drive(6, { cap: 12 });
  await beat('at-still', 'autopilot to the still');
  if (!(await page.locator('#orders').isVisible())) await page.evaluate(() => window.shine.loadShine(0));
  await page.waitForTimeout(300);
  await beat('orders');
  if (await page.locator('#orders').isVisible()) await page.locator('#orders-body .order').first().click();
  await page.waitForTimeout(300);
  await beat('loaded');
  // Heat: tipped off, a chase, a roadblock ahead.
  await page.evaluate(() => { const g = window.shine.game; g.mission.heat = 2.2; g.police.setTarget(2, g.player, g.camera); });
  await drive(4);
  await beat('chase', '2 stars');
  await drive(4);
  await beat('chase-2', 'roadblock?');
  // Busted: pinned by a pursuer.
  await page.evaluate(() => window.shine.game.bust());
  await page.waitForTimeout(300);
  await beat('busted');
  if (await page.locator('#restart-btn').isVisible()) await page.click('#restart-btn');
  await page.waitForTimeout(300);
  // The garage: an upgrade, then the Rolls.
  await page.evaluate(() => { const g = window.shine.game; g.career.data.cash = 12000; g.hud.setCash(12000); });
  await page.keyboard.press('Escape');
  await page.click('#pause-garage');
  await beat('garage');
  await page.locator('#garage-body [data-id="engine"]').click();
  await page.locator('#garage-body [data-id="rolls"]').click();
  await beat('garage-rolls');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  await page.evaluate(() => window.shine.loadShine(0));
  await page.waitForTimeout(300);
  await beat('rolls-orders', 'trunk-sized loads');
  if (await page.locator('#orders').isVisible()) await page.locator('#orders-body .order').first().click();
  await drive(3);
  await beat('rolls-drive');
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.drop.position.x, m.drop.position.z + 40, 0); });
  await drive(5, { cap: 15 });
  await beat('delivered', 'cash pop');
  // Rain, then daylight.
  await page.evaluate(() => { const g = window.shine.game; g.env.setWeather('rain'); g.env.wet = 1; g.env.update(0, g.camera.position); });
  await drive(3);
  await beat('rain');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 12; g.env.update(0, g.camera.position); });
  await drive(3);
  await beat('daylight');

  // Contact sheet.
  const sheet = await browser.newPage({ viewport: { width: 1640, height: 400 } });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await sheet.setContent(`<body style="margin:0;background:#111;font:12px monospace;color:#ddd;display:grid;grid-template-columns:repeat(4,400px);gap:8px;padding:8px">${
    beats.map((b) => `<div><img style="width:400px;display:block" src="data:image/png;base64,${b.png.toString('base64')}"><div><b>${esc(b.name)}</b> ${esc(b.note)} · ${b.stats.state}/${b.stats.mode} · ★${b.stats.tier} · $${b.stats.cash} · ${b.stats.calls} calls · ${b.stats.ms} ms${b.stats.toast ? ` · “${esc(b.stats.toast)}”` : ''}${b.errors.length ? `<div style="color:#f77">${b.errors.map(esc).join('<br>')}</div>` : ''}</div></div>`).join('')
  }</body>`);
  await sheet.screenshot({ path: `${out}/playtest-${label}.png`, fullPage: true });
  console.log(`saved ${out}/playtest-${label}.png`);
  const all = beats.flatMap((b) => b.errors);
  if (all.length) console.log('errors/warnings:\n' + all.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
