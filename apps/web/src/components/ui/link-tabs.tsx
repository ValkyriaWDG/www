import { Link } from '@/i18n/navigation';
import styles from './tabs.module.css';

export type LinkTab = { key: string; href: string; label: string };

/**
 * Tab-styled navigation between real URLs (e.g. content-language views or list scopes).
 * Uses a labelled nav with `aria-current="page"`, not ARIA tab roles, because it navigates.
 */
export function LinkTabs({ label, tabs, current }: { label: string; tabs: LinkTab[]; current: string }) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      <ul className={styles.list}>
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link href={tab.href} className={styles.tab} aria-current={tab.key === current ? 'page' : undefined}>
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
