'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useState } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice, StatusBadge } from '@/components/ui/panels';
import { Checkbox, TextField } from '@/components/ui/form-fields';
import { SearchIcon } from '@/components/ui/icons';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { listAssetsAction } from '@/modules/media/actions';
import styles from './admin.module.css';
import { WideDialog } from './dialogs';
import { MediaUploader } from './media-uploader';

/** Asset chosen in the picker with the alt/caption confirmed for the content language. */
export type MediaPickerSelection = {
  assetId: string;
  width: number;
  height: number;
  /** Alternative text for the content language (empty only when `decorative`). */
  alt: string;
  caption: string;
  filename: string;
  /** Explicitly decorative image (empty alternative text). */
  decorative: boolean;
};

export type MediaPickerProps = {
  open: boolean;
  /** Media scope searched and uploaded into; enforced again by the server. */
  scope: 'editorial' | 'match';
  /** Content language whose library defaults prefill alt/caption. */
  locale: 'cs' | 'en';
  onSelect: (asset: MediaPickerSelection) => void;
  onClose: () => void;
  /** Offer "Upload image" inside the picker (default true; the server still authorizes). */
  allowUpload?: boolean;
  /** Dialog heading override (e.g. "Choose cover image"). */
  title?: string;
};

type PickerAsset = {
  id: string;
  originalFilename: string;
  width: number;
  height: number;
  defaultAlt: { cs: string; en: string };
  defaultCaption: { cs: string; en: string };
  usageCount: number;
  urls: { thumb: string };
};

const PAGE_SIZE = 18;

/**
 * Media-library picker dialog: search, paginated thumbnails, optional upload with
 * progress, then an explicit confirmation step where the alternative text (required
 * unless the image is decorative) and caption for the content language are reviewed.
 * Library defaults only prefill these fields; the caller stores them in its own draft.
 */
export function MediaPicker({ open, scope, locale, onSelect, onClose, allowUpload = true, title }: MediaPickerProps) {
  const t = useTranslations('media.picker');
  const tErrors = useTranslations('errors');
  const tLang = useTranslations('adminEditorial.common.languages');
  const uiLocale = useLocale() as AppLocale;
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const requestKey = `${scope}|${submitted}|${page}|${reload}`;
  const [result, setResult] = useState<{ key: string; data: { items: PickerAsset[]; pageCount: number; total: number } | null; error: string | null } | null>(null);
  const loading = open && result?.key !== requestKey;
  const data = result?.data ?? null;
  const error = loading ? null : (result?.error ?? null);
  const [selected, setSelected] = useState<PickerAsset | null>(null);
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [altError, setAltError] = useState(false);

  const choose = useCallback(
    (asset: PickerAsset) => {
      setSelected(asset);
      setAlt(asset.defaultAlt[locale] ?? '');
      setCaption(asset.defaultCaption[locale] ?? '');
      setDecorative(false);
      setAltError(false);
    },
    [locale],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listAssetsAction({ scope, q: submitted || undefined, page, pageSize: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        setResult((previous) =>
          response.ok
            ? { key: requestKey, data: { items: response.data.items, pageCount: response.data.pageCount, total: response.data.total }, error: null }
            : { key: requestKey, data: previous?.data ?? null, error: response.code },
        );
      })
      .catch(() => {
        if (!cancelled) setResult((previous) => ({ key: requestKey, data: previous?.data ?? null, error: 'unavailable' }));
      });
    return () => {
      cancelled = true;
    };
  }, [open, scope, submitted, page, requestKey]);

  const close = () => {
    setSelected(null);
    onClose();
  };

  const confirm = () => {
    if (!selected) return;
    if (!decorative && alt.trim() === '') {
      setAltError(true);
      return;
    }
    onSelect({
      assetId: selected.id,
      width: selected.width,
      height: selected.height,
      alt: decorative ? '' : alt.trim(),
      caption: caption.trim(),
      filename: selected.originalFilename,
      decorative,
    });
    setSelected(null);
  };

  return (
    <WideDialog
      open={open}
      onClose={close}
      title={title ?? t('title')}
      testId="media-picker"
      footer={
        <>
          <GameButton intent="secondary" onClick={close}>
            {t('cancel')}
          </GameButton>
          <GameButton intent="primary" onClick={confirm} disabled={!selected} data-testid="media-picker-confirm">
            {t('use')}
          </GameButton>
        </>
      }
    >
      <div className={styles.pickerLayout}>
        <div className={styles.stack}>
          {allowUpload ? (
            <MediaUploader
              scope={scope}
              locale={uiLocale}
              compact
              onUploaded={(asset) => {
                setSubmitted('');
                setQuery('');
                setPage(1);
                setReload((value) => value + 1);
                choose({
                  id: asset.id,
                  originalFilename: asset.originalFilename,
                  width: asset.width,
                  height: asset.height,
                  defaultAlt: asset.defaultAlt,
                  defaultCaption: asset.defaultCaption,
                  usageCount: 0,
                  urls: { thumb: asset.urls.thumb },
                });
              }}
            />
          ) : null}
          <form
            role="search"
            className={styles.row}
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSubmitted(query.trim());
            }}
          >
            <label htmlFor={searchId} className="visually-hidden">
              {t('search')}
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className={styles.titleInput}
              style={{ minHeight: 44, fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 400, flex: '1 1 14rem', width: 'auto' }}
            />
            <GameButton type="submit" intent="secondary" icon={<SearchIcon size={18} />}>
              {t('searchButton')}
            </GameButton>
          </form>
          {error ? (
            <FeedbackNotice kind="error" title={t('loadFailed')} action={<GameButton size="sm" onClick={() => setReload((value) => value + 1)}>{t('retry')}</GameButton>}>
              {tErrors(error as 'unexpected')}
            </FeedbackNotice>
          ) : null}
          <p className={`${styles.small} ${styles.muted}`} role="status" style={{ margin: 0 }}>
            {loading ? t('loading') : data ? t('count', { count: data.total }) : ''}
          </p>
          {data && data.items.length === 0 && !loading ? <p className={styles.muted}>{submitted ? t('noMatches') : t('empty')}</p> : null}
          {data && data.items.length > 0 ? (
            <ul className={styles.mediaGrid} aria-label={t('gridLabel')}>
              {data.items.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={styles.mediaCard}
                    aria-pressed={selected?.id === asset.id}
                    onClick={() => choose(asset)}
                    data-asset-id={asset.id}
                    style={{ width: '100%', textAlign: 'left', padding: 0, cursor: 'pointer' }}
                  >
                    <span className={styles.mediaThumb}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- authorized private thumbnail */}
                      <img src={asset.urls.thumb} alt="" loading="lazy" />
                    </span>
                    <span className={styles.mediaInfo}>
                      <span className={styles.mediaName}>{asset.originalFilename}</span>
                      <span className={styles.muted}>
                        {formatNumber(asset.width, uiLocale)} × {formatNumber(asset.height, uiLocale)} px
                      </span>
                      {asset.usageCount > 0 ? (
                        <span className={styles.mediaBadges}>
                          <StatusBadge kind="info">{t('inUse')}</StatusBadge>
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {data && data.pageCount > 1 ? (
            <div className={styles.row}>
              <GameButton size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                {t('previous')}
              </GameButton>
              <span className={styles.small}>{t('page', { page, total: data.pageCount })}</span>
              <GameButton size="sm" onClick={() => setPage((value) => Math.min(data.pageCount, value + 1))} disabled={page >= data.pageCount}>
                {t('next')}
              </GameButton>
            </div>
          ) : null}
        </div>
        <aside className={`${styles.panel} ${styles.panelBody}`} aria-label={t('selectionLabel')} data-testid="media-picker-selection">
          {selected ? (
            <div className={styles.stack}>
              {/* eslint-disable-next-line @next/next/no-img-element -- authorized private thumbnail */}
              <img src={selected.urls.thumb} alt="" className={styles.detailImage} />
              <p className={styles.small} style={{ margin: 0 }}>
                <strong>{selected.originalFilename}</strong>
                <br />
                {formatNumber(selected.width, uiLocale)} × {formatNumber(selected.height, uiLocale)} px
              </p>
              <p className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
                {t('textLanguage', { language: tLang(locale) })}
              </p>
              <TextField
                name="picker-alt"
                id="media-picker-alt"
                label={t('altLabel', { language: tLang(locale) })}
                hint={t('altHint')}
                value={alt}
                disabled={decorative}
                maxLength={300}
                required={!decorative}
                error={altError ? t('altRequired') : null}
                onChange={(event) => {
                  setAlt(event.target.value);
                  setAltError(false);
                }}
              />
              <Checkbox
                name="picker-decorative"
                id="media-picker-decorative"
                label={t('decorative')}
                checked={decorative}
                onChange={(event) => {
                  setDecorative(event.target.checked);
                  setAltError(false);
                }}
              />
              <TextField
                name="picker-caption"
                id="media-picker-caption"
                label={t('captionLabel', { language: tLang(locale) })}
                markOptional
                value={caption}
                maxLength={500}
                onChange={(event) => setCaption(event.target.value)}
              />
            </div>
          ) : (
            <p className={styles.muted} style={{ margin: 0 }}>
              {t('noSelection')}
            </p>
          )}
        </aside>
      </div>
    </WideDialog>
  );
}
