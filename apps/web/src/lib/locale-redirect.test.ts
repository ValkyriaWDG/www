import { describe, expect, it } from 'vitest';
import { filterSafeQuery, resolveUnprefixedRedirect } from './locale-redirect';

describe('resolveUnprefixedRedirect', () => {
  it('sends bare root to Czech', () => {
    expect(resolveUnprefixedRedirect('/', new URLSearchParams())).toBe('/cs');
  });

  it('redirects known UI suffixes to the Czech route and keeps only safe filters', () => {
    const params = new URLSearchParams('game=wardogs&status=upcoming&token=secret&returnTo=https://evil.example');
    expect(resolveUnprefixedRedirect('/matches', params)).toBe('/cs/matches?game=wardogs&status=upcoming');
    expect(resolveUnprefixedRedirect('/news/some-post', new URLSearchParams())).toBe('/cs/news/some-post');
    expect(resolveUnprefixedRedirect('/admin/news/new', new URLSearchParams())).toBe('/cs/admin/news/new');
  });

  it('redirects unprefixed game sections to Czech without choosing a game for the root', () => {
    expect(resolveUnprefixedRedirect('/hll', new URLSearchParams())).toBe('/cs/hll');
    expect(resolveUnprefixedRedirect('/wardogs/matches', new URLSearchParams('view=results'))).toBe('/cs/wardogs/matches?view=results');
    expect(resolveUnprefixedRedirect('/hll/servers', new URLSearchParams('server=srv-1'))).toBe('/cs/hll/servers?server=srv-1');
    expect(resolveUnprefixedRedirect('/hell-let-loose', new URLSearchParams())).toBeNull();
  });

  it('does not rewrite unknown paths or unsupported explicit locales', () => {
    expect(resolveUnprefixedRedirect('/de/news', new URLSearchParams())).toBeNull();
    expect(resolveUnprefixedRedirect('/wp-admin', new URLSearchParams())).toBeNull();
    expect(resolveUnprefixedRedirect('/blog', new URLSearchParams())).toBeNull();
  });

  it('rejects traversal-looking segments', () => {
    expect(resolveUnprefixedRedirect('/news/..', new URLSearchParams())).toBeNull();
  });
});

describe('filterSafeQuery', () => {
  it('drops oversized or control-character values', () => {
    const params = new URLSearchParams({ q: 'x'.repeat(200), game: 'hell-let-loose', status: 'a\u0000b' });
    expect(filterSafeQuery(params).toString()).toBe('game=hell-let-loose');
  });

  it('accepts Czech search text', () => {
    expect(filterSafeQuery(new URLSearchParams({ q: 'Příliš žluťoučký' })).get('q')).toBe('Příliš žluťoučký');
  });

  it('keeps the edited content language across a UI language switch', () => {
    expect(filterSafeQuery(new URLSearchParams({ lang: 'en', returnTo: 'https://evil.example' })).toString()).toBe('lang=en');
  });
});
