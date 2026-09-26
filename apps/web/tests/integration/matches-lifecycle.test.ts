import { asset, auditEvent, match } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { AccessDeniedError } from '@/modules/access/types';
import {
  getMatchForAdmin,
  getNextPublicMatch,
  getPublicMatch,
  getPublicMatchCounts,
  listMatchesForAdmin,
  listPublicMatches,
} from '@/modules/matches/queries';
import {
  cancelMatch,
  createMatch,
  deleteMatch,
  markLive,
  postponeMatch,
  publishMatch,
  recordResult,
  rescheduleMatch,
  unpublishMatch,
  updateMatch,
} from '@/modules/matches/service';
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

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

async function expectDomain(promise: Promise<unknown>, code: string, field?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected DomainError(${code})`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  if (field) expect(Object.keys((error as DomainError).fieldErrors ?? {})).toContain(field);
  return error as DomainError;
}

async function expectDenied(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected AccessDeniedError(${code})`).toBeInstanceOf(AccessDeniedError);
  expect((error as AccessDeniedError).code).toBe(code);
}

let counter = 0;
function fixture(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    game: 'wardogs' as const,
    opponentName: `Synthetic Opponent ${counter}`,
    opponentShortCode: `SO${counter}`,
    competitionType: 'friendly' as const,
    startsAt: inHours(48),
    ...overrides,
  };
}

async function createPublished(overrides: Record<string, unknown> = {}) {
  const created = await createMatch(t.db, actors.matchManager, fixture(overrides));
  return publishMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
}

describe('match fixture-to-result journey', () => {
  it('creates, publishes, postpones and records a verified result reflected in public lists and detail', async () => {
    const created = await createMatch(t.db, actors.matchManager, fixture({ opponentName: 'Synthetic Journey Opponent', startsAt: inHours(2) }));
    expect(created).toMatchObject({ status: 'scheduled', publication: 'draft', version: 1 });

    // Draft: invisible publicly.
    expect(await getPublicMatch(t.db, created.slug, 'cs')).toBeNull();
    expect((await listPublicMatches(t.db, { view: 'upcoming', q: 'Journey' })).items).toHaveLength(0);

    const published = await publishMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    const upcoming = await listPublicMatches(t.db, { view: 'upcoming', q: 'journey' });
    expect(upcoming.items.map((item) => item.slug)).toEqual([created.slug]);
    expect(upcoming.items[0]).toMatchObject({ status: 'scheduled', result: null, opponentName: 'Synthetic Journey Opponent' });

    const originalStart = (await getPublicMatch(t.db, created.slug, 'en'))!.startsAt;
    const newStart = inHours(0.5);
    const postponed = await postponeMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: published.version, newStartsAt: newStart });
    expect(postponed.status).toBe('postponed');
    const postponedDetail = await getPublicMatch(t.db, created.slug, 'cs');
    expect(postponedDetail).toMatchObject({ status: 'postponed', originalStartsAt: originalStart, startsAt: newStart, result: null });
    expect((await listPublicMatches(t.db, { view: 'upcoming', q: 'journey' })).items[0]?.status).toBe('postponed');

    const completed = await recordResult(t.db, actors.matchManager, {
      id: created.id,
      expectedVersion: postponed.version,
      scoreValkyria: 3,
      scoreOpponent: 1,
      verification: 'verified',
      source: 'Synthetic league page',
      rounds: [
        { mapName: 'Synthetic Map A', scoreValkyria: 2, scoreOpponent: 0 },
        { mapName: 'Synthetic Map B', scoreValkyria: 1, scoreOpponent: 1, outcome: 'draw' },
      ],
    });
    expect(completed.status).toBe('completed');
    expect((await listPublicMatches(t.db, { view: 'upcoming', q: 'journey' })).items).toHaveLength(0);
    const results = await listPublicMatches(t.db, { view: 'results', q: 'journey' });
    expect(results.items[0]).toMatchObject({
      slug: created.slug,
      status: 'completed',
      result: { scoreValkyria: 3, scoreOpponent: 1, outcome: 'win', verification: 'verified' },
    });
    const detail = await getPublicMatch(t.db, created.slug, 'en');
    expect(detail?.rounds.map((round) => [round.ordinal, round.mapName, round.scoreValkyria, round.scoreOpponent])).toEqual([
      [1, 'Synthetic Map A', 2, 0],
      [2, 'Synthetic Map B', 1, 1],
    ]);
    expect(detail?.recap).toEqual({ state: 'missing', availableIn: [] });

    const changed = await recordResult(t.db, actors.matchManager, {
      id: created.id,
      expectedVersion: completed.version,
      scoreValkyria: 3,
      scoreOpponent: 2,
      verification: 'verified',
    });
    expect((await getPublicMatch(t.db, created.slug, 'cs'))?.result).toMatchObject({ scoreValkyria: 3, scoreOpponent: 2 });
    // Rounds are kept when not supplied.
    expect((await getPublicMatch(t.db, created.slug, 'cs'))?.rounds).toHaveLength(2);
    expect(changed.version).toBe(completed.version + 1);

    const actions = (await t.db.select({ action: auditEvent.action }).from(auditEvent).where(eq(auditEvent.entityId, created.id))).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['match.create', 'match.publish', 'match.postpone', 'match.result.record', 'match.result.change']));
  });

  it('keeps an unknown result null and never reports it as 0:0', async () => {
    const created = await createPublished({ startsAt: inHours(-3) });
    await recordResult(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version, scoreValkyria: null, scoreOpponent: null, verification: 'provisional' });
    const detail = await getPublicMatch(t.db, created.slug, 'cs');
    expect(detail?.status).toBe('completed');
    expect(detail?.result).toEqual({ scoreValkyria: null, scoreOpponent: null, outcome: 'unknown', verification: 'provisional' });
    const [row] = await t.db.select().from(match).where(eq(match.id, created.id));
    expect(row?.status).toBe('completed');
  });

  it('never shows a scheduled fixture with a 0:0 placeholder', async () => {
    const created = await createPublished();
    const detail = await getPublicMatch(t.db, created.slug, 'cs');
    expect(detail?.result).toBeNull();
    expect(detail?.status).toBe('scheduled');
  });

  it('rejects half-known scores, inconsistent outcomes and verified results without data', async () => {
    const created = await createPublished({ startsAt: inHours(-1) });
    const base = { id: created.id, expectedVersion: created.version };
    await expectDomain(recordResult(t.db, actors.matchManager, { ...base, scoreValkyria: 2, scoreOpponent: null, verification: 'provisional' }), 'validation', 'scoreOpponent');
    await expectDomain(
      recordResult(t.db, actors.matchManager, { ...base, scoreValkyria: 2, scoreOpponent: 1, outcome: 'loss', verification: 'provisional' }),
      'validation',
      'outcome',
    );
    await expectDomain(recordResult(t.db, actors.matchManager, { ...base, scoreValkyria: null, scoreOpponent: null, verification: 'verified' }), 'validation', 'verification');
  });

  it('rejects a result for a cancelled match or a match starting more than an hour from now', async () => {
    const future = await createPublished({ startsAt: inHours(3) });
    await expectDomain(
      recordResult(t.db, actors.matchManager, { id: future.id, expectedVersion: future.version, scoreValkyria: 1, scoreOpponent: 0, verification: 'provisional' }),
      'invalid_state',
    );
    await expectDomain(markLive(t.db, actors.matchManager, { id: future.id, expectedVersion: future.version }), 'invalid_state');

    const soon = await createPublished({ startsAt: inHours(0.5) });
    const cancelled = await cancelMatch(t.db, actors.matchManager, { id: soon.id, expectedVersion: soon.version });
    expect(cancelled.status).toBe('cancelled');
    await expectDomain(
      recordResult(t.db, actors.matchManager, { id: soon.id, expectedVersion: cancelled.version, scoreValkyria: 1, scoreOpponent: 0, verification: 'provisional' }),
      'invalid_state',
    );
    await expectDomain(cancelMatch(t.db, actors.matchManager, { id: soon.id, expectedVersion: cancelled.version }), 'invalid_state');
    const cancelledDetail = await getPublicMatch(t.db, soon.slug, 'cs');
    expect(cancelledDetail).toMatchObject({ status: 'cancelled', result: null });
  });

  it('marks a starting match live and completes it with a result', async () => {
    const created = await createPublished({ startsAt: inHours(0.25) });
    const live = await markLive(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    expect(live.status).toBe('live');
    const done = await recordResult(t.db, actors.matchManager, { id: created.id, expectedVersion: live.version, scoreValkyria: 0, scoreOpponent: 0, verification: 'verified' });
    expect(done.status).toBe('completed');
    expect((await getPublicMatch(t.db, created.slug, 'cs'))?.result).toMatchObject({ scoreValkyria: 0, scoreOpponent: 0, outcome: 'draw' });
  });
});

describe('match privacy', () => {
  it('never exposes drafts or internal notes through public queries', async () => {
    const secret = 'Synthetic private note 7f3a';
    const draft = await createMatch(t.db, actors.matchManager, fixture({ opponentName: 'Synthetic Hidden Draft', internalNotes: secret }));
    const published = await createPublished({ opponentName: 'Synthetic Visible Opponent', internalNotes: secret });
    expect(await getPublicMatch(t.db, draft.slug, 'cs')).toBeNull();
    const all = [
      await listPublicMatches(t.db, { view: 'upcoming', pageSize: 25 }),
      await listPublicMatches(t.db, { view: 'results', pageSize: 25 }),
      await getPublicMatch(t.db, published.slug, 'cs'),
      await getPublicMatch(t.db, published.slug, 'en'),
      await getNextPublicMatch(t.db),
    ];
    const json = JSON.stringify(all);
    expect(json).not.toContain(secret);
    expect(json).not.toContain('Synthetic Hidden Draft');
    expect(json).not.toContain('internalNotes');
    expect(json).not.toContain(draft.id);

    const admin = await getMatchForAdmin(t.db, actors.matchManager, published.id);
    expect(admin?.internalNotes).toBe(secret);

    const unpublished = await unpublishMatch(t.db, actors.matchManager, { id: published.id, expectedVersion: published.version });
    expect(unpublished.publication).toBe('draft');
    expect(await getPublicMatch(t.db, published.slug, 'cs')).toBeNull();
  });

  it('returns null for unknown or malformed slugs and unsupported locales', async () => {
    const published = await createPublished();
    expect(await getPublicMatch(t.db, 'does-not-exist', 'cs')).toBeNull();
    expect(await getPublicMatch(t.db, "x' or 1=1 --", 'cs')).toBeNull();
    expect(await getPublicMatch(t.db, published.slug, 'de' as 'cs')).toBeNull();
  });
});

describe('match authorization', () => {
  it('denies editors, members and anonymous visitors every match mutation and private read', async () => {
    const created = await createMatch(t.db, actors.matchManager, fixture());
    const target = { id: created.id, expectedVersion: created.version };
    for (const actor of [actors.editor, actors.member]) {
      await expectDenied(createMatch(t.db, actor, fixture()), 'forbidden');
      await expectDenied(updateMatch(t.db, actor, { ...target, opponentName: 'Hijacked' }), 'forbidden');
      await expectDenied(publishMatch(t.db, actor, target), 'forbidden');
      await expectDenied(postponeMatch(t.db, actor, { ...target, newStartsAt: null }), 'forbidden');
      await expectDenied(cancelMatch(t.db, actor, target), 'forbidden');
      await expectDenied(recordResult(t.db, actor, { ...target, scoreValkyria: 1, scoreOpponent: 0, verification: 'verified' }), 'forbidden');
      await expectDenied(deleteMatch(t.db, actor, target), 'forbidden');
      await expectDenied(listMatchesForAdmin(t.db, actor), 'forbidden');
      await expectDenied(getMatchForAdmin(t.db, actor, created.id), 'forbidden');
    }
    await expectDenied(createMatch(t.db, actors.anonymous, fixture()), 'unauthenticated');
    await expectDenied(publishMatch(t.db, actors.anonymous, target), 'unauthenticated');

    const [row] = await t.db.select().from(match).where(eq(match.id, created.id));
    expect(row).toMatchObject({ version: 1, publication: 'draft', status: 'scheduled' });
    expect(row?.opponentName).not.toBe('Hijacked');

    const denials = await t.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.outcome, 'denied'), eq(auditEvent.actorUserId, actors.editor.userId)));
    expect(denials.map((row) => row.action)).toEqual(expect.arrayContaining(['match.create', 'match.publish', 'match.result']));
  });

  it('allows match managers and administrators', async () => {
    const byAdmin = await createMatch(t.db, actors.administrator, fixture());
    await publishMatch(t.db, actors.administrator, { id: byAdmin.id, expectedVersion: byAdmin.version });
    const page = await listMatchesForAdmin(t.db, actors.matchManager, { publication: 'published' });
    expect(page.items.some((item) => item.id === byAdmin.id)).toBe(true);
  });

  it('authorizes before validating input and reports machine-readable field codes', async () => {
    await expectDenied(createMatch(t.db, actors.editor, { game: 'bogus' } as never), 'forbidden');
    await expectDenied(recordResult(t.db, actors.anonymous, { id: 'nope' } as never), 'unauthenticated');
    const error = await expectDomain(createMatch(t.db, actors.matchManager, { game: 'wardogs', competitionType: 'friendly', startsAt: inHours(5) } as never), 'validation');
    expect(error.fieldErrors).toMatchObject({ opponentName: 'invalid_type' });
    const tooLong = await expectDomain(createMatch(t.db, actors.matchManager, fixture({ opponentName: 'x'.repeat(121) })), 'validation');
    expect(tooLong.fieldErrors).toMatchObject({ opponentName: 'too_long' });
  });

  it('denies a read-intent principal from mutating', async () => {
    const readOnly = { ...actors.matchManager, intent: 'read' as const };
    await expectDenied(createMatch(t.db, readOnly, fixture()), 'stale_authorization');
  });
});

describe('match concurrency, slugs and deletion', () => {
  it('rejects a stale expected version with a conflict', async () => {
    const created = await createMatch(t.db, actors.matchManager, fixture());
    await updateMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: 1, competitionName: 'First edit' });
    await expectDomain(updateMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: 1, competitionName: 'Second edit' }), 'conflict');
    await expectDomain(publishMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: 1 }), 'conflict');
    const [row] = await t.db.select().from(match).where(eq(match.id, created.id));
    expect(row?.competitionName).toBe('First edit');
  });

  it('generates YYYY-MM-DD-opponent slugs with Czech transliteration and keeps them unique', async () => {
    const input = fixture({
      opponentName: 'Žluťoučký Kůň Ďábelský',
      startsAt: { localDateTime: '2026-11-07T00:30', timeZone: 'Europe/Prague' },
    });
    const first = await createMatch(t.db, actors.matchManager, input);
    const second = await createMatch(t.db, actors.matchManager, input);
    // 00:30 Prague on 7 Nov is still 6 Nov in UTC; the slug uses the display zone date.
    expect(first.slug).toBe('2026-11-07-zlutoucky-kun-dabelsky');
    expect(second.slug).toBe('2026-11-07-zlutoucky-kun-dabelsky-2');
    await expectDomain(createMatch(t.db, actors.matchManager, fixture({ slug: first.slug })), 'slug_taken', 'slug');
    await expectDomain(updateMatch(t.db, actors.matchManager, { id: second.id, expectedVersion: second.version, slug: first.slug }), 'slug_taken');
    const renamed = await updateMatch(t.db, actors.matchManager, { id: second.id, expectedVersion: second.version, slug: 'vlastni-slug' });
    expect(renamed.slug).toBe('vlastni-slug');
  });

  it('only deletes unpublished matches', async () => {
    const published = await createPublished();
    await expectDomain(deleteMatch(t.db, actors.matchManager, { id: published.id, expectedVersion: published.version }), 'invalid_state');
    const draft = await unpublishMatch(t.db, actors.matchManager, { id: published.id, expectedVersion: published.version });
    await deleteMatch(t.db, actors.matchManager, { id: draft.id, expectedVersion: draft.version });
    expect(await t.db.select().from(match).where(eq(match.id, published.id))).toHaveLength(0);
    const [event] = await t.db.select().from(auditEvent).where(and(eq(auditEvent.entityId, published.id), eq(auditEvent.action, 'match.delete')));
    expect(event?.outcome).toBe('success');
  });

  it('validates referenced media scope and availability', async () => {
    const [editorial] = await t.db
      .insert(asset)
      .values({ scope: 'editorial', state: 'ready', originalFilename: 'synthetic.png', sourceFormat: 'png', width: 10, height: 10, bytes: 10, sha256: 'x' })
      .returning();
    const [processing] = await t.db
      .insert(asset)
      .values({ scope: 'match', state: 'processing', originalFilename: 'synthetic.png', sourceFormat: 'png', width: 10, height: 10, bytes: 10, sha256: 'y' })
      .returning();
    await createMatch(t.db, actors.matchManager, fixture({ coverAssetId: editorial!.id }));
    await expectDomain(createMatch(t.db, actors.matchManager, fixture({ opponentLogoAssetId: processing!.id })), 'validation', 'opponentLogoAssetId');
    await expectDomain(
      createMatch(t.db, actors.matchManager, fixture({ coverAssetId: '6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6a7b' })),
      'validation',
      'coverAssetId',
    );
  });

  it('accepts planned rounds without scores before completion and rejects scored rounds', async () => {
    const created = await createMatch(t.db, actors.matchManager, fixture());
    const updated = await updateMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: 1, rounds: [{ mapName: 'Synthetic Map Planned' }] });
    await expectDomain(
      updateMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: updated.version, rounds: [{ mapName: 'X', scoreValkyria: 1, scoreOpponent: 0 }] }),
      'validation',
      'rounds',
    );
  });
});

describe('start time and DST handling', () => {
  it('rejects a nonexistent spring-forward local time', async () => {
    const error = await expectDomain(
      createMatch(t.db, actors.matchManager, fixture({ startsAt: { localDateTime: '2026-03-29T02:30', timeZone: 'Europe/Prague' } })),
      'validation',
      'startsAt',
    );
    expect(error.fieldErrors?.startsAt).toBe('nonexistent_local_time');
  });

  it('stores the earlier instant for an ambiguous October local time unless "later" is chosen', async () => {
    const earlier = await createMatch(t.db, actors.matchManager, fixture({ startsAt: { localDateTime: '2026-10-25T02:30', timeZone: 'Europe/Prague' } }));
    const later = await createMatch(
      t.db,
      actors.matchManager,
      fixture({ startsAt: { localDateTime: '2026-10-25T02:30', timeZone: 'Europe/Prague', disambiguation: 'later' } }),
    );
    const rows = await t.db.select({ id: match.id, startsAt: match.startsAt, timeZone: match.timeZone }).from(match);
    expect(rows.find((row) => row.id === earlier.id)?.startsAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(rows.find((row) => row.id === later.id)?.startsAt.toISOString()).toBe('2026-10-25T01:30:00.000Z');
    expect(rows.find((row) => row.id === earlier.id)?.timeZone).toBe('Europe/Prague');
  });

  it('reschedules a postponed match back to scheduled while keeping the original start', async () => {
    const created = await createPublished({ startsAt: inHours(24) });
    const postponed = await postponeMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version, newStartsAt: null });
    const beforeStart = (await getPublicMatch(t.db, created.slug, 'cs'))!;
    expect(beforeStart.originalStartsAt).toBe(beforeStart.startsAt);
    const rescheduled = await rescheduleMatch(t.db, actors.matchManager, {
      id: created.id,
      expectedVersion: postponed.version,
      startsAt: { localDateTime: '2027-01-09T18:00', timeZone: 'Europe/Prague' },
    });
    expect(rescheduled.status).toBe('scheduled');
    const detail = (await getPublicMatch(t.db, created.slug, 'cs'))!;
    expect(detail.startsAt).toBe('2027-01-09T17:00:00.000Z');
    expect(detail.originalStartsAt).toBe(beforeStart.originalStartsAt);
  });
});

describe('public classification', () => {
  let isolated: TestDatabase;
  let local: TestActors;

  beforeAll(async () => {
    isolated = await createTestDatabase();
    local = await ensureTestActors(isolated.db);
    const make = async (overrides: Record<string, unknown>) => {
      const created = await createMatch(isolated.db, local.matchManager, fixture(overrides));
      return publishMatch(isolated.db, local.matchManager, { id: created.id, expectedVersion: created.version });
    };
    const scheduledSoon = await make({ opponentName: 'Class Scheduled Soon', startsAt: inHours(24) });
    await make({ opponentName: 'Class Scheduled Later', startsAt: inHours(72), game: 'hell-let-loose', competitionType: 'league' });
    const toPostpone = await make({ opponentName: 'Class Postponed', startsAt: inHours(30) });
    await postponeMatch(isolated.db, local.matchManager, { id: toPostpone.id, expectedVersion: toPostpone.version, newStartsAt: inHours(200) });
    const toLive = await make({ opponentName: 'Class Live', startsAt: inHours(-0.5) });
    await markLive(isolated.db, local.matchManager, { id: toLive.id, expectedVersion: toLive.version });
    const older = await make({ opponentName: 'Class Completed Older', startsAt: inHours(-72) });
    await recordResult(isolated.db, local.matchManager, { id: older.id, expectedVersion: older.version, scoreValkyria: 1, scoreOpponent: 2, verification: 'verified' });
    const newer = await make({ opponentName: 'Class Completed Newer', startsAt: inHours(-24) });
    await recordResult(isolated.db, local.matchManager, { id: newer.id, expectedVersion: newer.version, scoreValkyria: 2, scoreOpponent: 2, verification: 'provisional' });
    const toCancel = await make({ opponentName: 'Class Cancelled', startsAt: inHours(-48) });
    await cancelMatch(isolated.db, local.matchManager, { id: toCancel.id, expectedVersion: toCancel.version });
    await createMatch(isolated.db, local.matchManager, fixture({ opponentName: 'Class Draft', startsAt: inHours(5) }));
    expect(scheduledSoon.status).toBe('scheduled');
  });
  afterAll(async () => {
    await isolated.drop();
  });

  it('lists upcoming (scheduled/live/postponed) soonest first and results (completed/cancelled) newest first', async () => {
    const upcoming = await listPublicMatches(isolated.db, { view: 'upcoming' });
    expect(upcoming.items.map((item) => item.opponentName)).toEqual(['Class Live', 'Class Scheduled Soon', 'Class Scheduled Later', 'Class Postponed']);
    expect(upcoming.total).toBe(4);
    const results = await listPublicMatches(isolated.db, { view: 'results' });
    expect(results.items.map((item) => item.opponentName)).toEqual(['Class Completed Newer', 'Class Cancelled', 'Class Completed Older']);
    expect(results.items.find((item) => item.opponentName === 'Class Cancelled')?.result).toBeNull();
  });

  it('filters by game, status, competition and diacritic-insensitive search, and paginates', async () => {
    expect((await listPublicMatches(isolated.db, { view: 'upcoming', game: 'hell-let-loose' })).items.map((i) => i.opponentName)).toEqual(['Class Scheduled Later']);
    expect((await listPublicMatches(isolated.db, { view: 'upcoming', status: 'postponed' })).items.map((i) => i.opponentName)).toEqual(['Class Postponed']);
    expect((await listPublicMatches(isolated.db, { view: 'upcoming', status: 'completed' })).items).toHaveLength(0);
    expect((await listPublicMatches(isolated.db, { view: 'upcoming', competition: 'league' })).total).toBe(1);
    expect((await listPublicMatches(isolated.db, { view: 'results', q: 'NEWER' })).total).toBe(1);
    expect((await listPublicMatches(isolated.db, { view: 'upcoming', game: 'bogus' })).total).toBe(4);
    const page2 = await listPublicMatches(isolated.db, { view: 'upcoming', page: 2, pageSize: 3 });
    expect(page2).toMatchObject({ page: 2, pageCount: 2, total: 4 });
    expect(page2.items.map((i) => i.opponentName)).toEqual(['Class Postponed']);
    expect((await listPublicMatches(isolated.db, { view: 'upcoming', pageSize: 1000 })).items.length).toBeLessThanOrEqual(25);
  });

  it('returns the next match and per-view counts', async () => {
    expect((await getNextPublicMatch(isolated.db))?.opponentName).toBe('Class Live');
    expect((await getNextPublicMatch(isolated.db, new Date(Date.now() + 36 * HOUR)))?.opponentName).toBe('Class Live');
    const counts = await getPublicMatchCounts(isolated.db);
    expect(counts).toMatchObject({ upcoming: 4, results: 3, byGame: { wardogs: { upcoming: 3, results: 3 }, 'hell-let-loose': { upcoming: 1, results: 0 } } });
  });
});
