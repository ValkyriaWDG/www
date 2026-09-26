'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { RevisionSummary } from '@/modules/content/types';
import styles from './admin.module.css';

/**
 * Bounded revision history of one translation (newest first) with author, time and kind.
 * "Restore to draft" creates a NEW draft revision from the chosen one; the live version
 * changes only through an explicit publication.
 */
export function RevisionHistory({
  revisions,
  uiLocale,
  contentLocale,
  previewHref,
  disabled,
  busyRevisionId,
  onRestore,
}: {
  revisions: RevisionSummary[];
  uiLocale: AppLocale;
  contentLocale: 'cs' | 'en';
  previewHref: (revisionId: string) => string;
  disabled: boolean;
  busyRevisionId: string | null;
  onRestore: (revision: RevisionSummary) => void;
}) {
  const t = useTranslations('adminEditorial.revisions');
  if (revisions.length === 0) return <p className={styles.muted}>{t('empty')}</p>;
  return (
    <ol className={styles.revisionList} aria-label={t('listLabel', { locale: contentLocale })} data-testid="revision-list">
      {revisions.map((revision) => (
        <li key={revision.id} className={styles.revisionItem} data-testid="revision-item" data-revision-id={revision.id} data-kind={revision.kind}>
          <div className={styles.revisionHead}>
            <strong>{t(`kinds.${revision.kind}`)}</strong>
            {revision.isDraft ? <StatusBadge kind="accent">{t('currentDraft')}</StatusBadge> : null}
            {revision.isPublished ? <StatusBadge kind="success">{t('live')}</StatusBadge> : null}
            {revision.isScheduled ? <StatusBadge kind="info">{t('scheduled')}</StatusBadge> : null}
          </div>
          <span className={`${styles.small} ${styles.muted}`}>
            {t('byline', { author: revision.createdByLabel || t('unknownAuthor'), time: formatDate(revision.createdAt, uiLocale, 'dateTime') })}
          </span>
          <span className={styles.small} lang={contentLocale}>
            {revision.title || t('untitled')}
          </span>
          <div className={styles.buttonRow}>
            <a className={styles.inlineButton} href={previewHref(revision.id)} target="_blank" rel="noopener" data-testid="revision-preview">
              {t('preview')}
            </a>
            {!revision.isDraft ? (
              <button type="button" className={styles.inlineButton} onClick={() => onRestore(revision)} disabled={disabled || busyRevisionId !== null} aria-busy={busyRevisionId === revision.id || undefined} data-testid="revision-restore">
                {t('restore')}
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
