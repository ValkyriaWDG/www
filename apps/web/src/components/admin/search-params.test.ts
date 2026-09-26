import { describe, expect, it } from 'vitest';
import { hrefWith, oneOf, pageParam, searchText, single } from './search-params';

describe('admin list URL state', () => {
  it('reads single, allowlisted and numeric params defensively', () => {
    expect(single(['a', 'b'])).toBe('a');
    expect(single('')).toBeUndefined();
    expect(oneOf('draft', ['draft', 'published'] as const)).toBe('draft');
    expect(oneOf('evil', ['draft', 'published'] as const)).toBeUndefined();
    expect(pageParam('3')).toBe(3);
    expect(pageParam('-1')).toBe(1);
    expect(pageParam('abc')).toBe(1);
    expect(searchText('  kůň   a  vůz ')).toBe('kůň a vůz');
    expect(searchText('x'.repeat(100))?.length).toBe(80);
  });

  it('builds filter links that reset pagination unless paging', () => {
    const params = { q: 'turnaj', state: 'draft', page: '3' };
    expect(hrefWith('/admin/news', params, { state: 'published' })).toBe('/admin/news?q=turnaj&state=published');
    expect(hrefWith('/admin/news', params, { state: undefined })).toBe('/admin/news?q=turnaj');
    expect(hrefWith('/admin/news', params, { page: 4 })).toBe('/admin/news?q=turnaj&state=draft&page=4');
    expect(hrefWith('/admin/news', params, { page: 1 })).toBe('/admin/news?q=turnaj&state=draft');
    expect(hrefWith('/admin/news', {}, {})).toBe('/admin/news');
  });
});
