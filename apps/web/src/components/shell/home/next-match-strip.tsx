import { getLocale, getTranslations } from 'next-intl/server';
import { formatWeekdayDateTime } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import styles from './home.module.css';

/** Public projection of the next published fixture (supplied by the matches module). */
export type NextMatch = {
  /** Logical localized path, e.g. `/matches/<slug>`. */
  href: string;
  opponent: string;
  game: 'wardogs' | 'hell-let-loose';
  /** ISO instant; displayed in Europe/Prague with an explicit zone. */
  startsAt: string;
  competition?: string | null;
};

/** Optional bottom-center teaser for a real published upcoming fixture; renders nothing otherwise. */
export async function NextMatchStrip({ match }: { match: NextMatch | null }) {
  if (!match) return null;
  const start = new Date(match.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const t = await getTranslations('home.nextMatch');
  const locale = await getLocale();
  return (
    <Link href={match.href} className={styles.nextMatch} data-next-match="">
      <span className={styles.nextLabel}>{t('label')}</span>
      <span className={styles.nextBody}>
        <span className={styles.nextOpponent}>{t('versus', { opponent: match.opponent })}</span>
        <span className={styles.nextMeta}>
          {t(`game.${match.game}`)}
          {match.competition ? ` · ${match.competition}` : ''}
          {' · '}
          <time dateTime={start.toISOString()}>{formatWeekdayDateTime(start, locale)}</time>
        </span>
      </span>
    </Link>
  );
}
