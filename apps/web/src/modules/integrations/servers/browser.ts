import 'server-only';
import type { GameRoute } from '@/modules/games/registry';
import type { LivePlayersSnapshot } from './live-players';
import { getServerLivePlayers } from './live-players-provider';
import { getPublicServerOverview, getServerPresentation, isServerPublished } from './presentation';
import type { ServerOverview } from './provider';

export type ServerBrowserData = { overview: ServerOverview; livePlayers: LivePlayersSnapshot | null };

/** RSC and polling share the same cached, allowlisted providers. No arbitrary source URLs. */
export async function getServerBrowserData(game: GameRoute, selected: string | null): Promise<ServerBrowserData> {
  const now = new Date();
  const rows = await getServerPresentation(now);
  // A server hidden by the website presentation has no public detail: its upstream is not asked at all.
  const detail = selected !== null && isServerPublished(rows, game, selected);
  const [overview, livePlayers] = await Promise.all([getPublicServerOverview(game, now, rows), detail ? getServerLivePlayers(game, selected, now) : null]);
  const listed = overview.state === 'not_configured' || selected === null || overview.servers.some((server) => server.publicId === selected);
  return { overview, livePlayers: listed ? livePlayers : null };
}
