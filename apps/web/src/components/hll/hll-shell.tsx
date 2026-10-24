import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { AccountSlot, accountLinks, type ShellAccount } from '@/components/shell/account-slot';
import { GameSwitch } from '@/components/shell/game-switch';
import { GuardedLink } from '@/components/shell/guarded-link';
import { LanguageSwitcher } from '@/components/shell/language-switcher';
import { MobileMenu } from '@/components/shell/mobile-menu';
import { getShellLinks } from '@/components/shell/shell-config';
import { ExternalIcon } from '@/components/ui/icons';
import strip from '@/components/shell/header.module.css';
import { getHllClipSet } from '@/lib/hll-media';
import { gameMenu, gamePath } from '@/modules/games/routes';
import mark from '../../../public/brand/valkyria-mark-132.webp';
import { HllFrame } from './hll-frame';
import { CinematicStage, CinematicStageControls } from './cinematic-stage';
import { HllMenu, type HllMenuItem } from './hll-menu';
import styles from './hll.module.css';

/** Localized HLL menu destinations in registry order (News, Matches, Servers, …, Join us). */
export async function getHllMenuItems(): Promise<HllMenuItem[]> {
  const t = await getTranslations('games.hll.menu');
  return gameMenu('hll').map((item) => ({ section: item.section, href: item.href, label: t(item.section) }));
}

/**
 * HLL section frame (docs/design/hll/visual-spec.md §4): the Wardogs top strip (same
 * classes, height, crest, controls and breakpoints; HLL colours) with the Valkyria crest
 * and the `Hell Let Loose` division label on the left, community link, game switch,
 * language and account on the right; a persistent fullscreen media scene; a
 * compact section bar with `Main menu` on content pages (a disclosure below 768 px); page
 * content; and a quiet utility footer. One website session serves every section.
 */
export async function HllShell({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const [t, common, links, items, clips] = await Promise.all([getTranslations('games.hll'), getTranslations('common'), getShellLinks(), getHllMenuItems(), getHllClipSet()]);
  const external = common('external.suffix');
  const mobileAccount = accountLinks(account, (key) => common(`nav.${key}`));
  const mainMenu = { href: gamePath('hll'), label: t('mainMenu') };
  return (
    <HllFrame>
      <CinematicStage
        clips={clips}
        labels={{
          play: t('stage.play'),
          pause: t('stage.pause'),
          unavailable: t('stage.unavailable'),
          posterOnly: t('stage.posterOnly'),
        }}
      >
        <a className="skip-link" href="#main-content">
          {common('a11y.skipToContent')}
        </a>
        <header className={`${strip.header} ${styles.masthead}`} data-hll-masthead="">
          <GuardedLink href={gamePath('hll')} className={`${strip.brand} ${styles.identity}`} data-hll-identity="">
            <Image src={mark} alt="" className={strip.brandMark} sizes="44px" priority />
            <span className={styles.identityText}>
              <span className={styles.clanName}>{t('clanName')}</span>
              <span className={styles.division}>{t('division')}</span>
              <span className="visually-hidden"> – {t('mainMenu')}</span>
            </span>
          </GuardedLink>
          <span className={strip.divider} aria-hidden="true" />
          <div className={strip.tools}>
            <GuardedLink href="/" className={strip.communityLink} data-hll-community-link="">
              {t('communityLink')}
            </GuardedLink>
            <div className={strip.gameSlot}>
              <GameSwitch variant="bar" />
            </div>
            <LanguageSwitcher />
            <div className={strip.accountSlot}>
              <AccountSlot account={account} />
            </div>
          </div>
          <MobileMenu label={common('nav.menu')}>
            <HllMenu items={items} label={t('menuLabel')} variant="stack" mainMenu={mainMenu} />
            <ul className={styles.mobileLinks}>
              {mobileAccount.map((link) => (
                <li key={link.key}>
                  <GuardedLink href={link.href} className={styles.mobileLink} data-mobile-link={link.key}>
                    {link.label}
                  </GuardedLink>
                </li>
              ))}
              <li>
                <GuardedLink href="/" className={styles.mobileLink} data-mobile-link="community">
                  {t('communityLink')}
                </GuardedLink>
              </li>
            </ul>
          </MobileMenu>
          <div className={strip.mobileGame}>
            <GameSwitch variant="stack" />
          </div>
        </header>
        <div className={styles.sectionBar} data-hll-section-bar="">
          <HllMenu items={items} label={t('menuLabel')} variant="bar" mainMenu={mainMenu} />
        </div>
        <div className={styles.content}>{children}</div>
        <footer className={styles.footer} data-hll-footer="">
          <CinematicStageControls />
          <GuardedLink href="/" className={styles.footerLink}>
            {t('communityLink')}
          </GuardedLink>
          {links.discordUrl ? (
            <a href={links.discordUrl} className={styles.footerLink} data-footer-link="discord">
              Discord
              <ExternalIcon size={14} />
              <span className="visually-hidden"> {external}</span>
            </a>
          ) : null}
          <GuardedLink href="/privacy" className={styles.footerLink} data-footer-link="privacy">
            {t('utilities.privacy')}
          </GuardedLink>
        </footer>
      </CinematicStage>
    </HllFrame>
  );
}
