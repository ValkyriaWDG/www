import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ManagementClient, readManagementConfig } from './client';

const guildId = '100000000000000001', actorId = '300000000000000004';
const secret = 'synthetic-management-key-for-tests-only-0000';
const env = { BOT_MANAGEMENT_ENABLED: 'true', BOT_MANAGEMENT_ORIGIN: 'https://bot.internal.invalid', BOT_MANAGEMENT_ALLOWED_ORIGINS: 'https://bot.internal.invalid', BOT_MANAGEMENT_KEY_ID: 'website', BOT_MANAGEMENT_SECRET: secret, DISCORD_GUILD_ID: guildId };
const settings = { schemaVersion: 1, desired: { revision: '0', settings: { defaultLocale: 'cs' as const, serverLabels: { primary: 'Valkyria' } } }, effective: null, applyState: 'unknown' };
const update = { expectedRevision: '0', settings: settings.desired.settings, reason: 'Change label', correlationId: '11111111-1111-4111-8111-111111111111' };
describe('private management transport', () => {
  it('is disabled by default and fails closed for an unlisted destination or reused key', () => {
    expect(readManagementConfig({})).toBeNull();
    expect(() => readManagementConfig({ ...env, BOT_MANAGEMENT_ALLOWED_ORIGINS: 'https://other.invalid' })).toThrow('configuration');
    expect(() => readManagementConfig({ ...env, DISCORD_BOT_TOKEN: secret })).toThrow('configuration');
    expect(() => readManagementConfig({ ...env, ROLE_SYNC_KEYS_JSON: JSON.stringify({ current: secret }) })).toThrow('configuration');
    expect(() => readManagementConfig({ ...env, BOT_MANAGEMENT_ORIGIN: 'https://bot.internal.invalid/user/path' })).toThrow('configuration');
  });
  it('only permits explicit private HTTP for actual private addresses or service labels', () => {
    const http = { ...env, BOT_MANAGEMENT_ALLOW_PRIVATE_HTTP: 'true' };
    for (const origin of ['http://127.evil.invalid', 'http://10.evil.invalid', 'http://192.168.evil.invalid', 'http://203.0.113.7']) {
      expect(() => readManagementConfig({ ...http, BOT_MANAGEMENT_ORIGIN: origin, BOT_MANAGEMENT_ALLOWED_ORIGINS: origin })).toThrow('configuration');
    }
    for (const origin of ['http://127.0.0.1:4111', 'http://172.20.0.4:4111', 'http://valkyria-bot:4111']) {
      expect(readManagementConfig({ ...http, BOT_MANAGEMENT_ORIGIN: origin, BOT_MANAGEMENT_ALLOWED_ORIGINS: origin })?.origin).toBe(origin);
    }
  });
  it('signs exact method/path/actor/raw body with independent HMAC and never follows redirects', async () => {
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(env.BOT_MANAGEMENT_ORIGIN + '/api/management/v1/settings');
      expect(init?.redirect).toBe('error');
      const h = new Headers(init?.headers);
      const raw = String(init?.body);
      const message = ['VALKYRIA-MANAGEMENT-V1', 'PATCH', '/api/management/v1/settings', 'website', h.get('X-Valkyria-Management-Timestamp'), h.get('X-Valkyria-Management-Nonce'), guildId, actorId, raw].join('\n');
      expect(h.get('X-Valkyria-Management-Signature')).toBe(createHmac('sha256', secret).update(message).digest('hex'));
      expect(JSON.parse(raw)).toEqual(update);
      return Response.json(settings, { status: 202 });
    });
    const result = await new ManagementClient(readManagementConfig(env)!, transport).update(actorId, update);
    expect(result.applyState).toBe('unknown');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown/private response fields and never returns raw dependency errors', async () => {
    const client = new ManagementClient(readManagementConfig(env)!, async () => Response.json({ ...settings, secret: 'PRIVATE_VALUE' }));
    await expect(client.settings(actorId)).rejects.toMatchObject({ code: 'unavailable', message: 'unavailable' });
  });
  it('does not retry an uncertain write and distinguishes revision conflicts from service failure', async () => {
    const transport = vi.fn<typeof fetch>(async () => { throw new Error('https://private.example?token=SECRET'); });
    await expect(new ManagementClient(readManagementConfig(env)!, transport).update(actorId, update)).rejects.toMatchObject({ code: 'unknown_outcome' });
    expect(transport).toHaveBeenCalledTimes(1);
    const conflict = new ManagementClient(readManagementConfig(env)!, async () => Response.json({ code: 'MANAGEMENT_REVISION_CONFLICT' }, { status: 409 }));
    await expect(conflict.update(actorId, update)).rejects.toMatchObject({ code: 'conflict' });
  });
});
