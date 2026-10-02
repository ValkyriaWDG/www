import 'server-only';
import { z } from 'zod';
import { logiRetryAfterMs, validateLogiOrigin } from './logi/client';
import type { ConfiguredLogiSource } from './logi-config';
import { logiCommandReceiptSchema, logiEventCommandSchema, logiEventEditorSchema, type LogiEventCommand } from './logi-command-contract';
import { logiIdSchema } from './logi/contracts';

export class LogiCommandError extends Error {
  constructor(readonly code: string, readonly uncertain: boolean, readonly retryAfterMs: number | null = null) { super(`Logi command: ${code}`); this.name = 'LogiCommandError'; }
}
const definitive: Record<string, number> = { invalid_request: 400, unauthorized: 401, insufficient_scope: 403, policy_denied: 403, membership_denied: 403, not_found: 404, revision_conflict: 409, idempotency_conflict: 409, invalid_state: 409 };

function bounded<T>(work: Promise<T>, signal: AbortSignal, writing: boolean): Promise<T> {
  if (signal.aborted) return Promise.reject(new LogiCommandError('unavailable', writing));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new LogiCommandError('unavailable', writing));
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Fixed endpoint, bounded response, no redirects and no automatic POST retries. */
export function createLogiCommandClient(source: ConfiguredLogiSource, actorToken: string, fetchImpl: typeof fetch = fetch) {
  const origin = validateLogiOrigin(source.origin, source);
  if (!/^[\x21-\x7e]{16,4096}$/.test(actorToken) || !/^[\x21-\x7e]{16,1024}$/.test(source.apiKey)) throw new LogiCommandError('configuration', false);
  async function call<T>(path: string, schema: z.ZodType<T>, command?: LogiEventCommand, requestId?: string): Promise<T> {
    const signal = AbortSignal.timeout(8_000);
    const url = new URL(`/api/v1/clan/event-commands${path}`, origin); url.searchParams.set('game', source.gameId);
    let response: Response | undefined;
    try {
      response = await bounded(fetchImpl(url, { method: command ? 'POST' : 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit', signal,
        headers: { Authorization: `Bearer ${source.apiKey}`, 'X-Logi-Actor-Token': actorToken, Accept: 'application/json', ...(command ? { 'Content-Type': 'application/json', 'Idempotency-Key': requestId! } : {}) }, body: command ? JSON.stringify(command) : undefined }), signal, Boolean(command));
      if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== url.href) throw new LogiCommandError('redirect', Boolean(command));
      if (response.status === 429) throw new LogiCommandError('rate_limited', Boolean(command), Math.min(86_400_000, logiRetryAfterMs(response.headers.get('Retry-After'), Date.now()) ?? 30_000));
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body || Number(response.headers.get('content-length') ?? 0) > 32768) throw new LogiCommandError('invalid_response', Boolean(command));
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const { value, done } = await bounded(reader.read(), signal, Boolean(command)); if (done) break; size += value.byteLength; if (size > 32768) throw new LogiCommandError('invalid_response', Boolean(command)); chunks.push(value); } }
      finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!response.ok) {
        const parsed = z.strictObject({ error: z.strictObject({ code: z.string().max(80) }) }).safeParse(raw);
        const code = parsed.success ? parsed.data.error.code : 'unavailable';
        const rejected = definitive[code] === response.status;
        throw new LogiCommandError(rejected ? code : 'unavailable', !rejected);
      }
      const result = z.strictObject({ data: schema }).parse(raw).data;
      const identity = result as { guildId?: string; gameId?: string; operation?: string; eventId?: string };
      if (identity.guildId !== source.guildId || identity.gameId !== source.gameId || command && identity.operation !== command.operation
        || command && command.operation !== 'create' && identity.eventId !== command.eventId) throw new LogiCommandError('scope_mismatch', Boolean(command));
      return result;
    } catch (error) {
      if (error instanceof LogiCommandError) throw error;
      throw new LogiCommandError('unavailable', Boolean(command));
    } finally { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); }
  }
  return {
    submit(command: LogiEventCommand, requestId: string) {
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) throw new LogiCommandError('invalid_request', false);
      return call('', logiCommandReceiptSchema, logiEventCommandSchema.parse(command), requestId);
    },
    async load(eventId: string) {
      const result = await call(`/${encodeURIComponent(logiIdSchema.parse(eventId))}`, logiEventEditorSchema);
      if (result.eventId !== eventId) throw new LogiCommandError('scope_mismatch', false);
      return result;
    },
  };
}
