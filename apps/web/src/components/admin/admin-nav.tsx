'use client';

import { GuardedLink } from '@/components/shell/guarded-link';
import { usePathname } from '@/i18n/navigation';
import styles from './admin.module.css';

export type AdminNavItem = { key: string; href: string; label: string };

/**
 * Admin module navigation (only modules the actor may use are passed in). Links are
 * guarded so a dirty editor asks before leaving; the current module is marked with
 * `aria-current` (amber underline, not color alone).
 */
export function AdminNav({ label, items, testId }: { label: string; items: AdminNavItem[]; testId?: string }) {
  const pathname = usePathname();
  const current = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label={label} className={styles.nav} data-testid={testId}>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <GuardedLink href={item.href} aria-current={current(item.href) ? 'page' : undefined} data-admin-nav={item.key}>
              {item.label}
            </GuardedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
