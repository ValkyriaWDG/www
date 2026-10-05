import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LogiClientError, type LogiErrorCode, type LogiReader } from './client';
import {
  LOGI_ALL_COLLECTION_RESOURCES, compareLogiRevisions, logiCursorSchema, logiScopeSchema,
  type LogiChange, type LogiCollectionResource, type LogiScope, type LogiSyncRecord,
} from './contracts';

const MAX_BOOTSTRAP_AGE_MS = 30 * 60_000;

export type LogiSyncScope = LogiScope & { resources: readonly LogiCollectionResource[] };
export const logiSyncCheckpointSchema = z.strictObject({
  version: z.number().int().positive().safe(),
  mode: z.enum(['bootstrap', 'replay', 'live']),
  generation: z.string().min(1).max(128).nullable(),
  resourceIndex: z.number().int().nonnegative().max(LOGI_ALL_COLLECTION_RESOURCES.length),
  listCursor: logiCursorSchema.nullable(),
  boundaryCursor: logiCursorSchema,
  cursor: logiCursorSchema,
  /** Capture time of this full rebuild; absent on checkpoints written by older runners. */
  bootstrapStartedAt: z.iso.datetime().optional(),
  /** Full generation completion, not an idle incremental pull or a source observation. */
  reconciledAt: z.iso.datetime().optional(),
}).refine((value) => (value.mode === 'live') === (value.generation === null));
export type LogiSyncCheckpoint = z.infer<typeof logiSyncCheckpointSchema>;
export type LogiSyncLease = { token: string; checkpoint: LogiSyncCheckpoint | null };
export type LogiSyncCommit = {
  expectedVersion: number;
  next: LogiSyncCheckpoint;
  records: LogiSyncRecord<LogiCollectionResource>[];
  /** null = active projections; otherwise an isolated rebuild, invisible to readers. */
  targetGeneration: string | null;
  /** Atomically replace active operational projections with this completed generation. */
  promoteGeneration: string | null;
  observedAt: string;
};

/**
 * Persistence is injected. Implement acquire/commit/release in database transactions.
 * Commit must check lease token + expiry and checkpoint CAS, apply only strictly newer
 * decimal revisions, retain remove tombstones, then advance checkpoint atomically.
 * Promotion replaces the operational projection set only; preserve editorial approval,
 * identity mappings, consent and outbox records. Partial generations never become public.
 */
export interface LogiSyncStore {
  acquire(scope: LogiSyncScope, nowMs: number, leaseMs: number): Promise<LogiSyncLease | null>;
  commit(lease: LogiSyncLease, input: LogiSyncCommit): Promise<boolean>;
  release(lease: LogiSyncLease): Promise<void>;
}

export type LogiSyncOutcome = {
  state: 'busy' | 'caught_up' | 'pending' | 'failed' | 'lease_lost';
  committedPages: number;
  records: number;
  reset: boolean;
  error: LogiErrorCode | 'persistence' | null;
  retryAfterMs: number | null;
};

export function logiSyncScopeKey(scope: LogiSyncScope): string {
  logiScopeSchema.parse({ sourceInstanceId: scope.sourceInstanceId, guildId: scope.guildId, gameId: scope.gameId });
  if (!scope.resources.length || new Set(scope.resources).size !== scope.resources.length
    || scope.resources.some((resource) => !LOGI_ALL_COLLECTION_RESOURCES.includes(resource))) throw new LogiClientError('configuration');
  return JSON.stringify([scope.sourceInstanceId, scope.guildId, scope.gameId, [...scope.resources].sort()]);
}

/** Deduplicate within a page without converting revisions to lossy Number values. */
export function coalesceLogiRecords<T extends LogiChange>(records: readonly T[]): T[] {
  const result = new Map<string, T>();
  for (const record of records) {
    const key = JSON.stringify([record.guildId, record.gameId, record.resource, record.id]);
    const previous = result.get(key);
    if (!previous || compareLogiRevisions(record.revision, previous.revision) > 0) result.set(key, record);
  }
  return [...result.values()];
}

/**
 * Capture boundary → resumable full lists → atomic refetches → replay → promote.
 * The list itself has no revision and is only an identity discovery mechanism.
 * Empty pages with a continuation are not completion; a 410 starts another shadow
 * rebuild. There is no webhook payload trust or inferred deletion from partial lists.
 */
export async function synchronizeLogiScope(reader: LogiReader, store: LogiSyncStore, options: {
  resources?: readonly LogiCollectionResource[];
  maxSteps?: number;
  maxRunMs?: number;
  leaseMs?: number;
  now?: () => number;
  newGeneration?: () => string;
  /** Revalidate identity joins even when no item-change hint was produced. */
  fullRefreshMs?: number;
} = {}): Promise<LogiSyncOutcome> {
  const resources = [...(options.resources ?? reader.resources.filter((resource): resource is LogiCollectionResource => resource !== 'membership-summaries'))].sort();
  const scope: LogiSyncScope = { ...reader.scope, resources };
  logiSyncScopeKey(scope);
  if (resources.some((resource) => !reader.resources.includes(resource))) throw new LogiClientError('configuration');
  const now = options.now ?? Date.now;
  const newGeneration = options.newGeneration ?? randomUUID;
  const maxSteps = options.maxSteps ?? 8;
  const maxRunMs = options.maxRunMs ?? 25_000;
  const leaseMs = options.leaseMs ?? 60_000;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100
    || !Number.isInteger(maxRunMs) || maxRunMs < 1 || maxRunMs > 50_000
    || !Number.isInteger(leaseMs) || leaseMs <= maxRunMs || leaseMs > 300_000
    || options.fullRefreshMs !== undefined && (!Number.isInteger(options.fullRefreshMs) || options.fullRefreshMs < 1)) throw new LogiClientError('configuration');
  const outcome: LogiSyncOutcome = { state: 'pending', committedPages: 0, records: 0, reset: false, error: null, retryAfterMs: null };
  const acquired = await store.acquire(scope, now(), leaseMs);
  if (!acquired) return { ...outcome, state: 'busy' };
  const lease: LogiSyncLease = acquired;
  const signal = AbortSignal.timeout(maxRunMs);
  let checkpoint: LogiSyncCheckpoint | null = null;
  let changeScanLimit = 10;

  async function refetch<T>(items: readonly T[], read: (item: T) => Promise<LogiSyncRecord<LogiCollectionResource> | null>): Promise<LogiSyncRecord<LogiCollectionResource>[]> {
    const records: LogiSyncRecord<LogiCollectionResource>[] = [];
    // Bounded concurrency keeps a 10-row page within the request/run budget.
    for (let offset = 0; offset < items.length; offset += 4) {
      const batch = await Promise.all(items.slice(offset, offset + 4).map(read));
      for (const record of batch) if (record !== null) records.push(record);
    }
    return records;
  }

  async function commit(next: LogiSyncCheckpoint, records: LogiSyncRecord<LogiCollectionResource>[] = [], promoteGeneration: string | null = null): Promise<boolean> {
    logiSyncCheckpointSchema.parse(next);
    if (signal.aborted) return false;
    const unique = coalesceLogiRecords(records);
    const accepted = await store.commit(lease, {
      expectedVersion: checkpoint?.version ?? 0,
      next,
      records: unique,
      targetGeneration: promoteGeneration ?? next.generation,
      promoteGeneration,
      observedAt: new Date(now()).toISOString(),
    });
    if (!accepted) outcome.state = 'lease_lost';
    else { checkpoint = next; outcome.committedPages++; outcome.records += unique.length; }
    return accepted;
  }

  async function beginBootstrap(): Promise<boolean> {
    changeScanLimit = 10;
    const bootstrapStartedAt = new Date(now()).toISOString();
    const page = await reader.startChanges(resources, { signal });
    const next: LogiSyncCheckpoint = {
      version: (checkpoint?.version ?? 0) + 1, mode: 'bootstrap', generation: newGeneration(),
      resourceIndex: 0, listCursor: null, boundaryCursor: page.page.nextCursor, cursor: page.page.nextCursor,
      bootstrapStartedAt,
    };
    return commit(next);
  }

  try {
    checkpoint = lease.checkpoint === null ? null : logiSyncCheckpointSchema.parse(lease.checkpoint);
    for (let step = 0; step < maxSteps && !signal.aborted; step++) {
      if (!checkpoint) {
        if (!await beginBootstrap()) return outcome;
        continue;
      }
      // Copy narrows the local value; commit advances the captured checkpoint.
      const current: LogiSyncCheckpoint = checkpoint;
      // A stalled initial sweep need not replay an unbounded old guild backlog.
      // Replace only the invisible generation and repeat every baseline read from
      // a fresh pre-list boundary. Legacy incomplete checkpoints renew once because
      // their capture age is unknown; live checkpoints are never reset by this rule.
      if (current.mode !== 'live' && (!current.bootstrapStartedAt
        || now() - Date.parse(current.bootstrapStartedAt) >= MAX_BOOTSTRAP_AGE_MS)) {
        outcome.reset = true;
        if (!await beginBootstrap()) return outcome;
        continue;
      }
      if (current.mode === 'live' && options.fullRefreshMs !== undefined
        && (!current.reconciledAt || now() - Date.parse(current.reconciledAt) >= options.fullRefreshMs)) {
        if (!await beginBootstrap()) return outcome;
        continue;
      }
      try {
        if (current.mode === 'bootstrap') {
          const resource = resources[current.resourceIndex];
          if (!resource) throw new LogiClientError('invalid_response');
          const page = await reader.list(resource, { cursor: current.listCursor, limit: 10, signal });
          if (page.page.nextCursor && page.page.nextCursor === current.listCursor) throw new LogiClientError('invalid_response');
          const records = await refetch(page.data, async (item) => {
            try { return await reader.syncRecord(resource, item.id, { signal }); }
            catch (error) {
              // An identity discovered in a baseline can move/delete before refetch.
              // Its change is covered by the captured boundary. Never invent a tombstone.
              if (!(error instanceof LogiClientError && error.code === 'not_found')) throw error;
              return null;
            }
          });
          const resourceIndex = page.page.nextCursor === null ? current.resourceIndex + 1 : current.resourceIndex;
          if (!await commit({
            ...current, version: current.version + 1, resourceIndex, listCursor: page.page.nextCursor,
            mode: resourceIndex === resources.length ? 'replay' : 'bootstrap',
          }, records)) return outcome;
          continue;
        }
        let page = await reader.changes(resources, current.cursor, { signal, limit: changeScanLimit });
        let identities = coalesceLogiRecords(page.data);
        // The producer limits scanned guild rows before filtering game/resources.
        // Repeated hints for one identity need only one authoritative refetch at
        // least as new as its highest hint. Keep that work at ten identities even
        // when the scan contains 100 rows. A denser page is reread without advancing.
        if (identities.length > 10) {
          changeScanLimit = 10;
          page = await reader.changes(resources, current.cursor, { signal, limit: changeScanLimit });
          identities = coalesceLogiRecords(page.data);
          if (identities.length > 10) throw new LogiClientError('invalid_response');
        } else if (identities.length < 10 && page.page.hasMore) {
          changeScanLimit = 100;
        }
        if (page.page.hasMore && page.page.nextCursor === current.cursor) throw new LogiClientError('invalid_response');
        const records = await refetch(identities, async (hint) => {
          const record = await reader.syncRecord(hint.resource as LogiCollectionResource, hint.id, { signal });
          if (compareLogiRevisions(record.revision, hint.revision) < 0) throw new LogiClientError('invalid_response');
          return record;
        });
        const promote = current.mode === 'replay' && !page.page.hasMore ? current.generation : null;
        if (!await commit({
          ...current, version: current.version + 1, cursor: page.page.nextCursor,
          mode: promote ? 'live' : current.mode, generation: promote ? null : current.generation,
          ...(promote ? { reconciledAt: new Date(now()).toISOString() } : {}),
        }, records, promote)) return outcome;
        if (!page.page.hasMore) return { ...outcome, state: 'caught_up' };
      } catch (error) {
        // People dependency changes invalidate collection cursors as well as the
        // change feed. Restart the whole shadow generation, never that page alone.
        if (!(error instanceof LogiClientError && (error.code === 'reset_required'
          || current.mode !== 'bootstrap' && error.code === 'not_found'))) throw error;
        outcome.reset = true;
        if (!await beginBootstrap()) return outcome;
      }
    }
    return outcome;
  } catch (error) {
    // A cooperative run deadline leaves the last committed checkpoint resumable.
    // Keep request timeouts inside the run budget as actual transport failures.
    if (signal.aborted && error instanceof LogiClientError && error.code === 'timeout') return outcome;
    return { ...outcome, state: 'failed', error: error instanceof LogiClientError ? error.code : 'persistence', retryAfterMs: error instanceof LogiClientError ? error.retryAfterMs : null };
  } finally {
    await store.release(lease);
  }
}
