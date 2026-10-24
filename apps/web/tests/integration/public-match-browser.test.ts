import { match } from '@valkyria/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { archiveMatchWindow, matchBrowserCounts, mergeMatchBrowserPage } from '@/modules/matches/public-browser';
import { getPublicMatch, getPublicMatchCounts, listPublicMatches } from '@/modules/matches/queries';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
const now = new Date('2026-10-24T12:00:00Z');
const time = (n: number) => new Date(now.getTime() - n * 60_000);
const events: PublicLogiEvent[] = Array.from({ length: 17 }, (_, i) => ({
  ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: '100000000000000001', game: 'hll', kind: 'match', externalId: `event-${i}` },
  title: `Synthetic event ${i}`, kind: 'match', status: 'concluded', startsAt: null, endsAt: time(i * 2 + 1).toISOString(), observedAt: now.toISOString(), sourceUpdatedAt: null, teams: [],
  ...(i === 0 ? { archive: { slug: 'history-0' } } : {}),
  result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null },
}));

beforeAll(async () => {
  database = await createTestDatabase();
  await database.db.insert(match).values(Array.from({ length: 27 }, (_, i) => ({ slug: `history-${i}`, game: 'hell-let-loose' as const, opponentName: `Synthetic Archive ${i}`, competitionType: 'friendly' as const, startsAt: time(i * 2), status: 'completed' as const, publication: 'published' as const, publishedAt: time(i * 2) })));
  await database.db.insert(match).values([
    { slug: 'other-game', game: 'wardogs', opponentName: 'Synthetic Archive 1', competitionType: 'friendly', startsAt: now, status: 'completed', publication: 'published', publishedAt: now },
    { slug: 'private-match', game: 'hell-let-loose', opponentName: 'PRIVATE_DO_NOT_PUBLISH', competitionType: 'friendly', startsAt: now, status: 'completed', publication: 'draft', internalNotes: 'PRIVATE_NOTES' },
  ]);
});
afterAll(async () => { await database.drop(); });

describe('persisted archive and Logi form one public list', () => {
  it('merges every page without duplicates and excludes only explicit published counterparts', async () => {
    const linked = ['history-0'];
    const keys: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const archive = await listPublicMatches(database.db, { view: 'results', game: 'hell-let-loose', page, pageSize: 10 }, linked, archiveMatchWindow(page, 10, events.length));
      const merged = mergeMatchBrowserPage(archive, events, { view: 'results', game: 'hell-let-loose', page, pageSize: 10, now });
      expect(merged.total).toBe(43);
      expect(merged.pageCount).toBe(5);
      keys.push(...merged.items.map((row) => row.key));
    }
    expect(keys).toHaveLength(43);
    expect(new Set(keys).size).toBe(43);
    expect(keys).not.toContain('archive:hell-let-loose:history-0');
    expect(keys).not.toContain('archive:wardogs:other-game');
    expect(keys).not.toContain('archive:hell-let-loose:private-match');
    expect(await getPublicMatch(database.db, 'history-0', 'cs')).toMatchObject({ slug: 'history-0' });
    expect(await getPublicMatch(database.db, 'private-match', 'cs')).toBeNull();
  });

  it('keeps shared counts consistent and restores the archive counterpart when Logi is absent', async () => {
    const counts = matchBrowserCounts(await getPublicMatchCounts(database.db, ['history-0']), events, now);
    expect(counts.results).toBe(44);
    expect(counts.byGame['hell-let-loose'].results).toBe(43);
    expect(counts.byGame.wardogs.results).toBe(1);
    const archive = await listPublicMatches(database.db, { view: 'results', game: 'hell-let-loose' }, [], archiveMatchWindow(1, 10, 0));
    const fallback = mergeMatchBrowserPage(archive, [], { view: 'results', game: 'hell-let-loose', page: 1, pageSize: 10, now });
    expect(fallback.total).toBe(27);
    expect(fallback.items[0]?.key).toBe('archive:hell-let-loose:history-0');
    expect(JSON.stringify(fallback)).not.toContain('PRIVATE_');
  });

  it('applies case-insensitive archive search and validates internal window bounds', async () => {
    const archive = await listPublicMatches(database.db, { view: 'results', q: 'archive 12', game: 'hell-let-loose' }, [], { offset: 0, limit: 10 });
    expect(archive.total).toBe(1);
    expect(archive.items[0]?.slug).toBe('history-12');
    for (const window of [{ offset: -1, limit: 10 }, { offset: 0, limit: 10_011 }, { offset: 0.5, limit: 10 }]) {
      await expect(listPublicMatches(database.db, { view: 'results' }, [], window)).rejects.toThrow('Invalid public match window');
    }
  });
});
