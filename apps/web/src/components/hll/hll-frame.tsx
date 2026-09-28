'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { TooltipDismisser } from '@/components/shell/tooltip-dismisser';
import { UnsavedChangesProvider } from '@/components/shell/unsaved-changes';
import { getRouteMode } from '@/components/shell/route-mode';
import styles from './hll.module.css';

/**
 * Client root of the HLL section: exposes landing vs content mode as a data attribute so
 * the scene treatment changes by CSS without remounting, scopes the HLL theme tokens and
 * hosts the unsaved-changes guard used by guarded links and the language switch.
 */
export function HllFrame({ children }: { children: ReactNode }) {
  const mode = getRouteMode(usePathname()) === 'home' ? 'landing' : 'content';
  return (
    <div className={styles.shell} data-theme="hll" data-hll-mode={mode} data-game-shell="hll">
      <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
      <TooltipDismisser />
    </div>
  );
}
