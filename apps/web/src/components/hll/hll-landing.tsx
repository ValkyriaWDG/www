import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GuardedLink } from '@/components/shell/guarded-link';
import { getShellLinks } from '@/components/shell/shell-config';
import { DiscordIcon, ExternalIcon } from '@/components/ui/icons';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { getHeaderAccountState } from '@/modules/auth/header-state';
import { getLatestNewsTeaser } from '@/modules/content/public';
import type { NewsSummary } from '@/modules/content/types';
import { GAME_REGISTRY } from '@/modules/games/registry';
import { canonicalNewsPath } from '@/modules/games/routes';
import { getNextWebsiteMatch, type PublicNextMatch } from '@/modules/matches/public-next-match';
import { getHllMenuItems } from './hll-shell';
import { HllMenu } from './hll-menu';
import styles from './hll.module.css';

async function loadTeasers(locale: AppLocale): Promise<{ match: PublicNextMatch | null; news: NewsSummary | null }> {
  if (!getServerEnv().DATABASE_URL) return { match: null, news: null };
  const db = getDb();
  const [match, news] = await Promise.all([
    getNextWebsiteMatch('hll').catch(() => null),
    getLatestNewsTeaser(locale, db, GAME_REGISTRY.hll.db).catch(() => null),
  ]);
  return { match, news };
}

/**
 * HLL main menu (reference 02 adapted): open left menu lane with the section links, the
 * Discord call to action and quiet utilities over the shell's fullscreen scene,
 * with a compact strip of the next published
 * fixture and latest published news. Nothing is shown for records that do not exist.
 */
export async function HllLanding({ locale, notice }: { locale: AppLocale; notice?: ReactNode }) {
  const [t, nav, account, items, links, teasers, external] = await Promise.all([
    getTranslations({ locale, namespace: 'games.hll' }),
    getTranslations({ locale, namespace: 'common.nav' }),
    getHeaderAccountState(),
    getHllMenuItems(),
    getShellLinks(),
    loadTeasers(locale),
    getTranslations({ locale, namespace: 'common.external' }),
  ]);
  const { match, news } = teasers;
  return (
    <main id="main-content" tabIndex={-1} className={styles.landing} aria-labelledby="hll-heading">
      <h1 id="hll-heading" className="visually-hidden">
        {t('heading')}
      </h1>
      {notice ? <div className={styles.landingNotice}>{notice}</div> : null}
      <div className={styles.landingGrid}>
        <div className={styles.lane}>
          <HllMenu items={items} label={t('menuLabel')} variant="landing" />
          <div className={styles.cta}>
            {links.discordUrl ? (
              <a href={links.discordUrl} className={styles.discord} data-hll-discord="">
                <DiscordIcon size={24} />
                <span>{t('joinDiscord')}</span>
                <ExternalIcon size={18} />
                <span className="visually-hidden"> {external('suffix')}</span>
              </a>
            ) : (
              <p className={styles.discordUnavailable} data-hll-discord="unavailable">
                {t('discordUnavailable')}
              </p>
            )}
          </div>
          <ul className={styles.utilities} aria-label={t('utilities.label')}>
            {/* The masthead account control is hidden on phones; the landing keeps it reachable. */}
            <li className={styles.utilityCompactOnly}>
              <GuardedLink href={account.state === 'signed_out' ? '/login' : '/account'} className={styles.utilityLink} data-hll-account-utility="">
                {account.state === 'signed_out' ? nav('signIn') : nav('account')}
              </GuardedLink>
            </li>
          </ul>
        </div>
        {match || news ? (
          <section className={styles.strip} aria-label={t('strip.label')} data-hll-strip="">
            {match ? (
              <GuardedLink href={match.href} className={styles.stripItem} data-hll-strip-item="match">
                <span className={styles.stripLabel}>{t('strip.nextMatch')}</span>
                <span className={styles.stripTitle}>{match.title ?? t('strip.versus', { opponent: match.opponent })}</span>
                <span className={styles.stripMeta}>
                  {[match.competition, formatDate(match.startsAt, locale, 'dateTimeZone')].filter(Boolean).join(' · ')}
                </span>
              </GuardedLink>
            ) : null}
            {news ? (
              <GuardedLink href={canonicalNewsPath(news.game, news.slug)} className={styles.stripItem} data-hll-strip-item="news">
                <span className={styles.stripLabel}>{t('strip.latestNews')}</span>
                <span className={styles.stripTitle}>{news.title}</span>
                <span className={styles.stripMeta}>{formatDate(news.publishedAt, locale, 'date')}</span>
              </GuardedLink>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
