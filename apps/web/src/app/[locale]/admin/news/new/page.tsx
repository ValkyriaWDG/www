import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { NewPostForm } from '@/components/admin/new-post-form';
import { GuardedLink } from '@/components/shell/guarded-link';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/news/new'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.new' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** New post: choose the content language and title; the editor opens on the created draft. */
export default async function NewPostPage({ params }: PageProps<'/[locale]/admin/news/new'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/news/new', capability: 'content.edit' });
  if (!access.ok) return access.denied;
  const t = await getTranslations({ locale, namespace: 'adminEditorial' });
  return (
    <section aria-labelledby="new-post-heading" className={styles.stack}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <GuardedLink href="/admin/news" className={styles.textLink}>
              {t('list.title')}
            </GuardedLink>
          </p>
          <h1 id="new-post-heading">{t('new.title')}</h1>
          <p className={styles.lead}>{t('new.lead')}</p>
        </div>
      </div>
      <NewPostForm uiLocale={locale} />
    </section>
  );
}
