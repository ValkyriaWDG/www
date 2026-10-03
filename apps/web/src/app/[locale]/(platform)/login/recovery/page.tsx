import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getServerEnv } from '@/lib/env';
import { sanitizeReturnPath } from '@/modules/access/return-path';
import styles from '@/modules/auth/ui/auth.module.css';
import { AuthScene, Panel, PanelHeading } from '@/modules/auth/ui/panels';
import { RecoveryForm } from '@/modules/auth/ui/recovery-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/login/recovery'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !getServerEnv().LOCAL_ADMIN_LOGIN_ENABLED) return {};
  const t = await getTranslations({ locale, namespace: 'auth.meta' });
  return { title: t('recovery'), robots: { index: false, follow: false } };
}

/** Local administrator recovery sign-in; does not exist unless the operator enabled it. */
export default async function RecoveryPage({ params, searchParams }: PageProps<'/[locale]/login/recovery'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  if (!getServerEnv().LOCAL_ADMIN_LOGIN_ENABLED) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const returnTo = sanitizeReturnPath(Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo, locale);
  const t = await getTranslations({ locale, namespace: 'auth.recovery' });
  return (
    <AuthScene>
      <Panel labelledBy="recovery-title">
        <PanelHeading id="recovery-title" eyebrow={t('eyebrow')} title={t('title')} crest />
        <p className={styles.muted}>{t('intro')}</p>
        <RecoveryForm locale={locale} returnTo={returnTo} />
        <hr className={styles.divider} />
        <a className={styles.textLink} href={`/${locale}/login`}>
          {t('backToLogin')}
        </a>
      </Panel>
    </AuthScene>
  );
}
