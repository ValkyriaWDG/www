import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { authUser } from './auth.ts';
import { LOCALES, sqlList, tz } from './common.ts';

export const AUDIT_OUTCOMES = ['success', 'denied', 'failure'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const ACTOR_KINDS = ['discord', 'local_admin', 'system', 'scheduler', 'operator', 'anonymous'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

/**
 * Append-only record of privileged changes and relevant denied actions. The summary
 * is redacted before insert: no secrets, tokens, raw session IDs or private content.
 */
export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: tz('occurred_at').notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => authUser.id, { onDelete: 'set null' }),
    actorKind: text('actor_kind').$type<ActorKind>().notNull(),
    /** Approved display label captured at event time (never an email address). */
    actorLabel: text('actor_label').notNull(),
    capability: text('capability'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    translationId: uuid('translation_id'),
    locale: text('locale'),
    outcome: text('outcome').$type<AuditOutcome>().notNull(),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    requestId: text('request_id'),
  },
  (t) => [
    index('audit_event_occurred_idx').on(t.occurredAt),
    index('audit_event_entity_idx').on(t.entityType, t.entityId),
    index('audit_event_action_idx').on(t.action),
    check('audit_event_outcome_ck', sql`${t.outcome} in (${sqlList(AUDIT_OUTCOMES)})`),
    check('audit_event_actor_kind_ck', sql`${t.actorKind} in (${sqlList(ACTOR_KINDS)})`),
    check('audit_event_locale_ck', sql`${t.locale} is null or ${t.locale} in (${sqlList(LOCALES)})`),
  ],
);
