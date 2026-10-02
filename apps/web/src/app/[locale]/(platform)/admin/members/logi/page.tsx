import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LogiMemberLinkEditor } from '@/components/admin-community/logi-member-link-editor';
import { GameButton, PageHeader, Pagination } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { canForGame } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { GAME_REGISTRY, GAME_ROUTES } from '@/modules/games/registry';
import { readLogiMemberLinks } from '@/modules/integrations/logi-member-links';
import { readLogiMemberCandidates } from '@/modules/integrations/logi-people';
import { getMemberForAdmin, listMembersForAdmin } from '@/modules/members/queries';
import styles from '@/components/public/logi-people.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };
const PATH = '/admin/members/logi';
export default async function LogiMemberLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: PATH, capability: 'members.publish' });
  if (!access.ok) return access.denied;
  const query = await searchParams;
  const page = typeof query.page === 'string' && /^\d{1,5}$/.test(query.page) ? Math.max(1, Number(query.page)) : 1;
  const profileId = typeof query.profile === 'string' && /^[0-9a-f-]{36}$/i.test(query.profile) ? query.profile : null;
  const db = getDb();
  const t = await getTranslations({ locale, namespace: 'logiPeople' });
  const profiles = await listMembersForAdmin(db, access.principal, { page, pageSize: 50 });
  const profile = profileId ? await getMemberForAdmin(db, access.principal, profileId) : null;
  const links = profile ? await readLogiMemberLinks(db, access.principal, profile.id) : [];
  const games = profile
    ? GAME_ROUTES.filter(
        (game) =>
          (profile.games.includes(GAME_REGISTRY[game].db) || links.some((link) => link.game === game)) &&
          canForGame(access.principal, 'members.publish', GAME_REGISTRY[game].db),
      )
    : [];
  const candidates = await Promise.all(
    games.map((game) => readLogiMemberCandidates(db, getServerEnv(), access.principal, GAME_REGISTRY[game].db)),
  );
  return (
    <div className={styles.stack}>
      <PageHeader title={t('linkTitle')} description={t('linkDescription')} back={{ href: '/admin/members', label: t('members') }} />
      <form className={styles.form} action={`/${locale}${PATH}`}>
        <label>
          {t('profile')}
          <select name="profile" defaultValue={profile?.id ?? ''} required>
            <option value="">{t('chooseProfile')}</option>
            {profile && !profiles.items.some((p) => p.id === profile.id) ? <option value={profile.id}>{profile.displayName}</option> : null}
            {profiles.items.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName} · {row.slug}
              </option>
            ))}
          </select>
        </label>
        <GameButton type="submit">{t('loadProfile')}</GameButton>
      </form>
      <Pagination page={page} pageCount={profiles.pageCount} hrefForPage={(value) => `${PATH}?page=${value}`} />
      {profile ? (
        <>
          <h2>{profile.displayName}</h2>
          {games.map((game, index) => {
            const link = links.find((row) => row.game === game) ?? null;
            return (
              <LogiMemberLinkEditor
                key={`${profile.id}:${game}:${link?.version ?? 0}`}
                profileId={profile.id}
                game={game}
                candidates={candidates[index]!}
                link={link}
              />
            );
          })}
        </>
      ) : null}
    </div>
  );
}
