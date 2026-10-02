import { z } from 'zod';
import { gameRouteFromLogi } from '@/modules/games/registry';
import { classifyFreshness, SERVER_FRESHNESS, type Freshness, type ServerSnapshot, type SourceRef } from '../contract';
import {
  logiEventSummarySchema, logiResultSummarySchema, logiScopeSchema, logiServerSnapshotSchema,
  type LogiEventSummary, type LogiResultSummary, type LogiScope, type LogiServerSnapshot,
} from './contracts';

const publicHttpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
});
export const logiPublicServerSchema = z.strictObject({
  connectionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/),
  publicId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  name: z.string().min(1).max(200),
  published: z.boolean(),
  address: z.string().min(1).max(255).refine((value) => !/[\s\u0000-\u001f\u007f]/.test(value)).nullable(),
  statsUrl: publicHttpsUrl.nullable(),
  /** Explicit source IDs, never infer an Allied/Axis or Valkyria side from position. */
  hllScoreSides: z.strictObject({ allied: z.string().min(1).max(200), axis: z.string().min(1).max(200) })
    .refine((value) => value.allied !== value.axis).optional(),
});
export type LogiPublicServer = z.infer<typeof logiPublicServerSchema>;

function ref(scope: LogiScope, row: { guildId: string; gameId: string; id: string }, kind: SourceRef['kind']): SourceRef {
  logiScopeSchema.parse({ sourceInstanceId: scope.sourceInstanceId, guildId: scope.guildId, gameId: scope.gameId });
  const game = gameRouteFromLogi(scope.gameId);
  if (!game || row.guildId !== scope.guildId || row.gameId !== scope.gameId) throw new Error('Logi projection scope mismatch');
  return { source: 'logi', sourceInstanceId: scope.sourceInstanceId, guildId: scope.guildId, game, kind, externalId: row.id };
}

/** Only explicitly published, configured connections can become website server cards. */
export function mapLogiServerSnapshot(scope: LogiScope, input: LogiServerSnapshot, publicConfig: LogiPublicServer, now = new Date(), sourceAvailable = true): ServerSnapshot | null {
  const wire = logiServerSnapshotSchema.parse(input);
  const config = logiPublicServerSchema.parse(publicConfig);
  const sourceRef = ref(scope, wire, 'server');
  if (!config.published || wire.id !== config.connectionId) return null;
  const age = classifyFreshness(wire.observedAt ? new Date(wire.observedAt) : null, now, SERVER_FRESHNESS);
  const freshness: Freshness = age === 'unavailable' || wire.freshness === 'unavailable' ? 'unavailable'
    : age === 'stale' || wire.freshness === 'stale' || !sourceAvailable ? 'stale' : 'fresh';
  const expired = freshness === 'unavailable';
  const allied = config.hllScoreSides && wire.scores.find((row) => row.id === config.hllScoreSides!.allied)?.score;
  const axis = config.hllScoreSides && wire.scores.find((row) => row.id === config.hllScoreSides!.axis)?.score;
  return {
    ref: sourceRef, publicId: config.publicId, name: config.name,
    reachability: expired || !sourceAvailable ? 'unknown' : wire.state,
    map: expired ? null : wire.map, mode: null,
    players: expired ? null : wire.players, capacity: expired ? null : wire.capacity,
    nextMap: null, timeRemainingSeconds: null, teams: null,
    score: freshness === 'fresh' && scope.gameId === 'hell_let_loose' && typeof allied === 'number' && typeof axis === 'number' ? { allied, axis } : null,
    observedAt: wire.observedAt, freshness,
    connect: config.address ? { kind: 'address', address: config.address } : { kind: 'none' },
    statsUrl: config.statsUrl,
  };
}

/** A separate N-participant DTO; the legacy two-team match model cannot represent it. */
export type PublicLogiEvent = {
  ref: SourceRef;
  title: string;
  kind: LogiEventSummary['kind'];
  status: LogiEventSummary['status'];
  startsAt: string | null;
  endsAt: string;
  sourceUpdatedAt: string | null;
  observedAt: string;
  result: {
    state: LogiResultSummary['resultState'];
    version: number | null;
    reviewedAt: string | null;
    participants: { id: string; label: string; score: number | null }[];
  };
};

/** Publication is a website decision; fetching an operational event cannot publish it. */
export function mapLogiEventSummary(scope: LogiScope, input: LogiEventSummary, resultInput: LogiResultSummary | null, publication: { externalId: string; published: boolean }, observedAt: string): PublicLogiEvent | null {
  const event = logiEventSummarySchema.parse(input);
  const sourceRef = ref(scope, event, event.kind === 'match' ? 'match' : 'event');
  if (!publication.published || publication.externalId !== event.id) return null;
  z.iso.datetime({ offset: true }).parse(observedAt);
  const result = resultInput === null ? null : logiResultSummarySchema.parse(resultInput);
  if (result) {
    ref(scope, result, 'match');
    if (result.id !== event.id) throw new Error('Logi result identity mismatch');
  }
  return {
    ref: sourceRef, title: event.title, kind: event.kind, status: event.status,
    startsAt: event.startsAt, endsAt: event.endsAt, sourceUpdatedAt: event.updatedAt, observedAt,
    result: {
      state: result?.resultState ?? 'unknown', version: result?.result?.version ?? null,
      reviewedAt: result?.result?.reviewedAt ?? null,
      participants: result?.result?.participants.map(({ id, label, score }) => ({ id, label, score })) ?? [],
    },
  };
}
