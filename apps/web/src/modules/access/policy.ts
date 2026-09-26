import type { Capability } from './capabilities';
import { AccessDeniedError, type AccessDeniedCode, type Actor, type Principal } from './types';

/**
 * Central, pure authorization decision. Request-bound resolution of the actor (session,
 * role snapshot freshness, local grant assurance) lives in `server.ts`; this function
 * only decides whether an already-resolved actor may use a capability.
 */
export function can(actor: Actor, capability: Capability): boolean {
  if (actor.kind === 'anonymous') return false;
  if (actor.kind === 'system') return actor.capabilities.has(capability);
  return actor.status === 'verified' && actor.capabilities.has(capability);
}

export function denialCode(actor: Actor, capability: Capability): AccessDeniedCode | null {
  if (can(actor, capability)) return null;
  if (actor.kind === 'anonymous') return 'unauthenticated';
  if (actor.kind === 'system') return 'forbidden';
  switch (actor.status) {
    case 'stale':
      return 'stale_authorization';
    case 'unavailable':
      return 'verification_unavailable';
    case 'not_member':
      return 'not_member';
    case 'mfa_required':
      return 'mfa_required';
    default:
      return 'forbidden';
  }
}

/** Throws a typed denial when the actor lacks the capability. */
export function assertCan(actor: Actor, capability: Capability): asserts actor is Principal | Extract<Actor, { kind: 'system' }> {
  const code = denialCode(actor, capability);
  if (code) throw new AccessDeniedError(code, capability);
}

/** A write intent is required for mutations; a read-intent actor cannot mutate. */
export function assertCanWrite(actor: Actor, capability: Capability): asserts actor is Principal | Extract<Actor, { kind: 'system' }> {
  assertCan(actor, capability);
  if (actor.kind === 'principal' && actor.intent !== 'write') throw new AccessDeniedError('stale_authorization', capability);
}

export function actorLabel(actor: Actor): string {
  if (actor.kind === 'anonymous') return 'anonymous';
  return actor.label;
}

export function actorUserId(actor: Actor): string | null {
  return actor.kind === 'principal' ? actor.userId : null;
}
