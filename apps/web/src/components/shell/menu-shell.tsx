import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { getBackgroundMedia } from '@/lib/background-media';
import emblem from '../../../public/brand/valkyria-emblem-733.webp';
import type { ShellAccount } from './account-slot';
import { BackgroundMedia } from './background-media';
import { SceneFallback } from './scene-fallback';
import { getShellLinks } from './shell-config';
import { ShellFrame } from './shell-frame';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import styles from './shell.module.css';

/**
 * Persistent Wardogs-menu shell for every `/cs` and `/en` page: fixed scene (original
 * fallback → optional poster → optional video) with route-dependent scrim, faded central
 * emblem on home, header strip, page content and utility footer. Pages render their own
 * `<main id="main-content" tabIndex={-1}>` (see `PageMain`).
 */
export async function MenuShell({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const t = await getTranslations('common.a11y');
  const [media, links] = await Promise.all([getBackgroundMedia(), getShellLinks()]);
  return (
    <ShellFrame>
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <div className={styles.scene} aria-hidden="true" data-scene="">
        <SceneFallback />
        <BackgroundMedia posterUrl={media.posterUrl} sources={media.sources} focalPoint={media.focalPoint} />
        <div className={styles.scrim} />
        <div className={styles.vignette} />
        <Image src={emblem} alt="" className={styles.emblem} sizes="(max-width: 767px) 60vw, 22vw" loading="lazy" data-emblem="" />
      </div>
      <SiteHeader account={account} hllUrl={links.hllUrl} />
      <div className={styles.content}>{children}</div>
      <SiteFooter discordUrl={links.discordUrl} hllUrl={links.hllUrl} hasBackgroundVideo={media.sources.length > 0} />
    </ShellFrame>
  );
}
