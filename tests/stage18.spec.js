import { test, expect } from '@playwright/test';
import { openGame, startRun, KIT } from './helpers.js';

// Stage 18: a softer floor when the Bureau catches Otto (the stage 17 robot runs went broke
// with the police on). A bust takes 15% of the cash, $500 at most; a cracked trunk cell costs
// $35 to mend; the garage mends what cracks the cash covers when the whole repair is too
// dear; out of sight, the heat drops a tier a little sooner.

test('a bust takes 15% of the cash (at most $500); out of sight, the heat drops sooner', async ({ page }) => {
  const problems = await openGame(page, '&police');
  await startRun(page, { loot: false });
  const r = await page.evaluate(async (KIT) => {
    const { g, d, clear, shine } = eval(KIT);
    const { CONFIG } = await import('/src/config.js');
    clear();
    shine(1); d.cash = 1000;
    g.player.place(0, 60, 0);
    g._bust('The Bureau boxed you in.');
    const out = { small: d.cash };
    clear();
    shine(1); d.cash = 9000;
    g.player.place(0, 60, 0);
    g._bust('The Bureau boxed you in.');
    out.big = d.cash;
    out.evade = CONFIG.dredge.police.evadeTime;
    return out;
  }, KIT);
  expect(r.small).toBe(850);
  expect(r.big).toBe(8500);
  expect(r.evade).toEqual([0, 5, 6, 8]);
  expect(problems).toEqual([]);
});

test('a cracked cell costs $35 to mend (the headlamp still $60); short of the whole repair, the garage mends what cracks the cash covers', async ({ page }) => {
  const problems = await openGame(page);
  await startRun(page, { loot: false });
  const r = await page.evaluate((KIT) => {
    const { g, d, clear } = eval(KIT);
    clear();
    g.trunk.clear();
    g.trunk.crack(0, 0); g.trunk.crack(1, 0); g.trunk.crack(2, 0);
    d.damage = { lamp: true }; d.wear = 0.3;
    const out = { lampTwo: g.dredge.repairCost(2) - Math.ceil(0.3 * 350) };
    d.cash = 80;
    g.pause({ showMenu: false });
    g.openBarn();
    const mend = document.querySelector('#barn-body [data-id="mend"]'), fix = document.querySelector('#barn-body [data-id="repair"]');
    out.button = mend?.textContent || null;
    out.repairDisabled = !!fix?.disabled;
    mend?.click();
    out.after = { cracks: g.trunk.cracked.length, cash: d.cash, wear: d.wear, lamp: !!d.damage.lamp, saved: g.dredge.data.trunk.cracked.length, ledger: d.ledger[0]?.text };
    out.again = document.querySelector('#barn-body [data-id="mend"]')?.disabled ?? null;
    clear();
    return out;
  }, KIT);
  expect(r.lampTwo).toBe(2 * 35 + 60);
  expect(r.repairDisabled).toBe(true);
  expect(r.button).toBe('MEND 2 CELLS $70');
  expect(r.after).toEqual({ cracks: 1, cash: 10, wear: 0.3, lamp: true, saved: 1, ledger: 'Mended 2 trunk cells' });
  expect(r.again).toBe(true);
  expect(problems).toEqual([]);
});
