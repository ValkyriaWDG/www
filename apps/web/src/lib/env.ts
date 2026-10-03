import 'server-only';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const optionalUrl = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .pipe(z.url({ protocol: /^https?$/ }).optional());

const httpsUrl = (fallback: string) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? fallback : value))
    .pipe(z.url({ protocol: /^https$/ }));

const booleanFlag = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value === 'true' || value === '1')
  .default(false);

const snowflake = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .pipe(z.string().regex(/^\d{5,25}$/, 'must be a Discord snowflake').optional());

const optionalSecret = z
  .string()
  .transform((value) => (value.trim() === '' ? undefined : value))
  .optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }).optional(),
  BETTER_AUTH_SECRET: optionalSecret,
  DATABASE_URL: optionalSecret,
  DISCORD_CLIENT_ID: optionalSecret,
  DISCORD_CLIENT_SECRET: optionalSecret,
  LOGI_SSO_ENABLED: booleanFlag,
  LOGI_ISSUER_URL: optionalUrl.optional(),
  LOGI_CLIENT_ID: optionalSecret,
  LOGI_CLIENT_SECRET: optionalSecret,
  LOGI_GUILD_ID: snowflake.optional(),
  LOGI_DISCORD_FALLBACK_ENABLED: booleanFlag,
  LOGI_ALLOW_LOOPBACK_HTTP: booleanFlag,
  LOGI_MEMBERSHIP_SOURCE: z.enum(['discord', 'logi']).default('discord'),
  LOGI_SOURCES_JSON: z.string().default('[]'),
  LOGI_DATA_API_KEY_HLL: optionalSecret,
  LOGI_DATA_API_KEY_WDG: optionalSecret,
  LOGI_PEOPLE_API_KEY_HLL: optionalSecret,
  LOGI_PEOPLE_API_KEY_WDG: optionalSecret,
  LOGI_MEMBERSHIP_API_KEY_HLL: optionalSecret,
  LOGI_MEMBERSHIP_API_KEY_WDG: optionalSecret,
  LOGI_EVENT_WRITE_ENABLED: booleanFlag,
  LOGI_EVENT_API_KEY_HLL: optionalSecret,
  LOGI_EVENT_API_KEY_WDG: optionalSecret,
  LOGI_WEBHOOK_ENABLED: booleanFlag,
  LOGI_WEBHOOK_SIGNING_SECRETS_JSON: z.string().default('{}'),
  /** Wardogs-only on-demand readers: separate `league-matches`, `warcon-data` and `server-game-history` grants. */
  LOGI_LEAGUE_API_KEY_WDG: optionalSecret,
  LOGI_WARCON_API_KEY_WDG: optionalSecret,
  LOGI_HISTORY_API_KEY_WDG: optionalSecret,
  /** `synthetic-fixture` serves labelled synthetic League/Warcon reader data (tests and review captures only). */
  LOGI_READERS_SOURCE: z.preprocess(emptyToUndefined, z.enum(['logi', 'synthetic-fixture']).default('logi')),
  DISCORD_GUILD_ID: snowflake.optional(),
  DISCORD_ROLE_MAPPING_JSON: z.string().default('{}'),
  DISCORD_BOT_TOKEN: optionalSecret,
  /** Discord REST base URL; overridable only for isolated adapter tests. */
  DISCORD_API_BASE_URL: z.url({ protocol: /^https?$/ }).default('https://discord.com/api/v10'),
  DISCORD_INVITE_URL: z
    .string()
    .trim()
    .default('https://discord.gg/vlkhll')
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.url({ protocol: /^https$/ }).optional()),
  HLL_WEBSITE_URL: httpsUrl('https://valkyriahll.cz/').default('https://valkyriahll.cz/'),
  HLL_MATCH_ARCHIVE_URL: httpsUrl('https://valkyriahll.cz/matches').default('https://valkyriahll.cz/matches'),
  EDITORIAL_MEDIA_ROOT: z.string().trim().min(1).default('.local/editorial-media'),
  LOCAL_ADMIN_LOGIN_ENABLED: booleanFlag,
  BACKGROUND_VIDEO_MP4_URL: optionalUrl.default(''),
  BACKGROUND_VIDEO_WEBM_URL: optionalUrl.default(''),
  BACKGROUND_POSTER_URL: optionalUrl.default(''),
  /** Comma-separated HTTPS origins permitted for admin-configured background media (also added to the CSP). */
  BACKGROUND_MEDIA_ALLOWED_ORIGINS: z.string().default(''),
  /** Reviewed HLL stage clip set (JSON array, see modules/hll/media.ts); empty until owner footage is approved. */
  HLL_BACKGROUND_CLIPS_JSON: z.string().default('[]'),
  /** Game-server status source: `none` by default; `crcon` reads HLL_SERVER_SOURCES_JSON; `synthetic-fixture` for development/tests. */
  SERVER_STATUS_SOURCE: z.preprocess(emptyToUndefined, z.enum(['none', 'logi', 'crcon', 'synthetic-fixture']).default('none')),
  /** Wardogs-only override; blank inherits the default source without changing HLL. */
  SERVER_STATUS_SOURCE_WDG: z.preprocess(emptyToUndefined, z.enum(['none', 'logi', 'synthetic-fixture']).optional()),
  /** HLL servers for the `crcon` source (JSON array, see modules/integrations/servers/crcon.ts). Never commit real hosts. */
  HLL_SERVER_SOURCES_JSON: z.string().default('[]'),
  SERVER_STATUS_FIXTURE_SCENARIO: z.preprocess(emptyToUndefined, z.enum(['mixed', 'unavailable', 'empty']).default('mixed')),
  /** Legacy HLL hostnames routed here at the domain cutover; read by proxy.ts (empty = inactive). */
  LEGACY_HLL_HOSTS: z.string().default(''),
  ROLE_SYNC_SIGNING_SECRET: optionalSecret,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Parses and validates runtime configuration once. Values are read at request time so
 * the production image can be built without secrets. Validation messages name the
 * variable but never echo its value.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid runtime configuration: ${problems}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' || env.LOGI_SSO_ENABLED) {
    if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
      throw new Error('Invalid runtime configuration: BETTER_AUTH_SECRET must be at least 32 characters in production.');
    }
  }
  cached = env;
  return env;
}

/** Test helper: forget the parsed configuration so a test can change process.env. */
export function resetServerEnvForTests(): void {
  cached = undefined;
}

export function requireDatabaseUrl(): string {
  const url = getServerEnv().DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return url;
}
