'use client';

import { useLocale } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { SearchIcon } from '@/components/ui/icons';
import { getPathname, useRouter } from '@/i18n/navigation';
import styles from './manual.module.css';

export const MANUAL_SEARCH_DEBOUNCE_MS = 250;

type ManualSearchProps = {
  /** Logical list path, e.g. `/hll/field-manual`. */
  action: string;
  /** Current query from the URL (authoritative state). */
  query: string;
  /** Active category preserved while searching. */
  category?: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  searchingLabel: string;
};

function hrefFor(action: string, q: string, category?: string): string {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  const search = params.toString();
  return search ? `${action}?${search}` : action;
}

/**
 * Field manual search: a plain GET form (works without JavaScript) enhanced with a
 * ~250 ms debounced URL update. The URL stays authoritative, so results are shareable
 * and survive refresh/history; a newer navigation supersedes an obsolete one and the
 * input keeps focus while results re-render on the server.
 */
export function ManualSearch({ action, query, category, label, placeholder, submitLabel, searchingLabel }: ManualSearchProps) {
  const locale = useLocale();
  const router = useRouter();
  const [value, setValue] = useState(query);
  const [sent, setSent] = useState(query);
  const [previousQuery, setPreviousQuery] = useState(query);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // History traversal or a link changed the URL: adopt it unless it echoes our own update.
  if (query !== previousQuery) {
    setPreviousQuery(query);
    if (query !== sent) {
      setValue(query);
      setSent(query);
    }
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const navigate = (raw: string, mode: 'push' | 'replace') => {
    const q = raw.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (q === sent) return;
    setSent(q);
    startTransition(() => {
      router[mode](hrefFor(action, q, category), { scroll: false });
    });
  };

  return (
    <form
      className={styles.search}
      action={getPathname({ href: action, locale })}
      method="get"
      role="search"
      aria-busy={pending || undefined}
      data-manual-search=""
      onSubmit={(event) => {
        event.preventDefault();
        navigate(value, 'push');
      }}
    >
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <label htmlFor="manual-search" className={styles.searchLabel}>
        {label}
      </label>
      <div className={styles.searchRow}>
        <SearchIcon size={18} className={styles.searchIcon} />
        <input
          id="manual-search"
          className={styles.searchInput}
          type="search"
          name="q"
          value={value}
          maxLength={80}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            if (timer.current) clearTimeout(timer.current);
            // The first keystrokes from the browse state add one history entry; refinements replace it.
            const mode = sent ? 'replace' : 'push';
            timer.current = setTimeout(() => navigate(next, mode), MANUAL_SEARCH_DEBOUNCE_MS);
          }}
        />
        <button type="submit" className={styles.searchButton}>
          {submitLabel}
        </button>
      </div>
      <p className={styles.searchStatus} aria-live="polite" data-manual-searching={pending || undefined}>
        {pending ? searchingLabel : ''}
      </p>
    </form>
  );
}
