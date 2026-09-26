import {
  contentDocument,
  contentRevision,
  contentTranslation,
  match,
  matchResult,
  memberProfile,
  publicationSchedule,
} from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const emptyDoc = { type: 'doc' as const, content: [] };
const noTaxonomy = { category: null, tags: [] };

async function newsWithTranslations() {
  const [doc] = await t.db.insert(contentDocument).values({ kind: 'news' }).returning();
  const [cs] = await t.db
    .insert(contentTranslation)
    .values({ documentId: doc!.id, locale: 'cs', namespace: 'news', draftSlug: `clanek-${doc!.id.slice(0, 8)}` })
    .returning();
  const [en] = await t.db
    .insert(contentTranslation)
    .values({ documentId: doc!.id, locale: 'en', namespace: 'news', draftSlug: `article-${doc!.id.slice(0, 8)}` })
    .returning();
  const revision = (translationId: string, locale: 'cs' | 'en') =>
    t.db
      .insert(contentRevision)
      .values({ translationId, locale, kind: 'save', schemaVersion: 1, title: 'T', slug: 's', body: emptyDoc, taxonomy: noTaxonomy })
      .returning()
      .then((rows) => rows[0]!);
  return { doc: doc!, cs: cs!, en: en!, revision };
}

describe('content translation invariants (PostgreSQL)', () => {
  it('allows one translation per document and locale', async () => {
    const { doc } = await newsWithTranslations();
    await expect(
      t.db.insert(contentTranslation).values({ documentId: doc.id, locale: 'cs', namespace: 'news', draftSlug: 'other-slug' }),
    ).rejects.toThrow();
  });

  it('rejects an unsupported locale', async () => {
    const [doc] = await t.db.insert(contentDocument).values({ kind: 'news' }).returning();
    await expect(
      t.db.insert(contentTranslation).values({ documentId: doc!.id, locale: 'de' as 'cs', namespace: 'news', draftSlug: 'x' }),
    ).rejects.toThrow();
  });

  it('allows the same slug in different locales but not twice in one locale', async () => {
    const a = await t.db.insert(contentDocument).values({ kind: 'news' }).returning();
    const b = await t.db.insert(contentDocument).values({ kind: 'news' }).returning();
    await t.db.insert(contentTranslation).values({ documentId: a[0]!.id, locale: 'cs', namespace: 'news', draftSlug: 'shared-slug' });
    await t.db.insert(contentTranslation).values({ documentId: a[0]!.id, locale: 'en', namespace: 'news', draftSlug: 'shared-slug' });
    await expect(
      t.db.insert(contentTranslation).values({ documentId: b[0]!.id, locale: 'cs', namespace: 'news', draftSlug: 'shared-slug' }),
    ).rejects.toThrow();
  });

  it('rejects a draft/live pointer to a revision of another translation', async () => {
    const { cs, en, revision } = await newsWithTranslations();
    const enRevision = await revision(en.id, 'en');
    await expect(
      t.db.update(contentTranslation).set({ draftRevisionId: enRevision.id }).where(eq(contentTranslation.id, cs.id)),
    ).rejects.toThrow();
    const csRevision = await revision(cs.id, 'cs');
    await t.db.update(contentTranslation).set({ draftRevisionId: csRevision.id }).where(eq(contentTranslation.id, cs.id));
  });

  it('rejects a revision whose locale differs from its translation', async () => {
    const { cs } = await newsWithTranslations();
    await expect(
      t.db.insert(contentRevision).values({
        translationId: cs.id,
        locale: 'en',
        kind: 'save',
        schemaVersion: 1,
        title: 'Wrong locale',
        slug: 'x',
        body: emptyDoc,
        taxonomy: noTaxonomy,
      }),
    ).rejects.toThrow();
  });

  it('requires a live slug and timestamp together with a published revision', async () => {
    const { cs, revision } = await newsWithTranslations();
    const rev = await revision(cs.id, 'cs');
    await expect(
      t.db.update(contentTranslation).set({ publishedRevisionId: rev.id }).where(eq(contentTranslation.id, cs.id)),
    ).rejects.toThrow();
    await t.db
      .update(contentTranslation)
      .set({ publishedRevisionId: rev.id, liveSlug: 'live-slug', publishedAt: new Date() })
      .where(eq(contentTranslation.id, cs.id));
  });

  it('rejects a schedule targeting another translation revision and a second active schedule', async () => {
    const { cs, en, revision } = await newsWithTranslations();
    const enRevision = await revision(en.id, 'en');
    const base = {
      dueAt: new Date(Date.now() + 60_000),
      issuerKind: 'discord' as const,
      issuerLabel: 'Synthetic editor',
      issuerAssurance: 'discord',
      capability: 'content.publish',
    };
    await expect(
      t.db.insert(publicationSchedule).values({
        ...base,
        translationId: cs.id,
        locale: 'cs',
        revisionId: enRevision.id,
        idempotencyKey: 'k-cross',
      }),
    ).rejects.toThrow();
    const csRevision = await revision(cs.id, 'cs');
    await t.db.insert(publicationSchedule).values({ ...base, translationId: cs.id, locale: 'cs', revisionId: csRevision.id, idempotencyKey: 'k1' });
    await expect(
      t.db.insert(publicationSchedule).values({ ...base, translationId: cs.id, locale: 'cs', revisionId: csRevision.id, idempotencyKey: 'k2' }),
    ).rejects.toThrow();
  });

  it('requires grant identity for local-admin delegated schedules', async () => {
    const { cs, revision } = await newsWithTranslations();
    const rev = await revision(cs.id, 'cs');
    await expect(
      t.db.insert(publicationSchedule).values({
        translationId: cs.id,
        locale: 'cs',
        revisionId: rev.id,
        dueAt: new Date(),
        issuerKind: 'local_admin',
        issuerLabel: 'Recovery admin',
        issuerAssurance: 'mfa',
        capability: 'content.publish',
        idempotencyKey: 'k-local',
      }),
    ).rejects.toThrow();
  });
});

describe('match and member invariants (PostgreSQL)', () => {
  const fixture = (slug: string) => ({
    slug,
    game: 'wardogs' as const,
    opponentName: 'Synthetic Opponent',
    competitionType: 'friendly' as const,
    startsAt: new Date('2026-10-04T18:00:00Z'),
  });

  it('keeps unknown scores null and rejects half-known scores', async () => {
    const [m] = await t.db.insert(match).values(fixture('synthetic-a')).returning();
    await t.db.insert(matchResult).values({ matchId: m!.id });
    const [stored] = await t.db.select().from(matchResult).where(eq(matchResult.matchId, m!.id));
    expect(stored!.scoreValkyria).toBeNull();
    expect(stored!.outcome).toBe('unknown');
    const [m2] = await t.db.insert(match).values(fixture('synthetic-b')).returning();
    await expect(t.db.insert(matchResult).values({ matchId: m2!.id, scoreValkyria: 2 })).rejects.toThrow();
    await expect(t.db.insert(matchResult).values({ matchId: m2!.id, scoreValkyria: -1, scoreOpponent: 0 })).rejects.toThrow();
  });

  it('rejects a published match without a publication time', async () => {
    await expect(t.db.insert(match).values({ ...fixture('synthetic-c'), publication: 'published' })).rejects.toThrow();
  });

  it('requires recorded consent before a member profile is published', async () => {
    await expect(
      t.db.insert(memberProfile).values({ slug: 'no-consent', displayName: 'Žofie Ůlehlová', state: 'published', publishedAt: new Date() }),
    ).rejects.toThrow();
    const [ok] = await t.db
      .insert(memberProfile)
      .values({
        slug: 'with-consent',
        displayName: 'Žofie Ůlehlová',
        state: 'published',
        consentConfirmedAt: new Date(),
        publishedAt: new Date(),
      })
      .returning();
    expect(ok!.displayName).toBe('Žofie Ůlehlová');
  });
});
