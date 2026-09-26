'use client';

import { useEffect } from 'react';

/** Escape hides visible tooltips until the pointer or focus moves (WCAG 1.4.13 dismissible). */
export function TooltipDismisser() {
  useEffect(() => {
    const root = document.documentElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') root.dataset.tooltips = 'dismissed';
    };
    const reset = () => {
      if (root.dataset.tooltips) delete root.dataset.tooltips;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointermove', reset, { passive: true });
    document.addEventListener('focusin', reset);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointermove', reset);
      document.removeEventListener('focusin', reset);
    };
  }, []);
  return null;
}
