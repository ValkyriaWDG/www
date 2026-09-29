import { contentDocument, contentTranslation, legacyImport, match, tournament } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addTranslation, createDocument, saveDraft } from '@/modules/content/editor';
import { publishTranslation, unpublishTranslation } from '@/modules/content/publication';
import { sampleBody, seedTestUsers, testActors } from '@/modules/content/testing';
import { LEGACY_HLL_ORIGIN } from '@/modules/legacy/hll';
import { resolvePublishedLegacyHllUrl } from '@/modules/legacy/resolve-public-url';
import { runSeed } from '@/seed';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
const actor = testActors().administrator;
beforeAll(async () => { t = await createTestDatabase(); await runSeed(t.db); await seedTestUsers(t.db); });
afterAll(async () => { await t.drop(); });

async function identity(kind: string, key: string, target: { translationId?: string; matchId?: string; tournamentId?: string }, origin = LEGACY_HLL_ORIGIN) {
  await t.db.insert(legacyImport).values({ sourceOrigin: origin, sourceKind: kind, sourceKey: key, locale: 'cs', sourceUrl: `${origin}/synthetic-source`, sourceSha256: 'a'.repeat(64), observedAt: new Date(), ...target });
}
const resolve = (path: string, locale = 'cs') => resolvePublishedLegacyHllUrl(t.db, path, locale);

describe('published-only legacy URL resolution on PostgreSQL', () => {
  it('tracks renamed live slugs and locale counterparts without exposing a renamed draft or draft game scope', async () => {
    const cs = await createDocument(t.db, actor, { kind: 'news', locale: 'cs', title: 'Synthetic Czech report', slug: 'synthetic-live-cs', game: 'hell-let-loose', fields: { excerpt: 'Synthetic historical summary.', body: sampleBody('Synthetic historical report.') } });
    await identity('news', 'synthetic-old-source', { translationId: cs.translationId });
    expect(await resolve('/clanky/synthetic-old-source')).toBeNull();
    const published = await publishTranslation(t.db, actor, { translationId: cs.translationId, expectedVersion: cs.version });
    expect(await resolve('/clanky/synthetic-old-source')).toBe('/cs/hll/news/synthetic-live-cs');
    const en = await addTranslation(t.db, actor, { documentId: cs.documentId, locale: 'en', slug: 'synthetic-live-en' });
    expect(await resolve('/clanky/synthetic-old-source', 'en')).toBeNull();
    const english = await saveDraft(t.db, actor, { translationId: en.translationId, expectedVersion: en.version, fields: { title: 'Synthetic English report', excerpt: 'Synthetic English summary.', body: sampleBody('Synthetic English historical report.') } });
    await publishTranslation(t.db, actor, { translationId: en.translationId, expectedVersion: english.version });
    expect(await resolve('/clanky/synthetic-old-source', 'en')).toBe('/en/hll/news/synthetic-live-en');
    const draft = await saveDraft(t.db, actor, { translationId: cs.translationId, expectedVersion: published.version, fields: { slug: 'synthetic-renamed-cs' } });
    expect(await resolve('/clanky/synthetic-old-source')).toBe('/cs/hll/news/synthetic-live-cs');
    await publishTranslation(t.db, actor, { translationId: cs.translationId, expectedVersion: draft.version });
    await t.db.update(contentDocument).set({ game: 'wardogs' }).where(eq(contentDocument.id, cs.documentId));
    expect(await resolve('/clanky/synthetic-old-source')).toBe('/cs/hll/news/synthetic-renamed-cs');
    await t.db.update(contentTranslation).set({ archivedAt: new Date() }).where(eq(contentTranslation.id, en.translationId));
    expect(await resolve('/clanky/synthetic-old-source', 'en')).toBeNull();
    await t.db.update(contentDocument).set({ archivedAt: new Date() }).where(eq(contentDocument.id, cs.documentId));
    expect(await resolve('/clanky/synthetic-old-source')).toBeNull();
  });

  it('does not redirect reviewed guide names without a ledger or an effective publication', async () => {
    const guide = await createDocument(t.db, actor, { kind: 'manual', locale: 'cs', title: 'Synthetic guide', slug: 'synthetic-current-guide', game: 'hell-let-loose', categoryKey: 'getting-started', fields: { excerpt: 'Synthetic guide summary.', body: sampleBody('Synthetic reviewed guide text.') } });
    const published = await publishTranslation(t.db, actor, { translationId: guide.translationId, expectedVersion: guide.version });
    expect(await resolve('/guide/zakladni-nastaveni')).toBeNull();
    await identity('manual', 'zakladni-nastaveni', { translationId: guide.translationId });
    expect(await resolve('/guide/zakladni-nastaveni/')).toBe('/cs/hll/field-manual/synthetic-current-guide');
    await unpublishTranslation(t.db, actor, { translationId: guide.translationId, expectedVersion: published.version });
    expect(await resolve('/guide/zakladni-nastaveni')).toBeNull();
  });

  it('resolves numeric match IDs and tournament identities through stable FKs after renaming', async () => {
    const [fixture] = await t.db.insert(match).values({ slug: '901', game: 'hell-let-loose', opponentName: 'Synthetic opponent', competitionType: 'friendly', startsAt: new Date(), publication: 'published', publishedAt: new Date() }).returning();
    const [competition] = await t.db.insert(tournament).values({ slug: 'synthetic-tournament', game: 'hell-let-loose', name: 'Synthetic tournament', publication: 'published', publishedAt: new Date() }).returning();
    await identity('match', '901', { matchId: fixture!.id });
    await identity('tournament', 'synthetic-original-tournament', { tournamentId: competition!.id });
    await t.db.update(match).set({ slug: 'synthetic-renamed-match' }).where(eq(match.id, fixture!.id));
    await t.db.update(tournament).set({ slug: 'synthetic-renamed-tournament' }).where(eq(tournament.id, competition!.id));
    expect(await resolve('/matches/901', 'en')).toBe('/en/hll/matches/synthetic-renamed-match');
    expect(await resolve('/turnaje/synthetic-original-tournament')).toBe('/cs/hll/tournaments/synthetic-renamed-tournament');
    expect(await resolve('/tournaments/synthetic-original-tournament', 'en')).toBe('/en/hll/tournaments/synthetic-renamed-tournament');
    await t.db.update(match).set({ publication: 'draft' }).where(eq(match.id, fixture!.id));
    await t.db.update(tournament).set({ publication: 'draft' }).where(eq(tournament.id, competition!.id));
    expect(await resolve('/matches/901')).toBeNull();
    expect(await resolve('/turnaje/synthetic-original-tournament')).toBeNull();
    await identity('match', '902', { matchId: fixture!.id }, 'https://other.invalid');
    expect(await resolve('/matches/902')).toBeNull();
  });

  it('requires published FAQ content and rejects unrelated or unsafe paths', async () => {
    const [cs] = await t.db.select({ id: contentTranslation.id, version: contentTranslation.version }).from(contentTranslation)
      .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
      .where(and(eq(contentDocument.pageKey, 'faq'), eq(contentTranslation.locale, 'cs')));
    await identity('page', 'faq', { translationId: cs!.id });
    expect(await resolve('/faq')).toBeNull();
    const saved = await saveDraft(t.db, actor, { translationId: cs!.id, expectedVersion: cs!.version, fields: { title: 'Synthetic FAQ', body: sampleBody('Synthetic reviewed FAQ answer.') } });
    const published = await publishTranslation(t.db, actor, { translationId: cs!.id, expectedVersion: saved.version });
    expect(await resolve('/faq')).toBe('/cs/faq');
    await unpublishTranslation(t.db, actor, { translationId: cs!.id, expectedVersion: published.version });
    expect(await resolve('/faq')).toBeNull();
    for (const path of ['https://evil.invalid/faq', '//evil.invalid', '/faq?next=elsewhere', '/guide/%2e%2e', '/clanky/unknown']) expect(await resolve(path)).toBeNull();
    expect(await resolve('/faq', 'de')).toBeNull();
  });
});
