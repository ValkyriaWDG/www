import type { Game } from '@valkyria/db';
import type { Capability, GameScope } from './capabilities';
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

/**
 * Resource-level decision: the actor holds `capability` for this resource's game.
 * `game === null` is a community/platform resource and needs a platform-wide grant.
 * Service identities (CLIs/runners) are platform-wide by construction.
 */
export function canForGame(actor: Actor, capability: Capability, game: Game | null): boolean {
  if (!can(actor, capability)) return false;
  if (actor.kind !== 'principal') return true;
  const scope = actor.gameScopes.get(capability);
  if (!scope) return false;
  if (scope === 'all') return true;
  return game !== null && scope.has(game);
}

/** Scope of a capability for list filtering: `all`, an explicit set, or `null` (no access). */
export function capabilityScope(actor: Actor, capability: Capability): GameScope | null {
  if (!can(actor, capability)) return null;
  if (actor.kind !== 'principal') return 'all';
  return actor.gameScopes.get(capability) ?? null;
}

/**
 * Throws `forbidden` when the actor may not use `capability` on a resource of `game`.
 * Every game in `games` must be covered (e.g. all affiliations of a member profile).
 */
export function assertCanForGames(actor: Actor, capability: Capability, games: readonly (Game | null)[], intent: 'read' | 'write' = 'write'): void {
  if (intent === 'write') assertCanWrite(actor, capability);
  else assertCan(actor, capability);
  const targets = games.length > 0 ? games : [null];
  for (const game of targets) if (!canForGame(actor, capability, game)) throw new AccessDeniedError('forbidden', capability);
}
