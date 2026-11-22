import { defineConfig, devices } from '@playwright/test';

const port = 4321;

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    // Astro 7 backgrounds `preview` when it detects an AI agent environment;
    // Playwright needs it in the foreground.
    env: { AI_AGENT: '', CLAUDECODE: '' },
  },
});
