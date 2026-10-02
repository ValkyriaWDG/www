import { z } from 'zod';

/** Wire DTOs from Logi PR #158. Keep them distinct from website publication DTOs. */
export const LOGI_COLLECTION_RESOURCES = ['event-summaries', 'match-summaries', 'result-summaries', 'server-snapshots', 'integration-health'] as const;
export const LOGI_RESOURCES = [...LOGI_COLLECTION_RESOURCES, 'membership-summaries'] as const;
export type LogiCollectionResource = (typeof LOGI_COLLECTION_RESOURCES)[number];
export type LogiResource = (typeof LOGI_RESOURCES)[number];
export const logiGameSchema = z.enum(['hell_let_loose', 'wardogs']);
export const logiIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/);
export const logiRevisionSchema = z.string().regex(/^(0|[1-9][0-9]{0,127})$/);
export const logiCursorSchema = z.string().min(1).max(8192).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const instant = z.iso.datetime({ offset: true });
const text = z.string().min(1).max(200);
const count = z.number().int().nonnegative().safe();
const freshness = z.enum(['fresh', 'stale', 'unavailable']);
const provider = z.enum(['hll_crcon', 'wardogs_rcon', 'wardogs_warcon', 'wardogs_public_directory']);
const capability = z.enum(['server_snapshot', 'match_history']);
const providerError = z.enum(['timeout', 'network', 'rate_limited', 'unauthorized', 'invalid_response', 'unsupported', 'configuration', 'not_listed']);
const identity = { id: logiIdSchema, guildId: logiIdSchema, gameId: logiGameSchema };
const eventIdentity = { ...identity, title: z.string().max(1000), updatedAt: instant.nullable() };

export const logiScopeSchema = z.strictObject({
  sourceInstanceId: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
  guildId: logiIdSchema,
  gameId: logiGameSchema,
});
export type LogiScope = z.infer<typeof logiScopeSchema>;

export const logiEventSummarySchema = z.strictObject({
  ...eventIdentity,
  kind: z.enum(['match', 'training']),
  status: z.enum(['registration', 'closed', 'starting', 'concluded']).nullable(),
  startsAt: instant.nullable(),
  endsAt: instant,
});
export const logiMatchSummarySchema = z.strictObject({
  ...eventIdentity,
  eventId: logiIdSchema,
  resultState: z.enum(['unknown', 'provisional']),
  result: z.strictObject({
    mapId: z.string().max(200),
    mapName: z.string().max(200).nullable(),
    sideA: z.string().max(200),
    sideB: z.string().max(200),
    score: z.strictObject({ sideA: z.number().finite(), sideB: z.number().finite() }),
    outcome: z.enum(['victory', 'defeat', 'draw']),
    endedAt: instant.nullable(),
    provenance: z.strictObject({ type: z.literal('event_result_import'), importedAt: instant }),
  }).nullable(),
}).refine((value) => value.id === value.eventId && (value.resultState === 'unknown') === (value.result === null));
export const logiScoreSchema = z.strictObject({ id: text, label: text, score: z.number().finite().nullable() });
export const logiResultSummarySchema = z.strictObject({
  ...eventIdentity,
  eventId: logiIdSchema,
  resultState: z.enum(['unknown', 'provisional', 'confirmed', 'corrected']),
  result: z.strictObject({
    version: z.number().int().positive().safe(),
    status: z.enum(['provisional', 'confirmed', 'corrected']),
    participants: z.array(logiScoreSchema).min(2).max(16),
    provenance: z.strictObject({
      origin: z.enum(['collected', 'manual', 'legacy_import']),
      sources: z.array(z.strictObject({ provider, complete: z.boolean(), startedAt: instant.nullable(), endedAt: instant.nullable() })).max(4),
    }),
    reviewedAt: instant.nullable(),
    supersedesVersion: z.number().int().positive().safe().nullable(),
    attribution: z.strictObject({ verified: count, unresolved: count }),
  }).nullable(),
}).refine((value) => value.id === value.eventId && (value.result === null ? value.resultState === 'unknown' : value.resultState === value.result.status));
export const logiServerSnapshotSchema = z.strictObject({
  ...identity,
  provider,
  observedAt: instant.nullable(),
  providerUpdatedAt: instant.nullable(),
  displayName: text.nullable(),
  state: z.enum(['online', 'offline', 'unknown']),
  map: text.nullable(),
  players: count.nullable(),
  capacity: count.nullable(),
  providerInstanceId: text.nullable(),
  scores: z.array(logiScoreSchema).max(16),
  capabilities: z.array(capability).max(2),
  freshness,
  lastSuccessAt: instant.nullable(),
  attribution: z.strictObject({ label: text, url: z.url().max(2048) }).nullable(),
});
export const logiIntegrationHealthSchema = z.strictObject({
  ...identity,
  provider,
  enabled: z.boolean(),
  capabilities: z.array(capability).max(2),
  lastAttemptAt: instant.nullable(),
  lastSuccessAt: instant.nullable(),
  nextAttemptAt: instant.nullable(),
  errorCategory: providerError.nullable(),
  freshness,
  collectedSessions: count.nullable(),
  lastHistorySuccessAt: instant.nullable(),
  historyErrorCategory: providerError.nullable(),
});
export const logiMembershipSchema = z.strictObject({
  guildId: logiIdSchema,
  discordUserId: z.string().regex(/^[0-9]{17,20}$/),
  gameId: logiGameSchema,
  state: z.enum(['present', 'left', 'unknown']),
  roleIds: z.array(z.string().regex(/^[0-9]{17,20}$/)).max(250),
  assignment: z.strictObject({ type: z.enum(['member', 'reserve_member', 'mercenary']), status: z.enum(['pending', 'recruit', 'active']) }).nullable(),
  observedAt: instant.nullable(),
  receivedAt: instant.nullable(),
  epoch: logiRevisionSchema,
  revision: logiRevisionSchema,
  completeness: z.enum(['verified_member', 'verified_absent', 'unavailable']),
}).refine((value) => value.state === 'present'
  ? value.completeness === 'verified_member' && value.observedAt !== null
  : value.roleIds.length === 0 && value.completeness === (value.state === 'left' ? 'verified_absent' : 'unavailable'));

export const logiResourceSchemas = {
  'event-summaries': logiEventSummarySchema,
  'match-summaries': logiMatchSummarySchema,
  'result-summaries': logiResultSummarySchema,
  'server-snapshots': logiServerSnapshotSchema,
  'integration-health': logiIntegrationHealthSchema,
  'membership-summaries': logiMembershipSchema,
} as const;
export type LogiResourceMap = { [K in LogiResource]: z.infer<(typeof logiResourceSchemas)[K]> };
export type LogiEventSummary = LogiResourceMap['event-summaries'];
export type LogiResultSummary = LogiResourceMap['result-summaries'];
export type LogiServerSnapshot = LogiResourceMap['server-snapshots'];
export type LogiMembership = LogiResourceMap['membership-summaries'];
export type LogiCollectionPage<R extends LogiCollectionResource> = { data: LogiResourceMap[R][]; page: { nextCursor: string | null; limit: number } };

export const logiChangeSchema = z.strictObject({
  ...identity,
  resource: z.enum(LOGI_RESOURCES),
  revision: logiRevisionSchema,
  operation: z.enum(['upsert', 'remove']),
});
export type LogiChange = z.infer<typeof logiChangeSchema>;
export const logiChangesPageSchema = z.strictObject({
  data: z.array(logiChangeSchema).max(100),
  page: z.strictObject({ nextCursor: logiCursorSchema, hasMore: z.boolean(), limit: z.number().int().min(1).max(100) }),
});
export type LogiChangesPage = z.infer<typeof logiChangesPageSchema>;
export type LogiSyncRecord<R extends LogiResource = LogiResource> = R extends LogiResource
  ? Omit<LogiChange, 'resource' | 'operation'> & { resource: R } & ({ operation: 'remove'; data: null } | { operation: 'upsert'; data: LogiResourceMap[R] })
  : never;

/** Number and lexical comparisons are unsafe for the producer's 128-digit revisions. */
export function compareLogiRevisions(left: string, right: string): -1 | 0 | 1 {
  logiRevisionSchema.parse(left);
  logiRevisionSchema.parse(right);
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a > b ? 1 : -1;
}
