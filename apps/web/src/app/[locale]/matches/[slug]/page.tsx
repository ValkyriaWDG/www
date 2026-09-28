import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ExternalLink } from '@/components/public/external-link';
import { viewForStatus } from '@/components/public/match-format';
import { MatchesScreen } from '@/components/public/matches-screen';
import { bilingualAlternates, OG_LOCALE, seoTitle } from '@/components/public/metadata';
import { isSlug, matchesListHref, parseMatchFilters } from '@/components/public/query';
import { getShellLinks } from '@/components/shell/shell-config';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import { routing, type AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { sharingMetadata } from '@/modules/social/metadata';
import { getPublicMatch } from '@/modules/matches/queries';

export const dynamicParams = true;

/** Published match only; unknown and draft matches are indistinguishable (null → 404). */
const loadMatch = cache(async (slug: string, locale: AppLocale) => (isSlug(slug) ? getPublicMatch(getDb(), slug, locale) : null));

export async function generateMetadata({ params }: PageProps<'/[locale]/matches/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const match = await loadMatch(slug, locale);
  if (!match) return {};
  const t = await getTranslations({ locale, namespace: 'matches' });
  const title = t('meta.detailTitle', { opponent: match.opponentName });
  const description = t('meta.detailDescription', {
    game: t(`games.${match.game}`),
    competition: [t(`competition.${match.competitionType}`), match.competitionName].filter(Boolean).join(' – '),
    date: formatDate(match.startsAt, locale, 'dateTimeZone'),
  });
  const alternates = bilingualAlternates(locale, `/matches/${match.slug}`);
  const site = await getTranslations({ locale, namespace: 'common.site' });
  const sharing = sharingMetadata(locale, 'matches', match.slug, match.updatedAt, title, description);
  return {
    title: seoTitle(title, site('name')),
    description,
    alternates,
    twitter: sharing.twitter,
    openGraph: {
      type: 'website',
      title,
      description,
      url: alternates.canonical as string,
      locale: OG_LOCALE[locale],
      images: sharing.images,
    },
  };
}

/**
 * Canonical match detail. At ≥1280 px it keeps the list context (the match's own view,
 * safe filters from the query) with this row selected and the detail pane beside it;
 * narrower screens get the standalone detail with a back link. Drafts/unknown → 404.
 */
export default async function MatchDetailPage({ params, searchParams }: PageProps<'/[locale]/matches/[slug]'>) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const match = await loadMatch(slug, locale);
  if (!match) notFound();
  const view = viewForStatus(match.status);
  const filters = { ...parseMatchFilters(await searchParams, view), view };
  const [t, links, external] = await Promise.all([
    getTranslations({ locale, namespace: 'matches' }),
    getShellLinks(),
    getTranslations({ locale, namespace: 'common.external' }),
  ]);
  return (
    <PageMain width="full" labelledBy="match-title">
      <PageHeader
        back={{ href: matchesListHref(filters), label: t('detail.back') }}
        eyebrow={`${t('detail.eyebrow')} // ${t(`games.${match.game}`)}`}
        title={t('meta.detailTitle', { opponent: match.opponentName })}
        titleId="match-title"
        actions={
          links.hllArchiveUrl ? (
            <ExternalLink href={links.hllArchiveUrl} externalLabel={external('suffix')} variant="button" data-hll-archive="">
              {t('list.hllArchive')}
            </ExternalLink>
          ) : undefined
        }
      />
      <MatchesScreen locale={locale} filters={filters} mode="detail" selected={match} />
    </PageMain>
  );
}
