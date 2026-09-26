/**
 * Runtime inputs for authorization decisions. Mirrors the relevant `ServerEnv` keys so
 * request code passes `getServerEnv()` directly while tests pass explicit values.
 */
export type AccessEnv = {
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
  return {
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
