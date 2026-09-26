import 'server-only';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { getRequestSession } from '@/modules/auth/session';
import type { Capability } from './capabilities';
import { assertCan } from './policy';
import { resolveActor } from './resolve-actor';
import type { AccessIntent, Actor, Principal } from './types';

export { resolveActor } from './resolve-actor';

const resolveForRequest = cache(async (intent: AccessIntent, forceRefresh: boolean): Promise<Actor> => {
  const current = await getRequestSession();
  if (!current) return { kind: 'anonymous' };
  return resolveActor(getDb(), {
    session: current.session,
    user: current.user,
    intent,
    env: getServerEnv(),
    forceRefresh,
  });
});

/**
 * Resolves the actor for the current request: session → user → (Discord membership
 * snapshot, refreshed server-side when older than 60 s for writes / 5 min for reads) or
 * (local-admin grant used only from an MFA-assured credential session) → roles →
 * capabilities. Browser input never supplies roles. Memoized per request and intent.
 * Throws only on infrastructure failure (database/auth unavailable), which fails closed.
 */
export async function getActor(intent: AccessIntent = 'read'): Promise<Actor> {
  return resolveForRequest(intent, false);
}

/**
 * Re-verifies the current user's Discord membership immediately (user-requested
 * "Refresh membership"; throttled per member) and returns the write-intent actor.
 */
export async function refreshActorMembership(): Promise<Actor> {
  return resolveForRequest('write', true);
}

/** Resolves the actor for `intent` and asserts the capability; throws AccessDeniedError. */
export async function requireCapability(capability: Capability, intent: AccessIntent): Promise<Principal> {
  const actor = await getActor(intent);
  assertCan(actor, capability);
  if (actor.kind !== 'principal') throw new Error('Request actors are principals.');
  return actor;
}
