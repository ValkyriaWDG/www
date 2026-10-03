import 'server-only';
import { randomUUID } from 'node:crypto';
import { logiProjection, logiSyncScope, type Executor } from '@valkyria/db';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { ConfiguredLogiSource } from './logi-config';
import { LOGI_COLLECTION_RESOURCES, LOGI_PEOPLE_RESOURCES, logiResourceSchemas, logiRevisionSchema, type LogiCollectionResource } from './logi/contracts';
import { logiSyncCheckpointSchema, type LogiSyncStore } from './logi/sync';

/** Stores one configured scope; callers cannot repoint a lease to another source/key/game. */
export function createPostgresLogiSyncStore(db: Executor, source: ConfiguredLogiSource, now: () => number = Date.now): LogiSyncStore & { recordFailure(code: string, retryAfterMs: number): Promise<void> } {
  const key = source.scopeKey;
  const resources: readonly LogiCollectionResource[] = source.purpose === 'people' ? LOGI_PEOPLE_RESOURCES : LOGI_COLLECTION_RESOURCES;
  if (source.purpose !== 'people' && source.purpose !== 'data') throw new Error('Invalid sync source purpose.');
  let lastToken: string | null = null;
  return {
    async acquire(scope, _at, leaseMs) {
      if (scope.guildId !== source.guildId || scope.gameId !== source.gameId || scope.sourceInstanceId !== source.sourceInstanceId || leaseMs < 1 || leaseMs > 120_000
        || JSON.stringify([...scope.resources].sort()) !== JSON.stringify([...resources].sort())) throw new Error('Invalid sync scope.');
      return db.transaction(async (tx) => {
        await tx.insert(logiSyncScope).values({ scopeKey: key, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId }).onConflictDoNothing();
        const [row] = await tx.select().from(logiSyncScope).where(eq(logiSyncScope.scopeKey, key)).for('update');
        const at = new Date(now());
        if (!row || (row.leaseExpiresAt && row.leaseExpiresAt > at) || (row.nextAttemptAt && row.nextAttemptAt > at)) return null;
        const checkpoint = row.checkpoint ? logiSyncCheckpointSchema.parse(row.checkpoint) : null;
        if (row.version !== (checkpoint?.version ?? 0)) throw new Error('Invalid sync checkpoint.');
        const token = randomUUID();
        lastToken = token;
        await tx.update(logiSyncScope).set({ leaseToken: token, leaseExpiresAt: new Date(at.getTime() + leaseMs), lastAttemptAt: at, updatedAt: at }).where(eq(logiSyncScope.scopeKey, key));
        return { token, checkpoint };
      });
    },
    async commit(lease, input) {
      const next = logiSyncCheckpointSchema.parse(input.next);
      if (next.version !== input.expectedVersion + 1 || !Number.isFinite(Date.parse(input.observedAt))) throw new Error('Invalid sync commit.');
      for (const row of input.records) {
        logiRevisionSchema.parse(row.revision);
        if (row.guildId !== source.guildId || row.gameId !== source.gameId || !resources.includes(row.resource)
          || !['upsert', 'remove'].includes(row.operation) || (row.operation === 'remove' && row.data !== null)) throw new Error('Invalid projection scope.');
        if (row.operation === 'upsert') {
          const value = logiResourceSchemas[row.resource].parse(row.data);
          if (value.id !== row.id || value.guildId !== row.guildId || value.gameId !== row.gameId) throw new Error('Invalid projection identity.');
        }
      }
      return db.transaction(async (tx) => {
        const [state] = await tx.select().from(logiSyncScope).where(eq(logiSyncScope.scopeKey, key)).for('update');
        const at = new Date(now());
        if (!state || state.leaseToken !== lease.token || !state.leaseExpiresAt || state.leaseExpiresAt <= at || state.version !== input.expectedVersion) return false;
        const generation = input.targetGeneration ?? state.activeGeneration;
        if (input.records.length && !generation) throw new Error('Missing projection generation.');
        if (generation) for (const record of input.records) {
          await tx.insert(logiProjection).values({ scopeKey: key, generation, resource: record.resource, externalId: record.id, revision: record.revision, operation: record.operation, data: record.data, observedAt: new Date(input.observedAt) }).onConflictDoUpdate({
            target: [logiProjection.scopeKey, logiProjection.generation, logiProjection.resource, logiProjection.externalId],
            set: { revision: sql`excluded.revision`, operation: sql`excluded.operation`, data: sql`excluded.data`, observedAt: sql`excluded.observed_at` },
            setWhere: sql`excluded.revision::numeric > ${logiProjection.revision}::numeric`,
          });
        }
        if (input.promoteGeneration) {
          if (next.mode !== 'live' || input.targetGeneration !== input.promoteGeneration) throw new Error('Invalid generation promotion.');
          await tx.delete(logiProjection).where(and(eq(logiProjection.scopeKey, key), ne(logiProjection.generation, input.promoteGeneration)));
        }
        await tx.update(logiSyncScope).set({ checkpoint: next, version: next.version, ...(input.promoteGeneration ? { activeGeneration: input.promoteGeneration } : {}), lastSuccessAt: next.mode === 'live' ? at : state.lastSuccessAt, nextAttemptAt: null, errorCode: null, updatedAt: at }).where(eq(logiSyncScope.scopeKey, key));
        return true;
      });
    },
    async release(lease) {
      // Keep the attempt token so a delayed failure cannot overwrite a newer run's health.
      await db.update(logiSyncScope).set({ leaseExpiresAt: null }).where(and(eq(logiSyncScope.scopeKey, key), eq(logiSyncScope.leaseToken, lease.token)));
    },
    async recordFailure(code, retryAfterMs) {
      if (!lastToken) return;
      await db.update(logiSyncScope).set({ errorCode: code, nextAttemptAt: new Date(now() + Math.max(30_000, Math.min(retryAfterMs, 86_400_000))) })
        .where(and(eq(logiSyncScope.scopeKey, key), eq(logiSyncScope.leaseToken, lastToken), isNull(logiSyncScope.leaseExpiresAt)));
    },
  };
}

export async function readActiveLogiProjections(db: Executor, source: ConfiguredLogiSource) {
  const limit = source.purpose === 'people' ? 1_000 : 10_000;
  // Evaluate the generation budget in PostgreSQL before returning any personal JSON.
  // The window sees the whole selected generation even when the outer result is bounded.
  const withinBudget = source.purpose === 'people'
    ? sql<boolean>`count(*) over () <= ${limit} and coalesce(sum(octet_length(${logiProjection.data}::text)) over (), 0) <= ${16 * 1024 * 1024}`
    : sql<boolean>`true`;
  const rows = await db.select({ resource: logiProjection.resource, externalId: logiProjection.externalId, revision: logiProjection.revision, operation: logiProjection.operation,
    data: sql<(typeof logiProjection.$inferSelect)['data']>`case when ${withinBudget} then ${logiProjection.data} else null end`, withinBudget,
    observedAt: logiProjection.observedAt, lastSuccessAt: logiSyncScope.lastSuccessAt, checkpoint: logiSyncScope.checkpoint, errorCode: logiSyncScope.errorCode })
    .from(logiProjection).innerJoin(logiSyncScope, and(eq(logiSyncScope.scopeKey, logiProjection.scopeKey), eq(logiSyncScope.activeGeneration, logiProjection.generation)))
    .where(eq(logiProjection.scopeKey, source.scopeKey)).limit(limit + 1);
  // Fail closed at the bounded single-guild capacity; never publish a silently truncated set.
  if (rows.length > limit || rows.some((row) => !row.withinBudget)) throw new Error('Logi projection capacity exceeded.');
  return rows;
}

/** Used with active projections; raw checkpoints and grant keys never become browser DTOs. */
export async function readLogiProjectionState(db: Executor, source: ConfiguredLogiSource) {
  const [row] = await db.select({ activeGeneration: logiSyncScope.activeGeneration, checkpoint: logiSyncScope.checkpoint, lastSuccessAt: logiSyncScope.lastSuccessAt, errorCode: logiSyncScope.errorCode })
    .from(logiSyncScope).where(and(eq(logiSyncScope.scopeKey, source.scopeKey), eq(logiSyncScope.sourceInstanceId, source.sourceInstanceId), eq(logiSyncScope.guildId, source.guildId), eq(logiSyncScope.gameId, source.gameId))).limit(1);
  return row ?? null;
}
