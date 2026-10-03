import { AUDIT_OUTCOMES } from '@valkyria/db/schema';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { FilterForm } from '@/components/admin-community/filter-form';
import { CodeText } from '@/components/admin-community/code-text';
import { formatDate, formatDateTimeShort } from '@/components/admin-community/format';
import { dayStart, nextDayStart, pickDate, pickEnum, pickPage, pickParam, queryHref, type SearchParams } from '@/components/admin-community/list-query';
import { OUTCOME_KIND } from '@/components/admin-community/status';
import styles from '@/components/admin-community/admin-community.module.css';
import { DetailPane, EmptyState, FeedbackNotice, GameButton, PageHeader, Pagination, SelectionTable, StatusBadge } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import {
  AUDIT_MAX_RANGE_DAYS,
  auditFilterErrorCode,
  getAuditEvent,
  listAuditEvents,
  listAuditFacets,
  type AuditEventDetail,
  type AuditEventPage,
  type AuditEventView,
  type AuditFacets,
} from '@/modules/audit/queries';

export const dynamic = 'force-dynamic';

const PATH = '/admin/audit';
const TOKEN = /^[a-z][a-z0-9_.-]{0,79}$/;
const ACTOR_KINDS = ['discord', 'local_admin', 'system', 'scheduler', 'operator', 'anonymous'] as const;

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/audit'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.audit' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Read-only, redacted audit history (administrators/owners; `audit.read`). */
export default async function AdminAuditPage({ params, searchParams }: PageProps<'/[locale]/admin/audit'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: PATH, capability: 'audit.read' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'adminCommunity.audit' });
  const tc = await getTranslations({ locale, namespace: 'adminCommunity.common' });
  const sp = (await searchParams) as SearchParams;
  const token = (name: string) => {
    const value = pickParam(sp, name);
    return value && TOKEN.test(value) ? value : undefined;
  };
  const filters = {
    from: pickDate(sp, 'from'),
    to: pickDate(sp, 'to'),
    action: token('action'),
    outcome: pickEnum(sp, 'outcome', AUDIT_OUTCOMES),
    entityType: token('entityType'),
  };
  const page = pickPage(sp);
  const selectedId = pickParam(sp, 'event');
  const db = getDb();

  let result: AuditEventPage | null = null;
  let facets: AuditFacets = { actions: [], entityTypes: [] };
  let filterError: string | null = null;
  let loadFailed = false;
  try {
    facets = await listAuditFacets(db, access.principal);
    result = await listAuditEvents(db, access.principal, {
      from: filters.from ? dayStart(filters.from) : undefined,
      to: filters.to ? nextDayStart(filters.to) : undefined,
      action: filters.action,
      outcome: filters.outcome,
      entityType: filters.entityType,
      page,
      pageSize: 25,
    });
  } catch (error) {
    filterError = auditFilterErrorCode(error);
    if (!filterError) {
      console.error(`[admin.audit] list failed: ${error instanceof Error ? error.name : 'unknown'}`);
      loadFailed = true;
    }
  }
  let detail: AuditEventDetail | null = null;
  let detailMissing = false;
  if (selectedId) {
    try {
      detail = await getAuditEvent(db, access.principal, selectedId);
    } catch {
      detail = null;
    }
    detailMissing = detail === null;
  }

  const query = { ...filters, page: page > 1 ? page : undefined };
  const eventHref = (row: AuditEventView) => queryHref(PATH, { ...query, event: row.id });
  const anyFilter = Object.values(filters).some(Boolean);
  const actionOptions = [...new Set([...facets.actions, ...(filters.action ? [filters.action] : [])])];
  const entityOptions = [...new Set([...facets.entityTypes, ...(filters.entityType ? [filters.entityType] : [])])];
  const rangeText = result
    ? t('rangeSummary', { from: formatDate(result.range.from, locale, 'dateTimeZone'), to: formatDate(result.range.to, locale, 'dateTimeZone') })
    : null;

  return (
    <div className={styles.page} data-admin-audit="">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <FilterForm
        action={PATH}
        label={t('filtersLabel')}
        selects={[
          { name: 'action', label: t('columns.action'), value: filters.action, options: actionOptions.map((action) => ({ value: action, label: action })) },
          { name: 'outcome', label: t('columns.outcome'), value: filters.outcome, options: AUDIT_OUTCOMES.map((outcome) => ({ value: outcome, label: t(`outcomes.${outcome}`) })) },
          { name: 'entityType', label: t('columns.entityType'), value: filters.entityType, options: entityOptions.map((entity) => ({ value: entity, label: entity })) },
        ]}
        dates={{ from: filters.from, to: filters.to }}
        note={t('rangeHint', { days: AUDIT_MAX_RANGE_DAYS })}
        error={filterError ? t(`filterErrors.${filterError === 'range_too_long' || filterError === 'range_inverted' || filterError === 'invalid_date' ? filterError : 'invalid_filter'}`, { days: AUDIT_MAX_RANGE_DAYS }) : undefined}
        clearHref={anyFilter ? PATH : null}
      />

      {loadFailed ? (
        <FeedbackNotice kind="error" title={tc('loadErrorTitle')}>
          {tc('loadErrorBody')}
        </FeedbackNotice>
      ) : null}
      {result ? (
        <p className={styles.actionNote} role="status">
          {t('count', { count: result.total })} · {rangeText}
        </p>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState title={anyFilter ? t('filteredEmptyTitle') : t('emptyTitle')} action={anyFilter ? <GameButton href={PATH}>{tc('clearFilters')}</GameButton> : undefined}>
          <p>{anyFilter ? t('filteredEmptyBody') : t('emptyBody')}</p>
        </EmptyState>
      ) : null}

      {result && (result.items.length > 0 || detail || detailMissing) ? (
        <div className={styles.listDetail} data-has-detail={detail || detailMissing ? '' : undefined}>
          {result.items.length > 0 ? (
            <div className={`${styles.stack} ${styles.auditTable}`}>
              <SelectionTable<AuditEventView>
                caption={t('caption')}
                captionHidden
                rows={result.items}
                getRowKey={(row) => row.id}
                getRowHref={eventHref}
                selectedKey={detail?.id ?? null}
                linkColumn="time"
                columns={[
                  {
                    key: 'time',
                    header: t('columns.time'),
                    rowHeader: true,
                    numeric: true,
                    cell: (row) => (
                      <span data-audit-row={row.action}>
                        {formatDateTimeShort(row.occurredAt, locale)}
                        <span className="visually-hidden"> – {t('showDetail')}</span>
                      </span>
                    ),
                  },
                  {
                    key: 'actor',
                    header: t('columns.actor'),
                    cell: (row) => (
                      <span className={styles.cellStack}>
                        <span>{row.actorLabel}</span>
                        <span className={styles.cellMuted}>{ACTOR_KINDS.includes(row.actorKind) ? t(`actorKinds.${row.actorKind}`) : row.actorKind}</span>
                      </span>
                    ),
                  },
                  { key: 'action', header: t('columns.action'), cell: (row) => <CodeText value={row.action} /> },
                  { key: 'capability', header: t('columns.capability'), cell: (row) => <CodeText value={row.capability} /> },
                  {
                    key: 'entity',
                    header: t('columns.entity'),
                    cell: (row) => (
                      <span className={styles.cellStack}>
                        <CodeText value={row.entityType} />
                        {row.entityId ? <span className={`${styles.cellMuted} ${styles.code}`}>{row.entityId}</span> : null}
                      </span>
                    ),
                  },
                  { key: 'locale', header: t('columns.locale'), cell: (row) => (row.locale ? row.locale.toUpperCase() : '—') },
                  { key: 'outcome', header: t('columns.outcome'), cell: (row) => <StatusBadge kind={OUTCOME_KIND[row.outcome]}>{t(`outcomes.${row.outcome}`)}</StatusBadge> },
                ]}
              />
              <Pagination page={result.page} pageCount={result.pageCount} hrefForPage={(value) => queryHref(PATH, { ...filters, page: value > 1 ? value : undefined })} />
            </div>
          ) : null}
          {detail ? (
            <DetailPane
              titleId="audit-detail-title"
              eyebrow={t('detailEyebrow')}
              title={<CodeText value={detail.action} />}
              metadata={[
                { label: t('columns.time'), value: formatDate(detail.occurredAt, locale, 'dateTimeZone') },
                { label: t('columns.outcome'), value: <StatusBadge kind={OUTCOME_KIND[detail.outcome]}>{t(`outcomes.${detail.outcome}`)}</StatusBadge> },
                { label: t('columns.actor'), value: `${detail.actorLabel} (${ACTOR_KINDS.includes(detail.actorKind) ? t(`actorKinds.${detail.actorKind}`) : detail.actorKind})` },
                { label: t('columns.capability'), value: <CodeText value={detail.capability} /> },
                { label: t('columns.entity'), value: <span className={styles.code}>{[detail.entityType, detail.entityId].filter(Boolean).join(' · ') || '—'}</span> },
                { label: t('columns.locale'), value: detail.locale ? detail.locale.toUpperCase() : '—' },
              ]}
              actions={
                <GameButton href={queryHref(PATH, query)} intent="secondary" size="sm">
                  {t('closeDetail')}
                </GameButton>
              }
            >
              <h3 className={styles.repeatHeading}>{t('summaryTitle')}</h3>
              {detail.summary.length > 0 ? (
                <dl className={styles.summaryList} data-audit-summary="">
                  {detail.summary.map((entry, index) => (
                    <div key={`${entry.key}-${index}`} className={styles.summaryRow}>
                      <dt className={styles.code}>{entry.key}</dt>
                      <dd className={styles.code}>{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className={styles.actionNote}>{t('summaryEmpty')}</p>
              )}
              {detail.summaryTruncated ? <p className={styles.actionNote}>{t('summaryTruncated')}</p> : null}
              <p className={styles.actionNote}>{t('redactionNote')}</p>
            </DetailPane>
          ) : detailMissing ? (
            <FeedbackNotice kind="warning" title={t('detailMissingTitle')}>
              {t('detailMissingBody')}
            </FeedbackNotice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
