import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT, past } from './helpers.js';

// Stage 17c (found by the robot playthrough): a step already done has lost nothing. Handing
// the hotel its Scotch empties the trunk a moment before the story moves on; that moment
// mustn't send Otto back to the pier for more.

test('a step that’s done has lost nothing: the Scotch handed to the hotel doesn’t send Otto back to the pier', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  await past(page, 6);
  const r = await page.evaluate((KIT) => {
    const { g, d, step, clear } = eval(KIT);
    Object.assign(d.steps, { 'mags-row': true, launch: true });
    d.flags.launch = true;
    step(); clear(); step(); clear();
    g.trunk.clear();
    const before = g._lost()?.site || null;      // still the hotel's step, and no Scotch: lost
    d.flags['order:hotel'] = true;              // handed over (the story moves on next tick)
    return { before, after: g._lost()?.site || null };
  }, KIT);
  expect(r).toEqual({ before: 'pier', after: null });
  expect(problems).toEqual([]);
});
