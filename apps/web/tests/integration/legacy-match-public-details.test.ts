import { legacyImport, match } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_LEGACY_MATCH_DETAILS } from '@/fixtures/legacy';
import { sourceHash } from '@/modules/legacy/import-contract';
import { loadPublicLegacyMatchDetails } from '@/modules/matches/legacy-details';
import { getPublicMatch, listPublicMatches } from '@/modules/matches/queries';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
beforeAll(async () => { t = await createTestDatabase(); });
afterAll(async () => { await t.drop(); });

async function fixture(slug: string, options: { published?: boolean; origin?: string; metadata?: Record<string, unknown> } = {}) {
  const [row] = await t.db.insert(match).values({
    slug, game: 'hell-let-loose', opponentName: 'Synthetic HLL Opponent Foxtrot', competitionType: 'friendly',
    startsAt: new Date('2024-05-12T18:00:00Z'), publication: options.published ? 'published' : 'draft',
    publishedAt: options.published ? new Date('2024-05-13T18:00:00Z') : null,
  }).returning();
  await t.db.insert(legacyImport).values({
    matchId: row!.id, sourceOrigin: options.origin ?? 'https://valkyriahll.cz', sourceKind: 'match', sourceKey: slug,
    sourceUrl: `https://valkyriahll.cz/matches/900001`, sourceSha256: '1'.repeat(64), observedAt: new Date(),
    sourceMetadata: options.metadata ?? { matchDetails: FIXTURE_LEGACY_MATCH_DETAILS, matchDetailsSha256: sourceHash(FIXTURE_LEGACY_MATCH_DETAILS), privateOperatorNote: 'PRIVATE-LEDGER-MARKER' },
  });
  return row!;
}

describe('publication-gated historical match facts', () => {
  it('exposes only the typed public metadata in both locales and lists', async () => {
    const row = await fixture('public-history', { published: true });
    for (const locale of ['cs', 'en'] as const) {
      const detail = await getPublicMatch(t.db, row.slug, locale);
      expect(detail?.legacyDetails?.awayCountry).toBe('US');
      expect(detail?.legacyDetails?.timeConflict).toBe(true);
      expect(detail?.startsAt).toBe('2024-05-12T18:00:00.000Z');
      expect(JSON.stringify(detail)).not.toContain('PRIVATE-LEDGER-MARKER');
      expect(JSON.stringify(detail)).not.toContain('sourceSha256');
    }
    const list = await listPublicMatches(t.db, { view: 'upcoming' });
    expect(list.items.find((item) => item.slug === row.slug)?.legacyDetails?.awayCountry).toBe('US');
    await t.db.update(match).set({ publication: 'draft' }).where(eq(match.id, row.id));
    expect(await getPublicMatch(t.db, row.slug, 'cs')).toBeNull();
    expect((await loadPublicLegacyMatchDetails(t.db, [row.id])).size).toBe(0);
  });

  it('does not project drafts, unrelated import origins or invalid metadata', async () => {
    const draft = await fixture('draft-history');
    const other = await fixture('other-history', { published: true, origin: 'https://example.com' });
    const malformed = await fixture('malformed-history', { published: true, metadata: { matchDetails: { ...FIXTURE_LEGACY_MATCH_DETAILS, sourceLinks: [{ url: 'javascript:alert(1)' }] } } });
    const changed = await fixture('changed-history', { published: true, metadata: { matchDetails: FIXTURE_LEGACY_MATCH_DETAILS, matchDetailsSha256: '0'.repeat(64) } });
    expect((await loadPublicLegacyMatchDetails(t.db, [draft.id, other.id, malformed.id, changed.id])).size).toBe(0);
    expect((await getPublicMatch(t.db, malformed.slug, 'cs'))?.legacyDetails).toBeNull();
    expect((await loadPublicLegacyMatchDetails(t.db, [])).size).toBe(0);
  });
});
