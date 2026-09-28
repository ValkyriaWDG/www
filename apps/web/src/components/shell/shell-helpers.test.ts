import { describe, expect, it } from 'vitest';
import { paginationWindow } from '@/components/ui/pagination-window';
import { parseDiscordInvite, parseExternalHttpsUrl } from './external-links';
import { buildLocaleSwitchHref } from './locale-switch';
import { getCurrentSection, getRouteMode, stripLocale, WARDOGS_NAV_SECTIONS } from './route-mode';
import { forestPath, mountainPath, ridgePath, seededRandom } from './scene-geometry';

describe('route mode and current section', () => {
  it('strips only supported locale prefixes', () => {
    expect(stripLocale('/cs')).toBe('/');
    expect(stripLocale('/en/news/some-post')).toBe('/news/some-post');
    expect(stripLocale('/de/news')).toBe('/de/news');
    expect(stripLocale('/news?game=wardogs')).toBe('/news');
  });

  it('classifies hub, game landing, public and admin routes', () => {
    expect(getRouteMode('/cs')).toBe('hub');
    expect(getRouteMode('/')).toBe('hub');
    expect(getRouteMode('/cs/wardogs')).toBe('home');
    expect(getRouteMode('/en/hll')).toBe('home');
    expect(getRouteMode('/cs/hll/news')).toBe('public');
    expect(getRouteMode('/cs/wardogsx')).toBe('public');
    expect(getRouteMode('/en/matches')).toBe('public');
    expect(getRouteMode('/cs/login')).toBe('public');
    expect(getRouteMode('/cs/admin/news/new')).toBe('admin');
    expect(getRouteMode('/administration')).toBe('public');
  });

  it('matches the current section by path prefix', () => {
    expect(getCurrentSection('/')).toBe('home');
    expect(getCurrentSection('/news')).toBe('news');
    expect(getCurrentSection('/cs/news/a-long-article')).toBe('news');
    expect(getCurrentSection('/members/someone')).toBe('members');
    expect(getCurrentSection('/newsletter')).toBeNull();
    expect(getCurrentSection('/account')).toBeNull();
  });

  it('matches Wardogs sections under the game prefix only', () => {
    expect(getCurrentSection('/cs/wardogs', WARDOGS_NAV_SECTIONS)).toBe('home');
    expect(getCurrentSection('/cs/wardogs/matches/some-match', WARDOGS_NAV_SECTIONS)).toBe('matches');
    expect(getCurrentSection('/en/wardogs/members/someone', WARDOGS_NAV_SECTIONS)).toBe('members');
    expect(getCurrentSection('/cs/news', WARDOGS_NAV_SECTIONS)).toBeNull();
    expect(getCurrentSection('/cs/hll/news', WARDOGS_NAV_SECTIONS)).toBeNull();
  });
});

describe('external links', () => {
  it('accepts only HTTPS Discord invitations', () => {
    expect(parseDiscordInvite('https://discord.gg/vlkhll')).toBe('https://discord.gg/vlkhll');
    expect(parseDiscordInvite('https://discord.com/invite/abc-123')).toBe('https://discord.com/invite/abc-123');
    expect(parseDiscordInvite('http://discord.gg/vlkhll')).toBeNull();
    expect(parseDiscordInvite('https://discord.gg.evil.example/x')).toBeNull();
    expect(parseDiscordInvite('https://evil.example/discord.gg/x')).toBeNull();
    expect(parseDiscordInvite('https://discord.com/channels/1/2')).toBeNull();
    expect(parseDiscordInvite('https://user:pw@discord.gg/x1')).toBeNull();
    expect(parseDiscordInvite('https://discord.gg/abc?ref=x')).toBeNull();
    expect(parseDiscordInvite('')).toBeNull();
    expect(parseDiscordInvite(undefined)).toBeNull();
  });

  it('accepts plain HTTPS URLs for other destinations', () => {
    expect(parseExternalHttpsUrl('https://valkyriahll.cz/')).toBe('https://valkyriahll.cz/');
    expect(parseExternalHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(parseExternalHttpsUrl('http://valkyriahll.cz/')).toBeNull();
  });
});

describe('language switch link', () => {
  it('targets the locale-switch endpoint with the real current path', () => {
    expect(buildLocaleSwitchHref('en', '/cs/news', '', 'cs')).toBe('/api/locale-switch?to=en&from=%2Fcs%2Fnews');
  });

  it('keeps only safe filters and drops pagination', () => {
    const href = buildLocaleSwitchHref('cs', '/en/matches', 'game=wardogs&page=3&returnTo=https%3A%2F%2Fevil.example&status=upcoming', 'en');
    const url = new URL(href, 'http://x');
    expect(url.pathname).toBe('/api/locale-switch');
    expect(url.searchParams.get('to')).toBe('cs');
    expect(url.searchParams.get('from')).toBe('/en/matches?game=wardogs&status=upcoming');
  });

  it('falls back to the current locale home for malformed paths', () => {
    expect(new URL(buildLocaleSwitchHref('en', '//evil.example/x', '', 'cs'), 'http://x').searchParams.get('from')).toBe('/cs');
    expect(new URL(buildLocaleSwitchHref('en', '/de/news', '', 'cs'), 'http://x').searchParams.get('from')).toBe('/cs');
  });
});

describe('pagination window', () => {
  it('shows first, last and neighbours with gaps', () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
    expect(paginationWindow(1, 3)).toEqual([1, 2, 3]);
    expect(paginationWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(paginationWindow(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(paginationWindow(10, 10)).toEqual([1, null, 9, 10]);
  });
});

describe('fallback scene geometry', () => {
  it('is deterministic for a seed', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(forestPath(3, { baseY: 450, minHeight: 20, maxHeight: 40, minGap: 5, maxGap: 10 })).toBe(forestPath(3, { baseY: 450, minHeight: 20, maxHeight: 40, minGap: 5, maxGap: 10 }));
  });

  it('produces closed integer-coordinate paths', () => {
    for (const path of [
      ridgePath(1, { baseY: 600, amplitude: 50 }),
      mountainPath(2, { baseY: 300, peaks: 4, minHeight: 40, maxHeight: 120 }),
      forestPath(3, { baseY: 450, minHeight: 20, maxHeight: 40, minGap: 5, maxGap: 10, close: 'base', from: 0, to: 200 }),
    ]) {
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(true);
      expect(path).not.toMatch(/NaN|\d\.\d/);
    }
  });
});
