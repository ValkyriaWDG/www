import type { Metadata } from 'next';
import { ASSET_SCOPES, type AssetScope } from '@valkyria/db';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { EditorialTemplates } from '@/components/admin/editorial-templates';
import { MediaDetail } from '@/components/admin/media-detail';
import { MediaUploadPanel } from '@/components/admin/media-upload-panel';
import { definedParams, hrefWith, oneOf, pageParam, searchText, single } from '@/components/admin/search-params';
import { FilterBar, type FilterGroup } from '@/components/ui/filter-bar';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, StatusBadge } from '@/components/ui/panels';
import { formatDate, formatNumber } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { DomainError } from '@/lib/result';
import { can } from '@/modules/access/policy';
import { getActor } from '@/modules/access/server';
import { AccessDeniedError } from '@/modules/access/types';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';
import { uuidSchema } from '@/modules/content/inputs';
import { getAsset, listAssets, scopeCapability, type AssetDetailDTO } from '@/modules/media/library';
import { importedEditorialTemplates, listEditorialTemplates } from '@/modules/media/templates';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/media'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'media.library' });
  return adminPageMetadata({ locale, title: t('metaTitle') });
}

/**
 * Media library: searchable, paginated grid/list of the scopes the actor may manage
 * (editors: editorial, match managers: match), upload with progress and a detail panel.
 * Scope authority is enforced by the media use cases on every read and mutation.
 */
export default async function AdminMediaPage({ params, searchParams }: PageProps<'/[locale]/admin/media'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const probe = await getActor('read');
  const capability = can(probe, 'media.editorial.manage') ? 'media.editorial.manage' : 'media.match.manage';
  const access = await requireAdminPage({ locale, path: '/admin/media', capability });
  if (!access.ok) return access.denied;
  const actor = access.principal;
  const scopes = ASSET_SCOPES.filter((scope) => can(actor, scopeCapability(scope)));

  const raw = await searchParams;
  const filters = {
    q: searchText(raw.q),
    scope: oneOf(raw.scope, scopes),
    use: oneOf(raw.use, ['used', 'unused'] as const),
    view: oneOf(raw.view, ['grid', 'list'] as const) ?? 'grid',
    page: pageParam(raw.page),
  };
  const selectedId = single(raw.asset);
  const current: Record<string, string | undefined> = {
    q: filters.q,
    scope: filters.scope,
    use: filters.use,
    view: filters.view === 'list' ? 'list' : undefined,
    page: filters.page > 1 ? String(filters.page) : undefined,
  };
  const withAsset = (assetId: string | undefined) => {
    const base = hrefWith('/admin/media', current, { page: current.page });
    if (!assetId) return base;
    return `${base}${base.includes('?') ? '&' : '?'}asset=${assetId}`;
  };

  const t = await getTranslations({ locale, namespace: 'media' });
  const db = getDb();
  const list = await listAssets(db, actor, { scope: filters.scope, q: filters.q, inUse: filters.use ? filters.use === 'used' : undefined, page: filters.page, pageSize: 24 });
  let detail: AssetDetailDTO | null = null;
  if (selectedId && uuidSchema.safeParse(selectedId).success) {
    try {
      detail = await getAsset(db, actor, { assetId: selectedId });
    } catch (error) {
      if (!(error instanceof DomainError || error instanceof AccessDeniedError)) throw error;
    }
  }
  const uploadScope: AssetScope = filters.scope ?? scopes[0] ?? 'editorial';
  // Template backgrounds are editorial assets: shown only to editorial media managers.
  const imported = scopes.includes('editorial') ? await importedEditorialTemplates(db, actor) : null;
  const templates = imported
    ? listEditorialTemplates().map((template) => ({ id: template.id, game: template.game, alt: template.alt[locale], preview: template.preview, assetId: imported[template.id] ?? null }))
    : null;
  const filtered = Boolean(filters.q || filters.scope || filters.use);

  const groups: FilterGroup[] = [];
  if (scopes.length > 1) {
    groups.push({
      name: 'scope',
      label: t('library.filterScope'),
      options: [
        { value: 'all', label: t('library.allScopes'), href: hrefWith('/admin/media', current, { scope: undefined }), current: !filters.scope },
        ...scopes.map((scope) => ({ value: scope, label: t(`scopes.${scope}`), href: hrefWith('/admin/media', current, { scope }), current: filters.scope === scope })),
      ],
    });
  }
  groups.push(
    {
      name: 'use',
      label: t('library.filterUse'),
      options: [
        { value: 'all', label: t('library.allUse'), href: hrefWith('/admin/media', current, { use: undefined }), current: !filters.use },
        { value: 'used', label: t('library.used'), href: hrefWith('/admin/media', current, { use: 'used' }), current: filters.use === 'used' },
        { value: 'unused', label: t('library.unused'), href: hrefWith('/admin/media', current, { use: 'unused' }), current: filters.use === 'unused' },
      ],
    },
    {
      name: 'view',
      label: t('library.view'),
      options: [
        { value: 'grid', label: t('library.grid'), href: hrefWith('/admin/media', current, { view: undefined, page: current.page }), current: filters.view === 'grid' },
        { value: 'list', label: t('library.list'), href: hrefWith('/admin/media', current, { view: 'list', page: current.page }), current: filters.view === 'list' },
      ],
    },
  );

  const usageBadge = (usageCount: number, published: boolean) =>
    usageCount > 0 ? <StatusBadge kind={published ? 'success' : 'info'}>{published ? t('library.inUsePublished') : t('library.inUse')}</StatusBadge> : <StatusBadge kind="neutral">{t('library.unusedBadge')}</StatusBadge>;

  return (
    <section aria-labelledby="admin-media-title" className={styles.stack} data-testid="admin-media" data-scopes={scopes.join(',')}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{t('library.eyebrow')}</p>
          <h1 id="admin-media-title">{t('library.title')}</h1>
          <p className={styles.lead}>{scopes.length > 1 ? t('library.leadAll') : t('library.leadScope', { scope: t(`scopes.${scopes[0] ?? 'editorial'}`) })}</p>
        </div>
      </div>
      <MediaUploadPanel scope={uploadScope} locale={locale} />
      {templates ? <EditorialTemplates templates={templates} /> : null}
      <FilterBar
        action="/admin/media"
        searchLabel={t('library.searchLabel')}
        searchValue={filters.q}
        searchPlaceholder={t('library.searchPlaceholder')}
        hiddenParams={definedParams({ scope: filters.scope, use: filters.use, view: current.view })}
        filters={groups}
        resetHref={filtered ? '/admin/media' : null}
        resultSummary={t('library.summary', { count: list.total })}
      />
      <div className={styles.mediaLayout} data-detail={detail ? 'open' : 'none'}>
        <div className={styles.stack}>
          {list.items.length === 0 ? (
            <EmptyState title={filtered ? t('library.emptyFilteredTitle') : t('library.emptyTitle')}>{filtered ? t('library.emptyFilteredBody') : t('library.emptyBody')}</EmptyState>
          ) : filters.view === 'list' ? (
            <div className={styles.panel}>
              <ul className={styles.itemList} style={{ padding: '0 var(--space-3)' }} aria-label={t('library.gridLabel')}>
                {list.items.map((asset) => (
                  <li key={asset.id} style={{ gridTemplateColumns: '72px minmax(0, 1fr) auto', alignItems: 'center', gap: 'var(--space-3)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- authorized private thumbnail */}
                    <img src={asset.urls.thumb} alt="" width={72} height={54} style={{ objectFit: 'cover', width: 72, height: 54 }} />
                    <Link className={styles.textLink} href={withAsset(asset.id)} aria-current={detail?.id === asset.id ? 'true' : undefined}>
                      {asset.originalFilename}
                      <span className={`${styles.small} ${styles.muted}`}>
                        {' '}
                        · {formatNumber(asset.width, locale)} × {formatNumber(asset.height, locale)} px · {t(`scopes.${asset.scope}`)} · {formatDate(asset.createdAt, locale, 'dateShort')}
                      </span>
                    </Link>
                    {usageBadge(asset.usageCount, asset.publishedUse)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className={styles.mediaGrid} aria-label={t('library.gridLabel')} data-testid="media-grid">
              {list.items.map((asset) => (
                <li key={asset.id}>
                  <Link className={styles.mediaCard} href={withAsset(asset.id)} aria-current={detail?.id === asset.id ? 'true' : undefined} data-asset-id={asset.id} data-testid="media-card">
                    <span className={styles.mediaThumb}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- authorized private thumbnail */}
                      <img src={asset.urls.thumb} alt="" loading="lazy" />
                    </span>
                    <span className={styles.mediaInfo}>
                      <span className={styles.mediaName} title={asset.originalFilename}>{asset.originalFilename}</span>
                      <span className={styles.muted}>
                        {formatNumber(asset.width, locale)} × {formatNumber(asset.height, locale)} px · {t(`scopes.${asset.scope}`)}
                      </span>
                      <span className={styles.mediaBadges}>{usageBadge(asset.usageCount, asset.publishedUse)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={list.page} pageCount={list.pageCount} hrefForPage={(page) => hrefWith('/admin/media', current, { page })} />
        </div>
        {detail ? <MediaDetail key={detail.id} asset={detail} uiLocale={locale} closeHref={hrefWith('/admin/media', current, { page: current.page })} /> : null}
      </div>
    </section>
  );
}
