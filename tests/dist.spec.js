import path from 'node:path';
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { waitForBoot } from './helpers.js';

// These run against `npm run build` output (dist/).
test.skip(() => !fs.existsSync('dist/index.html'), 'run `npm run build` first');

test('the production website build boots', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await waitForBoot(page);
  await page.click('#start-btn');
  expect(await page.evaluate(() => window.shine.step(1, { throttle: 1 }).speed)).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('the single-file offline build plays straight from disk (file://)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${path.resolve('dist/Shine.html')}?test`);
  await waitForBoot(page);
  await page.click('#start-btn');
  expect(await page.evaluate(() => window.shine.step(1, { throttle: 1 }).speed)).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
