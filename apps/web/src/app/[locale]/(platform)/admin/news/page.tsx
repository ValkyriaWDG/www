import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { PostRowActions } from '@/components/admin/post-row-actions';
import { definedParams, hrefWith, oneOf, pageParam, searchText } from '@/components/admin/search-params';
import { TranslationStateCell } from '@/components/admin/translation-state-cell';
import { FilterBar, type FilterGroup } from '@/components/ui/filter-bar';
import { GameButton } from '@/components/ui/game-button';
import { NewsIcon } from '@/components/ui/icons';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, FeedbackNotice } from '@/components/ui/panels';
import { SelectionTable, type SelectionColumn } from '@/components/ui/selection-table';
import { formatDate } from '@/i18n/date-format';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { can } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { listRowVersions, listTaxonomyOptions } from '@/modules/content/admin-queries';
import { listDocumentsForAdmin } from '@/modules/content/editor';
import { ADMIN_STATES } from '@/modules/content/inputs';
import { getPublisherStatus } from '@/modules/content/schedule';
import type { AdminDocumentRow } from '@/modules/content/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/news'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.list' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

const CONTENT_LOCALES = ['cs', 'en'] as const;

/** Posts workspace: searchable, paginated table with separate Czech/English states. */
export default async function AdminNewsPage({ params, searchParams }: PageProps<'/[locale]/admin/news'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/news', capability: 'content.edit' });
  if (!access.ok) return access.denied;
  const actor = access.principal;

  const raw = await searchParams;
  const filters = {
    q: searchText(raw.q),
    state: oneOf(raw.state, ADMIN_STATES),
    locale: oneOf(raw.locale, CONTENT_LOCALES),
    page: pageParam(raw.page),
  };
  const current: Record<string, string | undefined> = { q: filters.q, state: filters.state, locale: filters.locale, page: filters.page > 1 ? String(filters.page) : undefined };

  const t = await getTranslations({ locale, namespace: 'adminEditorial' });
  const db = getDb();
  const [list, taxonomy, publisher] = await Promise.all([
    listDocumentsForAdmin(db, actor, { kind: 'news', q: filters.q, state: filters.state, locale: filters.locale, page: filters.page, pageSize: 20 }),
    listTaxonomyOptions(db, actor),
    getPublisherStatus(db, actor),
  ]);
  const versions = await listRowVersions(db, actor, list.items.map((item) => item.documentId));
  const categoryLabel = (key: string | null) => {
    if (!key) return '—';
    const term = taxonomy.categories.find((candidate) => candidate.key === key);
    return term ? (locale === 'cs' ? term.labelCs : term.labelEn) : key;
  };
  const canPublish = can(actor, 'content.publish');
  const filtered = Boolean(filters.q || filters.state || filters.locale);

  const filterGroups: FilterGroup[] = [
    {
      name: 'state',
      label: t('list.filterState'),
      options: [
        { value: 'all', label: t('list.all'), href: hrefWith('/admin/news', current, { state: undefined }), current: !filters.state },
        ...ADMIN_STATES.map((state) => ({ value: state, label: t(`states.${state}`), href: hrefWith('/admin/news', current, { state }), current: filters.state === state })),
      ],
    },
    {
      name: 'locale',
      label: t('list.filterLocale'),
      options: [
        { value: 'all', label: t('list.allLanguages'), href: hrefWith('/admin/news', current, { locale: undefined }), current: !filters.locale },
        ...CONTENT_LOCALES.map((value) => ({ value, label: t(`common.languages.${value}`), href: hrefWith('/admin/news', current, { locale: value }), current: filters.locale === value })),
      ],
    },
  ];

  const primaryTitle = (row: AdminDocumentRow) => row.translations.cs?.title || row.translations.en?.title || t('list.untitled');
  const columns: SelectionColumn<AdminDocumentRow>[] = [
    {
      key: 'title',
      header: t('list.columns.title'),
      rowHeader: true,
      cell: (row) => (
        <span className={styles.listTitle}>
          <strong lang={row.translations.cs?.title ? 'cs' : 'en'}>{primaryTitle(row)}</strong>
          {row.translations.cs?.title && row.translations.en?.title ? (
            <span className={styles.listMeta} lang="en">
              EN: {row.translations.en.title}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'author', header: t('list.columns.author'), cell: (row) => row.translations.cs?.authorLabel || row.translations.en?.authorLabel || '—' },
    { key: 'category', header: t('list.columns.category'), cell: (row) => categoryLabel(row.categoryKey) },
    { key: 'modified', header: t('list.columns.modified'), cell: (row) => <span className={styles.small}>{formatDate(row.updatedAt, locale, 'dateTime')}</span> },
    { key: 'cs', header: t('list.columns.cs'), cell: (row) => <TranslationStateCell translation={row.translations.cs} uiLocale={locale} contentLocale="cs" /> },
    { key: 'en', header: t('list.columns.en'), cell: (row) => <TranslationStateCell translation={row.translations.en} uiLocale={locale} contentLocale="en" /> },
    {
      key: 'actions',
      header: t('list.columns.actions'),
      cell: (row) => (
        <PostRowActions
          documentId={row.documentId}
          title={primaryTitle(row)}
          archived={row.archived}
          documentVersion={versions.documents[row.documentId] ?? 1}
          uiLocale={locale}
          canPublish={canPublish}
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
    <section aria-labelledby="admin-news-title" className={styles.stack} data-testid="admin-news">
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{t('list.eyebrow')}</p>
          <h1 id="admin-news-title">{t('list.title')}</h1>
          <p className={styles.lead}>{t('list.lead')}</p>
        </div>
        <GameButton href="/admin/news/new" intent="primary" size="lg" icon={<NewsIcon />} data-testid="new-post">
          {t('list.newPost')}
        </GameButton>
      </div>
      {publisher.stalled ? (
        <FeedbackNotice kind="warning" title={t('publisher.stalledTitle')} live={false}>
          {t('publisher.stalledBody', { count: publisher.counts.overdue })}
        </FeedbackNotice>
      ) : null}
      {publisher.counts.blocked + publisher.counts.failed > 0 ? (
        <FeedbackNotice kind="error" title={t('publisher.attentionTitle')} live={false}>
          {t('publisher.attentionBody', { count: publisher.counts.blocked + publisher.counts.failed })}
        </FeedbackNotice>
      ) : null}
      <FilterBar
        action="/admin/news"
        searchLabel={t('list.searchLabel')}
        searchValue={filters.q}
        searchPlaceholder={t('list.searchPlaceholder')}
        hiddenParams={definedParams({ state: filters.state, locale: filters.locale })}
        filters={filterGroups}
        resetHref={filtered ? '/admin/news' : null}
        resultSummary={t('list.summary', { count: list.total })}
      />
      {list.items.length === 0 ? (
        <EmptyState
          title={filtered ? t('list.emptyFilteredTitle') : t('list.emptyTitle')}
          action={
            filtered ? (
              <GameButton href="/admin/news">{t('list.clearFilters')}</GameButton>
            ) : (
              <GameButton href="/admin/news/new" intent="primary">
                {t('list.newPost')}
              </GameButton>
            )
          }
        >
          {filtered ? t('list.emptyFilteredBody') : t('list.emptyBody')}
        </EmptyState>
      ) : (
        <SelectionTable
          caption={t('list.caption')}
          captionHidden
          columns={columns}
          rows={list.items}
          getRowKey={(row) => row.documentId}
          getRowHref={(row) => `/admin/news/${row.documentId}?lang=${row.translations.cs ? 'cs' : 'en'}`}
          linkColumn="title"
        />
      )}
      <Pagination page={list.page} pageCount={list.pageCount} hrefForPage={(page) => hrefWith('/admin/news', current, { page })} />
    </section>
  );
}
