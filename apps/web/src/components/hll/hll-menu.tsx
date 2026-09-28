'use client';

import { usePathname } from '@/i18n/navigation';
import { GuardedLink } from '@/components/shell/guarded-link';
import { stripLocale } from '@/components/shell/route-mode';
import styles from './hll.module.css';

export type HllMenuItem = { section: string; href: string; label: string };

/**
 * HLL section navigation (plain text links, reference 02): hover adds a subdued surface
 * and a short khaki marker; the current destination keeps the marker and
 * `aria-current="page"`; focus has its own external ring. `landing` is the large left
 * menu, `bar` the compact row on content pages, `stack` the mobile disclosure list.
 */
export function HllMenu({ items, label, variant, mainMenu }: { items: HllMenuItem[]; label: string; variant: 'landing' | 'bar' | 'stack'; mainMenu?: { href: string; label: string } }) {
  const path = stripLocale(usePathname());
  const current = items.find((item) => path === item.href || path.startsWith(`${item.href}/`))?.section ?? null;
  return (
    <nav aria-label={label} className={styles.menu} data-variant={variant} data-hll-menu={variant}>
      <ul className={styles.menuList}>
        {mainMenu ? (
          <li className={styles.menuItem} data-main-menu="">
            <GuardedLink href={mainMenu.href} className={styles.menuLink} aria-current={path === mainMenu.href ? 'page' : undefined} data-hll-menu-item="main">
              <span className={styles.menuMarker} aria-hidden="true" />
              <span className={styles.menuLabel}>{mainMenu.label}</span>
            </GuardedLink>
          </li>
        ) : null}
        {items.map((item) => (
          <li key={item.section} className={styles.menuItem}>
            <GuardedLink href={item.href} className={styles.menuLink} aria-current={item.section === current ? 'page' : undefined} data-hll-menu-item={item.section}>
              <span className={styles.menuMarker} aria-hidden="true" />
              <span className={styles.menuLabel}>{item.label}</span>
            </GuardedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
