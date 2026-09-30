import { getTranslations } from 'next-intl/server';
import { DiscordCta } from '@/components/shell/home/discord-cta';
import { GameButton } from '@/components/ui/game-button';
import { DiscordIcon, ExternalIcon, ShieldIcon } from '@/components/ui/icons';
import { FeedbackNotice } from '@/components/ui/panels';
import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import type { CommunityLink } from '@/modules/settings/schemas';
import { ExternalLink } from './external-link';
import styles from './pages.module.css';
import publicStyles from './public.module.css';

/**
 * Contextual Hell Let Loose block (clan/community). The HLL division lives on this site, so
 * outside the HLL section the block links to it; the clan's original HLL website stays a
 * separate archive destination, opened same-tab with an external indication.
 */
export async function HllPanel({ locale, game, url, archiveUrl }: { locale: AppLocale; game: GameRoute | null; url: string | null; archiveUrl?: string | null }) {
  const inHll = game === 'hll';
  if (inHll && !url) return null;
  const t = await getTranslations({ locale, namespace: 'pages.hll' });
  const external = (await getTranslations({ locale, namespace: 'common.external' }))('suffix');
  return (
    <section className={publicStyles.linkPanel} aria-labelledby="hll-panel-title" data-hll-panel="">
      <h2 id="hll-panel-title" className={publicStyles.linkPanelTitle}>
        {t('title')}
      </h2>
      <p className={publicStyles.linkPanelBody}>{t('body')}</p>
      <div className={publicStyles.linkPanelActions}>
        {inHll ? null : (
          <GameButton href={sectionBase('hll')} data-hll-section="">
            {t('section')}
          </GameButton>
        )}
        {url ? (
          <ExternalLink href={url} externalLabel={external} variant={inHll ? 'button' : undefined} data-hll-website="">
            {t('website')}
          </ExternalLink>
        ) : null}
        {archiveUrl ? (
          <ExternalLink href={archiveUrl} externalLabel={external} data-hll-archive="">
            {t('archive')}
          </ExternalLink>
        ) : null}
      </div>
    </section>
  );
}

/** Discord join block with the validated invitation, or an explicit unavailable state. */
export async function DiscordPanel({ locale, url }: { locale: AppLocale; url: string | null }) {
  const t = await getTranslations({ locale, namespace: 'pages.discord' });
  const external = (await getTranslations({ locale, namespace: 'common.external' }))('suffix');
  return (
    <section className={publicStyles.linkPanel} aria-labelledby="discord-panel-title" data-discord-panel="">
      <h2 id="discord-panel-title" className={publicStyles.linkPanelTitle}>
        {t('title')}
      </h2>
      <p className={publicStyles.linkPanelBody}>{t('body')}</p>
      <DiscordCta
        url={url}
        label={t('cta')}
        sublabel={t('ctaSub')}
        externalLabel={external}
        unavailableTitle={t('unavailableTitle')}
        unavailableBody={t('unavailableBody')}
      />
    </section>
  );
}

/**
 * Reference 11: two large square choices — DISCORD (the real invitation) and HOW TO JOIN
 * (jumps to the published community guide on this page).
 */
export async function CommunityChoices({ locale, discordUrl, guideAnchor }: { locale: AppLocale; discordUrl: string | null; guideAnchor: string }) {
  const t = await getTranslations({ locale, namespace: 'pages.community' });
  const external = (await getTranslations({ locale, namespace: 'common.external' }))('suffix');
  return (
    <section aria-label={t('choicesLabel')}>
      <ul className={styles.choices}>
        <li>
          {discordUrl ? (
            <a href={discordUrl} className={styles.choice} data-choice="discord">
              <DiscordIcon className={styles.choiceIcon} size={88} />
              <span className={styles.choiceTitle}>{t('discordChoice.title')}</span>
              <span className={styles.choiceBody}>{t('discordChoice.body')}</span>
              <span className={styles.choiceMarker} aria-hidden="true">
                {new URL(discordUrl).hostname}
                <ExternalIcon size={14} />
              </span>
              <span className="visually-hidden"> {external}</span>
            </a>
          ) : (
            <div className={`${styles.choice} ${styles.choiceUnavailable}`} data-choice="discord-unavailable">
              <DiscordIcon className={styles.choiceIcon} size={88} />
              <span className={styles.choiceTitle}>{t('discordChoice.title')}</span>
              <span className={styles.choiceBody}>{t('discordChoice.unavailableBody')}</span>
            </div>
          )}
        </li>
        <li>
          <a href={`#${guideAnchor}`} className={styles.choice} data-choice="join">
            <ShieldIcon className={styles.choiceIcon} size={96} strokeWidth={1.25} />
            <span className={styles.choiceTitle}>{t('joinChoice.title')}</span>
            <span className={styles.choiceBody}>{t('joinChoice.body')}</span>
          </a>
        </li>
      </ul>
    </section>
  );
}

/** Explains that joining Discord and signing in to the website are different things. */
export async function SignInExplainer({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'pages.community.signIn' });
  return (
    <div data-sign-in-explainer="">
      <FeedbackNotice
        kind="info"
        title={t('title')}
        live={false}
        action={
          <GameButton href="/login" intent="secondary" size="sm">
            {t('action')}
          </GameButton>
        }
      >
        <p>{t('body')}</p>
      </FeedbackNotice>
    </div>
  );
}

/** Administrator-approved community links from site settings (omitted when none). */
export async function CommunityLinks({ locale, links }: { locale: AppLocale; links: CommunityLink[] }) {
  if (links.length === 0) return null;
  const t = await getTranslations({ locale, namespace: 'pages.community' });
  const external = (await getTranslations({ locale, namespace: 'common.external' }))('suffix');
  return (
    <section className={publicStyles.linkPanel} aria-labelledby="community-links-title" data-community-links="">
      <h2 id="community-links-title" className={publicStyles.linkPanelTitle}>
        {t('linksTitle')}
      </h2>
      <ul className={styles.communityLinks}>
        {links.map((link) => (
          <li key={link.url}>
            <span className={publicStyles.tag}>{t(`linkKinds.${link.kind}`)}</span>
            <ExternalLink href={link.url} externalLabel={external}>
              {link.label}
            </ExternalLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
