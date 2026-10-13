#!/usr/bin/env node
// Measure the salvage economy: `node scripts/economy.mjs [minutes] [score] [upgrade level]
// [seed]`. A road-following autopilot plays with the clock on: it drives to the nearest
// salvage site that can be worked now (night sites only after dark), works it at a set
// mini-game score (0..1; 0.85 is a clean job, 0.5 a fair one), packs what it gives up and,
// with the trunk three-quarters full, sells at the nearest market. The mini-games, the
// packing and the market take real time with the game paused, so each counts a fixed
// overhead (OVERHEAD, seconds) on top of the driving. Prints dollars per real minute, sites
// worked per hour, the still's makings found per hour (sacks, jugs, small crates) and each
// sale ([minute, pieces, $]): scripts/progress.mjs takes its salvage rates from these. One
// run is one layout: compare a few seeds.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const minutes = Number(process.argv[2] || 20), score = Number(process.argv[3] ?? 0.85), levels = process.argv[4] || '0';
const seed = process.argv[5];
const OVERHEAD = { site: 12, piece: 3, sale: 6 };
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
    for (const id of Object.keys(g.dredge.data.upgrades)) g.dredge.data.upgrades[id] = Math.min(Number(lv), 3);
    g.renderer.setAnimationLoop(null);
  }, levels);
  await page.click('#start-btn');
  const res = await page.evaluate(async ({ minutes, score, OVERHEAD }) => {
    const g = window.shine.game, w = g.world, R = w.roads, { sell, dayOf } = await import('/src/market.js');
    g.renderer.setAnimationLoop(null);
    while (g.ui.anyOpen) g.ui.close();
    if (g.state === 'paused') g.resume();
    const st = { sites: 0, pieces: 0, left: 0, sales: 0, earned: 0, stuck: 0, overhead: 0, makings: {}, kinds: {}, log: [] };
    // Work a site at the set score, without the mini-game (its time is counted instead).
    g.openSalvage = (site) => { g.pause({ showMenu: false }); st.sites++; st.overhead += OVERHEAD.site; g._onSalvaged(site, score); };
    let way = [], goal = null, goalKind = '', stuckT = 0, revT = 0, stalls = 0;
    const skip = new Map();   // sites it gave up on (stalled three times on the way), for a while
    const plan = (t, kind) => {
      if (way.length && goal && goal.x === t.x && goal.z === t.z) return;
      const p = g.player.position, a = w.nearestNode(p.x, p.z).id, b = w.nearestNode(t.x, t.z).id;
      const ids = R.path(a, b, g.roadEvents.blocked) || R.path(a, b) || [];
      if (!goal || goal.x !== t.x || goal.z !== t.z) stalls = 0;
      way = [...ids.map((i) => R.nodes[i]), t]; goal = t; goalKind = kind;
    };
    const pickTarget = () => {
      const p = g.player.position;
      if (g.trunk.used >= g.trunk.size * 0.75) { plan(g._nearestMarket().town, 'market'); return; }
      const day = dayOf(g.dredge.market);
      let best = null, bd = Infinity;
      for (const s of g.salvage.sites) {
        if (s.story || skip.get(s.id) > g.time || g.salvage.status(s, day, g.env.hour) !== 'ok') continue;
        const d = Math.hypot(s.stopX - p.x, s.stopZ - p.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) { plan(g._nearestMarket().town, 'market'); return; }
      plan({ x: best.stopX, z: best.stopZ, id: best.id }, 'site');
    };
    const end = g.time + minutes * 60;
    let decide = 0;
    while (g.time < end) {
      if (g.state === 'paused') {
        const s = g.trunkScreen;
        for (let k = 0; k < 8 && s.isOpen; k++) {
          const spot = s.hand && g.trunk.findSpot(s.hand.kind);
          if (spot) {
            const kind = s.hand.kind;
            s.cursor = { x: spot.x, y: spot.y }; s.hand.rot = spot.rot; s.confirm(); st.pieces++; st.overhead += OVERHEAD.piece;
            st.kinds[kind] = (st.kinds[kind] || 0) + 1;
            if (['sack', 'jugs', 'small-crate'].includes(kind)) st.makings[kind] = (st.makings[kind] || 0) + 1;
          } else st.left++;
          s.close();
        }
        if (g.ui.isOpen('market')) {
          const town = g._nearestMarket().town, r = sell(town.id, g.trunk, g.dredge.market, null);
          if (r.count) { g.dredge.sold({ ...r, town: town.name, trunk: g.trunk }); st.sales++; st.earned += r.total; st.overhead += OVERHEAD.sale; st.log.push([Math.round(g.time / 6) / 10, r.count, r.total]); }
          g.ui.close('market'); g._marketRender = null;
        }
        while (g.ui.anyOpen) g.ui.close();
        g.resume();
        way = [];
        continue;
      }
      if (!way.length || (decide -= 1 / 60) < 0) { pickTarget(); decide = 3; }
      const v = g.player, p = v.position;
      while (way.length > 1 && Math.hypot(way[0].x - p.x, way[0].z - p.z) < 9) way.shift();
      const wp = way[0];
      const want = Math.atan2(wp.x - p.x, -(wp.z - p.z));
      const err = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
      const dGoal = Math.hypot(goal.x - p.x, goal.z - p.z);
      let thr = Math.abs(err) > 0.6 ? 0.25 : 1;
      if (Math.abs(v.speed) > 22 && Math.abs(err) > 0.3) thr = -0.5;
      // Pull up at the stop: the site's ring, the market's.
      if (dGoal < (goalKind === 'site' ? 10 : 14)) thr = Math.abs(v.speed) > 1 ? -1 : dGoal > 3 ? 0.15 : 0;
      if (Math.abs(v.speed) < 1 && dGoal > 4) stuckT += 1 / 60; else stuckT = 0;
      if (stuckT > 2) {
        revT = 1; stuckT = 0; st.stuck++; way = [];
        if (goalKind === 'site' && ++stalls >= 3) { skip.set(goal.id, g.time + 120); stalls = 0; goal = null; }
      }
      let input = { throttle: thr, steer: Math.max(-1, Math.min(1, err * 2)) };
      if (revT > 0) { revT -= 1 / 60; input = { throttle: -1, steer: -input.steer }; }
      g.step(1 / 60, input);
      // Parked at a site that won't open (worked, or a night site by day): on to the next.
      if (goalKind === 'site' && goal && dGoal < 6 && Math.abs(v.speed) < 0.5 && g.state === 'playing') { skip.set(goal.id, g.time + 120); goal = null; way = []; }
    }
    st.value = g.trunk.value;
    st.days = g.dredge.market.clock / 24;
    return st;
  }, { minutes, score, OVERHEAD });
  const real = minutes + res.overhead / 60, perHour = (n) => ((n / real) * 60).toFixed(1);
  console.log(JSON.stringify({ minutes, score, levels, seed: seed || 'default', sites: res.sites, pieces: res.pieces, left: res.left, sales: res.sales, earned: res.earned, inTrunk: res.value, stuck: res.stuck, kinds: res.kinds }));
  console.log(`$/real min ${((res.earned + res.value) / real).toFixed(1)} (driving ${minutes} min + ${(res.overhead / 60).toFixed(1)} min at the screens)  sites/h ${perHour(res.sites)}  pieces/site ${(res.pieces / Math.max(1, res.sites)).toFixed(2)}`);
  console.log(`makings/h ${Object.entries(res.makings).map(([k, n]) => `${k} ${perHour(n)}`).join(', ')}  sales ${JSON.stringify(res.log)}`);
} finally { await browser.close(); server.kill(); }
