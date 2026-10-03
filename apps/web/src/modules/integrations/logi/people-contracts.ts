import { z } from 'zod';

/** Logi v0.14 authenticated projections. None conveys publication consent or access. */
export const LOGI_PEOPLE_RESOURCES = ['member-summaries', 'roster-summaries', 'player-stat-summaries'] as const;
const id = z.string().min(1).max(200);
const instant = z.iso.datetime();
const label = z.string().min(1).max(200);
const common = { schemaVersion: z.literal(1), id, guildId: z.string().regex(/^\d{5,25}$/), gameId: z.enum(['hell_let_loose', 'wardogs']), updatedAt: instant.nullable() };

export const logiMemberReferenceSchema = z.strictObject({
  memberId: id.nullable(), identityId: id.nullable(), identityState: z.enum(['resolved', 'unresolved', 'conflict']),
}).refine((row) => row.identityState === 'resolved' ? row.memberId !== null && row.identityId !== null : row.memberId === null && row.identityId === null);

export const logiMemberSummarySchema = z.strictObject({
  ...common,
  identityId: id.nullable(), discordSubject: z.string().regex(/^\d{17,20}$/).nullable(),
  identityState: z.enum(['resolved', 'unresolved', 'conflict']), displayName: label.nullable(),
  type: z.enum(['member', 'reserve_member', 'mercenary']), status: z.enum(['pending', 'recruit', 'active']), paused: z.boolean(),
  groups: z.array(z.strictObject({ id, name: label, primary: z.boolean() })).max(100),
}).refine((row) => row.identityState === 'resolved' ? row.identityId !== null : row.identityId === null && row.discordSubject === null && row.displayName === null);

const attended = logiMemberReferenceSchema.safeExtend({ attendance: z.enum(['pending', 'acknowledged', 'confirmed']) });
export const logiRosterSummarySchema = z.strictObject({
  ...common, eventId: id, published: z.literal(true),
  squads: z.array(z.strictObject({ index: z.number().int().nonnegative(), name: label, slots: z.array(attended.safeExtend({ index: z.number().int().nonnegative() })).max(300) })).max(64),
  reserves: z.array(attended).max(300), notAttending: z.array(logiMemberReferenceSchema).max(300),
  eventParticipation: z.array(logiMemberReferenceSchema.safeExtend({ status: z.enum(['attending', 'not_attending']), completed: z.enum(['passed', 'failed']).nullable() })).max(1000),
}).refine((row) => row.squads.reduce((count, squad) => count + squad.slots.length, 0) <= 300);

const metric = z.number().finite().nonnegative().nullable();
export const logiPlayerMetricsSchema = z.strictObject({
  kills: metric, deaths: metric, combat: metric, offense: metric, defense: metric, support: metric, seconds: metric,
  cashDelta: z.number().finite().nullable(), headshots: metric, teamKills: metric, suicides: metric, vehicleKills: metric,
  longestM: metric, killStreak: metric, deathStreak: metric,
});
export const logiPlayerStatSummarySchema = z.strictObject({
  ...common, connectionId: id, source: z.literal('collected_session'), provider: z.enum(['hll_crcon', 'wardogs_warcon']), externalSessionId: id,
  startedAt: instant.nullable(), endedAt: instant.nullable(), complete: z.boolean(), fetchedAt: instant,
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), attributionCheckedAt: instant,
  players: z.array(z.strictObject({ memberId: id, identityId: id, verifiedAt: instant, metrics: logiPlayerMetricsSchema })).max(300),
  coverage: z.strictObject({ observedPlayers: z.number().int().min(0).max(300), verifiedMembers: z.number().int().min(0).max(300), unlinkedPlayers: z.number().int().min(0).max(300) }),
  eventRefs: z.array(z.strictObject({ eventId: id, resultVersion: z.number().int().positive().safe(), resultState: z.enum(['confirmed', 'corrected']) })).max(100),
}).refine((row) => row.coverage.verifiedMembers === row.players.length
  && row.coverage.verifiedMembers + row.coverage.unlinkedPlayers === row.coverage.observedPlayers
  && new Set(row.players.map((player) => player.identityId)).size === row.players.length);

export type LogiMemberSummary = z.infer<typeof logiMemberSummarySchema>;
export type LogiMemberReference = z.infer<typeof logiMemberReferenceSchema>;
export type LogiRosterSummary = z.infer<typeof logiRosterSummarySchema>;
export type LogiPlayerStatSummary = z.infer<typeof logiPlayerStatSummarySchema>;
export type LogiPlayerMetrics = z.infer<typeof logiPlayerMetricsSchema>;
