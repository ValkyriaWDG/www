import { describe, expect, it } from 'vitest';
import { roleSyncConfig } from './config';

describe('role-sync operator configuration', () => {
  it('remains disabled by default, including legacy secret-only and truthy spellings', () => {
    for (const env of [{}, { ROLE_SYNC_SIGNING_SECRET: 'x'.repeat(40) }, { ROLE_SYNC_ENABLED: '1' }, { ROLE_SYNC_ENABLED: 'TRUE' }]) {
      expect(roleSyncConfig(env).enabled).toBe(false);
    }
  });
  it('requires one stable producer, exact guild and at most two explicitly named strong keys', () => {
    const env = { ROLE_SYNC_ENABLED: 'true', ROLE_SYNC_PRODUCER_ID: 'valkyria-bot', DISCORD_GUILD_ID: '111111111111111111', ROLE_SYNC_KEYS_JSON: JSON.stringify({ current: 'x'.repeat(32), previous: 'y'.repeat(32) }) };
    expect(roleSyncConfig(env)).toMatchObject({ enabled: true, producer: 'valkyria-bot', guildId: env.DISCORD_GUILD_ID });
    for (const broken of [{ ...env, ROLE_SYNC_PRODUCER_ID: '' }, { ...env, DISCORD_GUILD_ID: '' }, { ...env, ROLE_SYNC_KEYS_JSON: '[]' }, { ...env, ROLE_SYNC_KEYS_JSON: JSON.stringify({ current: 'secret-too-short' }) }, { ...env, ROLE_SYNC_KEYS_JSON: JSON.stringify({ a: 'x'.repeat(32), b: 'y'.repeat(32), c: 'z'.repeat(32) }) }]) {
      expect(() => roleSyncConfig(broken)).toThrow('ROLE_SYNC_CONFIG_INVALID');
    }
  });
});
