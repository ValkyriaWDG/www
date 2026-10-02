import { GAMES, type Game } from '@valkyria/db';
import type { RoleGrant } from './capabilities';
import type { RoleMapping } from './role-mapping';

/** Per-game allowlists may only narrow the operator's website mapping. */
export function grantsFromLogiMembership(mapping: RoleMapping, snapshots: readonly { game: Game; roleIds: readonly string[] }[]): RoleGrant[] {
  const grants: RoleGrant[] = [];
  for (const [roleId, entry] of Object.entries(mapping)) {
    const observed = new Set(snapshots.filter((snapshot) => snapshot.roleIds.includes(roleId)).map((snapshot) => snapshot.game));
    const allowed = 'roles' in entry ? entry.games.filter((game) => observed.has(game)) : GAMES.filter((game) => observed.has(game));
    if (allowed.length === 0) continue;
    const games = !('roles' in entry) && GAMES.every((game) => observed.has(game)) ? 'all' : allowed;
    for (const role of 'roles' in entry ? entry.roles : entry) grants.push({ role, games });
  }
  return grants;
}
