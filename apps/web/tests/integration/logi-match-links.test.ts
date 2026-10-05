import { match } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { attachPublicLogiArchiveLinks } from '@/modules/integrations/logi-match-links';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { getPublicMatch, getPublicMatchCounts, getUnifiedPublicMatchCounts, listPublicMatches, listUnifiedPublicMatches } from '@/modules/matches/queries';
import { publicMatchRowKey } from '@/modules/matches/public-browser';
import { createMatch, publishMatch, recordResult } from '@/modules/matches/service';
import { socialImageResponse, type SocialDeps } from '@/modules/social/handler';
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
  it('rechecks the current binding and publication before serving a cached sharing card', async () => {
    const created = await createMatch(database.db, actors.matchManager, { game: 'hell-let-loose', opponentName: 'Synthetic sharing opponent', competitionType: 'friendly', startsAt: '2026-10-01T18:00:00Z' });
    const published = await publishMatch(database.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    await recordResult(database.db, actors.matchManager, { id: created.id, expectedVersion: published.version, scoreValkyria: 3, scoreOpponent: 1, verification: 'verified', source: 'Synthetic archive evidence' });
    const current = { ...event('linked-event'), result: { ...event('linked-event').result, state: 'corrected' as const, participants: [{ id: 'a', label: 'Axis', score: 0 }, { id: 'b', label: 'Allies', score: 5 }] } };
    let events = await attachPublicLogiArchiveLinks(database.db, environment(created.id), [current]);
    const deps: SocialDeps = { db: () => database.db, matchEvents: async () => events, mediaRoot: '/not-used', siteOrigin: 'https://connected-sharing.example.test', render: async (card) => new TextEncoder().encode(JSON.stringify(card)) };
    const request = new Request(`https://site.example/api/social/en/matches/${created.slug}`);
    const params = { locale: 'en', kind: 'matches', slug: [created.slug] };
    const first = await socialImageResponse(request, params, deps);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ score: null, participantScores: [{ label: 'Axis', value: '0' }, { label: 'Allies', value: '5' }] });
    events = events.map((row) => ({ ...row, result: { ...row.result, state: 'unknown', participants: [] } }));
    expect(await (await socialImageResponse(request, params, deps)).json()).toMatchObject({ score: null, participantScores: [] });
    // Stale/removed projections are absent at the public reader boundary.
    events = [];
    expect(await (await socialImageResponse(request, params, deps)).json()).toMatchObject({ score: '3 : 1' });
    await database.db.update(match).set({ publication: 'draft' }).where(eq(match.id, created.id));
    expect((await socialImageResponse(request, params, deps)).status).toBe(404);
  });

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
    expect((await listUnifiedPublicMatches(database.db, { view: 'results', q: 'archive opponent' }, linked)).items.map(publicMatchRowKey)).toEqual(['connected:hll:linked-event']);
    expect((await getUnifiedPublicMatchCounts(database.db, linked)).results).toBe(2);
    expect(await getPublicMatch(database.db, created.slug, 'cs')).toMatchObject({ slug: created.slug, result: { scoreValkyria: 3, scoreOpponent: 1 } });
    // A stale, unpublished or removed provider event is absent from the public input.
    const unavailable = await attachPublicLogiArchiveLinks(database.db, environment(created.id), []);
    expect((await listUnifiedPublicMatches(database.db, { view: 'results' }, unavailable)).items.map(publicMatchRowKey)).toEqual([`website:${created.slug}`]);
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

  it('counts, searches and paginates one interleaved schedule on PostgreSQL', async () => {
    const slugs: string[] = [];
    const connected = Array.from({ length: 7 }, (_, index) => ({ ...event(`unified-${index}`), title: 'Unified Synthetic Schedule', startsAt: `2020-10-${String(2 * index + 1).padStart(2, '0')}T18:00:00Z` }));
    for (let index = 0; index < 7; index++) {
      const created = await createMatch(database.db, actors.matchManager, { game: 'hell-let-loose', opponentName: 'Unified Synthetic Schedule', competitionType: 'friendly', startsAt: `2020-10-${String(2 * index + 2).padStart(2, '0')}T18:00:00Z` });
      const published = await publishMatch(database.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
      await recordResult(database.db, actors.matchManager, { id: created.id, expectedVersion: published.version, scoreValkyria: 0, scoreOpponent: 1, verification: 'verified', source: 'Synthetic fixture' });
      slugs.push(created.slug);
    }
    const keys: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const result = await listUnifiedPublicMatches(database.db, { view: 'results', q: 'unified', game: 'hell-let-loose', page, pageSize: 3 }, [...connected, { ...event('unified-wdg', 'wardogs'), title: 'Unified Synthetic Schedule' }]);
      expect(result).toMatchObject({ total: 14, pageCount: 5 });
      keys.push(...result.items.map(publicMatchRowKey));
    }
    expect(keys).toEqual(slugs.flatMap((slug, index) => [`connected:hll:unified-${index}`, `website:${slug}`]).reverse());
    expect((await listUnifiedPublicMatches(database.db, { view: 'upcoming', q: 'unified' }, connected)).total).toBe(0);
    expect((await listUnifiedPublicMatches(database.db, { view: 'results', q: 'absent' }, connected)).total).toBe(0);
  });
});
