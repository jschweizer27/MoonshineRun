import { test, expect } from '@playwright/test';
import { openGame, startRun, step, snapshot, screenshot } from './helpers.js';

// Batch D: the county, the order book, the garage and ledger, disguise, patrols,
// roadblocks, the sheriff, the story, day/night and seeded cities.

test('York Road links the city to the county, through the gap in the wall', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, roads = g.world.roads;
    const from = roads.nearest(0, 0).id;
    return g.world.barns.map((b) => (roads.path(from, roads.nearest(b.laneX, b.laneZ).id) || []).length);
  });
  expect(r.every((n) => n > 3)).toBe(true);
  await page.evaluate(() => window.shine.teleport(0, -190, 0));
  const s = await step(page, 6, { throttle: 1 });
  expect(s.z).toBeLessThan(-262);           // drove out of the city into the county
  await screenshot(page, '12-york-road');
});

test('no trees, barns or fences sit on the county roads', async ({ page }) => {
  await openGame(page);
  const bad = await page.evaluate(() => {
    const g = window.shine.game;
    const d = (x, z, a, b) => { const ex = b.x - a.x, ez = b.z - a.z, l = ex * ex + ez * ez; const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l)); return Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t)); };
    let n = 0;
    for (const [x, z] of g.world.trees) for (const [a, b, w] of g.world.countyEdges) if (d(x, z, a, b) < w / 2 + 1) n++;
    for (const b of g.world.buildings.filter((q) => q.barn)) {
      for (const [a, c, w] of g.world.countyEdges) {
        for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ], [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2]]) {
          if (d(x, z, a, c) < w / 2) n++;
        }
      }
    }
    return n;
  });
  expect(bad).toBe(0);
});

test('the order book: three buyers, big orders need the Still-master, and they tip off the law', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => { const m = window.shine.game.mission; window.shine.teleport(m.pickup.position.x, m.pickup.position.z); window.shine.game.step(1 / 60, {}); });
  const orders = page.locator('#orders-body .order');
  await expect(orders).toHaveCount(3);
  await expect(orders.nth(2)).toHaveClass(/locked/);
  await orders.nth(2).click({ force: true });           // locked: nothing happens
  expect((await snapshot(page)).carrying).toBe(false);
  await page.keyboard.press('Escape');                  // walk away from the book
  await expect(page.locator('#orders')).toBeHidden();
  // Hire the Still-master and come back: the big order opens up and brings heat.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.career.data.cash = 5000;
    g.career.buy('cargo');
    window.shine.teleport(g.world.hideout.laneX + 22, g.world.hideout.laneZ, Math.PI / 2);
    window.shine.step(0.2);
    window.shine.loadShine(2);
  });
  const s = await snapshot(page);
  expect(s.carrying).toBe(true);
  expect(s.tier).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.shine.game.mission.order.id)).toBe('big');
});

test('the garage: specialists cost cash and make the truck better', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const before = await page.evaluate(() => { const g = window.shine.game; g.career.data.cash = 3000; g.hud.setCash(3000); return g.player.t.maxSpeed; });
  await page.keyboard.press('Escape');
  await page.click('#pause-garage');
  await expect(page.locator('#garage')).toBeVisible();
  await page.locator('#garage-body [data-id="engine"]').click();
  await expect(page.locator('#garage-cash')).toHaveText('$2,100');
  await screenshot(page, '13-garage');
  const after = await page.evaluate(() => ({ speed: window.shine.game.player.t.maxSpeed, lvl: window.shine.game.career.level('engine') }));
  expect(after.lvl).toBe(1);
  expect(after.speed).toBeGreaterThan(before);
  await page.click('#garage-ledger');
  await expect(page.locator('#ledger')).toBeVisible();
});

test('the ledger records deliveries and busts; progress survives a reload', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const pay = await page.evaluate(() => {
    window.shine.loadShine(0);
    const m = window.shine.game.mission;
    window.shine.teleport(m.drop.position.x, m.drop.position.z);
    window.shine.step(0.1);
    return window.shine.game.career.cash;
  });
  await page.evaluate(() => window.shine.game.bust());
  const ledger = await page.evaluate(() => window.shine.game.career.data.ledger.map((e) => e.result));
  expect(ledger).toEqual(['busted', 'delivered']);
  await page.click('#gameover-ledger');
  await expect(page.locator('#ledger-runs')).toContainText('✓');
  await screenshot(page, '14-ledger');
  await page.reload();
  await page.waitForFunction(() => window.__shineReady === true);
  await expect(page.locator('#continue-btn')).toBeVisible();
  const cash = await page.evaluate(() => window.shine.game.career.cash);
  expect(cash).toBeGreaterThan(0);
  expect(cash).toBeLessThan(pay);           // the bust cost a fine
  await page.click('#continue-btn');
  expect((await snapshot(page)).state).toBe('playing');
});

test('horse-box disguise: slow and loaded blends in, speeding looks suspicious', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const rate = await page.evaluate(() => {
    const g = window.shine.game;
    g.career.markSeen('jockey');
    g.police.patrolTarget = { city: 0, county: 0 };
    window.shine.loadShine(0);
    const run = (throttle) => {
      g.mission.heat = 0; g.mission.suspicion = 0;
      window.shine.teleport(-44, 0, 0);             // a long straight city street
      for (let k = 0; k < 120; k++) window.shine.step(1 / 60, { throttle });
      return g.mission.suspicion;
    };
    return { slow: run(0.25), fast: run(1) };
  });
  expect(rate.slow).toBeLessThan(rate.fast * 0.6);
  await page.evaluate(() => { window.shine.teleport(-44, 0, 0); window.shine.step(0.3, { throttle: 0.2 }); });
  await expect(page.locator('#status-pill')).toContainText('DISGUISED');
});

test('patrols spot a loaded truck that drives past them', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const s = await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.loadShine(0);
    g.mission.suspicion = 0;
    window.shine.teleport(0, 0, 0);
    const u = g.police.units.find((x) => x.kind === 'fed' && !x.active);
    g.police._spawn(u, g.player.position, g.camera, 'patrol');
    u.car.place(0, -30, Math.PI);                 // same street, facing you
    return window.shine.step(0.5, { throttle: 0.5 });
  });
  expect(s.tier).toBe(1);
  await expect(page.locator('#toast')).toContainText('patrol');
});

test('3 stars: faster pursuers; 2+ stars: a roadblock ahead that the GPS routes around', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.loadShine(0);
    window.shine.teleport(-220, 176, Math.PI);     // far corner of the city, drop across town, looking back
    g.mission.drop.position.set(220, 0, -176);
    g.mission.heat = 3;
    g.police.setTarget(3, g.player, g.camera);
    g.police.contact = true;
    g.police.roadblocks._timer = 0;
    window.shine.step(1);
    const pursuer = g.police.active.find((u) => u.mode === 'chase' || u.mode === 'search');
    return {
      speed: pursuer.car.t.maxSpeed, blocks: g.police.roadblocks.active.length,
      blocked: [...g.police.blocked], route: g.minimap.route.map((n) => n.id),
    };
  });
  expect(r.speed).toBeGreaterThan(38);
  expect(r.blocks).toBeGreaterThanOrEqual(1);
  // The GPS route never uses a blocked road.
  const edges = r.route.slice(0, -1).map((id, i) => [id, r.route[i + 1]]).filter(([a, b]) => a != null && b != null).map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
  expect(edges.some((e) => r.blocked.includes(e))).toBe(false);
  await page.evaluate(() => {
    const g = window.shine.game, rb = g.police.roadblocks.active[0];
    window.shine.teleport(rb.x, rb.z + 40, Math.atan2(0, -1));
    g.camera.lookAt(rb.x, 1, rb.z);
  });
  await screenshot(page, '15-roadblock');
});

test('the bribed sheriff makes the county safe', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const heat = await page.evaluate(() => {
    const g = window.shine.game;
    g.career.data.bribes.county = true;
    window.shine.loadShine(0);
    g.mission.heat = 2;
    g.police.setTarget(2, g.player, g.camera);
    g.police.contact = true;
    const p = g.player.position;
    g.police.active.forEach((u) => u.car.place(p.x + 25, p.z, 0));   // right next to you
    window.shine.step(8);
    return { heat: g.mission.heat, pill: document.getElementById('status-pill').textContent };
  });
  expect(heat.heat).toBeLessThan(2);
  expect(heat.pill).toContain('SAFE COUNTY');
});

test('lying low at the hideout clears the heat and opens the garage', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const g = window.shine.game;
    g.mission.heat = 1;
    window.shine.teleport(g.world.hideout.laneX + 60, g.world.hideout.laneZ, -Math.PI / 2);
    window.shine.step(0.2);
    window.shine.teleport(g.world.hideout.laneX + 2, g.world.hideout.laneZ, -Math.PI / 2);
    window.shine.step(0.1);
  });
  await expect(page.locator('#garage')).toBeVisible();
  expect(await page.evaluate(() => window.shine.game.mission.heat)).toBe(0);
  await page.click('#garage-done');
  expect((await snapshot(page)).state).toBe('playing');
});

test('story: a new game plays the prologue, the Act I escape, then the valley', async ({ page }) => {
  await openGame(page, '&story');
  await page.click('#start-btn');
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog-text')).toContainText('Baltimore, 1922');
  await screenshot(page, '16-story');
  await page.click('#dialog-skip');
  const s = await snapshot(page);
  expect(s.mode).toBe('escape');
  expect(s.pursuers).toBe(2);
  expect(await page.evaluate(() => window.shine.game.fire.active)).toBe(true);
  await screenshot(page, '17-escape');
  await page.evaluate(() => { window.shine.teleport(0, -285, 0); window.shine.step(0.2); });
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog-text')).toContainText('Green Spring Valley');
  await page.click('#dialog-skip');
  const after = await snapshot(page);
  expect(after.mode).toBe('loop');
  expect(after.tier).toBe(0);
});

test('day follows night, and rain makes the roads slick', async ({ page }) => {
  await openGame(page, '&time');
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, e = g.env;
    const night = { hour: e.hour, day: e.daylight, rough: g.world.roadMaterial.roughness };
    e.hour = 12;
    e.setWeather('rain');
    for (let k = 0; k < 40; k++) e.update(0.5, g.camera.position);
    return { night, day: e.daylight, rough: g.world.roadMaterial.roughness, grip: e.effects.grip, suspicion: e.effects.suspicion, clock: e.clock };
  });
  expect(r.night.day).toBe(0);
  expect(r.day).toBeGreaterThan(0.9);
  expect(r.rough).toBeLessThan(r.night.rough - 0.3);
  expect(r.grip).toBeLessThan(1);
  expect(r.suspicion).toBeGreaterThan(1);
  await screenshot(page, '18-day-rain');
});

test('city layouts are seeded: same seed, same city; new seed, new city', async ({ browser }) => {
  const layout = async (q) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await openGame(page, q);
    const b = await page.evaluate(() => window.shine.game.world.buildings.slice(0, 40).map((x) => [x.minX, x.minZ, x.h].map((v) => v.toFixed(1)).join(',')).join('|'));
    await ctx.close();
    return b;
  };
  const a = await layout('&seed=5'), b = await layout('&seed=5'), c = await layout('&seed=6');
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});
