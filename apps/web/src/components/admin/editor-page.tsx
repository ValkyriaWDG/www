import 'server-only';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GuardedLink } from '@/components/shell/guarded-link';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { DomainError } from '@/lib/result';
import { can } from '@/modules/access/policy';
import type { Principal } from '@/modules/access/types';
import { listTaxonomyOptions } from '@/modules/content/admin-queries';
import { getEditorState, listRevisions } from '@/modules/content/editor';
import { uuidSchema } from '@/modules/content/inputs';
import { getPublisherStatus } from '@/modules/content/schedule';
import { getManualMetaForAdmin, listManualCategoryOptions } from '@/modules/field-manual/admin';
import type { DocumentEditorState } from '@/modules/content/types';
import styles from './admin.module.css';
import { MissingTranslation } from './missing-translation';
import { ManualMetaForm } from './manual-meta-form';
import { NewsEditor } from './news-editor';
import { oneOf, type RawSearchParams } from './search-params';

/** Loads a document's editor state; unknown/invalid IDs are a plain 404. */
export async function loadEditorState(actor: Principal, id: string): Promise<DocumentEditorState> {
  if (!uuidSchema.safeParse(id).success) notFound();
  try {
    return await getEditorState(getDb(), actor, { documentId: id });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'not_found') notFound();
    throw error;
  }
}

/** Selected content language: `?lang=` when valid, else Czech when present, else English. */
export function selectedContentLocale(state: DocumentEditorState, raw: RawSearchParams): 'cs' | 'en' {
  return oneOf(raw.lang, ['cs', 'en'] as const) ?? (state.translations.cs ? 'cs' : state.translations.en ? 'en' : 'cs');
}

/**
 * Server part of the post/page editor route: loads the document, the selected
 * translation's revision history, taxonomy options and publisher health, then renders
 * the client editor keyed by translation (switching language remounts cleanly).
 */
export async function EditorPage({
  locale,
  actor,
  state,
  contentLocale,
  mode,
}: {
  locale: AppLocale;
  actor: Principal;
  state: DocumentEditorState;
  contentLocale: 'cs' | 'en';
  mode: 'news' | 'page' | 'manual';
}) {
  const t = await getTranslations({ locale, namespace: 'adminEditorial' });
  const db = getDb();
  const translation = state.translations[contentLocale];
  const basePath = mode === 'news' ? '/admin/news' : mode === 'manual' ? '/admin/manual' : '/admin/content';
  const manualGame = mode === 'manual' ? (state.document.game ?? 'hell-let-loose') : null;
  const [revisions, taxonomy, publisher, manualMeta] = await Promise.all([
    translation ? listRevisions(db, actor, { translationId: translation.id }) : Promise.resolve([]),
    manualGame ? listManualCategoryOptions(db, actor, manualGame) : listTaxonomyOptions(db, actor),
    getPublisherStatus(db, actor),
    mode === 'manual' ? getManualMetaForAdmin(db, actor, state.document.id) : Promise.resolve(null),
  ]);
  const heading =
    mode === 'page' && state.document.pageKey
      ? t('pages.editTitle', { page: t(`pages.keys.${state.document.pageKey}`) })
      : translation?.draft?.title || t('editor.untitled');
  const other = contentLocale === 'cs' ? 'en' : 'cs';

  return (
    <section aria-labelledby="editor-heading" className={styles.stack}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <GuardedLink href={basePath} className={styles.textLink}>
              {mode === 'news' ? t('list.title') : mode === 'manual' ? t('manual.title') : t('pages.title')}
            </GuardedLink>
          </p>
          <h1 id="editor-heading">{mode === 'news' ? t('editor.heading') : mode === 'manual' ? t('manual.editorHeading') : heading}</h1>
        </div>
      </div>
      {translation ? (
        <NewsEditor
          key={translation.id}
          mode={mode}
          uiLocale={locale}
          contentLocale={contentLocale}
          initialState={state}
          initialRevisions={revisions}
          taxonomy={taxonomy}
          canPublish={can(actor, 'content.publish')}
          publisherStalled={publisher.stalled}
        />
      ) : (
        <MissingTranslation documentId={state.document.id} locale={contentLocale} basePath={basePath} pageKey={state.document.pageKey} existing={state.translations[other] ? other : null} />
      )}
      {manualMeta ? <ManualMetaForm documentId={state.document.id} initial={manualMeta} archived={Boolean(state.document.archivedAt)} /> : null}
    </section>
  );
}
