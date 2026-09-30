import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import mark from '../../../public/brand/valkyria-mark-132.webp';
import { AccountSlot, accountLinks, type ShellAccount } from './account-slot';
import { GameSwitch } from './game-switch';
import { GuardedLink } from './guarded-link';
import { LanguageSwitcher } from './language-switcher';
import { MobileMenu } from './mobile-menu';
import { PrimaryNav, type PrimaryNavItem } from './primary-nav';
import { NAV_SECTIONS, WARDOGS_NAV_SECTIONS } from './route-mode';
import type { ShellPresentation } from './menu-shell';
import styles from './header.module.css';

type SiteHeaderProps = { account: ShellAccount; presentation: ShellPresentation };

/**
 * Narrow charcoal strip: brand → primary nav → community link, game switch, language and
 * account, in the same order and corner as the HLL masthead. Below 1024 px the game switch
 * becomes a full-width row under the strip (as in HLL); below 768 px the navigation moves
 * into a disclosure. The shared frame lists community routes; the Wardogs frame lists its
 * unchanged menu under `/wardogs`.
 */
export async function SiteHeader({ account, presentation }: SiteHeaderProps) {
  const t = await getTranslations('common');
  const sections = presentation === 'wardogs' ? WARDOGS_NAV_SECTIONS : NAV_SECTIONS;
  const items: PrimaryNavItem[] = sections.map((section) => ({
    key: section.key,
    href: section.href,
    label: section.key === 'home' && presentation === 'platform' ? t('nav.hub') : t(`nav.${section.key}`),
  }));
  const mobileAccountLinks = accountLinks(account, (key) => t(`nav.${key}`));

  return (
    <header className={styles.header} data-shell-header="">
      <GuardedLink href={presentation === 'wardogs' ? '/wardogs' : '/'} className={styles.brand} data-brand="">
        <Image src={mark} alt={t('brand.homeLabel')} className={styles.brandMark} loading="eager" sizes="44px" />
      </GuardedLink>
      <span className={styles.divider} aria-hidden="true" />
      <PrimaryNav items={items} label={t('a11y.mainNavigation')} variant="desktop" />
      <div className={styles.tools}>
        <GuardedLink href="/" className={styles.communityLink} data-platform-home="">
          {t('platform.hubLink')}
        </GuardedLink>
        <div className={styles.gameSlot}>
          <GameSwitch variant="bar" />
        </div>
        <LanguageSwitcher />
        <div className={styles.accountSlot}>
          <AccountSlot account={account} />
        </div>
      </div>
      <MobileMenu label={t('nav.menu')}>
        <PrimaryNav items={items} label={t('a11y.mainNavigation')} variant="mobile" />
        <ul className={styles.mobileLinks}>
          <li>
            <GuardedLink href="/" className={styles.mobileLink} data-mobile-link="community">
              {t('platform.hubLink')}
            </GuardedLink>
          </li>
          {mobileAccountLinks.map((link) => (
            <li key={link.key}>
              <GuardedLink href={link.href} className={styles.mobileLink} data-mobile-link={link.key}>
                {link.label}
              </GuardedLink>
            </li>
          ))}
        </ul>
      </MobileMenu>
      <div className={styles.mobileGame}>
        <GameSwitch variant="stack" />
      </div>
    </header>
  );
}
