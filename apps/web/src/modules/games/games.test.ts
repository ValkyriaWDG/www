import { GAMES } from '@valkyria/db/schema';
import { describe, expect, it } from 'vitest';
import {
  GAME_REGISTRY,
  GAME_ROUTES,
  getGame,
  gameHasSection,
  gameRouteFromDb,
  gameRouteFromLogi,
  isGameRoute,
  parseDbGame,
} from './registry';
import { gameMenu, gameOfPath, gamePath, parseGameSwitchNotice, parseLogicalPath, resolveGameSwitch, toLogicalPath } from './routes';

describe('game registry', () => {
  it('maps every database game exactly once, with explicit Logi IDs', () => {
    expect(GAME_ROUTES.map((route) => GAME_REGISTRY[route].db).sort()).toEqual([...GAMES].sort());
    expect(GAME_REGISTRY.hll).toMatchObject({ route: 'hll', db: 'hell-let-loose', logi: 'hell_let_loose' });
    expect(GAME_REGISTRY.wardogs).toMatchObject({ route: 'wardogs', db: 'wardogs', logi: 'wardogs' });
  });

  it('rejects unknown, aggregate and differently cased game values', () => {
    for (const value of ['all', 'HLL', 'hell-let-loose', 'hell_let_loose', '', ' hll', null, undefined, 1]) {
      expect(isGameRoute(value)).toBe(false);
      expect(getGame(value)).toBeNull();
    }
    expect(gameRouteFromLogi('all')).toBeNull();
    expect(gameRouteFromLogi('hll')).toBeNull();
    expect(parseDbGame('hll')).toBeNull();
    expect(parseDbGame('all')).toBeNull();
  });

  it('converts between route, database and Logi identifiers', () => {
    expect(gameRouteFromDb('hell-let-loose')).toBe('hll');
    expect(gameRouteFromDb('wardogs')).toBe('wardogs');
    expect(gameRouteFromLogi('hell_let_loose')).toBe('hll');
    expect(gameRouteFromLogi('wardogs')).toBe('wardogs');
    expect(parseDbGame('hell-let-loose')).toBe('hell-let-loose');
    expect(() => gameRouteFromDb('other' as never)).toThrow();
  });

  it('exposes the HLL menu order and keeps the Wardogs order', () => {
    expect(gameMenu('hll').map((item) => item.section)).toEqual(['news', 'matches', 'tournaments', 'servers', 'members', 'field-manual', 'faq', 'clan', 'community']);
    expect(gameMenu('wardogs').map((item) => item.href)).toEqual([
      '/wardogs/news',
      '/wardogs/clan',
      '/wardogs/members',
      '/wardogs/matches',
      '/wardogs/servers',
      '/wardogs/history',
    ]);
    expect(gameHasSection('wardogs', 'field-manual')).toBe(false);
    expect(gameHasSection('wardogs', 'history')).toBe(true);
    expect(gameHasSection('hll', 'history')).toBe(false);
    expect(gameHasSection('wardogs', 'tournaments')).toBe(false);
  });
});

describe('game routes', () => {
  it('builds logical paths and refuses unsafe slugs', () => {
    expect(gamePath('hll')).toBe('/hll');
    expect(gamePath('hll', 'field-manual')).toBe('/hll/field-manual');
    expect(gamePath('wardogs', 'news', 'a-post')).toBe('/wardogs/news/a-post');
    expect(() => gamePath('hll', 'news', '../admin')).toThrow();
  });

  it('parses localized and logical paths independently of locale', () => {
    expect(toLogicalPath('/cs/hll/news?q=x#top')).toBe('/hll/news');
    expect(toLogicalPath('/en')).toBe('/');
    expect(parseLogicalPath('/en/hll/matches/some-match')).toEqual({ game: 'hll', section: 'matches', rest: ['some-match'] });
    expect(parseLogicalPath('/cs/news/community-post')).toEqual({ game: null, section: 'news', rest: ['community-post'] });
    expect(parseLogicalPath('/cs')).toEqual({ game: null, section: null, rest: [] });
    expect(gameOfPath('/cs/wardogs')).toBe('wardogs');
    expect(gameOfPath('/cs/hllx')).toBeNull();
  });

  it('switches games preserving locale-free category and portable filters', () => {
    expect(resolveGameSwitch('/cs/hll', '', 'wardogs')).toBe('/wardogs');
    expect(resolveGameSwitch('/cs/hll/news', 'q=ecl&page=3&category=x', 'wardogs')).toBe('/wardogs/news?q=ecl');
    expect(resolveGameSwitch('/en/wardogs/matches', 'view=results&game=wardogs', 'hll')).toBe('/hll/matches?view=results');
    expect(resolveGameSwitch('/cs/hll/servers', 'server=srv-1', 'wardogs')).toBe('/wardogs/servers');
  });

  it('never invents a same-slug counterpart for a detail page', () => {
    expect(resolveGameSwitch('/cs/hll/matches/vlk-vs-yoko', '', 'wardogs')).toBe('/wardogs/matches?switch=detail');
    expect(resolveGameSwitch('/en/wardogs/news/launch', '', 'hll')).toBe('/hll/news?switch=detail');
    expect(resolveGameSwitch('/cs/news/community-post', '', 'hll')).toBe('/hll/news?switch=detail');
  });

  it('opens the landing for sections the target lacks and for shared utility routes', () => {
    expect(resolveGameSwitch('/cs/hll/field-manual/role', '', 'wardogs')).toBe('/wardogs?switch=section');
    expect(resolveGameSwitch('/cs/wardogs/history', 'server=synthetic-wardogs&period=all', 'hll')).toBe('/hll?switch=section');
    expect(resolveGameSwitch('/cs/privacy', '', 'hll')).toBe('/hll');
    expect(resolveGameSwitch('/cs/admin/news', '', 'hll')).toBe('/hll');
    expect(resolveGameSwitch('/cs', '', 'hll')).toBe('/hll');
    expect(resolveGameSwitch('/cs/clan', '', 'hll')).toBe('/hll/clan');
  });

  it('keeps the current path when the target is the active game', () => {
    expect(resolveGameSwitch('/cs/hll/news/a-post', '', 'hll')).toBe('/hll/news/a-post');
  });

  it('accepts only known switch notices', () => {
    expect(parseGameSwitchNotice('detail')).toBe('detail');
    expect(parseGameSwitchNotice('section')).toBe('section');
    expect(parseGameSwitchNotice('<script>')).toBeNull();
    expect(parseGameSwitchNotice(undefined)).toBeNull();
  });
});

describe('canonical entity paths', () => {
  it('derives news and match URLs from the published game', async () => {
    const { canonicalMatchPath, canonicalNewsPath, canonicalTournamentPath } = await import('./routes');
    expect(canonicalNewsPath(null, 'charity')).toBe('/news/charity');
    expect(canonicalNewsPath('hell-let-loose', 'ecl-report')).toBe('/hll/news/ecl-report');
    expect(canonicalNewsPath('wardogs', 'launch')).toBe('/wardogs/news/launch');
    expect(canonicalMatchPath('hell-let-loose', 'vlk-vs-yoko')).toBe('/hll/matches/vlk-vs-yoko');
    expect(canonicalTournamentPath('hell-let-loose', 'ecl-2026-fall')).toBe('/hll/tournaments/ecl-2026-fall');
    expect(() => canonicalNewsPath('hell-let-loose', 'bad/slug')).toThrow();
  });
});
