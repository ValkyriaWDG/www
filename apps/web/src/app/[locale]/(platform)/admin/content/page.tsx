import type { Metadata } from 'next';
import { PAGE_KEYS } from '@valkyria/db';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { PostRowActions } from '@/components/admin/post-row-actions';
import { TranslationStateCell } from '@/components/admin/translation-state-cell';
import { FeedbackNotice } from '@/components/ui/panels';
import { SelectionTable, type SelectionColumn } from '@/components/ui/selection-table';
import { formatDate } from '@/i18n/date-format';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { can } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { listRowVersions } from '@/modules/content/admin-queries';
import { listDocumentsForAdmin } from '@/modules/content/editor';
import type { AdminDocumentRow } from '@/modules/content/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/content'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.pages' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

const CONTENT_LOCALES = ['cs', 'en'] as const;

/** Core static pages (clan, community, privacy, faq) with per-language publication state. */
export default async function AdminContentPage({ params }: PageProps<'/[locale]/admin/content'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/content', capability: 'content.edit' });
  if (!access.ok) return access.denied;
  const actor = access.principal;
  const t = await getTranslations({ locale, namespace: 'adminEditorial' });
  const db = getDb();
  const list = await listDocumentsForAdmin(db, actor, { kind: 'page', page: 1, pageSize: 10 });
  const versions = await listRowVersions(db, actor, list.items.map((item) => item.documentId));
  const rows = [...list.items].sort((a, b) => PAGE_KEYS.indexOf(a.pageKey ?? 'privacy') - PAGE_KEYS.indexOf(b.pageKey ?? 'privacy'));
  const missing = PAGE_KEYS.filter((key) => !rows.some((row) => row.pageKey === key));
  const canPublish = can(actor, 'content.publish');
  const pageName = (row: AdminDocumentRow) => (row.pageKey ? t(`pages.keys.${row.pageKey}`) : row.documentId);

  const columns: SelectionColumn<AdminDocumentRow>[] = [
    {
      key: 'page',
      header: t('pages.columns.page'),
      rowHeader: true,
      cell: (row) => (
        <span className={styles.listTitle}>
          <strong>{pageName(row)}</strong>
          <span className={styles.listMeta}>/{row.pageKey}</span>
        </span>
      ),
    },
    { key: 'cs', header: t('list.columns.cs'), cell: (row) => <TranslationStateCell translation={row.translations.cs} uiLocale={locale} contentLocale="cs" /> },
    { key: 'en', header: t('list.columns.en'), cell: (row) => <TranslationStateCell translation={row.translations.en} uiLocale={locale} contentLocale="en" /> },
    { key: 'modified', header: t('list.columns.modified'), cell: (row) => <span className={styles.small}>{formatDate(row.updatedAt, locale, 'dateTime')}</span> },
    {
      key: 'actions',
      header: t('list.columns.actions'),
      cell: (row) => (
        <PostRowActions
          documentId={row.documentId}
          title={pageName(row)}
          archived={row.archived}
          documentVersion={versions.documents[row.documentId] ?? 1}
          uiLocale={locale}
          canPublish={canPublish}
          basePath="/admin/content"
          allowDuplicate={false}
          allowArchive={false}
          translations={Object.fromEntries(
            CONTENT_LOCALES.filter((value) => row.translations[value]).map((value) => {
              const entry = row.translations[value]!;
              return [value, { translationId: entry.translationId, version: versions.translations[entry.translationId] ?? 1, state: entry.state, liveSlug: entry.liveSlug, title: entry.title }];
            }),
          )}
        />
      ),
    },
  ];

  return (
    <section aria-labelledby="admin-content-title" className={styles.stack} data-testid="admin-content">
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{t('pages.eyebrow')}</p>
          <h1 id="admin-content-title">{t('pages.title')}</h1>
          <p className={styles.lead}>{t('pages.lead')}</p>
        </div>
      </div>
      {missing.length > 0 ? (
        <FeedbackNotice kind="warning" title={t('pages.missingTitle')} live={false}>
          {t('pages.missingBody', { pages: missing.map((key) => t(`pages.keys.${key}`)).join(', ') })}
        </FeedbackNotice>
      ) : null}
      <SelectionTable
        caption={t('pages.caption')}
        captionHidden
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.documentId}
        getRowHref={(row) => `/admin/content/${row.documentId}?lang=cs`}
        linkColumn="page"
      />
    </section>
  );
}
