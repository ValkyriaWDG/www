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
    const source = configuredLogiSources(getServerEnv(), 'data').find((row) => row.gameId === GAME_REGISTRY[game].logi);
    if (!source || !source.publicServers.some((row) => row.published)) return { state: 'not_configured' };
    const rows = await readActiveLogiProjections(getDb(), source);
    const scope = { sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId };
    const servers: ServerSnapshot[] = source.publicServers.filter((config) => config.published).map((config) => {
      const row = rows.find((row) => row.resource === 'server-snapshots' && row.externalId === config.connectionId && row.operation === 'upsert');
      const wire = logiServerSnapshotSchema.safeParse(row?.data);
      // A failed pull supersedes a recent success without rewriting its snapshot.
      const sourceAvailable = Boolean(row?.lastSuccessAt && !row.errorCode && now.getTime() - row.lastSuccessAt.getTime() < PUBLIC_REVALIDATION_MAX_AGE_MS);
      const snapshot = wire.success ? mapLogiServerSnapshot(scope, wire.data, config, now, sourceAvailable) : null;
      return snapshot ?? {
        ref: { source: 'logi', sourceInstanceId: scope.sourceInstanceId, guildId: scope.guildId, game, kind: 'server', externalId: config.connectionId },
        publicId: config.publicId, name: config.name, reachability: 'unknown', map: null, mode: null, players: null, capacity: null,
        nextMap: null, timeRemainingSeconds: null, teams: null, score: null, observedAt: null, freshness: 'unavailable',
        connect: config.address ? { kind: 'address', address: config.address } : { kind: 'none' }, statsUrl: config.statsUrl,
      };
    });
    return { state: 'ok', servers, synthetic: false, partial: servers.some((row) => row.freshness === 'unavailable'), attemptedAt: now.toISOString() };
  } catch { return { state: 'unavailable', servers: [], attemptedAt: now.toISOString() }; }
}
