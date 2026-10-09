import { test, expect } from '@playwright/test';
import { openGame } from './helpers.js';

// The story sites on other layouts: every one is there, clear of the other sites (its ring
// never overlaps theirs), with room to stop. Five seeds, the default among them.
const STORY = ['ruins', 'office', 'van', 'quarry', 'lockup', 'mill', 'sun'];
for (const seed of [1922, 7, 4242, 99, 31337]) {
  test(`seed ${seed}: every story site is placed, apart from the others, with a free stop`, async ({ page }) => {
    const problems = await openGame(page, `&seed=${seed}`);
    const r = await page.evaluate((STORY) => {
      const g = window.shine.game, w = g.world, sites = g.salvage.sites, R = 7;
      const story = sites.filter((s) => s.story);
      return {
        found: STORY.filter((id) => story.some((s) => s.story === id)),
        crowded: story.flatMap((s) => sites.filter((o) => o !== s && (Math.hypot(o.x - s.x, o.z - s.z) < 15 || Math.hypot(o.stopX - s.stopX, o.stopZ - s.stopZ) < 2 * R)).map((o) => `${s.story} by ${o.story || o.id}`)),
        blocked: story.filter((s) => w.collision.resolveCircle(s.stopX, s.stopZ, 1.5).hit).map((s) => s.story),
      };
    }, STORY);
    expect(r).toEqual({ found: STORY, crowded: [], blocked: [] });
    expect(problems).toEqual([]);
  });
}
