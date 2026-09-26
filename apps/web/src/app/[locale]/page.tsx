import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Bootstrap home route; replaced by the Wardogs main menu in the visual-shell slice. */
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale as 'cs' | 'en');
  const t = await getTranslations('common');
  return (
    <main id="main-content" className="status-panel" tabIndex={-1}>
      <h1>{t('site.name')}</h1>
      <p>{t('site.description')}</p>
      <nav aria-label="Language">
        <Link href="/" locale="cs">
          Čeština
        </Link>{' '}
        ·{' '}
        <Link href="/" locale="en">
          English
        </Link>
      </nav>
    </main>
  );
}
