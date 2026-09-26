import 'server-only';
import { AUDIT_OUTCOMES, auditEvent, type ActorKind, type AuditOutcome, type Executor } from '@valkyria/db';
import { and, asc, count, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError } from '@/lib/result';
import { assertCan } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { pageCount, parseInput } from '@/modules/prose/domain';
import { flattenAuditSummary, type AuditSummaryEntry } from './summary';

/*
 * Read side of the audit log for `/admin/audit`. Authorization happens inside every
 * query (`audit.read`: administrators and owners only). Rows are append-only; nothing
 * here edits or deletes them. Actor user IDs, request IDs and raw JSON are not exposed.
 */

export const AUDIT_MAX_RANGE_DAYS = 90;
export const AUDIT_DEFAULT_RANGE_DAYS = 30;
export const AUDIT_MAX_PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const token = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[a-z][a-z0-9_.-]*$/, 'invalid_value')
    .optional()
    .or(z.literal('').transform(() => undefined));

export const auditFilterSchema = z
  .object({
    /** Inclusive lower bound (instant). Defaults to `to` minus 30 days. */
    from: z.coerce.date().optional(),
    /** Exclusive upper bound (instant). Defaults to now. */
    to: z.coerce.date().optional(),
    action: token(80),
    outcome: z.enum(AUDIT_OUTCOMES).optional().or(z.literal('').transform(() => undefined)),
    entityType: token(60),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(AUDIT_MAX_PAGE_SIZE).default(25),
    now: z.date().optional(),
  })
  .transform((value) => {
    const to = value.to ?? value.now ?? new Date();
    const from = value.from ?? new Date(to.getTime() - AUDIT_DEFAULT_RANGE_DAYS * DAY_MS);
    return { ...value, from, to };
  })
  .superRefine((value, ctx) => {
    if (Number.isNaN(value.from.getTime()) || Number.isNaN(value.to.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'invalid_date', path: ['from'] });
      return;
    }
    if (value.to.getTime() <= value.from.getTime()) ctx.addIssue({ code: 'custom', message: 'range_inverted', path: ['to'] });
    else if (value.to.getTime() - value.from.getTime() > AUDIT_MAX_RANGE_DAYS * DAY_MS + 60 * 60 * 1000) {
      // One hour of slack keeps a 90-calendar-day range valid across a DST change.
      ctx.addIssue({ code: 'custom', message: 'range_too_long', path: ['from'] });
    }
  });
export type AuditFilterInput = z.input<typeof auditFilterSchema>;

export type AuditEventView = {
  id: string;
  occurredAt: string;
  /** Approved label captured at event time (never an e-mail address). */
  actorLabel: string;
  actorKind: ActorKind;
  action: string;
  capability: string | null;
  entityType: string | null;
  entityId: string | null;
  locale: string | null;
  outcome: AuditOutcome;
};

export type AuditEventDetail = AuditEventView & { summary: AuditSummaryEntry[]; summaryTruncated: boolean };

export type AuditEventPage = {
  items: AuditEventView[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  range: { from: string; to: string };
};

const viewColumns = {
  id: auditEvent.id,
  occurredAt: auditEvent.occurredAt,
  actorLabel: auditEvent.actorLabel,
  actorKind: auditEvent.actorKind,
  action: auditEvent.action,
  capability: auditEvent.capability,
  entityType: auditEvent.entityType,
  entityId: auditEvent.entityId,
  locale: auditEvent.locale,
  outcome: auditEvent.outcome,
};

type ViewRow = {
  id: string;
  occurredAt: Date;
  actorLabel: string;
  actorKind: ActorKind;
  action: string;
  capability: string | null;
  entityType: string | null;
  entityId: string | null;
  locale: string | null;
  outcome: AuditOutcome;
};

function toView(row: ViewRow): AuditEventView {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorLabel: row.actorLabel,
    actorKind: row.actorKind,
    action: row.action,
    capability: row.capability,
    entityType: row.entityType,
    entityId: row.entityId,
    locale: row.locale,
    outcome: row.outcome,
  };
}

/** Paginated, filtered audit events, newest first. Requires `audit.read`; the date range is at most 90 days. */
export async function listAuditEvents(db: Executor, actor: Actor, filters: AuditFilterInput = {}): Promise<AuditEventPage> {
  assertCan(actor, 'audit.read');
  const query = parseInput(auditFilterSchema, filters);
  const conditions: (SQL | undefined)[] = [
    gte(auditEvent.occurredAt, query.from),
    lt(auditEvent.occurredAt, query.to),
    query.action ? eq(auditEvent.action, query.action) : undefined,
    query.outcome ? eq(auditEvent.outcome, query.outcome) : undefined,
    query.entityType ? eq(auditEvent.entityType, query.entityType) : undefined,
  ];
  const where = and(...conditions);
  const [totalRow] = await db.select({ total: count() }).from(auditEvent).where(where);
  const total = totalRow?.total ?? 0;
  const rows = await db
    .select(viewColumns)
    .from(auditEvent)
    .where(where)
    .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  return {
    items: rows.map(toView),
    total,
    page: query.page,
    pageCount: pageCount(total, query.pageSize),
    pageSize: query.pageSize,
    range: { from: query.from.toISOString(), to: query.to.toISOString() },
  };
}

/** One event with its redacted summary as bounded key/value lines. Requires `audit.read`. */
export async function getAuditEvent(db: Executor, actor: Actor, id: string): Promise<AuditEventDetail | null> {
  assertCan(actor, 'audit.read');
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ ...viewColumns, summary: auditEvent.summary })
    .from(auditEvent)
    .where(eq(auditEvent.id, id))
    .limit(1);
  if (!row) return null;
  const { entries, truncated } = flattenAuditSummary(row.summary);
  return { ...toView(row), summary: entries, summaryTruncated: truncated };
}

export type AuditFacets = { actions: string[]; entityTypes: string[] };

/** Distinct action and entity-type values for the bounded filter selects. Requires `audit.read`. */
export async function listAuditFacets(db: Executor, actor: Actor): Promise<AuditFacets> {
  assertCan(actor, 'audit.read');
  const [actions, entityTypes] = await Promise.all([
    db.selectDistinct({ value: auditEvent.action }).from(auditEvent).orderBy(asc(auditEvent.action)).limit(200),
    db.selectDistinct({ value: auditEvent.entityType }).from(auditEvent).orderBy(asc(auditEvent.entityType)).limit(100),
  ]);
  return {
    actions: actions.map((row) => row.value),
    entityTypes: entityTypes.map((row) => row.value).filter((value): value is string => typeof value === 'string' && value.length > 0),
  };
}

/** Maps a query validation failure to a stable filter error code for the page. */
export function auditFilterErrorCode(error: unknown): string | null {
  if (!(error instanceof DomainError) || error.code !== 'validation') return null;
  const codes = Object.values(error.fieldErrors ?? {});
  return codes.find((code) => code === 'range_too_long' || code === 'range_inverted' || code === 'invalid_date') ?? 'invalid_filter';
}
