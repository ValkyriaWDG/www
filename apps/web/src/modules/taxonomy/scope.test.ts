import { describe, expect, it } from 'vitest';
import { manualGames, parseTaxonomyScope, sameTaxonomyScope, sortTaxonomyOptions, TAXONOMY_KEY_PATTERN, taxonomyScopeGame, taxonomyScopePath, taxonomySectionId } from './scope';

describe('taxonomy scopes', () => {
  it('parses the manual game segment and the shared news segments only', () => {
    expect(parseTaxonomyScope(['manual', 'hll'])).toEqual({ scope: 'manual-category', game: 'hell-let-loose' });
    expect(parseTaxonomyScope(['news-category'])).toEqual({ scope: 'news-category' });
    expect(parseTaxonomyScope(['news-tag'])).toEqual({ scope: 'news-tag' });
    // Wardogs has no Field Manual; unknown games, database IDs and extra segments are rejected.
    expect(parseTaxonomyScope(['manual', 'wardogs'])).toBeNull();
    expect(parseTaxonomyScope(['manual', 'hell-let-loose'])).toBeNull();
    expect(parseTaxonomyScope(['manual', 'hll', 'x'])).toBeNull();
    expect(parseTaxonomyScope(['manual'])).toBeNull();
    expect(parseTaxonomyScope(['tags'])).toBeNull();
    expect(parseTaxonomyScope([])).toBeNull();
  });

  it('builds admin paths and section anchors with the public game segment', () => {
    const manual = { scope: 'manual-category', game: 'hell-let-loose' } as const;
    expect(taxonomyScopePath(manual)).toBe('/admin/taxonomy/manual/hll');
    expect(taxonomyScopePath(manual, 'new')).toBe('/admin/taxonomy/manual/hll/new');
    expect(taxonomyScopePath({ scope: 'news-tag' }, '0f000000-0000-4000-8000-000000000001')).toBe('/admin/taxonomy/news-tag/0f000000-0000-4000-8000-000000000001');
    expect(taxonomySectionId(manual)).toBe('manual-hll');
    expect(taxonomySectionId({ scope: 'news-category' })).toBe('news-category');
  });

  it('treats news taxonomy as a community resource and manual categories as game resources', () => {
    expect(taxonomyScopeGame({ scope: 'manual-category', game: 'hell-let-loose' })).toBe('hell-let-loose');
    expect(taxonomyScopeGame({ scope: 'news-category' })).toBeNull();
    expect(taxonomyScopeGame({ scope: 'news-tag' })).toBeNull();
    expect(manualGames()).toEqual(['hell-let-loose']);
    expect(sameTaxonomyScope({ scope: 'news-tag' }, { scope: 'news-tag' })).toBe(true);
    expect(sameTaxonomyScope({ scope: 'news-tag' }, { scope: 'news-category' })).toBe(false);
    expect(sameTaxonomyScope({ scope: 'manual-category', game: 'hell-let-loose' }, { scope: 'manual-category', game: 'wardogs' })).toBe(false);
  });

  it('accepts only lower-case hyphenated keys', () => {
    for (const key of ['roles', 'getting-started', 'a1-b2']) expect(TAXONOMY_KEY_PATTERN.test(key)).toBe(true);
    for (const key of ['', 'Roles', 'role_s', '-roles', 'roles-', 'ro--les', 'rolé', 'ro les']) expect(TAXONOMY_KEY_PATTERN.test(key)).toBe(false);
  });

  it('orders picker options by sort order, then Czech label, then key', () => {
    const sorted = sortTaxonomyOptions([
      { key: 'z', labelCs: 'Žádost', sortOrder: 100 },
      { key: 'c', labelCs: 'Chyba', sortOrder: 100 },
      { key: 'h', labelCs: 'Hra', sortOrder: 100 },
      { key: 'b', labelCs: 'Zápas', sortOrder: 10 },
      { key: 'a', labelCs: 'Zápas', sortOrder: 10 },
    ]);
    // Czech collation sorts "ch" after "h" and "ž" after "z"; equal labels fall back to the key.
    expect(sorted.map((option) => option.key)).toEqual(['a', 'b', 'h', 'c', 'z']);
  });
});
