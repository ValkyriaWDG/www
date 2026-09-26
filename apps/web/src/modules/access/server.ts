import 'server-only';
import type { Capability } from './capabilities';
import { assertCan } from './policy';
import type { AccessIntent, Actor, Principal } from './types';

/**
 * Resolves the actor for the current request. CONTRACT (implemented by the auth slice):
 * session → user → (Discord membership snapshot, refreshed server-side when older than
 * 60 s for writes / 5 min for reads) or (local-admin grant used only from an
 * MFA-assured session) → roles → capabilities. Browser input never supplies roles.
 *
 * Until identity is wired, every request is anonymous: all private reads/mutations fail closed.
 */
export async function getActor(_intent: AccessIntent = 'read'): Promise<Actor> {
  return { kind: 'anonymous' };
}

/** Resolves the actor for `intent` and asserts the capability; throws AccessDeniedError. */
export async function requireCapability(capability: Capability, intent: AccessIntent): Promise<Principal> {
  const actor = await getActor(intent);
  assertCan(actor, capability);
  if (actor.kind !== 'principal') throw new Error('Request actors are principals.');
  return actor;
}
