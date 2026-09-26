import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { getPathname, Link } from '@/i18n/navigation';
import styles from './admin-community.module.css';

export type SelectFilter = { name: string; label: string; value?: string; options: { value: string; label: string }[] };

type FilterFormProps = {
  /** Logical list path, e.g. `/admin/matches`; the form submits with GET so state stays in the URL. */
  action: string;
  label: string;
  search?: { label: string; placeholder?: string; value?: string };
  selects?: SelectFilter[];
  /** Inclusive local dates (Europe/Prague days). */
  dates?: { from?: string; to?: string };
  note?: string;
  error?: string;
  clearHref?: string | null;
  summary?: ReactNode;
};

/**
 * Labelled GET filter panel for admin lists: persistent labels, "All" as the empty
 * choice, an explicit Apply button and a Clear link; pagination resets on submit.
 */
export function FilterForm({ action, label, search, selects = [], dates, note, error, clearHref, summary }: FilterFormProps) {
  const t = useTranslations('adminCommunity.common');
  const locale = useLocale();
  const describedBy = error ? 'filter-error' : note ? 'filter-note' : undefined;
  return (
    <form className={styles.filterForm} method="get" action={getPathname({ href: action, locale })} role="search" aria-label={label} data-filter-form="">
      {search ? (
        <div className={`${styles.filterField} ${styles.filterSearch}`}>
          <label htmlFor="filter-q" className={styles.mediaLabel}>
            {search.label}
          </label>
          <input id="filter-q" name="q" type="search" className={styles.control} defaultValue={search.value} placeholder={search.placeholder} autoComplete="off" maxLength={100} />
        </div>
      ) : null}
      {selects.map((select) => (
        <div key={select.name} className={styles.filterField}>
          <label htmlFor={`filter-${select.name}`} className={styles.mediaLabel}>
            {select.label}
          </label>
          <select id={`filter-${select.name}`} name={select.name} className={styles.control} defaultValue={select.value ?? ''}>
            <option value="">{t('all')}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {dates ? (
        <>
          <div className={styles.filterField}>
            <label htmlFor="filter-from" className={styles.mediaLabel}>
              {t('dateFrom')}
            </label>
            <input id="filter-from" name="from" type="date" className={styles.control} defaultValue={dates.from} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
          </div>
          <div className={styles.filterField}>
            <label htmlFor="filter-to" className={styles.mediaLabel}>
              {t('dateTo')}
            </label>
            <input id="filter-to" name="to" type="date" className={styles.control} defaultValue={dates.to} aria-invalid={error ? true : undefined} aria-describedby={describedBy} />
          </div>
        </>
      ) : null}
      <div className={styles.filterButtons}>
        <button type="submit" className={styles.filterSubmit}>
          {t('applyFilters')}
        </button>
        {clearHref ? (
          <Link href={clearHref} className={styles.filterClear}>
            {t('clearFilters')}
          </Link>
        ) : null}
      </div>
      {error ? (
        <p id="filter-error" className={`${styles.errorText} ${styles.gridWide} ${styles.filterNote}`} role="alert">
          {error}
        </p>
      ) : note || summary ? (
        <p id="filter-note" className={`${styles.actionNote} ${styles.gridWide} ${styles.filterNote}`}>
          {note}
          {note && summary ? ' · ' : null}
          {summary ? <span role="status">{summary}</span> : null}
        </p>
      ) : null}
    </form>
  );
}
