import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { permittedAdminModules } from '@/modules/auth/admin-modules';
import styles from '@/modules/auth/ui/auth.module.css';

export const dynamic = 'force-dynamic';

/** Administration overview: the modules this actor may actually use (no invented metrics). */
export default async function AdminOverviewPage({ params }: PageProps<'/[locale]/admin'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'admin.overview' });
  const modules = permittedAdminModules(access.principal);
  return (
    <section aria-labelledby="admin-overview-title" className={`${styles.panel} ${styles.wide}`}>
      <h1 id="admin-overview-title" className={styles.title}>
        {t('title')}
      </h1>
      <p className={styles.muted}>{t('intro', { name: access.principal.label })}</p>
      <h2 className={styles.subtitle}>{t('modulesTitle')}</h2>
      {modules.length === 0 ? (
        <p className={styles.lead}>{t('empty')}</p>
      ) : (
        <ul className={styles.moduleList} data-testid="admin-modules">
          {modules.map((module) => (
            <li key={module.key} data-testid={`admin-module-${module.key}`}>
              <a href={`/${locale}${module.path}`}>
                <span className={styles.moduleName}>{t(`modules.${module.key}.title`)}</span>
                <span className={styles.moduleDescription}>{t(`modules.${module.key}.description`)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
