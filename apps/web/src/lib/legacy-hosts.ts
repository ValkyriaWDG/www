import { resolveLegacyHllPath } from '@/modules/legacy/hll';

/**
 * Legacy HLL host redirects for the future domain cutover. Inactive unless
 * `LEGACY_HLL_HOSTS` lists hostnames that are explicitly routed to this application
 * (e.g. `valkyriahll.cz,www.valkyriahll.cz`); enabling it is a release/DNS decision.
 * Only reviewed paths with an implemented destination redirect (308) to the canonical
 * `APP_URL` origin; everything else is left to normal routing (404), never Home.
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
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Absolute canonical redirect URL for a request on a configured legacy host, or `null`. */
export function legacyHostRedirect(
  request: { hostname: string; pathname: string; searchParams: URLSearchParams },
  config: { hosts: ReadonlySet<string>; origin: string | null },
): string | null {
  if (!config.origin || config.hosts.size === 0 || !config.hosts.has(request.hostname.toLowerCase())) return null;
  const resolution = resolveLegacyHllPath(request.pathname, request.searchParams);
  if (resolution?.kind !== 'redirect') return null;
  const target = new URL(resolution.target, config.origin);
  // Never leave the canonical origin, whatever the manifest says.
  return target.origin === config.origin ? target.toString() : null;
}
