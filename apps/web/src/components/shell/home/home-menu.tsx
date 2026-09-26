import { getTranslations } from 'next-intl/server';
import { GameButton } from '@/components/ui/game-button';
import { DiscordCta } from './discord-cta';
import { type NextMatch, NextMatchStrip } from './next-match-strip';
import styles from './home.module.css';

/**
 * Main-menu composition (reference 09): open scene, no headline or cards; bottom-left
 * action stack (Discord CTA + two charcoal actions) with a short identity caption; the
 * utility rail below comes from the shell footer.
 */
export async function HomeMenu({ discordUrl, nextMatch }: { discordUrl: string | null; nextMatch: NextMatch | null }) {
  const t = await getTranslations('home');
  const common = await getTranslations('common');
  return (
    <main id="main-content" tabIndex={-1} className={styles.home} aria-labelledby="home-heading">
      <h1 id="home-heading" className="visually-hidden">
        {t('heading')}
      </h1>
      <div className={styles.stage}>
        <section className={styles.actions} aria-label={t('actionsLabel')}>
          <p className={styles.identity}>
            <span>{t('identity.name')}</span>
            <span className={styles.identitySeparator} aria-hidden="true">
              {'//'}
            </span>
            <span>{t('identity.region')}</span>
          </p>
          <DiscordCta
            url={discordUrl}
            label={t('cta.discord')}
            sublabel={t('cta.discordSub')}
            externalLabel={common('external.suffix')}
            unavailableTitle={t('cta.discordUnavailable')}
            unavailableBody={t('cta.discordUnavailableBody')}
          />
          <GameButton href="/clan" align="start" className={styles.secondaryAction} data-home-action="clan">
            {t('cta.clan')}
          </GameButton>
          <GameButton href="/matches" align="start" className={styles.secondaryAction} data-home-action="matches">
            {t('cta.matches')}
          </GameButton>
        </section>
        <NextMatchStrip match={nextMatch} />
      </div>
    </main>
  );
}
