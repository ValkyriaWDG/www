import { resolveLegacyHllPath } from '@/modules/legacy/hll';

/**
 * Legacy HLL host redirects for the future domain cutover. Inactive unless
 * `LEGACY_HLL_HOSTS` lists hostnames that are explicitly routed to this application
 * (e.g. `valkyriahll.cz,www.valkyriahll.cz`); enabling it is a release/DNS decision.
 * Static collections redirect to `APP_URL`; detail lookups are rewritten to a server
 * handler which checks publication. Unknown paths return 404, never Home.
 */

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function parseLegacyHosts(value: string | undefined): ReadonlySet<string> {
  const hosts = new Set<string>();
  for (const entry of (value ?? '').split(',')) {
    const host = entry.trim().toLowerCase();
    if (host && host.length <= 253 && HOSTNAME.test(host)) hosts.add(host);
  }
  return hosts;
}

export function canonicalOrigin(appUrl: string | undefined): string | null {
  try {
    const url = new URL(appUrl ?? '');
    if (url.username || url.password) return null;
    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) ? url.origin : null;
  } catch {
    return null;
  }
}

type LegacyRequest = { hostname: string; pathname: string; searchParams: URLSearchParams };
type LegacyConfig = { hosts: ReadonlySet<string>; origin: string | null };

/** A canonical host accidentally listed as legacy must not rewrite or redirect itself. */
export function isLegacyHost(request: Pick<LegacyRequest, 'hostname'>, config: LegacyConfig): boolean {
  return Boolean(config.origin && config.hosts.has(request.hostname.toLowerCase()) && new URL(config.origin).hostname !== request.hostname.toLowerCase());
}

/** Internal publication lookup; the old request query cannot become a redirect target. */
export function legacyHostLookup(request: LegacyRequest, config: LegacyConfig): string | null {
  if (!isLegacyHost(request, config) || resolveLegacyHllPath(request.pathname, request.searchParams)?.kind !== 'lookup') return null;
  return `/api/legacy/hll?${new URLSearchParams({ path: request.pathname, locale: 'cs' })}`;
}

/** Absolute canonical redirect URL for a request on a configured legacy host, or `null`. */
export function legacyHostRedirect(
  request: LegacyRequest,
  config: LegacyConfig,
): string | null {
  if (!config.origin || !isLegacyHost(request, config)) return null;
  const resolution = resolveLegacyHllPath(request.pathname, request.searchParams);
  if (resolution?.kind !== 'redirect') return null;
  const target = new URL(resolution.target, config.origin);
  // Never leave the canonical origin, whatever the manifest says.
  return target.origin === config.origin ? target.toString() : null;
}
