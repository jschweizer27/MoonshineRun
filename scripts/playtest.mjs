#!/usr/bin/env node
// Scripted playtest: `node scripts/playtest.mjs <label>`. Plays one run from the title
// screen (drive out, work two salvage sites, pack the trunk, sell at Lexington Market, buy an
// upgrade, drive up York Road to Monkton and sell there; Otto's barn, a batch at the still
// and the shine sold at a speakeasy; a contract taken and delivered; a new rank, Lead Foot
// and Cockeysville's quarry store; a road event and the traffic; the map and the ledger,
// rain and daylight; the midnight freight, Loch Raven and an ending) through window.shine
// at fixed 60 Hz steps, with a simple autopilot that steers for the nearest market. At each
// beat it saves a screenshot and a line of stats (state, toast, draw calls, render time,
// console errors) and tiles them into artifacts/shots/playtest-<label>.png.
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
  // Autopilot for `seconds`: steer for the nearest market and stop in its ring so it opens.
  const drive = (seconds, { sell = true, throttle = 0.85, cap = 0 } = {}) => page.evaluate(({ seconds, sell, throttle, cap }) => {
    const g = window.shine.game;
    const target = () => g._nearestMarket().town;
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
  // Salvage: the nearest farmhouse; stop by it, play the search well, pack what it gives up.
  await page.evaluate(() => {
    const s = window.shine.game.salvage.sites.find((x) => x.kind === 'farmhouse' && !x.night);
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.3);
    const sc = window.shine.game.salvageScreen; sc.manual(); sc.step(0.5);
  });
  await beat('salvage', 'an abandoned farmhouse: remember where the goods glint');
  await page.evaluate(() => { const sc = window.shine.game.salvageScreen; sc.step(1); sc.game.spots.forEach((s, i) => { if (s.good && !sc.game.done) sc.pick(i); }); });
  await beat('salvaged', 'three found: TAKE IT');
  if (await page.locator('#salvage-done').isVisible()) await page.click('#salvage-done');
  await beat('trunk', 'a piece in hand to pack');
  for (let n = 0; n < 4 && (await trunkOpen()); n++) await pack();
  // A wreck in a ditch: the pry ring.
  await page.evaluate(() => {
    const s = window.shine.game.salvage.sites.find((x) => x.kind === 'wreck' && !x.night);
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.3);
    const sc = window.shine.game.salvageScreen; sc.manual(); sc.step(0.6);
  });
  await beat('pry', 'a wreck in the ditch: press in the green');
  await page.evaluate(() => {
    const sc = window.shine.game.salvageScreen, g = sc.game;
    for (let k = 0; k < 2000 && !g.done; k++) { sc.step(1 / 120); if (g.arcs.some((a) => !a.hit && Math.abs(Math.atan2(Math.sin(g.angle - a.a), Math.cos(g.angle - a.a))) < a.w / 4)) sc.press(); }
  });
  if (await page.locator('#salvage-done').isVisible()) await page.click('#salvage-done');
  for (let n = 0; n < 4 && (await trunkOpen()); n++) await pack();
  // Chapter 1: the ruins of Braun & Sons, where Father's coil is.
  await page.evaluate(() => {
    const g = window.shine.game, s = g.salvage.sites.find((x) => x.story === 'ruins');
    window.shine.step(0.6);
    window.shine.teleport(s.stopX, s.stopZ + 30, 0); window.shine.step(0.2);
    window.shine.teleport(s.stopX, s.stopZ, 0); window.shine.step(0.3);
    const sc = g.salvageScreen; sc?.manual(); sc?.step(0.5);
  });
  await beat('ruins', 'Chapter 1: the ruins of Braun & Sons');
  await page.evaluate(() => {
    const g = window.shine.game, s = g.salvage.sites.find((x) => x.story === 'ruins');
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    g._onSalvaged(s, 0.9);
  });
  for (let n = 0; n < 2 && (await trunkOpen()); n++) await pack();
  await page.evaluate(() => window.shine.step(0.6));
  await beat('loaded', 'a few pieces packed, and Father’s coil');
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
  // Otto's barn: the stash, the still and the garage. A coil goes in, then a batch of Corn
  // Shine at a steady hand; the crates go from the stash to the trunk.
  await page.evaluate(() => {
    const g = window.shine.game, h = g.world.home;
    g.dredge.data.stash = { coil: 1, sack: 1, jugs: 1 };
    window.shine.teleport(h.stopX, h.stopZ, 0); window.shine.step(0.3);
  });
  await beat('barn', 'Otto’s barn: stash, still and garage');
  if (await page.locator('#barn').isVisible()) {
    await page.click('#barn [data-id="install-coil"]');
    await page.click('#barn [data-id="brew-corn-shine"]');
    await page.evaluate(() => { const s = window.shine.game.stillScreen; s.manual(); for (let k = 0; k < 600; k++) s.step(1 / 60, s.batch.temp < s.batch.center); });
    await beat('still', 'the fire: keep the needle in the band');
    // The cuts: into the hearts at the first mark, out at the second.
    await page.evaluate(() => {
      const s = window.shine.game.stillScreen, b = s.batch;
      while (b.phase === 'fire') s.step(1 / 60, b.temp < b.center);
      while (b.phase === 'cuts' && b.cuts.pos < b.cuts.marks[0]) s.step(1 / 120);
      s.press();
      while (b.phase === 'cuts' && b.cuts.pos < (b.cuts.marks[0] + b.cuts.marks[1]) / 2) s.step(1 / 120);
    });
    await beat('cuts', 'the cuts: heads, hearts and tails');
    await page.evaluate(() => {
      const s = window.shine.game.stillScreen, b = s.batch;
      while (b.phase === 'cuts' && b.cuts.pos < b.cuts.marks[1]) s.step(1 / 120);
      if (b.phase === 'cuts') s.press();
      while (b.phase === 'cuts') s.step(1 / 120);
      let prev = b.proof.pos;
      while (b.phase === 'proof') { s.step(1 / 240); const now = b.proof.pos; if (b.proof.t > 0.5 && (prev - b.proof.line) * (now - b.proof.line) <= 0) s.press(); prev = now; }
    });
    await beat('graded', 'proofed and graded');
    await page.click('#still-done');
    for (let k = 0; k < 3; k++) { const take = page.locator('#barn [data-id="take-corn-shine"]'); if (await take.isEnabled()) await take.click(); }
    await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  }
  // The shine sells only at a speakeasy (a knock at the door).
  await page.evaluate(() => { const d = window.shine.game.world.drops[0]; window.shine.teleport(d.x, d.z + 30, Math.PI); window.shine.step(0.2); window.shine.teleport(d.x, d.z, Math.PI); window.shine.step(0.3); });
  await beat('speakeasy', 'shine sold at the Highlandtown Speakeasy');
  if (await page.locator('#market').isVisible()) {
    if (await page.locator('#market-sell-all').isEnabled()) await page.click('#market-sell-all');
    await page.click('#market-done');
  }
  // A contract: taken from the board, the goods aboard, delivered at the contact's door.
  await page.evaluate(() => {
    const g = window.shine.game, o = g._jobs().offers()[0];
    g.takeContract(o);
    g.trunk.clear();
    for (const [kind, n] of Object.entries(o.wants)) for (let k = 0; k < n; k++) { const spot = g.trunk.findSpot(kind); if (spot) g.trunk.place(kind, spot.x, spot.y, spot.rot); }
    window.shine.teleport(o.x + 30, o.z, -Math.PI / 2); window.shine.step(0.5);
  });
  await beat('contract', 'a job taken: the DELIVERY marker and the gold ring on the radar');
  await page.evaluate(() => { const c = window.shine.game.dredge.data.orders[0]; if (c) { window.shine.teleport(c.x, c.z, 0); window.shine.step(0.3); } });
  await beat('delivered', 'paid at the door: the handoff card');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  // A new rank (Runner): Lead Foot, and Cockeysville's quarry store deals with Otto.
  await page.evaluate(() => { const g = window.shine.game; g._addRep(Math.max(0, 90 - (g.dredge.data.rep || 0))); });
  await beat('runner', 'a new rank and what it unlocks');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.teleport(0, -300, Math.PI); window.shine.step(0.2);
    g.useAbility('leadfoot');
    window.shine.step(3, { throttle: 1 });
  });
  await beat('lead-foot', 'Lead Foot down York Road into the city');
  await page.evaluate(() => {
    const g = window.shine.game;
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    g.trunk.clear(); g.trunk.place('coil', 0, 0); g._updateTrunkPill();
    window.shine.teleport(394, -590, 0); window.shine.step(0.3);
    window.shine.teleport(400, -646, 0); window.shine.step(0.3);
  });
  await beat('cockeysville', 'the quarry store, for a Runner');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  // A road event: a cart broken down across a valley road, and the route going round it.
  await page.evaluate(() => {
    const g = window.shine.game, ev = g.roadEvents.start('breakdown', 7, g.dredge.market.clock + 3, g.env, g.dredge.market);
    // Up the road toward the cart.
    const [a, b] = ev.edge.split('-').map((id) => g.world.roads.nodes[Number(id)]), len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    window.shine.teleport(ev.x - ux * 24, ev.z - uz * 24, Math.atan2(ux, -uz)); window.shine.step(0.4);
    g.hud.toast(ev.text, 'gold', 5000);
  });
  await beat('road-event', 'a broken-down cart: the road is closed');
  await page.evaluate(() => { const g = window.shine.game; g.roadEvents.end(g.dredge.market); });
  // Traffic in the city.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.traffic.enabled = true;
    window.shine.teleport(0, 150, 0); window.shine.step(3, { throttle: 0.4 });
  });
  await beat('traffic', 'cars, vans and carts on the city streets');
  await page.evaluate(() => { const g = window.shine.game; g.traffic.enabled = false; g.traffic.clear(); });
  // A lamp post knocked flat on the way past, then dawn: the night's tally, the day saved.
  await page.evaluate(() => {
    const g = window.shine.game, w = g.world, P = g.player;
    const k = w.lampSpots.findIndex((sp) => sp.pole && Math.abs(sp.px) < 120 && Math.abs(sp.pz) < 120 && sp.tz === 0 && Math.abs(sp.tx) === 1);
    const sp = w.lampSpots[k];
    P.place(sp.px + sp.tx * 14, sp.pz, Math.atan2(-sp.tx, 0)); P.vx = -sp.tx * 14; P.vz = 0; P.speed = 14;
    window.shine.step(0.9, { throttle: 0.3 });
  });
  await beat('lamp-post', 'a lamp post knocked flat, its light out');
  await page.evaluate(() => { const g = window.shine.game; g._dawn(); window.shine.step(0.1); });
  await beat('dawn', 'dawn: the night summed up and saved');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); g.env.hour = 21.5; });
  // The Bureau: a patrol's cone on a night street, a chase with the roadblock up, the
  // checkpoint at the York Road gap, and a bust.
  await page.evaluate(() => {
    const g = window.shine.game, P = g.police;
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    g.env.hour = 21.5;
    P.enabled = true; P.reset();
    g.trunk.clear(); g.trunk.place('corn-shine', 0, 0);
    const u = P.units[0];
    Object.assign(u, { active: true, mode: 'patrol', goal: { x: 0, z: -200 } });
    u.car.place(0, 110, 0);
    g.player.place(0, 150, 0);
    g.chase.snap(g.player);
    window.shine.step(0.3);
  });
  await beat('patrol', 'a Bureau patrol and its sight cone');
  await page.evaluate(() => {
    const g = window.shine.game, P = g.police;
    g.player.place(0, 80, 0); window.shine.step(0.2);
    P.heat = 2; P._setPursuers(g.player.position);
    P.units.filter((u) => u.active).forEach((u, i) => u.car.place(-4 + i * 8, 110, 0));
    Object.assign(P.roadblock, { active: true, x: 0, z: 30, ux: 0, uz: -1 });
    window.shine.step(1, { throttle: 0.6 });
  });
  await beat('chase', 'heat 2: two cars after you, a roadblock ahead');
  await page.evaluate(() => {
    const g = window.shine.game, P = g.police, C = P.checkpoint;
    window.__chapter = g.dredge.data.chapter;
    g.dredge.data.chapter = Math.max(2, g.dredge.data.chapter);   // the checkpoint stands from chapter 3
    P.reset(); P._patrols = () => {};
    g.player.place(C.x, C.z + 45, 0);
    g.chase.snap(g.player);
    window.shine.step(0.3);
  });
  await beat('checkpoint', 'the York Road checkpoint at night');
  await page.evaluate(() => { const g = window.shine.game, C = g.police.checkpoint; g.player.place(C.x, C.z, 0); window.shine.step(0.2); });
  await beat('bust', 'searched with shine aboard: busted');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); g.police.enabled = false; g.police.reset(); g.dredge.data.chapter = window.__chapter; });
  // Otto's notebook: the order book, the contacts and their trust, the recipes.
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); g.openNotebook(); });
  await page.waitForTimeout(200);
  await beat('notebook', 'Otto’s notebook: orders, contacts and trust, recipes');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  // The map and the books.
  await page.evaluate(() => window.shine.game.openMap());
  await page.waitForTimeout(200);
  await beat('map');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); g.pause(); });
  await page.click('#pause-ledger');
  await beat('ledger');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.resume(); });
  // Rain, then daylight: straight up York Road in the city.
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
  // Chapter 3's midnight freight at the Glyndon siding; Loch Raven and drowned Warren by night
  // (chapter 5); then an ending, and its screen.
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 23.6; window.shine.teleport(-410, -630, 0); window.shine.step(0.5); });
  await beat('freight', 'the midnight freight at Glyndon, 23:00–01:30');
  await page.evaluate(() => { const g = window.shine.game; g.env.hour = 21.5; window.shine.teleport(528, -730, Math.PI / 2); window.shine.step(0.5); });
  await beat('loch-raven', 'Loch Raven: drowned Warren in the water');
  await page.evaluate(async () => {
    const g = window.shine.game, d = g.dredge.data, { CHAPTERS } = await import('/src/chapters.js');
    for (const c of CHAPTERS) { d.opened[c.id] = true; for (const st of c.steps) d.steps[st.id] = true; d.clues[c.clue.id] = true; if (c.tool) d.tools[c.tool.id] = true; }
    d.chapter = CHAPTERS.length;
    while (g.ui.anyOpen) g.ui.close();
    g.resume();
    window.shine.step(0.6);
    g._end('paper');
  });
  await page.waitForTimeout(300);
  await beat('ending', 'the paper: the ending screen');

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
