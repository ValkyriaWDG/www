import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { GameButton } from '@/components/ui/game-button';
import { EmptyState, FeedbackNotice, StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { can } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { permittedAdminModules } from '@/modules/auth/admin-modules';
import { listOwnDrafts, listScheduleOverview, type OwnDraftItem, type ScheduleOverviewItem } from '@/modules/content/admin-queries';
import { getPublisherStatus, type PublisherStatus } from '@/modules/content/schedule';

export const dynamic = 'force-dynamic';

type EditorialOverview = { drafts: OwnDraftItem[]; schedules: ScheduleOverviewItem[]; publisher: PublisherStatus } | { error: true };

/**
 * Administration overview: the modules this actor may actually use plus real actionable
 * editorial items (own unpublished drafts, scheduled/overdue publications and schedules
 * needing re-approval). No invented metrics; loading failures are stated explicitly.
 */
export default async function AdminOverviewPage({ params }: PageProps<'/[locale]/admin'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'admin.overview' });
  const tEditorial = await getTranslations({ locale, namespace: 'adminEditorial' });
  const modules = permittedAdminModules(access.principal);
  let editorial: EditorialOverview | null = null;
  if (can(access.principal, 'content.read_private')) {
    const db = getDb();
    try {
      const [drafts, schedules, publisher] = await Promise.all([
        listOwnDrafts(db, access.principal, 8),
        listScheduleOverview(db, access.principal, { limit: 8 }),
        getPublisherStatus(db, access.principal),
      ]);
      editorial = { drafts, schedules, publisher };
    } catch {
      editorial = { error: true };
    }
  }
  const editPath = (item: { kind: 'news' | 'page' | 'manual'; documentId: string; locale: 'cs' | 'en' }) =>
    `${item.kind === 'news' ? '/admin/news' : item.kind === 'manual' ? '/admin/manual' : '/admin/content'}/${item.documentId}?lang=${item.locale}`;

  return (
    <section aria-labelledby="admin-overview-title" className={styles.stack}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h1 id="admin-overview-title">{t('title')}</h1>
          <p className={styles.lead}>{t('intro', { name: access.principal.label })}</p>
        </div>
        {can(access.principal, 'content.edit') ? (
          <GameButton href="/admin/news/new" intent="primary">
            {tEditorial('list.newPost')}
          </GameButton>
        ) : null}
      </div>

      {editorial && 'error' in editorial ? (
        <FeedbackNotice kind="error" title={t('items.loadFailed')} live={false} />
      ) : null}
      {editorial && !('error' in editorial) && editorial.publisher.stalled ? (
        <FeedbackNotice kind="warning" title={tEditorial('publisher.stalledTitle')} live={false}>
          {tEditorial('publisher.stalledBody', { count: editorial.publisher.counts.overdue })}
        </FeedbackNotice>
      ) : null}

      {editorial && !('error' in editorial) ? (
        <div className={styles.overviewGrid}>
          <div className={styles.panel} data-testid="overview-drafts">
            <h2 className={styles.panelTitle}>{t('items.draftsTitle')}</h2>
            <div className={styles.panelBody}>
              {editorial.drafts.length === 0 ? (
                <p className={styles.muted} style={{ margin: 0 }}>
                  {t('items.draftsEmpty')}
                </p>
              ) : (
                <ul className={styles.itemList}>
                  {editorial.drafts.map((item) => (
                    <li key={item.translationId}>
                      <Link className={styles.textLink} href={editPath(item)} lang={item.locale}>
                        {item.title || tEditorial('list.untitled')}
                      </Link>
                      <span className={`${styles.small} ${styles.muted}`}>
                        {tEditorial(`common.languages.${item.locale}`)} · {item.published ? tEditorial('states.published_with_changes') : tEditorial('states.draft')} ·{' '}
                        {formatDate(item.updatedAt, locale, 'dateTime')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className={styles.panel} data-testid="overview-schedules">
            <h2 className={styles.panelTitle}>{t('items.schedulesTitle')}</h2>
            <div className={styles.panelBody}>
              {editorial.schedules.length === 0 ? (
                <p className={styles.muted} style={{ margin: 0 }}>
                  {t('items.schedulesEmpty')}
                </p>
              ) : (
                <ul className={styles.itemList}>
                  {editorial.schedules.map((item) => (
                    <li key={item.scheduleId} data-schedule-state={item.state}>
                      <Link className={styles.textLink} href={editPath(item)} lang={item.locale}>
                        {item.title || tEditorial('list.untitled')}
                      </Link>
                      <span className={styles.row}>
                        <StatusBadge kind={item.needsReapproval ? 'danger' : item.overdue ? 'warning' : 'info'}>
                          {item.needsReapproval ? t('items.needsReapproval') : item.overdue ? tEditorial('warnings.overdue') : item.live ? tEditorial('states.published_update_scheduled') : tEditorial('states.scheduled')}
                        </StatusBadge>
                        <span className={`${styles.small} ${styles.muted}`}>
                          {tEditorial(`common.languages.${item.locale}`)} · {formatDate(item.dueAt, locale, 'dateTimeZone', item.timeZone)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <h2 className={styles.eyebrow} style={{ marginTop: 'var(--space-3)' }}>
        {t('modulesTitle')}
      </h2>
      {modules.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <ul className={styles.moduleGrid} data-testid="admin-modules">
          {modules.map((module) => (
            <li key={module.key} data-testid={`admin-module-${module.key}`}>
              <Link className={styles.moduleLink} href={module.path}>
                <span className={styles.moduleName}>{t(`modules.${module.key}.title`)}</span>
                <span className={`${styles.small} ${styles.muted}`}>{t(`modules.${module.key}.description`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
