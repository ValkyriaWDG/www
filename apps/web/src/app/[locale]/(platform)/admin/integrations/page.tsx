import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import base from '@/components/admin-community/admin-community.module.css';
import { formatDate } from '@/components/admin-community/format';
import styles from '@/components/admin-integrations/admin-integrations.module.css';
import { HealthSections } from '@/components/admin-integrations/health-sections';
import { ServerPresentationForm } from '@/components/admin-integrations/server-presentation-form';
import { FeedbackNotice, PageHeader } from '@/components/ui';
import { RefreshIcon } from '@/components/ui/icons';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';
import { getIntegrationHealthForAdmin } from '@/modules/integrations/admin-health';
import type { AdminIntegrationHealth } from '@/modules/integrations/admin-health-types';
import { getSettingsForAdmin, type AdminSetting } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';

const PATH = '/admin/integrations';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/integrations'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminIntegrations' });
  return adminPageMetadata({ locale, title: t('metaTitle'), capability: 'settings.manage' });
}

/**
 * Integration health and server presentation (administrators/owners; `settings.manage`).
 * Server-rendered on every request (no client polling): the refresh link reloads the
 * page. The only outbound call is the bounded, cached server-status provider.
 */
export default async function AdminIntegrationsPage({ params }: PageProps<'/[locale]/admin/integrations'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: PATH, capability: 'settings.manage' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'adminIntegrations' });
  let health: AdminIntegrationHealth | null = null;
  let presentation: AdminSetting | null = null;
  try {
    const db = getDb();
    const [loaded, settings] = await Promise.all([getIntegrationHealthForAdmin(db, access.principal, getServerEnv()), getSettingsForAdmin(db, access.principal)]);
    health = loaded;
    presentation = settings.find((setting) => setting.key === 'servers.presentation') ?? { key: 'servers.presentation', value: null, version: 0, updatedAt: null, invalid: false };
  } catch (error) {
    console.error(`[admin.integrations] load failed: ${error instanceof Error ? error.name : 'unknown'}`);
  }

  return (
    <div className={base.page} data-admin-integrations="">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <FeedbackNotice kind="info" title={t('scopeNotice.title')} live={false}>
        {t('scopeNotice.body')}
      </FeedbackNotice>
      {health && presentation ? (
        <div className={styles.sections}>
          <div className={styles.meta}>
            <a className={styles.refresh} href={`/${locale}${PATH}`} data-integrations-refresh="">
              <RefreshIcon size={16} />
              <span>{t('refresh')}</span>
            </a>
            <span>{t('generatedAt', { time: formatDate(health.generatedAt, locale, 'dateTimeZone') })}</span>
            <span>{t('contract', { version: health.contractVersion })}</span>
          </div>
          <section className={base.panel} aria-labelledby="integrations-servers-title" data-integrations-servers="">
            <h2 id="integrations-servers-title" className={base.panelTitle}>
              {t('servers.title')}
            </h2>
            <p className={base.actionNote}>{t('servers.intro')}</p>
            <ServerPresentationForm uiLocale={locale} games={health.servers} initial={presentation} />
          </section>
          <HealthSections locale={locale} health={health} />
        </div>
      ) : (
        <FeedbackNotice kind="error" title={t('loadErrorTitle')}>
          {t('loadErrorBody')}
        </FeedbackNotice>
      )}
    </div>
  );
}
