'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { Checkbox, FormActions, Select, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice } from '@/components/ui/panels';
import { saveManualMetaAction } from '@/modules/field-manual/actions';
import type { ManualMeta } from '@/modules/field-manual/public';
import styles from './admin.module.css';

type Values = { sortOrder: string; sourceUrl: string; sourcePublishedOn: string; sourceLanguage: '' | 'cs' | 'sk' | 'en'; credits: string; markReviewed: boolean };

/**
 * Shared Field Manual metadata (not per language): ordering inside its category, the
 * provenance of imported mechanics and the last editorial review. Saved explicitly; the
 * server re-checks the article's game scope.
 */
export function ManualMetaForm({ documentId, initial, archived }: { documentId: string; initial: ManualMeta & { sortOrder: number }; archived: boolean }) {
  const t = useTranslations('adminEditorial.manual.meta');
  const tErrors = useTranslations('errors');
  const format = useFormatter();
  const [values, setValues] = useState<Values>({
    sortOrder: String(initial.sortOrder),
    sourceUrl: initial.sourceUrl ?? '',
    sourcePublishedOn: initial.sourcePublishedOn ?? '',
    sourceLanguage: (initial.sourceLanguage as Values['sourceLanguage']) ?? '',
    credits: initial.credits,
    markReviewed: false,
  });
  const [savedValues, setSavedValues] = useState<Values>(values);
  const [reviewedAt, setReviewedAt] = useState(initial.reviewedAt);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const dirty = !archived && JSON.stringify(values) !== JSON.stringify(savedValues);
  const disabled = archived || pending;
  const set = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }));

  const submit = async (): Promise<boolean> => {
    if (disabled) return false;
    setPending(true);
    setStatus(null);
    const result = await saveManualMetaAction({
      documentId,
      sortOrder: Number.parseInt(values.sortOrder, 10) || 0,
      sourceUrl: values.sourceUrl,
      sourcePublishedOn: values.sourcePublishedOn,
      sourceLanguage: values.sourceLanguage || null,
      credits: values.credits,
      markReviewed: values.markReviewed,
    }).catch(() => ({ ok: false as const, code: 'unavailable' as const, fieldErrors: undefined }));
    setPending(false);
    if (result.ok) {
      setFieldErrors({});
      if (values.markReviewed) setReviewedAt(new Date());
      const saved = { ...values, markReviewed: false };
      setValues(saved);
      setSavedValues(saved);
      setStatus({ kind: 'success', message: t('saved') });
      return true;
    }
    setFieldErrors(result.fieldErrors ?? {});
    setStatus({ kind: 'error', message: tErrors(result.code as 'unexpected') });
    return false;
  };
  useUnsavedChangesGuard(dirty, { onSaveRequest: submit });

  return (
    <form
      className={styles.panel}
      noValidate
      aria-labelledby="manual-meta-title"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      data-testid="manual-meta-form"
    >
      <h2 id="manual-meta-title" className={styles.panelTitle}>
        {t('title')}
      </h2>
      <div className={`${styles.panelBody} ${styles.stack}`}>
        <p className={styles.lead}>{t('lead')}</p>
        {status ? (
          <FeedbackNotice kind={status.kind} live>
            {status.message}
          </FeedbackNotice>
        ) : null}
        <TextField
          name="sortOrder"
          id="manual-sort-order"
          label={t('sortOrder')}
          hint={t('sortOrderHint')}
          inputMode="numeric"
          value={values.sortOrder}
          disabled={disabled}
          onChange={(event) => set({ sortOrder: event.target.value.replace(/[^0-9]/g, '').slice(0, 5) })}
        />
        <TextField
          name="sourceUrl"
          id="manual-source-url"
          label={t('sourceUrl')}
          hint={t('sourceUrlHint')}
          type="url"
          value={values.sourceUrl}
          disabled={disabled}
          error={fieldErrors.sourceUrl ? t('invalidUrl') : null}
          onChange={(event) => set({ sourceUrl: event.target.value })}
        />
        <TextField
          name="sourcePublishedOn"
          id="manual-source-date"
          label={t('sourceDate')}
          type="date"
          value={values.sourcePublishedOn}
          disabled={disabled}
          error={fieldErrors.sourcePublishedOn ? t('invalidDate') : null}
          onChange={(event) => set({ sourcePublishedOn: event.target.value })}
        />
        <Select
          name="sourceLanguage"
          id="manual-source-language"
          label={t('sourceLanguage')}
          value={values.sourceLanguage}
          disabled={disabled}
          onChange={(event) => set({ sourceLanguage: event.target.value as Values['sourceLanguage'] })}
          options={[
            { value: '', label: t('languages.none') },
            { value: 'cs', label: t('languages.cs') },
            { value: 'sk', label: t('languages.sk') },
            { value: 'en', label: t('languages.en') },
          ]}
        />
        <TextField
          name="credits"
          id="manual-credits"
          label={t('credits')}
          hint={t('creditsHint')}
          maxLength={500}
          value={values.credits}
          disabled={disabled}
          onChange={(event) => set({ credits: event.target.value })}
        />
        <Checkbox
          name="markReviewed"
          id="manual-reviewed"
          label={t('markReviewed')}
          hint={reviewedAt ? t('reviewedAt', { date: format.dateTime(new Date(reviewedAt), { dateStyle: 'medium' }) }) : t('neverReviewed')}
          checked={values.markReviewed}
          disabled={disabled}
          onChange={(event) => set({ markReviewed: event.target.checked })}
        />
        <FormActions sticky={false} status={pending ? t('saving') : null}>
          <GameButton type="submit" intent="secondary" pending={pending} pendingLabel={t('saving')} disabled={disabled} data-testid="manual-meta-save">
            {t('save')}
          </GameButton>
        </FormActions>
      </div>
    </form>
  );
}
