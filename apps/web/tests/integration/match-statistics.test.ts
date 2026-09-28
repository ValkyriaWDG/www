import { auditEvent, matchStatistics } from '@valkyria/db';
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
