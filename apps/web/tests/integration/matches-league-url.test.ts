import { auditEvent, match } from '@valkyria/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, TEST_ACTOR_IDS, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError, type Principal } from '@/modules/access/types';
import { getMatchForAdmin, getPublicMatch } from '@/modules/matches/queries';
import { createMatch, publishMatch, updateMatch } from '@/modules/matches/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

/*
 * Editorial Wardogs League link on a match (issue #87): producer URL policy, canonical
 * storage, Wardogs-only rule in the service and the database, game-scope denial for an
 * HLL-only match manager and audited field changes. The preview reader itself is covered
 * by unit tests; no Logi request is made here.
 */

let t: TestDatabase;
let actors: TestActors;
let hllMatchManager: Principal;
let counter = 0;
const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
  hllMatchManager = testPrincipal(['match_manager'], { userId: TEST_ACTOR_IDS.matchManager, label: 'Synthetic HLL match manager', games: ['hell-let-loose'] });
});
afterAll(async () => {
  await t.drop();
});

const input = (game: 'wardogs' | 'hell-let-loose', leagueMatchUrl?: string | null) => ({
  game, opponentName: `Synthetic League Opponent ${++counter}`, competitionType: 'league' as const, startsAt: new Date(Date.now() + 48 * HOUR).toISOString(),
  ...(leagueMatchUrl === undefined ? {} : { leagueMatchUrl }),
});

async function expectValidation(promise: Promise<unknown>, field: string, code: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error, `expected DomainError(validation) on ${field}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe('validation');
  expect((error as DomainError).fieldErrors?.[field]).toBe(code);
}

async function expectForbidden(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error, 'expected AccessDeniedError(forbidden)').toBeInstanceOf(AccessDeniedError);
  expect((error as AccessDeniedError).code).toBe('forbidden');
}

describe('League match URL (PostgreSQL)', () => {
  it('stores the canonical producer URL for a Wardogs match and exposes it publicly only once published', async () => {
    const created = await createMatch(t.db, actors.matchManager, input('wardogs', 'https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu/'));
    const admin = await getMatchForAdmin(t.db, { ...actors.matchManager, intent: 'read' }, created.id);
    expect(admin?.leagueMatchUrl).toBe('https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu');
    expect(await getPublicMatch(t.db, created.slug, 'cs')).toBeNull();
    const published = await publishMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version });
    const detail = await getPublicMatch(t.db, created.slug, 'en');
    expect(detail?.leagueMatchUrl).toBe('https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu');
    // The link is editorial data only: no result is derived from it.
    expect(detail?.result).toBeNull();

    const cleared = await updateMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: published.version, leagueMatchUrl: '' });
    expect((await getPublicMatch(t.db, created.slug, 'cs'))?.leagueMatchUrl).toBeNull();
    const audits = await t.db.select({ summary: auditEvent.summary }).from(auditEvent)
      .where(and(eq(auditEvent.action, 'match.update'), eq(auditEvent.outcome, 'success'), eq(auditEvent.entityId, created.id)));
    expect(audits.map((row) => (row.summary as { fields: string[] }).fields)).toEqual([['leagueMatchUrl']]);
    expect(JSON.stringify(audits)).not.toContain('wardogsleague.net');
    expect(cleared.version).toBe(published.version + 1);
  });

  it('rejects unaccepted links with a stable field code and leaves the stored value unchanged', async () => {
    const created = await createMatch(t.db, actors.matchManager, input('wardogs', 'https://wardogsleague.net/matches/keep-me'));
    for (const value of ['https://wardogsleague.net/matches/abc?x=1', 'http://wardogsleague.net/matches/abc', 'https://evil.example/wardogsleague.net/matches/abc', `https://wardogsleague.net/matches/${'a'.repeat(81)}`]) {
      await expectValidation(updateMatch(t.db, actors.matchManager, { id: created.id, expectedVersion: created.version, leagueMatchUrl: value }), 'leagueMatchUrl', 'invalid_league_url');
    }
    const [row] = await t.db.select({ url: match.leagueMatchUrl, version: match.version }).from(match).where(eq(match.id, created.id));
    expect(row).toEqual({ url: 'https://wardogsleague.net/matches/keep-me', version: created.version });
  });

  it('is Wardogs-only in the service and in the database constraint', async () => {
    await expectValidation(createMatch(t.db, actors.matchManager, input('hell-let-loose', 'https://wardogsleague.net/matches/hll-attempt')), 'leagueMatchUrl', 'wardogs_only');
    const hll = await createMatch(t.db, actors.matchManager, input('hell-let-loose'));
    await expectValidation(updateMatch(t.db, actors.matchManager, { id: hll.id, expectedVersion: hll.version, leagueMatchUrl: 'https://wardogsleague.net/matches/hll-attempt' }), 'leagueMatchUrl', 'wardogs_only');

    // Moving a linked Wardogs match to HLL must clear the link in the same edit.
    const linked = await createMatch(t.db, actors.matchManager, input('wardogs', 'https://wardogsleague.net/matches/linked'));
    await expectValidation(updateMatch(t.db, actors.matchManager, { id: linked.id, expectedVersion: linked.version, game: 'hell-let-loose' }), 'leagueMatchUrl', 'wardogs_only');
    const moved = await updateMatch(t.db, actors.matchManager, { id: linked.id, expectedVersion: linked.version, game: 'hell-let-loose', leagueMatchUrl: null });
    expect(moved.version).toBe(linked.version + 1);
    const [row] = await t.db.select({ game: match.game, url: match.leagueMatchUrl }).from(match).where(eq(match.id, linked.id));
    expect(row).toEqual({ game: 'hell-let-loose', url: null });

    for (const statement of [
      sql`update "match" set league_match_url = 'https://wardogsleague.net/matches/direct' where id = ${hll.id}`,
      sql`update "match" set league_match_url = 'https://evil.example/matches/direct' where id = ${linked.id}`,
    ]) {
      const error = await t.db.execute(statement).then(() => null, (e: unknown) => e);
      expect(error, 'expected the match_league_url_ck constraint to reject the direct write').toBeInstanceOf(Error);
      expect(String((error as Error & { cause?: unknown }).cause ?? error)).toMatch(/match_league_url_ck/);
    }
  });

  it('denies an HLL-only match manager the Wardogs link with an audited game-scope denial', async () => {
    const wardogs = await createMatch(t.db, actors.matchManager, input('wardogs'));
    await expectForbidden(updateMatch(t.db, hllMatchManager, { id: wardogs.id, expectedVersion: wardogs.version, leagueMatchUrl: 'https://wardogsleague.net/matches/scoped' }));
    await expectForbidden(createMatch(t.db, hllMatchManager, input('wardogs', 'https://wardogsleague.net/matches/scoped')));
    const [row] = await t.db.select({ url: match.leagueMatchUrl }).from(match).where(eq(match.id, wardogs.id));
    expect(row?.url).toBeNull();
    const denials = await t.db.select({ summary: auditEvent.summary }).from(auditEvent)
      .where(and(eq(auditEvent.action, 'match.update'), eq(auditEvent.outcome, 'denied'), eq(auditEvent.actorUserId, TEST_ACTOR_IDS.matchManager), eq(auditEvent.entityId, wardogs.id)));
    expect(denials.length).toBeGreaterThanOrEqual(1);
    expect(denials.every((entry) => (entry.summary as { reason?: string }).reason === 'game_scope')).toBe(true);
  });
});
