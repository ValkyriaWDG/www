import { contentDocument, type Executor, type Game } from '@valkyria/db';
import { inArray, type SQL } from 'drizzle-orm';
import type { Capability } from '@/modules/access/capabilities';
import { assertCan, assertCanWrite, canForGame, capabilityScope } from '@/modules/access/policy';
import { AccessDeniedError, type Actor, type Principal } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';

type GuardContext = { action: string; entityType?: string; entityId?: string | null };

/**
 * Asserts a capability and records denied attempts by signed-in principals. Anonymous
 * denials are not audited (they would let anyone flood the audit log).
 */
export async function authorize(
  db: Executor,
  actor: Actor,
  capability: Capability,
  intent: 'read' | 'write',
  context: GuardContext,
): Promise<void> {
  try {
    if (intent === 'write') assertCanWrite(actor, capability);
    else assertCan(actor, capability);
  } catch (error) {
    if (error instanceof AccessDeniedError && actor.kind === 'principal') {
      await recordAudit(db, {
        actor,
        action: context.action,
        outcome: 'denied',
        capability,
        entityType: context.entityType ?? null,
        entityId: context.entityId ?? null,
        summary: { code: error.code },
      }).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Resource-level game scope (ADR-WEB-002), checked after the resource is loaded (inside
 * the operation, after locking where it mutates). Every listed game must be covered;
 * `null` is a community resource that needs a platform-wide grant. Denials are audited
 * through `auditDb`, outside any transaction the thrown error rolls back.
 */
export async function authorizeGameScope(
  auditDb: Executor,
  actor: Actor,
  capability: Capability,
  games: readonly (Game | null)[],
  context: GuardContext,
): Promise<void> {
  if (actor.kind !== 'principal') return;
  const targets = games.length > 0 ? games : [null];
  if (targets.every((game) => canForGame(actor, capability, game))) return;
  await recordAudit(auditDb, {
    actor,
    action: context.action,
    outcome: 'denied',
    capability,
    entityType: context.entityType ?? null,
    entityId: context.entityId ?? null,
    summary: { code: 'forbidden', reason: 'game_scope' },
  }).catch(() => undefined);
  throw new AccessDeniedError('forbidden', capability);
}

/** Interactive issuers only: schedules are created by a person, never by a service identity. */
export function requirePrincipal(actor: Actor, capability: Capability): Principal {
  if (actor.kind !== 'principal') throw new AccessDeniedError(actor.kind === 'anonymous' ? 'unauthenticated' : 'forbidden', capability);
  return actor;
}

export function actorUserIdOrNull(actor: Actor): string | null {
  return actor.kind === 'principal' ? actor.userId : null;
}

export function actorDisplayLabel(actor: Actor): string {
  return actor.kind === 'anonymous' ? 'anonymous' : actor.label.slice(0, 120);
}

/**
 * SQL condition limiting private content lists to the actor's game scope: `undefined`
 * for a platform-wide grant, a `content_document.game in (…)` condition (never community
 * documents) for a scoped grant, or `'none'` when nothing is visible.
 */
export function documentScopeCondition(actor: Actor, capability: Capability): SQL | undefined | 'none' {
  const scope = capabilityScope(actor, capability);
  if (scope === null) return 'none';
  if (scope === 'all') return undefined;
  if (scope.size === 0) return 'none';
  return inArray(contentDocument.game, [...scope]);
}
