import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { logiInbox, type Executor } from '@valkyria/db';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { configuredLogiSources, type LogiIntegrationEnv } from './logi-config';
import { logiChangeSchema } from './logi/contracts';

const MAX_BODY_BYTES = 65_536;
const BODY_DEADLINE_MS = 10_000;
const MAX_TIMESTAMP_AGE_MS = 300_000;
const MAX_FUTURE_SKEW_MS = 30_000;
const sourceIdSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/);
const eventTypeSchema = z.enum(['integration.changed', 'membership.changed', 'article.created', 'article.updated', 'article.deleted', 'event.created', 'event.updated', 'roster.updated', 'settings.updated', 'webhook.test']);
const envelopeSchema = z.strictObject({
  id: z.uuid().optional(),
  type: eventTypeSchema,
  guildId: z.string().regex(/^\d{5,25}$/),
  createdAt: z.iso.datetime({ offset: true }),
  resource: z.record(z.string(), z.unknown()),
});

class WebhookError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function reply(status: number, code?: string): Response {
  const headers = { 'Cache-Control': 'no-store', ...(status === 503 ? { 'Retry-After': '30' } : {}) };
  return status === 204 ? new Response(null, { status, headers }) : Response.json(code ? { error: code } : { accepted: true }, { status, headers });
}

function configuredWebhook(env: LogiIntegrationEnv, sourceId: string) {
  if (env.LOGI_WEBHOOK_ENABLED !== true || !sourceIdSchema.safeParse(sourceId).success) throw new WebhookError(404, 'not_found');
  const sources = configuredLogiSources(env, 'data');
  const matching = sources.filter((source) => source.sourceInstanceId === sourceId);
  if (!matching.length) throw new WebhookError(404, 'not_found');
  const first = matching[0]!;
  if (matching.some((source) => source.guildId !== first.guildId || source.origin !== first.origin)) throw new Error('Ambiguous webhook source configuration.');
  const rawSecrets = env.LOGI_WEBHOOK_SIGNING_SECRETS_JSON ?? '{}';
  if (rawSecrets.length > 2_048) throw new Error('Invalid webhook configuration.');
  const secrets = z.record(sourceIdSchema, z.string().min(32).max(512).regex(/^[\x21-\x7e]+$/)).parse(JSON.parse(rawSecrets));
  if (Object.keys(secrets).length > 2 || Object.keys(secrets).some((id) => !sources.some((source) => source.sourceInstanceId === id))) throw new Error('Invalid webhook configuration.');
  const secret = secrets[sourceId];
  const serviceKeys = [env.LOGI_DATA_API_KEY_HLL, env.LOGI_DATA_API_KEY_WDG, env.LOGI_MEMBERSHIP_API_KEY_HLL, env.LOGI_MEMBERSHIP_API_KEY_WDG, env.LOGI_EVENT_API_KEY_HLL, env.LOGI_EVENT_API_KEY_WDG];
  if (!secret || serviceKeys.includes(secret)) throw new Error('A distinct webhook signing secret is required.');
  return { sourceInstanceId: sourceId, guildId: first.guildId, gameIds: matching.map((source) => source.gameId), secret };
}

function timestampIsCurrent(timestamp: string, now: Date): boolean {
  if (!/^[1-9][0-9]{9,10}$/.test(timestamp)) return false;
  const at = Number(timestamp) * 1_000;
  return now.getTime() - at <= MAX_TIMESTAMP_AGE_MS && at - now.getTime() <= MAX_FUTURE_SKEW_MS;
}

/** Read the original bytes, with a limit independent of the client-supplied length. */
async function readRawBody(request: Request): Promise<Buffer> {
  const declared = request.headers.get('content-length');
  if (declared !== null && !/^(0|[1-9][0-9]{0,8})$/.test(declared)) throw new WebhookError(400, 'invalid_request');
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) throw new WebhookError(413, 'body_too_large');
  if (!request.body) throw new WebhookError(400, 'invalid_request');
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new WebhookError(408, 'request_timeout')), BODY_DEADLINE_MS); });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_BODY_BYTES) throw new WebhookError(413, 'body_too_large');
      chunks.push(Buffer.from(chunk.value));
    }
    if (declared !== null && total !== Number(declared)) throw new WebhookError(400, 'invalid_request');
    return Buffer.concat(chunks, total);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

/**
 * Durable hint intake only. Neither event resources nor URLs are applied to projections.
 * Logi signs timestamp + '.' + exact JSON bytes. Its delivery header is not signed and
 * differs from the legacy envelope ID, so it is never used as a deduplication authority.
 */
export async function receiveLogiWebhook(db: Executor | (() => Executor), env: LogiIntegrationEnv, sourceId: string, request: Request, options: { now?: () => Date } = {}): Promise<Response> {
  const now = options.now ?? (() => new Date());
  try {
    const source = configuredWebhook(env, sourceId);
    if (request.method !== 'POST') throw new WebhookError(405, 'method_not_allowed');
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')
      || !['', 'identity'].includes(request.headers.get('content-encoding') ?? '')) throw new WebhookError(415, 'unsupported_media_type');
    const timestamp = request.headers.get('x-logi-timestamp') ?? '';
    const signature = request.headers.get('x-logi-signature') ?? '';
    if (!timestampIsCurrent(timestamp, now()) || !/^sha256=[0-9a-f]{64}$/.test(signature)) throw new WebhookError(401, 'invalid_signature');
    // This header is only diagnostic. Replacing it cannot produce another inbox identity.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.headers.get('x-logi-delivery') ?? '')) throw new WebhookError(400, 'invalid_request');
    const raw = await readRawBody(request);
    const expected = createHmac('sha256', source.secret).update(timestamp).update('.').update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex')) || !timestampIsCurrent(timestamp, now())) throw new WebhookError(401, 'invalid_signature');

    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new WebhookError(400, 'invalid_request'); }
    const result = envelopeSchema.safeParse(parsed);
    if (!result.success || request.headers.get('x-logi-event') !== result.data.type) throw new WebhookError(400, 'invalid_request');
    const envelope = result.data;
    if (envelope.guildId !== source.guildId) throw new WebhookError(403, 'invalid_scope');
    if (Date.parse(envelope.createdAt) > now().getTime() + MAX_FUTURE_SKEW_MS) throw new WebhookError(400, 'invalid_request');
    if (envelope.type === 'integration.changed' || envelope.type === 'membership.changed') {
      const change = logiChangeSchema.safeParse(envelope.resource);
      if (!change.success) throw new WebhookError(400, 'invalid_request');
      if (change.data.guildId !== source.guildId || !source.gameIds.includes(change.data.gameId)) throw new WebhookError(403, 'invalid_scope');
      if ((envelope.type === 'membership.changed') !== (change.data.resource === 'membership-summaries')) throw new WebhookError(400, 'invalid_request');
    } else if (!envelope.id) {
      // Current change notifications omit id; legacy API/test envelopes always sign one.
      throw new WebhookError(400, 'invalid_request');
    }
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    const deliveryId = envelope.id ? `event:${envelope.id}` : `body:${bodyHash}`;
    const executor = typeof db === 'function' ? db() : db;
    const outcome = await executor.transaction(async (tx) => {
      const inserted = await tx.insert(logiInbox).values({ sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, deliveryId, receivedAt: now(), eventType: envelope.type, bodyHash })
        .onConflictDoNothing().returning({ deliveryId: logiInbox.deliveryId });
      if (inserted.length) return 'accepted';
      const [existing] = await tx.select({ bodyHash: logiInbox.bodyHash }).from(logiInbox)
        .where(and(eq(logiInbox.sourceInstanceId, source.sourceInstanceId), eq(logiInbox.guildId, source.guildId), eq(logiInbox.deliveryId, deliveryId))).for('share');
      if (!existing) throw new Error('Inbox persistence unavailable.');
      return existing.bodyHash === bodyHash ? 'duplicate' : 'conflict';
    });
    return outcome === 'accepted' ? reply(202) : outcome === 'duplicate' ? reply(204) : reply(409, 'delivery_conflict');
  } catch (error) {
    return error instanceof WebhookError ? reply(error.status, error.code) : reply(503, 'unavailable');
  }
}

/**
 * The bounded CLI calls this only after every configured game of this source/guild is
 * caught up through authorized API reads. `before` is the pull's START time: hints that
 * arrived during it stay pending. Failed/skipped/partial pulls must not call this helper.
 */
export async function markLogiHintsProcessed(db: Executor, sourceInstanceId: string, guildId: string, before: Date): Promise<number> {
  if (!sourceIdSchema.safeParse(sourceInstanceId).success || !/^\d{5,25}$/.test(guildId) || !Number.isFinite(before.getTime())) throw new Error('Invalid inbox scope.');
  return db.transaction(async (tx) => {
    const pending = await tx.select({ deliveryId: logiInbox.deliveryId }).from(logiInbox)
      .where(and(eq(logiInbox.sourceInstanceId, sourceInstanceId), eq(logiInbox.guildId, guildId), isNull(logiInbox.processedAt), lte(logiInbox.receivedAt, before)))
      .orderBy(asc(logiInbox.receivedAt), asc(logiInbox.deliveryId)).limit(500).for('update', { skipLocked: true });
    if (!pending.length) return 0;
    const marked = await tx.update(logiInbox).set({ processedAt: new Date() })
      .where(and(eq(logiInbox.sourceInstanceId, sourceInstanceId), eq(logiInbox.guildId, guildId), isNull(logiInbox.processedAt), inArray(logiInbox.deliveryId, pending.map((row) => row.deliveryId))))
      .returning({ deliveryId: logiInbox.deliveryId });
    return marked.length;
  });
}
