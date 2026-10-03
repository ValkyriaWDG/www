'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/admin/dialogs';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { FormActions, TextArea, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice, StatusBadge } from '@/components/ui/panels';
import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/result';
import type { TaxonomyTermDTO } from '@/modules/taxonomy/admin';
import { archiveTaxonomyTermAction, deleteTaxonomyTermAction, restoreTaxonomyTermAction, saveTaxonomyTermAction } from '@/modules/taxonomy/actions';
import { TAXONOMY_LIMITS, taxonomyScopePath, type TaxonomyScope } from '@/modules/taxonomy/scope';
import styles from './admin.module.css';
import local from './taxonomy.module.css';

type Values = { key: string; labelCs: string; labelEn: string; descriptionCs: string; descriptionEn: string; sortOrder: string };
type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title?: string; text: string; conflict?: boolean; reloading?: boolean } | null;
type Dialog = 'archive' | 'restore' | 'delete' | null;

const FIELD_ERROR_CODES = ['required', 'too_long', 'invalid_key', 'duplicate_key', 'invalid_number', 'out_of_range', 'invalid'] as const;
type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

function errorCode(value: string | undefined): FieldErrorCode | undefined {
  if (!value) return undefined;
  return (FIELD_ERROR_CODES as readonly string[]).includes(value) ? (value as FieldErrorCode) : 'invalid';
}

function valuesFrom(term: TaxonomyTermDTO | null): Values {
  return {
    key: term?.key ?? '',
    labelCs: term?.labelCs ?? '',
    labelEn: term?.labelEn ?? '',
    descriptionCs: term?.descriptionCs ?? '',
    descriptionEn: term?.descriptionEn ?? '',
    sortOrder: String(term?.sortOrder ?? 100),
  };
}

/**
 * Create/edit form of one category or tag. The key is fixed after creation; labels,
 * descriptions and order are saved explicitly with the loaded `updatedAt` as the
 * concurrency token. Failed saves keep the entered values; a conflict offers reloading the
 * stored version without losing the edits. Archive/restore/delete ask for confirmation and
 * state the consequence (assigned articles); a referenced term cannot be deleted.
 */
export function TaxonomyTermForm({ uiLocale, scope, term, gameLabel }: { uiLocale: AppLocale; scope: TaxonomyScope; term: TaxonomyTermDTO | null; gameLabel: string }) {
  const t = useTranslations('adminTaxonomy.form');
  const tStates = useTranslations('adminTaxonomy.states');
  const tCommon = useTranslations('adminEditorial.common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [stored, setStored] = useState<TaxonomyTermDTO | null>(term);
  const [prevTerm, setPrevTerm] = useState(term);
  if (term !== prevTerm) {
    // A refreshed server render (reload after a conflict, navigation) becomes the new stored base.
    setPrevTerm(term);
    setStored(term);
  }
  const [values, setValues] = useState<Values>(() => valuesFrom(term));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<'save' | 'archive' | 'restore' | 'delete' | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [finished, setFinished] = useState(false);

  const creating = stored === null;
  const manual = scope.scope === 'manual-category';
  const baseline = valuesFrom(stored);
  const dirty = !finished && JSON.stringify(values) !== JSON.stringify(baseline);
  const busy = pending !== null || finished;
  const set = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }));
  const fieldError = (name: keyof Values) => {
    const code = errorCode(fieldErrors[name]);
    return code ? t(`fieldErrors.${code}`) : null;
  };

  const fail = (failure: Extract<ActionResult<unknown>, { ok: false }>) => {
    setFieldErrors(failure.fieldErrors ?? {});
    if (failure.code === 'conflict' && failure.fieldErrors?._ === 'referenced') {
      setNotice({ kind: 'error', text: t('deleteReferenced') });
      return;
    }
    if (failure.code === 'conflict') {
      setNotice({ kind: 'warning', title: t('conflictTitle'), text: t('conflictBody'), conflict: true });
      return;
    }
    setNotice({ kind: 'error', text: tErrors(failure.code) });
  };

  const submit = async (): Promise<boolean> => {
    if (busy) return false;
    const sortOrder = /^\d+$/.test(values.sortOrder) ? Number.parseInt(values.sortOrder, 10) : Number.NaN;
    if (Number.isNaN(sortOrder)) {
      setFieldErrors({ sortOrder: 'invalid_number' });
      setNotice({ kind: 'error', text: tErrors('validation') });
      return false;
    }
    setPending('save');
    setNotice(null);
    const result = await saveTaxonomyTermAction({
      scope,
      id: stored?.id ?? null,
      ...(creating ? { key: values.key } : {}),
      labelCs: values.labelCs,
      labelEn: values.labelEn,
      descriptionCs: values.descriptionCs,
      descriptionEn: values.descriptionEn,
      sortOrder,
      ...(stored ? { expectedUpdatedAt: stored.updatedAt } : {}),
    }).catch(() => ({ ok: false as const, code: 'unavailable' as const, fieldErrors: undefined }));
    setPending(null);
    if (!result.ok) {
      fail(result);
      return false;
    }
    setFieldErrors({});
    if (creating) {
      setFinished(true);
      router.push(taxonomyScopePath(scope, result.data.id));
      return true;
    }
    setStored(result.data);
    setValues(valuesFrom(result.data));
    setNotice({ kind: 'success', text: t('saved') });
    startRefresh(() => router.refresh());
    return true;
  };
  useUnsavedChangesGuard(dirty && !busy, { onSaveRequest: submit });

  const reload = () => {
    setNotice({ kind: 'info', text: t('reloaded'), reloading: true });
    startRefresh(() => router.refresh());
  };

  const runState = async (kind: 'archive' | 'restore' | 'delete') => {
    if (!stored || busy) return;
    setPending(kind);
    setNotice(null);
    const input = { scope, id: stored.id };
    if (kind === 'delete') {
      const result = await deleteTaxonomyTermAction(input).catch(() => ({ ok: false as const, code: 'unavailable' as const, fieldErrors: undefined }));
      setPending(null);
      setDialog(null);
      if (!result.ok) return fail(result);
      setFinished(true);
      setNotice({ kind: 'success', text: t('deleted') });
      router.push('/admin/taxonomy');
      return;
    }
    const action = kind === 'archive' ? archiveTaxonomyTermAction : restoreTaxonomyTermAction;
    const result = await action(input).catch(() => ({ ok: false as const, code: 'unavailable' as const, fieldErrors: undefined }));
    setPending(null);
    setDialog(null);
    if (!result.ok) return fail(result);
    setStored(result.data);
    setNotice({ kind: 'success', text: t(kind === 'archive' ? 'archived' : 'restored') });
    startRefresh(() => router.refresh());
  };

  const label = uiLocale === 'cs' ? (stored?.labelCs ?? values.labelCs) : (stored?.labelEn ?? values.labelEn);
  const referenceCount = stored?.referenceCount ?? 0;

  return (
    <div className={styles.stack} data-testid="taxonomy-form-page">
      {notice ? (
        <FeedbackNotice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.conflict ? (
              <GameButton size="sm" intent="secondary" onClick={reload} pending={isRefreshing} pendingLabel={tCommon('working')} data-testid="taxonomy-reload">
                {t('reload')}
              </GameButton>
            ) : undefined
          }
        >
          {notice.reloading && isRefreshing ? tCommon('working') : notice.text}
        </FeedbackNotice>
      ) : null}

      <FeedbackNotice kind="info" title={t('semanticsTitle')} live={false}>
        {t(`semantics.${scope.scope}`)}
      </FeedbackNotice>

      <form
        className={`${styles.panel} ${styles.panelBody} ${styles.stack}`}
        noValidate
        aria-labelledby="taxonomy-form-title"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        data-testid="taxonomy-form"
        data-scope={scope.scope}
      >
        <h2 id="taxonomy-form-title" className="visually-hidden">
          {creating ? t(`newTitles.${scope.scope}`) : t(`titles.${scope.scope}`)}
        </h2>
        <dl className={local.facts} data-testid="taxonomy-facts">
          <dt>{t('scopeLabel')}</dt>
          <dd>{t(`scope.${scope.scope}`, { game: gameLabel })}</dd>
          {stored ? (
            <>
              <dt>{t('state')}</dt>
              <dd>
                <StatusBadge kind={stored.archived ? 'warning' : 'success'}>{stored.archived ? tStates('archived') : tStates('active')}</StatusBadge>
              </dd>
              <dt>{t('referencesLabel')}</dt>
              <dd data-testid="taxonomy-reference-count">{t('references', { count: referenceCount })}</dd>
            </>
          ) : null}
        </dl>
        <div className={local.formGrid}>
          <TextField
            name="key"
            id="taxonomy-key"
            label={t('key')}
            hint={creating ? t('keyHint') : t('keyLocked')}
            value={values.key}
            readOnly={!creating}
            disabled={busy}
            required={creating}
            maxLength={TAXONOMY_LIMITS.key}
            autoComplete="off"
            spellCheck={false}
            error={creating ? fieldError('key') : null}
            onChange={(event) => set({ key: event.target.value.toLowerCase() })}
            data-span=""
          />
          <TextField
            name="labelCs"
            id="taxonomy-label-cs"
            label={t('labelCs')}
            hint={t('labelHint')}
            lang="cs"
            value={values.labelCs}
            disabled={busy}
            required
            maxLength={TAXONOMY_LIMITS.label}
            error={fieldError('labelCs')}
            onChange={(event) => set({ labelCs: event.target.value })}
          />
          <TextField
            name="labelEn"
            id="taxonomy-label-en"
            label={t('labelEn')}
            hint={t('labelHint')}
            lang="en"
            value={values.labelEn}
            disabled={busy}
            required
            maxLength={TAXONOMY_LIMITS.label}
            error={fieldError('labelEn')}
            onChange={(event) => set({ labelEn: event.target.value })}
          />
          <TextArea
            name="descriptionCs"
            id="taxonomy-description-cs"
            label={t('descriptionCs')}
            hint={manual ? t('descriptionHintManual') : t('descriptionHintNews')}
            lang="cs"
            rows={3}
            value={values.descriptionCs}
            disabled={busy}
            markOptional
            maxLength={TAXONOMY_LIMITS.description}
            error={fieldError('descriptionCs')}
            onChange={(event) => set({ descriptionCs: event.target.value })}
          />
          <TextArea
            name="descriptionEn"
            id="taxonomy-description-en"
            label={t('descriptionEn')}
            hint={manual ? t('descriptionHintManual') : t('descriptionHintNews')}
            lang="en"
            rows={3}
            value={values.descriptionEn}
            disabled={busy}
            markOptional
            maxLength={TAXONOMY_LIMITS.description}
            error={fieldError('descriptionEn')}
            onChange={(event) => set({ descriptionEn: event.target.value })}
          />
          <TextField
            name="sortOrder"
            id="taxonomy-sort-order"
            label={t('sortOrder')}
            hint={manual ? t('sortOrderHintManual') : t('sortOrderHintNews')}
            inputMode="numeric"
            value={values.sortOrder}
            disabled={busy}
            required
            error={fieldError('sortOrder')}
            onChange={(event) => set({ sortOrder: event.target.value.replace(/[^0-9]/g, '').slice(0, 5) })}
          />
        </div>
        <FormActions sticky={false} status={pending === 'save' ? t('saving') : null}>
          <GameButton type="submit" intent="primary" pending={pending === 'save'} pendingLabel={t('saving')} disabled={busy} data-testid="taxonomy-save">
            {creating ? t('create') : t('save')}
          </GameButton>
        </FormActions>
      </form>

      {stored ? (
        <section className={`${local.section} ${local.dangerZone}`} aria-labelledby="taxonomy-danger-title" data-testid="taxonomy-danger">
          <div className={local.sectionHead}>
            <div>
              <h2 id="taxonomy-danger-title">{t('archiveTitle')}</h2>
              <p className={local.sectionLead}>{t('archiveLead')}</p>
            </div>
          </div>
          <div className={`${local.sectionBody} ${styles.stack}`}>
            {referenceCount > 0 ? (
              <FeedbackNotice kind="warning" live={false}>
                <span data-testid="taxonomy-delete-blocked">{t('deleteBlocked', { count: referenceCount })}</span>
              </FeedbackNotice>
            ) : null}
            <div className={local.buttonRow}>
              {stored.archived ? (
                <GameButton intent="secondary" onClick={() => setDialog('restore')} disabled={busy} data-testid="taxonomy-restore">
                  {t('restore')}
                </GameButton>
              ) : (
                <GameButton intent="secondary" onClick={() => setDialog('archive')} disabled={busy} data-testid="taxonomy-archive">
                  {t('archive')}
                </GameButton>
              )}
              <GameButton intent="danger" onClick={() => setDialog('delete')} disabled={busy || referenceCount > 0} aria-describedby={referenceCount > 0 ? 'taxonomy-delete-reason' : undefined} data-testid="taxonomy-delete">
                {t('delete')}
              </GameButton>
            </div>
            {referenceCount > 0 ? (
              <p id="taxonomy-delete-reason" className="visually-hidden">
                {t('deleteBlocked', { count: referenceCount })}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={dialog === 'archive'}
        title={t('confirmArchiveTitle', { label })}
        description={t('confirmArchiveBody', { count: referenceCount })}
        confirmLabel={t('archive')}
        intent="primary"
        pending={pending === 'archive'}
        onConfirm={() => void runState('archive')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'restore'}
        title={t('confirmRestoreTitle', { label })}
        description={t('confirmRestoreBody')}
        confirmLabel={t('restore')}
        intent="primary"
        pending={pending === 'restore'}
        onConfirm={() => void runState('restore')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title={t('confirmDeleteTitle', { label })}
        description={t('confirmDeleteBody', { key: stored?.key ?? values.key })}
        confirmLabel={t('delete')}
        intent="danger"
        pending={pending === 'delete'}
        onConfirm={() => void runState('delete')}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
