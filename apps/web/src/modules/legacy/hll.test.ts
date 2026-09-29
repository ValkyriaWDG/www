import { describe, expect, it } from 'vitest';
import { isValidSlug } from '@/modules/content/slug';
import { SEED_MANUAL_CATEGORIES } from '@/seed/taxonomy';
import { LEGACY_GUIDES, LEGACY_NEWS, resolveLegacyHllPath } from './hll';

const params = (query: string) => new URLSearchParams(query);

describe('legacy HLL manifest', () => {
  it('lists the eight reviewed guides with valid slugs, seeded categories and provenance', () => {
    expect(LEGACY_GUIDES.map((guide) => guide.slug)).toEqual(['zakladni-nastaveni', 'herni-mody', 'role', 'vozidla', 'tanky', 'spawny', 'gameplay', 'prirucka-sl']);
    const categories = new Set(SEED_MANUAL_CATEGORIES.map((category) => category.key));
    for (const guide of LEGACY_GUIDES) {
      expect(isValidSlug(guide.slug)).toBe(true);
      expect(categories.has(guide.category)).toBe(true);
      expect(guide.sourcePublishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(LEGACY_GUIDES.find((guide) => guide.slug === 'tanky')).toMatchObject({ sourceLanguage: 'sk', credits: 'Ninjonik' });
    expect(LEGACY_GUIDES.find((guide) => guide.slug === 'prirucka-sl')?.credits).toBe('Sandiary, Tryfid-GA, Larry, Kelly');
  });
});

describe('legacy HLL redirects', () => {
  it('redirects implemented destinations to Czech canonical routes', () => {
    expect(resolveLegacyHllPath('/')).toEqual({ kind: 'redirect', target: '/cs/hll' });
    expect(resolveLegacyHllPath('/servery')).toEqual({ kind: 'redirect', target: '/cs/hll/servers' });
    expect(resolveLegacyHllPath('/servery/')).toEqual({ kind: 'redirect', target: '/cs/hll/servers' });
    expect(resolveLegacyHllPath('/matches')).toEqual({ kind: 'redirect', target: '/cs/hll/matches' });
    expect(resolveLegacyHllPath('/matches', params('page=7'))).toEqual({ kind: 'redirect', target: '/cs/hll/matches?view=results' });
    expect(resolveLegacyHllPath('/guide')).toEqual({ kind: 'redirect', target: '/cs/hll/field-manual' });
    expect(resolveLegacyHllPath('/clanky', params('page=2'))).toEqual({ kind: 'redirect', target: '/cs/hll/news' });
  });

  it('keeps reviewed URLs without a built destination or imported content pending, never Home', () => {
    expect(resolveLegacyHllPath('/tournaments')).toEqual({ kind: 'redirect', target: '/cs/hll/tournaments' });
    expect(resolveLegacyHllPath('/turnaje')).toEqual({ kind: 'redirect', target: '/cs/hll/tournaments' });
    expect(resolveLegacyHllPath('/zebricky/kd-pomer')).toEqual({ kind: 'pending', proposed: '/cs/hll/leaderboards/kd-ratio', reason: 'destination_not_built' });
    expect(resolveLegacyHllPath('/stats/6')).toEqual({ kind: 'pending', proposed: '/cs/hll/servers/6/stats', reason: 'destination_not_built' });
    expect(LEGACY_NEWS['sbirka-2026']).toBe('/cs/news/sbirka-2026');
  });

  it('requires a publication lookup for every article, page, match and tournament detail', () => {
    expect(resolveLegacyHllPath('/guide/prirucka-sl')).toEqual({ kind: 'lookup', sourceKind: 'manual', sourceKey: 'prirucka-sl' });
    expect(resolveLegacyHllPath('/clanky/wardogs-oznameni')).toEqual({ kind: 'lookup', sourceKind: 'news', sourceKey: 'wardogs-oznameni' });
    expect(resolveLegacyHllPath('/about')).toEqual({ kind: 'lookup', sourceKind: 'page', sourceKey: 'about' });
    expect(resolveLegacyHllPath('/faq')).toEqual({ kind: 'lookup', sourceKind: 'page', sourceKey: 'faq' });
    expect(resolveLegacyHllPath('/matches/211')).toEqual({ kind: 'lookup', sourceKind: 'match', sourceKey: '211' });
    expect(resolveLegacyHllPath('/turnaje/ecl-2024')).toEqual({ kind: 'lookup', sourceKind: 'tournament', sourceKey: 'ecl-2024' });
    expect(resolveLegacyHllPath('/tournaments/ecl-2024/')).toEqual(resolveLegacyHllPath('/turnaje/ecl-2024'));
    // A new import may be absent from the original manifest; only the ledger can authorize its target.
    expect(resolveLegacyHllPath('/guide/synthetic-new-import')?.kind).toBe('lookup');
  });

  it('does not guess unknown or malformed legacy paths', () => {
    for (const path of ['/zebricky/unknown', '/stats/2', '/matches/abc', '/matches/0', '/matches/0211', '/Guide', '/guide/a/b', '/wp-admin', '/guide/%2e%2e', 'https://evil.invalid/guide/tanky', '//evil.invalid', '/guide//tanky', '/guide/tanky?next=elsewhere', '/guide/tanky#fragment', '/guide/../faq', '/guide/tanky\\elsewhere', `/guide/${'a'.repeat(121)}`]) {
      expect(resolveLegacyHllPath(path), path).toBeNull();
    }
  });
});
