import { getTranslations } from 'next-intl/server';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, PageHeader, StatusBadge, type StatusKind } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { canonicalTournamentPath, sectionBase } from '@/modules/games/routes';
import { listPublicTournaments } from '@/modules/tournaments/queries';
import type { PublicTournamentSummary, TournamentPhase } from '@/modules/tournaments/types';
import { ListLoadError } from './list-load-error';
import styles from './tournaments.module.css';
import { ArchiveEditorial } from '@/components/content/archive-editorial';

export const PHASE_KIND: Record<TournamentPhase, StatusKind> = { ongoing: 'success', upcoming: 'info', finished: 'neutral', undated: 'neutral' };

export const getTournamentTranslations = (locale: AppLocale) => getTranslations({ locale, namespace: 'matches.tournaments' });
export type TournamentT = Awaited<ReturnType<typeof getTournamentTranslations>>;

/** "1. 9. 2026 – 30. 11. 2026", an open end or start, or "Dates not set". */
export function tournamentDates(item: Pick<PublicTournamentSummary, 'startsOn' | 'endsOn'>, locale: AppLocale, t: TournamentT): string {
  const day = (value: string) => formatDate(`${value}T12:00:00Z`, locale, 'date');
  if (item.startsOn && item.endsOn) return t('list.dates', { start: day(item.startsOn), end: day(item.endsOn) });
  if (item.startsOn) return t('list.from', { start: day(item.startsOn) });
  if (item.endsOn) return t('list.until', { end: day(item.endsOn) });
  return t('list.noDates');
}

function TournamentCard({ item, locale, t }: { item: PublicTournamentSummary; locale: AppLocale; t: TournamentT }) {
  const titleId = `tournament-${item.slug}`;
  return (
    <li className={styles.card} data-tournament-card={item.slug} data-phase={item.phase}>
      <article aria-labelledby={titleId}>
        <p className={styles.cardMeta}>
          <StatusBadge kind={PHASE_KIND[item.phase]}>{t(`phase.${item.phase}`)}</StatusBadge>
          {item.season ? <span>{item.season}</span> : null}
        </p>
        <h3 className={styles.cardTitle} id={titleId}>
          <Link href={canonicalTournamentPath(item.game, item.slug)} className={styles.cardLink}>
            {item.name}
          </Link>
        </h3>
        {item.archiveEditorial ? <ArchiveEditorial details={item.archiveEditorial} locale={locale} compact /> : null}
        <p className={styles.cardFacts}>
          <span>{tournamentDates(item, locale, t)}</span>
          <span>{t('list.matchCount', { count: item.matchCount })}</span>
          {item.organizer ? <span>{t('list.organizer', { name: item.organizer })}</span> : null}
        </p>
      </article>
    </li>
  );
}

/** Published tournaments of one game: current/upcoming first, then finished ones. */
export async function TournamentsScreen({ locale, game }: { locale: AppLocale; game: GameRoute }) {
  const [t, games] = await Promise.all([getTournamentTranslations(locale), getTranslations({ locale, namespace: 'games' })]);
  let items: PublicTournamentSummary[] | null = null;
  if (getServerEnv().DATABASE_URL) {
    try {
      items = await listPublicTournaments(getDb(), GAME_REGISTRY[game].db, new Date(), locale);
    } catch (error) {
      console.error('[tournaments] list query failed', error instanceof Error ? error.name : 'unknown');
    }
  } else items = [];
  const current = items?.filter((item) => item.phase !== 'finished') ?? [];
  const finished = items?.filter((item) => item.phase === 'finished') ?? [];
  return (
    <PageMain width="full" labelledBy="tournaments-title">
      <PageHeader
        breadcrumbs={[{ href: sectionBase(game), label: games(`menuLabel.${game}`) }, { label: t('list.title') }]}
        eyebrow={games(`eyebrow.${game}`)}
        title={t('list.title')}
        titleId="tournaments-title"
        description={<p>{t('list.intro', { game: games(`names.${game}`) })}</p>}
      />
      {items === null ? <ListLoadError message={t('list.loadError')} retryLabel={t('list.retry')} retryHref={`${sectionBase(game)}/tournaments`} /> : null}
      {items && items.length === 0 ? (
        <EmptyState title={t('list.emptyTitle')}>
          <p>{t('list.emptyBody')}</p>
        </EmptyState>
      ) : null}
      {[
        { key: 'current', label: t('list.current'), rows: current },
        { key: 'finished', label: t('list.finished'), rows: finished },
      ]
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <section key={group.key} className={styles.group} aria-labelledby={`tournaments-${group.key}`} data-tournament-group={group.key}>
            <h2 className={styles.groupTitle} id={`tournaments-${group.key}`}>
              {group.label}
            </h2>
            <ul className={styles.grid}>
              {group.rows.map((item) => (
                <TournamentCard key={item.slug} item={item} locale={locale} t={t} />
              ))}
            </ul>
          </section>
        ))}
    </PageMain>
  );
}
