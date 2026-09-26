'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { EmptyState, FeedbackNotice } from '@/components/ui/panels';
import { useRouter } from '@/i18n/navigation';
import { addTranslationAction } from '@/modules/content/actions';

/**
 * The requested content language has no translation yet. Adding it creates an EMPTY
 * draft in that language only; nothing is copied, machine-translated or published.
 */
export function MissingTranslation({
  documentId,
  locale,
  basePath,
  pageKey,
  existing,
}: {
  documentId: string;
  locale: 'cs' | 'en';
  basePath: string;
  pageKey: string | null;
  existing: 'cs' | 'en' | null;
}) {
  const t = useTranslations('adminEditorial.missing');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setPending(true);
    setError(null);
    const result = await addTranslationAction({ documentId, locale, ...(pageKey ? { slug: pageKey } : {}) }).catch(() => ({ ok: false as const, code: 'unavailable' as const }));
    if (result.ok || result.code === 'conflict') {
      router.refresh();
      return;
    }
    setPending(false);
    setError(result.code);
  };

  return (
    <div data-testid="missing-translation">
      {error ? (
        <FeedbackNotice kind="error" title={t('failed')}>
          {tErrors(error as 'unexpected')}
        </FeedbackNotice>
      ) : null}
      <EmptyState
        title={t('title', { locale })}
        action={
          <>
            <GameButton intent="primary" onClick={() => void add()} pending={pending} pendingLabel={t('adding')} data-testid={`add-translation-${locale}`}>
              {t('add', { locale })}
            </GameButton>
            {existing ? (
              <GameButton href={`${basePath}/${documentId}?lang=${existing}`} intent="secondary">
                {t('back', { locale: existing })}
              </GameButton>
            ) : null}
          </>
        }
      >
        {t('body', { locale })}
      </EmptyState>
    </div>
  );
}
