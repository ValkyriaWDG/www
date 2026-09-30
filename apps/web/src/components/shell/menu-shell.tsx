import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { getBackgroundMedia } from '@/lib/background-media';
import emblem from '../../../public/brand/valkyria-emblem-733.webp';
import type { ShellAccount } from './account-slot';
import { BackgroundMedia } from './background-media';
import { HubCover } from './hub-cover';
import type { BackgroundMediaConfig } from './background-policy';
import { DEFAULT_FOCAL_POINT } from './background-policy';
import { SceneFallback } from './scene-fallback';
import { getShellLinks } from './shell-config';
import { ShellFrame } from './shell-frame';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import styles from './shell.module.css';

/**
 * `platform`: the shared Valkyria frame for the community hub, shared pages, account and
 * administration (static original scene, no game footage). `wardogs`: the Wardogs menu
 * presentation under `/wardogs` with its approved background media.
 */
export type ShellPresentation = 'platform' | 'wardogs';

const NO_MEDIA: BackgroundMediaConfig = { posterUrl: null, sources: [], focalPoint: DEFAULT_FOCAL_POINT };

/**
 * Persistent menu shell: fixed scene (original fallback → optional poster → optional
 * video) with route-dependent scrim, faded central emblem on landings, header strip,
 * page content and utility footer. Pages render their own
 * `<main id="main-content" tabIndex={-1}>` (see `PageMain`).
 */
export async function MenuShell({ account, children, presentation }: { account: ShellAccount; children: ReactNode; presentation: ShellPresentation }) {
  const t = await getTranslations('common.a11y');
  const [media, links] = await Promise.all([presentation === 'wardogs' ? getBackgroundMedia() : NO_MEDIA, getShellLinks()]);
  return (
    <ShellFrame presentation={presentation}>
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <div className={styles.scene} aria-hidden="true" data-scene="">
        <SceneFallback />
        <BackgroundMedia posterUrl={media.posterUrl} sources={media.sources} focalPoint={media.focalPoint} />
        {presentation === 'platform' ? <HubCover /> : null}
        <div className={styles.scrim} />
        <div className={styles.vignette} />
        <Image src={emblem} alt="" className={styles.emblem} sizes="(max-width: 767px) 60vw, 22vw" loading="eager" fetchPriority="high" data-emblem="" />
      </div>
      <SiteHeader account={account} presentation={presentation} />
      <div className={styles.content}>{children}</div>
      <SiteFooter
        discordUrl={links.discordUrl}
        hasBackgroundVideo={media.sources.length > 0}
        newsHref={presentation === 'wardogs' ? '/wardogs/news' : '/news'}
      />
    </ShellFrame>
  );
}
