import { createHash } from 'node:crypto';
import { z } from 'zod';
import { logiPublicServerSchema } from './logi/mapping';

export type LogiIntegrationEnv = {
  NODE_ENV?: string;
  LOGI_ALLOW_LOOPBACK_HTTP?: boolean;
  LOGI_SOURCES_JSON?: string;
  LOGI_DATA_API_KEY_HLL?: string;
  LOGI_DATA_API_KEY_WDG?: string;
  LOGI_MEMBERSHIP_API_KEY_HLL?: string;
  LOGI_MEMBERSHIP_API_KEY_WDG?: string;
  LOGI_MEMBERSHIP_SOURCE?: 'discord' | 'logi';
  LOGI_EVENT_WRITE_ENABLED?: boolean;
  LOGI_EVENT_API_KEY_HLL?: string;
  LOGI_EVENT_API_KEY_WDG?: string;
  LOGI_WEBHOOK_ENABLED?: boolean;
  LOGI_WEBHOOK_SIGNING_SECRETS_JSON?: string;
};

const sourceSchema = z.strictObject({
  sourceInstanceId: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
  origin: z.url(),
  /** Canonical Discord guild returned by Logi APIs; dashboard workspace IDs stay internal. */
  guildId: z.string().regex(/^\d{5,25}$/),
  gameId: z.enum(['hell_let_loose', 'wardogs']),
  /** Explicit authorization to display safe match projections, never member identities. */
  publishMatches: z.boolean().default(false),
  publicServers: z.array(logiPublicServerSchema).max(20).default([]),
});

export type ConfiguredLogiSource = z.infer<typeof sourceSchema> & {
  apiKey: string;
  allowLoopbackHttp: boolean;
  environment: 'production' | 'development' | 'test';
  /** Includes a key fingerprint so a changed grant cannot read a previous key's cache. */
  scopeKey: string;
};

export function configuredLogiSources(env: LogiIntegrationEnv, purpose: 'data' | 'membership' | 'commands'): ConfiguredLogiSource[] {
  if (purpose === 'commands' && !env.LOGI_EVENT_WRITE_ENABLED) return [];
  let raw: unknown;
  try { raw = JSON.parse(env.LOGI_SOURCES_JSON ?? '[]'); } catch { throw new Error('Invalid LOGI_SOURCES_JSON.'); }
  const parsed = z.array(sourceSchema).max(2).safeParse(raw);
  if (!parsed.success || new Set(parsed.data.map((row) => row.gameId)).size !== parsed.data.length) throw new Error('Invalid LOGI_SOURCES_JSON.');
  const environment = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  return parsed.data.map((source) => {
    const url = new URL(source.origin);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    const allowLoopbackHttp = env.LOGI_ALLOW_LOOPBACK_HTTP === true && environment !== 'production';
    if (url.username || url.password || url.hash || url.search || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && allowLoopbackHttp))) {
      throw new Error('Invalid Logi source origin.');
    }
    const hll = source.gameId === 'hell_let_loose';
    const apiKey = purpose === 'data'
      ? (hll ? env.LOGI_DATA_API_KEY_HLL : env.LOGI_DATA_API_KEY_WDG)
      : purpose === 'membership' ? (hll ? env.LOGI_MEMBERSHIP_API_KEY_HLL : env.LOGI_MEMBERSHIP_API_KEY_WDG)
      : (hll ? env.LOGI_EVENT_API_KEY_HLL : env.LOGI_EVENT_API_KEY_WDG);
    if (!apiKey || apiKey.length < 16) throw new Error('Missing restricted Logi service key.');
    const scopeKey = createHash('sha256').update(JSON.stringify([source, purpose, apiKey])).digest('hex');
    return { ...source, origin: url.origin, apiKey, allowLoopbackHttp, environment, scopeKey };
  });
}
