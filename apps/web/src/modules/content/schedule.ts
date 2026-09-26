import 'server-only';
import { randomUUID } from 'node:crypto';
import { contentTranslation, publicationSchedule, siteSetting, type Executor } from '@valkyria/db';
import { and, asc, eq, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Actor, Principal } from '@/modules/access/types';
import { AccessDeniedError } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { isUniqueViolation } from './db-errors';
import { authorize, requirePrincipal } from './guard';
import {
  listSchedulesSchema,
  parseInput,
  reapproveSchema,
  scheduleIdSchema,
  scheduleSchema,
  type DueAtInput,
  type ListSchedulesInput,
  type ReapproveInput,
  type ScheduleInput,
} from './inputs';
import { assertPublishable } from './publication';
import {
  ACTIVE_SCHEDULE_STATES,
  OVERDUE_GRACE_MS,
  activeSchedule,
  assertNotArchived,
  assertVersion,
  inTransaction,
  lockTranslation,
  readDocument,
  readRevision,
  scheduleToDTO,
  type ScheduleRow,
} from './store';
import { DEFAULT_SCHEDULE_TIME_ZONE, isValidTimeZone, resolveLocalDateTime } from './time';
import type { Paginated, ScheduleDTO } from './types';

/**
 * Durable scheduled publication of one immutable saved revision of one translation.
 * The intent records the issuing principal (and, for a local administrator, the exact
 * grant ID/version); the publisher re-verifies that authority when the intent is due.
 * Only one active intent (pending/claimed/blocked/failed) may exist per translation.
 */

export type ScheduleDeps = { now?: () => Date };

export const PUBLISHER_HEARTBEAT_KEY = 'system.publisher_heartbeat';
/** The runner is expected every minute; no heartbeat for this long means it stalled. */
export const PUBLISHER_STALL_MS = 5 * 60_000;

export type DueAtResolution = { dueAt: Date; timeZone: string; ambiguous: boolean; candidates: Date[] };

/** Converts an instant or a local wall-clock time (DST-aware) into the due instant. */
export function resolveDueAt(input: DueAtInput): DueAtResolution {
  if (typeof input === 'string') {
    const dueAt = new Date(input);
    if (Number.isNaN(dueAt.getTime())) throw new DomainError('validation', 'Invalid due time.', { dueAt: 'invalid' });
    return { dueAt, timeZone: DEFAULT_SCHEDULE_TIME_ZONE, ambiguous: false, candidates: [dueAt] };
  }
  const timeZone = input.timeZone ?? DEFAULT_SCHEDULE_TIME_ZONE;
  if (!isValidTimeZone(timeZone)) throw new DomainError('validation', 'Unknown time zone.', { 'dueAt.timeZone': 'invalid' });
  const resolved = resolveLocalDateTime(input.localDateTime, timeZone);
  if (!resolved.ok) {
    const code = resolved.reason === 'nonexistent' ? 'nonexistent_local_time' : 'invalid';
    throw new DomainError('validation', 'Invalid local due time.', { 'dueAt.localDateTime': code });
  }
  return { dueAt: resolved.instant, timeZone, ambiguous: resolved.ambiguous, candidates: resolved.candidates };
}

function issuerFields(principal: Principal) {
  if (principal.source === 'local_admin') {
    // Delegation is only possible from an MFA-assured local session with a verified grant.
    if (!principal.localGrant || principal.assurance !== 'mfa') throw new AccessDeniedError('mfa_required', 'content.publish');
    return {
      issuerUserId: principal.userId,
      issuerKind: 'local_admin' as const,
      issuerLabel: principal.label.slice(0, 120),
      issuerGrantId: principal.localGrant.id,
      issuerGrantVersion: principal.localGrant.version,
      issuerAssurance: principal.assurance,
    };
  }
  return {
    issuerUserId: principal.userId,
    issuerKind: 'discord' as const,
    issuerLabel: principal.label.slice(0, 120),
    issuerGrantId: null,
    issuerGrantVersion: null,
    issuerAssurance: principal.assurance,
  };
}

function mapActiveRace<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    if (isUniqueViolation(error, 'publication_schedule_active_uq')) {
      throw new DomainError('conflict', 'This translation already has an active schedule.');
    }
    throw error;
  });
}

export type ScheduleResult = ScheduleDTO & { resolution: { ambiguous: boolean; candidates: Date[] } };

/**
 * Schedules publication of a saved revision (default: the current draft) of exactly one
 * translation. A live translation stays visible with its published revision until the
 * intent executes (`published_update_scheduled`).
 */
export async function scheduleTranslation(db: Executor, actor: Actor, rawInput: ScheduleInput, deps: ScheduleDeps = {}): Promise<ScheduleResult> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.schedule', entityType: 'content_translation' });
  const principal = requirePrincipal(actor, 'content.publish');
  const input = parseInput(scheduleSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  const due = resolveDueAt(input.dueAt);
  if (due.dueAt.getTime() <= now.getTime()) throw new DomainError('validation', 'The due time must be in the future.', { dueAt: 'not_in_future' });
  const issuer = issuerFields(principal);

  return mapActiveRace(
    inTransaction(db, async (tx) => {
      const translation = await lockTranslation(tx, input.translationId);
      if (input.expectedVersion !== undefined) assertVersion(translation.version, input.expectedVersion);
      const document = await readDocument(tx, translation.documentId, 'share');
      assertNotArchived(document);
      const revisionId = input.revisionId ?? translation.draftRevisionId;
      if (!revisionId) throw new DomainError('invalid_state', 'Nothing to schedule.');
      const revision = await readRevision(tx, translation.id, revisionId).catch((error: unknown) => {
        if (error instanceof DomainError && error.code === 'not_found') {
          throw new DomainError('validation', 'The revision does not belong to this translation.', { revisionId: 'foreign_revision' });
        }
        throw error;
      });
      await assertPublishable(tx, document, revision);
      if (await activeSchedule(tx, translation.id)) throw new DomainError('conflict', 'This translation already has an active schedule.');
      const [row] = await tx
        .insert(publicationSchedule)
        .values({
          translationId: translation.id,
          locale: translation.locale,
          revisionId: revision.id,
          dueAt: due.dueAt,
          timeZone: due.timeZone,
          state: 'pending',
          ...issuer,
          capability: 'content.publish',
          idempotencyKey: randomUUID(),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await recordAudit(tx, {
        actor,
        action: 'content.schedule',
        outcome: 'success',
        capability: 'content.publish',
        entityType: 'content_document',
        entityId: document.id,
        translationId: translation.id,
        locale: translation.locale,
        summary: {
          scheduleId: row!.id,
          revisionId: revision.id,
          dueAt: due.dueAt.toISOString(),
          timeZone: due.timeZone,
          ambiguousLocalTime: due.ambiguous,
          issuerKind: issuer.issuerKind,
          issuerGrantId: issuer.issuerGrantId,
          issuerGrantVersion: issuer.issuerGrantVersion,
          assuranceAtCreation: issuer.issuerAssurance,
        },
      });
      return { ...scheduleToDTO(row!, now), resolution: { ambiguous: due.ambiguous, candidates: due.candidates } };
    }),
  );
}

async function lockSchedule(tx: Executor, scheduleId: string): Promise<ScheduleRow> {
  const [row] = await tx.select().from(publicationSchedule).where(eq(publicationSchedule.id, scheduleId)).for('update');
  if (!row) throw new DomainError('not_found', 'Schedule not found.');
  return row;
}

/** Cancels an active intent (also between a runner's claim and its publication). Live content is untouched. */
export async function cancelSchedule(db: Executor, actor: Actor, rawInput: { scheduleId: string }, deps: ScheduleDeps = {}): Promise<ScheduleDTO> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.schedule.cancel', entityType: 'publication_schedule' });
  const input = parseInput(scheduleIdSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return inTransaction(db, async (tx) => {
    const schedule = await lockSchedule(tx, input.scheduleId);
    if (!ACTIVE_SCHEDULE_STATES.includes(schedule.state)) throw new DomainError('invalid_state', 'The schedule is no longer active.');
    const [row] = await tx
      .update(publicationSchedule)
      .set({
        state: 'cancelled',
        cancelledAt: now,
        cancelledBy: actor.kind === 'principal' ? actor.userId : null,
        claimExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(publicationSchedule.id, schedule.id))
      .returning();
    const [translation] = await tx
      .select({ documentId: contentTranslation.documentId })
      .from(contentTranslation)
      .where(eq(contentTranslation.id, schedule.translationId));
    await recordAudit(tx, {
      actor,
      action: 'content.schedule.cancel',
      outcome: 'success',
      capability: 'content.publish',
      entityType: 'content_document',
      entityId: translation?.documentId ?? null,
      translationId: schedule.translationId,
      locale: schedule.locale,
      summary: { scheduleId: schedule.id, revisionId: schedule.revisionId, previousState: schedule.state },
    });
    return scheduleToDTO(row!, now);
  });
}

/**
 * Fresh approval of a blocked/failed intent by the current authorized actor: the old
 * intent is closed (cancelled) and a new pending intent for the same immutable revision
 * is created with `previousScheduleId`. Blocked intents are never reactivated otherwise.
 */
export async function reapproveSchedule(db: Executor, actor: Actor, rawInput: ReapproveInput, deps: ScheduleDeps = {}): Promise<ScheduleResult> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.schedule.reapprove', entityType: 'publication_schedule' });
  const principal = requirePrincipal(actor, 'content.publish');
  const input = parseInput(reapproveSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  const due = input.dueAt ? resolveDueAt(input.dueAt) : null;
  if (due && due.dueAt.getTime() <= now.getTime()) throw new DomainError('validation', 'The due time must be in the future.', { dueAt: 'not_in_future' });
  const issuer = issuerFields(principal);

  return mapActiveRace(
    inTransaction(db, async (tx) => {
      const previous = await lockSchedule(tx, input.scheduleId);
      if (previous.state !== 'blocked' && previous.state !== 'failed') {
        throw new DomainError('invalid_state', 'Only blocked or failed schedules can be reapproved.');
      }
      const translation = await lockTranslation(tx, previous.translationId);
      const document = await readDocument(tx, translation.documentId, 'share');
      assertNotArchived(document);
      const revision = await readRevision(tx, translation.id, previous.revisionId);
      await assertPublishable(tx, document, revision);
      await tx
        .update(publicationSchedule)
        .set({ state: 'cancelled', cancelledAt: now, cancelledBy: principal.userId, claimExpiresAt: null, updatedAt: now })
        .where(eq(publicationSchedule.id, previous.id));
      const dueAt = due?.dueAt ?? (previous.dueAt.getTime() > now.getTime() ? previous.dueAt : now);
      const [row] = await tx
        .insert(publicationSchedule)
        .values({
          translationId: translation.id,
          locale: translation.locale,
          revisionId: revision.id,
          dueAt,
          timeZone: due?.timeZone ?? previous.timeZone,
          state: 'pending',
          ...issuer,
          capability: 'content.publish',
          idempotencyKey: randomUUID(),
          previousScheduleId: previous.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await recordAudit(tx, {
        actor,
        action: 'content.schedule.reapprove',
        outcome: 'success',
        capability: 'content.publish',
        entityType: 'content_document',
        entityId: document.id,
        translationId: translation.id,
        locale: translation.locale,
        summary: {
          scheduleId: row!.id,
          previousScheduleId: previous.id,
          previousState: previous.state,
          previousError: previous.lastError,
          revisionId: revision.id,
          dueAt: dueAt.toISOString(),
          issuerKind: issuer.issuerKind,
          issuerGrantId: issuer.issuerGrantId,
          issuerGrantVersion: issuer.issuerGrantVersion,
        },
      });
      return { ...scheduleToDTO(row!, now), resolution: { ambiguous: due?.ambiguous ?? false, candidates: due?.candidates ?? [dueAt] } };
    }),
  );
}

export type PublisherHeartbeat = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  processed: number;
  completed: number;
  blocked: number;
  failed: number;
};

export type PublisherStatus = {
  heartbeat: PublisherHeartbeat | null;
  /** True when due work exists but the runner has not succeeded recently. */
  stalled: boolean;
  counts: { pending: number; overdue: number; blocked: number; failed: number };
};

export async function readHeartbeat(db: Executor): Promise<PublisherHeartbeat | null> {
  const [row] = await db.select({ value: siteSetting.value }).from(siteSetting).where(eq(siteSetting.key, PUBLISHER_HEARTBEAT_KEY));
  const value = row?.value as Partial<PublisherHeartbeat> | undefined;
  if (!value || typeof value !== 'object') return null;
  return {
    lastRunAt: typeof value.lastRunAt === 'string' ? value.lastRunAt : null,
    lastSuccessAt: typeof value.lastSuccessAt === 'string' ? value.lastSuccessAt : null,
    processed: Number(value.processed ?? 0),
    completed: Number(value.completed ?? 0),
    blocked: Number(value.blocked ?? 0),
    failed: Number(value.failed ?? 0),
  };
}

/** Admin monitoring: heartbeat, stalled runner detection and schedule counts. */
export async function getPublisherStatus(db: Executor, actor: Actor, deps: ScheduleDeps = {}): Promise<PublisherStatus> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'publication_schedule' });
  const now = deps.now?.() ?? new Date();
  const overdueBefore = new Date(now.getTime() - OVERDUE_GRACE_MS);
  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${publicationSchedule.state} in ('pending', 'claimed'))::int`,
      overdue: sql<number>`count(*) filter (where ${publicationSchedule.state} in ('pending', 'claimed', 'failed') and ${publicationSchedule.dueAt} < ${overdueBefore})::int`,
      blocked: sql<number>`count(*) filter (where ${publicationSchedule.state} = 'blocked')::int`,
      failed: sql<number>`count(*) filter (where ${publicationSchedule.state} = 'failed')::int`,
    })
    .from(publicationSchedule);
  const heartbeat = await readHeartbeat(db);
  const lastSuccess = heartbeat?.lastSuccessAt ? Date.parse(heartbeat.lastSuccessAt) : Number.NaN;
  const stale = Number.isNaN(lastSuccess) || now.getTime() - lastSuccess > PUBLISHER_STALL_MS;
  return {
    heartbeat,
    stalled: stale && (counts?.overdue ?? 0) > 0,
    counts: { pending: counts?.pending ?? 0, overdue: counts?.overdue ?? 0, blocked: counts?.blocked ?? 0, failed: counts?.failed ?? 0 },
  };
}

/** Schedules for the admin overview (active by default), optionally only overdue ones. */
export async function listSchedules(
  db: Executor,
  actor: Actor,
  rawInput: ListSchedulesInput = {},
  deps: ScheduleDeps = {},
): Promise<Paginated<ScheduleDTO & { documentId: string }>> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'publication_schedule' });
  const input = parseInput(listSchedulesSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  const conditions: SQL[] = [];
  if (input.state) conditions.push(eq(publicationSchedule.state, input.state));
  else conditions.push(inArray(publicationSchedule.state, ACTIVE_SCHEDULE_STATES));
  if (input.locale) conditions.push(eq(publicationSchedule.locale, input.locale));
  if (input.overdue) {
    conditions.push(
      or(
        and(inArray(publicationSchedule.state, ['pending', 'claimed', 'failed']), lte(publicationSchedule.dueAt, new Date(now.getTime() - OVERDUE_GRACE_MS))),
        eq(publicationSchedule.state, 'blocked'),
      )!,
    );
  }
  const where = and(...conditions);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(publicationSchedule).where(where);
  const total = count?.total ?? 0;
  const rows = await db
    .select({ schedule: publicationSchedule, documentId: contentTranslation.documentId })
    .from(publicationSchedule)
    .innerJoin(contentTranslation, eq(contentTranslation.id, publicationSchedule.translationId))
    .where(where)
    .orderBy(asc(publicationSchedule.dueAt), asc(publicationSchedule.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  return {
    items: rows.map((row) => ({ ...scheduleToDTO(row.schedule, now), documentId: row.documentId })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.ceil(total / input.pageSize),
  };
}
