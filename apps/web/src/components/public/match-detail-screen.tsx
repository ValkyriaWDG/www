import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { GameSwitchNotice } from '@/components/games/switch-notice';
import { viewForStatus } from '@/components/public/match-format';
import { MatchesScreen } from '@/components/public/matches-screen';
import { bilingualAlternates, OG_LOCALE, seoTitle } from '@/components/public/metadata';
import { isSlug, matchesListHref, parseMatchFilters, type RawSearchParams } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { canonicalMatchPath, sectionBase } from '@/modules/games/routes';
import { sharingMetadata } from '@/modules/social/metadata';
import { getPublicMatch } from '@/modules/matches/queries';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import { LogiMatches } from './logi-matches';

/** Published match only; unknown and draft matches are indistinguishable (null → 404). */
export const loadPublicMatch = cache(async (slug: string, locale: AppLocale) => (isSlug(slug) ? getPublicMatch(getDb(), slug, locale) : null));

/** Canonical match URL of a published slug (shared legacy route → game section), or `null`. */
export async function canonicalMatchRedirect(locale: AppLocale, slug: string): Promise<string | null> {
  const match = await loadPublicMatch(slug, locale);
  return match ? `/${locale}${canonicalMatchPath(match.game, match.slug)}` : null;
}

export async function matchDetailMetadata(locale: AppLocale, slug: string, game: GameRoute): Promise<Metadata> {
  const match = await loadPublicMatch(slug, locale);
  if (!match || match.game !== GAME_REGISTRY[game].db) return {};
  const t = await getTranslations({ locale, namespace: 'matches' });
  const title = t('meta.detailTitle', { opponent: match.opponentName });
  const description = t('meta.detailDescription', {
    game: t(`games.${match.game}`),
    competition: [t(`competition.${match.competitionType}`), match.competitionName].filter(Boolean).join(' – '),
    date: formatDate(match.startsAt, locale, 'dateTimeZone'),
  });
  const alternates = bilingualAlternates(locale, canonicalMatchPath(match.game, match.slug));
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
 * Canonical match detail inside its game section. At ≥1280 px it keeps the list context
 * (the match's own view, safe filters from the query) with this row selected and the
 * detail pane beside it; narrower screens get the standalone detail with a back link.
 * Drafts/unknown → 404; a match of the other game redirects to its own section.
 */
export async function MatchDetailScreen({ locale, slug, game, query }: { locale: AppLocale; slug: string; game: GameRoute; query: RawSearchParams | undefined }) {
  const match = await loadPublicMatch(slug, locale);
  if (!match) notFound();
  if (match.game !== GAME_REGISTRY[game].db) permanentRedirect(`/${locale}${canonicalMatchPath(match.game, match.slug)}`);
  const view = viewForStatus(match.status);
  const filters = { ...parseMatchFilters(query, view), view, game: undefined };
  const base = sectionBase(game);
  const t = await getTranslations({ locale, namespace: 'matches' });
  const linked = (await getPublicLogiEvents(game)).filter((event) => event.archive?.slug === match.slug);
  return (
    <PageMain width="full" labelledBy="match-title">
      <PageHeader
        back={{ href: matchesListHref(filters, base), label: t('detail.back') }}
        eyebrow={`${t('detail.eyebrow')} // ${t(`games.${match.game}`)}`}
        title={t('meta.detailTitle', { opponent: match.opponentName })}
        titleId="match-title"
      />
      <GameSwitchNotice locale={locale} game={game} query={query} />
      {linked.length > 0 ? <LogiMatches locale={locale} events={linked} selected={linked[0]!} /> : null}
      <MatchesScreen locale={locale} filters={filters} mode="detail" selected={match} game={game} />
    </PageMain>
  );
}
