import { describe, expect, it } from 'vitest';
import { configuredLogiSources } from './logi-config';

const source = { sourceInstanceId: 'local', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'wardogs' };
const env = (overrides: Record<string, unknown> = {}) => ({
  NODE_ENV: 'test',
  LOGI_SOURCES_JSON: JSON.stringify([{ ...source, ...overrides }]),
  LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-0123456789',
});

describe('Logi source scope', () => {
  it('keeps the cache scope when only presentation settings change', () => {
    const [base] = configuredLogiSources(env(), 'data');
    const [published] = configuredLogiSources(env({ publishMatches: true, publicServers: [] }), 'data');
    expect(published!.scopeKey).toBe(base!.scopeKey);
  });
  it('moves the cache scope when the authority changes', () => {
    const [base] = configuredLogiSources(env(), 'data');
    expect(configuredLogiSources(env({ guildId: '100000000000000002' }), 'data')[0]!.scopeKey).not.toBe(base!.scopeKey);
    expect(configuredLogiSources(env({ origin: 'https://other.example.test' }), 'data')[0]!.scopeKey).not.toBe(base!.scopeKey);
    expect(configuredLogiSources({ ...env(), LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-rotated-0001' }, 'data')[0]!.scopeKey).not.toBe(base!.scopeKey);
    expect(configuredLogiSources({ ...env(), LOGI_MEMBERSHIP_API_KEY_WDG: 'synthetic-data-key-0123456789' }, 'membership')[0]!.scopeKey).not.toBe(base!.scopeKey);
  });
});
