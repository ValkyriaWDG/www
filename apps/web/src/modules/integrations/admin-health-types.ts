import type { GameRoute } from '@/modules/games/registry';
import type { Freshness } from './contract';
import type { LogiSourcePurpose } from './logi-config';

/*
 * Administration read model of the website's integration state (issue #22, read-only).
 * Everything here is derived from the website database and its runtime configuration:
 * it is the health of the website's own collector, never a claim about the hosted Logi
 * runtime, its Discord connection or live game-server telemetry. Pure types and helpers
 * so the client form can share them; the reader lives in `admin-health.ts`.
 */

export type ServerSourceKind = 'none' | 'crcon' | 'logi' | 'synthetic-fixture';
export type ServerConfigOrigin = 'crcon' | 'logi' | 'synthetic';

/** One server the operator configuration exposes (identity only; no address, URL or key). */
export type AdminConfiguredServer = {
  publicId: string;
  name: string;
  /** Configured publication flag (Logi); CRCON and synthetic servers are always configured as public. */
  published: boolean;
  hasAddress: boolean;
  hasStatsUrl: boolean;
  origin: ServerConfigOrigin;
};

/** Current provider observation of one configured server (the public page shows the same facts). */
export type AdminServerObservation = {
  publicId: string;
  name: string;
  reachability: 'online' | 'offline' | 'unknown';
  freshness: Freshness;
  observedAt: string | null;
  players: number | null;
  capacity: number | null;
  map: string | null;
};

export type AdminServerOverview =
  | { state: 'not_configured' }
  | { state: 'unavailable'; attemptedAt: string; servers: AdminServerObservation[] }
  | { state: 'ok'; attemptedAt: string; synthetic: boolean; partial: boolean; servers: AdminServerObservation[] };

export type AdminGameServers = {
  game: GameRoute;
  source: ServerSourceKind;
  /** Generic reason only; the raw configuration can contain private hosts. */
  configError: 'invalid_json' | 'invalid_config' | null;
  configured: AdminConfiguredServer[];
  overview: AdminServerOverview;
};

/**
 * `configured`: a key is present for a purpose without a scheduled collector (membership
 * reads at sign-in, commands on demand). `bootstrapping`: passes ran but none completed
 * a successful pull yet.
 */
export type ScopeState = 'not_configured' | 'configured' | 'never_ran' | 'bootstrapping' | 'healthy' | 'stale' | 'unavailable';

/** Website collector checkpoint of one source/purpose (`logi_sync_scope`), sanitized. */
export type AdminLogiScope = {
  mode: 'bootstrap' | 'replay' | 'live' | null;
  hasActiveGeneration: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextAttemptAt: string | null;
  errorCode: string | null;
  leaseActive: boolean;
  freshness: Freshness;
};

/** Collector health the producer reported for one connection (`integration-health` projection). */
export type AdminLogiHealth = {
  connectionId: string;
  provider: string;
  enabled: boolean;
  capabilities: string[];
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextAttemptAt: string | null;
  errorCategory: string | null;
  freshness: Freshness;
  collectedSessions: number | null;
};

export type AdminLogiPurpose = {
  purpose: LogiSourcePurpose;
  /** The feature switch for this purpose (people: `syncPeople`; commands: `LOGI_EVENT_WRITE_ENABLED`). */
  enabled: boolean;
  /** A restricted key of the required length is present. */
  configured: boolean;
  state: ScopeState;
  scope: AdminLogiScope | null;
  /** Only the data purpose carries producer health rows; `null` means unknown, never success. */
  health: AdminLogiHealth[] | null;
};

export type AdminLogiSource = {
  sourceInstanceId: string;
  game: GameRoute;
  guildId: string;
  publishMatches: boolean;
  syncPeople: boolean;
  publicServers: number;
  publishedServers: number;
  purposes: AdminLogiPurpose[];
};

export type AdminReaderResource = 'league-matches' | 'warcon-data';
export type AdminReaderState = 'unconfigured' | 'configured' | 'unsupported';

/**
 * One approved Wardogs reader (issue #87): `unconfigured` without its key, source or
 * approved connections; `configured` with them; `unsupported` when the deployed producer
 * answered 404 on the last attempt. Attempt facts come from the in-process caches.
 */
export type AdminReader = {
  resource: AdminReaderResource;
  /** The matching `LogiSourcePurpose` for the label. */
  purpose: Extract<LogiSourcePurpose, 'league' | 'warcon'>;
  state: AdminReaderState;
  /** Sanitized configuration detail (variable names, instance ID, counts; never a key, origin or connection ID). */
  detail: string;
  /** Approved Warcon connections, count only. */
  approvedConnections: number;
  lastAttemptAt: string | null;
  /** Stable transport category of the last attempt (`ok`, `unauthorized`, `not_found`, ...), or `null` before any attempt. */
  lastOutcome: string | null;
};

export type AdminIntegrationHealth = {
  generatedAt: string;
  contractVersion: string;
  servers: AdminGameServers[];
  logi: {
    configError: boolean;
    sso: { enabled: boolean; configured: boolean; discordFallback: boolean };
    membershipSource: 'discord' | 'logi';
    sources: AdminLogiSource[];
    /** Wardogs League and Warcon readers, in a fixed order. */
    readers: AdminReader[];
    webhooks: { enabled: boolean; pendingHints: number; lastReceivedAt: string | null; lastProcessedAt: string | null };
    commands: { enabled: boolean; pending: number; lastReceiptAt: string | null };
  };
  discord: {
    guildConfigured: boolean;
    roleMappingConfigured: boolean;
    mappedRoles: number;
    roleMappingError: string | null;
    membershipSource: 'discord' | 'logi';
  };
};

/**
 * Collector freshness from the last successful pull, with the same strict limit the public
 * reads use (`logi-public.ts`): the administration never reads "healthy" while the public
 * page already drops the projection.
 */
export function scopeFreshness(lastSuccessAt: Date | string | null, now: Date, maxAgeMs: number): Freshness {
  if (!lastSuccessAt) return 'unavailable';
  const at = new Date(lastSuccessAt).getTime();
  if (Number.isNaN(at)) return 'unavailable';
  return now.getTime() - at < maxAgeMs ? 'fresh' : 'stale';
}

/**
 * One badge per purpose. A persisted error supersedes a recent success; attempts
 * without any success are "bootstrapping", never healthy.
 */
export function classifyScopeState(configured: boolean, scope: AdminLogiScope | null): ScopeState {
  if (!configured) return 'not_configured';
  if (!scope || !scope.lastAttemptAt) return 'never_ran';
  if (scope.errorCode) return 'unavailable';
  if (!scope.lastSuccessAt) return 'bootstrapping';
  return scope.freshness === 'fresh' ? 'healthy' : 'stale';
}
