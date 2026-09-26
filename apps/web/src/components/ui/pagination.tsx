import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { paginationWindow } from './pagination-window';
import styles from './data.module.css';

/** Link-based pagination with `aria-current="page"` and a localized "Page X of Y" status. */
export function Pagination({ page, pageCount, hrefForPage }: { page: number; pageCount: number; hrefForPage: (page: number) => string }) {
  const t = useTranslations('common.pagination');
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(1, page), pageCount);
  return (
    <nav className={styles.pagination} aria-label={t('label')}>
      <p className={styles.paginationStatus}>{t('status', { page: current, total: pageCount })}</p>
      <ul className={styles.paginationList}>
        <li>
          {current > 1 ? (
            <Link href={hrefForPage(current - 1)} className={styles.pageLink} rel="prev">
              <ChevronLeftIcon size={18} />
              <span>{t('previous')}</span>
            </Link>
          ) : (
            <span className={styles.pageLink} aria-disabled="true">
              <ChevronLeftIcon size={18} />
              <span>{t('previous')}</span>
            </span>
          )}
        </li>
        {paginationWindow(current, pageCount).map((value, index) =>
          value === null ? (
            <li key={`gap-${index}`} className={styles.pageGap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={value}>
              <Link href={hrefForPage(value)} className={styles.pageLink} aria-current={value === current ? 'page' : undefined} aria-label={t('goTo', { page: value })}>
                {value}
              </Link>
            </li>
          ),
        )}
        <li>
          {current < pageCount ? (
            <Link href={hrefForPage(current + 1)} className={styles.pageLink} rel="next">
              <span>{t('next')}</span>
              <ChevronRightIcon size={18} />
            </Link>
          ) : (
            <span className={styles.pageLink} aria-disabled="true">
              <span>{t('next')}</span>
              <ChevronRightIcon size={18} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
