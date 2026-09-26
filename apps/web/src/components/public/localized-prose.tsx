import type { Locale } from '@valkyria/db/schema';
import { getTranslations } from 'next-intl/server';
import { FeedbackNotice } from '@/components/ui/panels';
import { Link } from '@/i18n/navigation';
import { getSiteOrigin } from '@/lib/site';
import { RichText } from '@/modules/content/rich-text/render';
import { parseRichTextDocument } from '@/modules/content/rich-text/schema';
import type { LocalizedProse } from '@/modules/prose/types';
import styles from './public.module.css';

export type LocalizedProseLabels = {
  missingTitle: string;
  missingBody: string;
  none: string;
  /** Link text per available source locale ("Read the Czech biography"). */
  other: Record<Locale, string>;
};

/**
 * A member biography or match recap in the requested locale. A missing translation is
 * an explicit localized absence with a link to a published source-language version;
 * another language's text is never shown under this locale and drafts never appear.
 */
export async function LocalizedProseView({
  prose,
  locale,
  path,
  labels,
}: {
  prose: LocalizedProse;
  locale: Locale;
  /** Logical path of the same entity (`/members/<slug>`); shared slugs across locales. */
  path: string;
  labels: LocalizedProseLabels;
}) {
  const parsed = prose.state === 'published' ? parseRichTextDocument(prose.body) : null;
  if (prose.state === 'published' && parsed?.ok) {
    const t = await getTranslations({ locale, namespace: 'news.richText' });
    const assets = new Map(prose.assets.map((image) => [image.assetId, { width: image.width, height: image.height }]));
    return (
      <div lang={prose.locale} data-prose="published">
        <RichText doc={parsed.doc} assets={assets} labels={{ tableRegion: t('tableRegion'), externalLink: t('externalLink') }} siteOrigin={getSiteOrigin()} />
      </div>
    );
  }
  // A stored document that no longer validates is treated like an absent translation.
  const sources = prose.state === 'missing' ? prose.availableIn.filter((code) => code !== locale) : [];
  if (sources.length === 0) {
    return (
      <p className={styles.muted} data-prose="none">
        {labels.none}
      </p>
    );
  }
  return (
    <div data-prose="missing">
      <FeedbackNotice kind="info" title={labels.missingTitle} live={false}>
        <p>{labels.missingBody}</p>
        <ul className={styles.tagList}>
          {sources.map((code) => (
            <li key={code}>
              <Link href={path} locale={code} hrefLang={code} className={styles.proseLink} data-prose-source={code}>
                {labels.other[code]}
              </Link>
            </li>
          ))}
        </ul>
      </FeedbackNotice>
    </div>
  );
}
