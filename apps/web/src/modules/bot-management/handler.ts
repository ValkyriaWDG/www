import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AuditInput } from '@/modules/audit/audit';
import { can } from '@/modules/access/policy';
import { AccessDeniedError, type AccessIntent, type Principal } from '@/modules/access/types';
import { BotError, snowflake, updateSchema, type BotSettings, type BotStatus, type WireUpdate, type BotErrorCode } from './contracts';

export type BotIdentity = { actor: Principal; discordUserId: string | null };
export type BotDependencies = {
  origin: string;
  identity: (intent: AccessIntent) => Promise<BotIdentity>;
  audit: (input: AuditInput) => Promise<void>;
  client: null | { status(id: string): Promise<BotStatus>; settings(id: string): Promise<BotSettings>; update(id: string, input: WireUpdate): Promise<BotSettings> };
};
export function botResponse(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie' } });
}
function authorized(identity: BotIdentity, intent: AccessIntent) {
  const capability = intent === 'write' ? 'bot.configure' : 'bot.read';
  if (!can(identity.actor, capability) || !can(identity.actor, 'bot.read') || (intent === 'write' && identity.actor.intent !== 'write')) throw new BotError('forbidden');
}
function discordIdentity(identity: BotIdentity): string {
  if (identity.actor.source !== 'discord' || identity.actor.assurance !== 'discord') throw new BotError('discord_required');
  if (!snowflake.safeParse(identity.discordUserId).success) throw new BotError('forbidden');
  return identity.discordUserId!;
}
async function input(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw new BotError('invalid');
  if (request.headers.has('content-encoding')) throw new BotError('invalid');
  const reader = request.body?.getReader(); if (!reader) throw new BotError('invalid');
  let size = 0, expired = false; const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => undefined); }, 5000);
  try {
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 16384) throw new BotError('invalid'); chunks.push(item.value); }
    if (expired) throw new BotError('invalid');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { throw new BotError('invalid'); } finally { clearTimeout(timer); await reader.cancel().catch(() => undefined); }
}

/** Actual route handler; injected dependencies are adapters, never request parameters. */
export async function handleBotRequest(request: Request, deps: BotDependencies): Promise<Response> {
  let dispatched = false;
  let auditInput: AuditInput | undefined;
  try {
    if (!['GET', 'PATCH'].includes(request.method)) return botResponse({ ok: false, code: 'invalid' }, 405);
    const write = request.method === 'PATCH';
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (write && request.headers.get('origin') !== deps.origin)) throw new BotError('forbidden');
    const identity = await deps.identity(write ? 'write' : 'read');
    authorized(identity, write ? 'write' : 'read');
    if (!deps.client) return write ? botResponse({ ok: false, code: 'disabled' }, 503) : botResponse({ ok: true, view: { enabled: false, canConfigure: false, status: null, settings: null, receivedAt: new Date().toISOString(), error: null } });
    const actorId = discordIdentity(identity);
    if (!write) {
      // Both reads independently authenticate the same session-derived actor at the bot.
      const [status, settings] = await Promise.all([deps.client.status(actorId), deps.client.settings(actorId)]);
      return botResponse({ ok: true, view: { enabled: true, canConfigure: can(identity.actor, 'bot.configure'), status, settings, receivedAt: new Date().toISOString(), error: null } });
    }
    const parsed = updateSchema.safeParse(await input(request));
    if (!parsed.success) throw new BotError('invalid');
    const correlationId = randomUUID();
    auditInput = { actor: identity.actor, action: 'bot.settings.requested', outcome: 'success', capability: 'bot.configure', entityType: 'bot_settings', requestId: correlationId, summary: { expectedRevision: parsed.data.expectedRevision, fields: ['defaultLocale', 'serverLabels'], serverCount: Object.keys(parsed.data.settings.serverLabels).length } };
    // This committed intent is not a successful configuration change. If it fails, no PATCH.
    await deps.audit(auditInput);
    const fresh = await deps.identity('write');
    authorized(fresh, 'write');
    if (fresh.actor.userId !== identity.actor.userId || fresh.actor.sessionId !== identity.actor.sessionId || discordIdentity(fresh) !== actorId) throw new BotError('forbidden');
    dispatched = true;
    const settings = await deps.client.update(actorId, { ...parsed.data, correlationId });
    await deps.audit({ ...auditInput, action: 'bot.settings.accepted', summary: { desiredRevision: settings.desired.revision, effectiveRevision: settings.effective?.revision ?? null, applyState: settings.applyState } });
    return botResponse({ ok: true, settings }, settings.applyState === 'applied' ? 200 : 202);
  } catch (error) {
    const code: BotErrorCode = error instanceof BotError ? error.code : error instanceof AccessDeniedError ? 'forbidden' : dispatched ? 'unknown_outcome' : 'unavailable';
    if (auditInput) {
      await deps.audit({ ...auditInput, action: code === 'unknown_outcome' ? 'bot.settings.uncertain' : 'bot.settings.rejected', outcome: 'failure', summary: { code } }).catch(() => undefined);
    }
    return botResponse({ ok: false, code }, code === 'forbidden' || code === 'discord_required' ? 403 : code === 'conflict' ? 409 : code === 'invalid' ? 400 : code === 'rate_limited' ? 429 : 503);
  }
}
