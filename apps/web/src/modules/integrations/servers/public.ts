import type { ServerSnapshot } from '../contract';

/** Browser telemetry has a website public ID, never an operational source reference. */
export type PublicServerSnapshot = Omit<ServerSnapshot, 'ref' | 'teamScores'> & {
  teamScores?: { label: string; score: number | null }[] | null;
};

export type PublicServerOverview =
  | { state: 'not_configured' }
  | { state: 'unavailable'; servers: PublicServerSnapshot[]; attemptedAt: string }
  | { state: 'ok'; servers: PublicServerSnapshot[]; synthetic: boolean; partial: boolean; attemptedAt: string };

/**
 * Explicit publication whitelist. Internal adapters retain their source identity for
 * lookups and cache isolation; no spread can carry it into RSC props or polling JSON.
 */
export function toPublicServerOverview(overview: PublicServerOverview): PublicServerOverview {
  if (overview.state === 'not_configured') return { state: 'not_configured' };
  const servers = overview.servers.map((server): PublicServerSnapshot => ({
    publicId: server.publicId,
    name: server.name,
    reachability: server.reachability,
    map: server.map,
    mode: server.mode,
    players: server.players,
    capacity: server.capacity,
    nextMap: server.nextMap,
    timeRemainingSeconds: server.timeRemainingSeconds,
    score: server.score ? { allied: server.score.allied, axis: server.score.axis } : null,
    teams: server.teams ? { allied: server.teams.allied, axis: server.teams.axis } : null,
    ...(server.teamScores !== undefined ? { teamScores: server.teamScores?.map((team) => ({ label: team.label, score: team.score })) ?? null } : {}),
    observedAt: server.observedAt,
    freshness: server.freshness,
    connect: server.connect.kind === 'address' ? { kind: 'address', address: server.connect.address } : { kind: 'none' },
    statsUrl: server.statsUrl,
  }));
  return overview.state === 'unavailable'
    ? { state: 'unavailable', servers, attemptedAt: overview.attemptedAt }
    : { state: 'ok', servers, synthetic: overview.synthetic, partial: overview.partial, attemptedAt: overview.attemptedAt };
}
