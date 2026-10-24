import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import { type LogiFetch } from '../transport';
import { historyHllRecordSchema, historyRecordSchema, type HistoryPage } from './history-contracts';
import { configuredHistorySource, createHistoryPlayerKey, createHistoryReader, getHistoryGames, getHistoryReport, listHistoryPublicIds, resetHistoryReaderForTests, scanHistory } from './history';
import { aggregateHistory, latestHistoryRecords } from './history-report';
import { DEFAULT_HISTORY_PUBLIC_FILTERS, toHistoryGamesPublic, toHistoryReportPublic, type HistoryPublicContext } from './history-public';
import { observeHistory, resetHistoryStoreForTests } from './history-store';
import { SYNTHETIC_HLL_HISTORY_PUBLIC_ID, SYNTHETIC_HLL_HISTORY_SOURCE_ID, SYNTHETIC_HISTORY_GUILD_ID, SYNTHETIC_HISTORY_SOURCE_ID, SYNTHETIC_WARCON_PUBLIC_ID, syntheticHllHistoryPages, syntheticHistoryPages } from './synthetic';

const now = new Date('2026-10-25T00:00:00.000Z');
const hll = () => historyHllRecordSchema.parse(syntheticHllHistoryPages(now)[0]!.items[0]);
const filters = { ...DEFAULT_HISTORY_PUBLIC_FILTERS, minMinutes: 0 };
const context = (publishPlayers = true): HistoryPublicContext => ({ publicId: 'hll-one', state: 'fresh', synthetic: false, coverage: { kind: 'all', from: null }, refreshedAt: now.toISOString(), lastCollectedAt: now.toISOString(), publishPlayers, playerKey: createHistoryPlayerKey('hll-scope', SYNTHETIC_HLL_HISTORY_SOURCE_ID) });
const source = { origin: 'https://logi.example', apiKey: 'synthetic-hll-history-key', gameId: 'hell_let_loose' as const, guildId: SYNTHETIC_HISTORY_GUILD_ID, environment: 'test' as const, allowLoopbackHttp: false, historySources: [{ sourceId: SYNTHETIC_HLL_HISTORY_SOURCE_ID, publicId: 'hll-one', publishPlayers: true }] };

afterEach(() => { resetHistoryStoreForTests(); resetHistoryReaderForTests(); vi.unstubAllEnvs(); resetServerEnvForTests(); });

describe('HLL retained history contract and scope', () => {
  it('accepts the complete HLL branch and rejects mixed provider/game metadata and invented player outcomes', () => {
    const record = hll();
    expect(historyRecordSchema.parse(record)).toEqual(record);
    for (const invalid of [
      { ...record, provider: 'wardogs_warcon' },
      { ...record, gameId: 'wardogs' },
      { ...record, session: { ...record.session, warcon: syntheticHistoryPages(now)[0]!.items[0]!.session.warcon } },
      { ...record, session: { ...record.session, complete: false } },
      { ...record, session: { ...record.session, externalId: 'not-a-crcon-session' } },
      { ...record, session: { ...record.session, endedAt: record.session.startedAt.replace('2026', '2025') } },
      { ...record, session: { ...record.session, participants: [{ id: 'axis', label: 'Axis', score: 1 }] } },
      { ...record, session: { ...record.session, participants: [{ id: 'allied', label: 'Allies', score: -1 }, record.session.participants[1]] } },
      { ...record, session: { ...record.session, players: [{ ...record.session.players[0], result: 'win' }] } },
      { ...record, session: { ...record.session, players: [{ ...record.session.players[0], faction: 'Axis' }] } },
      { ...record, session: { ...record.session, players: [{ ...record.session.players[0], metrics: { combat: -1 } }] } },
      { ...record, session: { ...record.session, players: [{ ...record.session.players[0], metrics: { seconds: 5400 } }] } },
      { ...record, session: { ...record.session, players: [record.session.players[0], record.session.players[0]] } },
    ]) expect(historyRecordSchema.safeParse(invalid).success).toBe(false);
    expect(historyRecordSchema.safeParse({ ...record, session: { ...record.session, players: [{ platform: 'unknown', platformId: 'private-unknown', metrics: {} }] } }).success).toBe(true);
  });

  it('uses the explicit HLL query and key and rejects a valid Wardogs record, foreign source or guild', async () => {
    const page = syntheticHllHistoryPages(now)[0]!;
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(Response.json({ data: page }));
    const reader = createHistoryReader(source, { fetchImpl });
    await reader.readPage({ filters: { sourceId: source.historySources[0]!.sourceId }, cursor: null });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(new URL(url).searchParams.get('game')).toBe('hell_let_loose');
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${source.apiKey}`);
    expect(init.cache).toBe('no-store');
    const read = (items: HistoryPage['items']) => createHistoryReader(source, { fetchImpl: vi.fn<LogiFetch>().mockResolvedValue(Response.json({ data: { ...page, items } })) }).readPage({ filters: { sourceId: SYNTHETIC_HLL_HISTORY_SOURCE_ID }, cursor: null });
    await expect(read([{ ...hll(), guildId: 'another-guild' }])).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(read([{ ...hll(), sourceId: 'ff'.repeat(32) }])).rejects.toMatchObject({ code: 'scope_mismatch' });
    const wardogs = { ...syntheticHistoryPages(now)[0]!.items[0]!, sourceId: SYNTHETIC_HLL_HISTORY_SOURCE_ID };
    await expect(read([wardogs])).rejects.toMatchObject({ code: 'scope_mismatch' });
  });

  it('rejects cross-game/source/guild scans without returning partial records', async () => {
    const first = syntheticHllHistoryPages(now)[0]!;
    const foreign = syntheticHistoryPages(now)[0]!.items[0]!;
    for (const other of [{ ...hll(), guildId: 'foreign' }, { ...hll(), sourceId: 'ff'.repeat(32) }, { ...foreign, sourceId: SYNTHETIC_HLL_HISTORY_SOURCE_ID }]) {
      let call = 0;
      const reader = { readPage: async () => call++ === 0 ? { ...first, nextCursor: 'continue' } : { ...first, items: [other], nextCursor: null } };
      await expect(scanHistory(reader, { sourceId: SYNTHETIC_HLL_HISTORY_SOURCE_ID })).rejects.toMatchObject({ reason: 'scope_mismatch' });
      expect(() => latestHistoryRecords([hll(), other])).toThrow(/Mixed history/);
    }
  });
});

describe('HLL report and publication', () => {
  it('sums only supplied score metrics with coverage, preserves zero and unknown time, and never infers outcomes', () => {
    const records = syntheticHllHistoryPages(now).flatMap((page) => page.items);
    const report = aggregateHistory(records, 0);
    expect(report).toMatchObject({ games: 3, eligiblePlayers: 1, feedGames: 0, outcomes: { decided: 0, draw: 0, no_result: 0, unknown: 3 } });
    const player = report.players[0]!;
    expect(player).toMatchObject({ matches: 3, wins: 0, losses: 0, draws: 0, unknownResults: 3, winRate: null, kd: null, eligible: true });
    expect(player.metrics).toMatchObject({ kills: { value: 20, knownGames: 2 }, deaths: { value: 15, knownGames: 3 }, combat: { value: 200, knownGames: 2 }, offense: { value: 0, knownGames: 3 }, defense: { value: 240, knownGames: 3 }, support: { value: 120, knownGames: 2 }, seconds: { value: null, knownGames: 0 }, cashDelta: { value: null, knownGames: 0 } });
    expect(aggregateHistory(records, 60).eligiblePlayers).toBe(0);
    const nonzero = hll();
    nonzero.session.participants[0]!.score = 5;
    nonzero.session.participants[1]!.score = 0;
    expect(aggregateHistory([nonzero], 0)).toMatchObject({ outcomes: { unknown: 1, decided: 0 }, players: [{ wins: 0, losses: 0, unknownResults: 1 }] });
    expect(report.factions).toEqual([]);
    nonzero.session.players[0]!.metrics.kills = 4;
    nonzero.session.players[0]!.metrics.deaths = 0;
    expect(aggregateHistory([nonzero], 0).players[0]!.kd).toBe(4);
    nonzero.session.players[0]!.metrics.kills = 0;
    expect(aggregateHistory([nonzero], 0).players[0]!.kd).toBe(0);
    nonzero.session.players[0]!.metrics.deaths = null;
    expect(aggregateHistory([nonzero], 0).players[0]!.kd).toBeNull();
  });

  it('projects opaque players and both sides, redacts all provider identities and honors history publication separately', () => {
    const records = syntheticHllHistoryPages(now).flatMap((page) => page.items);
    const report = toHistoryReportPublic(context(), filters, aggregateHistory(records, 0), []);
    const games = toHistoryGamesPublic(context(), filters, records, 1);
    expect(report.players![0]!.key).toMatch(/^[a-f0-9]{16}$/);
    expect(games.games[0]!.players![0]!.key).toBe(report.players![0]!.key);
    expect(games.games[0]).toMatchObject({ outcome: 'unknown', winner: null, mode: null, lighting: null, hasFeed: false, factions: [{ name: 'Allies', score: null }, { name: 'Axis', score: null }] });
    expect(games.games[0]!.players![0]).toMatchObject({ combat: 100, offense: 0, seconds: null, result: null, faction: null });
    expect(JSON.stringify({ report, games })).not.toMatch(/platformId|sourceId|guildId|sourceDigest|externalId|serverName|scopeKey|private-synthetic|HLL History Server|"revision"/);
    expect(toHistoryReportPublic(context(false), filters, aggregateHistory(records, 0), []).players).toBeNull();
    expect(toHistoryGamesPublic(context(false), filters, records, 1).games.every((game) => game.players === null)).toBe(true);
  });

  it('keeps independently configured HLL and Wardogs keys, public IDs and snapshot state isolated', async () => {
    const makeSource = (gameId: 'wardogs' | 'hell_let_loose', publicId: string, sourceId: string) => ({ sourceInstanceId: 'same-instance', origin: 'https://logi.example', guildId: SYNTHETIC_HISTORY_GUILD_ID, gameId, publicServers: [{ connectionId: `private-${gameId}`, publicId, name: 'Synthetic server', address: null, statsUrl: null, published: true }], historySources: [{ sourceId, publicId, publishPlayers: true }] });
    const env = { LOGI_SOURCES_JSON: JSON.stringify([makeSource('wardogs', 'wdg-one', SYNTHETIC_HISTORY_SOURCE_ID), makeSource('hell_let_loose', 'hll-one', SYNTHETIC_HLL_HISTORY_SOURCE_ID)]), LOGI_HISTORY_API_KEY_HLL: 'synthetic-hll-history-key', LOGI_HISTORY_API_KEY_WDG: 'synthetic-wdg-history-key' };
    const configured = configuredLogiSources(env, 'history');
    expect(configured).toHaveLength(2);
    expect(configuredHistorySource(env, 'hell_let_loose')?.apiKey).toBe(env.LOGI_HISTORY_API_KEY_HLL);
    expect(configuredHistorySource(env)?.apiKey).toBe(env.LOGI_HISTORY_API_KEY_WDG);
    expect(configured[0]!.scopeKey).not.toBe(configured[1]!.scopeKey);
    const hllPage = syntheticHllHistoryPages(now)[0]!;
    const snapshot = await observeHistory(async () => ({ revision: '1', records: hllPage.items, pages: 1, resets: 0, lastCollectedAt: hllPage.lastCollectedAt }), configured.find((row) => row.gameId === 'hell_let_loose')!.scopeKey, SYNTHETIC_HLL_HISTORY_SOURCE_ID, now);
    const denied = await observeHistory(async () => { throw new Error('synthetic failure'); }, configured.find((row) => row.gameId === 'wardogs')!.scopeKey, SYNTHETIC_HISTORY_SOURCE_ID, now);
    expect(snapshot.state).toBe('fresh');
    expect(snapshot.snapshot?.records.every((record) => record.gameId === 'hell_let_loose')).toBe(true);
    expect(denied.snapshot).toBeNull();
    vi.stubEnv('LOGI_READERS_SOURCE', 'synthetic-fixture'); resetServerEnvForTests();
    expect(listHistoryPublicIds('hell_let_loose')).toEqual([SYNTHETIC_HLL_HISTORY_PUBLIC_ID]);
    expect(listHistoryPublicIds()).toEqual([SYNTHETIC_WARCON_PUBLIC_ID]);
    expect(await getHistoryReport(SYNTHETIC_WARCON_PUBLIC_ID, filters, now, 'hell_let_loose')).toBeNull();
    const hllReport = await getHistoryReport(SYNTHETIC_HLL_HISTORY_PUBLIC_ID, filters, now, 'hell_let_loose');
    expect(hllReport).toMatchObject({ state: 'fresh', games: 3, eligiblePlayers: 1 });
    expect((await getHistoryGames(SYNTHETIC_HLL_HISTORY_PUBLIC_ID, filters, 1, now, 'hell_let_loose'))?.games).toHaveLength(3);
  });
});
