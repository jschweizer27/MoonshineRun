#!/usr/bin/env node
// Art-direction screenshots: `npm run shots -- <label> [--day] [--rain]`. Starts the game in a
// headless browser, drives up the street, and saves a chase-camera frame, a wide street
// view and a close-up of the truck to artifacts/shots/<label>-*.png. It also prints how long
// a frame takes to render. Headless Chromium draws with a software GPU, so compare those
// timings with each other rather than reading them as real frame rates.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) || 'shot';
const flags = new Set(args.filter((a) => a.startsWith('--')));
const port = 4190 + Math.floor(Math.random() * 50);
const out = 'artifacts/shots';
fs.mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: 'ignore' });
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  for (let i = 0; i < 50; i++) {
    try { await page.goto(`http://localhost:${port}/?test`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  await page.waitForFunction(() => window.__shineReady === true, null, { timeout: 90_000 });
  await page.click('#start-btn');
  // Stop the game's own loop: every frame is stepped and drawn by this script, so each
  // screenshot shows exactly the moment and camera it set up.
  await page.evaluate(() => window.shine.game.renderer.setAnimationLoop(null));
  await page.evaluate(({ day, rain }) => {
    const g = window.shine.game;
    if (day) g.env.hour = 12;
    if (rain) { g.env.setWeather('rain'); g.env.wet = 1; }
    g.env.update(0, g.camera.position);
  }, { day: flags.has('--day'), rain: flags.has('--rain') });

  const render = () => page.evaluate(() => { const g = window.shine.game; (g.renderFrame ? g.renderFrame() : g.renderer.render(g.scene, g.camera)); });
  const shoot = async (name) => { await render(); await page.screenshot({ path: `${out}/${label}-${name}.png` }); console.log(`saved ${out}/${label}-${name}.png`); };

  // Down a city street from the hideout side, at speed, with a gentle weave.
  await page.evaluate(() => { const s = window.shine; s.teleport(0, 150, 0); });
  await page.evaluate(() => window.shine.step(2.5, { throttle: 1 }));
  await page.evaluate(() => window.shine.step(0.6, { throttle: 1, steer: 0.35 }));
  await page.evaluate(() => window.shine.step(0.6, { throttle: 1, steer: -0.35 }));
  await shoot('chase');

  // Wide street view: a pedestrian's-eye camera on the corner looking down the avenue.
  await page.evaluate(() => {
    const g = window.shine.game, v = g.player, p = v.position, fx = v.forwardX, fz = v.forwardZ;
    // Up the road ahead of the truck, off to one side, looking back down the street.
    g.camera.position.set(p.x + fx * 30 - fz * 3.5, 3.2, p.z + fz * 30 + fx * 3.5);
    g.camera.lookAt(p.x - fx * 10, 2, p.z - fz * 10);
  });
  await shoot('wide');

  // Close-up of the truck, three-quarter front.
  await page.evaluate(() => {
    const g = window.shine.game, v = g.player, fx = v.forwardX, fz = v.forwardZ;
    g.camera.position.set(v.position.x + fx * 9 + fz * 6, 2.6, v.position.z + fz * 9 - fx * 6);
    g.camera.lookAt(v.position.x, 1.2, v.position.z);
  });
  await shoot('truck');

  // The skyline: from the street, looking up toward the moon over the rooftops.
  await page.evaluate(() => {
    const g = window.shine.game, v = g.player, d = g.world.sky.uniforms.uMoonDir.value;
    g.camera.position.set(v.position.x, 2.5, v.position.z);
    g.camera.lookAt(v.position.x + d.x * 100, 2.5 + 45, v.position.z + d.z * 100);
  });
  await shoot('sky');

  // Steam from a street grate, after a few seconds of it rising (camera fixed at the corner).
  await page.evaluate(() => {
    const g = window.shine.game, v = g.player, B = g.world.cfg.blockSize;
    let best = g.world.grates[0];
    for (const p of g.world.grates) if (Math.hypot(p[0] - v.position.x, p[1] - v.position.z) < Math.hypot(best[0] - v.position.x, best[1] - v.position.z)) best = p;
    g.camera.position.set(best[0] - 7, 1.8, best[1] + 9);
    g.camera.lookAt(best[0], 1.6, best[1]);
    for (let i = 0; i < 200; i++) {
      g.particles.atmosphere(1 / 60, g.world, g.camera.position, { night: 1 - g.env.daylight, wet: g.env.wet });
      g.particles.update(1 / 60);
    }
    return B;
  });
  await shoot('steam');

  // Render cost at the chase view, with each expensive effect switched off in turn. Reading
  // a pixel back makes the (software) GPU finish the frame before the clock stops.
  const costs = await page.evaluate(() => {
    const g = window.shine.game, gl = g.renderer.getContext(), px = new Uint8Array(4);
    g.chase.snap(g.player);
    const draw = () => { g.renderFrame(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    const time = () => { draw(); draw(); const t0 = performance.now(); for (let i = 0; i < 8; i++) draw(); return (performance.now() - t0) / 8; };
    const out = { all: time(), calls: window.shine.renderInfo().calls };
    const size = g.world.moon.shadow.mapSize.x;
    g.world.setShadows(0); out.noShadows = time(); g.world.setShadows(size);
    for (const [name, fx] of Object.entries(g.effectToggles?.() || {})) { fx(false); out[`no ${name}`] = time(); fx(true); }
    return out;
  });
  const fmt = Object.entries(costs).filter(([k]) => k !== 'calls').map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(' · ');
  console.log(`render (software GPU, compare only): ${fmt} · ${costs.calls} draw calls`);
} finally {
  await browser.close();
  server.kill();
}
