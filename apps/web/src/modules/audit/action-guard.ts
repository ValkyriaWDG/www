import 'server-only';
import type { Locale } from '@valkyria/db';
import { getDb } from '@/lib/db';
import type { Capability } from '@/modules/access/capabilities';
import { getActor, requireCapability } from '@/modules/access/server';
import type { AccessIntent, Principal } from '@/modules/access/types';
import { authorize } from '@/modules/prose/domain';

export type ActionGuardContext = {
  /** Audit action name recorded for a denied attempt, e.g. `match.publish`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  locale?: Locale | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only well-formed IDs reach the audit log; anything else is recorded as absent. */
export function auditEntityId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/**
 * Authorization at the server-action boundary. The actor is resolved from the session on
 * the server (never from client input), a denied write attempt by an identified principal
 * is appended to the audit log, and `requireCapability` asserts the capability for the
 * requested intent (write intent requires a fresh role snapshot). Throws
 * `AccessDeniedError`; callers convert it with `toActionError`.
 */
export async function guardServerAction(capability: Capability, intent: AccessIntent, context: ActionGuardContext): Promise<Principal> {
  const actor = await getActor(intent);
  await authorize(getDb(), actor, capability, { intent, action: context.action, entityType: context.entityType, entityId: context.entityId ?? null, locale: context.locale ?? null });
  return requireCapability(capability, intent);
}
