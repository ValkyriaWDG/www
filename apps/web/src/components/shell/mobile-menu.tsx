'use client';

import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import styles from './header.module.css';

/**
 * Disclosure menu for narrow viewports (<768 px). The panel is in normal flow directly
 * after the trigger, so the first item is the next Tab stop and there is no scroll lock.
 * Escape closes it and returns focus to the trigger; following a link closes it.
 */
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const wide = window.matchMedia('(min-width: 768px)');
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    wide.addEventListener('change', onWide);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      wide.removeEventListener('change', onWide);
    };
  }, [open]);

  const onPanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        data-mobile-menu-trigger=""
      >
        {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
        <span>{label}</span>
      </button>
      <div id={panelId} className={styles.mobilePanel} hidden={!open} onClick={onPanelClick} data-mobile-menu-panel="">
        {children}
      </div>
    </>
  );
}
