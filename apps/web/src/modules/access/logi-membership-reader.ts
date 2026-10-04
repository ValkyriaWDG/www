import type { ConfiguredLogiSource } from '@/modules/integrations/logi-config';
import { createLogiClient } from '@/modules/integrations/logi/client';
import type { LogiMembership } from '@/modules/integrations/logi/contracts';

/** Reads every game through its own restricted grant; never caches authority across requests. */
export async function readLogiMemberships(input: {
  sources: readonly ConfiguredLogiSource[];
  subject: string;
  maxAgeMs: number;
  now: () => Date;
  fetchImpl?: typeof fetch;
}): Promise<LogiMembership[]> {
  const clients = input.sources.map((source) => createLogiClient(
    { ...source, resources: ['membership-summaries'], timeoutMs: 4_000 },
    { fetchImpl: input.fetchImpl, now: () => input.now().getTime() },
  ));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const read = (index: number) => clients[index]!.membership(input.subject, input.maxAgeMs, { signal: controller.signal });
  try {
    const values = await Promise.all(clients.map((_, index) => read(index)));
    // Logi shares its Discord-member refresh lease across game grants. A sibling
    // request may return HTTP 200/unknown while the other refreshes that member.
    // Wait for the first round, then recheck only unknown observations once using
    // the same game/key/freshness constraint. HTTP errors never enter this retry.
    return await Promise.all(values.map((value, index) => value.state === 'unknown' ? read(index) : value));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
