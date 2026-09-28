import { describe, expect, it, vi } from 'vitest';
import { MAX_SWITCH_PATH_LENGTH, parseSwitchSource, resolveLocaleSwitch, type CounterpartResolver } from './locale-switch';

const never: CounterpartResolver = async () => {
  throw new Error('resolver must not be called');
};

describe('parseSwitchSource', () => {
  it.each([
    null,
    '',
    'news',
    'https://evil.example/cs/news',
    '//evil.example/cs',
    '/\\evil.example',
    '/cs\\..\\admin',
    '/cs/../admin',
    '/cs/./news',
    '/cs//news',
    '/cs/%2e%2e/admin',
    '/cs/news/a%20b',
    '/cs/news\u0000',
    '/cs/news\ttab',
    '/javascript:alert(1)',
    '/de/news',
    '/cs/news?q=a\u0001',
    `/cs/${'a'.repeat(MAX_SWITCH_PATH_LENGTH)}`,
  ])('rejects %j', (from) => {
    expect(parseSwitchSource(from)).toBeNull();
  });

  it('parses a localized path with query and fragment', () => {
    const parsed = parseSwitchSource('/en/matches?game=wardogs&page=3#top');
    expect(parsed?.locale).toBe('en');
    expect(parsed?.segments).toEqual(['matches']);
    expect(parsed?.query.get('game')).toBe('wardogs');
  });
});

describe('resolveLocaleSwitch', () => {
  it.each([
    [{ to: 'en', from: '/cs' }, '/en'],
    [{ to: 'cs', from: '/en/matches?game=wardogs&status=upcoming&page=4&token=abc&returnTo=https://evil.example' }, '/cs/matches?game=wardogs&status=upcoming'],
    [{ to: 'en', from: '/cs/admin/news/3b1f?preview=secret' }, '/en/admin/news/3b1f'],
    [{ to: 'en', from: '/cs/news?category=announcements&q=turnaj&page=2' }, '/en/news?q=turnaj&category=announcements'],
    [{ to: 'en', from: '//evil.example' }, '/en'],
    [{ to: 'xx', from: '/en/news' }, '/cs/news'],
    [{ to: 'en', from: null }, '/en'],
  ])('%j → %s', async (params, expected) => {
    expect(await resolveLocaleSwitch(params, never)).toBe(expected);
  });

  it('maps an article through its entity counterpart', async () => {
    const resolver = vi.fn<CounterpartResolver>(async () => ({ kind: 'published', slug: 'english-slug' }));
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/news/cesky-slug?page=2' }, resolver)).toBe('/en/news/english-slug');
    expect(resolver).toHaveBeenCalledWith('cs', 'cesky-slug', 'en');
  });

  it('links a missing translation to the source article via the target news list', async () => {
    const missing: CounterpartResolver = async () => ({ kind: 'missing', sourceSlug: 'cesky-slug' });
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/news/cesky-slug' }, missing)).toBe('/en/news?missing=cs%3Acesky-slug');
    const unpublished: CounterpartResolver = async () => null;
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/news/koncept' }, unpublished)).toBe('/en/news');
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/news/Not_A_Slug' }, never)).toBe('/en/news');
  });

  it('keeps the game section while mapping an article counterpart', async () => {
    const resolver = vi.fn<CounterpartResolver>(async () => ({ kind: 'published', slug: 'ecl-report' }));
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/hll/news/zprava-ecl' }, resolver)).toBe('/en/hll/news/ecl-report');
    expect(resolver).toHaveBeenCalledWith('cs', 'zprava-ecl', 'en');
    const missing: CounterpartResolver = async () => ({ kind: 'missing', sourceSlug: 'zprava-ecl' });
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/hll/news/zprava-ecl' }, missing)).toBe('/en/hll/news?missing=cs%3Azprava-ecl');
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/wardogs/news/Bad_Slug' }, never)).toBe('/en/wardogs/news');
  });

  it('keeps game sections and shared-slug details as they are', async () => {
    expect(await resolveLocaleSwitch({ to: 'en', from: '/cs/hll/matches/vlk-vs-yoko?view=results&page=2' }, never)).toBe('/en/hll/matches/vlk-vs-yoko?view=results');
    expect(await resolveLocaleSwitch({ to: 'cs', from: '/en/hll/servers?server=srv-1' }, never)).toBe('/cs/hll/servers?server=srv-1');
    expect(await resolveLocaleSwitch({ to: 'cs', from: '/en/wardogs' }, never)).toBe('/cs/wardogs');
  });
});
