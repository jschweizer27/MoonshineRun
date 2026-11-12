import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT } from './helpers.js';

// Stage 19 (visual polish): a store's list scrolls inside a card that fits the screen, and
// says so (its edges fade where there's more); its long name keeps to one line; a button that
// can't be pressed doesn't look like one that can; the banner shows a long objective whole,
// and news sits clear under it.

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
    const measure = async (words) => {
      g.hud.setObjective(words, 320, 'job');
      g.hud.toast('Something worth knowing', 'gold', 4000);
      await frame(); await frame();
      const b = banner.getBoundingClientRect(), t = toast.getBoundingClientRect();
      return { whole: text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1, gap: Math.round(t.top - b.bottom), inView: b.left >= 0 && b.right <= window.innerWidth, box: [text.scrollWidth, text.clientWidth, text.scrollHeight, text.clientHeight, Math.round(b.height)], font: getComputedStyle(text).fontFamily.slice(0, 30) };
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
    expect(r.long.whole, seen).toBe(true);
    expect(r.long.inView, seen).toBe(true);
    expect(r.long.gap, seen).toBeGreaterThanOrEqual(4);
    expect(r.short.gap, seen).toBeGreaterThanOrEqual(4);
    expect(r.short.gap, seen).toBeLessThanOrEqual(24);    // (and not left hanging far below a one-line banner)
  }
  expect(problems).toEqual([]);
});
