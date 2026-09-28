import { auditEvent, contentDocument, match } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, TEST_ACTOR_IDS, type TestActors } from '@/fixtures/test-actors';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError, type Principal } from '@/modules/access/types';
import { createDocument, getEditorState, listDocumentsForAdmin, saveDraft } from '@/modules/content/editor';
import { getPreview } from '@/modules/content/preview';
import { publishTranslation } from '@/modules/content/publication';
import { sampleBody, seedTaxonomy } from '@/modules/content/testing';
import { getMatchForAdmin, listMatchesForAdmin } from '@/modules/matches/queries';
import { createMatch, publishMatch, recordResult, updateMatch } from '@/modules/matches/service';
import { listMembersForAdmin } from '@/modules/members/queries';
import { createMemberProfile, updateMemberProfile } from '@/modules/members/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

/*
 * One website session across both games, explicit game-scoped authority (ADR-WEB-002):
 * an HLL-scoped editor/match manager is denied every Wardogs and community resource,
 * including private reads, previews, list rows and cross-game moves. Synthetic data only.
 */

let t: TestDatabase;
let actors: TestActors;
let hllEditor: Principal;
let hllMatchManager: Principal;

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
  await seedTaxonomy(t.db);
  hllEditor = testPrincipal(['editor'], { userId: TEST_ACTOR_IDS.editor, label: 'Synthetic HLL editor', games: ['hell-let-loose'] });
  hllMatchManager = testPrincipal(['match_manager'], { userId: TEST_ACTOR_IDS.matchManager, label: 'Synthetic HLL match manager', games: ['hell-let-loose'] });
});
afterAll(async () => {
  await t.drop();
});

async function expectForbidden(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, 'expected AccessDeniedError(forbidden)').toBeInstanceOf(AccessDeniedError);
  expect((error as AccessDeniedError).code).toBe('forbidden');
}

let counter = 0;
const slug = (prefix: string) => `${prefix}-${++counter}`;

function newsInput(game: 'hell-let-loose' | 'wardogs' | null, title: string) {
  return {
    kind: 'news' as const,
    locale: 'cs' as const,
    title,
    slug: slug('scope'),
    categoryKey: 'announcements',
    game,
    fields: { excerpt: 'Synthetické shrnutí.', body: sampleBody('Synthetický obsah.'), authorLabel: 'Synthetic' },
  };
}

const HOUR = 60 * 60 * 1000;
function matchInput(game: 'hell-let-loose' | 'wardogs', opponentName: string) {
  return { game, opponentName, competitionType: 'friendly' as const, startsAt: new Date(Date.now() - 2 * HOUR).toISOString() };
}

describe('game-scoped editorial authority', () => {
  it('lets an HLL editor create HLL posts but not Wardogs or community posts, and audits the denial', async () => {
    const own = await createDocument(t.db, hllEditor, newsInput('hell-let-loose', '[Synthetic] HLL scoped post'));
    expect(own.documentId).toBeTruthy();
    await expectForbidden(createDocument(t.db, hllEditor, newsInput('wardogs', '[Synthetic] Wardogs attempt')));
    await expectForbidden(createDocument(t.db, hllEditor, newsInput(null, '[Synthetic] Community attempt')));
    const denials = await t.db
      .select({ summary: auditEvent.summary })
      .from(auditEvent)
      .where(and(eq(auditEvent.action, 'content.create'), eq(auditEvent.outcome, 'denied'), eq(auditEvent.actorUserId, TEST_ACTOR_IDS.editor)));
    expect(denials.length).toBe(2);
    expect(denials.every((row) => (row.summary as { reason?: string }).reason === 'game_scope')).toBe(true);
  });

  it('hides another game’s drafts from private reads, previews, lists and mutations', async () => {
    const wardogs = await createDocument(t.db, actors.editor, newsInput('wardogs', '[Synthetic] Wardogs private draft'));
    const hll = await createDocument(t.db, hllEditor, newsInput('hell-let-loose', '[Synthetic] HLL visible draft'));
    await expectForbidden(getEditorState(t.db, { ...hllEditor, intent: 'read' }, { documentId: wardogs.documentId }));
    await expectForbidden(getPreview(t.db, { ...hllEditor, intent: 'read' }, { translationId: wardogs.translationId }));
    await expectForbidden(saveDraft(t.db, hllEditor, { translationId: wardogs.translationId, expectedVersion: wardogs.version, fields: { title: 'Hijack' } }));
    await expectForbidden(publishTranslation(t.db, hllEditor, { translationId: wardogs.translationId, expectedVersion: wardogs.version }));

    const list = await listDocumentsForAdmin(t.db, { ...hllEditor, intent: 'read' }, { kind: 'news', pageSize: 50 });
    const ids = list.items.map((row) => row.documentId);
    expect(ids).toContain(hll.documentId);
    expect(ids).not.toContain(wardogs.documentId);
    expect(list.items.every((row) => row.game === 'hell-let-loose')).toBe(true);
    // A filter cannot widen the scope.
    const widened = await listDocumentsForAdmin(t.db, { ...hllEditor, intent: 'read' }, { kind: 'news', game: 'wardogs', pageSize: 50 });
    expect(widened.items).toEqual([]);

    const platform = await listDocumentsForAdmin(t.db, { ...actors.editor, intent: 'read' }, { kind: 'news', pageSize: 50 });
    expect(platform.items.map((row) => row.documentId)).toEqual(expect.arrayContaining([hll.documentId, wardogs.documentId]));
  });

  it('refuses to move a post into a game outside the scope and leaves it unchanged', async () => {
    const created = await createDocument(t.db, hllEditor, newsInput('hell-let-loose', '[Synthetic] HLL post to keep'));
    const state = await getEditorState(t.db, { ...hllEditor, intent: 'read' }, { documentId: created.documentId });
    await expectForbidden(
      saveDraft(t.db, hllEditor, {
        translationId: created.translationId,
        expectedVersion: created.version,
        fields: {},
        shared: { expectedDocumentVersion: state.document.version, game: 'wardogs' },
      }),
    );
    const [row] = await t.db.select({ game: contentDocument.game }).from(contentDocument).where(eq(contentDocument.id, created.documentId));
    expect(row?.game).toBe('hell-let-loose');
  });
});

describe('game-scoped match authority', () => {
  it('restricts creation, changes, results and private reads to the scoped game', async () => {
    const hll = await createMatch(t.db, hllMatchManager, matchInput('hell-let-loose', 'Synthetic HLL Opponent'));
    await expectForbidden(createMatch(t.db, hllMatchManager, matchInput('wardogs', 'Synthetic WDG Opponent')));
    const wardogs = await createMatch(t.db, actors.matchManager, matchInput('wardogs', 'Synthetic WDG Opponent'));

    await expectForbidden(updateMatch(t.db, hllMatchManager, { id: wardogs.id, expectedVersion: wardogs.version, opponentName: 'Renamed' }));
    await expectForbidden(publishMatch(t.db, hllMatchManager, { id: wardogs.id, expectedVersion: wardogs.version }));
    await expectForbidden(
      recordResult(t.db, hllMatchManager, { id: wardogs.id, expectedVersion: wardogs.version, scoreValkyria: 5, scoreOpponent: 0, outcome: 'win', verification: 'verified', source: 'synthetic' }),
    );
    await expectForbidden(updateMatch(t.db, hllMatchManager, { id: hll.id, expectedVersion: hll.version, game: 'wardogs' }));
    await expectForbidden(getMatchForAdmin(t.db, { ...hllMatchManager, intent: 'read' }, wardogs.id));

    const list = await listMatchesForAdmin(t.db, { ...hllMatchManager, intent: 'read' }, { pageSize: 50 });
    expect(list.items.map((item) => item.id)).toContain(hll.id);
    expect(list.items.every((item) => item.game === 'hell-let-loose')).toBe(true);
    const [stored] = await t.db.select({ name: match.opponentName, game: match.game }).from(match).where(eq(match.id, wardogs.id));
    expect(stored).toEqual({ name: 'Synthetic WDG Opponent', game: 'wardogs' });
  });
});

describe('game-scoped member authority', () => {
  it('requires the capability for every affiliation of a profile', async () => {
    const hllOnly = await createMemberProfile(t.db, hllEditor, { displayName: 'Synthetic HLL Member', games: ['hell-let-loose'] });
    await expectForbidden(createMemberProfile(t.db, hllEditor, { displayName: 'Synthetic Dual Member', games: ['hell-let-loose', 'wardogs'] }));
    await expectForbidden(createMemberProfile(t.db, hllEditor, { displayName: 'Synthetic Unaffiliated Member' }));
    await expectForbidden(updateMemberProfile(t.db, hllEditor, { id: hllOnly.id, expectedVersion: hllOnly.version, games: ['hell-let-loose', 'wardogs'] }));
    const dual = await createMemberProfile(t.db, actors.editor, { displayName: 'Synthetic Dual Member', games: ['hell-let-loose', 'wardogs'] });
    await expectForbidden(updateMemberProfile(t.db, hllEditor, { id: dual.id, expectedVersion: dual.version, displayName: 'Renamed' }));

    const list = await listMembersForAdmin(t.db, { ...hllEditor, intent: 'read' }, { pageSize: 50 });
    const ids = list.items.map((item) => item.id);
    expect(ids).toContain(hllOnly.id);
    expect(ids).not.toContain(dual.id);
  });
});
