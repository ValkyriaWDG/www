import { getTranslations } from 'next-intl/server';
import { FeedbackNotice, GameButton } from '@/components/ui';
import type { AppLocale } from '@/i18n/routing';
import type { PublicPlayerAvailability } from '@/modules/integrations/logi-public-players';

/** A failed current observation is never presented as a confirmed empty roster. */
export async function PublicPlayerDirectoryNotice({ locale, availability, retryHref }: { locale: AppLocale; availability: PublicPlayerAvailability; retryHref: string }) {
  if (availability.state === 'complete' || availability.state === 'disabled') return null;
  const t = await getTranslations({ locale, namespace: 'members.list' });
  return <div data-public-player-availability={availability.state}>
    <FeedbackNotice kind="warning" title={t(availability.state === 'partial' ? 'sourcePartialTitle' : 'sourceUnavailableTitle')}
      action={<GameButton href={retryHref} intent="secondary" size="sm">{t('retry')}</GameButton>}>
      <p>{t(availability.state === 'partial' ? 'sourcePartialBody' : 'sourceUnavailableBody')}</p>
    </FeedbackNotice>
  </div>;
}
