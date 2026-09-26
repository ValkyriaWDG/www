import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { AdminTranslationRow } from '@/modules/content/types';
import styles from './admin.module.css';
import { translationStatus } from './state-labels';

/**
 * One language's state in admin lists: composite status badge (UI locale), scheduled
 * time and an explicit overdue/blocked/failed warning. A missing translation says so.
 */
export function TranslationStateCell({ translation, uiLocale, contentLocale }: { translation: AdminTranslationRow | undefined; uiLocale: AppLocale; contentLocale: 'cs' | 'en' }) {
  const t = useTranslations('adminEditorial');
  const view = translationStatus(translation);
  return (
    <div className={styles.stateCell} data-testid={`state-${contentLocale}`} data-state={view.key} data-warning={view.warning ?? undefined}>
      <StatusBadge kind={view.kind}>{t(`states.${view.key}`)}</StatusBadge>
      {translation?.schedule ? (
        <span className={styles.stateNote}>{t('list.scheduledFor', { time: formatDate(translation.schedule.dueAt, uiLocale, 'dateTimeZone') })}</span>
      ) : null}
      {view.warning ? <span className={view.warning === 'overdue' ? styles.warning : styles.danger}>{t(`warnings.${view.warning}`)}</span> : null}
    </div>
  );
}
