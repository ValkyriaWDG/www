import type { AppRole, Game } from '@valkyria/db';

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

const ADMINISTRATOR: Capability[] = [...new Set([...EDITOR, ...MATCH_MANAGER, 'settings.manage', 'audit.read'] as Capability[])];

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

/**
 * Capabilities over shared, game-independent resources (the media library, site settings,
 * the audit log, access management). Only platform-wide grants carry them; a game-scoped
 * grant never does, so scoped editors cannot touch another game's drafts or media.
 */
export const PLATFORM_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set([
  'media.editorial.manage',
  'media.match.manage',
  'settings.manage',
  'audit.read',
  'access.manage',
]);

/** Games a capability applies to: `all` (explicit platform-wide grant) or an explicit set. */
export type GameScope = 'all' | ReadonlySet<Game>;

/** One application role granted for all games or only for the listed games. */
export type RoleGrant = { role: AppRole; games: 'all' | readonly Game[] };

/**
 * Capabilities and their game scopes from role grants. A capability granted by several
 * roles gets the union of their scopes; any platform-wide grant makes it `all`. A scoped
 * grant never covers community (no-game) resources nor platform-only capabilities.
 */
export function scopesForGrants(grants: readonly RoleGrant[]): { capabilities: ReadonlySet<Capability>; gameScopes: ReadonlyMap<Capability, GameScope> } {
  const scopes = new Map<Capability, 'all' | Set<Game>>();
  for (const grant of grants) {
    for (const capability of ROLE_CAPABILITIES[grant.role] ?? []) {
      if (grant.games !== 'all' && PLATFORM_ONLY_CAPABILITIES.has(capability)) continue;
      const current = scopes.get(capability);
      if (current === 'all') continue;
      if (grant.games === 'all') {
        scopes.set(capability, 'all');
        continue;
      }
      const next = current ?? new Set<Game>();
      for (const game of grant.games) next.add(game);
      scopes.set(capability, next);
    }
  }
  return { capabilities: new Set(scopes.keys()), gameScopes: scopes };
}
