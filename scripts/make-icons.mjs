#!/usr/bin/env node
// Render favicon.svg into the PNG app icons the web manifest needs (run after editing
// the favicon): node scripts/make-icons.mjs
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const svg = fs.readFileSync('favicon.svg', 'utf8');
const local = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: local });
const page = await browser.newPage();
fs.mkdirSync('icons', { recursive: true });

const render = async (size, file, maskable = false) => {
  // Maskable icons need their art inside the central safe zone on a full-bleed background.
  const inner = maskable ? `<div style="width:${size}px;height:${size}px;background:#0d0b08;display:grid;place-items:center">
      <div style="width:${size * 0.72}px;height:${size * 0.72}px">${svg}</div></div>` : `<div style="width:${size}px;height:${size}px">${svg}</div>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</body></html>`);
  await page.screenshot({ path: `icons/${file}`, omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`icons/${file}`);
};
await render(180, 'icon-180.png');
await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', true);
await browser.close();
