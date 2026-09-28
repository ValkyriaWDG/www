import { getTranslations } from 'next-intl/server';
import { MenuShell } from '@/components/shell/menu-shell';
import { PageMain } from '@/components/shell/page-main';
import { GameButton } from '@/components/ui/game-button';
import { PageHeader } from '@/components/ui/panels';
import { getHeaderAccountState } from '@/modules/auth/header-state';

/**
 * Localized 404 for paths rejected above the route groups (for example an unknown game
 * segment such as `/cs/foo`). It renders the shared frame itself because no group layout
 * wraps it; group-level 404s use their own frame.
 */
export default async function LocaleNotFound() {
  const [t, account] = await Promise.all([getTranslations('common.states'), getHeaderAccountState()]);
  return (
    <MenuShell account={account} presentation="platform">
      <PageMain width="reading" labelledBy="not-found-title">
        <PageHeader eyebrow="404" title={t('notFoundTitle')} titleId="not-found-title" description={<p>{t('notFoundBody')}</p>} />
        <GameButton href="/" intent="primary" data-not-found-home="">
          {t('backHome')}
        </GameButton>
      </PageMain>
    </MenuShell>
  );
}
