import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { e2eDatabaseUrl } from './database-url';

/**
 * Environment for the standalone server started by e2e/support/start-server.mjs. Shared
 * by the default browser suite and the actual-media suite; `background` supplies the
 * suite-specific BACKGROUND_* configuration.
 */
export function e2eServerEnv(options: {
  port: number;
  discordMockPort: number;
  background: Partial<Record<'BACKGROUND_VIDEO_MP4_URL' | 'BACKGROUND_VIDEO_WEBM_URL' | 'BACKGROUND_POSTER_URL', string>>;
  /** Editorial upload root for this suite (defaults to apps/web/.local/e2e-media). */
  editorialMediaRoot?: string;
}): Record<string, string> {
  const baseURL = `http://127.0.0.1:${options.port}`;
  return {
    NODE_ENV: 'production',
    PORT: String(options.port),
    HOSTNAME: '127.0.0.1',
    APP_URL: baseURL,
    BETTER_AUTH_URL: baseURL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'e2e-only-ephemeral-secret-not-for-production-000',
    DATABASE_URL: e2eDatabaseUrl(),
    E2E_ADMIN_DATABASE_URL: process.env.DATABASE_URL ?? '',
    // Absolute: the fixtures CLI (apps/web) and the standalone server (its own cwd) must share it.
    EDITORIAL_MEDIA_ROOT: path.resolve(
      options.editorialMediaRoot ??
        (process.env.E2E_MEDIA_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.local/e2e-media')),
    ),
    NEXT_TELEMETRY_DISABLED: '1',
    // Synthetic Discord configuration: snowflakes and token are fake and only valid
    // against the local mock server started by e2e/support/start-server.mjs.
    E2E_DISCORD_MOCK_PORT: String(options.discordMockPort),
    DISCORD_API_BASE_URL: `http://127.0.0.1:${options.discordMockPort}/api/v10`,
    DISCORD_GUILD_ID: '100000000000000001',
    DISCORD_BOT_TOKEN: 'e2e-synthetic-bot-token',
    DISCORD_CLIENT_ID: '100000000000000099',
    DISCORD_CLIENT_SECRET: 'e2e-synthetic-client-secret',
    // Explicitly enabled only in this isolated browser-test environment.
    ROLE_SYNC_ENABLED: 'true',
    ROLE_SYNC_PRODUCER_ID: 'e2e-synthetic-bot',
    ROLE_SYNC_KEYS_JSON: JSON.stringify({ fixture: 'e2e-role-sync-key-not-for-production-0000' }),
    DISCORD_ROLE_MAPPING_JSON: JSON.stringify({
      '200000000000000001': ['member'],
      '200000000000000002': ['editor'],
      '200000000000000003': ['match_manager'],
      '200000000000000004': ['administrator'],
    }),
    ...options.background,
  };
}
