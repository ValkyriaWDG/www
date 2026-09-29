'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { Link, useRouter } from '@/i18n/navigation';
import { importEditorialTemplateAction } from '@/modules/media/actions';
import { uploadMessageCode } from './media-uploader';
import styles from './admin.module.css';

export type EditorialTemplateCard = { id: string; game: 'hll' | 'wardogs' | 'community'; alt: string; preview: string; assetId: string | null };

/**
 * Owner-supplied text-free backgrounds (graphics pack 2026-09-29). Adding one creates an
 * ordinary editorial asset; its alt text, captions and rights are then edited in the
 * normal detail panel and it is picked as a cover like any other library image.
 */
export function EditorialTemplates({ templates }: { templates: EditorialTemplateCard[] }) {
  const t = useTranslations('media.templates');
  const errors = useTranslations('media.errors');
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (id: string) => {
    setPending(id);
    setError(null);
    const result = await importEditorialTemplateAction({ templateId: id });
    setPending(null);
    if (!result.ok) {
      setError(errors(uploadMessageCode(result.code)));
      return;
    }
    router.push(`/admin/media?asset=${result.data.assetId}`);
    router.refresh();
  };

  return (
    <details className={styles.section} data-testid="editorial-templates">
      <summary>{t('title', { count: templates.length })}</summary>
      <div className={styles.sectionBody}>
        <p className={`${styles.small} ${styles.muted}`}>{t('lead')}</p>
        {error ? (
          <p role="alert" className={styles.small} data-testid="editorial-template-error">
            {error}
          </p>
        ) : null}
        <ul className={styles.mediaGrid} aria-label={t('listLabel')}>
          {templates.map((template) => (
            <li key={template.id} className={styles.mediaCard} data-editorial-template={template.id}>
              <span className={styles.mediaThumb} style={{ aspectRatio: '16 / 9' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- shipped static preview */}
                <img src={template.preview} alt="" width={480} height={270} loading="lazy" decoding="async" style={{ objectFit: 'cover' }} />
              </span>
              <span className={styles.mediaInfo}>
                <span className={styles.mediaName}>{t(`games.${template.game}`)}</span>
                <span className={styles.muted}>{template.alt}</span>
                <span className={styles.mediaBadges}>
                  {template.assetId ? (
                    <Link className={styles.textLink} href={`/admin/media?asset=${template.assetId}`} data-template-asset={template.assetId}>
                      {t('inLibrary')}
                    </Link>
                  ) : (
                    <GameButton size="sm" intent="secondary" onClick={() => add(template.id)} disabled={pending !== null} pending={pending === template.id} pendingLabel={t('adding')} data-template-add={template.id}>
                      {t('add')}
                    </GameButton>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className={`${styles.small} ${styles.muted}`}>{t('rights')}</p>
      </div>
    </details>
  );
}
