import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MatchesPage from '@/app/[locale]/(platform)/admin/matches/page';
import MembersPage from '@/app/[locale]/(platform)/admin/members/page';
import TournamentsPage from '@/app/[locale]/(platform)/admin/tournaments/page';
import { testPrincipal } from '@/modules/access/testing';

const mocks = vi.hoisted(() => ({ access: vi.fn(), matches: vi.fn(), members: vi.fn(), tournaments: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/i18n/navigation', () => ({ Link: 'a', useRouter: vi.fn() }));
vi.mock('@/modules/auth/admin-guard', () => ({ requireAdminPage: mocks.access, adminPageMetadata: vi.fn() }));
vi.mock('@/modules/matches/queries', () => ({ listMatchesForAdmin: mocks.matches }));
vi.mock('@/modules/members/queries', () => ({ listMembersForAdmin: mocks.members }));
vi.mock('@/modules/tournaments/queries', () => ({ listTournamentsForAdmin: mocks.tournaments }));

function disclosure(node: ReactNode, id: string): ReactElement<{ open: boolean }> | null {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; 'data-testid'?: string; open: boolean }>(child)) continue;
    if (child.type === 'details' && child.props['data-testid'] === id) return child;
    const found = disclosure(child.props.children, id);
    if (found) return found;
  }
  return null;
}

const pageProps = (query: Record<string, string | undefined> = {}) => ({ params: Promise.resolve({ locale: 'cs' }), searchParams: Promise.resolve(query) });

beforeEach(() => {
  mocks.access.mockResolvedValue({ ok: true, principal: testPrincipal(['administrator']) });
  for (const query of [mocks.matches, mocks.members, mocks.tournaments]) query.mockResolvedValue({ items: [], total: 0, page: 1, pageCount: 1 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('secondary archive and publication tools', () => {
  it('keeps match creation and historical records secondary on a normal visit', async () => {
    const tree = await MatchesPage(pageProps());
    expect(disclosure(tree, 'admin-match-archive')?.props.open).toBe(false);
    expect(mocks.access).toHaveBeenCalledWith({ locale: 'cs', path: '/admin/matches', capability: 'matches.edit' });
  });

  it.each([{ q: 'historical opponent' }, { page: '2' }, { deleted: '1' }])('opens the match archive for a direct archive workflow: %j', async (query) => {
    const tree = await MatchesPage(pageProps(query));
    expect(disclosure(tree, 'admin-match-archive')?.props.open).toBe(true);
  });

  it('never hides a match load failure inside a closed archive', async () => {
    mocks.matches.mockRejectedValueOnce(new Error('synthetic failure'));
    const tree = await MatchesPage(pageProps());
    expect(disclosure(tree, 'admin-match-archive')?.props.open).toBe(true);
  });

  it('keeps profile publication secondary, while opening direct filters and load failures', async () => {
    expect(disclosure(await MembersPage(pageProps()), 'admin-member-publication')?.props.open).toBe(false);
    expect(disclosure(await MembersPage(pageProps({ state: 'draft' })), 'admin-member-publication')?.props.open).toBe(true);
    mocks.members.mockRejectedValueOnce(new Error('synthetic failure'));
    expect(disclosure(await MembersPage(pageProps()), 'admin-member-publication')?.props.open).toBe(true);
    expect(mocks.access).toHaveBeenCalledWith({ locale: 'cs', path: '/admin/members', capability: 'members.edit' });
  });

  it('keeps tournament tools secondary and opens a failed load for immediate feedback', async () => {
    expect(disclosure(await TournamentsPage(pageProps()), 'admin-tournament-archive')?.props.open).toBe(false);
    mocks.tournaments.mockRejectedValueOnce(new Error('synthetic failure'));
    expect(disclosure(await TournamentsPage(pageProps()), 'admin-tournament-archive')?.props.open).toBe(true);
  });

  it('enforces each existing capability before reading archive or profile data', async () => {
    mocks.access.mockResolvedValue({ ok: false, denied: 'access-denied' });
    expect(await MatchesPage(pageProps())).toBe('access-denied');
    expect(await MembersPage(pageProps())).toBe('access-denied');
    expect(await TournamentsPage(pageProps())).toBe('access-denied');
    expect(mocks.matches).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
    expect(mocks.tournaments).not.toHaveBeenCalled();
  });
});
