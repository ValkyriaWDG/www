import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { ExternalIcon } from '@/components/ui/icons';
import mark from '../../../public/brand/valkyria-mark-132.webp';
import { AccountSlot, accountLinks, type ShellAccount } from './account-slot';
import { GuardedLink } from './guarded-link';
import { LanguageSwitcher } from './language-switcher';
import { MobileMenu } from './mobile-menu';
import { PrimaryNav, type PrimaryNavItem } from './primary-nav';
import { NAV_SECTIONS } from './route-mode';
import styles from './header.module.css';

type SiteHeaderProps = { account: ShellAccount; hllUrl: string | null };

/** Narrow charcoal strip: brand → primary nav → language + account; compact disclosure below 768 px. */
export async function SiteHeader({ account, hllUrl }: SiteHeaderProps) {
  const t = await getTranslations('common');
  const items: PrimaryNavItem[] = NAV_SECTIONS.map((section) => ({ key: section.key, href: section.href, label: t(`nav.${section.key}`) }));
  const mobileAccountLinks = accountLinks(account, (key) => t(`nav.${key}`));

  return (
    <header className={styles.header} data-shell-header="">
      <GuardedLink href="/" className={styles.brand} data-brand="">
        <Image src={mark} alt={t('brand.homeLabel')} className={styles.brandMark} loading="eager" sizes="44px" />
      </GuardedLink>
      <span className={styles.divider} aria-hidden="true" />
      <PrimaryNav items={items} label={t('a11y.mainNavigation')} variant="desktop" />
      <div className={styles.tools}>
        <LanguageSwitcher />
        <div className={styles.accountSlot}>
          <AccountSlot account={account} />
        </div>
      </div>
      <MobileMenu label={t('nav.menu')}>
        <PrimaryNav items={items} label={t('a11y.mainNavigation')} variant="mobile" />
        <ul className={styles.mobileLinks}>
          {mobileAccountLinks.map((link) => (
            <li key={link.key}>
              <GuardedLink href={link.href} className={styles.mobileLink} data-mobile-link={link.key}>
                {link.label}
              </GuardedLink>
            </li>
          ))}
          {hllUrl ? (
            <li>
              <a href={hllUrl} className={styles.mobileLink} data-mobile-link="hll">
                {t('nav.hllWebsite')}
                <ExternalIcon size={16} />
                <span className="visually-hidden"> {t('external.suffix')}</span>
              </a>
            </li>
          ) : null}
        </ul>
      </MobileMenu>
    </header>
  );
}
