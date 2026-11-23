import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression suite (tests/visual/). Baselines in tests/visual/__screenshots__/ are made
 * in the Linux Playwright image that matches @playwright/test, so local runs and CI render the
 * same: run it with `npm run test:visual` (scripts/visual.sh), not on the host.
 */
const port = 4322;

export default defineConfig({
  testDir: 'tests/visual',
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.002 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Dependency-free static server for dist/ (astro preview needs the host's native binaries).
    command: `node scripts/serve-dist.mjs ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
