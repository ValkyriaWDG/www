import type { GameRoute } from '@/modules/games/registry';

/**
 * Website-side normalized read models of the website / hosted Logi contract
 * (docs/integrations/logi/contract.md, version 0.2). These are the website's own
 * boundary types, not a claim about Logi's wire format. Every projection carries its
 * source identity, observation time and freshness; missing values stay `null`.
 */
export const INTEGRATION_CONTRACT_VERSION = '0.2';

export type Freshness = 'fresh' | 'stale' | 'unavailable';
export type SourceKind = 'logi' | 'crcon' | 'synthetic';
export type ResourceKind = 'event' | 'match' | 'server' | 'member';

/** Composite identity: never join records by display name. */
export type SourceRef = {
  source: SourceKind;
  sourceInstanceId: string;
  guildId: string | null;
  game: GameRoute;
  kind: ResourceKind;
  externalId: string;
};

const KEY_PART = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Stable storage/cache key including source, guild and game (throws on unsafe parts). */
export function sourceKey(ref: SourceRef): string {
  const parts = [ref.source, ref.sourceInstanceId, ref.guildId ?? '-', ref.game, ref.kind, ref.externalId];
  for (const part of parts) if (!KEY_PART.test(part)) throw new Error('Unsafe source key part');
  return parts.join('/');
}

export type FreshnessPolicy = { freshForMs: number; staleForMs: number };

/** Server telemetry: current for 2 minutes, then stale; older than 30 minutes is no longer shown as data. */
export const SERVER_FRESHNESS: FreshnessPolicy = { freshForMs: 2 * 60_000, staleForMs: 30 * 60_000 };

/**
 * Freshness of an observation. A missing or future timestamp is `unavailable` (never
 * assumed current); clock skew up to 30 seconds is tolerated.
 */
export function classifyFreshness(observedAt: Date | null, now: Date, policy: FreshnessPolicy): Freshness {
  if (!observedAt || Number.isNaN(observedAt.getTime())) return 'unavailable';
  const age = now.getTime() - observedAt.getTime();
  if (age < -30_000) return 'unavailable';
  if (age <= policy.freshForMs) return 'fresh';
  if (age <= policy.staleForMs) return 'stale';
  return 'unavailable';
}

/** Reachability as reported by a source that can establish it; a timeout is `unknown`. */
export type Reachability = 'online' | 'offline' | 'unknown';

/** Allowlisted public projection of one configured Valkyria game server. */
export type ServerSnapshot = {
  ref: SourceRef;
  /** Public route identifier (`?server=`), independent of the source's internal ID. */
  publicId: string;
  name: string;
  reachability: Reachability;
  map: string | null;
  mode: string | null;
  players: number | null;
  capacity: number | null;
  /** When the source observed these values (ISO 8601). */
  observedAt: string | null;
  freshness: Freshness;
  /** Approved public join information; never a password or an administrative endpoint. */
  connect: { kind: 'none' } | { kind: 'address'; address: string };
};

/** Collector health: not proof of the hosted bot process or Discord health. */
export type IntegrationHealth = {
  source: SourceKind;
  enabled: boolean;
  capabilities: ResourceKind[];
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  errorCategory: 'none' | 'disabled' | 'configuration' | 'authorization' | 'timeout' | 'rate_limited' | 'upstream';
};
