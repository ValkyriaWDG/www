import { classifyFreshness, SERVER_FRESHNESS, type ServerSnapshot } from '../contract';
import { ageWarconServerPublic } from '../logi/readers/public';
import type { ServerBrowserData } from './browser';

/** Public server IDs in the URL are short lowercase slugs; anything else selects nothing. */
const PUBLIC_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseServerParam(value: string | undefined): string | null {
  return value !== undefined && value.length <= 64 && PUBLIC_ID.test(value) ? value : null;
}

/**
 * Selected server for `?server=`: `none` (nothing requested), `selected`, or `missing`
 * (a well-formed ID that is not in the configured set, e.g. a removed server).
 */
export function resolveSelection(servers: readonly ServerSnapshot[], param: string | null): { kind: 'none' } | { kind: 'selected'; server: ServerSnapshot } | { kind: 'missing' } {
  if (!param) return { kind: 'none' };
  const server = servers.find((candidate) => candidate.publicId === param);
  return server ? { kind: 'selected', server } : { kind: 'missing' };
}

/** `64 / 100`, `— / 100` or `null` when neither value is known (never 0 for unknown). */
export function populationParts(server: Pick<ServerSnapshot, 'players' | 'capacity'>): { players: number | null; capacity: number | null } | null {
  if (server.players === null && server.capacity === null) return null;
  return { players: server.players, capacity: server.capacity };
}

/** Age the last response even when a browser is paused, disconnected or a poll fails. */
export function ageServerBrowserData(data: ServerBrowserData, now: Date, failed = false): ServerBrowserData {
  const freshness = (observedAt: string | null, previous: ServerSnapshot['freshness']) => {
    const age = classifyFreshness(observedAt ? new Date(observedAt) : null, now, SERVER_FRESHNESS);
    if (age === 'unavailable' || previous === 'unavailable') return 'unavailable' as const;
    return failed || previous === 'stale' || age === 'stale' ? 'stale' as const : 'fresh' as const;
  };
  const overview = data.overview.state === 'not_configured' ? data.overview : {
    ...data.overview,
    servers: data.overview.servers.map((server) => {
      const state = freshness(server.observedAt, server.freshness);
      return { ...server, freshness: state, reachability: failed || state === 'unavailable' ? 'unknown' as const : server.reachability, map: state === 'unavailable' ? null : server.map, players: state === 'unavailable' ? null : server.players, mode: state === 'unavailable' ? null : server.mode, score: state === 'fresh' ? server.score : null, teams: state === 'fresh' ? server.teams : null, ...(server.teamScores !== undefined ? { teamScores: state === 'fresh' ? server.teamScores : null } : {}), nextMap: state === 'fresh' ? server.nextMap : null, timeRemainingSeconds: state === 'fresh' ? server.timeRemainingSeconds : null };
    }),
  };
  const warcon = data.warcon ? data.warcon.map((entry) => ageWarconServerPublic(entry, now, failed)) : (data.warcon ?? null);
  if (!data.livePlayers) return { overview, livePlayers: null, warcon };
  const state = freshness(data.livePlayers.observedAt, data.livePlayers.freshness);
  return { overview, livePlayers: { ...data.livePlayers, freshness: state, state: state === 'unavailable' && data.livePlayers.state === 'ok' ? 'unavailable' : data.livePlayers.state, players: state === 'unavailable' ? [] : data.livePlayers.players }, warcon };
}

/** Warcon projection composed under one listed server, or `null`. */
export function warconFor(data: Pick<ServerBrowserData, 'warcon'>, publicId: string) {
  return data.warcon?.find((entry) => entry.publicId === publicId) ?? null;
}
