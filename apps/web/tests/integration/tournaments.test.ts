import { asset, auditEvent, match, proseTranslation } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, TEST_ACTOR_IDS, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError } from '@/modules/access/types';
import { getMatchForAdmin, getPublicMatch } from '@/modules/matches/queries';
import { createMatch, publishMatch, updateMatch } from '@/modules/matches/service';
import { hasPublishedReference } from '@/modules/media/usage';
import { communityAssetIsPublic } from '@/modules/prose/assets';
import { publishProse, saveProseDraft } from '@/modules/prose/service';
import { getPublicTournament, getTournamentForAdmin, listPublicTournaments, listTournamentOptionsByGame, listTournamentsForAdmin } from '@/modules/tournaments/queries';
import { createTournament, deleteTournament, publishTournament, unpublishTournament, updateTournament } from '@/modules/tournaments/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actors: TestActors;
beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
});
afterAll(async () => {
  await t?.drop();
});

const doc = (text: string, extra: unknown[] = []) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...extra] });
const hllOnly = () => testPrincipal(['match_manager'], { userId: TEST_ACTOR_IDS.matchManager, games: ['hell-let-loose'] });

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

async function expectDomain(promise: Promise<unknown>, code: string, fields?: Record<string, string>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(DomainError);
  expect(error).toMatchObject({ code, ...(fields ? { fieldErrors: expect.objectContaining(fields) } : {}) });
}

let counter = 0;
async function draftTournament(game: 'hell-let-loose' | 'wardogs' = 'hell-let-loose') {
  counter += 1;
  return createTournament(t.db, actors.matchManager, {
    game,
    name: `Synthetic League ${counter}`,
    season: 'Podzim 2026',
    startsOn: '2026-09-01',
    endsOn: '2026-12-01',
    links: [{ label: 'Rules', url: 'https://example.org/synthetic-rules' }],
  });
}

describe('tournament administration', () => {
  it('creates a draft with a generated slug and an audit event, hidden from the public', async () => {
    const created = await draftTournament();
    expect(created).toMatchObject({ publication: 'draft', version: 1 });
    expect(created.slug).toMatch(/^synthetic-league-\d+-podzim-2026$/);
    expect(await getPublicTournament(t.db, 'hell-let-loose', created.slug, 'cs')).toBeNull();
    expect((await listPublicTournaments(t.db, 'hell-let-loose')).map((item) => item.slug)).not.toContain(created.slug);
    const audits = await t.db.select().from(auditEvent).where(and(eq(auditEvent.entityId, created.id), eq(auditEvent.action, 'tournament.create')));
    expect(audits).toHaveLength(1);
    const admin = await getTournamentForAdmin(t.db, actors.matchManager, created.id);
    expect(admin).toMatchObject({ name: expect.stringMatching(/^Synthetic League/), links: [{ label: 'Rules', url: 'https://example.org/synthetic-rules' }], matchCount: 0 });
  });

  it('publishes facts and the per-locale description, and orders current before finished', async () => {
    const created = await draftTournament();
    const owner = { kind: 'tournament' as const, id: created.id };
    const saved = await saveProseDraft(t.db, actors.matchManager, { owner, locale: 'cs', expectedVersion: 0, body: doc('Pravidla ukázkové ligy') });
    await publishProse(t.db, actors.matchManager, { owner, locale: 'cs', expectedVersion: saved.version });
    // The description stays private until the tournament itself is published.
    expect(await getPublicTournament(t.db, 'hell-let-loose', created.slug, 'cs')).toBeNull();
    const published = await publishTournament(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    const now = new Date('2026-10-15T12:00:00Z');
    const cs = await getPublicTournament(t.db, 'hell-let-loose', created.slug, 'cs', now);
    expect(cs).toMatchObject({ phase: 'ongoing', description: { state: 'published', locale: 'cs', body: doc('Pravidla ukázkové ligy') } });
    expect((await getPublicTournament(t.db, 'hell-let-loose', created.slug, 'en', now))?.description).toEqual({ state: 'missing', availableIn: ['cs'] });
    // Scoped to its game: the Wardogs section does not serve it.
    expect(await getPublicTournament(t.db, 'wardogs', created.slug, 'cs', now)).toBeNull();

    const finished = await createTournament(t.db, actors.matchManager, { game: 'hell-let-loose', name: 'Synthetic Finished Cup', startsOn: '2026-01-01', endsOn: '2026-02-01' });
    await publishTournament(t.db, actors.matchManager, { id: finished.id, expectedVersion: finished.version });
    const list = await listPublicTournaments(t.db, 'hell-let-loose', now);
    const slugs = list.map((item) => item.slug);
    expect(slugs.indexOf(published.slug)).toBeLessThan(slugs.indexOf(finished.slug));
    expect(list.find((item) => item.slug === finished.slug)?.phase).toBe('finished');

    await unpublishTournament(t.db, actors.matchManager, { id: published.id, expectedVersion: published.version });
    expect(await getPublicTournament(t.db, 'hell-let-loose', created.slug, 'cs', now)).toBeNull();
  });

  it('validates dates against the stored values and rejects stale versions', async () => {
    const created = await draftTournament();
    await expectDomain(updateTournament(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version, endsOn: '2026-08-01' }), 'validation', { endsOn: 'ends_before_start' });
    const updated = await updateTournament(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version, organizer: 'Synthetic Organizer' });
    expect(updated.version).toBe(2);
    await expectDomain(updateTournament(t.db, actors.matchManager, { id: created.id, expectedVersion: 1, organizer: 'Stale' }), 'conflict');
  });
});

describe('tournament game scope and permissions', () => {
  it('denies an HLL-only manager a Wardogs tournament and records the denial', async () => {
    const error = await failure(createTournament(t.db, hllOnly(), { game: 'wardogs', name: 'Synthetic Wardogs Cup' }));
    expect(error).toBeInstanceOf(AccessDeniedError);
    const denials = await t.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'tournament.create'), eq(auditEvent.outcome, 'denied')));
    expect(denials.length).toBeGreaterThan(0);

    const wardogs = await draftTournament('wardogs');
    expect(await failure(getTournamentForAdmin(t.db, hllOnly(), wardogs.id))).toBeInstanceOf(AccessDeniedError);
    expect(await failure(publishTournament(t.db, hllOnly(), { id: wardogs.id, expectedVersion: wardogs.version }))).toBeInstanceOf(AccessDeniedError);
    const scopedList = await listTournamentsForAdmin(t.db, hllOnly(), { pageSize: 50 });
    expect(scopedList.items.every((item) => item.game === 'hell-let-loose')).toBe(true);
    const options = await listTournamentOptionsByGame(t.db, hllOnly());
    expect(Object.keys(options)).toEqual(['hell-let-loose']);
  });

  it('denies an editor without match rights', async () => {
    expect(await failure(createTournament(t.db, actors.editor, { game: 'hell-let-loose', name: 'Synthetic Editor Cup' }))).toBeInstanceOf(AccessDeniedError);
    expect(await failure(listTournamentsForAdmin(t.db, actors.editor))).toBeInstanceOf(AccessDeniedError);
  });
});

describe('matches linked to a tournament', () => {
  it('links matches of the same game only and shows the link only while the tournament is published', async () => {
    const tournament = await draftTournament();
    const created = await createMatch(t.db, actors.matchManager, {
      game: 'hell-let-loose',
      opponentName: 'Synthetic Linked Opponent',
      competitionType: 'league',
      startsAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      tournamentId: tournament.id,
    });
    expect((await getMatchForAdmin(t.db, actors.matchManager, created.id))?.tournamentId).toBe(tournament.id);
    await expectDomain(
      createMatch(t.db, actors.matchManager, { game: 'wardogs', opponentName: 'Synthetic Wrong Game', competitionType: 'league', startsAt: new Date().toISOString(), tournamentId: tournament.id }),
      'validation',
      { tournamentId: 'game_mismatch' },
    );
    // Moving the linked match to another game keeps the link valid only when it is removed as well.
    await expectDomain(updateMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version, game: 'wardogs' }), 'validation', { tournamentId: 'game_mismatch' });
    // The tournament's game cannot change while matches are linked.
    await expectDomain(updateTournament(t.db, actors.matchManager, { id: tournament.id, expectedVersion: tournament.version, game: 'wardogs' }), 'invalid_state', { game: 'has_matches' });

    const publishedMatch = await publishMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    expect((await getPublicMatch(t.db, publishedMatch.slug, 'cs'))?.tournament).toBeNull();
    const live = await publishTournament(t.db, actors.matchManager, { id: tournament.id, expectedVersion: tournament.version });
    expect((await getPublicMatch(t.db, publishedMatch.slug, 'cs'))?.tournament).toEqual({ slug: live.slug, game: 'hell-let-loose', name: expect.stringMatching(/^Synthetic League/), season: 'Podzim 2026' });
    const detail = await getPublicTournament(t.db, 'hell-let-loose', live.slug, 'cs');
    expect(detail?.matches.map((row) => row.slug)).toEqual([publishedMatch.slug]);
    expect(detail?.matchCount).toBe(1);
  });

  it('deletes only unpublished tournaments, unlinking matches and removing descriptions', async () => {
    const tournament = await draftTournament();
    const linked = await createMatch(t.db, actors.matchManager, { game: 'hell-let-loose', opponentName: 'Synthetic Unlinked', competitionType: 'cup', startsAt: new Date().toISOString(), tournamentId: tournament.id });
    const owner = { kind: 'tournament' as const, id: tournament.id };
    await saveProseDraft(t.db, actors.matchManager, { owner, locale: 'cs', expectedVersion: 0, body: doc('Koncept popisu') });
    const live = await publishTournament(t.db, actors.matchManager, { id: tournament.id, expectedVersion: tournament.version });
    await expectDomain(deleteTournament(t.db, actors.matchManager, { id: live.id, expectedVersion: live.version }), 'invalid_state');
    const hidden = await unpublishTournament(t.db, actors.matchManager, { id: live.id, expectedVersion: live.version });
    await deleteTournament(t.db, actors.matchManager, { id: hidden.id, expectedVersion: hidden.version });
    const [row] = await t.db.select({ tournamentId: match.tournamentId }).from(match).where(eq(match.id, linked.id));
    expect(row?.tournamentId).toBeNull();
    expect(await t.db.select().from(proseTranslation).where(eq(proseTranslation.tournamentId, tournament.id))).toHaveLength(0);
  });
});

describe('tournament description media', () => {
  it('delivers images of a published description only while the tournament is published', async () => {
    const [image] = await t.db
      .insert(asset)
      .values({ scope: 'match', state: 'ready', originalFilename: 'synthetic-bracket.png', sourceFormat: 'png', width: 1200, height: 800, bytes: 100, sha256: 'x' })
      .returning();
    const tournament = await draftTournament();
    const owner = { kind: 'tournament' as const, id: tournament.id };
    const saved = await saveProseDraft(t.db, actors.matchManager, {
      owner,
      locale: 'cs',
      expectedVersion: 0,
      body: doc('Pavouk', [{ type: 'image', attrs: { assetId: image!.id, alt: 'Syntetický pavouk', caption: '', decorative: false, align: 'center' } }]),
    });
    await publishProse(t.db, actors.matchManager, { owner, locale: 'cs', expectedVersion: saved.version });
    const isPublic = async () => [await communityAssetIsPublic(t.db, image!.id), await hasPublishedReference(t.db, image!.id)];
    expect(await isPublic()).toEqual([false, false]);
    const live = await publishTournament(t.db, actors.matchManager, { id: tournament.id, expectedVersion: tournament.version });
    expect(await isPublic()).toEqual([true, true]);
    await unpublishTournament(t.db, actors.matchManager, { id: live.id, expectedVersion: live.version });
    expect(await isPublic()).toEqual([false, false]);
  });
});
