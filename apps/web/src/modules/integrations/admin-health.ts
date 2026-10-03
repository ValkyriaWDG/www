import 'server-only';
import { logiCommand, logiInbox, logiProjection, logiSyncScope, type Executor } from '@valkyria/db';
import { and, eq, max, sql } from 'drizzle-orm';
import { parseRoleMapping } from '@/modules/access/role-mapping';
import type { Actor } from '@/modules/access/types';
import { isLogiSignInConfigured, logiProviderConfigFromEnv } from '@/modules/auth/logi-provider';
import { GAME_REGISTRY, GAME_ROUTES, gameRouteFromLogi, type GameRoute } from '@/modules/games/registry';
import { authorize } from '@/modules/prose/domain';
import {
  classifyScopeState, scopeFreshness,
  type AdminConfiguredServer, type AdminGameServers, type AdminIntegrationHealth, type AdminLogiHealth, type AdminLogiPurpose, type AdminLogiScope, type AdminLogiSource, type AdminReader, type AdminServerOverview,
} from './admin-health-types';
import { INTEGRATION_CONTRACT_VERSION } from './contract';
import { configuredLogiSourceBindings, configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv, type LogiSourcePurpose } from './logi-config';
import { PUBLIC_REVALIDATION_MAX_AGE_MS } from './logi-public';
import { logiIntegrationHealthSchema } from './logi/contracts';
import { READER_RESOURCES, readerCapabilityStates } from './logi/readers/health';
import { logiSyncCheckpointSchema } from './logi/sync';
import { parseCrconConfig } from './servers/crcon';
import { SYNTHETIC_SERVERS } from './servers/fixtures';
import { getServerOverview, serverStatusSourceForGame, type ServerOverview, type ServerStatusSourceEnv } from './servers/provider';

/*
 * Read-only integration health for administrators (issue #22). Everything is derived
 * from the website database and the validated runtime configuration; the only outbound
 * call is the existing bounded, cached server-status provider. Credentials, private
 * service destinations and raw provider errors never enter the DTO: keys become
 * booleans, Logi origins and CRCON base URLs are omitted and configuration failures are
 * reported as generic reasons. Absent producer health means unknown.
 */

export type IntegrationAdminEnv = LogiIntegrationEnv & ServerStatusSourceEnv & {
  LOGI_SSO_ENABLED?: boolean;
  LOGI_ISSUER_URL?: string | undefined;
  LOGI_CLIENT_ID?: string | undefined;
  LOGI_CLIENT_SECRET?: string | undefined;
  LOGI_GUILD_ID?: string | undefined;
  LOGI_DISCORD_FALLBACK_ENABLED?: boolean;
  HLL_SERVER_SOURCES_JSON: string;
  DISCORD_ROLE_MAPPING_JSON: string;
  DISCORD_GUILD_ID?: string | undefined;
  DISCORD_BOT_TOKEN?: string | undefined;
};

export type IntegrationHealthDeps = {
  /** The public provider read (bounded, cached); injectable for tests. */
  overview?: (game: GameRoute, now: Date) => Promise<ServerOverview>;
};

const PURPOSES: readonly LogiSourcePurpose[] = ['data', 'people', 'membership', 'commands'];
const MAX_HEALTH_ROWS = 50;
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

function sanitizeOverview(overview: ServerOverview): AdminServerOverview {
  if (overview.state === 'not_configured') return { state: 'not_configured' };
  const servers = overview.servers.map((server) => ({
    publicId: server.publicId, name: server.name, reachability: server.reachability, freshness: server.freshness,
    observedAt: server.observedAt, players: server.players, capacity: server.capacity, map: server.map,
  }));
  return overview.state === 'ok'
    ? { state: 'ok', attemptedAt: overview.attemptedAt, synthetic: overview.synthetic, partial: overview.partial, servers }
    : { state: 'unavailable', attemptedAt: overview.attemptedAt, servers };
}

async function gameServers(game: GameRoute, env: IntegrationAdminEnv, now: Date, readOverview: NonNullable<IntegrationHealthDeps['overview']>): Promise<AdminGameServers> {
  const selected = serverStatusSourceForGame(game, env);
  // CRCON is an HLL-only source; Wardogs inheriting it has no source at all.
  const source = selected === 'crcon' && game !== 'hll' ? 'none' : selected;
  let configError: AdminGameServers['configError'] = null;
  let configured: AdminConfiguredServer[] = [];
  if (source === 'crcon' && game === 'hll') {
    const parsed = parseCrconConfig(env.HLL_SERVER_SOURCES_JSON);
    configError = parsed.error === 'invalid_json' ? 'invalid_json' : parsed.error ? 'invalid_config' : null;
    configured = parsed.servers.map((server) => ({ publicId: server.publicId, name: server.name ?? server.publicId, published: true, hasAddress: server.address !== null, hasStatsUrl: server.statsUrl !== null, origin: 'crcon' }));
  } else if (source === 'logi') {
    try {
      const binding = configuredLogiSourceBindings(env).find((row) => row.gameId === GAME_REGISTRY[game].logi);
      configured = (binding?.publicServers ?? []).map((server) => ({ publicId: server.publicId, name: server.name, published: server.published, hasAddress: server.address !== null, hasStatsUrl: server.statsUrl !== null, origin: 'logi' }));
    } catch {
      configError = 'invalid_config';
    }
  } else if (source === 'synthetic-fixture') {
    configured = (SYNTHETIC_SERVERS[game] ?? []).map((server) => ({ publicId: server.publicId, name: server.name, published: true, hasAddress: server.address !== null, hasStatsUrl: server.statsUrl !== null, origin: 'synthetic' }));
  }
  let overview: ServerOverview;
  try {
    overview = await readOverview(game, now);
  } catch {
    overview = { state: 'unavailable', servers: [], attemptedAt: now.toISOString() };
  }
  return { game, source, configError, configured, overview: sanitizeOverview(overview) };
}

/** Rebuilds exactly the configured source (and its cache scope key) for one purpose, or `null` without a valid key. */
function purposeSource(env: IntegrationAdminEnv, raw: unknown, purpose: LogiSourcePurpose): ConfiguredLogiSource | null {
  try {
    return configuredLogiSources({ ...env, LOGI_SOURCES_JSON: JSON.stringify([raw]) }, purpose)[0] ?? null;
  } catch {
    return null;
  }
}

async function readScope(db: Executor, source: ConfiguredLogiSource, now: Date): Promise<{ scope: AdminLogiScope; activeGeneration: string | null } | null> {
  const [row] = await db.select().from(logiSyncScope).where(eq(logiSyncScope.scopeKey, source.scopeKey)).limit(1);
  if (!row) return null;
  const checkpoint = logiSyncCheckpointSchema.safeParse(row.checkpoint);
  return {
    activeGeneration: row.activeGeneration,
    scope: {
      mode: checkpoint.success ? checkpoint.data.mode : null,
      hasActiveGeneration: row.activeGeneration !== null,
      lastAttemptAt: iso(row.lastAttemptAt),
      lastSuccessAt: iso(row.lastSuccessAt),
      nextAttemptAt: iso(row.nextAttemptAt),
      errorCode: row.errorCode,
      leaseActive: row.leaseExpiresAt !== null && row.leaseExpiresAt > now,
      freshness: scopeFreshness(row.lastSuccessAt, now, PUBLIC_REVALIDATION_MAX_AGE_MS),
    },
  };
}

/** Producer-reported collector health of the active data generation; absent means unknown. */
async function readHealth(db: Executor, source: ConfiguredLogiSource, activeGeneration: string): Promise<AdminLogiHealth[]> {
  const rows = await db.select({ data: logiProjection.data }).from(logiProjection)
    .where(and(eq(logiProjection.scopeKey, source.scopeKey), eq(logiProjection.generation, activeGeneration), eq(logiProjection.resource, 'integration-health'), eq(logiProjection.operation, 'upsert')))
    .limit(MAX_HEALTH_ROWS);
  const health: AdminLogiHealth[] = [];
  for (const row of rows) {
    const parsed = logiIntegrationHealthSchema.safeParse(row.data);
    if (!parsed.success || parsed.data.guildId !== source.guildId || parsed.data.gameId !== source.gameId) continue;
    const value = parsed.data;
    health.push({
      connectionId: value.id, provider: value.provider, enabled: value.enabled, capabilities: [...value.capabilities],
      lastAttemptAt: value.lastAttemptAt, lastSuccessAt: value.lastSuccessAt, nextAttemptAt: value.nextAttemptAt,
      errorCategory: value.errorCategory, freshness: value.freshness, collectedSessions: value.collectedSessions,
    });
  }
  return health.sort((left, right) => left.connectionId.localeCompare(right.connectionId));
}

async function logiSources(db: Executor, env: IntegrationAdminEnv, now: Date): Promise<{ configError: boolean; sources: AdminLogiSource[] }> {
  let bindings: ReturnType<typeof configuredLogiSourceBindings>;
  try {
    bindings = configuredLogiSourceBindings(env);
  } catch {
    return { configError: true, sources: [] };
  }
  const raw = JSON.parse(env.LOGI_SOURCES_JSON ?? '[]') as { gameId?: unknown }[];
  const sources: AdminLogiSource[] = [];
  for (const binding of bindings) {
    const game = gameRouteFromLogi(binding.gameId);
    const rawSource = raw.find((entry) => entry.gameId === binding.gameId);
    if (!game || !rawSource) continue;
    const purposes: AdminLogiPurpose[] = [];
    for (const purpose of PURPOSES) {
      const enabled = purpose === 'people' ? binding.syncPeople : purpose === 'commands' ? env.LOGI_EVENT_WRITE_ENABLED === true : purpose === 'membership' ? env.LOGI_MEMBERSHIP_SOURCE === 'logi' : true;
      const source = enabled ? purposeSource(env, rawSource, purpose) : null;
      const configured = source !== null;
      if (!source || (purpose !== 'data' && purpose !== 'people')) {
        purposes.push({ purpose, enabled, configured, state: configured ? 'configured' : 'not_configured', scope: null, health: null });
        continue;
      }
      const stored = await readScope(db, source, now);
      const health = purpose === 'data' && stored?.activeGeneration && stored.scope.lastSuccessAt ? await readHealth(db, source, stored.activeGeneration) : null;
      purposes.push({ purpose, enabled, configured, state: classifyScopeState(configured, stored?.scope ?? null), scope: stored?.scope ?? null, health });
    }
    // Instance, guild and game identify the binding; the origin (even its host) stays in the configuration.
    sources.push({
      sourceInstanceId: binding.sourceInstanceId, game, guildId: binding.guildId,
      publishMatches: binding.publishMatches, syncPeople: binding.syncPeople,
      publicServers: binding.publicServers.length, publishedServers: binding.publicServers.filter((server) => server.published).length, purposes,
    });
  }
  return { configError: false, sources };
}

/** Approved Wardogs readers (issue #87): states and attempt categories only. */
function readers(env: IntegrationAdminEnv): AdminReader[] {
  const states = readerCapabilityStates(env);
  return READER_RESOURCES.map((resource) => {
    const state = states[resource];
    return { resource, purpose: resource === 'league-matches' ? 'league' : 'warcon', state: state.state, detail: state.detail, approvedConnections: state.approvedConnections, lastAttemptAt: state.lastAttemptAt, lastOutcome: state.lastOutcome };
  });
}

/**
 * Website-side integration health and configuration facts for the administration.
 * Requires `settings.manage` (administrators/owners); editors and match managers are
 * denied before any read. The result is serializable and contains only sanitized data.
 */
export async function getIntegrationHealthForAdmin(db: Executor, actor: Actor, env: IntegrationAdminEnv, now: Date = new Date(), deps: IntegrationHealthDeps = {}): Promise<AdminIntegrationHealth> {
  await authorize(db, actor, 'settings.manage', { intent: 'read', action: 'integrations.read', entityType: 'integration_health' });
  const readOverview = deps.overview ?? getServerOverview;
  const [servers, logi, [inbox], [commands]] = await Promise.all([
    Promise.all(GAME_ROUTES.map((game) => gameServers(game, env, now, readOverview))),
    logiSources(db, env, now),
    db.select({
      pending: sql<number>`count(*) filter (where ${logiInbox.processedAt} is null)`.mapWith(Number),
      lastReceivedAt: max(logiInbox.receivedAt),
      lastProcessedAt: max(logiInbox.processedAt),
    }).from(logiInbox),
    db.select({
      pending: sql<number>`count(*) filter (where ${logiCommand.state} = 'pending')`.mapWith(Number),
      lastReceiptAt: max(sql<Date | null>`case when ${logiCommand.state} <> 'pending' then ${logiCommand.updatedAt} end`),
    }).from(logiCommand),
  ]);
  const mapping = parseRoleMapping(env.DISCORD_ROLE_MAPPING_JSON);
  const membershipSource = env.LOGI_MEMBERSHIP_SOURCE === 'logi' ? 'logi' : 'discord';
  return {
    generatedAt: now.toISOString(),
    contractVersion: INTEGRATION_CONTRACT_VERSION,
    servers,
    logi: {
      configError: logi.configError,
      sso: { enabled: env.LOGI_SSO_ENABLED === true, configured: isLogiSignInConfigured(logiProviderConfigFromEnv(env)), discordFallback: env.LOGI_DISCORD_FALLBACK_ENABLED === true },
      membershipSource,
      sources: logi.sources,
      readers: readers(env),
      webhooks: { enabled: env.LOGI_WEBHOOK_ENABLED === true, pendingHints: inbox?.pending ?? 0, lastReceivedAt: iso(inbox?.lastReceivedAt), lastProcessedAt: iso(inbox?.lastProcessedAt) },
      commands: { enabled: env.LOGI_EVENT_WRITE_ENABLED === true, pending: commands?.pending ?? 0, lastReceiptAt: commands?.lastReceiptAt ? new Date(commands.lastReceiptAt).toISOString() : null },
    },
    discord: {
      guildConfigured: Boolean(env.DISCORD_GUILD_ID && env.DISCORD_BOT_TOKEN),
      roleMappingConfigured: mapping.ok && Object.keys(mapping.mapping).length > 0,
      mappedRoles: mapping.ok ? Object.keys(mapping.mapping).length : 0,
      roleMappingError: mapping.ok ? null : mapping.error,
      membershipSource,
    },
  };
}
