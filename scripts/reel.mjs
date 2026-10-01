#!/usr/bin/env node
// Game-feel review reel: `npm run reel -- <label> [--off] [--wet]`. Drives a scripted run
// (launch, handbrake drift, hard braking, a crash), captures frames at the key moments and
// tiles them into one contact sheet at artifacts/shots/reel-<label>.png. It also prints what
// the effects are doing (body roll and pitch, camera FOV and distance, skid marks, smoke) so
// "too subtle" can be judged in numbers as well as by eye. --off runs with juice off.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) || 'reel';
const flags = new Set(args.filter((a) => a.startsWith('--')));
const port = 4240 + Math.floor(Math.random() * 50);
const out = 'artifacts/shots';
fs.mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: 'ignore' });
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  for (let i = 0; i < 50; i++) {
    try { await page.goto(`http://localhost:${port}/?test`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  await page.waitForFunction(() => window.__shineReady === true, null, { timeout: 90_000 });
  await page.click('#start-btn');
  // Stop the game's own loop: every frame is stepped and drawn by this script, so each
  // screenshot shows exactly the moment and camera it set up.
  await page.evaluate(() => window.shine.game.renderer.setAnimationLoop(null));
  await page.evaluate(({ off, wet }) => {
    const g = window.shine.game;
    if (off) g.toggleJuice();
    if (wet) { g.env.setWeather('rain'); g.env.wet = 1; }
    window.shine.teleport(0, 205, 0);
    window.__stats = () => {
      const f = g.feel, c = g.camera, v = g.player;
      const alive = (pool) => { let n = 0; for (let i = 0; i < pool.n; i++) if (pool.life[i] > 0) n++; return n; };
      let skids = 0;
      for (let k = 0; k < f.skids.n; k++) if (f.skids.col[k * 16 + 3] > 0.01) skids++;
      return {
        mph: v.speedMph, rollDeg: +(f.roll.x * 57.3).toFixed(1), pitchDeg: +(f.pitch.x * 57.3).toFixed(1), heaveCm: +(f.heave.x * 100).toFixed(1),
        fov: +c.fov.toFixed(1), camDist: +Math.hypot(c.position.x - v.position.x, c.position.z - v.position.z).toFixed(1),
        camH: +c.position.y.toFixed(1), smoke: alive(g.particles.smoke), sparks: alive(g.particles.glow), skids, light: +g.headlight.intensity.toFixed(0),
      };
    };
  }, { off: flags.has('--off'), wet: flags.has('--wet') });

  const frames = [];
  const run = async (seconds, input, captureAt, name) => {
    let t = 0;
    for (const at of captureAt) {
      await page.evaluate(([s, i]) => window.shine.step(s, i), [at - t, input]);
      t = at;
      await page.evaluate(() => window.shine.game.renderFrame());
      const png = await page.screenshot();
      const stats = await page.evaluate(() => window.__stats());
      frames.push({ name: `${name} ${at.toFixed(2)}s`, png, stats });
      console.log(`${name.padEnd(9)} ${at.toFixed(2)}s`, JSON.stringify(stats));
    }
    if (seconds > t) await page.evaluate(([s, i]) => window.shine.step(s, i), [seconds - t, input]);
  };

  await run(2.4, { throttle: 1 }, [0.3, 1.2, 2.4], 'launch');
  await run(0.9, { throttle: -1 }, [0.15, 0.45, 0.9], 'brake');
  await run(1.2, { throttle: 1 }, [], 'go');
  const driftAt = await page.evaluate(() => ({ ...window.shine.game.player.position }));
  await run(0.5, { throttle: 1, steer: 1, handbrake: true }, [0.2, 0.45], 'drift');

  // The skid marks, looking down on the middle of them.
  await page.evaluate((p) => {
    const g = window.shine.game, k = g.feel.skids;
    let x = 0, z = 0, n = 0;
    for (let i = 0; i < k.n; i++) if (k.col[i * 16 + 3] > 0.01) { x += k.pos[i * 12]; z += k.pos[i * 12 + 2]; n++; }
    if (n) { x /= n; z /= n; } else { x = p.x; z = p.z; }
    g.camera.position.set(x + 6, 11, z + 9);
    g.camera.lookAt(x, 0, z);
  }, driftAt);
  await page.evaluate(() => window.shine.game.renderFrame());
  frames.push({ name: 'skid marks', png: await page.screenshot(), stats: await page.evaluate(() => window.__stats()) });

  // Crash: flat out down an east-west street into the warehouses at the city edge.
  await page.evaluate(() => { window.shine.teleport(140, 132, Math.PI / 2); });
  const hitAt = await page.evaluate(() => {
    const g = window.shine.game;
    for (let i = 0; i < 400; i++) { g.step(1 / 60, { throttle: 1, steer: 0, handbrake: false }); if (g.player.impact > 6) return g.player.impact; }
    return 0;
  });
  console.log(`crash at ${hitAt.toFixed(1)} m/s`);
  await run(0.6, { throttle: 0.3 }, [0.02, 0.1, 0.25, 0.6], 'crash');
  fs.mkdirSync(`${out}/reel-${label}`, { recursive: true });
  frames.forEach((f, i) => fs.writeFileSync(`${out}/reel-${label}/${String(i).padStart(2, '0')}-${f.name.replace(/[^a-z0-9.]+/gi, '-')}.png`, f.png));

  // Contact sheet: 4 across, captioned.
  const sheet = await browser.newPage({ viewport: { width: 1640, height: 400 } });
  const html = `<body style="margin:0;background:#111;font:13px monospace;color:#ddd;display:grid;grid-template-columns:repeat(4,400px);gap:8px;padding:8px">${
    frames.map((f) => `<div><img style="width:400px;display:block" src="data:image/png;base64,${f.png.toString('base64')}"><div>${f.name} · ${f.stats.mph} mph · roll ${f.stats.rollDeg}° pitch ${f.stats.pitchDeg}° · fov ${f.stats.fov} · skids ${f.stats.skids} · smoke ${f.stats.smoke}</div></div>`).join('')
  }</body>`;
  await sheet.setContent(html);
  await sheet.screenshot({ path: `${out}/reel-${label}.png`, fullPage: true });
  console.log(`saved ${out}/reel-${label}.png`);
} finally {
  await browser.close();
  server.kill();
}
