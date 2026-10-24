import 'server-only';
import type { Executor } from '@valkyria/db';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import type { ServerSnapshot } from './contract';
import { configuredLogiSources, type LogiIntegrationEnv } from './logi-config';
import { attachPublicLogiArchiveLinks } from './logi-match-links';
import { logiEventSummarySchema, logiMatchSummarySchema, logiResultSummarySchema, logiServerSnapshotSchema } from './logi/contracts';
import { mapLogiEventSummary, mapLogiServerSnapshot, type PublicLogiEvent } from './logi/mapping';
import { readActiveLogiProjections } from './logi-store';
import type { ServerOverview } from './servers/provider';
import { readCurrentLogiServers } from './servers/logi';
import { getWarconServersPublic } from './logi/readers/warcon';
import { ageWarconLivePublic } from './logi/readers/public';

/** A projection is public only while a successful pull is at most this old (also the administration freshness limit). */
export const PUBLIC_REVALIDATION_MAX_AGE_MS = 15 * 60_000;

export async function readPublicLogiEvents(db: Executor, env: LogiIntegrationEnv, game?: GameRoute, now = new Date()): Promise<PublicLogiEvent[]> {
  const events: PublicLogiEvent[] = [];
  for (const source of configuredLogiSources(env, 'data')) {
    if (!source.publishMatches || (game && source.gameId !== GAME_REGISTRY[game].logi)) continue;
    const scope = { sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId };
    const records = await readActiveLogiProjections(db, source);
    for (const row of records) {
      if (row.resource !== 'event-summaries' || row.operation !== 'upsert' || !row.lastSuccessAt || now.getTime() - row.lastSuccessAt.getTime() > PUBLIC_REVALIDATION_MAX_AGE_MS) continue;
      const event = logiEventSummarySchema.safeParse(row.data);
      if (!event.success || event.data.kind !== 'match') continue;
      const resultRow = records.find((record) => record.resource === 'result-summaries' && record.externalId === row.externalId && record.operation === 'upsert');
      const result = logiResultSummarySchema.safeParse(resultRow?.data);
      const matchRow = records.find((record) => record.resource === 'match-summaries' && record.externalId === row.externalId && record.operation === 'upsert');
      const match = logiMatchSummarySchema.safeParse(matchRow?.data);
      const dto = mapLogiEventSummary(scope, event.data, result.success ? result.data : null, { externalId: row.externalId, published: true }, row.observedAt.toISOString(), match.success ? match.data : null);
      if (dto) events.push(dto);
    }
  }
  return events;
}

export async function getPublicLogiEvents(game?: GameRoute) {
  const env = getServerEnv();
  if (env.LOGI_SOURCES_JSON === '[]') return [];
  try {
    const db = getDb();
    return await attachPublicLogiArchiveLinks(db, env, await readPublicLogiEvents(db, env, game));
  } catch { return []; }
}

export async function getLogiServerOverview(game: GameRoute, now = new Date()): Promise<ServerOverview> {
  try {
    const env = getServerEnv();
    const source = configuredLogiSources(env, 'data').find((row) => row.gameId === GAME_REGISTRY[game].logi);
    if (!source || !source.publicServers.some((row) => row.published)) return { state: 'not_configured' };
    const current = await readCurrentLogiServers(source);
    const scope = { sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId };
    let servers: ServerSnapshot[] = source.publicServers.filter((config) => config.published).map((config) => {
      const wire = logiServerSnapshotSchema.safeParse(current.rows.find((row) => row.id === config.connectionId));
      const snapshot = wire.success ? mapLogiServerSnapshot(scope, wire.data, config, now, current.available) : null;
      return snapshot ?? {
        ref: { source: 'logi', sourceInstanceId: scope.sourceInstanceId, guildId: scope.guildId, game, kind: 'server', externalId: config.connectionId },
        publicId: config.publicId, name: config.name, reachability: 'unknown', map: null, mode: null, players: null, capacity: null,
        nextMap: null, timeRemainingSeconds: null, teams: null, score: null, observedAt: null, freshness: 'unavailable',
        connect: config.address ? { kind: 'address', address: config.address } : { kind: 'none' }, statsUrl: config.statsUrl,
      };
    });
    let warconAvailable = false;
    if (game === 'wardogs' && env.LOGI_WARCON_API_KEY_WDG && source.warconConnections.length > 0) {
      // Reading presentation alone does not request an overview: it avoids a provider
      // recursion and suppresses live reads for servers hidden by the website.
      const { getServerPresentation, isServerPublished } = await import('./servers/presentation');
      const presentation = await getServerPresentation(now);
      const ids = servers.filter((server) => isServerPublished(presentation, game, server.publicId)).map((server) => server.publicId);
      const observations = ids.length > 0 ? await getWarconServersPublic(ids, null, now) : [];
      servers = servers.map((server): ServerSnapshot => {
        if (!ids.includes(server.publicId)) return server;
        const observation = observations?.find((row) => row.publicId === server.publicId && !row.synthetic);
        if (!observation) return server;
        const live = ageWarconLivePublic(observation.live, now);
        if (live.freshness === 'unavailable') return server;
        warconAvailable = true;
        // An older or stale alternative never replaces a newer/current observation.
        if (server.freshness === 'fresh' && live.freshness !== 'fresh'
          || server.observedAt && live.observedAt && Date.parse(server.observedAt) > Date.parse(live.observedAt)) return server;
        return {
          ...server, map: live.map, players: live.playerCount, capacity: live.maxPlayers,
          observedAt: live.observedAt, freshness: live.freshness,
          reachability: live.freshness === 'fresh' ? 'online' : 'unknown',
          score: null, teams: null,
          teamScores: live.freshness === 'fresh' ? live.scores.map((score) => ({ id: score.name, label: score.name, score: score.score })) : null,
          // Warcon matchSeconds is elapsed time, never a remaining-time estimate.
          timeRemainingSeconds: null,
        };
      });
    }
    if (!current.available && !warconAvailable) return { state: 'unavailable', servers, attemptedAt: now.toISOString() };
    return { state: 'ok', servers, synthetic: false, partial: servers.some((row) => row.freshness === 'unavailable'), attemptedAt: now.toISOString() };
  } catch { return { state: 'unavailable', servers: [], attemptedAt: now.toISOString() }; }
}
