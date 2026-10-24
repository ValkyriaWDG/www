import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPublicLogiPlayerDirectory, type PublicLogiPlayer, type PublicPlayerDirectory } from '@/modules/integrations/logi-public-players';
import { readPublicPlayerStatistics } from '@/modules/integrations/logi-public-player-statistics';
import { playerProfileMetadata, PlayerProfileScreen } from './player-profile-screen';

vi.mock('react', async (original) => ({ ...await original<typeof React>(), cache: <T,>(fn: T) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));
vi.mock('@/components/shell/page-main', () => ({ PageMain: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/ui', () => ({
  PageHeader: ({ title, back }: { title: string; back: { href: string; label: string } }) => <header><h1>{title}</h1><a href={back.href}>{back.label}</a></header>,
  SectionFrame: () => null,
  GameButton: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  FeedbackNotice: ({ title, children, action }: { title: string; children: React.ReactNode; action: React.ReactNode }) => <section role="status">{title}{children}{action}</section>,
}));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/env', () => ({ getServerEnv: () => ({}) }));
vi.mock('@/modules/integrations/logi-public-players', () => ({ readPublicLogiPlayerDirectory: vi.fn() }));
vi.mock('@/modules/integrations/logi-public-player-statistics', () => ({ readPublicPlayerStatistics: vi.fn() }));

const player: PublicLogiPlayer = { key: 'a'.repeat(64), href: `/players/${'a'.repeat(64)}`, displayName: 'Supplied public player', profileSlug: null, games: ['wardogs'], activity: [] };
const directory = (players: PublicLogiPlayer[], state: PublicPlayerDirectory['availability']['state'] = 'complete'): PublicPlayerDirectory => ({ players, availability: { state, enabledGames: state === 'disabled' ? [] : ['wardogs'], currentGames: state === 'complete' ? ['wardogs'] : [] } });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(readPublicPlayerStatistics).mockResolvedValue([]); });

describe('source player detail final publication fence', () => {
  it('does not render a player whose publication is lost during the statistics await', async () => {
    vi.mocked(readPublicLogiPlayerDirectory).mockResolvedValueOnce(directory([player])).mockResolvedValueOnce(directory([]));
    await expect(PlayerProfileScreen({ locale: 'en', playerKey: player.key, game: 'wardogs' })).rejects.toThrow('NOT_FOUND');
    expect(readPublicLogiPlayerDirectory).toHaveBeenCalledTimes(2);
    expect(readPublicLogiPlayerDirectory).toHaveBeenLastCalledWith({}, {}, { game: 'wardogs' });
    expect(readPublicPlayerStatistics).toHaveBeenCalledOnce();
    expect(vi.mocked(readPublicPlayerStatistics).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(readPublicLogiPlayerDirectory).mock.invocationCallOrder[1]!);
  });
  it('uses a newly approved exact profile route after the async boundary', async () => {
    vi.mocked(readPublicLogiPlayerDirectory).mockResolvedValueOnce(directory([player])).mockResolvedValueOnce(directory([{ ...player, profileSlug: 'approved-now', href: '/members/approved-now' }]));
    await expect(PlayerProfileScreen({ locale: 'cs', playerKey: player.key, game: null })).rejects.toThrow('REDIRECT:/cs/members/approved-now');
  });
  it.each(['unavailable', 'partial'] as const)('renders generic recovery for initial %s data with scoped retry/back, never a player or zero-game claim', async (state) => {
    vi.mocked(readPublicLogiPlayerDirectory).mockResolvedValue(directory([], state));
    const html = renderToStaticMarkup(await PlayerProfileScreen({ locale: 'en', playerKey: player.key, game: 'wardogs', query: { q: 'Alpha', page: '2' } }));
    expect(html).toContain('data-public-player-unavailable');
    expect(html).toContain(`href="/wardogs/players/${player.key}?q=Alpha&amp;page=2"`);
    expect(html).toContain('href="/wardogs/members?q=Alpha&amp;page=2"');
    expect(html).toContain('noindex, follow');
    expect(html).not.toContain('data-public-player-profile');
    expect(html).not.toContain(player.displayName);
    expect(html).not.toContain('statisticsMissing');
    expect(readPublicPlayerStatistics).not.toHaveBeenCalled();
    expect(readPublicLogiPlayerDirectory).toHaveBeenCalledOnce();
  });
  it.each(['unavailable', 'partial'] as const)('suppresses the earlier name and populated stats when the final observation becomes %s', async (state) => {
    vi.mocked(readPublicLogiPlayerDirectory).mockResolvedValueOnce(directory([player])).mockResolvedValueOnce(directory([], state));
    vi.mocked(readPublicPlayerStatistics).mockResolvedValue([{ game: 'wardogs', matches: 999, kills: 12345, deaths: 12, kd: 1028.75, cashDelta: 77, recentMatches: [], recentLimit: 30, observedAt: '2026-10-25T00:00:00Z' }]);
    const html = renderToStaticMarkup(await PlayerProfileScreen({ locale: 'en', playerKey: player.key, game: null }));
    expect(html).toContain('data-public-player-unavailable');
    expect(html).toContain('noindex, follow');
    expect(html).not.toContain(player.displayName);
    expect(html).not.toContain('data-public-player-statistics');
    expect(html).not.toContain('12345');
    expect(readPublicLogiPlayerDirectory).toHaveBeenCalledTimes(2);
  });
  it.each(['complete', 'disabled'] as const)('keeps a fresh unknown/withdrawn or %s-scope player absent as 404, including after recovery', async (state) => {
    vi.mocked(readPublicLogiPlayerDirectory).mockResolvedValueOnce(directory([], 'unavailable')).mockResolvedValueOnce(directory([], state));
    expect(renderToStaticMarkup(await PlayerProfileScreen({ locale: 'en', playerKey: player.key, game: 'wardogs' }))).toContain('data-public-player-unavailable');
    await expect(PlayerProfileScreen({ locale: 'en', playerKey: player.key, game: 'wardogs' })).rejects.toThrow('NOT_FOUND');
  });
  it('never reads or shows a temporary state for a malformed private/native identifier', async () => {
    await expect(PlayerProfileScreen({ locale: 'en', playerKey: 'private-native-id', game: null })).rejects.toThrow('NOT_FOUND');
    expect(readPublicLogiPlayerDirectory).not.toHaveBeenCalled();
  });
  it('marks initially unavailable metadata noindex without retaining a name', async () => {
    vi.mocked(readPublicLogiPlayerDirectory).mockResolvedValue(directory([], 'unavailable'));
    expect(await playerProfileMetadata('en', player.key, 'wardogs')).toEqual({ title: 'player.unavailableTitle', robots: { index: false, follow: true } });
  });
  it('keeps available route metadata generic so an initial name cannot remain in HTML after later withdrawal or outage', async () => {
    vi.mocked(readPublicLogiPlayerDirectory).mockResolvedValue(directory([player]));
    const metadata = await playerProfileMetadata('en', player.key, 'wardogs');
    expect(metadata.title).toBe('player.title');
    expect(JSON.stringify(metadata)).not.toContain(player.displayName);
  });
});
