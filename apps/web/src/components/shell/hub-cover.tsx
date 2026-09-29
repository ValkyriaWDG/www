'use client';

import { usePathname } from '@/i18n/navigation';
import { getRouteMode } from './route-mode';
import styles from './shell.module.css';

/**
 * Owner-supplied community hub cover (docs/assets/policy.md): Hell Let Loose on the left,
 * Wardogs on the right, a dark centre for the page. Rendered only on the hub route, so
 * the shared pages never fetch it; it replaces the drawn landscape there.
 */
export function HubCover() {
  if (getRouteMode(usePathname()) !== 'hub') return null;
  return (
    <div className={styles.hubCover} data-hub-cover="">
      {/* eslint-disable-next-line @next/next/no-img-element -- prepared responsive derivatives (images are unoptimized) */}
      <img
        src="/images/community/hub-cover-1672.webp"
        srcSet="/images/community/hub-cover-960.webp 960w, /images/community/hub-cover-1672.webp 1672w"
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
      />
    </div>
  );
}
