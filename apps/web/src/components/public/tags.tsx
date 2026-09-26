import type { ReactNode } from 'react';
import styles from './public.module.css';

/** Compact uppercase labels (competition, category, game) after reference 13's row badges. */
export function TagList({ label, items }: { label?: string; items: { key: string; label: ReactNode; tone?: 'game' }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.tagList} aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className={styles.tag} data-tone={item.tone}>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
