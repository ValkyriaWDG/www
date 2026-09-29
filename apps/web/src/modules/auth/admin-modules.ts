import { can } from '@/modules/access/policy';
import type { Capability } from '@/modules/access/capabilities';
import type { Actor } from '@/modules/access/types';

export type AdminModuleKey = 'news' | 'manual' | 'content' | 'media' | 'matches' | 'tournaments' | 'members' | 'settings' | 'audit';

export type AdminModule = {
  key: AdminModuleKey;
  /** Logical admin path without locale (prefix with `/cs` or `/en`). */
  path: `/admin/${AdminModuleKey}`;
  /** The module is offered when the actor holds any of these capabilities. */
  anyOf: readonly Capability[];
};

/**
 * Administration modules and the capabilities that make them usable. Navigation lists
 * only permitted modules; every admin page still enforces its own capability server-side.
 */
export const ADMIN_MODULES: readonly AdminModule[] = [
  { key: 'news', path: '/admin/news', anyOf: ['content.edit'] },
  // HLL Field Manual articles; the same editor, revisions and publication rules as news.
  { key: 'manual', path: '/admin/manual', anyOf: ['content.edit'] },
  // Core static pages (clan, community, privacy, faq); same editor and publication rules as news.
  { key: 'content', path: '/admin/content', anyOf: ['content.edit'] },
  { key: 'media', path: '/admin/media', anyOf: ['media.editorial.manage', 'media.match.manage'] },
  { key: 'matches', path: '/admin/matches', anyOf: ['matches.edit'] },
  // Competitions that matches link to; the same match-manager capabilities and game scope.
  { key: 'tournaments', path: '/admin/tournaments', anyOf: ['matches.edit'] },
  { key: 'members', path: '/admin/members', anyOf: ['members.edit'] },
  { key: 'settings', path: '/admin/settings', anyOf: ['settings.manage'] },
  { key: 'audit', path: '/admin/audit', anyOf: ['audit.read'] },
];

export function permittedAdminModules(actor: Actor): AdminModule[] {
  if (!can(actor, 'admin.access')) return [];
  return ADMIN_MODULES.filter((module) => module.anyOf.some((capability) => can(actor, capability)));
}
