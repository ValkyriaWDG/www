import type { ReactNode } from 'react';
import styles from './shell.module.css';

/**
 * Standard `<main>` for subpages inside the shell: skip-link target, bounded width over
 * the darkened scene. `reading` ≈ article width, `wide` for list/detail, `full` up to the
 * ultrawide cap.
 */
export function PageMain({ children, width = 'wide', className, labelledBy }: { children: ReactNode; width?: 'reading' | 'wide' | 'full'; className?: string; labelledBy?: string }) {
  return (
    <main id="main-content" tabIndex={-1} className={[styles.page, className].filter(Boolean).join(' ')} data-width={width} aria-labelledby={labelledBy}>
      {children}
    </main>
  );
}
