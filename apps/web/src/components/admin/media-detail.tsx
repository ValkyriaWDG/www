'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { TextArea, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice, StatusBadge } from '@/components/ui/panels';
import { formatDate, formatNumber } from '@/i18n/date-format';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { deleteAssetAction, updateAssetMetadataAction } from '@/modules/media/actions';
import type { AssetDetailDTO } from '@/modules/media/library';
import styles from './admin.module.css';
import { ConfirmDialog } from './dialogs';

type Metadata = { defaultAltCs: string; defaultAltEn: string; defaultCaptionCs: string; defaultCaptionEn: string; provenance: string; rights: string };

function metadataOf(asset: AssetDetailDTO): Metadata {
  return {
    defaultAltCs: asset.defaultAlt.cs,
    defaultAltEn: asset.defaultAlt.en,
    defaultCaptionCs: asset.defaultCaption.cs,
    defaultCaptionEn: asset.defaultCaption.en,
    provenance: asset.provenance,
    rights: asset.rights,
  };
}

/**
 * Detail panel of one library asset: preview, facts, usage references, editable library
 * defaults (alt/caption per language, provenance, rights) and guarded deletion. Library
 * defaults never change text already stored in drafts or published revisions.
 */
export function MediaDetail({ asset, uiLocale, closeHref }: { asset: AssetDetailDTO; uiLocale: AppLocale; closeHref: string }) {
  const t = useTranslations('media.detail');
  const tScope = useTranslations('media.scopes');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [values, setValues] = useState<Metadata>(() => metadataOf(asset));
  const [saved, setSaved] = useState<Metadata>(() => metadataOf(asset));
  const [pending, setPending] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const dirty = (Object.keys(values) as (keyof Metadata)[]).some((key) => values[key] !== saved[key]);
  useUnsavedChangesGuard(dirty, {
    onSaveRequest: async () => save(),
  });

  const set = (key: keyof Metadata, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function save(): Promise<boolean> {
    setPending('save');
    setNotice(null);
    const result = await updateAssetMetadataAction({ assetId: asset.id, ...values }).catch(() => ({ ok: false as const, code: 'unavailable' as const }));
    setPending(null);
    if (result.ok) {
      const next = { ...values };
      setSaved(next);
      setNotice({ kind: 'success', text: t('saved') });
      router.refresh();
      return true;
    }
    setNotice({ kind: 'error', text: tErrors(result.code as 'unexpected') });
    return false;
  }

  const remove = async () => {
    setPending('delete');
    const result = await deleteAssetAction({ assetId: asset.id }).catch(() => ({ ok: false as const, code: 'unavailable' as const }));
    setPending(null);
    setConfirmDelete(false);
    if (result.ok) {
      router.push(closeHref);
      router.refresh();
      return;
    }
    setNotice({ kind: 'error', text: result.code === 'in_use' ? t('inUseError') : tErrors(result.code as 'unexpected') });
  };

  const referenceLabel = (reference: AssetDetailDTO['references'][number]) => {
    const kind = t(`references.${reference.kind}`);
    const locale = reference.locale ? ` · ${reference.locale.toUpperCase()}` : '';
    return `${kind}${locale}`;
  };

  return (
    <aside className={styles.detail} aria-labelledby="media-detail-title" data-testid="media-detail" data-asset-id={asset.id}>
      <div className={`${styles.panel}`}>
        <h2 id="media-detail-title" className={styles.panelTitle}>
          {t('title')}
        </h2>
        <div className={`${styles.panelBody} ${styles.stack}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- authorized private preview via the media route */}
          <img
            src={asset.urls.full}
            alt={asset.defaultAlt[uiLocale] || ''}
            width={asset.variants?.full.width ?? asset.width}
            height={asset.variants?.full.height ?? asset.height}
            className={styles.detailImage}
          />
          <dl className={styles.facts}>
            <dt>{t('filename')}</dt>
            <dd data-testid="media-detail-filename">{asset.originalFilename}</dd>
            <dt>{t('dimensions')}</dt>
            <dd>
              {formatNumber(asset.width, uiLocale)} × {formatNumber(asset.height, uiLocale)} px · {asset.sourceFormat.toUpperCase()}
            </dd>
            <dt>{t('size')}</dt>
            <dd>{t('kilobytes', { size: formatNumber(Math.max(1, Math.round(asset.bytes / 1024)), uiLocale) })}</dd>
            <dt>{t('scope')}</dt>
            <dd>{tScope(asset.scope)}</dd>
            <dt>{t('uploaded')}</dt>
            <dd>
              {formatDate(asset.createdAt, uiLocale, 'dateTime')}
              {asset.owner?.name ? ` · ${asset.owner.name}` : ''}
            </dd>
            <dt>{t('usage')}</dt>
            <dd>
              {asset.usageCount > 0 ? (
                <StatusBadge kind={asset.publishedUse ? 'success' : 'info'}>{asset.publishedUse ? t('inUsePublished', { count: asset.usageCount }) : t('inUseDraft', { count: asset.usageCount })}</StatusBadge>
              ) : (
                <StatusBadge kind="neutral">{t('unused')}</StatusBadge>
              )}
            </dd>
          </dl>
          {asset.references.length > 0 ? (
            <div>
              <h3 className={styles.small} style={{ margin: '0 0 4px' }}>
                {t('referencesTitle')}
              </h3>
              <ul className={styles.referenceList} data-testid="media-references">
                {asset.references.map((reference, index) => (
                  <li key={`${reference.kind}-${reference.translationId ?? reference.entityId}-${index}`}>
                    {reference.kind === 'content' ? (
                      <Link className={styles.textLink} href={`/admin/news/${reference.entityId}?lang=${reference.locale ?? 'cs'}`}>
                        {referenceLabel(reference)}
                      </Link>
                    ) : (
                      <span>{referenceLabel(reference)}</span>
                    )}{' '}
                    <span className={styles.muted}>{reference.published ? t('references.published') : t('references.draft')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <form
        className={`${styles.panel} ${styles.panelBody} ${styles.stack}`}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        data-testid="media-metadata-form"
      >
        <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
          {t('defaultsNote')}
        </p>
        <TextField name="defaultAltCs" id="media-alt-cs" label={t('altCs')} value={values.defaultAltCs} maxLength={300} lang="cs" onChange={(event) => set('defaultAltCs', event.target.value)} />
        <TextField name="defaultAltEn" id="media-alt-en" label={t('altEn')} value={values.defaultAltEn} maxLength={300} lang="en" onChange={(event) => set('defaultAltEn', event.target.value)} />
        <TextField name="defaultCaptionCs" id="media-caption-cs" label={t('captionCs')} markOptional value={values.defaultCaptionCs} maxLength={500} lang="cs" onChange={(event) => set('defaultCaptionCs', event.target.value)} />
        <TextField name="defaultCaptionEn" id="media-caption-en" label={t('captionEn')} markOptional value={values.defaultCaptionEn} maxLength={500} lang="en" onChange={(event) => set('defaultCaptionEn', event.target.value)} />
        <TextArea name="provenance" id="media-provenance" label={t('provenance')} hint={t('provenanceHint')} rows={2} maxLength={500} value={values.provenance} onChange={(event) => set('provenance', event.target.value)} />
        <TextArea name="rights" id="media-rights" label={t('rights')} hint={t('rightsHint')} rows={2} maxLength={500} value={values.rights} onChange={(event) => set('rights', event.target.value)} />
        {notice ? (
          <FeedbackNotice kind={notice.kind === 'success' ? 'success' : 'error'} title={notice.text} />
        ) : null}
        <div className={styles.buttonRow} style={{ justifyContent: 'space-between' }}>
          <GameButton intent="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={pending !== null} data-testid="media-delete">
            {t('delete')}
          </GameButton>
          <GameButton type="submit" intent="primary" disabled={!dirty} pending={pending === 'save'} pendingLabel={t('saving')} data-testid="media-save">
            {t('save')}
          </GameButton>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title={t('deleteTitle')}
        description={asset.usageCount > 0 ? t('deleteInUseBody', { count: asset.usageCount }) : t('deleteBody', { name: asset.originalFilename })}
        confirmLabel={t('delete')}
        pending={pending === 'delete'}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </aside>
  );
}
