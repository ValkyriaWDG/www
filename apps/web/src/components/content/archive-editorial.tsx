import type { AppLocale } from '@/i18n/routing';
import { mediaUrl } from '@/modules/content/rich-text/render';
import type { PublicArchiveEditorial } from '@/modules/legacy/editorial-details';
import styles from './archive-editorial.module.css';

const labels = {
  cs: { title: 'Z původního webu', source: 'Původní záznam', updated: 'Úprava uvedená ve zdroji', cover: 'Původní titulní obrázek', warning: 'Zdroj uvádí úpravu před datem vydání. Původní údaj byl zachován.', author: 'Autor původního záznamu' },
  en: { title: 'From the original website', source: 'Original record', updated: 'Source modification date', cover: 'Original cover image', warning: 'The source modification date predates publication. The original value has been preserved.', author: 'Original record author' },
};

/** Historical facts stay visibly attributed; they never replace current editor content. */
export function ArchiveEditorial({ details, locale, compact = false }: { details: PublicArchiveEditorial; locale: AppLocale; compact?: boolean }) {
  const t = labels[locale];
  return <aside className={styles.archive} data-archive-editorial={details.kind} aria-label={t.title}>
    <p className={styles.heading}>{t.title}</p>
    {details.logo ? (
      // eslint-disable-next-line @next/next/no-img-element -- publication-aware media delivery
      <img className={styles.logo} src={mediaUrl(details.logo.assetId, 'thumb')} alt={details.tag || details.series} width={details.logo.width} height={details.logo.height} loading="lazy" />
    ) : null}
    {details.kind === 'tournament' && details.excerpt ? <p lang={details.sourceLanguage}>{details.excerpt}</p> : null}
    {[details.tag, details.series].filter(Boolean).length ? <p>{[details.tag, details.series].filter(Boolean).join(' · ')}</p> : null}
    {!compact ? <>
      {details.sourceAuthorLabel ? <p className={styles.author}>
        {details.authorImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- publication-aware media delivery
          <img src={mediaUrl(details.authorImage.assetId, 'thumb')} alt="" width={details.authorImage.width} height={details.authorImage.height} loading="lazy" />
        ) : null}
        <span>{t.author}: <span lang={details.sourceLanguage}>{details.sourceAuthorLabel}</span></span>
      </p> : null}
      {details.sourceModifiedOn ? <p>{t.updated}: <time dateTime={details.sourceModifiedOn}>{details.sourceModifiedOn}</time></p> : null}
      {details.warnings.includes('modified_before_published') ? <p role="note">{t.warning}</p> : null}
      {details.coverSourceUrl ? <p><a href={details.coverSourceUrl} rel="noopener noreferrer">{t.cover}</a></p> : null}
      <a href={details.sourceUrl} rel="noopener noreferrer">{t.source}</a>
    </> : null}
  </aside>;
}
