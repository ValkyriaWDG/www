import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { LocalizedProseView } from '@/components/public/localized-prose';
import { MemberAvatar } from '@/components/public/member-avatar';
import styles from '@/components/public/members.module.css';
import { bilingualAlternates, OG_LOCALE } from '@/components/public/metadata';
import { isSlug, membersListHref, parseMemberFilters, type RawSearchParams } from '@/components/public/query';
import { TagList } from '@/components/public/tags';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader, SectionFrame } from '@/components/ui/panels';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { readPublicLogiMemberEnrichment } from '@/modules/integrations/logi-people';
import { PublicLogiMemberActivity } from './logi-people';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import { getPublicMember } from '@/modules/members/queries';
import { sharingMetadata } from '@/modules/social/metadata';

/** Published + consented profile only; draft, hidden and unknown are indistinguishable (null). */
const loadMember = cache(async (slug: string, locale: AppLocale) => (isSlug(slug, 80) ? getPublicMember(getDb(), slug, locale) : null));

/** The profile when visible in this scope: any public profile on the shared route, else only an affiliated one. */
async function loadScopedMember(slug: string, locale: AppLocale, game: GameRoute | null) {
  const member = await loadMember(slug, locale);
  if (!member) return null;
  if (game && !member.games.includes(GAME_REGISTRY[game].db)) return null;
  return member;
}

/**
 * One member is one identity with scoped affiliations: game sections show the same
 * profile in their frame, while the canonical URL stays the shared `/members/<slug>`.
 */
export async function memberProfileMetadata(locale: AppLocale, slug: string, game: GameRoute | null): Promise<Metadata> {
  const member = await loadScopedMember(slug, locale, game);
  if (!member) return {};
  const t = await getTranslations({ locale, namespace: 'members.meta' });
  const description = t('profileDescription', { name: member.displayName });
  const alternates = bilingualAlternates(locale, `/members/${member.slug}`);
  const sharing = sharingMetadata(locale, 'site', undefined, undefined, member.displayName, description);
  return {
    title: member.displayName,
    description,
    alternates,
    openGraph: { type: 'profile', title: member.displayName, description, url: alternates.canonical as string, locale: OG_LOCALE[locale], images: sharing.images },
    twitter: sharing.twitter,
  };
}

/**
 * Public member profile: approved avatar, name exactly as stored (full length), public
 * role and game labels, and the biography published in this locale or an explicit
 * localized absence with a link to the published source-language version.
 */
export async function MemberProfileScreen({ locale, slug, game, query }: { locale: AppLocale; slug: string; game: GameRoute | null; query: RawSearchParams | undefined }) {
  const member = await loadScopedMember(slug, locale, game);
  if (!member) notFound();
  const filters = parseMemberFilters(query);
  if (game) filters.game = undefined;
  const t = await getTranslations({ locale, namespace: 'members' });
  const activity = await readPublicLogiMemberEnrichment(getDb(), getServerEnv(), slug, { game: game ? GAME_REGISTRY[game].db : undefined });
  return (
    <PageMain width="reading" labelledBy="member-title">
      <PageHeader
        back={{ href: membersListHref(filters, sectionBase(game)), label: t('profile.back') }}
        eyebrow={t('profile.eyebrow')}
        title={
          <span className={styles.name} data-member-full-name="">
            {member.displayName}
          </span>
        }
        titleId="member-title"
      />
      <section className={styles.profile} aria-label={t('profile.eyebrow')} data-member-profile={member.slug}>
        <MemberAvatar avatar={member.avatar} name={member.displayName} size="lg" />
        <dl className={styles.facts}>
          <div>
            <dt>{t('profile.rolesLabel')}</dt>
            <dd>
              {member.publicRoleKeys.length > 0 ? (
                <TagList items={member.publicRoleKeys.map((role) => ({ key: role, label: t(`roles.${role}`) }))} />
              ) : (
                t('list.noRoles')
              )}
            </dd>
          </div>
          <div>
            <dt>{t('profile.gamesLabel')}</dt>
            <dd>
              {member.games.length > 0 ? (
                <TagList items={member.games.map((game) => ({ key: game, label: t(`games.${game}`), tone: 'game' as const }))} />
              ) : (
                t('list.noGames')
              )}
            </dd>
          </div>
        </dl>
      </section>
      <SectionFrame title={t('profile.biography')} titleId="member-bio">
        <LocalizedProseView
          prose={member.biography}
          locale={locale}
          path={`/members/${member.slug}`}
          labels={{
            missingTitle: t('profile.bioMissingTitle'),
            missingBody: t('profile.bioMissingBody'),
            none: t('profile.bioNone'),
            other: { cs: t('profile.bioOther.cs'), en: t('profile.bioOther.en') },
          }}
        />
      </SectionFrame>
      <PublicLogiMemberActivity locale={locale} items={activity} />
    </PageMain>
  );
}
