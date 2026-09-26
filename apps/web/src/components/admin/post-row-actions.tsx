'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import {
  archiveDocumentAction,
  duplicateDocumentAction,
  publishTranslationAction,
  unarchiveDocumentAction,
  unpublishTranslationAction,
} from '@/modules/content/actions';
import type { TranslationAdminState } from '@/modules/content/types';
import styles from './admin.module.css';
import { isLive, publishIntent } from './state-labels';

type ContentLocale = 'cs' | 'en';

export type RowTranslation = { translationId: string; version: number; state: TranslationAdminState; liveSlug: string | null; title: string };

type Pending =
  | { kind: 'publish' | 'unpublish'; locale: ContentLocale }
  | { kind: 'archive' | 'unarchive' | 'duplicate' }
  | null;

/**
 * Per-row actions of the posts table. "Edit" is a direct link; the other actions open a
 * short dialog (no hover-only menus), each publication action names its language, and
 * destructive/public actions ask for confirmation. The server re-checks capability and
 * optimistic versions; a stale row reports the conflict and refreshes the list.
 */
export function PostRowActions({
  documentId,
  title,
  archived,
  documentVersion,
  translations,
  uiLocale,
  canPublish,
  basePath = '/admin/news',
  allowDuplicate = true,
  allowArchive = true,
}: {
  documentId: string;
  title: string;
  archived: boolean;
  documentVersion: number;
  translations: Partial<Record<ContentLocale, RowTranslation>>;
  uiLocale: AppLocale;
  canPublish: boolean;
  basePath?: string;
  allowDuplicate?: boolean;
  allowArchive?: boolean;
}) {
  const t = useTranslations('adminEditorial.rowActions');
  const tLang = useTranslations('adminEditorial.common.languages');
  const tCommon = useTranslations('adminEditorial.common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const run = async (action: NonNullable<Pending>) => {
    setBusy(true);
    setMessage(null);
    let result: { ok: true; data?: unknown } | { ok: false; code: string } | null = null;
    try {
      if (action.kind === 'publish' || action.kind === 'unpublish') {
        const target = translations[action.locale]!;
        const input = { translationId: target.translationId, expectedVersion: target.version };
        result = action.kind === 'publish' ? await publishTranslationAction(input) : await unpublishTranslationAction(input);
      } else if (action.kind === 'archive') {
        result = await archiveDocumentAction({ documentId, expectedDocumentVersion: documentVersion });
      } else if (action.kind === 'unarchive') {
        result = await unarchiveDocumentAction({ documentId, expectedDocumentVersion: documentVersion });
      } else {
        const duplicated = await duplicateDocumentAction({ documentId });
        if (duplicated.ok) {
          const first = duplicated.data.translations.cs ? 'cs' : 'en';
          router.push(`${basePath}/${duplicated.data.documentId}?lang=${first}`);
          return;
        }
        result = duplicated;
      }
    } catch {
      result = { ok: false, code: 'unavailable' };
    } finally {
      setBusy(false);
    }
    setConfirm(null);
    if (result?.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setMessage({ kind: 'error', text: tErrors((result?.code ?? 'unexpected') as 'unexpected') });
      if (result?.code === 'conflict') router.refresh();
    }
  };

  const confirmText = (action: NonNullable<Pending>) => {
    switch (action.kind) {
      case 'publish':
        return {
          title: publishIntent(translations[action.locale]?.state) === 'update' ? t('confirmUpdateTitle', { locale: action.locale }) : t('confirmPublishTitle', { locale: action.locale }),
          body: t('confirmPublishBody', { locale: action.locale }),
          label: publishIntent(translations[action.locale]?.state) === 'update' ? t('update', { locale: action.locale }) : t('publish', { locale: action.locale }),
        };
      case 'unpublish':
        return { title: t('confirmUnpublishTitle', { locale: action.locale }), body: t('confirmUnpublishBody', { locale: action.locale }), label: t('unpublish', { locale: action.locale }) };
      case 'archive':
        return { title: t('confirmArchiveTitle'), body: t('confirmArchiveBody'), label: t('archive') };
      case 'unarchive':
        return { title: t('confirmUnarchiveTitle'), body: t('confirmUnarchiveBody'), label: t('unarchive') };
      default:
        return { title: t('confirmDuplicateTitle'), body: t('confirmDuplicateBody'), label: t('duplicate') };
    }
  };

  const locales = (['cs', 'en'] as const).filter((locale) => translations[locale]);
  const firstLocale = locales[0] ?? 'cs';
  const pending = confirm ? confirmText(confirm) : null;

  return (
    <div className={styles.rowActions}>
      <GameButton href={`${basePath}/${documentId}?lang=${firstLocale}`} size="sm" intent="secondary" data-testid="row-edit">
        {t('edit')}
      </GameButton>
      <GameButton size="sm" intent="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="row-actions">
        {t('more')}
        <span className="visually-hidden">: {title}</span>
      </GameButton>
      <ModalDialog
        open={open}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            setConfirm(null);
            setMessage(null);
          }
        }}
        dismissible={!busy}
        title={pending ? pending.title : t('dialogTitle')}
        description={pending ? pending.body : title}
        actions={
          pending ? (
            <>
              <GameButton intent="secondary" onClick={() => setConfirm(null)} disabled={busy}>
                {tCommon('back')}
              </GameButton>
              <GameButton intent={confirm?.kind === 'archive' || confirm?.kind === 'unpublish' ? 'danger' : 'primary'} onClick={() => confirm && void run(confirm)} pending={busy} pendingLabel={tCommon('working')} data-testid="row-confirm">
                {pending.label}
              </GameButton>
            </>
          ) : (
            <GameButton intent="secondary" onClick={() => setOpen(false)}>
              {tCommon('close')}
            </GameButton>
          )
        }
      >
        {message ? (
          <p role="alert" className={message.kind === 'error' ? styles.danger : undefined} style={{ margin: 0 }} data-testid="row-error">
            {message.text}
          </p>
        ) : null}
        {!pending ? (
          <div className={styles.stack}>
            {locales.map((locale) => {
              const entry = translations[locale]!;
              return (
                <div key={locale} className={styles.stack} style={{ gap: 6 }} data-row-locale={locale}>
                  <strong>
                    {tLang(locale)} ({locale.toUpperCase()})
                  </strong>
                  <div className={styles.buttonRow}>
                    <GameButton href={`${basePath}/${documentId}?lang=${locale}`} size="sm" intent="secondary">
                      {t('editLocale', { locale })}
                    </GameButton>
                    <a className={styles.inlineButton} href={`/${uiLocale}${basePath}/${documentId}/preview?lang=${locale}`} target="_blank" rel="noopener">
                      {t('preview', { locale })}
                    </a>
                    {canPublish && !archived ? (
                      <GameButton size="sm" intent="primary" onClick={() => setConfirm({ kind: 'publish', locale })} data-testid={`row-publish-${locale}`}>
                        {publishIntent(entry.state) === 'update' ? t('update', { locale }) : t('publish', { locale })}
                      </GameButton>
                    ) : null}
                    {canPublish && isLive(entry.state) ? (
                      <GameButton size="sm" intent="danger" onClick={() => setConfirm({ kind: 'unpublish', locale })} data-testid={`row-unpublish-${locale}`}>
                        {t('unpublish', { locale })}
                      </GameButton>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className={styles.buttonRow}>
              {allowDuplicate ? (
                <GameButton size="sm" intent="secondary" onClick={() => setConfirm({ kind: 'duplicate' })} data-testid="row-duplicate">
                  {t('duplicate')}
                </GameButton>
              ) : null}
              {allowArchive && canPublish ? (
                archived ? (
                  <GameButton size="sm" intent="secondary" onClick={() => setConfirm({ kind: 'unarchive' })} data-testid="row-unarchive">
                    {t('unarchive')}
                  </GameButton>
                ) : (
                  <GameButton size="sm" intent="danger" onClick={() => setConfirm({ kind: 'archive' })} data-testid="row-archive">
                    {t('archive')}
                  </GameButton>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}
