import type { AppRole } from '@valkyria/db';

/**
 * Application capabilities (docs/security/auth-rbac.md). Everything is denied unless a
 * role explicitly grants it. Capability identifiers are English machine strings and
 * never localized or derived from Discord role names.
 */
export const CAPABILITIES = [
  'admin.access',
  'content.read_private',
  'content.edit',
  'content.publish',
  'media.editorial.manage',
  'media.match.manage',
  'members.edit',
  'members.publish',
  'matches.edit',
  'matches.publish',
  'settings.manage',
  'bot.read',
  'bot.configure',
  'audit.read',
  'access.manage',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const EDITOR: Capability[] = [
  'admin.access',
  'content.read_private',
  'content.edit',
  'content.publish',
  'media.editorial.manage',
  'members.edit',
  'members.publish',
];

const MATCH_MANAGER: Capability[] = ['admin.access', 'matches.edit', 'matches.publish', 'media.match.manage'];

const ADMINISTRATOR: Capability[] = [...new Set([...EDITOR, ...MATCH_MANAGER, 'settings.manage', 'audit.read', 'bot.read', 'bot.configure'] as Capability[])];

/** Capability matrix. `member` grants no administrative capability in v1. */
export const ROLE_CAPABILITIES: Record<AppRole, readonly Capability[]> = {
  member: [],
  editor: EDITOR,
  match_manager: MATCH_MANAGER,
  administrator: ADMINISTRATOR,
  // Owner is only ever operator-provisioned; `access.manage` additionally requires reauthentication.
  owner: [...ADMINISTRATOR, 'access.manage'],
};

export function capabilitiesForRoles(roles: readonly AppRole[]): ReadonlySet<Capability> {
  const result = new Set<Capability>();
  for (const role of roles) for (const capability of ROLE_CAPABILITIES[role] ?? []) result.add(capability);
  return result;
}
