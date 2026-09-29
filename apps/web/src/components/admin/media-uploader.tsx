'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { UploadIcon } from '@/components/ui/icons';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import styles from './admin.module.css';
import { uploadImageFile, type UploadedAsset, type UploadScope } from './upload';

type UploadItem = {
  id: string;
  name: string;
  state: 'uploading' | 'processing' | 'ready' | 'failed';
  progress: number;
  code: string | null;
};

/** Upload error codes with dedicated localized messages (`media.errors.<code>`). */
const MESSAGE_CODES = [
  'validation',
  'unsupported_media',
  'payload_too_large',
  'rate_limited',
  'unauthenticated',
  'forbidden',
  'stale_authorization',
  'verification_unavailable',
  'not_member',
  'mfa_required',
  'unavailable',
  'aborted',
] as const;
type MessageCode = (typeof MESSAGE_CODES)[number] | 'unexpected';

export function uploadMessageCode(code: string | null): MessageCode {
  return (MESSAGE_CODES as readonly string[]).includes(code ?? '') ? (code as MessageCode) : 'unexpected';
}

/**
 * "Upload image" control with per-file progress and explicit processing / ready /
 * failed states. Files are uploaded one after another; a failure never affects the
 * editor draft or other files. Accepted formats are validated again on the server.
 */
export function MediaUploader({
  scope,
  locale,
  onUploaded,
  compact = false,
}: {
  scope: UploadScope;
  locale: AppLocale;
  onUploaded?: (asset: UploadedAsset) => void;
  compact?: boolean;
}) {
  const t = useTranslations('media.upload');
  const tErrors = useTranslations('media.errors');
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const busy = items.some((item) => item.state === 'uploading' || item.state === 'processing');

  const update = (id: string, patch: Partial<UploadItem>) => setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const uploadAll = async (files: File[]) => {
    const queued = files.map((file) => ({ file, item: { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name || 'image', state: 'uploading' as const, progress: 0, code: null } }));
    setItems((current) => [...queued.map((entry) => entry.item), ...current].slice(0, 8));
    for (const { file, item } of queued) {
      const result = await uploadImageFile(file, {
        scope,
        onProgress: (fraction) => update(item.id, { progress: fraction }),
        onPhase: (phase) => update(item.id, { state: phase }),
      });
      if (result.ok) {
        update(item.id, { state: 'ready', progress: 1 });
        onUploaded?.(result.asset);
      } else {
        update(item.id, { state: 'failed', code: result.code });
      }
    }
  };

  return (
    <div className={styles.uploadZone} data-testid="media-uploader">
      <div className={styles.row}>
        <label htmlFor={inputId} className="visually-hidden">
          {t('fileLabel')}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="visually-hidden"
          aria-describedby={hintId}
          data-testid="media-upload-input"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length > 0) void uploadAll(files);
          }}
        />
        <GameButton intent="primary" onClick={() => inputRef.current?.click()} aria-describedby={hintId} icon={<UploadIcon />} data-testid="media-upload-button">
          {t('button')}
        </GameButton>
        {busy ? (
          <span className={`${styles.small} ${styles.muted}`} aria-hidden="true">
            {t('busy')}
          </span>
        ) : null}
      </div>
      <p id={hintId} className={`${styles.small} ${styles.muted}`} style={{ margin: 0 }}>
        {compact ? t('hintShort') : t('hint', { scope })}
      </p>
      {items.length > 0 ? (
        <ul className={styles.uploadList} aria-live="polite" aria-label={t('listLabel')}>
          {items.map((item) => (
            <li key={item.id} className={styles.uploadItem} data-state={item.state} data-testid="upload-item">
              <span className={styles.mediaName}>{item.name}</span>
              <span data-upload-state={item.state}>
                {item.state === 'uploading'
                  ? t('uploading', { percent: formatNumber(Math.round(item.progress * 100), locale) })
                  : item.state === 'processing'
                    ? t('processing')
                    : item.state === 'ready'
                      ? t('ready')
                      : t('failed')}
              </span>
              {item.state === 'uploading' || item.state === 'processing' ? (
                <progress max={1} value={item.state === 'processing' ? undefined : item.progress} aria-label={t('progressLabel', { name: item.name })} />
              ) : null}
              {item.state === 'failed' ? (
                <span role="alert" className={styles.danger} style={{ gridColumn: '1 / -1' }} data-upload-error={item.code ?? 'unexpected'}>
                  {tErrors(uploadMessageCode(item.code))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
