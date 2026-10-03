#!/usr/bin/env node
// Measure the run's economy: `node scripts/economy.mjs [minutes] [upgrade level] [seed]
// [rare]`. A road-following autopilot plays the run with the clock on (prices drift and
// gluts ease): it drives to the nearest loot, packs what fits, and sells at the nearest
// market when the trunk is three-quarters full. With `rare` it also fetches each rare find
// and sells it where it pays best. Prints what it earned per game minute, pickups per minute
// and each sale ([second, pieces, $]), to set prices and upgrade costs against. One run is
// one layout: compare a few seeds.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const minutes = Number(process.argv[2] || 10), levels = process.argv[3] || '0';
const seed = process.argv[4], rare = process.argv[5] === 'rare';
const port = 4620 + Math.floor(Math.random() * 30);
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], { stdio: 'ignore' });
const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  for (let i = 0; i < 50; i++) { try { await page.goto(`http://localhost:${port}/?test&time${seed ? `&seed=${seed}` : ''}`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  await page.waitForFunction(() => window.__shineReady === true, null, { timeout: 120000 });
  await page.evaluate((lv) => {
    const g = window.shine.game;
    g.eraseProgress();
    for (const id of Object.keys(g.dredge.data.upgrades)) g.dredge.data.upgrades[id] = Number(lv);
    g.renderer.setAnimationLoop(null);
  }, levels);
  await page.click('#start-btn');
  await page.evaluate(() => { window.shine.game.renderer.setAnimationLoop(null); });
  const res = await page.evaluate(async ({ minutes, rare }) => {
    const g = window.shine.game, L = g.loot, R = g.world.roads, { sell } = await import('/src/market.js');
    const st = { picked: 0, left: 0, sales: 0, earned: 0, value: 0, stuck: 0, rares: 0, log: [] };
    const K = Object.fromEntries((await import('/src/config.js')).CONFIG.dredge.loot.kinds.map((k) => [k.id, k]));
    let way = [], goal = null, goalKind = '', stuckT = 0, revT = 0, stalls = 0;
    const skip = new Map();   // pieces it gave up on (stalled three times on the way), for 30 s
    // Plan a road route to `t`; the same target keeps its route (re-planning from the nearest
    // node, which can lie behind the truck, would turn it round on a long drive).
    const plan = (t, kind) => {
      if (way.length && goal && goal.x === t.x && goal.z === t.z) return;
      // Around a road closed by a road event, as the radar's route goes.
      const p = g.player.position, a = R.nearest(p.x, p.z).id, b = R.nearest(t.x, t.z).id;
      const ids = R.path(a, b, g.roadEvents.blocked) || R.path(a, b) || [];
      if (!goal || goal.x !== t.x || goal.z !== t.z) stalls = 0;
      way = [...ids.map((i) => R.nodes[i]), t]; goal = t; goalKind = kind;
    };
    const towns = (await import('/src/config.js')).CONFIG.dredge.towns;
    // The market to sell at: where a rare find aboard pays best (rare mode), else the nearest.
    const marketFor = () => {
      if (rare) for (const pc of g.trunk.pieces.values()) if (K[pc.kind].paysAt) return towns.find((t) => t.id === K[pc.kind].paysAt);
      return g._nearestMarket().town;
    };
    const pickTarget = () => {
      const p = g.player.position;
      const out = rare && L.rare?.();
      if (out && g.trunk.findSpot(out.kind.id)) { plan({ x: out.x, z: out.z, i: L.rareSlot }, 'loot'); return; }
      if (g.trunk.used >= g.trunk.size * 0.75 || (rare && [...g.trunk.pieces.values()].some((pc) => K[pc.kind].paysAt))) { plan(marketFor(), 'market'); return; }
      let best = null, bd = Infinity;
      for (let i = 0; i < L.n; i++) if (L.active[i] && !(skip.get(i) > g.time)) { const d = Math.hypot(L.x[i] - p.x, L.z[i] - p.z); if (d < bd) { bd = d; best = i; } }
      if (best == null) { plan(g._nearestMarket().town, 'market'); return; }
      plan({ x: L.x[best], z: L.z[best], i: best }, 'loot');
    };
    const end = g.time + minutes * 60;
    let decide = 0;
    while (g.time < end) {
      if (g.state === 'paused') {
        const s = g.trunkScreen;
        if (s.isOpen) {
          const spot = s.hand && g.trunk.findSpot(s.hand.kind);
          if (spot) { if (K[s.hand.kind].rare) st.rares++; s.cursor = { x: spot.x, y: spot.y }; s.hand.rot = spot.rot; s.confirm(); st.picked++; } else st.left++;
          s.close();
        }
        if (g.ui.isOpen('market')) {
          const town = g._nearestMarket().town, r = sell(town.id, g.trunk, g.dredge.market, null);
          if (r.count) { g.dredge.sold({ ...r, town: town.name, trunk: g.trunk }); st.sales++; st.earned += r.total; st.log.push([Math.round(g.time), r.count, r.total]); }
          g.ui.close('market'); g._marketRender = null;
        }
        while (g.ui.anyOpen) g.ui.close();
        g.resume();
        way = [];
        continue;
      }
      if (!way.length || (goalKind === 'loot' && !L.active[goal.i]) || (decide -= 1 / 60) < 0) { pickTarget(); decide = 3; }
      const v = g.player, p = v.position;
      while (way.length > 1 && Math.hypot(way[0].x - p.x, way[0].z - p.z) < 9) way.shift();
      const w = way[0];
      const want = Math.atan2(w.x - p.x, -(w.z - p.z));
      const err = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
      const dGoal = Math.hypot(goal.x - p.x, goal.z - p.z);
      let thr = Math.abs(err) > 0.6 ? 0.25 : 1;
      if (Math.abs(v.speed) > 22 && Math.abs(err) > 0.3) thr = -0.5;
      if (goalKind === 'market' && dGoal < 14) thr = Math.abs(v.speed) > 1 ? -1 : 0.15;
      if (Math.abs(v.speed) < 1) stuckT += 1 / 60; else stuckT = 0;
      if (stuckT > 2) { revT = 1; stuckT = 0; st.stuck++; way = [];
        if (goalKind === 'loot' && ++stalls >= 3) { skip.set(goal.i, g.time + 30); stalls = 0; goal = null; } }   // back off, then re-plan
      let input = { throttle: thr, steer: Math.max(-1, Math.min(1, err * 2)) };
      if (revT > 0) { revT -= 1 / 60; input = { throttle: -1, steer: -input.steer }; }
      g.step(1 / 60, input);
    }
    st.value = g.trunk.value;
    st.cash = g.dredge.cash;
    return st;
  }, { minutes, rare });
  const perMin = (n) => (n / minutes).toFixed(1);
  console.log(JSON.stringify({ levels, minutes, seed: seed || 'default', rare, rares: res.rares, picked: res.picked, left: res.left, sales: res.sales, earned: res.earned, inTrunk: res.value, stuck: res.stuck }));
  console.log(`$/min ${perMin(res.earned + res.value)}  pickups/min ${perMin(res.picked)}  sales ${JSON.stringify(res.log)}`);
} finally { await browser.close(); server.kill(); }
