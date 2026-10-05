import { match } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { attachPublicLogiArchiveLinks } from '@/modules/integrations/logi-match-links';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { getPublicMatch, getPublicMatchCounts, listPublicMatches } from '@/modules/matches/queries';
import { createMatch, publishMatch, recordResult } from '@/modules/matches/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
let actors: TestActors;
beforeAll(async () => { database = await createTestDatabase(); actors = await ensureTestActors(database.db); });
afterAll(async () => { await database.drop(); });

const event = (id: string, game: 'hll' | 'wardogs' = 'hll'): PublicLogiEvent => ({
  ref: { source: 'logi', sourceInstanceId: 'synthetic-source', guildId: '100000000000000001', game, kind: 'match', externalId: id },
  title: 'Synthetic linked fixture', kind: 'match', status: 'concluded', startsAt: '2026-10-01T18:00:00Z', endsAt: '2026-10-01T20:00:00Z',
  sourceUpdatedAt: null, observedAt: '2026-10-01T20:01:00Z', teams: [],
  result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null },
});
const environment = (matchId: string) => ({
  LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: 'synthetic-source', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'hell_let_loose', publishMatches: true, matchLinks: [{ eventId: 'linked-event', matchId }] }]),
  LOGI_DATA_API_KEY_HLL: 'synthetic-data-key-0123456789',
});

describe('reviewed Logi/archive associations on PostgreSQL', () => {
  it('deduplicates only a visible same-game association while preserving the old detail and result', async () => {
    const created = await createMatch(database.db, actors.matchManager, { game: 'hell-let-loose', opponentName: 'Synthetic archive opponent', competitionType: 'friendly', startsAt: '2026-10-01T18:00:00Z' });
    const published = await publishMatch(database.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    await recordResult(database.db, actors.matchManager, { id: created.id, expectedVersion: published.version, scoreValkyria: 3, scoreOpponent: 1, verification: 'verified', source: 'Synthetic archive evidence' });
    const linked = await attachPublicLogiArchiveLinks(database.db, environment(created.id), [event('linked-event'), event('unrelated')]);
    expect(linked[0]?.archive).toMatchObject({ slug: created.slug, opponentName: 'Synthetic archive opponent' });
    expect(linked[1]?.archive).toBeUndefined();
    const excluded = linked.flatMap((row) => row.archive ? [row.archive.slug] : []);
    expect((await listPublicMatches(database.db, { view: 'results' }, excluded)).items).toEqual([]);
    expect((await getPublicMatchCounts(database.db, excluded)).results).toBe(0);
    expect(await getPublicMatch(database.db, created.slug, 'cs')).toMatchObject({ slug: created.slug, result: { scoreValkyria: 3, scoreOpponent: 1 } });
    // A stale, unpublished or removed provider event is absent from the public input.
    const unavailable = await attachPublicLogiArchiveLinks(database.db, environment(created.id), []);
    expect((await listPublicMatches(database.db, { view: 'results' }, unavailable.flatMap((row) => row.archive ? [row.archive.slug] : []))).items.map((row) => row.slug)).toContain(created.slug);
    expect(await attachPublicLogiArchiveLinks(database.db, environment(created.id), [event('linked-event', 'wardogs')])).toEqual([event('linked-event', 'wardogs')]);
    expect((await attachPublicLogiArchiveLinks(database.db, environment(created.id), [{ ...event('linked-event'), ref: { ...event('linked-event').ref, guildId: '100000000000000002' } }]))[0]?.archive).toBeUndefined();
    await database.db.update(match).set({ publication: 'draft' }).where(eq(match.id, created.id));
    expect((await attachPublicLogiArchiveLinks(database.db, environment(created.id), [event('linked-event')]))[0]?.archive).toBeUndefined();
    expect(await getPublicMatch(database.db, created.slug, 'cs')).toBeNull();
  });

  it('does not expose an archive entry of another game even with an explicit binding', async () => {
    const created = await createMatch(database.db, actors.matchManager, { game: 'wardogs', opponentName: 'Synthetic other game', competitionType: 'friendly', startsAt: '2026-10-01T18:00:00Z' });
    await publishMatch(database.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    expect((await attachPublicLogiArchiveLinks(database.db, environment(created.id), [event('linked-event')]))[0]?.archive).toBeUndefined();
  });
});
