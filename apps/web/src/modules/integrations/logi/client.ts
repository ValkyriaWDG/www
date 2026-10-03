import 'server-only';
import { z } from 'zod';
import { createLogiTransport, LogiClientError, type LogiFetch, type LogiRequestOptions, type LogiTransportConfig } from './transport';

import {
  LOGI_RESOURCES, LOGI_PEOPLE_RESOURCES, logiChangesPageSchema, logiChangeSchema, logiCursorSchema, logiIdSchema,
  logiResourceSchemas, logiScopeSchema,
  type LogiChangesPage, type LogiCollectionPage, type LogiCollectionResource,
  type LogiMembership, type LogiResource, type LogiScope, type LogiSyncRecord,
} from './contracts';

export { LogiClientError, logiRetryAfterMs, validateLogiOrigin, type LogiErrorCode, type LogiFetch, type LogiRequestOptions } from './transport';

/** Tolerated provider clock lead for membership observations. */
export const LOGI_CLOCK_SKEW_MS = 5_000;
export interface LogiReader {
  readonly scope: LogiScope;
  readonly resources: readonly LogiResource[];
  list<R extends LogiCollectionResource>(resource: R, input?: { cursor?: string | null; limit?: number } & LogiRequestOptions): Promise<LogiCollectionPage<R>>;
  startChanges(resources: readonly LogiCollectionResource[], options?: LogiRequestOptions): Promise<LogiChangesPage>;
  changes(resources: readonly LogiCollectionResource[], cursor: string, options?: LogiRequestOptions): Promise<LogiChangesPage>;
  syncRecord<R extends LogiCollectionResource>(resource: R, id: string, options?: LogiRequestOptions): Promise<LogiSyncRecord<R>>;
  membership(discordUserId: string, maxAgeMs?: number, options?: LogiRequestOptions): Promise<LogiMembership>;
}

export type LogiClientConfig = LogiScope & Omit<LogiTransportConfig, 'gameId'> & { resources: readonly LogiResource[] };

function invalid(): never { throw new LogiClientError('invalid_response'); }
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : invalid();
}
function checkedId(input: string): string {
  const result = logiIdSchema.safeParse(input);
  if (!result.success) throw new LogiClientError('configuration');
  return result.data;
}
function checkedCursor(input: string): string {
  const result = logiCursorSchema.safeParse(input);
  if (!result.success) throw new LogiClientError('configuration');
  return result.data;
}
function assertScope(data: { guildId: string; gameId: string }, scope: LogiScope): void {
  if (data.guildId !== scope.guildId || data.gameId !== scope.gameId) throw new LogiClientError('scope_mismatch');
  if ('provider' in data && ((data.provider === 'hll_crcon') !== (scope.gameId === 'hell_let_loose'))) throw new LogiClientError('scope_mismatch');
}

export function createLogiClient(config: LogiClientConfig, dependencies: { fetchImpl?: LogiFetch; now?: () => number } = {}): LogiReader {
  const scopeResult = logiScopeSchema.safeParse({ sourceInstanceId: config.sourceInstanceId, guildId: config.guildId, gameId: config.gameId });
  if (!scopeResult.success || !/^[\x21-\x7e]{16,1024}$/.test(config.apiKey)
    || !Array.isArray(config.resources) || config.resources.length === 0 || config.resources.some((resource) => !LOGI_RESOURCES.includes(resource))
    || new Set(config.resources).size !== config.resources.length) throw new LogiClientError('configuration');
  const scope = Object.freeze(scopeResult.data);
  const resources = Object.freeze([...config.resources]);
  const transport = createLogiTransport({ ...config, gameId: scope.gameId }, dependencies);
  const now = dependencies.now ?? Date.now;
  const permitted = (resource: LogiResource) => { if (!resources.includes(resource)) throw new LogiClientError('forbidden'); };
  const get = transport.get;

  async function changePage(selected: readonly LogiCollectionResource[], cursor: string | null, options?: LogiRequestOptions): Promise<LogiChangesPage> {
    if (selected.length === 0 || new Set(selected).size !== selected.length) throw new LogiClientError('configuration');
    selected.forEach(permitted);
    const query = { resources: [...selected].sort().join(','), limit: '10', ...(cursor === null ? { start: 'now' } : { cursor: checkedCursor(cursor) }) };
    const page = parse(logiChangesPageSchema, await get('changes', query, options));
    for (const change of page.data) {
      assertScope(change, scope);
      if (!(selected as readonly string[]).includes(change.resource)) throw new LogiClientError('scope_mismatch');
    }
    if (cursor === null && (page.data.length > 0 || page.page.hasMore)) invalid();
    return page;
  }

  return {
    scope, resources,
    async list<R extends LogiCollectionResource>(resource: R, input: { cursor?: string | null; limit?: number } & LogiRequestOptions = {}): Promise<LogiCollectionPage<R>> {
      permitted(resource);
      const people = (LOGI_PEOPLE_RESOURCES as readonly string[]).includes(resource);
      const limit = input.limit ?? (people ? 10 : 25);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new LogiClientError('configuration');
      if (people && limit > 10) throw new LogiClientError('configuration');
      const query = { limit: String(limit), ...(input.cursor ? { cursor: checkedCursor(input.cursor) } : {}) };
      const schema = z.strictObject({ data: z.array(logiResourceSchemas[resource]).max(limit), page: z.strictObject({ nextCursor: logiCursorSchema.nullable(), limit: people ? z.number().int().min(1).max(limit) : z.literal(limit) }) })
        .refine((value) => value.data.length <= value.page.limit);
      const page = parse(schema, await get(resource, query, input));
      page.data.forEach((row) => assertScope(row, scope));
      return page as LogiCollectionPage<R>;
    },
    startChanges: (selected, options) => changePage(selected, null, options),
    changes: (selected, cursor, options) => changePage(selected, cursor, options),
    async syncRecord<R extends LogiCollectionResource>(resource: R, id: string, options?: LogiRequestOptions): Promise<LogiSyncRecord<R>> {
      permitted(resource);
      checkedId(id);
      const envelope = parse(z.strictObject({ data: logiChangeSchema.extend({ data: z.unknown() }) }), await get(`sync-records/${resource}/${encodeURIComponent(id)}`, {}, options));
      const value = envelope.data;
      assertScope(value, scope);
      if (value.resource !== resource || value.id !== id) throw new LogiClientError('scope_mismatch');
      if (value.operation === 'remove') {
        if (value.data !== null) invalid();
      } else {
        const result = logiResourceSchemas[resource].safeParse(value.data);
        if (!result.success) invalid();
        const data = result.data;
        assertScope(data, scope);
        if (data.id !== id) throw new LogiClientError('scope_mismatch');
        value.data = data;
      }
      return value as LogiSyncRecord<R>;
    },
    async membership(discordUserId, maxAgeMs = 60_000, options) {
      permitted('membership-summaries');
      if (!/^[0-9]{17,20}$/.test(discordUserId) || !Number.isInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 300_000) throw new LogiClientError('configuration');
      const envelope = parse(z.strictObject({ data: logiResourceSchemas['membership-summaries'] }), await get(`membership-summaries/${discordUserId}`, { maxAgeMs: String(maxAgeMs) }, options));
      assertScope(envelope.data, scope);
      if (envelope.data.discordUserId !== discordUserId) throw new LogiClientError('scope_mismatch');
      const observed = envelope.data.observedAt ? Date.parse(envelope.data.observedAt) : NaN;
      const age = now() - observed;
      // receivedAt and transport success cannot refresh authorization evidence. A
      // provider clock slightly ahead of ours is tolerated, as in the stored check.
      return !Number.isFinite(age) || age < -LOGI_CLOCK_SKEW_MS || age > maxAgeMs
        ? { ...envelope.data, state: 'unknown', completeness: 'unavailable', roleIds: [] }
        : envelope.data;
    },
  };
}
