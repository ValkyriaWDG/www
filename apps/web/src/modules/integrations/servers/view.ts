import type { ServerSnapshot } from '../contract';

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
