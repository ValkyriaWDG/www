import 'server-only';
import { siteSetting, type Executor } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import type { GameRoute } from '@/modules/games/registry';
import { serverPresentationSchema, type ServerPresentation, type ServerPresentationRow } from '@/modules/settings/schemas';
import type { ServerSnapshot } from '../contract';
import { getServerOverview, type ServerOverview } from './provider';

/*
 * Website-owned presentation of public game servers: the `servers.presentation` site
 * setting renames, hides or reorders the servers the operator configuration exposes.
 * It is applied here, once, for every public read (server pages, the Wardogs home
 * overview and the polling route). The providers keep their own contract: identities,
 * addresses and telemetry still come only from the configured CRCON/Logi sources.
 */

/** Repeated public reads (30-second polling) reuse one settings query within this window. */
export const SERVER_PRESENTATION_CACHE_MS = 15_000;

export function presentationFor(rows: readonly ServerPresentationRow[], game: GameRoute, publicId: string): ServerPresentationRow | undefined {
  return rows.find((row) => row.game === game && row.publicId === publicId);
}

/** `false` only when an override explicitly hides the server. */
export function isServerPublished(rows: readonly ServerPresentationRow[], game: GameRoute, publicId: string): boolean {
  return presentationFor(rows, game, publicId)?.published !== false;
}

function applyToServers(game: GameRoute, servers: readonly ServerSnapshot[], rows: readonly ServerPresentationRow[]): ServerSnapshot[] {
  const visible = servers
    .map((server, index) => ({ server, index, row: presentationFor(rows, game, server.publicId) }))
    .filter(({ row }) => row?.published !== false)
    .map((entry) => ({ ...entry, server: entry.row?.name ? { ...entry.server, name: entry.row.name } : entry.server }));
  // Ordered servers first by their order, then the rest in configured order.
  const rank = (entry: (typeof visible)[number]) => entry.row?.sortOrder ?? Number.POSITIVE_INFINITY;
  return visible.sort((left, right) => rank(left) - rank(right) || left.index - right.index).map((entry) => entry.server);
}

/** Pure: applies overrides to one provider overview without changing its state or freshness. */
export function applyServerPresentation(game: GameRoute, overview: ServerOverview, rows: readonly ServerPresentationRow[]): ServerOverview {
  if (overview.state === 'not_configured' || rows.length === 0) return overview;
  const servers = applyToServers(game, overview.servers, rows);
  return overview.state === 'ok'
    ? { ...overview, servers, partial: overview.partial && servers.some((server) => server.freshness !== 'fresh') }
    : { ...overview, servers };
}

/** Stored override rows; an invalid stored value is ignored (nothing is hidden or renamed). */
export async function readServerPresentation(db: Executor): Promise<ServerPresentation> {
  const [row] = await db.select({ value: siteSetting.value }).from(siteSetting).where(eq(siteSetting.key, 'servers.presentation')).limit(1);
  if (!row) return [];
  const parsed = serverPresentationSchema.safeParse(row.value);
  if (!parsed.success) {
    console.warn('[settings] ignoring invalid stored override: servers.presentation');
    return [];
  }
  return parsed.data;
}

let cache: { at: number; rows: ServerPresentation } | null = null;
let inflight: Promise<ServerPresentation> | null = null;

/**
 * Cached override rows. A database failure keeps the last known rows (or none) for the
 * cache window so polling never amplifies an outage; nothing is invented either way.
 */
export async function getServerPresentation(now: Date = new Date()): Promise<ServerPresentation> {
  if (!getServerEnv().DATABASE_URL) return [];
  const age = now.getTime() - (cache?.at ?? Number.NEGATIVE_INFINITY);
  if (cache && age >= 0 && age < SERVER_PRESENTATION_CACHE_MS) return cache.rows;
  if (!inflight) {
    inflight = readServerPresentation(getDb())
      .catch((error: unknown) => {
        console.warn(`[settings] servers.presentation unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
        return cache?.rows ?? [];
      })
      .then((rows) => {
        cache = { at: now.getTime(), rows };
        return rows;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Public server overview for a game with the website presentation applied. */
export async function getPublicServerOverview(game: GameRoute, now: Date = new Date()): Promise<ServerOverview> {
  const [overview, rows] = await Promise.all([getServerOverview(game, now), getServerPresentation(now)]);
  return applyServerPresentation(game, overview, rows);
}

/** Forget cached rows (after an administrator saved the setting, and in tests). */
export function resetServerPresentationCache(): void {
  cache = null;
  inflight = null;
}
