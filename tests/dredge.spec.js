import { test, expect } from '@playwright/test';
import { openGame, startRun, step, snapshot, screenshot } from './helpers.js';

// The dredge run (?mode=dredge): free-roam driving, loot, a trunk to pack, towns to sell in.
// Built beside the bootlegging loop; these tests cover it stage by stage.

test('dredge mode boots into free roam: the truck without its horse box, no police, no heat', async ({ page }) => {
  const problems = await openGame(page, '&mode=dredge');
  await expect(page.locator('#start-btn')).toHaveText('START DRIVING');
  await startRun(page);
  const s = await snapshot(page);
  expect(s.game).toBe('dredge');
  expect(s.state).toBe('playing');
  const setup = await page.evaluate(() => {
    const g = window.shine.game, m = g.mission;
    return {
      ride: g.player.ride, trailer: !!g.player.trailer,
      markers: [m.pickup, m.drop, m.hideoutMarker, m.goal].some((x) => x.visible),
      heatShown: getComputedStyle(document.getElementById('heat')).display !== 'none',
      objective: document.getElementById('objective-text').textContent,
    };
  });
  expect(setup).toEqual({ ride: 'runner', trailer: false, markers: false, heatShown: false, objective: 'Free roam: pick up what you find' });

  // Drive up York Road into the county: no one comes after you, nothing happens to the heat.
  const before = await page.evaluate(() => { const g = window.shine.game; g.renderFrame(); return window.shine.renderInfo(); });
  const drove = await step(page, 20, { throttle: 1 });
  expect(drove.z).toBeLessThan(-150);
  expect(drove.pursuers).toBe(0);
  expect(drove.heat).toBe(0);
  expect(await page.evaluate(() => window.shine.game.police.active.length)).toBe(0);
  const after = await page.evaluate(() => window.shine.renderInfo());
  expect(after.lights).toBe(13);
  expect(after.calls).toBeLessThan(60);
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  await screenshot(page, 'dredge-01-free-roam');
  expect(problems).toEqual([]);
});

test('the bootlegging game is unchanged without ?mode=dredge', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  const s = await page.evaluate(() => ({ game: window.shine.game.mode, ride: window.shine.game.player.ride, trailer: !!window.shine.game.player.trailer, hud: document.getElementById('hud').classList.contains('dredge') }));
  expect(s).toEqual({ game: 'bootleg', ride: 'truck', trailer: true, hud: false });
});

test('dredge handling is arcade: turns sharply when slow, holds a fast corner without spinning, glances off walls', async ({ page }) => {
  await openGame(page, '&mode=dredge');
  await startRun(page);
  const r = await page.evaluate(() => {
    const g = window.shine.game, v = g.player, base = { ...v.t };
    const truck = { ...base };
    for (const k of ['steerRamp', 'steerFalloff', 'bounce', 'wallKeep']) delete truck[k];
    Object.assign(truck, { maxSpeed: 38, accel: 18, brake: 42, turnRate: 2.1, grip: 12, handbrakeGrip: 1.8 });
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
  // than the bootleg truck does.
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
  const problems = await openGame(page, '&mode=dredge');
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
  expect(r.pill).toMatch(/^CARGO: TRUNK [1-4]\/15$/);
  expect(r.back).toBe(true);
  expect(r.moved).toBeGreaterThan(10);
  expect(r.fromTruck).toBeGreaterThan(85);
  await screenshot(page, 'dredge-03-loot');
  const after = await page.evaluate(() => window.shine.renderInfo());
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  expect(after.calls).toBeLessThan(60);
  expect(after.lights).toBe(13);
  expect(problems).toEqual([]);
});

test('no loot in the bootlegging game', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  expect(await page.evaluate(() => window.shine.game.loot.mesh.visible)).toBe(false);
});

test('the trunk grid: shapes turn, pieces fit or overlap, the trunk fills up and saves', async ({ page }) => {
  await openGame(page, '&mode=dredge');
  const r = await page.evaluate(async () => {
    const { Trunk, shape, shapeSize } = await import('/src/trunk.js');
    const out = {};
    // The radio is a T: four different orientations, 3x2 then 2x3.
    const turns = [0, 1, 2, 3].map((k) => JSON.stringify(shape('radio', k).sort()));
    out.radioTurns = new Set(turns).size;
    out.radioSizes = [0, 1].map((k) => shapeSize(shape('radio', k)));
    out.fullCircle = JSON.stringify(shape('sack', 4).sort()) === JSON.stringify(shape('sack', 0).sort());
    const t = new Trunk(5, 3);
    out.crate = !!t.place('crate', 0, 0);            // 2x2 in the corner
    out.overlap = t.canPlace('case', 1, 1);           // on top of the crate
    out.edge = t.canPlace('barrel', 4, 2);            // a cask on end sticks out the bottom
    out.edgeTurned = t.canPlace('barrel', 3, 2, 1);   // laid flat it fits
    out.used = t.used;
    // Fill it with cases: 15 - 4 = 11 more.
    let n = 0;
    for (;;) { const s = t.findSpot('case'); if (!s) break; t.place('case', s.x, s.y, s.rot); n++; }
    out.cases = n;
    out.full = t.used === t.size && t.findSpot('case') === null;
    out.value = t.value;
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
  expect(r.value).toBe(70 + 11 * 25);
  expect(r.roundTrip).toBe(true);
  expect(r.afterRemove).toBe(14);
});

test('picking up loot opens the trunk: turn it, move it, put it down with the keyboard', async ({ page }) => {
  const problems = await openGame(page, '&mode=dredge');
  await startRun(page);
  // Drive onto a radio (the awkward T shape).
  await page.evaluate(() => {
    const g = window.shine.game, L = g.loot;
    L.kind[0] = 4; L.kindAttr.setX(0, 4); L.x[0] = 0; L.z[0] = 70; L.active[0] = 1;
    window.shine.teleport(0, 76, 0);
    window.shine.step(1, { throttle: 0.4 });
  });
  await expect(page.locator('#trunk')).toBeVisible();
  await expect(page.locator('#trunk-hand')).toContainText('Cathedral radio');
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
  expect(s).toEqual({ state: 'playing', count: 1, pill: 'CARGO: TRUNK 4/15' });
  expect(problems).toEqual([]);
});

test('rearranging the trunk: lift, swap, leave a piece behind; T opens it, the gamepad and mouse work too', async ({ page }) => {
  await openGame(page, '&mode=dredge');
  await startRun(page);
  await page.evaluate(() => {
    const t = window.shine.game.trunk;
    t.place('case', 0, 0);
    t.place('crate', 3, 0);
  });
  // T opens it empty-handed; lift the case, Esc puts it back where it was.
  await page.keyboard.press('KeyT');
  await expect(page.locator('#trunk')).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.shine.game.trunkScreen.hand?.kind)).toBe('case');
  await page.keyboard.press('Escape');
  await expect(page.locator('#trunk')).toBeHidden();
  expect(await page.evaluate(() => { const p = window.shine.game.trunk.pieceAt(0, 0); return p && p.kind; })).toBe('case');

  // A new cask in hand over the case: Enter swaps them (the cask goes in, the case comes out).
  await page.evaluate(() => window.shine.game.openTrunk('barrel'));
  await page.evaluate(() => { const s = window.shine.game.trunkScreen; s.hand.rot = 0; s.cursor = { x: 0, y: 0 }; s._render(); });
  await page.keyboard.press('Enter');
  const swapped = await page.evaluate(() => ({ at: window.shine.game.trunk.pieceAt(0, 0)?.kind, hand: window.shine.game.trunkScreen.hand?.kind }));
  expect(swapped).toEqual({ at: 'barrel', hand: 'case' });
  // X leaves the case on the road.
  await page.keyboard.press('KeyX');
  await expect(page.locator('#trunk-msg')).toContainText('Left the case of rye behind');
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
  const problems = await openGame(page, '&mode=dredge');
  await startRun(page);
  const before = await page.evaluate(() => { window.shine.game.renderFrame(); return window.shine.renderInfo(); });
  const bootlegCash = await page.evaluate(() => window.shine.game.career.cash);
  // The market sits on a street corner the roads reach.
  const where = await page.evaluate(() => {
    const g = window.shine.game, t = g.marketMarkers[0].position, n = g.world.roads.nearest(t.x, t.z);
    return { dist: Math.hypot(n.x - t.x, n.z - t.z), blocked: g.world.collision.resolveCircle(t.x, t.z, 2).hit, visible: g.marketMarkers[0].visible };
  });
  expect(where.dist).toBeLessThan(1);
  expect(where.blocked).toBe(false);
  expect(where.visible).toBe(true);

  // Load the trunk: two cases, a cask, a crate. The banner now points to the market.
  await page.evaluate(() => {
    const g = window.shine.game, t = g.trunk;
    t.place('case', 0, 0); t.place('case', 1, 0); t.place('barrel', 2, 0); t.place('crate', 3, 0);
    g.dredge.saveTrunk(t);
    g._updateTrunkPill();
    window.shine.step(0.1);
  });
  await expect(page.locator('#objective-text')).toHaveText('Sell at Lexington Market');

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

  // Sell the cases: cash goes up by exactly the total shown, and the second case fetched less.
  const caseRow = page.locator('#market-body [data-id="case"]');
  const shown = Number(await caseRow.getAttribute('data-total'));
  const first = await page.evaluate(async () => { const { priceOf } = await import('/src/market.js'); const g = window.shine.game; return priceOf('baltimore', 'case', g.dredge.market); });
  await caseRow.click();
  const afterCases = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, cases: [...window.shine.game.trunk.pieces.values()].filter((p) => p.kind === 'case').length }));
  expect(afterCases.cash).toBe(shown);
  expect(afterCases.cases).toBe(0);
  expect(shown).toBeLessThan(first * 2);                    // the glut: the second one sold for less
  const next = await page.evaluate(async () => { const { priceOf } = await import('/src/market.js'); return priceOf('baltimore', 'case', window.shine.game.dredge.market); });
  expect(next).toBeLessThan(first);

  // Sell everything that's left.
  const allShown = Number(await page.locator('#market-sell-all').getAttribute('data-total'));
  await page.locator('#market-sell-all').click();
  const done = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, count: window.shine.game.trunk.count, ledger: window.shine.game.dredge.data.ledger.length, pill: document.getElementById('cargo').textContent }));
  expect(done).toEqual({ cash: shown + allShown, count: 0, ledger: 2, pill: 'CARGO: TRUNK 0/15' });
  await expect(page.locator('#cash')).toHaveText(`$${(shown + allShown).toLocaleString()}`, { timeout: 5000 });

  // Back on the road; it doesn't reopen until you've driven out and back.
  await page.locator('#market-done').click();
  await expect(page.locator('#market')).toBeHidden();
  expect(await page.evaluate(() => { window.shine.step(0.5); return window.shine.game.state; })).toBe('playing');

  // A piece left aboard and the cash survive a reload; the bootleg career is untouched.
  await page.evaluate(() => { const g = window.shine.game; g.trunk.place('radio', 0, 0); g.dredge.saveTrunk(g.trunk); });
  await page.reload();
  await page.waitForFunction(() => window.__shineReady === true);
  await startRun(page);
  const reloaded = await page.evaluate(() => ({ cash: window.shine.game.dredge.cash, kinds: [...window.shine.game.trunk.pieces.values()].map((p) => p.kind), bootleg: window.shine.game.career.cash }));
  expect(reloaded).toEqual({ cash: shown + allShown, kinds: ['radio'], bootleg: bootlegCash });

  const after = await page.evaluate(() => { window.shine.game.renderFrame(); return window.shine.renderInfo(); });
  expect(after.lights).toBe(13);
  expect(after.calls).toBeLessThan(60);
  expect(after.programs).toBe(before.programs);
  expect(after.geometries).toBe(before.geometries);
  expect(problems).toEqual([]);
});
