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
    expect(resolveLegacyHllPath('/guide/prirucka-sl')).toEqual({ kind: 'redirect', target: '/cs/hll/field-manual/prirucka-sl' });
    expect(resolveLegacyHllPath('/clanky', params('page=2'))).toEqual({ kind: 'redirect', target: '/cs/hll/news' });
    expect(resolveLegacyHllPath('/about')).toEqual({ kind: 'redirect', target: '/cs/clan' });
  });

  it('keeps reviewed URLs without a built destination or imported content pending, never Home', () => {
    expect(resolveLegacyHllPath('/faq')).toEqual({ kind: 'redirect', target: '/cs/hll/faq' });
    expect(resolveLegacyHllPath('/tournaments')).toEqual({ kind: 'pending', proposed: '/cs/hll/tournaments', reason: 'destination_not_built' });
    expect(resolveLegacyHllPath('/turnaje/ecl-2024')).toEqual({ kind: 'pending', proposed: '/cs/hll/tournaments/ecl-2024', reason: 'destination_not_built' });
    expect(resolveLegacyHllPath('/zebricky/kd-pomer')).toEqual({ kind: 'pending', proposed: '/cs/hll/leaderboards/kd-ratio', reason: 'destination_not_built' });
    expect(resolveLegacyHllPath('/stats/6')).toEqual({ kind: 'pending', proposed: '/cs/hll/servers/6/stats', reason: 'destination_not_built' });
    expect(resolveLegacyHllPath('/matches/211')).toEqual({ kind: 'pending', proposed: '/cs/hll/matches/211', reason: 'needs_id_alias' });
    // Each article keeps its own scope: the Wardogs announcement does not land in HLL news.
    expect(resolveLegacyHllPath('/clanky/wardogs-oznameni')).toEqual({ kind: 'pending', proposed: '/cs/wardogs/news/wardogs-oznameni', reason: 'content_not_imported' });
    expect(LEGACY_NEWS['sbirka-2026']).toBe('/cs/news/sbirka-2026');
  });

  it('does not guess unknown or malformed legacy paths', () => {
    for (const path of ['/guide/unknown', '/clanky/unknown', '/turnaje/unknown', '/zebricky/unknown', '/stats/2', '/matches/abc', '/Guide', '/guide/a/b', '/wp-admin', '/guide/%2e%2e']) {
      expect(resolveLegacyHllPath(path), path).toBeNull();
    }
  });
});
