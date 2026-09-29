import { getTranslations } from 'next-intl/server';
import { CommunityChoices, CommunityLinks, HllPanel, SignInExplainer } from '@/components/public/community-blocks';
import { CorePage } from '@/components/public/core-page';
import { loadCorePage } from '@/components/public/core-page-data';
import { PRESSKIT_FLYING } from '@/components/public/presskit';
import { PresskitFigure } from '@/components/public/presskit-figure';
import { getShellLinks } from '@/components/shell/shell-config';
import type { AppLocale } from '@/i18n/routing';
import { getSiteConfig } from '@/lib/site-config';
import type { GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';

/**
 * Community / recruitment: reference-11 choices (DISCORD / HOW TO JOIN), the
 * Discord-vs-sign-in explanation, the published community guide, approved community links
 * and the HLL website. The Wardogs recruitment illustration stays out of the HLL frame.
 */
export async function CommunityScreen({ locale, game }: { locale: AppLocale; game: GameRoute | null }) {
  const [page, links, config, t, games] = await Promise.all([
    loadCorePage(locale, 'community'),
    getShellLinks(),
    getSiteConfig(),
    getTranslations({ locale, namespace: 'pages.community' }),
    getTranslations({ locale, namespace: 'games' }),
  ]);
  return (
    <CorePage
      locale={locale}
      pageKey="community"
      page={page}
      home={game ? { href: sectionBase(game), label: games(`menuLabel.${game}`) } : undefined}
      before={
        <>
          <CommunityChoices locale={locale} discordUrl={links.discordUrl} guideAnchor={page ? 'community-content' : 'community-title'} />
          {game === 'hll' ? null : <PresskitFigure image={PRESSKIT_FLYING} locale={locale} caption={t('recruitArtCaption')} />}
          <SignInExplainer locale={locale} />
        </>
      }
      after={
        <>
          <CommunityLinks locale={locale} links={config?.communityLinks ?? []} />
          <HllPanel locale={locale} game={game} url={links.hllUrl} archiveUrl={links.hllArchiveUrl} />
        </>
      }
    />
  );
}
