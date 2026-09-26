'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { getRouteMode } from './route-mode';
import { TooltipDismisser } from './tooltip-dismisser';
import { UnsavedChangesProvider } from './unsaved-changes';
import styles from './shell.module.css';

/**
 * Client root of the persistent shell: exposes the route mode (home / public / admin) as
 * a data attribute so scene treatment changes by CSS without remounting the video, and
 * hosts the unsaved-changes guard for header navigation and language switching.
 */
export function ShellFrame({ children }: { children: ReactNode }) {
  const routeMode = getRouteMode(usePathname());
  return (
    <div className={styles.shell} data-route-mode={routeMode}>
      <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
      <TooltipDismisser />
    </div>
  );
}
