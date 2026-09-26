import type { Executor } from '@valkyria/db';
import type { Capability } from '@/modules/access/capabilities';
import { assertCan, assertCanWrite } from '@/modules/access/policy';
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
