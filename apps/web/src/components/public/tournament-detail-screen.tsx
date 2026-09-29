import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { ExternalLink } from '@/components/public/external-link';
import { LocalizedProseView } from '@/components/public/localized-prose';
import { getMatchTranslations, MatchResult, MatchStart, MatchStatusBadge, MatchTeams } from '@/components/public/match-parts';
import { bilingualAlternates, OG_LOCALE, seoTitle } from '@/components/public/metadata';
import { isSlug } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader, StatusBadge } from '@/components/ui/panels';
import { SelectionTable } from '@/components/ui';
import { TrophyIcon } from '@/components/ui/icons';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { GAME_REGISTRY, gameRouteFromDb, type GameRoute } from '@/modules/games/registry';
import { canonicalMatchPath, canonicalTournamentPath, sectionBase } from '@/modules/games/routes';
import type { PublicMatchSummary } from '@/modules/matches/types';
import { sharingMetadata } from '@/modules/social/metadata';
import { getPublicTournament } from '@/modules/tournaments/queries';
import { getTournamentTranslations, PHASE_KIND, tournamentDates } from './tournaments-screen';
import matchStyles from './matches.module.css';
import { TagList } from './tags';
import styles from './tournaments.module.css';
import { ArchiveEditorial } from '@/components/content/archive-editorial';

/** Published tournament of `game` only; unknown, draft and other-game slugs are indistinguishable. */
const loadPublicTournament = cache(async (game: GameRoute, slug: string, locale: AppLocale) =>
  isSlug(slug) ? getPublicTournament(getDb(), GAME_REGISTRY[game].db, slug, locale) : null,
);

export async function tournamentDetailMetadata(locale: AppLocale, game: GameRoute, slug: string): Promise<Metadata> {
  const tournament = await loadPublicTournament(game, slug, locale);
  if (!tournament) return {};
  const [t, site] = await Promise.all([getTournamentTranslations(locale), getTranslations({ locale, namespace: 'common.site' })]);
  const title = [tournament.name, tournament.season].filter(Boolean).join(' · ');
  const description = [t('meta.description'), tournamentDates(tournament, locale, t)].join(' ');
  const alternates = bilingualAlternates(locale, canonicalTournamentPath(tournament.game, tournament.slug));
  const sharing = sharingMetadata(locale, 'matches', undefined, undefined, title, description, game);
  return {
    title: seoTitle(title, site('name')),
    description,
    alternates,
    twitter: sharing.twitter,
    openGraph: { type: 'website', title, description, url: alternates.canonical as string, locale: OG_LOCALE[locale], images: sharing.images },
  };
}

/**
 * Public tournament detail inside its game section: facts, links, the requested locale's
 * published description (rules, dated standings) and the published linked matches.
 */
export async function TournamentDetailScreen({ locale, game, slug }: { locale: AppLocale; game: GameRoute; slug: string }) {
  const tournament = await loadPublicTournament(game, slug, locale);
  if (!tournament) notFound();
  if (gameRouteFromDb(tournament.game) !== game) permanentRedirect(`/${locale}${canonicalTournamentPath(tournament.game, tournament.slug)}`);
  const [t, tMatch, games, external] = await Promise.all([
    getTournamentTranslations(locale),
    getMatchTranslations(locale),
    getTranslations({ locale, namespace: 'games' }),
    getTranslations({ locale, namespace: 'common.external' }),
  ]);
  const base = sectionBase(game);
  return (
    <PageMain width="full" labelledBy="tournament-title">
      <PageHeader
        breadcrumbs={[
          { href: base, label: games(`menuLabel.${game}`) },
          { href: `${base}/tournaments`, label: t('list.title') },
          { label: tournament.name },
        ]}
        eyebrow={games(`eyebrow.${game}`)}
        title={tournament.name}
        titleId="tournament-title"
        description={tournament.season ? <p>{tournament.season}</p> : undefined}
      />
      <div className={styles.detail} data-tournament-detail={tournament.slug}>
        <section className={styles.facts} aria-labelledby="tournament-facts">
          <span className={styles.cardEmblem} aria-hidden="true" data-tournament-emblem="">
            <TrophyIcon size={36} />
          </span>
          <h2 className={styles.groupTitle} id="tournament-facts">
            {t('detail.facts')}
          </h2>
          <dl className={styles.factList}>
            <div>
              <dt>{t('detail.phase')}</dt>
              <dd>
                <StatusBadge kind={PHASE_KIND[tournament.phase]}>
                  <span data-tournament-phase={tournament.phase}>{t(`phase.${tournament.phase}`)}</span>
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>{t('detail.dates')}</dt>
              <dd>{tournamentDates(tournament, locale, t)}</dd>
            </div>
            {tournament.organizer ? (
              <div>
                <dt>{t('detail.organizer')}</dt>
                <dd>{tournament.organizer}</dd>
              </div>
            ) : null}
          </dl>
          {tournament.links.length > 0 ? (
            <>
              <h3 className={styles.subTitle}>{t('detail.links')}</h3>
              <ul className={styles.links} data-tournament-links="">
                {tournament.links.map((link) => (
                  <li key={link.url}>
                    <ExternalLink href={link.url} externalLabel={external('suffix')}>
                      {link.label}
                    </ExternalLink>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section className={styles.body} aria-labelledby="tournament-description">
          <h2 className={styles.groupTitle} id="tournament-description">
            {t('detail.description')}
          </h2>
          {tournament.archiveEditorial ? <ArchiveEditorial details={tournament.archiveEditorial} locale={locale} /> : null}
          <LocalizedProseView
            prose={tournament.description}
            locale={locale}
            path={canonicalTournamentPath(tournament.game, tournament.slug)}
            labels={{
              missingTitle: t('detail.descriptionMissingTitle'),
              missingBody: t('detail.descriptionMissingBody'),
              none: t('detail.descriptionNone'),
              other: { cs: t('detail.otherCs'), en: t('detail.otherEn') },
            }}
          />
        </section>
      </div>
      <section className={styles.group} aria-labelledby="tournament-matches" data-tournament-matches="">
        <h2 className={styles.groupTitle} id="tournament-matches">
          {t('detail.matches')}
        </h2>
        {tournament.matches.length === 0 ? (
          <p className={styles.muted}>{t('detail.noMatches')}</p>
        ) : (
          <div className={matchStyles.table}>
            <SelectionTable<PublicMatchSummary>
              caption={t('detail.matches')}
              captionHidden
              rows={tournament.matches}
              getRowKey={(row) => row.slug}
              getRowHref={(row) => canonicalMatchPath(row.game, row.slug)}
              linkColumn="match"
              columns={[
                { key: 'start', header: tMatch('list.columns.start'), numeric: true, cell: (match) => <MatchStart match={match} locale={locale} t={tMatch} /> },
                { key: 'match', header: tMatch('list.columns.match'), rowHeader: true, cell: (match) => <MatchTeams match={match} t={tMatch} /> },
                {
                  key: 'competition',
                  header: tMatch('list.columns.competition'),
                  cell: (match) => (
                    <span className={matchStyles.competition}>
                      <TagList items={[{ key: 'type', label: tMatch(`competition.${match.competitionType}`) }]} />
                      {match.competitionName ? <span className={matchStyles.competitionName}>{match.competitionName}</span> : null}
                    </span>
                  ),
                },
                { key: 'status', header: tMatch('list.columns.status'), cell: (match) => <MatchStatusBadge match={match} t={tMatch} /> },
                { key: 'result', header: tMatch('list.columns.result'), align: 'end', numeric: true, cell: (match) => <MatchResult match={match} t={tMatch} variant="row" /> },
              ]}
            />
          </div>
        )}
      </section>
    </PageMain>
  );
}
