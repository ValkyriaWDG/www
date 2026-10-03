import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { NewPostForm } from '@/components/admin/new-post-form';
import { creatableScopes } from '@/components/admin/scope-options';
import { GuardedLink } from '@/components/shell/guarded-link';
import { routing } from '@/i18n/routing';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/manual/new'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.manual' });
  return adminPageMetadata({ locale, title: t('newTitle'), capability: 'content.edit', game: 'hell-let-loose' });
}

/** New Field Manual article: content language, game and title; the editor opens on the draft. */
export default async function NewManualArticlePage({ params }: PageProps<'/[locale]/admin/manual/new'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/manual/new', capability: 'content.edit', game: 'hell-let-loose' });
  if (!access.ok) return access.denied;
  const t = await getTranslations({ locale, namespace: 'adminEditorial.manual' });
  return (
    <section aria-labelledby="new-manual-heading" className={styles.stack}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <GuardedLink href="/admin/manual" className={styles.textLink}>
              {t('title')}
            </GuardedLink>
          </p>
          <h1 id="new-manual-heading">{t('newTitle')}</h1>
          <p className={styles.lead}>{t('newLead')}</p>
        </div>
      </div>
      <NewPostForm uiLocale={locale} kind="manual" basePath="/admin/manual" scopes={await creatableScopes(locale, access.principal, 'manual')} />
    </section>
  );
}
