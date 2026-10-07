import 'server-only';
import { type Executor } from '@valkyria/db';
import { configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv } from './logi-config';
import { createLogiClient } from './logi/client';
import { LOGI_COLLECTION_RESOURCES, LOGI_PEOPLE_RESOURCES } from './logi/contracts';
import { paceLogiReader } from './logi/paced-reader';
import { synchronizeLogiScope, type LogiSyncOutcome } from './logi/sync';
import { createPostgresLogiSyncStore } from './logi-store';
import { markLogiHintsProcessed } from './logi-webhook';

/**
 * How often a live scope rebuilds its baseline. Logi keeps no replay log since
 * 7 October 2026 (every change cursor is 410), so this rebuild is how the website
 * sees changes; a webhook hint does not shorten it. Data stays within the 15-minute
 * public revalidation limit; people keep the five-minute reconciliation that
 * `PEOPLE_FRESH_MS` requires.
 */
export const LOGI_DATA_FULL_REFRESH_MS = 10 * 60_000;
export const LOGI_PEOPLE_FULL_REFRESH_MS = 5 * 60_000;

/** One bounded pass; overlapping callers are fenced by PostgreSQL. */
export async function runLogiSync(db: Executor, env: LogiIntegrationEnv): Promise<LogiSyncOutcome[]> {
  const outcomes: LogiSyncOutcome[] = [];
  const sources: ConfiguredLogiSource[] = [];
  let configurationFailure = false;
  for (const purpose of ['data', 'people'] as const) {
    try { sources.push(...configuredLogiSources(env, purpose)); }
    catch {
      configurationFailure = true;
      outcomes.push({ state: 'failed', committedPages: 0, records: 0, reset: false, error: 'configuration', retryAfterMs: null });
    }
  }
  const sourceOutcomes: LogiSyncOutcome[] = [];
  const startedAt = new Date();
  for (const source of sources) {
    const resources = source.purpose === 'people' ? LOGI_PEOPLE_RESOURCES : LOGI_COLLECTION_RESOURCES;
    const reader = paceLogiReader(createLogiClient({ ...source, resources }));
    const store = createPostgresLogiSyncStore(db, source);
    const outcome = await synchronizeLogiScope(reader, store, { resources, maxSteps: 100, ...(source.purpose === 'people' ? { fullRefreshMs: LOGI_PEOPLE_FULL_REFRESH_MS, maxRunMs: 50_000 } : { fullRefreshMs: LOGI_DATA_FULL_REFRESH_MS }) });
    outcomes.push(outcome);
    sourceOutcomes.push(outcome);
    if (outcome.state === 'failed') {
      await store.recordFailure(outcome.error ?? 'unavailable', outcome.retryAfterMs ?? 30_000);
    }
  }
  const bindings = new Map(sources.map((source) => [JSON.stringify([source.sourceInstanceId, source.guildId]), source]));
  for (const binding of bindings.values()) {
    if (!configurationFailure && sources.every((source, index) => source.sourceInstanceId !== binding.sourceInstanceId || source.guildId !== binding.guildId || sourceOutcomes[index]?.state === 'caught_up')) {
      await markLogiHintsProcessed(db, binding.sourceInstanceId, binding.guildId, startedAt);
    }
  }
  return outcomes;
}
