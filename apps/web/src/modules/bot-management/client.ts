import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { BotError, settingsSchema, statusSchema, snowflake, wireUpdateSchema, type WireUpdate } from './contracts';

export type ManagementConfig = { origin: string; keyId: string; secret: string; guildId: string };
/** Operator-only fixed destination. Never derive an origin/path/key from a request. */
export function readManagementConfig(env: Record<string, string | undefined> = process.env): ManagementConfig | null {
  if (!env.BOT_MANAGEMENT_ENABLED || env.BOT_MANAGEMENT_ENABLED === 'false') return null;
  try {
    if (env.BOT_MANAGEMENT_ENABLED !== 'true') throw new Error();
    const url = new URL(env.BOT_MANAGEMENT_ORIGIN ?? '');
    const allowed = (env.BOT_MANAGEMENT_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim());
    const host = url.hostname;
    const privateV4 = isIP(host) === 4 && (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
    const privateHost = host === 'localhost' || host === '[::1]' || privateV4 || /^[a-z][a-z0-9-]*$/.test(host);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !allowed.includes(url.origin)) throw new Error();
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateHost && env.BOT_MANAGEMENT_ALLOW_PRIVATE_HTTP === 'true')) throw new Error();
    const parsed = z.object({ keyId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), secret: z.string().min(32).max(256).refine((value) => !/[\r\n]/.test(value)), guildId: snowflake }).parse({ keyId: env.BOT_MANAGEMENT_KEY_ID, secret: env.BOT_MANAGEMENT_SECRET, guildId: env.DISCORD_GUILD_ID });
    if (['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_SECRET', 'BETTER_AUTH_SECRET', 'ROLE_SYNC_SIGNING_SECRET'].some((key) => env[key] === parsed.secret)) throw new Error();
    if (env.ROLE_SYNC_KEYS_JSON) {
      const roleKeys: unknown = JSON.parse(env.ROLE_SYNC_KEYS_JSON);
      if (!roleKeys || typeof roleKeys !== 'object' || Array.isArray(roleKeys) || Object.values(roleKeys).some((value) => typeof value !== 'string' || value === parsed.secret)) throw new Error();
    }
    return { origin: url.origin, ...parsed };
  } catch { throw new Error('Invalid bot management configuration'); }
}

/** Small, allowlisted DTOs only. Redirects, retries, caller URLs and raw errors are forbidden. */
export class ManagementClient {
  constructor(private readonly config: ManagementConfig, private readonly transport: typeof fetch = fetch, private readonly timeoutMs = 5000) {}
  status(actorId: string) { return this.request('GET', '/api/management/v1/status', actorId, undefined, statusSchema); }
  settings(actorId: string) { return this.request('GET', '/api/management/v1/settings', actorId, undefined, settingsSchema); }
  update(actorId: string, input: WireUpdate) {
    const parsed = wireUpdateSchema.safeParse(input);
    if (!parsed.success) throw new BotError('invalid');
    return this.request('PATCH', '/api/management/v1/settings', actorId, parsed.data, settingsSchema);
  }
  private async request<T>(method: 'GET' | 'PATCH', path: string, actorId: string, data: WireUpdate | undefined, schema: z.ZodType<T>): Promise<T> {
    if (!snowflake.safeParse(actorId).success) throw new BotError('forbidden');
    const body = data ? JSON.stringify(data) : '';
    if (Buffer.byteLength(body) > 16384) throw new BotError('invalid');
    const timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(16).toString('hex');
    const signature = createHmac('sha256', this.config.secret).update(['VALKYRIA-MANAGEMENT-V1', method, path, this.config.keyId, timestamp, nonce, this.config.guildId, actorId, body].join('\n')).digest('hex');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response | undefined;
    try {
      response = await this.transport(this.config.origin + path, { method, redirect: 'error', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Valkyria-Management-Key-Id': this.config.keyId, 'X-Valkyria-Management-Timestamp': timestamp, 'X-Valkyria-Management-Nonce': nonce, 'X-Valkyria-Management-Guild': this.config.guildId, 'X-Valkyria-Management-Actor': actorId, 'X-Valkyria-Management-Signature': signature }, ...(method === 'PATCH' ? { body } : {}) });
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error();
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 65536) throw new Error(); chunks.push(item.value); } } finally { await reader.cancel().catch(() => undefined); }
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!response.ok) {
        const error = z.object({ code: z.string().regex(/^MANAGEMENT_[A-Z_]{1,60}$/) }).strict().safeParse(value);
        if (!error.success) throw new Error();
        if (response.status === 403) throw new BotError('forbidden');
        if (response.status === 409 && error.data.code === 'MANAGEMENT_REVISION_CONFLICT') throw new BotError('conflict');
        if (response.status === 429) throw new BotError('rate_limited');
        // A 5xx/timeout can follow COMMIT. Never label it a failed mutation or retry it.
        throw new BotError(method === 'PATCH' && response.status >= 500 ? 'unknown_outcome' : 'unavailable');
      }
      if (response.status !== 200 && !(method === 'PATCH' && response.status === 202)) throw new Error();
      const result = schema.safeParse(value);
      if (!result.success) throw new Error();
      return result.data;
    } catch (error) {
      if (error instanceof BotError) throw error;
      throw new BotError(method === 'PATCH' ? 'unknown_outcome' : 'unavailable');
    } finally { clearTimeout(timer); }
  }
}
