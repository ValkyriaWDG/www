import { defineConfig, devices } from '@playwright/test';
import { e2eDatabaseUrl } from './e2e/support/database-url';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
/** Local mock of the Discord REST API (e2e/support/discord-mock.mjs); never a real guild. */
const discordMockPort = Number(process.env.E2E_DISCORD_MOCK_PORT ?? port + 1000);
// Local cloud images may ship a different Chromium build than the pinned Playwright;
// CI installs the matching browser with `playwright install --with-deps chromium`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: 'e2e',
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
    env: {
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      APP_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'e2e-only-ephemeral-secret-not-for-production-000',
      DATABASE_URL: e2eDatabaseUrl(),
      E2E_ADMIN_DATABASE_URL: process.env.DATABASE_URL ?? '',
      EDITORIAL_MEDIA_ROOT: process.env.E2E_MEDIA_ROOT || '.local/e2e-media',
      NEXT_TELEMETRY_DISABLED: '1',
      // Synthetic Discord configuration: snowflakes and token are fake and only valid
      // against the local mock server started by e2e/support/start-server.mjs.
      E2E_DISCORD_MOCK_PORT: String(discordMockPort),
      DISCORD_API_BASE_URL: `http://127.0.0.1:${discordMockPort}/api/v10`,
      DISCORD_GUILD_ID: '100000000000000001',
      DISCORD_BOT_TOKEN: 'e2e-synthetic-bot-token',
      DISCORD_CLIENT_ID: '100000000000000099',
      DISCORD_CLIENT_SECRET: 'e2e-synthetic-client-secret',
      DISCORD_ROLE_MAPPING_JSON: JSON.stringify({
        '200000000000000001': ['member'],
        '200000000000000002': ['editor'],
        '200000000000000003': ['match_manager'],
        '200000000000000004': ['administrator'],
      }),
      // Same-origin URL that intentionally does not exist: exercises the missing-video fallback.
      BACKGROUND_VIDEO_MP4_URL: `${baseURL}/e2e-missing/background-loop.mp4`,
    },
  },
});
