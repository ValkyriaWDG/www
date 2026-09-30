import { getTranslations } from 'next-intl/server';
import { DiscordPanel } from '@/components/public/community-blocks';
import { CorePage } from '@/components/public/core-page';
import { loadCorePage } from '@/components/public/core-page-data';
import pageStyles from '@/components/public/pages.module.css';
import publicStyles from '@/components/public/public.module.css';
import { getShellLinks } from '@/components/shell/shell-config';
import { GameButton } from '@/components/ui/game-button';
import type { AppLocale } from '@/i18n/routing';
import { headingOutline, outlineAnchors } from '@/modules/content/rich-text/render';
import type { GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';

/**
 * Frequently asked questions: the shared published `faq` page, edited and published per
 * language like the other core pages. Each level-2 heading is one question in the
 * editor's order; the index links to its answer. Canonical URL `/faq`; the HLL section
 * shows the same page in its frame.
 */
export async function FaqScreen({ locale, game }: { locale: AppLocale; game: GameRoute | null }) {
  const [page, links, t, games] = await Promise.all([
    loadCorePage(locale, 'faq'),
    getShellLinks(),
    getTranslations({ locale, namespace: 'pages.faq' }),
    getTranslations({ locale, namespace: 'games' }),
  ]);
  const outline = page ? headingOutline(page.body) : [];
  const questions = outline.filter((entry) => entry.level === 2);
  const base = sectionBase(game);
  return (
    <CorePage
      locale={locale}
      pageKey="faq"
      page={page}
      home={game ? { href: base, label: games(`menuLabel.${game}`) } : undefined}
      eyebrow={game ? games(`eyebrow.${game}`) : undefined}
      anchors={outlineAnchors(outline)}
      before={
        page && questions.length > 1 ? (
          <nav className={pageStyles.faqIndex} aria-labelledby="faq-index-title" data-faq-index="">
            <h2 id="faq-index-title" className={pageStyles.nextStepsTitle}>
              {t('indexTitle')}
            </h2>
            <ol className={pageStyles.faqIndexList} lang={page.locale}>
              {questions.map((question) => (
                <li key={question.id}>
                  <a href={`#${question.id}`}>{question.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : undefined
      }
      after={
        <>
          <div className={publicStyles.linkPanels}>
            <DiscordPanel locale={locale} url={links.discordUrl} />
          </div>
          <nav className={pageStyles.nextSteps} aria-labelledby="faq-next-steps">
            <h2 id="faq-next-steps" className={pageStyles.nextStepsTitle}>
              {t('actionsTitle')}
            </h2>
            <ul className={pageStyles.nextStepsList}>
              <li>
                <GameButton href={`${base}/community`}>{t('joinAction')}</GameButton>
              </li>
              {game === 'hll' ? (
                <li>
                  <GameButton href={`${base}/field-manual`}>{games('hll.menu.field-manual')}</GameButton>
                </li>
              ) : null}
            </ul>
          </nav>
        </>
      }
    />
  );
}
