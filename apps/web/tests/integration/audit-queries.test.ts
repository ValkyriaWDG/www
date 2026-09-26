import { auditEvent } from '@valkyria/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { AUDIT_MAX_PAGE_SIZE, auditFilterErrorCode, getAuditEvent, listAuditEvents, listAuditFacets } from '@/modules/audit/queries';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actors: TestActors;
const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
  // Recent events written through the real (redacting) audit writer.
  await recordAudit(t.db, {
    actor: actors.matchManager,
    action: 'match.publish',
    outcome: 'success',
    capability: 'matches.publish',
    entityType: 'match',
    entityId: '00000000-0000-4000-8000-00000000a001',
    summary: { slug: 'synthetic-match', sessionToken: 'must-not-leak', nested: { email: 'person@example.test', ok: 'visible' } },
  });
  await recordAudit(t.db, {
    actor: actors.matchManager,
    action: 'match.result.record',
    outcome: 'success',
    capability: 'matches.edit',
    entityType: 'match',
    entityId: '00000000-0000-4000-8000-00000000a001',
    summary: { next: { scoreValkyria: 3, scoreOpponent: 1, outcome: 'win', verification: 'verified' } },
  });
  await recordAudit(t.db, { actor: actors.editor, action: 'settings.update', outcome: 'denied', capability: 'settings.manage', entityType: 'site_setting', summary: { code: 'forbidden' } });
  await recordAudit(t.db, { actor: actors.editor, action: 'prose.publish', outcome: 'success', capability: 'members.publish', entityType: 'member_profile', locale: 'cs' });
  // Older events (outside the default 30-day window) and a raw, unredacted legacy row.
  await t.db.insert(auditEvent).values([
    { occurredAt: at(45), actorKind: 'system', actorLabel: 'scheduler:publisher', action: 'content.publish', outcome: 'success', entityType: 'content_translation', summary: {} },
    { occurredAt: at(120), actorKind: 'system', actorLabel: 'system', action: 'content.publish', outcome: 'failure', entityType: 'content_translation', summary: {} },
    {
      occurredAt: at(2),
      actorKind: 'operator',
      actorLabel: 'operator',
      action: 'access.grant',
      outcome: 'success',
      entityType: 'local_grant',
      summary: { password: 'raw-secret', deep: { a: { b: { c: { d: 'too deep' } } } }, list: [1, 2, 3] },
    },
  ]);
});

afterAll(async () => {
  await t.drop();
});

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('audit read queries', () => {
  it('deny editors, match managers, members and anonymous visitors (also for details and facets)', async () => {
    for (const actor of [actors.editor, actors.matchManager, actors.member, actors.anonymous]) {
      expect(await failure(listAuditEvents(t.db, actor))).toBeInstanceOf(AccessDeniedError);
      expect(await failure(listAuditFacets(t.db, actor))).toBeInstanceOf(AccessDeniedError);
      expect(await failure(getAuditEvent(t.db, actor, '00000000-0000-4000-8000-000000000000'))).toBeInstanceOf(AccessDeniedError);
    }
    const stale = testPrincipal(['administrator'], { status: 'stale' });
    expect(await failure(listAuditEvents(t.db, stale))).toBeInstanceOf(AccessDeniedError);
  });

  it('lists the last 30 days by default, newest first, without actor user IDs', async () => {
    const page = await listAuditEvents(t.db, actors.administrator);
    const actions = page.items.map((item) => item.action);
    expect(actions).toEqual(expect.arrayContaining(['match.publish', 'match.result.record', 'settings.update', 'prose.publish', 'access.grant']));
    expect(actions).not.toContain('content.publish');
    const times = page.items.map((item) => item.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(Object.keys(page.items[0]!)).not.toContain('actorUserId');
    expect(Object.keys(page.items[0]!)).not.toContain('summary');
  });

  it('filters by date range, action, outcome and entity type', async () => {
    const older = await listAuditEvents(t.db, actors.administrator, { from: at(60), to: at(30) });
    expect(older.items.map((item) => item.action)).toEqual(['content.publish']);
    const denied = await listAuditEvents(t.db, actors.administrator, { outcome: 'denied' });
    expect(denied.items.map((item) => [item.action, item.actorLabel])).toEqual([['settings.update', 'Synthetic editor']]);
    const results = await listAuditEvents(t.db, actors.administrator, { action: 'match.result.record' });
    expect(results.total).toBe(1);
    const members = await listAuditEvents(t.db, actors.administrator, { entityType: 'member_profile' });
    expect(members.items).toHaveLength(1);
    expect(members.items[0]).toMatchObject({ locale: 'cs', capability: 'members.publish' });
  });

  it('bounds the date range to 90 days and rejects inverted ranges', async () => {
    const tooLong = await failure(listAuditEvents(t.db, actors.administrator, { from: at(130), to: at(0) }));
    expect(tooLong).toBeInstanceOf(DomainError);
    expect(auditFilterErrorCode(tooLong)).toBe('range_too_long');
    const inverted = await failure(listAuditEvents(t.db, actors.administrator, { from: at(1), to: at(5) }));
    expect(auditFilterErrorCode(inverted)).toBe('range_inverted');
    const ninety = await listAuditEvents(t.db, actors.administrator, { from: at(90), to: at(0) });
    expect(ninety.items.map((item) => item.action)).toContain('content.publish');
  });

  it('bounds pagination (page size ≤ 50) and pages deterministically', async () => {
    expect(auditFilterErrorCode(await failure(listAuditEvents(t.db, actors.administrator, { pageSize: AUDIT_MAX_PAGE_SIZE + 1 })))).toBe('invalid_filter');
    expect(await failure(listAuditEvents(t.db, actors.administrator, { page: 0 }))).toBeInstanceOf(DomainError);
    const first = await listAuditEvents(t.db, actors.administrator, { pageSize: 2, page: 1 });
    const second = await listAuditEvents(t.db, actors.administrator, { pageSize: 2, page: 2 });
    expect(first.pageCount).toBe(Math.ceil(first.total / 2));
    expect(first.items).toHaveLength(2);
    expect(second.items.map((item) => item.id)).not.toEqual(expect.arrayContaining(first.items.map((item) => item.id)));
    const beyond = await listAuditEvents(t.db, actors.administrator, { pageSize: 2, page: 999 });
    expect(beyond.items).toEqual([]);
  });

  it('returns a redacted, bounded key/value summary for one event (never raw secrets)', async () => {
    const [published] = (await listAuditEvents(t.db, actors.administrator, { action: 'match.publish' })).items;
    const detail = await getAuditEvent(t.db, actors.administrator, published!.id);
    const lines = Object.fromEntries(detail!.summary.map((entry) => [entry.key, entry.value]));
    expect(lines).toMatchObject({ slug: 'synthetic-match', sessionToken: '[redacted]', 'nested.email': '[redacted]', 'nested.ok': 'visible' });
    expect(JSON.stringify(detail)).not.toContain('must-not-leak');
    expect(JSON.stringify(detail)).not.toContain('person@example.test');

    // A legacy row stored without write-time redaction is still redacted on read.
    const [grant] = (await listAuditEvents(t.db, actors.administrator, { action: 'access.grant' })).items;
    const raw = await getAuditEvent(t.db, actors.administrator, grant!.id);
    const rawLines = Object.fromEntries(raw!.summary.map((entry) => [entry.key, entry.value]));
    expect(rawLines.password).toBe('[redacted]');
    expect(rawLines.list).toBe('1, 2, 3');
    expect(JSON.stringify(raw)).not.toContain('raw-secret');
    expect(JSON.stringify(raw)).not.toContain('too deep');

    expect(await getAuditEvent(t.db, actors.administrator, 'not-a-uuid')).toBeNull();
    expect(await getAuditEvent(t.db, actors.administrator, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('lists distinct actions and entity types for the filters', async () => {
    const facets = await listAuditFacets(t.db, actors.administrator);
    expect(facets.actions).toEqual(expect.arrayContaining(['access.grant', 'content.publish', 'match.publish', 'match.result.record', 'settings.update']));
    expect(facets.entityTypes).toEqual(expect.arrayContaining(['match', 'member_profile', 'site_setting']));
    expect([...facets.actions].sort()).toEqual(facets.actions);
  });
});
