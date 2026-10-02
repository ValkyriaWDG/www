import 'server-only';
import { type Executor } from '@valkyria/db';
import { configuredLogiSources, type LogiIntegrationEnv } from './logi-config';
import { createLogiClient } from './logi/client';
import { LOGI_COLLECTION_RESOURCES } from './logi/contracts';
import { synchronizeLogiScope, type LogiSyncOutcome } from './logi/sync';
import { createPostgresLogiSyncStore } from './logi-store';
import { markLogiHintsProcessed } from './logi-webhook';

/** One bounded pass; overlapping callers are fenced by PostgreSQL. */
export async function runLogiSync(db: Executor, env: LogiIntegrationEnv): Promise<LogiSyncOutcome[]> {
  const outcomes: LogiSyncOutcome[] = [];
  const sources = configuredLogiSources(env, 'data');
  const startedAt = new Date();
  for (const source of sources) {
    const reader = createLogiClient({ ...source, resources: LOGI_COLLECTION_RESOURCES });
    const store = createPostgresLogiSyncStore(db, source);
    const outcome = await synchronizeLogiScope(reader, store, { resources: LOGI_COLLECTION_RESOURCES });
    outcomes.push(outcome);
    if (outcome.state === 'failed') {
      await store.recordFailure(outcome.error ?? 'unavailable', outcome.retryAfterMs ?? 30_000);
    }
  }
  const bindings = new Map(sources.map((source) => [JSON.stringify([source.sourceInstanceId, source.guildId]), source]));
  for (const binding of bindings.values()) {
    if (sources.every((source, index) => source.sourceInstanceId !== binding.sourceInstanceId || source.guildId !== binding.guildId || outcomes[index]?.state === 'caught_up')) {
      await markLogiHintsProcessed(db, binding.sourceInstanceId, binding.guildId, startedAt);
    }
  }
  return outcomes;
}
