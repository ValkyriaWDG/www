'use client';

import { usePathname } from '@/i18n/navigation';
import { GuardedLink } from './guarded-link';
import { getCurrentSection, type NavSection } from './route-mode';
import styles from './header.module.css';

export type PrimaryNavItem = { key: NavSection; href: string; label: string };

/**
 * Primary page navigation: adjacent rectangular anchors, current section by path prefix
 * with `aria-current="page"` (no ARIA tab roles for page navigation).
 */
export function PrimaryNav({ items, label, variant }: { items: PrimaryNavItem[]; label: string; variant: 'desktop' | 'mobile' }) {
  const current = getCurrentSection(usePathname(), items);
  return (
    <nav aria-label={label} className={variant === 'desktop' ? styles.nav : styles.mobileNav} data-nav={variant}>
      <ul className={styles.navList}>
        {items.map((item) => (
          <li key={item.key} className={styles.navListItem}>
            <GuardedLink href={item.href} className={styles.navItem} aria-current={item.key === current ? 'page' : undefined} data-nav-item={item.key}>
              <span className={styles.navLabel}>{item.label}</span>
            </GuardedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
