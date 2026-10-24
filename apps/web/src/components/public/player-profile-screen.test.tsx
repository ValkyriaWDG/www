import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPublicLogiPlayers, type PublicLogiPlayer } from '@/modules/integrations/logi-public-players';
import { readPublicPlayerStatistics } from '@/modules/integrations/logi-public-player-statistics';
import { PlayerProfileScreen } from './player-profile-screen';

vi.mock('react', async (original) => ({ ...await original<typeof React>(), cache: <T,>(fn: T) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));
vi.mock('@/components/ui', () => ({ PageHeader: () => null, SectionFrame: () => null }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/env', () => ({ getServerEnv: () => ({}) }));
vi.mock('@/modules/integrations/logi-public-players', () => ({ readPublicLogiPlayers: vi.fn() }));
vi.mock('@/modules/integrations/logi-public-player-statistics', () => ({ readPublicPlayerStatistics: vi.fn() }));

const player: PublicLogiPlayer = { key: 'a'.repeat(64), href: `/players/${'a'.repeat(64)}`, displayName: 'Supplied public player', profileSlug: null, games: ['wardogs'], activity: [] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(readPublicPlayerStatistics).mockResolvedValue([]); });

describe('source player detail final publication fence', () => {
  it('does not render a player whose publication is lost during the statistics await', async () => {
    vi.mocked(readPublicLogiPlayers).mockResolvedValueOnce([player]).mockResolvedValueOnce([]);
    await expect(PlayerProfileScreen({ locale: 'en', playerKey: player.key, game: 'wardogs' })).rejects.toThrow('NOT_FOUND');
    expect(readPublicLogiPlayers).toHaveBeenCalledTimes(2);
    expect(readPublicLogiPlayers).toHaveBeenLastCalledWith({}, {}, { game: 'wardogs' });
    expect(readPublicPlayerStatistics).toHaveBeenCalledOnce();
    expect(vi.mocked(readPublicPlayerStatistics).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(readPublicLogiPlayers).mock.invocationCallOrder[1]!);
  });
  it('uses a newly approved exact profile route after the async boundary', async () => {
    vi.mocked(readPublicLogiPlayers).mockResolvedValueOnce([player]).mockResolvedValueOnce([{ ...player, profileSlug: 'approved-now', href: '/members/approved-now' }]);
    await expect(PlayerProfileScreen({ locale: 'cs', playerKey: player.key, game: null })).rejects.toThrow('REDIRECT:/cs/members/approved-now');
  });
});
