import { describe, expect, it } from 'vitest';
import { configuredLogiSources } from './logi-config';

const source = { sourceInstanceId: 'local', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'wardogs' };
const env = (overrides: Record<string, unknown> = {}) => ({
  NODE_ENV: 'test',
  LOGI_SOURCES_JSON: JSON.stringify([{ ...source, ...overrides }]),
  LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-0123456789',
});

describe('Logi source scope', () => {
  it('accepts explicit archive identities without changing the authority scope', () => {
    const matchLinks = [{ eventId: 'event-one', matchId: '10000000-0000-4000-8000-000000000001' }];
    const configured = configuredLogiSources(env({ matchLinks }), 'data')[0]!;
    expect(configured).toMatchObject({ matchLinks });
    expect(configured.scopeKey).toBe(configuredLogiSources(env(), 'data')[0]!.scopeKey);
  });
  it.each([
    [{ eventId: 'event-one', matchId: 'not-a-uuid' }],
    [{ eventId: '../event', matchId: '10000000-0000-4000-8000-000000000001' }],
    [{ eventId: 'event-one', matchId: '10000000-0000-4000-8000-000000000001' }, { eventId: 'event-two', matchId: '10000000-0000-4000-8000-000000000001' }],
    [{ eventId: 'event-one', matchId: '10000000-0000-4000-8000-000000000001' }, { eventId: 'event-one', matchId: '10000000-0000-4000-8000-000000000002' }],
  ])('rejects ambiguous or invalid explicit archive bindings: %j', (...matchLinks) => {
    expect(() => configuredLogiSources(env({ matchLinks }), 'data')).toThrow('Invalid LOGI_SOURCES_JSON');
  });
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

const readerKeys = { LOGI_LEAGUE_API_KEY_WDG: 'synthetic-league-key-12345', LOGI_WARCON_API_KEY_WDG: 'synthetic-warcon-key-12345', LOGI_HISTORY_API_KEY_WDG: 'synthetic-history-key-12345' };
const HISTORY_SOURCE = '0123456789abcdef'.repeat(4);
const published = [{ connectionId: 'conn-a', publicId: 'community-one', name: 'Approved', published: true, address: null, statsUrl: null }];

describe('Wardogs-only reader purposes', () => {
  it('select the league and warcon readers by their own keys and never borrow another grant', () => {
    expect(configuredLogiSources({ ...env(), LOGI_SOURCES_JSON: JSON.stringify([source]) }, 'league')).toEqual([]);
    expect(configuredLogiSources({ ...env(), LOGI_SOURCES_JSON: JSON.stringify([source]) }, 'warcon')).toEqual([]);
    expect(configuredLogiSources({ ...env(), LOGI_SOURCES_JSON: JSON.stringify([source]) }, 'history')).toEqual([]);
    const league = configuredLogiSources({ ...env(), ...readerKeys }, 'league')[0]!;
    const warcon = configuredLogiSources({ ...env(), ...readerKeys }, 'warcon')[0]!;
    const history = configuredLogiSources({ ...env(), ...readerKeys }, 'history')[0]!;
    expect(league).toMatchObject({ purpose: 'league', apiKey: readerKeys.LOGI_LEAGUE_API_KEY_WDG, gameId: 'wardogs' });
    expect(warcon).toMatchObject({ purpose: 'warcon', apiKey: readerKeys.LOGI_WARCON_API_KEY_WDG });
    expect(history).toMatchObject({ purpose: 'history', apiKey: readerKeys.LOGI_HISTORY_API_KEY_WDG, gameId: 'wardogs', historySources: [] });
    const data = configuredLogiSources(env(), 'data')[0]!;
    expect(new Set([league.scopeKey, warcon.scopeKey, history.scopeKey, data.scopeKey]).size).toBe(4);
    expect(() => configuredLogiSources({ ...env(), LOGI_LEAGUE_API_KEY_WDG: 'short' }, 'league')).toThrow('Missing restricted Logi service key');
    expect(() => configuredLogiSources({ ...env(), LOGI_HISTORY_API_KEY_WDG: 'short' }, 'history')).toThrow('Missing restricted Logi service key');
  });

  it('ignore HLL sources for the readers', () => {
    const hll = { ...source, gameId: 'hell_let_loose', LOGI_DATA_API_KEY_HLL: undefined };
    const both = { NODE_ENV: 'test', ...readerKeys, LOGI_SOURCES_JSON: JSON.stringify([hll, source]) };
    expect(configuredLogiSources(both, 'league').map((row) => row.gameId)).toEqual(['wardogs']);
    expect(configuredLogiSources(both, 'warcon').map((row) => row.gameId)).toEqual(['wardogs']);
    expect(configuredLogiSources(both, 'history').map((row) => row.gameId)).toEqual(['wardogs']);
  });
});

describe('approved retained-history sources', () => {
  const withSources = (historySources: unknown, extra: Record<string, unknown> = {}) => ({ ...env({ publicServers: published, historySources, ...extra }), ...readerKeys });

  it('accept unique sources under published servers with publishPlayers defaulting to false', () => {
    const [row] = configuredLogiSources(withSources([{ sourceId: HISTORY_SOURCE, publicId: 'community-one' }]), 'history');
    expect(row!.historySources).toEqual([{ sourceId: HISTORY_SOURCE, publicId: 'community-one', publishPlayers: false }]);
    const [published2] = configuredLogiSources(withSources([{ sourceId: HISTORY_SOURCE, publicId: 'community-one', publishPlayers: true }]), 'history');
    expect(published2!.historySources[0]!.publishPlayers).toBe(true);
    expect(configuredLogiSources(withSources([]), 'history')[0]!.historySources).toEqual([]);
    // The association is visible to every purpose of the binding but only the history key reads it.
    expect(configuredLogiSources(withSources([{ sourceId: HISTORY_SOURCE, publicId: 'community-one' }]), 'data')[0]!.historySources).toHaveLength(1);
  });

  it.each([
    ['a duplicate source ID', [{ sourceId: HISTORY_SOURCE, publicId: 'community-one' }, { sourceId: HISTORY_SOURCE, publicId: 'community-two' }], { publicServers: [...published, { ...published[0], connectionId: 'conn-b', publicId: 'community-two' }] }],
    ['a duplicate public ID', [{ sourceId: HISTORY_SOURCE, publicId: 'community-one' }, { sourceId: 'fedcba9876543210'.repeat(4), publicId: 'community-one' }], {}],
    ['an unknown public ID', [{ sourceId: HISTORY_SOURCE, publicId: 'community-two' }], {}],
    ['an unpublished server', [{ sourceId: HISTORY_SOURCE, publicId: 'community-one' }], { publicServers: [{ ...published[0], published: false }] }],
    ['a source ID that is not 64 lowercase hex characters', [{ sourceId: 'synthetic-warcon-connection', publicId: 'community-one' }], {}],
    ['an uppercase source ID', [{ sourceId: HISTORY_SOURCE.toUpperCase(), publicId: 'community-one' }], {}],
    ['an extra field', [{ sourceId: HISTORY_SOURCE, publicId: 'community-one', serverName: 'guess' }], {}],
    ['a non-boolean publishPlayers', [{ sourceId: HISTORY_SOURCE, publicId: 'community-one', publishPlayers: 'yes' }], {}],
    ['an HLL source', [{ sourceId: HISTORY_SOURCE, publicId: 'community-one' }], { gameId: 'hell_let_loose' }],
    ['more than 20 sources', Array.from({ length: 21 }, (_, i) => ({ sourceId: HISTORY_SOURCE.slice(0, 62) + String(i).padStart(2, '0'), publicId: 'community-one' })), {}],
  ])('reject %s', (_label, historySources, extra) => {
    expect(() => configuredLogiSources(withSources(historySources, extra), 'history')).toThrow('Invalid LOGI_SOURCES_JSON');
  });
});

describe('approved Warcon connections', () => {
  const withConnections = (warconConnections: unknown, extra: Record<string, unknown> = {}) => ({ ...env({ publicServers: published, warconConnections, ...extra }), ...readerKeys });

  it('accept unique connections under published servers and expose them on the warcon source', () => {
    const [row] = configuredLogiSources(withConnections([{ connectionId: 'conn-a', publicId: 'community-one' }]), 'warcon');
    expect(row!.warconConnections).toEqual([{ connectionId: 'conn-a', publicId: 'community-one' }]);
    expect(configuredLogiSources(withConnections([]), 'warcon')[0]!.warconConnections).toEqual([]);
  });

  it.each([
    ['a duplicate connection ID', [{ connectionId: 'conn-a', publicId: 'community-one' }, { connectionId: 'conn-a', publicId: 'community-two' }], { publicServers: [...published, { ...published[0], connectionId: 'conn-b', publicId: 'community-two' }] }],
    ['a duplicate public ID', [{ connectionId: 'conn-a', publicId: 'community-one' }, { connectionId: 'conn-b', publicId: 'community-one' }], {}],
    ['an unknown public ID', [{ connectionId: 'conn-a', publicId: 'community-two' }], {}],
    ['an unpublished server', [{ connectionId: 'conn-a', publicId: 'community-one' }], { publicServers: [{ ...published[0], published: false }] }],
    ['an unsafe connection ID', [{ connectionId: '../admin', publicId: 'community-one' }], {}],
    ['an extra field', [{ connectionId: 'conn-a', publicId: 'community-one', view: 'players' }], {}],
    ['an HLL source', [{ connectionId: 'conn-a', publicId: 'community-one' }], { gameId: 'hell_let_loose' }],
  ])('reject %s', (_label, warconConnections, extra) => {
    expect(() => configuredLogiSources(withConnections(warconConnections, extra), 'warcon')).toThrow('Invalid LOGI_SOURCES_JSON');
  });
});
