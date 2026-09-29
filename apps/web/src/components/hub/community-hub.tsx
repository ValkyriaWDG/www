import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { HLL_MARK, WARDOGS_MARK } from '@/components/public/presskit';
import { getShellLinks } from '@/components/shell/shell-config';
import { ExternalIcon } from '@/components/ui/icons';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { getLatestNewsTeaser } from '@/modules/content/public';
import type { NewsSummary } from '@/modules/content/types';
import { GAME_ROUTES, gameRouteFromDb, type GameRoute } from '@/modules/games/registry';
import { canonicalNewsPath, gamePath } from '@/modules/games/routes';
import emblem from '../../../public/brand/valkyria-emblem-733.webp';
import styles from './hub.module.css';

async function loadLatestNews(locale: AppLocale): Promise<NewsSummary | null> {
  try {
    if (!getServerEnv().DATABASE_URL) return null;
    return await getLatestNewsTeaser(locale, getDb());
  } catch {
    return null;
  }
}

/**
 * Community hub: Valkyria identity, one large entry per game (full game names, real
 * links, no invented counters), then the shared community destinations and the latest
 * published post of any scope. Game artwork is used only for its own game.
 */
export async function CommunityHub({ locale }: { locale: AppLocale }) {
  const [t, games, links, latest] = await Promise.all([
    getTranslations({ locale, namespace: 'games.hub' }),
    getTranslations({ locale, namespace: 'games' }),
    getShellLinks(),
    loadLatestNews(locale),
  ]);
  const external = (await getTranslations({ locale, namespace: 'common.external' }))('suffix');
  const common = await getTranslations({ locale, namespace: 'home.cta' });
  return (
    <main id="main-content" tabIndex={-1} className={styles.hub} aria-labelledby="hub-title">
      <header className={styles.intro}>
        <Image src={emblem} alt="" className={styles.crest} sizes="96px" priority />
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h1 id="hub-title" className={styles.title}>
            {t('heading')}
          </h1>
          <p className={styles.lead}>{t('intro')}</p>
        </div>
      </header>

      <section aria-labelledby="hub-games" className={styles.games}>
        <h2 id="hub-games" className={styles.sectionTitle}>
          {t('choose')}
        </h2>
        <ul className={styles.gameList}>
          {GAME_ROUTES.map((game: GameRoute) => (
            <li key={game} className={styles.gameItem}>
              <Link href={gamePath(game)} className={styles.gameCard} data-theme-preview={game} data-hub-game={game} aria-describedby={`hub-game-${game}-body`}>
                <span className={styles.gameVisual} aria-hidden="true">
                  {/* Official game marks; the card text below carries the localized game name. */}
                  {game === 'wardogs' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- unchanged presskit SVG wordmark
                    <img className={styles.gameMark} src={WARDOGS_MARK.src} width={WARDOGS_MARK.width} height={WARDOGS_MARK.height} alt="" data-game-mark="wardogs" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- unchanged official SVG full mark
                    <img className={styles.gameMark} src={HLL_MARK.src} width={HLL_MARK.width} height={HLL_MARK.height} alt="" data-game-mark="hll" />
                  )}
                </span>
                <span className={styles.gameText}>
                  <span className={styles.gameName}>{games(`names.${game}`)}</span>
                  <span id={`hub-game-${game}-body`} className={styles.gameBody}>
                    {t(`cards.${game}.body`)}
                  </span>
                  <span className={styles.gameCta}>{t(`cards.${game}.cta`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.lower}>
        <nav aria-labelledby="hub-shared" className={styles.shared}>
          <h2 id="hub-shared" className={styles.sectionTitle}>
            {t('shared.title')}
          </h2>
          <ul className={styles.sharedList}>
            {(['news', 'matches', 'members', 'clan', 'community'] as const).map((key) => (
              <li key={key}>
                <Link href={`/${key}`} className={styles.sharedLink} data-hub-shared={key}>
                  {t(`shared.${key}`)}
                </Link>
              </li>
            ))}
            {links.discordUrl ? (
              <li>
                <a href={links.discordUrl} className={styles.sharedLink} data-hub-shared="discord" data-accent="">
                  {common('discord')}
                  <ExternalIcon size={16} />
                  <span className="visually-hidden"> {external}</span>
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
        <section aria-labelledby="hub-latest" className={styles.latest}>
          <h2 id="hub-latest" className={styles.sectionTitle}>
            {t('latestNews')}
          </h2>
          {latest ? (
            <p className={styles.latestItem}>
              <Link href={canonicalNewsPath(latest.game, latest.slug)} className={styles.latestLink} data-hub-latest={latest.slug}>
                {latest.title}
              </Link>
              <span className={styles.latestMeta}>
                <time dateTime={latest.publishedAt.toISOString()}>{formatDate(latest.publishedAt, locale, 'date')}</time>
                {' · '}
                {latest.game ? games(`names.${gameRouteFromDb(latest.game)}`) : games('communityLabel')}
              </span>
            </p>
          ) : (
            <p className={styles.latestEmpty}>{t('noNews')}</p>
          )}
        </section>
      </div>
    </main>
  );
}
