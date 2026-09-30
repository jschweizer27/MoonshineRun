import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

// Automated playtests. Chromium renders with SwiftShader (software WebGL), so this runs
// the same on CI machines with no GPU.
const CI = !!process.env.CI;
// Claude Code cloud sessions ship a pre-installed Chromium; use it if present so no
// browser download is needed.
const localChromium = process.env.SHINE_CHROMIUM || (!CI && fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: 2,
  // CI runners are shared and software-rendered, so one slow frame can time out a test.
  // Retry once there; the job summary still flags any test that needed it as flaky.
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'artifacts/results.json' }],
  ],
  use: {
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: localChromium,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    { name: 'game', testIgnore: /dist\.spec\.js/, use: { baseURL: 'http://localhost:4173' } },
    { name: 'dist', testMatch: /dist\.spec\.js/, use: { baseURL: 'http://localhost:4174' } },
  ],
  webServer: [
    { command: 'node scripts/serve.mjs --port 4173', url: 'http://localhost:4173/', reuseExistingServer: !CI },
    { command: 'node scripts/serve.mjs --port 4174 --dir dist', url: 'http://localhost:4174/', reuseExistingServer: !CI },
  ],
});
