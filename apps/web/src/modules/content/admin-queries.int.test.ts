import { publicationSchedule } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessDeniedError } from '@/modules/access/types';
import { createTestDatabase, type TestDatabase } from '../../../tests/support/test-db';
import { listOwnDrafts, listRowVersions, listScheduleOverview, listTaxonomyOptions } from './admin-queries';
import { createDocument, saveDraft } from './editor';
import { publishTranslation } from './publication';
import { scheduleTranslation } from './schedule';
import { sampleBody, seedTaxonomy, seedTestUsers, testActors } from './testing';

let t: TestDatabase;
const actors = testActors();

beforeAll(async () => {
  t = await createTestDatabase();
  await seedTestUsers(t.db);
  await seedTaxonomy(t.db);
});
afterAll(async () => {
  await t.drop();
});

async function publishablePost(slug: string, actor = actors.editorCs) {
  const created = await createDocument(t.db, actor, {
    kind: 'news',
    locale: 'cs',
    title: `Příspěvek ${slug}`,
    slug,
    fields: { excerpt: 'Perex', body: sampleBody('Text článku.') },
  });
  return created;
}

describe('editorial admin read helpers', () => {
  it('require content.read_private', async () => {
    await expect(listTaxonomyOptions(t.db, actors.matchManager)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(listOwnDrafts(t.db, actors.member)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(listScheduleOverview(t.db, { kind: 'anonymous' })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(listRowVersions(t.db, actors.matchManager, [])).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('lists shared taxonomy keys with both labels', async () => {
    const options = await listTaxonomyOptions(t.db, actors.editorCs);
    expect(options.categories).toContainEqual({ key: 'announcements', labelCs: 'Oznámení', labelEn: 'Announcements' });
    expect(options.tags.map((tag) => tag.key)).toEqual(['recruitment', 'tournament']);
  });

  it('returns current optimistic versions for list row actions', async () => {
    const created = await publishablePost('verze-radku');
    const saved = await saveDraft(t.db, actors.editorCs, { translationId: created.translationId, expectedVersion: created.version, fields: { title: 'Nový název' } });
    const versions = await listRowVersions(t.db, actors.editorCs, [created.documentId]);
    expect(versions.documents[created.documentId]).toBe(created.documentVersion);
    expect(versions.translations[created.translationId]).toBe(saved.version);
  });

  it('lists only the actor’s unpublished drafts and unpublished changes', async () => {
    const mine = await publishablePost('muj-koncept');
    const other = await publishablePost('cizi-koncept', actors.editorEn);
    const live = await publishablePost('muj-zverejneny');
    const published = await publishTranslation(t.db, actors.editorCs, { translationId: live.translationId, expectedVersion: live.version });

    let drafts = await listOwnDrafts(t.db, actors.editorCs, 50);
    const ids = drafts.map((item) => item.translationId);
    expect(ids).toContain(mine.translationId);
    expect(ids).not.toContain(other.translationId);
    expect(ids).not.toContain(live.translationId);

    await saveDraft(t.db, actors.editorCs, { translationId: live.translationId, expectedVersion: published.version, fields: { title: 'Změna po zveřejnění' } });
    drafts = await listOwnDrafts(t.db, actors.editorCs, 50);
    expect(drafts.find((item) => item.translationId === live.translationId)).toMatchObject({ published: true, title: 'Změna po zveřejnění', locale: 'cs', kind: 'news' });
  });

  it('orders schedules needing attention first and flags overdue/blocked ones', async () => {
    const now = new Date('2030-01-10T10:00:00.000Z');
    const a = await publishablePost('plan-a');
    const b = await publishablePost('plan-b');
    const c = await publishablePost('plan-c');
    const future = await scheduleTranslation(t.db, actors.editorCs, { translationId: a.translationId, dueAt: '2030-01-20T10:00:00.000Z' }, { now: () => now });
    const overdue = await scheduleTranslation(t.db, actors.editorCs, { translationId: b.translationId, dueAt: '2030-01-10T10:30:00.000Z' }, { now: () => now });
    const blocked = await scheduleTranslation(t.db, actors.editorCs, { translationId: c.translationId, dueAt: '2030-01-25T10:00:00.000Z' }, { now: () => now });
    await t.db.update(publicationSchedule).set({ state: 'blocked', lastError: 'issuer_revoked' }).where(eq(publicationSchedule.id, blocked.id));

    const items = await listScheduleOverview(t.db, actors.editorCs, { now: new Date('2030-01-10T11:00:00.000Z'), limit: 50 });
    const ours = items.filter((item) => [future.id, overdue.id, blocked.id].includes(item.scheduleId));
    expect(ours.map((item) => item.scheduleId)).toEqual([blocked.id, overdue.id, future.id]);
    expect(ours[0]).toMatchObject({ state: 'blocked', needsReapproval: true, overdue: false, title: 'Příspěvek plan-c', locale: 'cs', live: false });
    expect(ours[1]).toMatchObject({ overdue: true, needsReapproval: false });
    expect(ours[2]).toMatchObject({ overdue: false, needsReapproval: false, timeZone: 'Europe/Prague' });
  });
});
