import { createHash } from 'node:crypto';
import { z } from 'zod';
import { logiPublicServerSchema } from './logi/mapping';

export type LogiIntegrationEnv = {
  NODE_ENV?: string;
  LOGI_ALLOW_LOOPBACK_HTTP?: boolean;
  LOGI_SOURCES_JSON?: string;
  LOGI_DATA_API_KEY_HLL?: string;
  LOGI_DATA_API_KEY_WDG?: string;
  LOGI_PEOPLE_API_KEY_HLL?: string;
  LOGI_PEOPLE_API_KEY_WDG?: string;
  LOGI_MEMBERSHIP_API_KEY_HLL?: string;
  LOGI_MEMBERSHIP_API_KEY_WDG?: string;
  LOGI_MEMBERSHIP_SOURCE?: 'discord' | 'logi';
  LOGI_EVENT_WRITE_ENABLED?: boolean;
  LOGI_EVENT_API_KEY_HLL?: string;
  LOGI_EVENT_API_KEY_WDG?: string;
  LOGI_WEBHOOK_ENABLED?: boolean;
  LOGI_WEBHOOK_SIGNING_SECRETS_JSON?: string;
  /** Wardogs-only on-demand readers (issue #87 and the retained game history); each key is a separate explicit grant. */
  LOGI_LEAGUE_API_KEY_WDG?: string;
  LOGI_WARCON_API_KEY_WDG?: string;
  LOGI_HISTORY_API_KEY_WDG?: string;
  /** `synthetic-fixture` serves labelled synthetic reader data for local tests and review captures. */
  LOGI_READERS_SOURCE?: 'logi' | 'synthetic-fixture';
};

/** Approved Warcon connection shown only under an already published `publicServers` entry. */
export const logiWarconConnectionSchema = z.strictObject({
  connectionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/),
  publicId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
});
export type LogiWarconConnection = z.infer<typeof logiWarconConnectionSchema>;

/**
 * Operator association of one retained-history source (the opaque 64-hex `sourceId` a
 * `server-game-history` record carries; neither a Warcon connection ID, a provider
 * server UUID nor a website public ID) with an already published `publicServers`
 * entry. Nothing is matched by server name. `publishPlayers` releases per-player names
 * and statistics of that source to the public page; faction aggregates need no opt-in.
 */
export const logiHistorySourceSchema = z.strictObject({
  sourceId: z.string().regex(/^[a-f0-9]{64}$/),
  publicId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  publishPlayers: z.boolean().default(false),
});
export type LogiHistorySource = z.infer<typeof logiHistorySourceSchema>;

const sourceSchema = z.strictObject({
  sourceInstanceId: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/),
  origin: z.url(),
  /** Canonical Discord guild returned by Logi APIs; dashboard workspace IDs stay internal. */
  guildId: z.string().regex(/^\d{5,25}$/),
  gameId: z.enum(['hell_let_loose', 'wardogs']),
  /** Explicit authorization to display safe match projections, never member identities. */
  publishMatches: z.boolean().default(false),
  /** Private directory, published rosters and verified player facts use a distinct key. */
  syncPeople: z.boolean().default(false),
  publicServers: z.array(logiPublicServerSchema).max(20).default([]),
  /** Wardogs only: each `publicId` must name a published `publicServers` entry; IDs are unique. */
  warconConnections: z.array(logiWarconConnectionSchema).max(20).default([]),
  /** Wardogs only: retained-history sources under published servers; source and public IDs are unique. */
  historySources: z.array(logiHistorySourceSchema).max(20).default([]),
}).superRefine((source, ctx) => {
  if (source.warconConnections.length > 0) {
    if (source.gameId !== 'wardogs') ctx.addIssue({ code: 'custom', message: 'warcon_wardogs_only', path: ['warconConnections'] });
    const connectionIds = new Set(source.warconConnections.map((row) => row.connectionId));
    const publicIds = new Set(source.warconConnections.map((row) => row.publicId));
    if (connectionIds.size !== source.warconConnections.length || publicIds.size !== source.warconConnections.length) {
      ctx.addIssue({ code: 'custom', message: 'warcon_duplicate', path: ['warconConnections'] });
    }
    source.warconConnections.forEach((row, index) => {
      if (!source.publicServers.some((server) => server.publicId === row.publicId && server.published)) {
        ctx.addIssue({ code: 'custom', message: 'warcon_unpublished_server', path: ['warconConnections', index, 'publicId'] });
      }
    });
  }
  if (source.historySources.length > 0) {
    if (source.gameId !== 'wardogs') ctx.addIssue({ code: 'custom', message: 'history_wardogs_only', path: ['historySources'] });
    const sourceIds = new Set(source.historySources.map((row) => row.sourceId));
    const publicIds = new Set(source.historySources.map((row) => row.publicId));
    if (sourceIds.size !== source.historySources.length || publicIds.size !== source.historySources.length) {
      ctx.addIssue({ code: 'custom', message: 'history_duplicate', path: ['historySources'] });
    }
    source.historySources.forEach((row, index) => {
      if (!source.publicServers.some((server) => server.publicId === row.publicId && server.published)) {
        ctx.addIssue({ code: 'custom', message: 'history_unpublished_server', path: ['historySources', index, 'publicId'] });
      }
    });
  }
});

export type ConfiguredLogiSource = LogiSourceBinding & {
  purpose: LogiSourcePurpose;
  apiKey: string;
  /** Includes a key fingerprint so a changed grant cannot read a previous key's cache. */
  scopeKey: string;
};

/** `league`, `warcon` and `history` are Wardogs-only readers selected by the presence of their own key. */
export type LogiSourcePurpose = 'data' | 'people' | 'membership' | 'commands' | 'league' | 'warcon' | 'history';
const READER_PURPOSES: readonly LogiSourcePurpose[] = ['league', 'warcon', 'history'];
type LogiSourceBinding = z.infer<typeof sourceSchema> & { allowLoopbackHttp: boolean; environment: 'production' | 'development' | 'test' };

/** Nonsecret source binding, also used by signed webhook intake independently of pull keys. */
export function configuredLogiSourceBindings(env: LogiIntegrationEnv): LogiSourceBinding[] {
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
    return { ...source, origin: url.origin, allowLoopbackHttp, environment };
  });
}

export function configuredLogiSources(env: LogiIntegrationEnv, purpose: LogiSourcePurpose): ConfiguredLogiSource[] {
  if (purpose === 'commands' && !env.LOGI_EVENT_WRITE_ENABLED) return [];
  const readerKey = purpose === 'league' ? env.LOGI_LEAGUE_API_KEY_WDG : purpose === 'warcon' ? env.LOGI_WARCON_API_KEY_WDG : purpose === 'history' ? env.LOGI_HISTORY_API_KEY_WDG : undefined;
  // Readers exist only for the Wardogs source and only once their own key is supplied.
  if (READER_PURPOSES.includes(purpose) && !readerKey) return [];
  return configuredLogiSourceBindings(env).filter((source) => (purpose !== 'people' || source.syncPeople) && (!READER_PURPOSES.includes(purpose) || source.gameId === 'wardogs')).map((source) => {
    const hll = source.gameId === 'hell_let_loose';
    const apiKey = purpose === 'data'
      ? (hll ? env.LOGI_DATA_API_KEY_HLL : env.LOGI_DATA_API_KEY_WDG)
      : purpose === 'people' ? (hll ? env.LOGI_PEOPLE_API_KEY_HLL : env.LOGI_PEOPLE_API_KEY_WDG)
      : purpose === 'membership' ? (hll ? env.LOGI_MEMBERSHIP_API_KEY_HLL : env.LOGI_MEMBERSHIP_API_KEY_WDG)
      : purpose === 'commands' ? (hll ? env.LOGI_EVENT_API_KEY_HLL : env.LOGI_EVENT_API_KEY_WDG)
      : readerKey;
    if (!apiKey || apiKey.length < 16) throw new Error('Missing restricted Logi service key.');
    // Authority only: presentation settings (publishMatches, publicServers) must not move
    // the cached sync scope and its projections to a new key.
    const scopeKey = createHash('sha256').update(JSON.stringify([source.sourceInstanceId, source.origin, source.guildId, source.gameId, purpose, apiKey])).digest('hex');
    return { ...source, purpose, apiKey, scopeKey };
  });
}
