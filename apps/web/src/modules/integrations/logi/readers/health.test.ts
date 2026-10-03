import { afterEach, describe, expect, it, vi } from 'vitest';
import leagueFixture from '../fixtures/league-v0.12-stale-http.json';
import type { LogiFetch } from '../transport';
import { readerCapabilityStates } from './health';
import { createLeagueReader, observeLeaguePreview, resetLeagueReaderForTests } from './league';
import { createWarconReader, observeWarcon, resetWarconReaderForTests } from './warcon';

const wardogs = { sourceInstanceId: 'local', origin: 'https://logi.example', guildId: '100000000000000001', gameId: 'wardogs' };
const published = [{ connectionId: 'conn-a', publicId: 'community-one', name: 'Approved', published: true, address: null, statsUrl: null }];
const env = (overrides: Record<string, unknown> = {}, source: Record<string, unknown> = {}) => ({ NODE_ENV: 'test', LOGI_SOURCES_JSON: JSON.stringify([{ ...wardogs, ...source }]), ...overrides });
const credentials = { origin: 'https://logi.example', apiKey: 'synthetic-reader-key-not-a-credential', gameId: 'wardogs' as const, allowLoopbackHttp: false, environment: 'test' as const };

afterEach(() => {
  resetLeagueReaderForTests();
  resetWarconReaderForTests();
});

describe('readerCapabilityStates', () => {
  it('reports unconfigured without keys, without a Wardogs source and without approved connections', () => {
    expect(readerCapabilityStates(env())).toMatchObject({ 'league-matches': { state: 'unconfigured', detail: 'LOGI_LEAGUE_API_KEY_WDG is not set', lastAttemptAt: null, lastOutcome: null, approvedConnections: 0 }, 'warcon-data': { state: 'unconfigured', approvedConnections: 0 } });
    const keys = { LOGI_LEAGUE_API_KEY_WDG: 'synthetic-league-key-0123456789', LOGI_WARCON_API_KEY_WDG: 'synthetic-warcon-key-0123456789' };
    const hllOnly = { ...env(keys), LOGI_SOURCES_JSON: JSON.stringify([{ ...wardogs, gameId: 'hell_let_loose' }]) };
    expect(readerCapabilityStates(hllOnly)).toMatchObject({ 'league-matches': { state: 'unconfigured', detail: 'no valid Wardogs source in LOGI_SOURCES_JSON' }, 'warcon-data': { state: 'unconfigured' } });
    expect(readerCapabilityStates(env(keys, { publicServers: published }))).toMatchObject({ 'league-matches': { state: 'configured' }, 'warcon-data': { state: 'unconfigured', detail: 'no approved warconConnections on the Wardogs source' } });
    expect(readerCapabilityStates(env(keys, { publicServers: published, warconConnections: [{ connectionId: 'conn-a', publicId: 'community-one' }] }))).toMatchObject({ 'warcon-data': { state: 'configured', detail: '1 approved connection(s) on local', approvedConnections: 1 }, 'league-matches': { approvedConnections: 0 } });
    const synthetic = readerCapabilityStates({ ...env(), LOGI_READERS_SOURCE: 'synthetic-fixture' });
    expect(synthetic['warcon-data']).toMatchObject({ state: 'configured', detail: 'synthetic-fixture', approvedConnections: 0 });
    expect(synthetic['league-matches']).toMatchObject({ state: 'configured', detail: 'synthetic-fixture' });
  });

  it('reports unsupported after the deployed producer answered 404 and carries the last outcome', async () => {
    const keys = { LOGI_LEAGUE_API_KEY_WDG: 'synthetic-league-key-0123456789', LOGI_WARCON_API_KEY_WDG: 'synthetic-warcon-key-0123456789' };
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(null, { status: 404 }));
    await observeLeaguePreview(createLeagueReader(credentials, { fetchImpl }), 'scope', 'https://wardogsleague.net/matches/abc', new Date('2026-10-03T12:00:00Z'));
    await observeWarcon(createWarconReader(credentials, { fetchImpl }), 'scope', 'conn-a', 'live', new Date('2026-10-03T12:00:05Z'));
    const states = readerCapabilityStates(env(keys, { publicServers: published, warconConnections: [{ connectionId: 'conn-a', publicId: 'community-one' }] }));
    expect(states['league-matches']).toMatchObject({ state: 'unsupported', lastOutcome: 'not_found', lastAttemptAt: '2026-10-03T12:00:00.000Z' });
    expect(states['warcon-data']).toMatchObject({ state: 'unsupported', lastOutcome: 'not_found', lastAttemptAt: '2026-10-03T12:00:05.000Z' });
    expect(JSON.stringify(states)).not.toContain('synthetic-league-key');
  });

  it('names a League read the producer could not refresh while staying configured', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(Response.json({ data: leagueFixture.stale }));
    await observeLeaguePreview(createLeagueReader(credentials, { fetchImpl }), 'scope', 'https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu', new Date('2026-10-03T12:00:00Z'));
    const states = readerCapabilityStates(env({ LOGI_LEAGUE_API_KEY_WDG: 'synthetic-league-key-0123456789' }));
    expect(states['league-matches']).toMatchObject({ state: 'configured', lastOutcome: 'ok', detail: 'league-matches grant configured for local; last producer error: rate_limited' });
  });

  it('does not throw on an invalid configuration', () => {
    const states = readerCapabilityStates({ NODE_ENV: 'test', LOGI_SOURCES_JSON: 'not json', LOGI_LEAGUE_API_KEY_WDG: 'synthetic-league-key-0123456789' });
    expect(states['league-matches'].state).toBe('unconfigured');
  });
});
