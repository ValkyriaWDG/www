import { defineConfig, devices } from '@playwright/test';
import { BACKGROUND_DELIVERY, mediaUrl } from './e2e/media/delivery';
import { e2eServerEnv } from './e2e/support/server-env';

/**
 * Actual-byte background media check (`pnpm test:e2e:media`). Unlike the default suite,
 * which deliberately points at a missing video, this serves the verified delivered
 * derivatives from the ignored `public/media/background/` directory. It is a separate,
 * explicitly invoked check: it fails (never skips) when the files are absent or differ.
 */
const port = Number(process.env.E2E_MEDIA_PORT ?? 3300);
const baseURL = `http://127.0.0.1:${port}`;
const discordMockPort = port + 1000;
// Test helpers (e2e/support/auth.ts) derive the base URL, mock port and database from these.
process.env.E2E_PORT = String(port);
process.env.E2E_DISCORD_MOCK_PORT = String(discordMockPort);
if (!process.env.E2E_DATABASE_URL && process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${url.pathname.slice(1) || 'valkyria'}_media_e2e`;
  process.env.E2E_DATABASE_URL = url.toString();
}
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: 'e2e/media',
  outputDir: 'test-results/media',
  globalSetup: './e2e/media/verify-delivery.ts',
  timeout: 150_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
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
    command: 'node e2e/support/start-server.mjs',
    url: `${baseURL}/api/health/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: e2eServerEnv({
      port,
      discordMockPort,
      editorialMediaRoot: '.local/e2e-media-actual',
      // Absolute same-origin URLs (the runtime schema requires absolute HTTP(S) URLs).
      background: {
        BACKGROUND_VIDEO_WEBM_URL: mediaUrl(baseURL, BACKGROUND_DELIVERY.webm),
        BACKGROUND_VIDEO_MP4_URL: mediaUrl(baseURL, BACKGROUND_DELIVERY.mp4),
        BACKGROUND_POSTER_URL: mediaUrl(baseURL, BACKGROUND_DELIVERY.poster),
      },
    }),
  },
});
