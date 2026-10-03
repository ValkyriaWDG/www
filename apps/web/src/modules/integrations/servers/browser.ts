import 'server-only';
import type { GameRoute } from '@/modules/games/registry';
import { getWarconServersPublic } from '../logi/readers/warcon';
import type { WarconServerPublic } from '../logi/readers/public';
import type { LivePlayersSnapshot } from './live-players';
import { getServerLivePlayers } from './live-players-provider';
import { getPublicServerOverview, getServerPresentation, isServerPublished } from './presentation';
import type { ServerOverview } from './provider';

export type ServerBrowserData = {
  overview: ServerOverview;
  livePlayers: LivePlayersSnapshot | null;
  /** Wardogs only: approved Warcon projections for the listed servers (recent matches for the selected one); `null` when not configured. */
  warcon: WarconServerPublic[] | null;
};

/**
 * RSC and polling share the same cached, allowlisted providers. No arbitrary source URLs.
 * Warcon facts are composed only under servers already present in the overview, so an
 * approved connection never surfaces for an unpublished or removed server.
 */
export async function getServerBrowserData(game: GameRoute, selected: string | null): Promise<ServerBrowserData> {
  const now = new Date();
  const rows = await getServerPresentation(now);
  // A server hidden by the website presentation has no public detail: its upstream is not asked at all.
  const detail = selected !== null && isServerPublished(rows, game, selected);
  const [overview, livePlayers] = await Promise.all([getPublicServerOverview(game, now, rows), detail ? getServerLivePlayers(game, selected, now) : null]);
  const listed = overview.state === 'not_configured' || selected === null || overview.servers.some((server) => server.publicId === selected);
  // Warcon follows the presented overview: hidden servers are neither listed nor asked for recent matches.
  const publicIds = overview.state === 'not_configured' ? [] : overview.servers.map((server) => server.publicId);
  const warcon = game === 'wardogs' && publicIds.length > 0 ? await getWarconServersPublic(publicIds, listed ? selected : null, now) : null;
  return { overview, livePlayers: listed ? livePlayers : null, warcon };
}
