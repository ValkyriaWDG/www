import { describe, expect, it } from 'vitest';
import { canonicalOrigin, isLegacyHost, legacyHostLookup, legacyHostRedirect, parseLegacyHosts } from './legacy-hosts';

const config = { hosts: parseLegacyHosts('valkyriahll.cz, WWW.valkyriahll.cz,not a host,https://evil.example'), origin: 'https://valkyria.cz' };
const req = (hostname: string, pathname: string, query = '') => ({ hostname, pathname, searchParams: new URLSearchParams(query) });

describe('legacy host redirects', () => {
  it('parses only plain hostnames and HTTPS canonical origins', () => {
    expect([...config.hosts]).toEqual(['valkyriahll.cz', 'www.valkyriahll.cz']);
    expect(parseLegacyHosts(undefined).size).toBe(0);
    expect(canonicalOrigin('https://valkyria.cz/cs')).toBe('https://valkyria.cz');
    expect(canonicalOrigin('http://valkyria.cz')).toBeNull();
    expect(canonicalOrigin(undefined)).toBeNull();
    expect(canonicalOrigin('https://user:password@valkyria.cz')).toBeNull();
    expect(canonicalOrigin('ftp://localhost')).toBeNull();
    expect(canonicalOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('redirects reviewed legacy paths on configured hosts to the canonical origin', () => {
    expect(legacyHostRedirect(req('valkyriahll.cz', '/guide/tanky'), config)).toBeNull();
    expect(legacyHostRedirect(req('www.valkyriahll.cz', '/matches', 'page=3'), config)).toBe('https://valkyria.cz/cs/hll/matches?view=results');
    expect(legacyHostRedirect(req('valkyriahll.cz', '/'), config)).toBe('https://valkyria.cz/cs/hll');
    expect(legacyHostRedirect(req('valkyriahll.cz', '/faq'), config)).toBeNull();
  });

  it('rewrites valid details to a publication lookup without trusting the request query', () => {
    const result = legacyHostLookup(req('valkyriahll.cz', '/guide/tanky', 'locale=en&next=https://evil.invalid'), config);
    const url = new URL(result!, config.origin);
    expect(url.pathname).toBe('/api/legacy/hll');
    expect([...url.searchParams]).toEqual([['path', '/guide/tanky'], ['locale', 'cs']]);
    expect(legacyHostLookup(req('valkyria.cz', '/guide/tanky'), config)).toBeNull();
    expect(legacyHostLookup(req('valkyriahll.cz', '/unknown'), config)).toBeNull();
    expect(legacyHostLookup(req('valkyriahll.cz', '//evil.invalid'), config)).toBeNull();
    expect(legacyHostLookup(req('valkyriahll.cz', '/faq'), config)).not.toBeNull();
  });

  it('does not loop when a canonical host is accidentally listed as legacy', () => {
    const mistaken = { hosts: parseLegacyHosts('valkyria.cz'), origin: config.origin };
    expect(isLegacyHost(req('valkyria.cz', '/guide/tanky'), mistaken)).toBe(false);
    expect(legacyHostLookup(req('valkyria.cz', '/guide/tanky'), mistaken)).toBeNull();
    expect(legacyHostRedirect(req('valkyria.cz', '/'), mistaken)).toBeNull();
  });

  it('is inactive for other hosts, unconfigured deployments and pending or unknown paths', () => {
    expect(legacyHostRedirect(req('valkyria.cz', '/guide/tanky'), config)).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/guide/tanky'), { hosts: new Set(), origin: 'https://valkyria.cz' })).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/guide/tanky'), { ...config, origin: null })).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/events'), config)).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/unknown'), config)).toBeNull();
  });
});
