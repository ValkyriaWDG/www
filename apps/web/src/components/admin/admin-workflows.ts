import 'server-only';
import type { AdminModule } from '@/modules/auth/admin-modules';
import type { Actor } from '@/modules/access/types';
import { can, canForGame } from '@/modules/access/policy';
import { GAME_REGISTRY, gameRouteFromLogi, type GameRoute } from '@/modules/games/registry';
import { configuredLogiSourceBindings, type LogiIntegrationEnv } from '@/modules/integrations/logi-config';

/** Keep historical repair and website publication available without a second operations menu. */
export function groupAdminModules(modules: readonly AdminModule[]) {
  const secondary = new Set(['matches', 'tournaments', 'members']);
  return {
    website: modules.filter((module) => !secondary.has(module.key)),
    archive: modules.filter((module) => secondary.has(module.key)),
  };
}

/** Only configured, validated provider origins. Logi owns login and workspace selection. */
export function adminLogiLinks(env: LogiIntegrationEnv, actor: Actor): { href: string; games: GameRoute[] }[] {
  if (!can(actor, 'admin.access')) return [];
  try {
    const links = new Map<string, GameRoute[]>();
    for (const source of configuredLogiSourceBindings(env)) {
      const game = gameRouteFromLogi(source.gameId);
      if (!game) continue;
      const scope = GAME_REGISTRY[game].db;
      if (!(['matches.edit', 'members.edit', 'settings.manage'] as const).some((capability) => canForGame(actor, capability, scope))) continue;
      const games = links.get(source.origin) ?? [];
      games.push(game);
      links.set(source.origin, games);
    }
    return Array.from(links, ([href, games]) => ({ href, games }));
  } catch {
    // Invalid provider configuration must never produce a browser navigation target.
    return [];
  }
}
