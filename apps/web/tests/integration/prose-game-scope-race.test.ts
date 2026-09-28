import { auditEvent, proseRevision, proseTranslation } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureTestActors, TEST_ACTOR_IDS, type TestActors } from '@/fixtures/test-actors';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError, type Principal } from '@/modules/access/types';
import { sampleBody } from '@/modules/content/testing';
import { createMatch } from '@/modules/matches/service';
import { createMemberProfile } from '@/modules/members/service';
import { publishProse, restoreProseRevision, saveProseDraft, unpublishProse } from '@/modules/prose/service';
import type { ProseOwner, ProseOwnerKind } from '@/modules/prose/types';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actors: TestActors;
beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
});
afterAll(async () => { await t?.drop(); });

async function fixture(kind: ProseOwnerKind) {
  const actor = kind === 'member' ? actors.editor : actors.matchManager;
  const created = kind === 'member'
    ? await createMemberProfile(t.db, actor, { displayName: 'Synthetic HLL biography', games: ['hell-let-loose'] })
    : await createMatch(t.db, actor, { game: 'hell-let-loose', opponentName: 'Synthetic HLL recap', competitionType: 'friendly', startsAt: new Date().toISOString() });
  const owner: ProseOwner = { kind, id: created.id };
  const first = await saveProseDraft(t.db, actor, { owner, locale: 'cs', expectedVersion: 0, body: sampleBody('Original synthetic prose') });
  const live = await publishProse(t.db, actor, { owner, locale: 'cs', expectedVersion: first.version });
  const draft = await saveProseDraft(t.db, actor, { owner, locale: 'cs', expectedVersion: live.version, body: sampleBody('Unpublished synthetic prose') });
  const scoped: Principal = kind === 'member'
    ? testPrincipal(['editor'], { userId: TEST_ACTOR_IDS.editor, games: ['hell-let-loose'] })
    : testPrincipal(['match_manager'], { userId: TEST_ACTOR_IDS.matchManager, games: ['hell-let-loose'] });
  return { owner, scoped, first, draft };
}

/** Wait for an observed PostgreSQL lock, not a guessed delay between requests. */
async function waitForBlockedMutation() {
  await vi.waitFor(async () => {
    const waiting = await t.pool.query<{ query: string }>(
      "select query from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and application_name='valkyria-test' and wait_event_type='Lock'",
    );
    expect(waiting.rows.some(({ query }) => /\"(?:match|member_profile|prose_translation)\"/.test(query))).toBe(true);
  }, { timeout: 3000, interval: 10 });
}

async function snapshot(translationId: string) {
  const [translation] = await t.db.select().from(proseTranslation).where(eq(proseTranslation.id, translationId));
  const revisions = await t.db.select().from(proseRevision).where(eq(proseRevision.proseTranslationId, translationId)).orderBy(proseRevision.id);
  return { translation, revisions };
}

describe.each(['match', 'member'] as const)('%s prose game scope after a concurrent owner move', (kind) => {
  it.each(['save', 'publish', 'unpublish', 'restore'] as const)('denies %s after the owner moves outside the actor scope', async (action) => {
    const { owner, scoped, first, draft } = await fixture(kind);
    const before = await snapshot(draft.translationId);
    const blocker = await t.pool.connect();
    const table = kind === 'member' ? 'member_profile' : 'match';
    await blocker.query('begin');
    // Both versions wait deterministically: the unfixed service reaches the translation
    // lock; the fixed service must first lock/recheck the owner. The owner move commits
    // before either can continue. Moving the owner leaves the prose version unchanged.
    await blocker.query(`select id from "${table}" where id=$1 for update`, [owner.id]);
    await blocker.query('select id from prose_translation where id=$1 for update', [draft.translationId]);
    const target = { owner, locale: 'cs' as const, expectedVersion: draft.version };
    const operation = action === 'save'
      ? saveProseDraft(t.db, scoped, { ...target, body: sampleBody('Must never be saved') })
      : action === 'publish'
        ? publishProse(t.db, scoped, target)
        : action === 'unpublish'
          ? unpublishProse(t.db, scoped, target)
          : restoreProseRevision(t.db, scoped, { ...target, revisionId: first.revisionId! });
    const result = operation.then((value) => ({ value, error: null }), (error: unknown) => ({ value: null, error }));
    try {
      await waitForBlockedMutation();
      if (kind === 'member') {
        await blocker.query("update member_profile set games=array['hell-let-loose','wardogs'], version=version+1 where id=$1", [owner.id]);
      } else {
        await blocker.query("update match set game='wardogs', version=version+1 where id=$1", [owner.id]);
      }
      await blocker.query('commit');
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    const outcome = await result;
    expect(outcome.error).toBeInstanceOf(AccessDeniedError);
    expect(outcome.error).toMatchObject({ code: 'forbidden' });
    expect(await snapshot(draft.translationId)).toEqual(before);
    const denials = await t.db.select({ summary: auditEvent.summary }).from(auditEvent).where(and(
      eq(auditEvent.entityId, owner.id), eq(auditEvent.action, `prose.${action}`), eq(auditEvent.outcome, 'denied'),
    ));
    expect(denials).toEqual([{ summary: { code: 'forbidden', reason: 'game_scope' } }]);
  });
});
