import 'server-only';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ArticleView, getArticleViewLabels } from '@/components/content/article-view';
import { GameButton } from '@/components/ui/game-button';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getSiteOrigin } from '@/lib/site';
import { gameRouteFromDb } from '@/modules/games/registry';
import { canonicalNewsPath, gamePath } from '@/modules/games/routes';
import { DomainError } from '@/lib/result';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { uuidSchema } from '@/modules/content/inputs';
import { getPreview } from '@/modules/content/preview';
import styles from './admin.module.css';
import { loadEditorState, selectedContentLocale } from './editor-page';
import { oneOf, single, type RawSearchParams } from './search-params';

/** Private preview metadata: never indexed or followed (the proxy also sends `private, no-store`). */
export async function previewMetadata(locale: AppLocale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'adminEditorial.preview' });
  return { title: t('metaTitle'), robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } } };
}

/**
 * Authorized private preview (`content.read_private`) of a translation's draft or of a
 * specific revision of the SAME translation, rendered by the public `ArticleView` (in the
 * content language) under the admin "unpublished preview" banner. An opaque URL alone
 * grants nothing.
 */
export async function PreviewPage({ locale, id, raw, mode }: { locale: AppLocale; id: string; raw: RawSearchParams; mode: 'news' | 'page' | 'manual' }) {
  const basePath = mode === 'news' ? '/admin/news' : mode === 'manual' ? '/admin/manual' : '/admin/content';
  const access = await requireAdminPage({ locale, path: `${basePath}/${encodeURIComponent(id)}/preview`, capability: 'content.read_private' });
  if (!access.ok) return access.denied;
  const state = await loadEditorState(access.principal, id, locale);
  if ('denied' in state) return state.denied;
  const contentLocale = oneOf(raw.lang, ['cs', 'en'] as const) ?? selectedContentLocale(state, raw);
  const translation = state.translations[contentLocale];
  if (!translation) notFound();
  const revisionParam = single(raw.revision);
  const revisionId = revisionParam && uuidSchema.safeParse(revisionParam).success ? revisionParam : undefined;
  let article;
  try {
    article = await getPreview(getDb(), access.principal, { translationId: translation.id, revisionId });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'not_found') notFound();
    throw error;
  }
  const [t, articleLabels] = await Promise.all([getTranslations({ locale, namespace: 'adminEditorial' }), getArticleViewLabels(contentLocale)]);
  const isDraft = !revisionId || revisionId === translation.draft?.id;
  const game = state.document.game;
  const livePath = !translation.liveSlug
    ? null
    : mode === 'page' && state.document.pageKey
      ? `/${contentLocale}/${state.document.pageKey}`
      : mode === 'manual' && game
        ? `/${contentLocale}${gamePath(gameRouteFromDb(game), 'field-manual', translation.liveSlug)}`
        : `/${contentLocale}${canonicalNewsPath(game, translation.liveSlug)}`;

  return (
    <div data-testid="preview-page" data-content-locale={contentLocale}>
      <div className={styles.previewBanner} role="note" aria-label={t('preview.bannerLabel')} data-testid="preview-banner">
        <div>
          <strong>{t('preview.banner')}</strong>
          <p>
            {t('preview.bannerBody', { locale: contentLocale })}{' '}
            {isDraft ? t('preview.draftRevision') : t('preview.olderRevision')}
          </p>
        </div>
        <div className={styles.buttonRow}>
          <GameButton href={`${basePath}/${state.document.id}?lang=${contentLocale}`} size="sm" intent="secondary">
            {t('preview.backToEditor')}
          </GameButton>
          {livePath ? (
            <GameButton href={livePath} external size="sm" intent="ghost">
              {t('preview.openLive')}
            </GameButton>
          ) : null}
        </div>
      </div>
      <ArticleView article={article} labels={articleLabels} backHref={null} siteOrigin={getSiteOrigin()} dateLocale={contentLocale} />
    </div>
  );
}
