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
  // Rows of another game never touch this overview (same reference, nothing rebuilt).
  if (overview.state === 'not_configured' || !rows.some((row) => row.game === game)) return overview;
  const servers = applyToServers(game, overview.servers, rows);
  // `partial` marks servers that did not answer (CRCON: unknown reachability; Logi: unavailable
  // freshness). Hiding every such server makes the remaining overview complete.
  return overview.state === 'ok'
    ? { ...overview, servers, partial: overview.partial && servers.some((server) => server.freshness === 'unavailable' || server.reachability === 'unknown') }
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
/** Incremented by every reset so a read started before a save cannot repopulate the cache afterwards. */
let generation = 0;

/**
 * Cached override rows. A database failure keeps the last known rows (or none) for the
 * cache window so polling never amplifies an outage; nothing is invented either way.
 */
export async function getServerPresentation(now: Date = new Date()): Promise<ServerPresentation> {
  if (!getServerEnv().DATABASE_URL) return [];
  const age = now.getTime() - (cache?.at ?? Number.NEGATIVE_INFINITY);
  if (cache && age >= 0 && age < SERVER_PRESENTATION_CACHE_MS) return cache.rows;
  if (!inflight) {
    const started = generation;
    // A synchronous failure of the database handle degrades like a failed query.
    inflight = Promise.resolve()
      .then(() => readServerPresentation(getDb()))
      .catch((error: unknown) => {
        console.warn(`[settings] servers.presentation unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
        return cache?.rows ?? [];
      })
      .then((rows) => {
        if (started === generation) cache = { at: now.getTime(), rows };
        return rows;
      })
      .finally(() => {
        if (started === generation) inflight = null;
      });
  }
  return inflight;
}

/** Public server overview for a game with the website presentation applied (the only place it is applied). */
export async function getPublicServerOverview(game: GameRoute, now: Date = new Date(), rows?: ServerPresentation): Promise<ServerOverview> {
  const [overview, presentation] = await Promise.all([getServerOverview(game, now), rows ?? getServerPresentation(now)]);
  return applyServerPresentation(game, overview, presentation);
}

/** Forget cached rows (after an administrator saved the setting, and in tests). */
export function resetServerPresentationCache(): void {
  cache = null;
  inflight = null;
  generation += 1;
}
