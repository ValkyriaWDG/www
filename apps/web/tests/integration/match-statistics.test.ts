import { auditEvent, legacyMatchScoreboard, matchStatistics } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { AccessDeniedError } from '@/modules/access/types';
import { getMatchForAdmin, getPublicMatch } from '@/modules/matches/queries';
import { createMatch, publishMatch, recordResult } from '@/modules/matches/service';
import { syntheticScoreboard } from '@/modules/matches/statistics-fixtures';
import { importMatchStatistics, removeMatchStatistics, updateMatchStatisticsSettings } from '@/modules/matches/statistics-service';
import type { CrconServerConfig } from '@/modules/integrations/servers/crcon';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actors: TestActors;

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
});
afterAll(async () => {
  await t.drop();
});

let counter = 0;
async function playedMatch(game: 'hell-let-loose' | 'wardogs' = 'hell-let-loose') {
  counter += 1;
  const created = await createMatch(t.db, actors.matchManager, {
    game,
    opponentName: `Synthetic Statistics Opponent ${counter}`,
    opponentShortCode: `SSO${counter}`,
    competitionType: 'friendly',
    startsAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  });
  const completed = await recordResult(t.db, actors.matchManager, {
    id: created.id,
    expectedVersion: created.version,
    scoreValkyria: 4,
    scoreOpponent: 1,
    verification: 'provisional',
    source: 'Synthetic',
  });
  return publishMatch(t.db, actors.matchManager, { id: completed.id, expectedVersion: completed.version });
}

const upload = (matchId: string, extra: Record<string, unknown> = {}) => ({
  source: 'upload' as const,
  matchId,
  fileName: 'synthetic-scoreboard.json',
  content: JSON.stringify(syntheticScoreboard()),
  valkyriaSide: 'axis' as const,
  publishPlayers: false,
  ...extra,
});

async function expectError(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('match statistics import', () => {
  const eventServer: CrconServerConfig = { publicId: 'event', name: 'Event server', baseUrl: 'https://admin.example.org', statsUrl: 'https://event.example.org', address: null, serverNumber: 6 };
  const linked = (id: string, gameUrl = 'https://event.example.org/games/16551') => ({ source: 'crcon-url' as const, matchId: id, serverPublicId: 'event', gameUrl, valkyriaSide: 'allies' as const, publishPlayers: true });

  it('imports a trusted game URL through the configured API, stores provenance and preserves the editorial score', async () => {
    const played = await playedMatch();
    const before = (await getMatchForAdmin(t.db, actors.matchManager, played.id))!.result;
    const requested: string[] = [];
    const view = await importMatchStatistics(t.db, actors.matchManager, linked(played.id), {
      servers: [eventServer],
      fetchImpl: async (url) => {
        requested.push(url.toString());
        const body = syntheticScoreboard({ gameId: 16551 });
        body.result.server_number = 6;
        return Response.json(body);
      },
    });
    expect(requested).toEqual(['https://admin.example.org/api/get_map_scoreboard?map_id=16551']);
    expect(view).toMatchObject({ source: 'crcon', sourceServerPublicId: 'event', sourceGameUrl: 'https://event.example.org/games/16551', externalGameId: '16551', publishPlayers: true });
    expect((await getPublicMatch(t.db, played.slug, 'cs'))?.statistics).toMatchObject({ sourceGameUrl: view.sourceGameUrl, sourceServerPublicId: 'event' });
    expect((await getMatchForAdmin(t.db, actors.matchManager, played.id))!.result).toEqual(before);
  });

  it('rejects an untrusted URL before fetching and leaves an existing snapshot untouched', async () => {
    const played = await playedMatch();
    await importMatchStatistics(t.db, actors.matchManager, upload(played.id));
    const before = await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, played.id));
    let fetched = false;
    const error = await expectError(importMatchStatistics(t.db, actors.matchManager, linked(played.id, 'https://evil.example/games/16551'), {
      servers: [eventServer], fetchImpl: async () => { fetched = true; return Response.json({}); },
    }));
    expect(error).toMatchObject({ code: 'validation', fieldErrors: { gameUrl: 'game_url_invalid' } });
    expect(fetched).toBe(false);
    expect(await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, played.id))).toEqual(before);
  });

  it.each([
    ['another game', { id: 16552 }, 'scoreboard_source_mismatch'],
    ['another server in the shared history database', { server_number: 1 }, 'scoreboard_source_mismatch'],
    ['missing server identity', { server_number: null }, 'scoreboard_source_mismatch'],
    ['an unfinished game', { end: null }, 'scoreboard_unfinished'],
    ['an end before the start', { end: '2024-05-12T17:00:00' }, 'scoreboard_unfinished'],
    ['a future end', { end: '2099-01-01T12:00:00Z' }, 'scoreboard_unfinished'],
    ['an unknown result', { result: {} }, 'scoreboard_unfinished'],
  ])('rejects %s before replacing statistics', async (_label, overrides, code) => {
    const played = await playedMatch();
    await importMatchStatistics(t.db, actors.matchManager, upload(played.id));
    const before = await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, played.id));
    const body = syntheticScoreboard({ gameId: 16551 });
    Object.assign(body.result, { server_number: 6 }, overrides);
    const deps = { servers: [eventServer], fetchImpl: async () => Response.json(body) };
    const urlError = await expectError(importMatchStatistics(t.db, actors.matchManager, linked(played.id), deps));
    expect(urlError).toMatchObject({ code: 'validation', fieldErrors: { gameUrl: code } });
    const idError = await expectError(importMatchStatistics(t.db, actors.matchManager, { source: 'crcon', matchId: played.id, serverPublicId: 'event', gameId: 16551, valkyriaSide: 'allies', publishPlayers: false }, deps));
    expect(idError).toMatchObject({ code: 'validation', fieldErrors: { gameId: code } });
    expect(await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, played.id))).toEqual(before);
    const imports = await t.db.select().from(auditEvent).where(and(eq(auditEvent.entityId, played.id), eq(auditEvent.action, 'match.statistics.import')));
    expect(imports).toHaveLength(1);
  });

  it('keeps an uploaded malformed result unknown and removes any old source link on replacement', async () => {
    const played = await playedMatch();
    const body = syntheticScoreboard({ gameId: 16551 });
    body.result.server_number = 6;
    await importMatchStatistics(t.db, actors.matchManager, linked(played.id), { servers: [eventServer], fetchImpl: async () => Response.json(body) });
    Object.assign(body.result, { result: {} });
    const view = await importMatchStatistics(t.db, actors.matchManager, upload(played.id, { content: JSON.stringify(body) }));
    expect(view).toMatchObject({ source: 'upload', sourceServerPublicId: null, sourceGameUrl: null, result: null });
  });

  it('loads all historical rounds, preserves side swaps, gates players together and clears rounds on replacement or removal', async () => {
    const played = await playedMatch();
    const primary = await importMatchStatistics(t.db, actors.matchManager, upload(played.id));
    const extra = { ...primary, externalGameId: '4243', sourceGameUrl: 'https://stats.example.org/games/4243', valkyriaSide: 'allies' as const, players: primary.players! };
    const addRound = () => t.db.insert(legacyMatchScoreboard).values({ matchId: played.id, ordinal: 2, snapshot: extra });
    await addRound();
    expect((await getPublicMatch(t.db, played.slug, 'cs'))?.statistics?.rounds).toMatchObject([{ ordinal: 2, statistics: { externalGameId: '4243', players: null, valkyriaSide: 'allies' } }]);
    expect((await getMatchForAdmin(t.db, actors.matchManager, played.id))?.statistics?.rounds?.[0]?.statistics.players).toHaveLength(12);
    await updateMatchStatisticsSettings(t.db, actors.matchManager, { matchId: played.id, valkyriaSide: 'axis', publishPlayers: true });
    const shown = (await getPublicMatch(t.db, played.slug, 'cs'))?.statistics;
    expect(shown?.rounds?.[0]?.statistics.players).toHaveLength(12);
    expect(shown?.rounds?.[0]?.statistics.valkyriaSide).toBe('allies');
    await importMatchStatistics(t.db, actors.matchManager, upload(played.id));
    expect(await t.db.select().from(legacyMatchScoreboard).where(eq(legacyMatchScoreboard.matchId, played.id))).toEqual([]);
    await addRound();
    await removeMatchStatistics(t.db, actors.matchManager, { matchId: played.id });
    expect(await t.db.select().from(legacyMatchScoreboard).where(eq(legacyMatchScoreboard.matchId, played.id))).toEqual([]);
  });

  it('lets an editor change player visibility while keeping an unknown historical side unassigned', async () => {
    const played = await playedMatch();
    await importMatchStatistics(t.db, actors.matchManager, upload(played.id, { publishPlayers: true }));
    await t.db.update(matchStatistics).set({ valkyriaSide: null }).where(eq(matchStatistics.matchId, played.id));
    const view = await updateMatchStatisticsSettings(t.db, actors.matchManager, { matchId: played.id, valkyriaSide: null, publishPlayers: false });
    expect(view.valkyriaSide).toBeNull();
    expect((await getPublicMatch(t.db, played.slug, 'cs'))?.statistics).toMatchObject({ valkyriaSide: null, players: null, publishPlayers: false });
  });

  it('imports an uploaded scoreboard, keeps player rows private until published, and audits it', async () => {
    const played = await playedMatch();
    const view = await importMatchStatistics(t.db, actors.matchManager, upload(played.id));
    expect(view).toMatchObject({
      source: 'upload',
      sourceLabel: 'synthetic-scoreboard.json',
      externalGameId: '4242',
      mapName: 'Synthetic Map D',
      mode: 'Warfare',
      result: { allied: 1, axis: 4 },
      valkyriaSide: 'axis',
      playerCount: 12,
      publishPlayers: false,
    });
    expect(view.players).toHaveLength(12);
    const stored = (await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, played.id)))[0]!;
    expect(JSON.stringify(stored.players)).not.toMatch(/7656119|must not be imported/);

    const hidden = await getPublicMatch(t.db, played.slug, 'cs');
    expect(hidden?.statistics).toMatchObject({ playerCount: 12, players: null, teams: { axis: { players: 6 } } });

    await updateMatchStatisticsSettings(t.db, actors.matchManager, { matchId: played.id, valkyriaSide: 'axis', publishPlayers: true });
    const shown = await getPublicMatch(t.db, played.slug, 'en');
    expect(shown?.statistics?.players?.[0]?.name).toBe('[SYN] Allies Player 01');
    expect((await getMatchForAdmin(t.db, actors.matchManager, played.id))?.statistics?.publishPlayers).toBe(true);

    const audits = await t.db.select().from(auditEvent).where(and(eq(auditEvent.entityId, played.id), eq(auditEvent.action, 'match.statistics.import')));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.summary).toMatchObject({ source: 'upload', players: 12, publishPlayers: false });
  });

  it('downloads the scoreboard from a configured CRCON server by game ID and replaces the previous import', async () => {
    const played = await playedMatch();
    await importMatchStatistics(t.db, actors.matchManager, upload(played.id));
    const servers: CrconServerConfig[] = [{ publicId: 'valkyria-1', name: 'Valkyria #1', baseUrl: 'https://crcon.example.org', address: null, statsUrl: null, statsApiKey: null }];
    const requested: string[] = [];
    const view = await importMatchStatistics(
      t.db,
      actors.matchManager,
      { source: 'crcon', matchId: played.id, serverPublicId: 'valkyria-1', gameId: 777, valkyriaSide: 'allies', publishPlayers: false },
      {
        servers,
        fetchImpl: async (url) => {
          requested.push(url.toString());
          return new Response(JSON.stringify(syntheticScoreboard({ gameId: 777, perSide: 3 })), { headers: { 'content-type': 'application/json' } });
        },
      },
    );
    expect(requested).toEqual(['https://crcon.example.org/api/get_map_scoreboard?map_id=777']);
    expect(view).toMatchObject({ source: 'crcon', sourceLabel: 'Valkyria #1', externalGameId: '777', playerCount: 6, valkyriaSide: 'allies' });
    expect(await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, played.id))).toHaveLength(1);

    const unknown = await expectError(
      importMatchStatistics(t.db, actors.matchManager, { source: 'crcon', matchId: played.id, serverPublicId: 'other', gameId: 1, valkyriaSide: 'allies', publishPlayers: false }, { servers }),
    );
    expect(unknown).toBeInstanceOf(DomainError);
    expect((unknown as DomainError).fieldErrors).toEqual({ serverPublicId: 'unknown_server' });
    const down = await expectError(
      importMatchStatistics(
        t.db,
        actors.matchManager,
        { source: 'crcon', matchId: played.id, serverPublicId: 'valkyria-1', gameId: 2, valkyriaSide: 'allies', publishPlayers: false },
        { servers, fetchImpl: async () => new Response('down', { status: 503 }) },
      ),
    );
    expect((down as DomainError).code).toBe('unavailable');
  });

  it('rejects files that are not scoreboards, non-HLL matches and editors without match rights', async () => {
    const played = await playedMatch();
    const notJson = await expectError(importMatchStatistics(t.db, actors.matchManager, upload(played.id, { content: 'not json' })));
    expect((notJson as DomainError).fieldErrors).toEqual({ file: 'invalid_scoreboard' });
    const empty = await expectError(importMatchStatistics(t.db, actors.matchManager, upload(played.id, { content: '{"result":{"player_stats":[]}}' })));
    expect((empty as DomainError).fieldErrors).toEqual({ file: 'invalid_scoreboard' });

    const wardogs = await playedMatch('wardogs');
    const wrongGame = await expectError(importMatchStatistics(t.db, actors.matchManager, upload(wardogs.id)));
    expect((wrongGame as DomainError).fieldErrors).toEqual({ source: 'hll_only' });

    expect(await expectError(importMatchStatistics(t.db, actors.editor, upload(played.id)))).toBeInstanceOf(AccessDeniedError);
    expect(await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, played.id))).toHaveLength(0);
  });

  it('removes imported statistics from the admin record and the public detail', async () => {
    const played = await playedMatch();
    await importMatchStatistics(t.db, actors.matchManager, upload(played.id));
    await removeMatchStatistics(t.db, actors.matchManager, { matchId: played.id });
    expect((await getPublicMatch(t.db, played.slug, 'cs'))?.statistics).toBeNull();
    const again = await expectError(removeMatchStatistics(t.db, actors.matchManager, { matchId: played.id }));
    expect((again as DomainError).code).toBe('not_found');
  });
});
