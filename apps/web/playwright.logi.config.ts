import { defineConfig, devices } from '@playwright/test';
import { e2eServerEnv } from './e2e/support/server-env';

/** Explicit synthetic connected-match acceptance; isolated from the ordinary archive fixtures. */
const port = Number(process.env.E2E_LOGI_PORT ?? 3400);
const baseURL = `http://127.0.0.1:${port}`;
process.env.E2E_PORT = String(port);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must name an isolated PostgreSQL server for the Logi browser suite.');
const database = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !/^[A-Za-z0-9_]*$/.test(database.pathname.slice(1))) {
  throw new Error('Logi browser acceptance requires a disposable PostgreSQL server on loopback.');
}
database.pathname = `/${database.pathname.slice(1) || 'valkyria'}_logi_e2e`;
process.env.E2E_DATABASE_URL = database.toString();

export default defineConfig({
  testDir: 'e2e/logi-public', outputDir: 'test-results/logi-public',
  timeout: 45_000, expect: { timeout: 10_000 }, fullyParallel: false, workers: 1, retries: 0,
  forbidOnly: Boolean(process.env.CI), reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB', timezoneId: 'Europe/Prague', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/support/start-server.mjs', url: `${baseURL}/api/health/ready`, reuseExistingServer: false, timeout: 180_000, stdout: 'pipe', stderr: 'pipe',
    env: { ...e2eServerEnv({ port, discordMockPort: port + 1000, editorialMediaRoot: '.local/e2e-media-logi', background: { BACKGROUND_VIDEO_MP4_URL: `${baseURL}/e2e-missing/background-loop.mp4` } }), BETTER_AUTH_SECRET: 'e2e-only-ephemeral-secret-not-for-production-000', E2E_LOGI_PUBLIC_FIXTURES: '1' },
  },
});
