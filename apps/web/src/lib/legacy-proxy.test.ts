import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The legacy boundary runs before localization; next-intl's Next.js module loader is
// exercised in browser tests, not imported through standalone Node on Windows.
vi.mock('next-intl/middleware', () => ({ default: () => () => NextResponse.next() }));

const previousOrigin = process.env.APP_URL;
const previousHosts = process.env.LEGACY_HLL_HOSTS;
afterEach(() => {
  if (previousOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousOrigin;
  if (previousHosts === undefined) delete process.env.LEGACY_HLL_HOSTS; else process.env.LEGACY_HLL_HOSTS = previousHosts;
  vi.resetModules();
});

async function configuredProxy(hosts = 'valkyriahll.cz') {
  process.env.APP_URL = 'https://valkyria.cz';
  process.env.LEGACY_HLL_HOSTS = hosts;
  vi.resetModules();
  return (await import('@/proxy')).default;
}

describe('legacy publication lookup at the request boundary', () => {
  it('internally rewrites a detail instead of redirecting to an unverified slug', async () => {
    const proxy = await configuredProxy();
    const response = proxy(new NextRequest('https://valkyriahll.cz/guide/tanky?next=https://evil.invalid'));
    expect(response.headers.get('location')).toBeNull();
    const rewritten = new URL(response.headers.get('x-middleware-rewrite')!);
    expect(rewritten.origin).toBe('https://valkyriahll.cz');
    expect(rewritten.pathname).toBe('/api/legacy/hll');
    expect([...rewritten.searchParams]).toEqual([['path', '/guide/tanky'], ['locale', 'cs']]);
  });
  it('returns 404 for unknown old routes while preserving implemented collection redirects', async () => {
    const proxy = await configuredProxy();
    const unknown = proxy(new NextRequest('https://valkyriahll.cz/matches/not-a-numeric-id'));
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('location')).toBeNull();
    const collection = proxy(new NextRequest('https://valkyriahll.cz/matches?page=4'));
    expect(collection.status).toBe(308);
    expect(collection.headers.get('location')).toBe('https://valkyria.cz/cs/hll/matches?view=results');
  });
  it('leaves an inactive cutover and the canonical host out of legacy processing', async () => {
    const inactive = await configuredProxy('');
    expect(inactive(new NextRequest('https://valkyriahll.cz/guide/tanky')).headers.get('x-middleware-rewrite')).toBeNull();
    const mistaken = await configuredProxy('valkyria.cz');
    const home = mistaken(new NextRequest('https://valkyria.cz/'));
    expect(home.status).toBe(307);
    expect(home.headers.get('location')).toBe('https://valkyria.cz/cs');
  });
});
