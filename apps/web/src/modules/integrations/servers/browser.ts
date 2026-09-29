import 'server-only';
import type { GameRoute } from '@/modules/games/registry';
import type { LivePlayersSnapshot } from './live-players';
import { getServerLivePlayers } from './live-players-provider';
import { getServerOverview, type ServerOverview } from './provider';

export type ServerBrowserData = { overview: ServerOverview; livePlayers: LivePlayersSnapshot | null };

/** RSC and polling share the same cached, allowlisted providers. No arbitrary source URLs. */
export async function getServerBrowserData(game: GameRoute, selected: string | null): Promise<ServerBrowserData> {
  const now = new Date();
  const [overview, livePlayers] = await Promise.all([getServerOverview(game, now), selected ? getServerLivePlayers(game, selected, now) : null]);
  return { overview, livePlayers };
}
