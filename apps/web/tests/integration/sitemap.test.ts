import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listPublishedNewsForSitemap, listPublishedPagesForSitemap } from '@/modules/content/public';
import { listPublicMatchesForSitemap } from '@/modules/matches/queries';
import { listPublicMembersForSitemap } from '@/modules/members/queries';
import { loadFixtures } from '@/fixtures';
import { runSeed } from '@/seed';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await runSeed(t.db);
  await loadFixtures(t.db, { mediaRoot: `${process.cwd()}/.local/test-media-sitemap` });
});
afterAll(async () => {
  await t.drop();
});

describe('sitemap sources', () => {
  it('list only published, consented or public entities', async () => {
    const [news, pages, matches, members] = await Promise.all([
      listPublishedNewsForSitemap(t.db),
      listPublishedPagesForSitemap(t.db),
      listPublicMatchesForSitemap(t.db),
      listPublicMembersForSitemap(t.db),
    ]);
    expect(pages.map((entry) => entry.path).sort()).toEqual(
      ['/cs/clan', '/cs/community', '/cs/privacy', '/en/clan', '/en/community', '/en/privacy'].sort(),
    );
    expect(news.length).toBeGreaterThan(0);
    // Alternates only ever point at URLs that are themselves published entries.
    const published = new Set(news.map((entry) => entry.path));
    for (const entry of news) {
      expect(entry.path.startsWith(`/${entry.locale}/news/`)).toBe(true);
      for (const path of Object.values(entry.alternates)) expect(published.has(path!)).toBe(true);
    }
    // Some Czech posts have no published English counterpart (cs-only / private en draft).
    expect(news.some((entry) => entry.locale === 'cs' && !entry.alternates.en)).toBe(true);
    expect(matches.map((row) => row.slug)).not.toContain('ukazka-wardogs-koncept');
    expect(members.map((row) => row.slug)).not.toEqual(expect.arrayContaining(['synteticky-hrac-charlie', 'synteticky-hrac-delta']));
    expect(members.map((row) => row.slug)).toContain('synteticky-hrac-alfa');
  });
});
