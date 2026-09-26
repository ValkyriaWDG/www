import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { denialCode } from '@/modules/access/policy';
import { getActor } from '@/modules/access/server';
import { recordAdminDenial } from '@/modules/auth/admin-guard';
import { AdminNav } from '@/components/admin/admin-nav';
import styles from '@/components/admin/admin.module.css';
import { permittedAdminModules } from '@/modules/auth/admin-modules';
import { AccessDeniedPanel } from '@/modules/auth/ui/access-denied';
import { AdminSignInRedirect } from '@/modules/auth/ui/admin-sign-in-redirect';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: LayoutProps<'/[locale]/admin'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'admin.overview' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Admin shell and first server-side guard. It never renders `children` for an actor
 * without verified `admin.access`: anonymous visitors are redirected to the localized
 * login with the exact admin path, others see the localized denial. Layouts are not
 * re-rendered on client navigation, so every admin page must still call
 * `requireAdminPage` itself. Navigation lists only permitted modules.
 */
export default async function AdminLayout({ children, params }: LayoutProps<'/[locale]/admin'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const actor = await getActor('read');
  if (actor.kind === 'anonymous') return <AdminSignInRedirect locale={locale} />;
  const code = denialCode(actor, 'admin.access');
  if (code) {
    await recordAdminDenial(actor, 'admin.access', code);
    return <AccessDeniedPanel locale={locale} code={code} />;
  }

  const t = await getTranslations({ locale, namespace: 'admin.shell' });
  const tModules = await getTranslations({ locale, namespace: 'admin.overview.modules' });
  const modules = permittedAdminModules(actor);
  // Quiet static admin chrome: module navigation (permitted modules only) + account links.
  return (
    <div className={styles.shell} data-admin-shell="">
      <header className={styles.bar}>
        <a className={styles.brand} href={`/${locale}/admin`}>
          <span aria-hidden="true">{'//'}</span>
          {t('title')}
        </a>
        <AdminNav
          label={t('navLabel')}
          testId="admin-nav"
          items={[
            { key: 'overview', href: '/admin', label: t('overview') },
            ...modules.map((module) => ({ key: module.key, href: module.path, label: tModules(`${module.key}.title`) })),
          ]}
        />
        <div className={styles.barEnd}>
          <AdminNav
            label={t('account')}
            items={[
              { key: 'account', href: '/account', label: t('account') },
              { key: 'website', href: '/', label: t('website') },
            ]}
          />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}
