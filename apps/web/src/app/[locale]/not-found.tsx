import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Localized 404 for unknown or unpublished routes under `/cs` and `/en`. */
export default async function LocaleNotFound() {
  const t = await getTranslations('common.states');
  return (
    <main id="main-content" className="status-panel" aria-labelledby="not-found-title" tabIndex={-1}>
      <p className="status-code">404</p>
      <h1 id="not-found-title">{t('notFoundTitle')}</h1>
      <p>{t('notFoundBody')}</p>
      <Link href="/">{t('backHome')}</Link>
    </main>
  );
}
