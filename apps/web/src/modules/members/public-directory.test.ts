import { describe, expect, it } from 'vitest';
import type { PublicMember } from './types';
import type { PublicLogiPlayer } from '@/modules/integrations/logi-public-players';
import { composePublicPlayerDirectory } from './public-directory';

const filters = { page: 1, pageSize: 24 };
const player = (i: number): PublicLogiPlayer => ({ key: String(i).padStart(64, '0'), href: `/players/${String(i).padStart(64, '0')}`, profileSlug: null, displayName: `Synthetic ${String(i).padStart(2, '0')}`, games: [i % 2 ? 'wardogs' : 'hell-let-loose'], activity: [] });
const profile: PublicMember = { slug: 'approved', displayName: 'Approved supplied name', games: ['wardogs'], avatar: null, publicRoleKeys: ['member'] };

describe('one editorial/source public player directory', () => {
  it('shows a whole source directory with no editorial profiles and pages the composed rows exactly once', () => {
    const players = Array.from({ length: 69 }, (_, i) => player(i));
    const keys = [1, 2, 3].flatMap((page) => composePublicPlayerDirectory([], players, [], { ...filters, page }).items.map((row) => row.key));
    expect(keys).toHaveLength(69);
    expect(new Set(keys).size).toBe(69);
    expect(composePublicPlayerDirectory([], players, [], filters)).toMatchObject({ total: 69, pageCount: 3 });
  });
  it('searches and scopes games before counting/paging, leaving unknown roles unassigned', () => {
    const players = Array.from({ length: 69 }, (_, i) => player(i));
    const found = composePublicPlayerDirectory([], players, [], { ...filters, q: 'synthetic 6', game: 'wardogs' });
    expect(found.total).toBe(4);
    expect(found.items.every((row) => row.games.includes('wardogs') && !row.publicRoleKeys.length)).toBe(true);
    expect(composePublicPlayerDirectory([], players, [], { ...filters, role: 'member' }).total).toBe(0);
  });
  it('deduplicates only an approved exact profile link while keeping same-name different people separate', () => {
    const linked = { ...player(0), displayName: 'Operational name', profileSlug: 'approved', href: '/members/approved', games: ['wardogs'] as const };
    const sameName = { ...player(1), displayName: profile.displayName };
    const page = composePublicPlayerDirectory([profile], [{ ...linked, games: [...linked.games] }, sameName], [], filters);
    expect(page.total).toBe(2);
    expect(page.items.filter((row) => row.profileSlug === 'approved')).toHaveLength(1);
    expect(page.items.filter((row) => row.displayName === profile.displayName)).toHaveLength(2);
  });
  it('prefers current canonical source activity per game while preserving approved activity of the other game', () => {
    const match = { href: '/wardogs/matches/canonical', title: 'Current canonical match', startsAt: null, squad: null, slot: 0, reserve: false };
    const linked = { ...player(1), profileSlug: profile.slug, activity: [{ game: 'wardogs' as const, observedAt: '2026-10-25T00:00:00Z', statistics: null, rosters: [match] }] };
    const page = composePublicPlayerDirectory([{ ...profile, games: ['wardogs', 'hell-let-loose'] }], [linked], [
      { profileSlug: profile.slug, game: 'wardogs', observedAt: '2026-10-25T00:00:00Z', matches: [{ ...match, href: '/wardogs/matches/logi/old-redirect' }] },
      { profileSlug: profile.slug, game: 'hell-let-loose', observedAt: '2026-10-25T00:00:00Z', matches: [{ ...match, href: '/hll/matches/logi/approved-hll', title: 'Approved HLL match' }] },
    ], filters);
    expect(page.items[0]!.matches.map((row) => row.href)).toEqual(['/wardogs/matches/canonical', '/hll/matches/logi/approved-hll']);
  });
});
