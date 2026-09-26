import { auditEvent, contentTranslation, publicationSchedule, siteSetting } from '@valkyria/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IssuerCheck, IssuerVerdict } from '@/modules/access/issuer';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError } from '@/modules/access/types';
import { archiveDocument, createDocument, getEditorState, saveDraft } from '@/modules/content/editor';
import { getPublishedNewsBySlug } from '@/modules/content/public';
import { publishTranslation } from '@/modules/content/publication';
import { runPublisher } from '@/modules/content/publisher';
import {
  PUBLISHER_HEARTBEAT_KEY,
  cancelSchedule,
  getPublisherStatus,
  listSchedules,
  reapproveSchedule,
  scheduleTranslation,
} from '@/modules/content/schedule';
import { LOCAL_GRANT, insertTestAsset, sampleBody, seedTaxonomy, seedTestUsers, testActors } from '@/modules/content/testing';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
const actors = testActors();
const editor = actors.editorCs;

/** Fixed clock: 2026-09-26 12:00 UTC. */
const NOW = new Date('2026-09-26T12:00:00Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const authorized = async (): Promise<IssuerVerdict> => 'authorized';

beforeAll(async () => {
  t = await createTestDatabase();
  await seedTestUsers(t.db);
  await seedTaxonomy(t.db);
});
afterAll(async () => {
  await t.drop();
});

let counter = 0;
async function draftPost(title = 'Plánovaný článek') {
  const slug = `plan-${++counter}`;
  const created = await createDocument(t.db, editor, {
    kind: 'news',
    locale: 'cs',
    title,
    slug,
    fields: { excerpt: 'Shrnutí', body: sampleBody('Text plánovaného článku.') },
  });
  return { ...created, slug };
}

async function livePost() {
  const coverId = await insertTestAsset(t.db);
  const post = await draftPost('Živý článek');
  const withCover = await saveDraft(t.db, editor, {
    translationId: post.translationId,
    expectedVersion: post.version,
    fields: { cover: { assetId: coverId, alt: 'Původní obálka', caption: 'Původní popisek', decorative: false }, seoTitle: 'Původní SEO' },
  });
  const live = await publishTranslation(t.db, editor, { translationId: post.translationId, expectedVersion: withCover.version }, { now: () => NOW });
  return { ...post, version: live.version, coverId };
}

async function scheduleRow(id: string) {
  const [row] = await t.db.select().from(publicationSchedule).where(eq(publicationSchedule.id, id));
  return row!;
}

describe('scheduling input and DST handling', () => {
  it('rejects a nonexistent Europe/Prague spring-gap time', async () => {
    const post = await draftPost();
    await expect(
      scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: { localDateTime: '2026-03-29T02:30', timeZone: 'Europe/Prague' } }, { now: () => new Date('2026-03-01T00:00:00Z') }),
    ).rejects.toMatchObject({ code: 'validation', fieldErrors: { 'dueAt.localDateTime': 'nonexistent_local_time' } });
  });

  it('resolves an ambiguous autumn time to the earlier instant and reports it', async () => {
    const post = await draftPost();
    const schedule = await scheduleTranslation(
      t.db,
      editor,
      { translationId: post.translationId, dueAt: { localDateTime: '2026-10-25T02:30', timeZone: 'Europe/Prague' } },
      { now: () => NOW },
    );
    expect(schedule.dueAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(schedule.timeZone).toBe('Europe/Prague');
    expect(schedule.resolution.ambiguous).toBe(true);
    expect(schedule.resolution.candidates.map((d) => d.toISOString())).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
    await cancelSchedule(t.db, editor, { scheduleId: schedule.id }, { now: () => NOW });
  });

  it('converts ordinary local times and ISO instants to UTC and requires a future time', async () => {
    const post = await draftPost();
    const winter = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: { localDateTime: '2026-12-01T09:15' } }, { now: () => NOW });
    expect(winter.dueAt.toISOString()).toBe('2026-12-01T08:15:00.000Z');
    await cancelSchedule(t.db, editor, { scheduleId: winter.id });
    const iso = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: '2026-10-01T18:00:00+02:00' }, { now: () => NOW });
    expect(iso.dueAt.toISOString()).toBe('2026-10-01T16:00:00.000Z');
    await cancelSchedule(t.db, editor, { scheduleId: iso.id });
    await expect(
      scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(-1).toISOString() }, { now: () => NOW }),
    ).rejects.toMatchObject({ code: 'validation', fieldErrors: { dueAt: 'not_in_future' } });
  });

  it('allows one active schedule per translation and only its own revisions', async () => {
    const post = await draftPost();
    const other = await draftPost();
    await expect(
      scheduleTranslation(t.db, editor, { translationId: post.translationId, revisionId: other.revisionId!, dueAt: at(10).toISOString() }, { now: () => NOW }),
    ).rejects.toMatchObject({ code: 'validation', fieldErrors: { revisionId: 'foreign_revision' } });
    const first = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(10).toISOString() }, { now: () => NOW });
    await expect(
      scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(20).toISOString() }, { now: () => NOW }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await cancelSchedule(t.db, editor, { scheduleId: first.id });
  });

  it('requires content.publish and an interactive issuer', async () => {
    const post = await draftPost();
    await expect(
      scheduleTranslation(t.db, actors.matchManager, { translationId: post.translationId, dueAt: at(10).toISOString() }, { now: () => NOW }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      scheduleTranslation(
        t.db,
        { kind: 'system', label: 'scheduler', capabilities: new Set(['content.publish']) },
        { translationId: post.translationId, dueAt: at(10).toISOString() },
        { now: () => NOW },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const passwordOnly = testPrincipal(['administrator'], {
      userId: actors.localAdmin.userId,
      source: 'local_admin',
      assurance: 'password',
      localGrant: { ...LOCAL_GRANT },
    });
    await expect(
      scheduleTranslation(t.db, passwordOnly, { translationId: post.translationId, dueAt: at(10).toISOString() }, { now: () => NOW }),
    ).rejects.toMatchObject({ code: 'mfa_required' });
  });
});

describe('scheduled update of a live article', () => {
  it('keeps the live revision visible, then cancel leaves everything unchanged', async () => {
    const post = await livePost();
    const draft = await saveDraft(t.db, editor, {
      translationId: post.translationId,
      expectedVersion: post.version,
      fields: { title: 'Budoucí titulek', slug: 'budouci-slug', seoTitle: 'Budoucí SEO', cover: null },
    });
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(60).toISOString() }, { now: () => NOW });
    expect(schedule.revisionId).toBe(draft.revisionId);

    const state = await getEditorState(t.db, editor, { translationId: post.translationId }, { now: () => NOW });
    expect(state.translations.cs?.state).toBe('published_update_scheduled');
    expect(state.translations.cs?.schedule).toMatchObject({ id: schedule.id, state: 'pending', overdue: false });

    // Runner before the due time does nothing.
    const early = await runPublisher(t.db, { now: () => at(30), verifyIssuer: authorized });
    expect(early.claimed).toBe(0);

    await cancelSchedule(t.db, editor, { scheduleId: schedule.id }, { now: () => at(31) });
    await runPublisher(t.db, { now: () => at(90), verifyIssuer: authorized });

    const detail = await getPublishedNewsBySlug('cs', post.slug, t.db);
    expect(detail?.kind).toBe('article');
    if (detail?.kind !== 'article') return;
    expect(detail.article).toMatchObject({ title: 'Živý článek', slug: post.slug, seoTitle: 'Původní SEO' });
    expect(detail.article.cover).toMatchObject({ assetId: post.coverId, alt: 'Původní obálka', caption: 'Původní popisek' });
    expect(await getPublishedNewsBySlug('cs', 'budouci-slug', t.db)).toBeNull();
    const after = await getEditorState(t.db, editor, { translationId: post.translationId });
    expect(after.translations.cs?.state).toBe('published_with_changes');
    expect((await scheduleRow(schedule.id)).state).toBe('cancelled');
  });
});

describe('manual publication with a pending schedule', () => {
  it('supersedes the older scheduled revision instead of letting it overwrite later', async () => {
    const post = await livePost();
    const scheduledDraft = await saveDraft(t.db, editor, { translationId: post.translationId, expectedVersion: post.version, fields: { title: 'Naplánovaná verze' } });
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(60).toISOString() }, { now: () => NOW });
    const fix = await saveDraft(t.db, editor, { translationId: post.translationId, expectedVersion: scheduledDraft.version, fields: { title: 'Okamžitá oprava' } });
    const published = await publishTranslation(t.db, editor, { translationId: post.translationId, expectedVersion: fix.version }, { now: () => at(1) });
    expect(published.supersededScheduleId).toBe(schedule.id);
    expect(await scheduleRow(schedule.id)).toMatchObject({ state: 'cancelled', lastError: 'superseded_by_manual_publish' });
    expect((await runPublisher(t.db, { now: () => at(61), verifyIssuer: authorized })).claimed).toBe(0);
    const detail = await getPublishedNewsBySlug('cs', post.slug, t.db);
    expect(detail?.kind === 'article' && detail.article.title).toBe('Okamžitá oprava');
  });
});

describe('publisher runner', () => {
  it('publishes a due schedule exactly once under three concurrent runners', async () => {
    const post = await livePost();
    const draft = await saveDraft(t.db, editor, { translationId: post.translationId, expectedVersion: post.version, fields: { title: 'Aktualizace', slug: `${post.slug}-v2` } });
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    // Later unsaved/saved drafts are NOT what gets published: the intent targets its revision.
    await saveDraft(t.db, editor, { translationId: post.translationId, expectedVersion: draft.version, fields: { title: 'Pozdější koncept' } });

    const calls: IssuerCheck[] = [];
    const verifier = async (_db: unknown, input: IssuerCheck): Promise<IssuerVerdict> => {
      calls.push(input);
      return 'authorized';
    };
    const results = await Promise.all([0, 1, 2].map(() => runPublisher(t.db, { now: () => at(6), verifyIssuer: verifier })));
    expect(results.reduce((sum, r) => sum + r.completed, 0)).toBe(1);
    expect(results.reduce((sum, r) => sum + r.claimed, 0)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ issuerKind: 'discord', issuerUserId: editor.userId, capability: 'content.publish', grantId: null });

    const row = await scheduleRow(schedule.id);
    expect(row).toMatchObject({ state: 'completed', attempts: 1 });
    const [translation] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId));
    expect(translation!.publishedRevisionId).toBe(draft.revisionId);
    const detail = await getPublishedNewsBySlug('cs', `${post.slug}-v2`, t.db);
    expect(detail?.kind === 'article' && detail.article.title).toBe('Aktualizace');
    expect(await getPublishedNewsBySlug('cs', post.slug, t.db)).toEqual({ kind: 'redirect', slug: `${post.slug}-v2` });

    const audits = await t.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.action, 'content.publish'), eq(auditEvent.translationId, post.translationId), eq(auditEvent.actorKind, 'scheduler')));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.summary).toMatchObject({ mode: 'scheduled', scheduleId: schedule.id, issuer: { kind: 'discord', userId: editor.userId } });
    expect(audits[0]!.locale).toBe('cs');

    // Re-running is a no-op.
    const rerun = await runPublisher(t.db, { now: () => at(7), verifyIssuer: verifier });
    expect(rerun.claimed).toBe(0);

    const [heartbeat] = await t.db.select().from(siteSetting).where(eq(siteSetting.key, PUBLISHER_HEARTBEAT_KEY));
    expect(heartbeat!.value).toMatchObject({ lastRunAt: at(7).toISOString(), lastSuccessAt: at(7).toISOString() });
  });

  it('blocks a revoked issuer, leaves live content untouched and never auto-reactivates', async () => {
    const post = await livePost();
    await saveDraft(t.db, editor, { translationId: post.translationId, expectedVersion: post.version, fields: { title: 'Nepovolená změna' } });
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    const run = await runPublisher(t.db, { now: () => at(6), verifyIssuer: async () => 'revoked' });
    expect(run).toMatchObject({ claimed: 1, blocked: 1, completed: 0 });
    expect(await scheduleRow(schedule.id)).toMatchObject({ state: 'blocked', lastError: 'issuer_revoked' });
    const detail = await getPublishedNewsBySlug('cs', post.slug, t.db);
    expect(detail?.kind === 'article' && detail.article.title).toBe('Živý článek');

    const later = await runPublisher(t.db, { now: () => at(600), verifyIssuer: authorized });
    expect(later.claimed).toBe(0);
    expect((await scheduleRow(schedule.id)).state).toBe('blocked');
    const blockedAudit = await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'content.schedule.blocked'), eq(auditEvent.entityId, schedule.id)));
    expect(blockedAudit).toHaveLength(1);
    expect(blockedAudit[0]).toMatchObject({ outcome: 'denied', actorKind: 'scheduler' });

    const status = await getPublisherStatus(t.db, editor, { now: () => at(600) });
    expect(status.counts.blocked).toBeGreaterThanOrEqual(1);
    const listed = await listSchedules(t.db, editor, { overdue: true }, { now: () => at(600) });
    expect(listed.items.find((item) => item.id === schedule.id)).toMatchObject({ needsReapproval: true });

    // Fresh approval by a currently authorized actor creates a new linked intent.
    const reapproved = await reapproveSchedule(t.db, actors.administrator, { scheduleId: schedule.id }, { now: () => at(601) });
    expect(reapproved).toMatchObject({ state: 'pending', previousScheduleId: schedule.id, revisionId: schedule.revisionId });
    expect(reapproved.dueAt.toISOString()).toBe(at(601).toISOString());
    expect((await scheduleRow(schedule.id)).state).toBe('cancelled');
    await expect(reapproveSchedule(t.db, actors.administrator, { scheduleId: schedule.id }, { now: () => at(602) })).rejects.toMatchObject({ code: 'invalid_state' });
    const done = await runPublisher(t.db, { now: () => at(602), verifyIssuer: authorized });
    expect(done.completed).toBe(1);
    const updated = await getPublishedNewsBySlug('cs', post.slug, t.db);
    expect(updated?.kind === 'article' && updated.article.title).toBe('Nepovolená změna');
  });

  it('blocks when authority cannot be verified (outage) or the verifier throws', async () => {
    const a = await draftPost();
    const b = await draftPost();
    const sa = await scheduleTranslation(t.db, editor, { translationId: a.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    const sb = await scheduleTranslation(t.db, editor, { translationId: b.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    let call = 0;
    const run = await runPublisher(t.db, {
      now: () => at(6),
      verifyIssuer: async () => {
        call += 1;
        if (call === 1) return 'unknown';
        throw new Error('discord down');
      },
    });
    expect(run.blocked).toBe(2);
    expect((await scheduleRow(sa.id)).lastError).toBe('issuer_unknown');
    expect((await scheduleRow(sb.id)).lastError).toBe('issuer_unknown');
    expect(await getPublishedNewsBySlug('cs', a.slug, t.db)).toBeNull();
  });

  it('records local-admin delegation and passes the grant to the verifier', async () => {
    const post = await draftPost();
    const schedule = await scheduleTranslation(t.db, actors.localAdmin, { translationId: post.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    const row = await scheduleRow(schedule.id);
    expect(row).toMatchObject({
      issuerKind: 'local_admin',
      issuerUserId: actors.localAdmin.userId,
      issuerGrantId: LOCAL_GRANT.id,
      issuerGrantVersion: LOCAL_GRANT.version,
      issuerAssurance: 'mfa',
      capability: 'content.publish',
    });
    const seen: IssuerCheck[] = [];
    // Grant version changed after scheduling → revoked.
    const run = await runPublisher(t.db, {
      now: () => at(6),
      verifyIssuer: async (_db, input) => {
        seen.push(input);
        return input.grantVersion === LOCAL_GRANT.version + 1 ? 'authorized' : 'revoked';
      },
    });
    expect(seen[0]).toMatchObject({ issuerKind: 'local_admin', grantId: LOCAL_GRANT.id, grantVersion: LOCAL_GRANT.version });
    expect(run.blocked).toBe(1);
    const audit = await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'content.schedule'), eq(auditEvent.translationId, post.translationId)));
    expect(audit[0]!.summary).toMatchObject({ issuerGrantId: LOCAL_GRANT.id, issuerGrantVersion: LOCAL_GRANT.version, assuranceAtCreation: 'mfa' });
    expect(JSON.stringify(audit[0]!.summary)).not.toMatch(/session/i);

    // A valid delayed local-admin schedule publishes.
    const post2 = await draftPost();
    await scheduleTranslation(t.db, actors.localAdmin, { translationId: post2.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    const ok = await runPublisher(t.db, { now: () => at(6), verifyIssuer: async (_db, input) => (input.grantId === LOCAL_GRANT.id ? 'authorized' : 'revoked') });
    expect(ok.completed).toBe(1);
    expect((await getPublishedNewsBySlug('cs', post2.slug, t.db))?.kind).toBe('article');
  });

  it('recovers an expired claim lease after a crashed runner', async () => {
    const post = await draftPost();
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    // Simulate a runner that claimed and crashed.
    await t.db
      .update(publicationSchedule)
      .set({ state: 'claimed', attempts: 1, claimedAt: at(6), claimExpiresAt: at(11) })
      .where(eq(publicationSchedule.id, schedule.id));
    const tooEarly = await runPublisher(t.db, { now: () => at(8), verifyIssuer: authorized });
    expect(tooEarly.claimed).toBe(0);
    const overdue = await listSchedules(t.db, editor, { overdue: true }, { now: () => at(10) });
    expect(overdue.items.find((item) => item.id === schedule.id)?.overdue).toBe(true);
    const recovered = await runPublisher(t.db, { now: () => at(12), verifyIssuer: authorized });
    expect(recovered.completed).toBe(1);
    expect(await scheduleRow(schedule.id)).toMatchObject({ state: 'completed', attempts: 2 });
  });

  it('respects a cancellation between claim and publication', async () => {
    const post = await draftPost();
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    const run = await runPublisher(t.db, {
      now: () => at(6),
      verifyIssuer: async () => {
        await cancelSchedule(t.db, editor, { scheduleId: schedule.id }, { now: () => at(6) });
        return 'authorized';
      },
    });
    expect(run).toMatchObject({ claimed: 1, skipped: 1, completed: 0 });
    expect((await scheduleRow(schedule.id)).state).toBe('cancelled');
    expect(await getPublishedNewsBySlug('cs', post.slug, t.db)).toBeNull();
  });

  it('fails deterministically on a taken slug or archived document and needs reapproval', async () => {
    const post = await draftPost();
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    // Move this translation's draft slug away and let another post reserve the scheduled slug.
    const [translation] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId));
    await saveDraft(t.db, editor, { translationId: post.translationId, expectedVersion: translation!.version, fields: { slug: `${post.slug}-jinde` } });
    await createDocument(t.db, editor, { kind: 'news', locale: 'cs', title: 'Zabírá slug', slug: post.slug });
    const run = await runPublisher(t.db, { now: () => at(6), verifyIssuer: authorized });
    expect(run.failed).toBe(1);
    expect(await scheduleRow(schedule.id)).toMatchObject({ state: 'failed', lastError: 'slug_taken' });
    const again = await runPublisher(t.db, { now: () => at(600), verifyIssuer: authorized });
    expect(again.claimed).toBe(0);
    const listed = await listSchedules(t.db, editor, { state: 'failed' }, { now: () => at(600) });
    expect(listed.items.find((item) => item.id === schedule.id)?.needsReapproval).toBe(true);

    const archivedPost = await draftPost();
    const archivedSchedule = await scheduleTranslation(t.db, editor, { translationId: archivedPost.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    await archiveDocument(t.db, editor, { documentId: archivedPost.documentId, expectedDocumentVersion: 1 });
    expect(await scheduleRow(archivedSchedule.id)).toMatchObject({ state: 'cancelled', lastError: 'document_archived' });
  });

  it('retries transient failures with backoff and gives up after the attempt limit', async () => {
    const post = await draftPost();
    const schedule = await scheduleTranslation(t.db, editor, { translationId: post.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    await t.db
      .update(publicationSchedule)
      .set({ state: 'failed', lastError: 'database_error', attempts: 1, updatedAt: at(6) })
      .where(eq(publicationSchedule.id, schedule.id));
    expect((await runPublisher(t.db, { now: () => at(6.5), verifyIssuer: authorized })).claimed).toBe(0);
    expect((await runPublisher(t.db, { now: () => at(7.1), verifyIssuer: authorized })).completed).toBe(1);

    const exhausted = await draftPost();
    const s2 = await scheduleTranslation(t.db, editor, { translationId: exhausted.translationId, dueAt: at(5).toISOString() }, { now: () => NOW });
    await t.db
      .update(publicationSchedule)
      .set({ state: 'claimed', attempts: 5, claimExpiresAt: at(6) })
      .where(eq(publicationSchedule.id, s2.id));
    const run = await runPublisher(t.db, { now: () => at(10), verifyIssuer: authorized });
    expect(run.exhausted).toBe(1);
    expect(await scheduleRow(s2.id)).toMatchObject({ state: 'failed', lastError: 'attempts_exhausted' });
  });

  it('keeps the active-schedule invariant in the database', async () => {
    const [{ count }] = (
      await t.db.execute<{ count: number }>(
        sql`select count(*)::int as count from (select translation_id from publication_schedule where state in ('pending','claimed','blocked','failed') group by translation_id having count(*) > 1) x`,
      )
    ).rows as [{ count: number }];
    expect(count).toBe(0);
  });
});
