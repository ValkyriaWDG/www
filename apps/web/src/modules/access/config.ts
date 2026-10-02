/**
 * Runtime inputs for authorization decisions. Mirrors the relevant `ServerEnv` keys so
 * request code passes `getServerEnv()` directly while tests pass explicit values.
 */
import type { LogiIntegrationEnv } from '@/modules/integrations/logi-config';

export type AccessEnv = LogiIntegrationEnv & {
  BETTER_AUTH_SECRET?: string;
  LOGI_SSO_ENABLED?: boolean;
  LOGI_ISSUER_URL?: string;
  LOGI_CLIENT_ID?: string;
  LOGI_CLIENT_SECRET?: string;
  LOGI_GUILD_ID?: string;
  LOGI_DISCORD_FALLBACK_ENABLED?: boolean;
  DISCORD_GUILD_ID?: string | undefined;
  DISCORD_BOT_TOKEN?: string | undefined;
  DISCORD_API_BASE_URL: string;
  DISCORD_ROLE_MAPPING_JSON: string;
  LOCAL_ADMIN_LOGIN_ENABLED: boolean;
};

/** Freshness limits from docs/security/auth-rbac.md. */
export const WRITE_SNAPSHOT_MAX_AGE_MS = 60_000;
export const READ_SNAPSHOT_MAX_AGE_MS = 5 * 60_000;
/** Minimum spacing of user-requested ("Refresh membership") Discord lookups. */
export const MANUAL_REFRESH_MIN_INTERVAL_MS = 10_000;

const DEFAULT_DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Reads `AccessEnv` from raw process variables without the request-time `server-only`
 * environment module, so bundled operational runners (scheduler/CLI) can use it too.
 * Values are validated again where they are used (snowflakes, URL scheme).
 */
export function accessEnvFromProcess(source: NodeJS.ProcessEnv = process.env): AccessEnv {
  let apiBaseUrl = DEFAULT_DISCORD_API_BASE_URL;
  const configured = nonEmpty(source.DISCORD_API_BASE_URL);
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') apiBaseUrl = configured;
    } catch {
      // Invalid override: keep the official API base.
    }
  }
  const flag = (source.LOCAL_ADMIN_LOGIN_ENABLED ?? '').trim().toLowerCase();
  const enabled = (name: string) => ['true', '1'].includes((source[name] ?? '').trim().toLowerCase());
  if (source.LOGI_MEMBERSHIP_SOURCE && !['discord', 'logi'].includes(source.LOGI_MEMBERSHIP_SOURCE)) throw new Error('Invalid LOGI_MEMBERSHIP_SOURCE.');
  return {
    NODE_ENV: source.NODE_ENV,
    LOGI_SSO_ENABLED: enabled('LOGI_SSO_ENABLED'),
    LOGI_DISCORD_FALLBACK_ENABLED: enabled('LOGI_DISCORD_FALLBACK_ENABLED'),
    LOGI_ALLOW_LOOPBACK_HTTP: enabled('LOGI_ALLOW_LOOPBACK_HTTP'),
    LOGI_MEMBERSHIP_SOURCE: source.LOGI_MEMBERSHIP_SOURCE === 'logi' ? 'logi' : 'discord',
    LOGI_SOURCES_JSON: source.LOGI_SOURCES_JSON ?? '[]',
    LOGI_GUILD_ID: nonEmpty(source.LOGI_GUILD_ID),
    LOGI_MEMBERSHIP_API_KEY_HLL: nonEmpty(source.LOGI_MEMBERSHIP_API_KEY_HLL),
    LOGI_MEMBERSHIP_API_KEY_WDG: nonEmpty(source.LOGI_MEMBERSHIP_API_KEY_WDG),
    DISCORD_GUILD_ID: nonEmpty(source.DISCORD_GUILD_ID),
    DISCORD_BOT_TOKEN: nonEmpty(source.DISCORD_BOT_TOKEN),
    DISCORD_API_BASE_URL: apiBaseUrl,
    DISCORD_ROLE_MAPPING_JSON: source.DISCORD_ROLE_MAPPING_JSON ?? '{}',
    LOCAL_ADMIN_LOGIN_ENABLED: flag === 'true' || flag === '1',
  };
}

export function discordClientConfig(env: AccessEnv) {
  return { apiBaseUrl: env.DISCORD_API_BASE_URL, botToken: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID };
}

export function isDiscordMembershipConfigured(env: AccessEnv): boolean {
  return Boolean(env.DISCORD_GUILD_ID && env.DISCORD_BOT_TOKEN);
}
