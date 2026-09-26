import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { getPathname, Link } from '@/i18n/navigation';
import { SearchIcon } from './icons';
import styles from './data.module.css';

export type FilterOption = { value: string; label: string; href: string; current: boolean };
export type FilterGroup = { name: string; label: string; options: FilterOption[] };

type FilterBarProps = {
  /** Logical list path (e.g. `/matches`); the search submits a GET form to it. */
  action: string;
  searchLabel: string;
  searchName?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  /** Other active filters preserved when the search is submitted. */
  hiddenParams?: Record<string, string>;
  /** Segmented filter links; the caller computes hrefs that reflect URL state. */
  filters?: FilterGroup[];
  /** Shown only when some filter is active. */
  resetHref?: string | null;
  /** Polite result summary (e.g. "12 zápasů"). */
  resultSummary?: ReactNode;
};

/** Server-friendly toolbar (reference 13): search + segmented filter links + reset, all in the URL. */
export function FilterBar({ action, searchLabel, searchName = 'q', searchValue, searchPlaceholder, hiddenParams, filters, resetHref, resultSummary }: FilterBarProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const searchId = `filter-${searchName}`;
  return (
    <div className={styles.filterBar}>
      <form className={styles.search} action={getPathname({ href: action, locale })} method="get" role="search">
        {Object.entries(hiddenParams ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label htmlFor={searchId} className="visually-hidden">
          {searchLabel}
        </label>
        <SearchIcon size={18} className={styles.searchIcon} />
        <input id={searchId} className={styles.searchInput} type="search" name={searchName} defaultValue={searchValue} placeholder={searchPlaceholder} autoComplete="off" />
        <button type="submit" className={styles.filterButton}>
          {t('actions.search')}
        </button>
      </form>
      {filters?.map((group) => (
        <div key={group.name} className={styles.segment} role="group" aria-label={group.label}>
          {group.options.map((option) => (
            <Link key={option.value} href={option.href} className={styles.filterButton} aria-current={option.current ? 'true' : undefined} data-filter={`${group.name}:${option.value}`}>
              {option.label}
            </Link>
          ))}
        </div>
      ))}
      {resetHref ? (
        <Link href={resetHref} className={styles.filterReset}>
          {t('actions.resetFilters')}
        </Link>
      ) : null}
      {resultSummary ? (
        <p className={styles.resultSummary} role="status">
          {resultSummary}
        </p>
      ) : null}
    </div>
  );
}
