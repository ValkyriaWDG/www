import { z } from 'zod';

const text = z.string().min(1).max(200);
const instant = z.iso.datetime();
const metric = z.number().finite().nonnegative().nullable();
const count = z.number().int().nonnegative().safe();
const freshness = z.enum(['fresh', 'stale', 'unavailable']);
/** Current producer `src/domain/game-data/hll-live.ts`. Never a public website DTO. */
export const hllLiveEnvelopeSchema = z.strictObject({
  connectionId: text, gameId: z.literal('hell_let_loose'), provider: z.literal('hll_crcon'),
  data: z.strictObject({
    fetchedAt: instant, statusAt: instant.nullable(), playersAt: instant.nullable(),
    statusFreshness: freshness, playersFreshness: freshness,
    refreshAfterSeconds: z.number().int().min(15).max(86400),
    status: z.strictObject({
      serverName: text, map: text.nullable(), layerId: text.nullable(), mode: text.nullable(), roundStartedAt: instant.nullable(),
      playerCount: count, maxPlayers: count,
      scores: z.array(z.strictObject({ team: z.enum(['allies', 'axis']), score: count })).max(2),
      timeRemainingSeconds: metric, environment: text.nullable().optional(), queueCount: count.nullable().optional(),
      nextMap: z.strictObject({ name: text, layerId: text.nullable(), mode: text.nullable(), environment: text.nullable() }).nullable().optional(),
    }).nullable(),
    players: z.array(z.strictObject({
      playerId: text.nullable(), name: text, team: z.enum(['allies', 'axis']).nullable(),
      kills: metric, deaths: metric, combat: metric, offense: metric, defense: metric, support: metric,
    })).max(300),
    warnings: z.array(z.enum(['status_unavailable', 'players_unavailable', 'round_unconfirmed', 'round_changed', 'stale_players'])).max(5),
  }),
});
export type HllLiveEnvelope = z.infer<typeof hllLiveEnvelopeSchema>;
export const hllLiveResponseSchema = z.strictObject({ data: hllLiveEnvelopeSchema });
