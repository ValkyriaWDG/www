import { asset, auditEvent, authUser, memberProfile } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { AccessDeniedError } from '@/modules/access/types';
import { getMemberForAdmin, getPublicMember, listMembersForAdmin, listPublicMembers } from '@/modules/members/queries';
import {
  confirmConsent,
  createMemberProfile,
  hideProfile,
  publishProfile,
  updateMemberProfile,
  withdrawConsent,
} from '@/modules/members/service';
import { publishProse, saveProseDraft } from '@/modules/prose/service';
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
  return error as DomainError;
}

async function expectDenied(promise: Promise<unknown>, code = 'forbidden') {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(AccessDeniedError);
  expect((error as AccessDeniedError).code).toBe(code);
}

async function publishedMember(displayName: string, extra: Record<string, unknown> = {}) {
  const created = await createMemberProfile(t.db, actors.editor, { displayName, ...extra });
  const consented = await confirmConsent(t.db, actors.editor, { id: created.id, expectedVersion: created.version });
  return publishProfile(t.db, actors.editor, { id: consented.id, expectedVersion: consented.version });
}

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

describe('member profile publication', () => {
  it('rejects publication without consent and publishes after consent is recorded', async () => {
    const created = await createMemberProfile(t.db, actors.editor, { displayName: 'Syntetický hráč Consent', games: ['wardogs'] });
    expect(created.state).toBe('draft');
    const error = await expectDomain(publishProfile(t.db, actors.editor, { id: created.id, expectedVersion: created.version }), 'invalid_state');
    expect(error.fieldErrors?.consent).toBe('consent_required');
    expect(await getPublicMember(t.db, created.slug, 'cs')).toBeNull();

    const consented = await confirmConsent(t.db, actors.editor, { id: created.id, expectedVersion: created.version });
    const published = await publishProfile(t.db, actors.editor, { id: created.id, expectedVersion: consented.version });
    expect(published.state).toBe('published');
    expect((await getPublicMember(t.db, created.slug, 'cs'))?.displayName).toBe('Syntetický hráč Consent');

    const actions = (await t.db.select({ action: auditEvent.action }).from(auditEvent).where(eq(auditEvent.entityId, created.id))).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['member.create', 'member.consent.confirm', 'member.publish']));
  });

  it('hides a published profile when consent is withdrawn', async () => {
    const published = await publishedMember('Syntetický hráč Withdraw');
    const withdrawn = await withdrawConsent(t.db, actors.editor, { id: published.id, expectedVersion: published.version });
    expect(withdrawn.state).toBe('hidden');
    expect(await getPublicMember(t.db, published.slug, 'cs')).toBeNull();
  });

  it('preserves display names byte-for-byte (diacritics, emoji, combining marks)', async () => {
    const names = [
      'Příliš žluťoučký kůň úpěl ďábelské ódy – Syntetický hráč Ě',
      'Syntetický hráč 🦊🎮 Foxtrot',
      // NFD-composed "Šárka" must not be normalized to NFC.
      'Šárka Syntetická',
    ];
    for (const name of names) {
      const created = await publishedMember(name);
      const [row] = await t.db.select().from(memberProfile).where(eq(memberProfile.id, created.id));
      expect(Buffer.from(row!.displayName)).toEqual(Buffer.from(name));
      const detail = await getPublicMember(t.db, created.slug, 'en');
      expect(Buffer.from(detail!.displayName)).toEqual(Buffer.from(name));
    }
  });

  it('exposes only public fields in public DTOs', async () => {
    const published = await publishedMember('Syntetický hráč Private Fields', { games: ['hell-let-loose'], publicRoleKeys: ['officer'] });
    const [user] = await t.db
      .insert(authUser)
      .values({ id: '0f000000-0000-4000-8000-0000000000aa', name: 'Linked synthetic user', email: 'linked-synthetic@accounts.invalid' })
      .returning();
    await t.db.update(memberProfile).set({ userId: user!.id }).where(eq(memberProfile.id, published.id));

    const detail = await getPublicMember(t.db, published.slug, 'cs');
    expect(Object.keys(detail!).sort()).toEqual(['avatar', 'biography', 'displayName', 'games', 'publicRoleKeys', 'slug']);
    const list = await listPublicMembers(t.db, { q: 'Private Fields' });
    expect(Object.keys(list.items[0]!).sort()).toEqual(['avatar', 'displayName', 'games', 'publicRoleKeys', 'slug']);
    const json = JSON.stringify([detail, list]);
    for (const secret of [user!.id, 'linked-synthetic@accounts.invalid', published.id, 'consent', 'sortOrder', 'userId']) {
      expect(json).not.toContain(secret);
    }
  });

  it('returns an identical null for draft, hidden and nonexistent profiles', async () => {
    const draft = await createMemberProfile(t.db, actors.editor, { displayName: 'Syntetický hráč Draft' });
    const toHide = await publishedMember('Syntetický hráč Hidden');
    await hideProfile(t.db, actors.editor, { id: toHide.id, expectedVersion: toHide.version });
    const results = [
      await getPublicMember(t.db, draft.slug, 'cs'),
      await getPublicMember(t.db, toHide.slug, 'cs'),
      await getPublicMember(t.db, 'neexistujici-profil', 'cs'),
      await getPublicMember(t.db, 'Invalid Slug!', 'cs'),
    ];
    expect(results).toEqual([null, null, null, null]);
    const listed = await listPublicMembers(t.db, { pageSize: 50 });
    expect(listed.items.map((m) => m.slug)).not.toContain(draft.slug);
    expect(listed.items.map((m) => m.slug)).not.toContain(toHide.slug);
  });

  it('reports a missing biography locale with the locales that are available', async () => {
    const member = await publishedMember('Syntetický hráč Bio');
    const saved = await saveProseDraft(t.db, actors.editor, { owner: { kind: 'member', id: member.id }, locale: 'cs', expectedVersion: 0, body: doc('Syntetický životopis') });
    await publishProse(t.db, actors.editor, { owner: { kind: 'member', id: member.id }, locale: 'cs', expectedVersion: saved.version });
    const cs = await getPublicMember(t.db, member.slug, 'cs');
    expect(cs?.biography).toMatchObject({ state: 'published', locale: 'cs', body: doc('Syntetický životopis') });
    const en = await getPublicMember(t.db, member.slug, 'en');
    expect(en?.biography).toEqual({ state: 'missing', availableIn: ['cs'] });
    expect(en?.displayName).toBe(cs?.displayName);
  });
});

describe('member profile authorization, slugs and filters', () => {
  it('denies match managers, members and anonymous visitors; allows editors and administrators', async () => {
    const created = await createMemberProfile(t.db, actors.administrator, { displayName: 'Syntetický hráč Auth' });
    const target = { id: created.id, expectedVersion: created.version };
    for (const actor of [actors.matchManager, actors.member]) {
      await expectDenied(createMemberProfile(t.db, actor, { displayName: 'Nope' }));
      await expectDenied(updateMemberProfile(t.db, actor, { ...target, displayName: 'Hijacked' }));
      await expectDenied(confirmConsent(t.db, actor, target));
      await expectDenied(publishProfile(t.db, actor, target));
      await expectDenied(hideProfile(t.db, actor, target));
      await expectDenied(listMembersForAdmin(t.db, actor));
      await expectDenied(getMemberForAdmin(t.db, actor, created.id));
    }
    await expectDenied(createMemberProfile(t.db, actors.anonymous, { displayName: 'Nope' }), 'unauthenticated');
    const admin = await getMemberForAdmin(t.db, actors.editor, created.id);
    expect(admin).toMatchObject({ displayName: 'Syntetický hráč Auth', state: 'draft', biography: { cs: 'none', en: 'none' } });
  });

  it('generates transliterated unique slugs and rejects stale versions', async () => {
    const first = await createMemberProfile(t.db, actors.editor, { displayName: 'Ďábelský Šíp' });
    const second = await createMemberProfile(t.db, actors.editor, { displayName: 'Ďábelský Šíp' });
    expect(first.slug).toBe('dabelsky-sip');
    expect(second.slug).toBe('dabelsky-sip-2');
    await expectDomain(createMemberProfile(t.db, actors.editor, { displayName: 'X', slug: 'dabelsky-sip' }), 'slug_taken');
    const updated = await updateMemberProfile(t.db, actors.editor, { id: first.id, expectedVersion: 1, games: ['wardogs'] });
    expect(updated.version).toBe(2);
    await expectDomain(updateMemberProfile(t.db, actors.editor, { id: first.id, expectedVersion: 1, games: [] }), 'conflict');
    await expectDomain(createMemberProfile(t.db, actors.editor, { displayName: 'Bad', publicRoleKeys: ['administrator'] as never }), 'validation');
    await expectDomain(createMemberProfile(t.db, actors.editor, { displayName: 'x'.repeat(81) }), 'validation');
  });

  it('accepts only editorial avatars', async () => {
    const [matchAsset] = await t.db
      .insert(asset)
      .values({ scope: 'match', state: 'ready', originalFilename: 'synthetic.png', sourceFormat: 'png', width: 1, height: 1, bytes: 1, sha256: 'a' })
      .returning();
    const [editorial] = await t.db
      .insert(asset)
      .values({ scope: 'editorial', state: 'ready', originalFilename: 'synthetic.png', sourceFormat: 'png', width: 64, height: 64, bytes: 1, sha256: 'b' })
      .returning();
    await expectDomain(createMemberProfile(t.db, actors.editor, { displayName: 'Avatar Match', avatarAssetId: matchAsset!.id }), 'validation');
    const withAvatar = await publishedMember('Syntetický hráč Avatar', { avatarAssetId: editorial!.id });
    expect((await getPublicMember(t.db, withAvatar.slug, 'cs'))?.avatar).toEqual({ assetId: editorial!.id, width: 64, height: 64 });
  });

  it('filters the public directory by game, role and diacritic-insensitive name search', async () => {
    const wardogs = await publishedMember('Syntetický Filtr Čáp', { games: ['wardogs'], publicRoleKeys: ['leader'] });
    await publishedMember('Syntetický Filtr Sova', { games: ['hell-let-loose'], publicRoleKeys: ['member'] });
    const byName = await listPublicMembers(t.db, { q: 'filtr cap' });
    expect(byName.items.map((m) => m.slug)).toEqual([wardogs.slug]);
    expect((await listPublicMembers(t.db, { q: 'Filtr', game: 'hell-let-loose' })).items.map((m) => m.displayName)).toEqual(['Syntetický Filtr Sova']);
    expect((await listPublicMembers(t.db, { q: 'Filtr', role: 'leader' })).total).toBe(1);
    expect((await listPublicMembers(t.db, { pageSize: 500 })).items.length).toBeLessThanOrEqual(50);
    const admin = await listMembersForAdmin(t.db, actors.editor, { q: 'filtr', state: 'published' });
    expect(admin.total).toBe(2);
    const denied = await t.db.select().from(auditEvent).where(and(eq(auditEvent.outcome, 'denied'), eq(auditEvent.actorUserId, actors.matchManager.userId)));
    expect(denied.length).toBeGreaterThan(0);
  });
});
