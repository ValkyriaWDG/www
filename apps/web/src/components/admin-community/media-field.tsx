'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { MediaPicker } from '@/components/admin/media-picker';
import { FieldError } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import styles from './admin-community.module.css';

export type MediaRef = { assetId: string; filename: string | null; alt?: string; caption?: string };

type MediaFieldProps = {
  label: string;
  hint?: string;
  scope: 'editorial' | 'match';
  locale: 'cs' | 'en';
  value: MediaRef | null;
  onChange: (value: MediaRef | null) => void;
  error?: string;
  disabled?: boolean;
  testId?: string;
};

/**
 * Approved image reference chosen from the media library (never a free URL). Shows a
 * private admin thumbnail through the authorized media route, filename when known and
 * explicit choose/replace/remove actions; the picker enforces the media scope.
 */
export function MediaField({ label, hint, scope, locale, value, onChange, error, disabled, testId }: MediaFieldProps) {
  const t = useTranslations('adminCommunity.media');
  const [open, setOpen] = useState(false);
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className={styles.media} role="group" aria-labelledby={labelId} aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined} data-testid={testId}>
      <div className={styles.mediaThumb} aria-hidden="true">
        {value ? (
          // Authorized private thumbnail (admin-only, no-store); decorative next to its label.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${value.assetId}/thumb`} alt="" width={96} height={72} />
        ) : (
          <span>{t('none')}</span>
        )}
      </div>
      <div className={styles.mediaBody}>
        <p id={labelId} className={styles.mediaLabel}>
          {label}
        </p>
        <p className={styles.mediaMeta}>{value ? (value.filename ? t('selected', { filename: value.filename }) : t('selectedUnknown')) : t('noneSelected')}</p>
        {hint ? (
          <p id={hintId} className={styles.mediaMeta}>
            {hint}
          </p>
        ) : null}
        <div className={styles.inlineActionsTight}>
          <GameButton size="sm" intent="secondary" onClick={() => setOpen(true)} disabled={disabled}>
            {value ? t('replace') : t('choose')}
          </GameButton>
          {value ? (
            <GameButton size="sm" intent="ghost" onClick={() => onChange(null)} disabled={disabled}>
              {t('remove')}
            </GameButton>
          ) : null}
        </div>
        <FieldError id={errorId}>{error}</FieldError>
      </div>
      <MediaPicker
        open={open}
        scope={scope}
        locale={locale}
        allowUpload
        onClose={() => setOpen(false)}
        onSelect={(asset) => {
          onChange({ assetId: asset.assetId, filename: asset.filename, alt: asset.alt, caption: asset.caption });
          setOpen(false);
        }}
      />
    </div>
  );
}
