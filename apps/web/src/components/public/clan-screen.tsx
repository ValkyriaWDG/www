import { getTranslations } from 'next-intl/server';
import { DiscordPanel, HllPanel } from '@/components/public/community-blocks';
import { CorePage } from '@/components/public/core-page';
import { loadCorePage } from '@/components/public/core-page-data';
import { PRESSKIT_KEY_ART } from '@/components/public/presskit';
import { PresskitFigure } from '@/components/public/presskit-figure';
import pageStyles from '@/components/public/pages.module.css';
import publicStyles from '@/components/public/public.module.css';
import { getShellLinks } from '@/components/shell/shell-config';
import { GameButton } from '@/components/ui/game-button';
import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import { gameMenu, sectionBase } from '@/modules/games/routes';

/**
 * Clan story (the shared published `clan` page) with Discord, HLL website and next-step
 * links. One clan identity serves every frame; its canonical URL stays `/clan`. Wardogs
 * key art appears only in the shared and Wardogs frames, never in the HLL section.
 */
export async function ClanScreen({ locale, game }: { locale: AppLocale; game: GameRoute | null }) {
  const [page, links, t, nav, games] = await Promise.all([
    loadCorePage(locale, 'clan'),
    getShellLinks(),
    getTranslations({ locale, namespace: 'pages.clan' }),
    getTranslations({ locale, namespace: 'common.nav' }),
    getTranslations({ locale, namespace: 'games' }),
  ]);
  const base = sectionBase(game);
  const nextSteps =
    game === 'hll'
      ? gameMenu('hll').filter((item) => item.section !== 'clan')
      : (['members', 'matches', 'news'] as const).map((section) => ({ section, href: `${base}/${section}` }));
  return (
    <CorePage
      locale={locale}
      pageKey="clan"
      page={page}
      home={game ? { href: base, label: games(`menuLabel.${game}`) } : undefined}
      before={game === 'hll' ? undefined : <PresskitFigure image={PRESSKIT_KEY_ART} locale={locale} caption={t('gameArtCaption')} />}
      after={
        <>
          <div className={publicStyles.linkPanels}>
            <DiscordPanel locale={locale} url={links.discordUrl} />
            {game === 'wardogs' ? null : <HllPanel locale={locale} url={links.hllUrl} archiveUrl={links.hllArchiveUrl} />}
          </div>
          <nav className={pageStyles.nextSteps} aria-labelledby="clan-next-steps">
            <h2 id="clan-next-steps" className={pageStyles.nextStepsTitle}>
              {t('actionsTitle')}
            </h2>
            <ul className={pageStyles.nextStepsList}>
              {nextSteps.map((item) => (
                <li key={item.section}>
                  <GameButton href={item.href}>{game === 'hll' ? games(`hll.menu.${item.section}`) : nav(item.section as 'members' | 'matches' | 'news')}</GameButton>
                </li>
              ))}
            </ul>
          </nav>
        </>
      }
    />
  );
}
