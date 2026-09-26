import { asset, auditEvent, proseRevision, proseTranslation } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { AccessDeniedError } from '@/modules/access/types';
import { getPublicMatch } from '@/modules/matches/queries';
import { createMatch, publishMatch, unpublishMatch } from '@/modules/matches/service';
import { getPublicMember } from '@/modules/members/queries';
import { confirmConsent, createMemberProfile, hideProfile, publishProfile } from '@/modules/members/service';
import { communityAssetIsPublic } from '@/modules/prose/assets';
import { getPublicProse, loadProseAdminDetail } from '@/modules/prose/queries';
import { listProseRevisions, publishProse, restoreProseRevision, saveProseDraft, unpublishProse } from '@/modules/prose/service';
import type { ProseOwner } from '@/modules/prose/types';
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

const doc = (text: string, extra: unknown[] = []) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...extra] });

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (e: unknown) => e,
  );
}
async function expectDomain(promise: Promise<unknown>, code: string) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

let n = 0;
async function publishedMatch() {
  n += 1;
  const created = await createMatch(t.db, actors.matchManager, {
    game: 'wardogs',
    opponentName: `Synthetic Prose Opponent ${n}`,
    competitionType: 'scrim',
    startsAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
  });
  const published = await publishMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
  return { ...published, owner: { kind: 'match', id: published.id } as ProseOwner };
}

async function readyAsset(scope: 'editorial' | 'match', width = 800, height = 450) {
  const [row] = await t.db
    .insert(asset)
    .values({ scope, state: 'ready', originalFilename: 'synthetic.png', sourceFormat: 'png', width, height, bytes: 100, sha256: 'x' })
    .returning();
  return row!.id;
}

describe('localized prose publication', () => {
  it('publishes Czech without affecting English, and each locale independently', async () => {
    const m = await publishedMatch();
    const cs1 = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: 0, body: doc('Česká reportáž') });
    expect(cs1.version).toBe(1);
    const csLive = await publishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: cs1.version });

    expect((await getPublicMatch(t.db, m.slug, 'cs'))?.recap).toMatchObject({ state: 'published', locale: 'cs', body: doc('Česká reportáž') });
    expect((await getPublicMatch(t.db, m.slug, 'en'))?.recap).toEqual({ state: 'missing', availableIn: ['cs'] });

    // An English draft stays private.
    const en1 = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'en', expectedVersion: 0, body: doc('English draft') });
    expect((await getPublicMatch(t.db, m.slug, 'en'))?.recap).toEqual({ state: 'missing', availableIn: ['cs'] });
    expect(JSON.stringify(await getPublicMatch(t.db, m.slug, 'cs'))).not.toContain('English draft');

    // Editing Czech after publication changes only the Czech draft.
    await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: csLive.version, body: doc('Česká úprava (koncept)') });
    expect((await getPublicMatch(t.db, m.slug, 'cs'))?.recap).toMatchObject({ body: doc('Česká reportáž') });

    const enLive = await publishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'en', expectedVersion: en1.version });
    expect((await getPublicMatch(t.db, m.slug, 'en'))?.recap).toMatchObject({ state: 'published', locale: 'en', body: doc('English draft') });

    const csState = await loadProseAdminDetail(t.db, m.owner);
    await unpublishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: csState.cs.version });
    expect((await getPublicMatch(t.db, m.slug, 'cs'))?.recap).toEqual({ state: 'missing', availableIn: ['en'] });
    const [enRow] = await t.db.select().from(proseTranslation).where(and(eq(proseTranslation.matchId, m.id), eq(proseTranslation.locale, 'en')));
    expect(enRow?.publishedRevisionId).toBe(enLive.revisionId);
    expect(enRow?.version).toBe(enLive.version);

    const events = await t.db.select().from(auditEvent).where(and(eq(auditEvent.entityId, m.id), eq(auditEvent.action, 'prose.publish')));
    expect(events.map((e) => e.locale).sort()).toEqual(['cs', 'en']);
  });

  it('applies the owner global gate: unpublished matches and hidden members expose no prose', async () => {
    const m = await publishedMatch();
    const saved = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: 0, body: doc('Veřejná reportáž') });
    await publishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: saved.version });
    expect(await getPublicProse(t.db, m.owner, 'cs')).toMatchObject({ state: 'published' });
    await unpublishMatch(t.db, actors.matchManager, { id: m.id, expectedVersion: m.version });
    expect(await getPublicProse(t.db, m.owner, 'cs')).toBeNull();
    expect(await getPublicMatch(t.db, m.slug, 'cs')).toBeNull();

    const created = await createMemberProfile(t.db, actors.editor, { displayName: 'Syntetický hráč Gate' });
    const owner: ProseOwner = { kind: 'member', id: created.id };
    const bio = await saveProseDraft(t.db, actors.editor, { owner, locale: 'cs', expectedVersion: 0, body: doc('Životopis') });
    await publishProse(t.db, actors.editor, { owner, locale: 'cs', expectedVersion: bio.version });
    // Published biography but unconsented draft profile: not public.
    expect(await getPublicProse(t.db, owner, 'cs')).toBeNull();
    const consented = await confirmConsent(t.db, actors.editor, { id: created.id, expectedVersion: created.version });
    const published = await publishProfile(t.db, actors.editor, { id: created.id, expectedVersion: consented.version });
    expect(await getPublicProse(t.db, owner, 'cs')).toMatchObject({ state: 'published' });
    await hideProfile(t.db, actors.editor, { id: created.id, expectedVersion: published.version });
    expect(await getPublicProse(t.db, owner, 'cs')).toBeNull();
    expect(await getPublicMember(t.db, published.slug, 'cs')).toBeNull();
  });

  it('follows the owner domain for authorization', async () => {
    const m = await publishedMatch();
    const member = await createMemberProfile(t.db, actors.editor, { displayName: 'Syntetický hráč Domain' });
    const memberOwner: ProseOwner = { kind: 'member', id: member.id };
    for (const [actor, owner] of [
      [actors.editor, m.owner],
      [actors.matchManager, memberOwner],
      [actors.member, m.owner],
    ] as const) {
      const error = await failure(saveProseDraft(t.db, actor, { owner, locale: 'cs', expectedVersion: 0, body: doc('x') }));
      expect(error).toBeInstanceOf(AccessDeniedError);
    }
    // Authorization precedes validation of the body.
    const anonymous = await failure(saveProseDraft(t.db, actors.anonymous, { owner: m.owner, locale: 'cs', expectedVersion: 0, body: 'not a document' }));
    expect(anonymous).toBeInstanceOf(AccessDeniedError);
    const saved = await saveProseDraft(t.db, actors.editor, { owner: memberOwner, locale: 'en', expectedVersion: 0, body: doc('Bio') });
    const denied = await failure(publishProse(t.db, actors.matchManager, { owner: memberOwner, locale: 'en', expectedVersion: saved.version }));
    expect(denied).toBeInstanceOf(AccessDeniedError);
  });

  it('detects same-translation conflicts while the two locales stay independent', async () => {
    const m = await publishedMatch();
    const first = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: 0, body: doc('A') });
    await expectDomain(saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: 0, body: doc('B') }), 'conflict');
    const second = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: first.version, body: doc('C') });
    await expectDomain(saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: first.version, body: doc('D') }), 'conflict');
    // English starts at version 0 regardless of Czech.
    const en = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'en', expectedVersion: 0, body: doc('E') });
    expect(en.version).toBe(1);
    expect(second.version).toBe(2);
    await expectDomain(publishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: first.version }), 'conflict');
  });

  it('restores an earlier revision to draft without touching the live revision', async () => {
    const m = await publishedMatch();
    const v1 = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: 0, body: doc('Verze 1') });
    const live = await publishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: v1.version });
    const v2 = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: live.version, body: doc('Verze 2'), kind: 'autosave' });
    const restored = await restoreProseRevision(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: v2.version, revisionId: v1.revisionId! });
    const history = await listProseRevisions(t.db, actors.matchManager, { owner: m.owner, locale: 'cs' });
    expect(history.revisions.map((r) => r.kind)).toEqual(['restore', 'autosave', 'save']);
    expect(history.revisions[0]).toMatchObject({ id: restored.revisionId, isDraft: true, isPublished: false });
    expect(history.revisions[2]).toMatchObject({ id: v1.revisionId, isPublished: true });
    const detail = await loadProseAdminDetail(t.db, m.owner);
    expect(detail.cs).toMatchObject({ status: 'published_with_changes', draft: { body: doc('Verze 1') }, published: { revisionId: v1.revisionId } });
    expect((await getPublicMatch(t.db, m.slug, 'cs'))?.recap).toMatchObject({ body: doc('Verze 1') });

    // A revision of another translation cannot be restored or published here.
    const other = await publishedMatch();
    const foreign = await saveProseDraft(t.db, actors.matchManager, { owner: other.owner, locale: 'cs', expectedVersion: 0, body: doc('Cizí') });
    await expectDomain(
      restoreProseRevision(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: restored.version, revisionId: foreign.revisionId! }),
      'not_found',
    );
    await expectDomain(
      publishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: restored.version, revisionId: foreign.revisionId! }),
      'not_found',
    );
    const enForeign = await saveProseDraft(t.db, actors.matchManager, { owner: m.owner, locale: 'en', expectedVersion: 0, body: doc('EN') });
    await expectDomain(
      publishProse(t.db, actors.matchManager, { owner: m.owner, locale: 'cs', expectedVersion: restored.version, revisionId: enForeign.revisionId! }),
      'not_found',
    );
  });

  it('validates rich text, cover alt text and referenced media', async () => {
    const m = await publishedMatch();
    const base = { owner: m.owner, locale: 'cs' as const, expectedVersion: 0 };
    await expectDomain(saveProseDraft(t.db, actors.matchManager, { ...base, body: { type: 'doc', content: [{ type: 'script', text: 'x' }] } }), 'validation');
    await expectDomain(
      saveProseDraft(t.db, actors.matchManager, {
        ...base,
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
      }),
      'validation',
    );
    await expectDomain(
      saveProseDraft(t.db, actors.matchManager, { ...base, body: doc('x', [{ type: 'image', attrs: { assetId: '6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6a7b', alt: 'x' } }]) }),
      'validation',
    );
    const cover = await readyAsset('match');
    await expectDomain(
      saveProseDraft(t.db, actors.matchManager, { ...base, body: doc('x'), cover: { assetId: cover, alt: '', caption: '', decorative: false } }),
      'validation',
    );
    await expectDomain(saveProseDraft(t.db, actors.matchManager, { ...base, body: doc('x'.repeat(250_000)) }), 'payload_too_large');

    // Member biographies may not use match-scoped media.
    const member = await createMemberProfile(t.db, actors.editor, { displayName: 'Syntetický hráč Media' });
    await expectDomain(
      saveProseDraft(t.db, actors.editor, { owner: { kind: 'member', id: member.id }, locale: 'cs', expectedVersion: 0, body: doc('x', [{ type: 'image', attrs: { assetId: cover, alt: 'x' } }]) }),
      'validation',
    );
    expect(await t.db.select().from(proseRevision).where(eq(proseRevision.locale, 'cs'))).not.toHaveLength(0);
  });

  it('uses the published recap snapshot for cover alt text and gates media visibility', async () => {
    const coverId = await readyAsset('match', 1600, 900);
    const created = await createMatch(t.db, actors.matchManager, {
      game: 'wardogs',
      opponentName: 'Synthetic Cover Opponent',
      competitionType: 'friendly',
      startsAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      coverAssetId: coverId,
    });
    const inline = await readyAsset('editorial', 1200, 800);
    const owner: ProseOwner = { kind: 'match', id: created.id };
    const saved = await saveProseDraft(t.db, actors.matchManager, {
      owner,
      locale: 'en',
      expectedVersion: 0,
      body: doc('Recap', [{ type: 'image', attrs: { assetId: inline, alt: 'Inline', caption: '', decorative: false, align: 'center' } }]),
      cover: { assetId: coverId, alt: 'Synthetic cover alt', caption: 'Synthetic caption', decorative: false },
    });
    await publishProse(t.db, actors.matchManager, { owner, locale: 'en', expectedVersion: saved.version });
    expect(await communityAssetIsPublic(t.db, inline)).toBe(false);
    expect(await communityAssetIsPublic(t.db, coverId)).toBe(false);

    const published = await publishMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    const en = await getPublicMatch(t.db, published.slug, 'en');
    expect(en?.cover).toEqual({ assetId: coverId, width: 1600, height: 900, alt: 'Synthetic cover alt', caption: 'Synthetic caption' });
    expect(en?.recap.state === 'published' && en.recap.assets.map((a) => a.assetId).sort()).toEqual([coverId, inline].sort());
    const cs = await getPublicMatch(t.db, published.slug, 'cs');
    expect(cs?.cover).toMatchObject({ assetId: coverId, caption: '' });
    expect(await communityAssetIsPublic(t.db, inline)).toBe(true);
    expect(await communityAssetIsPublic(t.db, coverId)).toBe(true);
  });
});
