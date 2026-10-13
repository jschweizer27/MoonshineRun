import { test, expect } from '@playwright/test';
import { openGame, SHOTS } from './helpers.js';

// A phone, each way round, with touch controls: the HUD's pieces don't overlap or run off the
// screen, the touch buttons work (headlamps, trunk, notebook), the trunk can be packed and
// closed by touch alone, and the screens fit across. Screenshots go to artifacts/screenshots.
const HUD = ['cash', 'clock', 'hud-buttons', 'objective', 'toast', 'heat', 'lights', 'wear', 'cargo', 'minimap', 'abilities', 'speedo', 'touch-pedals'];
for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
  test.describe(`a phone held ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test(`${name}: the HUD fits without overlaps, the touch buttons work, the trunk packs and closes by touch, and the screens fit`, async ({ page }) => {
      const problems = await openGame(page);
      await page.tap('#start-btn');
      await expect(page.locator('#hud')).toBeVisible();
      for (const id of ['btn-lights', 'btn-trunk', 'btn-notebook', 'touch-gas']) await expect(page.locator(`#${id}`)).toBeVisible();
      const overlaps = await page.evaluate((HUD) => {
        const g = window.shine.game;
        g.renderer.setAnimationLoop(null);
        document.documentElement.classList.add('reduced-motion');      // boxes where they rest, not mid-animation
        g.police.heat = 2; g._updateHeat();
        g.dredge.data.wear = 0.6; g._updateWearPill();
        document.getElementById('lights').classList.remove('hidden');
        g.dredge.data.tools.leadfoot = g.dredge.data.tools.sweet = true; g._buildAbilities();
        g.hud.setObjective('Ashes: Search the ruins of Braun & Sons in Highlandtown', '0.4 mi', 'market', 0.3);
        g.hud.toast('Order taken: 2 corn shines (grade B+) for Gus Kessler, Highlandtown Speakeasy · after dark, by dawn', 'gold', 60000);
        g.minimap.draw(g.player, g._mapMarkers());
        g.renderFrame();
        const boxes = HUD.map((id) => { const e = document.getElementById(id), r = e?.getBoundingClientRect(); return e && e.offsetParent !== null && r.width && r.height ? { id, l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }).filter(Boolean);
        const out = [];
        for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) out.push(`${a.id} over ${b.id}`);
        for (const b of boxes) if (b.l < 0 || b.t < 0 || b.r > innerWidth + 1 || b.b > innerHeight + 1) out.push(`${b.id} off the screen`);
        g.police.heat = 0; g._updateHeat();
        return out;
      }, HUD);
      await page.screenshot({ path: `${SHOTS}/phone-${name}-hud.png` });
      expect(overlaps).toEqual([]);
      // The headlamps and the notebook by touch.
      await page.tap('#btn-lights');
      expect(await page.evaluate(() => window.shine.game.lightsOff)).toBe(true);
      await page.tap('#btn-notebook');
      await expect(page.locator('#notebook')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/phone-${name}-notebook.png` });
      await page.tap('#notebook-done');
      // The trunk with a crate in hand: a tap aims, a second tap on the same cell puts it down, DONE closes.
      await page.evaluate(() => window.shine.game.openTrunk('crate'));
      await expect(page.locator('#trunk-done')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/phone-${name}-trunk.png` });
      const cell = page.locator('#trunk-grid .cell[data-x="3"][data-y="1"]');
      await cell.tap();
      expect(await page.evaluate(() => window.shine.game.trunk.count)).toBe(0);
      await cell.tap();
      expect(await page.evaluate(() => window.shine.game.trunk.count)).toBe(1);
      await page.tap('#trunk-done');
      await expect(page.locator('#trunk')).toBeHidden();
      expect(await page.evaluate(() => window.shine.game.state)).toBe('playing');
      // The trunk button opens it empty-handed.
      await page.tap('#btn-trunk');
      await expect(page.locator('#trunk')).toBeVisible();
      await page.tap('#trunk-done');
      await expect(page.locator('#trunk')).toBeHidden();
      // The market, the ending: cards fit across, nothing cut off.
      const fits = async (label) => {
        await page.screenshot({ path: `${SHOTS}/phone-${name}-${label}.png` });
        return page.evaluate(() => {
          const top = window.shine.game.ui.top, card = top.el.querySelector('.overlay-card').getBoundingClientRect();
          const cut = [...top.el.querySelectorAll('*')].filter((e) => e.offsetParent !== null && !['CANVAS', 'svg', 'path'].includes(e.tagName) && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'auto').map((e) => e.id || e.className);
          return { left: card.left >= 0, right: card.right <= innerWidth + 1, cut };
        });
      };
      await page.evaluate(() => { const g = window.shine.game; g.dredge.data.cash = 1234; g.openMarket(); });
      expect(await fits('market')).toEqual({ left: true, right: true, cut: [] });
      await page.tap('#market-done');
      await page.evaluate(async () => {
        const g = window.shine.game, { ENDINGS } = await import('/src/chapters.js'), { showEnding } = await import('/src/screens.js');
        g.pause({ showMenu: false });
        showEnding(g.ui, { ending: ENDINGS.paper, career: g.dredge, days: 12, onKeep: () => {}, onTitle: () => {} });
      });
      expect(await fits('ending')).toEqual({ left: true, right: true, cut: [] });
      expect(problems).toEqual([]);
    });
  });
}
