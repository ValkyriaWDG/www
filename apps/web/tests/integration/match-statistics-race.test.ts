import { auditEvent, matchStatistics } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureTestActors, TEST_ACTOR_IDS, type TestActors } from '@/fixtures/test-actors';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError } from '@/modules/access/types';
import type { CrconServerConfig } from '@/modules/integrations/servers/crcon';
import { createMatch, publishMatch, recordResult } from '@/modules/matches/service';
import { syntheticScoreboard } from '@/modules/matches/statistics-fixtures';
import { importMatchStatistics, removeMatchStatistics, updateMatchStatisticsSettings } from '@/modules/matches/statistics-service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actors: TestActors;
beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
});
afterAll(async () => { await t?.drop(); });

const servers: CrconServerConfig[] = [{ publicId: 'synthetic-crcon', name: '[SYNTHETIC] CRCON', baseUrl: 'https://crcon.example.org', address: null, statsUrl: 'https://stats.example.org', serverNumber: 1, statsApiKey: null }];
const upload = (matchId: string) => ({
  source: 'upload' as const,
  matchId,
  fileName: 'synthetic-scoreboard.json',
  content: JSON.stringify(syntheticScoreboard()),
  valkyriaSide: 'axis' as const,
  publishPlayers: false,
});

let counter = 0;
/** A played HLL match whose statistics were imported by a manager with rights in every game. */
async function fixture() {
  counter += 1;
  const created = await createMatch(t.db, actors.matchManager, {
    game: 'hell-let-loose',
    opponentName: `Synthetic Statistics Race ${counter}`,
    competitionType: 'friendly',
    startsAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  });
  const completed = await recordResult(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version, scoreValkyria: 4, scoreOpponent: 1, verification: 'provisional', source: 'Synthetic' });
  await publishMatch(t.db, actors.matchManager, { id: completed.id, expectedVersion: completed.version });
  await importMatchStatistics(t.db, actors.matchManager, { ...upload(created.id), publishPlayers: true });
  return { matchId: created.id, scoped: testPrincipal(['match_manager'], { userId: TEST_ACTOR_IDS.matchManager, games: ['hell-let-loose'] }) };
}

/** Wait for an observed PostgreSQL lock, not a guessed delay between requests. */
async function waitForBlockedMutation() {
  await vi.waitFor(async () => {
    const waiting = await t.pool.query<{ query: string }>(
      "select query from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and application_name='valkyria-test' and wait_event_type='Lock'",
    );
    expect(waiting.rows.some(({ query }) => /"(?:match|match_statistics)"/.test(query))).toBe(true);
  }, { timeout: 3000, interval: 10 });
}

const snapshot = async (matchId: string) => t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, matchId));

describe('match statistics after a concurrent move of the match to another game', () => {
  it.each(['import', 'import-crcon', 'import-url', 'update', 'remove'] as const)('denies %s to an HLL-only manager once the match left HLL', async (operation) => {
    const { matchId, scoped } = await fixture();
    const before = await snapshot(matchId);
    expect(before).toHaveLength(1);
    const blocker = await t.pool.connect();
    await blocker.query('begin');
    // Both versions wait deterministically: an unlocked check reaches the statistics row
    // lock; the fixed service must first lock and recheck the match. The move commits
    // before either continues.
    await blocker.query('select id from "match" where id=$1 for update', [matchId]);
    await blocker.query('select match_id from match_statistics where match_id=$1 for update', [matchId]);
    const fetches: string[] = [];
    const pending =
      operation === 'import'
        ? importMatchStatistics(t.db, scoped, upload(matchId))
        : operation === 'import-crcon' || operation === 'import-url'
          ? importMatchStatistics(
              t.db,
              scoped,
              operation === 'import-url'
                ? { source: 'crcon-url', matchId, serverPublicId: 'synthetic-crcon', gameUrl: 'https://stats.example.org/games/77', valkyriaSide: 'allies', publishPlayers: false }
                : { source: 'crcon', matchId, serverPublicId: 'synthetic-crcon', gameId: 77, valkyriaSide: 'allies', publishPlayers: false },
              {
                servers,
                fetchImpl: async (url) => {
                  fetches.push(url.toString());
                  return new Response(JSON.stringify(syntheticScoreboard({ gameId: 77, perSide: 2 })), { headers: { 'content-type': 'application/json' } });
                },
              },
            )
          : operation === 'update'
            ? updateMatchStatisticsSettings(t.db, scoped, { matchId, valkyriaSide: 'allies', publishPlayers: false })
            : removeMatchStatistics(t.db, scoped, { matchId });
    const result = pending.then((value) => ({ value, error: null }), (error: unknown) => ({ value: null, error }));
    let fetchedBeforeBlocking: string[] = [];
    try {
      await waitForBlockedMutation();
      fetchedBeforeBlocking = [...fetches];
      await blocker.query("update \"match\" set game='wardogs', version=version+1 where id=$1", [matchId]);
      await blocker.query('commit');
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    const outcome = await result;
    expect(outcome.error).toBeInstanceOf(AccessDeniedError);
    expect(outcome.error).toMatchObject({ code: 'forbidden' });
    // The slow CRCON request completed before the mutation waited for any lock.
    if (operation === 'import-crcon' || operation === 'import-url') expect(fetchedBeforeBlocking).toEqual(['https://crcon.example.org/api/get_map_scoreboard?map_id=77']);
    expect(await snapshot(matchId)).toEqual(before);
    const action = `match.statistics.${operation.startsWith('import') ? 'import' : operation}`;
    const denials = await t.db
      .select({ summary: auditEvent.summary })
      .from(auditEvent)
      .where(and(eq(auditEvent.entityId, matchId), eq(auditEvent.action, action), eq(auditEvent.outcome, 'denied')));
    expect(denials).toEqual([{ summary: { code: 'forbidden', reason: 'game_scope' } }]);
  });
});
