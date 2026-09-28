import { describe, expect, it } from 'vitest';
import { canonicalOrigin, legacyHostRedirect, parseLegacyHosts } from './legacy-hosts';

const config = { hosts: parseLegacyHosts('valkyriahll.cz, WWW.valkyriahll.cz,not a host,https://evil.example'), origin: 'https://valkyria.cz' };
const req = (hostname: string, pathname: string, query = '') => ({ hostname, pathname, searchParams: new URLSearchParams(query) });

describe('legacy host redirects', () => {
  it('parses only plain hostnames and HTTPS canonical origins', () => {
    expect([...config.hosts]).toEqual(['valkyriahll.cz', 'www.valkyriahll.cz']);
    expect(parseLegacyHosts(undefined).size).toBe(0);
    expect(canonicalOrigin('https://valkyria.cz/cs')).toBe('https://valkyria.cz');
    expect(canonicalOrigin('http://valkyria.cz')).toBeNull();
    expect(canonicalOrigin(undefined)).toBeNull();
  });

  it('redirects reviewed legacy paths on configured hosts to the canonical origin', () => {
    expect(legacyHostRedirect(req('valkyriahll.cz', '/guide/tanky'), config)).toBe('https://valkyria.cz/cs/hll/field-manual/tanky');
    expect(legacyHostRedirect(req('www.valkyriahll.cz', '/matches', 'page=3'), config)).toBe('https://valkyria.cz/cs/hll/matches?view=results');
    expect(legacyHostRedirect(req('valkyriahll.cz', '/'), config)).toBe('https://valkyria.cz/cs/hll');
  });

  it('is inactive for other hosts, unconfigured deployments and pending or unknown paths', () => {
    expect(legacyHostRedirect(req('valkyria.cz', '/guide/tanky'), config)).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/guide/tanky'), { hosts: new Set(), origin: 'https://valkyria.cz' })).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/guide/tanky'), { ...config, origin: null })).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/faq'), config)).toBeNull();
    expect(legacyHostRedirect(req('valkyriahll.cz', '/unknown'), config)).toBeNull();
  });
});
