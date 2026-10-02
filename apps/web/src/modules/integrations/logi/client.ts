import 'server-only';
import { z } from 'zod';
import {
  LOGI_RESOURCES, logiChangesPageSchema, logiChangeSchema, logiCursorSchema, logiIdSchema,
  logiResourceSchemas, logiScopeSchema,
  type LogiChangesPage, type LogiCollectionPage, type LogiCollectionResource,
  type LogiMembership, type LogiResource, type LogiScope, type LogiSyncRecord,
} from './contracts';

export type LogiErrorCode = 'configuration' | 'unauthorized' | 'forbidden' | 'not_found' | 'reset_required' | 'rate_limited' | 'upstream' | 'network' | 'timeout' | 'invalid_response' | 'redirect' | 'scope_mismatch' | 'unknown_outcome';

/** Stable categories only: never retain a response body, URL, bearer key or fetch error. */
export class LogiClientError extends Error {
  constructor(readonly code: LogiErrorCode, readonly retryAfterMs: number | null = null) {
    super(`Logi request failed: ${code}`);
    this.name = 'LogiClientError';
  }
}

export type LogiRequestOptions = { signal?: AbortSignal };
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

export type LogiClientConfig = LogiScope & {
  /** Origin only. The API path is fixed by this adapter, not by user input. */
  origin: string;
  apiKey: string;
  resources: readonly LogiResource[];
  /** Test/development only; accepts exact loopback hosts, never arbitrary HTTP. */
  allowLoopbackHttp?: boolean;
  environment?: 'production' | 'development' | 'test';
  timeoutMs?: number;
  maxBodyBytes?: number;
};
export type LogiFetch = (input: string, init: RequestInit) => Promise<Response>;

export function validateLogiOrigin(value: string, input: Pick<LogiClientConfig, 'allowLoopbackHttp' | 'environment'> = {}): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new LogiClientError('configuration'); }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  const environment = input.environment ?? process.env.NODE_ENV ?? 'production';
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && input.allowLoopbackHttp === true && environment !== 'production'))
    || (loopback && (environment === 'production' || !input.allowLoopbackHttp))) throw new LogiClientError('configuration');
  return url.origin;
}

export function logiRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1000;
    return Number.isSafeInteger(Math.ceil(milliseconds)) ? Math.ceil(milliseconds) : null;
  }
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

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

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new LogiClientError('timeout'));
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new LogiClientError('timeout'));
    signal.addEventListener('abort', aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function boundedJson(response: Response, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) invalid();
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) invalid();
  if (!response.body) invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await abortable(reader.read(), signal);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) invalid();
      chunks.push(next.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown; } catch { return invalid(); }
  } finally {
    // Do not await an untrusted stalled stream cancellation.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createLogiClient(config: LogiClientConfig, dependencies: { fetchImpl?: LogiFetch; now?: () => number } = {}): LogiReader {
  const scopeResult = logiScopeSchema.safeParse({ sourceInstanceId: config.sourceInstanceId, guildId: config.guildId, gameId: config.gameId });
  if (!scopeResult.success || !/^[\x21-\x7e]{16,1024}$/.test(config.apiKey)
    || !Array.isArray(config.resources) || config.resources.length === 0 || config.resources.some((resource) => !LOGI_RESOURCES.includes(resource))
    || new Set(config.resources).size !== config.resources.length) throw new LogiClientError('configuration');
  const scope = Object.freeze(scopeResult.data);
  const resources = Object.freeze([...config.resources]);
  const origin = validateLogiOrigin(config.origin, config);
  const apiKey = config.apiKey;
  const timeoutMs = config.timeoutMs ?? 5000;
  const maxBytes = config.maxBodyBytes ?? 2 * 1024 * 1024;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000 || !Number.isInteger(maxBytes) || maxBytes < 64 || maxBytes > 2 * 1024 * 1024) throw new LogiClientError('configuration');
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  const permitted = (resource: LogiResource) => { if (!resources.includes(resource)) throw new LogiClientError('forbidden'); };

  async function get(path: string, query: Record<string, string>, options: LogiRequestOptions = {}): Promise<unknown> {
    const url = new URL(`/api/v1/clan/${path}`, origin);
    url.search = new URLSearchParams({ ...query, game: scope.gameId }).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) throw new LogiClientError('timeout');
      const response = await abortable(fetchImpl(url.href, {
        method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'User-Agent': 'Valkyria-Web-Logi/1.0' },
        redirect: 'manual', cache: 'no-store', credentials: 'omit', signal: controller.signal,
      }), controller.signal);
      if (response.status >= 300 && response.status < 400 || response.redirected || response.url && response.url !== url.href) throw new LogiClientError('redirect');
      if (response.status === 401) throw new LogiClientError('unauthorized');
      if (response.status === 403) throw new LogiClientError('forbidden');
      if (response.status === 404) throw new LogiClientError('not_found');
      if (response.status === 410) throw new LogiClientError('reset_required');
      if (response.status === 429) throw new LogiClientError('rate_limited', logiRetryAfterMs(response.headers.get('retry-after'), now()));
      if (!response.ok) throw new LogiClientError('upstream', logiRetryAfterMs(response.headers.get('retry-after'), now()));
      return await boundedJson(response, maxBytes, controller.signal);
    } catch (error) {
      if (error instanceof LogiClientError) throw error;
      throw new LogiClientError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      controller.abort();
    }
  }

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
      const limit = input.limit ?? 25;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new LogiClientError('configuration');
      const query = { limit: String(limit), ...(input.cursor ? { cursor: checkedCursor(input.cursor) } : {}) };
      const schema = z.strictObject({ data: z.array(logiResourceSchemas[resource]).max(limit), page: z.strictObject({ nextCursor: logiCursorSchema.nullable(), limit: z.literal(limit) }) });
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
