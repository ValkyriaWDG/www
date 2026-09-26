'use client';

import { useTranslations } from 'next-intl';

/** Route-level failure: keeps the document and offers a retry without leaking details. */
export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('common.states');
  return (
    <main id="main-content" className="status-panel" role="alert" tabIndex={-1}>
      <h1>{t('errorTitle')}</h1>
      <p>{t('errorBody')}</p>
      <button type="button" className="status-retry" onClick={() => reset()}>
        {t('retry')}
      </button>
    </main>
  );
}
