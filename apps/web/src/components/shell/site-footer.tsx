import { getTranslations } from 'next-intl/server';
import { DiscordIcon, NewsIcon } from '@/components/ui/icons';
import { UtilityButton } from '@/components/ui/utility-button';
import { BackgroundToggle } from './background-toggle';
import { GuardedLink } from './guarded-link';
import styles from './footer.module.css';

type SiteFooterProps = { discordUrl: string | null; hasBackgroundVideo: boolean; newsHref: string };

/**
 * Utility rail / site footer on every localized page: community links on the left
 * (Discord, News), background control and Privacy links on
 * the right. On home it sits under the action stack like reference 09's utility rows.
 */
export async function SiteFooter({ discordUrl, hasBackgroundVideo, newsHref }: SiteFooterProps) {
  const t = await getTranslations('common');
  const external = t('external.suffix');
  return (
    <footer className={styles.footer} data-shell-footer="">
      <div className={styles.group} role="group" aria-label={t('footer.communityLabel')}>
        {discordUrl ? (
          <UtilityButton href={discordUrl} external externalLabel={external} label={t('footer.discord')} icon={<DiscordIcon />} tooltipAlign="start" data-utility="discord" />
        ) : null}
        <UtilityButton href={newsHref} label={t('footer.news')} icon={<NewsIcon />} tooltipAlign={discordUrl ? 'center' : 'start'} data-utility="news" />
      </div>
      <div className={styles.group} data-group="end">
        <BackgroundToggle hasSources={hasBackgroundVideo} />
        <GuardedLink href="/privacy" className={styles.textLink} data-footer-link="privacy">
          {t('footer.privacy')}
        </GuardedLink>
      </div>
    </footer>
  );
}
