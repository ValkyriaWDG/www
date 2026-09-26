import { getTranslations } from 'next-intl/server';
import { PageMain } from '@/components/shell/page-main';
import { GameButton } from '@/components/ui/game-button';
import { PageHeader } from '@/components/ui/panels';

/** Localized 404 for unknown or unpublished routes under `/cs` and `/en`, inside the shell. */
export default async function LocaleNotFound() {
  const t = await getTranslations('common.states');
  return (
    <PageMain width="reading" labelledBy="not-found-title">
      <PageHeader eyebrow="404" title={t('notFoundTitle')} titleId="not-found-title" description={<p>{t('notFoundBody')}</p>} />
      <GameButton href="/" intent="primary" data-not-found-home="">
        {t('backHome')}
      </GameButton>
    </PageMain>
  );
}
