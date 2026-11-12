import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT } from './helpers.js';

// Stage 19 (visual polish): a store's list scrolls inside a card that fits the screen, and
// says so (its edges fade where there's more); its long name keeps to one line; a button that
// can't be pressed doesn't look like one that can; the banner shows a long objective whole,
// and news sits clear under it. The world (19b): the county's villages are dressed (roof tints,
// porches, false fronts, chimneys) inside the same draw calls; the city's night has a little
// more fill and the day none; the moon keeps under the bloom.

test('a store’s card fits the screen; its list fades where there’s more and scrolls to its last row; a long name is one line; a dead button looks dead', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear } = eval(KIT);
    const { CONFIG } = await import('/src/config.js');
    clear();
    d.cash = 60;                                   // (enough for some supplies, not the upgrades)
    g.trunk.clear();
    for (const k of ['small-crate', 'jugs', 'sack']) { const s = g.trunk.findSpot(k); g.trunk.place(k, s.x, s.y, s.rot); }
    g.pause({ showMenu: false });
    g.openMarket(CONFIG.dredge.towns.find((t) => t.id === 'monkton'));
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await frame();
    const card = document.querySelector('#market .overlay-card').getBoundingClientRect(), body = document.getElementById('market-body');
    const title = document.getElementById('market-title'), ts = getComputedStyle(title);
    const out = {
      fits: card.top >= 0 && card.bottom <= window.innerHeight + 0.5,
      scrolls: body.scrollHeight > body.clientHeight + 40,
      top: [body.classList.contains('more-above'), body.classList.contains('more-below')],
      titleLines: Math.round(title.getBoundingClientRect().height / parseFloat(ts.lineHeight === 'normal' ? parseFloat(ts.fontSize) * 1.2 : ts.lineHeight)),
    };
    body.scrollTop = body.scrollHeight;
    await frame();
    const last = body.lastElementChild.getBoundingClientRect(), box = body.getBoundingClientRect();
    out.bottom = [body.classList.contains('more-above'), body.classList.contains('more-below')];
    out.lastShown = last.top >= box.top - 0.5 && last.bottom <= box.bottom + 0.5;
    const dead = [...body.querySelectorAll('.btn')].find((b) => b.disabled), live = [...body.querySelectorAll('.btn')].find((b) => !b.disabled);
    const look = (b) => { const s = getComputedStyle(b); return { bg: s.backgroundColor, opacity: s.opacity, border: s.borderTopStyle }; };
    out.dead = look(dead); out.live = look(live);
    clear();
    return out;
  }, KIT);
  expect(r.fits, JSON.stringify(r)).toBe(true);
  expect(r.scrolls).toBe(true);
  expect(r.top).toEqual([false, true]);
  expect(r.bottom).toEqual([true, false]);
  expect(r.lastShown).toBe(true);
  expect(r.titleLines).toBe(1);
  expect(r.dead.opacity).toBe('1');                       // (drawn dead, not just dimmed)
  expect(r.dead.border).toBe('dashed');
  expect(r.dead.bg).not.toBe(r.live.bg);
  expect(problems).toEqual([]);
});

test('the banner shows the story’s longest objective whole, on a desktop and on a phone held sideways, and news sits clear under it', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const look = () => page.evaluate(async (KIT) => {
    const { g, clear } = eval(KIT);
    const { CHAPTERS } = await import('/src/chapters.js');
    const longest = CHAPTERS.flatMap((c) => c.steps.map((s) => `${c.title}: ${s.text}`)).sort((a, b) => b.length - a.length)[0];
    clear();
    g.renderer.setAnimationLoop(null);
    document.documentElement.classList.add('reduced-motion');      // boxes where they rest, not mid-slide
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const text = document.getElementById('objective-text'), banner = document.getElementById('objective'), toast = document.getElementById('toast');
    // (news of its own each time, and long-lived: the HUD never shows the same text twice
    // running, and a line that expires mid-measure sits 6 px higher)
    const measure = async (words) => {
      g.hud.setObjective(words, 320, 'job');
      g.hud.toast(`Something worth knowing (${window.innerWidth}, ${words.length})`, 'gold', 60000);
      await frame(); await frame();
      const b = banner.getBoundingClientRect(), t = toast.getBoundingClientRect();
      return { shown: toast.classList.contains('show'), whole: text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1, gap: Math.round(t.top - b.bottom), inView: b.left >= 0 && b.right <= window.innerWidth, box: [text.scrollWidth, text.clientWidth, text.scrollHeight, text.clientHeight, Math.round(b.height)], font: getComputedStyle(text).fontFamily.slice(0, 30) };
    };
    const short = await measure('Deliver to Monkton');
    const long = await measure(longest);
    return { short, long, letters: longest.length };
  }, KIT);
  for (const size of [{ width: 1280, height: 720 }, { width: 800, height: 450 }]) {
    await page.setViewportSize(size);
    const r = await look();
    expect(r.letters).toBeGreaterThan(100);
    const seen = `${size.width}x${size.height} ${JSON.stringify(r)}`;
    expect([r.short.shown, r.long.shown], seen).toEqual([true, true]);
    expect(r.long.whole, seen).toBe(true);
    expect(r.long.inView, seen).toBe(true);
    expect(r.long.gap, seen).toBeGreaterThanOrEqual(4);
    expect(r.short.gap, seen).toBeGreaterThanOrEqual(4);
    expect(r.short.gap, seen).toBeLessThanOrEqual(24);    // (and not left hanging far below a one-line banner)
  }
  expect(problems).toEqual([]);
});

test('the villages are dressed inside the same draw calls; the city’s night has more fill, the day and the county none; the moon keeps under the bloom', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async () => {
    const { CONFIG } = await import('/src/config.js');
    const g = window.shine.game, w = g.world, L = CONFIG.look;
    g.renderer.setAnimationLoop(null);
    const out = { villages: w.villages.map((v) => [v.houses > 0, v.dressed === v.houses]), pieces: w.villageDressing };
    // Monkton's crossroads: the same budget as ever.
    const v = w.villages[0];
    window.shine.teleport(v.x, v.z + 30, 0); window.shine.step(0.3);
    g.renderFrame();
    const info = window.shine.renderInfo();
    out.calls = info.calls; out.lights = info.lights;
    const hemi = (hour, county) => { g.env.hour = hour; g.env.update(0, { x: 0, y: 0, z: county ? -600 : 100 }); return w.hemi.intensity; };
    out.fill = {
      cityNight: Math.abs(hemi(23, 0) - (L.ambient + L.nightFill)) < 0.02,
      countyNight: Math.abs(hemi(23, 1) - L.ambient * (1 + L.countyNight.ambient)) < 0.02,
      day: Math.abs(hemi(12, 0) - hemi(12, 1)) < 0.02,
    };
    out.moon = L.skyDome.moonGain <= L.post.bloomThreshold + 0.1;
    return out;
  });
  expect(r.villages).toEqual([[true, true], [true, true], [true, true]]);
  expect(r.pieces).toBeGreaterThan(20);
  expect(r.calls).toBeLessThan(60);
  expect(r.lights).toBe(12);
  expect(r.fill, JSON.stringify(r)).toEqual({ cityNight: true, countyNight: true, day: true });
  expect(r.moon).toBe(true);
  expect(problems).toEqual([]);
});

test('on a short screen the cash pop-up keeps clear of the news line; a market’s sign fades as the truck comes up to it', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 450 });
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, clear } = eval(KIT);
    const { CONFIG } = await import('/src/config.js');
    clear();
    g.renderer.setAnimationLoop(null);
    document.documentElement.classList.add('reduced-motion');      // boxes where they rest
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    g.hud.setObjective('Deliver to Ruby Dalton at Courthouse Tavern · after dark · tonight', '0.2 mi', 'job');
    g.hud.toast('A farm cart’s broken down across the road near Ridgewood Farm. Go around', 'gold', 60000);
    g.hud.cashPop('+$325');
    await frame();
    const t = document.getElementById('toast').getBoundingClientRect(), p = document.getElementById('cash-pop').getBoundingClientRect();
    const out = { popUnderNews: Math.round(p.top - t.bottom), popOnScreen: p.bottom < window.innerHeight * 0.75 };
    // The sign over Lexington Market: whole from down the street, gone at its door.
    const town = CONFIG.dredge.towns[0], m = g.marketMarkers[0];
    const from = (metres) => { g.camera.position.set(town.x, 6, town.z + metres); g._updateMarkers(); return { shown: m.visible, sign: Math.round(m.userData.label.material.opacity * 100) / 100 }; };
    out.far = from(60); out.near = from(10);
    return out;
  }, KIT);
  expect(r.popUnderNews, JSON.stringify(r)).toBeGreaterThanOrEqual(0);
  expect(r.popOnScreen).toBe(true);
  expect(r.far).toEqual({ shown: true, sign: 1 });
  expect(r.near).toEqual({ shown: true, sign: 0 });
  expect(problems).toEqual([]);
});
