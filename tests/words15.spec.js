import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 15b: the story reads right. The crown wherever the choice is shown, the endings in
// step with Act II, and Vail's men only once Vail has a name.

test('the choice in the notebook: the deed, the paper, and the crown with what it still wants; after the crown, the crown', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 9);
  await page.evaluate(() => { const g = window.shine.game; window.shine.step(0.6); while (g.ui.anyOpen) g.ui.close(); g.openNotebook(); });
  const body = page.locator('#notebook-body');
  await expect(body).toContainText('The deed: pay off the bank’s note');
  await expect(body).toContainText('The paper: take the Jockey’s letters and the bank’s ledgers');
  await expect(body).toContainText('The crown: Vail’s routes, on the courthouse steps at Towson. Still wanting: the hidden still, Braun’s, ★★★ with 5 more of the city’s speakeasy contacts (0/5).');
  await page.evaluate(() => {
    const g = window.shine.game, d = g.dredge.data;
    while (g.ui.anyOpen) g.ui.close();
    Object.assign(d.flags, { hollowStill: true, brauns: true });
    for (const w of ['kessler', 'orourke', 'abernathy', 'romano', 'hummel']) d.trust[w] = 6;
    g.openNotebook();
  });
  await expect(body).toContainText('▸ The crown: take Vail’s routes for your own on the courthouse steps at Towson.');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.dredge.data.ending = 'crown'; g.openNotebook(); });
  await expect(body).toContainText('The crown: the routes are Otto’s, and Vail’s are gone.');
  await expect(body).not.toContainText('The paper: the Alliance');
  expect(problems).toEqual([]);
});

test('the paper’s confirm names the ledgers and Vail; the deed’s, the bank’s note', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 9);
  await page.evaluate(() => {
    const g = window.shine.game;
    window.shine.step(0.6); while (g.ui.anyOpen) g.ui.close(); g.resume();
    g.salvage.story = g._openSites();
    g.pause({ showMenu: false });
    g.openSalvage(g.salvage.sites.find((s) => s.story === 'sun'));
  });
  await expect(page.locator('#confirm-text')).toContainText('the bank’s ledgers');
  await expect(page.locator('#confirm-text')).toContainText('Vail');
  await page.click('#confirm-no');
  await page.evaluate(() => { const g = window.shine.game; while (g.ui.anyOpen) g.ui.close(); g.dredge.data.cash = 20000; g.pause({ showMenu: false }); window.__deed = g._deed({ id: 'baltimore' }).onBuy(); });
  await expect(page.locator('#confirm-text')).toContainText('the Towson National Bank’s note');
  await page.click('#confirm-no');
  expect(problems).toEqual([]);
});

test('Vail’s men come only once Vail has a name, and the banner says it’s them', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  await past(page, 5);
  const r = await page.evaluate((KIT) => {
    const { g, d, clear, shine, objective } = eval(KIT);
    clear();
    const out = { before: g._rivalsOn() };
    d.clues.mortgages = true;
    out.after = g._rivalsOn();
    g.player.place(0, -600, 0); shine(4); g.env.hour = 22; g.env.hoursPerSecond = 0.025; g._rivalRng = () => 0;
    g._rivals(1 / 60, true);
    g._updateObjective();
    out.banner = objective();
    return out;
  }, KIT);
  expect(r.before).toBe(false);
  expect(r.after).toBe(true);
  expect(r.banner).toContain('Vail’s men are after you');
  expect(problems).toEqual([]);
});
