import type { Executor, Game, Locale } from '@valkyria/db';
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { z } from 'zod';
import { DomainError } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import { assertCan, assertCanWrite, canForGame } from '@/modules/access/policy';
import { AccessDeniedError, type Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { escapeLike, foldSearchTerm } from './text';

/*
 * Small shared helpers for the community domain modules (prose, matches, members,
 * settings). They carry no domain rules of their own.
 */

/**
 * Parses untrusted input; failures become `DomainError('validation')` whose field errors
 * are stable machine codes (our custom codes such as `too_long`, else zod's issue code).
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    if (!(key in fieldErrors)) fieldErrors[key] = /^[a-z][a-z_]*$/.test(issue.message) ? issue.message : issue.code;
  }
  throw new DomainError('validation', 'Invalid input.', fieldErrors);
}

export type GuardContext = {
  intent: 'read' | 'write';
  action: string;
  entityType: string;
  entityId?: string | null;
  translationId?: string | null;
  locale?: Locale | null;
};

/**
 * Asserts a capability for a server use case. Denied privileged write attempts by an
 * identified principal are appended to the audit log (outside the failed transaction)
 * before the typed denial is rethrown; anonymous denials are not logged as noise.
 */
export async function authorize(db: Executor, actor: Actor, capability: Capability, context: GuardContext): Promise<void> {
  try {
    if (context.intent === 'write') assertCanWrite(actor, capability);
    else assertCan(actor, capability);
  } catch (error) {
    if (error instanceof AccessDeniedError && context.intent === 'write' && actor.kind !== 'anonymous') {
      await recordAudit(db, {
        actor,
        action: context.action,
        outcome: 'denied',
        capability,
        entityType: context.entityType,
        entityId: context.entityId ?? null,
        translationId: context.translationId ?? null,
        locale: context.locale ?? null,
        summary: { code: error.code },
      }).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Resource-level game scope for community records (ADR-WEB-002): every listed game must
 * be covered by the actor's grant; `[]`/`null` means a community record that needs a
 * platform-wide grant. Denials are audited through `db` (outside the failing transaction).
 */
export async function authorizeGames(
  db: Executor,
  actor: Actor,
  capability: Capability,
  games: readonly (Game | null)[],
  context: Omit<GuardContext, 'intent'>,
): Promise<void> {
  if (actor.kind !== 'principal') return;
  const targets = games.length > 0 ? games : [null];
  if (targets.every((game) => canForGame(actor, capability, game))) return;
  await recordAudit(db, {
    actor,
    action: context.action,
    outcome: 'denied',
    capability,
    entityType: context.entityType,
    entityId: context.entityId ?? null,
    translationId: context.translationId ?? null,
    locale: context.locale ?? null,
    summary: { code: 'forbidden', reason: 'game_scope' },
  }).catch(() => undefined);
  throw new AccessDeniedError('forbidden', capability);
}

/** Extracts the PostgreSQL error (Drizzle wraps driver errors as `cause`). */
export function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === 'object' && current !== null && 'code' in current && typeof (current as { code: unknown }).code === 'string') {
      return current as { code?: string; constraint?: string };
    }
    current = typeof current === 'object' && current !== null && 'cause' in current ? (current as { cause: unknown }).cause : null;
  }
  return null;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = pgError(error);
  return pg?.code === '23505' && (constraint === undefined || pg.constraint === constraint);
}

/** Loads a row for update and enforces optimistic concurrency. */
export function assertVersion(row: { version: number } | undefined, expectedVersion: number): asserts row is { version: number } {
  if (!row) throw new DomainError('not_found');
  if (row.version !== expectedVersion) throw new DomainError('conflict');
}

/** Czech/Slovak (and common Latin) diacritics folded in SQL; mirrors `foldSearchTerm`. */
export const SQL_FOLD_FROM = 'ÁÄČĎÉĚËÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽáäčďéěëíĺľňóôöŕřšťúůüýž';
export const SQL_FOLD_TO = 'AACDEEEILLNOOORRSTUUUYZaacdeeeillnooorrstuuuyz';

/** Diacritic- and case-insensitive substring match of `term` in any of `columns`. */
export function foldedContains(columns: SQLWrapper[], term: string): SQL {
  const pattern = `%${escapeLike(foldSearchTerm(term))}%`;
  const parts = columns.map((column) => sql`lower(translate(coalesce(${column}, ''), ${SQL_FOLD_FROM}, ${SQL_FOLD_TO})) like ${pattern}`);
  return sql`(${sql.join(parts, sql` or `)})`;
}

export type Page<T> = { items: T[]; total: number; page: number; pageCount: number };

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
