import type { AppRole, Game } from '@valkyria/db';
import { scopesForGrants } from './capabilities';
import type { AccessIntent, Principal } from './types';

/** Builds a synthetic verified principal for tests. Never used by application code paths. */
export function testPrincipal(
  roles: AppRole[],
  overrides: Partial<Omit<Principal, 'kind' | 'capabilities' | 'roles' | 'gameScopes'>> & { intent?: AccessIntent; games?: Game[] } = {},
): Principal {
  const scoped = scopesForGrants(roles.map((role) => ({ role, games: overrides.games ?? 'all' })));
  return {
    kind: 'principal',
    userId: overrides.userId ?? '00000000-0000-4000-8000-000000000001',
    label: overrides.label ?? 'Synthetic tester',
    source: overrides.source ?? 'discord',
    sessionId: overrides.sessionId ?? '00000000-0000-4000-8000-0000000000aa',
    assurance: overrides.assurance ?? 'discord',
    intent: overrides.intent ?? 'write',
    status: overrides.status ?? 'verified',
    roles,
    capabilities: scoped.capabilities,
    gameScopes: scoped.gameScopes,
    localGrant: overrides.localGrant ?? null,
    verifiedAt: overrides.verifiedAt ?? new Date(),
  };
}
