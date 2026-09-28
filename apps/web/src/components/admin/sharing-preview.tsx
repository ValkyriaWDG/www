'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AppLocale } from '@/i18n/routing';
import type { PublishedSummary } from '@/modules/content/types';
import { socialImagePath } from '@/modules/social/model';
import styles from './admin.module.css';

export function SharingPreview({ locale, published }: { locale: AppLocale; published: PublishedSummary | null }) {
  const t = useTranslations('social');
  const src = published ? socialImagePath(locale, 'news', published.slug, published.revisionId) : null;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <details className={styles.section} data-testid="sharing-preview">
      <summary>{t('sharing')}</summary>
      <div className={styles.sectionBody}>
        <p className={styles.small}>{src ? t('publishedOnly') : t('unpublished')}</p>
        {src ? <>
          {/* eslint-disable-next-line @next/next/no-img-element -- publication-aware generated PNG, not an optimizer source */}
          {failedSource === src ? <p role="status">{t('unavailable')}</p> : <img src={src} alt={t('previewAlt')} width={1200} height={630} loading="lazy" onError={() => setFailedSource(src)} style={{ display: 'block', width: '100%', height: 'auto' }} />}
          <a className={styles.inlineButton} href={src} target="_blank" rel="noopener">{t('open')}</a>
          <p className={`${styles.small} ${styles.muted}`}>{t('cacheHint')}</p>
        </> : null}
      </div>
    </details>
  );
}
