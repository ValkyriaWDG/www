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

const peopleEnv = { LOGI_SOURCES_JSON: JSON.stringify([source]), LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-12345', LOGI_PEOPLE_API_KEY_WDG: 'synthetic-people-key-12345' };

describe('separate people source authorization', () => {
  it('defaults to disabled and never needs a people key for existing data', () => {
    expect(configuredLogiSources({ ...peopleEnv, LOGI_PEOPLE_API_KEY_WDG: undefined }, 'people')).toEqual([]);
    expect(configuredLogiSources(peopleEnv, 'data')).toHaveLength(1);
  });

  it('requires an explicit people grant instead of borrowing a data or membership key', () => {
    const enabled = { ...peopleEnv, LOGI_SOURCES_JSON: JSON.stringify([{ ...source, syncPeople: true }]) };
    expect(() => configuredLogiSources({ ...enabled, LOGI_PEOPLE_API_KEY_WDG: undefined }, 'people')).toThrow('Missing restricted Logi service key');
    const people = configuredLogiSources(enabled, 'people')[0]!;
    expect(people.purpose).toBe('people');
    expect(people.apiKey).toBe(peopleEnv.LOGI_PEOPLE_API_KEY_WDG);
    expect(people.scopeKey).not.toBe(configuredLogiSources(enabled, 'data')[0]!.scopeKey);
    expect(configuredLogiSources({ ...enabled, LOGI_PEOPLE_API_KEY_WDG: 'replacement-people-key-12345' }, 'people')[0]!.scopeKey).not.toBe(people.scopeKey);
  });

  it('permits a people-only source without a data key and still enforces safe origins', () => {
    const enabled = { ...peopleEnv, LOGI_DATA_API_KEY_WDG: undefined, LOGI_SOURCES_JSON: JSON.stringify([{ ...source, syncPeople: true }]) };
    expect(configuredLogiSources(enabled, 'people')).toHaveLength(1);
    expect(() => configuredLogiSources({ ...enabled, LOGI_SOURCES_JSON: JSON.stringify([{ ...source, syncPeople: true, origin: 'http://logi.example.test' }]) }, 'people')).toThrow('Invalid Logi source origin');
  });
});
