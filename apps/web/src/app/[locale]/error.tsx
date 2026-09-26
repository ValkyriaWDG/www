'use client';

import { useTranslations } from 'next-intl';
import { PageMain } from '@/components/shell/page-main';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice, PageHeader } from '@/components/ui/panels';

/** Route-level failure: keeps the shell/navigation and offers a retry without leaking details. */
export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('common.states');
  return (
    <PageMain width="reading">
      <PageHeader title={t('errorTitle')} />
      <FeedbackNotice
        kind="error"
        title={t('loadError')}
        action={
          <GameButton intent="primary" onClick={() => reset()} data-retry="">
            {t('retry')}
          </GameButton>
        }
      >
        <p>{t('errorBody')}</p>
      </FeedbackNotice>
      <p style={{ marginTop: 'var(--space-5)' }}>
        <GameButton href="/" intent="secondary">
          {t('backHome')}
        </GameButton>
      </p>
    </PageMain>
  );
}
