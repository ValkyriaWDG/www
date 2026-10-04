import 'server-only';
import { type Executor } from '@valkyria/db';
import { configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv } from './logi-config';
import { createLogiClient } from './logi/client';
import { LOGI_COLLECTION_RESOURCES, LOGI_PEOPLE_RESOURCES } from './logi/contracts';
import { synchronizeLogiScope, type LogiSyncOutcome } from './logi/sync';
import { createPostgresLogiSyncStore } from './logi-store';
import { markLogiHintsProcessed } from './logi-webhook';

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
    const reader = createLogiClient({ ...source, resources });
    const store = createPostgresLogiSyncStore(db, source);
    const outcome = await synchronizeLogiScope(reader, store, { resources, maxSteps: 100, ...(source.purpose === 'people' ? { fullRefreshMs: 300_000, maxRunMs: 50_000 } : {}) });
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
