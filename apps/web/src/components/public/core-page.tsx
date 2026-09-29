import type { PageKey } from '@valkyria/db/schema';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, PageHeader, SectionFrame } from '@/components/ui/panels';
import type { AppLocale } from '@/i18n/routing';
import { getSiteOrigin } from '@/lib/site';
import { RichText } from '@/modules/content/rich-text/render';
import type { ArticleDTO } from '@/modules/content/types';
import styles from './pages.module.css';

/**
 * Core static page (clan, community, privacy, faq): published title/excerpt/body of the
 * active locale in a readable frame over the darkened scene. An unpublished page is an
 * honest localized state, never another language's copy. `before`/`after` hold
 * page-specific contextual blocks (Discord, HLL website, community choices).
 */
export async function CorePage({
  locale,
  pageKey,
  page,
  before,
  after,
  home,
  eyebrow,
  anchors,
}: {
  locale: AppLocale;
  pageKey: PageKey;
  page: ArticleDTO | null;
  before?: ReactNode;
  after?: ReactNode;
  /** Breadcrumb root when shown inside a game section (default: the community hub). */
  home?: { href: string; label: string };
  /** Eyebrow inside a game section (default: the community eyebrow). */
  eyebrow?: string;
  /** Heading anchors (block index → id) for an in-page index such as the FAQ questions. */
  anchors?: ReadonlyMap<number, string>;
}) {
  const t = await getTranslations({ locale, namespace: 'pages' });
  const tr = await getTranslations({ locale, namespace: 'news.richText' });
  const titleId = `${pageKey}-title`;
  const navLabel = t(`${pageKey}.navLabel`);
  return (
    <PageMain width="reading" labelledBy={titleId}>
      <PageHeader
        breadcrumbs={[home ?? { href: '/', label: t('shared.breadcrumbHome') }, { label: navLabel }]}
        eyebrow={eyebrow ?? t('shared.eyebrow')}
        title={page ? <span lang={page.locale}>{page.title}</span> : navLabel}
        titleId={titleId}
        description={page?.excerpt ? <p lang={page.locale}>{page.excerpt}</p> : undefined}
      />
      <div className={styles.content} data-core-page={pageKey} data-published={page ? 'true' : 'false'}>
        {before}
        {page ? (
          <SectionFrame title={t(`${pageKey}.frameTitle`)} titleId={`${pageKey}-content`}>
            <div className={styles.body} lang={page.locale}>
              <RichText doc={page.body} assets={page.assets} labels={{ tableRegion: tr('tableRegion'), externalLink: tr('externalLink') }} siteOrigin={getSiteOrigin()} anchors={anchors} />
            </div>
          </SectionFrame>
        ) : (
          <EmptyState title={t('shared.unpublishedTitle')}>
            <p>{t('shared.unpublishedBody')}</p>
          </EmptyState>
        )}
        {after}
      </div>
    </PageMain>
  );
}
