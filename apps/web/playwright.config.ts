import { defineConfig, devices } from '@playwright/test';
import { e2eServerEnv } from './e2e/support/server-env';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
/** Local mock of the Discord REST API (e2e/support/discord-mock.mjs); never a real guild. */
const discordMockPort = Number(process.env.E2E_DISCORD_MOCK_PORT ?? port + 1000);
// Local cloud images may ship a different Chromium build than the pinned Playwright;
// CI installs the matching browser with `playwright install --with-deps chromium`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: 'e2e',
  // Actual delivered background media has its own suite (playwright.media.config.ts).
  testIgnore: ['media/**'],
  outputDir: 'test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'Europe/Prague',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Migrates and seeds a dedicated disposable e2e database with the bundled CLIs,
    // loads synthetic fixtures, then serves the standalone production build.
    command: 'node e2e/support/start-server.mjs',
    url: `${baseURL}/api/health/ready`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: e2eServerEnv({
      port,
      discordMockPort,
      // Same-origin URL that intentionally does not exist: exercises the missing-video fallback.
      // Actual delivered media is checked separately by playwright.media.config.ts.
      background: { BACKGROUND_VIDEO_MP4_URL: `${baseURL}/e2e-missing/background-loop.mp4` },
    }),
  },
});
