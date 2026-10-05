import { z } from 'zod';
import { gameRouteFromLogi } from '@/modules/games/registry';
import { classifyFreshness, SERVER_FRESHNESS, type Freshness, type ServerSnapshot, type SourceRef } from '../contract';
import {
  logiEventSummarySchema, logiMatchSummarySchema, logiResultSummarySchema, logiScopeSchema, logiServerSnapshotSchema,
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
    teamScores: freshness === 'fresh' && scope.gameId === 'wardogs' ? wire.scores.map(({ id, label, score }) => ({ id, label, score })) : null,
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
  /** Captured names and explicit sides, independent of result participant identities. */
  teams: { id: string; slot: 'a' | 'b' | 'c'; side: string | null; name: string; shortCode: string | null }[];
  /** Added only after a reviewed association resolves to a published same-game archive entry. */
  archive?: { slug: string; opponentName?: string; opponentShortCode?: string | null; competitionName?: string | null };
  /** Explicitly reviewed IDs only; added by the equivalent-current-facts archive reconciliation. */
  aliases?: string[];
  result: {
    state: LogiResultSummary['resultState'];
    version: number | null;
    reviewedAt: string | null;
    endedAt: string | null;
    participants: { id: string; label: string; score: number | null }[];
    provenance: { kind: 'reviewed_result'; origin: 'collected' | 'manual' | 'legacy_import' }
      | { kind: 'event_result_import'; importedAt: string }
      | null;
  };
};

/** Publication is a website decision; fetching an operational event cannot publish it. */
export function mapLogiEventSummary(scope: LogiScope, input: LogiEventSummary, resultInput: LogiResultSummary | null, publication: { externalId: string; published: boolean }, observedAt: string, matchInput: z.infer<typeof logiMatchSummarySchema> | null = null): PublicLogiEvent | null {
  const event = logiEventSummarySchema.parse(input);
  const sourceRef = ref(scope, event, event.kind === 'match' ? 'match' : 'event');
  if (!publication.published || publication.externalId !== event.id) return null;
  z.iso.datetime({ offset: true }).parse(observedAt);
  const result = resultInput === null ? null : logiResultSummarySchema.parse(resultInput);
  if (result) {
    ref(scope, result, 'match');
    if (result.id !== event.id) throw new Error('Logi result identity mismatch');
  }
  const match = matchInput === null ? null : logiMatchSummarySchema.parse(matchInput);
  if (match) {
    ref(scope, match, 'match');
    if (match.id !== event.id) throw new Error('Logi imported result identity mismatch');
  }
  const reviewed = result?.result;
  const imported = reviewed ? null : match?.result;
  const teams = (event.matchTeams ?? []).map(({ teamId, slot, side, name, shortCode }) => ({ id: teamId, slot, side, name, shortCode })).sort((left, right) => left.slot.localeCompare(right.slot));
  return {
    ref: sourceRef, title: event.title, kind: event.kind, status: event.status,
    startsAt: event.startsAt, endsAt: event.endsAt, sourceUpdatedAt: event.updatedAt, observedAt, teams,
    result: {
      state: reviewed?.status ?? (imported ? 'provisional' : 'unknown'), version: reviewed?.version ?? null,
      reviewedAt: reviewed?.reviewedAt ?? null, endedAt: imported?.endedAt ?? null,
      participants: reviewed?.participants.map(({ id, label, score }) => ({ id, label, score })) ?? (imported ? [
        { id: 'sideA', label: imported.sideA, score: imported.score.sideA },
        { id: 'sideB', label: imported.sideB, score: imported.score.sideB },
      ] : []),
      provenance: reviewed ? { kind: 'reviewed_result', origin: reviewed.provenance.origin }
        : imported ? { kind: 'event_result_import', importedAt: imported.provenance.importedAt } : null,
    },
  };
}
