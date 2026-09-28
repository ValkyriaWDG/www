import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SettingsForm } from '@/components/admin-community/settings-form';
import styles from '@/components/admin-community/admin-community.module.css';
import { SceneFallback } from '@/components/shell/scene-fallback';
import { FeedbackNotice, PageHeader } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { siteConfigDefaultsFromEnv } from '@/modules/settings/public';
import { backgroundAllowedOrigins } from '@/modules/settings/schemas';
import { getSettingsForAdmin, type AdminSetting } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/settings'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.settings' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Public site settings (administrators/owners only; `settings.manage`). */
export default async function AdminSettingsPage({ params }: PageProps<'/[locale]/admin/settings'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/settings', capability: 'settings.manage' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'adminCommunity.settings' });
  const tc = await getTranslations({ locale, namespace: 'adminCommunity.common' });
  let settings: AdminSetting[] | null = null;
  try {
    settings = await getSettingsForAdmin(getDb(), access.principal);
  } catch (error) {
    console.error(`[admin.settings] load failed: ${error instanceof Error ? error.name : 'unknown'}`);
  }
  const envDefaults = siteConfigDefaultsFromEnv();

  return (
    <div className={styles.page} data-admin-settings="">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {settings ? (
        <SettingsForm
          uiLocale={locale}
          initial={settings}
          defaults={{ discordInviteUrl: envDefaults.discordInviteUrl, background: envDefaults.background }}
          allowedOrigins={backgroundAllowedOrigins()}
          fallbackScene={<SceneFallback />}
        />
      ) : (
        <FeedbackNotice kind="error" title={tc('loadErrorTitle')}>
          {tc('loadErrorBody')}
        </FeedbackNotice>
      )}
    </div>
  );
}
