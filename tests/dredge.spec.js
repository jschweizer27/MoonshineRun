import { test, expect } from '@playwright/test';
import { openGame, waitForBoot, startRun, step, snapshot, screenshot } from './helpers.js';

// The game: free-roam driving, loot along the roads, a trunk to pack, towns to sell in and
// upgrades to buy. (It was built as "the dredge run" beside the old bootlegging game, which
// it replaced; the code still calls it that: CONFIG.dredge, dredgecareer.js, html.dredge.)

test('the game boots into free roam on York Road: no police, no heat, no story', async ({ page }) => {
  const problems = await openGame(page);
  await expect(page.locator('#start-btn')).toHaveText('START DRIVING');
  await startRun(page);
  const s = await snapshot(page);
  expect(s.state).toBe('playing');
  const setup = await page.evaluate(() => {
    const g = window.shine.game;
    return {
      gone: ['mission', 'police', 'career', 'tutorial', 'fire', 'waypoint'].filter((k) => k in g),
      hud: ['heat', 'bust', 'hint', 'status-pill', 'siren-flash', 'gameover', 'orders', 'garage', 'dialog'].filter((id) => document.getElementById(id)),
      objective: document.getElementById('objective-text').textContent,
      pill: document.getElementById('cargo').textContent,
    };
  });
  expect(setup).toEqual({ gone: [], hud: [], objective: 'Pick up loot along the roads', pill: 'TRUNK 0/15' });

  // Drive up York Road into the county: no one comes after you.
  const before = await page.evaluate(() => { const g = window.shine.game; g.renderFrame(); return window.shine.renderInfo(); });
  const drove = await step(page, 20, { throttle: 1 });        // (loot on the way may stop it early)
  expect(drove.z).toBeLessThan(-150);
  const after = await page.evaluate(() => window.shine.renderInfo());
  expect(after.lights).toBe(12);
  expect(after.calls).toBeLessThan(60);
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  await screenshot(page, 'dredge-01-free-roam');
  expect(problems).toEqual([]);
});

test('the handling is arcade: turns sharply when slow, holds a fast corner without spinning, glances off walls', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, base = { ...v.t };
    // The old bootlegging truck's tuning, for comparison: a heavier, slidier ride.
    const truck = { ...base, maxSpeed: 38, accel: 18, brake: 42, turnRate: 2.1, grip: 12, handbrakeGrip: 1.8, steerRamp: 4, steerFalloff: 0.4 };
    const open = () => v.place(160, -560, 0);                 // open pasture, nothing to hit
    const run = (t) => {
      v.t = { ...t };
      g.gripBase = t.grip;
      const out = {};
      // Turn-in from a crawl: half a second of full lock at 2.5 m/s.
      open(); v.vz = -2.5; v.speed = 2.5;
      for (let k = 0; k < 30; k++) g.step(1 / 60, { throttle: 0, steer: 1 });
      out.crawlTurn = Math.abs(v.heading);
      // A fast corner: flat out, then a full-lock turn for 1.5 s.
      open();
      for (let k = 0; k < 240; k++) g.step(1 / 60, { throttle: 1, steer: 0 });
      let slip = 0;
      const h0 = v.heading;
      for (let k = 0; k < 90; k++) { g.step(1 / 60, { throttle: 1, steer: 1 }); slip = Math.max(slip, v.slip); }
      out.fastTurn = v.heading - h0;
      out.slip = slip;
      out.speedAfter = v.speed;
      return out;
    };
    const res = { truck: run(truck), arcade: run(base) };
    v.t = base; g.gripBase = base.grip;
    return res;
  });
  expect(r.arcade.crawlTurn).toBeGreaterThan(r.truck.crawlTurn * 1.5);   // much sharper when slow
  expect(r.arcade.fastTurn).toBeGreaterThan(r.truck.fastTurn);           // keeps turning at speed
  expect(r.arcade.slip).toBeLessThan(r.truck.slip);                       // stays planted
  expect(r.arcade.slip).toBeLessThan(4);
  expect(r.arcade.speedAfter).toBeGreaterThan(15);                        // and keeps its pace

  // Into a wall at a shallow angle: the arcade car glances off and keeps more of its speed
  // than the old truck did.
  const wall = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, base = { ...v.t };
    const run = (t) => {
      v.t = { ...t };
      g.gripBase = t.grip;
      v.place(120, 0, Math.PI / 2 + 0.3);                     // east along a street, angled into the buildings
      let hit = 0, before = 0;
      for (let k = 0; k < 600 && !hit; k++) { before = Math.hypot(v.vx, v.vz); g.step(1 / 60, { throttle: 1 }); if (v.impact > 2) hit = v.impact; }
      return { hit, before, after: Math.hypot(v.vx, v.vz) };
    };
    const truck = { ...base, bounce: 1.25, wallKeep: 0.96 };
    const out = { truck: run(truck), arcade: run(base) };
    v.t = base; g.gripBase = base.grip;
    return out;
  });
  expect(wall.arcade.hit).toBeGreaterThan(2);
  expect(wall.arcade.before).toBeGreaterThan(10);
  expect(wall.arcade.after / wall.arcade.before).toBeGreaterThan(wall.truck.after / wall.truck.before);
});

test('loot lies along the roads: drive over a piece to pick it up, and it turns up again elsewhere', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page);
  const before = await page.evaluate(() => { window.shine.game.renderFrame(); return window.shine.renderInfo(); });
  const r = await page.evaluate(() => {
    const g = window.shine.game, L = g.loot, c = g.world.collision;
    const active = [...L.active].filter(Boolean).length;
    // Every piece lies somewhere drivable, clear of buildings.
    let blocked = 0;
    for (let i = 0; i < L.n; i++) if (c.resolveCircle(L.x[i], L.z[i], 0.9).hit) blocked++;
    const kinds = new Set(L.kind);
    // The radar shows the pieces near the truck.
    const radar = g._mapMarkers().filter((m) => m.kind === 'loot').length;
    // Drive onto the nearest piece.
    let i = 0, best = Infinity;
    for (let k = 0; k < L.n; k++) { const d = Math.hypot(L.x[k] - g.player.position.x, L.z[k] - g.player.position.z); if (d < best) { best = d; i = k; } }
    const where = { x: L.x[i], z: L.z[i] };
    window.shine.teleport(where.x, where.z + 6, 0);
    window.shine.step(1, { throttle: 0.4 });
    const taken = !L.active[i];
    const opened = g.trunkScreen.isOpen && g.state === 'paused';
    // Stow it and drive on.
    g.trunkScreen.confirm();
    g.trunkScreen.close();
    const held = g.trunk.count;
    // After the respawn time it's back, somewhere else and away from the truck.
    L.timer[i] = 0;
    window.shine.step(0.05);
    return { active, blocked, kinds: kinds.size, radar, held, opened, taken, back: !!L.active[i],
      moved: Math.hypot(L.x[i] - where.x, L.z[i] - where.z), fromTruck: Math.hypot(L.x[i] - g.player.position.x, L.z[i] - g.player.position.z),
      pill: document.getElementById('cargo').textContent };
  });
  expect(r.active).toBe(36);
  expect(r.blocked).toBe(0);
  expect(r.kinds).toBeGreaterThanOrEqual(4);
  expect(r.radar).toBeGreaterThan(0);
  expect(r.taken).toBe(true);
  expect(r.opened).toBe(true);
  expect(r.held).toBe(1);
  expect(r.pill).toMatch(/^TRUNK [1-6]\/15$/);
  expect(r.back).toBe(true);
  expect(r.moved).toBeGreaterThan(10);
  expect(r.fromTruck).toBeGreaterThan(85);
  await screenshot(page, 'dredge-03-loot');
  const after = await page.evaluate(() => window.shine.renderInfo());
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  expect(after.calls).toBeLessThan(60);
  expect(after.lights).toBe(12);
  expect(problems).toEqual([]);
});

test('the trunk grid: shapes turn, pieces fit or overlap, the trunk fills up and saves', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const { Trunk, shape, shapeSize } = await import('/src/trunk.js');
    const out = {};
    // The jug cluster is a T: four different orientations, 3x2 then 2x3.
    const turns = [0, 1, 2, 3].map((k) => JSON.stringify(shape('jugs', k).sort()));
    out.radioTurns = new Set(turns).size;
    out.radioSizes = [0, 1].map((k) => shapeSize(shape('jugs', k)));
    out.fullCircle = JSON.stringify(shape('sack', 4).sort()) === JSON.stringify(shape('sack', 0).sort());
    const t = new Trunk(5, 3);
    out.crate = !!t.place('crate', 0, 0);            // 2x2 in the corner
    out.overlap = t.canPlace('small-crate', 1, 1);    // on top of the crate
    out.edge = t.canPlace('barrel', 4, 2);            // a cask on end sticks out the bottom
    out.edgeTurned = t.canPlace('barrel', 3, 2, 1);   // laid flat it fits
    out.used = t.used;
    // Fill it with small crates: 15 - 4 = 11 more.
    let n = 0;
    for (;;) { const s = t.findSpot('small-crate'); if (!s) break; t.place('small-crate', s.x, s.y, s.rot); n++; }
    out.cases = n;
    out.full = t.used === t.size && t.findSpot('small-crate') === null;
    out.value = t.value;
    const { KINDS } = await import('/src/trunk.js');
    out.expectValue = KINDS.crate.value + 11 * KINDS['small-crate'].value;
    const copy = Trunk.fromJSON(JSON.parse(JSON.stringify(t.toJSON())));
    out.roundTrip = copy.used === t.used && copy.count === t.count && copy.value === t.value;
    // Lift a piece out and the space is free again.
    t.remove(t.pieceAt(4, 2).id);
    out.afterRemove = t.used;
    return out;
  });
  expect(r.radioTurns).toBe(4);
  expect(r.radioSizes.map((s) => s.w * s.h)).toEqual([6, 6]);
  expect(r.radioSizes[0].w).not.toBe(r.radioSizes[1].w);
  expect(r.fullCircle).toBe(true);
  expect(r.crate).toBe(true);
  expect(r.overlap).toBe(false);
  expect(r.edge).toBe(false);
  expect(r.edgeTurned).toBe(true);
  expect(r.used).toBe(4);
  expect(r.cases).toBe(11);
  expect(r.full).toBe(true);
  expect(r.value).toBe(r.expectValue);
  expect(r.roundTrip).toBe(true);
  expect(r.afterRemove).toBe(14);
});

test('picking up loot opens the trunk: turn it, move it, put it down with the keyboard', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page);
  // Drive onto a radio (the awkward T shape).
  await page.evaluate(() => {
    const g = window.shine.game, L = g.loot;
    L.kind[0] = L.meshes.findIndex((m) => m.name === 'loot-jugs'); L.x[0] = 0; L.z[0] = 70; L.active[0] = 1;
    window.shine.teleport(0, 76, 0);
    window.shine.step(1, { throttle: 0.4 });
  });
  await expect(page.locator('#trunk')).toBeVisible();
  await expect(page.locator('#trunk-hand')).toContainText('Jug cluster');
  expect(await page.evaluate(() => window.shine.game.state)).toBe('paused');
  const rot0 = await page.evaluate(() => window.shine.game.trunkScreen.hand.rot);
  await page.keyboard.press('KeyR');
  const rot1 = await page.evaluate(() => window.shine.game.trunkScreen.hand.rot);
  expect(rot1).toBe((rot0 + 1) % 4);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const ghost = await page.locator('#trunk-grid .ghost').count();
  expect(ghost).toBe(4);
  await screenshot(page, 'dredge-04-trunk');
  await page.keyboard.press('Enter');
  await expect(page.locator('#trunk')).toBeVisible();            // still open: hands free now
  await expect(page.locator('#trunk-hand')).toContainText('Hands free');
  expect(await page.locator('#trunk-grid .filled').count()).toBe(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('#trunk')).toBeHidden();
  const s = await page.evaluate(() => ({ state: window.shine.game.state, count: window.shine.game.trunk.count, pill: document.getElementById('cargo').textContent }));
  expect(s).toEqual({ state: 'playing', count: 1, pill: 'TRUNK 4/15' });
  expect(problems).toEqual([]);
});

test('rearranging the trunk: lift, swap, leave a piece behind; T opens it, the gamepad and mouse work too', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const t = window.shine.game.trunk;
    t.place('small-crate', 0, 0);
    t.place('crate', 3, 0);
  });
  // T opens it empty-handed; lift the case, Esc puts it back where it was.
  await page.keyboard.press('KeyT');
  await expect(page.locator('#trunk')).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.shine.game.trunkScreen.hand?.kind)).toBe('small-crate');
  await page.keyboard.press('Escape');
  await expect(page.locator('#trunk')).toBeHidden();
  expect(await page.evaluate(() => { const p = window.shine.game.trunk.pieceAt(0, 0); return p && p.kind; })).toBe('small-crate');

  // A new barrel in hand over the small crate: Enter swaps them.
  await page.evaluate(() => window.shine.game.openTrunk('barrel'));
  await page.evaluate(() => { const s = window.shine.game.trunkScreen; s.hand.rot = 0; s.cursor = { x: 0, y: 0 }; s._render(); });
  await page.keyboard.press('Enter');
  const swapped = await page.evaluate(() => ({ at: window.shine.game.trunk.pieceAt(0, 0)?.kind, hand: window.shine.game.trunkScreen.hand?.kind }));
  expect(swapped).toEqual({ at: 'barrel', hand: 'small-crate' });
  // X leaves the small crate on the road.
  await page.keyboard.press('KeyX');
  await expect(page.locator('#trunk-msg')).toContainText('Left the small crate behind');
  expect(await page.evaluate(() => window.shine.game.trunk.count)).toBe(2);

  // Gamepad: d-pad moves, RB turns, A puts down, X leaves a piece behind, B closes.
  await page.evaluate(() => {
    const g = window.shine.game;
    g.trunkScreen.close();
    g.openTrunk('sack');
    const s = g.trunkScreen;
    s.cursor = { x: 0, y: 0 };
    g._onAction('right', 'gamepad');
    g._onAction('rotate', 'gamepad');
  });
  const pad = await page.evaluate(() => ({ x: window.shine.game.trunkScreen.cursor.x, rot: window.shine.game.trunkScreen.hand.rot }));
  expect(pad.x).toBeGreaterThanOrEqual(1);
  expect(pad.rot).toBe(1);
  await page.evaluate(() => window.shine.game._onAction('trunk', 'gamepad'));
  expect(await page.evaluate(() => window.shine.game.trunkScreen.hand)).toBe(null);

  // Mouse: click a free cell to lift nothing, then click the crate to lift it and click again
  // on free space to put it down there.
  await page.locator('#trunk-grid .cell[data-x="3"][data-y="0"]').click();
  expect(await page.evaluate(() => window.shine.game.trunkScreen.hand?.kind)).toBe('crate');
  await page.locator('#trunk-grid .cell[data-x="1"][data-y="1"]').click();
  expect(await page.evaluate(() => window.shine.game.trunk.pieceAt(2, 2)?.kind)).toBe('crate');
  await page.evaluate(() => window.shine.game._onAction('back', 'gamepad'));
  await expect(page.locator('#trunk')).toBeHidden();
  expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');
});

test('Lexington Market: stop there to sell what is in the trunk; prices sag as you sell, and it all saves', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page);
  const before = await page.evaluate(() => { window.shine.game.renderFrame(); return window.shine.renderInfo(); });
  // The market sits on a street corner the roads reach.
  const where = await page.evaluate(() => {
    const g = window.shine.game, t = g.marketMarkers[0].position, n = g.world.roads.nearest(t.x, t.z);
    return { dist: Math.hypot(n.x - t.x, n.z - t.z), blocked: g.world.collision.resolveCircle(t.x, t.z, 2).hit, visible: g.marketMarkers[0].visible };
  });
  expect(where.dist).toBeLessThan(1);
  expect(where.blocked).toBe(false);
  expect(where.visible).toBe(true);

  // Load the trunk: two small crates, a barrel, a wooden crate. The banner now points to
  // the market, in miles.
  await page.evaluate(() => {
    const g = window.shine.game, t = g.trunk;
    t.place('small-crate', 0, 0); t.place('small-crate', 1, 0); t.place('barrel', 2, 0); t.place('crate', 3, 0);
    g.dredge.saveTrunk(t);
    g._updateTrunkPill();
    window.shine.step(0.1);
  });
  await expect(page.locator('#objective-text')).toHaveText('Deliver to Baltimore');
  await expect(page.locator('#objective-dist')).toHaveText(/^\d+\.\d mi$/);

  // Roll in and stop: the market opens and the drive pauses.
  const rolled = await page.evaluate(() => {
    const g = window.shine.game, t = g.marketMarkers[0].position, L = g.loot;
    for (let i = 0; i < L.n; i++) if (Math.hypot(L.x[i] - t.x, L.z[i] - t.z) < 40) L.active[i] = 0;   // nothing to pick up on the way
    // Driving through at speed doesn't open it ...
    window.shine.teleport(t.x, t.z + 25, 0);
    let opened = false;
    for (let k = 0; k < 120; k++) { window.shine.step(1 / 60, { throttle: 1 }); if (g.state !== 'playing') { opened = true; break; } }
    const passedAtSpeed = !opened;
    // ... stopping inside does.
    window.shine.teleport(t.x, t.z + 6, 0);
    window.shine.step(0.5);
    return { passedAtSpeed };
  });
  expect(rolled.passedAtSpeed).toBe(true);
  await expect(page.locator('#market')).toBeVisible();
  expect(await page.evaluate(() => window.shine.game.state)).toBe('paused');
  await expect(page.locator('#market-title')).toHaveText('LEXINGTON MARKET');
  await screenshot(page, 'dredge-05-market');

  // Sell the small crates: cash goes up by exactly the total shown, and the second fetched less.
  const caseRow = page.locator('#market-body [data-id="small-crate"]');
  const shown = Number(await caseRow.getAttribute('data-total'));
  const first = await page.evaluate(async () => { const { priceOf } = await import('/src/market.js'); const g = window.shine.game; return priceOf('baltimore', 'small-crate', g.dredge.market); });
  await caseRow.click();
  const afterCases = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, cases: [...window.shine.game.trunk.pieces.values()].filter((p) => p.kind === 'small-crate').length }));
  expect(afterCases.cash).toBe(shown);
  expect(afterCases.cases).toBe(0);
  expect(shown).toBeLessThan(first * 2);                    // the glut: the second one sold for less
  const next = await page.evaluate(async () => { const { priceOf } = await import('/src/market.js'); return priceOf('baltimore', 'small-crate', window.shine.game.dredge.market); });
  expect(next).toBeLessThan(first);

  // Sell everything that's left.
  const allShown = Number(await page.locator('#market-sell-all').getAttribute('data-total'));
  await page.locator('#market-sell-all').click();
  const done = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, count: window.shine.game.trunk.count, ledger: window.shine.game.dredge.data.ledger.length, pill: document.getElementById('cargo').textContent }));
  expect(done).toEqual({ cash: shown + allShown, count: 0, ledger: 2, pill: 'TRUNK 0/15' });
  await expect(page.locator('#cash')).toHaveText(`$${(shown + allShown).toLocaleString()}`, { timeout: 5000 });

  // Back on the road; it doesn't reopen until you've driven out and back.
  await page.locator('#market-done').click();
  await expect(page.locator('#market')).toBeHidden();
  expect(await page.evaluate(() => { window.shine.step(0.5); return window.shine.game.state; })).toBe('playing');

  // A piece left aboard and the cash survive a reload.
  await page.evaluate(() => { const g = window.shine.game; g.trunk.place('jugs', 0, 0); g.dredge.saveTrunk(g.trunk); });
  await page.reload();
  await page.waitForFunction(() => window.__shineReady === true);
  await startRun(page);
  const reloaded = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, kinds: [...window.shine.game.trunk.pieces.values()].map((p) => p.kind) }));
  expect(reloaded).toEqual({ cash: shown + allShown, kinds: ['jugs'] });

  const after = await page.evaluate(() => { window.shine.game.renderFrame(); return window.shine.renderInfo(); });
  expect(after.lights).toBe(12);
  expect(after.calls).toBeLessThan(60);
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  expect(problems).toEqual([]);
});

test('the thirteen loot kinds: their trunk shapes, one flat-shaded instanced mesh each, tier colours from the palette', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page);
  const r = await page.evaluate(async () => {
    const { CONFIG } = await import('/src/config.js');
    const { shape, shapeSize, kindColors } = await import('/src/trunk.js');
    const g = window.shine.game, L = g.loot, P = CONFIG.dredge.palette;
    const kinds = CONFIG.dredge.loot.kinds.map((k) => {
      const s = shape(k.id), size = shapeSize(s);
      return { id: k.id, cells: s.length, w: size.w, h: size.h, tier: k.tier, value: k.value, cellsJSON: JSON.stringify(s.slice().sort()) };
    });
    const mats = new Set(L.meshes.map((m) => m.material));
    return {
      kinds,
      meshes: L.meshes.map((m) => ({ name: m.name, instanced: m.isInstancedMesh })),
      oneMaterial: mats.size === 1, flat: L.material.flatShading, vertexColors: L.material.vertexColors,
      paletteKeys: Object.keys(P).sort(),
      tierColours: Object.fromEntries(CONFIG.dredge.loot.kinds.map((k) => [k.id, kindColors(k.id).main])),
      palette: P,
    };
  });
  const by = Object.fromEntries(r.kinds.map((k) => [k.id, k]));
  // The shapes asked for: small crate 1x1, bottle case 2x1, burlap sack an L of 3, barrel 1x2,
  // jug cluster a T of 4, wooden crate 2x2, long crate 3x1, copper coil an S of 4, aged keg 2x3,
  // strongbox 1x1 (premium); and a bicycle (an arch of 5), a radio set (an L of 4) and a
  // sewing machine (a P of 5).
  expect(r.kinds.map((k) => k.id)).toEqual(['small-crate', 'bottle-case', 'sack', 'bicycle', 'barrel', 'jugs', 'crate', 'long-crate', 'radio', 'coil', 'keg', 'sewing-machine', 'strongbox']);
  const dims = (id) => [by[id].cells, by[id].w, by[id].h];
  expect(dims('small-crate')).toEqual([1, 1, 1]);
  expect(dims('bottle-case')).toEqual([2, 2, 1]);
  expect(dims('sack')).toEqual([3, 2, 2]);
  expect(dims('barrel')).toEqual([2, 1, 2]);
  expect(dims('jugs')).toEqual([4, 3, 2]);
  expect(by.jugs.cellsJSON).toBe(JSON.stringify([[0, 0], [1, 0], [1, 1], [2, 0]]));          // T
  expect(dims('crate')).toEqual([4, 2, 2]);
  expect(dims('long-crate')).toEqual([3, 3, 1]);
  expect(dims('coil')).toEqual([4, 3, 2]);
  expect(by.coil.cellsJSON).toBe(JSON.stringify([[0, 1], [1, 0], [1, 1], [2, 0]]));          // S
  expect(dims('keg')).toEqual([6, 2, 3]);
  expect(dims('strongbox')).toEqual([1, 1, 1]);
  expect(by.strongbox.tier).toBe('premium');
  expect(dims('bicycle')).toEqual([5, 3, 2]);
  expect(by.bicycle.cellsJSON).toBe(JSON.stringify([[0, 0], [0, 1], [1, 0], [2, 0], [2, 1]]));     // arch
  expect(dims('radio')).toEqual([4, 2, 3]);
  expect(by.radio.cellsJSON).toBe(JSON.stringify([[0, 0], [0, 1], [0, 2], [1, 2]]));              // L
  expect(dims('sewing-machine')).toEqual([5, 3, 2]);
  expect(by['sewing-machine'].cellsJSON).toBe(JSON.stringify([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]));  // P
  expect([by.bicycle.tier, by.radio.tier, by['sewing-machine'].tier]).toEqual(['low', 'mid', 'high']);
  // One instanced mesh per kind, one shared flat-shaded material.
  expect(r.meshes).toEqual(r.kinds.map((k) => ({ name: `loot-${k.id}`, instanced: true })));
  expect(r.oneMaterial).toBe(true);
  expect(r.flat).toBe(true);
  expect(r.vertexColors).toBe(true);
  // Tier colours: low olive, mid brick (the jugs are cream stoneware), high copper, premium amber.
  expect(r.paletteKeys).toEqual(['amber', 'brick', 'copper', 'cream', 'duskRose', 'olive', 'shadowTeal', 'slate', 'taillight']);
  const P = r.palette;
  expect(r.tierColours).toEqual({
    'small-crate': P.olive, 'bottle-case': P.olive, sack: P.olive, bicycle: P.olive,
    barrel: P.brick, jugs: P.cream, crate: P.brick, 'long-crate': P.brick, radio: P.brick,
    coil: P.copper, keg: P.copper, 'sewing-machine': P.copper, strongbox: P.amber,
  });
  // Value rises with the tier.
  const tierMax = (t) => Math.max(...r.kinds.filter((k) => k.tier === t).map((k) => k.value));
  const tierMin = (t) => Math.min(...r.kinds.filter((k) => k.tier === t).map((k) => k.value));
  expect(tierMax('low')).toBeLessThanOrEqual(tierMin('mid'));
  expect(tierMax('mid')).toBeLessThanOrEqual(tierMin('high'));
  expect(tierMax('high')).toBeLessThanOrEqual(tierMin('premium'));
  expect(problems).toEqual([]);
});

test('loot drawing stays in budget: each kind draws only nearby pieces, the glow is one more call, nothing compiles', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, L = g.loot;
    g.renderer.setAnimationLoop(null);
    const before = window.shine.renderInfo();
    // Every kind in view at once, just ahead of the truck.
    for (let i = 0; i < L.n; i++) { L.active[i] = 0; L.timer[i] = 1e9; }
    for (let k = 0; k < L.meshes.length; k++) { L.kind[k] = k; L.active[k] = 1; L.x[k] = -9 + (k % 5) * 4.5; L.z[k] = 48 - Math.floor(k / 5) * 5; }
    window.shine.teleport(0, 100, 0);
    window.shine.step(0.2);
    const all = window.shine.renderInfo();
    const drawing = L.meshes.filter((m) => m.visible && m.count > 0).length;
    // Far away from all of them: no loot draws at all.
    window.shine.teleport(0, -900, 0);
    window.shine.step(0.2);
    const none = window.shine.renderInfo();
    const idle = L.meshes.filter((m) => m.visible).length + (L.glow.visible ? 1 : 0);
    return { before, all, none, drawing, idle, glow: L.glow.count };
  });
  expect(r.drawing).toBe(13);
  expect(r.all.calls).toBeLessThan(60);
  expect(r.all.lights).toBe(12);
  expect(r.all.programs).toBe(r.before.programs);
  expect(r.all.geometries).toBe(r.before.geometries);
  expect(r.idle).toBe(0);
  expect(r.none.programs).toBe(r.before.programs);
});

test('the palette themes the screens: cream on teal, amber where it fits, red where it does not', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(async () => {
    const { CONFIG } = await import('/src/config.js');
    const P = CONFIG.dredge.palette, g = window.shine.game;
    const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
    const root = getComputedStyle(document.documentElement);
    g.trunk.place('coil', 0, 0);
    g.openTrunk('strongbox');
    const s = g.trunkScreen;
    s.cursor = { x: 4, y: 2 }; s._render();
    const okCell = document.querySelector('#trunk-grid .cell.ghost');
    const ok = { cls: okCell.className, shadow: getComputedStyle(okCell).boxShadow };
    s.cursor = { x: 1, y: 0 }; s._render();                     // on top of the coil
    const badCell = document.querySelector('#trunk-grid .cell.ghost');
    const bad = { cls: badCell.className, shadow: getComputedStyle(badCell).boxShadow };
    const coilCell = document.querySelector('#trunk-grid .cell[data-kind="coil"]:not(.ghost)');
    const card = getComputedStyle(document.querySelector('#trunk .overlay-card'));
    return {
      dredge: document.documentElement.classList.contains('dredge'),
      vars: { amber: root.getPropertyValue('--d-amber').trim(), teal: root.getPropertyValue('--d-shadow-teal').trim(), cream: root.getPropertyValue('--d-cream').trim() },
      want: { amber: P.amber, teal: P.shadowTeal, cream: P.cream },
      card: { bg: card.backgroundColor, color: card.color },
      teal: rgb(P.shadowTeal), cream: rgb(P.cream), amberRGB: rgb(P.amber), redRGB: rgb(P.taillight), copperRGB: rgb(P.copper),
      ok, bad, coilBg: getComputedStyle(coilCell).backgroundColor,
      emptyBg: getComputedStyle(document.querySelector('#trunk-grid .cell:not(.filled):not(.ghost)')).backgroundColor, slate: rgb(P.slate),
    };
  });
  expect(r.dredge).toBe(true);
  expect(r.vars).toEqual(r.want);
  expect(r.card.bg).toBe(r.teal);
  expect(r.card.color).toBe(r.cream);
  expect(r.ok.cls).not.toContain('bad');
  expect(r.ok.shadow).toContain(r.amberRGB);
  expect(r.bad.cls).toContain('bad');
  expect(r.bad.shadow).toContain(r.redRGB);
  expect(r.coilBg).toBe(r.copperRGB);
  expect(r.emptyBg).toBe(r.slate);
  await screenshot(page, 'dredge-05-trunk-palette');
});

test('Otto drives the bevelled truck model: one body, four wheels, headlight beams, nothing towed', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, m = v.model;
    window.shine.step(0.2, { throttle: 0.5 });
    g.renderFrame();
    let vehicles = 0;
    g.scene.traverse((o) => { if (o.userData.model) vehicles++; });
    // The headlight beams start at the lamps and reach down the road ahead (-Z), not behind.
    const b = m.beam.geometry;
    b.computeBoundingBox();
    const beams = { from: m.lamp[0], ahead: b.boundingBox.min.z, behind: b.boundingBox.max.z };
    return { model: m.shell.userData.model, towing: 'trailer' in v || 'rides' in v, wheels: m.wheels.length, beam: !!m.beam, shown: m.group.visible, calls: window.shine.renderInfo().calls, vehicles, beams };
  });
  expect(r).toMatchObject({ model: 'truck', towing: false, wheels: 4, beam: true, shown: true, vehicles: 1 });
  expect(r.beams.ahead).toBeLessThan(r.beams.from - 15);
  expect(r.beams.behind).toBeLessThan(r.beams.from + 0.5);
  expect(r.calls).toBeLessThan(60);
});

test('upgrades bought at the market change the truck, the trunk, the magnet and the radar, and survive a reload', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const before = await page.evaluate(() => {
    const g = window.shine.game, info = window.shine.renderInfo();
    g.dredge.data.cash = 0;
    const broke = g.dredge.buy('engine');                       // can't afford it
    g.dredge.data.cash = 3000;
    g.trunk.place('small-crate', 4, 2);                           // a piece in the far corner stays put
    g.openMarket();
    return {
      broke, maxSpeed: g.player.t.maxSpeed, grip: g.player.t.grip, radius: g.perks.pickupRadius, range: g.perks.mapRange,
      size: [g.trunk.cols, g.trunk.rows], look: g.player.look, calls: info.calls, programs: g.renderer.info.programs.length, geometries: g.renderer.info.memory.geometries,
      buttons: [...document.querySelectorAll('#market-body [data-id^="up-"]')].map((b) => b.textContent),
    };
  });
  expect(before.broke).toBe(false);
  expect(before.size).toEqual([5, 3]);
  expect(before.look).toBe('stock');
  expect(before.buttons).toEqual(['BUY $300', 'BUY $350', 'BUY $300', 'BUY $250', 'BUY $200']);
  // Buy one of each from the market screen, by keyboard focus and click.
  for (const id of ['trunk', 'engine', 'handling', 'magnet', 'spotter']) await page.click(`#market-body [data-id="up-${id}"]`);
  const after = await page.evaluate(() => {
    const g = window.shine.game;
    g.renderFrame();
    const info = window.shine.renderInfo();
    return {
      cash: g.dredge.cash, maxSpeed: g.player.t.maxSpeed, grip: g.player.t.grip, radius: g.perks.pickupRadius, range: g.perks.mapRange,
      size: [g.trunk.cols, g.trunk.rows], corner: g.trunk.pieceAt(4, 2)?.kind, look: g.player.look,
      reinforced: g.player.model.looks.reinforced.visible, stock: g.player.model.looks.stock.visible,
      calls: info.calls, programs: g.renderer.info.programs.length, geometries: g.renderer.info.memory.geometries,
      label: document.querySelector('#market-body [data-id="up-trunk"]').textContent,
    };
  });
  expect(after.cash).toBe(3000 - 300 - 350 - 300 - 250 - 200);
  expect(after.maxSpeed).toBe(before.maxSpeed + 3);
  expect(after.grip).toBe(before.grip + 2.5);
  expect(after.radius).toBeCloseTo(before.radius + 1.2, 5);
  expect(after.range).toBe(before.range + 60);
  expect(after.size).toEqual([6, 3]);
  expect(after.corner).toBe('small-crate');                    // the trunk grew around it
  expect(after.label).toBe('BUY $800');
  expect(after).toMatchObject({ look: 'reinforced', reinforced: true, stock: false });
  expect(after.programs).toBe(before.programs);                 // the new look compiles and allocates nothing
  expect(after.geometries).toBe(before.geometries);
  expect(after.calls).toBe(before.calls);

  // The magnet: a piece 4.2 m to the side is out of reach at level 0 (3.4 m) and in reach now.
  const grabbed = await page.evaluate(() => {
    const g = window.shine.game, L = g.loot;
    g.ui.close('market'); g.resume();
    g.trunk.clear();
    for (let i = 0; i < L.n; i++) { L.active[i] = 0; L.timer[i] = 1e9; }
    g.player.place(0, 100, 0);
    L.kind[0] = 0; L.active[0] = 1; L.x[0] = 4.2; L.z[0] = 100;
    window.shine.step(0.05);
    return L.active[0] === 0;
  });
  expect(grabbed).toBe(true);

  // A reload keeps the levels and the bigger trunk.
  await page.reload();
  await waitForBoot(page);
  await startRun(page);
  const reloaded = await page.evaluate(() => {
    const g = window.shine.game;
    return { levels: { ...g.dredge.data.upgrades }, size: [g.trunk.cols, g.trunk.rows], maxSpeed: g.player.t.maxSpeed, look: g.player.look };
  });
  expect(reloaded.levels).toEqual({ trunk: 1, engine: 1, handling: 1, magnet: 1, spotter: 1 });
  expect(reloaded.size).toEqual([6, 3]);
  expect(reloaded.maxSpeed).toBe(after.maxSpeed);
  expect(reloaded.look).toBe('reinforced');
});

test('two towns: Monkton in the valley has its own market and prices, on the road from Baltimore', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const r = await page.evaluate(async () => {
    const g = window.shine.game, w = g.world;
    const { CONFIG } = await import('/src/config.js');
    const { priceOf } = await import('/src/market.js');
    const [city, village] = CONFIG.dredge.towns;
    // Both markets sit on the road network, joined by a drivable path.
    const a = w.roads.nearest(city.x, city.z), b = w.roads.nearest(village.x, village.z);
    const path = w.roads.path(a.id, b.id) || [];
    // The village: houses clear of every road, and of the crossroads.
    const seg = (x, z, p, q) => { const dx = q.x - p.x, dz = q.z - p.z, t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - p.x - dx * t, z - p.z - dz * t); };
    const houses = w.buildings.filter((h) => h.barn && Math.hypot((h.minX + h.maxX) / 2 - village.x, (h.minZ + h.maxZ) / 2 - village.z) < 90);
    // No house reaches a road: its centre is further from every road than half the road plus
    // half its own shorter side.
    const onRoad = houses.filter((h) => w.countyEdges.some(([p, q, rw]) => seg((h.minX + h.maxX) / 2, (h.minZ + h.maxZ) / 2, p, q) < rw / 2 + Math.min(h.maxX - h.minX, h.maxZ - h.minZ) / 2));
    const state = g.dredge.market;
    const prices = {};
    for (const k of ['keg', 'sack', 'bottle-case']) prices[k] = [priceOf('baltimore', k, state), priceOf('monkton', k, state)];
    const programs = g.renderer.info.programs.length, geometries = g.renderer.info.memory.geometries;
    // Drive into the valley: the village's name shows on arrival; stop at its store to trade.
    window.shine.teleport(0, -560, Math.PI);
    window.shine.step(0.2);
    window.shine.teleport(0, -590, Math.PI);
    window.shine.step(0.3);
    const toast = document.getElementById('toast').textContent;
    g.renderFrame();
    const calls = window.shine.renderInfo().calls;
    g.trunk.place('keg', 0, 0);
    window.shine.teleport(village.x, village.z + 4, Math.PI);
    window.shine.step(0.5);
    return {
      roadA: Math.hypot(a.x - city.x, a.z - city.z), roadB: Math.hypot(b.x - village.x, b.z - village.z), path: path.length,
      houses: houses.length, onRoad: onRoad.length, prices, toast, calls, state: g.state,
      market: document.getElementById('market-title').textContent, marketOpen: g.ui.isOpen('market'),
      programs: g.renderer.info.programs.length - programs, geometries: g.renderer.info.memory.geometries - geometries,
      markers: g.marketMarkers.length,
    };
  });
  expect(r.roadA).toBeLessThan(1);
  expect(r.roadB).toBeLessThan(1);
  expect(r.path).toBeGreaterThan(2);
  expect(r.houses).toBeGreaterThan(8);
  expect(r.onRoad).toBe(0);
  expect(r.prices.keg[1]).toBeGreaterThan(r.prices.keg[0]);          // kegs pay more in the valley
  expect(r.prices.sack[1]).toBeLessThan(r.prices.sack[0]);           // farm goods less
  expect(r.toast).toContain('Monkton');
  expect(r.calls).toBeLessThan(60);
  expect(r.markers).toBe(3);
  expect(r.marketOpen).toBe(true);
  expect(r.market).toBe('MONKTON GENERAL STORE');
  expect(r.programs).toBe(0);
  expect(r.geometries).toBe(0);
});

test('a third town: Glyndon out west has its own depot and prices, and only the nearest market shows its marker', async ({ page }) => {
  await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const g = window.shine.game, w = g.world;
    const { CONFIG } = await import('/src/config.js');
    const { priceOf } = await import('/src/market.js');
    const [city, monkton, glyndon] = CONFIG.dredge.towns;
    const a = w.roads.nearest(city.x, city.z), b = w.roads.nearest(glyndon.x, glyndon.z);
    const path = w.roads.path(a.id, b.id) || [];
    const seg = (x, z, p, q) => { const dx = q.x - p.x, dz = q.z - p.z, t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - p.x - dx * t, z - p.z - dz * t); };
    const houses = w.buildings.filter((h) => h.barn && Math.hypot((h.minX + h.maxX) / 2 - glyndon.x, (h.minZ + h.maxZ) / 2 - glyndon.z) < 90);
    const onRoad = houses.filter((h) => w.countyEdges.some(([p, q, rw]) => seg((h.minX + h.maxX) / 2, (h.minZ + h.maxZ) / 2, p, q) < rw / 2 + Math.min(h.maxX - h.minX, h.maxZ - h.minZ) / 2));
    const state = g.dredge.market;
    const prices = {};
    for (const k of ['coil', 'jugs']) prices[k] = ['baltimore', 'monkton', 'glyndon'].map((t) => priceOf(t, k, state));
    const programs = g.renderer.info.programs.length, geometries = g.renderer.info.memory.geometries;
    // Down the western lane into Glyndon: its name shows on arrival.
    window.shine.teleport(-381, -580, Math.PI);
    window.shine.step(0.2);
    window.shine.teleport(-386, -645, Math.PI);
    window.shine.step(0.3);
    const toast = document.getElementById('toast').textContent;
    g.renderFrame();
    const calls = window.shine.renderInfo().calls;
    const shown = g.marketMarkers.map((m) => m.visible);
    // At Monkton, Glyndon is in range too, but only Monkton's marker shows.
    window.shine.teleport(0, -640, Math.PI);
    window.shine.step(0.2);
    const shownMonkton = g.marketMarkers.map((m) => m.visible);
    g.trunk.place('coil', 0, 0);
    window.shine.teleport(glyndon.x, glyndon.z + 4, Math.PI);
    window.shine.step(0.5);
    return {
      roadB: Math.hypot(b.x - glyndon.x, b.z - glyndon.z), path: path.length, villages: w.villages.map((v) => v.name),
      houses: houses.length, onRoad: onRoad.length, prices, toast, calls, shown, shownMonkton,
      market: document.getElementById('market-title').textContent, marketOpen: g.ui.isOpen('market'),
      programs: g.renderer.info.programs.length - programs, geometries: g.renderer.info.memory.geometries - geometries,
      gap: Math.hypot(monkton.x - glyndon.x, monkton.z - glyndon.z),
    };
  });
  expect(r.villages).toEqual(['Monkton', 'Glyndon']);
  expect(r.roadB).toBeLessThan(1);
  expect(r.path).toBeGreaterThan(2);
  expect(r.houses).toBeGreaterThan(6);
  expect(r.onRoad).toBe(0);
  expect(r.prices.coil[2]).toBeGreaterThan(Math.max(r.prices.coil[0], r.prices.coil[1]));   // the depot pays for copper
  expect(r.prices.jugs[2]).toBeLessThan(Math.min(r.prices.jugs[0], r.prices.jugs[1]));      // and little for jugs
  expect(r.toast).toContain('Glyndon');
  expect(r.calls).toBeLessThan(60);
  expect(r.shown).toEqual([false, false, true]);
  expect(r.gap).toBeLessThan(450);
  expect(r.shownMonkton).toEqual([false, true, false]);
  expect(r.marketOpen).toBe(true);
  expect(r.market).toBe('GLYNDON DEPOT');
  expect(r.programs).toBe(0);
  expect(r.geometries).toBe(0);
});

test('the game explains itself: the intro and How to Play tell the loot run, not the old bootlegging one', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#intro .story')).toContainText('pack what you find');
  await expect(page.locator('#start-btn')).toHaveText('START DRIVING');
  await page.click('#intro-help');
  await expect(page.locator('#help ol.rules')).toBeVisible();
  await expect(page.locator('#help ol.rules')).toContainText('Monkton General Store');
  await expect(page.locator('#help ol.rules')).toContainText('Glyndon Depot');
  await expect(page.locator('#help-keys')).toContainText('Open the trunk');
  const text = await page.evaluate(() => document.body.innerText);
  for (const old of [/\bthe still\b/i, /\bheat\b/i, /\bbust/i, /\bFeds\b/, /shine aboard/i, /horse box/i, /bootleg/i]) expect(text).not.toMatch(old);
  expect(await page.locator('.bootleg-only, .dredge-only').count()).toBe(0);
  await screenshot(page, 'dredge-help');
});

test('gluts ease as the in-game hours pass: five sold knock 30% off, ten hours later it is back', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const { priceOf, passTime } = await import('/src/market.js');
    const state = { sold: { 'baltimore:crate': 5 }, clock: 1 };    // within one day: no drift change
    const fresh = priceOf('baltimore', 'crate', { sold: {}, clock: 1 });
    const glutted = priceOf('baltimore', 'crate', state);
    passTime(state, 5);
    const later = priceOf('baltimore', 'crate', state);
    passTime(state, 5);
    return { fresh, glutted, later, recovered: priceOf('baltimore', 'crate', state), left: state.sold };
  });
  expect(r.glutted).toBeCloseTo(r.fresh * 0.7, -1);
  expect(r.later).toBeGreaterThan(r.glutted);
  expect(r.later).toBeLessThan(r.fresh);
  expect(r.recovered).toBe(r.fresh);
  expect(r.left).toEqual({});
});

test('market events: from day 1 a town pays double for one kind, announced when the day turns and badged at its market', async ({ page }) => {
  await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const { eventFor, priceOf, eventText } = await import('/src/market.js');
    const { CONFIG } = await import('/src/config.js');
    const g = window.shine.game, M = CONFIG.dredge.market;
    const none = eventFor(0);
    const ev = eventFor(2), again = eventFor(2);
    const days = new Set(Array.from({ length: 12 }, (_, d) => { const e = eventFor(d + 1); return `${e.town}:${e.kind}`; })).size;
    // The multiplier is in the price: the same day's price with and without it.
    const at = { sold: {}, clock: 2 * 24 + 1 };
    const doubled = priceOf(ev.town, ev.kind, at);
    M.event.multiplier = 1;
    const plain = priceOf(ev.town, ev.kind, at);
    M.event.multiplier = 2;
    // The day turns from 1 to 2: a toast, and the empty-trunk banner names the demand.
    g.dredge.market.clock = 47.99; g._eventDay = 1;
    window.shine.step(1 / 60);
    g.dredge.market.clock = 48.01;
    window.shine.step(1 / 60);
    const toast = document.getElementById('toast').textContent, banner = document.getElementById('objective-text').textContent;
    // At that town's market, a piece of that kind is badged.
    g.trunk.place(ev.kind, 0, 0);
    g.openMarket(CONFIG.dredge.towns.find((t) => t.id === ev.town));
    const badge = document.querySelector(`#market-body [data-id="${ev.kind}"]`)?.closest('.upgrade')?.querySelector('.event-badge')?.textContent;
    return { none, same: JSON.stringify(ev) === JSON.stringify(again), days, ratio: doubled / plain, toast, banner, badge, text: eventText(ev), note: document.getElementById('market-note').textContent };
  });
  expect(r.none).toBe(null);                        // a new game (and ?test, clock stopped) has none
  expect(r.same).toBe(true);
  expect(r.days).toBeGreaterThan(4);                // it changes from day to day
  expect(r.ratio).toBeGreaterThan(1.9);
  expect(r.ratio).toBeLessThan(2.1);
  expect(r.toast).toBe(r.text);
  expect(r.text).toMatch(/pays double for every .+ today/);
  expect(r.banner).toContain('Pick up loot');
  expect(r.banner).toContain('pays double');
  expect(r.badge).toBe('2× TODAY');
  expect(r.note).toContain(r.text);
  await screenshot(page, 'dredge-event-market');
});
