import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DiscordPanel, HllPanel } from '@/components/public/community-blocks';
import { CorePage } from '@/components/public/core-page';
import { corePageMetadata, loadCorePage } from '@/components/public/core-page-data';
import { PRESSKIT_KEY_ART } from '@/components/public/presskit';
import { PresskitFigure } from '@/components/public/presskit-figure';
import pageStyles from '@/components/public/pages.module.css';
import publicStyles from '@/components/public/public.module.css';
import { getShellLinks } from '@/components/shell/shell-config';
import { GameButton } from '@/components/ui/game-button';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]/clan'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return corePageMetadata(locale, 'clan');
}

/** Clan story (published page) with Discord, HLL website and next-step links. */
export default async function ClanPage({ params }: PageProps<'/[locale]/clan'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [page, links, t, nav] = await Promise.all([
    loadCorePage(locale, 'clan'),
    getShellLinks(),
    getTranslations({ locale, namespace: 'pages.clan' }),
    getTranslations({ locale, namespace: 'common.nav' }),
  ]);
  return (
    <CorePage
      locale={locale}
      pageKey="clan"
      page={page}
      before={<PresskitFigure image={PRESSKIT_KEY_ART} locale={locale} caption={t('gameArtCaption')} />}
      after={
        <>
          <div className={publicStyles.linkPanels}>
            <DiscordPanel locale={locale} url={links.discordUrl} />
            <HllPanel locale={locale} url={links.hllUrl} archiveUrl={links.hllArchiveUrl} />
          </div>
          <nav className={pageStyles.nextSteps} aria-labelledby="clan-next-steps">
            <h2 id="clan-next-steps" className={pageStyles.nextStepsTitle}>
              {t('actionsTitle')}
            </h2>
            <ul className={pageStyles.nextStepsList}>
              <li>
                <GameButton href="/members">{nav('members')}</GameButton>
              </li>
              <li>
                <GameButton href="/matches">{nav('matches')}</GameButton>
              </li>
              <li>
                <GameButton href="/news">{nav('news')}</GameButton>
              </li>
            </ul>
          </nav>
        </>
      }
    />
  );
}
