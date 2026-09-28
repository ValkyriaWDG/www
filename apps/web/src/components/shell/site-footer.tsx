import { getTranslations } from 'next-intl/server';
import { CommunityIcon, ExternalIcon, GlobeIcon, NewsIcon } from '@/components/ui/icons';
import { UtilityButton } from '@/components/ui/utility-button';
import { BackgroundToggle } from './background-toggle';
import { GuardedLink } from './guarded-link';
import styles from './footer.module.css';

type SiteFooterProps = { discordUrl: string | null; hllUrl: string | null; hasBackgroundVideo: boolean; newsHref: string };

/**
 * Utility rail / site footer on every localized page: community links on the left
 * (Discord, News, HLL WEB), background control plus visible HLL WEB and Privacy links on
 * the right. On home it sits under the action stack like reference 09's utility rows.
 */
export async function SiteFooter({ discordUrl, hllUrl, hasBackgroundVideo, newsHref }: SiteFooterProps) {
  const t = await getTranslations('common');
  const external = t('external.suffix');
  return (
    <footer className={styles.footer} data-shell-footer="">
      <div className={styles.group} role="group" aria-label={t('footer.communityLabel')}>
        {discordUrl ? (
          <UtilityButton href={discordUrl} external externalLabel={external} label={t('footer.discord')} icon={<CommunityIcon />} tooltipAlign="start" data-utility="discord" />
        ) : null}
        <UtilityButton href={newsHref} label={t('footer.news')} icon={<NewsIcon />} tooltipAlign={discordUrl ? 'center' : 'start'} data-utility="news" />
        {hllUrl ? <UtilityButton href={hllUrl} external externalLabel={external} label={t('nav.hllWebsite')} icon={<GlobeIcon />} data-utility="hll" /> : null}
      </div>
      <div className={styles.group} data-group="end">
        <BackgroundToggle hasSources={hasBackgroundVideo} />
        {hllUrl ? (
          <a href={hllUrl} className={styles.textLink} data-footer-link="hll">
            <span>{t('nav.hllWebsite')}</span>
            <ExternalIcon size={16} />
            <span className="visually-hidden"> {external}</span>
          </a>
        ) : null}
        <GuardedLink href="/privacy" className={styles.textLink} data-footer-link="privacy">
          {t('footer.privacy')}
        </GuardedLink>
      </div>
    </footer>
  );
}
