import type { AppRole } from '@valkyria/db';
import { capabilitiesForRoles } from './capabilities';
import type { AccessIntent, Principal } from './types';

/** Builds a synthetic verified principal for tests. Never used by application code paths. */
export function testPrincipal(
  roles: AppRole[],
  overrides: Partial<Omit<Principal, 'kind' | 'capabilities' | 'roles'>> & { intent?: AccessIntent } = {},
): Principal {
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
    capabilities: capabilitiesForRoles(roles),
    localGrant: overrides.localGrant ?? null,
    verifiedAt: overrides.verifiedAt ?? new Date(),
  };
}
